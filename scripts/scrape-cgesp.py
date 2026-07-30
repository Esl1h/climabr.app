#!/usr/bin/env python3
"""Coleta pontos de alagamento da cidade de São Paulo (CGE/Prefeitura de SP).

O CGE é o único órgão municipal do país com registro público e estruturado de
alagamentos, então esta coleta cobre APENAS o município de São Paulo. Alertas
de defesa civil estadual/nacional não têm API aberta (CEMADEN e IDAP só
despacham por SMS/cell broadcast), por isso o alerta meteorológico nacional
continua vindo do INMET em scrape-alertas.py.

Fonte: https://www.cgesp.org/v3/alagamentos.jsp?dataBusca=DD/MM/AAAA
       HTML renderizado no servidor, sem chave, aceita data histórica.
Saída: data/cidades/sp/sao-paulo.json (campo alagamentos)

Roda 2x/dia, ~10 min antes de cada deploy (o site é estático), para que a
página construída carregue os pontos do dia. Ver .github/workflows/dados-cgesp.yml
"""

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ARQUIVO = Path(__file__).parent.parent / "data" / "cidades" / "sp" / "sao-paulo.json"

URL = "https://www.cgesp.org/v3/alagamentos.jsp"
TZ_SP = ZoneInfo("America/Sao_Paulo")

# O CGE devolve connection reset para User-Agent não-navegador, igual ao INMET.
HDRS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
}

# A lista completa vai inteira para o JSON servido a todo visitante da página de
# São Paulo. Em dia de temporal o CGE já registrou mais de 50 pontos, então o
# corte segura o peso do arquivo; os totais abaixo continuam contando tudo.
MAX_PONTOS = 30

# Uma zona (h1) abre um grupo de subprefeituras (tabelas), e cada tabela tem N
# pontos. O template JSP é fixo, sem JS, então casar por classe é estável.
RE_ZONA = re.compile(r'<h1 class="tit-bairros">\s*(.*?)\s*</h1>', re.S)
RE_TABELA = re.compile(r'<table class="tb-pontos-de-alagamentos">(.*?)</table>', re.S)
RE_SUBPREF = re.compile(r'<td class="bairro[^"]*">\s*(.*?)\s*<hr\s*/?>', re.S)
RE_PONTO = re.compile(r'<div class="ponto-de-alagamento">(.*?)</div>', re.S)
RE_STATUS = re.compile(r'<li class="(ativo|inativo)-(intransitavel|transitavel)"')
RE_DESCR = re.compile(r'<li class="arial-descr-alag[^"]*">(.*?)</li>', re.S)
RE_HORARIO = re.compile(r"De\s*(\d{2}:\d{2})(?:\s*a\s*(\d{2}:\d{2}))?", re.S)
RE_SENTIDO = re.compile(r"Sentido:\s*(.*?)(?:<br\s*/?>|$)", re.S)
RE_REFERENCIA = re.compile(r"Refer[êe]ncia:\s*(.*?)(?:<br\s*/?>|$)", re.S)
RE_TAG = re.compile(r"<[^>]+>")


