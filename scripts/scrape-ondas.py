#!/usr/bin/env python3
"""Coleta dados de ondas/surf via Open-Meteo Marine API e identifica municípios costeiros.

Etapa 1 (setup 1×): varre municípios de estados litorâneos e salva lista de costeiros.
Etapa 2 (cron 6h): coleta ondas + vento para todos os costeiros.

Saída:
  data/municipios-costeiros.json  — lista de slugs costeiros com coord. oceânica
  data/cidades/{uf}/{slug}.json   — campo ondas + vento_max
"""

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"
COSTEIROS_FILE = Path(__file__).parent.parent / "data" / "municipios-costeiros.json"

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

ESTADOS_COSTEIROS = {
    'ap', 'pa', 'ma', 'pi', 'ce', 'rn', 'pb', 'pe',
    'al', 'se', 'ba', 'es', 'rj', 'sp', 'pr', 'sc', 'rs',
}

BATCH_SIZE = 25
DELAY = 2.0


def fetch_json(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception:
        return None


def direcao_cardinal(graus: float) -> str:
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]
    return dirs[round(graus / 22.5) % 16]


def condicao_surf(altura: float, periodo: float, vento_max: float) -> dict:
    """Classifica condição de surf com ícone de farol."""
    if altura is None or periodo is None:
        return {"nivel": "desconhecido", "emoji": "⚪", "descricao": "Sem dados"}

    # Vento forte degrada condição
    vento_ruim = vento_max is not None and vento_max > 30

    if altura < 0.3:
        return {"nivel": "ruim", "emoji": "🔴", "descricao": "Mar muito calmo"}
    if altura > 4.0:
        return {"nivel": "perigoso", "emoji": "🔴", "descricao": "Mar agitado / perigoso"}
    if vento_ruim:
        return {"nivel": "ruim", "emoji": "🔴", "descricao": "Vento muito forte"}

    if 0.8 <= altura <= 2.5 and periodo >= 8:
        return {"nivel": "bom", "emoji": "🟢", "descricao": "Ótimo para surf"}
    if 0.6 <= altura <= 2.5 and periodo >= 6:
        return {"nivel": "bom", "emoji": "🟢", "descricao": "Bom para surf"}
    if 0.4 <= altura < 0.6:
        return {"nivel": "razoavel", "emoji": "🟡", "descricao": "Surf razoável"}
    if 2.5 < altura <= 4.0 and periodo >= 8:
        return {"nivel": "razoavel", "emoji": "🟡", "descricao": "Ondas grandes — surfistas experientes"}
    if 2.5 < altura <= 4.0:
        return {"nivel": "ruim", "emoji": "🔴", "descricao": "Ondas grandes e fechadas"}

    return {"nivel": "razoavel", "emoji": "🟡", "descricao": "Surf razoável"}


