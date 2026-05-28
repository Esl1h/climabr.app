export interface DadosCidade {
  cidade: string;
  estado: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  atualizado_em: string;
  qualidade_ar?: {
    indice: number;
    categoria: string;
    principal_poluente: string;
    valor: number;
    unidade: string;
    fonte: string;
  };
  previsao?: Array<{
    data: string;
    min: number;
    max: number;
    condicao: string;
    chuva_mm: number;
    umidade: number;
  }>;
  uv?: {
    indice: number;
    categoria: string;
    pico_inicio: string;
    pico_fim: string;
  };
  reservatorio?: {
    nome: string;
    nivel_pct: number;
    variacao_semana_pct: number;
    fonte: string;
  };
  dengue?: {
    nivel_alerta: number;
    casos_semana: number;
    fonte: string;
  };
  queimadas?: {
    focos_100km: number;
    fonte: string;
  };
  bandeira_tarifaria?: {
    cor: string;
    adicional_kwh: number;
    fonte: string;
  };
  alertas?: Array<{
    tipo: string;
    descricao: string;
    nivel: string;
    inicio: string;
    fim: string;
  }>;
}

export interface Municipio {
  id: number;
  nome: string;
  slug: string;
  estado: string;
  estado_nome: string;
  lat: number | null;
  lon: number | null;
}
