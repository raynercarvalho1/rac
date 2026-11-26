-- 067 · Monitor de integrações, M3 e M4 (docs/planejamento/05-integracoes-e-automacoes.md, seção 4.5; docs/planejamento/04-rac-intelligence.md, "sinais"). APLICADA EM PRODUÇÃO em 26/11/2026 (Supabase MCP, conferida por leitura: RLS e trava mfa em sinais, view security_invoker, só o service_role executa o ciclo). Pode rodar de novo sem erro.
-- O que faz, sem tocar em nenhuma tabela existente:
--   1) public.sinais: a tabela GENÉRICA de sinais do Documento 04 (o Monitor é o primeiro tipo; o RAC Hoje e futuras áreas leem a mesma). Um sinal é um
--      INCIDENTE com ciclo de vida: abre, é atualizado (atrasado vira falhou no MESMO incidente), fecha sozinho quando o problema some e guarda o histórico.
--      Só o dono lê (RLS + a trava "mfa"); só o service_role grava, pelas funções abaixo. Sem IA, sem explicação automática, sem adiamento.
--   2) public.monitor_processos_em(agora) e a view public.monitor_processos (security_invoker): o contrato do Monitor (última execução, último sucesso,
--      falhas, duração, registros e estado) dos processos que gravam no banco (Rotina das 6h, Newsletter, Inbox, Radar e Central Fiscal), lido pelo servidor
--      com as MESMAS regras da tela. Aqui "atrasado" é por IDADE da última execução (o banco não interpreta cron); a tela segue pelo horário do cron.
--      Limites: Rotina 25 h (24 h + 60 min de tolerância), Newsletter 14 h, Inbox 30 min. Radar e Central Fiscal só registram quando há o que fazer:
--      sem registro é "desconhecido", nunca atraso nem falha (não geram alerta).
--   3) monitor_sinais_sincronizar / _pendentes / _marcar: o ciclo de incidentes usado pela Edge Function monitor-alerta (só service_role executa).
-- NÃO cria agendamento (isso é a 068, depois da função publicada), NÃO mexe na função garmin, na rotina, nos robôs nem no backup do site (sinais é dado derivado:
-- o Monitor recria a partir das fontes). Segredos: nenhum.
begin;

-- 1) a tabela -------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.sinais (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null references auth.users(id) on delete cascade,
  tipo          text not null check (tipo ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),     -- ex.: monitor.processo
  area          text not null check (area ~ '^[a-z][a-z0-9_-]{1,30}$'),                   -- ex.: sistema
  origem        text not null check (origem ~ '^[a-z][a-z0-9_-]{1,40}$'),                 -- quem criou: ex.: monitor-alerta
  entidade      text not null check (length(entidade) between 1 and 80),                  -- o que é: no Monitor, o id do processo (rotina, newsletter, inbox, noticias, vagas)
  chave         text not null check (length(chave) between 8 and 160),                    -- identifica o incidente (tipo + entidade + instante em que abriu)
  severidade    text not null check (severidade in ('info', 'atencao', 'urgente')),
  estado        text not null default 'aberto' check (estado in ('aberto', 'fechado')),
  fatos         jsonb not null default '{}'::jsonb check (jsonb_typeof(fatos) = 'object' and pg_column_size(fatos) <= 8000),
  porque        text not null check (length(porque) between 1 and 600),                   -- "Por que estou vendo isto": regra, fonte e motivo
  link          text check (link is null or link ~ '^#[a-z][a-z0-9-]*(/[^[:space:]<>"''`]*)?$'),   -- a rota do RAC que resolve
  regra_versao  text not null default '1' check (length(regra_versao) between 1 and 20),
  historico     jsonb not null default '[]'::jsonb check (jsonb_typeof(historico) = 'array' and pg_column_size(historico) <= 20000),   -- [{t, estado}]: a sequência do incidente
  detectado_em  timestamptz not null default now(),                                      -- criação do incidente
  atualizado_em timestamptz not null default now(),
  encerrado_em  timestamptz,                                                              -- quando fechou
  encerramento  text check (encerramento is null or encerramento in ('recuperou', 'desligado', 'manual')),
  valido_ate    timestamptz,
  notificado_em timestamptz,                                                              -- quando entrou num push (null = ainda não avisado)
  lote_push     uuid,                                                                     -- o push em que foi avisado (para contar os pushes do dia)
  unique (dono, chave),
  constraint sinais_fechamento_coerente check (
    (estado = 'aberto' and encerrado_em is null and encerramento is null) or (estado = 'fechado' and encerrado_em is not null and encerramento is not null)),
  constraint sinais_aviso_coerente check ((notificado_em is null) = (lote_push is null))
);
-- no máximo UM incidente aberto por tipo e entidade: o mesmo problema nunca abre duas vezes
create unique index if not exists sinais_um_aberto on public.sinais (dono, tipo, entidade) where estado = 'aberto';
create index if not exists sinais_dono_estado on public.sinais (dono, estado, detectado_em desc);
create index if not exists sinais_pendentes on public.sinais (dono, detectado_em) where notificado_em is null;

