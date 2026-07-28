# Política de segurança

## Escopo

Este repositório contém o site estático **climabr.app**, os scrapers de dados
públicos e o Cloudflare Worker que serve os formatos alternativos (`curl`,
SVG/PNG, Prometheus). O site não tem contas de usuário, não coleta dados
pessoais e não expõe banco de dados: as preferências ficam apenas no
`localStorage` do navegador.

## Como relatar uma vulnerabilidade

Não abra issue pública para falhas de segurança.

Use o canal privado do GitHub em
[Security > Report a vulnerability](https://github.com/Esl1h/climabr.app/security/advisories/new),
que cria um advisory privado. Se preferir e-mail, escreva para o endereço
público do perfil do mantenedor.

Inclua no relato:

- descrição do problema e do impacto esperado;
- passos para reproduzir (URL, requisição, payload);
- versão ou commit em que foi observado.

## Prazos

Este é um projeto mantido por uma pessoa, em tempo livre. O objetivo é:

- confirmar o recebimento em até 5 dias corridos;
- dar um retorno com avaliação inicial em até 15 dias corridos;
- publicar a correção e o advisory assim que houver solução validada.

## Versões suportadas

O projeto é entregue por deploy contínuo: somente o estado atual da branch
`main`, publicado em <https://climabr.app>, recebe correções. Não há suporte a
versões anteriores.

## Fora de escopo

- Ausência de cabeçalhos que não afetem um site estático sem sessão.
- Vulnerabilidades nos portais de origem dos dados (INMET, ANEEL, Ministério da
  Saúde e demais). Relate diretamente ao órgão responsável.
- Ataques de negação de serviço por volume contra a infraestrutura da
  Cloudflare.
- Relatórios automatizados de scanner sem demonstração de impacto real.
