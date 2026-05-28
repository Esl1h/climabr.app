#!/usr/bin/env python3
"""Gera data/cptec_ids.json mapeando slug → ID CPTEC para uso no scraper.

A API CPTEC usa seus próprios IDs (diferentes do IBGE).
Faz busca por nome para todos os municípios e salva o mapeamento.
Execução única.
"""

import json
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"
SAIDA = Path(__file__).parent.parent / "data" / "cptec_ids.json"

CPTEC_BUSCA = "https://servicos.cptec.inpe.br/XML/listaCidades?city={nome}"


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.replace(" ", "+")


def buscar_cptec_id(nome: str, uf: str) -> int | None:
    url = CPTEC_BUSCA.format(nome=normalizar(nome))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            xml = r.read().decode("iso-8859-1")
        root = ET.fromstring(xml)
        for cidade in root.findall("cidade"):
            cidade_uf = cidade.findtext("uf", "").strip().lower()
            if cidade_uf == uf.lower():
                cid = cidade.findtext("id", "").strip()
                if cid:
                    return int(cid)
        # Se não achou pelo UF, pega o primeiro resultado
        primeiro = root.find("cidade/id")
        return int(primeiro.text) if primeiro is not None and primeiro.text else None
    except Exception:
        return None


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    # Carrega mapeamento existente para não reprocessar
    mapa: dict[str, int] = {}
    if SAIDA.exists():
        mapa = json.loads(SAIDA.read_text(encoding="utf-8"))

    pendentes = [m for m in municipios if f"{m['estado']}_{m['slug']}" not in mapa]
    print(f"{len(pendentes)} municípios sem ID CPTEC (de {len(municipios)})")

    ok = erros = 0
    for i, m in enumerate(pendentes, 1):
        chave = f"{m['estado']}_{m['slug']}"
        cid = buscar_cptec_id(m["nome"], m["estado"])
        if cid:
            mapa[chave] = cid
            ok += 1
        else:
            erros += 1

        if i % 100 == 0:
            print(f"  {i}/{len(pendentes)} — ok={ok} erros={erros}")
            SAIDA.write_text(json.dumps(mapa, ensure_ascii=False), encoding="utf-8")

        time.sleep(0.1)

    SAIDA.write_text(json.dumps(mapa, ensure_ascii=False), encoding="utf-8")
    print(f"Concluído: {ok} ok, {erros} erros → {SAIDA}")


if __name__ == "__main__":
    main()
