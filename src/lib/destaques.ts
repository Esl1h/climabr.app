// Agregações build-time sobre data/cidades/ para a home e /rankings.
// Roda só no build (2x/dia via deploy): zero custo em runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import municipiosRaw from '../../data/municipios.json';
import type { Municipio } from './types';

export interface ResumoCidade {
  nome: string;
  uf: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  temperatura: number | null;
  aqi: number | null;
  aqiCategoria: string | null;
  aqiAtualizadoEm: string | null;
  reservatorioPct: number | null;
  reservatorioNome: string | null;
  reservatorioAproximado: boolean;
  reservatorioAcumula: boolean;
  reservatorioFonte: string | null;
  reservatorioMedicao: string | null;
  focos: number | null;
  focosAtualizadoEm: string | null;
  dengueNivel: number | null;
  dengueLabel: string | null;
  dengueCasos: number | null;
  dengueIncidencia: number | null;
  denguePopulacao: number | null;
  dengueSemana: number | null;
}

export const CAPITAIS: { uf: string; slug: string }[] = [
  { uf: 'ac', slug: 'rio-branco' },
  { uf: 'al', slug: 'maceio' },
  { uf: 'ap', slug: 'macapa' },
  { uf: 'am', slug: 'manaus' },
  { uf: 'ba', slug: 'salvador' },
  { uf: 'ce', slug: 'fortaleza' },
  { uf: 'df', slug: 'brasilia' },
  { uf: 'es', slug: 'vitoria' },
  { uf: 'go', slug: 'goiania' },
  { uf: 'ma', slug: 'sao-luis' },
  { uf: 'mt', slug: 'cuiaba' },
  { uf: 'ms', slug: 'campo-grande' },
  { uf: 'mg', slug: 'belo-horizonte' },
  { uf: 'pa', slug: 'belem' },
  { uf: 'pb', slug: 'joao-pessoa' },
  { uf: 'pr', slug: 'curitiba' },
  { uf: 'pe', slug: 'recife' },
  { uf: 'pi', slug: 'teresina' },
  { uf: 'rj', slug: 'rio-de-janeiro' },
  { uf: 'rn', slug: 'natal' },
  { uf: 'rs', slug: 'porto-alegre' },
  { uf: 'ro', slug: 'porto-velho' },
  { uf: 'rr', slug: 'boa-vista' },
  { uf: 'sc', slug: 'florianopolis' },
  { uf: 'sp', slug: 'sao-paulo' },
  { uf: 'se', slug: 'aracaju' },
  { uf: 'to', slug: 'palmas' },
];

function resumir(uf: string, slug: string, d: any): ResumoCidade {
  return {
    nome: d.cidade ?? slug,
    uf,
    slug,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    // Snapshot de um instante da coleta incremental (pode ter 1-3 dias):
    // serve de fallback sem JS, mas quem exibe como "agora" precisa hidratar
    // no cliente via scripts/agora-cliente.ts
    temperatura: d.temperatura_atual ?? null,
    aqi: d.qualidade_ar?.indice ?? null,
    aqiCategoria: d.qualidade_ar?.categoria ?? null,
    aqiAtualizadoEm: d.qualidade_ar?.atualizado_em ?? null,
    reservatorioPct: d.reservatorio?.nivel_pct ?? null,
    reservatorioNome: d.reservatorio?.nome ?? null,
    reservatorioAproximado: d.reservatorio?.aproximado ?? false,
    // Só o ONS marca o tipo; sistema de abastecimento é sempre de acumulação
    reservatorioAcumula: d.reservatorio?.acumula ?? true,
    reservatorioFonte: d.reservatorio?.fonte ?? null,
    reservatorioMedicao: d.reservatorio?.data_medicao ?? null,
    focos: d.queimadas?.focos_100km ?? null,
    focosAtualizadoEm: d.queimadas?.atualizado_em ?? null,
    dengueNivel: d.dengue?.nivel_alerta ?? null,
    dengueLabel: d.dengue?.nivel_label ?? null,
    dengueCasos: d.dengue?.casos_semana ?? null,
    dengueIncidencia: d.dengue?.incidencia_100k ?? null,
    denguePopulacao: d.dengue?.populacao ?? null,
    dengueSemana: d.dengue?.semana_epidemiologica ?? null,
  };
}

// Municípios válidos (IBGE). Arquivos soltos em data/cidades/ que não batem com
// esta lista são resto de coleta antiga: já colocaram uma "Petrolina/BA" (a
// cidade é de PE) em primeiro lugar no ranking de reservatórios, com um nível
// zerado que não existia mais na fonte. O filtro impede que isso volte.
const VALIDOS = new Set(
  (municipiosRaw as Municipio[]).map((m) => `${m.estado}/${m.slug}`)
);

// Cache de módulo: no build tudo roda uma vez; no dev evita reler 5.571
// arquivos a cada reload da home
let cacheTodas: Promise<ResumoCidade[]> | null = null;

export function lerTodas(): Promise<ResumoCidade[]> {
  if (!cacheTodas) {
    cacheTodas = (async () => {
      const base = path.join(process.cwd(), 'data', 'cidades');
      const resultado: ResumoCidade[] = [];
      let ufs: string[] = [];
      try {
        ufs = await fs.readdir(base);
      } catch {
        return resultado;
      }
      for (const uf of ufs) {
        const dir = path.join(base, uf);
        let arquivos: string[] = [];
        try {
          arquivos = await fs.readdir(dir);
        } catch {
          continue;
        }
        for (const arq of arquivos) {
          if (!arq.endsWith('.json')) continue;
          const slug = arq.replace(/\.json$/, '');
          if (!VALIDOS.has(`${uf}/${slug}`)) continue;
          try {
            const bruto = await fs.readFile(path.join(dir, arq), 'utf-8');
            resultado.push(resumir(uf, slug, JSON.parse(bruto)));
          } catch {
            /* arquivo corrompido ou em escrita: ignora */
          }
        }
      }
      return resultado;
    })();
  }
  return cacheTodas;
}

