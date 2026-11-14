# RAC · 07 · Decisões e pendências

Registro das decisões tomadas, das questões que dependem do dono, das pendências e das alternativas descartadas.
Criado em 13/11/2026. **Regra**: nada é apagado; uma decisão que muda ganha uma linha nova com a data, e a antiga fica marcada
como substituída. Convenções: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

## Decisões tomadas

| Data | Decisão | Fonte |
|---|---|---|
| (permanente) | **Protocolo de autonomia do RAC**: dono define objetivos e decisões restritas; Claude Code executa lotes completos; ChatGPT arquiteta e revisa; sem aprovações técnicas microetapa; commit/push/PR dentro do lote autorizado; merge/publicação somente se incluídos; consulta ao dono apenas para custos, credenciais/permissões sensíveis, perdas irreversíveis, mudanças relevantes de produto/privacidade ou fora de escopo | pedido explícito do dono em 13/11/2026; `CLAUDE.md` § Protocolo Permanente |
| (permanente) | Autorizações do proprietário: sem commit, push, SQL em produção, deploy de função, publicação, segredos, cobrança ou IA paga sem autorização explícita; a experiência da Fernanda é preservada; a função `garmin` é intocável sem autorização expressa | `CLAUDE.md` |
| (permanente) | JavaScript ES5 puro, sem framework, sem build, sem dependências novas; bibliotecas só de CDN com versão exata | `CLAUDE.md` |
| (permanente) | Toda IA passa pela `rac-ia` e, no site, só por `racIA()`; a IA nunca grava; resposta DEMO nunca chega ao que salva | `CLAUDE.md` |
| 30/10/2026 | Plano do RAC Intelligence aprovado (v2) | `docs/rac-intelligence.md` |
| 31/10/2026 | Resumo da Newsletter automático (Haiku, 6h, 12h e 18h), única exceção à regra "IA só a pedido" | `CLAUDE.md`, `docs/newsletter.md` |
| 31/10/2026 | Ações da Central Esportiva só em DEMO nesta fase | `supabase/functions/rac-ia/acoes.ts` |
| 02/11/2026 | RAC Hoje (`hoje.analise`) só REAL, sem demonstração, só do dono, nunca automático | `CLAUDE.md`, `docs/hoje.md` |
| 02/11/2026 | Limitações aceitas da atualização global (Resumo, Esportes e Lista pelo caminho padrão; a aba Hoje da Newsletter pode gravar a edição de regras) | `README.md` |
| 12/11/2026 | Desenvolvimento pelo Claude Code na nuvem: só branches `claude/*`, commit e push só com "autorizo", PR só a pedido, merge do dono | `CLAUDE.md`, `docs/nuvem.md` |
| 12/11/2026 | A casa vê as páginas de categoria, produto e estabelecimento da Central de Compras; Radar e junção continuam só do dono | commit `fd9796f` (PR #5) |
| 13/11/2026 | **Funcionalidades fiscais, OCR, SEFAZ e acompanhamento fiscal saem do planejamento.** A Central Fiscal existente não evolui | pedido do dono (esta etapa) |
| 13/11/2026 | **Central da Família e da Casa** passa a integrar o escopo oficial (pessoas e animais, medicamentos, contas domésticas, condomínio e encomendas) | pedido do dono |
| 13/11/2026 | **Central de Compras** continua no roadmap, com o objetivo preservado, mas sua implementação fica para uma etapa posterior | pedido do dono |
| 13/11/2026 | **A IA é proativa e transversal, não um chatbot**: detecção determinística → interpretação → apresentação, sempre com justificativa | pedido do dono |
| 13/11/2026 | **n8n** só como possibilidade futura; não introduzir agora | pedido do dono; [Documento 05](05-integracoes-e-automacoes.md#6-n8n-avaliar-depois-não-agora) |
| 13/11/2026 | A arquitetura atual (HTML, CSS, ES5) é a premissa; mudança só com justificativa técnica, ganho mensurável e custo analisado | pedido do dono |
| 13/11/2026 | **Registro diário obrigatório** em [historico-diario.md](historico-diario.md), em três partes (o que fizemos, o que estamos fazendo, o que vamos fazer), datado e sem apagar o passado | pedido do dono |
| 13/11/2026 | Localização do Garmin só com privacidade: nada sensível em notificação ou tela pública; retenção, visibilidade e ativação voluntária | pedido do dono |
| 13/11/2026 (revisão do PR #6) | **Central Fiscal, decisão final**: OCR, SEFAZ, emissão e acompanhamento fiscal estão fora do planejamento; nenhuma funcionalidade fiscal nova; a Central Fiscal **não volta ao roadmap**; o código existente pode continuar no ar, **congelado, sem evolução**; a migration `040` **não é pendência de desenvolvimento** (o arquivo fica no repositório como está, sem aplicar e sem plano de aplicação). Resolve a questão D-03 | decisão do dono, revisão final do PR #6 |
| 13/11/2026 (revisão do PR #6) | **Proteção da `main`**: a ruleset que protege a `main` foi criada pelo dono e está ativa. Resolve a questão D-11. Continua pendente só a comprovação de que os robôs de Notícias e Vagas seguem gravando na `main` depois dela (ver "Pendências técnicas") | informado pelo dono; a API do GitHub mostra a `main` como protegida (consulta de 13/11/2026) |
| 13/11/2026 (início da Fase 2) | **A Fase 1 está encerrada para fins de planejamento**; as validações de fora que restavam (teste no iPhone e o push dos robôs depois da ruleset) não bloqueiam a Fase 2 e, se houver observação, são registradas e tratadas à parte. A Fase 2 (A1 a A6) foi autorizada com branch `claude/*`, commits, push e PR; merge, SQL em produção, deploy de função e publicação continuam dependendo de autorização explícita | pedido do dono (início da Fase 2) |

## Como ler as questões abaixo

- **Decisão tomada**: está na tabela acima, com data e fonte. Só o dono decide.
- **Questão em aberto**: depende do dono; nada foi decidido.
- **Recomendação do Claude**: sugestão técnica para ajudar a decidir. **Não é decisão** e não muda nada sozinha.
- **Ação do dono**: não é uma escolha, é uma conferência que só o dono pode fazer (ex.: consulta no banco de produção).

## Situação das questões D-01 a D-14 (revisada em 13/11/2026)

O texto original de cada questão foi preservado. Nenhuma questão foi apagada: as resolvidas ficam registradas aqui.

| ID | Questão (texto original) | Situação em 13/11/2026 |
|---|---|---|
| D-01 | Qual tema é o padrão? | **Decidida pelo dono em 13/11/2026**: tema claro como padrão; escuro existente funcional; fundo e azul Dodger preservados (direção RAC Modern Workspace) |
| D-02 | O que a Fernanda vê e faz nas frentes novas (medicamentos, contas, encomendas, condomínio, integrantes)? | **Em aberto**, antes da Família e Casa (F4) |
| D-03 | O que fazer com a Central Fiscal e a proposta `040`? | **Resolvida** em 13/11/2026: código congelado, sem evolução, fora do roadmap; a `040` não é pendência de desenvolvimento (ver "Decisões tomadas") |
| D-04 | Propostas `041` (categorias oficiais do Mercado) e `044` (IA do Radar)? | **Em aberto**, só na etapa própria da Central de Compras |
| D-05 | Para onde a notificação das 6h deve levar? | **Em aberto**; não impede a correção do clique na notificação (F1) |
| D-06 | Como enviar push dos sinais e alertas do monitor? | **Em aberto**, para a fase dos sinais no servidor (F6) |
| D-07 | A explicação dos sinais pela IA pode ser automática (uma vez por dia, com teto)? | **Regra vigente já decidida**: IA só a pedido; chamada automática só com autorização expressa do dono (`CLAUDE.md`). Só volta a ser questão se o dono quiser uma exceção na F6 |
| D-08 | Garmin: autorizar a investigação só de leitura dos dados extras? Ativar trajetos (L2/L3)? Qual retenção e quais zonas de privacidade? | **Em aberto**, para as etapas G4 e G5 (a `garmin` é intocável sem autorização) |
| D-09 | Guardar no servidor o texto das análises pagas (proposta P2 do RAC Hoje)? | **Em aberto**, para a F6 |
| D-10 | Versionar as skills `rac-publicar`, `rac-sql-novo` e `rac-acao-ia` no repositório (público, sem segredos), para valerem na nuvem? | **Em aberto** |
| D-11 | Ativar a Fase 1 da proteção da `main` (bloquear force push e exclusão)? | **Resolvida** em 13/11/2026: a ruleset da `main` está ativa; fica pendente só a comprovação dos robôs (ver "Decisões tomadas") |
| D-12 | O RAC Hoje substitui o Início do dono? | **Em aberto**, para a F5 |
| D-13 | Que informações do condomínio podem ser guardadas? | **Em aberto**, antes da parte de condomínio da F4 |
| D-14 | Conferir o estado real das migrations 036, 038 e 039 e reconciliar a documentação | **Ação do dono**, não é decisão; serve só para a documentação dizer a verdade (as três são da Central Fiscal, que segue congelada) |
| D-15 | A atualização automática ao voltar ao site (Fase 1) vale também para a casa (Fernanda)? (questão aberta em 13/11/2026) | **Em aberto**. Implementada só para o dono; para a casa nada mudou |

## Questões abertas (dependem do dono)

### Para as próximas fases (F1 a F4)

| ID | Questão | Opções | Recomendação do Claude (não é decisão) |
|---|---|---|---|
| D-02 | O que a Fernanda vê e faz nas frentes novas? | Para cada parte (medicamentos, contas, encomendas, condomínio, cadastro de integrantes): não vê · vê · vê e lança | Nenhuma: depende só do dono. Até ele decidir, nada muda para ela |
| D-05 | Para onde a notificação das 6h deve levar? | Agenda (como hoje) · RAC Hoje · o item que gerou o aviso | Nenhuma sobre o destino. Fato técnico: trocar o destino exige mexer na `garmin`; a correção do clique (F1) funciona com o destino de hoje |
| D-10 | Versionar as skills no repositório? | Sim, depois de revisar o conteúdo · Não, ficam só no computador do dono | Versionar, para valerem também na nuvem |
| D-13 | Que informações do condomínio podem ser guardadas? | Lista definida pelo dono | Só informação não secreta; nunca códigos de acesso, senhas ou credenciais |
| D-15 | A atualização ao voltar ao site vale também para a casa? | Só o dono (como está na branch) · dono e casa | Nenhuma: depende só do dono. Fato técnico: estender é trocar uma condição em `NUCLEO.atuVoltar` (e o teste) |

### Só quando a fase chegar (F5 em diante)

| ID | Questão | Opções | Recomendação do Claude (não é decisão) |
|---|---|---|---|
| D-01 | Qual tema é o padrão? | Tema atual · "Noite Dodger" (proposta do [Documento 03](03-design-system.md#2-direção-visual-noite-dodger)) · outro; e se a casa muda junto | Nenhuma: o Documento 03 só descreve a proposta visual |
| D-04 | Propostas `041` e `044` | Aplicar · adiar · descartar | Decidir na etapa da Central de Compras |
| D-06 | Push dos sinais e do monitor | (a) pelo resumo das 6h (exige mexer na `garmin`); (b) função nova só para avisos; (c) sem push, só no RAC Hoje | Nenhuma: notificações dependem só do dono. Fato técnico: (a) exige autorização para a `garmin`; (b) exige publicar uma função nova |
| D-08 | Dados extras e trajetos do Garmin | Investigar só leitura · ativar trajetos · não ativar | Investigar primeiro; trajetos desligados por padrão |
| D-09 | Guardar o texto das análises pagas no servidor | Sim · não | Sim, junto com a interpretação de sinais |
| D-12 | O RAC Hoje substitui o Início do dono? | Sim · não · os dois convivem | Sim, com os cartões atuais virando blocos alimentados por fontes |

### Ação do dono (não é decisão)

| ID | O que fazer | Para quê |
|---|---|---|
| D-14 | Rodar as conferências só leitura das migrations 036, 038 e 039 (`supabase/conferencias/038_conferir_producao.sql`, `supabase/conferencias/039_conferir_producao.sql` e uma consulta à constraint de `ia_config` para a 036) | Corrigir as inconsistências I-01 a I-03 da documentação. Não é desenvolvimento fiscal |

## Inconsistências de estado encontradas

Encontradas na auditoria de 13/11/2026. Nenhum documento de módulo foi alterado nesta etapa; a correção faz parte da Fase 1
do [roadmap](06-roadmap.md), depois da conferência do dono. I-01 a I-03 são da Central Fiscal: corrigi-las é só documentação
(dizer o estado real), não retoma o desenvolvimento fiscal.

| # | Divergência | Evidência | Como resolver |
|---|---|---|---|
| I-01 | A `036` (IA fiscal) aparece como "NÃO aplicada" no cabeçalho do arquivo e numa tabela do `docs/fiscal.md`, e como "aplicada" no `docs/mapa.md` e em outro trecho do `docs/fiscal.md` ("036 aplicado, `rac-ia` publicada, `fiscal.nota` liberada") | `supabase/036_ia_fiscal.sql` (linha 1); `docs/fiscal.md` linhas 139 e 259; `docs/mapa.md` | Consulta só leitura da constraint de `ia_config` |
| I-02 | A `038` aparece como "PROPOSTA · NÃO APLICADA" no cabeçalho e no `docs/fiscal.md`, e como "aplicada em 08/11/2026" no `docs/mapa.md` | `supabase/038_seguranca_estado_tentativas.sql`; `docs/fiscal.md` linha 286 | `supabase/conferencias/038_conferir_producao.sql` |
| I-03 | A `039` aparece como "PROPOSTA · NÃO APLICADA" no cabeçalho e no `docs/fiscal.md`, e como "aplicada em 08/11/2026" no `docs/mapa.md` | `supabase/039_nota_foto_sem_chave.sql`; `docs/fiscal.md` linha 288 | `supabase/conferencias/039_conferir_producao.sql` |
| I-04 | `docs/hoje.md` diz que as Etapas 2 a 5 estão "só na cópia local, ainda não publicada", mas esse código está na `main` (publicada pelo Pages) | `js/hoje.js` contém `sem_web_locks` (Etapa 5) na `main` | Atualizar a tabela de estado |
| I-05 | `docs/rac-intelligence.md` ("Estado atual (31/10/2026)") diz que nenhuma chamada paga foi feita e tudo está em DEMO; `docs/hoje.md` registra 3 chamadas reais em 02/11/2026 e a Newsletter está em REAL | os dois documentos | Nova linha de estado datada |
| I-06 | `docs/veiculos.md` diz que o banco só libera REAL para `newsletter.resumo`; a `028` liberou `hoje.analise` | `docs/veiculos.md` linha 44; `supabase/028_hoje.sql` | Atualizar a frase |
| I-07 | `docs/compras.md` mantém títulos "só no código local; nada publicado" para lotes que já estão na `main` | `docs/compras.md` linhas 212, 280, 306; `coResumo` em `nucleo.js` | Acrescentar "publicado em …" |
| I-08 | O `README.md` diz que o site com o RAC Hoje "ainda não foi publicado" e que nenhum arquivo está com `-- status: pendente`; o RAC Hoje está no ar e a `040` continua com essa marca (não aplicada; não é pendência de desenvolvimento) | `README.md` linhas 78 e 110; `supabase/040_nota_fiscal_entrada_mercado.sql` | Atualizar as duas frases |
| I-09 | `docs/mapa.md` cita as propostas `044` e `045` em `supabase/propostas/`; a `045` foi aplicada e movida para `supabase/` | `supabase/045_radar_rotina.sql`; commit `2885eb7` | Corrigir a linha do Radar |
| I-10 | `CLAUDE.md` e `docs/mapa.md` mandam usar as skills `rac-publicar`, `rac-sql-novo` e `rac-acao-ia`, que não existem na nuvem (só no computador do dono) | `.claude/` contém só `settings.json` | D-10 |

## Pendências técnicas

| Pendência | Origem | Situação |
|---|---|---|
| Migration `040` (dar entrada da nota fiscal no Mercado) | `supabase/040_nota_fiscal_entrada_mercado.sql` | **Deixou de ser pendência em 13/11/2026** (decisão do dono, D-03 resolvida): o arquivo fica no repositório como está, sem aplicar e sem plano de aplicação. Registro anterior: "pendente; a função não existe em produção" (conferido em 13/11/2026). O `tests/banco.test.mjs` continua a listá-la como "todo" por causa da linha `-- status: pendente` do arquivo; isso não é pendência de desenvolvimento |
| Comprovar que os robôs de Notícias e Vagas continuam gravando na `main` depois da ruleset | `.github/workflows/noticias.yml`, `.github/workflows/vagas.yml` | **Pendente**: comprovado quando cada robô tiver um push bem-sucedido na `main` depois da criação da ruleset (commit "Notícias atualizadas" e "Vagas atualizadas em …" de `github-actions[bot]`). Evidência registrada no [histórico diário](historico-diario.md) |
| Propostas `041` e `044` | `supabase/propostas/` | Não aplicadas; ver D-04 |
| P2 (recuperar análise paga perdida) e P5 (validar fato × inferência) | `docs/hoje.md` | Não resolvidas; dependem de servidor |
| Atualização global de Resumo, Esportes e Lista | `README.md` (limitações aceitas) | Aceitas até etapa própria |
| Primeiro teste REAL do abastecimento | `docs/rac-intelligence.md`, `docs/veiculos.md` | Ação em DEMO em produção |
| Agrupamento da Newsletter não junta línguas diferentes | `docs/newsletter.md` | Limitação conhecida |
| Busca lateral chama Esportes sem carregar (P-19) | [Documento 02](02-auditoria-arquitetural.md#6-problemas-encontrados-com-evidência) | Hipótese forte; corrigir na Fase 1 |
| Clique na notificação (P-17) e retorno à aba (P-16) | [Documento 08](08-frentes-funcionais.md#rac-hoje-painel-central) | Fase 1 |
| Busca lateral (P-19), atualização de 13/11/2026 | Fase 1 | **Corrigida na branch** `claude/fase-1-confiabilidade-rac-dhwm7a` (falta merge e publicação). Confirmado no código: sem `js/esportes.js` carregado, o foco na busca lançava `ReferenceError` (registrado como "página" em `erros`) e os times nunca entravam. Agora carrega o módulo antes; para a casa nada muda. Teste `tests/busca_lateral.test.mjs` |
| Clique na notificação (P-17), atualização de 13/11/2026 | Fase 1 | **Implementado na branch** (falta merge, publicação e o teste no iPhone: app aberto, fechado e recém-atualizado). Destinos iguais (D-05 em aberto). Teste `tests/notificacao.test.mjs` |
| Retorno à aba (P-16), atualização de 13/11/2026 | Fase 1 | **Implementado na branch**, só para o dono (falta merge e publicação; a casa é a questão D-15). Teste `tests/voltar_aba.test.mjs` |
| Monitor de integrações M1 e M2, 13/11/2026 | [Documento 05](05-integracoes-e-automacoes.md#43-implementação-de-m1-e-m2-fase-1-13112026) | **Implementado na branch** (falta merge e publicação). Adiados: cartão no RAC Hoje (depois do contrato de fontes, A4, ou na F5) e M3/M4 (F6) |
| Migration `050` (catálogo da auditoria de segurança, Fase 2 · A6), 13/11/2026 | `supabase/050_seguranca_catalogo.sql`, `supabase/conferencias/050_conferir_producao.sql` | **Preparada e testada (PGlite), não aplicada** (marca `-- status: pendente`; `tests/banco.test.mjs` a lista como "todo"). Aplicar é passo do dono, com autorização própria; depois, tirar a marca e conferir a Auditoria no site. Procedimento de tabela nova em `docs/seguranca.md` (Catálogo da auditoria). Até a 050 ser aplicada, tabela nova continua exigindo recriar `seguranca_estado()` |
| Fase 2 (A1 a A5), 13/11/2026 | branch `claude/fase-2-fundacao-tecnica-rnfabm` | **Implementados e testados na branch**; falta merge (dono) e publicação. Sem SQL e sem Edge Function |
| Leituras paginadas com código próprio (Resumo, Painel, Sistema…) | Fase 2 · A1 | Passam a usar `dadosPaginar` (`js/dados.js`) quando o módulo for mexido; não é bloqueio |
| Duplicação da Agenda no servidor (`agendaServidor` na função `garmin`) | P-08; Fase 2 · A5 | A regra do site está no núcleo (`NUCLEO.agendaItens`); unificar com o servidor é a A7 e depende de autorização para a `garmin` |
| Robôs depois da ruleset, situação em 13/11/2026 (Fase 1) | `.github/workflows/noticias.yml`, `.github/workflows/vagas.yml` | **Continua pendente, sem evidência**. Investigação: o de Notícias só faz commit e push quando um dos 4 JSON muda (as rodadas completas sempre mudam o `coletado`; as rodadas só da Newsletter quase nunca); o de Vagas muda o `coletado` todo dia. Os dois fazem push normal (avanço rápido) com o `GITHUB_TOKEN`, que uma ruleset que só bloqueia force push e exclusão não barra; se a ruleset também exigir PR, o push falha e o monitor mostra "falhou". O de Vagas faz push sem `git pull --rebase` (se a `main` mudar durante os ~45 s da execução, o push é recusado): risco antigo, sem relação com a ruleset; workflows não alterados |

## Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| Migrar para um framework (React, Vue, Svelte), TypeScript ou bundler | Custo alto de migração e de teste, sem ganho mensurável; os problemas encontrados são de organização, resolvidos com contratos e extração de peças ([Documento 02](02-auditoria-arquitetural.md#10-o-que-manter-refatorar-e-não-mexer)) |
| Microserviços ou backend próprio | O Supabase cobre banco, regras, funções e agendamento |
| Reescrever `mercado.js` | Funciona e é muito testado; só sai dele a parte de plataforma |
| n8n agora | Servidor e segredos a mais, sem necessidade atual ([Documento 05](05-integracoes-e-automacoes.md#6-n8n-avaliar-depois-não-agora)) |
| Chat de IA como interface principal | Decisão do dono: inteligência proativa e contextual |
| IA calculando números | O banco e o núcleo calculam com precisão e sem custo |
| OCR, SEFAZ, emissão e acompanhamento fiscal | Retirados do planejamento em 13/11/2026 |
| Evoluir a Central Fiscal ou aplicar a migration `040` | Decisão do dono em 13/11/2026: código congelado, fora do roadmap; a `040` não será implementada |
| Rastrear localização continuamente ou guardar rotas sem pedido | Invasivo; trajetos só com ativação voluntária e zonas de privacidade |
| Raspagem de LinkedIn, de aplicativos do condomínio ou de sites sem permissão | Regras do `CLAUDE.md` e termos de cada fonte |
| Guardar códigos de acesso, senhas ou credenciais do condomínio | Risco de segurança sem benefício que justifique |
| Tabelas separadas para pessoas e para animais | Uma tabela de integrantes com `tipo` evita redundância |

## Atualização de 13/11/2026 · Fase 3 (Design System)

- **D-01 (tema padrão) — decidida pelo dono**: tema **claro** como padrão; escuro existente funcional, sem regressões; fundo atual e azul Dodger preservados; identidade própria. Direção oficial: **RAC Modern Workspace**
  (produtividade moderna para estrutura e navegação, analytics minimalista para acabamento, dashboard analítico para gráficos). Guia em [`docs/design-system.md`](../design-system.md#direção-aprovada-rac-modern-workspace).
  A recomendação anterior ("escuro Dodger como opção primeiro") foi **superada** por esta decisão.
- **Decisões técnicas tomadas na implementação (reversíveis)**: o CSS do Design System mora em `css/rac.css` (não no `index.html`); o shell novo vale só para o dono (`html.logado:not(.casa)`); a Central de Compras não é tocada;
  o menu por área é CSS sobre o registro de rotas (campo `area`), sem reordenar o registro; a barra inferior do celular sai do mesmo registro (campo `curto`); `js/kit.js` guarda os componentes (sem tela, sem banco).
- **Pendente, depende do dono**: aprovar o piloto no iPhone (critério da F3); D-12 (o Início convive com o RAC Hoje ou é substituído); autorizar DS-5 (telas da casa) quando chegar a hora; merge e publicação.

## Atualização de 13/11/2026 · RAC Inbox (POC iCloud)

- **Decisão do dono:** a POC iCloud é publicada por workflow manual do GitHub Actions, com credenciais Cloudflare em secrets de um Environment protegido; nenhum token Cloudflare é entregue à sessão do Claude. `PROBE_TOKEN` aleatório por execução, nunca persistido. Remoção do Worker só em atividade futura autorizada. Detalhes: [guia](../icloud-poc-deploy.md).
- **Pendente, depende do dono:** token Cloudflare só com `Account → Workers Scripts → Edit`; Environment `cloudflare-poc` (aprovador e branches `main` e `poc/icloud-cloudflare-connectivity`); secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; merge desta PR e da PR #17 (Worker).
- **A confirmar no primeiro uso:** que o botão "Run workflow" só aparece com o arquivo na `main`; se o deploy não interativo exige subdomínio `workers.dev` já registrado.

## Decisão de 13/11/2026 · Desenho B: workflow privilegiado só na main

- **Decisão do dono (aprovada):** o workflow que acessa os secrets da Cloudflare existe **só na `main`**, é disparado a partir dela e recebe o commit da POC como **entrada de dados**; nada da branch é executado, com ou sem secrets. Os Environments `cloudflare-poc` e `icloud-auth-poc` devem aceitar **só a `main`**. Supera a recomendação anterior de restringir os Environments à branch da POC, que não fechava o risco de workflow privilegiado vindo de branch controlada.
- **Implementado e testado (não executado):** workflow de três jobs (`verificar` sem secrets; `provisionar` com `cloudflare-poc`, sem baixar a branch; `executar` com `icloud-auth-poc`, só `id-token: write`); Wrangler pelo lockfile da `main` (`npm ci --ignore-scripts`, integridade conferida); pacote inspecionado, com `sha256` conferido entre os jobs e publicado sem novo empacotamento; SHAs das actions conferidos nos repositórios oficiais. Guia: `docs/icloud-poc-deploy.md`.
- **Workflow antigo `icloud-probe-deploy.yml`:** retirado na mesma mudança (um único caminho de publicação privilegiada). Até o merge, procedimento manual do dono para neutralizá-lo: *Actions → o workflow → Disable workflow*. O Worker de conectividade continua publicado, sem uso; sua remoção da Cloudflare é atividade futura com autorização específica.
- **Regra permanente registrada no `CLAUDE.md`** (seção Segurança): credenciais de nuvem só em Environments, usados só por workflow privilegiado da `main`, com Environments restritos à `main`.
- **Limite registrado (replay):** o token OIDC pode ser reutilizado dentro da validade; uso único exige persistência, **não implementada** e dependente de autorização específica, a decidir antes de qualquer operação que altere a caixa ou envie e-mail.
- **Pendente, depende do dono (nada foi configurado):** mesclar esta PR; Environments com aprovador obrigatório e só a `main`; desativar o workflow antigo até o merge; token Cloudflare de permissão mínima com prazo; mesclar a PR #17 (Worker e política OIDC da `main`); só então autorizar o primeiro ensaio OIDC, sem credencial Apple. A fase I0 não está concluída.

## Decisão de 14/11/2026 (noite) · RAC Inbox (portão do pin e suporte do workflow à P2)

- **Decisão do dono:** integrar à `main` **somente** o suporte necessário no workflow confiável (operação `p2_imap`, entrada `uid_mensagem`) e um **portão de pin por conteúdo SHA-256**, sem incorporar a PR #17 (que permanece em Draft, sem merge). O código do Worker da P2 fica na branch da P2.
- **Pin:** `experimentos/icloud-auth-probe-ferramenta/aprovados.json`, com dois pins (`p1` e `p2`, preservando rollback) e a tabela operação → pin: `p1_imap` só aceita o conteúdo P1; `p2_imap` só o P2; `validar_oidc` e `validar_uso_unico` aceitam os dois. Hash determinístico (manifesto `rac-pin-v1` com caminhos e conteúdos, ordem bytewise), lista fixa validada (ausente, extra, renomeado, link, submódulo, executável), `wrangler.jsonc` incluída; hashes lidos dos objetos do Git. **O hash do bundle não entra no pin** (decisão do dono).
- **Onde falha:** no job `verificar` (sem secrets e sem Environment), antes de montar e empacotar e antes de qualquer job privilegiado; a aprovação humana do Environment não substitui esse controle.
- **Node do CI fixado:** `setup-node` com a versão exata `24.22.2` no workflow da POC. O `testes.yml` não foi alterado (o script da nuvem lê dele a versão principal do Node).
- **Regra de revisão obrigatória** em `.github/workflows/**` e na pasta da ferramenta: **documentada** em `docs/icloud-poc-deploy.md`; a configuração no GitHub (ruleset e `CODEOWNERS`) fica para execução posterior do dono.
- **Estado:** implementado e testado localmente em branch local; **sem push, sem PR, sem merge, sem publicação, sem execução da P2 real.** P2 não concluída; I0 não concluída; I1 não iniciada.
- **Pendente, depende do dono:** autorizar push e PR para a `main`; configurar a regra de revisão; depois do merge, atualizar a branch da P2 com a `main` e autorizar publicação e **uma** execução de `p2_imap`.

## Atualização de 14/11/2026 (noite, 3) · RAC Inbox (revisão da PR #22, CODEOWNERS e limites da regra de revisão)

- **Revisão técnica da PR #22 concluída com correções** (dono autorizou revisar, corrigir e, atendidos os critérios, mesclar; sem tocar na PR #17, na branch da P2 antes do merge, no Worker, nos secrets ou no iCloud):
  - **Node:** o log da execução real da P1 (43599209307) mostra que o runner usou o Node `24.22.2` (cache do runner); o pin passou de `24.22.3` (versão da máquina de desenvolvimento) para **`24.22.2`**, a versão comprovadamente usada e presente no runner.
  - **Tamanho do pacote:** o pacote segue ao job `provisionar` em variável de ambiente (limite do Linux: 131072 bytes por variável); o bundle P2 (74 KB, ≈99 mil caracteres em base64) está a ~25% do limite. O `verificar` agora recusa, **antes de qualquer aprovação**, pacote acima de 120000 caracteres em base64.
  - **Textos desatualizados** (cabeçalho do workflow e guia ainda falavam em "lista fixa" e em aprovador como única barreira) e contagem do lockfile (92 entradas com a raiz, 91 pacotes) alinhados.
  - **Checkout esparso:** a reprodução local do `actions/checkout` (mesmos comandos do log real: `--filter=blob:none --depth=1`, sparse-checkout) confirmou que os blobs da pasta do Worker existem localmente e o `git cat-file` funciona (inclusive sem rede).
  - **P1 pin = código provado:** o log real confirma que a execução 43599209307 publicou o commit `68403f5221ed3d371e5786ed8cbca6a7b5492b6e`, o mesmo do pin P1.
- **`CODEOWNERS` implementado** (`.github/CODEOWNERS`: workflows, pasta da ferramenta e o próprio arquivo). **Ruleset na `main`: não configurado** por falta de ferramenta e de permissão administrativa na sessão; o que falta e dois riscos (conta única: o autor não aprova o próprio PR, e robôs que gravam direto na `main`) estão no guia (seção "Portão do pin").
- **Defeito encontrado e NÃO corrigido (fora do escopo desta PR; fica para decisão do dono):** o Worker da P2 trata como erro (`resposta_inesperada`) uma segunda resposta FETCH não solicitada para o mesmo UID, o que um servidor real pode enviar (ex.: atualização de flags por outro cliente). É falha fechada e segura, mas pode derrubar a execução real por motivo benigno; corrigir exige novo commit no Worker e novo pin.

