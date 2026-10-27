/**
 * Escala de cor por faixa de calor, usada no destaque da temperatura atual
 * na página de cidade.
 *
 * Importável dos dois lados: o build renderiza a classe Tailwind e a hidratação
 * client-side (scripts/previsao-cliente.ts) aplica a CSS var equivalente. As
 * duas formas vivem na MESMA tabela para os limites não divergirem — a classe
 * precisa ser string literal aqui, senão o scanner do Tailwind não gera o CSS.
 *
 * Não é um índice oficial: é uma heurística de exibição calibrada para o clima
 * brasileiro. O azul reaproveita o token de info (o único frio da paleta), e daí
 * a escala segue a ordem usual dos tokens de status até o vermelho escuro.
 */

interface Faixa {
  /** Limite superior da faixa, em °C (exclusivo no topo da última) */
  ate: number;
  rotulo: string;
  classe: string;
  cssVar: string;
}

// Calibrada para o Brasil: a faixa confortável é larga de propósito, porque
// 20-27°C é o normal na maior parte do país na maior parte do ano. Assim a cor
// fica estável no dia a dia e só salta quando o calor (ou o frio) é notável.
const FAIXAS: Faixa[] = [
  { ate: 12, rotulo: 'Frio', classe: 'text-status-info', cssVar: 'var(--status-info)' },
  { ate: 28, rotulo: 'Agradável', classe: 'text-status-bom', cssVar: 'var(--status-bom)' },
  { ate: 33, rotulo: 'Quente', classe: 'text-status-moderado', cssVar: 'var(--status-moderado)' },
  { ate: 38, rotulo: 'Muito quente', classe: 'text-status-ruim', cssVar: 'var(--status-ruim)' },
  { ate: 43, rotulo: 'Calor severo', classe: 'text-status-pessimo', cssVar: 'var(--status-pessimo)' },
  { ate: Infinity, rotulo: 'Calor extremo', classe: 'text-status-critico', cssVar: 'var(--status-critico)' },
];

function faixa(t: number): Faixa {
  return FAIXAS.find((f) => t < f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

/** Classe Tailwind (render no build) */
export function corTemperaturaTexto(t: number): string {
  return faixa(t).classe;
}

/** CSS var para style.color (hidratação no cliente) */
export function corTemperatura(t: number): string {
  return faixa(t).cssVar;
}

/** Rótulo da faixa, para o title/leitor de tela */
export function catTemperatura(t: number): string {
  return faixa(t).rotulo;
}
