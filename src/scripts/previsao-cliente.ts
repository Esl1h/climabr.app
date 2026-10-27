/**
 * Hidratação client-side da previsão e do tempo atual.
 *
 * O HTML já chega com um snapshot dos dados (bom para SEO/AI e para no-JS).
 * Este módulo busca a previsão direto do Open-Meteo no browser (CORS liberado,
 * sem chave) usando o lat/lon embutido na página e sobrescreve apenas os blocos
 * voláteis. Em caso de falha, mantém o snapshot do build.
 *
 * Não toca a Cloudflare: os bytes vão direto do Open-Meteo ao cliente.
 */

import { corAqi, catAqi } from './cores-status';
import { corTemperatura, catTemperatura } from '../lib/temperatura';
import { iconeTempoWmo } from '../lib/icone-tempo';

// WMO Weather Codes → descrição PT-BR (espelha scripts/scrape-openmeteo.py)
const WMO_DESCRICAO: Record<number, string> = {
  0: 'Céu limpo', 1: 'Principalmente limpo', 2: 'Parcialmente nublado', 3: 'Encoberto',
  45: 'Névoa', 48: 'Névoa com gelo',
  51: 'Chuvisco leve', 53: 'Chuvisco moderado', 55: 'Chuvisco denso',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte',
  71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve forte',
  77: 'Granizo', 80: 'Chuva isolada leve', 81: 'Chuva isolada moderada', 82: 'Chuva isolada forte',
  85: 'Neve isolada', 86: 'Neve isolada forte',
  95: 'Tempestade', 96: 'Tempestade com granizo leve', 99: 'Tempestade com granizo forte',
};

const TTL_MS = 10 * 60_000; // cache curto no client: evita martelar a API e piscar a tela

interface DiaPrevisao {
  data: string;
  min: number;
  max: number;
  chuva: number;
  cond: string;
}

function arred(n: number): number {
  return Math.round(n * 10) / 10;
}

function diaSemana(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

// Espelha o formatarDataHora do servidor (DD/MM/AAAA, HH:MM em America/Sao_Paulo)
function agoraFormatado(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });
}

async function buscarOpenMeteo(lat: number, lon: number): Promise<any> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,weather_code,relative_humidity_2m,pressure_msl,dew_point_2m`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,uv_index_max`
    + `&hourly=precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,uv_index`
    + `&timezone=America%2FSao_Paulo&forecast_days=7`;

  const chave = `om:${lat},${lon}`;
  try {
    const raw = sessionStorage.getItem(chave);
    if (raw) {
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < TTL_MS) return d;
    }
  } catch { /* sessionStorage indisponível: segue para a rede */ }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const d = await res.json();
  try {
    sessionStorage.setItem(chave, JSON.stringify({ t: Date.now(), d }));
  } catch { /* cota cheia/privado: ignora */ }
  return d;
}

