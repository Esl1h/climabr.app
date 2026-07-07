// Busca de cidades compartilhada entre o header (PainelLayout) e a home.
// Usa delegação de eventos no document: sobrevive às trocas de página do
// ClientRouter (View Transitions) sem precisar re-registrar listeners.
// Qualquer <input data-busca-cidade aria-controls="id-da-lista"> vira combobox.

export interface CidadeIndice {
  nome: string;
  slug: string;
  uf: string;
  lat: number | null;
  lon: number | null;
  chave: string;
}

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let indice: CidadeIndice[] | null = null;
let carregando: Promise<CidadeIndice[] | null> | null = null;

export function carregarIndice(): Promise<CidadeIndice[] | null> {
  if (indice) return Promise.resolve(indice);
  if (!carregando) {
    carregando = fetch('/api/busca.json')
      .then((r) => r.json())
      .then((bruto: [string, string, string, number | null, number | null][]) => {
        indice = bruto.map(([nome, slug, uf, lat, lon]) => ({ nome, slug, uf, lat, lon, chave: normalizar(nome) }));
        return indice;
      })
      .catch(() => {
        carregando = null; // permite nova tentativa
        return null;
      });
  }
  return carregando;
}

export function buscar(termo: string, max = 8): CidadeIndice[] {
  if (!indice) return [];
  const t = normalizar(termo.trim());
  if (t.length < 2) return [];
  const comeca: CidadeIndice[] = [];
  const contem: CidadeIndice[] = [];
  for (const m of indice) {
    if (m.chave.startsWith(t)) {
      if (comeca.length < max) comeca.push(m);
      if (comeca.length >= max) break;
    } else if (m.chave.includes(t) && contem.length < max) {
      contem.push(m);
    }
  }
  return [...comeca, ...contem].slice(0, max);
}

// Distância aproximada (equiretangular): suficiente para achar a cidade mais próxima
export function maisProxima(lat: number, lon: number): CidadeIndice | null {
  if (!indice) return null;
  let melhor: CidadeIndice | null = null;
  let menor = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const m of indice) {
    if (m.lat == null || m.lon == null) continue;
    const dLat = m.lat - lat;
    const dLon = (m.lon - lon) * cosLat;
    const d = dLat * dLat + dLon * dLon;
    if (d < menor) {
      menor = d;
      melhor = m;
    }
  }
  return melhor;
}

function listaDe(input: HTMLInputElement): HTMLElement | null {
  return document.getElementById(input.getAttribute('aria-controls') ?? '');
}

function fechar(input: HTMLInputElement): void {
  listaDe(input)?.classList.add('hidden');
  input.setAttribute('aria-expanded', 'false');
  delete input.dataset.sel;
}

function opcoes(lista: HTMLElement): HTMLElement[] {
  return Array.from(lista.querySelectorAll<HTMLElement>('[role="option"]'));
}

function marcarSelecao(input: HTMLInputElement, lista: HTMLElement): void {
  const sel = Number(input.dataset.sel ?? '-1');
  opcoes(lista).forEach((op, i) => {
    op.setAttribute('aria-selected', String(i === sel));
    op.classList.toggle('bg-accent', i === sel);
  });
}

function render(input: HTMLInputElement): void {
  const lista = listaDe(input);
  if (!lista) return;
  const termo = normalizar(input.value.trim());
  if (termo.length < 2) {
    lista.innerHTML = '';
    fechar(input);
    return;
  }
  lista.innerHTML = '';
  delete input.dataset.sel;
  if (!indice) {
    const li = document.createElement('li');
    li.className = 'px-3 py-2 text-sm text-muted-foreground';
    li.textContent = 'Carregando municípios…';
    lista.appendChild(li);
  } else {
    const resultados = buscar(input.value);
    if (resultados.length === 0) {
      const li = document.createElement('li');
      li.className = 'px-3 py-2 text-sm text-muted-foreground';
      li.textContent = 'Nenhuma cidade encontrada';
      lista.appendChild(li);
    } else {
      for (const m of resultados) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const a = document.createElement('a');
        a.href = `/${m.uf}/${m.slug}`;
        a.className = 'flex items-center justify-between gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors';
        const nome = document.createElement('span');
        nome.textContent = m.nome;
        const uf = document.createElement('span');
        uf.className = 'text-xs text-muted-foreground uppercase';
        uf.textContent = m.uf;
        a.append(nome, uf);
        li.appendChild(a);
        lista.appendChild(li);
      }
    }
  }
  lista.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
}

function ehBusca(el: EventTarget | null): HTMLInputElement | null {
  return el instanceof HTMLInputElement && el.hasAttribute('data-busca-cidade') ? el : null;
}

let instalada = false;

export function instalarBuscaGlobal(): void {
  if (instalada) return;
  instalada = true;

  document.addEventListener('focusin', (e) => {
    const input = ehBusca(e.target);
    if (input) carregarIndice().then(() => {
      if (document.activeElement === input && input.value.trim().length >= 2) render(input);
    });
  });

  document.addEventListener('input', (e) => {
    const input = ehBusca(e.target);
    if (!input) return;
    carregarIndice().then(() => {
      if (document.activeElement === input) render(input);
    });
    render(input);
  });

  document.addEventListener('keydown', (e) => {
    const input = ehBusca(e.target);
    if (!input) {
      // Atalho "/" foca a busca (fora de campos editáveis)
      const t = e.target as HTMLElement | null;
      const editavel = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !editavel && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const alvo = document.querySelector<HTMLInputElement>('[data-busca-cidade]');
        if (alvo) {
          e.preventDefault();
          alvo.focus();
        }
      }
      return;
    }
    const lista = listaDe(input);
    if (!lista) return;
    const ops = opcoes(lista);
    const sel = Number(input.dataset.sel ?? '-1');
    if (e.key === 'ArrowDown' && ops.length) {
      e.preventDefault();
      input.dataset.sel = String((sel + 1) % ops.length);
      marcarSelecao(input, lista);
    } else if (e.key === 'ArrowUp' && ops.length) {
      e.preventDefault();
      input.dataset.sel = String((sel - 1 + ops.length) % ops.length);
      marcarSelecao(input, lista);
    } else if (e.key === 'Enter') {
      const alvo = ops[sel >= 0 ? sel : 0]?.querySelector('a');
      if (alvo) {
        e.preventDefault();
        window.location.href = alvo.href;
      }
    } else if (e.key === 'Escape') {
      fechar(input);
    }
  });

  // Clique fora fecha qualquer combobox aberto
  document.addEventListener('click', (e) => {
    document.querySelectorAll<HTMLInputElement>('[data-busca-cidade]').forEach((input) => {
      const lista = listaDe(input);
      const dentro = e.target instanceof Node && (input.contains(e.target) || lista?.contains(e.target));
      if (!dentro) fechar(input);
    });
  });
}
