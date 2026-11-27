---
titulo: iCloud: lista de pastas só é lida uma vez (Archive ficava sem tipo) e a recusa do excluir não dizia a causa
tipo: erro
categoria: inbox
tags: inbox, icloud, pastas, diagnostico
estado: ativo
origem: teste real do dono, 27/11/2026 10:19
data: 2026-11-27
relacionados: erro/icloud-arquivar-e-excluir-falham-sem-move-e-pastas-sem-atrib
---

## Causa

1) O app só chama listar_pastas quando a conta não tem pastas em cache (js/inbox.js, inboxSincronizarConta); a classificação por nome da função i4.4 (completarUsos) nunca foi reaplicada à conta existente, então Archive seguiu 'outra' e o app nem chamou o servidor (mensagem do próprio nucleo.js: não identificou a pasta de Arquivo). 2) Excluir chegou ao Worker p9.1 e voltou acao_recusada (HTTP 422, duas vezes) sem dizer se foi falta de Message-ID ou recusa do COPY.

## Solução

1) UPDATE de 2 linhas em inbox_pastas (Archive para arquivo e Junk para spam, só da conta iCloud, só se a conta não tinha esse uso), conferido por RETURNING. 2) Worker p9.2 e função i4.5: sem_message_id e copia_* (código de resposta do servidor, lista fechada) vão ao registro como detalhe; o usuário vê a mesma mensagem.

## Prevenção

Mudança que depende de dado já gravado (como a classificação de pastas) precisa de migração de dados ou de reaplicação explícita; testar também 'conta já existente', não só 'conta nova'. Um código de erro genérico deve ter causas distintas no registro.
