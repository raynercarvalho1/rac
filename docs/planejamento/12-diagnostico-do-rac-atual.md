# RAC · 12 · Diagnóstico do RAC atual (Lote 0, 27/11/2026)

Primeiro documento do conjunto **Novo RAC** (12 a 19), criado no Lote 0 (auditoria e arquitetura). Ele descreve o que **existe de verdade hoje**,
conferido no repositório e, quando indicado, no banco de produção por leitura. Nada aqui é proposta: as propostas estão nos documentos 13 a 18.
Convenções [Fato] / [Hipótese] / [Recomendação]: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).
Os documentos 01 a 11 continuam valendo; onde este diagnóstico corrige um número antigo, isso é dito (seção 9).

Como foi conferido: código lido diretamente (`js/rotas.js`, `js/app.js`, `js/dados.js`, `js/fontes.js`, `js/kit.js`, `css/rac.css`, `sw.js`,
`manifest.webmanifest`, `supabase/*.sql`), banco de produção por leitura (conector Supabase: `list_migrations`, `list_tables`,
`list_edge_functions` e um `select` em `cron.job`, `storage.buckets`, `pg_views`, `auth.users`) e a documentação de planejamento.
**Nada foi alterado no banco, nas funções nem no site.**

## 1. Números do RAC em 27/11/2026 [Fato]

| Item | Valor | Evidência |
|---|---|---|
| Versão do site | `2026-11-27.1` | `VERSAO` em `sw.js` |
| Rotas registradas | 34 (24 no menu do dono, 11 liberadas à casa) | `RAC_ROTAS` em `js/rotas.js` |
| Código do site | `nucleo.js` 4.737 linhas, `mercado.js` 2.398, `js/app.js` 1.509, `index.html` 1.403, 40 módulos em `js/` | `wc -l` |
| Testes | 162 itens em `tests/` (arquivos, auxiliares e fixtures) e ≈ 2.260 declarações `test(` | contagem por texto, não é execução |
| Banco (produção) | 58 tabelas em `public`, todas com RLS; 7 views; 2 usuários em `auth.users`; 2 cofres privados (`familia`, `backups`) | `pg_tables`, `pg_views`, `storage.buckets`, `auth.users` (leitura, 27/11/2026) |
| Agendamentos no banco | 6 jobs `pg_cron`: `rac-rotina`, `rac-newsletter`, `radar-rotina`, `inbox-sync`, `fiscal-entradas`, `monitor-alerta` | `cron.job` (leitura) |
| Edge Functions ativas | 6: `garmin` v25, `rac-ia` v21, `rac-inbox` v21 (JWT ligado), `rac-newsletter` v11, `radar` v15, `monitor-alerta` v1 | `list_edge_functions` (leitura) |
| Função só no repositório | `fiscal-consulta` (não está ativa em produção; consulta SEFAZ fora do escopo por decisão do dono) | `supabase/functions/fiscal-consulta` × `list_edge_functions` |
| Robôs (GitHub Actions) | `noticias.yml`, `vagas.yml`, `testes.yml`, mais os workflows de publicação do Worker, da `garmin` e o de prova do iCloud | `.github/workflows/` |

## 2. Estrutura, inicialização e navegação [Fato]

- **Páginas e carregamento.** Uma única `index.html` com uma `<section id="<rota>-view">` por página. Os módulos de `js/` são lidos sob demanda:
  `route()` em `js/app.js` consulta `ROTA_MODS` (tirado de `mods` em `js/rotas.js`) e as dependências `MOD_DEPS`. Base carregada sempre:
  `nucleo.js`, `js/dados.js`, `mercado.js`, `js/rotas.js`, `js/app.js`, `js/graficos.js`, `js/fontes.js` e as fontes leves (lista `SHELL` em `sw.js`).
- **Rotas.** O endereço é `#<id>/<resto>`; cada rota tem `abrir(p)` (p = trechos do endereço). O registro único é `RAC_ROTAS`, de onde saem o menu lateral,
  a barra inferior do celular, as permissões da casa (`DA_CASA`), os módulos de cada página e as ações do botão +.
