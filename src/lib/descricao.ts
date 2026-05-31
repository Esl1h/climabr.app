import type { DadosCidade, Municipio } from './types';

/**
 * Gera um parágrafo descritivo em português a partir dos dados da cidade.
 * Texto renderizado em <p> antes dos componentes visuais — forte sinal de SEO
 * (conteúdo textual indexável) e útil para leitores de tela e AI crawlers.
 */
export function descricaoTextual(municipio: Municipio, dados: DadosCidade | null): string {
  const cidadeUf = `${municipio.nome}/${municipio.estado.toUpperCase()}`;

  if (!dados) {
    return `Painel ambiental de ${cidadeUf} (${municipio.estado_nome}). ` +
      `Os dados desta cidade estão sendo coletados e aparecerão em breve: previsão do tempo, ` +
      `qualidade do ar, índice UV, vento, nível de reservatórios, focos de queimada e alertas de dengue.`;
  }

  const f: string[] = [];

  const prev = dados.previsao?.[0];
  if (prev) {
    const chuva = prev.chuva_mm > 0 ? `, com ${prev.chuva_mm} mm de chuva prevista` : '';
    f.push(
      `A previsão para hoje em ${cidadeUf} é de ${String(prev.condicao).toLowerCase()}, ` +
      `com máxima de ${Math.round(prev.max)}°C e mínima de ${Math.round(prev.min)}°C${chuva}`
    );
  }

  if (dados.temperatura_atual != null) {
    f.push(`a temperatura atual é de ${dados.temperatura_atual}°C`);
  }

  if (dados.qualidade_ar) {
    f.push(`a qualidade do ar está ${String(dados.qualidade_ar.categoria).toLowerCase()} (índice ${dados.qualidade_ar.indice})`);
  }

  if (dados.uv && dados.uv.indice > 0) {
    f.push(`o índice UV é ${String(dados.uv.categoria).toLowerCase()} (${dados.uv.indice})`);
  }

  if (dados.vento && (dados.vento.velocidade_kmh != null || dados.vento.max_kmh != null)) {
    const v = dados.vento.velocidade_kmh ?? dados.vento.max_kmh;
    const dir = dados.vento.direcao ? ` na direção ${dados.vento.direcao}` : '';
    f.push(`o vento sopra a ${v} km/h${dir}`);
  }

  if (dados.ondas) {
    const alt = dados.ondas.altura_m ?? dados.ondas.altura_max_m;
    if (alt != null) {
      f.push(`as ondas estão em ${alt.toFixed(1)} m (${String(dados.ondas.surf_descricao).toLowerCase()})`);
    }
  }

  if (dados.reservatorio && dados.reservatorio.nivel_pct != null) {
    const aprox = dados.reservatorio.aproximado ? ' (reservatório próximo)' : '';
    f.push(`o reservatório ${dados.reservatorio.nome} está em ${dados.reservatorio.nivel_pct}%${aprox}`);
  }

  if (dados.queimadas) {
    const focos = dados.queimadas.focos_100km;
    f.push(focos === 0
      ? `não há focos de queimada num raio de 100 km`
      : `há ${focos} ${focos === 1 ? 'foco' : 'focos'} de queimada num raio de 100 km`);
  }

  if (dados.dengue && dados.dengue.nivel_alerta != null) {
    f.push(`o alerta de dengue está em nível ${String(dados.dengue.nivel_label ?? dados.dengue.nivel_alerta).toLowerCase()}` +
      (dados.dengue.casos_semana ? ` (${dados.dengue.casos_semana} casos na semana)` : ''));
  }

  if (dados.sol) {
    f.push(`o sol nasce às ${dados.sol.nascer} e se põe às ${dados.sol.por}`);
  }

  if (f.length === 0) {
    return `Painel ambiental de ${cidadeUf} (${municipio.estado_nome}).`;
  }

  // Junta com vírgulas e "e" no final, capitaliza a primeira letra
  const texto = f.join('; ') + '.';
  return texto.charAt(0).toUpperCase() + texto.slice(1) +
    ` Dados de fontes públicas, atualizados automaticamente. Acesse também via curl, JSON ou modo painel.`;
}
