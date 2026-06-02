# Deploy — ClimaBR.app

> **Status: no ar em https://climabr.app (desde 2026-06).** Pages projeto
> `climabr-app`, Worker `climabr-worker` na rota `climabr.app/*`, domínio como
> custom domain do Pages, secrets configurados e deploy automático funcionando.
> R2 ativado na conta mas dormente (dados embutidos no build). Este guia descreve
> o passo a passo original e segue válido para refazer/entender a infra.

## Visão Geral da Arquitetura

```
GitHub (repositório + Actions)
  ├── Actions coletam dados (Python) → commit nos JSONs ou upload R2
  └── Actions fazem build Astro → deploy no Cloudflare Pages

Cloudflare (tudo no free tier)
  ├── Pages    → site estático (HTML/CSS/JS gerado pelo Astro)
  ├── R2       → JSONs de dados (atualizam sem rebuild do site)
  └── Workers  → curl detection, formatos (SVG/Prometheus), geolocalização
```

**Custo total: R$ 0** dentro dos limites do free tier (detalhados no fim).

---

## Configuração atual na Cloudflare (free tier)

Estado dos recursos habilitados na conta `Eslih` (Account ID `792641d0336168a822d3127305c9b683`).

**Rede / performance (habilitados):**
- HTTP/3 (QUIC), 0-RTT, Early Hints, Speed Brain, Brotli
- Tiered Cache, Crawler Hints, Always Online
- Cloudflare Fonts (sem efeito prático: fontes são self-hosted via `@fontsource`)

**TLS / DNS (habilitados):**
- SSL/TLS Full (strict), Always Use HTTPS, TLS mínimo definido, HSTS
- DNSSEC (DS publicado automaticamente por estar no Cloudflare Registrar)

**Segurança (habilitados):**
- WAF Free Managed Ruleset + DDoS (sempre ativo)
- Rate Limiting: 1 regra grátis, por IP, ~50 req/10s, ação Block curto
- Page Shield: Script Monitoring (free, só inventário; detecção maliciosa é Enterprise).
  Baseline esperada de script externo: apenas `static.cloudflareinsights.com/beacon.min.js`.

**Redirect (Page Rule):**
- `www.climabr.app/*` → `https://climabr.app/$1` (301), com DNS `www` proxied.
  O Worker roda só no apex, então o redirect www vive na Page Rule, não no Worker.

**Analytics:**
- Web Analytics (RUM). A injeção automática NÃO é confiável atrás do Worker, então o
  beacon é injetado **manualmente** no `src/layouts/PainelLayout.astro` com o token do site.

**Cache no Worker:**
- `caches.default` cacheia as respostas `.svg`/`.png` (UA-independentes; o PNG via resvg
  é o ponto caro de CPU). Confirma com `cf-cache-status: HIT`.

**Desativado de propósito:**
- Hotlink Protection: quebraria os cards `.png`/`.svg` compartilháveis (og:image). E não há
  ganho de custo, pois bandwidth é grátis e o PNG é cacheado no edge.
- gRPC: não há backend gRPC no projeto.
- Bot Fight Mode: bloquearia `curl`/`wget`, que é a interface diferencial do projeto.
- R2: ativado mas dormente (dados embutidos no build).
- Recursos pagos: Priorização HTTP/2, Argo, Load Balancing, Health Checks standalone,
  Images, Stream, Logpush, detecção maliciosa do Page Shield.

### CSP — allowlist e motivo

A CSP fica em `public/_headers`. Cada origem externa liberada tem um motivo; ao adicionar
uma feature que carregue script ou faça fetch externo, atualize a CSP ou ela quebra silenciosamente:
- `script-src ... https://static.cloudflareinsights.com` — beacon do Web Analytics
- `connect-src ... https://api.open-meteo.com` — hidratação client-side (tempo/previsão ao vivo)
- `connect-src ... https://cloudflareinsights.com` — envio de dados do beacon
- `connect-src ... https://*.r2.dev` — reservado para uso futuro do R2

---

## Parte 1 — GitHub

### 1.1 Repositório (já feito)

```bash
# Repositório já existe:
git@github.com:Esl1h/climabr.app.git

# Clonar
git clone git@github.com:Esl1h/climabr.app.git
cd climabr.app
npm install
```

### 1.2 Secrets do GitHub Actions

