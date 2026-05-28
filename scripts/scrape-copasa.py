#!/usr/bin/env python3
"""Coleta nível dos reservatórios COPASA (Minas Gerais).

Scraping HTML do portal COPASA. Cobre os sistemas de abastecimento
da RMBH (Região Metropolitana de Belo Horizonte) e outras regiões.
Saída: data/cidades/mg/{slug}.json (campo reservatorio)
Rodar 1x/dia via GitHub Actions.
"""

import json
import re
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades" / "mg"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

COPASA_URL = "https://www.copasa.com.br/wps/portal/internet/abastecimento-de-agua/nivel-dos-reservatorios"

# Mapeamento slug → sistema COPASA principal
MAPA_SISTEMA: dict[str, str] = {
    # Sistema Paraopeba (82.9%) — principal RMBH oeste
    "belo-horizonte":           "Sistema Paraopeba",
    "contagem":                 "Sistema Paraopeba",
    "betim":                    "Sistema Paraopeba",
    "ibirité":                  "Sistema Paraopeba",
    "ibirite":                  "Sistema Paraopeba",
    "sao-joaquim-de-bicas":     "Sistema Paraopeba",
    "mario-campos":             "Sistema Paraopeba",
    "juatuba":                  "Sistema Paraopeba",
    "esmeraldas":               "Sistema Paraopeba",
    "ribeirao-das-neves":       "Sistema Paraopeba",

    # Rio Manso (94.9%) — oeste RMBH
    "brumadinho":               "Rio Manso",
    "itatiaiucu":               "Rio Manso",
    "mateus-leme":              "Rio Manso",
    "piedade-dos-gerais":       "Rio Manso",

    # Serra Azul (abastecimento complementar)
    "igarape":                  "Serra Azul",
    "sao-jose-da-varginha":     "Serra Azul",

    # Vargem das Flores — noroeste RMBH
    "vespasiano":               "Vargem das Flores",
    "pedro-leopoldo":           "Vargem das Flores",
    "lagoa-santa":              "Vargem das Flores",
    "confins":                  "Vargem das Flores",
    "sao-jose-da-lapa":         "Vargem das Flores",

    # Rio das Velhas (leste/norte RMBH)
    "sabara":                   "Rio das Velhas",
    "santa-luzia":              "Rio das Velhas",
    "jaboticatubas":            "Rio das Velhas",
    "taquaracu-de-minas":       "Rio das Velhas",
    "caeté":                    "Rio das Velhas",
    "caete":                    "Rio das Velhas",

    # Jequitibá (sul RMBH)
    "nova-lima":                "Jequitibá",
    "itabirito":                "Jequitibá",
    "raposos":                  "Jequitibá",

    # São Paulo (sul RMBH) — bacia do rio das Velhas
    "rio-acima":                "Rio das Velhas",
}


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", "replace")


def extrair_sistemas(html: str) -> dict[str, float]:
    """Extrai pares {nome_sistema: nivel_pct} do HTML da COPASA.

    A tabela tem estrutura:
    | Sistema | data-2 | data-1 | data-hoje |
    Captura apenas a última coluna (mais recente).
    Para somente antes da seção pluviométrica.
    """
    sistemas: dict[str, float] = {}

    # Limita ao trecho entre o H2 de nível e o próximo H2/seção
    idx_start = html.find("Nível dos reservatórios do Sistema")
    if idx_start < 0:
        idx_start = html.find("nível dos reservatórios")
    idx_end = html.find("Índices pluviométricos", idx_start + 100)
    if idx_end < 0:
        idx_end = idx_start + 10000
    secao = html[idx_start:idx_end]

    def limpar(s: str) -> str:
        s = re.sub(r"<[^>]+>", " ", s)
        s = re.sub(r"&nbsp;|\s+", " ", s)
        return s.strip()

    # Parseia cada <tr> da seção
    linhas_tr = re.findall(r"<tr[^>]*>(.*?)</tr>", secao, re.DOTALL)
    for linha in linhas_tr:
        celulas = re.findall(r"<td[^>]*>(.*?)</td>", linha, re.DOTALL)
        if len(celulas) < 2:
            continue
        nome = limpar(celulas[0])
        # Ignora linhas sem nome ou com datas como nome
        if not nome or re.match(r"\d+/\w+", nome) or not re.search(r"[A-Za-z]{3}", nome):
            continue
        # Extrai percentuais de todas as células menos a primeira
        percentuais = []
        for c in celulas[1:]:
            m = re.search(r"(\d+[,\.]\d+)\s*%", limpar(c))
            if m:
                percentuais.append(float(m.group(1).replace(",", ".")))
        if percentuais:
            # Valor mais recente = última célula com %
            sistemas[nome] = max(0.0, percentuais[-1])

    return sistemas


def main():
    municipios_mg: list[dict] = [
        m for m in json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
        if m["estado"] == "mg"
    ]
    por_slug = {m["slug"]: m for m in municipios_mg}

    print("Baixando dados COPASA...")
    html = fetch_html(COPASA_URL)
    sistemas = extrair_sistemas(html)

    if not sistemas:
        print("ERRO: não foi possível extrair dados do portal COPASA", flush=True)
        return

    hoje = date.today().strftime("%Y-%m-%d")
    agora = datetime.now(timezone.utc).astimezone().isoformat()

    print(f"Sistemas extraídos ({len(sistemas)}):")
    for nome, nivel in sorted(sistemas.items()):
        print(f"  {nome}: {nivel:.1f}%")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    atualizados = sem_sistema = 0

    for slug, mun in por_slug.items():
        sistema_nome = MAPA_SISTEMA.get(slug)
        if not sistema_nome:
            sem_sistema += 1
            continue

        nivel = sistemas.get(sistema_nome)
        if nivel is None:
            # Tenta nome sem acentos
            for k, v in sistemas.items():
                if slugify(k) == slugify(sistema_nome):
                    nivel = v
                    sistema_nome = k
                    break

        if nivel is None:
            sem_sistema += 1
            continue

        arquivo = DATA_DIR / f"{slug}.json"
        existente: dict = {}
        if arquivo.exists():
            try:
                existente = json.loads(arquivo.read_text(encoding="utf-8"))
            except Exception:
                pass

        # Não sobrescreve fonte primária mais específica
        fonte_atual = existente.get("reservatorio", {}).get("fonte", "")
        if "SABESP" in fonte_atual:
            continue

        existente["reservatorio"] = {
            "nome": sistema_nome,
            "nivel_pct": round(max(0.0, nivel), 1),
            "variacao_semana_pct": None,
            "data_medicao": hoje,
            "aproximado": False,
            "fonte": "COPASA",
            "atualizado_em": agora,
        }

        if "cidade" not in existente:
            existente.update({
                "cidade": mun["nome"],
                "estado": "MG",
                "slug": slug,
                "latitude": mun.get("lat"),
                "longitude": mun.get("lon"),
                "atualizado_em": agora,
            })

        arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8")
        atualizados += 1

    print(f"\nConcluído: {atualizados} municípios MG atualizados, {sem_sistema} sem mapeamento COPASA")


if __name__ == "__main__":
    main()
