-- Aplicado em produção em 20/11/2026 (conferido: RLS nas duas tabelas, anon e service_role sem privilégio, histórico só SELECT, sem DELETE pelo site, políticas "so o dono" e "mfa" RESTRICTIVE, gatilho ligado, funções fechadas, 0 registros).
-- RAC Knowledge (docs/conhecimento.md): memória técnica permanente do projeto (regras, decisões, erros e soluções, procedimentos, estado e diário).
-- Aplicada pelo Claude Code via Supabase MCP (apply_migration, sem as linhas begin/commit), por autorização do dono. Pode rodar de novo sem estragar nada.
-- Ordem: depois da 022 (rac_aal_ok) e da 051 (membros já existe desde antes). Não depende da 050: se o catálogo de auditoria ainda não existir, só avisa.
--
-- O QUE CRIA
--   1) public.conhecimento           os registros. Só o dono lê e grava (RLS "so o dono" + trava "mfa"); a casa (Fernanda) fica de fora; anon e service_role sem acesso.
--   2) public.conhecimento_historico cada versão ANTERIOR de um registro (e o registro apagado). O site só LÊ: quem grava é o gatilho, então o histórico não se burla pelo site.
--   3) gatilho conhecimento_guarda   mantém versão e data, impede trocar o dono, normaliza as tags, guarda o histórico e RECUSA texto que pareça segredo
--                                    (chave da Anthropic, do Supabase, do GitHub, JWT, chave privada, CPF): o registro é público no repositório depois de exportado.
-- O QUE NÃO FAZ: não apaga nem migra nenhum dado existente; não mexe em nenhuma tabela, política ou função que já existe; não cria função chamável pelo site.
begin;

-- 1) detector de segredo (só o gatilho usa; ninguém de fora executa)
create or replace function public.conhecimento_segredo(t text) returns boolean
  language sql immutable set search_path = '' as $$
  select coalesce(
       t ~ 'sk-ant-[A-Za-z0-9_-]{20,}'
    or t ~ 'sb_secret_[A-Za-z0-9_-]{10,}'
    or t ~ 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    or t ~ 'gh[pousr]_[A-Za-z0-9]{30,}'
    or t ~ 'github_pat_[A-Za-z0-9_]{30,}'
    or t ~ 'AIza[A-Za-z0-9_-]{30,}'
    or t ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    or t ~ '\d{3}\.\d{3}\.\d{3}-\d{2}', false)
$$;
revoke all on function public.conhecimento_segredo(text) from public, anon, authenticated, service_role;

-- 2) os registros
create table if not exists public.conhecimento (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null check (tipo in ('regra', 'decisao', 'erro', 'procedimento', 'estado', 'diario')),
  titulo          text not null check (char_length(btrim(titulo)) between 3 and 200),
  conteudo        text not null default '' check (char_length(conteudo) <= 20000),
  motivo          text check (motivo is null or char_length(motivo) <= 4000),        -- decisão: por que
  causa           text check (causa is null or char_length(causa) <= 4000),          -- erro: causa-raiz
  solucao         text check (solucao is null or char_length(solucao) <= 4000),      -- erro: correção
  prevencao       text check (prevencao is null or char_length(prevencao) <= 4000),  -- erro: como evitar de novo
  categoria       text check (categoria is null or char_length(categoria) between 1 and 60),
  tags            text[] not null default '{}' check (cardinality(tags) <= 12),
  estado          text not null default 'ativo' check (estado in ('ativo', 'resolvido', 'substituido', 'arquivado')),
  origem          text check (origem is null or char_length(origem) <= 300),         -- arquivo, PR, commit, migration ou lote
  relacionados    uuid[] not null default '{}' check (cardinality(relacionados) <= 30),
  data_ref        date not null default current_date,                                  -- a data a que o registro se refere (diário, decisão)
  ref_externa     text check (ref_externa is null or ref_externa ~ '^[a-z]+/[a-z0-9][a-z0-9._-]{2,100}$'),   -- "tipo/slug" do arquivo em docs/conhecimento/ (ponte com o repositório)
  origem_hash     text check (origem_hash is null or origem_hash ~ '^[0-9a-f]{64}$'), -- sha256 do arquivo na última importação
  editado_no_site boolean not null default false,                                      -- true = alterado pelo site depois da importação (a importação não sobrescreve)
  versao          integer not null default 1 check (versao >= 1),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (id, dono)
);
create unique index if not exists conhecimento_ref_unica on public.conhecimento (dono, ref_externa) where ref_externa is not null;
create index if not exists conhecimento_dono_tipo on public.conhecimento (dono, tipo, estado);

