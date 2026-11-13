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
