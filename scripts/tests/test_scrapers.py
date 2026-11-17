"""Testes dos cálculos puros dos scrapers (sem rede)."""

import importlib.util
from datetime import date
from pathlib import Path


def carregar(nome_arquivo: str, nome_modulo: str):
    caminho = Path(__file__).parent.parent / nome_arquivo
    spec = importlib.util.spec_from_file_location(nome_modulo, caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


om = carregar("scrape-openmeteo.py", "scrape_openmeteo")


def test_fase_lua_iluminacao_zero_na_nova():
    # Nova real: 15/06/2026
    lua = om.fase_lua(date(2026, 6, 15))
    assert lua["nome"] == "Minguante"
    assert lua["iluminacao_pct"] == 0.0


def test_fase_lua_quarto_crescente_tem_menos_de_100():
    # Quarto Crescente ~17/11/2026: metade iluminada, nunca 100%
    lua = om.fase_lua(date(2026, 11, 17))
    assert lua["nome"] == "Crescente"
    assert 30 <= lua["iluminacao_pct"] <= 70


def test_processar_cidade_temperatura_nula_vira_none():
    m = {"nome": "Teste", "estado": "sp", "slug": "teste", "lat": -23.5, "lon": -46.6}
    saida = om.processar_cidade(
        {"daily": {}, "current": {"temperature_2m": None}}, {}, m, "agora", date(2026, 11, 17)
    )
    assert saida["temperatura_atual"] is None


def test_estacao_ano_hemisferios():
    # Viradas por data, invertidas no Hemisfério Sul
    assert om.estacao_ano(date(2026, 6, 15), -23.5) == "Outono"
    assert om.estacao_ano(date(2026, 6, 15), 10.0) == "Primavera"
    assert om.estacao_ano(date(2026, 12, 21), -23.5) == "Verão"
    assert om.estacao_ano(date(2026, 3, 19), -23.5) == "Verão"
