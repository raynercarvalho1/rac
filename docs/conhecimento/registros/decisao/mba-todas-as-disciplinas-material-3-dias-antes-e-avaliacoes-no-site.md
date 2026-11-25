---
titulo: MBA: todas as disciplinas, lembrete do material 3 dias antes e cadastro de avaliações
tipo: decisao
categoria: mba
tags: mba, estudos, hoje
estado: ativo
origem: pedido do dono 25/11/2026, versão 2026-11-25.2
data: 2026-11-25
---

A tela do MBA (js/mba.js) mostra todas as disciplinas, inclusive as próximas só com as datas das aulas. Disciplina com todos os tópicos marcados conta como concluída sozinha (mbaStatusDe) e abre recolhida; o Onde parei vai para a próxima. O material de cada aula só sai no portal cerca de 3 dias antes (aulas às terças): NUCLEO.mbaMaterialPendente lembra no Hoje e na página do MBA, até o dono marcar Material conferido (mbaFeito mat:<id>); palestras ficam de fora. Avaliações e atividades ganharam um formulário de cadastro na própria tela (grava junto das avaliações do MBA, em mba.avaliacoes). A importação do .json agora junta aulas e avaliações por id, sem apagar o cadastrado no site.

## Motivo

Pedido do dono: só a Estatística aparecia porque o mba.json de 28/10 tinha roteiro só dela e a tela escondia disciplina sem roteiro. O conteúdo de Python e BI veio do Drive do dono (script das aulas e slides) e foi conferido por ele.

## Cuidado

O mba.json fica fora do repositório (público): tem valores de mensalidade, links de aula com código e dados do aluno (nada disso vai ao Git). Provas e atividades reais vêm do portal, que o agente não acessa: o dono cadastra pelo formulário ou manda print.
