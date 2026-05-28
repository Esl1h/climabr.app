import type { APIRoute } from 'astro';
import municipiosRaw from '../../../../data/municipios.json';
import type { Municipio } from '../../../lib/types';

export async function getStaticPaths() {
  const municipios = municipiosRaw as Municipio[];
  return municipios.map((m) => ({
    params: { estado: m.estado, cidade: m.slug },
    props: { municipio: m },
  }));
}

export const GET: APIRoute = async ({ params, props }) => {
  const { estado, cidade } = params;
  const { municipio } = props as { municipio: Municipio };

  let dados = null;

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const filePath = path.join(process.cwd(), 'data', 'cidades', estado!, `${cidade}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    dados = JSON.parse(raw);
  } catch {
    dados = {
      cidade: municipio.nome,
      estado: municipio.estado.toUpperCase(),
      slug: municipio.slug,
      latitude: municipio.lat,
      longitude: municipio.lon,
      atualizado_em: null,
      _status: 'sem_dados',
      _mensagem: 'Dados ainda não coletados para este município.',
    };
  }

  return new Response(JSON.stringify(dados, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
