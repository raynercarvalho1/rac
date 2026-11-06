-- Central de Notas Fiscais (docs/fiscal.md, Lote 3): NF-e (modelo 55) e NFC-e (modelo 65) como entidade PRÓPRIA, independente de Compras.
-- Rode depois do 031 (o 022 não roda de novo; a auditoria das tabelas novas é do 033). Pode rodar de novo sem estragar nada.
-- Aplicado em produção em 06/11/2026 (Postgres 17.11) e conferido por consulta só-leitura.
--
-- • Vincular uma nota a uma compra, ao Mercado, à Alimentação ou ao Abastecimento é só conferência/documentação: o vínculo tem
--   gera_despesa = false (travado por CHECK) e nada aqui escreve em outra tabela de gastos.
-- • Situação só com evidência: autorizada exige protocolo; contingência não tem protocolo (é outra situação, distinguível); cancelada é definitiva.
-- • Nota cancelada ou rejeitada não vincula; se a nota passa a cancelada/rejeitada, os vínculos dela ficam inválidos (valido = false).
-- • Privacidade: NÃO existe campo de CPF nem de consumidor. Pagamento só guarda forma, valor, bandeira e os 4 últimos dígitos
--   (o banco recusa sequências longas de números). Os originais (XML, PDF, DANFE, foto) ficam no cofre privado "familia", em
--   <dono>/notas-fiscais/<nota>/, sem copiar o conteúdo para o banco.
-- • Acesso: a casa (Rayner e Fernanda), como Compras e Mercado, mais a trava restritiva "mfa" (022). Compartilhar a Central Fiscal NÃO dá
--   à Fernanda acesso à IA paga: nada aqui toca ia_config, ia_uso, ia_cobranca nem a função rac-ia.
begin;

-- Validadores da chave de acesso (módulo 11) e do CNPJ -----------------------------------------------------------------------------
create or replace function public.nf_chave_dv_ok(c text) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare s integer := 0; p integer := 2; i integer;
begin
  if c is null or c !~ '^\d{44}$' or c ~ '^(\d)\1{43}$' then return false; end if;
  for i in reverse 43 .. 1 loop
    s := s + substr(c, i, 1)::integer * p;
    p := case when p = 9 then 2 else p + 1 end;
  end loop;
  s := s % 11;
  return (case when s < 2 then 0 else 11 - s end) = substr(c, 44, 1)::integer;
end $$;
revoke all on function public.nf_chave_dv_ok(text) from public, anon;
grant execute on function public.nf_chave_dv_ok(text) to authenticated;

create or replace function public.nf_cnpj_ok(c text) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare s integer; p integer; i integer; d1 integer; d2 integer;
begin
  if c is null or c !~ '^\d{14}$' or c ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; p := 5;
  for i in 1 .. 12 loop s := s + substr(c, i, 1)::integer * p; p := case when p = 2 then 9 else p - 1 end; end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; p := 6;
  for i in 1 .. 13 loop s := s + substr(c, i, 1)::integer * p; p := case when p = 2 then 9 else p - 1 end; end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return d1 = substr(c, 13, 1)::integer and d2 = substr(c, 14, 1)::integer;
end $$;
revoke all on function public.nf_cnpj_ok(text) from public, anon;
grant execute on function public.nf_cnpj_ok(text) to authenticated;

