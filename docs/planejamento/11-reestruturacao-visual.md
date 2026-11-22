# 11 · Reestruturação visual: o Hoje como tela inicial do dono

Estado: **desenho aprovado pelo dono em 22/11/2026; Lote 1 mesclado na `main` em 22/11/2026 (PR #71; Testes e deploy do Pages com sucesso; conferência no iPhone pendente do dono), lotes 2 e 3 não iniciados (seção 8). Lotes 2 e 3 não iniciados.**

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
