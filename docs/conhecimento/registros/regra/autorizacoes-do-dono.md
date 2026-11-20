---
titulo: Autorizações do dono: produção, funções, segredos e IA paga
tipo: regra
categoria: seguranca
tags: autorizacao, producao, secrets
estado: ativo
origem: CLAUDE.md (AUTORIZAÇÕES DO PROPRIETÁRIO)
data: 2026-11-20
---

Sem autorização explícita do dono, naquela sessão: não executar SQL em produção, não publicar Edge Functions, não alterar secrets, cobrança ou limites financeiros (`ia_config`, teto, Console da Anthropic) e não fazer chamada paga de IA. Merge e publicação só quando previstos no lote. Não ampliar o escopo e não descartar trabalho local de outra tarefa (`git reset`, `git clean`, checkout que apaga).