Em **Settings → Secrets and variables → Actions → New repository secret**, criar:

| Secret | Onde obter |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (ver 2.3) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → canto direito, ou na URL |

Sem esses secrets, os workflows ainda rodam: os scrapers fazem `git commit`
dos JSONs como fallback (sem subir para o R2). O site só não faz deploy automático.

### 1.3 Workflows já configurados

Em `.github/workflows/`:

| Arquivo | Cron | O que faz |
|---|---|---|
| `dados-inmet.yml` | a cada 3h | Previsão CPTEC (fallback) |
| `dados-ana.yml` | a cada 6h | Reservatórios ONS + queimadas NASA FIRMS |
| `dados-diarios.yml` | 08h diário | Open-Meteo (previsão/UV/ar/sol/lua/vento), SABESP, COPASA, dengue |
| `deploy.yml` | 09h + 21h + push na main | Build Astro + deploy Cloudflare Pages |

Para coletar ondas/surf, adicionar ao `dados-ana.yml` (ou criar workflow):
```yaml
- name: Ondas/surf (cidades costeiras)
  run: python3 scripts/scrape-ondas.py
```

### 1.4 Disparar manualmente

Na aba **Actions**, escolher o workflow → **Run workflow**. Útil para o primeiro deploy.

---

## Parte 2 — Cloudflare

Criar conta grátis em https://dash.cloudflare.com/sign-up

### 2.1 Instalar o Wrangler (CLI da Cloudflare)

```bash
npm install -g wrangler
wrangler login          # abre o browser para autenticar
```

### 2.2 Cloudflare Pages (site estático)

**Opção A — via dashboard (mais simples):**

1. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Autorizar o GitHub e escolher o repositório `climabr.app`
3. Configurar o build:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** `22` (variável de ambiente `NODE_VERSION=22`)
4. **Save and Deploy**

A partir daí, todo push na `main` dispara um deploy automático.

**Opção B — via CLI:**

```bash
npm run build
wrangler pages deploy dist/ --project-name=climabr-app --branch=main
```

### 2.3 Criar o API Token (para o GitHub Actions)

Dashboard → **My Profile → API Tokens → Create Token → Custom token**:

Permissões necessárias:
```
Account → Cloudflare Pages       → Edit
Account → Workers R2 Storage      → Edit
Account → Workers Scripts         → Edit
Zone    → Workers Routes          → Edit   (se usar domínio próprio)
```

Copiar o token gerado para o secret `CLOUDFLARE_API_TOKEN` no GitHub.

### 2.4 Domínio personalizado (climabr.app)

1. Registrar o domínio (ex: Registro.br para `.app.br`, ou Cloudflare Registrar)
2. Dashboard → adicionar o site → apontar os nameservers para a Cloudflare
3. Em **Pages → climabr-app → Custom domains → Set up a custom domain**
4. Adicionar `climabr.app` — a Cloudflare cria o DNS e o SSL automaticamente

> O domínio `.app` exige HTTPS (HSTS preload) — a Cloudflare resolve isso sozinha.

---

## Parte 3 — R2 (armazenamento dos dados)

O R2 guarda os JSONs de dados. Vantagem: os dados atualizam **sem rebuild** do site
(o frontend lê do R2 via fetch ou o Worker serve direto).

### 3.1 Criar o bucket

```bash
wrangler r2 bucket create climabr-dados
```

### 3.2 Subir os dados

```bash
# Upload de toda a pasta de dados
wrangler r2 object put climabr-dados --recursive --local-path=data/cidades/

# Ou um arquivo específico
wrangler r2 object put climabr-dados/sp/cotia.json --file=data/cidades/sp/cotia.json
```

Os workflows de coleta já têm esse passo (com `continue-on-error` enquanto não há secrets).

### 3.3 Expor o R2 publicamente (2 opções)

**Opção A — domínio público do R2:**
Dashboard → R2 → bucket → Settings → **Public access** → habilitar.
Gera uma URL `https://pub-xxxxx.r2.dev/...`

**Opção B — bind no Worker (recomendado):**
No `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "DADOS"
bucket_name = "climabr-dados"
```
O Worker acessa via `env.DADOS.get('sp/cotia.json')` — sem expor o bucket.

### 3.4 Estratégia atual vs. ideal

- **Atual (MVP):** JSONs ficam no git e o Astro os lê no build. Simples, funciona,
  mas cada atualização de dado precisa de rebuild.
