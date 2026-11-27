/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Worker — climabr.app
 *
 * Formatos suportados:
 *   curl climabr.app/sp/cotia            → terminal rico (ANSI + Unicode)
 *   curl climabr.app/sp/cotia?format=1   → one-liner (tmux/i3/polybar/zsh)
 *   curl climabr.app/sp/cotia?format=2   → compacto sem ANSI
 *   curl climabr.app/sp/cotia?format=j1  → JSON completo
 *   curl climabr.app/sp/cotia?format=prometheus → métricas Prometheus
 *   curl climabr.app/sp/cotia.svg        → card SVG (compartilhável)
 *   curl climabr.app/sp/cotia.png        → card PNG (og:image, preview social)
 *   curl climabr.app                     → geolocaliza pelo IP e redireciona
 *   ?T                                   → desativa cores ANSI
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore — o wrangler empacota o .wasm como WebAssembly.Module
import resvgWasm from './resvg.wasm';
// @ts-ignore — o wrangler empacota o .ttf como ArrayBuffer (rule type = Data)
import cardFontTtf from './card-font.ttf';
import { extrairPathInfo, formatarSvg, formatarOneLiner, formatarMarkdown, formatarPrometheus, formatarTerminal, type Dados } from './formatos';
import { WMO_DESCRICAO } from '../src/lib/wmo';

// Fonte (subset Inter Medium) para o resvg renderizar texto no PNG.
// Sem fonte carregada o resvg não desenha texto algum (só as formas).
const CARD_FONT = new Uint8Array(cardFontTtf as ArrayBuffer);

// ---------------------------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------------------------

interface Env {
  SITE_URL?: string;
}

// Inicializa o wasm do resvg uma única vez por instância do Worker
let wasmInit: Promise<unknown> | null = null;
function initResvg(): Promise<unknown> {
  if (!wasmInit) wasmInit = initWasm(resvgWasm as WebAssembly.Module);
  return wasmInit;
}

async function svgParaPng(svg: string): Promise<Uint8Array> {
  await initResvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontBuffers: [CARD_FONT],
      loadSystemFonts: false,
      defaultFontFamily: 'Inter Medium',
      sansSerifFamily: 'Inter Medium',
      monospaceFamily: 'Inter Medium',
    },
  });
  return resvg.render().asPng();
}


const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Mapeamento cidade Cloudflare CF → slug/uf para geolocalização por IP
// CF usa nomes em inglês (ou português para cidades brasileiras)
const CF_CIDADE_MAP: Record<string, { uf: string; slug: string }> = {
  'São Paulo':          { uf: 'sp', slug: 'sao-paulo' },
  'Sao Paulo':          { uf: 'sp', slug: 'sao-paulo' },
  'Rio de Janeiro':     { uf: 'rj', slug: 'rio-de-janeiro' },
  'Belo Horizonte':     { uf: 'mg', slug: 'belo-horizonte' },
  'Brasília':           { uf: 'df', slug: 'brasilia' },
  'Brasilia':           { uf: 'df', slug: 'brasilia' },
  'Salvador':           { uf: 'ba', slug: 'salvador' },
  'Fortaleza':          { uf: 'ce', slug: 'fortaleza' },
  'Curitiba':           { uf: 'pr', slug: 'curitiba' },
  'Manaus':             { uf: 'am', slug: 'manaus' },
  'Recife':             { uf: 'pe', slug: 'recife' },
  'Porto Alegre':       { uf: 'rs', slug: 'porto-alegre' },
  'Belém':              { uf: 'pa', slug: 'belem' },
  'Belem':              { uf: 'pa', slug: 'belem' },
  'Goiânia':            { uf: 'go', slug: 'goiania' },
  'Goiania':            { uf: 'go', slug: 'goiania' },
  'Guarulhos':          { uf: 'sp', slug: 'guarulhos' },
  'Campinas':           { uf: 'sp', slug: 'campinas' },
  'São Luís':           { uf: 'ma', slug: 'sao-luis' },
  'Maceió':             { uf: 'al', slug: 'maceio' },
  'Natal':              { uf: 'rn', slug: 'natal' },
  'Teresina':           { uf: 'pi', slug: 'teresina' },
  'Campo Grande':       { uf: 'ms', slug: 'campo-grande' },
  'João Pessoa':        { uf: 'pb', slug: 'joao-pessoa' },
  'Aracaju':            { uf: 'se', slug: 'aracaju' },
  'Cuiabá':             { uf: 'mt', slug: 'cuiaba' },
  'Porto Velho':        { uf: 'ro', slug: 'porto-velho' },
  'Macapá':             { uf: 'ap', slug: 'macapa' },
  'Rio Branco':         { uf: 'ac', slug: 'rio-branco' },
  'Boa Vista':          { uf: 'rr', slug: 'boa-vista' },
  'Palmas':             { uf: 'to', slug: 'palmas' },
  'Florianópolis':      { uf: 'sc', slug: 'florianopolis' },
  'Vitória':            { uf: 'es', slug: 'vitoria' },
};


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCurl(ua: string): boolean {
  return /^(curl|wget|HTTPie|httpie|http\/)/i.test(ua);
}