alter table public.sinais enable row level security;
drop policy if exists "dono le" on public.sinais;
create policy "dono le" on public.sinais for select to authenticated using (dono = (select auth.uid()));
drop policy if exists "mfa" on public.sinais;
create policy "mfa" on public.sinais as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
revoke all on public.sinais from anon, authenticated;
grant select on public.sinais to authenticated;                    -- o dono só LÊ: quem grava são as funções abaixo, pelo service_role
grant select, insert, update on public.sinais to service_role;

-- 2) o contrato do Monitor no banco (M3) -----------------------------------------------------------------------------------------------------------
-- Função e view são security INVOKER: quem lê enxerga só o que as políticas das tabelas de origem deixam (o dono vê o dele; o service_role vê tudo e filtra por dono).
create or replace function public.monitor_processos_em(p_agora timestamptz default now())
  returns table (dono uuid, processo text, nome text, fonte text, ultima_execucao timestamptz, ultimo_sucesso timestamptz, ultima_falha timestamptz,
                 falhas_7d integer, duracao_s numeric, registros text, estado text, motivo text, limite_min integer, alerta boolean)
  language sql stable set search_path = '' as $$
  with
  rot as (
    select l.user_id as dono, max(l.quando) as ultima, max(l.quando) filter (where l.ok) as ultimo_sucesso, max(l.quando) filter (where not l.ok) as ultima_falha,
           count(*) filter (where not l.ok and l.quando >= p_agora - interval '7 days')::integer as falhas_7d, (array_agg(l.ok order by l.quando desc))[1] as ultima_ok
    from public.rotina_log l group by l.user_id),
  nws as (
    select e.dono, max(coalesce(e.atualizado_em, e.criado_em)) as ultima from public.newsletter_edicoes e group by e.dono),
  sin as (
    select s.dono, s.conta_id, s.ultima_tentativa_em, s.ultima_ok_em, s.falhas_seguidas, s.duracao_ms, s.erro
    from public.inbox_sincronizacao s left join public.inbox_contas c on c.id = s.conta_id and c.dono = s.dono
    where s.ultima_tentativa_em is not null and coalesce(c.sync_auto, true)),
  sin_topo as (select s.dono, max(s.ultima_tentativa_em) as topo, max(s.ultima_ok_em) as ultimo_ok from sin s group by s.dono),
  inb as (
    select r.dono, t.topo as ultima, t.ultimo_ok, count(*)::integer as pastas, bool_or(r.falhas_seguidas > 0) as falhou,
           case when bool_and(r.duracao_ms is not null) then round(sum(r.duracao_ms) / 100.0) / 10 end as duracao_s,
           (array_agg(r.erro) filter (where r.falhas_seguidas > 0))[1] as erro, max(r.falhas_seguidas) as falhas_seguidas
    from sin r join sin_topo t on t.dono = r.dono and r.ultima_tentativa_em >= t.topo - interval '2 minutes' group by r.dono, t.topo, t.ultimo_ok),
  inb_off as (
    select c.dono from public.inbox_contas c group by c.dono having bool_and(c.sync_auto = false)),
  rad as (
    select r.dono, r.iniciada_em, r.terminada_em, r.status, r.ofertas_lidas, r.precos_gravados, r.falhas from public.radar_coletas r where r.origem = 'rotina'),
  rad_topo as (select r.dono, max(r.iniciada_em) as topo from rad r group by r.dono),
  rad_f as (
    select r.dono, min(r.iniciada_em) as ini, bool_and(r.status = 'falha') as todas_falharam, bool_or(r.status = 'em_andamento') as andando,
           sum(r.ofertas_lidas)::integer as lidas, sum(r.precos_gravados)::integer as grav, sum(r.falhas)::integer as fal, max(r.terminada_em) as fim
    from rad r join rad_topo t on t.dono = r.dono and r.iniciada_em >= t.topo - interval '30 minutes' group by r.dono),
  rad_h as (
    select r.dono, max(r.iniciada_em) filter (where r.status in ('ok', 'parcial')) as ult_ok, max(r.iniciada_em) filter (where r.status = 'falha') as ult_falha from rad r group by r.dono),
  fis as (
    select f.user_id as dono, max(f.atualizado_em) as ultima from public.notas_fiscais_entradas f group by f.user_id)
  select r.dono, 'rotina'::text, 'Rotina das 6h'::text, 'rotina_log'::text, r.ultima, r.ultimo_sucesso, r.ultima_falha, r.falhas_7d, null::numeric, null::text,
         case when not r.ultima_ok then 'falhou' when p_agora - r.ultima > interval '25 hours' then 'atrasado' else 'ok' end,
         case when not r.ultima_ok then 'a última execução falhou' when p_agora - r.ultima > interval '25 hours' then 'sem execução há mais de 25 h' end,
         1500, (not r.ultima_ok) or p_agora - r.ultima > interval '25 hours'
    from rot r
  union all
  select n.dono, 'newsletter', 'Newsletter (edições)', 'newsletter_edicoes', n.ultima, n.ultima, null::timestamptz, null::integer, null::numeric, null::text,
         case when p_agora - n.ultima > interval '14 hours' then 'atrasado' else 'ok' end,
         case when p_agora - n.ultima > interval '14 hours' then 'sem edição gravada há mais de 14 h' end,
         840, p_agora - n.ultima > interval '14 hours'
    from nws n
  union all
  select i.dono, 'inbox', 'Inbox (sincronização)', 'inbox_sincronizacao', i.ultima, i.ultimo_ok, null::timestamptz, null::integer, i.duracao_s,
         i.pastas || case when i.pastas = 1 then ' pasta sincronizada' else ' pastas sincronizadas' end,
         case when i.falhou then 'falhou' when p_agora - i.ultima > interval '30 minutes' then 'atrasado' else 'ok' end,
         case when i.falhou then coalesce(i.erro, i.falhas_seguidas || ' falhas seguidas') when p_agora - i.ultima > interval '30 minutes' then 'sem sincronização há mais de 30 min' end,
         30, i.falhou or p_agora - i.ultima > interval '30 minutes'
    from inb i
  union all
  select o.dono, 'inbox', 'Inbox (sincronização)', 'inbox_sincronizacao', null::timestamptz, null::timestamptz, null::timestamptz, null::integer, null::numeric, null::text,
         'desligado', 'a sincronização automática está desligada nas contas', 30, false
    from inb_off o where not exists (select 1 from inb i where i.dono = o.dono)
  union all
  select f.dono, 'radar', 'Radar de Preços (coleta)', 'radar_coletas', f.ini, h.ult_ok, h.ult_falha, null::integer,
         case when not f.andando and f.fim is not null then round(extract(epoch from f.fim - f.ini))::numeric end,
         f.lidas || ' ofertas lidas, ' || f.grav || ' preços gravados' || case when f.fal > 0 then ', ' || f.fal || ' com falha' else '' end,
         case when f.andando then 'ok' when f.todas_falharam then 'falhou' when p_agora - f.ini > interval '13 hours' then 'desconhecido' else 'ok' end,
         case when f.todas_falharam and not f.andando then 'todas as lojas falharam' when not f.andando and p_agora - f.ini > interval '13 hours' then 'sem registro no último horário previsto (só registra quando há oferta)' end,
         780, false
    from rad_f f join rad_h h on h.dono = f.dono
  union all
  select x.dono, 'fiscal_entradas', 'Central Fiscal (entrada no Mercado)', 'notas_fiscais_entradas', x.ultima, x.ultima, null::timestamptz, null::integer, null::numeric, null::text,
         case when p_agora - x.ultima > interval '450 minutes' then 'desconhecido' else 'ok' end,
         case when p_agora - x.ultima > interval '450 minutes' then 'sem registro no último horário previsto (só registra quando há o que tratar)' end,
         450, false
    from fis x
