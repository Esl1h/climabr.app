#!/usr/bin/env python3
"""Coleta nível de reservatórios via ONS Dados Abertos (dados hidrológicos diários).

Cobre os ~162 reservatórios do SIN (Sistema Interligado Nacional).
Para cada reservatório, associa aos municípios mais próximos por lat/lon.
Saída: data/cidades/{uf}/{slug}.json (campo reservatorio)
Rodar a cada 6h via GitHub Actions.

Fonte: https://dados.ons.org.br/dataset/dados-hidrologicos-res
"""

import csv
import io
import json
import math
import sys
import urllib.request
from datetime import date, timezone, datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

ONS_RESERV_CSV = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/reservatorio/RESERVATORIOS.csv"
ONS_HIDRO_CSV = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di/DADOS_HIDROLOGICOS_RES_{ano}.csv"

# Raio máximo para associar reservatório a município (km)
RAIO_KM = 150


def fetch_csv(url: str, delimiter: str = ";") -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "climabr.app/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read().decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(data), delimiter=delimiter)
    return list(reader)


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
    municipios_com_coord = [m for m in municipios if m.get("lat") and m.get("lon")]
    print(f"Municípios com coordenadas: {len(municipios_com_coord)}")

    # 1. Baixa metadados dos reservatórios (lat/lon, id)
    print("Baixando metadados de reservatórios ONS...")
    try:
        reserv_meta = fetch_csv(ONS_RESERV_CSV)
    except Exception as e:
        print(f"ERRO ao baixar metadados: {e}", file=sys.stderr)
        sys.exit(1)

    # Indexa por id_reservatorio (res_id no CSV de metadados)
    reserv_por_id: dict[str, dict] = {}
    for r in reserv_meta:
        rid = r.get("res_id", "").strip()
        if rid:
            reserv_por_id[rid] = r

    print(f"  {len(reserv_por_id)} reservatórios com metadados")

    # 2. Baixa dados hidrológicos do ano atual
    ano = date.today().year
    url_hidro = ONS_HIDRO_CSV.format(ano=ano)
    print(f"Baixando dados hidrológicos {ano}...")
    try:
        hidro_rows = fetch_csv(url_hidro)
    except Exception:
        # Tenta ano anterior como fallback
        ano -= 1
        url_hidro = ONS_HIDRO_CSV.format(ano=ano)
        try:
            hidro_rows = fetch_csv(url_hidro)
        except Exception as e2:
            print(f"ERRO ao baixar dados hidrológicos: {e2}", file=sys.stderr)
            sys.exit(1)

    print(f"  {len(hidro_rows)} registros em {ano}")

    # 3. Última medição por reservatório
    # A linha mais recente COM volume, não simplesmente a mais recente: o ONS
    # publica o registro do dia antes de fechar o val_volumeutilcon, e pegar
    # essa linha vazia derrubava o reservatório inteiro do resultado (o filtro
    # do passo 4 exige volume). Foi o que congelou Sobradinho, Xingó, Luiz
    # Gonzaga, Apolônio Sales e as duas Paulo Afonso: as cidades da bacia do São
    # Francisco ficaram semanas exibindo uma medição velha como se fosse a atual.
    ultima_medicao: dict[str, dict] = {}
    for row in hidro_rows:
        rid = row.get("id_reservatorio", "").strip()
        data_str = row.get("din_instante", "").strip()
        if not rid or not data_str or not row.get("val_volumeutilcon", "").strip():
            continue
        if rid not in ultima_medicao or data_str > ultima_medicao[rid]["din_instante"]:
            ultima_medicao[rid] = row

    print(f"  {len(ultima_medicao)} reservatórios com medições recentes")

    # 4. Monta lista de reservatórios com nivel e coordenadas
    reservatorios: list[dict] = []
    for rid, med in ultima_medicao.items():
        meta = reserv_por_id.get(rid, {})
        lat_str = meta.get("val_latitude", "").strip()
        lon_str = meta.get("val_longitude", "").strip()
        vol_str = med.get("val_volumeutilcon", "").strip()

        if not lat_str or not lon_str or not vol_str:
            continue

        try:
            reservatorios.append({
                "id": rid,
                "nome": med.get("nom_reservatorio", rid).strip().title(),
                "lat": float(lat_str.replace(",", ".")),
                "lon": float(lon_str.replace(",", ".")),
                "nivel_pct": max(0.0, float(vol_str.replace(",", "."))),
                "data": med.get("din_instante", "").strip(),
                "subsistema": med.get("nom_subsistema", "").strip(),
                # FIO = fio d'água. Essas usinas não acumulam por projeto, e o
                # val_volumeutilcon delas oscila em torno de zero (chega a vir
                # NEGATIVO, virando 0,0% no clamp acima). Num ranking de
                # "reservatórios mais baixos" elas ocupam o topo o ano inteiro
                # sem significar escassez, então o tipo precisa ir para o JSON.
                "tipo": med.get("tip_reservatorio", "").strip().upper(),
            })
        except (ValueError, TypeError):
            continue

    print(f"  {len(reservatorios)} reservatórios com nível e coordenadas")

    # 5. Para cada município, encontra o reservatório mais próximo dentro do raio
    # Não sobrescreve dados de fontes primárias (SABESP, etc.)
    agora = datetime.now(timezone.utc).astimezone().isoformat()
    atualizados = ignorados = sem_vizinho = 0

    for m in municipios_com_coord:
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

        # Não sobrescreve fonte primária. O teste era `"SABESP" in fonte`, o que
        # deixava a COPASA desprotegida: rodar este script depois do
        # scrape-copasa.py apagava Paraopeba, Rio Manso, Serra Azul e Vargem das
        # Flores, trocando o sistema que realmente abastece Belo Horizonte pelo
        # hidrelétrico mais próximo. `aproximado` distingue os dois casos sem
        # depender do nome da concessionária.
        reserv_atual = existente.get("reservatorio") or {}
        if reserv_atual.get("nivel_pct") is not None and not reserv_atual.get("aproximado"):
            ignorados += 1
            continue

        lat_m = float(m["lat"])
        lon_m = float(m["lon"])

        mais_proximo = None
        menor_dist = float("inf")

        for res in reservatorios:
            d = distancia_km(lat_m, lon_m, res["lat"], res["lon"])
            if d < menor_dist and d <= RAIO_KM:
                menor_dist = d
                mais_proximo = res

        if not mais_proximo:
            sem_vizinho += 1
            continue

        existente["reservatorio"] = {
            "nome": mais_proximo["nome"],
            "nivel_pct": round(mais_proximo["nivel_pct"], 1),
            "variacao_semana_pct": 0.0,
            "data_medicao": mais_proximo["data"],
            "distancia_km": round(menor_dist, 1),
            "aproximado": True,
            "tipo": mais_proximo["tipo"],
            "acumula": mais_proximo["tipo"] != "FIO",
            "nota": f"Reservatório hidrelétrico mais próximo ({round(menor_dist)}km). Pode não ser o sistema de abastecimento desta cidade.",
            "fonte": "ONS / ANA",
            "atualizado_em": agora,
        }

        if "atualizado_em" not in existente:
            existente["atualizado_em"] = agora

        arquivo.write_text(
            json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        atualizados += 1

    print(f"Concluído: {atualizados} atualizados, {ignorados} com fonte primária preservada, {sem_vizinho} sem reservatório próximo")


if __name__ == "__main__":
    main()
