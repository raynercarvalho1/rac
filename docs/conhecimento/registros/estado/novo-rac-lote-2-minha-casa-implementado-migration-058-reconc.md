---
titulo: Novo RAC: Lote 2 (Minha Casa) implementado; migration 058 reconciliada no historico do Supabase
tipo: estado
categoria: projeto
tags: novo-rac, minha-casa, producao
estado: ativo
origem: Lote 2, 27/11/2026
data: 2026-11-27
relacionados: estado/novo-rac-lote-1-publicado-e-verificado-site-2026-11-27-2-mig
---

Implementado e testado no branch claude/minha-casa-lote-2-v1rnig (site 2026-11-27.3): 10 widgets de Hoje, Saude e Compras, modelos e primeira utilizacao, ambientes no registro de rotas, Casa na barra do celular. Sem migration nova. Migration 058: efeito ja estava em producao (fiscal.nota em acoes_reais_casa e acoes_casa), historico do Supabase nao a trazia; reconciliada com apply_migration do mesmo texto idempotente (058_ligar_ia_fiscal_casa, versao 20261127204346), arrays identicos antes e depois. Publicacao e validacao do dono no iPhone: ver historico diario.
