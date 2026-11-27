# RAC · 19 · Registro de decisões do Novo RAC

Documento 8 do conjunto Novo RAC (Lote 0, 27/11/2026). Consolida as decisões de produto **aprovadas pelo dono** e as decisões de arquitetura **tomadas neste lote** (com alternativas avaliadas e justificativa).
Convenção: **[Aprovada]** = decisão de produto do dono (não se reabre sem justificativa técnica relevante); **[Lote 0]** = decisão técnica tomada neste lote, revisável pelo dono.
Nada é apagado: decisões novas que substituírem estas citam a antiga. As decisões anteriores do RAC (D-01 a D-14 e as datadas) seguem em [07-decisoes-e-pendencias.md](07-decisoes-e-pendencias.md).

## 1. Decisões de produto aprovadas pelo dono (origem: briefing do Lote 0, 27/11/2026)

| Id | Decisão | Status |
|---|---|---|
| **N-01** | Conceito: **RAC — Seu espaço. Sua vida. Seu mundo.** Pilares **Casa, Descoberta, Utilidade** | [Aprovada] |
| **N-02** | Cinco ambientes: **Minha Casa, Minha Biblioteca, Meus Projetos, Descobrir, Minha Vida**; navegação coerente que **aproveita os módulos atuais**, **sem cinco sistemas independentes** | [Aprovada] |
| **N-06** | O Workspace permite **personalizar sem código nem pedir ao Claude**; **ocultar, remover da página, desativar e excluir o registro original são ações distintas**; mudar a composição **nunca apaga dado de negócio** | [Aprovada] |
| **N-07** | A **Timeline consulta e apresenta os dados originais, sem cópias desnecessárias** | [Aprovada] |
| **N-08** | **Captura universal** acessível em todos os ambientes (texto, ideia, link, foto, arquivo, tarefa, referência, observação) | [Aprovada] |
| **N-09** | **Privado, compartilhado entre autorizados e de espaço compartilhado** desde o início; propriedade e permissões **no banco**, não numa preferência de interface; nada privado vaza em widget, busca, Timeline ou inteligência | [Aprovada] |
| **N-11** | **RAC Intelligence em três níveis** (organização determinística, percepção, IA); a **IA é opcional** e não é requisito do funcionamento básico | [Aprovada] |
| **N-15** | **Meus Projetos e Descobrir** ficam na arquitetura (Projetos: objetivos, tarefas, documentos, notas, referências e histórico; Descobrir: curadoria na home e área própria); **Mapa** integra atividades, estabelecimentos, compras, viagens e registros com localização | [Aprovada] |
| **N-16** | Fases de referência: 0 auditoria; 1 motor de Workspace; 2 Minha Casa; 3 Timeline; 4 Captura; 5 Intelligence; 6 Mapa; 7 Projetos e Descobrir; 8 experiência familiar (ajustável por dependência comprovada) | [Aprovada] |

## 2. Decisões técnicas tomadas no Lote 0

### N-03 · Sistema fica fora dos cinco ambientes [Lote 0]
- **Contexto:** Segurança, Monitor, Custos de IA, RAC Knowledge, backup e Componentes não são "ambientes" de vida.
- **Alternativas:** (a) forçar dentro de Minha Vida; (b) sexto ambiente; (c) acesso de configuração separado.
- **Decisão:** (c). Mantém a promessa dos **cinco** ambientes e a separação entre usar o RAC e operá-lo. A Fernanda continua acessando Segurança como hoje.

