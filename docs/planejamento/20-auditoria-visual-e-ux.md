# RAC · 20 · Auditoria visual, padrão de UX e validação visual (adendo ao Lote 1, 27/11/2026)

Adendo de produto do dono ao Lote 1: **qualidade visual e de experiência passa a ser critério de conclusão**, ao lado da qualidade funcional e da técnica. Este documento registra a **auditoria visual**
do que existe, os **princípios** do padrão visual do novo RAC, as **decisões** (Brainstorm e Grill Me), o que foi **implementado no Workspace**, a **validação medida** e a **lista de consolidação** do que fica para os próximos lotes.
Convenções [Fato] / [Hipótese] / [Recomendação]: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto). Decisões `N-xx`: [Registro](19-registro-de-decisoes.md#6-adendo-do-lote-1-padrão-visual-e-de-ux).

## 1. Critério permanente

Toda funcionalidade relevante só está **concluída** quando atende às três dimensões: **funcional** (faz o que a especificação pede), **técnica** (testada, segura, mantível) e **visual e de experiência** (hierarquia clara, composição coerente com o resto do RAC, estados bem
desenhados, funciona em desktop, tablet e celular, tema claro e escuro com a mesma qualidade). A validação visual (capturas, medições e correções) faz parte do relatório do lote. As referências do dono orientam **princípios de composição**, não são copiadas.
Registrado como regra permanente em `CLAUDE.md` ("Qualidade visual e UX") e no RAC Knowledge.

## 2. Auditoria do Design System e da interface [Fato, conferido no código e em capturas de tela]

As capturas abaixo foram tiradas no Chromium com dados vazios (sem login e sem rede de fora): servem para avaliar **estrutura e linguagem visual**, não o conteúdo de cada módulo.

![RAC Hoje, computador, tema claro](img/auditoria-rac-hoje-computador-claro.png)
![Página de componentes do Design System](img/auditoria-componentes-computador-claro.png)
![Lista de compras (padrão antigo), computador, tema claro](img/auditoria-lista-computador-claro.png)
![RAC Hoje, celular](img/auditoria-rac-hoje-celular-claro.png)

| Aspecto | Achado | Avaliação |
|---|---|---|
| **Identidade** | Tela de fundo em degradê azul-marinho, menu lateral em cartão branco, **faixa azul** (`rh-hero`) com título e resumo, cartões claros de cantos arredondados, rótulos em caixa alta, selos de estado com ícone e palavra. Tipografia com peso forte nos títulos. | Forte e reconhecível: **é a base a preservar** |
| **Tokens** | 69 tokens `--rac-*` (cores semânticas, papel, tipografia, espaçamento de 4 a 48 px, raios, sombras, camadas) com tema escuro real (`data-theme="dark"`) | Bom. Há uma **segunda cópia** de tokens antigos em `index.html` (inconsistência técnica, sem efeito visual) |
| **Componentes novos** (`rk*`, `rac-*`) | Botões (`pri`, `sec`, `ter`, `perigo`, `icone`, `fantasma`), cartão, KPI, selo, alerta, estado (carregando, vazio, erro), chip, medidor, lista | Coerentes entre si e com o tema escuro |
| **Telas no padrão novo** | RAC Hoje, Agenda, Saúde, Inbox, página de componentes | Hierarquia clara: faixa → indicadores → cartões |
| **Telas no padrão antigo** (`panel()`, `wCard()`, `ghostbtn`) | Lista, Família, Veículos, Documentos, Central de Compras (partes), Carreira | **Inconsistência principal**: botões achatados, abas de largura total, títulos de painel sem hierarquia, estados vazios só em texto, sem faixa de abertura |
| **Navegação** | Menu lateral por 6 áreas (desktop), barra inferior com 5 atalhos (celular), barra de título com voltar, atualizar, início e data | Consistente entre telas; o rótulo da área e o ícone mudam por página |
| **Cartões e painéis** | Cartão novo (`rac-card`): raio 20 px, sombra suave, cabeçalho com ação; painel antigo: mais plano, padding diferente | Dois idiomas convivendo |
| **Estados** | Padrão novo (`rkEstado`): esqueleto de carregamento, vazio e erro com ação; padrão antigo: parágrafo "Carregando…" | Parcialmente padronizado |
| **Responsivo** | Quebras em 860, 1100/1180 px, barra inferior abaixo de 861 px, alvos de 44 px (`--rac-alvo`) | Bom; sem rolagem lateral nas telas novas |
| **Tema escuro** | Tokens próprios; o padrão é o claro (por decisão da Fase 3); o escuro é "funcional" | Qualidade equivalente **nas telas novas**; telas antigas têm trechos com cor fixa |

**Conclusão da auditoria:** o RAC já tem uma linguagem visual profissional (a do RAC Hoje e do Design System), mas ela cobre **parte** do produto. O que dá a impressão de "ferramentas feitas aos poucos" é a convivência com o padrão antigo e a falta de um
**contêiner e uma linguagem de edição** para o que o usuário monta. A decisão foi **não reconstruir** o visual (N-12 mantida) e sim: (1) construir o Workspace **inteiro no padrão novo**, (2) medir o resultado e (3) listar a consolidação do resto (seção 8).

## 3. Princípios do padrão visual do novo RAC [Recomendação aprovada para os próximos lotes]

1. **Uma faixa de abertura por página** (azul do Design System): diz onde a pessoa está e oferece a ação principal.
2. **Um cartão tem uma finalidade**: título curto, conteúdo, ação; no máximo uma ação principal por cartão.
3. **Hierarquia por tamanho e peso, não por cor**: título de página > título de cartão > rótulo em caixa alta > legenda; a cor semântica (verde, âmbar, vermelho, azul) só significa estado.
4. **Espaçamento em múltiplos dos tokens** (`--rac-esp-*`); nada de margem solta.
5. **Pouco chrome**: controles de edição aparecem só no modo de edição; no modo ver, a tela é conteúdo.
6. **Todo estado tem desenho**: carregando (esqueleto), vazio (ícone, explicação e ação), parcial, erro (com "tentar de novo"), sucesso (aviso que some sozinho).
7. **Alvos de toque de 44 px e foco visível** em tudo que se toca; alternativa por teclado e por menu para qualquer gesto.
8. **Tema claro e escuro pelos mesmos tokens**: nenhuma cor escrita fora de variável (já há teste); contraste medido, não presumido.
9. **O celular é o caso principal**: o desenho nasce de 390 px e cresce; o que não cabe vai para o menu ⋯.
10. **Feedback imediato**: o que se move tem fantasma, indicador de destino e rótulo do tamanho; o que se salva diz que salvou.

## 4. Brainstorm: alternativas para a experiência de personalização

| Alternativa | Vantagens | Problemas | Decisão |
|---|---|---|---|
| A. Botões de edição fixos em cada cartão, sempre visíveis | Descobrível | Polui a tela no modo ver; conteúdo e controle misturados | Rejeitada |
| B. Botão flutuante único (FAB) com menu | Pouco chrome | Esconde as ações principais; fácil de errar no celular; conflita com a barra inferior | Rejeitada |
| C. **Barra fixa no topo só no modo personalizar** + controles contextuais só nos componentes em edição | Modo ver limpo; ações principais sempre à vista; cabe em 390 px | Ocupa altura (≈110 px no celular) | **Escolhida (N-36)** |
| D. Editor em tela cheia separado | Foco total | Perde o contexto; mais uma página para manter | Rejeitada |
| Catálogo: lista simples × **cartões com ícone, descrição, tamanho e motivo de bloqueio, em folha** | O usuário entende o que cada um faz e por que não pode | Um pouco mais alto | **Cartões em folha (N-37)** |
| Mover: só arrastar × arrastar **com fantasma e indicador** + setas + menu | Acessível; descobre pelo feedback | Mais código | **Todos (N-38)** |

## 5. Grill Me (perguntas do adendo, respondidas com evidência)

| Pergunta | Resposta | Evidência |
|---|---|---|
| A hierarquia da tela está clara? | Faixa → abas → seções (rótulo em caixa alta) → cartões; no personalizar, a barra fixa é a única coisa "de controle" no topo | capturas da seção 6 |
| Há controles demais? | Eram 7 botões iguais na barra; agora **5** (desfazer, refazer, adicionar, cancelar, concluir) e o resto (+ seção, histórico) no menu ⋯ | `tests/workspace_visual.test.mjs` mede os alvos |
| Funciona em telas pequenas? | Sim: 390 px sem rolagem lateral, barra em duas linhas, desfazer/refazer/adicionar só com ícone, catálogo em folha de baixo | `workspace_visual` em 390 px |
| Há informação redundante? | O título da página estava duas vezes; o contador de alterações some abaixo de 520 px; o tamanho é um chip `4/12`, não um texto longo | capturas |
| O modo de edição é intuitivo? | O modo é anunciado ("Personalizando" em selo âmbar), cada componente ganha alça, tamanho, menu e canto de redimensionar, e o conteúdo continua legível | capturas; `workspace_tela` |
| O usuário entende o que pode mover ou configurar? | Alça ⠿ com dica, contorno tracejado só no modo personalizar, `⋯` com o que dá para fazer, cursor de arrastar | capturas |
| O sistema dá feedback? | Fantasma e barra de destino ao arrastar; rótulo "6 de 12 colunas · altura média" ao redimensionar; aviso "Salvo" que some; erro que fica; desfazer/refazer | captura "arrastando"; testes de tela |
| A experiência é consistente com os outros módulos? | O Workspace usa só componentes do Design System (faixa, `rkBtn`, `rkSelo`, `rkEstado`, tokens, tema escuro); as telas antigas não foram tocadas | seção 2 |

## 6. O que foi feito no Workspace (antes e depois)

**Antes** (primeira versão do Lote 1, só funcional): botões brancos soltos em várias linhas, abas improvisadas, conteúdo esmaecido na edição, catálogo em lista apertada, avisos que empurravam a página.

![Antes: personalizar, computador](img/lote1-ANTES-personalizar-computador.png)
![Antes: personalizar, celular](img/lote1-ANTES-personalizar-celular.png)

**Depois:**

| Modo | Computador | Tablet | Celular |
|---|---|---|---|
| Ver, claro | ![](img/lote1-ver-computador-claro.png) | ![](img/lote1-ver-tablet-claro.png) | ![](img/lote1-ver-celular-claro.png) |
| Ver, escuro | ![](img/lote1-ver-computador-escuro.png) | | ![](img/lote1-ver-celular-escuro.png) |
| Personalizar, claro | ![](img/lote1-personalizar-computador-claro.png) | | ![](img/lote1-personalizar-celular-claro.png) |
| Personalizar, escuro | ![](img/lote1-personalizar-computador-escuro.png) | ![](img/lote1-personalizar-tablet-escuro.png) | ![](img/lote1-personalizar-celular-escuro.png) |

Catálogo, arrastar, menu de um componente e estado vazio:

![Catálogo, computador, claro](img/lote1-catalogo-computador-claro.png)
![Catálogo, celular, escuro](img/lote1-catalogo-celular-escuro.png)
![Arrastando um componente](img/lote1-arrastando-computador-claro.png)
![Menu de um componente, escuro](img/lote1-menu-componente-computador-escuro.png)
![Estado vazio](img/lote1-vazio-computador-claro.png)

Mudanças principais: faixa azul do Design System com o nome da página e "Personalizar"; abas das páginas num contêiner branco (aba ativa em azul); **barra fixa** só no modo personalizar; chrome por componente (alça, chip `n/12`, `⋯`, canto de redimensionar) com contorno
tracejado azul claro só na edição; fantasma, indicador de destino e rótulo de tamanho; catálogo em cartões com ícone, categoria em chips, busca, seção de destino e motivo de bloqueio; toast fixo para avisos; estados vazios com ícone; selos para oculto e desativado; botões
e campos do Design System (`rac-btn`, `rac-campo-entrada`).

## 7. Validação visual medida [Fato]

`tests/workspace_visual.test.mjs` (Chromium; 6 casos = 3 larguras × 2 temas, cada um em ver, personalizar e catálogo) mede: ausência de rolagem lateral; nenhum componente sobrepõe outro; alvos de toque ≥ 44 px (barra, abas, alças, menus, catálogo);
a barra de personalizar não cobre o começo do conteúdo, cabe na largura e **continua fixa no topo ao rolar**; contraste do texto (WCAG 2.1, 4,5:1 e 3:1 para texto grande) de abas, títulos, notas, atalhos, selos, botões e cartões do catálogo, nos dois temas; o conteúdo permanece com opacidade 1 na edição.
Mais `tests/workspace_tela.test.mjs` (comportamento) e `tests/design_system.test.mjs` (nenhuma cor escrita fora de variável).

**Problemas que a validação achou e foram corrigidos neste lote:**

| Problema | Onde apareceu | Correção |
|---|---|---|
| Botão `⋯` da seção com 33 px de altura (abaixo de 44 px) | medição de alvos | botão do Design System (`rac-btn--icone`) |
| Barra de personalizar **não ficava fixa** ao rolar (o pai era do tamanho da barra) | medição de rolagem em tablet e celular | o contêiner passa a `display:contents` no modo personalizar |
| Catálogo com texto espremido em colunas de 70 px | captura do catálogo | uma coluna, cartão com ícone, texto e botão que quebra de linha |
| Widget com configuração incompleta quebrava ("Invalid time value") | captura da Agenda | todo widget recebe a configuração normalizada com os padrões |
| Nome da página truncado ("Min…") e `⋯` esticado no celular | captura do celular | `⋯` no cabeçalho da barra com tamanho fixo; contador oculto abaixo de 520 px |
| Barra de edição com 7 controles do mesmo peso | revisão da hierarquia | 5 controles; Concluir em destaque; o resto no menu |
| Data em caixa alta pelo `capitalize` ("Sexta-Feira, 27 De…") | captura | removido |
| Aviso inline empurrava o conteúdo | revisão | toast fixo (sucesso some, erro fica) |
| Captura "ver" mostrando a tela de login por trás | captura | só do ambiente de teste (o portão de entrada ficava visível): corrigido na montagem do teste |

## 8. Consolidação visual: o que fica para os próximos lotes [Recomendação, não executada]

| Item | Evidência | Lote sugerido |
|---|---|---|
| Migrar as telas no padrão antigo (`panel()`, `wCard()`, `ghostbtn`) para `rkCard`, `rkBtn` e `rkEstado`, uma tela por vez, com comparação antes × depois | seção 2 | contínuo, junto de cada módulo (a Lista e a Família primeiro) |
| Unificar as duas cópias de tokens (`index.html` e `css/rac.css`) | seção 2 | Lote 2 (limpeza oportuna) |
| Janelas e menus: o Workspace tem folha e menu próprios; trocar pelo componente comum quando existir no kit | `js/workspace.js` (`wkFolha`, `wkMenu`) | Lote 2: extrair para `js/kit.js` |
| Abas: o estilo das abas de página é novo; padronizar com as abas da Lista, Esportes e Saúde | seção 2 | Lote 2 |
| Barra inferior do celular com os cinco ambientes e o botão central de Captura | [Documento 13](13-visao-e-arquitetura-do-novo-rac.md) (N-24) | Lote 2, com protótipo e aprovação do dono |
| Pré-visualização real do widget no catálogo (hoje: ícone, descrição e tamanho) | seção 6 | Lote 2, quando houver widgets dos módulos |
| Gráficos e tabelas: auditar o kit de gráficos com o mesmo método (contraste, alvos, tema escuro) | `js/graficos.js` | Lote 2 (widgets de gráfico) |
| Teste de captura de tela com comparação por pixels para as telas migradas | seção 7 | quando a primeira tela antiga for migrada |

## 9. Limites desta validação

As capturas usam um banco simulado e dados de exemplo; o contraste foi medido por cálculo (não por simulação de daltonismo); o toque longo para arrastar no iPhone **não foi validado em aparelho real** (a alternativa por menu e setas existe e está testada);
a faixa azul em degradê foi conferida por texto branco sobre azul escuro e por inspeção, não por amostragem de pixels. A validação do dono no iPhone e no computador continua sendo o critério final.