- **Menu do dono**: 6 áreas (`RAC_AREAS`): Hoje, Vida e família, Finanças e compras, Carreira e estudos, Informação, Sistema. Barra inferior (só dono, até 860 px):
  Hoje, MBA, Saúde, Compras, Inbox + botão do menu. O app do dono abre no **RAC Hoje** (`rotaInicial()`); a casa cai em **Mercado**.
- **Casa (Fernanda).** `route()` redireciona qualquer rota fora de `DA_CASA` para o Mercado. As 11 rotas da casa: Rede, Central de Compras, Pedido de delivery,
  Pedidos online, Central Fiscal, Lista, Olivia, Eddie, Veículos, Documentos e Segurança.
- **PWA.** `sw.js` (rede primeiro para o site, cache para dados dos robôs e bibliotecas, push com abertura da página certa), `manifest.webmanifest`
  (standalone, atalhos, `share_target` já declarado). Responsivo por CSS: 860 px (menu × barra), 760 px, 380 px, 1100 px e 1180 px nos módulos grandes.
- **Atualização e retorno.** Botão ↻ (`atuAtualizar`), atualização silenciosa ao voltar ao site depois de 5 minutos (`NUCLEO.atuVoltar`) e tratamento de toque em notificação.

## 3. Inventário de módulos [Fato]

Reaproveitamento na nova arquitetura: **A** = entra como está (vira fonte, widget ou página), **B** = entra com adaptação, **C** = substituído ou absorvido.

