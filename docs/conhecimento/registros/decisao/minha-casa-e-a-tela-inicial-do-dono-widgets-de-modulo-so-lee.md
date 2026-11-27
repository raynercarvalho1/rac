---
titulo: Minha Casa e a tela inicial do dono; widgets de modulo so leem
tipo: decisao
categoria: projeto
tags: novo-rac, minha-casa, workspace, navegacao
estado: ativo
origem: Lote 2, 27/11/2026
data: 2026-11-27
relacionados: decisao/novo-rac-arquitetura-aprovada-no-lote-0-espacos-workspace-em
---

## Motivo

Briefing do Lote 2: ao abrir o RAC o usuario encontra o proprio ambiente. rotaInicial() do dono passou de rachoje para workspace (titulo Minha Casa; id tecnico mantido); o RAC Hoje segue no menu, na barra e em #rachoje; a Fernanda nao muda (Lote 8). A barra do celular ganhou a Casa na frente (7 itens, nenhum atalho saiu), a validar pelo dono no iPhone. Dez widgets em js/widgets-modulos.js leem so pelas fontes (agenda, saude) ou pelas tabelas compras e lista, sem tabela de copia; Saude e Hoje sao privados (o motor recusa antes de ler; RLS de garmin_* so do dono). Ambientes: campo ambiente em toda rota e RAC_AMBIENTES, so a Minha Casa aparece. Primeira vez: boas-vindas com modelos Meu dia, Casa completa e Em branco, nada criado sem escolha. Alternativas e Grill Me: docs/planejamento/19 secao 7.
