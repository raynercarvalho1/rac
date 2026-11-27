---
titulo: Novo RAC: Lote 3 (Timeline e Busca global) publicado no Pages (site 2026-11-27.4; CI da main vermelho por teste de navegador intermitente, ver historico)
tipo: estado
categoria: projeto
tags: novo-rac, timeline, busca, lote-3
estado: ativo
origem: Lote 3, 27/11/2026
data: 2026-11-27
relacionados: estado/novo-rac-lote-2-minha-casa-implementado-migration-058-reconc
---

PR 122 mesclado (3de0244), CI do PR verde, Pages success; dominio serve sw.js VERSAO 2026-11-27.4 e 20 arquivos identicos aos da main; fumaca no Chromium contra o site real sem erros (site 2026-11-27.4): Timeline com 9 provedores de eventos, Busca global sobre 14 provedores, widget timeline.recente, ambientes com a Timeline, icone de busca no celular (so dono), barra inferior intacta. Sem alteracao de banco: indices existentes e planos lidos no Supabase. Testes novos: timeline_nucleo, timeline_prov (RLS de dois usuarios, 10 mil registros), timeline_tela e timeline_visual (Chromium). Falta a validacao do dono no iPhone e no computador com dados reais (sem teste com login real).
