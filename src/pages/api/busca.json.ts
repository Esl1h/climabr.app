import type { APIRoute } from 'astro';
import municipiosRaw from '../../../data/municipios.json';
import type { Municipio } from '../../lib/types';

// Índice compacto para a busca client-side: [nome, slug, uf, lat, lon].
// Formato posicional para reduzir payload (~5.571 municípios).
// lat/lon alimentam o "usar minha localização" da home.
export const GET: APIRoute = async () => {
  const municipios = municipiosRaw as Municipio[];
  const indice = municipios.map((m) => [m.nome, m.slug, m.estado, m.lat ?? null, m.lon ?? null]);

  return new Response(JSON.stringify(indice), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
