# RAC · 07 · Decisões e pendências

Registro das decisões tomadas, das questões que dependem do dono, das pendências e das alternativas descartadas.
Criado em 13/11/2026. **Regra**: nada é apagado; uma decisão que muda ganha uma linha nova com a data, e a antiga fica marcada
como substituída. Convenções: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

## Decisões tomadas

| Data | Decisão | Fonte |
|---|---|---|
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

## Questões abertas (dependem do dono)

| ID | Pergunta | Opções e recomendação | Bloqueia |
|---|---|---|---|
| D-01 | Qual tema é o padrão? | "Noite Dodger" (escuro) para o dono, claro continua disponível; a casa mantém o tema atual até decidir. **Recomendado** | DS-2 |
| D-02 | O que a Fernanda vê e faz nas frentes novas (medicamentos, contas, encomendas, condomínio, integrantes)? | Ver e lançar medicamentos de Olivia e Eddie e encomendas; contas a decidir; cadastro de integrantes só do dono | F4 |
| D-03 | O que fazer com a Central Fiscal e a proposta `040`? | (a) manter como está, sem evoluir; (b) tirar do menu e manter o código; (c) arquivar. Para a `040`: mover para `supabase/propostas/` como arquivada. **Recomendado: (a) + arquivar a 040** | Limpeza |
| D-04 | Propostas `041` (categorias oficiais do Mercado) e `044` (IA do Radar)? | Decidir na etapa da Central de Compras | Compras |
| D-05 | Para onde a notificação das 6h deve levar? | RAC Hoje (quando for o painel central) ou o item que gerou o aviso; mudar a URL exige mexer na `garmin` | F1 (parte) |
| D-06 | Como enviar push dos sinais e alertas do monitor? | (a) só pelo resumo das 6h existente (exige mexer na `garmin`); (b) uma função nova e pequena só para avisos, reaproveitando as chaves VAPID; (c) sem push, só no RAC Hoje. **Recomendado: (c) primeiro, depois (b)** | M4, sinais etapa B |
| D-07 | A explicação dos sinais pela IA pode ser automática (uma vez por dia, com teto)? | Só a pedido no começo; automática só com autorização expressa, como a Newsletter | F6 |
| D-08 | Garmin: autorizar a investigação só de leitura dos dados extras? Ativar trajetos (L2/L3)? Qual retenção e quais zonas de privacidade? | Investigar primeiro; trajetos desligados por padrão | G4, G5 |
| D-09 | Guardar no servidor o texto das análises pagas (proposta P2 do RAC Hoje)? | Sim, junto com a interpretação de sinais | F6 |
| D-10 | Versionar as skills `rac-publicar`, `rac-sql-novo` e `rac-acao-ia` no repositório (público, sem segredos), para valerem na nuvem? | **Recomendado**, depois de revisar o conteúdo | Processo |
| D-11 | Ativar a Fase 1 da proteção da `main` (bloquear force push e exclusão)? | **Recomendado** (`docs/nuvem.md`) | Segurança |
| D-12 | O RAC Hoje substitui o Início do dono? | Sim, com os cartões atuais virando blocos alimentados por fontes | F5 |
| D-13 | Que informações do condomínio podem ser guardadas? | Só não secretas (contatos, horários, regras); nunca códigos, senhas ou credenciais | F4 |
| D-14 | Conferir o estado real das migrations 036, 038 e 039 e reconciliar a documentação | Rodar as conferências só leitura (lista abaixo) | Reconciliação |

## Inconsistências de estado encontradas

Encontradas na auditoria de 13/11/2026. Nenhum documento de módulo foi alterado nesta etapa; a correção faz parte da Fase 1
do [roadmap](06-roadmap.md), depois da conferência do dono.

