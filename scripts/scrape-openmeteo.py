#!/usr/bin/env python3
"""Coleta previsão, UV, qualidade do ar e dados solares via Open-Meteo.

Substitui CPTEC para previsão e adiciona campos novos:
- previsao (7 dias com temp, chuva, UV, weathercode)
- uv (índice UV máximo do dia + categoria)
- qualidade_ar (AQI, PM2.5, PM10)
- sol (nascer, pôr, duração do dia)
- lua (fase calculada localmente)

Open-Meteo: https://open-meteo.com — sem autenticação, suporta batch
Air Quality: https://air-quality-api.open-meteo.com
Rodar a cada 3h via GitHub Actions.
"""

import json
import math
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

BATCH_SIZE = 20   # Open-Meteo aceita até ~100 por requisição
DELAY_BATCH = 5.0  # segundos entre lotes (evita rate limit 429)

# WMO Weather Codes → descrição PT-BR
WMO_DESCRICAO: dict[int, str] = {
    0: "Céu limpo", 1: "Principalmente limpo", 2: "Parcialmente nublado", 3: "Encoberto",
    45: "Névoa", 48: "Névoa com gelo",
    51: "Chuvisco leve", 53: "Chuvisco moderado", 55: "Chuvisco denso",
    61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
    71: "Neve leve", 73: "Neve moderada", 75: "Neve forte",
    77: "Granizo", 80: "Chuva isolada leve", 81: "Chuva isolada moderada", 82: "Chuva isolada forte",
    85: "Neve isolada", 86: "Neve isolada forte",
    95: "Tempestade", 96: "Tempestade com granizo leve", 99: "Tempestade com granizo forte",
}

# AQI US → categoria PT-BR
def categoria_aqi(aqi: int) -> str:
    if aqi <= 50: return "Boa"
    if aqi <= 100: return "Moderada"
    if aqi <= 150: return "Ruim para grupos sensíveis"
    if aqi <= 200: return "Ruim"
    if aqi <= 300: return "Muito Ruim"
    return "Perigosa"

# Categoria UV
def categoria_uv(uv: float) -> str:
    if uv < 3: return "Baixo"
    if uv < 6: return "Moderado"
    if uv < 8: return "Alto"
    if uv < 11: return "Muito Alto"
    return "Extremo"

def fase_lua(d: date) -> dict:
    """Fase lunar via algoritmo de Julian Day."""
    ano, mes, dia = d.year, d.month, d.day
    if mes < 3:
        ano -= 1
        mes += 12
    a = ano // 100
    b = a // 4
    c = 2 - a + b
    e = int(365.25 * (ano + 4716))
    f = int(30.6001 * (mes + 1))
    jd = c + dia + e + f - 1524.5
    ciclo = 29.53058770576
    fase = ((jd - 2451550.1) % ciclo) / ciclo
    nomes = ["Nova", "Crescente", "Quarto Crescente", "Gibosa Crescente",
             "Cheia", "Gibosa Minguante", "Quarto Minguante", "Minguante"]
    idx = int(fase * 8) % 8
    iluminacao = round(abs(math.sin(fase * math.pi * 2)) * 100, 0)
    dias_proxima = round((1.0 - fase) * ciclo, 0) if fase < 1 else 0
    return {
        "nome": nomes[idx],
        "iluminacao_pct": iluminacao,
        "fase_pct": round(fase * 100, 1),
        "dias_proxima_cheia": int(round(abs(0.5 - fase) * ciclo)),
    }

def estacao_ano(d: date, lat: float) -> str:
    """Estação do ano baseada na latitude (Hemisfério Sul invertido)."""
    mes = d.month
    sul = lat < 0
    if sul:
        if mes in (12, 1, 2): return "Verão"
        if mes in (3, 4, 5): return "Outono"
        if mes in (6, 7, 8): return "Inverno"
        return "Primavera"
    else:
        if mes in (12, 1, 2): return "Inverno"
        if mes in (3, 4, 5): return "Primavera"
        if mes in (6, 7, 8): return "Verão"
        return "Outono"

