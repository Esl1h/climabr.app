#!/usr/bin/env python3
"""Coleta o acionamento da bandeira tarifária vigente (ANEEL, dados abertos).

API: https://dadosabertos.aneel.gov.br (CKAN datastore_search)
Recurso: Bandeira Tarifária - Acionamento (1 registro por mês, nacional)
Saída: data/bandeira.json
Rodar 1x/dia via GitHub Actions (muda no máximo 1x/mês).
"""

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SAIDA = Path(__file__).parent.parent / "data" / "bandeira.json"

RESOURCE_ID = "0591b8f6-fe54-437b-b72b-1aa2efd46e42"
API_URL = ("https://dadosabertos.aneel.gov.br/api/3/action/datastore_search"
           f"?resource_id={RESOURCE_ID}&limit=1&sort=_id%20desc")


def main():
    req = urllib.request.Request(API_URL, headers={"User-Agent": "climabr.app/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resposta = json.loads(r.read())
        registro = resposta["result"]["records"][0]
    except Exception as e:
        print(f"Falha ao consultar a ANEEL: {e}", file=sys.stderr)
        sys.exit(1)

    # VlrAdicionalBandeira usa vírgula decimal e vale por 100 kWh
    adicional = float(registro["VlrAdicionalBandeira"].replace(".", "").replace(",", "."))

    SAIDA.write_text(json.dumps({
        "bandeira": registro["NomBandeiraAcionada"],
        "competencia": registro["DatCompetencia"][:7],
        "adicional_por_100kwh": adicional,
        "fonte": "ANEEL",
        "atualizado_em": datetime.now(timezone.utc).astimezone().isoformat(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Bandeira {registro['NomBandeiraAcionada']} "
          f"({registro['DatCompetencia'][:7]}): R$ {adicional:.2f}/100 kWh")


if __name__ == "__main__":
    main()
