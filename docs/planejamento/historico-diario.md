# Histórico diário do RAC

Registro cronológico de cada dia de trabalho. Regras (pedido do dono em 13/11/2026; resumo no `CLAUDE.md`):

- Cada dia tem **três partes**: **1. O que fizemos** (alterações concluídas, testes, commits, PRs, publicações confirmadas,
  decisões tomadas) · **2. O que estamos fazendo** (trabalho em andamento, estado atual, bloqueios, dependências) ·
  **3. O que vamos fazer** (próximos passos, prioridades, critérios de conclusão).
- **Nunca registrar como concluído o que está só planejado.** Merge, SQL aplicado, função publicada e site publicado são
  estados diferentes (ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto)).
- **Nunca apagar registros.** Correções entram como nova linha datada no dia em que foram feitas.
- Os dias ficam em ordem cronológica, do mais antigo para o mais novo (há teste: `tests/planejamento.test.mjs`). Mais de um
  registro no mesmo dia: `## dd/mm/aaaa · assunto`, cada um com as três partes.
- Cada registro diz o estado da entrega separando **branch**, **PR**, **merge** e **publicação** (e, quando houver, SQL e funções).

Antes deste registro, a história do projeto (23/10 a 12/11/2026) está no `git log` e nos documentos de cada módulo
(`docs/*.md`); o resumo está no [Documento 1](01-visao-e-mapa-mestre.md#o-rac-hoje-em-números-13112026).

## 13/11/2026

### 1. O que fizemos

- **Auditoria completa do RAC**, sem alterar funcionalidade: front-end (`index.html`, `js/app.js`, `nucleo.js`, `mercado.js` e os 23
  módulos de `js/`), banco (46 tabelas, migrations `schema.sql` a `049`, propostas), Edge Functions (`garmin`, `rac-ia`,
  `rac-newsletter`, `radar`), robôs e workflows, testes, documentação e o histórico completo do Git (358 commits) e do GitHub
  (5 PRs, todos mesclados; só a `main` e uma branch antiga).
- **Consulta só de leitura ao banco de produção** (sem login, o mesmo teste que o CI roda às segundas, `tests/banco.test.mjs`):
  os 96 objetos das migrations aplicadas existem; a `040` continua pendente.
- **Documento 1 oficial criado** em `docs/planejamento/`: visão e mapa mestre (01), auditoria arquitetural (02), Design System (03),
  RAC Intelligence proativa (04), integrações e automações (05), roadmap (06), decisões e pendências (07), frentes funcionais (08)
  e este histórico.
- **Documentos atualizados**: `docs/mapa.md` (linha do planejamento), `README.md` (seção "Planejamento") e `CLAUDE.md` (seção
  "Planejamento e histórico diário", com a regra deste arquivo).
- **Teste novo** `tests/planejamento.test.mjs`: documentos esperados, links e âncoras internos, caminhos citados, dados pessoais e a
  estrutura deste histórico.
- **Testes executados** (nuvem, como o CI, `bash scripts/nuvem_testes.sh`): Grupo 1 com 1.377 testes, 1.376 passaram, 0 falhas e
  1 pendente esperado (a função da `040`, ainda não aplicada); Grupo 2 (PGlite) com 73 testes, todos passaram. `git diff --check` sem
  problemas.
- **Commit e PR**: commit `2faf9c7` na branch `claude/rac-audit-planning-a8gzde`, push da branch e **PR #6** aberto para a
  `main` (não mesclado). Este registro do número do PR entrou num segundo commit da mesma branch.
- **Nenhuma alteração** em código do site, SQL, Edge Function, segredos, `.claude/settings.json`, `ia_config` ou orçamento.
  Nenhuma chamada paga. Nenhuma publicação manual.
- **Decisões do dono registradas** no [Documento 07](07-decisoes-e-pendencias.md#decisões-tomadas): frente fiscal (OCR, SEFAZ,
  acompanhamento fiscal) fora do planejamento; Central da Família e da Casa no escopo oficial; Central de Compras mantida para
  etapa posterior; IA proativa e não chatbot; n8n só como possibilidade futura; ES5 sem framework como premissa; registro diário
  obrigatório; localização do Garmin só com privacidade.

### 2. O que estamos fazendo

- O trabalho desta etapa está no **PR #6** (branch `claude/rac-audit-planning-a8gzde`), aguardando revisão e merge do dono (o merge publica
  só a documentação; o site continua na versão `2026-11-12.9`).