| # | Divergência | Evidência | Como resolver |
|---|---|---|---|
| I-01 | A `036` (IA fiscal) aparece como "NÃO aplicada" no cabeçalho do arquivo e numa tabela do `docs/fiscal.md`, e como "aplicada" no `docs/mapa.md` e em outro trecho do `docs/fiscal.md` ("036 aplicado, `rac-ia` publicada, `fiscal.nota` liberada") | `supabase/036_ia_fiscal.sql` (linha 1); `docs/fiscal.md` linhas 139 e 259; `docs/mapa.md` | Consulta só leitura da constraint de `ia_config` |
| I-02 | A `038` aparece como "PROPOSTA · NÃO APLICADA" no cabeçalho e no `docs/fiscal.md`, e como "aplicada em 08/11/2026" no `docs/mapa.md` | `supabase/038_seguranca_estado_tentativas.sql`; `docs/fiscal.md` linha 286 | `supabase/conferencias/038_conferir_producao.sql` |
| I-03 | A `039` aparece como "PROPOSTA · NÃO APLICADA" no cabeçalho e no `docs/fiscal.md`, e como "aplicada em 08/11/2026" no `docs/mapa.md` | `supabase/039_nota_foto_sem_chave.sql`; `docs/fiscal.md` linha 288 | `supabase/conferencias/039_conferir_producao.sql` |
| I-04 | `docs/hoje.md` diz que as Etapas 2 a 5 estão "só na cópia local, ainda não publicada", mas esse código está na `main` (publicada pelo Pages) | `js/hoje.js` contém `sem_web_locks` (Etapa 5) na `main` | Atualizar a tabela de estado |
| I-05 | `docs/rac-intelligence.md` ("Estado atual (31/10/2026)") diz que nenhuma chamada paga foi feita e tudo está em DEMO; `docs/hoje.md` registra 3 chamadas reais em 02/11/2026 e a Newsletter está em REAL | os dois documentos | Nova linha de estado datada |
| I-06 | `docs/veiculos.md` diz que o banco só libera REAL para `newsletter.resumo`; a `028` liberou `hoje.analise` | `docs/veiculos.md` linha 44; `supabase/028_hoje.sql` | Atualizar a frase |
| I-07 | `docs/compras.md` mantém títulos "só no código local; nada publicado" para lotes que já estão na `main` | `docs/compras.md` linhas 212, 280, 306; `coResumo` em `nucleo.js` | Acrescentar "publicado em …" |
| I-08 | O `README.md` diz que o site com o RAC Hoje "ainda não foi publicado" e que nenhum arquivo está com `-- status: pendente`; o RAC Hoje está no ar e a `040` está pendente | `README.md` linhas 78 e 110; `supabase/040_nota_fiscal_entrada_mercado.sql` | Atualizar as duas frases |
| I-09 | `docs/mapa.md` cita as propostas `044` e `045` em `supabase/propostas/`; a `045` foi aplicada e movida para `supabase/` | `supabase/045_radar_rotina.sql`; commit `2885eb7` | Corrigir a linha do Radar |
| I-10 | `CLAUDE.md` e `docs/mapa.md` mandam usar as skills `rac-publicar`, `rac-sql-novo` e `rac-acao-ia`, que não existem na nuvem (só no computador do dono) | `.claude/` contém só `settings.json` | D-10 |

## Pendências técnicas

| Pendência | Origem | Situação |
|---|---|---|
| Migration `040` (dar entrada da nota fiscal no Mercado) | `supabase/040_nota_fiscal_entrada_mercado.sql` | Pendente (confirmado em 13/11/2026: a função não existe em produção); ver D-03 |
| Propostas `041` e `044` | `supabase/propostas/` | Não aplicadas; ver D-04 |
| P2 (recuperar análise paga perdida) e P5 (validar fato × inferência) | `docs/hoje.md` | Não resolvidas; dependem de servidor |
| Atualização global de Resumo, Esportes e Lista | `README.md` (limitações aceitas) | Aceitas até etapa própria |
| Primeiro teste REAL do abastecimento | `docs/rac-intelligence.md`, `docs/veiculos.md` | Ação em DEMO em produção |
| Agrupamento da Newsletter não junta línguas diferentes | `docs/newsletter.md` | Limitação conhecida |
| Busca lateral chama Esportes sem carregar (P-19) | [Documento 02](02-auditoria-arquitetural.md#6-problemas-encontrados-com-evidência) | Hipótese forte; corrigir na Fase 1 |
| Clique na notificação (P-17) e retorno à aba (P-16) | [Documento 08](08-frentes-funcionais.md#rac-hoje-painel-central) | Fase 1 |

## Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| Migrar para um framework (React, Vue, Svelte), TypeScript ou bundler | Custo alto de migração e de teste, sem ganho mensurável; os problemas encontrados são de organização, resolvidos com contratos e extração de peças ([Documento 02](02-auditoria-arquitetural.md#10-o-que-manter-refatorar-e-não-mexer)) |
| Microserviços ou backend próprio | O Supabase cobre banco, regras, funções e agendamento |
| Reescrever `mercado.js` | Funciona e é muito testado; só sai dele a parte de plataforma |
| n8n agora | Servidor e segredos a mais, sem necessidade atual ([Documento 05](05-integracoes-e-automacoes.md#6-n8n-avaliar-depois-não-agora)) |
| Chat de IA como interface principal | Decisão do dono: inteligência proativa e contextual |
| IA calculando números | O banco e o núcleo calculam com precisão e sem custo |
| OCR, SEFAZ e acompanhamento fiscal | Retirados do planejamento em 13/11/2026 |
| Rastrear localização continuamente ou guardar rotas sem pedido | Invasivo; trajetos só com ativação voluntária e zonas de privacidade |
| Raspagem de LinkedIn, de aplicativos do condomínio ou de sites sem permissão | Regras do `CLAUDE.md` e termos de cada fonte |
| Guardar códigos de acesso, senhas ou credenciais do condomínio | Risco de segurança sem benefício que justifique |
| Tabelas separadas para pessoas e para animais | Uma tabela de integrantes com `tipo` evita redundância |