| Módulo (rota) | Finalidade | Arquivos | Dados | Integrações | Quem vê | Reuso |
|---|---|---|---|---|---|---|
| RAC Hoje (`rachoje`) | Tela inicial do dono: gastos, prioridades, saúde, e-mails, Newsletter, esportes, análise de IA | `js/hoje.js`, `js/kit.js` | 13 fontes (banco e contrato `js/fontes.js`) | `rac-ia` (`hoje.analise`) | dono | **B**: vira a primeira página de Workspace; cada bloco vira widget |
| Início (`inicio`) | Painel antigo (fora do menu) | `renderInicio` em `js/app.js` | vários | tempo (Open-Meteo) | dono | **C**: absorvido pelo Workspace |
| Agenda (`agenda`) | Tudo o que tem data | `js/agenda.js`, `js/fonte-agenda.js`, `NUCLEO.agd*` | `registros`, `pessoal`, MBA, backups | push da rotina | dono | **A**: já é a base da Timeline futura |
| Inbox (`inbox`) | Cliente de e-mail Gmail, Outlook e iCloud | `js/inbox.js`, função `rac-inbox`, Worker | `inbox_*` | OAuth Google e Microsoft, IMAP | dono | **A** |
| Resumo, Produtividade (`resumo`, `painel`) | Gráficos e indicadores | `js/resumo.js`, `js/painel.js` | várias | — | dono | **B**: viram widgets |
| Central de Compras (`mercado`) | Compras, áreas de consumo, categorias, Radar | `mercado.js`, `NUCLEO.mk*`, `ar*`, `cu*` | `mercados`, `notas`, `itens`, `produtos`, `compras` (view) | `radar` | dono e casa | **A** |
| Central Fiscal (`fiscal`) | Entrada de notas (XML, PDF, foto) | `js/fiscal.js` | `notas_fiscais*` | `rac-ia` (`fiscal.nota`) | dono e casa | **A** |
| Pedidos online, Delivery (`compras`, `alimentacao`) | Entrada de pedidos | `js/compras.js`, `js/alimentacao.js` | `compras_online*`, `pedidos` | — | dono e casa | **A** |
| Radar de Preços | Ofertas × o que foi pago | `js/radar.js`, função `radar` | `radar_*` | SerpApi, Mercado Livre | dono e casa | **A** |
| Lista (`lista`) | Lista de compras e tarefas da casa, em tempo real | `js/lista.js` | `lista` (Realtime) | atalhos do iPhone | dono e casa | **A**: destino natural da Captura |
| Olivia, Eddie, Documentos, Veículos | Família, saúde infantil, documentos e veículos | `js/familia.js`, `js/bebe.js`, `js/oms.js`, `js/fonte-familia.js` | `registros`, `bebe`, cofre `familia` | — | dono e casa | **A** |
| Saúde e treinos (`saude`) | Garmin: dia, sono, VFC, treinos, mapa, lugares | `js/saude.js`, `js/saude-hub.js`, `js/fonte-saude.js` | `garmin_dia`, `garmin_ativ`, `garmin_rotas`, `pessoal.saudeLugares` | `garmin`, Leaflet/OpenStreetMap | dono | **A**: fonte principal de Mapa |
| MBA, Conexões, Carreira, Rede, Vagas, Estudos | Estudos, carreira, vagas | `js/mba.js`, `js/conexoes.js`, `js/carreira.js`, `js/rede.js`, `renderEstudos` | `pessoal` (chaves `mba`, `projetos`, `salvos`, `candidaturas`…) | robô de vagas | dono (Rede: casa) | **B**: dados em `pessoal` (JSON) |
| Newsletter (`newsletter`) | Edições de notícias com resumo de IA | `js/newsletter.js`, `rac-newsletter` | `newsletter_edicoes`, `newsletter.json` | 52 feeds, `rac-ia` | dono | **A**: base do Descobrir |
| Esportes, Perfis no X | Central esportiva e perfis | `js/esportes.js`, `js/esportes-central.js` | APIs públicas, `rumores.json` | MLB, ESPN | dono | **A**: base do Descobrir |
| Aniversários | Datas | `withDates` e a lista em `js/app.js` | `pessoal` | — | dono | **B** |
| RAC Knowledge (`conhecimento`) | Memória técnica do projeto | `js/conhecimento.js`, `NUCLEO.kn*` | `conhecimento*` | repositório | dono | **A** (fica em Sistema) |
| Sistema, Monitor, Segurança, Custos de IA | Operação, backup, MFA, monitor de integrações, custos | `js/sistema.js`, `js/seguranca.js`, `js/iacustos.js` | `erros`, `rotina_log`, `sinais`, `seguranca_*`, `ia_*` | GitHub (API pública) | dono (Segurança: casa) | **A** (fora dos cinco ambientes) |
| Busca (`busca`) | Busca global | `renderBusca` e `buscar` em `js/sistema.js` | leitura direta de várias fontes e da memória do site | — | dono | **B**: vira a Busca do novo RAC |
| Captura rápida (botão +) | Anota em segundos | `abrirCaptura`, `capOpcoes` em `js/app.js`, `acoes` em `js/rotas.js` | grava direto em `lista`, `registros`, `pessoal` | `share_target` do PWA | dono (ações por tela), casa (folha completa) | **B**: evolui para a Captura universal |
| Componentes (`componentes`) | Catálogo visual do Design System | `js/componentes.js` | — | — | dono | **A** |

## 4. Design System [Fato]

- **Tokens** `--rac-*` em `css/rac.css` (69 nomes): cores semânticas (`--rac-ok`, `--rac-aviso`, `--rac-erro`, `--rac-info` com `-fill` e `-tinta`), papel e superfícies, azul e prata da marca,
  tipografia (`--rac-fs-*`), espaçamento `--rac-esp-1` a `--rac-esp-12`, raios, sombras, movimento e camadas `--rac-z-*`. Há **tema escuro** (`prefers-color-scheme`,
  com `data-theme` para forçar) em `css/rac.css` e uma cópia dos tokens antigos em `index.html` (duas fontes de tokens: ver seção 8).
- **Componentes** em `js/kit.js` (prefixo `rk`): selo, botões, seção, cartão, indicador (KPI), alerta, atalho, informação, lista, recolher, estado (carregando, vazio, erro), campo, medidor,
  comparação. Gráficos em `js/graficos.js` (`rs*`), todos com a dica `racDica`.
