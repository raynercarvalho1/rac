# Design System RAC · RAC Modern Workspace (guia de uso)

Fase 3 (13/11/2026). É o guia **vivo** de como usar o que está no código. O diagnóstico visual de 13/11/2026 continua no
[Documento 03](planejamento/03-design-system.md) (não repetir a auditoria); o que foi feito e quando está no [histórico diário](planejamento/historico-diario.md).
Só o que está marcado como feito existe no código; o resto é plano.

## Direção aprovada: RAC Modern Workspace

| Referência | Entra como | Onde se vê |
|---|---|---|
| Produtividade moderna | Estrutura, navegação por área, acesso rápido, experiência de aplicativo | Menu do dono agrupado em 6 áreas, barra inferior no celular, painel central |
| Analytics minimalista | Acabamento: tipografia, espaçamento, superfícies sem borda, hierarquia | Cartões de papel com sombra suave, números em Outfit, rótulos pequenos |
| Dashboard analítico | Gráficos, indicadores, comparações, tendências | Indicadores com variação, medidor de orçamento, comparação atual × anterior, colunas e barras |

Decisões já aprovadas (não rediscutir): **tema claro como padrão**; fundo (foto) e identidade preservados; **azul Dodger** como centro da identidade, em equilíbrio
(o azul é a abertura do painel, a ação principal e o item ativo; o resto é neutro; vermelho só para urgente); escuro existente funcional; identidade própria.
O tema padrão (D-01) deixou de ser pergunta: é o claro.

## O que existe

| Peça | Onde | Observação |
|---|---|---|
| CSS do Design System | `css/rac.css` (carrega depois do `<style>` do `index.html`; `?v=` = `VERSAO`) | 4 camadas: 1 tokens, 2 componentes `rac-*`, 3 shell do dono, 4 piloto RAC Hoje |
| Kit de componentes | `js/kit.js` (`rk*`), módulo leve sem tela (`MOD_DEPS`) | Só monta elementos com `h()`; sem banco, sem regra de negócio |
| Kit de gráficos | `js/graficos.js` (`rsColunas`, `rsBarras`; Fase 2, **não alterado**) | Restilizados por `.rac-grafico`; `racDica` em toda barra |
| Menu por área e barra inferior | `js/rotas.js` (`area`, `curto`, `RAC_AREAS`, `rotasMenuHtml`, `rotasBarraHtml`) | O registro é a única fonte; o agrupamento é por CSS (`order`), a ordem do registro não mudou |
| Página de componentes | rota `#componentes`, `js/componentes.js` | Só o dono, sem item no menu; exemplos marcados como ilustrativos |
| Piloto | `#rachoje` (`js/hoje.js`: `hjDesenhar` e ajudantes `hj*`) | Ver "Piloto" abaixo |

### Escopo: dono × casa
Todo o shell novo (cartões `.panel` antigos, barra lateral, barra inferior, grade) é escrito sob `html.logado:not(.casa)`; a Fernanda (`html.casa`) continua com o CSS de antes.
**Comprovado**: 20 telas da casa (Mercado, Lista, Olivia, Veículos, Segurança × 390 e 1280 px × claro e escuro) comparadas com a `main`: 18 idênticas byte a byte e 2 com 1 pixel de diferença (antialiasing).
A Central de Compras (`#mercado`) não é tocada (`section:not(#mercado)`). O teste `tests/design_system.test.mjs` trava o escopo.

### Tokens (`css/rac.css`, camada 1)
Marca `--rac-dodger*`, `--rac-vermelho*`, `--rac-prata`, degradê `--rac-azul-grad` · superfícies `--rac-papel` (cartão), `-papel-2` (área interna), `-papel-3` (trilho), `--rac-azul-suave` (item ativo) ·
texto `--rac-texto`, `-texto-2` · estados `--rac-ok|aviso|erro|info|neutro` + tintas `--rac-tinta-*` e preenchimentos `--rac-*-fill` · bordas `--rac-borda`, `--rac-linha-campo` (≥ 3:1) ·
escalas `--rac-esp-*`, `--rac-raio-*`, `--rac-sombra-*`, `--rac-mov-*`, `--rac-z-*`, `--rac-alvo` (44 px), `--rac-barra-h` · tipografia `--rac-fs-*`.
Escuro redefine só os tokens por tema (`prefers-color-scheme` e `data-theme="dark"`, iguais). Cor escrita em hexadecimal só vale dentro de token.

### Componentes por função (nem todo módulo usa o mesmo cartão)
| Função | Classe / função do kit |
|---|---|
| Indicador principal e secundário | `rac-kpi` (`--sec`, `--alerta`, `--destaque`) · `rkKpi` + `rkDelta` (seta + número, nunca só cor) |
| Resumo, informação contextual | `rac-card` · `rkCard`; `rac-info` · `rkInfo` |
| Alerta | `rac-alerta` (`aviso|erro|ok|info`) · `rkAlerta` |
| Atalho | `rac-atalho` · `rkAtalho` |
| Lista | `rac-lista` (linha inteira clicável, marca de prioridade) · `rkLista` |
| Comparação | `rac-comp` · `rkComparar` (atual × anterior, mesma escala, `racDica`) |
| Gráfico | `.rac-grafico` sobre `rsColunas`/`rsBarras`; `rac-medidor` · `rkMedidor` (orçamento e projeção) |
| Botões | `rac-btn` (`pri sec ter perigo icone fantasma`; desligado, `aria-busy`) · `rkBtn`, `rkLink` |
| Chips e selos | `rac-chip` (`aria-pressed`) · `rac-selo--ok|aviso|erro|info|neutro` · `rkSelo` |
| Estados | `rac-estado` (carregando com esqueleto, vazio, erro, ok, aviso) · `rkEstado`; selecionado = chip pressionado; desligado e ocupado = botão |
| Campos | `rac-campo` (rótulo sempre visível, ajuda, erro no campo) · `rkCampo` |
| Tabela e recolher | `rac-tabela` em `rac-tabela-rolo` · `rac-recolher` · `rkRecolher` |
| Tipografia | `rac-t-num-g|num|pagina|secao|cartao|texto|sec|rotulo|legenda|mono` |

