-- 065 · Rotas simplificadas dos treinos (Lote 3, mapa geral de percursos). APLICADA EM PRODUÇÃO em 23/11/2026 (migration 20261123160345, informado pelo dono); aditiva e pode rodar de novo sem erro.
-- PENDENTE em produção: o GRANT da service_role (última linha do bloco de grants, abaixo). A aplicação de 23/11 saiu sem ele e a rotina diária (service_role) não conseguiria ler nem gravar; rode este arquivo de novo ou só a linha do grant.
-- O que muda: tabela NOVA public.garmin_rotas, uma linha por treino (id = garmin_ativ.id): até 150 pontos [lat, lon] com 5 casas (cerca de 1 m).
--   Quem grava é a função "garmin" (tipo "rotas" e a rotina diária), em nome do dono. Treino sem GPS grava pontos = [] (não é pedido de novo).
-- Não muda: nenhuma linha existente de nenhuma tabela; garmin_dia e garmin_ativ ficam como estão. Só o dono lê e grava (a casa/Fernanda fica de fora),
--   com a trava restritiva "mfa"; nada para anon. Sem coordenadas em nenhum outro lugar.
-- Rollback: drop table public.garmin_rotas; (as rotas se refazem pelo botão do mapa geral).
-- Requer a 007 (garmin), a 002 (membros) e a 022 (rac_aal_ok).
begin;

create table if not exists public.garmin_rotas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id      bigint not null,
  pontos  jsonb not null default '[]'::jsonb check (jsonb_typeof(pontos) = 'array' and jsonb_array_length(pontos) <= 150),
  qtd     integer not null default 0 check (qtd >= 0 and qtd <= 150),
  criado  timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['garmin_rotas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for all to authenticated
      using (user_id = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))
      with check (user_id = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon', t);
  end loop;
end $$;
grant select, insert, update, delete on public.garmin_rotas to authenticated;
grant select, insert, update on public.garmin_rotas to service_role;   -- a rotina diária da função garmin grava como service_role (igual à garmin_ativ)

-- catálogo da auditoria (050), quando existir
do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('garmin_rotas', true, true, '065', 'Rotas simplificadas dos treinos (até 150 pontos), para o mapa geral; só o dono')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