-- A nota ------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  modelo              text not null check (modelo in ('55', '65')),
  chave               text,
  numero              text check (numero is null or numero ~ '^\d{1,9}$'),
  serie               text check (serie is null or serie ~ '^\d{1,3}$'),
  data_emissao        date,
  emitente_nome       text check (emitente_nome is null or length(emitente_nome) <= 120),
  emitente_cnpj       text check (emitente_cnpj is null or public.nf_cnpj_ok(emitente_cnpj)),
  emitente_uf         text check (emitente_uf is null or emitente_uf ~ '^[A-Z]{2}$'),
  tp_emis             smallint check (tp_emis is null or tp_emis between 1 and 9),
  situacao            text not null default 'pendente' check (situacao in ('autorizada', 'contingencia', 'pendente', 'rejeitada', 'cancelada')),
  situacao_evidencia  text check (situacao_evidencia is null or length(situacao_evidencia) <= 200),
  protocolo           text check (protocolo is null or protocolo ~ '^\d{15}$'),
  denegada            boolean not null default false,
  valor_produtos      numeric(12,2) check (valor_produtos is null or valor_produtos >= 0),
  valor_descontos     numeric(12,2) check (valor_descontos is null or valor_descontos >= 0),
  valor_frete         numeric(12,2) check (valor_frete is null or valor_frete >= 0),
  valor_outras        numeric(12,2) check (valor_outras is null or valor_outras >= 0),
  valor_impostos      numeric(12,2) check (valor_impostos is null or valor_impostos >= 0),
  valor_total         numeric(12,2) not null check (valor_total >= 0),      -- total da nota (vNF)
  valor_a_pagar       numeric(12,2) check (valor_a_pagar is null or valor_a_pagar >= 0),   -- o que foi efetivamente pago, quando se sabe; pode ser diferente do total
  pagamentos          jsonb not null default '[]'::jsonb check (jsonb_typeof(pagamentos) = 'array' and pg_column_size(pagamentos) <= 5000
                        and pagamentos::text !~ '\d{13,}' and pagamentos::text !~ '"final"\s*:\s*"?\d{5,}'),   -- forma, valor, bandeira, final (4 dígitos)
  formato_origem      text not null check (formato_origem in ('xml', 'pdf', 'danfe', 'imagem')),
  requer_conferencia  boolean not null default true,
  observacoes         text check (observacoes is null or length(observacoes) <= 500),
  criado_por          uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  /* a chave só entra se passa no dígito verificador e bate com o modelo, o CNPJ, a série, o número e o mês da emissão */
  constraint notas_fiscais_chave_ok check (chave is null or (
    public.nf_chave_dv_ok(chave) and substr(chave, 21, 2) = modelo
    and (emitente_cnpj is null or substr(chave, 7, 14) = emitente_cnpj)
    and (serie is null or substr(chave, 23, 3)::integer = serie::integer)
    and (numero is null or substr(chave, 26, 9)::integer = numero::integer)
    and (data_emissao is null or to_char(data_emissao, 'YYMM') = substr(chave, 3, 4)))),
  constraint notas_fiscais_sem_chave_confere check (chave is not null or requer_conferencia),
  constraint notas_fiscais_nao_xml_confere check (formato_origem = 'xml' or requer_conferencia),
  /* situação só com evidência */
  constraint notas_fiscais_autorizada_protocolo check (situacao <> 'autorizada' or protocolo is not null),
  constraint notas_fiscais_contingencia_sem_protocolo check (situacao <> 'contingencia' or protocolo is null),
  constraint notas_fiscais_contingencia_tipo check (situacao <> 'contingencia' or tp_emis is null or tp_emis in (2, 4, 5, 6, 7, 9)),
  constraint notas_fiscais_denegada_rejeitada check (not denegada or situacao = 'rejeitada')
);
create index if not exists notas_fiscais_casa_data on public.notas_fiscais (user_id, data_emissao desc);
create unique index if not exists notas_fiscais_chave_unica on public.notas_fiscais (user_id, chave) where chave is not null;

create table if not exists public.notas_fiscais_itens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  nota_id           uuid not null references public.notas_fiscais(id) on delete cascade,
  ordem             integer not null default 0,
  descricao         text not null check (length(descricao) between 1 and 200),
  codigo            text check (codigo is null or length(codigo) <= 60),
  qtd               numeric(14,4) not null check (qtd > 0),
  unidade           text not null default 'un' check (unidade in ('un', 'pc', 'cx', 'pct', 'par', 'kg', 'g', 'l', 'ml', 'm', 'outra')),
  unidade_original  text check (unidade_original is null or length(unidade_original) <= 20),
  unitario          numeric(14,4) check (unitario is null or unitario >= 0),
  total             numeric(12,2) not null check (total >= 0),
  desconto          numeric(12,2) not null default 0 check (desconto >= 0),
  criado_em         timestamptz not null default now()
);
create index if not exists notas_fiscais_itens_nota on public.notas_fiscais_itens (nota_id, ordem);

create table if not exists public.notas_fiscais_docs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  nota_id    uuid not null references public.notas_fiscais(id) on delete cascade,
  tipo       text not null check (tipo in ('xml', 'pdf', 'danfe', 'imagem')),
  nome       text not null check (length(nome) between 1 and 200),
  path       text not null check (length(path) <= 300 and position('..' in path) = 0 and path like '%/notas-fiscais/%'),
  mime       text check (mime is null or length(mime) <= 100),
  tamanho    bigint check (tamanho is null or tamanho >= 0),
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  criado_em  timestamptz not null default now()
);
create index if not exists notas_fiscais_docs_nota on public.notas_fiscais_docs (nota_id);
create unique index if not exists notas_fiscais_docs_arquivo_unico on public.notas_fiscais_docs (user_id, sha256);

-- Vínculos: conferência e documentação, nunca despesa ----------------------------------------------------------------------------------
create table if not exists public.notas_fiscais_vinculos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  nota_id       uuid not null references public.notas_fiscais(id) on delete cascade,
  modulo        text not null check (modulo in ('compras', 'mercado', 'alimentacao', 'veiculos')),
  registro_id   uuid not null,    -- compras_online.id, notas.id (Mercado), pedidos.id (Alimentação) ou registros.id (Veículos)
  tipo          text not null default 'conferencia' check (tipo = 'conferencia'),
  gera_despesa  boolean not null default false check (gera_despesa = false),
  valido        boolean not null default true,     -- vira false sozinho se a nota é cancelada ou rejeitada
  confere       boolean,
  diferenca     numeric(12,2),
  observacoes   text check (observacoes is null or length(observacoes) <= 300),
  criado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now()
);
/* a mesma nota não liga duas vezes ao mesmo registro */
create unique index if not exists notas_fiscais_vinculo_unico on public.notas_fiscais_vinculos (user_id, nota_id, modulo, registro_id);
create index if not exists notas_fiscais_vinculo_registro on public.notas_fiscais_vinculos (modulo, registro_id);

