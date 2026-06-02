# ClimaBR.app

Painel ambiental brasileiro por município: previsão do tempo, qualidade do ar, índice UV, vento, reservatórios, queimadas e dengue para os **5.571 municípios** do Brasil, a partir de dados públicos.

No ar em **https://climabr.app**

## Acesso pelo terminal

```sh
$ curl climabr.app/sp/sao-paulo

  São Paulo/SP  19.3°C  02/06/2026, 09:47
  ────────────────────────────────────────────────
  ⛅ Previsão   ☁️  Encoberto
               ↓11.6°  ↑19.3°  sem chuva
  💨 Ar         Boa (AQI 49)  PM2.5: 16.2µg/m³
  ☀️  UV         Moderado (5.5)
  🌊 Represa    52.6%  [██████████░░░░░░░░░░]  Cantareira
  🦟 Dengue     Alerta  3 casos/sem
  🔥 Queimadas  6 focos  raio 100km
```

## Formatos de acesso

Toda cidade responde em `/{uf}/{cidade}` com vários formatos:

- **Navegador**: página HTML completa, com hidratação ao vivo do tempo/previsão
- **`curl`**: painel formatado em ANSI (detecção por User-Agent)
- **`?format=1`**: uma linha (tmux/i3/polybar/prompt)
- **`?format=prometheus`**: métricas para scraping
- **`/api/{uf}/{cidade}.json`**: JSON cru
- **`.svg`** e **`.png`**: card compartilhável / og:image

## Características

- **AI-first e acessível**: HTML, JSON por cidade e arquivos de indexação (`llms.txt`, `.well-known/`)
- **Hidratação ao vivo**: o HTML chega com um snapshot do build (bom para SEO e no-JS) e, no navegador, atualiza tempo atual e previsão direto do Open-Meteo
- **Privacidade**: sem cookies, sem rastreio de terceiros
- **Custo zero**: roda inteiramente no free tier (Cloudflare Pages + Workers, GitHub Actions)

## Stack

- Astro (SSG) + Tailwind CSS v4 + React + TypeScript
- Cloudflare Pages (site) + Workers (curl/SVG/PNG/Prometheus, rota `climabr.app/*`)
- Coleta em Python via GitHub Actions (cron), gerando JSON em `data/cidades/{uf}/{slug}.json`

## Fontes de dados

Open-Meteo (previsão, UV, qualidade do ar, sol/lua, vento), SABESP e COPASA (reservatórios de abastecimento), InfoDengue/Fiocruz (dengue/zika/chikungunya), NASA FIRMS (queimadas), ONS (reservatórios de energia), CPTEC/INPE (fallback de previsão).

## Estrutura

```
data/cidades/{uf}/{slug}.json   # dados coletados por município
scripts/                        # scrapers Python (um por fonte)
src/                            # site Astro (páginas, layout, componentes)
worker/                         # Cloudflare Worker (curl/SVG/PNG/Prometheus)
.github/workflows/             # coleta de dados + deploy
```

## Desenvolvimento

```sh
npm install
npm run dev            # site em localhost:4321

# Worker (importa .wasm, usar wrangler dev):
npx wrangler dev --port 8788 --var SITE_URL:http://localhost:4321
```

## Build e deploy

```sh
npm run build                                          # gera ./dist
npx wrangler pages deploy dist/ --project-name=climabr-app --branch=main
npx wrangler deploy                                    # publica o Worker
```

O deploy também é automático: `deploy.yml` builda e publica a cada push na `main` e 2x/dia; a coleta roda em `dados-diarios.yml`, `dados-ana.yml` e `dados-inmet.yml`. Guia completo de infraestrutura e custos em [`DEPLOY.md`](DEPLOY.md).

## Licença

Código sob **AGPL-3.0** (veja [`LICENSE`](LICENSE)). Os dados ambientais são derivados de fontes públicas e redistribuídos sob **CC-BY-4.0**, com atribuição às respectivas fontes.
