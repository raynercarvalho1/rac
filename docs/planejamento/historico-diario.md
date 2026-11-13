# Histórico diário do RAC

Registro cronológico de cada dia de trabalho. Regras (pedido do dono em 13/11/2026; resumo no `CLAUDE.md`):

- Cada dia tem **três partes**: **1. O que fizemos** (alterações concluídas, testes, commits, PRs, publicações confirmadas,
  decisões tomadas) · **2. O que estamos fazendo** (trabalho em andamento, estado atual, bloqueios, dependências) ·
  **3. O que vamos fazer** (próximos passos, prioridades, critérios de conclusão).
- **Nunca registrar como concluído o que está só planejado.** Merge, SQL aplicado, função publicada e site publicado são
  estados diferentes (ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto)).
- **Nunca apagar registros.** Correções entram como nova linha datada no dia em que foram feitas.
- Os dias ficam em ordem cronológica, do mais antigo para o mais novo (há teste: `tests/planejamento.test.mjs`).

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