create or replace function public.notas_fiscais_vinculos_regras() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_sit text; v_ok boolean;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    if (new.nota_id, new.modulo, new.registro_id) is distinct from (old.nota_id, old.modulo, old.registro_id) then
      raise exception 'vínculo: a nota e o registro não mudam' using errcode = '22023'; end if;
    if not old.valido and new.valido then raise exception 'vínculo: um vínculo invalidado não volta' using errcode = '22023'; end if;
  end if;
  select n.situacao into v_sit from public.notas_fiscais n where n.id = new.nota_id;
  if not found then raise exception 'vínculo: nota não encontrada' using errcode = 'P0002'; end if;
  if new.valido and v_sit in ('cancelada', 'rejeitada') then
    raise exception 'vínculo: nota % não documenta compra', v_sit using errcode = '22023'; end if;
  /* o registro precisa existir e ser da casa (o RLS de cada tabela decide o que a pessoa enxerga) */
  if tg_op = 'INSERT' then
    v_ok := case new.modulo
      when 'compras' then exists (select 1 from public.compras_online x where x.id = new.registro_id)
      when 'mercado' then exists (select 1 from public.notas x where x.id = new.registro_id)
      when 'alimentacao' then exists (select 1 from public.pedidos x where x.id = new.registro_id)
      when 'veiculos' then exists (select 1 from public.registros x where x.id = new.registro_id)
      else false end;
    if not v_ok then raise exception 'vínculo: registro não encontrado em %', new.modulo using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.notas_fiscais_vinculos_regras() from public, anon;
drop trigger if exists notas_fiscais_vinculos_regras on public.notas_fiscais_vinculos;
create trigger notas_fiscais_vinculos_regras before insert or update on public.notas_fiscais_vinculos for each row execute function public.notas_fiscais_vinculos_regras();

/* cancelada é definitiva; nota que passa a cancelada ou rejeitada invalida os vínculos dela (ficam no histórico) */
create or replace function public.notas_fiscais_situacao() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em; new.atualizado_em := now();
    if old.situacao = 'cancelada' and new.situacao <> 'cancelada' then raise exception 'nota: uma nota cancelada não volta' using errcode = '22023'; end if;
    if new.situacao in ('cancelada', 'rejeitada') and old.situacao is distinct from new.situacao then
      update public.notas_fiscais_vinculos set valido = false where nota_id = new.id and valido;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.notas_fiscais_situacao() from public, anon;
drop trigger if exists notas_fiscais_situacao on public.notas_fiscais;
create trigger notas_fiscais_situacao before update on public.notas_fiscais for each row execute function public.notas_fiscais_situacao();

-- Segurança por linha: a casa; filhos só entram numa nota da mesma casa; mais a trava da 2ª etapa -----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "casa" on public.%I', t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
  end loop;
end $$;
drop policy if exists "casa" on public.notas_fiscais;
create policy "casa" on public.notas_fiscais for all to authenticated
  using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
drop policy if exists "casa" on public.notas_fiscais_itens;
create policy "casa" on public.notas_fiscais_itens for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.notas_fiscais n where n.id = nota_id and n.user_id = public.dono_da_casa()));
drop policy if exists "casa" on public.notas_fiscais_docs;
create policy "casa" on public.notas_fiscais_docs for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.notas_fiscais n where n.id = nota_id and n.user_id = public.dono_da_casa())
              and split_part(path, '/', 1) = public.dono_da_casa()::text and split_part(path, '/', 2) = 'notas-fiscais' and split_part(path, '/', 3) = nota_id::text);
drop policy if exists "casa" on public.notas_fiscais_vinculos;
create policy "casa" on public.notas_fiscais_vinculos for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.notas_fiscais n where n.id = nota_id and n.user_id = public.dono_da_casa()));

grant select, insert, update, delete on public.notas_fiscais, public.notas_fiscais_itens, public.notas_fiscais_docs, public.notas_fiscais_vinculos to authenticated;
revoke all on public.notas_fiscais, public.notas_fiscais_itens, public.notas_fiscais_docs, public.notas_fiscais_vinculos from anon;
grant select on public.notas_fiscais, public.notas_fiscais_itens, public.notas_fiscais_docs, public.notas_fiscais_vinculos to service_role;

commit;

notify pgrst, 'reload schema';
