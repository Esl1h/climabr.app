/**
 * Códigos WMO do Open-Meteo: descrição em PT-BR e tema de fundo.
 * Fonte única do telão, do /mobile, da hidratação da cidade e do Worker
 * (o emoji fica em icone-tempo.ts). A descrição também existe em
 * scripts/scrape-openmeteo.py, que é Python e não importa este arquivo:
 * mudou aqui, mude lá.
 */

export const WMO_DESCRICAO: Record<number, string> = {
  0: 'Céu limpo', 1: 'Principalmente limpo', 2: 'Parcialmente nublado', 3: 'Encoberto',
  45: 'Névoa', 48: 'Névoa com gelo',
  51: 'Chuvisco leve', 53: 'Chuvisco moderado', 55: 'Chuvisco denso',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte',
  71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve forte', 77: 'Granizo',
  80: 'Chuva isolada leve', 81: 'Chuva isolada moderada', 82: 'Chuva isolada forte',
  85: 'Neve isolada', 86: 'Neve isolada forte',
  95: 'Tempestade', 96: 'Tempestade com granizo leve', 99: 'Tempestade com granizo forte',
};

export const TEMAS_TEMPO = ['clima-limpo', 'clima-nublado', 'clima-encoberto', 'clima-chuva', 'clima-neve', 'clima-tempestade'];

/** Classe de tema do fundo para um código WMO (desconhecido cai em céu limpo) */
export function temaDoTempo(c: number): string {
  if (!Number.isFinite(c)) return 'clima-limpo';
  if (c <= 1) return 'clima-limpo';
  if (c === 2) return 'clima-nublado';
  if (c === 3 || c === 45 || c === 48) return 'clima-encoberto';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'clima-chuva';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'clima-neve';
  if (c >= 95) return 'clima-tempestade';
  return 'clima-limpo';
}
