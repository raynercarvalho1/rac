---
titulo: iCloud: arquivar e excluir falham (sem MOVE e pastas sem atributo especial)
tipo: erro
categoria: inbox
tags: inbox, icloud, imap
estado: ativo
origem: 27/11/2026, function_logs e inbox_pastas
data: 2026-11-27
relacionados: decisao/inbox-lote-4-gmail-e-outlook-gerenciam-e-enviam-pelos-mesmos
---

## Causa

Excluir: o registro da função mostrou organizar_mensagem com acao_indisponivel (422); no Worker esse código só sai quando o servidor não anuncia MOVE depois do login, então o iCloud real não tem MOVE. Arquivar: a pasta Archive (e Junk) chega do iCloud com uso 'outra', sem atributo especial; sem pasta de uso arquivo a função responde destino_ausente antes de chamar o Worker. As falhas nunca foram vistas antes porque a I3.2 só tinha testes simulados.

## Solução

Em código (rac-inbox@i4.4, não publicado): completarUsos classifica Archive, Junk e Deleted Messages por nome fechado quando o servidor não informou o uso; organizar.ts registra sem_move_com_uidplus ou sem_move_sem_uidplus. Mover de verdade no iCloud segue sem caminho seguro: COPY + UID STORE Deleted + UID EXPUNGE só com UIDPLUS e decisão do dono, porque a regra da I3.2 o proíbe.

## Prevenção

Recurso de provedor que só existe em simulação não é validado: provar no real antes de declarar pronto. Ler primeiro function_logs (JSON rac_inbox com operacao e codigo) e inbox_pastas antes de supor a causa.
