// Botão "Copiar" nos blocos de comando marcados com data-copiar.
// Progressive enhancement: sem JS o comando continua legível e selecionável.
export function ativarCopiar(): void {
  document.querySelectorAll<HTMLElement>('pre[data-copiar]').forEach((pre) => {
    if (pre.querySelector('button')) return;
    pre.classList.add('relative', 'pr-20');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copiar';
    btn.setAttribute('aria-label', 'Copiar comando');
    btn.className =
      'absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-input bg-card px-3 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';
    btn.addEventListener('click', async () => {
      const texto = (pre.querySelector('code')?.textContent ?? '').replace(/^\$\s*/, '').trim();
      try {
        await navigator.clipboard.writeText(texto);
        btn.textContent = 'Copiado';
      } catch {
        btn.textContent = 'Selecione e copie';
      }
      setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
    pre.appendChild(btn);
  });
}
