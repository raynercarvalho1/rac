---
titulo: Novo RAC: Lote 2 (Minha Casa) publicado e verificado (site 2026-11-27.3); 058 reconciliada
tipo: estado
categoria: projeto
tags: novo-rac, minha-casa, producao
estado: ativo
origem: Lote 2, 27/11/2026
data: 2026-11-27
relacionados: estado/novo-rac-lote-1-publicado-e-verificado-site-2026-11-27-2-mig
---

PR 120 mesclado (c4273ca), CI do PR verde, Pages success; dominio serve sw.js VERSAO 2026-11-27.3 e os arquivos novos identicos aos da main (site 2026-11-27.3): 10 widgets de Hoje, Saude e Compras, modelos e primeira utilizacao, ambientes no registro de rotas, Casa na barra do celular. Sem alteração de banco. Item 058: efeito ja estava aplicado (fiscal.nota em acoes_reais_casa e acoes_casa), o historico do Supabase nao a trazia; reconciliada reaplicando o mesmo texto idempotente (058_ligar_ia_fiscal_casa, versao 20261127204346), arrays identicos antes e depois. Falta a validacao do dono no iPhone e no computador (Casa na barra, toque longo para arrastar, dados reais); sem teste com login real.
