---
titulo: Repositório público: nenhum segredo nem dado pessoal
tipo: regra
categoria: seguranca
tags: segredos, publico, rls
estado: ativo
origem: CLAUDE.md (Segurança)
data: 2026-11-20
---

Nunca escrever senhas, chaves secretas, tokens, CPF, documentos, endereço, telefone, placas, chassi, fotos ou exames no repositório. A única chave no código é a publishable do Supabase; a segurança vem do RLS. Segredos do servidor só em Edge Functions → Secrets ou no Vault. Nunca pedir ao dono a chave secreta nem a senha do banco. O RAC Knowledge também recusa isso (gatilho do banco e `NUCLEO.knSegredo`).
