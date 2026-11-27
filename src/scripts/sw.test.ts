import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chave = { url: string } | string;
type Evento = { request: { method: string; url: string; mode: string }; respondWith: (r: Promise<Response>) => void };

const ORIGEM = 'https://climabr.app';
const PAGINA = `${ORIGEM}/sp/cotia/`;
const SW_URL = new URL('../../public/sw.js', import.meta.url).pathname;

// Cache API mínima em memória: o suficiente para o networkFirst do sw.js
function criarCaches() {
  const lojas = new Map<string, Map<string, Response>>();
  const chave = (r: Chave) => (typeof r === 'string' ? r : r.url);
  return {
    open: async (nome: string) => {
      const loja = lojas.get(nome) ?? new Map<string, Response>();
      lojas.set(nome, loja);
      return {
        put: async (r: Chave, res: Response) => void loja.set(chave(r), res),
        match: async (r: Chave) => loja.get(chave(r))?.clone(),
        keys: async () => [...loja.keys()],
        delete: async (r: Chave) => loja.delete(chave(r)),
      };
    },
    keys: async () => [...lojas.keys()],
    delete: async (nome: string) => lojas.delete(nome),
  };
}

let aoBuscar: (evento: Evento) => void;

async function navegar(rede: () => Promise<Response>): Promise<Response> {
  vi.stubGlobal('fetch', rede);
  let resposta!: Promise<Response>;
  aoBuscar({
    request: { method: 'GET', url: PAGINA, mode: 'navigate' },
    respondWith: (r) => {
      resposta = r;
    },
  });
  return resposta;
}

beforeEach(async () => {
  vi.stubGlobal('caches', criarCaches());
  vi.stubGlobal('self', {
    location: { origin: ORIGEM },
    clients: { claim: async () => {} },
    addEventListener: (tipo: string, fn: (e: Evento) => void) => {
      if (tipo === 'fetch') aoBuscar = fn;
    },
  });
  vi.resetModules();
  // Caminho em variável: o sw.js é script clássico (sem export), então o import literal não tipa
  await import(SW_URL);
});

describe('service worker, navegação network-first', () => {
  it('429 ou 5xx com cópia em cache serve a cópia, não a página de erro', async () => {
    expect(await (await navegar(async () => new Response('<h1>Cotia</h1>'))).text()).toBe('<h1>Cotia</h1>');
    const bloqueada = await navegar(async () => new Response('error code: 1015', { status: 429 }));
    expect(bloqueada.status).toBe(200);
    expect(await bloqueada.text()).toBe('<h1>Cotia</h1>');
    const quebrada = await navegar(async () => new Response('bad gateway', { status: 502 }));
    expect(await quebrada.text()).toBe('<h1>Cotia</h1>');
  });

  it('429 sem cópia em cache devolve a própria resposta', async () => {
    const r = await navegar(async () => new Response('error code: 1015', { status: 429 }));
    expect(r.status).toBe(429);
  });

  it('404 não é trocado pela cópia antiga', async () => {
    await navegar(async () => new Response('<h1>Cotia</h1>'));
    const r = await navegar(async () => new Response('nao existe', { status: 404 }));
    expect(r.status).toBe(404);
  });
});
