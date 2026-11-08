-- NÃO aplicado em produção (Lote 1.4, 08/11/2026). Proposta para o dono rodar no SQL Editor; pode rodar de novo sem erro.
-- Central Fiscal (docs/fiscal.md): permite a ação fiscal.nota (leitura de nota em foto/PDF, Sonnet 5.5) em REAL, só para o dono.
--   1) o banco passa a aceitar 'fiscal.nota' em acoes_reais (continua aceitando abastecimento, Newsletter e RAC Hoje);
--   2) fiscal.nota nunca vale para quem é da casa (acoes_reais_casa): a Fernanda não vê nem usa a leitura por IA;
--   3) NÃO liga a ação: acoes_reais fica como está. Para ligar, depois do primeiro teste controlado, o dono acrescenta 'fiscal.nota' em
--      acoes_reais (update no fim deste arquivo, comentado), com a casa já em REAL e a rac-ia republicada com este código.
-- Não cria tabela, não muda RLS, não toca em notas_fiscais*. O consumo entra em ia_uso (modulo 'fiscal'), dentro do mesmo limite mensal.
-- Ordem: rodar este arquivo, republicar a rac-ia e só então usar o botão no site (antes disso o botão responde que não está liberado).
-- Se o 016, o 020 ou o 028 forem rodados de novo, rode este logo depois (eles voltam a lista do que o banco aceita).
begin;

alter table public.ia_config drop constraint if exists ia_config_acoes_reais_permitidas;
alter table public.ia_config add constraint ia_config_acoes_reais_permitidas
  check (acoes_reais <@ array['abastecimento.interpretar', 'newsletter.resumo', 'hoje.analise', 'fiscal.nota']::text[]);
alter table public.ia_config drop constraint if exists ia_config_fiscal_so_dono;
alter table public.ia_config add constraint ia_config_fiscal_so_dono
  check (not ('fiscal.nota' = any (acoes_reais_casa)));

commit;

-- para LIGAR (só depois do teste controlado e com a casa em REAL; não faz parte deste arquivo):
--   update public.ia_config set acoes_reais = array_append(acoes_reais, 'fiscal.nota'), atualizado_em = now()
--    where modo = 'REAL' and not ('fiscal.nota' = any (acoes_reais));
-- conferir depois (só leitura):
--   select modo, acoes_reais, acoes_reais_casa, limite_brl from public.ia_config;
