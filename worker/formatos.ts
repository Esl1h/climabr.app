// Formatação pura dos formatos do Worker (terminal, one-liner, markdown,
// Prometheus, SVG) e helpers sem acesso a rede/env. Sem import de wasm:
// este módulo precisa continuar testável fora do runtime do Workers.

export type Dados = Record<string, unknown>;

// ANSI color codes
export const A = {
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
export const ICONES = {
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
export const TEMPO_EMOJI: Record<number, string> = {
  0: '☀️ ', 1: '🌤 ', 2: '⛅', 3: '☁️ ',
  45: '🌫 ', 48: '🌫 ',
  51: '🌦 ', 53: '🌦 ', 55: '🌧 ',
  61: '🌧 ', 63: '🌧 ', 65: '🌧 ',
  71: '❄️ ', 73: '❄️ ', 75: '❄️ ', 77: '🌨 ',
  80: '🌦 ', 81: '🌦 ', 82: '⛈ ',
  95: '⛈ ', 96: '⛈ ', 99: '⛈ ',
};

export const LUA_EMOJI: Record<string, string> = {
  'Nova': '🌑', 'Crescente': '🌒', 'Quarto Crescente': '🌓',
  'Gibosa Crescente': '🌔', 'Cheia': '🌕', 'Gibosa Minguante': '🌖',
  'Quarto Minguante': '🌗', 'Minguante': '🌘',
};

// WMO Weather Codes → descrição PT-BR (espelha scripts/scrape-openmeteo.py e o cliente)
export const WMO_DESCRICAO: Record<number, string> = {
  0: 'Céu limpo', 1: 'Principalmente limpo', 2: 'Parcialmente nublado', 3: 'Encoberto',
  45: 'Névoa', 48: 'Névoa com gelo',
  51: 'Chuvisco leve', 53: 'Chuvisco moderado', 55: 'Chuvisco denso',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte',
  71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve forte', 77: 'Granizo',
  80: 'Chuva isolada leve', 81: 'Chuva isolada moderada', 82: 'Chuva isolada forte',
  95: 'Tempestade', 96: 'Tempestade com granizo leve', 99: 'Tempestade com granizo forte',
};

export function pad(s: string, n: number): string {
  // Pad sem contar escape codes ANSI
  const visible = s.replace(/\x1b\[[^m]*m/g, '');
  return s + ' '.repeat(Math.max(0, n - visible.length));
}

export function rpad(s: string, n: number): string {
  const visible = s.replace(/\x1b\[[^m]*m/g, '');
  return ' '.repeat(Math.max(0, n - visible.length)) + s;
}

export function corAqi(aqi: number, color: boolean): string {
  if (!color) return aqi <= 50 ? 'Boa' : aqi <= 100 ? 'Moderada' : aqi <= 150 ? 'Ruim p/ sensíveis' : aqi <= 200 ? 'Ruim' : 'Muito Ruim';
  const cor = aqi <= 50 ? A.green : aqi <= 100 ? A.yellow : aqi <= 150 ? A.orange : A.red;
  const cat = aqi <= 50 ? 'Boa' : aqi <= 100 ? 'Moderada' : aqi <= 150 ? 'Ruim p/ sensíveis' : aqi <= 200 ? 'Ruim' : 'Muito Ruim';
  return `${cor}${cat}${A.reset}`;
}

export function corUv(uv: number, color: boolean): string {
  const cat = uv < 3 ? 'Baixo' : uv < 6 ? 'Moderado' : uv < 8 ? 'Alto' : uv < 11 ? 'Muito Alto' : 'Extremo';
  if (!color) return cat;
  const cor = uv < 3 ? A.green : uv < 6 ? A.yellow : uv < 8 ? A.orange : uv < 11 ? A.red : A.purple;
  return `${cor}${cat}${A.reset}`;
}

export function corNivel(pct: number, color: boolean): string {
  const s = `${pct.toFixed(1)}%`;
  if (!color) return s;
  const cor = pct >= 70 ? A.green : pct >= 40 ? A.yellow : A.red;
  return `${cor}${s}${A.reset}`;
}

export function corDengue(nivel: number, color: boolean): string {
  const labels = ['Normal', 'Atenção', 'Alerta', 'Alerta Alto', 'Emergência'];
  const label = labels[nivel] ?? `nível ${nivel}`;
  if (!color) return label;
  const cores = [A.green, A.yellow, A.orange, A.red, A.red + A.bold];
  return `${cores[nivel] ?? A.red}${label}${A.reset}`;
}

// /sp/cotia, /sp/cotia.svg, /sp/cotia.png
export function extrairPathInfo(pathname: string): { estado: string; cidade: string; ext: string } | null {
  const m = pathname.match(/^\/([a-z]{2})\/([a-z0-9-]+?)(\.svg|\.png|\.txt)?\/?\s*$/);
  if (!m) return null;
  return { estado: m[1], cidade: m[2], ext: m[3] ?? '' };
}

export function formatarFim(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// Mesmo limite da página da cidade: coleta com mais de 48h é marcada como atrasada
export const LIMITE_COLETA_MS = 48 * 3600 * 1000;

export function formatarOneLiner(dados: Dados, color: boolean): string {
  const cidade = dados.cidade as string || '';
  const uf = (dados.estado as string || '').toUpperCase();
  const partes: string[] = [`${cidade}/${uf}`];
  const aviso = (dados.avisos as Dados[] | undefined)?.[0];
  if (aviso) partes.push(`⚠${aviso.evento}`);

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

  const coleta = dados.coleta_em as string | null | undefined;
  if (coleta && Date.now() - new Date(coleta).getTime() > LIMITE_COLETA_MS) partes.push('⚠ coleta antiga');

  return partes.join(' ');
}

// Markdown para notas e LLMs; ?secoes= escolhe quais linhas aparecem
export function formatarMarkdown(dados: Dados, secoes: Set<string> | null): string {
  const cidade = dados.cidade as string || '';
  const uf = (dados.estado as string || '').toUpperCase();
  const coleta = dados.coleta_em as string | null | undefined;
  const mostrar = (secao: string) => !secoes || secoes.has(secao);
  const linhas: string[] = [`## ${cidade}/${uf}`];
  if (coleta) linhas.push(`Atualizado em ${formatarFim(coleta)}`);
  linhas.push('');

  const previsao = (dados.previsao as Dados[] | undefined)?.[0];
  if (mostrar('previsao') && previsao) linhas.push(`- Previsão: ${previsao.condicao}, mín ${previsao.min}°C, máx ${previsao.max}°C`);

  const aviso = (dados.avisos as Dados[] | undefined)?.[0];
  if (mostrar('avisos') && aviso) linhas.push(`- Aviso INMET: ${aviso.evento} (${aviso.severidade})`);

  const ar = dados.qualidade_ar as Dados | undefined;
  if (mostrar('ar') && ar) linhas.push(`- Ar: ${ar.categoria} (AQI ${ar.indice})`);

  const uv = dados.uv as Dados | undefined;
  if (mostrar('uv') && uv?.indice != null) linhas.push(`- UV: ${uv.categoria} (${uv.indice})`);

  const res = dados.reservatorio as Dados | undefined;
  if (mostrar('reservatorio') && res?.nivel_pct != null) linhas.push(`- Reservatório: ${res.nome} ${res.nivel_pct}%`);

  const ondas = dados.ondas as Dados | undefined;
  if (mostrar('ondas') && ondas) linhas.push(`- Mar: ${ondas.surf_descricao}, ondas de ${ondas.altura_m} m`);

  const dengue = dados.dengue as Dados | undefined;
  if (mostrar('dengue') && dengue?.nivel_alerta != null && Number(dengue.nivel_alerta) >= 1) {
    const casos = Number(dengue.casos_semana);
    linhas.push(`- Dengue: ${dengue.nivel_label}, ${casos} ${casos === 1 ? 'caso' : 'casos'}/semana`);
  }

  const q = dados.queimadas as Dados | undefined;
  if (mostrar('queimadas') && q) linhas.push(`- Queimadas: ${q.focos_100km} focos num raio de 100 km`);

  return linhas.join('\n') + '\n';
}

export function formatarTerminal(dados: Dados, color: boolean): string {
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

  for (const aviso of (dados.avisos as Dados[] | undefined) ?? []) {
    const fim = aviso.fim ? `até ${formatarFim(aviso.fim as string)}` : 'vigente';
    linhas.push(`  ${c.red}${c.bold}⚠ ${aviso.evento}${c.reset}  ${c.gray}${aviso.severidade} · ${fim}${c.reset}`);
  }

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

  const coleta = dados.coleta_em as string | null | undefined;
  if (coleta) {
    const quando = new Date(coleta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const atrasada = Date.now() - new Date(coleta).getTime() > LIMITE_COLETA_MS;
    linhas.push(`  ${c.gray}Coleta dos dados: ${quando}${c.reset}${atrasada ? `  ${c.yellow}⚠ mais de 48h${c.reset}` : ''}`);
  }

  const slug = dados.slug as string || '';
  const estado_lower = (dados.estado as string || '').toLowerCase();
  linhas.push(`${c.gray}  ${sep}${c.reset}`);
  linhas.push(`  ${c.gray}JSON: climabr.app/api/${estado_lower}/${slug}.json${c.reset}`);
  linhas.push(`  ${c.gray}SVG:  climabr.app/${estado_lower}/${slug}.svg${c.reset}`);
  linhas.push('');

  return linhas.join('\n');
}

export function gerarBarra(pct: number, largura: number, color: boolean): string {
  const preenchido = Math.round((pct / 100) * largura);
  const vazio = largura - preenchido;
  const cor = pct >= 70 ? '\x1b[32m' : pct >= 40 ? '\x1b[33m' : '\x1b[31m';
  const rst = '\x1b[0m';
  if (!color) return `[${'█'.repeat(preenchido)}${'░'.repeat(vazio)}]`;
  return `${cor}[${'█'.repeat(preenchido)}${rst}${'░'.repeat(vazio)}${cor}]${rst}`;
}

// Escapa valores de label Prometheus (\, " e quebras de linha) — defesa em profundidade
export function promEsc(s: unknown): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function formatarPrometheus(dados: Dados): string {
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

// Escapa entidades XML — defesa em profundidade contra injeção no SVG
export function xmlEsc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatarSvg(dados: Dados, paraPng = false): string {
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
    // No PNG o resvg não renderiza emoji; usa um ícone vetorial (dot por severidade).
    // No SVG (browser) mantém o emoji, que renderiza bem.
    if (paraPng) {
      rows.push(`<circle cx="30" cy="${y - 5}" r="5" fill="${cor}"/>`);
    } else {
      rows.push(`<text x="24" y="${y}" font-size="16">${xmlEsc(icon)}</text>`);
    }
    rows.push(`<text x="48" y="${y}" fill="#94a3b8" font-size="12" font-family="monospace">${xmlEsc(label)}</text>`);
    rows.push(`<text x="180" y="${y}" fill="${cor}" font-size="14" font-weight="bold" font-family="monospace">${xmlEsc(valor)}</text>`);
    if (sub) rows.push(`<text x="180" y="${y + 14}" fill="#64748b" font-size="11" font-family="monospace">${xmlEsc(sub)}</text>`);
    y += sub ? 36 : 26;
  };

  if (previsao) {
    const cond = (previsao.condicao as string || '').substring(0, 28);
    addRow(tempoEmoji, 'Previsão', `↓${previsao.min}° ↑${previsao.max}°C`, '#e2e8f0', cond);
  }
  if (ar) addRow('💨', 'Ar (AQI)', `${ar.indice} · ${ar.categoria}`, aqiCor, ar.pm25 ? `PM2.5: ${ar.pm25} µg/m³` : '');
  if (uv && Number(uv.indice) > 0) addRow('☀️', 'UV', `${uv.indice} · ${uv.categoria}`, uvCor);
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
