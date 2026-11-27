"""Testes dos cálculos puros dos scrapers (sem rede)."""

import importlib.util
import json
import sys
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


def test_mesclar_apaga_condicao_atual_sem_leitura():
    existente = {"temperatura_atual": 30.0, "umidade_pct": 80, "qualidade_ar": {"aqi": 40}}
    novos = {"temperatura_atual": None, "umidade_pct": 55, "qualidade_ar": None}
    saida = om.mesclar(existente, novos)
    # Sem leitura agora: não pode ficar a temperatura antiga sob carimbo novo
    assert saida["temperatura_atual"] is None
    assert saida["umidade_pct"] == 55
    # O bloco de qualidade do ar tem carimbo próprio e continua válido
    assert saida["qualidade_ar"] == {"aqi": 40}


def test_estacao_ano_hemisferios():
    # Viradas por data, invertidas no Hemisfério Sul
    assert om.estacao_ano(date(2026, 6, 15), -23.5) == "Outono"
    assert om.estacao_ano(date(2026, 6, 15), 10.0) == "Primavera"
    assert om.estacao_ano(date(2026, 12, 21), -23.5) == "Verão"
    assert om.estacao_ano(date(2026, 3, 19), -23.5) == "Verão"


def preparar_main(tmp_path, monkeypatch, fetch_batch):
    """Roda main() com 1 município, sem rede, sem pausas e com dados em tmp_path."""
    municipios = [{"nome": "Teste", "estado": "sp", "slug": "teste", "lat": -23.5, "lon": -46.6}]
    arquivo = tmp_path / "municipios.json"
    arquivo.write_text(json.dumps(municipios), encoding="utf-8")
    monkeypatch.setattr(om, "MUNICIPIOS", arquivo)
    monkeypatch.setattr(om, "DATA_DIR", tmp_path / "cidades")
    monkeypatch.setattr(om.time, "sleep", lambda _s: None)
    monkeypatch.setattr(sys, "argv", ["scrape-openmeteo.py"])
    monkeypatch.setattr(om, "fetch_batch", fetch_batch)
    return tmp_path / "cidades" / "sp" / "teste.json"


def test_main_repete_lote_com_erro_de_rede(tmp_path, monkeypatch):
    chamadas = []

    def falha_uma_vez(lats, lons):
        chamadas.append(1)
        if len(chamadas) == 1:
            raise TimeoutError("_ssl.c:1112: The handshake operation timed out")
        return [{"daily": {}, "current": {"temperature_2m": 21.5}}], [{}]

    salvo = preparar_main(tmp_path, monkeypatch, falha_uma_vez)
    om.main()
    assert len(chamadas) == 2
    assert json.loads(salvo.read_text(encoding="utf-8"))["temperatura_atual"] == 21.5


def test_main_desiste_do_lote_depois_das_tentativas(tmp_path, monkeypatch):
    chamadas = []

    def sempre_falha(lats, lons):
        chamadas.append(1)
        raise TimeoutError("handshake")

    salvo = preparar_main(tmp_path, monkeypatch, sempre_falha)
    om.main()
    assert len(chamadas) == om.TENTATIVAS_LOTE
    assert not salvo.exists()
