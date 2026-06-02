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
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return resvg.render().asPng();
}

type Dados = Record<string, unknown>;

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

// ANSI color codes
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  orange: '\x1b[38;5;208m',
  purple: '\x1b[35m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};

// Ícones Unicode para cada bloco
const ICONES = {
  previsao:  '⛅',
  ar:        '💨',
  uv:        '☀️ ',
  represa:   '🌊',
  dengue:    '🦟',
  queimadas: '🔥',
  sol:       '🌅',
  lua:       '🌙',
  tarifa:    '⚡',
  alerta:    '🚨',
};

// Emojis de condição do tempo
const TEMPO_EMOJI: Record<number, string> = {
  0: '☀️ ', 1: '🌤 ', 2: '⛅', 3: '☁️ ',
  45: '🌫 ', 48: '🌫 ',
  51: '🌦 ', 53: '🌦 ', 55: '🌧 ',
  61: '🌧 ', 63: '🌧 ', 65: '🌧 ',
  71: '❄️ ', 73: '❄️ ', 75: '❄️ ', 77: '🌨 ',
  80: '🌦 ', 81: '🌦 ', 82: '⛈ ',
  95: '⛈ ', 96: '⛈ ', 99: '⛈ ',
};

const LUA_EMOJI: Record<string, string> = {
  'Nova': '🌑', 'Crescente': '🌒', 'Quarto Crescente': '🌓',
  'Gibosa Crescente': '🌔', 'Cheia': '🌕', 'Gibosa Minguante': '🌖',
  'Quarto Minguante': '🌗', 'Minguante': '🌘',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCurl(ua: string): boolean {
  return /^(curl|wget|HTTPie|httpie|http\/)/i.test(ua);
}

function pad(s: string, n: number): string {
  // Pad sem contar escape codes ANSI
  const visible = s.replace(/\x1b\[[^m]*m/g, '');
  return s + ' '.repeat(Math.max(0, n - visible.length));
}

function rpad(s: string, n: number): string {
  const visible = s.replace(/\x1b\[[^m]*m/g, '');
  return ' '.repeat(Math.max(0, n - visible.length)) + s;
}

function corAqi(aqi: number, color: boolean): string {
  if (!color) return aqi <= 50 ? 'Boa' : aqi <= 100 ? 'Moderada' : aqi <= 150 ? 'Ruim p/ sensíveis' : aqi <= 200 ? 'Ruim' : 'Muito Ruim';
  const cor = aqi <= 50 ? A.green : aqi <= 100 ? A.yellow : aqi <= 150 ? A.orange : A.red;
  const cat = aqi <= 50 ? 'Boa' : aqi <= 100 ? 'Moderada' : aqi <= 150 ? 'Ruim p/ sensíveis' : aqi <= 200 ? 'Ruim' : 'Muito Ruim';
  return `${cor}${cat}${A.reset}`;
}

function corUv(uv: number, color: boolean): string {
  const cat = uv < 3 ? 'Baixo' : uv < 6 ? 'Moderado' : uv < 8 ? 'Alto' : uv < 11 ? 'Muito Alto' : 'Extremo';
  if (!color) return cat;
  const cor = uv < 3 ? A.green : uv < 6 ? A.yellow : uv < 8 ? A.orange : uv < 11 ? A.red : A.purple;
  return `${cor}${cat}${A.reset}`;
}

function corNivel(pct: number, color: boolean): string {
  const s = `${pct.toFixed(1)}%`;
  if (!color) return s;
  const cor = pct >= 70 ? A.green : pct >= 40 ? A.yellow : A.red;
  return `${cor}${s}${A.reset}`;
}

function corDengue(nivel: number, color: boolean): string {
  const labels = ['Normal', 'Atenção', 'Alerta', 'Alerta Alto', 'Emergência'];
  const label = labels[nivel] ?? `nível ${nivel}`;
  if (!color) return label;
  const cores = [A.green, A.yellow, A.orange, A.red, A.red + A.bold];
  return `${cores[nivel] ?? A.red}${label}${A.reset}`;
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

// ---------------------------------------------------------------------------
// Formato 1 — one-liner (para tmux/i3/polybar/prompt)
// ---------------------------------------------------------------------------

function formatarOneLiner(dados: Dados, color: boolean): string {
  const cidade = dados.cidade as string || '';
  const uf = (dados.estado as string || '').toUpperCase();
  const partes: string[] = [`${cidade}/${uf}`];

  const previsao = (dados.previsao as Dados[] | undefined)?.[0];
  if (previsao) {
    const emoji = TEMPO_EMOJI[previsao.condicao_codigo as number] ?? '⛅';
    partes.push(`${emoji}${previsao.max}°C`);
  }

  const ar = dados.qualidade_ar as Dados | undefined;
  if (ar) {
    const cor = color ? (Number(ar.indice) <= 50 ? A.green : Number(ar.indice) <= 100 ? A.yellow : A.red) : '';
    const rst = color ? A.reset : '';
    partes.push(`💨${cor}AQI${ar.indice}${rst}`);
  }

  const uv = dados.uv as Dados | undefined;
  if (uv && uv.indice) partes.push(`☀️ UV${uv.indice}`);

  const res = dados.reservatorio as Dados | undefined;
  if (res?.nivel_pct != null) {
    const pct = Number(res.nivel_pct);
    const cor = color ? (pct >= 70 ? A.green : pct >= 40 ? A.yellow : A.red) : '';
    const rst = color ? A.reset : '';
    partes.push(`🌊${cor}${pct}%${rst}`);
  }

  const dengue = dados.dengue as Dados | undefined;
  if (dengue?.nivel_alerta != null && Number(dengue.nivel_alerta) >= 1) {
    partes.push(`🦟${corDengue(Number(dengue.nivel_alerta), color)}`);
  }

  const q = dados.queimadas as Dados | undefined;
  if (q && Number(q.focos_100km) > 0) partes.push(`🔥${q.focos_100km}`);

  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Formato terminal rico (padrão curl)
// ---------------------------------------------------------------------------

function formatarTerminal(dados: Dados, color: boolean): string {
  const cidade = dados.cidade as string || '';
  const uf = (dados.estado as string || '').toUpperCase();
  const agora = dados.atualizado_em
    ? new Date(dados.atualizado_em as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'N/A';
  const temp = dados.temperatura_atual != null ? `  ${A.cyan}${dados.temperatura_atual}°C${A.reset}` : '';
  const sep = '─'.repeat(48);

  const c = color ? A : { reset:'',bold:'',dim:'',green:'',yellow:'',red:'',cyan:'',blue:'',orange:'',purple:'',white:'',gray:'' };
  const linhas: string[] = [
    '',
    `${c.bold}${c.white}  ${cidade}/${uf}${c.reset}${temp}  ${c.gray}${agora}${c.reset}`,
    `${c.gray}  ${sep}${c.reset}`,
  ];

  // Previsão 7 dias
  const previsao = dados.previsao as Dados[] | undefined;
  if (previsao?.length) {
    const hoje = previsao[0];
    const emoji = TEMPO_EMOJI[hoje.condicao_codigo as number] ?? '⛅';
    linhas.push(`  ${ICONES.previsao} ${c.bold}Previsão${c.reset}   ${emoji} ${hoje.condicao}`);
    linhas.push(`             ${c.cyan}${c.bold}↓${hoje.min}°${c.reset}  ${c.red}↑${hoje.max}°${c.reset}  ${hoje.chuva_mm ? `💧${hoje.chuva_mm}mm` : 'sem chuva'}`);

    // Próximos 6 dias em linha
    const proximos = previsao.slice(1, 7);
    if (proximos.length) {
      const linha_dias = proximos.map(d => {
        const data = new Date((d.data as string) + 'T12:00:00');
        const dia = data.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3);
        const ico = TEMPO_EMOJI[d.condicao_codigo as number] ?? '⛅';
        return pad(`${c.gray}${dia}${c.reset} ${ico}${c.red}${d.max}°${c.reset}`, 14);
      }).join('');
      linhas.push(`             ${linha_dias}`);
    }
  }

  // Qualidade do ar
  const ar = dados.qualidade_ar as Dados | undefined;
  if (ar) {
    const pm = ar.pm25 ? `  ${c.gray}PM2.5: ${ar.pm25}µg/m³${c.reset}` : '';
    linhas.push(`  ${ICONES.ar} ${c.bold}Ar${c.reset}         ${corAqi(Number(ar.indice), color)} ${c.gray}(AQI ${ar.indice})${c.reset}${pm}`);
  }

  // UV
  const uv = dados.uv as Dados | undefined;
  if (uv && Number(uv.indice) > 0) {
    linhas.push(`  ${ICONES.uv} ${c.bold}UV${c.reset}         ${corUv(Number(uv.indice), color)} ${c.gray}(${uv.indice})${c.reset}`);
  }

  // Reservatório
  const res = dados.reservatorio as Dados | undefined;
  if (res?.nivel_pct != null) {
    const barra = gerarBarra(Number(res.nivel_pct), 20, color);
    const aprox = res.aproximado ? `  ${c.gray}⚠ aprox.${c.reset}` : '';
    linhas.push(`  ${ICONES.represa} ${c.bold}Represa${c.reset}    ${corNivel(Number(res.nivel_pct), color)} ${barra}  ${c.gray}${res.nome}${c.reset}${aprox}`);
  }

  // Dengue/Chikungunya/Zika
  const dengue = dados.dengue as Dados | undefined;
  const chik = dados.chikungunya as Dados | undefined;
  const zika = dados.zika as Dados | undefined;
  if (dengue?.nivel_alerta != null) {
    const casos = dengue.casos_semana ? `  ${c.gray}${dengue.casos_semana} casos/sem${c.reset}` : '';
    linhas.push(`  ${ICONES.dengue} ${c.bold}Dengue${c.reset}     ${corDengue(Number(dengue.nivel_alerta), color)}${casos}`);
    if (chik?.nivel_alerta != null && Number(chik.nivel_alerta) >= 1) {
      linhas.push(`    ${c.gray}Chikungunya:${c.reset} ${corDengue(Number(chik.nivel_alerta), color)}  ${c.gray}${chik.casos_semana} casos${c.reset}`);
    }
    if (zika?.nivel_alerta != null && Number(zika.nivel_alerta) >= 1) {
      linhas.push(`    ${c.gray}Zika:${c.reset}        ${corDengue(Number(zika.nivel_alerta), color)}  ${c.gray}${zika.casos_semana} casos${c.reset}`);
    }
  }

  // Queimadas
  const q = dados.queimadas as Dados | undefined;
  if (q) {
    const focos = Number(q.focos_100km);
    const nivel = focos === 0 ? `${c.green}Nenhum${c.reset}` : focos <= 5 ? `${c.yellow}${focos} focos${c.reset}` : `${c.red}${focos} focos${c.reset}`;
    linhas.push(`  ${ICONES.queimadas} ${c.bold}Queimadas${c.reset}  ${nivel}  ${c.gray}raio 100km${c.reset}`);
  }

  // Sol e Lua
  const sol = dados.sol as Dados | undefined;
  const lua = dados.lua as Dados | undefined;
  if (sol || lua) {
    const sol_str = sol ? `${c.yellow}↑${sol.nascer}${c.reset}  ${c.orange}↓${sol.por}${c.reset}  ${c.gray}${sol.estacao}${c.reset}` : '';
    const lua_str = lua ? `  ${LUA_EMOJI[lua.nome as string] ?? '🌙'}${c.gray}${lua.nome} ${lua.iluminacao_pct}%${c.reset}` : '';
    linhas.push(`  ${ICONES.sol} ${c.bold}Sol/Lua${c.reset}    ${sol_str}${lua_str}`);
  }

  // Bandeira tarifária
  const bt = dados.bandeira_tarifaria as Dados | undefined;
  if (bt) {
    const cor_bt = bt.cor === 'Verde' ? c.green : bt.cor === 'Amarela' ? c.yellow : c.red;
    linhas.push(`  ${ICONES.tarifa} ${c.bold}Tarifa${c.reset}     Bandeira ${cor_bt}${bt.cor}${c.reset}  ${c.gray}+R$${Number(bt.adicional_kwh).toFixed(5)}/kWh${c.reset}`);
  }

  const slug = dados.slug as string || '';
  const estado_lower = (dados.estado as string || '').toLowerCase();
  linhas.push(`${c.gray}  ${sep}${c.reset}`);
  linhas.push(`  ${c.gray}JSON: climabr.app/api/${estado_lower}/${slug}.json${c.reset}`);
  linhas.push(`  ${c.gray}SVG:  climabr.app/${estado_lower}/${slug}.svg${c.reset}`);
  linhas.push('');

  return linhas.join('\n');
}

function gerarBarra(pct: number, largura: number, color: boolean): string {
  const preenchido = Math.round((pct / 100) * largura);
  const vazio = largura - preenchido;
  const cor = pct >= 70 ? '\x1b[32m' : pct >= 40 ? '\x1b[33m' : '\x1b[31m';
  const rst = '\x1b[0m';
  if (!color) return `[${'█'.repeat(preenchido)}${'░'.repeat(vazio)}]`;
  return `${cor}[${'█'.repeat(preenchido)}${rst}${'░'.repeat(vazio)}${cor}]${rst}`;
}

// ---------------------------------------------------------------------------
// Formato Prometheus
// ---------------------------------------------------------------------------

// Escapa valores de label Prometheus (\, " e quebras de linha) — defesa em profundidade
function promEsc(s: unknown): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatarPrometheus(dados: Dados): string {
  const cidade = (dados.cidade as string || '').replace(/[^a-z0-9_]/gi, '_');
  const estado = promEsc((dados.estado as string || '').toLowerCase());
  const labels = `cidade="${cidade}",estado="${estado}"`;
  const linhas: string[] = [
    `# HELP climabr_atualizado_timestamp Timestamp da última coleta de dados`,
    `# TYPE climabr_atualizado_timestamp gauge`,
  ];

  const at = dados.atualizado_em ? new Date(dados.atualizado_em as string).getTime() / 1000 : 0;
  linhas.push(`climabr_atualizado_timestamp{${labels}} ${at}`);

  const ar = dados.qualidade_ar as Dados | undefined;
  if (ar) {
    linhas.push(`# HELP climabr_aqi_us AQI US (qualidade do ar)`, `# TYPE climabr_aqi_us gauge`);
    linhas.push(`climabr_aqi_us{${labels}} ${ar.indice}`);
    if (ar.pm25 != null) { linhas.push(`# TYPE climabr_pm25_ugm3 gauge`); linhas.push(`climabr_pm25_ugm3{${labels}} ${ar.pm25}`); }
    if (ar.pm10 != null) { linhas.push(`# TYPE climabr_pm10_ugm3 gauge`); linhas.push(`climabr_pm10_ugm3{${labels}} ${ar.pm10}`); }
  }

  const uv = dados.uv as Dados | undefined;
  if (uv) {
    linhas.push(`# HELP climabr_uv_indice Índice UV máximo do dia`, `# TYPE climabr_uv_indice gauge`);
    linhas.push(`climabr_uv_indice{${labels}} ${uv.indice}`);
  }

  const res = dados.reservatorio as Dados | undefined;
  if (res?.nivel_pct != null) {
    linhas.push(`# HELP climabr_reservatorio_pct Nível do reservatório (%)`, `# TYPE climabr_reservatorio_pct gauge`);
    linhas.push(`climabr_reservatorio_pct{${labels},nome="${promEsc(res.nome)}",aproximado="${res.aproximado ?? false}"} ${res.nivel_pct}`);
  }

  const dengue = dados.dengue as Dados | undefined;
  if (dengue?.nivel_alerta != null) {
    linhas.push(`# HELP climabr_dengue_nivel Nível de alerta dengue (0-4)`, `# TYPE climabr_dengue_nivel gauge`);
    linhas.push(`climabr_dengue_nivel{${labels}} ${dengue.nivel_alerta}`);
    linhas.push(`climabr_dengue_casos_semana{${labels}} ${dengue.casos_semana ?? 0}`);
  }

  const q = dados.queimadas as Dados | undefined;
  if (q) {
    linhas.push(`# HELP climabr_queimadas_focos Focos de queimada num raio de 100km`, `# TYPE climabr_queimadas_focos gauge`);
    linhas.push(`climabr_queimadas_focos{${labels}} ${q.focos_100km}`);
  }

  const temp = dados.temperatura_atual;
  if (temp != null) {
    linhas.push(`# HELP climabr_temperatura_c Temperatura atual (°C)`, `# TYPE climabr_temperatura_c gauge`);
    linhas.push(`climabr_temperatura_c{${labels}} ${temp}`);
  }

  const previsao = (dados.previsao as Dados[] | undefined)?.[0];
  if (previsao) {
    linhas.push(`climabr_temp_max_c{${labels}} ${previsao.max}`);
    linhas.push(`climabr_temp_min_c{${labels}} ${previsao.min}`);
    linhas.push(`climabr_chuva_mm{${labels}} ${previsao.chuva_mm ?? 0}`);
  }

  linhas.push('');
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Formato SVG (card compartilhável)
// ---------------------------------------------------------------------------

// Escapa entidades XML — defesa em profundidade contra injeção no SVG
function xmlEsc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatarSvg(dados: Dados): string {
  const cidade = xmlEsc(dados.cidade as string || '');
  const uf = xmlEsc((dados.estado as string || '').toUpperCase());
  const agora = dados.atualizado_em
    ? new Date(dados.atualizado_em as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const previsao = (dados.previsao as Dados[] | undefined)?.[0];
  const ar = dados.qualidade_ar as Dados | undefined;
  const uv = dados.uv as Dados | undefined;
  const res = dados.reservatorio as Dados | undefined;
  const dengue = dados.dengue as Dados | undefined;
  const q = dados.queimadas as Dados | undefined;
  const sol = dados.sol as Dados | undefined;
  const lua = dados.lua as Dados | undefined;
  const temp = dados.temperatura_atual;

  const aqiCor = ar ? (Number(ar.indice) <= 50 ? '#34d399' : Number(ar.indice) <= 100 ? '#fbbf24' : '#f87171') : '#64748b';
  const resCor = res?.nivel_pct != null ? (Number(res.nivel_pct) >= 70 ? '#34d399' : Number(res.nivel_pct) >= 40 ? '#fbbf24' : '#f87171') : '#64748b';
  const uvCor = uv ? (Number(uv.indice) < 3 ? '#34d399' : Number(uv.indice) < 6 ? '#fbbf24' : Number(uv.indice) < 8 ? '#fb923c' : '#f87171') : '#64748b';
  const dnCor = dengue?.nivel_alerta != null ? ['#34d399','#fbbf24','#fb923c','#f87171','#ef4444'][Number(dengue.nivel_alerta)] ?? '#f87171' : '#64748b';

  const tempoEmoji = previsao ? (TEMPO_EMOJI[previsao.condicao_codigo as number] ?? '⛅') : '⛅';
  const luaEmoji = lua ? (LUA_EMOJI[lua.nome as string] ?? '🌙') : '🌙';

  const rows: string[] = [];
  let y = 110;
  const addRow = (icon: string, label: string, valor: string, cor: string, sub = '') => {
    rows.push(`<text x="24" y="${y}" font-size="16">${xmlEsc(icon)}</text>`);
    rows.push(`<text x="48" y="${y}" fill="#94a3b8" font-size="12" font-family="monospace">${xmlEsc(label)}</text>`);
    rows.push(`<text x="180" y="${y}" fill="${cor}" font-size="14" font-weight="bold" font-family="monospace">${xmlEsc(valor)}</text>`);
    if (sub) rows.push(`<text x="180" y="${y + 14}" fill="#64748b" font-size="11" font-family="monospace">${xmlEsc(sub)}</text>`);
    y += sub ? 36 : 26;
  };

  if (previsao) {
    const cond = (previsao.condicao as string || '').substring(0, 28);
    addRow(tempoEmoji, 'Previsão', `↓${previsao.min}° ↑${previsao.max}°C`, '#e2e8f0', cond);
  }
  if (ar) addRow('💨', 'Ar (AQI)', `${ar.indice} — ${ar.categoria}`, aqiCor, ar.pm25 ? `PM2.5: ${ar.pm25} µg/m³` : '');
  if (uv && Number(uv.indice) > 0) addRow('☀️', 'UV', `${uv.indice} — ${uv.categoria}`, uvCor);
  if (res?.nivel_pct != null) {
    const resBarra = Math.round(Number(res.nivel_pct));
    addRow('🌊', 'Represa', `${res.nivel_pct}%`, resCor, `${res.nome}${res.aproximado ? ' (aprox.)' : ''}`);
  }
  if (dengue?.nivel_alerta != null) addRow('🦟', 'Dengue', String(dengue.nivel_label ?? `Nível ${dengue.nivel_alerta}`), dnCor, dengue.casos_semana ? `${dengue.casos_semana} casos/semana` : '');
  if (q) {
    const fCor = Number(q.focos_100km) === 0 ? '#34d399' : Number(q.focos_100km) <= 5 ? '#fbbf24' : '#f87171';
    addRow('🔥', 'Queimadas', `${q.focos_100km} focos`, fCor, 'raio 100km');
  }
  if (sol) addRow('🌅', 'Sol', `↑${sol.nascer}  ↓${sol.por}`, '#fbbf24', String(sol.estacao));
  if (lua) addRow(luaEmoji, 'Lua', `${lua.nome}`, '#a5b4fc', `${lua.iluminacao_pct}% iluminada`);

  const altura = Math.max(280, y + 40);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${altura}" viewBox="0 0 480 ${altura}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="480" height="${altura}" rx="16" fill="url(#bg)"/>
  <rect x="0" y="0" width="480" height="4" rx="2" fill="#10b981"/>
  <text x="24" y="38" fill="white" font-size="22" font-weight="bold" font-family="system-ui,sans-serif">${cidade}</text>
  <text x="24" y="58" fill="#64748b" font-size="13" font-family="monospace">/${uf}${temp != null ? `  ·  ${temp}°C agora` : ''}  ·  ${agora}</text>
  <line x1="24" y1="72" x2="456" y2="72" stroke="#1e293b" stroke-width="1"/>
  <text x="24" y="90" fill="#334155" font-size="10" font-family="monospace">climabr.app/${xmlEsc((dados.estado as string || '').toLowerCase())}/${xmlEsc(dados.slug)}</text>
  ${rows.join('\n  ')}
  <text x="24" y="${altura - 12}" fill="#1e293b" font-size="10" font-family="monospace">climabr.app · dados abertos · ${agora}</text>
</svg>`;
}

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

function extrairPathInfo(pathname: string): { estado: string; cidade: string; ext: string } | null {
  // /sp/cotia, /sp/cotia.svg, /sp/cotia.png
  const m = pathname.match(/^\/([a-z]{2})\/([a-z0-9-]+?)(\.svg|\.png|\.txt)?\/?\s*$/);
  if (!m) return null;
  return { estado: m[1], cidade: m[2], ext: m[3] ?? '' };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const siteUrl = env.SITE_URL ?? 'https://climabr.app';
    const ua = request.headers.get('User-Agent') ?? '';
    const curl = isCurl(ua);
    const format = url.searchParams.get('format') ?? '';
    const noColor = url.searchParams.has('T') || url.searchParams.has('no-color');

    // Redirect www → apex
    if (url.hostname.startsWith('www.')) {
      return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    }

    // Raiz "/" sem cidade: geolocaliza pelo IP
    if (url.pathname === '/' && (curl || format)) {
      const cf = (request as unknown as { cf?: IncomingRequestCfProperties }).cf;
      const loc = geolocalizarCidade(cf);
      if (loc) {
        if (curl && !format) {
          // Redireciona para a cidade detectada e responde inline
          const dados = await buscarDados(siteUrl, loc.uf, loc.slug);
          if (dados && !dados._status) {
            const cor = !noColor;
            const texto = formatarTerminal(dados, cor);
            return new Response(texto, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900', ...SECURITY_HEADERS },
            });
          }
        }
        return Response.redirect(`${siteUrl}/${loc.uf}/${loc.slug}`, 302);
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
          const svg = formatarSvg(dados);

          if (querPng) {
            // PNG real para og:image (Twitter/X, Facebook, WhatsApp exigem raster)
            try {
              const png = await svgParaPng(svg);
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
          const cor = !noColor && curl;

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

          if (format === 'j1' || format === 'json') {
            return new Response(JSON.stringify(dados, null, 2), {
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800', 'Access-Control-Allow-Origin': '*', ...SECURITY_HEADERS },
            });
          }

          // Formato padrão (2 = sem ANSI, default = com ANSI)
          const texto = formatarTerminal(dados, cor && format !== '2');
          return new Response(texto, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS },
          });
        }
      }
    }

    // Passa para Cloudflare Pages
    const response = await fetch(request);
    const novo = new Response(response.body, response);
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => novo.headers.set(k, v));
    return novo;
  },
} satisfies ExportedHandler<Env>;
