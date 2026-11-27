import type { APIRoute } from 'astro';
import municipiosRaw from '../../../data/municipios.json';
import { CAPITAIS } from '../../lib/destaques';
import type { Municipio } from '../../lib/types';

const capitais = new Set(CAPITAIS.map((c) => `${c.uf}/${c.slug}`));

// Índice compacto para a busca client-side: [nome, slug, uf, lat, lon].
// Formato posicional para reduzir payload (~5.571 municípios).
// lat/lon alimentam o "usar minha localização" da home.
// A busca mostra os primeiros acertos na ordem do índice e o Enter abre o 1º:
// capitais e nomes curtos primeiro põem "natal" em Natal, não em Natalândia.
export const GET: APIRoute = async () => {
  const municipios = (municipiosRaw as Municipio[]).toSorted(
    (a, b) =>
      Number(!capitais.has(`${a.estado}/${a.slug}`)) - Number(!capitais.has(`${b.estado}/${b.slug}`)) ||
      a.nome.length - b.nome.length,
  );
  const indice = municipios.map((m) => [m.nome, m.slug, m.estado, m.lat ?? null, m.lon ?? null]);

  return new Response(JSON.stringify(indice), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
