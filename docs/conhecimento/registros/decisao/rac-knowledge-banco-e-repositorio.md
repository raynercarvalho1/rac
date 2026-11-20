---
titulo: RAC Knowledge: Supabase guarda, o repositório é a ponte com os agentes
tipo: decisao
categoria: arquitetura
tags: knowledge, agentes, supabase
estado: ativo
origem: docs/conhecimento.md
data: 2026-11-20
---

Os agentes não têm acesso ao banco (sem credencial, `psql` e CLI negados). O banco guarda o conhecimento e serve o celular; o repositório (`docs/conhecimento/`) é a ponte: o agente lê e escreve arquivos `.md` por Git e o dono importa para o banco com um toque. Nenhuma Edge Function nova, nenhum segredo no navegador.

## Motivo

Mecanismo seguro e prático sem ampliar privilégios: tudo o que o agente escreve passa por PR e revisão; tudo o que entra no banco é por clique do dono autenticado com MFA.
