import { beforeEach, describe, expect, it, vi } from 'vitest';
import municipiosRaw from '../../data/municipios.json';
import { CAPITAIS } from '../lib/destaques';
import type { Municipio } from '../lib/types';
import { GET } from '../pages/api/busca.json';

type Busca = typeof import('./busca-cidades');
type Contexto = Parameters<typeof GET>[0];

const municipios = municipiosRaw as Municipio[];

// O módulo guarda o índice em variável de módulo: cada teste recarrega o módulo
async function carregarModulo(): Promise<Busca> {
  vi.resetModules();
  return import('./busca-cidades');
}

beforeEach(() => {
  vi.stubGlobal('fetch', async () => GET({} as Contexto));
});

describe('ranking da busca', () => {
  it('cada capital digitada por inteiro é o primeiro resultado', async () => {
    const { buscar, carregarIndice } = await carregarModulo();
    await carregarIndice();
    for (const c of CAPITAIS) {
      const m = municipios.find((x) => x.estado === c.uf && x.slug === c.slug);
      expect(m, `${c.uf}/${c.slug} existe em municipios.json`).toBeDefined();
      const primeiro = buscar(m!.nome)[0];
      expect(`${primeiro?.uf}/${primeiro?.slug}`).toBe(`${c.uf}/${c.slug}`);
    }
  });

  it('nome exato de cidade comum vem antes de nomes que só começam igual', async () => {
    const { buscar, carregarIndice } = await carregarModulo();
    await carregarIndice();
    expect(buscar('campinas')[0]).toMatchObject({ uf: 'sp', slug: 'campinas' });
  });
});
