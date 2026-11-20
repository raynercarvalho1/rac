---
titulo: Configurar Google Cloud e Microsoft Entra para o Inbox
tipo: procedimento
categoria: inbox
tags: inbox, oauth, configuracao
estado: ativo
origem: docs/inbox.md (I4)
data: 2026-11-20
---

Redirect URI único https://raynercarvalho.com.br/ nos dois consoles. Google: Gmail API ativa, app Externo, usuários de teste = as duas contas, escopo gmail.modify (restrito; modo Teste expira o refresh em 7 dias), cliente Web. Microsoft: registro com contas organizacionais e pessoais, Graph delegado Mail.ReadWrite, Mail.Send, offline_access, segredo do cliente. Secrets da função: GOOGLE_OAUTH_CLIENT_ID/SECRET, MS_OAUTH_CLIENT_ID/SECRET, RAC_OAUTH_REDIRECT_URI. Depois aplicar a 063 e republicar rac-inbox@i4.0. Passo a passo em docs/inbox.md (I4).
