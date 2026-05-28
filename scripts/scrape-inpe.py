#!/usr/bin/env python3
"""Coleta focos de queimada via NASA FIRMS (fallback do INPE BDQueimadas).

Para cada município com lat/lon definido, conta focos num raio de 100km.
Saída: data/cidades/{uf}/{slug}.json (campo queimadas)
Rodar a cada 6h via GitHub Actions.

Fonte primária: NASA FIRMS CSV público (América do Sul, 24h)
Fallback: INPE BDQueimadas (se disponível)
"""

import csv
import io
import json
import math
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

# NASA FIRMS — CSV público, atualizado a cada 3h, sem autenticação
FIRMS_URLS = [
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_South_America_24h.csv",
]

RAIO_KM = 100

# Bounding box do Brasil
BR_LAT_MIN, BR_LAT_MAX = -33.75, 5.27
BR_LON_MIN, BR_LON_MAX = -73.99, -28.85


def ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_csv_focos(tentativas: int = 3) -> list[tuple[float, float]]:
    """Retorna lista de (lon, lat) dos focos nas últimas 24h no Brasil."""
    for url in FIRMS_URLS:
        for i in range(tentativas):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
                with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as r:
                    data = r.read().decode("utf-8", errors="replace")
                reader = csv.DictReader(io.StringIO(data))
                focos = []
                for row in reader:
                    try:
                        lat = float(row["latitude"])
                        lon = float(row["longitude"])
                        # Filtra somente Brasil
                        if BR_LAT_MIN <= lat <= BR_LAT_MAX and BR_LON_MIN <= lon <= BR_LON_MAX:
                            focos.append((lon, lat))
                    except (ValueError, KeyError):
                        continue
                print(f"  {len(focos)} focos no Brasil via {url.split('/')[-1]}")
                return focos
            except Exception as e:
                if i == tentativas - 1:
                    print(f"  ERRO {url}: {e}", file=sys.stderr)
                else:
                    time.sleep(2 ** i)
    return []


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine simplificado."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def contar_focos(focos_coords: list[tuple[float, float]], lat: float, lon: float, raio: float) -> int:
    return sum(1 for (flon, flat) in focos_coords if distancia_km(lat, lon, flat, flon) <= raio)


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    filtro_uf = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if filtro_uf:
        municipios = [m for m in municipios if m["estado"] == filtro_uf]

    # Apenas municípios com coordenadas
    municipios_com_coord = [m for m in municipios if m.get("lat") and m.get("lon")]

    if not municipios_com_coord:
        print("Nenhum município com coordenadas. Execute enriquecer-coords.py primeiro.")
        return

    print("Baixando focos de queimada (NASA FIRMS)...")
    focos_coords = fetch_csv_focos()
    if not focos_coords:
        print("Falha ao baixar dados de focos.", file=sys.stderr)
        sys.exit(1)
    print(f"  {len(focos_coords)} focos nas últimas 24h no Brasil")

    agora = datetime.now(timezone.utc).astimezone().isoformat()
    ok = 0

    for m in municipios_com_coord:
        focos = contar_focos(focos_coords, m["lat"], m["lon"], RAIO_KM)
        uf = m["estado"]
        slug = m["slug"]

        pasta = DATA_DIR / uf
        pasta.mkdir(parents=True, exist_ok=True)
        arquivo = pasta / f"{slug}.json"

        existente: dict = {}
        if arquivo.exists():
            try:
                existente = json.loads(arquivo.read_text(encoding="utf-8"))
            except Exception:
                pass

        existente["queimadas"] = {
            "focos_100km": focos,
            "fonte": "NASA FIRMS / INPE",
            "atualizado_em": agora,
        }

        if "atualizado_em" not in existente:
            existente["atualizado_em"] = agora

        arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8")
        ok += 1

    print(f"Concluído: {ok} municípios atualizados")


if __name__ == "__main__":
    main()