$$;
revoke all on function public.monitor_processos_em(timestamptz) from public, anon;
grant execute on function public.monitor_processos_em(timestamptz) to authenticated, service_role;

create or replace view public.monitor_processos with (security_invoker = true) as select * from public.monitor_processos_em(now());
revoke all on public.monitor_processos from anon, authenticated;
grant select on public.monitor_processos to authenticated, service_role;

-- 3) o ciclo de incidentes (M4): só o service_role executa -------------------------------------------------------------------------------------------
-- p_itens = [{entidade, estado, nome, motivo, fonte, fatos}], com estado em ok · atrasado · falhou · desconhecido · desligado · indisponivel.
--   atrasado/falhou: abre o incidente (um só por entidade) ou ATUALIZA o aberto (atrasado vira falhou no mesmo incidente, sem novo registro);
--   ok: fecha o aberto como "recuperou"; desligado: fecha como "desligado"; desconhecido/indisponivel: não abrem nem fecham (sem evidência não há alarme).
create or replace function public.monitor_sinais_sincronizar(p_dono uuid, p_itens jsonb, p_agora timestamptz default now())
  returns jsonb language plpgsql set search_path = '' as $$
declare
  it jsonb; v_ent text; v_est text; v_nome text; v_mot text; v_fonte text; v_fatos jsonb; v_porque text; v_sev text; v_enc text;
  s public.sinais%rowtype; v_abertos integer := 0; v_atualizados integer := 0; v_fechados integer := 0;
