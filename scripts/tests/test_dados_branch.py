"""Testes dos scripts do branch `dados` (restaurar/publicar) com um remoto local."""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).parent.parent
ENV = {**os.environ, "DADOS_MINIMO_ARQUIVOS": "3", "GIT_CONFIG_GLOBAL": os.devnull}


def git(cwd: Path, *args: str) -> str:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=ENV, check=True)
    return r.stdout.strip()


def sh(cwd: Path, script: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["sh", str(SCRIPTS / script), *args], cwd=cwd, capture_output=True, text=True, env=ENV
    )


def novo_checkout(base: Path, remoto: Path, nome: str) -> Path:
    pasta = base / nome
    pasta.mkdir()
    git(pasta, "init", "-q")
    git(pasta, "remote", "add", "origin", str(remoto))
    return pasta


def escrever_dados(pasta: Path, versao: str, cidades: int = 4) -> None:
    for i in range(cidades):
        arq = pasta / "data" / "cidades" / "sp" / f"c{i}.json"
        arq.parent.mkdir(parents=True, exist_ok=True)
        arq.write_text(f'{{"temp": "{versao}"}}', encoding="utf-8")
    (pasta / "data" / "alertas").mkdir(parents=True, exist_ok=True)
    (pasta / "data" / "alertas" / "sp.json").write_text("[]", encoding="utf-8")
    (pasta / "data" / "bandeira.json").write_text('{"bandeira": "Verde"}', encoding="utf-8")


@pytest.fixture
def ambiente(tmp_path: Path):
    remoto = tmp_path / "remoto.git"
    git(tmp_path, "init", "-q", "--bare", str(remoto))
    return tmp_path, remoto


def commits_do_branch(remoto: Path) -> list[str]:
    return git(remoto, "rev-list", "dados").split()


def test_publica_um_commit_sem_historico_e_ignora_o_resto_do_checkout(ambiente):
    base, remoto = ambiente
    w = novo_checkout(base, remoto, "w")
    escrever_dados(w, "v1")
    (w / "codigo.txt").write_text("fora de data/", encoding="utf-8")

    r = sh(w, "dados-publicar.sh", "dados: v1")
    assert r.returncode == 0, r.stderr
    assert len(commits_do_branch(remoto)) == 1
    arquivos = git(remoto, "ls-tree", "-r", "--name-only", "dados").split("\n")
    assert "data/cidades/sp/c0.json" in arquivos and "data/bandeira.json" in arquivos
    assert "codigo.txt" not in arquivos


def test_segunda_publicacao_descarta_o_historico(ambiente):
    base, remoto = ambiente
    w = novo_checkout(base, remoto, "w")
    escrever_dados(w, "v1")
    assert sh(w, "dados-publicar.sh", "dados: v1").returncode == 0

    escrever_dados(w, "v2")
    git(w, "fetch", "-q", "origin", "+refs/heads/dados:refs/remotes/origin/dados")
    assert sh(w, "dados-publicar.sh", "dados: v2").returncode == 0
    assert len(commits_do_branch(remoto)) == 1
    assert '"v2"' in git(remoto, "show", "dados:data/cidades/sp/c0.json")


def test_sem_mudanca_nao_publica(ambiente):
    base, remoto = ambiente
    w = novo_checkout(base, remoto, "w")
    escrever_dados(w, "v1")
    assert sh(w, "dados-publicar.sh", "dados: v1").returncode == 0
    antes = git(remoto, "rev-parse", "dados")

    r = sh(w, "dados-restaurar.sh")  # traz a ref de rastreio
    assert r.returncode == 0, r.stderr
    r = sh(w, "dados-publicar.sh", "dados: igual")
    assert r.returncode == 0 and "Sem mudanças" in r.stdout
    assert git(remoto, "rev-parse", "dados") == antes


def test_recusa_snapshot_parcial(ambiente):
    base, remoto = ambiente
    w = novo_checkout(base, remoto, "w")
    escrever_dados(w, "v1")
    assert sh(w, "dados-publicar.sh", "dados: v1").returncode == 0
    antes = git(remoto, "rev-parse", "dados")

    parcial = novo_checkout(base, remoto, "parcial")
    escrever_dados(parcial, "so-uma", cidades=1)
    r = sh(parcial, "dados-publicar.sh", "dados: parcial")
    assert r.returncode != 0 and "snapshot parcial" in r.stderr
    assert git(remoto, "rev-parse", "dados") == antes


def test_restaurar_traz_os_dados_num_checkout_novo(ambiente):
    base, remoto = ambiente
    w = novo_checkout(base, remoto, "w")
    escrever_dados(w, "v1")
    assert sh(w, "dados-publicar.sh", "dados: v1").returncode == 0

    outro = novo_checkout(base, remoto, "outro")
    r = sh(outro, "dados-restaurar.sh")
    assert r.returncode == 0, r.stderr
    assert (outro / "data" / "cidades" / "sp" / "c3.json").read_text(encoding="utf-8") == '{"temp": "v1"}'
    assert (outro / "data" / "bandeira.json").exists()


def test_push_falha_se_o_branch_mudou_depois_da_restauracao(ambiente):
    base, remoto = ambiente
    a = novo_checkout(base, remoto, "a")
    escrever_dados(a, "v1")
    assert sh(a, "dados-publicar.sh", "dados: v1").returncode == 0

    # a restaura; enquanto a coleta de a roda, b publica por fora da fila
    b = novo_checkout(base, remoto, "b")
    assert sh(b, "dados-restaurar.sh").returncode == 0
    assert sh(a, "dados-restaurar.sh").returncode == 0
    escrever_dados(b, "de-b")
    assert sh(b, "dados-publicar.sh", "dados: b").returncode == 0
    publicado_por_b = git(remoto, "rev-parse", "dados")

    escrever_dados(a, "de-a")
    r = sh(a, "dados-publicar.sh", "dados: a")
    assert r.returncode != 0
    assert git(remoto, "rev-parse", "dados") == publicado_por_b