function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function buscarDados(siteUrl: string, estado: string, cidade: string): Promise<Dados | null> {
  try {
    const res = await fetch(`${siteUrl}/api/${estado}/${cidade}.json`, {
      headers: { 'Cache-Control': 'max-age=1800' },
    });
    if (!res.ok) return null;
    return await res.json() as Dados;
  } catch {
    return null;
  }
}

// Hidrata o tempo atual e a previsão ao vivo do Open-Meteo (como o cliente faz no
// HTML). O JSON estático só atualiza na coleta diária; isto deixa o card em dia.
// AQI/UV/dengue/reservatório seguem do JSON (não são "ao vivo" em fonte nenhuma).
async function hidratarTempo(dados: Dados, siteUrl: string, ctx: ExecutionContext): Promise<void> {
  // A hidratação sobrescreve atualizado_em com a hora atual: a coleta original fica aqui
  dados.coleta_em = dados.atualizado_em ?? null;
  const lat = Number(dados.latitude);
  const lon = Number(dados.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,weather_code`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum`
    + `&timezone=America%2FSao_Paulo&forecast_days=7`;

  // Cache da resposta do Open-Meteo (chave na zona do Worker; TTL curto)
  const cache = caches.default;
  const cacheKey = new Request(`${siteUrl}/__om/${lat},${lon}`);
  let om: any = null;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      om = await hit.json();
    } else {
      const res = await fetch(url);
      if (!res.ok) return;
      om = await res.json();
      const toCache = new Response(JSON.stringify(om), { headers: { 'Cache-Control': 'public, max-age=900' } });
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }
  } catch {
    return; // mantém o snapshot do JSON em caso de falha
  }
  if (!om) return;

  const arred = (n: number) => Math.round(n * 10) / 10;
  if (typeof om.current?.temperature_2m === 'number') {
    dados.temperatura_atual = arred(om.current.temperature_2m);
  }
  const d = om.daily;
  if (d && Array.isArray(d.time) && d.time.length) {
    dados.previsao = d.time.slice(0, 7).map((t: string, i: number) => ({
      data: t,
      min: arred(d.temperature_2m_min[i]),
      max: arred(d.temperature_2m_max[i]),
      chuva_mm: arred(d.precipitation_sum?.[i] ?? 0),
      condicao: WMO_DESCRICAO[d.weather_code[i]] ?? `Código ${d.weather_code[i]}`,
      condicao_codigo: d.weather_code[i],
    }));
  }
  // o tempo agora é ao vivo: marca o horário da atualização
  dados.atualizado_em = new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Formato 1 — one-liner (para tmux/i3/polybar/prompt)
// ---------------------------------------------------------------------------

