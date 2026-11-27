// Cache em sessionStorage com validade curta para as respostas do Open-Meteo:
// evita martelar a API e piscar a tela ao navegar entre páginas.
// Sem sessionStorage (modo privado, cota cheia) tudo cai para a rede.

const TTL_MS = 10 * 60_000;

/** Valor guardado e ainda válido; undefined se ausente, vencido ou ilegível */
export function lerCache<T = any>(chave: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(chave);
    if (raw) {
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < TTL_MS) return d as T;
    }
  } catch { /* sessionStorage indisponível: segue para a rede */ }
  return undefined;
}

export function gravarCache(chave: string, d: unknown): void {
  try {
    sessionStorage.setItem(chave, JSON.stringify({ t: Date.now(), d }));
  } catch { /* cota cheia ou modo privado: ignora */ }
}
