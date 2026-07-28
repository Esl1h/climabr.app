#!/usr/bin/env python3
"""Coleta vigilância da qualidade da água (SISAGUA / Ministério da Saúde).

API: https://apidadosabertos.saude.gov.br/sisagua/vigilancia-parametros-basicos
Parâmetro monitorado: Escherichia coli (padrão de potabilidade: ausência)
Saída: data/cidades/{uf}/{slug}.json (campo "agua")
Rodar 1x/dia via GitHub Actions.

O volume é alto (dezenas de páginas de 1000 registros por UF/ano), então a
coleta é incremental: UFs mais desatualizadas primeiro e encerramento pelo
orçamento de tempo; a próxima rodada continua o rodízio. O campo codigo_ibge
vem nulo no dataset, então o casamento com municipios.json é por nome
normalizado dentro da UF.
"""

import json
import os
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "cidades"
MUNICIPIOS = Path(__file__).parent.parent / "data" / "municipios.json"

API_URL = "https://apidadosabertos.saude.gov.br/sisagua/vigilancia-parametros-basicos"
PARAMETRO = "Escherichia coli"

LIMITE_MINUTOS = float(os.environ.get("LIMITE_MINUTOS", "15"))
MAX_PAGINAS_UF = 200  # trava de segurança por UF/ano


def normalizar(nome: str) -> str:
    """Nome sem acentos, minúsculo, sem espaços duplicados."""
    s = unicodedata.normalize("NFD", nome)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def fetch_pagina(uf: str, ano: int, pagina: int) -> list[dict]:
    query = urllib.parse.urlencode({
        "uf": uf.upper(),
        "ano": ano,
        "parametro": PARAMETRO,
        "limit": 1000,
        "offset": pagina,  # a API pagina por número de página, não por linha
    })
    req = urllib.request.Request(f"{API_URL}?{query}",
                                 headers={"User-Agent": "climabr.app/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("parametros", [])


def coletar_uf(uf: str, ano: int, prazo_final: float) -> tuple[dict[str, dict], bool]:
    """Agrega amostras por município. Retorna (dados, completo)."""
    porMunicipio: dict[str, dict] = {}
    for pagina in range(MAX_PAGINAS_UF):
        if time.monotonic() > prazo_final:
            return porMunicipio, False
        try:
            regs = fetch_pagina(uf, ano, pagina)
        except Exception as e:
            print(f"  {uf.upper()}: erro na página {pagina}: {e}", file=sys.stderr)
            return porMunicipio, False
        for r in regs:
            nome = normalizar(r.get("municipio") or "")
            if not nome:
                continue
            m = porMunicipio.setdefault(nome, {"amostras": 0, "com_presenca": 0})
            m["amostras"] += 1
            if (r.get("resultado") or "").strip().upper() == "PRESENTE":
                m["com_presenca"] += 1
        if len(regs) < 1000:
            return porMunicipio, True
        time.sleep(0.1)
    return porMunicipio, True


def agua_ts(uf: str, municipios_uf: list[dict]) -> float:
    """Timestamp mais recente do campo agua na UF (0 = nunca coletada)."""
    mais_recente = 0.0
    for m in municipios_uf:
        f = DATA_DIR / uf / f"{m['slug']}.json"
        if not f.exists():
            continue
        try:
            ts = json.loads(f.read_text(encoding="utf-8")).get("agua", {}).get("atualizado_em")
            if ts:
                mais_recente = max(mais_recente, datetime.fromisoformat(ts).timestamp())
        except Exception:
            pass
    return mais_recente


def main():
    municipios: list[dict] = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))

    filtro_uf = sys.argv[1].lower() if len(sys.argv) > 1 else None
    por_uf: dict[str, list[dict]] = {}
    for m in municipios:
        if filtro_uf and m["estado"] != filtro_uf:
            continue
        por_uf.setdefault(m["estado"], []).append(m)

    # UFs com coleta mais antiga primeiro, para o rodízio entre rodadas
    ufs = sorted(por_uf, key=lambda uf: agua_ts(uf, por_uf[uf]))

    ano = date.today().year
    agora = datetime.now(timezone.utc).astimezone().isoformat()
    prazo_final = time.monotonic() + LIMITE_MINUTOS * 60

    print(f"Coletando SISAGUA ({PARAMETRO}, ano {ano}) — {len(ufs)} UFs, "
          f"limite {LIMITE_MINUTOS:.0f} min...")

    ufs_ok = cidades_ok = sem_match = 0
    for uf in ufs:
        if time.monotonic() > prazo_final:
            print(f"  Limite de {LIMITE_MINUTOS:.0f} min atingido; rodízio continua "
                  f"na próxima rodada.", file=sys.stderr)
            break

        coletado, completo = coletar_uf(uf, ano, prazo_final)
        if not coletado and completo:
            # Início de ano sem dados consolidados: usa o ano anterior
            coletado, completo = coletar_uf(uf, ano - 1, prazo_final)
            periodo = str(ano - 1)
        else:
            periodo = str(ano)
        if not completo:
            # Coleta parcial distorceria o percentual; descarta e retoma depois
            print(f"  {uf.upper()}: coleta incompleta, descartada nesta rodada.")
            continue

        slug_por_nome = {normalizar(m["nome"]): m for m in por_uf[uf]}
        for nome, agg in coletado.items():
            m = slug_por_nome.get(nome)
            if not m:
                sem_match += 1
                continue
            arquivo = DATA_DIR / uf / f"{m['slug']}.json"
            existente: dict = {}
            if arquivo.exists():
                try:
                    existente = json.loads(arquivo.read_text(encoding="utf-8"))
                except Exception:
                    pass
            pct = 100.0 * (1 - agg["com_presenca"] / agg["amostras"]) if agg["amostras"] else None
            existente["agua"] = {
                "parametro": PARAMETRO,
                "amostras": agg["amostras"],
                "com_presenca": agg["com_presenca"],
                "pct_conformes": round(pct, 1) if pct is not None else None,
                "periodo": periodo,
                "fonte": "SISAGUA / Ministério da Saúde",
                "atualizado_em": agora,
            }
            existente.setdefault("atualizado_em", agora)
            arquivo.parent.mkdir(parents=True, exist_ok=True)
            arquivo.write_text(json.dumps(existente, ensure_ascii=False, indent=2),
                               encoding="utf-8")
            cidades_ok += 1
        ufs_ok += 1
        print(f"  {uf.upper()}: {len(coletado)} municípios com amostras ({periodo})")

    print(f"Concluído: {ufs_ok} UFs, {cidades_ok} municípios atualizados, "
          f"{sem_match} nomes sem correspondência")


if __name__ == "__main__":
    main()
