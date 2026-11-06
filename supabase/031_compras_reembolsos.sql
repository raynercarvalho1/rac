-- status: pendente (preparado no repositório; ainda não rodou no banco — tire esta linha depois de rodar e conferir)
-- Reembolsos das compras (docs/compras.md, Lote 3). Rode depois do 030 e, logo em seguida, o 022 de novo. Pode rodar de novo sem estragar nada.
-- PENDENTE DE REVISÃO: preparado no repositório; não foi executado em nenhum banco. Não lança nada nas despesas e não mexe em compra nenhuma.
--
-- Regras financeiras (todas garantidas pelo BANCO, não só pelo site):
-- 1) solicitado e aprovado NÃO geram crédito; 2) só "recebido" com confirmação manual gera crédito (quem confirmou e quando ficam gravados;
--    sem login de pessoa, ou seja, pela rotina/service_role, não há confirmação); 3) o crédito é do mês em que o dinheiro foi recebido;
-- 4) a soma dos recebidos de uma compra nunca passa do total pago dela (reembolso parcial é uma linha, e pode haver várias);
-- 5) o vínculo com a compra original não se perde (a compra não pode ser apagada enquanto tiver reembolso);
-- 6) um reembolso recebido é definitivo: não se edita (nem as observações) nem se apaga. Recebimento confirmado por engano se corrige por ESTORNO
--    auditável (compras_reembolsos_estornos): o registro original fica intacto, o estorno grava quem, quando, o motivo e o valor, desfaz o crédito
--    e só pode acontecer uma vez por reembolso;
-- 7) duas confirmações ao mesmo tempo não duplicam: a compra é travada (FOR UPDATE) e a soma é refeita depois da trava.
--
-- O "crédito" é uma VISTA (compras_creditos), não uma segunda tabela: não existe segunda fonte da verdade que possa ficar fora de sincronia,
-- e um reembolso só pode gerar um crédito, por construção. Definição: um crédito por reembolso recebido e confirmado, SEM estorno; o valor é o
-- recebido (parcial aparece como uma linha por reembolso, nunca agrupada), o mês é o do recebimento (recebido_em), e o estornado sai do
-- resultado. A vista compras_creditos_historico mostra tudo (inclusive os estornados, com quem estornou, quando e por quê) para auditoria.
begin;

-- As vistas abaixo usam security_invoker (PostgreSQL 15 ou mais; as vistas compras, alimentacao_gastos e ia_custos, já em produção, usam o mesmo
-- recurso). Em versão mais antiga isto para aqui com erro claro, em vez de criar uma vista que ignoraria o RLS.
do $$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'security_invoker exige PostgreSQL 15 ou mais (versão atual: %)', current_setting('server_version');
  end if;
end $$;

create table if not exists public.compras_reembolsos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  compra_id         uuid not null references public.compras_online(id),
  canal             text not null check (canal in ('amazon', 'shopee', 'mercado_livre', 'outro_marketplace', 'presencial')),   -- copiado da compra pelo banco
  pedido_numero     text not null check (length(pedido_numero) between 1 and 60),                                              -- copiado da compra pelo banco
  estado            text not null default 'solicitado' check (estado in ('solicitado', 'aprovado', 'recebido', 'recusado')),
  valor_solicitado  numeric(12,2) not null check (valor_solicitado > 0),
  valor_aprovado    numeric(12,2) check (valor_aprovado is null or valor_aprovado >= 0),
  valor_recebido    numeric(12,2) check (valor_recebido is null or valor_recebido > 0),
  solicitado_em     date,
  aprovado_em       date,
  recebido_em       date,
  referencia        text check (referencia is null or length(referencia) between 1 and 60),   -- número do reembolso na loja, quando houver
  motivo            text check (motivo is null or length(motivo) <= 200),
  observacoes       text check (observacoes is null or length(observacoes) <= 500),
  confirmado_em     timestamptz,
  confirmado_por    uuid references auth.users(id),   -- sem ON DELETE: a auditoria não é reescrita; apagar essa conta exige tratar isto antes
  criado_por        uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz,
  constraint compras_reembolsos_aprovado_ok check (estado <> 'aprovado' or valor_aprovado is not null),
  /* recebido, valor, data e confirmação andam juntos: ou tudo, ou nada */
  constraint compras_reembolsos_recebido_valor check ((estado = 'recebido') = (valor_recebido is not null)),
  constraint compras_reembolsos_recebido_data check ((estado = 'recebido') = (recebido_em is not null)),
  constraint compras_reembolsos_recebido_conf check ((estado = 'recebido') = (confirmado_em is not null))
);
create index if not exists compras_reembolsos_compra on public.compras_reembolsos (user_id, compra_id);
create index if not exists compras_reembolsos_recebidos on public.compras_reembolsos (user_id, recebido_em) where estado = 'recebido';
/* o mesmo reembolso da loja não é registrado duas vezes para a mesma compra */
create unique index if not exists compras_reembolsos_referencia_unica on public.compras_reembolsos (user_id, compra_id, referencia) where referencia is not null;

