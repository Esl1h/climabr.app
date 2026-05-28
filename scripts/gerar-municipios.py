#!/usr/bin/env python3
"""Gera data/municipios.json a partir da API pública do IBGE."""

import gzip
import json
import re
import unicodedata
import urllib.request
from pathlib import Path


def slugify(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto)
    texto = texto.encode("ascii", "ignore").decode("ascii")
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9]+", "-", texto)
    return texto.strip("-")


def fetch(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        if r.info().get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return json.loads(data.decode("utf-8"))


def main():
    print("Buscando estados...")
    estados = fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")

    municipios = []

    for estado in estados:
        uf = estado["sigla"].lower()
        print(f"  {uf.upper()}...", end=" ", flush=True)

        muns = fetch(
            f"https://servicodados.ibge.gov.br/api/v1/localidades/estados/{estado['id']}/municipios"
        )

        for m in muns:
            municipios.append({
                "id": m["id"],
                "nome": m["nome"],
                "slug": slugify(m["nome"]),
                "estado": uf,
                "estado_nome": estado["nome"],
                "lat": None,
                "lon": None,
            })

        print(f"{len(muns)} municípios")

    print(f"\nTotal: {len(municipios)} municípios")

    out = Path(__file__).parent.parent / "data" / "municipios.json"
    out.write_text(json.dumps(municipios, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Salvo em {out}")


if __name__ == "__main__":
    main()
