#!/usr/bin/env python3
"""Enriquece municipios.json com lat/lon via API de malhas do IBGE.

Usa o endpoint de metadados de malha municipal que retorna o centróide.
Execução única (não precisa rodar em cron).
"""

import gzip
import json
import sys
import time
import urllib.request
from pathlib import Path

MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"
URL = "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{id}/metadados"


def fetch_centroide(cod_ibge: int, tentativas: int = 3) -> tuple[float, float] | None:
    url = URL.format(id=cod_ibge)
    for i in range(tentativas):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "climabr.app/1.0", "Accept-Encoding": "gzip"},
            )
            with urllib.request.urlopen(req, timeout=15) as r:
                data = r.read()
                if r.info().get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                resultado = json.loads(data.decode("utf-8"))
                c = resultado[0]["centroide"]
                return float(c["latitude"]), float(c["longitude"])
        except Exception as e:
            if i == tentativas - 1:
                return None
            time.sleep(2 ** i)
    return None


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    # Apenas os que ainda não têm coordenadas
    pendentes = [m for m in municipios if m.get("lat") is None]
    print(f"{len(pendentes)} municípios sem coordenadas (de {len(municipios)} total)")

    # Modo rápido: processa apenas os N primeiros (útil para testes)
    limite = int(sys.argv[1]) if len(sys.argv) > 1 else len(pendentes)
    pendentes = pendentes[:limite]

    indice = {m["id"]: i for i, m in enumerate(municipios)}
    ok = erros = 0

    for i, m in enumerate(pendentes, 1):
        coord = fetch_centroide(m["id"])
        if coord:
            lat, lon = coord
            municipios[indice[m["id"]]]["lat"] = lat
            municipios[indice[m["id"]]]["lon"] = lon
            ok += 1
        else:
            erros += 1

        if i % 50 == 0 or i == len(pendentes):
            pct = i / len(pendentes) * 100
            print(f"  {i}/{len(pendentes)} ({pct:.0f}%) — ok={ok} erros={erros}")
            # Salva progresso parcial
            MUNICIPIOS.write_text(
                json.dumps(municipios, ensure_ascii=False, indent=2), encoding="utf-8"
            )

        time.sleep(0.05)  # ~20 req/s — bem abaixo do limite da API IBGE

    MUNICIPIOS.write_text(
        json.dumps(municipios, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Concluído: {ok} ok, {erros} erros")


if __name__ == "__main__":
    main()
