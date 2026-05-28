import type { APIRoute } from 'astro';
import municipiosRaw from '../../../../data/municipios.json';
import type { Municipio } from '../../../lib/types';

const ESTADOS = [...new Set((municipiosRaw as Municipio[]).map((m) => m.estado))];

export function getStaticPaths() {
  return ESTADOS.map((estado) => ({ params: { estado } }));
}

export const GET: APIRoute = async ({ params }) => {
  const { estado } = params;

  let alertas: unknown[] = [];

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const filePath = path.join(process.cwd(), 'data', 'alertas', `${estado}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    alertas = JSON.parse(raw);
  } catch {
    // Sem alertas ativos ou arquivo ainda não gerado
  }

  return new Response(
    JSON.stringify({
      estado: estado?.toUpperCase(),
      alertas,
      atualizado_em: new Date().toISOString(),
      _fonte: 'INMET / Defesa Civil',
    }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800',
      },
    }
  );
};
