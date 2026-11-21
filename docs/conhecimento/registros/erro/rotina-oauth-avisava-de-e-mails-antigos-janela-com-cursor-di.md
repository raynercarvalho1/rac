---
titulo: Rotina OAuth avisava de e-mails antigos: janela com cursor diferente da do estado
tipo: erro
categoria: inbox
tags: inbox, gmail, outlook, rotina, aviso
estado: ativo
origem: revisão do lote 4 (21/11/2026)
data: 2026-11-21
---

## Causa

Os adaptadores do Gmail e do Outlook calculavam o cursor (uidnext) pela janela das 50 mais novas, mas, com desde_uid, o sync.ts pedia até 100 e os adaptadores numeravam todas as mensagens ainda sem uid, inclusive as das posições 51 a 100. Essas linhas entravam como novas e disparavam avisos; a releitura de hora em hora as apagava e o ciclo se repetia. Os mocks dos testes ignoravam o limite e por isso nada falhava.

## Solução

Com desde_uid os adaptadores usam a mesma janela de 50 do estado_pasta e devolvem mais=false. Teste de regressão com 80 mensagens e mocks que respeitam maxResults/$top (tests/inbox_automatico_oauth).

## Prevenção

Todo mock de provedor deve respeitar o limite de página; o cursor e a lista devem usar sempre a mesma janela; testar caixa com mais mensagens que a janela.
