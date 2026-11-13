# RAC · Documento 1 · Visão e Mapa Mestre

Documento oficial de planejamento do RAC (Documento 1). Criado em **13/11/2026** a partir de uma auditoria do código, do banco
(consulta só de leitura), do GitHub e do histórico completo do repositório (358 commits desde 23/10/2026).
Atualizações são datadas e nada é apagado: o registro do dia a dia fica em [historico-diario.md](historico-diario.md).

## Como ler este conjunto

| Documento | Para que serve |
|---|---|
| **01 · Visão e mapa mestre** (este) | O que o RAC é, para onde vai, princípios, áreas e o estado de cada uma |
| [02 · Auditoria arquitetural](02-auditoria-arquitetural.md) | Como o sistema está construído, dependências, problemas com evidência, arquitetura-alvo e plano gradual |
| [03 · Design System](03-design-system.md) | Diagnóstico visual, tokens, componentes, navegação e adoção gradual |
| [04 · RAC Intelligence](04-rac-intelligence.md) | IA atual e a arquitetura da inteligência proativa (detecção → interpretação → apresentação) |
| [05 · Integrações e automações](05-integracoes-e-automacoes.md) | APIs, robôs, agendamentos, monitor de integrações, Garmin (o que existe de verdade) |
| [06 · Roadmap](06-roadmap.md) | Fases, prioridades, dependências e critérios de conclusão |
| [07 · Decisões e pendências](07-decisoes-e-pendencias.md) | O que foi decidido, o que depende do dono, inconsistências encontradas, alternativas descartadas |
| [08 · Frentes funcionais](08-frentes-funcionais.md) | Central da Família e da Casa, RAC Hoje, Garmin avançado, Acontecimentos, Estudos e Central de Compras |
| [Histórico diário](historico-diario.md) | Registro cronológico: o que fizemos, o que estamos fazendo, o que vamos fazer |

O documento 08 não estava na lista sugerida: foi criado para que as propostas de cada frente (Família e Casa, Garmin, Notícias,
Estudos, Compras, RAC Hoje) não inchassem a visão nem a auditoria. Os documentos por módulo que já existiam (`docs/*.md`)
continuam valendo para o detalhe de cada módulo; estes documentos não os substituem, só os organizam.

**Convenções usadas em todos os documentos**

- **[Fato]**: conferido no código, no GitHub ou no banco, com a evidência ao lado (arquivo, função, tabela, commit).
- **[Hipótese]**: provável, mas não confirmado; diz o que falta para confirmar.
- **[Recomendação]**: proposta, ainda não decidida nem implementada.
- **Estados de entrega** (não confundir):
  - *Na branch*: só numa branch `claude/*`.
  - *Mesclado = publicado (site)*: o GitHub Pages publica sozinho a cada push na `main` (conferido: a execução
    "pages build and deployment" roda a cada merge; a última, do commit `256edfa`, terminou com sucesso em 13/11/2026).
  - *SQL aplicado em produção*: só quando o dono roda no SQL Editor; não acontece com o merge.
  - *Função publicada*: só quando o dono (ou o Claude com autorização) faz o deploy; não acontece com o merge.
- Caminhos de arquivo entre crases existem no repositório (há teste). Arquivos ainda não criados aparecem com `NNN` no nome
  (ex.: uma migration futura) ou só pelo nome, sem pasta.

## Visão do produto

O RAC é o **sistema pessoal e familiar de gestão da vida** do Rayner e da casa: um lugar único para organizar informações,
finanças, saúde, família, casa, estudos, compras, compromissos, integrações e acontecimentos, e que **trabalha pela rotina**:
percebe o que mudou, avisa o que merece atenção e explica por quê, sem excesso de notificações.

Não é um site com um chat de IA. A inteligência é transversal: regras e cálculos encontram os fatos, a IA ajuda a relacionar
e explicar quando vale a pena, e cada tela mostra o que interessa no momento certo.

## Objetivos dos próximos ciclos

1. **Confiabilidade visível**: saber quando um robô, uma rotina ou uma integração parou (monitor de integrações).
2. **Um produto coerente**: uma linguagem visual, uma navegação por áreas e componentes padronizados (RAC Design System).
3. **Casa e família no centro**: pessoas e animais, medicamentos, contas domésticas, encomendas e condomínio.
4. **Inteligência proativa e econômica**: detectar com regras, interpretar com IA só quando agrega, apresentar no lugar certo.
5. **Crescer sem regressões**: módulos com contratos claros, menos acoplamento escondido, documentação que reflete a realidade.

## Princípios permanentes

Valem para todas as frentes; os do `CLAUDE.md` têm precedência sobre qualquer item daqui.