// Avisos INMET ativos do município. A UF vem da API estática (geocódigos por município) e
// fica no cache do edge, como a previsão do Open-Meteo, para não repetir a leitura a cada curl
async function buscarAvisos(dados: Dados, siteUrl: string, ctx: ExecutionContext): Promise<void> {
  const ibge = Number(dados.codigo_ibge);
  const uf = String(dados.estado ?? '').toLowerCase();
  if (!Number.isFinite(ibge) || !uf) return;

  const cache = caches.default;
  const cacheKey = new Request(`${siteUrl}/__avisos/${uf}`);
  let todos: Dados[] = [];
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      todos = (await hit.json() as { alertas: Dados[] }).alertas;
    } else {
      const res = await fetch(`${siteUrl}/api/${uf}/alertas.json`);
      if (!res.ok) return;
      const json = await res.json() as { alertas: Dados[] };
      todos = json.alertas;
      const toCache = new Response(JSON.stringify(json), { headers: { 'Cache-Control': 'public, max-age=900' } });
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }
  } catch {
    return; // sem aviso é melhor que derrubar a resposta do terminal
  }

  const agora = Date.now();
  dados.avisos = todos.filter((a) =>
    (a.geocodes as number[] | undefined)?.includes(ibge) && (!a.fim || Date.parse(a.fim as string) > agora)
  );
}


// Campos que o filtro ?campos= nunca remove, para a resposta continuar identificada
const CAMPOS_FIXOS = new Set(['cidade', 'estado', 'slug', 'atualizado_em', 'codigo_ibge']);





// ---------------------------------------------------------------------------
// Geolocalização por IP (raiz "/" sem parâmetros)
// ---------------------------------------------------------------------------

