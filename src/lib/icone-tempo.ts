/**
 * Ícone (emoji) por condição do tempo, em duas formas:
 * - por texto da condição (render no build, a partir do snapshot)
 * - por código WMO (hidratação client-side, mais precisa)
 *
 * Emojis e não SVG de propósito: acompanham dark mode sem assets extras
 * e o app já usa emojis para lua, bandeira e fases do dia.
 */

const POR_CATEGORIA: [RegExp, string][] = [
  [/limpo|sol/i, '☀️'],
  [/parcial/i, '⛅'],
  [/principalmente/i, '🌤️'],
  [/encoberto|nublado/i, '☁️'],
  [/névoa|nevoa|neblina/i, '🌫️'],
  [/chuvisco/i, '🌦️'],
  [/tempestade|trovoada|granizo/i, '⛈️'],
  [/chuva|garoa/i, '🌧️'],
  [/neve/i, '❄️'],
  [/vent/i, '💨'],
];

/** Do texto de condição usado nos snapshots (ex.: "Parcialmente nublado") */
export function iconeTempoTexto(texto: string): string {
  for (const [padrao, icone] of POR_CATEGORIA) {
    if (padrao.test(texto)) return icone;
  }
  return '⛅';
}

/** Do código WMO (Open-Meteo), a mesma família de códigos do scraper */
const POR_WMO: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export function iconeTempoWmo(codigo: number): string {
  return POR_WMO[codigo] ?? '⛅';
}