- **Padrões antigos ainda em uso** fora do kit: `panel()` e `wCard()` em `js/app.js` (Mercado, Família, Lista e outros).
- **Responsivo:** menu lateral de 268 px a partir de 861 px; barra inferior abaixo disso; grades do Hoje e da Saúde recolhem em 1100/760/380 px.
- **O que já atende ao novo RAC:** tokens e tema escuro, cartão como unidade visual (`rkCard`), estados vazio/erro/carregando padronizados, ícones por rota, barra inferior.
- **O que precisa evoluir:** um contêiner de **widget** (cabeçalho, menu de ações, modo de edição, estado "indisponível"), a grade de composição, a navegação por ambientes
  e o botão central de Captura. Nada disso exige reconstrução visual: usa os tokens e o `rkCard` existentes (decisão N-12, [Documento 19](19-registro-de-decisoes.md)).

## 5. Dados e backend [Fato, conferido em produção por leitura]

**5.1 Migrations.** O histórico do Supabase registra 17 migrations (051 a 069, com 058 e 061 ausentes). As anteriores (002 a 050) foram aplicadas pelo SQL Editor e não aparecem em
`list_migrations`. A 050 (catálogo de segurança) **não está aplicada**: `public.seguranca_catalogo` não existe em produção. A 058 (IA fiscal para a casa) também não consta no
histórico. As propostas `041`, `044`, `055` (arquivo ainda em `supabase/propostas/`, mas o job `inbox-sync` está ativo) e `061` estão fora do histórico regular.

**5.2 Estruturas por origem.**

| Situação | Itens |
|---|---|
| **Confirmadas em produção** (leitura de 27/11/2026) | 58 tabelas, as 7 views (`compras`, `compras_creditos`, `compras_creditos_historico`, `alimentacao_gastos`, `ia_custos`, `radar_precos_final`, `monitor_processos`), 6 jobs `pg_cron`, buckets `familia` e `backups` (privados), 6 Edge Functions |
| **Só em arquivo, não aplicadas** | `seguranca_catalogo` (050), propostas 041, 044, 061; função `fiscal-consulta` |
| **Documentadas sem confirmação** | Políticas RLS tabela a tabela em produção (lidas só nos `.sql`; a conferência `supabase/conferencias/` cobre parte); configuração de cadastro aberto ou fechado em Authentication (ver 6) |

**5.3 Fontes de dados para o novo RAC.**

| Futuro | Fonte hoje | Observação |
|---|---|---|
| Widgets | contrato `fonteLer` (`agenda`, `familia`, `mba`, `newsletter`, `saude`) e leituras diretas (`mercado.js`, `lista`) | só 5 fontes têm contrato; o resto é leitura direta |
| Timeline | `registros` (227 linhas: exames, vacinas, consultas, pesos), `notas` (61), `garmin_ativ` (1.000), `compras_online`, `inbox_mensagens_ref`, `newsletter_edicoes`, `seguranca_eventos`, `sinais`, `pessoal.lembretes` | `NUCLEO.agendaItens` já compõe itens datados |
| Captura | `lista` e `registros` (gravação direta), `pessoal` chaves `lembretes`, `projetos`, `salvos` | não existe um lugar para o que ainda não foi classificado |
| Projetos | `pessoal.projetos` (ideias de Conexões), `pessoal.candidaturas`, `mba`, `historias` | tudo JSON em `pessoal`; sem tarefas, documentos ou histórico por projeto |
| Biblioteca | `pessoal.salvos` (links), cofre `familia`, `notas_fiscais_docs`, `inbox` | sem modelo único de "item guardado" |
| Descobrir | `newsletter`, `noticias.json`, `tecdados.json`, `rumores.json`, `vagas.json`, Esportes, Radar | curadoria é a ordem do módulo, não do usuário |
| Mapa | `garmin_rotas` (996 linhas, até 150 pontos), `pessoal.saudeLugares` (coordenadas e endereços de mercados), `mercados.cidade`, `notas_fiscais.emitente_uf` | **compras, estabelecimentos e viagens não têm coordenadas**; as de mercados estão em JSON |
| Inteligência | `sinais` (4 linhas, só o Monitor), `NUCLEO.pri*` (régua), `ia_uso`, `hoje` ("o que mudou") | a tabela `sinais` é genérica, mas só tem destinatário "dono" |

**5.4 Servidor e segredos.** Segredos só em Edge Functions e no Vault (`rac_segredos`, `inbox_credenciais`). A única chave no código é a publishable. `service_role` grava as rotinas.

