# Como contribuir

Obrigado pelo interesse no ClimaBR.app. Contribuições são bem-vindas,
especialmente correções de dados e novas fontes públicas.

## Antes de abrir um PR

Abra uma issue primeiro quando a mudança for grande, mudar a arquitetura ou
adicionar uma fonte de dados nova. Para correção de bug pequena, typo ou ajuste
de texto, pode ir direto no pull request.

## Ambiente

Requisitos: Node 22 e Python 3.12.

```sh
npm install
npm run dev            # site em localhost:4321
npm run check          # typecheck (astro check)
npm run build          # build completo, gera ./dist
```

Os scrapers rodam isolados e escrevem em `data/`:

```sh
python3 scripts/scrape-alertas.py          # avisos do INMET
python3 scripts/scrape-openmeteo.py sp     # aceita filtro por UF
```

## Antes de enviar

- `npm run check` e `npm run build` precisam passar. A CI roda os dois em todo
  pull request, além do `ruff check scripts/`.
- Não inclua no PR arquivos de `data/` gerados por execução local dos scrapers.
  Esses dados são atualizados pelos workflows agendados, e incluí-los gera
  conflito. A exceção é quando a mudança é justamente sobre o formato do dado.
- Um commit por mudança lógica, com mensagem no imperativo e em português.

## Adicionando uma fonte de dados

Toda fonte precisa ser **pública, oficial e estável**. Ao propor uma:

1. Descreva a fonte na issue: órgão responsável, URL, formato, frequência de
   atualização e política de uso.
2. Prefira API oficial ou dados abertos a raspagem de HTML. Quando só houver
   HTML, isole a extração para que uma mudança de layout não derrube o resto.
3. Respeite o serviço de origem: use `User-Agent` identificando o projeto,
   aplique intervalo entre requisições e limite o tempo total da coleta, como
   fazem os scrapers existentes.
4. Registre a atribuição da fonte no dado gerado (campo `fonte`), no bloco que
   exibe a informação e na seção de fontes do README.

## Estilo

- Interface e mensagens de commit em português do Brasil, com acentuação
  correta.
- Código em TypeScript no site (modo estrito) e Python na coleta.
- Nos componentes Astro, use os tokens de cor de status (`status-bom`,
  `status-moderado`, `status-ruim`, `status-pessimo`, `status-critico`) em vez
  de cores fixas: eles já respondem ao tema claro e escuro.
- Comentário serve para explicar restrição ou decisão não óbvia, não para
  narrar o que a linha faz.

## Licença

Ao contribuir, você concorda em licenciar o código sob **AGPL-3.0** e os dados
sob **CC-BY-4.0**, como descrito no README.
