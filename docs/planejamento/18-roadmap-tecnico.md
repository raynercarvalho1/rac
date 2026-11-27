# RAC · 18 · Roadmap técnico do novo RAC

Documento 7 do conjunto Novo RAC (Lote 0, 27/11/2026). Lotes de implementação, dependências, riscos, critérios de aceite e sequência recomendada.
Ele **estende** o [roadmap geral](06-roadmap.md) (que cobre as fases F0 a F8 do plano de 13/11/2026 e as frentes Saúde e Inbox) e **não** o substitui: aqui só o **Novo RAC**.
Tudo é **[Recomendação]**; nada foi implementado. Regras do `CLAUDE.md` valem para todos os lotes (autonomia ponta a ponta; SQL → função → site; versão em `sw.js` e `js/app.js`; testes; relatório; registro no RAC Knowledge).

## 1. Sequência e ajustes por dependência comprovada

| Fase de referência | Lote | Entrega | Ajuste em relação à referência |
|---|---|---|---|
| 0 Auditoria e arquitetura | **Lote 0** | Documentos 12 a 19 | Concluído neste lote |
| 1 Motor de Workspace | **Lote 1** | **Fundação: espaços e permissões + motor de Workspace** | **Inclui a fundação de espaços**: sem ela o Workspace nasceria preso a "dono e casa" (N-10) |
| 2 Minha Casa configurável | **Lote 2** | Widgets do catálogo, página padrão migrada do Hoje, navegação por 5 ambientes | Navegação por ambientes entra aqui (só faz sentido com páginas) |
| 3 Timeline | **Lote 3** | Timeline + provedores + **Busca global** | Busca entra junto: usa os mesmos provedores |
| 4 Captura universal | **Lote 4** | Caixa de Captura, share target, **Biblioteca básica** | Biblioteca básica entra aqui: é o destino de "referência" e "link" |
| 5 Intelligence | **Lote 5** | Sinais por espaço, preferências, widgets de sinais, ações de IA opcionais | — |
| 6 Mapa | **Lote 6** | Lugares, vínculo e Mapa | Pode ocorrer antes do Lote 5 (independente), a critério do dono |
| 7 Projetos e Descobrir | **Lote 7** | Projetos completos e Descobrir (home + área) | — |
| 8 Consolidação da experiência familiar | **Lote 8** | Espaços legados migrados, páginas e preferências da Fernanda, fim do `PAPEL` fixo | — |

**Trocas permitidas:** 3 ↔ 4 (independentes entre si) e 5 ↔ 6. **Proibido:** adiantar 8 antes de 1; implementar 2 sem 1.
**Fora desta sequência, sem bloqueio mútuo:** migração de Compras e Carreira do `gmApi` para o Inbox e o RAC Financeiro Inteligente (frentes já registradas no [histórico](historico-diario.md)); a ordem entre elas e o Lote 1 é decisão de prioridade do dono.
**Sem micro-lotes:** cada lote é uma unidade funcional completa, entregue em um ou poucos PRs, com **uma** condição de publicação.

### 1.1 Pré-requisitos do Lote 1 (verificações, não implementação)

1. ~~Conferir que o cadastro aberto está desligado~~ → **confirmado pelo dono em 27/11/2026** (cadastro público desativado).
2. ~~Aplicar a migration 050~~ → **aplicada em 27/11/2026** (com o catálogo das 12 tabelas posteriores).
3. Atualizar `NUCLEO.SEG_TABELAS` e o teste de segurança no padrão de tabela pessoal nova.

## 2. Modelo de cada lote

Cada lote traz: **Objetivo · Escopo · Fora de escopo · Arquivos e módulos · Dependências · Banco · Integrações · Segurança · Testes · Critérios de aceite · Riscos · Condição de publicação.**
Nomes de arquivos novos seguem padrões (`js/workspace*.js`, `js/prov-*.js`); arquivos que ainda não existem aparecem por padrão e **não** como caminhos exatos.

---

## Lote 1 · Fundação: espaços, permissões e motor de Workspace (Fase 1)