- **Ideal (escala):** JSONs no R2; o site faz fetch client-side ou o Worker serve.
  Dados atualizam a cada hora sem gastar builds. Migrar quando o volume justificar.

---

## Parte 4 — Worker (curl, SVG, PNG, Prometheus, geolocalização)

O Worker em `worker/index.ts` intercepta requisições de terminal e gera formatos
especiais. Já está configurado no `wrangler.toml`. Inclui `worker/resvg.wasm`
(~2.4 MB / 0.9 MB gzip) que converte o card SVG em PNG para og:image.

### 4.1 Deploy do Worker

```bash
wrangler deploy            # usa main = worker/index.ts do wrangler.toml
# Validar sem publicar:
wrangler deploy --dry-run --outdir=/tmp/worker-build
```

### 4.2 Rota do Worker

No `wrangler.toml`, a rota `climabr.app/*` faz o Worker processar todas as
requisições do domínio. Ele decide: curl → texto, `.png`/`.svg` → imagem,
browser → repassa ao Pages.

### 4.3 Dev local do Worker

Como o Worker importa `.wasm`, usar `wrangler dev` (que empacota wasm nativamente).
O esbuild manual + `pages dev` **não** lida com o wasm.

```bash
# Terminal 1 — Astro (serve HTML e JSONs)
npm run dev                                          # :4321

# Terminal 2 — Worker (lê os JSONs do Astro)
npx wrangler dev --port 8788 --var SITE_URL:http://localhost:4321
```

Testar:
```bash
curl localhost:8788/sp/cotia                 # terminal ANSI
curl localhost:8788/sp/cotia.png -o card.png # og:image PNG (via resvg-wasm)
curl localhost:8788/sp/cotia.svg             # card SVG
```

`.dev.vars` já tem `SITE_URL=http://localhost:4321`.

---

## Parte 5 — Limites do Free Tier (o que cabe de graça)

| Serviço | Limite grátis | Uso do ClimaBR |
|---|---|---|
| **Cloudflare Pages** | 500 builds/mês | ~300/mês (2 deploys/dia + pushes) ✅ |
| **Pages bandwidth** | ilimitado | ✅ sem custo de tráfego |
| **R2 armazenamento** | 10 GB/mês | JSONs somam ~50 MB ✅ |
| **R2 operações** | 1M escritas + 10M leituras/mês | ✅ folgado |
| **R2 egress** | **grátis** (sem custo de saída) | ✅ diferencial vs. S3 |
| **Workers** | 100.000 req/dia | ✅ suficiente no início |
| **GitHub Actions** | 2.000 min/mês (repo privado) | público = **ilimitado** ✅ |
| **Open-Meteo** | grátis, sem chave (uso não-comercial) | ✅ — respeitar rate limit |
| **NASA FIRMS** | grátis, CSV público | ✅ |
| **InfoDengue** | grátis, API pública | ✅ |

**Conclusão:** o projeto roda 100% grátis enquanto o repositório for público e o
tráfego estiver dentro dos limites do Pages/Workers.

### Dicas para não estourar limites

- Manter o repositório **público** → GitHub Actions ilimitado
- Não fazer build a cada commit de dados — usar `paths-ignore: data/**` no deploy
- Cache agressivo no Worker (`Cache-Control: max-age=1800`)
- Coletar dados em lotes com delay (já configurado nos scrapers)

---

## Parte 6 — Alternativas Gratuitas (caso saia da Cloudflare)

| Necessidade | Cloudflare | Alternativas grátis |
|---|---|---|
| **Hospedar site estático** | Pages | GitHub Pages, Netlify, Vercel, Render |
| **Funções/edge (Worker)** | Workers | Netlify Functions, Vercel Edge, Deno Deploy |
| **Armazenar JSONs** | R2 | GitHub raw, jsDelivr (CDN do GitHub), Supabase Storage |
| **Cron de coleta** | — | GitHub Actions (já usado), cron-job.org |
| **DNS** | Cloudflare DNS | desec.io, dns.he.net |

### Cenário "só GitHub" (zero Cloudflare)

Funciona para o site estático puro, mas **perde o Worker** (curl/SVG/Prometheus):

```bash
# Habilitar GitHub Pages
# Settings → Pages → Source: GitHub Actions
```

