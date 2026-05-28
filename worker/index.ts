/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Worker — climabr.app
 *
 * - Detecta User-Agent curl/wget e retorna resposta texto formatada
 * - Adiciona security headers em todas as respostas
 * - Redirects canônicos (www → apex, http → https)
 */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function isCurlRequest(userAgent: string): boolean {
  return /^(curl|wget|HTTPie|httpie|http\/)/.test(userAgent);
}

function extrairEstadoCidade(pathname: string): { estado: string; cidade: string } | null {
  const m = pathname.match(/^\/([a-z]{2})\/([a-z0-9-]+)\/?$/);
  if (!m) return null;
  return { estado: m[1], cidade: m[2] };
}

async function buscarDadosJson(siteUrl: string, estado: string, cidade: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${siteUrl}/api/${estado}/${cidade}.json`);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatarTexto(dados: Record<string, unknown>, estado: string): string {
  const cidade = dados.cidade as string || '';
  const ufUpper = (dados.estado as string || estado.toUpperCase());
  const agora = dados.atualizado_em
    ? new Date(dados.atualizado_em as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'N/A';

  const linhas: string[] = [
    `${cidade}/${ufUpper} — ${agora}`,
    '─'.repeat(40),
  ];

  const previsao = (dados.previsao as Array<Record<string, unknown>> | undefined)?.[0];
  if (previsao) {
    linhas.push(`Tempo:     ${previsao.condicao}, min ${previsao.min}°C / max ${previsao.max}°C`);
  }

  const ar = dados.qualidade_ar as Record<string, unknown> | undefined;
  if (ar) {
    linhas.push(`Ar:        ${ar.categoria} (IQAr ${ar.indice}) — ${ar.principal_poluente}`);
  }

  const res = dados.reservatorio as Record<string, unknown> | undefined;
  if (res) {
    const seta = (res.variacao_semana_pct as number) > 0 ? '↑' : (res.variacao_semana_pct as number) < 0 ? '↓' : '→';
    linhas.push(`Represa:   ${res.nivel_pct}% ${seta}${Math.abs(res.variacao_semana_pct as number)}% (${res.nome})`);
  }

  const uv = dados.uv as Record<string, unknown> | undefined;
  if (uv) {
    linhas.push(`UV:        ${uv.indice} — ${uv.categoria} (pico ${uv.pico_inicio}–${uv.pico_fim})`);
  }

  const dengue = dados.dengue as Record<string, unknown> | undefined;
  if (dengue) {
    linhas.push(`Dengue:    Alerta nível ${dengue.nivel_alerta} (${dengue.casos_semana} casos/semana)`);
  }

  const q = dados.queimadas as Record<string, unknown> | undefined;
  if (q) {
    linhas.push(`Queimadas: ${q.focos_100km} focos (raio 100km)`);
  }

  const bt = dados.bandeira_tarifaria as Record<string, unknown> | undefined;
  if (bt) {
    linhas.push(`Tarifa:    Bandeira ${bt.cor} (+R$${(bt.adicional_kwh as number).toFixed(5)}/kWh)`);
  }

  linhas.push('─'.repeat(40));
  linhas.push(`JSON: https://climabr.app/api/${estado}/${(dados.slug as string) || ''}.json`);
  linhas.push('');

  return linhas.join('\n');
}

export default {
  async fetch(request: Request, env: { SITE_URL?: string }): Promise<Response> {
    const url = new URL(request.url);
    const siteUrl = env.SITE_URL || 'https://climabr.app';

    // Redirect www → apex
    if (url.hostname.startsWith('www.')) {
      return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    }

    // Detecta curl/wget
    const ua = request.headers.get('User-Agent') || '';
    const params = extrairEstadoCidade(url.pathname);

    if (isCurlRequest(ua) && params) {
      const dados = await buscarDadosJson(siteUrl, params.estado, params.cidade);

      if (dados && !dados._status) {
        const texto = formatarTexto(dados, params.estado);
        return new Response(texto, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=1800',
            ...SECURITY_HEADERS,
          },
        });
      }
    }

    // Passa para o Pages normalmente
    const response = await fetch(request);
    const newResponse = new Response(response.body, response);

    // Adiciona security headers
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => {
      newResponse.headers.set(k, v);
    });

    return newResponse;
  },
} satisfies ExportedHandler<{ SITE_URL?: string }>;