### Navegação
- **Desktop**: barra lateral em 6 áreas (Hoje · Vida e família · Finanças e compras · Carreira e estudos · Informação · Sistema); item ativo com tinta azul e indicador lateral.
- **Celular (até 860 px)**: barra inferior com os atalhos marcados `curto` no registro (Hoje, Agenda, Saúde, Compras) + **Menu**, que abre a gaveta de sempre; os botões flutuantes sobem acima dela.
- **Casa**: menu de sempre (sem áreas, sem barra). Rota nova = uma linha em `js/rotas.js` com `area` (e `curto` se for atalho); nenhum menu paralelo.

## Piloto: RAC Hoje
O mesmo conteúdo e as mesmas regras, recompostos como painel (nada novo lido, nada inventado; cada bloco some se a fonte não trouxe dado):
abertura azul (saudação, o dia numa frase só com contagens reais, tempo e jogo, ações) → indicadores (Pede atenção · Gasto no mês com variação · Orçamento usado com medidor · Prontidão) →
**Prioridades do dia** (regras do núcleo; cada linha leva ao módulo do dado, `HJ_DESTINO`) + **Gastos do mês** (atual × mês passado por origem) + **Contexto do dia** →
**Saúde e treino** (passos por dia e treinos da semana, da série real do relógio) → **Análise da IA** e **Pergunte** (lado a lado) → **Histórico** e **Fontes de informação** recolhidos.
A análise, o cache, a cobrança, as chamadas sem resultado e os selos de fonte são as funções de antes, sem alteração. Medicamentos, encomendas e contas ainda não existem como fonte (Fase 4): não aparecem.

## DS-4.1 · Agenda (13/11/2026): primeira página migrada depois do piloto
`#agenda` (`js/agenda.js`, `docs/agenda.md`) usa o **mesmo esqueleto do piloto** (classes `.rh`, `.rh-hero`, `.rh-kpis`, `.rh-prio`/`.rh-lado`, `.rh-largo`, reaproveitadas em vez de copiadas) e os componentes do kit
(`rkKpi`, `rkCard`, `rkBtn`, `rkSelo`, `rkEstado`, `rkAlerta`, `rkCampo`, `rsBarras`). O que é só da Agenda mora na seção 5 de `css/rac.css` (`.ag-*`: linha da lista com ações, destaque da próxima ação, célula de dia),
sem cor escrita e sem regra de escopo (a página só existe para o dono). A catraca `LINHA_DE_BASE_CORES` **não baixou** (continua 115): o CSS antigo da Agenda (`.agl`, `.prox*`) ainda é usado pelos cartões do Início.
Modelo para as próximas páginas: `js/<modulo>.js` com a tela; regras puras no núcleo; leitura pelo contrato existente; nada de acesso novo ao banco.

## Classificação do DS-1 anterior (auditoria desta etapa)
| Grupo | Elementos |
|---|---|
| **A. Manter** | Nomes `rac-*`; escalas de espaço, movimento, camadas e alvo de 44 px; padrão de estado (ícone + palavra); catraca de cores; teste de contraste; página interna só do dono; ES5 |
| **B. Refinar** | Tokens de superfície (de "sup-1/2" para papel 1/2/3 com tintas); botões; chips e selos (sem borda, com tinta); campos; lista e tabela; esqueleto de carregamento |
| **C. Substituir** | Cartão com borda e sombra única → cartão de papel por função (KPI, alerta, atalho, informação, comparação, gráfico); tipografia condensada nos números → Outfit tabular; a página `#componentes` (coleção pobre) → página do sistema definitivo; CSS dentro do `index.html` → `css/rac.css` |

## Regras para quem for adotar
1. Tela nova usa `rac-*` e o kit; tela antiga só muda na sua etapa (DS-4 por área). **Telas da casa só com autorização do dono (DS-5).**
2. Nada de cor, raio ou espaço soltos: token. Nada de gráfico sem `racDica`. Kit e gráficos entram pelo `MOD_DEPS` do módulo.
3. Ao migrar, rodar `tests/design_system.test.mjs` e **baixar** `LINHA_DE_BASE_CORES` (hoje 115, só do CSS antigo).
4. Conferir em 390, 768 e 1280 px, tema claro e escuro, sem rolagem lateral, alvos ≥ 44 px, console limpo.

## Testes que protegem
`tests/design_system.test.mjs` (catraca; tokens nos 3 temas; contraste WCAG de 40 pares; componentes só com tokens; escopo do dono; menu por área e barra a partir do registro; página; kit; piloto; ES5; versões e cache offline) ·
`tests/rotas.test.mjs` (equivalência com a cópia de antes, aceitando só a rota `componentes` e os atributos de área) · `tests/hoje.test.mjs`, `tests/fontes.test.mjs`, `tests/graficos.test.mjs`.
