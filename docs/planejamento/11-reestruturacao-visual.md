# 11 · Reestruturação visual: o Hoje como tela inicial do dono

Estado: **desenho aprovado pelo dono em 22/11/2026; Lote 1 mesclado na `main` em 22/11/2026 (PR #71; Testes e deploy do Pages com sucesso; conferência no iPhone pendente do dono), lote 2 (MBA, Últimas compras e último treino no Hoje) mesclado em 22/11/2026 (PR #73; Testes e deploy do Pages com sucesso; conferência no iPhone pendente do dono) e lote 3 (botão + contextual) mesclado em 22/11/2026 (PR #75; Testes e deploy do Pages com sucesso; conferência no iPhone pendente do dono) (seção 8). **Lote 4** (seções 9 e 10): aprovado pelo dono em 22/11/2026, em implementação na branch. Lotes 2 e 3 não iniciados.**

## 1. Intenção e motivo

O dono (papel dono) pediu que o RAC fique mais efetivo no dia a dia. A tela inicial atual ("Início") acumulou cartões que ele não usa
(ouvir, resumo do dia, aniversários, conexões do dia, agenda vazia). O **RAC Hoje** já é mais interativo e útil e passa a ser a abertura.
O foco atual do dono é o MBA e a área de dados (aulas, avaliações, estudos de SQL), as últimas compras (que a Fernanda também usa),
a saúde e o Garmin, os e-mails, a newsletter, o resumo de esportes e as notícias de Sorocaba.

Critério de qualidade fixado para a tela inicial: **só entra o que tem prazo, ação ou dado novo para o dono.**

## 2. Metas, não metas e anti-metas

Metas
- O app do dono **abre no Hoje**; o Início antigo **sai do menu** (decisão do dono, 22/11/2026).
- O Hoje mostra, nesta ordem: faixa fina de gastos do mês → MBA e estudos → Últimas compras → Saúde/Garmin → E-mails → Newsletter
  (com "atualizada às HH:MM") → Esportes (times, resumo e manchetes) → Sorocaba (manchetes e tempo).
- O botão **+** abre as ações da própria tela do dono (Compras: nota e produto; Saúde: métrica; Hoje: item na lista de compras,
  lembrete com data e gasto). Tela sem ação útil não mostra o botão.
- Barra inferior do celular: Hoje, MBA, Saúde, Compras, Inbox + Menu. A Agenda sai da barra e continua no menu.

Não metas
- Nenhum módulo é escondido ou removido (decisão Q7). A rota `#inicio` continua existindo (links antigos não quebram), só sai do menu.
- Horário da newsletter e e-mails externos das 6h/9h: **fora desta entrega** (o RAC não envia e-mail; o dono decidiu não tratar agora).
- Sem SQL, sem Edge Function, sem secrets, sem IA paga.

Anti-metas (falha mesmo que "funcione")
- Mudar o que a Fernanda (papel casa) vê ou faz, inclusive o **+** dela.
- Novo cartão sem estado vazio, sem fonte de dados declarada ou sem dica de valor nos gráficos.
- Chamada de IA automática no Hoje.

## 3. Restrições (CLAUDE.md e fatos verificados em 22/11/2026)

- JavaScript ES5 puro, sem framework, sem build, sem dependência nova; nomes globais únicos (`tests/estrutura.test.mjs`); gráfico novo com `racDica`.
- Fernanda: o Início não tem `casa:true` e ela cai em `mercado` (`js/app.js`, rota padrão). A mudança de abertura do dono não a atinge.
- A abertura do dono está fixa em `"inicio"` em quatro pontos de `js/app.js` (captura, rota padrão, botão Início, volta ao pai).
- O "já feito" do MBA já existe (`PESSOAL.mbaFeito`, `mbaMarcar`): sem tabela nova.
- O mapa do Garmin usa Leaflet por CDN só na tela do treino; o Hoje **não** carrega o mapa (toque abre o treino).
- `garmin` (Edge Function) é intocável; o Hoje só lê dados que já existem.
- E-mails no Hoje dependem do que o Inbox já tem em cache; as mudanças do Gmail/Outlook (lotes 2 a 4 do Inbox) ainda **não estão publicadas**.
- `VERSAO` (sw.js) e `MOD_VERSAO` (js/app.js) trocadas juntas; testes de rotas e do design system comparam menu e barra com o registro
  e serão atualizados de propósito.

## 4. Abordagens consideradas

| | O que é | Prós | Contras |
|---|---|---|---|
| A | Reescrever o Hoje do zero | Visual limpo | Mais caro, mais risco de regressão |
| B | Mover os cartões do Início para o Hoje | Mais rápido | Estilos diferentes (`wCard` × kit): cara de remendo |
| **C (escolhida)** | Híbrida: o Hoje mantém o kit; cada bloco é uma função pequena com fonte e estado vazio declarados; reaproveita fontes (`fonte-mba`, `fonte-saude`, `fonte-newsletter`), o cartão de e-mail e as notícias de Sorocaba, redesenhando só a apresentação | Menos código novo, visual coerente | Exige um adaptador por bloco |

Escolha do arquiteto (a pedido do dono: "traga a forma mais otimizada"). Aprovação do dono: pendente.

## 5. Desenho e lotes

Lote único de regras: cada lote é uma branch `claude/*`, testes do módulo durante o trabalho e suíte completa só na preparação da publicação.
Merge e publicação só com autorização do dono.

1. **Estrutura.** Abertura do dono no Hoje (os quatro pontos de `js/app.js`); Início com `grupo:null` no registro; barra nova pelo
   registro (`curto`/`barra`: entra MBA, sai Agenda); blocos Sorocaba, Esportes, Newsletter e E-mails; faixa fina de gastos.
   A linha "Sorocaba" do Hoje, que hoje aponta para `#inicio`, passa a abrir o destino próprio.
2. **Blocos de dados.** MBA (aula ao vivo/próxima com Assistir, avaliações pendentes com "já respondi", próximo boleto, "Onde parei"
   com Continuar, alerta de atraso), Últimas compras (5 notas: loja, valor, data, quem lançou; gasto do mês) e Saúde (última atividade,
   prontidão do dia, semana de treinos; sem mapa no Hoje).
3. **Botão + contextual.** Cada rota declara `acoes` no registro; o dono recebe as ações da tela e a Fernanda mantém a folha
   "Anotar rápido" atual. Sem ação, sem botão.

## 6. O que fica para quem construir

- Os detalhes de cada adaptador de bloco e a ordem interna dos testes.
- Confirmar, no lote 2, quais dados de compras e de Saúde o Hoje já recebe e quais exigem leitura nova (somente leitura).
- Se o lote 2 exigir **tabela nova** (hoje não se espera), parar e consultar o dono: SQL em produção é decisão dele.

## 7. Pendências do dono

- Newsletter (horário) e e-mails externos: decididos como fora de escopo por ora.

## 8. Plano do Lote 1 (Estrutura)

Desenho **aprovado pelo dono em 22/11/2026**, com autorização para o desenvolvimento completo do lote, inclusive merge (o Lote 1 não
precisa de SQL, função nem banco). Execução nativa, na branch `claude/peaceful-hopper-84odeu`; merge só com as condições do CLAUDE.md
(CI do commit atual verde, sem conflito, dentro do escopo, sem tocar `.claude/` nem workflows).

Restrições globais: ES5 puro; nomes globais únicos (`tests/estrutura.test.mjs`); cor só por token em `css/rac.css`; `VERSAO` (sw.js) e
`MOD_VERSAO` (js/app.js) trocadas juntas; a Fernanda não muda.

Pontos de atenção (o que mais pode dar errado): (a) a casa nunca pode cair no Hoje; (b) `#inicio` digitado à mão continua abrindo o
Início; (c) newsletter sem dados não mostra "novos"; (d) um bloco que falha não derruba os outros; (e) sem rede, cada bloco mostra o seu
estado vazio.

### Tarefa 1 · Abertura do dono no Hoje
- Arquivos: `js/app.js` (função `route`: captura, rota padrão, botão Início, volta ao pai), `js/rotas.js` (Início com `grupo:null`),
  `index.html` (logo e `#homebtn` apontam para `#rachoje`), `tests/rotas.test.mjs`.
- Interface nova: `rotaInicial()` em `js/app.js`, devolve `"rachoje"` para o dono e `"inicio"` para os demais (a casa continua sendo
  levada ao Mercado pela regra de `DA_CASA`).
- Testes primeiro: dono em `""`, `#`, `#inexistente` e `#captura` abre o Hoje; casa nos mesmos casos abre o Mercado; dono em `#inicio`
  ainda abre o Início; no Hoje o botão Início fica escondido e, no Início, a volta vai para `#rachoje`; o menu não tem mais o Início
  (26 itens) e a lista de rotas sem grupo passa a incluir `inicio`.

### Tarefa 2 · Newsletter com selo de hora e "novos"
- Arquivos: `nucleo.js` (`nlNovos`), `js/newsletter.js` (`wNewsletter` e abertura da página), `tests/nucleo.test.mjs`.
- Interface nova: `NUCLEO.nlNovos(destaques, desdeMs)` devolve o número de destaques com data posterior a `desdeMs`; `0` se a lista for
  vazia ou `desdeMs` inválido. A hora da última visita à página da Newsletter fica em `localStorage` (conveniência do aparelho, dentro
  de `try/catch`); o selo mostra "atualizada às HH:MM" (campo `coletado` do arquivo) e "N novos".
- Testes primeiro: lista vazia, sem visita anterior, com e sem destaques novos, data inválida.

### Tarefa 3 · Hoje: faixa fina e blocos E-mails, Newsletter, Esportes e Sorocaba
- Arquivos: `js/hoje.js` (`hjDesenhar`, nova `hjFaixa`, nova `hjBlocosDia`; sai `hjCardContexto`, que repete o que os blocos mostram),
  `js/app.js` (`wCard` deixa recolher também no Hoje), `css/rac.css` (`.rh-faixa`, `.rh-blocos`), `tests/hoje.test.mjs`.
- Ordem na tela: abertura → faixa → Prioridades e Gastos → Saúde → **E-mails → Newsletter → Esportes → Sorocaba** → análise da IA →
  histórico e fontes. Os blocos reaproveitam `wEmail`, `wNewsletter`, `wEsportes` e `wNoticias`, carregados por `wLazy`; nenhum chama IA.
- `HJ_DESTINO.noticias` deixa de apontar para `#inicio` e passa a apontar para `#rachoje`.
- Testes primeiro: a ordem dos blocos em `hjDesenhar`; a faixa traz atenção, gasto e prontidão; nenhum bloco novo chama `racIA`.

### Tarefa 4 · Barra de baixo
- Arquivos: `js/rotas.js` (`curto`/`barra`: Hoje 1, MBA 2, Saúde 3, Compras 4, Inbox 5; a Agenda perde o `curto`),
  `tests/design_system.test.mjs` (a lista esperada da barra).

### Tarefa 5 · Versão, documentos, conhecimento e entrega
- `VERSAO` e `MOD_VERSAO` trocadas juntas; `docs/hoje.md`, `docs/mapa.md`, `docs/planejamento/historico-diario.md` e
  `docs/planejamento/07-decisoes-e-pendencias.md` atualizados; RAC Knowledge (decisão e estado) com `indice` e `verificar`.
- Verificação: `bash scripts/nuvem_testes.sh` (suíte completa) passando; depois commit, push, PR, CI verde e merge; conferir o CI da
  `main` e a versão realmente publicada. Planejado não é registrado como concluído.

## 9. Lote 4 · Hoje mais direto e mais inteligente (desenho proposto em 22/11/2026, **aguardando aprovação do dono**)

Origem: o dono conferiu o Hoje no iPhone (22/11/2026) e pediu: os "5 itens no total" não mostram quais são; os botões Reler as fontes e Custos de IA são grandes e mal colocados; a IA pode ser chamada com mais frequência para deixar a tela mais inteligente; o "O que mudou desde ontem" deve subir e ter mais destaque, com ideias novas. Perguntas e respostas: rodadas Q1 a Q7 do chat de 22/11/2026.

### 9.1 O que o dono decidiu
- **Itens do dia:** os 3 mais importantes ficam logo abaixo do "Bom dia", cada um tocável e levando ao módulo; "ver todos" abre o resto no mesmo lugar. O cartão "Prioridades do dia" de baixo deixa de existir (as regras de prioridade não mudam).
- **Botões:** "Reler as fontes" vira um ícone ↻ pequeno na abertura; "Custos de IA" vira um link pequeno dentro do cartão da análise de IA.
- **O que mudou desde ontem:** sobe para logo abaixo do resumo, em destaque, com cada linha tocável (5 linhas e "ver mais"). Inclui: prontidão que mudou, compras de ontem (notas, lojas e total), MBA, resultado de ontem dos times e o treino de ontem com distância e tempo; mantém vagas novas e Newsletter. **Sem** e-mails (o Inbox já está na barra) e **sem** Sorocaba (já tem bloco próprio).
- **IA:** **2 chamadas por dia** (correção do dono: não 3), automáticas, no RAC Hoje. Mostra no topo um **resumo curto** (2 a 3 frases, o campo "Resumo" da análise atual, com fatos citados) e o link "ver análise completa". As **perguntas** continuam manuais, com confirmação (cada pergunta é uma cobrança nova).
- **Ordem da tela:** abertura; resumo da IA e itens do dia; o que mudou; faixa de indicadores; MBA e Últimas compras; Saúde e Gastos; E-mails, Newsletter, Esportes e Sorocaba; análise completa, pergunta, histórico e fontes.

### 9.2 Custo e autorização (decisão de dinheiro, só do dono)
- Cada análise: ~US$ 0,026 (R$ 0,17) no típico, no máximo ~US$ 0,06 (R$ 0,40). Com 2 por dia: ~US$ 1,6 por mês no típico (~23% do teto interno de US$ 6,70) e no máximo ~US$ 3,6 por mês (~54%). O teto é **compartilhado** com a Newsletter e com perguntas e leituras de nota; o consumo real deste mês não pôde ser conferido nesta sessão (conexão com o Supabase falhou).
- **Autorização:** o dono pediu "2 chamadas no dia" (22/11/2026). Este desenho trata isso como autorização para **até 2 chamadas pagas automáticas por dia** do RAC Hoje, **sujeita à sua aprovação deste documento**. Ela vira **exceção** à regra "RAC Hoje nunca automático" (CLAUDE.md, seção IA, e o registro do RAC Knowledge sobre o RAC Hoje), a ser atualizada com a mesma exceção que já existe para o resumo da Newsletter.
- **Travas (todas já existem ou são só do site):** só o dono; só REAL, nunca demonstração; nunca repete depois de erro; respeita o teto do mês (sem reserva, não chama); a mesma análise para os mesmos dados nunca é paga duas vezes (cache e chave); **limite de 2 por dia contado no servidor** (as chamadas do dia no registro de custos), para que dois aparelhos não somem 4.

### 9.3 Minhas escolhas (o dono ainda não respondeu; vale corrigir)
1. **Quando:** a 1ª abertura (ou volta ao app) de cada uma de **duas janelas**, com o app aberto: **a partir das 6h** e **a partir das 14h**, horário de Brasília (decisão do dono, 22/11/2026; antes eu propunha 6h e 18h). Antes das 6h não há chamada automática. Se não abrir o app no turno, não gasta; se os dados não mudaram, não gasta. (Alternativa descartada: rotina no servidor em horários fixos, como a Newsletter; exigiria função e agendamento novos no Supabase, que dependem de SQL e publicação com autorização, e gasta também nos dias sem uso.)
2. **Interruptor, desligado por padrão:** um botão "Análise automática: desligada/ligada" no cartão da IA, guardado **na conta do dono** (PESSOAL, que já existe e entra no backup, sem SQL), para que desligar num aparelho desligue em todos (trava de gasto). Ligar mostra o aviso do custo e pede uma confirmação. A chamada automática só acontece depois que o **dono ligar**, o que torna a autorização explícita no momento do gasto.
3. **Sem mudar a Edge Function:** a ação `hoje.analise` e o contrato da IA ficam como estão. O resumo do topo é o campo "Resumo" já devolvido. Se a contagem de 2 por dia exigir algo no banco ou na função, eu paro e consulto o dono.
4. **Enquanto a análise do dia não existe ou falhou:** o topo mostra o resumo por regras de hoje, com selo "analisando…" ou o aviso do erro, sem tentar de novo.
5. **Esportes no "O que mudou":** só aparece se o dado de ontem estiver disponível pelo que o bloco de Esportes já lê; sem dado, a linha não aparece (não invento).

### 9.4 Metas, não metas e anti-metas
- Metas: o que o dono pediu acima; cada linha de item e de mudança tocável; tela mais curta sem perder informação.
- Não metas: Fernanda não muda; e-mails e Sorocaba fora do "O que mudou"; sem SQL, função, secret ou mudança de limite de IA sem autorização; sem coluna de quem lançou a compra.
- Anti-metas: chamada paga que o dono não ligou; mais de 2 por dia; repetir depois de erro; análise simulada passando por real; perder as regras de prioridade ao tirar o cartão.

### 9.5 Tarefas (execução nativa, um lote; PR próprio, testes e merge conforme o CLAUDE.md)
1. **Abertura e itens do dia:** ícone ↻ pequeno; os 3 itens tocáveis com "ver todos" no mesmo lugar; remover o cartão Prioridades; "Custos de IA" no cartão da IA (js/hoje.js, css/rac.css, tests/hoje.test.mjs).
2. **O que mudou:** subir, destacar e ampliar com prontidão, compras de ontem, MBA, esportes e treino de ontem; linhas tocáveis (nucleo.js com testes; js/hoje.js).
3. **IA automática:** interruptor, regra dos turnos, limite de 2 por dia no servidor, resumo no topo e estados de espera e de erro; sem mudar a função (js/hoje.js, nucleo.js com testes).
4. **Regra e documentos:** atualizar CLAUDE.md (exceção da IA do Hoje), o registro do RAC Knowledge sobre o RAC Hoje, docs/hoje.md, docs/rac-intelligence.md e o histórico diário; versão trocada.

A chamada automática **não será ligada** até este desenho estar aprovado, mesclado e o dono ligar o interruptor.

### 9.6 Decisões do dono depois do desenho (22/11/2026) e forma de entrega
- **Autorização expressa:** "Autorizo" (2 chamadas pagas automáticas por dia do RAC Hoje; "2 chamadas no dia"); janelas "às 6h e às 14h com o app aberto"; interruptor desligado por padrão: "ok".
- **Entrega: alternativa A, um PR só** (a minha recomendação era dois PRs; o dono escolheu um). Como a IA automática vai no mesmo PR da tela, ela **só pode estar desligada por padrão**: publicar o PR não gasta nada; só o dono, ao ligar o interruptor, autoriza o gasto no aparelho dele.
- **Reforços de segurança que eu mantenho (minhas escolhas):** a marca "esta janela já rodou" é gravada **antes** de chamar (um erro nunca provoca nova tentativa); contagem de chamadas do dia no servidor antes de cada chamada (view ia_custos, funcionalidade "hoje"; conta qualquer chamada do Hoje, manual ou automática, o que é conservador); verificação da tela em Chromium de verdade, no tamanho do iPhone, com dados de mentira, antes do PR; plano de volta: desligar o interruptor, ou um PR de reversão.
- **O que mudou, por fonte:** prontidão (função pura sobre os dias do relógio); compras de ontem (a mesma leitura das Últimas compras); MBA (aulas para assistir e a próxima avaliação, do mesmo cálculo do bloco do MBA); treino de ontem (a mesma leitura do último treino); resultado dos times (um gancho no bloco de Esportes, que já calcula o último jogo de cada time). **Nada disso entra no pacote de fatos da IA**: o pacote e a validação da IA ficam exatamente como estão (são linhas só de exibição).

## 10. Plano do Lote 4 (execução nativa, um PR)

Restrições globais: ES5; nomes globais únicos; cor só por token; `VERSAO` e `MOD_VERSAO` trocadas juntas; Fernanda não muda; **nenhuma chamada paga é feita por mim**; Node 24 pelo script de testes.

1. **Núcleo, com testes (nucleo.js):** `hojeIaJanela(agoraMs)` devolve o dia e a janela ("manha" de 6h a 13h59, "tarde" a partir das 14h, nada antes das 6h); `hojeIaAutoPode(o)` decide se a chamada automática pode sair (interruptor, janela, marca local, contagem do servidor menor que 2, sem chamada em voo, sem análise igual já feita, sem erro anterior na janela) e diz o motivo; `hojeMudouProntidao(dias, hoje)`. Testes: todas as combinações, e os cenários de repetição (reabrir várias vezes, falha, dois aparelhos, antes das 6h, virada do dia).
2. **Tela (js/hoje.js, css/rac.css):** abertura com ↻ pequeno e sem os botões grandes; itens do dia (3 + "ver todos" no mesmo lugar, tocáveis) no lugar do cartão Prioridades; cartão "O que mudou desde ontem" logo abaixo (5 linhas + "ver mais", tocáveis; linhas por regra mais as de exibição `hjMudouAdd` das fontes); ordem final da tela; "Custos de IA" como link no cartão da IA. Ganchos: `wMbaHoje` (js/mba.js), `hjUltimasCompras`, `hjUltimoTreino` e `wEsportes` (js/app.js) chamam `hjMudouAdd`.
3. **IA automática (js/hoje.js):** interruptor em PESSOAL (desligado por padrão, com aviso de custo e confirmação ao ligar); portão `hjAutoTentar` depois de carregar a tela e ao voltar ao app; marca antes de chamar; contagem no servidor; usa o mesmo `hjAnalisar` de hoje (mesmo cache, chave e travas); resumo da IA no topo (campo "Resumo") com selo "analisando…" e aviso de erro, sem repetir.
4. **Testes existentes:** os do Hoje que citam "Prioridades do dia" e "Reler as fontes" são atualizados de propósito.
5. **Regra e documentos:** CLAUDE.md (seção IA: exceção do RAC Hoje, 2 por dia, 6h e 14h, interruptor), registro do RAC Knowledge sobre o RAC Hoje (nova decisão que cita a anterior), docs/hoje.md, docs/rac-intelligence.md, histórico diário e versão.
6. **Verificação:** capturas do Hoje no tamanho do iPhone (Chromium com Supabase de mentira); suíte completa; PR; CI; merge; conferir o CI da `main` e o Pages.
