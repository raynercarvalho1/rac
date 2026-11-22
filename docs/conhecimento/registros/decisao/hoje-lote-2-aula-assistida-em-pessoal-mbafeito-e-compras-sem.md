---
titulo: Hoje, Lote 2: aula assistida em PESSOAL.mbaFeito e compras sem quem lançou
tipo: decisao
categoria: codigo
tags: hoje, mba, compras, reestruturacao
estado: ativo
origem: reestruturação visual, Lote 2, 22/11/2026
data: 2026-11-22
---

## Motivo

O dono quer ver no Hoje a aula não assistida, a avaliação pendente, as últimas compras e o último treino. Aula assistida passa a ser a marca au:<id> em PESSOAL.mbaFeito, junto de av:<id> e pg:<k>: usa a tabela pessoal que já existe, entra no backup e não exige SQL. A tabela compras tem data, loja, número da nota e valor, mas nenhum campo de quem lançou, então as Últimas compras mostram as notas de vocês dois sem essa marca; mostrá-la exigiria coluna nova (SQL em produção, decisão do dono). O mapa do Garmin não é carregado no Hoje: a última atividade leva à página do treino. Contas puras em nucleo.js (mbaHojeResumo, mkUltimasNotas, hojeTreinoLinha).
