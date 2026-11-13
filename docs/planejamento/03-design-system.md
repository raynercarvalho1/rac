# RAC · 03 · Design System

Proposta do **RAC Design System** (13/11/2026). Nada aqui foi implementado: é o diagnóstico do visual atual, a direção
visual, os tokens, os componentes e o plano de adoção gradual. Convenções [Fato] / [Hipótese] / [Recomendação]: ver o
[Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

**Objetivo**: o RAC deve parecer um produto acabado, não um conjunto de telas feitas em momentos diferentes (o histórico
confirma: 30 rotas construídas em três semanas, de 23/10 a 12/11/2026). A direção é um painel moderno, escuro, organizado em
cartões e áreas, com identidade própria nas cores dos Los Angeles Dodgers, sem copiar outro produto.

## 1. Diagnóstico visual

### 1.1 O que já existe e é bom [Fato]

- **Tokens de cor nas cores dos Dodgers** em `:root` (`index.html` linhas 25–60): `--accent`/`--brand` `#005A9C`, neutros
  azulados, estados `--good`, `--warn`, `--bad`, `--live`, e uma cor por seção (`--c-esportes`, `--c-mercado`, `--c-saude`…). A
  seção aberta empresta a sua cor (`:root[data-sec=...]`).
- **Três temas**: claro (padrão, escolhido em 31/10), escuro e automático, com o escuro definido duas vezes (preferência do
  sistema e escolha manual), como manda a boa prática.
- **Atmosfera própria**: foto de fundo em tela cheia (Dodger Stadium ou Yosemite, com crédito e licença) e cartões translúcidos
  com desfoque por cima; Olivia, Eddie e Veículos usam a foto da própria página.
- **Tipografia com intenção**: Outfit (interface), Hanken Grotesk (texto), Barlow Condensed (títulos e placares), JetBrains
  Mono (detalhes técnicos); `--fz` aumenta tudo em 2 px no computador.
- **Padrão de gráfico obrigatório** (`racDica`): toda barra é clicável e mostra valor e rótulo, com teste que impede gráfico
  sem ele (`tests/estrutura.test.mjs`).
- **Acessibilidade acima da média**: 210 `aria-label`, 132 `role`, `aria-current` no menu, 12 regras de `:focus-visible`,
  `prefers-reduced-motion` respeitado, estados com ícone e texto (✓ ⚠ ✗) e não só cor.

### 1.2 Inconsistências medidas [Fato]

| Medida | Valor | Onde |
|---|---|---|
| Cores hexadecimais no CSS | 196 ocorrências, **73 cores diferentes** | CSS do `index.html` |
| Cores escritas no JavaScript | `js/esportes.js` 33, `js/app.js` 27, `js/saude.js` 26, `js/bebe.js` 11, `js/resumo.js` 11 | `style:`/hex nos módulos |
| Raios de borda | **20 valores** (12, 10, 99, 8, 50%, 14, 6, 4, 3, 999, 5, 9, 16, 7, 18…) | CSS |
| Tamanhos de fonte | **25 tamanhos** com `calc(Npx + var(--fz))` | CSS |
| Larguras de quebra (`@media`) | ≈ 17 diferentes (420, 480, 560, 640, 700, 760, 820, 860, 861, 1000, 1100, 1180, 1200…) | CSS |
| Botões | 3 famílias: `button` (raio 4 px, cor cheia), `.ghostbtn` (pílula, fonte da interface), `.btn` (pílula, fonte condensada em caixa alta), mais `button.ghost`, `.iconbtn`, `.linkbtn`, `.kbtn`, `.filebtn` | CSS linhas 501–527, 748–784 |
| Cartões | `.panel`, `.wcard` (degradê), `.nlcard`, `.kpi`/`.kcard`, `.vcard`, `.famcard`, `.rtcard`, `.bdcard`, `.tile`, `.card` | CSS |
| Etiquetas | `.chips`/`.chipb`/`.chipl`, `.pill`/`.pills`, `.tag` | CSS |
| Títulos | `h2` em Barlow Condensed, `h2.sec` em Outfit branco sobre a foto, título da página em Outfit | CSS linhas 275, 546 |
| Ícones | 38 SVG no `index.html` (menu), traço 2 px, grade 24 (bom padrão), mas também emojis em textos e botões (⛽ 🛒 ✓ ⚠ ↻ ← ↑ +) | `index.html`, módulos |
| Menu | **29 itens num único grupo** ("Painel"), mais "Times" e "Listas do X" | `<nav id="navgrp">` |
| Celular | Menu vira gaveta (☰) e há **três botões flutuantes** (+ captura, ← voltar, ↑ topo) | `iniciar()` em `js/app.js` |
| Dois "inícios" | Início (13 cartões) e RAC Hoje (página própria) | `renderInicio`, `js/hoje.js` |

### 1.3 Componentes duplicados e o que padronizar

| Hoje (vários jeitos) | Padronizar como |
|---|---|
| `panel()` em `js/app.js` e outro em `mercado.js`, `.panel`, `.wcard`, `.nlcard`, `.famcard`… | **Cartão** com variantes (ver 4.1) |
| `button`, `.ghostbtn`, `.btn`, `button.ghost`, `.linkbtn` | **Botão**: primário, secundário, terciário, perigo, só ícone |
| `.chips`, `.pill`, `.tag`, selos do RAC Hoje ("Mesmos dados de agora") | **Chip/selo** de estado e de filtro |
| `.empty`, `failed()`, `loading()`, mensagens soltas | **Estados**: carregando, vazio, erro com "tentar de novo" |
| `.sisdot` (✓ ⚠ ✗), `.qrwarn`, `.alerta` | **Indicador de status** (ok, aviso, erro, info, neutro) |
| gráficos `rs*` (Resumo), `vbars`, `hbars`, `lchart` | **Gráficos** do kit de UI, sempre com `racDica` |
| cores escritas no JS | **Tokens** (`var(--…)`) lidos pelo JS quando preciso |

## 2. Direção visual: "Noite Dodger"

[Recomendação] Um tema escuro principal, inspirado na noite do estádio, com o azul Dodger como identidade:

- **Fundo** azul-noite quase preto; **cartões sólidos** em três níveis de superfície (legibilidade primeiro). A foto de fundo
  continua como **atmosfera opcional** no Início/RAC Hoje e nas páginas de Olivia, Eddie e Veículos, sempre com véu escuro.
- **Azul Dodger `#005A9C` como preenchimento** (botão primário, item ativo do menu, cabeçalho de destaque) com texto branco
  (contraste 7,14:1). **Sobre o fundo escuro, o azul de texto e ícone é o `#6CB4F0`** (7,52:1). O `#005A9C` como texto no escuro
  dá só 2,35:1 e fica proibido.
- **Vermelho do número do uniforme** só para o que é urgente ou "ao vivo", nunca decorativo.
- **Prata** para detalhes secundários e divisórias de destaque.
- O **tema claro continua** ("Dia Dodger", os valores atuais), escolhido na barra lateral como hoje.

Qual tema é o padrão, e se a casa muda de tema, é **decisão do dono** ([Documento 07](07-decisoes-e-pendencias.md)).

## 3. Tokens

Nomes novos com prefixo `--rac-`; os nomes atuais (`--bg`, `--surface`, `--ink`, `--accent`…) viram **apelidos** dos novos,
para nada quebrar na transição. Contrastes calculados pela fórmula da WCAG em 13/11/2026.

### 3.1 Cores de marca

| Token | Valor | Uso |
|---|---|---|
| `--rac-dodger` | `#005A9C` | Preenchimentos de marca (com texto branco, 7,14:1) |
| `--rac-dodger-forte` | `#0B4F86` | Preenchimento pressionado; texto azul no tema claro (7,60:1 sobre `#EEF3F9`) |
| `--rac-dodger-claro` | `#6CB4F0` | Texto, link, ícone e foco no tema escuro (7,52:1 sobre a superfície 1) |
| `--rac-vermelho` | `#C8102E` | Preenchimento urgente/ao vivo, com texto branco (5,88:1) |
| `--rac-vermelho-claro` | `#FF7A85` | Texto de erro no escuro (6,68:1) |
| `--rac-prata` | `#A5ACAF` | Detalhes secundários (7,27:1 sobre a superfície 1) |

### 3.2 Fundos e superfícies (tema escuro)

| Token | Valor | Contraste do texto principal `#E7EEF7` |
|---|---|---|
| `--rac-fundo` | `#08111D` | 16,22:1 |
| `--rac-sup-1` (cartão) | `#0F1E33` | 14,33:1 |
| `--rac-sup-2` (cartão dentro de cartão, campo) | `#16263D` | 13,03:1 |
| `--rac-sup-3` (realce, item ativo) | `#1D3150` | texto secundário `#9AAAC0`: 5,53:1 |
| `--rac-linha` (divisória decorativa) | `#22324A` | só decoração |
| `--rac-linha-campo` (borda de campo e de controle) | `#6A84A6` | 4,36:1 sobre a superfície 1 (mínimo exigido 3:1) |
| `--rac-texto` | `#E7EEF7` | — |
| `--rac-texto-2` (secundário) | `#9AAAC0` | 7,09:1 sobre a superfície 1 |

No tema claro, os valores atuais continuam (texto `#0E1B2C` sobre `#EEF3F9`: 15,53:1; secundário `#53627A` sobre branco: 6,18:1).
[Fato] A borda atual dos campos no claro (`--line` `#D6E0EC`) não atinge 3:1; no tema claro, a borda de campo passa a `#7B8CA3`
(3,43:1 sobre branco).

### 3.3 Estados

| Estado | Texto/ícone no escuro | Contraste | Preenchimento com texto branco | Ícone obrigatório |
|---|---|---|---|---|
| Sucesso (`--rac-ok`) | `#55C08A` | 7,41:1 | `#1E7A4C` (5,33:1) | ✓ |
| Alerta (`--rac-aviso`) | `#E0A252` | 7,54:1 | `#A5610B` (4,87:1) | ⚠ |
| Erro (`--rac-erro`) | `#FF7A85` | 6,68:1 | `#C8102E` (5,88:1) | ✗ |
| Informação (`--rac-info`) | `#6CB4F0` | 7,52:1 | `#005A9C` (7,14:1) | i |
| Neutro | `#9AAAC0` | 7,09:1 | — | • |

Regra: estado **nunca só pela cor**; sempre ícone + palavra ("Atrasado", "Em dia", "Falhou").

### 3.4 Cores por área (menu e gráficos)

As 12 cores de seção atuais (`--c-*`) viram **7 cores de área**, uma por grupo do menu (seção 5): Hoje, Casa e Família,
Finanças e Compras, Saúde, Carreira e Estudos, Informação, Sistema. Dentro de uma área, as seções usam a cor da área. Para séries
de gráficos, uma paleta categórica de 6 cores derivada das áreas, conferida para daltonismo antes de adotar.

### 3.5 Espaço, raio, sombra, movimento e camadas

| Grupo | Tokens |
|---|---|
| Espaçamento (base 4 px) | `--rac-esp-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 |
| Raio (de 20 para 4) | `--rac-raio-1` 8 px (campo, chip pequeno) · `--rac-raio-2` 12 px (cartão interno) · `--rac-raio-3` 16 px (cartão, folha) · `--rac-raio-pilula` 999 px (botão, chip) |
| Sombra | `--rac-sombra-1` (cartão) · `--rac-sombra-2` (menu suspenso, dica) · `--rac-sombra-3` (janela) |
| Movimento | `--rac-mov-rapido` 120 ms · `--rac-mov-medio` 200 ms; tudo desligado com `prefers-reduced-motion` (já existe) |
| Camadas (`z-index`) | menu 30 · botões flutuantes 40 · dica 50 · janela 60 · aviso 70 |
| Quebras (de ≈ 17 para 3) | 480 px (celular pequeno) · 860 px (o menu vira gaveta, como hoje) · 1180 px (tela larga) |
| Toque | alvo mínimo de 44 × 44 px |

### 3.6 Tipografia

| Papel | Família | Tamanho (celular; +2 px no computador, pelo `--fz` que já existe) | Peso |
|---|---|---|---|
| Número de destaque (KPI, placar) | Barlow Condensed | 36 | 700 |
| Título da página | Outfit | 26 | 700 |
| Título de seção | Outfit | 20 | 700 |
| Título de cartão | Outfit | 17 | 600 |
| Texto | Hanken Grotesk | 15 | 400 |
| Secundário | Hanken Grotesk | 13 | 500 |
| Legenda, selo | Outfit | 12 | 600 |
| Dado técnico | JetBrains Mono | 12 | 400 |

De 25 tamanhos para 8. Números em tabelas e cartões com `font-variant-numeric: tabular-nums` (já usado no menu).

## 4. Componentes

### 4.1 Cartão

Anatomia: **cabeçalho** (ícone da área + título + ação opcional "Ver tudo") · **corpo** · **rodapé de origem** opcional
("Fonte: Garmin · atualizado há 2 h"), o selo de frescor que o RAC Hoje já usa.

| Variante | Para quê | Hoje equivale a |
|---|---|---|
| Resumo (KPI) | Um número e a variação ("R$ 1.240 · +12% vs. mês passado") | `.kpi`, `.kcard`, `.wcard` |
| Lista | Itens com data, estado e ação | `.panel` com `ul.wl` |
| Sinal | Algo que pede atenção, com "Por que estou vendo isto" e ações (Ver, Adiar, Não mostrar) | novo (ver [04](04-rac-intelligence.md)) |
| Atalho de módulo | Ícone, nome, contador e estado da área | itens do Início |
| Gráfico | Gráfico com `racDica` e legenda curta | blocos de gráfico atuais |

### 4.2 Botões

| Tipo | Aparência | Quando |
|---|---|---|
| Primário | Pílula azul Dodger, texto branco | A ação principal da tela (uma por área visível): Salvar, Analisar |
| Secundário | Pílula com borda, fundo da superfície | Ações comuns: Editar, Filtrar, Exportar |
| Terciário | Só texto azul (link) | Ações leves: Ver tudo, Detalhes |
| Perigo | Borda e texto vermelhos; confirmação em dois toques | Excluir, Dispensar registro |
| Só ícone | Círculo de 44 px com `aria-label` | ↻, fechar, menu |

Estados obrigatórios: normal, foco visível (anel `--rac-dodger-claro` de 2 px), pressionado, desligado (com o motivo em texto
quando possível) e ocupado (`aria-busy`, como o ↻ já faz).

### 4.3 Chips e indicadores de status

Chip de filtro (ligado/desligado, `aria-pressed`), selo de estado (ícone + palavra + cor do estado) e contador (número no menu).
O selo de origem e frescor do RAC Hoje vira componente comum.

### 4.4 Estados de carregamento, vazio e erro

Um componente só para os três: carregando (esqueleto do cartão, sem "pular" a página), vazio (texto que diz o que fazer, com o
botão da ação) e erro (o que falhou, "tentar de novo" e o detalhe técnico recolhido, como `failed()` já faz).

### 4.5 Formulários

Rótulo sempre visível, ajuda abaixo do campo, erro no próprio campo (sem apagar o que foi digitado, regra que já existe), a
**conferência antes de salvar** como padrão visual único (resumo do que será gravado + Salvar + Voltar e corrigir).

### 4.6 Gráficos

Mantém o padrão `racDica`. Cores das séries pelos tokens; eixos e grades com `--rac-linha`; no celular, colunas rolam para o lado
e começam pelas mais recentes (`vbFim`, já existe).

### 4.7 Ícones

[Recomendação] Um conjunto único, no estilo que o menu já usa (contorno, traço 2 px, grade 24, pontas arredondadas), guardado
uma vez no `index.html` como `<symbol>` e usado com `<use>`, um ícone por área e por ação. Sem biblioteca nova: os desenhos são
copiados para o próprio arquivo, com a licença registrada (se vierem de um conjunto aberto). Emojis ficam para o conteúdo do
usuário e para o texto das notificações.

## 5. Navegação

**Menu agrupado por área** (gerado pelo registro de rotas, passo A3 do [Documento 02](02-auditoria-arquitetural.md#9-plano-gradual-de-melhoria)):

| Grupo | Seções |
|---|---|
| Hoje | RAC Hoje, Agenda, Busca |
| Casa e Família | Olivia, Eddie, Lista, Documentos, Veículos (e as novas: Medicamentos, Contas, Encomendas) |
| Finanças e Compras | Central de Compras (Mercado), Compras online, Alimentação, Painel |
| Saúde | Saúde e treinos |
| Carreira e Estudos | MBA, Estudos, Carreira, Rede, Vagas, Conexões |
| Informação | Newsletter, Esportes, X, Aniversários |
| Sistema | Sistema (com o Monitor), Segurança, Custos de IA |

**No celular** [Recomendação]: barra inferior com cinco destinos (Hoje · Casa · Finanças · Saúde · Mais), o "+" da captura
rápida no centro e o "voltar" só na barra de título. Os três botões flutuantes atuais viram um (o ↑ aparece só em páginas longas).

**A casa**: o menu da Fernanda continua exatamente o de hoje (as rotas de `DA_CASA`) até o dono decidir.

## 6. Proposta visual do painel principal

Esboço do RAC Hoje como painel central (celular, tema "Noite Dodger"):

```text
┌───────────────────────────────────┐
│ ☰  RAC Hoje              ↻  👤    │  barra de título
├───────────────────────────────────┤
│ Bom dia · quinta, 13 nov  22° ☁   │  saudação e tempo
├───────────────────────────────────┤
│ ⚠ Precisa de atenção (3)          │  cartão de sinais
│  • Conta da Naturgy vence amanhã  │    cada item: por quê + ações
│  • Robô de vagas parado há 30 h   │
│  • Remédio do Eddie vence em 9 d  │
├─────────────────┬─────────────────┤
│ Gasto do mês    │ Prontidão       │  cartões de resumo (KPI)
│ R$ 1.240 +12%   │ 72 · boa        │
├─────────────────┴─────────────────┤
│ Hoje e amanhã                     │  agenda (compromissos, contas)
├───────────────────────────────────┤
│ Encomendas na portaria (1)        │
├───────────────────────────────────┤
│ Acontecimentos que você segue     │
├───────────────────────────────────┤
│ Integrações: 8 ok · 1 com falha   │  monitor resumido
└───────────────────────────────────┘
 [ Hoje ][ Casa ][  +  ][ Finanças ][ Mais ]
```

No computador, os mesmos cartões em grade de 2 ou 3 colunas, com o menu agrupado à esquerda. Os números do esboço são ilustrativos.

## 7. Adoção gradual sem quebrar os módulos

| Fase | O que muda | Muda o que o usuário vê? | Critério de conclusão |
|---|---|---|---|
| DS-0 · Tokens | Tokens `--rac-*` no `:root`; os nomes atuais viram apelidos; um teste "catraca" impede aumentar o número de cores fora do `:root` (linha de base: 196) | Não | Suíte passa; contagem de cores não sobe |
| DS-1 · Componentes base | Classes `rac-` (cartão, botão, chip, estado, ícone) ao lado das antigas; uma página interna "Componentes" só do dono, para conferir no celular | Não (só a página interna) | Página de componentes nos dois temas, 390 px e 1280 px |
| DS-2 · Tema e navegação | O tema que o dono escolher (questão D-01, em aberto; "Noite Dodger" é a proposta) e o menu agrupado (depende do registro de rotas, A3) | Sim, só para o dono | Dono aprova no celular |
| DS-3 · Piloto | RAC Hoje e Sistema/Monitor no padrão novo | Sim, só dono | Capturas antes × depois no PR; nenhum teste de tela quebrado |
| DS-4 · Por área | Saúde, Finanças, Carreira, Informação, uma área por publicação | Sim | Cada área sem classes antigas de botão e cartão; catraca de cores desce |
| DS-5 · Telas da casa | Mercado, Lista, Família e Veículos | Sim, para a Fernanda | **Só com autorização do dono** |

Proteções: o CSS novo fica escopado nas classes `rac-` (o antigo continua funcionando até ser removido); capturas de tela
automáticas (Playwright, que o CI já instala) em 390 px e 1280 px nos dois temas para cada página migrada; a regra dos gráficos
(`racDica`) vale para tudo; nenhuma biblioteca nova.

## 8. Situação de implementação (atualização de 13/11/2026, Fase 3)

As seções 1 a 7 acima continuam sendo o diagnóstico (13/11/2026) e o plano original. **A direção visual mudou em 13/11/2026**: o dono aprovou o **RAC Modern Workspace**
(produtividade moderna + analytics minimalista + dashboard analítico), com **tema claro como padrão**, fundo e azul Dodger preservados e o escuro funcional. A seção 2 ("Noite Dodger",
escuro como direção principal) e a proposta de DS-2 "tema" ficam **substituídas**; a decisão D-01 está tomada. O guia vivo é [`docs/design-system.md`](../design-system.md).

- **Feito na branch `claude/rac-fase-3-design-system-0msm91` (PR #9, sem merge, não publicado)**: DS-0 (tokens) e DS-1 (componentes) na primeira versão, depois **redefinidos** em `css/rac.css` e `js/kit.js`;
  menu do dono por área e barra inferior no celular (pelo registro de rotas); piloto no RAC Hoje. Classificação do que foi mantido, refinado e substituído em [`docs/design-system.md`](../design-system.md#classificação-do-ds-1-anterior-auditoria-desta-etapa).
- **Diferença em relação à seção 3**: os tokens `--rac-*` apontam para os atuais onde existem; as superfícies novas (papel 1/2/3, tintas) e o degradê de marca são novos. Breakpoints seguem como convenção (480/860/1180 px).
- **Não feito ainda**: DS-4 (demais módulos, um por vez), DS-5 (telas da casa, só com autorização), cores por área nos gráficos, `<symbol>` de ícones.