-- Estornos: só acrescentam (ninguém altera nem apaga uma linha pelo site). Um estorno por reembolso (unique), com o valor e o mês do crédito
-- desfeito copiados do reembolso pelo banco, e quem estornou, quando e o motivo gravados. O reembolso original continua como estava (recebido).
create table if not exists public.compras_reembolsos_estornos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  reembolso_id   uuid not null references public.compras_reembolsos(id),
  compra_id      uuid not null references public.compras_online(id),
  valor          numeric(12,2) not null check (valor > 0),      -- o valor recebido que foi desfeito (copiado pelo banco)
  mes_credito    date not null,                                  -- o mês do crédito desfeito (copiado pelo banco)
  motivo         text not null check (length(btrim(motivo)) between 5 and 200),
  estornado_por  uuid references auth.users(id),   -- sem ON DELETE: a auditoria não é reescrita
  estornado_em   timestamptz not null default now(),
  constraint compras_reembolsos_estornos_unico unique (reembolso_id)
);
create index if not exists compras_reembolsos_estornos_compra on public.compras_reembolsos_estornos (user_id, compra_id);

-- Regras no banco: valem para qualquer caminho de gravação (site, função, restauração de backup)
create or replace function public.compras_reembolsos_regras() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_c public.compras_online%rowtype; v_outros numeric;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    if new.compra_id <> old.compra_id then raise exception 'reembolso: a compra de origem não muda' using errcode = '22023'; end if;
    /* recebido e confirmado é definitivo: NADA muda, nem observações (um UPDATE idêntico, como o da restauração do backup, passa). Correção é por estorno. */
    if old.estado = 'recebido' then
      if (new.estado, new.valor_solicitado, new.valor_aprovado, new.valor_recebido, new.solicitado_em, new.aprovado_em, new.recebido_em, new.referencia, new.motivo, new.observacoes,
          new.confirmado_em, new.confirmado_por, new.canal, new.pedido_numero)
         is distinct from (old.estado, old.valor_solicitado, old.valor_aprovado, old.valor_recebido, old.solicitado_em, old.aprovado_em, old.recebido_em, old.referencia, old.motivo, old.observacoes,
          old.confirmado_em, old.confirmado_por, old.canal, old.pedido_numero) then
        raise exception 'reembolso: um reembolso recebido e confirmado não muda' using errcode = '22023'; end if;
      return new;
    end if;
    if old.estado = 'recusado' and new.estado <> 'recusado' then raise exception 'reembolso: um reembolso recusado não volta' using errcode = '22023'; end if;
  end if;
  /* trava a compra: confirmações ao mesmo tempo ficam em fila e cada uma refaz a soma depois da trava */
  select * into v_c from public.compras_online where id = new.compra_id for update;
  if not found then raise exception 'reembolso: compra não encontrada' using errcode = 'P0002'; end if;
  new.canal := coalesce(v_c.canal, case v_c.loja when 'amazon' then 'amazon' when 'mercadolivre' then 'mercado_livre' when 'shopee' then 'shopee' else 'outro_marketplace' end);
  new.pedido_numero := v_c.numero;
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  if new.estado = 'recebido' then
    if new.recebido_em > current_date + 1 then raise exception 'reembolso: a data do recebimento está no futuro' using errcode = '22023'; end if;
    if new.recebido_em < v_c.data then raise exception 'reembolso: o recebimento é anterior à compra' using errcode = '22023'; end if;
    new.confirmado_em := coalesce(new.confirmado_em, now());
    new.confirmado_por := coalesce(new.confirmado_por, (select auth.uid()));
    /* confirmação é de uma pessoa da casa; sem login de pessoa (rotina/service_role) não confirma */
    if new.confirmado_por is null or new.confirmado_por not in ((select auth.uid()), public.dono_da_casa()) then
      raise exception 'reembolso: a confirmação precisa ser de uma pessoa da casa' using errcode = '42501'; end if;
    select coalesce(sum(r.valor_recebido), 0) into v_outros from public.compras_reembolsos r
     where r.compra_id = new.compra_id and r.estado = 'recebido' and r.id <> new.id
       and not exists (select 1 from public.compras_reembolsos_estornos e where e.reembolso_id = r.id);   -- o estornado libera o valor
    if v_outros + new.valor_recebido > v_c.total_pago then
      raise exception 'reembolso: os recebidos (%) passariam do valor pago na compra (%)', v_outros + new.valor_recebido, v_c.total_pago using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function public.compras_reembolsos_regras() from public, anon;