// Qualidade do ar é um endpoint separado do Open-Meteo (CSP libera o subdomínio)
async function buscarAr(lat: number, lon: number): Promise<any | null> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}`
    + `&current=us_aqi,pm2_5,pm10&timezone=America%2FSao_Paulo`;
  const chave = `om-aq:${lat},${lon}`;
  try {
    const raw = sessionStorage.getItem(chave);
    if (raw) {
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < TTL_MS) return d;
    }
  } catch { /* segue para a rede */ }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    try { sessionStorage.setItem(chave, JSON.stringify({ t: Date.now(), d })); } catch { /* ignora */ }
    return d;
  } catch {
    return null;
  }
}

// Cores via tokens de status (global.css), para acompanhar o tema claro/escuro
// (AQI vive em cores-status.ts, compartilhado com a hidratação da home)
function corUv(uv: number): string {
  return uv < 3 ? 'var(--status-bom)' : uv < 6 ? 'var(--status-moderado)' : uv < 8 ? 'var(--status-ruim)' : uv < 11 ? 'var(--status-pessimo)' : 'var(--status-extremo)';
}
function catUv(uv: number): string {
  return uv < 3 ? 'Baixo' : uv < 6 ? 'Moderado' : uv < 8 ? 'Alto' : uv < 11 ? 'Muito Alto' : 'Extremo';
}

// Esconde skeletons que a hidratação não conseguiu preencher
function limparSkeletons(): void {
  document.querySelectorAll<HTMLElement>('[data-skeleton]').forEach((el) => {
    if (el.querySelector('.animate-pulse')) el.hidden = true;
  });
}

// "há 2 h", "há 3 dias": comunica frescor melhor que a data completa
// (que fica no atributo title do elemento)
function tempoRelativo(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const seg = Math.round((t - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const abs = Math.abs(seg);
  if (abs < 60) return fmt.format(Math.trunc(seg), 'second');
  if (abs < 3600) return fmt.format(Math.trunc(seg / 60), 'minute');
  if (abs < 86400) return fmt.format(Math.trunc(seg / 3600), 'hour');
  return fmt.format(Math.trunc(seg / 86400), 'day');
}

export async function hidratarClima(): Promise<void> {
  const root = document.getElementById('clima-root');
  if (!root) return;

  // Timestamp do snapshot em forma relativa (antes do fetch, para valer mesmo offline)
  const atualizadoEl = document.getElementById('clima-atualizado');
  const ts = atualizadoEl?.dataset.ts;
  if (atualizadoEl && ts) {
    const rel = tempoRelativo(ts);
    if (rel) atualizadoEl.textContent = `Atualizado ${rel}`;

    // Coleta parada há mais de 48h: sinaliza em vez de exibir número velho como
    // atual. Só vale para os blocos do snapshot (reservatório, dengue,
    // queimadas); a previsão e o "agora" são hidratados ao vivo logo abaixo.
    // Por isso o aviso é ancorado DEPOIS dos painéis, e não no cabeçalho, onde
    // contradizia o "Tempo atualizado agora" impresso na linha de cima.
    const idadeMs = Date.now() - Date.parse(ts);
    const ancora = document.querySelector<HTMLElement>('[data-aviso-coleta]');
    if (ancora && Number.isFinite(idadeMs) && idadeMs > 48 * 3600 * 1000 && !document.getElementById('aviso-dado-velho')) {
      const aviso = document.createElement('p');
      aviso.id = 'aviso-dado-velho';
      aviso.className = 'rounded-lg border border-status-moderado/40 bg-status-moderado/10 px-4 py-3 text-xs text-status-moderado';
      aviso.setAttribute('role', 'status');
      aviso.textContent = '⚠️ Coleta automática atrasada: reservatório, dengue e queimadas podem estar desatualizados.';
      ancora.appendChild(aviso);
    }
  }

  const lat = parseFloat(root.dataset.lat ?? '');
  const lon = parseFloat(root.dataset.lon ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    limparSkeletons();
    return;
  }

  let data: any;
  try {
    data = await buscarOpenMeteo(lat, lon);
  } catch {
    limparSkeletons();
    return; // mantém o snapshot do build
  }

  // Condições atuais (umidade, pressão, ponto de orvalho)
  const cur = data?.current;
  if (cur) {
    const setCond = (campo: string, v: string) => {
      const el = document.querySelector<HTMLElement>(`[data-cond="${campo}"]`);
      if (el) el.textContent = v;
    };
    if (typeof cur.relative_humidity_2m === 'number') setCond('umidade', `${Math.round(cur.relative_humidity_2m)}%`);
    if (typeof cur.pressure_msl === 'number') setCond('pressao', `${Math.round(cur.pressure_msl)} hPa`);
    if (typeof cur.dew_point_2m === 'number') setCond('orvalho', `${arred(cur.dew_point_2m)}°C`);
  }

  // Temperatura atual: destaque ao lado do nome da cidade. A cor vem da faixa
  // de calor e sobrepõe (via style) a classe text-status-* posta no build.
  const tempEl = document.getElementById('clima-agora');
  const tAtual = data?.current?.temperature_2m;
  if (tempEl && typeof tAtual === 'number') {
    // Uma casa decimal, igual ao resumo textual e ao que outros serviços
    // publicam: arredondar aqui faria o número parecer divergente.
    const rotulo = `${arred(tAtual).toFixed(1)}°`;
    const valorEl = tempEl.querySelector<HTMLElement>('[data-temp-valor]');
    if (valorEl) {
      valorEl.textContent = rotulo;
    } else {
      tempEl.textContent = rotulo; // defensivo: markup sem o span
    }
    const srEl = tempEl.querySelector<HTMLElement>('[data-temp-sr]');
    if (srEl) srEl.textContent = ' agora';
    tempEl.style.color = corTemperatura(tAtual);
    tempEl.title = `${arred(tAtual)}°C agora · ${catTemperatura(tAtual)}`;
    tempEl.removeAttribute('data-skeleton');
    tempEl.hidden = false;

    // Delta vs última visita: guarda a leitura localmente e compara se a
    // anterior tiver menos de 36h (janela dentro de dia/noite). Nada sai do
    // dispositivo; o chip só existe com hidratação bem-sucedida.
    try {
      const chaveDelta = `climabr_delta:${root.dataset.uf}/${root.dataset.slug}`;
      const bruto = localStorage.getItem(chaveDelta);
      if (bruto) {
        const antes = JSON.parse(bruto) as { t: number; ts: number };
        if (Date.now() - antes.ts > 36 * 3600_000) {
          localStorage.removeItem(chaveDelta);
        } else if (Math.abs(arred(tAtual) - antes.t) >= 0.5) {
          const delta = arred(tAtual) - antes.t;
          const chip = document.querySelector<HTMLElement>('[data-delta-ultima]');
          if (chip) {
            chip.textContent = `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}° vs sua última visita`;
            chip.style.color = delta > 0 ? 'var(--status-ruim)' : 'var(--status-bom)';
            chip.classList.remove('hidden');
          }
        }
      }
      localStorage.setItem(chaveDelta, JSON.stringify({ t: arred(tAtual), ts: Date.now() }));
    } catch { /* storage indisponível: o delta é opcional */ }

    // Ícone e rótulo de condição de hoje no cabeçalho (weather_code é mais
    // preciso que o texto do snapshot)
    if (typeof cur.weather_code === 'number') {
      const iconeEl = document.getElementById('clima-icone');
      if (iconeEl) iconeEl.textContent = iconeTempoWmo(cur.weather_code);
      const condHojeEl = document.querySelector<HTMLElement>('[data-f="cond-atual"]');
      if (condHojeEl) condHojeEl.textContent = WMO_DESCRICAO[cur.weather_code] ?? `Código ${cur.weather_code}`;
    }

    // O resumo textual cita o mesmo valor; atualiza para não divergir
    const resumoEl = document.querySelector<HTMLElement>('[data-resumo-temp]');
    if (resumoEl) resumoEl.textContent = `${arred(tAtual).toFixed(1)}°C`;
  }

  // Timestamp: tempo, previsão, UV e ar acabaram de vir do Open-Meteo ao vivo.
  if (atualizadoEl) {
    atualizadoEl.textContent = 'Tempo atualizado agora';
    atualizadoEl.title = `Tempo atualizado em ${agoraFormatado()}`;
  }

  // Min/max arredondados: previsão é estimativa, e a casa decimal só aparecia
  // em parte dos dias, deixando a linha com formatos misturados. A decimal
  // fica reservada à temperatura atual, que é medição.
  const daily = data?.daily;
  const dias: DiaPrevisao[] = Array.isArray(daily?.time)
    ? daily.time.slice(0, 7).map((t: string, i: number) => ({
        data: t,
        min: Math.round(daily.temperature_2m_min[i]),
        max: Math.round(daily.temperature_2m_max[i]),
        chuva: arred(daily.precipitation_sum?.[i] ?? 0),
        cond: WMO_DESCRICAO[daily.weather_code[i]] ?? `Código ${daily.weather_code[i]}`,
      }))
    : [];

  // Máx/mín de hoje no cabeçalho. Fica fora do bloco da grade porque a cidade
  // pode não ter o bloco de previsão renderizado (snapshot vazio no build) e
  // ainda assim receber os dados ao vivo aqui.
  if (dias[0]) {
    const setHoje = (f: string, v: string) => {
      const el = document.querySelector<HTMLElement>(`[data-f="${f}"]`);
      if (el) el.textContent = v;
    };
    setHoje('hoje-max', `${dias[0].max}°`);
    setHoje('hoje-min', `${dias[0].min}°`);
    const linhaMinMax = document.querySelector<HTMLElement>('[data-hoje-minmax]');
    if (linhaMinMax) linhaMinMax.hidden = false;
  }

  // Previsão 7 dias (atualiza os cards já renderizados no servidor)
  const grid = document.querySelector<HTMLElement>('[data-previsao-grid]');
  if (grid && dias.length) {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-dia]'));
    const template = cards[0];

    dias.forEach((dia, i) => {
      let card = cards[i];
      if (!card && template) {
        card = template.cloneNode(true) as HTMLElement;
        grid.appendChild(card);
      }
      if (!card) return;

      const set = (f: string, v: string) => {
        const el = card!.querySelector<HTMLElement>(`[data-f="${f}"]`);
        if (el) el.textContent = v;
      };
      set('dow', diaSemana(dia.data));
      set('max', `${dia.max}°`);
      set('min', `${dia.min}°`);
      set('cond', dia.cond);

      // Ícone por código WMO do dia (faca diária: weather_code do daily)
      const iconeEl = card.querySelector<HTMLElement>('[data-f="icone"]');
      if (iconeEl && typeof daily?.weather_code?.[i] === 'number') {
        iconeEl.textContent = iconeTempoWmo(daily.weather_code[i]);
      }

      // Cor da máxima acompanha a mesma faixa térmica do build
      const maxEl = card.querySelector<HTMLElement>('[data-f="max"]');
      if (maxEl) maxEl.style.color = corTemperatura(dia.max);

      const chuvaEl = card.querySelector<HTMLElement>('[data-f="chuva"]');
      if (chuvaEl) {
        if (dia.chuva > 0) {
          chuvaEl.textContent = `${dia.chuva}mm`;
          chuvaEl.hidden = false;
        } else {
          chuvaEl.hidden = true;
        }
      }
    });

    // Banda min→max dos cards no mesmo eixo da semana: reposiciona todas as
    // faixas sobre a nova escala da previsão ao vivo (o build posicionou
    // pelo snapshot, que pode estar defasado)
    const semanaMin = Math.min(...dias.map((d) => d.min));
    const semanaMax = Math.max(...dias.map((d) => d.max));
    const escala = Math.max(semanaMax - semanaMin, 1);
    grid.querySelectorAll<HTMLElement>('[data-dia]').forEach((card, i) => {
      const bandaEl = card.querySelector<HTMLElement>('[data-f="banda"]');
      const dia = dias[i];
      if (!bandaEl || !dia) return;
      const top = ((semanaMax - dia.max) / escala) * 100;
      const altura = Math.max(((dia.max - dia.min) / escala) * 100, 6);
      bandaEl.style.top = `${top.toFixed(1)}%`;
      bandaEl.style.height = `${altura.toFixed(1)}%`;
      bandaEl.style.backgroundColor = corTemperatura(dia.max);
    });
  }

  // Próximas 6h de chuva (probabilidade e mm) do próprio fetch, agora horária
  const hourly = data?.hourly;
  const faixa6h = document.querySelector<HTMLElement>('[data-chuva-6h]');
  const conteudo6h = document.querySelector<HTMLElement>('[data-chuva-6h-conteudo]');
  if (faixa6h && conteudo6h && Array.isArray(hourly?.time)) {
    // Rótulo por hora: probabilidade quando chove pouco, mm quando pesa
    const detalhe = (p: number, mm: number): string => (mm > 0.5 ? `${mm} mm` : `${p}%`);
    const chip = (h: string, p: number, mm: number): string =>
      `<span class="inline-flex items-center gap-1 tabular-nums ${p >= 50 || mm > 0.5 ? 'font-semibold text-status-info' : 'text-muted-foreground'}">${h} ${detalhe(p, mm)}</span>`;

    // O corte "agora" usa o formato sueco sv-SE ("2026-09-26 00:45" no fuso),
    // ordenável como string depois de normalizado pelo horaDeCorte
    const inicio = horaDeCorte(hourly.time);

    const totalMm = arred(hourly.time.slice(inicio, inicio + 6)
      .map((_: string, i: number) => hourly.precipitation?.[inicio + i] ?? 0)
      .reduce((a: number, b: number) => a + b, 0));
    const totalProb = Math.max(...hourly.time.slice(inicio, inicio + 6)
      .map((_: string, i: number) => hourly.precipitation_probability?.[inicio + i] ?? 0));

    const selo = totalMm > 0.5
      ? `<span class="font-semibold text-status-info">🌧️ ${totalMm} mm na janela de 6h</span>`
      : totalProb >= 50
        ? `<span class="font-semibold text-status-info">Risco de chuva: até ${totalProb}%</span>`
        : `<span class="font-medium text-muted-foreground">Sem chuva nas próximas 6h</span>`;

    const chips = hourly.time.slice(inicio, inicio + 6)
      .map((t: string, i: number) =>
        chip(`${t.slice(11, 13)}h`, hourly.precipitation_probability?.[inicio + i] ?? 0, arred(hourly.precipitation?.[inicio + i] ?? 0)))
      .join('');

    conteudo6h.innerHTML = `${selo}${chips}`;
    conteudo6h.classList.remove('hidden');
    conteudo6h.classList.add('flex'); // o gap-x entre os chips depende de flex
    faixa6h.classList.remove('hidden');
  }

  // Rajada prevista nas próximas 12h (wind_gusts_10m). Sem API extra: é o
  // mesmo fetch horário da chuva, então o custo é zero em requisições.
  const vento12hEl = document.querySelector<HTMLElement>('[data-vento-12h]');
  const vento12hTxt = document.querySelector<HTMLElement>('[data-vento-12h-conteudo]');
  if (vento12hEl && vento12hTxt && Array.isArray(hourly?.time)) {
    const apta = horaDeCorte(hourly.time);
    const fim = Math.min(apta + 12, hourly.time.length);
    let indiceRajada = apta;
    let pico = -1;
    for (let i = apta; i < fim; i++) {
      const r = hourly.wind_gusts_10m?.[i] ?? -1;
      if (r > pico) { pico = r; indiceRajada = i; }
    }
    vento12hEl.classList.remove('hidden');
    if (pico > 0) {
      vento12hTxt.textContent = `rajadas até ${Math.round(pico)} km/h, por volta das ${hourly.time[indiceRajada].slice(11, 13)}h`;
    } else {
      vento12hTxt.textContent = 'sem grade de rajada disponível';
    }
  }

  // Curva de UV por hora (06h-19h): barras client-side no card do UV
  const uvHorasEl = document.querySelector<HTMLElement>('[data-uv-horas]');
  if (uvHorasEl?.hidden && Array.isArray(hourly?.uv_index)) {
    const apta = horaDeCorte(hourly.time);
    const horas: number[] = [];
    const valores: number[] = [];
    for (let i = apta; i < apta + 24 && i < hourly.time.length; i++) {
      const hora = parseInt(hourly.time[i].slice(11, 13), 10);
      if (hora < 6 || hora > 19) continue;
      const v = hourly.uv_index[i];
      if (typeof v === 'number') { horas.push(hora); valores.push(v); }
    }
    if (valores.length > 0 && valores.some((v) => v > 0.2)) {
      const pico = Math.max(...valores);
      const barras = uvHorasEl.querySelector<HTMLElement>('[data-uv-horas-barras]')!;
      const rotulos = uvHorasEl.querySelector<HTMLElement>('[data-uv-horas-rotulos]')!;
      for (let i = 0; i < valores.length; i++) {
        const v = valores[i];
        const bar = document.createElement('span');
        bar.className = 'flex-1 rounded-sm bg-muted';
        bar.style.height = `${Math.max((v / Math.max(pico, 1)) * 100, 4)}%`;
        bar.style.backgroundColor = corUv(v);
        if (v < 0.2) bar.style.opacity = '0.35';
        bar.title = `${horas[i]}h · UV ${v.toFixed(1)}`;
        barras.appendChild(bar);
      }
      rotulos.innerHTML = `<span>${horas[0]}h</span><span>${horas[horas.length - 1]}h</span>`;
      uvHorasEl.hidden = false; // o markup usa o atributo, não a classe
    }
  }

  // Primeiro índice cujo timestamp local >= agora. O Open-Meteo devolve o
  // tempo no fuso pedido ("2026-09-26T01:00"); sv-SE gera o mesmo vetor só
  // que com espaço, que não ordena igual — por isso normalizo para "T"
  function horaDeCorte(times: string[]): number {
    const agoraLocal = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date()).replace(' ', 'T');
    const i = times.findIndex((t) => t >= agoraLocal);
    return i < 0 ? 0 : i;
  }

  // Índice UV (uv_index_max de hoje, do mesmo fetch)
  const uvMax = daily?.uv_index_max?.[0];
  if (typeof uvMax === 'number') {
    const v = arred(uvMax);
    const cor = corUv(v);
    const elV = document.querySelector<HTMLElement>('[data-uv-indice]');
    const elC = document.querySelector<HTMLElement>('[data-uv-categoria]');
    const elB = document.querySelector<HTMLElement>('[data-uv-barra]');
    if (elV) { elV.textContent = v.toFixed(1); elV.style.color = cor; }
    if (elC) elC.textContent = catUv(v);
    if (elB) { elB.style.width = `${Math.min(100, Math.round((v / 12) * 100))}%`; elB.style.backgroundColor = cor; }
  }

  // Qualidade do ar (endpoint separado)
  const ar = await buscarAr(lat, lon).catch(() => null);
  const aqi = ar?.current?.us_aqi;
  if (typeof aqi === 'number') {
    const a = Math.round(aqi);
    const cor = corAqi(a);
    const elV = document.querySelector<HTMLElement>('[data-ar-indice]');
    const elC = document.querySelector<HTMLElement>('[data-ar-categoria]');
    const elB = document.querySelector<HTMLElement>('[data-ar-barra]');
    const elPm = document.querySelector<HTMLElement>('[data-ar-pm25]');
    if (elV) { elV.textContent = `AQI ${a}`; elV.style.color = cor; }
    if (elC) elC.textContent = catAqi(a);
    if (elB) { elB.style.width = `${Math.min(100, Math.round((a / 300) * 100))}%`; elB.style.backgroundColor = cor; }
    const pm25 = ar?.current?.pm2_5;
    if (elPm && typeof pm25 === 'number') elPm.textContent = ` · PM2.5: ${arred(pm25)} µg/m³`;
  }

  limparSkeletons();
}