## 6. Identidade e permissões [Fato, salvo onde marcado]

- **Login:** Supabase Auth (senha, 2ª etapa TOTP, passkey). A trava restritiva `mfa` (`rac_aal_ok()`, 022) vale para tabelas pessoais e para os cofres.
- **Papéis:** só dois, calculados no navegador: quem tem linha em `membros` (`membro → dono`) é `casa`; **todos os outros são `dono`** (`PAPEL=m.data.length?"casa":"dono"` em `js/app.js`).
  O modelo é **uma casa por dono**: `dono_da_casa()` devolve o dono da casa de quem está logado.
- **Propriedade dos registros** (`user_id`): tabelas compartilhadas (`mercados`, `produtos`, `notas`, `itens`, `registros`, `lista`, `bebe`) gravam `user_id = dono_da_casa()`; a casa lê e grava as mesmas linhas.
  Tabelas do dono (`pessoal`, `garmin_*`, `inbox_*`, `newsletter_*`, `ia_*`, `sinais`…) exigem `auth.uid()` e "não ser membro". `pessoal` tem uma política extra "casa compartilha" restrita a
  7 chaves (`radar-*`, `mercado-*`).
- **Compartilhamento por registro:** não existe. Não há `espaco_id`, grupo, convite, papel de leitura ou compartilhamento de um item específico. O backup e a restauração conhecem as tabelas pessoais (`NUCLEO.SEG_TABELAS`).
- **Preferências:** `PESSOAL` (JSON em `pessoal`) para o dono; a casa não tem preferências próprias fora das 7 chaves compartilhadas e do `localStorage` do aparelho.
- **[Hipótese]** O cadastro aberto de novas contas está desligado em Authentication (há 2 usuários); não confirmado, porque o conector não lê essa configuração. Se estivesse aberto, qualquer conta nova seria tratada como `dono`
  da própria casa (sem acesso aos dados de outros por causa do RLS, mas com acesso às funções). Verificar antes do Lote 1.
- **Limitações para o novo RAC:** (1) preferência de interface não resolve propriedade; (2) só uma casa por dono; (3) um conteúdo é "do dono" ou "da casa", nunca "de um espaço" ou "compartilhado com fulano";
  (4) o papel é binário e vive no cliente (o banco decide pelo RLS, mas a tela escolhe o que mostrar); (5) a tabela `sinais` e as funções de IA, push e Inbox só conhecem o dono.

## 7. Integrações e automações [Fato]

