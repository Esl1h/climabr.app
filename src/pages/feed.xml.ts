import type { APIRoute } from 'astro';
import { lerTodas } from '../lib/destaques';
import type { Municipio } from '../lib/types';

/**
 * Feed RSS gerado no build (2x/dia, junto do deploy): custo zero em runtime.
 * Itens: alertas meteorológicos vigentes do INMET por UF + destaques nacionais
 * de reservatório, queimadas e dengue (top 3 de cada). O objetivo é chegar em
 * agregadores/Bing News e dar aos LLMs um corte fresco do estado do site.
 */
const SITE = 'https://climabr.app';
const AGORA = new Date().toUTCString();

interface AvisoResumo { evento: string; nivel: number; fim: string | null }
const modulos = import.meta.glob<{ default: AvisoResumo[] }>('../../data/alertas/*.json', { eager: true });

export const GET: APIRoute = async () => {
  const agoraTs = Date.now();
  const municipios: Municipio[] = (await import('../../data/municipios.json')).default;
  const nomeUf = new Map(municipios.map((m) => [m.estado, m.estado_nome]));

  interface Item { titulo: string; link: string; description: string; publicacao: string }
  const itens: Item[] = [];

  // Alertas INMET por UF (pior aviso ativo)
  for (const [caminho, mod] of Object.entries(modulos)) {
    const uf = caminho.split('/').pop()!.replace('.json', '');
    const ativos = mod.default.filter((a) => !a.fim || Date.parse(a.fim) > agoraTs);
    if (ativos.length === 0) continue;
    const pior = ativos.reduce((m, a) => (a.nivel > m.nivel ? a : m));
    itens.push({
      titulo: `Alerta INMET ${pior.nivel >= 3 ? 'de grande perigo' : pior.nivel === 2 ? '(perigo)' : '(perigo potencial)'}: ${pior.evento} em ${uf.toUpperCase()}`,
      link: `${SITE}/${uf}`,
      description: `Aviso vigente do INMET para ${nomeUf.get(uf) ?? uf}${ativos.length > 1 ? ` (mais ${ativos.length - 1} aviso(s) ativo(s) para o estado)` : ''}, válido até ${pior.fim ?? 'novo aviso'}.`,
      publicacao: new Date(Date.now() - 3600_000).toUTCString(),
    });
  }

  // Destaques nacionais (top 3 de cada)
  const todas = await lerTodas();
  for (const c of todas
    .filter((c) => c.reservatorioPct != null && c.reservatorioPct < 40 && !c.reservatorioAproximado)
    .sort((a, b) => (a.reservatorioPct ?? 0) - (b.reservatorioPct ?? 0))
    .slice(0, 3)) {
    itens.push({
      titulo: `Reservatório baixo: ${c.reservatorioNome ?? 'abastecimento'} de ${c.nome}/${c.uf.toUpperCase()} em ${(c.reservatorioPct ?? 0).toFixed(1)}%`,
      link: `${SITE}/${c.uf}/${c.slug}`,
      description: `Nível do sistema de abastecimento monitorado, fonte ${c.reservatorioFonte ?? 'ONS/ANA'}.`,
      publicacao: c.reservatorioMedicao ? new Date(c.reservatorioMedicao).toUTCString() : AGORA,
    });
  }
  for (const c of todas
    .filter((c) => (c.focos ?? 0) > 100)
    .sort((a, b) => (b.focos ?? 0) - (a.focos ?? 0))
    .slice(0, 3)) {
    itens.push({
      titulo: `Queimadas: ${c.focos} focos num raio de 100 km de ${c.nome}/${c.uf.toUpperCase()}`,
      link: `${SITE}/${c.uf}/${c.slug}`,
      description: `Detecção de hotspots da NASA FIRMS, atualizada automaticamente.`,
      publicacao: c.focosAtualizadoEm ? new Date(c.focosAtualizadoEm).toUTCString() : AGORA,
    });
  }
  if (todas.some((c) => (c.dengueNivel ?? 0) >= 3)) {
    const pior = todas
      .filter((c) => (c.dengueNivel ?? 0) >= 3)
      .sort((a, b) => (b.dengueCasos ?? 0) - (a.dengueCasos ?? 0))
      .slice(0, 3);
    for (const c of pior) {
      itens.push({
        titulo: `Dengue em ${corDengue(c)}: ${c.nome}/${c.uf.toUpperCase()} com ${c.dengueCasos} casos`,
        link: `${SITE}/${c.uf}/${c.slug}`,
        description: `Nível ${c.dengueNivel} do semáforo epidemiológico (InfoDengue/Fiocruz).`,
        publicacao: AGORA,
      });
    }
  }

  const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>ClimaBR.app — clima e painel ambiental do Brasil</title>
<link>${SITE}</link>
<description>Alertas meteorológicos (INMET), reservatórios, queimadas e dengue, atualizados 2x ao dia.</description>
<language>pt-br</language>
<lastBuildDate>${AGORA}</lastBuildDate>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${itens.map((i) => `<item>
<title>${esc(i.titulo)}</title>
<link>${i.link}</link>
<guid>${i.link}</guid>
<description>${esc(i.description)}</description>
<pubDate>${i.publicacao}</pubDate>
</item>`).join('\n')}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};

function corDengue(c: { dengueNivel: number | null }): string {
  return c.dengueNivel === 4 ? 'em emergência máxima' : 'em emergência';
}
