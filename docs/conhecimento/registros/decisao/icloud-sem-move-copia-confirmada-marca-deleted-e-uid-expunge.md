---
titulo: iCloud sem MOVE: cópia confirmada, marca \Deleted e UID EXPUNGE só com UIDPLUS
tipo: decisao
categoria: inbox
tags: inbox, icloud, imap
estado: ativo
origem: decisão do dono em 27/11/2026
data: 2026-11-27
relacionados: erro/icloud-arquivar-e-excluir-falham-sem-move-e-pastas-sem-atrib, decisao/inbox-lote-4-gmail-e-outlook-gerenciam-e-enviam-pelos-mesmos
---

## Motivo

O iCloud real não anuncia MOVE (acao_indisponivel no registro da função, 27/11/2026). O dono autorizou a alternativa: UID COPY de UM UID confirmada por busca do Message-ID no destino, UID STORE +FLAGS (\Deleted) e, só com UIDPLUS, UID EXPUNGE daquele UID; sem UIDPLUS a original fica apenas marcada e escondida e nada é expurgado. Nunca EXPUNGE global. A cópia só se repete se não existir (sem duplicata em nova tentativa); falha entre cópia e marca é acao_parcial e recuperável. Substitui a regra da I3.2 que proibia o caminho. O que o iCloud faz com a mensagem marcada só a validação real do dono mostra.