### N-04 · Layout de página como documento JSON versionado em tabela própria [Lote 0]
- **Alternativas:** `pessoal` (JSON por chave); tabela normalizada por widget; **tabela `workspace_paginas` com `layout` jsonb + `workspace_versoes`**.
- **Decisão:** a terceira. `pessoal` não conhece espaço nem compartilhamento e a casa só enxerga 7 chaves; normalizar por widget gera escritas pequenas e ordem difícil de manter atômica sem ganho, já que a permissão é da página.
  `pessoal` continua para preferências pequenas. Detalhe: [Documento 14](14-arquitetura-do-workspace.md#5-persistência-recomendação).

### N-05 · Grade em fluxo de 12 colunas, sem posição absoluta e sem biblioteca externa [Lote 0]
- **Alternativas:** grade livre x,y; biblioteca de arrastar via CDN; **fluxo ordenado com larguras (12 colunas) e reordenação por arrastar**.
- **Decisão:** a terceira. Um único documento serve a desktop (12), tablet (8) e celular (1 coluna em ordem); sem sistema de colisão; arrastar por Pointer Events com alternativa por teclado/menu; cumpre a regra "sem dependência nova".
  Reavaliar a biblioteca apenas se o motor próprio falhar na validação no iPhone.

### N-08b · A Captura universal **acrescenta** a caixa de pendentes e **preserva** os atalhos [Lote 0]
- **Contexto:** hoje a Captura grava direto no módulo (lista, lembrete, link, peso, gasto, km), o que é rápido para quem sabe o destino.
- **Decisão:** manter o caminho curto e acrescentar `captura_itens` para o que ainda não tem destino; classificação por regra e confirmação do usuário; nada vira registro de módulo sem confirmação ([Documento 15](15-arquitetura-de-integracao.md#3-rac-captura)).

### N-10 · A fundação de espaços entra no Lote 1, antes do Workspace [Lote 0]
- **Contexto:** o modelo atual é "dono + casa" (um espaço implícito). Persistir páginas e widgets antes de ter espaços criaria dívida de migração.
- **Alternativas:** (a) Workspace só para o dono em `pessoal` e espaços depois; (b) espaços na Fase 8; **(c) espaços mínimos no Lote 1**.
- **Decisão:** (c), mantendo as **tabelas legadas intactas** até o Lote 8 (seed do espaço "Casa" a partir de `membros`, sem tocar linhas). Isto **ajusta a ordem de referência** (Fase 1 inclui a fundação) e é a única mudança de sequência.

### N-12 · O Design System atual é evoluído, não reconstruído [Lote 0]
- **Contexto:** tokens `--rac-*`, tema escuro, kit `rk*` e componentes já existem.
- **Decisão:** o Workspace usa `rkCard`, tokens e quebras existentes; acrescenta contêiner de widget, grade e modo de edição. Unificar os tokens duplicados de `index.html` fica como limpeza oportuna, não como reconstrução.

### N-13 · Fernanda e dados existentes preservados até o Lote 8 [Lote 0]
- **Decisão:** nenhuma tabela legada, política ou tela da casa muda antes do Lote 8; a página da Fernanda é gerada por código a partir de `casa: true`; mudanças para ela exigem decisão do dono (regra permanente `regra/fernanda-papel-casa`).

### N-14 · Busca global por provedores, sem índice paralelo dos dados privados [Lote 0]
- **Alternativas:** índice central (tabela de busca); busca no navegador sobre cópias; **provedores por módulo com a sessão do usuário**.
- **Decisão:** a terceira: respeita o RLS por construção, não duplica dado sensível. Índice `tsvector` **por módulo** só se a medição exigir.

### N-17 · Timeline sem tabela de eventos no começo [Lote 0]
- **Alternativas:** tabela `eventos` alimentada por gatilhos; view/RPC de união; **composição por provedores no cliente**.
- **Decisão:** a terceira para começar (cumpre N-07 e evita gatilhos em tabelas em uso); evolução prevista para **view/RPC `security_invoker`** se a medição exigir. Nunca tabela de cópia.

### N-18 · Desativar ≠ Ocultar [Lote 0]
- **Decisão:** **Ocultar** afeta a exibição (por usuário em página compartilhada); **Desativar** pausa o comportamento (consulta, sinais e avisos da instância) e, no espaço, permite ao administrador desligar um **tipo**. Detalhe e tabela completa no [Documento 14](14-arquitetura-do-workspace.md#6-ocultar-remover-desativar-e-excluir-distinção-obrigatória-n-06).

### N-19 · Tipos de widget privados não entram em espaço compartilhado [Lote 0]
- **Decisão:** cada tipo e provedor declara `compartilhavel`; saúde, e-mail, custos de IA e conhecimento são `false`. O motor recusa e há teste (regra P-2, [Documento 16](16-arquitetura-de-identidade-e-compartilhamento.md#6-o-que-nunca-pode-vazar-regras-de-privacidade)).

### N-20 · Configuração de widget só guarda referências, nunca conteúdo privado [Lote 0]
- **Decisão:** a página é visível a todos os membros do espaço; a configuração (limite de 4 KB) guarda critérios (período, área, quantidade), não dados.

### N-21 · `sinais` é a única estrutura de percepção e ganha espaço [Lote 0]
- **Decisão:** reaproveitar a tabela genérica (067) com `espaco_id` e destinatário (Lote 5), em vez de criar outra; mantém ciclo de vida, `porque` e `regra_versao`.

### N-22 · Lugares como entidade própria; geocodificação só sob demanda [Lote 0]
- **Contexto:** compras e notas não têm coordenadas; coordenadas existem em `pessoal.saudeLugares` e em `garmin_rotas`.
- **Decisão:** tabela `lugares` + vínculo opcional; migração com prévia; sem geocodificação em lote automática (política do serviço e privacidade); precisão reduzida em widgets compartilhados.

### N-23 · Convites sem cadastro aberto [Lote 0]
- **Decisão:** novas pessoas entram por conta criada pelo administrador do projeto; o cadastro aberto permanece desligado (a verificar antes do Lote 1: [diagnóstico, seção 6](12-diagnostico-do-rac-atual.md#6-identidade-e-permissões-fato-salvo-onde-marcado)).

### N-24 · Navegação mobile: barra com ambientes e botão central de Captura [Lote 0, a validar]
- **Contexto:** a barra atual (Hoje, MBA, Saúde, Compras, Inbox) é escolha do dono.
- **Decisão:** **recomendação**, validada em protótipo no Lote 2 e aprovada pelo dono antes de trocar a barra.

## 3. Resultados do Brainstorm e do Grill Me (resumo)

**Brainstorm (alternativas exploradas):** grade livre × biblioteca × fluxo; layout em `pessoal` × tabela por widget × documento versionado; tabela de eventos × view × provedores; Timeline e Agenda como dois sistemas × Agenda como filtro; Captura direta × caixa de pendentes;
índice de busca central × provedores; espaço mínimo agora × só na Fase 8.

**Grill Me (lacunas encontradas e tratadas):**

| Lacuna | Tratamento |
|---|---|
| "Ocultar" e "desativar" ambíguos | N-18 |
| Página compartilhada vazando conteúdo por configuração ou título | N-19, N-20, S-1 |
| Layout diferente em cada dispositivo | N-05 (documento único + escala) |
| Exclusão acidental ao editar a tela | regra "o motor nunca escreve em tabela de negócio" + teste; histórico de 30 versões; arquivar antes de excluir |
| Dois aparelhos editando a mesma página | concorrência otimista por `versao` e refazer operações; escolha em conflito |
| Widget cujo tipo sumiu ou versão futura | cartão "indisponível" preservando configuração; "Atualize o app" |
| Último administrador sair do espaço | restrição no banco (sempre ≥ 1) |
| Membro removido continua vendo algo em cache | leitura sempre via RLS, "sem acesso" sem título; sem cache compartilhado |
| Eventos removidos ou atualizados na Timeline | leitura ao vivo; "removido ou sem acesso" |
| Duplicidade nota fiscal × compra na Timeline | `relacionados` e vínculos existentes |
| Captura enviada duas vezes (offline) | id no cliente, idempotência, `captura_id` no destino |
| Migração das tabelas legadas quebrar a Fernanda | Lote 8 isolado, por tabela, com rollback; N-13 |
| IA lendo dado de outro membro | P-1/P-5, teste de dois espaços |
| Geocodificação violando política do serviço | N-22 |
| Cadastro aberto transformando qualquer conta em "dono" | verificação antes do Lote 1; N-23 |
| Ambiguidade de quem é a regra de segurança | N-09: o banco decide, a tela só esconde |

## 4. O que fica explicitamente em aberto para o dono

Sem bloqueio para o Lote 1; decisões a tomar no momento certo:

1. **Barra do celular** (N-24): confirmar após o protótipo do Lote 2.
2. **Ordem entre o Lote 1 e as frentes paralelas** (migração de Compras/Carreira do `gmApi`; RAC Financeiro Inteligente).
3. **O que a Fernanda terá de personalização** no Lote 8 (hoje: nada muda).
4. **Nome visível** dos ambientes e da página padrão ("Minha Casa" × "Hoje") na interface.

## 5. Lote 1 (27/11/2026): Brainstorm, Grill Me e decisões de implementação

### 5.1 Como Brainstorm e Grill Me foram usados (e o que NÃO foi)
O skill de Grill Me do ambiente é **interativo** (entrevista o usuário em rodadas e espera as respostas), o que conflita com a política de autonomia do projeto para perguntas que o repositório e os Documentos 12 a 19 respondem. Por isso o **método** foi aplicado
(árvore de decisões, uma pergunta por ramo, resposta recomendada e verificação com evidência), mas **respondido pelo próprio agente com base no código, no banco de produção (leitura) e nos documentos aprovados**, sem entrevistar o dono; o skill interativo em si **não foi executado até o fim**,
e o Brainstorm foi feito do mesmo modo (alternativas comparadas por escrito). As decisões de produto aprovadas não foram reabertas. Cada lacuna abaixo virou **regra no banco ou na tela com teste**; as que dependem de decisão do dono ficaram na seção 4.

### 5.2 Brainstorm: alternativas comparadas
| Tema | Alternativas | Escolha e motivo |
|---|---|---|
| Modelo de identidade | (a) estender `membros` com mais papéis; (b) tabelas novas de espaço **sem** relação com `membros`; (c) tabelas novas **derivando** a casa legada de `membros` | **(c)**: não cria uma segunda fonte de verdade para "quem é da casa" (a) nem abandona o que funciona e é usado por todo o legado (b) |
| Participação na casa legada | copiar linhas de `membros` para `espaco_membros` (com gatilho ou na entrada) × derivar ao vivo | **derivar ao vivo**: sem sincronismo, sem acesso velho depois de tirar a linha (testado) |
| Quem grava espaços e participações | DML direto sob RLS × funções `security definer` como única porta | **funções**: promover, rebaixar e remover têm regras que o RLS por linha não expressa bem (administrador × administrador, proprietário intocável, não alterar o próprio papel) |
| Papéis | 3 (administrador, editor, visualizador) × 4 (proprietário, administrador, editor, leitor) | **4** (pedido do dono): o proprietário é o `dono` do espaço e não depende de uma linha apagável |
| Persistência da página | 1 documento por página × 1 linha por widget | **1 documento** (decisão N-04 mantida): gravação atômica, uma versão por salvamento, validação única |
| Concorrência | último a gravar vence × bloqueio × otimista por versão | **otimista por `versao`** com tentativa automática quando só mudou título/ordem e escolha explícita no conflito real |
| Histórico | tabela de versões × sem histórico | **30 últimas por gatilho**, só leitura para o site; restaurar abre a edição já com o layout antigo |
| Tabelas do Lote | as 8 do desenho (com `concessoes`, `espaco_modulos`, `usuario_prefs`) × só as com consumidor hoje | **5**: o resto entra com o primeiro consumidor |

### 5.3 Grill Me: perguntas, respostas e onde está a prova
| Pergunta | Resposta (regra) | Prova |
|---|---|---|
| Um usuário que perde acesso a um espaço? | Perde na **mesma leitura**: o acesso é calculado a cada consulta (membros ao vivo na Casa; linha explícita nos demais); preferências e páginas somem da vista e não se recria preferência | `espacos_sql`: "a participação vem de membros AO VIVO", "preferências pessoais… sem acesso", "removido" |
| Como impedir acesso a registros de outro proprietário? | Toda política usa `rac_pode_no_espaco` com `auth.uid()`; "sem acesso" = "não existe" (null) | `espacos_sql`: "isolamento" |
| Escalada de privilégio? | Nenhum DML direto em `espacos`/`espaco_membros`; funções recusam: auto-promoção, administrador sobre administrador, papel "proprietario", proprietário alvo | `espacos_sql`: "espaço compartilhado: papéis… ninguém se promove", "acesso direto" |
| Contas existentes? | Seed idempotente: 1 espaço pessoal por usuário e a Casa de cada dono com linhas em `membros`; nenhuma linha legada é tocada | `espacos_sql`: seed e compatibilidade; produção: 2 pessoais e 1 Casa |
| Preservar os registros da casa atual? | Nenhuma tabela legada, política ou tela muda; `dono_da_casa()` e `membros` ficam iguais | `espacos_sql`: "compatibilidade"; `tests/rotas.test.mjs` (Fernanda igual) |
| Personalização alterando dado de negócio? | O motor só tem operações de layout; o banco só tem tabelas `workspace_*` aqui; a tela não escreve fora delas | `workspace_nucleo` (sem acesso a banco), `workspace_tela` (escritas só em `workspace_*`), `espacos_sql` (texto da migration) |
| Widgets que deixam de existir? | Cartão "indisponível"; a configuração fica no layout e sobrevive a salvar; versão futura é só mostrada | `workspace_nucleo` (wsVisao, wsMigrar), `workspace_tela` (tipo que sumiu) |
| Layouts incompatíveis com versões novas? | `schema` do documento e `v` de cada instância; documento de versão **mais nova** não é tocado nem gravado | `workspace_nucleo` (migrações) |
| Páginas duplicadas? | Índice único por espaço (`lower(btrim(titulo))`, só ativas) e a mesma regra na tela; ids de cliente em instâncias | `espacos_sql`, `workspace_nucleo` (wsTituloOk), `workspace_tela` |
| Exclusão de um espaço? | **Não existe exclusão por função**: arquivar (só o proprietário; nunca o pessoal nem a Casa) deixa só leitura; página só se exclui depois de arquivada e por administração | `espacos_sql`: "arquivar espaço" |
| Usuário em mais de um espaço? | Suportado: seletor de espaço, contexto sempre visível; cada espaço tem suas páginas e a pessoa, as suas preferências | `workspace_tela` (seletor), `espacos_sql` |
| Páginas compartilhadas? | Layout é do espaço; "ocultar só para mim" e "página inicial" são por pessoa; tipo privado não entra | `espacos_sql` (preferências), `workspace_tela` (leitor e Agenda bloqueada) |
| Preferências pessoais sobrescritas? | Tabela própria por `(user_id, pagina_id)`; salvar layout não toca nelas; ninguém lê nem escreve a de outro | `espacos_sql`: "preferências pessoais" |
| Isolamento em chamadas diretas à API e RPC? | `anon` sem privilégio em tabelas e funções; cada função confere login e MFA; hashes das 14 funções em produção iguais aos do arquivo | `espacos_sql`: "acesso direto" e "MFA"; `tests/banco.test.mjs` (real); conferência 070 |
| Falha de interface virando acesso indevido? | A tela só esconde; o banco recusa mesmo se a tela errar (os testes de banco não passam pela tela) | `espacos_sql` inteiro |

### 5.4 Decisões de implementação (Lote 1)
- **N-25 · Papéis:** proprietário (o dono do espaço), administrador, editor e leitor. Refina N-04/N-09; substitui o nome "visualizador" dos Documentos 14 e 16.
- **N-26 · Casa legada derivada de `membros` ao vivo** (`espacos.casa_de`); a Fernanda é editora enquanto tiver a linha. Substitui a ideia de "seed copiando membros".
- **N-27 · Espaços e participações só mudam por funções** `rac_*`, todas com login e MFA; o site não tem DML direto nessas tabelas.
- **N-28 · Tabelas adiadas** (`concessoes`, `espaco_modulos`, `usuario_prefs`) até haver consumidor.
- **N-29 · Backup:** `espacos`, `espaco_membros`, `workspace_paginas` e `workspace_pessoal` só **exportam** (`so:"exportar"`); o histórico de versões fica fora; restaurar espaços e permissões não é feito por backup.
- **N-30 · Conflito de edição:** otimista por `versao`; tentativa automática se só título/ordem mudaram; senão o usuário escolhe entre repetir as operações sobre a versão nova ou usar a do outro aparelho.
- **N-31 · Exclusão:** nada se apaga por função de espaço; página: arquivar antes de excluir, e excluir só por administração. `espacos.dono` e `criado_por` com `on delete restrict`.
- **N-32 · Ocultar:** no modo de edição afeta o layout; fora dele, "ocultar só para mim" é por pessoa (também para o leitor). Recolher seção na vista é local do aparelho.
- **N-33 · Cadastro público desativado** (informação confirmada pelo dono em 27/11/2026): sem convite por e-mail neste lote; participantes entram por `user_id`.
- **N-34 · Rota `#workspace` só do dono**; a experiência da Fernanda não muda (regra N-13).
- **N-35 · Limites de configuração:** 3000 caracteres no navegador contra 4096 bytes no banco, para o que passa no navegador sempre passar no banco.

### 5.5 Riscos residuais e acompanhamento
| Risco | Situação | Onde acompanhar |
|---|---|---|
| O `PAPEL` fixo do cliente ainda existe no legado | os widgets novos dependem só do RLS; remoção no Lote 8 | Lote 8 |
| Tela de membros e convite por e-mail não existem | participantes só por função/SQL com `user_id` | Lote 8 |
| Arrastar com toque no iPhone (toque longo de 350 ms) não foi validado em aparelho real | alternativa por menu e setas existe e está testada | validação do dono no iPhone (pendência) |
| Remover um usuário que é proprietário de espaço é recusado pelo banco | por desenho; precisa mover ou arquivar antes | Lote 8 (transferência de propriedade) |
| Widgets dos módulos ainda não existem | só 4 de referência | Lote 2 |
| `public.rls_auto_enable()` executável por `anon` (achado pré-existente dos advisors) | não é do RAC nem foi alterado; vale conferir | acompanhamento de segurança |
