#!/usr/bin/env python3
"""Coleta nível dos sistemas de abastecimento SABESP.

Cobre os 9 sistemas do Portal de Mananciais SABESP e os associa
aos municípios que cada sistema abastece (Grande SP + interior SP).

API: https://mananciais.sabesp.com.br/api/v4/
Saída: data/cidades/sp/{slug}.json (campo reservatorio)
Rodar 1x/dia via GitHub Actions (dados atualizam diariamente).
"""

import json
import sys
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades" / "sp"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

SABESP_BASE = "https://mananciais.sabesp.com.br"
HDRS = {
    "User-Agent": "climabr.app/1.0",
    "Accept": "application/json",
    "Referer": "https://mananciais.sabesp.com.br/",
}

# IDs dos sistemas SABESP
SISTEMAS = {
    64: "Cantareira",
    65: "Alto Tietê",
    66: "Guarapiranga",
    67: "Cotia",
    68: "Rio Grande",
    69: "Rio Claro",
    72: "São Lourenço",
    74: "Cantareira Velho",
    75: "Sistema Integrado Metropolitano",
}

# Mapeamento slug-município → sistema principal
# Baseado na documentação oficial SABESP de áreas de concessão
# Fonte: https://mananciais.sabesp.com.br e relatórios anuais SABESP
MAPA_SISTEMA: dict[str, int] = {
    # Sistema Cantareira (64) — norte/centro da RMSP, Cantareira e Bragantina
    "braganca-paulista":    64,
    "caieiras":             64,
    "cajamar":              64,
    "francisco-morato":     64,
    "franco-da-rocha":      64,
    "guarulhos":            64,
    "joanopolis":           64,
    "mairipora":            64,
    "nazare-paulista":      64,
    "pedra-bela":           64,
    "piracaia":             64,
    "pirapora-do-bom-jesus":64,
    "santana-de-parnaiba":  64,
    "socorro":              64,
    "vargem":               64,

    # Sistema Alto Tietê (65) — leste da RMSP
    "aruja":                65,
    "biritiba-mirim":       65,
    "ferraz-de-vasconcelos":65,
    "itaquaquecetuba":      65,
    "poa":                  65,
    "salesopolis":          65,
    "suzano":               65,

    # Sistema Guarapiranga (66) — sul da RMSP
    "embu-das-artes":       66,
    "embu-guacu":           66,
    "itapecerica-da-serra": 66,
    "taboao-da-serra":      66,

    # Sistema Cotia (67) — oeste da RMSP
    "barueri":              67,
    "carapicuiba":          67,
    "cotia":                67,
    "itapevi":              67,
    "jandira":              67,
    "osasco":               67,
    "vargem-grande-paulista":67,

    # Sistema Rio Grande (68) — ABC Paulista
    "diadema":              68,
    "maua":                 68,
    "ribeirao-pires":       68,
    "rio-grande-da-serra":  68,
    "santo-andre":          68,
    "sao-bernardo-do-campo":68,
    "sao-caetano-do-sul":   68,

    # Sistema Rio Claro (69) — interior sudoeste
    "cabreuva":             69,
    "campo-limpo-paulista": 69,
    "itu":                  69,
    "mairinque":            69,
    "salto":                69,
    "sao-roque":            69,
    "sorocaba":             69,

    # Sistema São Lourenço (72) — reforço ABC/SP
    # Serve São Paulo (zona sul/leste), ABC e Diadema como reforço
    # A cidade de São Lourenço da Serra é origem do sistema, não consumidora

    # Sistema Integrado Metropolitano (75) — São Paulo e toda RMSP
    # Representa o conjunto dos sistemas acima
    "sao-paulo":            75,
    "pinhalzinho":          75,
}