begin
  if p_dono is null then raise exception 'sem dono'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 50 then raise exception 'itens inválidos'; end if;
  for it in select e from jsonb_array_elements(p_itens) e loop
    v_ent := it ->> 'entidade'; v_est := it ->> 'estado'; v_nome := coalesce(nullif(it ->> 'nome', ''), v_ent); v_mot := left(coalesce(it ->> 'motivo', ''), 300);
    v_fonte := left(coalesce(it ->> 'fonte', ''), 80); v_fatos := coalesce(it -> 'fatos', '{}'::jsonb);
    if v_ent is null or v_ent !~ '^[a-z][a-z0-9_]{1,40}$' or v_est is null or v_est not in ('ok', 'atrasado', 'falhou', 'desconhecido', 'desligado', 'indisponivel')
       or jsonb_typeof(v_fatos) <> 'object' then
      raise exception 'item inválido';
    end if;
    select * into s from public.sinais where dono = p_dono and tipo = 'monitor.processo' and entidade = v_ent and estado = 'aberto' for update;
    if v_est in ('atrasado', 'falhou') then
      v_sev := case v_est when 'falhou' then 'urgente' else 'atencao' end;
      v_porque := left(format('Monitor, regra 1 (fonte: %s): %s', coalesce(nullif(v_fonte, ''), 'sem fonte'), coalesce(nullif(v_mot, ''), v_est)), 600);
      v_fatos := v_fatos || jsonb_build_object('estado', v_est, 'nome', v_nome, 'motivo', v_mot, 'fonte', v_fonte);
      if not found then
        insert into public.sinais (dono, tipo, area, origem, entidade, chave, severidade, fatos, porque, link, historico, detectado_em, atualizado_em)
        values (p_dono, 'monitor.processo', 'sistema', 'monitor-alerta', v_ent, 'monitor.processo:' || v_ent || ':' || to_char(p_agora at time zone 'utc', 'YYYYMMDD"T"HH24MISS'),
                v_sev, v_fatos, v_porque, '#monitor', jsonb_build_array(jsonb_build_object('t', p_agora, 'estado', v_est)), p_agora, p_agora);
        v_abertos := v_abertos + 1;
      else
        update public.sinais set severidade = v_sev, fatos = v_fatos, porque = v_porque, atualizado_em = p_agora,
               historico = case when s.fatos ->> 'estado' is distinct from v_est then s.historico || jsonb_build_object('t', p_agora, 'estado', v_est) else s.historico end
         where id = s.id;
        v_atualizados := v_atualizados + 1;
      end if;
    elsif v_est in ('ok', 'desligado') and found then
      v_enc := case v_est when 'ok' then 'recuperou' else 'desligado' end;
      update public.sinais set estado = 'fechado', encerrado_em = p_agora, encerramento = v_enc, atualizado_em = p_agora,
             historico = s.historico || jsonb_build_object('t', p_agora, 'estado', v_enc) where id = s.id;
      v_fechados := v_fechados + 1;
    end if;
  end loop;
  return jsonb_build_object('abertos', v_abertos, 'atualizados', v_atualizados, 'fechados', v_fechados);