- **Dependências**: as decisões D-01 a D-14 do [Documento 07](07-decisoes-e-pendencias.md#questões-abertas-dependem-do-dono),
  principalmente D-14 (conferir o estado real das migrations 036, 038 e 039) para reconciliar a documentação.
- **Bloqueios**: nenhum.

### 3. O que vamos fazer

Fase 1 do [roadmap](06-roadmap.md) (confiabilidade), cada item com o seu critério de conclusão:

1. **Notificação das 6h abre o destino certo**: tocar no push abre a página certa com o app aberto, fechado e recém-atualizado
   (teste no iPhone com "Mandar um teste").
2. **Atualizar ao voltar à aba** sem apagar o que está sendo digitado: volta depois de 5 min atualiza; com campo alterado ou
   foco em campo, nada muda (testes do núcleo).
3. **Monitor de integrações M1 e M2**: todo processo agendado com estado, última execução, sucesso, falhas e próxima prevista;
   teste que compara os horários do monitor com os agendamentos reais.
4. **Correção da busca lateral** (P-19).
5. **Reconciliar a documentação de estado** (I-01 a I-10), depois da conferência só leitura pelo dono.

Em seguida, a Fase 2 (fundação técnica: camada de dados, contrato de fontes e auditoria sem lista fixa) antes da Central da
Família e da Casa.

## 13/11/2026 · Revisão final do PR #6

### 1. O que fizemos

- **Revisão final pedida pelo dono, só documental**: sem refazer a auditoria e sem tocar em código do site, banco, migrations,
  Edge Functions, segredos ou orçamento. Arquivos alterados: documentos 01, 02, 03, 05, 06, 07 e 08, este histórico e o teste
  `tests/planejamento.test.mjs`.
- **Central Fiscal e migration 040** (decisão do dono): OCR, SEFAZ, emissão e acompanhamento fiscal fora do planejamento; nenhuma
  funcionalidade fiscal nova; a Central Fiscal não volta ao roadmap; o código existente fica no ar, congelado; a `040` não é
  pendência de desenvolvimento. Registrada em "Decisões tomadas" do [Documento 07](07-decisoes-e-pendencias.md#decisões-tomadas);
  a questão D-03 ficou marcada como resolvida, com o texto original preservado; a linha da `040` em "Pendências técnicas" mantém o
  registro anterior e diz que deixou de ser pendência; o [roadmap](06-roadmap.md) tirou a Central Fiscal da tabela de iniciativas e
  a cita só numa nota "Fora do roadmap"; os documentos 01, 02 e 08 deixaram de chamar a `040` de pendente.
- **Correção do registro anterior** (não apagado): o registro "13/11/2026" acima diz que "a `040` continua pendente". Continua
  verdade que ela não foi aplicada, mas, desde esta revisão, ela não é pendência de desenvolvimento.
- **Proteção da `main`**: a ruleset criada pelo dono está ativa (a API do GitHub mostra a `main` como protegida na primeira consulta
  desta sessão, na madrugada de 13/11/2026, e de novo por volta de 02h05 UTC). Registrada nos documentos 01, 05, 06 e 07; a questão D-11 ficou marcada como resolvida.
  Não é mais apresentada como pendência.
- **Robôs depois da proteção, evidência conferida**: os últimos pushes de robô na `main` foram o de Notícias (`2bcfe29`, 23h35 UTC de
  12/11) e o de Vagas (17h48 UTC de 12/11). Não se sabe daqui se a ruleset já existia nesses horários, então eles **não comprovam**
  o funcionamento depois dela. A execução de Notícias de 02h05 UTC de 13/11 (execução 96) terminou com sucesso, mas era a rodada
  só da Newsletter, não havia nada novo e **não houve push**. Resultado: ainda sem evidência; segue como pendência.
- **Questões D-01 a D-14 revisadas** no Documento 07: D-03 e D-11 resolvidas; D-07 registrada como regra vigente (IA só a pedido;
  automática só com autorização expressa); D-14 passou a "ação do dono", não decisão; as outras dez seguem em aberto, separadas em
  "próximas fases" (D-02, D-05, D-10, D-13) e "quando a fase chegar" (D-01, D-04, D-06, D-08, D-09, D-12). Recomendações do Claude
  ficaram numa coluna própria, marcadas como "não é decisão"; para a Fernanda (D-02), o tema (D-01), o destino da notificação (D-05) e o
  canal de push dos sinais (D-06) não há recomendação, só as opções e os fatos técnicos.
- **Consistência entre documentos**: o roadmap (06) passou a citar, em cada fase, a questão em aberto de que depende (sem presumir
  tema, acesso da Fernanda, destino da notificação ou papel do Início); a Fase 1 ganhou a comprovação dos robôs; o Documento 01
  registra o PR #6 aberto e a proteção da `main`; o Documento 03 deixou de dar o tema como definido na fase DS-2.
- **Teste**: o título de registro do histórico passou a aceitar mais de um registro no mesmo dia (`## dd/mm/aaaa · assunto`).
- **Testes executados**: `tests/planejamento.test.mjs` 6 de 6; `git diff --check` sem problemas; links, âncoras e caminhos citados
  sem nenhum quebrado; suíte integrada (`bash scripts/nuvem_testes.sh`, como o CI): Grupo 1 com 1.377 testes, 1.376 passaram,
  0 falhas e 1 "todo" (a marca `-- status: pendente` do arquivo da `040`, que não é pendência de desenvolvimento); Grupo 2
  (PGlite) 73 de 73.
- **Publicações confirmadas**: nenhuma nesta revisão.

| Entrega | Situação |
|---|---|
| Branch `claude/rac-audit-planning-a8gzde` | Commit desta revisão feito e enviado (push) |
| PR #6 | Aberto e atualizado com esta revisão (o número do commit aparece no PR; um commit não consegue citar o próprio número) |
| Merge na `main` | **Não feito** (é do dono) |
| Publicação do site | **Nenhuma**: o site segue na versão `2026-11-12.9`; quando houver merge, o GitHub Pages publicará só os `.md` novos |
| SQL em produção e Edge Functions | Nenhum |

### 2. O que estamos fazendo

- O PR #6 está pronto para revisão e aguarda o merge do dono.
- **Pendente**: comprovar que os robôs de Notícias e Vagas continuam gravando na `main` depois da ruleset. Critério: um commit
  "Notícias atualizadas" e um "Vagas atualizadas em …" de `github-actions[bot]` na `main` depois da criação da ruleset.
- **Questões em aberto para as próximas fases**: D-02, D-05, D-10 e D-13; **ação do dono**: D-14 (conferências só leitura das
  migrations 036, 038 e 039, só para a documentação).
- **Bloqueios**: nenhum.

### 3. O que vamos fazer

1. Depois do merge: registrar aqui o merge e a publicação dos documentos (datas e commit da `main`).
2. Registrar a primeira evidência de push de cada robô depois da ruleset ou, se falhar, o erro e a correção necessária.
3. Seguir para a Fase 1 do [roadmap](06-roadmap.md), com os critérios já registrados no registro anterior.

## 13/11/2026 · Fase 1 — Confiabilidade

### 1. O que fizemos

- **Merge e publicação do PR #6 conferidos** (item 1 do registro anterior): merge na `main` no commit `7d8b733` (02h18 UTC de 13/11);
  "pages build and deployment" desse commit terminou com sucesso (02h19 UTC) e o workflow "Testes" (execução 144) também (02h19 a
  02h23 UTC). Publicou só os documentos: o site continuou na versão `2026-11-12.9`. A branch da sessão foi avançada até `7d8b733`.
- **Auditoria das cinco frentes da Fase 1 no código atual** (sem presumir que a auditoria de 13/11 estava completa). Fatos novos: o P-19
  deixou de ser hipótese (sem `js/esportes.js` carregado, o foco na busca lançava `ReferenceError`, registrado como "página" em `erros`);
  o clique na notificação dependia só do `navigate`, sem tratar a recusa; o GitHub atrasa muito os robôs (Vagas, agendado para 10h UTC,
  começou entre 15h57 e 20h16 UTC de 07/11 a 12/11; Notícias roda cerca de 5 vezes por dia).
- **A · Monitor de integrações M1 e M2** (na branch): catálogo `MON_PROCESSOS` com os 6 processos agendados (rotina das 6h, Newsletter e
  Radar no pg_cron; Notícias, Vagas e Testes no GitHub) e os crons reais; regras `NUCLEO.mon*`; painel "Monitor de integrações" na página
  Sistema com estado, última execução, último sucesso, falhas em 7 dias, duração, registros e próxima prevista; o painel antigo "Robôs de
  coleta" foi incorporado (sem duplicar). M2 pelas execuções públicas do GitHub, sem mexer nos robôs. Detalhe e limites no
  [Documento 05](05-integracoes-e-automacoes.md#43-implementação-de-m1-e-m2-fase-1-13112026).
- **B · Notificação** (na branch): o `sw.js` traz a janela para a frente, avisa a página (que troca de página sozinha), usa o `navigate` só
  como reserva e só para trocar o "#…" do mesmo endereço, e guarda o destino por 5 minutos (para o app que abre no início). Destinos
  iguais aos de antes (Agenda, Resumo ou Lista; D-05 em aberto); horário e frequência da notificação não mudaram.
- **C · Atualizar ao voltar** (na branch): depois de 5 minutos fora, a página aberta se atualiza pelo mesmo ↻ (`atuAtualizar`, em modo
  silencioso). Não atualiza com campo em foco, formulário alterado, captura aberta, operação em andamento, sem internet ou logo depois de
  outra atualização; uma vez por volta. Só para o dono (a casa continua igual; questão D-15).
- **D · Busca lateral (P-19)** (na branch): carrega Esportes antes de pedir os times; os times continuam na busca do dono; para a casa nada
  muda.
- **E · Robôs depois da ruleset**: investigação dos workflows e do push condicional (ver as pendências técnicas do
  [Documento 07](07-decisoes-e-pendencias.md#pendências-técnicas)). A `main` continua protegida (consulta às 02h42 UTC). Nenhum push de
  robô na `main` desde a revisão do PR #6: **ainda sem evidência**. Nada foi forçado, nenhum commit vazio, nenhum serviço pago.
  Conferido de novo às 05h48 UTC: o GitHub não disparou nenhuma execução do robô de Notícias depois da de 02h05 UTC (as rodadas
  agendadas de 03h15 em diante não rodaram), e o de Vagas não roda desde 12/11 (o próximo costuma começar entre 16h e 20h UTC).
- **Versão do site na branch**: `2026-11-13.1` (`VERSAO` em `sw.js` e `MOD_VERSAO` em `js/app.js`, juntas).
- **Testes novos**: `tests/monitor.test.mjs`, `tests/notificacao.test.mjs`, `tests/voltar_aba.test.mjs` e `tests/busca_lateral.test.mjs`.
  Os testes do P-19 e do service worker falham com o código anterior e passam com o novo (conferido).
- **Testes e site ajustados**: `tests/newsletter.test.mjs` procurava o painel antigo "Robôs de coleta"; a asserção passou a conferir o
  mesmo dado no monitor (Newsletter com fontes fora do ar e limite de 14 h), sem pular nada. `index.html` ganhou uma regra de CSS (`.monint`)
  para as linhas do monitor quebrarem em vez de cortar com reticências; conferido numa página de prova a 390 px, sem rolagem lateral.
- **Documentos**: 02 (nota datada), 05 (seção 4.3 e os atrasos do GitHub), 06 (seção 3.1, andamento da Fase 1), 07 (questão D-15 e
  linhas novas nas pendências), `docs/mapa.md` e `README.md`. Nenhum registro anterior foi apagado.
- **Fora do escopo, intocados**: SQL e migrations, Edge Functions (inclusive `garmin` e `rac-ia`), workflows e scripts dos robôs,
  `.claude/settings.json`, segredos, `ia_config` e orçamento. Nenhuma chamada paga de IA.

### 2. O que estamos fazendo

- O trabalho está na branch `claude/fase-1-confiabilidade-rac-dhwm7a`, no **PR #7** para a `main`, aguardando revisão e merge do dono.

| Entrega | Situação |
|---|---|
| Branch `claude/fase-1-confiabilidade-rac-dhwm7a` | Commit `6847746` (o trabalho) e um segundo com este registro do PR; push feito |
| PR #7 | Aberto para a `main` |
| Merge na `main` | **Não feito** (é do dono) |
| Publicação do site | **Nenhuma**: o site segue na versão `2026-11-12.9`; com o merge, o GitHub Pages publica a `2026-11-13.1` |
| SQL em produção e Edge Functions | Nenhum (a Fase 1 não precisa) |

- **A Fase 1 não está concluída.** Dependem de evidência de fora: (a) o clique na notificação no iPhone, nos 3 cenários (app aberto,
  fechado e recém-atualizado), depois da publicação; (b) um push bem-sucedido de cada robô (Notícias e Vagas) na `main` depois da ruleset.
- **Decisão do dono**: D-15 (a atualização ao voltar vale também para a casa?). Continuam em aberto D-02, D-05, D-10 e D-13; D-14 é ação do
  dono (conferência só leitura para reconciliar os documentos, item da Fase 1 não iniciado nesta execução).
- **Bloqueios**: nenhum.

### 3. O que vamos fazer

1. Depois do merge do PR da Fase 1: registrar aqui o merge e a publicação do site `2026-11-13.1` (não há SQL nem função para publicar antes).
2. **Teste no iPhone** (roteiro): com o app aberto em outra página, Sistema → Notificações → "Mandar um teste" e tocar no aviso: deve
   abrir o Sistema; repetir com o app fechado (mandar o teste e fechar o app antes de chegar); e logo depois da publicação, antes de reabrir
   o app, tocar num aviso. Na manhã seguinte, o aviso das 6h deve abrir a Agenda (ou o Resumo no domingo, ou a Lista).
3. **Robôs**: registrar o primeiro commit "Notícias atualizadas" e o primeiro "Vagas atualizadas em …" de `github-actions[bot]` na `main`
   depois da ruleset ou, se o push falhar, o erro (o monitor mostrará "falhou").
4. Conferir no celular a volta ao site (sair por 5 minutos ou mais e voltar) e o painel do monitor.
5. Só depois: reconciliar os documentos (D-14) e, com autorização do dono, a Fase 2.

## 13/11/2026 · Fase 2 — Fundação técnica

### 1. O que fizemos

- **Preparação conferida**: a `main` contém o merge do PR #7 (commit `95940e4`, 05h55 UTC). Workflows desse commit: "pages build and
  deployment" concluído com sucesso (05h55–05h56 UTC) e "Testes" (execução 147) também (05h55–05h58 UTC). A branch `claude/fase-2-fundacao-tecnica-rnfabm` foi avançada até `95940e4` (avanço rápido, nada descartado).
  Linha de base antes de mexer: Grupo 1 com 1.422 testes (0 falhas, 1 "todo"), Grupo 2 com 73/73.
- **Decisão do dono** (registrada no [Documento 07](07-decisoes-e-pendencias.md#decisões-tomadas)): a Fase 1 está encerrada para fins de
  planejamento; as validações de fora (iPhone e robôs) não bloqueiam a Fase 2.
- **Auditoria conferida contra o código atual** (não presumida): achados novos que mudaram o plano. A Alimentação usava `enviarArquivos`
  da Família sem declarar (vinha pelo Resumo); o Painel usava Saúde, MBA e Família por tabela; a seleção da Agenda dependia de `FAM`,
  `AGENDA_ICO` e `tipoInfo`, espalhados entre Família e Sistema; existe a migration 049 (posterior à auditoria), então a nova é a 050;
  6 tabelas pessoais faltavam no teste "sem login não lê".
- **Implementado na branch** (A1 a A6, detalhes no [Documento 02](02-auditoria-arquitetural.md#9-plano-gradual-de-melhoria)):
  - A1 · camada de dados `js/dados.js`: cliente único do Supabase (pedidos simultâneos recebem a mesma instância), `dadosPaginar`, `sbOk`
    com o código do erro; `RACmercado.client`, `.url` e `.chave` como apelidos; login, Lista e RAC Hoje pela camada.
  - A2 · `js/graficos.js` com os gráficos `rs*` (código idêntico); Compras e Custos de IA carregam só o kit; a Alimentação só o kit e a
    Família (que ela usa); nenhum dos quatro carrega mais o Resumo; `BRL` virou apelido de `brl`.
  - A3 · registro de rotas `js/rotas.js`: `tabs`, `DA_CASA`, `ROTA_MODS`, o menu lateral (antes HTML fixo) e o desenho de cada rota saem de
    uma tabela; a regra de CSS da casa olha `data-casa`. Menu, rotas e permissões iguais (o que a Fernanda vê não mudou).
  - A4 · contrato de fontes `js/fontes.js` + `js/fonte-agenda.js`, `js/fonte-newsletter.js`, `js/fonte-mba.js`, `js/fonte-familia.js`:
    o RAC Hoje não lê mais `NLS`, `FAM`, `mbaFin` nem `AGENDA_ICO` e não carrega as telas do Sistema e do MBA.
  - A5 · `NUCLEO.saudeInsights`, `NUCLEO.famMeds`, `NUCLEO.agendaItens` e `NUCLEO.mba*De`, puras; as telas chamam o núcleo.
  - A6 · `supabase/050_seguranca_catalogo.sql` (catálogo `seguranca_catalogo` + `seguranca_estado()` lendo dele) e a conferência
    `supabase/conferencias/050_conferir_producao.sql`; procedimento de tabela nova em `docs/seguranca.md`; a Auditoria do dono ganha a linha
    "Catálogo da auditoria" só quando a função nova existir. **Migration preparada e testada, NÃO aplicada.**
- **Testes novos**: `tests/dados.test.mjs` (5), `tests/graficos.test.mjs` (5, inclui "nenhuma dependência escondida" para todos os
  módulos), `tests/rotas.test.mjs` (4; route() de antes e de agora lado a lado em mais de 250 combinações), `tests/fontes.test.mjs` (7),
  `tests/nucleo_fase2.test.mjs` (7; centenas de cenários comparados com o código de antes, em Brasília e UTC),
  `tests/seguranca_catalogo.test.mjs` (10, 5 no PGlite). Cópias do código de antes em `tests/fixtures/fase2/`.
- **Testes ajustados** (o texto antigo virou registro ou fonte; o que cada um confere continua): rotas e menu em `alimentacao`, `central`,
  `central_compras_tela`, `compras`, `compras_loja`, `fiscal_tela`, `hoje`, `newsletter`, `painel`, `esportes`, `estrutura`,
  `mercado_alertas_push`, `central_radar_tela`; o cliente em `banco`, `central`, `hoje` e `navegador`; ambientes falsos que agora carregam as
  fontes (`hoje`, `atualizar_modulos`, `olivia_medidas`); a 050 em `banco_lote3` e `central_compras_tela`; 6 tabelas a mais em `seguranca`.
- **Versão do site na branch**: `2026-11-13.2` (`VERSAO` e `MOD_VERSAO` juntas).
- **Fora do escopo, intocados**: Central de Compras, Central Fiscal, função `garmin`, `rac-ia`, orçamento de IA, segredos, cron, workflows
  dos robôs e `.claude/settings.json`. Nenhuma chamada paga de IA, nenhum SQL em produção, nenhum deploy de função, nenhuma publicação.

### 2. O que estamos fazendo

- O trabalho está na branch `claude/fase-2-fundacao-tecnica-rnfabm`, no **PR #8** para a `main`, aguardando revisão e merge do dono.
  O resultado do CI do PR fica no próprio PR e no relatório da sessão (este registro vai no commit que dispara o CI).

| Entrega | Situação |
|---|---|
| Implementação A1 a A5 | Feita na branch, testada |
| A6 (migration 050) | Preparada e testada (PGlite); **não aplicada** em produção |
| Commits na branch | `a323fb5` (A1 a A5), `12028b2` (A6, migration 050 preparada) e `cfc4234` (documentos); um quarto com este registro do PR |
| Push da branch | Feito (autorizado pelo dono para esta fase) |
| PR para a `main` | **PR #8** aberto (autorizado pelo dono) |
| Merge na `main` | **Não feito** (é do dono) |
| Publicação do site | **Nenhuma**: o site segue na versão `2026-11-13.1`; com o merge, o GitHub Pages publica a `2026-11-13.2` |
| SQL em produção e Edge Functions | Nenhum |

- **A Fase 2 não está concluída**: falta o merge (dono) e a aplicação da 050 (dono, com autorização própria).
- **Bloqueios**: nenhum.

### 3. O que vamos fazer

1. Depois do merge: registrar aqui o merge e a publicação do site `2026-11-13.2` e conferir no celular o login, o Mercado, a Lista, o menu
   do dono e o da casa, o RAC Hoje, a Agenda, a Saúde, a Família, o Resumo, Compras e o Painel.
2. Quando o dono autorizar: aplicar `supabase/050_seguranca_catalogo.sql` no SQL Editor, rodar `supabase/conferencias/050_conferir_producao.sql`
   (tudo `true`), tirar a marca `-- status: pendente` e conferir a Auditoria no site.
3. Seguir para a Fase 3 (Design System base) e a Fase 4 (Família e Casa), que já nascem sobre o registro de rotas, as fontes e o catálogo.

## 13/11/2026 · Fase 3 — Design System (DS-0 e DS-1)

### 1. O que fizemos

- **Conferência de partida**: PR #8 mesclado (`1654395`); workflow "Testes" da `main` com sucesso (run 150) e Pages publicado. A branch da sessão estava atrás da `main`
  (sem trabalho próprio) e foi avançada por fast-forward até `1654395`.
- **Auditoria**: o [Documento 03](03-design-system.md) já continha o diagnóstico completo; foi reaproveitado, com os números-chave reconferidos no código
  (cores soltas fora de variáveis: 115; 29 itens de menu num grupo só). Não foi repetida.
- **DS-0**: tokens `--rac-*` em `index.html` (marca, estados, superfícies, espaço, raio, sombra, movimento, camadas, alvo de 44 px, tipografia), apontando para os tokens atuais.
- **DS-1**: classes `rac-*` (cartão, botão, chip, selo, estado, esqueleto, campo, lista, tabela, tipografia); página interna `#componentes` (só dono, sem menu, `js/componentes.js`); módulo no cache offline (`sw.js`).
- **Testes**: novo `tests/design_system.test.mjs` (8 testes); `tests/rotas.test.mjs` ajustado para aceitar a única rota nova (30 → 31). Versão do site na branch: `2026-11-13.3` (`VERSAO` e `MOD_VERSAO`).
- **Resultados reais**: suíte completa `bash scripts/nuvem_testes.sh` — Grupo 1: 1475 testes, 1473 ok, 0 falhas, 2 `todo`; Grupo 2 (PGlite): 73 ok, 0 falhas. `git diff --check` limpo.
  Chromium (Playwright): 4 capturas (390 e 1280 px × claro e escuro), sem rolagem lateral, menor alvo de toque 44 px, nenhum erro de console.
- **Documentação**: `docs/design-system.md` (novo), `docs/mapa.md`, Documento 03 (§8), Documento 06 (§3.3), Documento 07 (atualização), este registro.
- **Decisões**: tokens novos apontam para os atuais (nenhuma tela muda); página de componentes é rota só do dono. **Não decidido**: tema padrão (D-01), só recomendação.
- **Fora do escopo, intocados**: Central de Compras, Central Fiscal, `garmin`, `rac-ia`, segredos, cron, workflows, `.claude/settings.json`, SQL. Nenhuma IA paga, nenhuma publicação.

### 2. O que estamos fazendo

- Trabalho na branch `claude/rac-fase-3-design-system-0msm91`; commit, push e PR conforme autorizado no pedido da fase (ver o PR para os hashes). **Merge: não feito (é do dono).** Site em produção segue sem a Fase 3.
- Limitações: a verificação visual foi no Chromium da nuvem, não no iPhone; o `tests/navegador.test.mjs` roda de fato no GitHub (CI).

### 3. O que vamos fazer

1. Dono: revisar o PR, abrir `#componentes` no celular nos dois temas e, se aprovar, mesclar (a publicação é o GitHub Pages).
2. Decidir D-01 (tema padrão) com a recomendação de `docs/design-system.md`.
3. DS-2 e DS-3: tema escuro como opção, menu agrupado e piloto no RAC Hoje e no Monitor; baixar a catraca (`LINHA_DE_BASE_CORES`). DS-5 (casa) só com autorização expressa.

## 13/11/2026 · Fase 3 — Redefinição visual e piloto RAC Hoje (RAC Modern Workspace)

### 1. O que fizemos

- **Conferência de partida**: branch = cabeça do PR #9 (`385b327`), baseada na `main` atual (`1654395`), sem divergência; PR #9 aberto e limpo.
- **Decisão do dono (substitui a direção "Noite Dodger")**: **RAC Modern Workspace** (produtividade moderna + analytics minimalista + dashboard analítico); tema **claro** como padrão; fundo e azul Dodger preservados;
  escuro existente funcional. **D-01 está decidida** (a recomendação anterior de escuro como opção primeiro foi superada). O DS-1 da primeira entrega foi auditado: mantidos os nomes `rac-*`, escalas e testes; refinados tokens,
  botões, chips, campos, lista e tabela; **substituídos** o cartão com borda, a tipografia condensada nos números e a página `#componentes` (classificação completa em `docs/design-system.md`).
- **Design System**: `css/rac.css` (tokens, componentes por função, shell do dono, piloto) e `js/kit.js` (`rk*`); gráficos reaproveitam `js/graficos.js` (inalterado) com `racDica`.
- **Navegação**: menu do dono em 6 áreas e **barra inferior no celular**, ambos gerados pelo registro `js/rotas.js` (campos `area` e `curto`; a ordem do registro não mudou); item ativo com tinta azul e indicador.
- **Piloto RAC Hoje**: painel com abertura, indicadores (atenção, gasto com variação, orçamento com medidor, prontidão), prioridades com link para o módulo, gastos atual × mês passado, contexto do dia, saúde
  (série real de passos e treinos), análise da IA e pergunta lado a lado, histórico e fontes recolhidos. **Sem fonte nova, sem dado inventado**; a lógica de IA, cache e cobrança não foi alterada.
- **Casa preservada**: todo o shell novo está sob `html.logado:not(.casa)`; 20 telas da casa (5 rotas × 390 e 1280 px × claro e escuro) comparadas com a `main`: 18 idênticas byte a byte, 2 com 1 pixel de diferença (antialiasing). Central de Compras (`#mercado`) não tocada.
- **Testes** (resultado real): `bash scripts/nuvem_testes.sh` — Grupo 1: 1478 testes, 1476 ok, 0 falhas, 2 `todo`; Grupo 2 (PGlite): 73 ok, 0 falhas. `git diff --check` limpo. `tests/design_system.test.mjs` reescrito
  (catraca, 40 pares de contraste, escopo do dono, menu por área, kit, página, piloto, ES5, versões); testes legados ajustados só nos pontos que mudaram (rotas, fontes, hoje, painel, newsletter, central).
- **Chromium real** (3 larguras: 390, 768, 1280; claro e escuro; dono e casa): sem rolagem horizontal, alvos de toque ≥ 44 px, **console sem erros**; interações conferidas (barra inferior, gaveta, "mostrar todas", dica dos gráficos, recolher, link do indicador, foco por teclado).
- **Versão do site na branch**: `2026-11-13.4` (`VERSAO`, `MOD_VERSAO` e `?v=` do CSS juntas).
- **Fora do escopo, intocados**: Central de Compras, Central Fiscal, `garmin`, `rac-ia`, orçamento, segredos, cron, workflows, `.claude/settings.json`, SQL, Edge Functions. Nenhuma chamada de IA, nada publicado, sem merge.

### 2. O que estamos fazendo

- Trabalho na branch `claude/rac-fase-3-design-system-0msm91`, **PR #9** (aberto; commit desta etapa depois do `385b327`, hash no PR). **Merge: não feito (é do dono). Publicação: nenhuma**; o site em produção segue sem a Fase 3.
- Aguardando o dono: ver o resultado e aprovar o piloto no iPhone (critério da F3).
- Limitações: capturas em Chromium da nuvem com dados fictícios e o fundo de fallback (a foto vem da internet); não testado no iPhone nem com os dados reais do dono.

### 3. O que vamos fazer

1. Dono: revisar o PR #9; depois do merge e da publicação, abrir `#rachoje` e o menu no iPhone e dizer o que ajustar.
2. DS-4: migrar os demais módulos um por vez (candidatos: Agenda e Saúde, que já alimentam o painel), baixando `LINHA_DE_BASE_CORES`; o Início ainda usa a tipografia condensada antiga (convive até a migração, D-12).
3. DS-5 (telas da casa) só com autorização expressa; Fase 4 (medicamentos, encomendas, contas) alimenta o painel sem novo desenho.

## 13/11/2026 · DS-4.1 — Modernização da Agenda (RAC Modern Workspace)

### 1. O que fizemos

- **Conferência de partida** (informada pelo dono): Fase 3 concluída, PR #9 mesclado na `main` (`f75a1f1`), piloto RAC Hoje validado no iPhone, direção RAC Modern Workspace aprovada. A branch da sessão
  (`claude/agenda-modernizacao-ds4-xuijw0`) estava 17 commits atrás da `main` e sem trabalho próprio; foi avançada por fast-forward até `f75a1f1`. A branch do PR #9 não foi reutilizada.
- **Página Agenda (`#agenda`) refeita no Design System**, só a tela, em módulo novo `js/agenda.js` (depende de `sistema`, `kit` e `graficos`): abertura azul com uma frase só com contagens reais; 4 indicadores
  (Atrasados, Hoje, Próximos 7 dias, Até 30 dias); **Próxima melhor ação** (destaque com ações rápidas e linhas secundárias); filtro por área; lista agrupada com marca de prioridade e "quando" em palavra, cor e marca;
  **Próximos 14 dias** (uma célula por dia, com data, dia da semana e quantidade); **Por área** (barras do kit); formulário de novo lembrete. Reaproveita o esqueleto `.rh-*` do piloto e o kit; só o que é da Agenda
  entrou numa seção nova do CSS (`.ag-*`, sem cor escrita). Guia: [`docs/agenda.md`](../agenda.md).
- **Regras no núcleo** (`NUCLEO.agd*`, funções puras): grupos, "quando", indicadores, frase, série de dias, áreas, filtro e peso da linha. Os critérios dos 6 grupos são os de antes (o teste copia os antigos e compara em todas as bordas de data).
- **Regras e comportamentos preservados**: leitura só por `agendaColetarLeitura`; régua `proximasSelecao`; ações rápidas `proximaAcao` (mesmos caminhos de gravação); "sem retorno" não é atraso; leitura parcial/falha dizem a verdade
  (falha total **não** mostra indicadores zerados); formulário grava em `PESSOAL.lembretes` como sempre. Melhorias pequenas de apresentação, sem mudar regra: botões da linha desligados após o toque (toque duplo não adia duas vezes),
  link de fora só http/https, aviso quando o filtro não deixa nada. O Início continua com os cartões antigos "Próxima melhor ação" e "Agenda" (`js/sistema.js` sem mudança nessas funções; D-12 em aberto).
- **Isolamento de `js/sistema.js`**: a única mudança é a saída de `renderAgenda` (para `js/agenda.js`) e dois comentários. Backup, Busca, Monitor, IA, página Sistema, régua, ações rápidas e cartões do Início ficaram como estavam.
- **Registro**: rota `agenda` com `mods:["agenda"]`, `MOD_DEPS.agenda`, módulo no cache offline (`sw.js`). Versão do site na branch: `2026-11-13.5` (`VERSAO`, `MOD_VERSAO` e `?v=` do CSS juntas).
- **Testes** (resultado real): `bash scripts/nuvem_testes.sh` — Grupo 1: 1493 testes, 1491 ok, 0 falhas, 2 `todo` (eram 1478 antes: +5 do núcleo e +10 da tela); Grupo 2 (PGlite): 73 ok, 0 falhas. `git diff --check` limpo.
  Novo `tests/agenda_tela.test.mjs` (10 testes, a tela de verdade num ambiente falso) e 5 testes `agd*` em `tests/nucleo.test.mjs`; ajustados só nos pontos que mudaram: marcadores de `tests/hoje.test.mjs`, equivalência de módulos por rota em `tests/rotas.test.mjs`
  (a única mudança aceita é a Agenda) e ES5/nomes/cache em `tests/design_system.test.mjs`. Áreas compartilhadas rodadas à parte: hoje 96, monitor 15, busca_lateral 5, seguranca 59, central 12, atualizar_modulos 16, painel 5, estrutura 7, rotas 4, fontes 7, planejamento 6, todas sem falha.
- **Chromium real** (Playwright, 390, 768 e 1280 px × claro e escuro, Supabase falso com dados fictícios): sem rolagem horizontal; 49 alvos de toque na página e **nenhum abaixo de 44 px**; console sem erros;
  interações conferidas (filtro, dica do dia, atalho do formulário, adicionar lembrete, Feito, Adiar 3 dias, link para o módulo, botão ↻ mantendo filtro e o texto digitado, foco por teclado). Início, Busca e Sistema abrem normalmente.
- **Casa (Fernanda)**: 44 telas (11 rotas × 390 e 1280 px × claro e escuro) comparadas com a `main`: **44 idênticas byte a byte**, sem erro de console. A Agenda não existe para a casa.
- **Áreas do dono que compartilham código** (Início, RAC Hoje, Sistema, Busca, Saúde, Painel, Carreira, Segurança, Resumo, Componentes × 390 e 1280 px × claro e escuro): 30 de 40 idênticas byte a byte; as 10 restantes diferem **no mesmo grau em que a própria `main` difere dela mesma**
  entre duas capturas (relógio ao vivo no Início e antialiasing de 1 px em contadores do menu; ex.: Início 1280 claro 17.477 px de ruído contra 17.480 antes × depois), sem diferença visível.
- **Fora do escopo, intocados**: função `garmin`, `rac-ia`, Edge Functions, SQL, secrets, cron, workflows, `.claude/settings.json`, Central de Compras. Nenhuma chamada paga de IA, nenhum SQL, nada publicado.

### 2. O que estamos fazendo

- Trabalho na branch `claude/agenda-modernizacao-ds4-xuijw0`; commit `01eee35`, push e **PR #10** para a `main`, conforme autorizado pelo dono no pedido da DS-4.1 (o resultado do CI fica no próprio PR). **Merge: não feito (é do dono). Publicação: nenhuma.**
- **A DS-4.1 não está concluída**: falta o dono ver a Agenda no iPhone e mesclar o PR.
- Limitações: capturas no Chromium da nuvem com dados fictícios e fundo de reserva (a foto vem da internet); não testado no iPhone nem com os dados reais do dono; a comparação da Casa usou poucos dados fictícios (várias telas apareceram no estado vazio).

### 3. O que vamos fazer

1. Dono: abrir a Agenda no iPhone (claro e escuro), dizer o que ajustar e, se aprovar, mesclar o PR (a publicação é o GitHub Pages).
2. Depois: **Saúde** (próxima área da DS-4; não iniciada), um módulo por vez; migrar o Início só com a decisão D-12; baixar a catraca de cores quando o CSS antigo sair de uso.

## 13/11/2026 · DS-4.2A — Auditoria da Saúde e do potencial de Inteligência Garmin

### 1. O que fizemos

- **Conferência de partida**: a DS-4.1 (Agenda) está na `main` (PR #10, `81c9999`); a árvore da branch da sessão é idêntica à do `origin/main` (`git diff` vazio), então nada foi refeito.
- **Auditoria somente leitura** da tela Saúde (`js/saude.js`), das regras no núcleo, da função `garmin` (`supabase/functions/garmin/index.ts`), da migration `007`, do cron da rotina, dos leitores do banco do relógio (Saúde, RAC Hoje, Painel, Resumo, Sistema, Carreira e o servidor), dos testes e dos documentos de planejamento.
- **Relatório técnico** [`09-auditoria-saude-garmin.md`](09-auditoria-saude-garmin.md): arquitetura atual, inventário real das métricas gravadas (e do que **não** é coletado), origem e limites dos dados, classificação do potencial de inteligência (A a E), 12 análises determinísticas (S1–S12), oportunidades e limites de IA, requisitos de privacidade, proposta de navegação (hub com 8 abas), lacunas e riscos (L1–L16), roadmap S0–S8 e critérios de aceitação. Cada conclusão marcada como fato confirmado, hipótese ou oportunidade futura.
- **Principais achados (fatos)**: 6 leitores diferentes do banco do relógio, nenhum pelo contrato de fontes; `idadeFitness` só existe no dia mais recente (sem histórico); VO₂ máx é gravado por treino e **nunca exibido**; musculação guarda só totais de séries e repetições (exercício, carga e rota só sob demanda, não guardados); sem série intradiária (FC, estresse, Body Battery); a limpeza de dados anteriores a 01/11/2025 roda dentro de uma leitura; `js/saude.js` não tem teste de tela e a tradução Garmin → banco não tem teste.
- **Documentos atualizados**: `docs/planejamento/06-roadmap.md` (seção 3.5), `docs/planejamento/08-frentes-funcionais.md` (nota em "Garmin avançado"), `docs/mapa.md` (linha da Saúde e andamento da DS-4.2). Histórico: só este registro foi acrescentado.
- **Validação (leitura apenas)**: `node --test tests/planejamento.test.mjs` e `git diff --check`; resultado no relatório final da sessão. **Nenhum arquivo funcional (JS, CSS, HTML, `sw.js`, SQL, funções, workflows, `.claude/settings.json`) foi alterado.**
- **Não feito (por regra desta etapa)**: nenhuma consulta ao banco de produção ou à Garmin, nenhuma sincronização, nenhum SQL, nenhuma chamada de IA, nenhuma chamada externa nova, nenhum commit, push, PR ou merge.

### 2. O que estamos fazendo

- Aguardando a revisão do dono sobre o Documento 09. **A DS-4.2B (implementação) não começou.** Alterações desta etapa estão só na árvore local (não commitadas).
- Limitação principal: sem acesso a dados reais, a presença de cada campo nas linhas do banco é **hipótese**; a conferência de leitura da seção 3.4 do Documento 09 fecha essa lacuna.

### 3. O que vamos fazer

1. Dono: ler o Documento 09, decidir D-S1 a D-S12 (seção 13) e, se quiser, rodar a conferência de cobertura (SQL só de leitura).
2. Com o escopo aprovado e a autorização de commit/push dada no chat: S1 (fundação: regras no núcleo, fonte "saude", testes de tela), depois S2 (Visão geral, Recuperação e Sono no Design System), um lote por vez.
3. Mudanças na função `garmin`, SQL, mapas/trajetos e IA da Saúde só com autorização expressa e na ordem SQL → função → site.

## 13/11/2026 · DS-4.2A (complemento) — Marco temporal de propriedade do Garmin

### 1. O que fizemos

- **Investigação somente leitura** para substituir o corte provisório por um marco de propriedade (primeiro login/configuração do relógio comprado usado). Resultado registrado na seção 15 do [Documento 09](09-auditoria-saude-garmin.md); as seções anteriores ficaram intactas.
- **Conclusão: não há evidência confiável da data do primeiro login no repositório.** A única data é a constante `GARMIN_DESDE = 2025-11-01` (dia 1º de um mês, sem registro de origem). O clone Git é raso e só tem commits de 09/11/2026 em diante, então não dá para datar a constante. A função `garmin` e a migration não gravam nenhuma data de configuração do relógio. **A data não foi inventada; foi pedida ao dono.**
- **Achado:** não existe filtro geográfico no código; o filtro é por data. Pior: o corte atual **apaga** dados anteriores (a função apaga treinos antigos a cada rotina diária e o site apaga dias e treinos antigos ao abrir a Saúde; a função também nem grava treinos anteriores ao corte). Isso contradiz a regra "preservar tudo"; para cumpri-la, a exclusão precisa sair do site e da função (função: autorização expressa).
- **Diferenciados** os quatro eventos (primeiro login, primeira sincronização, primeira atividade, primeiro registro recebido pelo RAC); só o primeiro login serve de marco. Definida a classificação por data do registro (dias e treinos independentes), o tratamento do dia do marco ("revisar", padrão conservador), do dado tardio com data antiga e das exceções para revisão manual; proposta de estrutura auditável (registro em `pessoal`, função pura no núcleo, grupos `meus`/`legado`/`revisar`, revisões só de acréscimo).
- **Validação (leitura apenas):** testes de planejamento e `git diff --check`; nenhum arquivo funcional, banco, função, sincronização ou interface alterado. Nada commitado.

### 2. O que estamos fazendo

- Aguardando as respostas M1 a M8 do dono (seção 15.9). **Nada de implementação.** A regra provisória em vigor continua a do código (corte em 01/11/2025), sem alteração.
- Dependências: data do marco (M1) e a conta Garmin (M2) decidem a regra; qualquer mudança na função `garmin` depende de autorização expressa.

### 3. O que vamos fazer

1. Dono: responder M1 a M4 (no mínimo) e decidir M5 e M6; opcionalmente, rodar as consultas da 15.8.
2. Com o marco confirmado: etapa 1 (só site e núcleo): classificar na leitura e parar de apagar no site; teste de que nada é excluído.
3. Depois, com autorização expressa: retirar a exclusão e o filtro da função `garmin`, publicar a função antes do site e sincronizar de novo para recuperar o legado descartado.

## 13/11/2026 · DS-4.2A (decisão definitiva) — Marco de propriedade do Garmin em 01/01/2026

### 1. O que fizemos

- **Registradas as decisões do dono** (seção 16 do [Documento 09](09-auditoria-saude-garmin.md)): marco de propriedade **01/01/2026, inclusive**; M1 primeiro login em 01/01/2026; M2 conta Garmin Connect pessoal, criada pelo dono; M3 relógio restaurado de fábrica antes do primeiro login; M4 nenhum critério geográfico, regra só temporal. Anterior ao marco = `legado`; a partir dele = `meus`; vale a **data do evento**, não a do recebimento; o dia 01/01/2026 é do dono e **não** vai para revisão; originais preservados e classificação sem apagar nem modificar nada. As atividades antigas que continuam no Garmin Connect não entram na decisão. Substitui, onde diferente, as recomendações provisórias da seção 15 (dia do marco em "revisar" e corte em 01/11/2025).
- **Mapeados os nove pontos de `GARMIN_DESDE` em quatro arquivos** (`js/saude.js` 3, `js/painel.js` 2, `js/resumo.js` 1, função `garmin` 3) com a mudança de cada um, e os leitores que **não** usam a constante e hoje recebem tudo (RAC Hoje, Sistema, Carreira); backup e Monitor ficam sem filtro de propósito.
- **Prioridade 1 planejada**: remover os dois descartes (exclusão ao abrir a Saúde e exclusão/filtro de gravação na função), sempre com a classificação entrando junto ou antes; a etapa do site não depende da função.
- **Plano de recuperação** (R0 a R4): inventário por leitura, backups, medição na Garmin sem gravar, preenchimento por janelas autorizadas e relatório do que não voltou, sem presumir sucesso. Todo o descartado é anterior a 01/11/2025 e portanto legado também pelo marco novo: não há perda de dado do dono.
- **Sequência de implementação e testes** (fases M0 a M5), com os testes de borda do marco, o teste de guarda "nunca excluir" e as autorizações exigidas.
- **Validação (leitura apenas)**: testes de planejamento e `git diff --check`. Nenhum arquivo funcional, banco, função, sincronização, interface ou dado foi alterado. Sem commit, push ou PR.

### 2. O que estamos fazendo

- Aguardando a **autorização específica para implementar** (e até qual fase: M1 e M2 apenas, ou também M3 e M4). **Nada foi implementado.** O código continua com o corte de 01/11/2025 e com os dois descartes ativos até a implementação.
- Efeito a avisar quando implementar: novembro e dezembro de 2025 passam a legado (saem das tendências, do Painel e do Resumo; continuam no banco e no backup).

### 3. O que vamos fazer

1. Dono: autorizar a implementação (M1 e M2, primeiro) e, se quiser, rodar o R0 (contagens por mês e lista de backups).
2. M1 (núcleo) e M2 (site: leitura classificada, fim da exclusão, nove pontos e leitores), com testes de borda, teste de guarda e comparação da Casa.
3. M3 (função sem exclusão nem filtro) e M4 (recuperação) só com autorização expressa e na ordem: função publicada pelo dono antes do site, quando o site depender dela.

## 13/11/2026 · DS-4.2 (execução) — Marco de propriedade do Garmin: implementação, testes e o que ficou pendente

### 1. O que fizemos

- **Autorização geral do dono** para executar M1 a M5. Branch da sessão atualizada com a `main` por **merge** (sem reescrever histórico nem force push); as alterações locais de documentação foram preservadas e incorporadas.
- **M1** (`nucleo.js`): `NUCLEO.SAU_MARCO` (01/01/2026, inclusivo, origem registrada) e `NUCLEO.sauClassificar` (função pura; `meus`/`legado`; a data do evento decide; devolve as mesmas linhas sem alterá-las).
- **M2** (site): removidos os nove usos de `GARMIN_DESDE` e **a exclusão que a Saúde fazia ao abrir**; Saúde, RAC Hoje, Sistema (prontidão e busca) e Carreira passam pela classificação; Painel e Resumo usam o marco. Backup e Monitor sem filtro, de propósito. Versão do site na branch: `2026-11-13.6` (`VERSAO`, `MOD_VERSAO` e `?v=` do CSS juntas).
- **M3** (código da função `garmin`): sem corte por data e sem `delete` das tabelas do relógio; modos opcionais `somenteNovos` (nunca sobrescreve) e `apenasContar` (não grava); janelas `desde`/`ate`.
- **M4** (ferramenta): painel "Histórico anterior à posse" na Saúde (só o dono): conta o legado guardado, mede e recupera por janelas, com relatório por mês; **trava** que só deixa rodar se a função publicada responder no formato novo (a antiga gravaria por cima).
- **M5**: `tests/saude_marco.test.mjs` (16 testes: bordas do marco, guarda permanente contra exclusões, a função real contra banco de mentira, trava de versão); documentos atualizados (Documento 09 seções 16 e 17, mapa, roadmap, `docs/painel.md`, Documento 05).
- **Verificação em Chromium real** (390 e 1280 px, claro e escuro, dados inventados): só dados de 01/01/2026 em diante nas análises, 01/01 incluído; nenhuma gravação nem exclusão ao abrir; medição sem gravar; recuperação só com `somenteNovos`; sem erro de console nem rolagem horizontal. Bug achado e corrigido: o relatório sumia ao redesenhar.
- **Sem migration, sem SQL, sem mudança de cron, workflow, secret, `rac-ia` ou outras integrações.**
- **Git**: commit `7972a64` na branch `claude/agenda-modernizacao-ds4-xuijw0`, push e **PR #11** para a `main` (merge só depois do CI verde; o resultado fica no próprio PR).

### 2. O que estamos fazendo

- **Bloqueios reais deste ambiente** (não contornados): sem credencial do Supabase e com CLI/`psql`/API de gerenciamento negados pelo `.claude/settings.json`, **a função `garmin` não foi publicada**; a rede não alcança a Garmin, então **a medição e a recuperação não foram executadas** e **não há contagens reais** de registros preservados e recuperados; o site publicado não é acessível daqui, então a versão em produção **não foi aberta e conferida**.
- Até o dono publicar a função, a versão antiga continua apagando treinos anteriores a 01/11/2025 a cada rotina (legado, sem efeito nas análises).

### 3. O que vamos fazer

1. Dono: publicar a função (Edge Functions → garmin → Code → Deploy), exportar um backup, abrir Saúde → "Histórico anterior à posse", **medir**, **recuperar** e **medir de novo** (seção 17.4 do Documento 09); então registrar aqui as contagens reais.
2. Depois, se o dono quiser: redesenho da Saúde no Design System e os sinais (S2 a S5 da seção 11), que **não** fazem parte desta entrega.


## 13/11/2026 · Encerramento da DS-4.2 em produção

### 1. O que fizemos

- **Encerramento funcional da DS-4.2**, a pedido do dono. O backfill do histórico anterior a 01/11/2025 foi considerado opcional e não bloqueia mais a conclusão nem a continuidade do desenvolvimento do site.
- **CI e publicação do site conferidos:** CI da `main` (execução `43438657518`) e GitHub Pages (execução `43438657212`) concluídos com sucesso; versão `2026-11-13.6`.
- **Edge Function `garmin` publicada em produção:** versão 13, ativa. Deploy incluiu `index.ts` e `alertas_preco.ts`; manteve `verify_jwt: false`. O código publicado não possui mais o corte `GARMIN_DESDE` nem exclusões em `garmin_dia`/`garmin_ativ`.
- **Conferência somente leitura do banco de produção:** `garmin_dia` = 314 (19 legados, 295 do dono); `garmin_ativ` = 952 (0 legados, 952 do dono). Os 19 dias legados são 5 de novembro/2025 e 14 de dezembro/2025. Atividades existentes vão de 24/01/2026 a 13/11/2026.
- **Backup disponível:** cofre privado contém backup de 08/11/2026, com `verificado: true` no log da rotina. Nenhuma recuperação ou nova exportação manual foi realizada nesta sessão.
- **Limite conhecido:** o log da rotina registra HTTP 504 da Garmin ao pedir token em 12 e 13/11. O dono preferiu não executar a medição ou recuperação agora. Não foram inventadas contagens do período anterior a 01/11/2025.
- Nenhuma migration ou alteração SQL foi necessária. PR #11 permanece como entrega de código mergeada (`b893d34`); CI e Pages confirmados acima.

### 2. O que estamos fazendo

- **DS-4.2 está encerrada** no escopo aprovado: propriedade temporal, classificação em todos os leitores, fim dos descartes, função publicada e painel de backfill disponível.
- A recuperação do legado anterior a 01/11/2025 permanece **opcional, adiada e fora do caminho crítico**. O dono poderá solicitá-la caso sinta falta de algum registro; não pedir que use o relógio por um dia ou faça uma atividade para concluir este tópico.
- O redesenho visual da Saúde no Design System (S2–S5) ainda não foi iniciado.

### 3. O que vamos fazer

1. Seguir com o desenvolvimento do RAC sem aguardar backfill Garmin.
2. Próxima evolução possível da DS-4: redesenho da Saúde no RAC Modern Workspace (S2–S5), com escopo e critérios próprios; depois, seguir para os demais módulos por área conforme prioridade do dono.
3. Só reabrir a recuperação histórica se o dono solicitar.


## 13/11/2026 · DS-4.3 · modernização da Saúde (S1–S5)

### 1. O que fizemos

- **Implementado e testado** na branch `claude/saude-modernizacao-s2-s5` (a partir da branch da PR #12, sem alterá-la): fonte única `js/fonte-saude.js`; regras `sau*` no núcleo; hub `js/saude-hub.js` com Visão geral, Recuperação, Sono, Atividades, Condicionamento, Tendências e Inteligência; sinais S1–S4 e S12 com histerese; S5, S6, S8, S9, S10 e S11; preferências (metas, ocultar valores, esconder local) em `PESSOAL.saudePrefs`.
- Leitores consolidados (RAC Hoje, Sistema, Carreira; Painel e Resumo por `saudeLer`) com regressão contra os leitores de antes. Tela da Fernanda comparada com a `main` em 390 e 1280 px, claro e escuro: idêntica.
- Testes novos: `tests/saude_regras.test.mjs`, `tests/fonte_saude.test.mjs`, `tests/saude_tela.test.mjs`; testes existentes ajustados só onde codificavam a estrutura antiga (rotas, deps do RAC Hoje, leitores). Chromium 390/768/1280, claro e escuro: sem rolagem horizontal, alvos de 44 px, sem erro de console.
- Versão do site `2026-11-13.7` (`sw.js`, `MOD_VERSAO`, CSS). Nada de SQL, Edge Function, secrets, cron ou produção.
- Commit, envio e PR: ver o item 2 (registrados só depois de feitos).

### 2. O que estamos fazendo

- Aguardando revisão do dono. **Não mesclado, não publicado.** A PR #12 segue aberta e sem alteração.

### 3. O que vamos fazer

1. Dono revisa a PR, mescla se aprovar; o GitHub Pages publica o site (nenhum SQL nem função a publicar).
2. Fora do escopo, para decisão futura: mapas e trajetos (S7), IA de Saúde (S8), coleta extra da Garmin (S6).


## 13/11/2026 · RAC Inbox — prioridade aprovada após Saúde

### 1. O que fizemos

- O dono aprovou que, depois da conclusão da modernização da Saúde S1–S5, a próxima grande frente será o **RAC Inbox**, com prioridade máxima do desenvolvimento seguinte.
- Objetivo confirmado: transformar o RAC no cliente principal de e-mail, com capacidade de substituir o Spark no uso diário — não apenas agregar mensagens ou abrir links de outras caixas.
- Escopo planejado: Gmail, Outlook/Hotmail/Live e iCloud; caixa unificada; leitura, envio, resposta, encaminhamento, rascunhos, anexos, busca, organização de pastas, arquivamento, spam, lixeira, filtros e regras; IA e integração com os módulos RAC.
- A aceitação de limitações pontuais do iCloud foi aprovada, desde que sejam pequenas, comprovadas e alinhadas. Receber, enviar e responder são essenciais para a substituição.
- Criado o [Documento 10 · RAC Inbox](10-rac-inbox.md), que especifica visão de produto, conectores, arquitetura, segurança, fases I0–I6 e critérios para desinstalar o Spark.
- Risco técnico registrado: a viabilidade de SMTP iCloud na infraestrutura Supabase precisa ser testada; não presumir que a porta documentada pela Apple esteja acessível pelo runtime escolhido.

### 2. O que estamos fazendo

- A Saúde S1–S5 já foi implementada e está em revisão na **PR #13**, branch `claude/saude-modernizacao-s2-s5`, head `97ac1a2434573e3f4cb500bd7aa8ab267c6ecf52`. No momento deste registro, o CI do commit estava em andamento; merge e publicação ainda não ocorreram.
- O RAC Inbox está **planejado, não implementado**. Nenhuma conta foi conectada, nenhum segredo foi criado, nenhuma migration foi aplicada e nenhum serviço foi publicado.
- Esta documentação está em uma branch/PR separada, empilhada sobre a branch da Saúde para não misturar o escopo do Inbox com a revisão da PR #13.
- A PR #13 inclui os quatro commits documentais da antiga PR #12. A PR #12 permanece aberta por enquanto; depois que a PR #13 for aprovada e mesclada, conferir e encerrar a PR #12 como incorporada/supersedida, sem criar um segundo merge dos mesmos documentos.

### 3. O que vamos fazer

1. Revisar o CI e a PR #13; concluir Saúde S1–S5 por merge e publicação.
2. Depois, integrar este planejamento à `main` e iniciar RAC Inbox pela fase I0: prova de viabilidade de OAuth/Gmail API, Microsoft Graph, IMAP iCloud e SMTP iCloud na infraestrutura pretendida.
3. Fechar a arquitetura com base nos testes reais; depois desenvolver fundação multicon­ta, cliente de e-mail, administração/filtros, inteligência e ecossistema RAC.
4. Manter o Spark como contingência até todos os critérios da seção 8 do Documento 10 estarem validados em uso real.

## 13/11/2026 · Atualização — merge da Saúde e preparação do RAC Inbox

### 1. O que fizemos

- **DS-4.3 Saúde S1–S5 mesclada na `main` pela PR #13**, usando squash. Commit resultante: `e77c5e8e1e163f60ae1f93e8cfe35f6587860cfd`.
- CI da PR #13 conferido no head `97ac1a2434573e3f4cb500bd7aa8ab267c6ecf52`: workflow `Testes` concluído com sucesso; 1 job aprovado. A suíte, validação Chromium e comparação da Casa estão detalhadas na PR.
- A PR #13 incorporou os quatro commits documentais que estavam na PR #12. A PR #12 permanece aberta, mas seu conteúdo já está na `main`; ela será encerrada como supersedida, sem segundo merge.
- A documentação do RAC Inbox foi reconstruída em uma branch nova diretamente a partir da `main` pós-merge, para evitar que a PR documental carregue novamente o histórico inteiro da Saúde.

### 2. O que estamos fazendo

- Saúde S1–S5: implementada, testada e integrada à `main`. A confirmação da execução do GitHub Pages após o merge ainda está em verificação.
- RAC Inbox: planejamento apenas. O Documento 10 descreve as fases I0–I6; nenhuma implementação, conta conectada, credencial, migration ou serviço publicado.
- A PR documental do RAC Inbox deve conter somente o planejamento e suas referências, sem reapresentar código ou commits da Saúde.

### 3. O que vamos fazer

1. Validar CI e publicação do GitHub Pages após o merge da PR #13.
2. Encerrar a PR #12 como supersedida, pois os quatro commits documentais foram incorporados pela PR #13.
3. Revisar e integrar a PR documental do RAC Inbox; então iniciar a fase I0, com provas de viabilidade por provedor antes de definir a arquitetura.

## 13/11/2026 · Confirmação da publicação e encerramento das PRs anteriores

### 1. O que fizemos

- GitHub Actions da `main` após o merge da PR #13: workflow **Testes** concluído com sucesso (execução `43451157429`).
- GitHub Pages após o merge da PR #13: **build and deployment concluído com sucesso** (execução `43451156616`). A versão publicada no `sw.js` da `main` é `2026-11-13.7`.
- A PR #12 foi encerrada sem merge separado; seus quatro commits documentais já estão incorporados à `main` pelo merge da PR #13.
- A PR #14 empilhada foi encerrada como substituída por uma branch documental limpa, criada diretamente a partir da `main` pós-merge.

### 2. O que estamos fazendo

- A PR #16 está aberta sobre a `main`, com alterações restritas a cinco arquivos de documentação.
- O primeiro CI da PR #16 falhou em dois testes de consistência documental: referência a arquivo futuro ainda inexistente e cabeçalhos não padronizados no histórico. As correções foram aplicadas na própria branch; a nova execução do CI deverá confirmar o resultado.

### 3. O que vamos fazer

1. Conferir a nova execução completa do CI da PR #16.
2. Com o CI aprovado, revisar e integrar o planejamento do RAC Inbox à `main`.
3. Iniciar a fase I0 somente depois de o planejamento estar integrado: provas técnicas dos conectores e infraestrutura antes de fechar a arquitetura.

## 13/11/2026 · RAC Inbox — primeira auditoria da Fase I0

### 1. O que fizemos

- CI da versão anterior da PR #16, commit `de49360`, concluiu com sucesso nos dois grupos de testes (execução `43455078492`). A PR #16 segue aberta; nenhuma alteração foi integrada à `main` nesta etapa.
- Auditoria somente leitura do código atual: cartão de e-mail em `js/app.js` usa Google Identity Services e `gmail.readonly` no navegador, com token curto em `localStorage`; a importação Gmail da Central de Compras em `js/compras.js` usa o mesmo escopo, mantém o token em memória, confere a conta e exige confirmação antes de gravar pedidos.
- Revisão das documentações oficiais Gmail API, Google OAuth, Microsoft Graph, Apple iCloud Mail e Supabase Edge Functions. A matriz e as limitações estão no Documento 10, seção 12.
- Achado de produto importante: o registro atual em `docs/compras.md` informa o OAuth Google como Externo/em teste. Se o Console ainda estiver assim, o projeto fica limitado a 100 test users e refresh tokens Gmail expiram em sete dias; confirmar o estado real antes da arquitetura.
- Achado de infraestrutura: Apple documenta SMTP iCloud na porta 587; Supabase Edge Functions bloqueia saída nessa porta. O envio iCloud precisa de runtime separado ou outra solução validada. IMAP 993 ainda precisa de teste real.
- Atualizados Documento 10, Documento 05, roadmap e este histórico para registrar os achados e o que continua pendente.

### 2. O que estamos fazendo

- I0 avançou na auditoria documental e no inventário do código; **nenhuma prova de conceito autenticada foi executada**. Não conectamos contas reais, não obtivemos tokens, não criamos senhas específicas de app, não alteramos Secrets, banco, Edge Functions, GitHub Actions ou produção.
- As capacidades documentadas do Gmail, Graph e iCloud estão mapeadas, mas ainda precisam ser confirmadas com testes por provedor no ambiente escolhido.
- O RAC Inbox permanece sem implementação. Nenhuma mensagem ou anexo está sendo copiado para o Supabase ou enviado à IA.

### 3. O que vamos fazer

1. Confirmar no Console Google se o consentimento OAuth segue Externo/em teste e determinar escopos/revisão necessários para o uso pretendido.
2. Definir um ambiente de teste controlado para OAuth Gmail e Microsoft Graph, com contas de teste e permissões delegadas mínimas.
3. Selecionar um runtime com saída TCP e provar IMAP 993 + SMTP 587 do iCloud, sem inserir senhas no navegador ou no chat.
4. Comparar custos e operação do worker iCloud; só então fechar arquitetura e propor I1. Não aplicar migrations nem conectar contas pessoais de produção nesta fase.

## 13/11/2026 · RAC Inbox — armazenamento de credenciais e candidatos de infraestrutura

### 1. O que fizemos

- Consulta somente leitura à implantação Supabase RAC: quatro Edge Functions ativas (`garmin` v13, `rac-ia` v11, `rac-newsletter` v3 e `radar` v6); nenhuma função de Inbox/e-mail.
- Consulta somente leitura às extensões confirmou `supabase_vault` 0.3.1 instalado. O Vault cifra segredos em disco e expõe uma view descriptografada; é candidato para refresh tokens e senha específica iCloud, após revisar as permissões da view.
- Revisada a estrutura de `rac_segredos`: tabela privada do servidor, sem privilégios para o navegador, atualmente usada para chaves VAPID. Não foi lido nenhum valor e não se decidiu reutilizá-la para e-mail.
- Comparadas opções para o conector iCloud: Cloudflare Workers Paid (mínimo US$ 5/mês; TCP de saída e STARTTLS, porta 25 bloqueada; Cron de minuto em minuto, com limites de execução) e Railway Pro (US$ 20/mês de assinatura-base, SMTP de saída habilitado). Cloudflare é a primeira candidata de POC por custo; Railway fica como alternativa para worker convencional.

### 2. O que estamos fazendo

- A auditoria documental e de metadados de infraestrutura está concluída. Nenhum plano externo foi contratado, nenhum Worker foi criado, nenhuma migration/secret/Edge Function foi alterada e nenhuma conta de e-mail foi conectada.
- O modelo de armazenamento seguro ainda exige validar as permissões de `vault.decrypted_secrets`, o acesso estritamente pelo servidor e o isolamento por usuário/conta.
- A PR #16 continua aberta e sem merge; esta atualização amplia apenas a documentação da I0.

### 3. O que vamos fazer

1. Validar permissões do Vault sem selecionar nem expor valores secretos; definir a convenção de identificação e rotação por provedor/conta.
2. Fazer POC de conectividade Cloudflare Workers para Apple IMAP 993 e SMTP 587/STARTTLS, primeiro sem credenciais. Comparar *polling* de um minuto com requisitos de sincronização e notificações.
3. Só depois de uma POC aprovada pelo dono, decidir a contratação do plano mínimo e testar autenticação com conta de teste, nunca com senha no chat.
4. Manter Gmail e Microsoft Graph como conectores HTTPS no backend; provar OAuth/PKCE, escopos e renovação em contas controladas antes de I1.

## 13/11/2026 · RAC Inbox — revisão dos privilégios do Vault

### 1. O que fizemos

- Conferência somente de metadados das permissões do Supabase Vault: `vault.decrypted_secrets` tem SELECT para `postgres` e `service_role`; a tabela `vault.secrets` tem SELECT/DELETE para os mesmos papéis; `vault.create_secret()` e `vault.update_secret()` têm EXECUTE para os mesmos papéis. Não há grants observados para `anon`/ `authenticated`.
- Nenhum segredo, valor descriptografado ou conteúdo de e-mail foi consultado. Nenhuma permissão foi alterada.
- Registrada a proposta de arquitetura em que a Edge Function Supabase controla autenticação e acesso ao Vault e o Worker Cloudflare atua como ponte TCP autenticada, sem receber `service_role` e sem persistir credenciais.

### 2. O que estamos fazendo

- Essa fronteira é requisito da POC, não implementação. A assinatura/HMAC deverá ter validade curta, autorização por conta/provedor, proteção contra replay e logs sem credenciais nem corpos de e-mail.
- O CI da PR #16 ainda está executando para o commit documental anterior; a nova atualização da I0 vai gerar uma nova execução.

### 3. O que vamos fazer

1. Validar o contrato HTTPS assinado entre Edge Function e Worker, sem credenciais reais e sem chave `service_role` no Worker.
2. Fazer a prova de conectividade TCP no runtime Cloudflare; depois, testar autenticação somente com uma conta iCloud de teste e autorização específica.
3. Revisar permissões, retenção, escopo de logs e comportamento de revogação antes de qualquer conta pessoal.

## 13/11/2026 · RAC Inbox — refinamento de escopos e runtime após validação oficial

### 1. O que fizemos

- Refinada a matriz OAuth do Gmail: `gmail.send` é sensível; `gmail.modify` e `gmail.settings.basic` são restritos. A avaliação independente de segurança é exigida quando dados de escopos restritos são armazenados ou transmitidos em servidores, ressalvadas as exceções oficiais.
- Refinada a matriz Microsoft Graph: listar regras da Inbox pede `MailboxSettings.Read`; criar/alterar regras pede `MailboxSettings.ReadWrite`; `Mail.Send` é separado de `Mail.ReadWrite`. A documentação lista permissões delegadas também para contas pessoais Microsoft.
- Corrigida a descrição dos limites de Cloudflare Workers Paid: até 15 minutos de tempo total em Cron, até 5 minutos de CPU no plano pago e seis conexões TCP de saída simultâneas por requisição. STARTTLS suportado; apenas a porta 25 aparece como bloqueada na documentação de TCP sockets.
- Atualizadas referências e comparação de custo: Cloudflare Workers Paid tem mínimo de US$ 5/mês com franquias e cobrança de excedentes; Railway Pro tem US$ 20/mês com crédito equivalente e habilita SMTP. A conectividade real para o SMTP Apple na porta 587 permanece pendente.

### 2. O que estamos fazendo

- A arquitetura do worker iCloud permanece provisória. Cloudflare é o primeiro candidato por custo e capacidade TCP documentada, não uma escolha final. Railway continua como alternativa se o modelo Cloudflare não suportar a sincronização necessária.
- O CI da revisão anterior da PR #16 foi cancelado durante o grupo de testes PGlite; o primeiro grupo havia passado. Esta revisão atualizada deverá rodar a suíte completa novamente.

### 3. O que vamos fazer

1. Concluir o CI completo da revisão atual da PR #16 e integrar o pacote documental depois do gate verde.
2. Preparar prova de conectividade Cloudflare TCP para Apple IMAP 993 e SMTP 587/STARTTLS, primeiro sem autenticação.
3. Só testar autenticação depois de criar ambiente/contas de teste e obter autorização específica. Não usar senha ou token no chat e não conectar caixas pessoais de produção.

## 13/11/2026 · RAC Inbox — precisão do limite CPU no Cron do Cloudflare

### 1. O que fizemos

- Corrigida a interpretação da tabela oficial de limites do Cloudflare: o teto de 5 minutos de CPU no Workers Paid é para requisições HTTP. Para Cron com frequência menor que uma hora (caso do polling a cada minuto), o teto é **30 segundos de CPU por execução**; o tempo total de parede permanece até 15 minutos. No Free, Cron tem 10 ms de CPU.
- Ajustadas as seções 12.7 e 12.10 do Documento 10 e o resumo no Documento 05 para não confundir os dois tipos de invocação.

### 2. O que estamos fazendo

- A estratégia de polling por minuto continua tecnicamente candidata; 30 segundos de CPU no Paid devem ser medidos na POC com IMAP/SMTP real. Nenhum cron ou Worker foi criado, e nenhum plano foi contratado.

### 3. O que vamos fazer

1. Quando houver acesso ao Cloudflare, começar por uma chamada HTTP de teste sem credenciais; medir tempo de CPU e verificar handshake TCP/STARTTLS com as portas Apple.
2. Depois testar Cron de um minuto no plano adequado e observar CPU real, reconexões e confiabilidade do polling.
3. Não contratar Workers Paid até que o teste inicial comprove que a plataforma funciona para o protocolo iCloud.

## 13/11/2026 · RAC Inbox — workflow manual de deploy da POC iCloud (PR independente)

### 1. O que fizemos

- Decisão do dono: publicar a POC iCloud pelo GitHub Actions, sem token Cloudflare na sessão de nuvem (que não alcança `api.cloudflare.com`). Detalhes em `docs/icloud-poc-deploy.md`.
- Criados `.github/workflows/icloud-probe-deploy.yml` (só `workflow_dispatch`, `contents: read`, ambiente `cloudflare-poc`, Wrangler `4.161.0`, `PROBE_TOKEN` aleatório por execução e descartado, trava de branch) e `tests/icloud_probe_deploy.test.mjs` (escopo e segredos; ignora o que depende da POC enquanto ela não está na branch).
- Validação local: YAML e `bash -n` de cada passo; simulação do passo do `/probe` com servidor falso (sucesso, falha de SMTP, erro de limite de CPU). Isso **não** é prova de rede real.
- Atualizados roadmap, decisões/pendências e mapa. Nenhum código funcional da POC foi alterado.

### 2. O que estamos fazendo

- Esta PR aguarda o merge do dono. Nada foi publicado: sem login ou deploy na Cloudflare, sem token/secret, sem conta Apple. A conectividade com a Apple **continua não comprovada**.
- Bloqueio real, que depende do dono: token Cloudflare só com `Account → Workers Scripts → Edit`, Environment `cloudflare-poc` (aprovador e branches restritas) e os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.

### 3. O que vamos fazer

1. Dono mescla esta PR e configura o ambiente e os secrets.
2. Acionar o workflow a partir de `poc/icloud-cloudflare-connectivity`, ler o `/probe` e registrar a evidência real (IMAP 993, SMTP 587/STARTTLS, tempos, erros).
3. Remoção do Worker: atividade futura, com autorização específica.

## 13/11/2026 · Atualização da PR #18 (protocolo permanente de autonomia)

### 1. O que fizemos

- Investigada a condição `mergeable: false` da PR #18: a PR só altera `CLAUDE.md` e `docs/planejamento/07-decisoes-e-pendencias.md`; a `main` avançou apenas com commits dos robôs (`vagas.json`, notícias), sem arquivo em comum. Não havia conflito; o GitHub passou a reportar `mergeable_state: clean`. O falso provavelmente veio do cálculo logo após a criação da PR, com a base defasada.
- Branch da PR atualizada com um merge normal da `main` (sem force push), em `git worktree` separado; o trabalho local da POC iCloud não foi tocado.
- Validação local no worktree: `planejamento`, `estrutura`, `nuvem`, `monitor` e `seguranca` — 92 testes, 92 aprovados, 0 falhas. A suíte completa fica para o CI da PR.

### 2. O que estamos fazendo

- A PR #18 aguarda o CI e o merge do dono (não mesclada por esta sessão). A PR #17 (POC iCloud) não foi alterada.
- O trabalho da POC (workflow, teste e documentação) segue só no working tree da sessão, sem commit.

### 3. O que vamos fazer

1. Dono mescla a PR #18 depois do CI verde.
2. Retomar a POC iCloud já sob o protocolo novo: commit, PR separada do workflow e configuração do Environment `cloudflare-poc` pelo dono.
3. Atenção: PR #17 e PR #18 acrescentam texto ao fim deste histórico; o segundo merge pode pedir resolução trivial de ordem das seções.