1. **Os dados ficam no banco, protegidos pelo RLS.** O repositório é público; nada pessoal entra nele.
2. **Cada dado tem um dono (o módulo responsável).** Agregadores (RAC Hoje, Agenda, Painel, Monitor) consultam; não copiam.
3. **Números vêm de regras, não da IA.** A IA recebe fatos já calculados, cita de onde vieram e nunca grava.
4. **Toda sugestão se explica.** "Por que estou vendo isto": regra, dados, período e fonte.
5. **Pouco e relevante.** Sem alertas repetidos; o dono escolhe o que quer receber.
6. **A experiência da casa é preservada.** O que a Fernanda vê só muda quando o dono pedir.
7. **Simples e sem build.** HTML, CSS e JavaScript ES5; bibliotecas só de CDN com versão exata; nada de framework por preferência.
8. **Celular primeiro.** O RAC é usado (e desenvolvido) pelo celular.
9. **Mudança pequena, testada e reversível.** Um lote funcional por vez, com testes do módulo e a suíte inteira antes de publicar.
10. **Rastreável.** Decisões, aplicações de SQL, publicações e pendências ficam registradas com data.

## O RAC hoje, em números (13/11/2026)

| Item | Valor | Evidência |
|---|---|---|
| Versão do site no ar | `2026-11-12.9` | `VERSAO` em `sw.js` e `MOD_VERSAO` em `js/app.js`; `main` em `256edfa` |
| Código do site | ≈ 15.500 linhas de JavaScript | `js/app.js` 1.462, `nucleo.js` 3.205, `mercado.js` 2.631, 23 módulos em `js/` |
| Carga inicial | ≈ 933 KB sem compressão (≈ 279 KB com gzip) | `index.html` 143 KB, `nucleo.js` 408 KB, `mercado.js` 241 KB, `js/app.js` 141 KB |
| Telas | 30 rotas; 29 itens num único grupo do menu lateral | `tabs` em `js/app.js`; `<nav id="navgrp">` em `index.html` |
| Banco | 46 tabelas (todas com RLS), `schema.sql` + 44 migrations numeradas + 2 propostas | `supabase/`, `supabase/propostas/` |
| Produção (leitura) | 96 tabelas, views e funções das migrations aplicadas existem; a 040 não foi aplicada (congelada com a Central Fiscal; não é pendência) | `tests/banco.test.mjs` rodado em 13/11/2026 (96 ok; a 040 aparece como "todo" por causa da marca `-- status: pendente` do arquivo) |
| Arquivos (Storage) | 2 cofres privados: `familia` e `backups` | `supabase/004_familia.sql`, `supabase/008_sistema.sql` |
| Servidor | 4 Edge Functions: `garmin`, `rac-ia`, `rac-newsletter`, `radar` | `supabase/functions/` |
| Agendamentos | 3 no banco (pg_cron) e 3 workflows no GitHub | `008`, `023`, `045`; `.github/workflows/` |
| Testes | 69 arquivos, ≈ 1.300 casos; CI em dois grupos | `tests/`, `.github/workflows/testes.yml` |
| Histórico | 358 commits na `main` desde 23/10/2026; PRs #1 a #5 mesclados; o PR #6 (este planejamento) aberto, sem merge | `git log`; GitHub |
| Proteção da `main` | Ruleset ativa (criada pelo dono em 13/11/2026); falta comprovar os pushes dos robôs depois dela | informado pelo dono; a API do GitHub mostra a `main` protegida |

## Áreas funcionais: estado atual e estado desejado

Classificação: **Funciona** (existe e funciona) · **Parcial** · **Corrigir** · **Refatorar** · **Novo** · **Congelado** (existe, fora do planejamento).