> **Estado (27/11/2026): implementado, com a migration 050 e a 070 aplicadas em produção.** O que foi entregue, o que ficou diferente da especificação abaixo e o que passa para os próximos lotes está em
> [14 · Workspace, "Estado de implementação"](14-arquitetura-do-workspace.md#estado-de-implementação-lote-1-27112026), [16 · Identidade, "Estado de implementação"](16-arquitetura-de-identidade-e-compartilhamento.md#estado-de-implementação-lote-1-27112026) e [19 · seção 5](19-registro-de-decisoes.md#5-lote-1-27112026-brainstorm-grill-me-e-decisões-de-implementação).
> Publicação do site e validação do dono no iPhone: ver o relatório do lote e o [histórico diário](historico-diario.md). A especificação original fica abaixo para rastreabilidade.

- **Objetivo:** dar ao RAC o modelo de espaços e o motor que permite ao usuário compor páginas, **sem mudar nenhuma tela existente**.
- **Escopo:**
  1. Banco: `espacos`, `espaco_membros`, `espaco_modulos`, `concessoes`, `usuario_prefs`, `workspace_paginas`, `workspace_versoes`, `workspace_pessoal`; funções `rac_meus_espacos`, `rac_papel_no_espaco`, `rac_pode`; **seed idempotente** do espaço pessoal do dono e do espaço compartilhado "Casa" a partir de `membros` (sem tocar nenhuma linha legada).
  2. Motor puro em `nucleo.js` (`ws*`: validação e migração do layout, operações mover/redimensionar/configurar/ocultar/remover/desativar, desfazer, escala de colunas) com contrato de widget e registro (`widgetRegistrar`).
  3. Contêiner de widget, grade, **modo de edição** (arrastar por Pointer Events, alternativas por teclado e menu), catálogo com busca, painel de configuração, histórico de versões, restaurar padrão.
  4. Persistência com concorrência otimista, rascunho no aparelho e fila offline.
  5. **Um widget real de prova** (`nota.fixa` e `atalhos.rotas`) numa página **nova e opcional** ("Experimental"), visível só ao dono.
- **Fora de escopo:** migrar o RAC Hoje, widgets de módulos, navegação por ambientes, Timeline, Captura, mudar qualquer política legada, tela da Fernanda.
- **Arquivos e módulos:** `nucleo.js` (`ws*`), novo js/workspace.js (tela e edição) e js/widgets-base.js (contêiner e widgets de prova), `js/rotas.js` (uma rota nova), `css/rac.css` (grade e edição), `js/app.js` (`MOD_DEPS`, versão), `sw.js` (`SHELL` e versão), nova migration numerada em `supabase/`, `tests/`.
- **Dependências:** pré-requisitos da seção 1.1; contrato de fontes existente (`js/fontes.js`); kit (`js/kit.js`).
- **Banco:** 8 tabelas e 3 funções acima, **aditivas**; RLS, `revoke all ... from anon`, trava `mfa`, catálogo (050), `service_role` só onde houver rotina, backup (`SEG_TABELAS` com pk/fk). Nenhuma alteração em tabela existente.
- **Integrações:** nenhuma nova.
- **Segurança:** regras S-1 a S-6 do [Documento 14](14-arquitetura-do-workspace.md#10-segurança-e-permissões-regras-s) e P-1 a P-6 do [Documento 16](16-arquitetura-de-identidade-e-compartilhamento.md#6-o-que-nunca-pode-vazar-regras-de-privacidade); seed não concede acesso novo à Fernanda além do que já tem.
- **Testes:** `nucleo` (motor puro, incluindo migração de schema e de configuração, operações e desfazer); **PGlite** das políticas para quatro perfis (dono, editor, visualizador, de fora) e do seed idempotente; teste de varredura "o motor nunca emite escrita em tabela de negócio"; teste de tela (estrutura, estados, acessibilidade básica); regressão de `tests/rotas.test.mjs` e da Fernanda (telas idênticas); Chromium (`tests/navegador.test.mjs`, só no GitHub) para arrastar e tamanhos 390, 820 e 1280 px.
- **Critérios de aceite:** criar página, adicionar/configurar/mover/redimensionar/ocultar/remover/desativar/desfazer widgets e reabrir em outro aparelho com o mesmo resultado; layout correto nas três larguras; widget com tipo desconhecido vira "indisponível" sem perder configuração; nenhuma operação altera dado de negócio; Fernanda sem diferença; testes e CI verdes.
- **Riscos:** arrastar em iOS (conflito com rolagem) → pressão longa + alternativa por menu, validar no iPhone; política de `security definer` incorreta → teste PGlite por papel; documento de layout grande → limites no banco; aumento do shell → módulo leve sob demanda.
- **Condição de publicação:** SQL aplicado e conferido por leitura → site publicado e verificado no domínio; validação do dono no iPhone e no desktop antes de seguir ao Lote 2.

## Lote 2 · Minha Casa configurável e navegação por ambientes (Fase 2)

- **Objetivo:** o dono monta a própria Minha Casa com widgets do catálogo; a navegação passa a ser pelos cinco ambientes.
- **Escopo:** extrair os blocos do RAC Hoje (`js/hoje.js`) como tipos de widget **sem mudar regra nem dado**; catálogo inicial do [Documento 14](14-arquitetura-do-workspace.md#42-catálogo-inicial-fase-2-todos-sobre-dados-e-telas-que-já-existem); página padrão gerada por código (migrada do Hoje); modelos prontos; filtros e períodos por widget; páginas e abas (Trabalho, Fim de semana…); campo `ambiente` nas rotas e novo menu/barra (com protótipo e aprovação do dono para a barra do celular); `inicio` absorvido.
- **Fora de escopo:** Timeline, Captura, Projetos, mudanças para a Fernanda, espaços compartilhados com páginas editáveis por outros.
- **Arquivos e módulos:** `js/hoje.js` e `js/widgets-*.js`, `js/rotas.js`, `js/app.js`, `css/rac.css`, `nucleo.js`; sem migration (usa as tabelas do Lote 1).
- **Dependências:** Lote 1; fontes existentes.
- **Banco:** nenhuma alteração.
- **Integrações:** as existentes (via fontes).
- **Segurança:** `compartilhavel:false` para saúde, e-mail e custos; teste de que esses tipos não entram em página de espaço compartilhado.
- **Testes:** testes do Hoje existentes (`tests/hoje.test.mjs` etc.) continuam passando sobre a página padrão; novos testes por widget (estados vazio/erro/parcial); `tests/rotas.test.mjs` estendido (ambiente de cada rota; Fernanda igual); regressão visual manual.
- **Critérios de aceite:** a página padrão equivale ao Hoje de hoje (mesmos dados e regras); o dono reorganiza, esconde, remove, configura e cria páginas sem código; cada rota antiga abre; nada muda para a Fernanda.
- **Riscos:** regressão do Hoje (maior risco) → testes existentes + comparação antes × depois; sobrecarga de fontes ao montar várias páginas → carregar só a página aberta; mudança na barra do celular → protótipo e aprovação.
- **Condição de publicação:** site publicado e verificado; validação do dono (iPhone e desktop); IA automática do Hoje preservada (interruptor desligado por padrão).

## Lote 3 · Timeline e Busca global (Fase 3)

- **Objetivo:** linha do tempo única e busca que respeita espaço e permissão, sobre os registros originais.
- **Escopo:** contrato do evento e dos provedores ([Documento 15](15-arquitetura-de-integracao.md#2-rac-timeline)); provedores de `registros`, `garmin_ativ`, `notas`, `compras_online`, `inbox_mensagens_ref`, `newsletter_edicoes`, lembretes e agenda; página Timeline e widget `timeline.recente`; filtros, agrupamentos e paginação por cursor; Busca global (barra) com provedores de busca; abrir o original.
- **Fora de escopo:** tabela de eventos, índice textual novo (só se a medição exigir), Mapa, eventos de Projetos (Lote 7).
- **Arquivos e módulos:** `js/prov-*.js` (um por domínio), js/timeline.js, `nucleo.js` (`tl*`), `js/sistema.js` (busca), `js/rotas.js`; **banco:** nenhuma tabela; possíveis **índices** por data onde `get_advisors` indicar (migration aditiva).
- **Dependências:** Lote 1 (espaços); `NUCLEO.agendaItens`.
- **Banco:** só índices aditivos, se necessários.
- **Segurança:** cada provedor lê com a sessão do usuário; resumo sem dado sensível em espaço compartilhado; teste com dois usuários.
- **Testes:** `nucleo` (ordenação, deduplicação, cursor, fuso e virada de dia); provedores com banco de teste; tela; desempenho (janela de 7 dias e rolagem com 10 mil eventos simulados); busca (acentos, tipos, sem acesso).
- **Critérios de aceite:** eventos de ≥ 8 módulos na mesma linha, ordenados; abrir o original; um provedor falho não impede os outros (parcial); remover um registro o tira da lista sem erro; busca não revela o que o usuário não pode ver.
- **Riscos:** lentidão da composição no cliente → provedor com limite/tempo-limite e plano de view `security_invoker`; datas sem fuso → regra única; duplicidade nota/compra → vínculos existentes.
- **Condição de publicação:** índices (se houver) aplicados e conferidos; site publicado e verificado; validação do dono.

## Lote 4 · Captura universal e Biblioteca básica (Fase 4)

- **Objetivo:** entrada universal em qualquer ambiente, com caixa de pendentes e destino confirmado; Biblioteca como lugar do que se guarda.
- **Escopo:** botão ＋ universal (preserva os atalhos atuais de `acoes`), `captura_itens`, bucket privado, classificação determinística, caixa e widget, share target, compressão de foto, fila offline, confirmação e desfazer; `biblioteca_itens` (link, nota, documento, arquivo, referência), migração prévia de `pessoal.salvos`.
- **Fora de escopo:** IA na classificação (só sob decisão do Lote 5), OCR, Projetos completos.
- **Arquivos e módulos:** js/captura.js, js/biblioteca.js, `nucleo.js` (`cp*`, `bib*`), `js/app.js` (substitui `abrirCaptura` mantendo compatibilidade), `manifest.webmanifest`, `sw.js`; migration (tabelas e bucket).
- **Dependências:** Lotes 1 e 2 (widgets); `bancoOuFila`; `encolher`.
- **Banco:** `captura_itens`, `biblioteca_itens`, bucket privado com política por espaço; RLS, `mfa`, backup, catálogo, teste de segurança.
- **Integrações:** `share_target` do PWA.
- **Segurança:** item privado do autor até envio; cofre com `mfa`; arquivos só por URL temporária; limites de tamanho e tipo.
- **Testes:** classificação (casos reais em português), idempotência de envio, offline, PGlite das políticas, Storage (pasta por espaço), regressão dos formulários atuais (compra, lembrete, link, peso, gasto, km) e da Fernanda.
- **Critérios de aceite:** capturar texto, link, foto e arquivo em ≤ 2 toques no celular; item pendente aparece na caixa; enviar para Lista/Agenda/Biblioteca cria o registro no módulo e marca o item; desfazer funciona; nada se perde sem internet.
- **Riscos:** foto grande em iOS, duplicação offline, bucket novo e políticas de Storage → testes e validação no iPhone.
- **Condição de publicação:** SQL e bucket aplicados e conferidos (políticas por leitura) → site; validação do dono no iPhone.

## Lote 5 · Intelligence: sinais, preferências e IA opcional (Fase 5)

- **Objetivo:** percepção por regras para todas as áreas e espaços, com apresentação contextual e IA opcional.
- **Escopo:** `sinais` com `espaco_id` e destinatário; regras do [catálogo](17-arquitetura-de-inteligencia.md#32-catálogo-de-tipos-a-partir-de-fontes-que-já-existem); preferências por pessoa e tipo; widget Sinais abertos e "Sugerido agora"; página sugerida por contexto; push consolidado (limites do Monitor); ações de IA `captura.sugerir`, `sinais.explicar`, `espaco.resumo`.
- **Fora de escopo:** IA automática nova (exceto decisão expressa do dono), alteração de teto de IA, ações que gravem.
- **Arquivos e módulos:** `supabase/functions/` (rotina de sinais no molde de `monitor-alerta`), `supabase/functions/rac-ia/acoes.ts` e `demo.ts`, `nucleo.js` (`sg*`), `js/widgets-*.js`; migration aditiva em `sinais`.
- **Dependências:** Lotes 1 a 4 (fontes e espaços).
- **Banco:** colunas aditivas em `sinais`, política por espaço; `service_role` com os grants necessários.
- **Integrações:** push existente; `rac-ia`.
- **Segurança:** P-1 e P-5 com teste de dois espaços e dois usuários; IA só com fatos visíveis a quem pediu.
- **Testes:** regras puras; PGlite; função (como `monitor_alerta.test.mjs`); `tests/ia.test.mjs` para as ações novas; limites de push.
- **Critérios de aceite:** sinais abrem, atualizam e fecham sozinhos; cada um mostra "por que"; push respeita silêncio e limite; IA desligada não remove nada; custo de IA aparece em Custos de IA.
- **Riscos:** ruído de avisos, vazamento entre espaços, custo → limites, testes, ações só a pedido.
- **Condição de publicação:** ordem SQL → função (versão ativa conferida) → site; validação do dono.

## Lote 6 · Mapa e Lugares (Fase 6)

- **Objetivo:** ver onde as coisas aconteceram.
- **Escopo:** `lugares` e vínculo `lugar_id`; migração prévia de `pessoal.saudeLugares`; página e widget Mapa com camadas (percursos, estabelecimentos, viagens); geocodificação sob demanda e com cache; "borrar" casa e trabalho.
- **Fora de escopo:** rastreamento contínuo, geocodificação em lote automática, viagens completas (entram no Lote 7 como projeto).
- **Arquivos e módulos:** js/mapa.js, js/prov-lugares.js, `nucleo.js` (`lug*` já existe em parte: reaproveitar), `js/saude-hub.js` (sem mudar comportamento), migration.
- **Dependências:** Lotes 1 e 3.
- **Banco:** `lugares` e coluna opcional `lugar_id` em `mercados` (aditiva); RLS por espaço, `mfa`, backup.
- **Integrações:** OpenStreetMap/Leaflet, Nominatim (política de uso), Google Maps opcional.
- **Segurança:** coordenadas exatas privadas por padrão; widget compartilhado só com precisão reduzida; nenhuma coordenada no repositório.
- **Testes:** migração (prévia e idempotência), `tests/lugares.test.mjs` estendido, privacidade (borrado), limites do geocodificador.
- **Critérios de aceite:** mapa mostra percursos e estabelecimentos com filtro por período e área; marcar um lugar não altera a compra; migração sem perda.
- **Riscos:** política do Nominatim, dados sensíveis → sob demanda, cache, borrado.
- **Condição de publicação:** SQL aplicado e conferido → site; validação do dono.

## Lote 7 · Meus Projetos e Descobrir (Fase 7)

- **Objetivo:** Projetos completos e Descobrir (curadoria na Casa + área própria).
- **Escopo:** `projetos`, `projeto_tarefas`, vínculos com Biblioteca e Timeline; migração prévia de `pessoal.projetos`; página de projeto; tarefas com data na Agenda; Descobrir (preferências de interesse, silenciar, salvar na Biblioteca, marcar lido), widgets de curadoria; vínculo de MBA/Carreira a projetos.
- **Fora de escopo:** gerenciador de tarefas completo (Kanban avançado, dependências), IA de curadoria automática nova.
- **Arquivos e módulos:** js/projetos.js, js/descobrir.js, `nucleo.js` (`pj*`, `dc*`), `js/widgets-*.js`, migration.
- **Dependências:** Lotes 1 a 4; Lote 5 para `projetos.parado`.
- **Banco:** `projetos`, `projeto_tarefas`, `descobrir_prefs` (ou `usuario_prefs`); RLS por espaço e concessão; backup.
- **Segurança:** concessão por projeto (situação 2); auditoria de mudança de papel.
- **Testes:** PGlite (papéis e concessões), migração, tela, regressão de Conexões/MBA/Carreira.
- **Critérios de aceite:** criar projeto com tarefas, notas, referências e histórico; compartilhar com uma pessoa; Descobrir na Casa e em área própria, salvando na Biblioteca; ideias antigas migradas sem perda.
- **Riscos:** escopo de "projeto" crescer → limite por [Documento 15](15-arquitetura-de-integracao.md#7-projetos); migração de JSON.
- **Condição de publicação:** SQL → site; validação do dono.

## Lote 8 · Consolidação da experiência familiar (Fase 8)

- **Objetivo:** unificar o legado ao modelo de espaços e entregar a experiência familiar flexível.
- **Escopo:** `espaco_id` nas tabelas legadas (`mercados`, `produtos`, `notas`, `itens`, `registros`, `lista`, `bebe`, `pessoal` compartilhada) preenchido pelo espaço "Casa"; políticas reescritas com `dono_da_casa()` como alias; `espaco_modulos` substitui `casa: true`; páginas e preferências próprias da Fernanda; convite de novos membros; fim do `PAPEL` fixo no cliente.
- **Fora de escopo:** qualquer mudança visual para a Fernanda sem decisão do dono; novos módulos.
- **Arquivos e módulos:** migrations (várias, em ordem), `js/app.js`, `js/rotas.js`, `nucleo.js`, testes de segurança e de regressão.
- **Dependências:** todos os anteriores; backup completo antes.
- **Banco:** alterações estruturais e de política **em tabelas em uso** → **prévia, backup verificado, conferência por leitura antes e depois, rollback escrito**; executadas por tabela, não em bloco único.
- **Segurança:** teste de política para cada tabela × cada papel; comparação antes × depois da Fernanda (como na Fase 2); `tests/seguranca*.test.mjs`.
- **Testes:** PGlite de cada migration; regressão de todas as telas da casa; restauração de backup de teste.
- **Critérios de aceite:** a Fernanda vê e faz o mesmo de hoje (ou o que o dono decidir); novo membro convidado vê só o que lhe é concedido; nenhum dado legado perdido; `dono_da_casa()` ainda funciona.
- **Riscos:** o maior do plano (dados e RLS em uso) → lote próprio, por tabela, com rollback e validação do dono antes de cada etapa em produção.
- **Condição de publicação:** cada migration aplicada e conferida em produção, uma por vez, com o site compatível com as duas formas durante a transição; validação do dono e da Fernanda.

---

## 3. Dependências em uma vista

```text
Lote 0 ─► Lote 1 ─► Lote 2 ─┬─► Lote 3 ─┐
                            └─► Lote 4 ─┼─► Lote 5 ─► Lote 7 ─► Lote 8
                                        └─► Lote 6 ─────────┘
(3 e 4 podem trocar de ordem; 5 e 6 podem trocar de ordem; 8 exige todos)
```

## 4. Registro de riscos do programa

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Regressão do Hoje ao virar Workspace | média | alto | extração sem mudar regra, testes existentes, comparação antes × depois |
| Falha de política RLS vazando dados entre espaços | baixa | muito alto | testes PGlite por papel, funções simples, revisão, dois usuários nos testes de ponta a ponta |
| Arrastar/soltar em iOS | média | médio | pressão longa, alternativa por menu e teclado, validação no iPhone |
| Escopo crescer (Projetos, Descobrir) | alta | médio | fora de escopo explícito por lote; novo lote para o que exceder |
| Migração das tabelas legadas | média | alto | Lote 8 próprio, por tabela, com backup e rollback |
| Dependência de robôs do GitHub (atrasos) | alta | baixo | já monitorado; Descobrir indica atraso |
| Custo de IA | baixa | médio | tudo a pedido, teto existente, sem automática nova sem decisão |
| Peso do shell / desempenho no celular | média | médio | módulos sob demanda, carregar só a página aberta, medir antes de otimizar |
| Duas frentes paralelas (Inbox/gmApi, Financeiro) disputando atenção | média | baixo | sequência explícita decidida pelo dono |

## 5. Definição de pronto de qualquer lote

Código testado (módulo e suíte inteira na preparação da publicação) · migrations aplicadas e conferidas por leitura (quando houver) · função publicada com versão ativa conferida (quando houver) · site publicado e verificado no domínio ·
documentação e `docs/mapa.md` atualizados · histórico diário e RAC Knowledge registrados · relatório com o que foi feito, resultado e situação final · **nunca** declarar publicado sem verificar.

> **Estado do Lote 2 (27/11/2026): implementado** (Minha Casa com 10 widgets de Hoje, Saúde e Compras, modelos, primeira utilização, ambientes no registro de rotas, Casa na barra do celular, migration 058 reconciliada). **Sem migration nova**, porque os widgets leem o que os módulos já leem. Detalhes: [14](14-arquitetura-do-workspace.md), [13](13-visao-e-arquitetura-do-novo-rac.md), [19 · seção 7](19-registro-de-decisoes.md) e [20 · seção 10](20-auditoria-visual-e-ux.md). Diferenças da especificação acima: a página padrão **não** é gerada por código a partir do Hoje (são modelos escolhidos pelo usuário); abas por página (Trabalho, Fim de semana…) usam as páginas do Lote 1; o menu por 5 ambientes ficou só na estrutura (campo `ambiente`), por decisão do briefing do lote. Próximo: Lote 3 (Timeline e Busca).

> **Estado do Lote 3 (27/11/2026): implementado** (Timeline com 9 provedores, Busca global sobre 14, widget `timeline.recente`). **Sem migration** (índices existentes medidos em produção). Detalhes: [15 · Estado de implementação (Lote 3)](15-arquitetura-de-integracao.md), [19 · seção 8](19-registro-de-decisoes.md) e [20 · seção 11](20-auditoria-visual-e-ux.md). Diferenças da especificação: o provedor `inbox_mensagens_ref` lê só o cache de cabeçalhos das pastas de entrada; `compras_online` e o Mercado (`notas`) são dois provedores; `lugares`/`captura` ficam para os Lotes 4 e 6. Próximo: Lote 4 (Captura universal e Biblioteca básica).