drop trigger if exists compras_reembolsos_regras on public.compras_reembolsos;
create trigger compras_reembolsos_regras before insert or update on public.compras_reembolsos for each row execute function public.compras_reembolsos_regras();

/* o total pago da compra não pode cair abaixo do que já foi recebido de volta (sem contar os estornados) */
create or replace function public.compras_online_limite_reembolsos() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_recebido numeric;
begin
  select coalesce(sum(r.valor_recebido), 0) into v_recebido from public.compras_reembolsos r
   where r.compra_id = new.id and r.estado = 'recebido'
     and not exists (select 1 from public.compras_reembolsos_estornos e where e.reembolso_id = r.id);
  if new.total_pago < v_recebido then
    raise exception 'compra: o total pago (%) não pode ficar abaixo do que já foi reembolsado (%)', new.total_pago, v_recebido using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function public.compras_online_limite_reembolsos() from public, anon;
drop trigger if exists compras_online_limite_reembolsos on public.compras_online;
create trigger compras_online_limite_reembolsos before update of total_pago on public.compras_online for each row execute function public.compras_online_limite_reembolsos();

create or replace function public.compras_reembolsos_sem_apagar() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if old.estado = 'recebido' then raise exception 'reembolso: um reembolso recebido e confirmado não se apaga' using errcode = '22023'; end if;
  return old;
end $$;
revoke all on function public.compras_reembolsos_sem_apagar() from public, anon;
drop trigger if exists compras_reembolsos_sem_apagar on public.compras_reembolsos;
create trigger compras_reembolsos_sem_apagar before delete on public.compras_reembolsos for each row execute function public.compras_reembolsos_sem_apagar();

-- reembolso_confirmar: o toque de "recebi o dinheiro". Repetir a mesma confirmação não duplica nada (devolve ja_confirmado);
-- confirmar com outro valor ou outra data um reembolso já recebido é recusado. As regras de verdade (soma, trava, mês) ficam no gatilho.
create or replace function public.reembolso_confirmar(p_id uuid, p_valor numeric, p_recebido_em date)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_r public.compras_reembolsos%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'reembolso_confirmar: faça login' using errcode = '42501'; end if;
  if p_id is null or p_valor is null or p_recebido_em is null then raise exception 'reembolso_confirmar: informe o reembolso, o valor e a data do recebimento' using errcode = '22023'; end if;
  if p_valor <= 0 or p_valor > 1000000 or p_valor <> round(p_valor, 2) then raise exception 'reembolso_confirmar: valor inválido' using errcode = '22023'; end if;
  select * into v_r from public.compras_reembolsos where id = p_id for update;
  if not found then raise exception 'reembolso_confirmar: reembolso não encontrado' using errcode = 'P0002'; end if;
  if v_r.estado = 'recebido' then
    if exists (select 1 from public.compras_reembolsos_estornos e where e.reembolso_id = p_id) then
      raise exception 'reembolso_confirmar: este recebimento foi estornado; registre um novo reembolso' using errcode = '22023'; end if;
    if v_r.valor_recebido = p_valor and v_r.recebido_em = p_recebido_em then
      return jsonb_build_object('id', p_id, 'confirmado', true, 'ja_confirmado', true, 'mes', to_char(v_r.recebido_em, 'YYYY-MM'));
    end if;
    raise exception 'reembolso_confirmar: este reembolso já foi confirmado com outro valor ou outra data' using errcode = '22023';
  end if;
  if v_r.estado = 'recusado' then raise exception 'reembolso_confirmar: reembolso recusado não recebe confirmação' using errcode = '22023'; end if;
  update public.compras_reembolsos set estado = 'recebido', valor_recebido = p_valor, recebido_em = p_recebido_em,
    confirmado_em = now(), confirmado_por = (select auth.uid()) where id = p_id;
  return jsonb_build_object('id', p_id, 'confirmado', true, 'ja_confirmado', false, 'mes', to_char(p_recebido_em, 'YYYY-MM'));
