---
titulo: Novo RAC Lote 4: Captura universal e Biblioteca usam a fila de sempre, classificam sem IA e só encaminham com confirmação
tipo: decisao
categoria: codigo
tags: captura, biblioteca, novo-rac
estado: ativo
origem: Lote 4, 28/11/2026
data: 2026-11-28
---

Captura em captura_itens (privada do autor, id gerado no aparelho) e Biblioteca em biblioteca_itens (por espaço, só referências; arquivo no bucket privado captura, documentos da Família e da Central Fiscal apontados, nunca copiados). Uma fila só: bancoOuFila ganhou a ação upsert (ignora repetido), arquivos guardados no aparelho (IndexedDB) e a marca reter (erro que repetir não resolve fica na fila com o motivo, para em 3 tentativas, e a Caixa oferece Tentar novamente). Classificação determinística em NUCLEO.cpClassificar: só sugere; a primeira regra vence (nota fiscal, link, compra, data e hora, #projeto, anexo, nota) e as outras viram alternativas. Confirmar cria o registro no módulo com a gravação que ele já tem; a Biblioteca usa o mesmo id da captura; Desfazer remove só o que foi criado. O botão + do dono existe em toda tela (antes sumia sem ação) e a Fernanda mantém a folha de antes. Share Target continua em GET (texto e link); arquivo pelo sistema ficou fora porque POST exigiria o service worker e o iOS não tem Share Target. Um anexo por captura na interface. Bucket captura próprio (pasta espaço/autor/pasta) em vez de reaproveitar familia.

## Motivo

Pedido do dono no Lote 4 (28/11/2026): captura universal sem segunda fila, sem IA e sem cópias; Documentos 15, 18 e 19 (seção 9).
