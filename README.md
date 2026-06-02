# ClimaBR.app

Painel ambiental brasileiro por município. Reúne dados públicos de previsão do tempo, qualidade do ar, índice UV, vento, reservatórios, queimadas, dengue e mais, para os 5.571 municípios do Brasil.

No ar em https://climabr.app

## Características

- **AI-first e acessível**: cada cidade tem página HTML, JSON em `/api/{uf}/{cidade}.json`, e arquivos de indexação (`llms.txt`, `.well-known/`).
- **Acesso via terminal**: `curl climabr.app/sp/sao-paulo` devolve um painel formatado. Também há saída SVG, PNG (og:image), Prometheus e geolocalização por IP.
- **Hidratação ao vivo**: a página chega com um snapshot do build (bom para SEO e no-JS) e, no browser, atualiza tempo atual e previsão direto do Open-Meteo.
- **Custo zero**: roda inteiramente no free tier (Cloudflare Pages + Workers, GitHub Actions).

## Stack

- Astro (SSG) + Tailwind CSS v4 + React + TypeScript
- Cloudflare Pages (site) + Workers (curl/SVG/PNG/Prometheus, rota `climabr.app/*`)
- Coleta de dados em Python via GitHub Actions (cron), gerando JSON em `data/cidades/{uf}/{slug}.json`

## Fontes de dados

Open-Meteo (previsão, UV, qualidade do ar, sol/lua, vento), SABESP e COPASA (reservatórios), InfoDengue/Fiocruz (dengue/zika/chikungunya), NASA FIRMS (queimadas), ONS (reservatórios de energia), CPTEC/INPE (fallback de previsão).

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

O deploy também acontece automaticamente: o workflow `deploy.yml` builda e publica a cada push na `main` e 2x/dia. A coleta de dados roda nos workflows `dados-diarios.yml`, `dados-ana.yml` e `dados-inmet.yml`.

Guia completo de infraestrutura e custos em `DEPLOY.md`. Planejamento e decisões técnicas em `climabr-app-planejamento.md`.
