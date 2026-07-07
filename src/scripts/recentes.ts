// Histórico de cidades visitadas (localStorage), consumido pelos chips
// "Recentes" da home. Chamado pela página de cidade a cada visita.
export function salvarRecente(): void {
  const root = document.getElementById('clima-root');
  const { uf, slug, nome } = (root as HTMLElement | null)?.dataset ?? {};
  if (!uf || !slug || !nome) return;
  try {
    const bruto = JSON.parse(localStorage.getItem('climabr_recentes') ?? '[]');
    const lista = (Array.isArray(bruto) ? bruto : []).filter(
      (r: { uf?: string; slug?: string }) => !(r?.uf === uf && r?.slug === slug)
    );
    lista.unshift({ uf, slug, nome });
    localStorage.setItem('climabr_recentes', JSON.stringify(lista.slice(0, 5)));
  } catch {
    /* localStorage indisponível */
  }
}