def fetch_batch(lats: list[float], lons: list[float]) -> tuple[list[dict], list[dict]]:
    """Busca previsão + qualidade do ar para um lote de cidades."""
    lat_str = ",".join(str(round(x, 4)) for x in lats)
    lon_str = ",".join(str(round(x, 4)) for x in lons)

    # Previsão + UV + sun + vento
    url_fc = (f"{FORECAST_URL}?latitude={lat_str}&longitude={lon_str}"
              "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,"
              "uv_index_max,weathercode,sunrise,sunset,daylight_duration,"
              "windspeed_10m_max,winddirection_10m_dominant,windgusts_10m_max"
              "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,"
              "relative_humidity_2m,pressure_msl,dew_point_2m"
              "&timezone=America%2FSao_Paulo&forecast_days=7")

    req = urllib.request.Request(url_fc, headers={"User-Agent": "climabr.app/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        fc_data = json.loads(r.read())
    if not isinstance(fc_data, list):
        fc_data = [fc_data]

    # Qualidade do ar
    url_aq = (f"{AQ_URL}?latitude={lat_str}&longitude={lon_str}"
              "&current=us_aqi,pm2_5,pm10,european_aqi,carbon_monoxide,nitrogen_dioxide,ozone"
              "&timezone=America%2FSao_Paulo")
    req2 = urllib.request.Request(url_aq, headers={"User-Agent": "climabr.app/1.0"})
    with urllib.request.urlopen(req2, timeout=20) as r:
        aq_data = json.loads(r.read())
    if not isinstance(aq_data, list):
        aq_data = [aq_data]

    return fc_data, aq_data

def processar_cidade(fc: dict, aq: dict, municipio: dict, agora: str, hoje: date) -> dict:
    """Monta o dict de dados para uma cidade a partir do resultado Open-Meteo."""
    daily = fc.get("daily", {})
    current = fc.get("current", {})
    aq_current = aq.get("current", {})
    lat = municipio.get("lat") or fc.get("latitude", 0)

    # Previsão 7 dias
    previsao = []
    datas = daily.get("time", [])
    for i, dt in enumerate(datas):
        codigo = daily.get("weathercode", [0] * len(datas))[i] or 0
        uv_dia = daily.get("uv_index_max", [0] * len(datas))[i] or 0
        previsao.append({
            "data": dt,
            "min": round(daily.get("temperature_2m_min", [0]*len(datas))[i] or 0, 1),
            "max": round(daily.get("temperature_2m_max", [0]*len(datas))[i] or 0, 1),
            "condicao": WMO_DESCRICAO.get(int(codigo), f"Código {codigo}"),
            "condicao_codigo": int(codigo),
            "chuva_mm": round(daily.get("precipitation_sum", [0]*len(datas))[i] or 0, 1),
            "uv": round(float(uv_dia), 1),
            "nascer_sol": daily.get("sunrise", [""] * len(datas))[i][11:] if daily.get("sunrise") else None,
            "por_sol": daily.get("sunset", [""] * len(datas))[i][11:] if daily.get("sunset") else None,
        })

    # UV de hoje
    uv_hoje = daily.get("uv_index_max", [0])[0] or 0
    uv_dict = {
        "indice": round(float(uv_hoje), 1),
        "categoria": categoria_uv(float(uv_hoje)),
        "fonte": "Open-Meteo",
    }
    if previsao:
        uv_dict["pico_inicio"] = "10:00"
        uv_dict["pico_fim"] = "14:00"

    # Qualidade do ar
    aqi_val = aq_current.get("us_aqi") or aq_current.get("european_aqi")
    ar_dict = None
    if aqi_val is not None:
        poluente = "PM2.5"
        if (aq_current.get("pm10") or 0) > (aq_current.get("pm2_5") or 0) * 1.5:
            poluente = "PM10"
        ar_dict = {
            "indice": int(aqi_val),
            "categoria": categoria_aqi(int(aqi_val)),
            "principal_poluente": poluente,
            "pm25": round(float(aq_current.get("pm2_5") or 0), 1),
            "pm10": round(float(aq_current.get("pm10") or 0), 1),
            "no2": round(float(aq_current.get("nitrogen_dioxide") or 0), 1),
            "o3": round(float(aq_current.get("ozone") or 0), 1),
            "fonte": "Open-Meteo / Copernicus",
            "atualizado_em": agora,
        }

    # Sol (hoje)
    sol_dict = None
    nascer = daily.get("sunrise", [""])[0]
    por = daily.get("sunset", [""])[0]
    if nascer and por:
        duracao_s = daily.get("daylight_duration", [0])[0] or 0
        duracao_h = round(duracao_s / 3600, 1)
        sol_dict = {
            "nascer": nascer[11:] if len(nascer) > 10 else nascer,
            "por": por[11:] if len(por) > 10 else por,
            "duracao_h": duracao_h,
            "estacao": estacao_ano(hoje, lat),
            "fonte": "Open-Meteo",
        }

    # Lua
    lua_dict = fase_lua(hoje)
    lua_dict["fonte"] = "Cálculo astronômico"

    # Vento atual e máximo do dia
    vento_max = daily.get("windspeed_10m_max", [None])[0]
    vento_rajada = daily.get("windgusts_10m_max", [None])[0]
    vento_direcao_dom = daily.get("winddirection_10m_dominant", [None])[0]
    vento_atual_kmh = current.get("wind_speed_10m") if current else None
    vento_atual_dir = current.get("wind_direction_10m") if current else None

    def graus_para_cardinal(g: float) -> str:
        dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"]
        return dirs[round(g / 22.5) % 16]

    vento_dict = {
        "velocidade_kmh": round(float(vento_atual_kmh), 1) if vento_atual_kmh is not None else None,
        "direcao_graus": int(vento_atual_dir) if vento_atual_dir is not None else None,
        "direcao": graus_para_cardinal(float(vento_atual_dir)) if vento_atual_dir is not None else None,
        "max_kmh": round(float(vento_max), 1) if vento_max is not None else None,
        "rajada_kmh": round(float(vento_rajada), 1) if vento_rajada is not None else None,
        "direcao_dominante": graus_para_cardinal(float(vento_direcao_dom)) if vento_direcao_dom is not None else None,
        "fonte": "Open-Meteo",
    }

    return {
        "previsao": previsao,
        "uv": uv_dict,
        "qualidade_ar": ar_dict,
        "sol": sol_dict,
        "lua": lua_dict,
        "vento": vento_dict,
        "temperatura_atual": round(float(current.get("temperature_2m", 0) or 0), 1) if current else None,
        "umidade_pct": int(current.get("relative_humidity_2m")) if current and current.get("relative_humidity_2m") is not None else None,
        "pressao_hpa": round(float(current.get("pressure_msl"))) if current and current.get("pressure_msl") is not None else None,
        "ponto_orvalho_c": round(float(current.get("dew_point_2m")), 1) if current and current.get("dew_point_2m") is not None else None,
    }

def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    filtro_uf = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if filtro_uf:
        municipios = [m for m in municipios if m["estado"] == filtro_uf]

    municipios_com_coord = [m for m in municipios if m.get("lat") and m.get("lon")]

    # Pula cidades já processadas nesta rodada (tem campo uv preenchido)
    def ja_tem_dados(m: dict) -> bool:
        f = DATA_DIR / m["estado"] / f"{m['slug']}.json"
        if not f.exists():
            return False
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            # Pula só se já tiver vento (campo novo desta versão)
            return d.get("vento") is not None
        except Exception:
            return False

    municipios_pendentes = [m for m in municipios_com_coord if not ja_tem_dados(m)]
    if len(municipios_pendentes) < len(municipios_com_coord):
        print(f"  {len(municipios_com_coord) - len(municipios_pendentes)} já processados, pulando.")
    municipios_com_coord = municipios_pendentes
    total = len(municipios_com_coord)
    print(f"Coletando Open-Meteo para {total} municípios em lotes de {BATCH_SIZE}...")

    hoje = date.today()
    agora = datetime.now(timezone.utc).astimezone().isoformat()
    ok = erros = 0

    for inicio in range(0, total, BATCH_SIZE):
        lote = municipios_com_coord[inicio: inicio + BATCH_SIZE]
        lats = [float(m["lat"]) for m in lote]
        lons = [float(m["lon"]) for m in lote]

        try:
            fc_list, aq_list = fetch_batch(lats, lons)
        except Exception as e:
            print(f"  ERRO lote {inicio}-{inicio+len(lote)}: {e}", file=sys.stderr)
            erros += len(lote)
            time.sleep(3)
            continue

        for i, m in enumerate(lote):
            fc = fc_list[i] if i < len(fc_list) else {}
            aq = aq_list[i] if i < len(aq_list) else {}

            try:
                novos = processar_cidade(fc, aq, m, agora, hoje)
            except Exception as e:
                erros += 1
                continue

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

            existente.update({
                "cidade": m["nome"],
                "estado": uf.upper(),
                "slug": slug,
                "latitude": m.get("lat"),
                "longitude": m.get("lon"),
                "atualizado_em": agora,
            })
            existente.update({k: v for k, v in novos.items() if v is not None})
            arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8")
            ok += 1

        if (inicio // BATCH_SIZE + 1) % 10 == 0:
            print(f"  {inicio + len(lote)}/{total} — ok={ok} erros={erros}")
        time.sleep(DELAY_BATCH)

    print(f"Concluído: {ok} ok, {erros} erros de {total}")

if __name__ == "__main__":
    main()
