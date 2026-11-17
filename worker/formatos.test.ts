import { describe, expect, it } from 'vitest';
import {
  extrairPathInfo,
  formatarOneLiner,
  formatarPrometheus,
  formatarTerminal,
  promEsc,
  xmlEsc,
  type Dados,
} from './formatos';

const cidadeMinima: Dados = {
  cidade: 'Teste',
  estado: 'SP',
  slug: 'teste',
  atualizado_em: new Date().toISOString(),
  coleta_em: new Date().toISOString(),
};

describe('extrairPathInfo', () => {
  it('parseia rota de cidade', () => {
    expect(extrairPathInfo('/sp/sao-paulo')).toEqual({ estado: 'sp', cidade: 'sao-paulo', ext: '' });
  });

  it('parseia barra final', () => {
    expect(extrairPathInfo('/sp/cotia/')).toEqual({ estado: 'sp', cidade: 'cotia', ext: '' });
  });

  it('parseia extensões de card', () => {
    expect(extrairPathInfo('/sp/cotia.svg')?.ext).toBe('.svg');
    expect(extrairPathInfo('/sp/cotia.png')?.ext).toBe('.png');
    expect(extrairPathInfo('/sp/cotia.txt')?.ext).toBe('.txt');
  });

  it('rejeita o que não é rota de cidade', () => {
    expect(extrairPathInfo('/')).toBeNull();
    expect(extrairPathInfo('/api/sp/teste.json')).toBeNull();
    expect(extrairPathInfo('/sp/ponto.novo')).toBeNull();
  });
});

describe('escapamento', () => {
  it('promEsc escapa barra invertida, aspas e quebra de linha', () => {
    expect(promEsc('a\\b"c\nd')).toBe('a\\\\b\\"c\\nd');
  });

  it('xmlEsc escapa as cinco entidades', () => {
    expect(xmlEsc(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });
});

describe('formatarPrometheus', () => {
  it('emite amostra com labels e valor', () => {
    const saida = formatarPrometheus({ ...cidadeMinima, qualidade_ar: { indice: 42, pm25: 10.5 } });
    expect(saida).toContain('climabr_aqi_us{cidade="Teste",estado="sp"} 42');
    expect(saida).toContain('climabr_pm25_ugm3{cidade="Teste",estado="sp"} 10.5');
  });

  it('não vira amostra inválida com aspas no estado', () => {
    const saida = formatarPrometheus({ ...cidadeMinima, estado: 'S"P', qualidade_ar: { indice: 42 } });
    expect(saida).toContain('estado="s\\"p"');
  });
});

describe('formatarTerminal', () => {
  it('aviso sem fim mostra "vigente", não a época Unix', () => {
    const saida = formatarTerminal(
      { ...cidadeMinima, avisos: [{ evento: 'Vento Intenso', severidade: 'Perigo', fim: null }] },
      false
    );
    expect(saida).toContain('vigente');
    expect(saida).not.toContain('1970');
  });

  it('sem temperatura, não mostra "0°C"', () => {
    const saida = formatarTerminal({ ...cidadeMinima, temperatura_atual: null }, false);
    expect(saida).not.toContain('0°C');
  });
});

describe('formatarOneLiner', () => {
  it('marca coleta com mais de 48h', () => {
    const antigo = new Date(Date.now() - 49 * 3600 * 1000).toISOString();
    expect(formatarOneLiner({ ...cidadeMinima, coleta_em: antigo }, false)).toContain('⚠ coleta antiga');
    expect(formatarOneLiner(cidadeMinima, false)).not.toContain('coleta antiga');
  });
});