end $$;
revoke all on function public.reembolso_confirmar(uuid, numeric, date) from public, anon;
grant execute on function public.reembolso_confirmar(uuid, numeric, date) to authenticated;

create or replace function public.compras_reembolsos_estornos_regras() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_r public.compras_reembolsos%rowtype;
begin
  if tg_op <> 'INSERT' then raise exception 'estorno: o histórico de estornos só acrescenta' using errcode = '22023'; end if;
  select * into v_r from public.compras_reembolsos where id = new.reembolso_id for update;
  if not found then raise exception 'estorno: reembolso não encontrado' using errcode = 'P0002'; end if;
  if v_r.estado <> 'recebido' then raise exception 'estorno: só se estorna um reembolso recebido e confirmado' using errcode = '22023'; end if;
  new.compra_id := v_r.compra_id; new.valor := v_r.valor_recebido; new.mes_credito := date_trunc('month', v_r.recebido_em)::date;
  new.motivo := btrim(new.motivo);
  new.estornado_em := coalesce(new.estornado_em, now());
  new.estornado_por := coalesce(new.estornado_por, (select auth.uid()));
  if new.estornado_por is null or new.estornado_por not in ((select auth.uid()), public.dono_da_casa()) then
    raise exception 'estorno: o estorno precisa ser de uma pessoa da casa' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function public.compras_reembolsos_estornos_regras() from public, anon;
drop trigger if exists compras_reembolsos_estornos_regras on public.compras_reembolsos_estornos;
create trigger compras_reembolsos_estornos_regras before insert or update or delete on public.compras_reembolsos_estornos for each row execute function public.compras_reembolsos_estornos_regras();

-- reembolso_estornar: corrige um recebimento confirmado por engano. Não edita nem apaga o reembolso; grava o estorno (quem, quando, motivo, valor)
-- e o crédito sai de compras_creditos. Repetir devolve ja_estornado, sem gravar de novo (e o unique do banco impede o duplicado de qualquer forma).
create or replace function public.reembolso_estornar(p_id uuid, p_motivo text)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_r public.compras_reembolsos%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'reembolso_estornar: faça login' using errcode = '42501'; end if;
  if p_id is null or p_motivo is null or length(btrim(p_motivo)) not between 5 and 200 then
    raise exception 'reembolso_estornar: informe o reembolso e o motivo (de 5 a 200 letras)' using errcode = '22023'; end if;
  select * into v_r from public.compras_reembolsos where id = p_id for update;
  if not found then raise exception 'reembolso_estornar: reembolso não encontrado' using errcode = 'P0002'; end if;
  if v_r.estado <> 'recebido' then raise exception 'reembolso_estornar: só se estorna um reembolso recebido e confirmado' using errcode = '22023'; end if;
  if exists (select 1 from public.compras_reembolsos_estornos e where e.reembolso_id = p_id) then
    return jsonb_build_object('id', p_id, 'estornado', true, 'ja_estornado', true, 'mes', to_char(v_r.recebido_em, 'YYYY-MM'));
  end if;
  insert into public.compras_reembolsos_estornos (reembolso_id, motivo) values (p_id, p_motivo);
  return jsonb_build_object('id', p_id, 'estornado', true, 'ja_estornado', false, 'mes', to_char(v_r.recebido_em, 'YYYY-MM'));
