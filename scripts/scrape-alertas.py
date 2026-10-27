#!/usr/bin/env python3
"""Coleta avisos meteorológicos ativos do INMET (Alert-AS).

API: https://apiprevmet3.inmet.gov.br/avisos/ativos
Cobertura: nacional, com municípios afetados por geocode IBGE
Saída: data/alertas/{uf}.json (lista de avisos que atingem municípios da UF)
Rodar 1x/dia via GitHub Actions.

O servidor do INMET recusa User-Agent de cliente HTTP genérico; a requisição
usa UA de navegador.
"""

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "alertas"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

AVISOS_URL = "https://apiprevmet3.inmet.gov.br/avisos/ativos"
USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 climabr.app/1.0")

# id_severidade não é documentado; o rótulo textual é estável no Alert-AS
NIVEL = {"Perigo Potencial": 1, "Perigo": 2, "Grande Perigo": 3}


def fetch_avisos() -> list[dict]:
    """Baixa avisos ativos (hoje + futuro), deduplicados por id."""
    req = urllib.request.Request(AVISOS_URL, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        dados = json.loads(r.read())

    vistos: set[int] = set()
    avisos = []
    for chave in ("hoje", "futuro"):
        for a in dados.get(chave) or []:
            if a.get("encerrado") or a.get("id") in vistos:
                continue
            vistos.add(a["id"])
            avisos.append(a)
    return avisos


def iso_brt(valor: str) -> str | None:
    """Converte 'YYYY-MM-DD HH:MM' (horário de Brasília) para ISO 8601."""
    try:
        return datetime.strptime(valor, "%Y-%m-%d %H:%M").isoformat() + "-03:00"
    except (TypeError, ValueError):
        return None


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
    uf_por_geocode = {m["id"]: m["estado"] for m in municipios}
    ufs = sorted({m["estado"] for m in municipios})

    try:
        avisos = fetch_avisos()
    except Exception as e:
        print(f"Falha ao consultar o INMET: {e}", file=sys.stderr)
        sys.exit(1)

    agora = datetime.now(timezone.utc).astimezone().isoformat()
    por_uf: dict[str, list[dict]] = {uf: [] for uf in ufs}

    for a in avisos:
        geocodes = []
        for g in (a.get("geocodes") or "").split(","):
            g = g.strip()
            if g.isdigit():
                geocodes.append(int(g))

        afetados: dict[str, list[int]] = {}
        for g in geocodes:
            uf = uf_por_geocode.get(g)
            if uf:
                afetados.setdefault(uf, []).append(g)

        severidade = a.get("severidade") or ""
        for uf, gs in afetados.items():
            por_uf[uf].append({
                "id": a.get("id_aviso") or a.get("id"),
                "evento": a.get("descricao"),
                "severidade": severidade,
                "nivel": NIVEL.get(severidade, 1),
                "cor": a.get("aviso_cor"),
                "inicio": iso_brt(a.get("inicio")),
                "fim": iso_brt(a.get("fim")),
                "riscos": a.get("riscos") or [],
                "instrucoes": a.get("instrucoes") or [],
                "geocodes": sorted(gs),
                "fonte": "INMET / Alert-AS",
                "atualizado_em": agora,
            })

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    com_aviso = 0
    for uf in ufs:
        arquivo = DATA_DIR / f"{uf}.json"
        lista = sorted(por_uf[uf], key=lambda x: (-x["nivel"], x["fim"] or ""))
        if lista:
            arquivo.write_text(json.dumps(lista, ensure_ascii=False, indent=2),
                               encoding="utf-8")
            com_aviso += 1
        elif arquivo.exists():
            # UF sem aviso ativo: remove para não servir alerta vencido
            arquivo.unlink()

    print(f"Concluído: {len(avisos)} avisos ativos, {com_aviso} UFs com aviso")


if __name__ == "__main__":
    main()
