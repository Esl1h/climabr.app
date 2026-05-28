import type { APIRoute } from 'astro';
import municipiosRaw from '../../data/municipios.json';
import type { Municipio } from '../lib/types';

const municipios = municipiosRaw as Municipio[];
const SITE = 'https://climabr.app';
const HOJE = new Date().toISOString().split('T')[0];

export const GET: APIRoute = () => {
  const urls: string[] = [
    `  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority><lastmod>${HOJE}</lastmod></url>`,
    `  <url><loc>${SITE}/curl</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...municipios.map(
      (m) =>
        `  <url><loc>${SITE}/${m.estado}/${m.slug}</loc><changefreq>hourly</changefreq><priority>0.8</priority><lastmod>${HOJE}</lastmod></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