end $$;
revoke all on function public.reembolso_estornar(uuid, text) from public, anon;
grant execute on function public.reembolso_estornar(uuid, text) to authenticated;

-- Créditos. Vista comum NÃO tem RLS própria e, sem security_invoker, leria as tabelas com o poder do dono da vista (ignorando o RLS). Por isso as duas
-- usam security_invoker = true: a consulta roda como quem chamou e vale o RLS das tabelas de baixo, inclusive a trava restritiva "mfa" (2ª etapa) —
-- que é uma política da tabela, não da vista. Além disso: nada para anon e SÓ SELECT para authenticated (vista simples aceitaria DELETE/UPDATE).
-- compras_creditos = o que CONTA: reembolso recebido e confirmado, sem estorno; valor = o recebido (um reembolso parcial é uma linha com o seu valor);
-- mes = o mês de recebido_em. Um estornado deixa de aparecer aqui no mesmo instante (não há cópia para apagar): é a única consulta que o Painel deve somar.
create or replace view public.compras_creditos with (security_invoker = true) as
  select r.id as reembolso_id, r.user_id, r.compra_id, r.canal, r.pedido_numero, r.valor_recebido as valor, r.recebido_em,
         date_trunc('month', r.recebido_em)::date as mes, r.confirmado_em, r.confirmado_por
    from public.compras_reembolsos r
   where r.estado = 'recebido'
     and not exists (select 1 from public.compras_reembolsos_estornos e where e.reembolso_id = r.id);
-- compras_creditos_historico = AUDITORIA, não para somar: todo recebido, estornado ou não, com o estorno (quem, quando, motivo).
create or replace view public.compras_creditos_historico with (security_invoker = true) as
  select r.id as reembolso_id, r.user_id, r.compra_id, r.canal, r.pedido_numero, r.valor_recebido as valor, r.recebido_em,
         date_trunc('month', r.recebido_em)::date as mes, r.confirmado_em, r.confirmado_por,
         (e.id is not null) as estornado, e.estornado_em, e.estornado_por, e.motivo as estorno_motivo,
         case when e.id is null then 'credito' else 'credito_estornado' end as situacao
    from public.compras_reembolsos r
    left join public.compras_reembolsos_estornos e on e.reembolso_id = r.id
   where r.estado = 'recebido';
revoke all on public.compras_creditos, public.compras_creditos_historico from anon, authenticated;
grant select on public.compras_creditos, public.compras_creditos_historico to authenticated, service_role;

-- segurança por linha: a casa, mais a trava da 2ª etapa
alter table public.compras_reembolsos enable row level security;
drop policy if exists "casa" on public.compras_reembolsos;
create policy "casa" on public.compras_reembolsos for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.compras_online c where c.id = compra_id and c.user_id = public.dono_da_casa()));
drop policy if exists "mfa" on public.compras_reembolsos;
create policy "mfa" on public.compras_reembolsos as restrictive for all to authenticated
  using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
grant select, insert, update, delete on public.compras_reembolsos to authenticated;
revoke all on public.compras_reembolsos from anon;
grant select on public.compras_reembolsos to service_role;

-- estornos: a casa lê e registra (só acrescenta; nada de update/delete para o site), mais a trava da 2ª etapa
alter table public.compras_reembolsos_estornos enable row level security;
drop policy if exists "casa le" on public.compras_reembolsos_estornos;
create policy "casa le" on public.compras_reembolsos_estornos for select to authenticated using (user_id = public.dono_da_casa());
drop policy if exists "casa registra" on public.compras_reembolsos_estornos;
create policy "casa registra" on public.compras_reembolsos_estornos for insert to authenticated
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.compras_reembolsos r where r.id = reembolso_id and r.user_id = public.dono_da_casa()));
drop policy if exists "mfa" on public.compras_reembolsos_estornos;
create policy "mfa" on public.compras_reembolsos_estornos as restrictive for all to authenticated
  using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
revoke all on public.compras_reembolsos_estornos from anon, authenticated;
grant select, insert on public.compras_reembolsos_estornos to authenticated;
grant select on public.compras_reembolsos_estornos to service_role;

commit;

notify pgrst, 'reload schema';
