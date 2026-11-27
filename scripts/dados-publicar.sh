#!/bin/sh
# Publica as partes dinâmicas de data/ no branch `dados` como UM commit sem
# histórico (force push). Rodar depois de scripts/dados-restaurar.sh e da coleta:
# o commit leva o snapshot inteiro, não só o que a coleta mexeu.
#
# Uso: sh scripts/dados-publicar.sh "dados: mensagem do commit"
#
# O force push usa lease: se o branch mudou desde a restauração (outra coleta
# fora da fila, alguém empurrando à mão), o push falha em vez de sobrescrever.
set -eu

msg=${1:?uso: dados-publicar.sh "mensagem do commit"}
# Abaixo disso a restauração falhou ou o checkout está incompleto: publicar um
# snapshot parcial apagaria dados de todas as outras cidades
minimo=${DADOS_MINIMO_ARQUIVOS:-5000}
ref=refs/remotes/origin/dados

cd "$(git rev-parse --show-toplevel)"

n=$(find data/cidades -name '*.json' | wc -l)
if [ "$n" -lt "$minimo" ]; then
  echo "ERRO: $n arquivos em data/cidades (mínimo $minimo); não publico um snapshot parcial." >&2
  exit 1
fi

# Índice temporário: o índice e o HEAD do checkout ficam como estão.
# -f porque esses caminhos são ignorados na main.
indice=$(mktemp -u)
trap 'rm -f "$indice"' EXIT
GIT_INDEX_FILE=$indice git add -f data/cidades data/alertas data/bandeira.json
arvore=$(GIT_INDEX_FILE=$indice git write-tree)

base=$(git rev-parse --verify --quiet "$ref" || true)
if [ -n "$base" ] && [ "$(git rev-parse "$ref^{tree}")" = "$arvore" ]; then
  echo "Sem mudanças nos dados; nada a publicar."
  exit 0
fi

commit=$(git -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit-tree "$arvore" -m "$msg")

# base vazia = o branch não existia na restauração: o lease exige que continue assim
git push --quiet --force-with-lease="dados:$base" origin "$commit:refs/heads/dados"
echo "Dados publicados no branch dados ($(git rev-parse --short "$commit"), $n cidades)."
