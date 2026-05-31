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

async function buscarOpenMeteo(lat: number, lon: number): Promise<any> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,weather_code,relative_humidity_2m,pressure_msl,dew_point_2m`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum`
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

export async function hidratarClima(): Promise<void> {
  const root = document.getElementById('clima-root');
  if (!root) return;

  const lat = parseFloat(root.dataset.lat ?? '');
  const lon = parseFloat(root.dataset.lon ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  let data: any;
  try {
    data = await buscarOpenMeteo(lat, lon);
  } catch {
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

  // Temperatura atual
  const tempEl = document.getElementById('clima-agora');
  const tAtual = data?.current?.temperature_2m;
  if (tempEl && typeof tAtual === 'number') {
    tempEl.textContent = `${arred(tAtual)}°C agora`;
    tempEl.hidden = false;
  }

  // Previsão 7 dias (atualiza os cards já renderizados no servidor)
  const grid = document.querySelector<HTMLElement>('[data-previsao-grid]');
  const daily = data?.daily;
  if (grid && Array.isArray(daily?.time) && daily.time.length) {
    const dias: DiaPrevisao[] = daily.time.slice(0, 7).map((t: string, i: number) => ({
      data: t,
      min: arred(daily.temperature_2m_min[i]),
      max: arred(daily.temperature_2m_max[i]),
      chuva: arred(daily.precipitation_sum?.[i] ?? 0),
      cond: WMO_DESCRICAO[daily.weather_code[i]] ?? `Código ${daily.weather_code[i]}`,
    }));

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
  }
}