-- 3) o histórico: sem chave estrangeira de propósito (sobrevive à exclusão do registro)
create table if not exists public.conhecimento_historico (
  id               uuid primary key default gen_random_uuid(),
  conhecimento_id  uuid not null,
  dono             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  versao           integer not null check (versao >= 1),
  operacao         text not null check (operacao in ('atualizacao', 'exclusao')),
  snapshot         jsonb not null,
  criado_em        timestamptz not null default now()
);
create index if not exists conhecimento_historico_reg on public.conhecimento_historico (dono, conhecimento_id, versao desc);

-- 4) o gatilho: roda como dono da função (security definer) para gravar o histórico sem dar escrita ao site
create or replace function public.conhecimento_guarda() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.conhecimento_historico (conhecimento_id, dono, versao, operacao, snapshot)
      values (old.id, old.dono, old.versao, 'exclusao', pg_catalog.to_jsonb(old));
    return old;
  end if;
  if public.conhecimento_segredo(pg_catalog.concat_ws(E'\n', new.titulo, new.conteudo, new.motivo, new.causa, new.solucao, new.prevencao, new.origem, new.categoria, pg_catalog.array_to_string(new.tags, ' '))) then
    raise exception 'conhecimento_sem_segredos: o texto parece conter chave, token, chave privada ou CPF; registre só o fato, nunca o segredo' using errcode = '23514';
  end if;
  new.tags := coalesce((select pg_catalog.array_agg(s.t order by s.o) from (
      select pg_catalog.left(pg_catalog.btrim(pg_catalog.lower(x)), 40) as t, pg_catalog.min(n) as o
        from pg_catalog.unnest(new.tags) with ordinality as u(x, n)
       where pg_catalog.btrim(x) <> '' group by 1) s), '{}'::text[]);
  if tg_op = 'INSERT' then
    new.versao := 1; new.criado_em := pg_catalog.now(); new.atualizado_em := pg_catalog.now();
    return new;
  end if;
  if new.dono <> old.dono then raise exception 'conhecimento_dono_fixo' using errcode = '42501'; end if;
  insert into public.conhecimento_historico (conhecimento_id, dono, versao, operacao, snapshot)
    values (old.id, old.dono, old.versao, 'atualizacao', pg_catalog.to_jsonb(old));
  new.versao := old.versao + 1; new.criado_em := old.criado_em; new.atualizado_em := pg_catalog.now();
  if new.origem_hash is not distinct from old.origem_hash then new.editado_no_site := true; end if;   -- mudou fora de uma importação
  return new;
end $$;
revoke all on function public.conhecimento_guarda() from public, anon, authenticated, service_role;

drop trigger if exists conhecimento_guarda on public.conhecimento;
create trigger conhecimento_guarda before insert or update or delete on public.conhecimento for each row execute function public.conhecimento_guarda();

-- 5) segurança: só o dono, com a trava da 2ª etapa; o histórico é só leitura para o site
do $$
declare t text;
begin
  foreach t in array array['conhecimento', 'conhecimento_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for all to authenticated
      using (dono = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))
      with check (dono = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
grant select, insert, update on public.conhecimento to authenticated;   -- sem DELETE: o registro nunca se apaga pelo site, só se arquiva (o histórico guarda cada versão)
grant select on public.conhecimento_historico to authenticated;

-- 6) catálogo da auditoria (050), quando existir
do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('conhecimento', true, true, '062', 'RAC Knowledge: memória técnica do projeto (sem segredos; o gatilho recusa)'),
      ('conhecimento_historico', true, true, '062', 'RAC Knowledge: versões anteriores e registros apagados (só leitura para o site)')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo para catalogar as tabelas do RAC Knowledge';
  end if;
end $$;

commit;

-- conferir depois: supabase/conferencias/062_conferir_producao.sql (só leitura)
