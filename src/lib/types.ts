export interface DadosCidade {
  cidade: string;
  estado: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  atualizado_em: string;
  temperatura_atual?: number | null;

  qualidade_ar?: {
    indice: number;
    categoria: string;
    principal_poluente: string;
    pm25?: number | null;
    pm10?: number | null;
    no2?: number | null;
    o3?: number | null;
    fonte: string;
    atualizado_em?: string;
  } | null;

  previsao?: Array<{
    data: string;
    min: number;
    max: number;
    condicao: string;
    condicao_codigo: number | string;
    chuva_mm: number;
    uv?: number;
    nascer_sol?: string | null;
    por_sol?: string | null;
  }>;

  uv?: {
    indice: number;
    categoria: string;
    pico_inicio?: string;
    pico_fim?: string;
    fonte: string;
  } | null;

  sol?: {
    nascer: string;
    por: string;
    duracao_h: number;
    estacao: string;
    fonte: string;
  } | null;

  lua?: {
    nome: string;
    iluminacao_pct: number;
    fase_pct?: number;
    dias_proxima_cheia?: number;
    fonte: string;
  } | null;

  reservatorio?: {
    nome: string;
    nivel_pct: number | null;
    variacao_semana_pct: number | null;
    variacao_diaria_pct?: number;
    data_medicao?: string;
    distancia_km?: number;
    sistema_id?: number;
    aproximado?: boolean;
    nota?: string;
    fonte: string;
    atualizado_em?: string;
  };

  dengue?: {
    nivel_alerta: number;
    nivel_label?: string;
    nivel_incidencia?: number;
    nivel_incidencia_label?: string;
    casos_semana: number;
    casos_estimados?: number;
    semana_epidemiologica?: number;
    fonte: string;
    atualizado_em?: string;
  } | null;

  chikungunya?: {
    nivel_alerta: number;
    nivel_label?: string;
    casos_semana: number;
    casos_estimados?: number;
    semana_epidemiologica?: number;
    fonte: string;
  } | null;

  zika?: {
    nivel_alerta: number;
    nivel_label?: string;
    casos_semana: number;
    semana_epidemiologica?: number;
    fonte: string;
  } | null;

  queimadas?: {
    focos_100km: number;
    fonte: string;
    atualizado_em?: string;
  };

  bandeira_tarifaria?: {
    cor: string;
    adicional_kwh: number;
    mes_referencia?: string;
    fonte: string;
  } | null;

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