def limpar(html: str) -> str:
    """Tira tags e normaliza espaço, preservando o texto visível."""
    texto = RE_TAG.sub(" ", html)
    texto = (
        texto.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return re.sub(r"\s+", " ", texto).strip()


def baixar(data_br: str) -> str:
    req = urllib.request.Request(
        f"{URL}?dataBusca={urllib.parse.quote(data_br)}&enviaBusca=Buscar", headers=HDRS
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_ponto(html: str, zona: str, subprefeitura: str) -> dict | None:
    m = RE_STATUS.search(html)
    if not m:
        return None
    ativo = m.group(1) == "ativo"
    transitavel = m.group(2) == "transitavel"

    descrs = RE_DESCR.findall(html)
    local = referencia = sentido = ""
    inicio = fim = None

    for d in descrs:
        if "Sentido:" in d or "efer" in d:
            s = RE_SENTIDO.search(d)
            r = RE_REFERENCIA.search(d)
            if s:
                sentido = limpar(s.group(1))
            if r:
                referencia = limpar(r.group(1))
        else:
            h = RE_HORARIO.search(d)
            if h:
                inicio, fim = h.group(1), h.group(2)
            # O logradouro vem depois do <br/> que fecha o horário
            partes = re.split(r"<br\s*/?>", d)
            local = limpar(partes[-1]) if partes else limpar(d)

    return {
        "zona": zona,
        "subprefeitura": subprefeitura,
        "local": local,
        "referencia": referencia,
        "sentido": sentido,
        "inicio": inicio,
        "fim": fim,
        "ativo": ativo,
        "transitavel": transitavel,
    }


def parse(html: str) -> list[dict]:
    if "Não há registros de alagamentos" in html:
        return []

    # Fatia por zona para que cada tabela herde o h1 que a precede
    cortes = [(m.end(), limpar(m.group(1))) for m in RE_ZONA.finditer(html)]
    if not cortes:
        cortes = [(0, "")]

    pontos: list[dict] = []
    for i, (ini, zona) in enumerate(cortes):
        fim = cortes[i + 1][0] if i + 1 < len(cortes) else len(html)
        bloco = html[ini:fim]
        for tabela in RE_TABELA.findall(bloco):
            sub = RE_SUBPREF.search(tabela)
            subprefeitura = limpar(sub.group(1)) if sub else ""
            for ph in RE_PONTO.findall(tabela):
                p = parse_ponto(ph, zona, subprefeitura)
                if p:
                    pontos.append(p)
    return pontos


def main() -> int:
    agora = datetime.now(TZ_SP)
    # Argumento opcional DD/MM/AAAA: o CGE aceita data histórica, e poder
    # reproduzir um dia de temporal é o único jeito de testar o caminho com
    # pontos fora da estação chuvosa.
    # Argumento vazio conta como ausente: o workflow passa "" quando o campo
    # opcional de workflow_dispatch não é preenchido.
    data_br = (sys.argv[1] if len(sys.argv) > 1 else "") or agora.strftime("%d/%m/%Y")
    if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", data_br):
        print(f"Data inválida: {data_br} (esperado DD/MM/AAAA)", file=sys.stderr)
        return 2

    try:
        html = baixar(data_br)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"Falha ao acessar o CGE: {e}", file=sys.stderr)
        return 1

    pontos = parse(html)
    ativos = [p for p in pontos if p["ativo"]]

    dia, mes, ano = data_br.split("/")
    dados = {
        "data": f"{ano}-{mes}-{dia}",
        "pontos_total": len(pontos),
        "ativos": len(ativos),
        "ativos_intransitaveis": sum(1 for p in ativos if not p["transitavel"]),
        "intransitaveis_total": sum(1 for p in pontos if not p["transitavel"]),
        "pontos": pontos[:MAX_PONTOS],
        "fonte": "CGE / Prefeitura de São Paulo",
        "url": URL,
        "atualizado_em": agora.isoformat(),
    }

    print(
        f"{data_br}: {dados['pontos_total']} pontos registrados, "
        f"{dados['ativos']} ativos ({dados['ativos_intransitaveis']} intransitáveis)"
    )
    for p in pontos[:10]:
        estado = "ATIVO" if p["ativo"] else "encerrado"
        via = "intransitável" if not p["transitavel"] else "transitável"
        print(f"  [{estado}/{via}] {p['subprefeitura']}: {p['local']} ({p['inicio']} a {p['fim']})")

    if not ARQUIVO.exists():
        print(f"Arquivo {ARQUIVO} não existe. Rode scrape-openmeteo.py antes.", file=sys.stderr)
        return 1

    existente = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    existente["alagamentos"] = dados
    existente["atualizado_em"] = datetime.now(timezone.utc).astimezone().isoformat()
    ARQUIVO.write_text(
        json.dumps(existente, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
