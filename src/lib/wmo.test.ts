import { describe, expect, it } from 'vitest';
import { iconeTempoWmo } from './icone-tempo';
import { TEMAS_TEMPO, WMO_DESCRICAO, temaDoTempo } from './wmo';

describe('códigos WMO', () => {
  it('todo código descrito tem ícone próprio e tema conhecido', () => {
    for (const codigo of Object.keys(WMO_DESCRICAO).map(Number)) {
      // '⛅' é o ícone de "não sei": só o código 2 (parcialmente nublado) o usa de verdade
      if (codigo !== 2) expect(iconeTempoWmo(codigo), `ícone do código ${codigo}`).not.toBe('⛅');
      expect(TEMAS_TEMPO).toContain(temaDoTempo(codigo));
    }
  });

  it('agrupa os códigos nos temas de fundo', () => {
    expect(temaDoTempo(0)).toBe('clima-limpo');
    expect(temaDoTempo(2)).toBe('clima-nublado');
    expect(temaDoTempo(45)).toBe('clima-encoberto');
    expect(temaDoTempo(63)).toBe('clima-chuva');
    expect(temaDoTempo(82)).toBe('clima-chuva');
    expect(temaDoTempo(75)).toBe('clima-neve');
    expect(temaDoTempo(99)).toBe('clima-tempestade');
    expect(temaDoTempo(NaN)).toBe('clima-limpo');
  });
});