export async function capitaisAgora(): Promise<ResumoCidade[]> {
  const todas = await lerTodas();
  const porChave = new Map(todas.map((c) => [`${c.uf}/${c.slug}`, c]));
  return CAPITAIS
    .map((c) => porChave.get(`${c.uf}/${c.slug}`))
    .filter((c): c is ResumoCidade => Boolean(c))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Distância em km entre duas cidades (haversine) */
function distanciaKm(a: ResumoCidade, b: ResumoCidade): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const la1 = rad(a.latitude!);
  const la2 = rad(b.latitude!);
  const dLat = la2 - la1;
  const dLon = rad(b.longitude!) - rad(a.longitude!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export interface ItemAgrupado {
  cidade: ResumoCidade;
  /** Cidades vizinhas que representam a MESMA ocorrência, não outra */
  vizinhas: number;
}

/**
 * Colapsa cidades vizinhas que estão medindo o mesmo fenômeno.
 *
 * Sem isso o ranking mente por repetição: `focos_100km` conta focos num raio de
 * 100 km, então quatro municípios ao redor do mesmo incêndio no Pantanal viram
 * quatro linhas do top 10; e o Copernicus entrega uma célula de grade para
 * várias cidades, o que já pôs seis municípios com AQI 154 idêntico em sequência.
 *
 * A lista precisa chegar ordenada da pior para a melhor: o primeiro de cada
 * cluster é quem representa a ocorrência, e os demais viram contagem.
 */
export function agruparPorProximidade(
  ordenadas: ResumoCidade[],
  raioKm: number
): ItemAgrupado[] {
  const grupos: ItemAgrupado[] = [];
  for (const c of ordenadas) {
    if (c.latitude == null || c.longitude == null) continue;
    const existente = grupos.find((g) => distanciaKm(g.cidade, c) < raioKm);
    if (existente) existente.vizinhas += 1;
    else grupos.push({ cidade: c, vizinhas: 0 });
  }
  return grupos;
}

export interface Reservatorio {
  nome: string;
  pct: number;
  fonte: string | null;
  medicao: string | null;
  /** Quantos municípios do site dependem (ou são associados a) este reservatório */
  cidades: number;
  /** Cidade de exemplo, para o link */
  exemplo: ResumoCidade;
}

/**
 * Um reservatório abastece dezenas de municípios, então ranquear CIDADES por
 * nível de reservatório produz a mesma barragem repetida: o Cantareira sozinho
 * ocupava 14 das 15 linhas. O ranking honesto é por reservatório.
 *
 * `aproximado` marca a associação cidade↔reservatório como incerta (é o
 * hidrelétrico mais próximo, não necessariamente quem abastece), não o nível:
 * o valor medido pelo ONS/ANA é igualmente confiável nos dois casos. Por isso
 * as duas listas existem, separadas e rotuladas.
 */
export function agruparReservatorios(
  todas: ResumoCidade[],
  aproximados: boolean
): Reservatorio[] {
  const porNome = new Map<string, Reservatorio>();
  for (const c of todas) {
    if (c.reservatorioPct == null || !c.reservatorioNome) continue;
    if (c.reservatorioAproximado !== aproximados) continue;
    // Fio d'água não acumula por projeto: o volume útil que o ONS publica para
    // essas usinas oscila em torno de zero e chega a vir negativo (virando 0,0%
    // no clamp do scraper). Num ranking de "mais baixos" elas ficariam no topo
    // o ano inteiro sem indicar escassez nenhuma.
    if (!c.reservatorioAcumula) continue;
    const atual = porNome.get(c.reservatorioNome);
    if (atual) {
      atual.cidades += 1;
    } else {
      porNome.set(c.reservatorioNome, {
        nome: c.reservatorioNome,
        pct: c.reservatorioPct,
        fonte: c.reservatorioFonte,
        medicao: c.reservatorioMedicao,
        cidades: 1,
        exemplo: c,
      });
    }
  }
  return [...porNome.values()].sort((a, b) => a.pct - b.pct);
}

/** Data mais recente entre os carimbos de uma lista, para datar cada seção */
export function maisRecente(datas: (string | null)[]): string | null {
  let melhor: number | null = null;
  for (const d of datas) {
    const t = d ? Date.parse(d) : NaN;
    if (Number.isFinite(t) && (melhor == null || t > melhor)) melhor = t;
  }
  return melhor == null ? null : new Date(melhor).toISOString();
}

// Classes de cor por severidade (tokens de status do global.css)
export function corAqiTexto(aqi: number): string {
  if (aqi <= 50) return 'text-status-bom';
  if (aqi <= 100) return 'text-status-moderado';
  if (aqi <= 150) return 'text-status-ruim';
  if (aqi <= 200) return 'text-status-pessimo';
  return 'text-status-critico';
}

export function corReservatorioTexto(pct: number): string {
  if (pct >= 70) return 'text-status-bom';
  if (pct >= 40) return 'text-status-moderado';
  return 'text-status-pessimo';
}

export function corFocosTexto(focos: number): string {
  if (focos === 0) return 'text-status-bom';
  if (focos <= 5) return 'text-status-moderado';
  if (focos <= 20) return 'text-status-ruim';
  return 'text-status-pessimo';
}

export function corDengueTexto(nivel: number): string {
  return ['text-status-bom', 'text-status-moderado', 'text-status-ruim', 'text-status-pessimo', 'text-status-critico'][nivel] ?? 'text-muted-foreground';
}
