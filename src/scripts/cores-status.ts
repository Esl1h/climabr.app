// Escalas de cor/categoria compartilhadas entre os módulos de hidratação
// client-side. As cores saem dos tokens de status do global.css para
// acompanhar o tema claro/escuro.

export function corAqi(a: number): string {
  return a <= 50 ? 'var(--status-bom)' : a <= 100 ? 'var(--status-moderado)' : a <= 150 ? 'var(--status-ruim)' : a <= 200 ? 'var(--status-pessimo)' : 'var(--status-critico)';
}

export function catAqi(a: number): string {
  if (a <= 50) return 'Boa';
  if (a <= 100) return 'Moderada';
  if (a <= 150) return 'Ruim para grupos sensíveis';
  if (a <= 200) return 'Ruim';
  if (a <= 300) return 'Muito Ruim';
  return 'Perigosa';
}
