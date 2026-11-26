-- 068 · Monitor M3/M4: leitura POR COLUNA para o service_role. APLICADA EM PRODUÇÃO em 26/11/2026 (conferida por leitura: SELECT por coluna; resumo da rotina e endereço das contas continuam fechados). Pode rodar de novo sem erro.
-- Por quê: a view/função monitor_processos_em (067) e a Edge Function monitor-alerta leem estas tabelas como service_role, que NÃO tinha SELECT nelas (o ensaio em
-- produção respondeu 500 por permissão negada; o teste local não pegou porque o PGlite dava tudo ao service_role: o harness agora imita a produção).
-- O que faz: concede SELECT só nas colunas que o Monitor usa (mínimo necessário). NÃO libera `resumo` da rotina nem o endereço de e-mail das contas, não concede
-- escrita e não muda nenhuma política, trava ou dado. Radar, Newsletter, membros e push_inscricoes já eram legíveis pelo service_role.
begin;
grant select (user_id, quando, ok) on public.rotina_log to service_role;
grant select (id, dono, sync_auto) on public.inbox_contas to service_role;
grant select (dono, conta_id, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro) on public.inbox_sincronizacao to service_role;
grant select (user_id, atualizado_em) on public.notas_fiscais_entradas to service_role;

do $$
begin
  if not (has_column_privilege('service_role', 'public.rotina_log', 'quando', 'select') and has_column_privilege('service_role', 'public.inbox_sincronizacao', 'falhas_seguidas', 'select')
          and has_column_privilege('service_role', 'public.inbox_contas', 'sync_auto', 'select') and has_column_privilege('service_role', 'public.notas_fiscais_entradas', 'atualizado_em', 'select')) then
    raise exception 'a leitura por coluna não ficou como esperado';
  end if;
  if has_column_privilege('service_role', 'public.rotina_log', 'resumo', 'select') or has_column_privilege('service_role', 'public.inbox_contas', 'endereco', 'select') then
    raise exception 'o service_role não deveria ler resumo nem endereço';
  end if;
end $$;
commit;
notify pgrst, 'reload schema';