end $$;

-- o que ainda não foi avisado e quantos pushes já saíram hoje (o dia é o de Brasília, UTC-3 fixo, sem horário de verão)
create or replace function public.monitor_sinais_pendentes(p_dono uuid, p_agora timestamptz default now())
  returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'pushes_hoje', (select count(distinct s.lote_push) from public.sinais s where s.dono = p_dono
                      and s.notificado_em >= (date_trunc('day', (p_agora at time zone 'utc') - interval '3 hours') + interval '3 hours') at time zone 'utc'),
    'abertos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'entidade', s.entidade, 'nome', s.fatos ->> 'nome', 'estado', s.fatos ->> 'estado',
                      'severidade', s.severidade, 'detectado_em', s.detectado_em) order by s.detectado_em) from public.sinais s
                      where s.dono = p_dono and s.estado = 'aberto' and s.notificado_em is null), '[]'::jsonb),
    'resolvidos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'entidade', s.entidade, 'nome', s.fatos ->> 'nome', 'detectado_em', s.detectado_em,
                      'encerrado_em', s.encerrado_em) order by s.detectado_em) from public.sinais s
                      where s.dono = p_dono and s.estado = 'fechado' and s.encerramento = 'recuperou' and s.notificado_em is null
                        and s.encerrado_em >= p_agora - interval '2 days'), '[]'::jsonb))
$$;

create or replace function public.monitor_sinais_marcar(p_dono uuid, p_ids uuid[], p_lote uuid, p_agora timestamptz default now())
  returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_dono is null or p_lote is null then raise exception 'chamada inválida'; end if;
  update public.sinais set notificado_em = p_agora, lote_push = p_lote where dono = p_dono and id = any (p_ids) and notificado_em is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.monitor_sinais_sincronizar(uuid, jsonb, timestamptz), public.monitor_sinais_pendentes(uuid, timestamptz),
  public.monitor_sinais_marcar(uuid, uuid[], uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.monitor_sinais_sincronizar(uuid, jsonb, timestamptz), public.monitor_sinais_pendentes(uuid, timestamptz),
  public.monitor_sinais_marcar(uuid, uuid[], uuid, timestamptz) to service_role;

-- catálogo da auditoria (050), quando existir
do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('sinais', true, false, '067', 'Sinais e incidentes do Monitor (dado derivado: o Monitor recria a partir das fontes); só o dono lê, só as funções gravam')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
