#!/usr/bin/env python3
"""Coleta a chuva por bairro das estações do Alerta Rio (Prefeitura do Rio).

São 33 pluviômetros dentro do município do Rio de Janeiro, de Sepetiba a
Copacabana, com acumulado de 15 minutos até o mês. É a segunda fonte municipal
do site, depois dos alagamentos do CGE em São Paulo; alertas de defesa civil
estadual e nacional continuam sem API aberta.

O que a API NÃO traz é o estágio operacional da cidade (Normalidade,
Mobilização, Atenção, Crise), que é carregado por JavaScript no cor.rio.

Fonte: https://websempre.rio.rj.gov.br/json/chuvas
Saída: data/cidades/rj/rio-de-janeiro.json (campo chuva_estacoes)
Roda 2x/dia, junto do CGE-SP, pouco antes de cada publicação do site.
Ver .github/workflows/dados-municipais.yml
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ARQUIVO = Path(__file__).parent.parent / "data" / "cidades" / "rj" / "rio-de-janeiro.json"

URL = "https://websempre.rio.rj.gov.br/json/chuvas"
SITE = "https://alertario.rio.rj.gov.br/"
TZ_RIO = ZoneInfo("America/Sao_Paulo")

# Um WAF na frente da API responde "Request Rejected" a User-Agent que não
# pareça navegador, do mesmo jeito que o INMET e o CGE.
HDRS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": SITE,
}

# Leitura mais velha que isso não representa o momento: o Alerta Rio publica de
# 15 em 15 minutos e uma estação fora do ar fica com o carimbo parado.
MAX_ATRASO_MIN = 90


def baixar() -> dict:
    req = urllib.request.Request(URL, headers=HDRS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def num(v) -> float:
    """Os acumulados vêm com sujeira de ponto flutuante (31.9999999999999)."""
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return 0.0


def main() -> int:
    agora = datetime.now(TZ_RIO)

    try:
        bruto = baixar()
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        print(f"Falha ao acessar o Alerta Rio: {e}", file=sys.stderr)
        return 1

    estacoes = []
    for o in bruto.get("objects", []):
        if o.get("kind") != "pluviometric":
            continue
        d = o.get("data") or {}
        loc = o.get("location") or [None, None]
        lido = o.get("read_at")
        atraso_min = None
        if lido:
            try:
                atraso_min = (agora - datetime.fromisoformat(lido)).total_seconds() / 60
            except ValueError:
                pass
        estacoes.append({
            "nome": o.get("name", "").strip(),
            "lat": loc[0],
            "lon": loc[1],
            "m15": num(d.get("m15")),
            "h01": num(d.get("h01")),
            "h24": num(d.get("h24")),
            "h96": num(d.get("h96")),
            "mes": num(d.get("mes")),
            "lido_em": lido,
            # A própria API manda is_new, mas ela marcou como nova uma leitura de
            # 15 h antes; o carimbo de hora é o critério confiável.
            "recente": atraso_min is not None and atraso_min <= MAX_ATRASO_MIN,
        })

    if not estacoes:
        print("Nenhuma estação pluviométrica na resposta.", file=sys.stderr)
        return 1

    estacoes.sort(key=lambda e: (-e["h24"], -e["h01"], e["nome"]))
    validas = [e for e in estacoes if e["recente"]] or estacoes
    pico_h01 = max(validas, key=lambda e: e["h01"])
    pico_h24 = max(validas, key=lambda e: e["h24"])

    dados = {
        "estacoes": estacoes,
        "total": len(estacoes),
        "fora_do_ar": sum(1 for e in estacoes if not e["recente"]),
        "chovendo": sum(1 for e in validas if e["h01"] > 0),
        "com_chuva_24h": sum(1 for e in validas if e["h24"] > 0),
        "max_h01": pico_h01["h01"],
        "max_h01_estacao": pico_h01["nome"],
        "max_h24": pico_h24["h24"],
        "max_h24_estacao": pico_h24["nome"],
        "fonte": "Alerta Rio / Prefeitura do Rio de Janeiro",
        "url": SITE,
        "atualizado_em": agora.isoformat(),
    }

    print(
        f"{len(estacoes)} estações, {dados['fora_do_ar']} sem leitura recente; "
        f"{dados['chovendo']} com chuva na última hora, "
        f"{dados['com_chuva_24h']} nas últimas 24 h"
    )
    print(f"  pico 1 h:  {dados['max_h01']} mm em {dados['max_h01_estacao']}")
    print(f"  pico 24 h: {dados['max_h24']} mm em {dados['max_h24_estacao']}")

    if not ARQUIVO.exists():
        print(f"Arquivo {ARQUIVO} não existe. Rode scrape-openmeteo.py antes.", file=sys.stderr)
        return 1

    existente = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    existente["chuva_estacoes"] = dados
    existente["atualizado_em"] = agora.isoformat()
    ARQUIVO.write_text(
        json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
