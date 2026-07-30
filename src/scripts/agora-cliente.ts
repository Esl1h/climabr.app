/**
 * Hidratação client-side dos blocos "agora" da home e da página de estado.
 *
 * O HTML dessas páginas é estático (build 2x/dia) e o snapshot de
 * `data/cidades/` é coletado de forma incremental: o `temperatura_atual`
 * gravado ali é a leitura de um instante único (madrugada/manhã, UTC) e pode
 * ter 1-3 dias, então não serve como "agora". A página de cidade já busca o
 * Open-Meteo ao vivo no browser (`previsao-cliente.ts`) e por isso divergia
 * dos cards da home e do estado.
 *
 * Este módulo resolve a divergência buscando as mesmas condições atuais para
 * todos os pontos marcados com `data-agora`, em UMA requisição por endpoint
 * (o Open-Meteo aceita listas de coordenadas e devolve um array na mesma
 * ordem). Em caso de falha, mantém o snapshot do build.
 *
 * Não toca a Cloudflare: os bytes vão direto do Open-Meteo ao cliente.
 */
import { corAqi, catAqi } from './cores-status';

const TTL_MS = 10 * 60_000; // mesmo cache curto da página de cidade

interface Ponto {
  el: HTMLElement;
  lat: number;
  lon: number;
}

// Open-Meteo devolve objeto para uma coordenada e array para várias
function comoLista(d: unknown): any[] {
  return Array.isArray(d) ? d : [d];
}

// Requisições em voo, por URL. A home chama hidratarAgora() na carga do script
// e de novo no astro:page-load; sem isso a mesma coleta sairia duas vezes,
// porque nenhuma das duas teria gravado o sessionStorage ainda.
const emVoo = new Map<string, Promise<any[] | null>>();

function buscarLote(url: string, chave: string): Promise<any[] | null> {
  try {
    const raw = sessionStorage.getItem(chave);
    if (raw) {
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < TTL_MS) return Promise.resolve(comoLista(d));
    }
  } catch { /* sessionStorage indisponível: segue para a rede */ }

  const pendente = emVoo.get(url);
  if (pendente) return pendente;

  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      try { sessionStorage.setItem(chave, JSON.stringify({ t: Date.now(), d })); } catch { /* cota cheia/privado: ignora */ }
      return comoLista(d);
    } catch {
      return null;
    } finally {
      emVoo.delete(url);
    }
  })();

  emVoo.set(url, p);
  return p;
}

function preencherTemperatura(el: HTMLElement, temp: unknown): void {
  const alvo = el.querySelector<HTMLElement>('[data-agora-temp]');
  if (alvo && typeof temp === 'number') {
    alvo.textContent = `${Math.round(temp)}°`;
    el.dataset.temp = String(temp); // guardado para a reordenação do ranking
  }
}

/**
 * Reordena listas marcadas com `data-agora-ordenar` pela temperatura ao vivo.
 *
 * Um ranking de temperatura não pode sair do snapshot: `data/cidades/` é
 * coletado de forma incremental e hoje tem leituras de 1 a 6 dias diferentes,
 * então a ordem do build compara cidades em dias distintos. O HTML sai ordenado
 * pelo snapshot só para ter algo coerente sem JS; aqui a ordem vira real.
 */
function ordenarRankings(): void {
  for (const lista of document.querySelectorAll<HTMLElement>('[data-agora-ordenar]')) {
    const itens = [...lista.querySelectorAll<HTMLElement>('[data-agora]')];
    // Ordem parcial seria pior que a do snapshot: só reordena com todos os valores
    if (itens.length === 0 || itens.some((i) => i.dataset.temp == null)) continue;
    itens.sort((a, b) => Number(b.dataset.temp) - Number(a.dataset.temp));
    for (const [i, item] of itens.entries()) {
      const pos = item.querySelector<HTMLElement>('[data-agora-pos]');
      if (pos) pos.textContent = `${i + 1}.`;
      lista.appendChild(item);
    }
    lista.dataset.agoraOrdenado = '1';
  }
}

function preencherAqi(el: HTMLElement, aqi: unknown): void {
  const alvo = el.querySelector<HTMLElement>('[data-agora-aqi]');
  if (!alvo || typeof aqi !== 'number') return;
  const a = Math.round(aqi);
  alvo.textContent = `AQI ${a}`;
  alvo.style.color = corAqi(a);
  alvo.title = `Qualidade do ar: ${catAqi(a)}`;
  alvo.hidden = false;
}

export async function hidratarAgora(): Promise<void> {
  const pontos: Ponto[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-agora]')) {
    const lat = parseFloat(el.dataset.lat ?? '');
    const lon = parseFloat(el.dataset.lon ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lon)) pontos.push({ el, lat, lon });
  }
  if (pontos.length === 0) return;

  const lats = pontos.map((p) => p.lat.toFixed(4)).join(',');
  const lons = pontos.map((p) => p.lon.toFixed(4)).join(',');
  const coords = `latitude=${lats}&longitude=${lons}`;

  const [clima, ar] = await Promise.all([
    buscarLote(
      `https://api.open-meteo.com/v1/forecast?${coords}&current=temperature_2m&timezone=America%2FSao_Paulo&forecast_days=1`,
      `om-agora:${lats}`
    ),
    buscarLote(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${coords}&current=us_aqi&timezone=America%2FSao_Paulo`,
      `om-agora-aq:${lats}`
    ),
  ]);

  if (!clima && !ar) return; // mantém o snapshot do build

  pontos.forEach((p, i) => {
    if (clima) preencherTemperatura(p.el, clima[i]?.current?.temperature_2m);
    if (ar) preencherAqi(p.el, ar[i]?.current?.us_aqi);
  });

  // Só afirma "ao vivo" quando a temperatura realmente chegou
  if (clima) {
    ordenarRankings();
    for (const el of document.querySelectorAll<HTMLElement>('[data-agora-selo]')) {
      el.textContent = 'Temperatura e qualidade do ar medidas agora · Open-Meteo';
    }
  }
}
