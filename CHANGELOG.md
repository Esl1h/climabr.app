# Changelog

Mudanças relevantes do ClimaBR.app. O site é publicado por deploy contínuo:
cada entrada marca um conjunto de mudanças já no ar em <https://climabr.app>.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

### Adicionado

- Bloco de alagamentos na página de São Paulo, com os pontos registrados pelo
  CGE da prefeitura: quantos estão ativos, quantos ficaram intransitáveis, e a
  lista com logradouro, referência e horário. É a única capital com registro
  público e estruturado de alagamento; alertas de defesa civil estadual e
  nacional não têm API aberta, então o alerta meteorológico nacional continua
  vindo do INMET.

- Máxima e mínima do dia logo abaixo da temperatura em destaque na página da
  cidade, em vermelho e azul, sem casa decimal. Os cards da previsão de 7 dias
  ganharam as mesmas setas coloridas, que também esclarecem qual dos dois
  números é a máxima.

- Dois rankings novos: os 154 reservatórios hidrelétricos monitorados pelo ONS,
  que antes eram descartados inteiros, e as capitais ordenadas por temperatura,
  reordenadas ao vivo no cliente.

- Coleta de ondas e condição de surf agendada. A etapa de identificação já havia
  mapeado 219 municípios costeiros, mas a coleta nunca chegou a entrar em nenhum
  workflow e só Santos tinha o dado.

### Corrigido

- Seis reservatórios da bacia do São Francisco estavam congelados desde 21/06.
  O ONS publica a linha do dia antes de preencher o volume útil, e a coleta
  pegava essa linha vazia, o que derrubava o reservatório inteiro do resultado.
  Sobradinho, Xingó, Luiz Gonzaga, Apolônio Sales e as duas Paulo Afonso voltaram
  a atualizar, e as cidades da bacia deixaram de exibir medição velha como atual.

- A coleta do ONS apagava os sistemas da COPASA. A guarda de fonte primária
  testava a string SABESP, então rodar o ONS depois da COPASA trocava Paraopeba,
  Rio Manso, Serra Azul e Vargem das Flores pelo hidrelétrico mais próximo.

- Os rankings repetiam a mesma informação em várias linhas. O de reservatórios
  listava cidades, e como um sistema abastece dezenas delas, o Cantareira ocupava
  14 das 15 posições; passou a ser por sistema. Os de qualidade do ar e queimadas
  agrupam cidades vizinhas, porque o modelo entrega uma célula de grade para
  várias delas e a contagem de focos usa raio de 100 km: quatro municípios ao
  redor do mesmo incêndio no Pantanal viravam quatro linhas do top 10.

- O ranking de dengue ordenava por casos absolutos, o que classificava população
  em vez de epidemia. Passou a usar incidência por 100 mil habitantes, com piso
  de casos estimados para não ser dominado por município pequeno, onde o
  nowcasting é instável.

- Uma Petrolina/BA remanescente de coleta antiga liderava o ranking de
  reservatórios com um nível zerado que não existia mais na fonte. A cidade é de
  Pernambuco: o arquivo foi removido e os rankings passaram a ignorar qualquer
  arquivo que não conste da lista do IBGE.

- Usinas de fio d'água ocupavam o topo do ranking de reservatórios sem indicar
  escassez. Elas não acumulam por projeto e o volume útil que o ONS publica para
  elas oscila em torno de zero, chegando a vir negativo. São 90 dos 154
  reservatórios, agora identificados no JSON e fora do ranking de níveis baixos.

- O modo curl na rota raiz servia o snapshot da coleta diária em vez do tempo
  ao vivo. A rota geolocalizada por IP ia de `buscarDados` direto para o
  formatador, sem o `hidratarTempo` que os outros dois pontos de chamada do
  Worker já tinham: `curl climabr.app` mostrava 12.6°C de três dias antes
  enquanto `curl climabr.app/sp/sao-paulo` mostrava o valor do momento.

- A previsão de 7 dias misturava formatos, com a casa decimal aparecendo só nos
  dias em que era significativa (30° ao lado de 20.2°). Min e max passaram a ser
  arredondados; a decimal fica reservada à temperatura atual, que é medição e
  não estimativa.

- As capitais na home e a capital no panorama da página do estado mostravam
  temperatura e qualidade do ar do snapshot do build, sob o título "agora". Como
  a coleta é incremental e roda de madrugada em UTC, esse valor tinha de 1 a 3
  dias e costumava ser a mínima do dia, divergindo da página da cidade, que já
  buscava o Open-Meteo ao vivo. Os dois blocos agora hidratam no cliente, em uma
  requisição por endpoint para todos os pontos da página; o snapshot segue no
  HTML como conteúdo indexável e fallback sem JS.

### Modificado

- O aviso de coleta atrasada saiu do cabeçalho da cidade para depois dos
  painéis, antes de "Cidades próximas". Ele fala dos blocos do snapshot
  (reservatório, dengue, queimadas) e contradizia o "Tempo atualizado agora"
  impresso na linha de cima, que é ao vivo.

- Cada seção dos rankings passou a mostrar a data do próprio dado, em vez de um
  único "gerado em" que sugeria que tudo era da hora do build: o InfoDengue
  consolida com semanas de atraso e o ONS publica a medição do dia anterior.

- A temperatura atual na página da cidade passou para antes do nome, no tamanho
  dos números dos boxes de dados, virando o elemento mais destacado do
  cabeçalho. A cor vem de uma escala por faixa de calor sobre os tokens de
  status, calibrada para o clima brasileiro, e acompanha o tema claro/escuro.
  O valor mantém a casa decimal, para não parecer divergente de outros serviços
  nem do resumo textual — que também passou a ser hidratado, já que citava a
  mesma temperatura a partir do snapshot do build.

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