| Área | Onde está hoje | Estado atual | Estado desejado | Detalhe |
|---|---|---|---|---|
| **RAC Hoje e Início** (painel central) | `#inicio` (`renderInicio` em `js/app.js`, 13 cartões), `#rachoje` (`js/hoje.js`), `#agenda` e `#busca` (`js/sistema.js`), `#resumo`, `#painel` | **Parcial**: dois "inícios" (Início e RAC Hoje); o RAC Hoje lê 13 fontes direto das tabelas e de variáveis internas de outros módulos; IA só a pedido e só do dono | Um painel central que consulta os módulos por um contrato de fontes, com pendências, contas, medicamentos, encomendas, acontecimentos, estado das integrações e recomendações justificadas | [08](08-frentes-funcionais.md#rac-hoje-painel-central), [04](04-rac-intelligence.md) |
| **Família** (Olivia, Eddie) | `js/familia.js`, `js/bebe.js`, `js/oms.js`; tabelas `registros`, `bebe`; cofre `familia` | **Funciona**: exames, consultas, vacinas, remédios das receitas, crescimento (OMS), diário do bebê | Pessoas e animais cadastrados por dados (hoje estão fixos no código, em `FAM`); medicamentos com foto, validade e estoque | [08](08-frentes-funcionais.md#central-da-família-e-da-casa) |
| **Casa** | `js/lista.js` (lista em tempo real), Documentos e Veículos em `js/familia.js` | **Parcial**: lista, documentos com validade, garantias, veículos e abastecimentos existem; contas domésticas, encomendas e condomínio não existem | Central da Casa: contas (ex.: Naturgy), encomendas, ocorrências do condomínio, tudo ligado à Agenda e ao RAC Hoje | [08](08-frentes-funcionais.md#central-da-família-e-da-casa) |
| **Finanças e compras** | `mercado.js` (Mercado e Central de Compras), `js/compras.js`, `js/alimentacao.js`, `js/radar.js`, `js/painel.js` | **Funciona** (é a área mais desenvolvida) | Retomar em etapa própria: kits e combos, patrimônio, garantias e manutenção | [08](08-frentes-funcionais.md#central-de-compras-mantida-no-roadmap) |
| **Central Fiscal** | `js/fiscal.js`, migrations 032–039 e 049 | **Congelado**: existe e está no ar; a frente fiscal (OCR, SEFAZ, emissão e acompanhamento fiscal) foi retirada do planejamento em 13/11/2026 | **Fora do roadmap** (decisão do dono): código congelado, sem evolução; nenhuma funcionalidade fiscal nova; a migration 040 não será implementada | [07](07-decisoes-e-pendencias.md#decisões-tomadas) |
| **Saúde e treinos** (Garmin) | `js/saude.js`, função `garmin`, tabelas `garmin_dia` e `garmin_ativ` | **Funciona**: sincronização, prontidão, sono, VFC, padrões simples, treino com mapa (rota lida na hora, não guardada) | Fonte principal de sinais (tendências, recuperação, carga); mapas e histórico de trajetos só com ativação voluntária | [05](05-integracoes-e-automacoes.md#garmin-o-que-existe-de-verdade), [08](08-frentes-funcionais.md#garmin-avançado) |
| **Carreira e estudos** | `js/mba.js`, `js/carreira.js`, `js/rede.js`, `js/conexoes.js`, Estudos (`renderEstudos` em `js/app.js`) | **Funciona** (MBA, candidaturas, histórias STAR, competências, exercícios) | Trilhas de estudo (MBA, Python, SQL, Análise de Dados, BI) e evolução de competências com evidências | [08](08-frentes-funcionais.md#estudos-e-desenvolvimento-pessoal) |
| **Informação** | `js/newsletter.js`, notícias, `js/esportes.js`, X, vagas | **Funciona**; a Newsletter já agrupa matérias do mesmo fato dentro de cada edição | Acontecimentos: acompanhar um assunto ao longo dos dias, com o que mudou | [08](08-frentes-funcionais.md#notícias-e-acontecimentos) |
| **RAC Intelligence** | `supabase/functions/rac-ia`, `racIA()` em `js/app.js`, `js/iacustos.js` | **Funciona** como camada segura e com orçamento; 9 ações; **não é proativa** | Três camadas: detecção por regras, interpretação por IA quando agrega, apresentação contextual | [04](04-rac-intelligence.md) |
| **Sistema, segurança e integrações** | `js/sistema.js` (Saúde do RAC, Robôs), `js/seguranca.js` | **Parcial**: há um painel de saúde do site; não há histórico, duração, contagem nem alerta proativo | Monitor de integrações com estado, última execução, falhas e próxima execução de cada processo | [05](05-integracoes-e-automacoes.md#4-monitor-de-integrações) |

## Estado desejado, em uma frase por camada

- **Experiência**: o RAC Hoje é a porta de entrada; a navegação é por áreas; todas as telas usam o mesmo Design System.
- **Dados**: cada área é dona dos seus dados e oferece uma leitura padronizada (contrato) para quem agrega.
- **Inteligência**: sinais determinísticos → interpretação opcional pela IA → apresentação no momento certo, com controle do dono.
- **Operação**: tudo o que roda sozinho registra como foi, e o RAC avisa quando algo parou.

## Glossário curto

| Termo | O que quer dizer aqui |
|---|---|
| **RLS** | Regras do próprio banco que decidem quem lê e grava cada linha. É o que protege os dados, já que a chave do site é pública. |
| **Migration** | Arquivo `.sql` numerado que muda o banco. Só vale depois que o dono roda no SQL Editor. |
| **Edge Function** | Programa que roda no servidor do Supabase (ex.: `garmin`, `rac-ia`). Guarda os segredos; publicar é um passo separado do site. |
| **pg_cron** | Agendador dentro do banco (ex.: a rotina das 6h). |
| **Robô** | Script Python que roda no GitHub Actions e grava um `.json` público (notícias, vagas, Newsletter). |
| **Módulo** | Um arquivo de `js/` que desenha uma seção e só carrega quando ela abre. |
| **Núcleo** | `nucleo.js`: funções puras (sem tela e sem banco), testadas, usadas pelo site como `NUCLEO.x`. |
| **Contrato** | Combinado fixo de como um módulo entrega dados a outro (formato, campos, erros), para um poder mudar sem quebrar o outro. |
| **Sinal** | Algo que uma regra detectou e que pode merecer atenção (ex.: "conta vence em 3 dias"). Proposta do [04](04-rac-intelligence.md). |