# Municípios do interior SP atendidos pela SABESP mas sem manancial online
# (usam sistemas locais não monitorados pelo portal de mananciais)
# regionalSabespId: 2, 3, 4, 5, 7, 8, 9, 10, 11, 12
INTERIOR_SABESP = {
    # Regional 3 — Baixada Santista
    "santos", "guaruja", "sao-vicente", "praia-grande", "cubatao",
    "bertioga", "itanhaem", "mongagua", "peruibe",
    # Regional 7 — Campinas/Jundiaí
    "campinas", "jundiai", "americana", "santa-barbara-d-oeste",
    "sumare", "hortolândia", "valinhos", "vinhedo", "itatiba",
    "itupeva", "jarinu",
    # Regional 8 — Litoral Norte
    "sao-sebastiao", "caraguatatuba", "ubatuba", "ilhabela",
    # Regionais 2, 4, 5, 9, 10, 11, 12 — interior
}


def sabesp_get(path: str) -> dict:
    req = urllib.request.Request(f"{SABESP_BASE}{path}", headers=HDRS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def slugify(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    import re
    return re.sub(r"[^a-z0-9]+", "-", texto).strip("-")


def main():
    municipios_sp: list[dict] = [
        m for m in json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
        if m["estado"] == "sp"
    ]
    por_slug = {m["slug"]: m for m in municipios_sp}

    # 1. Busca data mais recente com dados
    hoje = date.today().isoformat()
    ultima = sabesp_get("/api/v4/dados/ultima-data")["data"]
    print(f"Data mais recente: {ultima} (hoje: {hoje})")

    # 2. Busca resumo de todos os sistemas
    resumo_lista = sabesp_get(f"/api/v4/sistemas/dados/resumo-diario/{ultima}")["data"]
    resumo: dict[int, dict] = {d["idSistema"]: d for d in resumo_lista}

    print("\nNíveis atuais:")
    for sid, nome in SISTEMAS.items():
        d = resumo.get(sid, {})
        pct = d.get("volumeUtilArmazenadoPorcentagem")
        var = d.get("variacaoVolumeUtil")
        if pct is not None:
            print(f"  {nome:<35} {pct:5.1f}% ({var:+.3f}%/dia)")

    # 3. Atualiza JSONs dos municípios mapeados
    agora = datetime.now(timezone.utc).astimezone().isoformat()
    atualizados = sem_sistema = ignorados = 0

    for slug, mun in por_slug.items():
        sistema_id = MAPA_SISTEMA.get(slug)

        if sistema_id is None:
            if slug in INTERIOR_SABESP:
                # Município SABESP interior — indica sistema local sem dados online
                dados_reserv = {
                    "nome": "Sistema Local SABESP",
                    "nivel_pct": None,
                    "variacao_semana_pct": None,
                    "sistema_id": None,
                    "nota": "Abastecido pela SABESP via sistema local não monitorado online.",
                    "fonte": "SABESP",
                    "atualizado_em": agora,
                }
                sem_sistema += 1
            else:
                ignorados += 1
                continue
        else:
            d = resumo.get(sistema_id, {})
            pct = d.get("volumeUtilArmazenadoPorcentagem")
            var = d.get("variacaoVolumeUtil", 0.0)
            if pct is None:
                ignorados += 1
                continue

            dados_reserv = {
                "nome": SISTEMAS[sistema_id],
                "nivel_pct": round(max(0.0, pct), 1),
                "variacao_semana_pct": round(var * 7, 1),  # diário → semanal estimado
                "variacao_diaria_pct": round(var, 3),
                "data_medicao": ultima,
                "sistema_id": sistema_id,
                "fonte": "SABESP",
                "atualizado_em": agora,
            }

        # Lê JSON existente e mescla
        arquivo = DATA_DIR / f"{slug}.json"
        existente: dict = {}
        if arquivo.exists():
            try:
                existente = json.loads(arquivo.read_text(encoding="utf-8"))
            except Exception:
                pass

        existente["reservatorio"] = dados_reserv
        if "cidade" not in existente:
            existente.update({
                "cidade": mun["nome"],
                "estado": "SP",
                "slug": slug,
                "latitude": mun.get("lat"),
                "longitude": mun.get("lon"),
                "atualizado_em": agora,
            })

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        arquivo.write_text(
            json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        atualizados += 1

    print(f"\nConcluído: {atualizados} municípios atualizados, "
          f"{sem_sistema} com sistema local, {ignorados} sem dados SABESP")


if __name__ == "__main__":
    main()
