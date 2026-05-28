#!/usr/bin/env python3
"""Coleta previsão do tempo via CPTEC/INPE para todos os municípios.

Usa a API XML pública do CPTEC: https://servicos.cptec.inpe.br/XML/
Saída: data/cidades/{uf}/{slug}.json (campos previsao, uv)
Rodar a cada 3h via GitHub Actions.
"""

import json
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"
CPTEC_IDS = Path(__file__).parent.parent / "data" / "cptec_ids.json"

CPTEC_PREVISAO = "https://servicos.cptec.inpe.br/XML/cidade/{id}/previsao.xml"

CONDICAO_MAP = {
    "ec": "Encoberto com Chuvas Contínuas",
    "ci": "Chuvas Isoladas",
    "c": "Chuva",
    "in": "Instável",
    "pp": "Poss. de Pancadas de Chuva",
    "cm": "Chuva pela Manhã",
    "cn": "Chuva à Noite",
    "ct": "Chuva à Tarde",
    "pn": "Parcialmente Nublado",
    "ps": "Predomínio de Sol",
    "n": "Nublado",
    "nv": "Nevoeiro",
    "g": "Geada",
    "e": "Encoberto",
    "mn": "Muita Nuvem",
    "npt": "Nublado e Pancadas de Chuva à Tarde",
    "npn": "Nublado com Pancadas à Noite",
    "npm": "Nublado com Pancadas de Manhã",
    "nc": "Não Informado",
}


def fetch_previsao_cptec(cptec_id: int, tentativas: int = 3) -> list[dict] | None:
    url = CPTEC_PREVISAO.format(id=cptec_id)
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                xml = r.read().decode("iso-8859-1")
            root = ET.fromstring(xml)
            previsao = []
            for p in root.findall("previsao"):
                tempo = p.findtext("tempo", "").lower()
                previsao.append({
                    "data": p.findtext("dia", ""),
                    "min": int(p.findtext("minima", "0") or 0),
                    "max": int(p.findtext("maxima", "0") or 0),
                    "condicao": CONDICAO_MAP.get(tempo, tempo),
                    "condicao_codigo": tempo,
                    "chuva_mm": 0,
                    "umidade": 0,
                    "uv": float(p.findtext("iuv", "0") or 0),
                })
            return previsao if previsao else None
        except Exception as e:
            if i == tentativas - 1:
                return None
            time.sleep(2 ** i)
    return None


def salvar_dados(municipio: dict, previsao: list) -> None:
    uf = municipio["estado"]
    slug = municipio["slug"]
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
        "cidade": municipio["nome"],
        "estado": uf.upper(),
        "slug": slug,
        "latitude": municipio.get("lat"),
        "longitude": municipio.get("lon"),
        "atualizado_em": datetime.now(timezone.utc).astimezone().isoformat(),
        "previsao": previsao,
    })

    arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    if not CPTEC_IDS.exists():
        print("ERRO: data/cptec_ids.json não encontrado. Execute gerar-mapa-cptec.py primeiro.", file=sys.stderr)
        sys.exit(1)

    cptec_ids: dict[str, int] = json.loads(CPTEC_IDS.read_text(encoding="utf-8"))

    filtro_uf = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if filtro_uf:
        municipios = [m for m in municipios if m["estado"] == filtro_uf]

    total = len(municipios)
    print(f"Coletando CPTEC para {total} municípios...")

    ok = erros = sem_id = 0
    for i, m in enumerate(municipios, 1):
        chave = f"{m['estado']}_{m['slug']}"
        cptec_id = cptec_ids.get(chave)

        if not cptec_id:
            sem_id += 1
            salvar_dados(m, [])
            continue

        previsao = fetch_previsao_cptec(cptec_id)
        if previsao:
            salvar_dados(m, previsao)
            ok += 1
        else:
            salvar_dados(m, [])
            erros += 1

        if i % 100 == 0:
            print(f"  {i}/{total} — ok={ok} erros={erros} sem_id={sem_id}")
        time.sleep(0.1)

    print(f"Concluído: {ok} ok, {erros} erros, {sem_id} sem ID CPTEC de {total}")


if __name__ == "__main__":
    main()