Adicionar workflow de deploy para Pages:
```yaml
- uses: actions/upload-pages-artifact@v3
  with: { path: dist }
- uses: actions/deploy-pages@v4
```

Os JSONs podem ser servidos via **jsDelivr** (CDN grátis do GitHub):
```
https://cdn.jsdelivr.net/gh/Esl1h/climabr.app/data/cidades/sp/cotia.json
```

> Recomendação: manter Cloudflare. O free tier é generoso e o Worker é o que
> diferencia o projeto (curl, SVG, geolocalização). GitHub Pages é o plano B.

---

## Parte 7 — Versão Futura: Login + APIs Privadas + Tempo Real

> Planejamento para quando o projeto evoluir além do estático gratuito.

### 7.1 O que muda

A versão atual é **estática + dados públicos**. A versão premium teria:

- **Login de usuários** (contas, cidades favoritas, alertas personalizados)
- **APIs privadas pagas** com dados mais granulares (radar meteorológico,
  qualidade do ar por estação em tempo real, previsão hiperlocal)
- **Monitoramento em tempo real** (WebSocket/SSE para alertas push)
- **Notificações** (geada, IQAr crítico, dengue nível 3+, ressaca)

### 7.2 Stack sugerida (mantendo custo baixo)

| Recurso | Opção grátis/barata | Observação |
|---|---|---|
| **Auth** | Cloudflare Access, Supabase Auth, Clerk (free tier) | Supabase: 50k usuários grátis |
| **Banco de dados** | Cloudflare D1 (SQLite), Supabase Postgres, Turso | D1 free: 5 GB |
| **Tempo real** | Cloudflare Durable Objects, Supabase Realtime | DO para WebSocket no edge |
| **Filas/jobs** | Cloudflare Queues, Workers Cron | coleta de APIs privadas |
| **Cache quente** | Cloudflare KV, Workers Cache API | dados de tempo real com TTL curto |
| **Push** | Web Push API, OneSignal (free 10k) | notificações de alerta |
| **Pagamentos** | Stripe, Mercado Pago | assinatura premium |

### 7.3 Arquitetura proposta

```
Usuário logado
  ├── Cloudflare Access/Supabase → autenticação
  ├── D1/Supabase → preferências, cidades favoritas, histórico
  ├── Durable Object → conexão WebSocket por usuário (alertas em tempo real)
  └── Worker + Queue → consome APIs privadas (radar, estações) sob demanda

APIs privadas (pagas) candidatas:
  ├── Tomorrow.io / Weatherbit → previsão hiperlocal e radar
  ├── IQAir API → qualidade do ar por estação (10k req/mês grátis)
  ├── Windy API → radar de vento e ondas
  └── Estações meteorológicas privadas (PWS) → dados locais em tempo real
```

### 7.4 Modelo de monetização da versão premium

- **Free:** o que existe hoje (dados públicos, 1 cidade salva localmente)
- **Premium (assinatura):** múltiplas cidades, alertas push, radar em tempo real,
  histórico, sem anúncios, API key para uso programático
- **B2B:** dashboard para produtores rurais, gestores prediais, prefeituras
  (DEC/FEC de energia, monitoramento de bacias, alertas de defesa civil)

### 7.5 Princípio de design

Manter a **camada gratuita estática separada** da camada premium dinâmica:
- O site público continua estático no Pages (custo zero, SEO máximo)
- A área logada vive em rotas `/app/*` servidas por Workers + D1/Supabase
- APIs privadas nunca expõem chaves no client — sempre via Worker como proxy

Assim o núcleo gratuito nunca gera custo, e o premium escala sob demanda paga.

---

## Checklist de Primeiro Deploy

```
[x] npm install
[x] Gerar dados base: gerar-municipios.py, enriquecer-coords.py, gerar-mapa-cptec.py
[x] Primeira coleta: scrape-openmeteo.py + demais scrapers
[x] wrangler login
[x] wrangler pages project create climabr-app
[ ] wrangler r2 bucket create climabr-dados   (dormente: R2 não está em uso)
[x] Criar CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID
[x] Adicionar os 2 secrets no GitHub
[x] npm run build && wrangler pages deploy dist/ --project-name=climabr-app
[x] wrangler deploy worker/index.ts
[x] Configurar domínio climabr.app em Pages → Custom domains
[x] Testar: curl climabr.app/sp/sao-paulo
```
