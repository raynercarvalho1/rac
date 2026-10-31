-- Newsletter Inteligente: as edições do dia de cada dono e o registro dos avisos enviados (docs/newsletter.md).
-- Rode este arquivo inteiro no SQL Editor, depois do 015 (usa ia_uso e membros); pode rodar de novo sem estragar nada.
--
-- O que fica aqui: só as edições de cada dia, uma por turno (manhã 6h, tarde 12h, noite 18h): um retrato compacto dos
-- destaques e das seções, com os links originais,
-- para o histórico continuar legível depois que newsletter.json mudar) e, quando houver, o resumo com IA que o dono
-- conferiu e salvou. As notícias públicas continuam em newsletter.json, no repositório; nada delas é copiado à toa.
--
-- Quem grava:
--   o site (dono logado)    a edição "regras" do turno (com os pesos dele) e, ao tocar em Salvar, a edição "ia";
--   a função rac-newsletter a edição "regras" do turno, se ainda não existir, a edição "ia" quando o resumo automático
--                           (REAL, autorizado pelo dono) volta válido, e o registro de cada aviso (019).
-- Proteções (no próprio banco, não só no site):
--   - só o dono lê e grava as próprias edições; quem é da casa (membros) não vê a Newsletter;
--   - edição "ia" só entra ligada a uma chamada REAL concluída de newsletter.resumo desta casa, com a mesma chave de
--     idempotência (uma resposta DEMO não tem chamada, então nunca chega aqui);
--   - uma edição "ia" não volta a ser "regras", e nenhuma edição muda de dono, de data ou de turno;
--   - avisos: no máximo um por dono e por chave ("dia:2026-11-01", "semana:2026-W44"), pela chave primária.
begin;

-- 1) Edições (uma por dono, por dia e por turno)
create table if not exists public.newsletter_edicoes (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data          date not null,
  turno         text not null check (turno in ('manha', 'tarde', 'noite')),
  conteudo      jsonb not null check (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) <= 300000),
  origem        text not null check (origem in ('regras', 'ia')),
  modelo        text check (modelo is null or modelo ~ '^[a-z0-9.-]{3,60}$'),
  ia_uso_id     uuid,  -- id da chamada em ia_uso (conferido pelo gatilho abaixo)
  chave         text check (chave is null or chave ~ '^[A-Za-z0-9_-]{8,80}$'),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (dono, data, turno),
  constraint newsletter_origem_coerente check (
    (origem = 'regras' and modelo is null and ia_uso_id is null) or (origem = 'ia' and modelo is not null and chave is not null))
);
create index if not exists newsletter_edicoes_dono_data on public.newsletter_edicoes (dono, data desc, turno);

create or replace function public.newsletter_edicao_conferir() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.dono is distinct from old.dono or new.data is distinct from old.data or new.turno is distinct from old.turno) then
    raise exception 'a edição não muda de dono, de data nem de turno' using errcode = '42501';
  end if;
  if new.conteudo->>'origem' is distinct from new.origem or new.conteudo->>'data' is distinct from new.data::text
     or new.conteudo->>'turno' is distinct from new.turno then
    raise exception 'o conteúdo não corresponde à edição (origem, data ou turno)' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.origem = 'ia' and new.origem = 'regras' then
    raise exception 'a edição com resumo de IA não é substituída pela de regras' using errcode = '42501';
  end if;
  /* resumo com IA: só com uma chamada REAL concluída desta casa, desta ação e com a mesma chave */
  if new.origem = 'ia' and (tg_op = 'INSERT' or old.origem <> 'ia' or new.ia_uso_id is distinct from old.ia_uso_id
                            or new.chave is distinct from old.chave or new.conteudo is distinct from old.conteudo) then
    if new.ia_uso_id is null or not exists (
      select 1 from public.ia_uso u
      where u.id = new.ia_uso_id and u.dono = new.dono and u.user_id = new.dono and u.acao = 'newsletter.resumo'
        and u.estado = 'concluido' and u.idempotencia = new.chave) then
      raise exception 'resumo com IA sem chamada REAL concluída desta edição' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := pg_catalog.now();
  return new;
end $$;
revoke all on function public.newsletter_edicao_conferir() from public, anon, authenticated;
drop trigger if exists newsletter_edicao_conferir on public.newsletter_edicoes;
create trigger newsletter_edicao_conferir before insert or update on public.newsletter_edicoes
  for each row execute function public.newsletter_edicao_conferir();

alter table public.newsletter_edicoes enable row level security;
drop policy if exists "so o dono" on public.newsletter_edicoes;
create policy "so o dono" on public.newsletter_edicoes for all to authenticated
  using (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()))
  with check (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()));
revoke all on public.newsletter_edicoes from anon, authenticated;
grant select, insert, update, delete on public.newsletter_edicoes to authenticated;
grant select, insert, update on public.newsletter_edicoes to service_role;

-- 2) Avisos enviados (só o servidor grava; o dono lê os dele). A chave primária impede aviso repetido.
create table if not exists public.newsletter_avisos (
  dono       uuid not null references auth.users(id) on delete cascade,
  chave      text not null check (chave ~ '^(dia:\d{4}-\d{2}-\d{2}|semana:\d{4}-W\d{2})$'),
  enviado_em timestamptz not null default now(),
  resultado  text check (resultado is null or length(resultado) <= 200),
  primary key (dono, chave)
);
alter table public.newsletter_avisos enable row level security;
drop policy if exists "dono le os seus" on public.newsletter_avisos;
create policy "dono le os seus" on public.newsletter_avisos for select to authenticated using (dono = auth.uid());
revoke all on public.newsletter_avisos from anon, authenticated;
grant select on public.newsletter_avisos to authenticated;
grant select, insert, update on public.newsletter_avisos to service_role;

commit;

notify pgrst, 'reload schema';
