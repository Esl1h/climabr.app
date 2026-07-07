// Service worker do ClimaBR.app.
// Estratégia: só cache de runtime, sem pré-cache (são 5.572 páginas HTML;
// pré-cachear tudo estouraria o storage do usuário e o manifesto do SW).
// - Páginas (navigate): NetworkFirst — offline serve a última versão vista
// - Assets com hash (/_astro/): CacheFirst — imutáveis por definição
// - API JSON: NetworkFirst com validade curta
const VERSAO = 'v1';
const CACHE_PAGINAS = `paginas-${VERSAO}`;
const CACHE_ASSETS = `assets-${VERSAO}`;
const CACHE_API = `api-${VERSAO}`;
const CACHES_ATUAIS = [CACHE_PAGINAS, CACHE_ASSETS, CACHE_API];
const LIMITE_PAGINAS = 30;
const LIMITE_API = 30;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => !CACHES_ATUAIS.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function aparar(cache, limite) {
  const chaves = await cache.keys();
  if (chaves.length > limite) {
    await cache.delete(chaves[0]);
    await aparar(cache, limite);
  }
}

async function networkFirst(requisicao, nomeCache, limite) {
  const cache = await caches.open(nomeCache);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) {
      await cache.put(requisicao, resposta.clone());
      aparar(cache, limite);
    }
    return resposta;
  } catch (erro) {
    const emCache = await cache.match(requisicao);
    if (emCache) return emCache;
    throw erro;
  }
}

async function cacheFirst(requisicao, nomeCache) {
  const cache = await caches.open(nomeCache);
  const emCache = await cache.match(requisicao);
  if (emCache) return emCache;
  const resposta = await fetch(requisicao);
  if (resposta.ok) await cache.put(requisicao, resposta.clone());
  return resposta;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Cross-origin (Open-Meteo, analytics) segue direto para a rede
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith(networkFirst(request, CACHE_PAGINAS, LIMITE_PAGINAS));
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    evento.respondWith(cacheFirst(request, CACHE_ASSETS));
    return;
  }
  if (url.pathname.startsWith('/api/') && url.pathname.endsWith('.json')) {
    evento.respondWith(networkFirst(request, CACHE_API, LIMITE_API));
  }
});