def identificar_costeiros() -> list[dict]:
    """Varre municípios de estados litorâneos e testa Marine API."""
    municipios = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
    candidatos = [
        m for m in municipios
        if m["estado"] in ESTADOS_COSTEIROS and m.get("lat") and m.get("lon")
    ]
    print(f"Testando {len(candidatos)} candidatos costeiros...")

    costeiros: list[dict] = []
    for i in range(0, len(candidatos), BATCH_SIZE):
        lote = candidatos[i: i + BATCH_SIZE]
        lats = ",".join(str(round(float(m["lat"]), 4)) for m in lote)
        lons = ",".join(str(round(float(m["lon"]), 4)) for m in lote)
        url = (f"{MARINE_URL}?latitude={lats}&longitude={lons}"
               "&daily=wave_height_max&timezone=America%2FSao_Paulo&forecast_days=1")
        result = fetch_json(url)
        if not result:
            time.sleep(2)
            continue

        items = result if isinstance(result, list) else [result]
        for j, item in enumerate(items):
            if j >= len(lote):
                break
            altura = (item.get("daily") or {}).get("wave_height_max", [None])
            if altura and altura[0] is not None:
                m = lote[j]
                costeiros.append({
                    "id": m["id"],
                    "nome": m["nome"],
                    "slug": m["slug"],
                    "estado": m["estado"],
                    "lat": float(m["lat"]),
                    "lon": float(m["lon"]),
                })

        if (i // BATCH_SIZE + 1) % 10 == 0:
            print(f"  {i + len(lote)}/{len(candidatos)} — costeiros: {len(costeiros)}")
        time.sleep(DELAY)

    print(f"Total costeiros identificados: {len(costeiros)}")
    COSTEIROS_FILE.write_text(
        json.dumps(costeiros, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return costeiros


def coletar_ondas(costeiros: list[dict]) -> None:
    """Coleta dados de ondas e vento para todos os municípios costeiros."""
    agora = datetime.now(timezone.utc).astimezone().isoformat()
    total = len(costeiros)
    ok = erros = 0

    for inicio in range(0, total, BATCH_SIZE):
        lote = costeiros[inicio: inicio + BATCH_SIZE]
        lats = ",".join(str(round(m["lat"], 4)) for m in lote)
        lons = ",".join(str(round(m["lon"], 4)) for m in lote)

        # Marine: ondas + swell
        url_marine = (
            f"{MARINE_URL}?latitude={lats}&longitude={lons}"
            "&daily=wave_height_max,wave_period_max,wave_direction_dominant,"
            "swell_wave_height_max,swell_wave_period_max,swell_wave_direction_dominant"
            "&current=wave_height,wave_period,wave_direction,"
            "swell_wave_height,swell_wave_period,swell_wave_direction"
            "&timezone=America%2FSao_Paulo&forecast_days=3"
        )

        # Forecast: vento
        url_wind = (
            f"{FORECAST_URL}?latitude={lats}&longitude={lons}"
            "&daily=windspeed_10m_max,winddirection_10m_dominant,windgusts_10m_max"
            "&current_weather=true"
            "&timezone=America%2FSao_Paulo&forecast_days=1"
        )

        marine_list = fetch_json(url_marine)
        wind_list = fetch_json(url_wind)

        if not marine_list:
            erros += len(lote)
            time.sleep(3)
            continue

        if not isinstance(marine_list, list):
            marine_list = [marine_list]
        if not isinstance(wind_list, list):
            wind_list = [wind_list] if wind_list else [{}] * len(lote)

        for i, m in enumerate(lote):
            marine = marine_list[i] if i < len(marine_list) else {}
            wind = wind_list[i] if i < len(wind_list) else {}

            daily_m = marine.get("daily") or {}
            current_m = marine.get("current") or {}
            daily_w = wind.get("daily") or {}
            current_w = wind.get("current_weather") or {}

            altura_atual = current_m.get("wave_height")
            periodo_atual = current_m.get("wave_period")
            direcao_atual = current_m.get("wave_direction")

            altura_max = (daily_m.get("wave_height_max") or [None])[0]
            periodo_max = (daily_m.get("wave_period_max") or [None])[0]
            swell_altura = (daily_m.get("swell_wave_height_max") or [None])[0]
            swell_periodo = (daily_m.get("swell_wave_period_max") or [None])[0]
            swell_direcao = (daily_m.get("swell_wave_direction_dominant") or [None])[0]

            vento_max = (daily_w.get("windspeed_10m_max") or [None])[0]
            vento_rajada = (daily_w.get("windgusts_10m_max") or [None])[0]
            vento_direcao = (daily_w.get("winddirection_10m_dominant") or [None])[0]
            vento_atual = current_w.get("windspeed")
            vento_atual_dir = current_w.get("winddirection")

            surf = condicao_surf(altura_atual or altura_max, periodo_atual or periodo_max, vento_max)

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

            existente["ondas"] = {
                "altura_m": round(float(altura_atual), 2) if altura_atual is not None else None,
                "altura_max_m": round(float(altura_max), 2) if altura_max is not None else None,
                "periodo_s": round(float(periodo_atual), 1) if periodo_atual is not None else None,
                "direcao_graus": int(direcao_atual) if direcao_atual is not None else None,
                "direcao": direcao_cardinal(float(direcao_atual)) if direcao_atual is not None else None,
                "swell_altura_m": round(float(swell_altura), 2) if swell_altura is not None else None,
                "swell_periodo_s": round(float(swell_periodo), 1) if swell_periodo is not None else None,
                "swell_direcao": direcao_cardinal(float(swell_direcao)) if swell_direcao is not None else None,
                "surf_nivel": surf["nivel"],
                "surf_emoji": surf["emoji"],
                "surf_descricao": surf["descricao"],
                "fonte": "Open-Meteo Marine",
                "atualizado_em": agora,
            }

            # Vento (completo — para todas as cidades via Open-Meteo)
            if vento_atual is not None or vento_max is not None:
                existente["vento"] = {
                    "velocidade_kmh": round(float(vento_atual), 1) if vento_atual is not None else None,
                    "direcao_graus": int(vento_atual_dir) if vento_atual_dir is not None else None,
                    "direcao": direcao_cardinal(float(vento_atual_dir)) if vento_atual_dir is not None else None,
                    "max_kmh": round(float(vento_max), 1) if vento_max is not None else None,
                    "rajada_kmh": round(float(vento_rajada), 1) if vento_rajada is not None else None,
                    "direcao_dominante": direcao_cardinal(float(vento_direcao)) if vento_direcao is not None else None,
                    "fonte": "Open-Meteo",
                    "atualizado_em": agora,
                }

            if "atualizado_em" not in existente:
                existente["atualizado_em"] = agora

            arquivo.write_text(
                json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            ok += 1

        if (inicio // BATCH_SIZE + 1) % 10 == 0:
            print(f"  {inicio + len(lote)}/{total} — ok={ok} erros={erros}")
        time.sleep(DELAY)

    print(f"Concluído: {ok} ok, {erros} erros de {total}")


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "coletar"

    if modo == "identificar":
        identificar_costeiros()
        return

    # Modo coleta: carrega lista de costeiros e coleta ondas
    if not COSTEIROS_FILE.exists():
        print("data/municipios-costeiros.json não encontrado. Rode primeiro: python3 scrape-ondas.py identificar")
        sys.exit(1)

    costeiros = json.loads(COSTEIROS_FILE.read_text(encoding="utf-8"))
    print(f"Coletando ondas para {len(costeiros)} municípios costeiros...")
    coletar_ondas(costeiros)


if __name__ == "__main__":
    main()
