#!/bin/sh
# Restaura as partes dinâmicas de data/ (cidades, alertas, bandeira) a partir do
# branch `dados`. Esses arquivos mudam a cada coleta; versionados na main eles
# somavam ~3 MB/dia de histórico. No branch `dados` o histórico é descartado a
# cada publicação (scripts/dados-publicar.sh), então a main fica só com código.
#
# Uso: sh scripts/dados-restaurar.sh   (na raiz do repositório ou em qualquer
# subpasta; sobrescreve data/cidades, data/alertas e data/bandeira.json)
set -eu

cd "$(git rev-parse --show-toplevel)"

# --depth=1: o branch tem um commit só, mas o remoto ainda guarda os antigos
git fetch --quiet --depth=1 origin '+refs/heads/dados:refs/remotes/origin/dados'
git archive refs/remotes/origin/dados | tar -x -f -

echo "Dados restaurados do branch dados ($(git rev-parse --short refs/remotes/origin/dados))."