O inventário completo e os agendamentos estão no [Documento 05](05-integracoes-e-automacoes.md#1-inventário-de-integrações-fato). Estado em 27/11/2026 e contribuição ao novo RAC:

| Integração | Estado | Contribui para |
|---|---|---|
| Garmin (função `garmin` v25) | Ativa; rotina às 6h; rotas e extras gravados | Timeline (treinos), Mapa (rotas), Intelligence (sinais de saúde) |
| Gmail, Outlook, iCloud (RAC Inbox) | Gmail e Outlook completos; iCloud: arquivar sim, excluir fora do escopo; sincroniza a cada 10 min | Timeline (e-mails), Captura (e-mail → tarefa), Utilidade |
| Google APIs | Gmail (leitura no navegador ainda em Compras, Carreira e vagas, a migrar), Google Maps opcional | Mapa (tiles opcionais) |
| Anthropic (`rac-ia`) | Ativa, com teto mensal; ações fechadas; IA nunca grava | nível 3 do Intelligence |
| Open-Meteo | Tempo e chuva (site e rotina) | widgets de contexto |
| MLB Stats, ESPN | Só tela; ESPN não oficial | Descobrir |
| Notícias, Newsletter, vagas (robôs) | Dependem do GitHub Actions, que atrasa e pula rodadas; incidentes abertos no Monitor em 26/11 | Descobrir, Biblioteca |
| Web Push (VAPID) | Garmin, Newsletter, Radar, Inbox e Monitor | avisos do Intelligence |
| GitHub Actions e Pages | Publicação do site e testes | operação |
| OpenStreetMap, Nominatim, ViaCEP | Mapas e busca de endereço no navegador | Mapa |
| SerpApi, Mercado Livre | Radar | Descobrir (ofertas) |

## 8. Qualidade e manutenção [Fato, salvo onde marcado]

- **Testes:** ≈ 2.260 `test(` em 162 itens de `tests/`; CI em dois grupos (`.github/workflows/testes.yml`); testes de estrutura proíbem nome global repetido, dependência escondida entre módulos
  (`tests/graficos.test.mjs`), gráfico sem dica e Anthropic fora da `rac-ia`. Há teste de que as rotas e permissões não mudaram (`tests/rotas.test.mjs`) e de segurança de tabela (`tests/seguranca.test.mjs`).
  Não foi executada a suíte neste lote: nenhum código mudou; o CI do PR cobre os testes de documentação.
- **Convenções:** ES5 puro, tudo global, funções puras em `nucleo.js`, módulos por prefixo (`kn*`, `ic*`…), SQL numerado e reexecutável, versão em `sw.js` e `js/app.js` juntas.
- **Acoplamentos e pontos frágeis:**
  1. **Escopo global único** e `nucleo.js` de 4.737 linhas: mudar nome é arriscado; o novo código precisa de prefixo próprio (`ws*`, `tl*`, `cp*`).
  2. **Duas fontes de tokens** (`index.html` e `css/rac.css`) e dois idiomas de componente (`panel()`/`wCard()` × `rk*`).
  3. **`pessoal` como depósito JSON** de dezenas de chaves, sem esquema, com conflito resolvido em Sistema; serve para preferências, não para dados de negócio compartilhados.
  4. **Papel no cliente**: a tela decide o que mostrar pelo `PAPEL`; qualquer widget novo precisa depender do RLS, nunca do `PAPEL`.
  5. **Busca** lê fontes e memória do site, sem índice, e é só do dono.
  6. **Robôs dependem do GitHub** (atrasos reais, registrados no Monitor).
  7. **Documentação de estado atrasada:** `docs/mapa.md` ainda marca como pendentes migrations que estão aplicadas (substituído pelos registros do RAC Knowledge); este diagnóstico é a referência até a atualização de `docs/mapa.md` feita neste lote.
- **Riscos de regressão para o novo RAC:** a experiência da Fernanda (tem teste), o backup e a restauração (qualquer tabela pessoal nova entra em `NUCLEO.SEG_TABELAS`), o Service Worker (cache do shell: arquivo novo entra em `SHELL`) e os módulos que ainda dependem do Início.
- **Limitações arquiteturais:** sem build nem módulos ES (um `<script>` por arquivo), sem biblioteca de arrastar; o motor de grade precisa ser próprio (decisão N-05).

## 9. Correções ao que os documentos anteriores diziam

| Onde | Dizia | Estado real em 27/11/2026 |
|---|---|---|
| [Documento 01](01-visao-e-mapa-mestre.md), tabela "O RAC hoje em números" | 30 rotas, 4 Edge Functions, 46 tabelas | 34 rotas, 6 funções ativas, 58 tabelas (o Documento 01 é de 13/11/2026 e mantém o histórico; esta tabela o supera) |
| `docs/mapa.md` | 050 e outras migrations "pendentes" | 050 segue pendente; 051 a 057, 059, 060, 062 a 069 aplicadas |
| Registro `estado/estado-do-projeto-em-20-11-2026` | `garmin` v24 | v25 em produção |

## 10. Conclusão do diagnóstico

O RAC atual é um produto de **módulos fortes e independentes**, com uma boa base técnica reaproveitável (registro de rotas, contrato de fontes, kit de componentes, Design System com tema escuro,
`sinais`, `rac-ia`, Inbox, Garmin). O que **falta** para o conceito novo não é visual: é (1) um **modelo de espaços e propriedade** que vá além de "dono e casa", (2) um **motor de composição**
(páginas e widgets) para o usuário organizar a própria tela, (3) uma **camada cronológica** e uma **entrada universal** que cruzem módulos sem copiar dados, e (4) **localização** estruturada. A arquitetura
está nos documentos [13](13-visao-e-arquitetura-do-novo-rac.md) a [19](19-registro-de-decisoes.md).
