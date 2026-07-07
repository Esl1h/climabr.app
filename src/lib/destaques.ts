// Agregações build-time sobre data/cidades/ para a home e /rankings.
// Roda só no build (2x/dia via deploy): zero custo em runtime.
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ResumoCidade {
  nome: string;
  uf: string;
  slug: string;
  temperatura: number | null;
  aqi: number | null;
  aqiCategoria: string | null;
  reservatorioPct: number | null;
  reservatorioNome: string | null;
  reservatorioAproximado: boolean;
  focos: number | null;
  dengueNivel: number | null;
  dengueLabel: string | null;
  dengueCasos: number | null;
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
    temperatura: d.temperatura_atual ?? null,
    aqi: d.qualidade_ar?.indice ?? null,
    aqiCategoria: d.qualidade_ar?.categoria ?? null,
    reservatorioPct: d.reservatorio?.nivel_pct ?? null,
    reservatorioNome: d.reservatorio?.nome ?? null,
    reservatorioAproximado: d.reservatorio?.aproximado ?? false,
    focos: d.queimadas?.focos_100km ?? null,
    dengueNivel: d.dengue?.nivel_alerta ?? null,
    dengueLabel: d.dengue?.nivel_label ?? null,
    dengueCasos: d.dengue?.casos_semana ?? null,
  };
}

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
          try {
            const bruto = await fs.readFile(path.join(dir, arq), 'utf-8');
            resultado.push(resumir(uf, arq.replace(/\.json$/, ''), JSON.parse(bruto)));
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
