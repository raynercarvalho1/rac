-- CONFERÊNCIA SÓ DE LEITURA da 047 (Radar: privilégios do service_role). Um único resultado; deve dar exatamente o esperado em cada linha. Não mostra dado nenhum, só privilégios.
select jsonb_pretty(jsonb_build_object(
  'service_role', (select jsonb_object_agg(t, (select coalesce(jsonb_agg(p order by p), '[]') from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('service_role', 'public.' || t, p)))
                     from unnest(array['radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos']) t),
  'esperado_service_role', jsonb_build_object('radar_config', '[]', 'radar_lojas', '["SELECT"]', 'radar_itens', '["SELECT"]', 'radar_ofertas', '["SELECT"]', 'radar_coletas', '["INSERT","SELECT","UPDATE"]', 'radar_precos', '["INSERT","SELECT"]'),
  'anon_tem_algum_privilegio', (select bool_or(has_table_privilege('anon', 'public.' || t, 'SELECT') or has_table_privilege('anon', 'public.' || t, 'INSERT') or has_table_privilege('anon', 'public.' || t, 'UPDATE') or has_table_privilege('anon', 'public.' || t, 'DELETE'))
                                  from unnest(array['radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos']) t),
  'politicas_radar', (select count(*) from pg_policies where schemaname = 'public' and tablename like 'radar\_%')
)) as conferencia;
