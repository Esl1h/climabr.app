#!/usr/bin/env python3
"""Coleta dados de dengue, zika e chikungunya via InfoDengue (Fiocruz/SVS).

API: https://info.dengue.mat.br/api/alertcity
Cobertura: municípios com monitoramento ativo (maioria das cidades brasileiras)
Saída: data/cidades/{uf}/{slug}.json (campos dengue, zika, chikungunya)
Rodar 1x/dia via GitHub Actions.
"""

import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

INFODENGUE_URL = "https://info.dengue.mat.br/api/alertcity"

# nivel: 0=verde, 1=amarelo, 2=laranja, 3=vermelho, 4=alerta máximo
NIVEL_LABEL = {0: "Normal", 1: "Atenção", 2: "Alerta", 3: "Alerta Alto", 4: "Emergência"}
NIVEL_INC_LABEL = {0: "Baixa", 1: "Média", 2: "Alta", 3: "Muito Alta"}


def semana_epidemiologica(d: date) -> tuple[int, int]:
    """Retorna (semana, ano) epidemiológicos para a data."""
    iso = d.isocalendar()
    return iso[1], iso[0]


def fetch_doenca(geocode: int, doenca: str, semana: int, ano: int) -> dict | None:
    """Busca dados de uma doença para um município na semana epidemiológica."""
    url = (f"{INFODENGUE_URL}?geocode={geocode}&disease={doenca}&format=json"
           f"&ew_start={semana - 1}&ew_end={semana}&ey_start={ano}&ey_end={ano}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            dados = json.loads(r.read())
        if dados:
            return dados[-1]
        return None
    except Exception:
        return None


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    filtro_uf = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if filtro_uf:
        municipios = [m for m in municipios if m["estado"] == filtro_uf]

    hoje = date.today()
    semana, ano = semana_epidemiologica(hoje)
    # InfoDengue tem delay de ~2 semanas; busca semana atual e anterior
    agora = datetime.now(timezone.utc).astimezone().isoformat()

    print(f"Coletando InfoDengue — semana {semana}/{ano} ({len(municipios)} municípios)...")

    ok = sem_dados = erros = 0

    for i, m in enumerate(municipios):
        geocode = m.get("id")
        if not geocode:
            sem_dados += 1
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

        atualizado = False

        for doenca in ["dengue", "chikungunya", "zika"]:
            d = fetch_doenca(geocode, doenca, semana, ano)

            # Fallback: tenta semana anterior se não houver dados nesta
            if not d:
                d = fetch_doenca(geocode, doenca, semana - 1, ano)

            if d and d.get("nivel") is not None:
                nivel = int(d["nivel"])
                nivel_inc = int(d.get("nivel_inc", 0) or 0)
                casos = int(d.get("casos", 0) or 0)
                casos_est = d.get("casos_est")
                casos_est = int(casos_est) if casos_est else casos

                existente[doenca] = {
                    "nivel_alerta": nivel,
                    "nivel_label": NIVEL_LABEL.get(nivel, "Desconhecido"),
                    "nivel_incidencia": nivel_inc,
                    "nivel_incidencia_label": NIVEL_INC_LABEL.get(nivel_inc, ""),
                    "casos_semana": casos,
                    "casos_estimados": casos_est,
                    "semana_epidemiologica": int(d.get("SE", 0) or 0),
                    "fonte": "InfoDengue / Fiocruz / SVS",
                    "atualizado_em": agora,
                }
                atualizado = True

            time.sleep(0.05)  # respeita rate limit

        if atualizado:
            if "atualizado_em" not in existente:
                existente["atualizado_em"] = agora
            arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8")
            ok += 1
        else:
            sem_dados += 1

        if (i + 1) % 200 == 0:
            print(f"  {i+1}/{len(municipios)} — ok={ok} sem_dados={sem_dados}")

    print(f"Concluído: {ok} ok, {sem_dados} sem dados, {erros} erros")


if __name__ == "__main__":
    main()
