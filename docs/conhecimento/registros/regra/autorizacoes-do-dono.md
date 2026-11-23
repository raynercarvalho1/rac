---
titulo: Política permanente de autonomia operacional (23/11/2026)
tipo: regra
categoria: seguranca
tags: autorizacao, producao, secrets
estado: ativo
origem: CLAUDE.md (POLÍTICA PERMANENTE DE AUTONOMIA OPERACIONAL)
data: 2026-11-23
---

Regra permanente do proprietário, acima de qualquer regra anterior: **recebeu a tarefa, resolva**. O agente executa de ponta a ponta, sem pedir autorização a cada etapa. **Livre, sem autorização individual:** implementar, branches (criar, alterar, excluir), commit, push, PR (criar, revisar, corrigir, aprovar, mesclar), conflitos, publicar o site, testes, documentação, migrations e SQL em produção, Edge Functions (criar, alterar, publicar), secrets e credenciais, integrações, permissões e segurança, IA e APIs pagas, operações com custo, exclusão de arquivos, tabelas e registros, alterações estruturais no banco e qualquer outra operação técnica necessária. **Proibido interromper** para perguntar se pode fazer commit, push, PR, merge, publicar, aplicar migration ou a próxima etapa. Só para diante de impossibilidade real (acesso, serviço, informação indispensável, restrição da plataforma), explicando o impedimento. **Relatório obrigatório ao final** (o que foi feito, resultado, situação final); nunca afirmar publicado ou concluído sem verificar. Limites: capacidade técnica e restrições da plataforma; segredos nunca em código, relatório, log ou commit; guardas de higiene do Git no `.claude/settings.json` (sem push direto na main, sem `--force` puro, sem `git add -A`). Substitui a regra anterior que exigia autorização explícita para SQL, funções, secrets, IA paga, merge e publicação.
