---
titulo: Novo RAC: Lote 4 (Captura, Caixa e Biblioteca) implementado; migration 071 aplicada e conferida em produção (site 2026-11-28.1 em PR)
tipo: estado
categoria: codigo
tags: captura, biblioteca, novo-rac
estado: ativo
origem: Lote 4, 28/11/2026
data: 2026-11-28
relacionados: estado/novo-rac-lote-3-timeline-e-busca-global-implementado-e-testa
---

Migration 071 (captura_itens, biblioteca_itens, bucket privado captura, função cap_arquivo_pode e políticas de Storage com trava mfa) aplicada em produção em 28/11/2026 pelo Supabase e conferida por leitura: RLS e mfa nas 2 tabelas, 5 políticas no storage.objects, bucket privado de 50 MB, anon sem acesso, nenhum cofre público, 2 linhas no catálogo. Código: js/captura.js, js/biblioteca.js, js/prov-biblioteca.js, js/prov-captura.js, nucleo.js (cp* e bib*), rotas #caixa e #biblioteca, widget captura.caixa. Site 2026-11-28.1: o estado de PR, CI, merge e publicação está no histórico diário. Pendente do dono: validar no iPhone (câmera, galeria, offline). Fora do lote: IA na classificação, OCR, migração de pessoal.salvos, arquivo pelo Share Target. Este registro supera estado/novo-rac-lote-3-timeline-e-busca-global-implementado-e-testa.