function geolocalizarCidade(cf: IncomingRequestCfProperties | undefined): { uf: string; slug: string } | null {
  if (!cf) return null;
  const country = (cf as Record<string, unknown>).country as string | undefined;
  if (country !== 'BR') return null;
  const city = (cf as Record<string, unknown>).city as string | undefined;
  const region = (cf as Record<string, unknown>).region as string | undefined;
  if (city) {
    const match = CF_CIDADE_MAP[city];
    if (match) return match;
  }
  // Fallback por estado (região)
  const ufMap: Record<string, string> = {
    'São Paulo': 'sp', 'Rio de Janeiro': 'rj', 'Minas Gerais': 'mg',
    'Bahia': 'ba', 'Paraná': 'pr', 'Rio Grande do Sul': 'rs',
    'Ceará': 'ce', 'Pernambuco': 'pe', 'Amazonas': 'am',
    'Pará': 'pa', 'Santa Catarina': 'sc', 'Goiás': 'go',
    'Distrito Federal': 'df',
  };
  if (region && ufMap[region]) {
    const uf = ufMap[region];
    if (city) {
      const slug = slugify(city);
      return { uf, slug };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------


// Escolhe a resposta pelo valor de ?format=; compartilhado entre a raiz
// geolocalizada e a rota de cidade
function responderFormato(dados: Dados, format: string, cor: boolean, secoes: string | null): Response {
  if (format === 'prometheus') {
    return new Response(formatarPrometheus(dados), {
      headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'public, max-age=900', ...SECURITY_HEADERS },
    });
  }
  if (format === '1') {
    return new Response(formatarOneLiner(dados, cor) + '\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS },
    });
  }
  if (format === 'md') {
    const filtro = secoes ? new Set(secoes.split(',').map((s) => s.trim())) : null;
    return new Response(formatarMarkdown(dados, filtro), {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS },
    });
  }
  if (format === 'j1' || format === 'json') {
    return new Response(JSON.stringify(dados, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS },
    });
  }
  // Formato padrão (2 = sem ANSI, default = com ANSI)
  return new Response(formatarTerminal(dados, cor && format !== '2'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const siteUrl = env.SITE_URL ?? 'https://climabr.app';
    const ua = request.headers.get('User-Agent') ?? '';
    const curl = isCurl(ua);
    const format = url.searchParams.get('format') ?? '';
    const noColor = url.searchParams.has('T') || url.searchParams.has('no-color');

    // HTTP puro: o "Always Use HTTPS" do edge fica desligado e este handler
    // decide — curl recebe o painel sem TLS, navegador e crawlers vão para https.
    if (url.protocol === 'http:' && !curl && !format) {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }

    // Raiz "/" sem cidade: geolocaliza pelo IP. Sem match (ou com ?format),
    // responde inline em vez de 302, que o curl não segue sem -L.
    if (url.pathname === '/' && (curl || format)) {
      const cf = (request as unknown as { cf?: IncomingRequestCfProperties }).cf;
      const loc = geolocalizarCidade(cf) ?? { uf: 'sp', slug: 'sao-paulo' };
      const dados = await buscarDados(siteUrl, loc.uf, loc.slug);
      if (dados && !dados._status) {
        await hidratarTempo(dados, siteUrl, ctx);
        await buscarAvisos(dados, siteUrl, ctx);
        return responderFormato(dados, format, !noColor && curl, url.searchParams.get('secoes'));
      }
    }

    const info = extrairPathInfo(url.pathname);

    // Rota de cidade com formato especial
    if (info) {
      const { estado, cidade, ext } = info;

      // Imagem (SVG ou PNG) — qualquer user-agent
      const querPng = ext === '.png' || format === 'png';
      const querSvg = ext === '.svg' || format === 'svg';
      if (querPng || querSvg) {
        // Cache no edge: SVG/PNG não dependem do user-agent e o PNG (resvg)
        // é o ponto mais caro de CPU. Evita recomputar em hits repetidos.
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;

        const dados = await buscarDados(siteUrl, estado, cidade);
        if (dados && !dados._status) {
          await hidratarTempo(dados, siteUrl, ctx);

          if (querPng) {
            // PNG real para og:image (Twitter/X, Facebook, WhatsApp exigem raster).
            // Variante com ícones vetoriais (resvg não renderiza emoji) + fonte embutida.
            try {
              const png = await svgParaPng(formatarSvg(dados, true));
              const resp = new Response(png, {
                headers: {
                  'Content-Type': 'image/png',
                  'Cache-Control': 'public, max-age=1800',
                  'Access-Control-Allow-Origin': '*',
                  ...SECURITY_HEADERS,
                },
              });
              ctx.waitUntil(cache.put(request, resp.clone()));
              return resp;
            } catch {
              // Degradação graciosa: se o wasm falhar, devolve o SVG
            }
          }

          const svg = formatarSvg(dados);
          const resp = new Response(svg, {
            headers: {
              'Content-Type': 'image/svg+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=1800',
              'Access-Control-Allow-Origin': '*',
              ...SECURITY_HEADERS,
            },
          });
          ctx.waitUntil(cache.put(request, resp.clone()));
          return resp;
        }
      }

      // Formatos de texto (só para curl ou explícito)
      if (curl || format) {
        const dados = await buscarDados(siteUrl, estado, cidade);
        if (dados && !dados._status) {
          await hidratarTempo(dados, siteUrl, ctx);
          await buscarAvisos(dados, siteUrl, ctx);
          return responderFormato(dados, format, !noColor && curl, url.searchParams.get('secoes'));
        }
      }
    }

    // O JSON estático não lê query string: o filtro de campos é aplicado aqui
    const apiCidade = url.pathname.match(/^\/api\/[a-z]{2}\/[a-z0-9-]+\.json$/);
    const campos = url.searchParams.get('campos');
    if (apiCidade && campos) {
      const original = await fetch(request);
      if (original.ok) {
        const dados = (await original.json()) as Dados;
        const escolhidos = new Set(campos.split(',').map((c) => c.trim()));
        const filtrado = Object.fromEntries(
          Object.entries(dados).filter(([k]) => CAMPOS_FIXOS.has(k) || escolhidos.has(k))
        );
        return new Response(JSON.stringify(filtrado, null, 2), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS },
        });
      }
    }

    // Passa para Cloudflare Pages
    const response = await fetch(request);
    const novo = new Response(response.body, response);
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => novo.headers.set(k, v));
    return novo;
  },
} satisfies ExportedHandler<Env>;
