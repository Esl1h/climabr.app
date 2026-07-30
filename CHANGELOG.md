# Changelog

Mudanças relevantes do ClimaBR.app. O site é publicado por deploy contínuo:
cada entrada marca um conjunto de mudanças já no ar em <https://climabr.app>.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

### Corrigido

- As capitais na home e a capital no panorama da página do estado mostravam
  temperatura e qualidade do ar do snapshot do build, sob o título "agora". Como
  a coleta é incremental e roda de madrugada em UTC, esse valor tinha de 1 a 3
  dias e costumava ser a mínima do dia, divergindo da página da cidade, que já
  buscava o Open-Meteo ao vivo. Os dois blocos agora hidratam no cliente, em uma
  requisição por endpoint para todos os pontos da página; o snapshot segue no
  HTML como conteúdo indexável e fallback sem JS.

### Modificado

- A temperatura atual na página da cidade passou para antes do nome, no mesmo
  tamanho e peso do título e alinhada pela baseline, espelhando os modos painel
  e mobile. A cor vem de uma escala por faixa de calor sobre os tokens de
  status, calibrada para o clima brasileiro, e acompanha o tema claro/escuro.

- Astro atualizado para 7.1.5, com `@astrojs/react` 6 e Vite 8. O compilador
  Rust passou a ser o único, e `compressHTML` foi fixado em `true` para manter
  a compressão por regra de HTML: o novo padrão do Astro 7 usa regra de JSX e
  removeria o espaço entre elementos inline vizinhos.

### Segurança

- Sem vulnerabilidades conhecidas nas dependências. O upgrade resolveu os
  últimos alertas herdados do `sharp`, do `esbuild` e do próprio Astro.

## [0.3.0] - 2026-07-28

### Adicionado

- Alertas meteorológicos oficiais do INMET (Alert-AS): faixa por UF na home,
  seção com riscos e instruções na página do estado, e banner por município na
  página da cidade, filtrado por código IBGE.
- Qualidade da água por município, a partir da vigilância do SISAGUA
  (Ministério da Saúde): percentual de amostras sem *Escherichia coli*.
- Bandeira tarifária de energia vigente, dos dados abertos da ANEEL.
- Cidades próximas na página da cidade, com distância em quilômetros.
- Panorama por estado: capital, municípios com dengue em alerta e focos de
  queimada.
- Contatos de emergência (199 e 193) e link da Defesa Civil estadual, com os
  27 endereços verificados.
- Aviso de coleta atrasada quando os dados passam de 48 horas sem atualização.

### Modificado

- Títulos e descrições passam a destacar a previsão do tempo, incluindo a
  mínima, a máxima e a condição do dia na descrição de cada cidade.
- Botão de compartilhar ganhou ícone, mantendo o rótulo em telas maiores.
- Dados estruturados da home com `WebSite` e `SearchAction`; a busca aceita
  o parâmetro `?q=`.

### Segurança

- Sete dependências transitivas atualizadas, resolvendo alertas de negação de
  serviço, path traversal e confusão de host.

## [0.2.0] - 2026-07-07

### Adicionado

- Tema claro e escuro com tokens de status, alternável no cabeçalho.
- Busca de cidade no cabeçalho, com índice carregado no cliente.

## [0.1.0] - 2026-05-28

### Adicionado

- Primeira versão pública: 5.571 municípios com previsão do tempo, qualidade do
  ar, índice UV, vento, ondas, reservatórios, queimadas, dengue e sol/lua.
- Acesso por navegador, `curl`, JSON, SVG, PNG, Prometheus e modo painel.
