-- PROPOSTA 044 · NÃO APLICADA EM PRODUÇÃO (Radar de Preços, Lote 2). Só o dono roda, no SQL Editor, e só depois de decidir usar a IA do Radar. Pode rodar de novo sem erro.
-- Radar (docs/radar.md): permite a ação radar.equivalencia (compara o produto cadastrado com um anúncio e SUGERE equivalência; Haiku 5.5) em REAL, só para o dono.
--   1) o banco passa a aceitar 'radar.equivalencia' em acoes_reais (continua aceitando abastecimento, Newsletter, RAC Hoje e fiscal.nota);
--   2) radar.equivalencia nunca vale para quem é da casa (acoes_reais_casa): a Fernanda não vê nem usa o Radar;
--   3) NÃO liga a ação: acoes_reais fica como está. Para ligar, o dono acrescenta 'radar.equivalencia' (update no fim, comentado), com a casa já em REAL e a rac-ia republicada.
-- Não cria tabela, não muda RLS, não toca em radar_*. O consumo entra em ia_uso (modulo 'radar'), dentro do mesmo limite mensal da IA. Cada chamada é paga (Haiku):
-- ela só acontece quando o dono toca em "Pedir sugestão da IA", nunca sozinha, sem repetição automática.
-- Ordem: este arquivo → republicar a rac-ia → (opcional) ligar a ação. Se o 016, o 020, o 028 ou o 036 rodarem de novo, rode este logo depois (eles voltam a lista do que o banco aceita).
begin;

alter table public.ia_config drop constraint if exists ia_config_acoes_reais_permitidas;
alter table public.ia_config add constraint ia_config_acoes_reais_permitidas
  check (acoes_reais <@ array['abastecimento.interpretar', 'newsletter.resumo', 'hoje.analise', 'fiscal.nota', 'radar.equivalencia']::text[]);
alter table public.ia_config drop constraint if exists ia_config_radar_so_dono;
alter table public.ia_config add constraint ia_config_radar_so_dono
  check (not ('radar.equivalencia' = any (acoes_reais_casa)));

commit;

-- para LIGAR (só com a casa em REAL e a rac-ia republicada; não faz parte deste arquivo):
--   update public.ia_config set acoes_reais = array_append(acoes_reais, 'radar.equivalencia'), atualizado_em = now()
--    where modo = 'REAL' and not ('radar.equivalencia' = any (acoes_reais));
-- conferir depois (só leitura):
--   select modo, acoes_reais, acoes_reais_casa, limite_brl from public.ia_config;
