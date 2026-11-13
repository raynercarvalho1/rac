# Agenda (`#agenda`) · RAC Modern Workspace

DS-4.1 (13/11/2026): a primeira página migrada para o Design System depois do piloto RAC Hoje. A página mostra tudo que tem data no site e só o dono a abre
(o registro de rotas não a dá à casa). **As regras de negócio não mudaram**: o que muda é a apresentação. Guia do Design System: [`docs/design-system.md`](design-system.md).

## O que a página mostra

| Bloco | O que é | De onde vem |
|---|---|---|
| Abertura azul | "Agenda", a data de hoje, **uma frase só com contagens que existem** ("1 item atrasado · 3 para hoje · 5 nos próximos 7 dias.") e o atalho "+ Novo lembrete" | `NUCLEO.agdResumo` e `NUCLEO.agdFrase` |
| Indicadores | Atrasados (com "o mais antigo venceu há N dias"), Hoje, Próximos 7 dias, Até 30 dias | os mesmos grupos da lista (`NUCLEO.agdGrupos`); sem indicadores quando a leitura falhou sem trazer nada |
| Próxima melhor ação | 1 destaque (só se urgente ou importante) com as ações rápidas, até 3 linhas secundárias e "e mais N na lista abaixo" | `proximasSelecao()` (a régua de sempre, `NUCLEO.pri*`; a mesma do cartão do Início e do resumo falado) |
| Filtro por área | chips com a contagem (Todas, Família, Veículos, MBA…); só aparece se há mais de uma área | `NUCLEO.agdAreas` e `NUCLEO.agdFiltrar`; o filtro só mexe na lista e sobrevive a redesenhar a página |
| Lista agrupada | Atrasados · Hoje · Próximos 7 dias · Até 30 dias · Depois (até 120 dias) · Candidaturas sem retorno; cada linha é um link inteiro, com marca de prioridade, ícone da área, texto, "quando" (palavra + cor + marca) e as ações rápidas | `NUCLEO.agdGrupos`, `NUCLEO.agdQuando`, `NUCLEO.agdTom` |
| Próximos 14 dias | uma célula por dia (data, dia da semana e quantidade; mais azul = mais itens; toque mostra o detalhe) | `NUCLEO.agdSerie` |
| Por área | barras com a quantidade por área (kit de gráficos, toque mostra o valor) | `NUCLEO.agdAreas` e `rsBarras` |
| Novo lembrete | texto e data; grava em `PESSOAL.lembretes` como sempre | `pessoalGravar("lembretes", …)` |

## Regras preservadas (a conferir se mexer na página)

- **Leitura**: só por `agendaColetarLeitura()` (fonte da Agenda, `js/fonte-agenda.js`). A página não acessa o banco nem a rede por conta própria (há teste).
- **Grupos**: os critérios e a ordem de sempre (o teste `tests/nucleo.test.mjs` compara com os de antes, borda a borda). "Sem retorno" (follow-up com mais de 10 dias) **não é atraso**:
  fica no próprio grupo, sem alerta, com a explicação de sempre. O que passa de 120 dias continua fora da página, como antes.
- **Ações rápidas**: `proximaAcao` e `proximaAcoesDe` (js/sistema.js), os mesmos caminhos do funil e da Agenda. Feito = follow-up feito ou lembrete com `feito`; Adiar 3 dias = "fazer follow-up em" +3 dias;
  Sem retorno/Encerrar = resultado "sem retorno" + uma linha no histórico; nada é apagado. Depois do toque, os botões da linha ficam desligados até a página redesenhar (um toque duplo não adia duas vezes).
- **Leitura que falha não vira "nada"**: leitura parcial mostra "Agenda incompleta" com o texto de sempre; falha total mostra "Nenhum item na parte que foi lida (a leitura falhou…)" e **não** mostra indicadores zerados.
- **Próxima melhor ação**: a IA não participa; a página só mostra a seleção da régua. Falhou? Só esse cartão avisa ("Não consegui montar agora."), a lista segue.
- **Links**: do próprio site (`#…`) ou de fora **só http/https**, em outra aba e sem referência; qualquer outro destino não vira link.

## Onde está o código

| O quê | Arquivo |
|---|---|
| Tela (`renderAgenda`) | `js/agenda.js` (módulo próprio desde a DS-4.1; depende de `sistema`, `kit` e `graficos`, ver `MOD_DEPS` em `js/app.js`) |
| Agrupar, contar, resumir, série, áreas, filtro, peso da linha | `nucleo.js` (`AGD_GRUPOS`, `agdGrupos`, `agdQuando`, `agdResumo`, `agdFrase`, `agdSerie`, `agdAreas`, `agdFiltrar`, `agdTom`; puras) |
| Régua, ações rápidas e cartões do **Início** (`wProxima`, `wAgenda`) | `js/sistema.js`, **sem mudança** (o Início ainda é do desenho antigo, ver a questão D-12) |
| Leitura | `js/fonte-agenda.js` (`agendaColetarLeitura`) e `NUCLEO.agendaItens` |
| Componentes e CSS | `js/kit.js` (`rk*`), `css/rac.css` (esqueleto `.rh-*` do piloto + seção 5 "AGENDA", classes `.ag-*`) |
| Rota e menu | `js/rotas.js` (`agenda`: área Hoje, atalho `curto` na barra inferior do celular) |

## Testes que protegem

`tests/agenda_tela.test.mjs` (a tela de verdade num ambiente falso: abertura, indicadores, grupos, links, régua, ações rápidas, filtro, 14 dias, formulário, leitura parcial/vazia/falha, resposta atrasada, ausência de acesso próprio ao banco) ·
`tests/nucleo.test.mjs` (blocos `agd*`, com os critérios de antes copiados) · `tests/hoje.test.mjs` (régua, cartões do Início e ações rápidas) · `tests/rotas.test.mjs` (a rota carrega o módulo novo e o Sistema junto) ·
`tests/design_system.test.mjs` (ES5, nomes globais, sem cor escrita, cache offline).

## Limitações e o que vem depois

- O Início (`#inicio`) continua com os cartões antigos "Próxima melhor ação" e "Agenda" (questão D-12, Início × RAC Hoje, em aberto): migrar o Início é outra etapa.
- As classes `.rh-*` (abertura, indicadores, colunas 7/5) nasceram no piloto e foram **reaproveitadas** aqui; renomeá-las para um prefixo neutro é tarefa futura, sem mudança visual.
- Próxima área da DS-4: **Saúde** (não iniciada).
