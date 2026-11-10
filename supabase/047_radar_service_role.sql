-- Aplicado em produção em 10/11/2026 (conferido: service_role com os privilégios mínimos nas 6 tabelas, anon sem nenhum, 12 políticas intactas; a rodada manual voltou HTTP 200 em vez do 500 com 42501).
-- 047 · Radar de Preços: privilégios do service_role (a Edge Function "radar" e a rotina). Depois disparar a rotina uma vez (docs/radar.md).
-- Por que existe: a 043 criou as seis tabelas do Radar e concedeu privilégios só ao "authenticated". Neste projeto o service_role não herda privilégio de tabela (cada migration anterior concede o seu: 012, 013, 014, 018, 024, 025, 030 a 033),
--   então a rotina falhava em rotina_listar_donos com 42501 "permission denied for table radar_lojas". service_role ignora RLS, mas precisa do privilégio de tabela.
-- O que faz (só concede, o mínimo que a função usa em supabase/functions/radar/index.ts):
--   select              radar_lojas, radar_ofertas, radar_itens      (lojas dos donos, ofertas, itens monitorados)
--   select, insert, update   radar_coletas                           (abrir e fechar a coleta)
--   select, insert           radar_precos                            (histórico só de acréscimo: NENHUM update nem delete)
-- O que NÃO faz: não mexe em anon, public nem authenticated; não cria nem altera política RLS, trava "mfa", gatilho, tabela, coluna ou dado; radar_config não é concedida (a função não a usa).
--   Membros (a casa) continuam fora da rotina: o filtro está na função (index.ts) e as políticas "so o dono" seguem valendo para quem usa o site.
-- Pode rodar de novo sem estragar nada. Rollback: revoke select on public.radar_lojas, public.radar_ofertas, public.radar_itens from service_role; revoke select, insert, update on public.radar_coletas from service_role; revoke select, insert on public.radar_precos from service_role;
-- Conferir depois (só leitura): supabase/conferencias/047_conferir_producao.sql
begin;

grant select on public.radar_lojas, public.radar_ofertas, public.radar_itens to service_role;
grant select, insert, update on public.radar_coletas to service_role;
grant select, insert on public.radar_precos to service_role;

commit;
