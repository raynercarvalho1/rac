# Design System RAC (guia de uso)

Fase 3 · DS-0 e DS-1 (13/11/2026). É o **guia de como usar** o que já está no código; o diagnóstico, a direção visual e o plano completo
estão no [Documento 03](planejamento/03-design-system.md) (não repetir a auditoria). Convenção: só o que está nesta página como "feito"
existe no código; o resto é plano.

## O que existe hoje (DS-0 e DS-1, só acrescenta; nenhuma tela existente mudou)

| Peça | Onde | Observação |
|---|---|---|
| Tokens `--rac-*` | `index.html`, bloco "Design System RAC · DS-0", logo antes das regras de seção | Onde havia token atual, o `--rac-*` **aponta para ele** (`--rac-texto: var(--ink)`…): uma fonte só, nos três temas. Só `--rac-info` e `--rac-linha-campo` têm valor próprio por tema (contraste de texto/ícone e borda de campo). |
| Classes `rac-*` | `index.html`, bloco "Design System RAC · DS-1", no fim do `<style>` | Usam só `var(--rac-*)`: **nenhuma cor escrita**. Convivem com as antigas (`.panel`, `button`, `.ghostbtn`…). |
| Página de componentes | rota `#componentes` (`js/rotas.js`), módulo `js/componentes.js`, `<section id="componentes">` | **Só o dono**, sem item no menu (abra pelo endereço `#componentes`). Não lê nem grava dado, não chama IA. A casa nunca a vê (cai no Mercado, como em qualquer rota fora de `DA_CASA`). |
| Catraca e contraste | `tests/design_system.test.mjs` | Ver abaixo. |

### Tokens

- **Marca**: `--rac-dodger` `#005A9C` (preenchimento, texto branco), `--rac-dodger-forte`, `--rac-dodger-claro` (texto no escuro), `--rac-vermelho`, `--rac-prata`.
- **Estados** (texto/ícone, seguem o tema): `--rac-ok`, `--rac-aviso`, `--rac-erro`, `--rac-info`, `--rac-neutro`. **Preenchimentos** com texto branco: `--rac-ok-fill`, `-aviso-fill`, `-erro-fill`, `-info-fill`. Estado nunca só pela cor: ícone (✓ ⚠ ✗ i •) + palavra.
- **Superfícies e texto**: `--rac-fundo`, `--rac-sup-1` (cartão), `--rac-sup-2` (realce/campo), `--rac-texto`, `--rac-texto-2`, `--rac-linha`, `--rac-linha-campo` (≥ 3:1), `--rac-foco`.
- **Escalas**: espaço `--rac-esp-1…12` (base 4 px), raio `--rac-raio-1/2/3/pilula`, sombra `--rac-sombra-1/2/3`, movimento `--rac-mov-rapido/medio`, camadas `--rac-z-*`, alvo de toque `--rac-alvo` (44 px), tipografia `--rac-fs-*` (8 papéis; no computador soma o `--fz` que já existia).
- Ainda **não** feitos: breakpoints como variável (CSS não aceita variável em `@media`; ficam como convenção 480/860/1180 px, ver Documento 03 §3.5), as 7 cores de área (dependem do menu agrupado, DS-2) e o conjunto de ícones em `<symbol>` (a página de componentes reaproveita os 29 ícones do menu, sem biblioteca nova).

### Componentes (classes)

Cartão `rac-card` (+ `-cab`, `-corpo`, `-rod`; variantes `--kpi`, `--sinal`, `--atalho`) · botão `rac-btn` (`--pri`, `--sec`, `--ter`, `--perigo`, `--icone`; estados desligado e `aria-busy`) · `rac-chip` (`aria-pressed`) e `rac-selo--ok|aviso|erro|info|neutro` ·
`rac-estado` (`--erro`) e `rac-esqueleto` (carregando/vazio/erro) · `rac-campo` (`-rotulo`, `-entrada`, `-ajuda`, `--erro`) · `rac-lista` · `rac-tabela` dentro de `rac-tabela-rolo` ·
tipografia `rac-t-num|pagina|secao|cartao|texto|sec|legenda|mono` · `rac-pilha`, `rac-linha-flex`, `rac-grade`.
Em JavaScript, `js/componentes.js` mostra o "como montar" (`dscSelo`, `dscBtn`, `dscCard`, `dscEstado`, `dscCampo`) com o `h()` de sempre. Quando um módulo migrar de verdade, esses
ajudantes sobem para a base (`js/app.js`); até lá nenhum outro módulo depende de `componentes.js` (sem acoplamento).

## Regras para quem for adotar

1. Tela nova usa `rac-*`; tela antiga **não é tocada** até a sua etapa (DS-3 piloto, DS-4 por área). A **casa (Mercado, Lista, Família, Veículos) só com autorização do dono** (DS-5).
2. Não escrever cor, raio ou espaço soltos: usar o token. Não criar token novo sem registrar aqui.
3. Todo gráfico novo segue `racDica.ligar`/`racDica.em` (regra existente).
4. Ao migrar telas, rodar `tests/design_system.test.mjs` e **baixar** `LINHA_DE_BASE_CORES` para o novo número: a catraca só desce.
5. Conferir no celular (390 px) e no computador (1280 px), tema claro e escuro, antes de pedir aprovação.

## Testes que protegem

`tests/design_system.test.mjs`: (1) **catraca** — cores escritas fora de variáveis ≤ 115 (linha de base de 13/11/2026); (2) tokens existem e os que mudam por tema valem nos três temas;
(3) **contraste WCAG** de 19 pares (texto ≥ 4,5:1; borda de campo ≥ 3:1) nos dois temas; (4) classes `rac-` sem cor escrita, com foco visível, alvo de 44 px, `prefers-reduced-motion` e só tokens que existem;
(5) rota só do dono, fora do menu, no cache offline, `VERSAO` = `MOD_VERSAO`; (6) a página desenha as 9 seções para o dono e recusa a casa; (7) ES5 puro e sem nome global repetido.
`tests/rotas.test.mjs` continua comparando com a cópia de antes; passou a aceitar **uma única rota nova** (`componentes`).

## Decisão pendente: tema padrão (D-01) — recomendação, não decisão

| Opção | A favor | Contra |
|---|---|---|
| A. Manter o **claro** como padrão e o escuro como opção (hoje) | Zero risco; é o que o dono escolheu em 31/10; a Fernanda não vê mudança | O visual "Noite Dodger" fica escondido; a foto de fundo compete com o cartão translúcido |
| B. **Escuro Dodger** como padrão para o dono (preferência só dele; casa continua como está) | Identidade mais forte, cartões sólidos e legíveis; tokens e contrastes já prontos (§3 do Documento 03) | Precisa do piloto (DS-3) para validar no iPhone ao sol e com as fotos de fundo |
| C. **Automático** (segue o sistema do aparelho) | Respeita o iPhone; já existe como escolha | Duas aparências a manter conferidas em cada tela |

**Recomendação**: seguir pela **B, mas só depois do piloto**: entregar o escuro refinado (DS-2) como **opção** sem mudar o padrão de ninguém, ver o RAC Hoje e o Monitor nele (DS-3) no iPhone e só então o dono decide se vira padrão para ele.
A casa não muda de tema sem o dono pedir. Nada disso foi decidido; o padrão continua o claro.
