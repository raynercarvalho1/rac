---
titulo: Inbox encerrado nesta frente: arquivar no iCloud funciona, excluir no iCloud fora do escopo (27/11/2026)
tipo: estado
categoria: inbox
tags: inbox, icloud
estado: ativo
origem: teste real do dono em 27/11/2026
data: 2026-11-27
relacionados: decisao/icloud-sem-move-copia-confirmada-marca-deleted-e-uid-expunge, estado/inbox-em-producao-nos-tres-provedores-icloud-sem-excluir-e-a
---

Producao: Worker rac-inbox-worker@p9.2 e funcao rac-inbox v21 (codigo i4.4); repositorio em i4.5, nao publicada. iCloud: enviar, responder a todos, encaminhar e ARQUIVAR validados pelo dono; EXCLUIR continua falhando, causa nao identificada (hipoteses: COPY recusado para Deleted Messages, busca lenta na lixeira, identificador invalido), e o dono decidiu deixar fora do escopo. Gmail e Outlook completos. Para retomar o excluir: publicar a i4.5 e ler o detalhe no registro da funcao. Pendente do roadmap: migracao de Compras e Carreira do gmApi (nao iniciada) e depois o RAC Financeiro Inteligente. Este registro supera estado/inbox-em-producao-nos-tres-provedores-icloud-sem-excluir-e-a.
