---
titulo: Corrigir o endereço de uma conta OAuth do Inbox
tipo: procedimento
categoria: inbox
tags: inbox, oauth, supabase
estado: ativo
origem: sessão 21/11/2026
data: 2026-11-21
---

O endereço cadastrado em inbox_contas.endereco é a identidade esperada: a função compara com o e-mail devolvido pela Microsoft ou pelo Google e recusa com oauth_conta_divergente se for outro. Para corrigir um endereço errado: com autorização explícita do dono, UPDATE de uma linha por id, com trava no valor antigo (conta ainda em estado nova, sem credencial); depois o dono reconecta pela tela. Nunca gravar o e-mail do provedor por cima do cadastro sem a conta ter autorizado com ele.
