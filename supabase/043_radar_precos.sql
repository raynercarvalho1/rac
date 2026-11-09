-- status: pendente
-- Radar de Preços, Lote 1 (docs/radar.md): estrutura de dados e segurança. NÃO APLICADA EM PRODUÇÃO: o dono roda no SQL Editor.
-- Ordem: 022 → 033 → 037 → 038 → este arquivo (depende do rac_aal_ok() do 022 e da tabela membros do 002). Pode rodar de novo sem estragar nada.
-- ATENÇÃO: se o 022, o 033 ou o 038 rodarem de novo depois, recriam seguranca_estado() sem as tabelas radar_*: rode este 043 em seguida.
-- Não depende da 040 nem da 041 (que continuam propostas, não aplicadas); o número 042 só tem a conferência de alertas
-- (supabase/conferencias/042_conferir_alertas_push.sql), por isso este é o 043.
--
-- Acesso: SÓ O DONO. A Fernanda e qualquer membro da casa (tabela membros) não leem nem gravam. Anônimo não tem nenhum privilégio.
-- Cada tabela tem a política "so o dono" (dono = auth.uid() e quem é membro fica de fora) e a trava restritiva "mfa" (2ª etapa).
-- Nenhum CEP, preço, loja ou link está neste arquivo: o CEP padrão fica em radar_config (linha do dono, preenchida por ele, docs/radar.md).
--
-- Regras de negócio que o BANCO garante (o núcleo repete as mesmas em NUCLEO.rd*):
--   - à vista e parcelado são modalidades separadas, com campos próprios (parcelas, valor da parcela, total parcelado, juros);
--   - frete desconhecido não é grátis: 'desconhecido' obriga frete_valor vazio, e a view radar_precos_final deixa preco_final vazio;
--   - preço final = produto + frete confirmado + taxas − desconto/cupom, só quando o frete é conhecido e o item está disponível;
--   - radar_precos é só de acréscimo: não se edita nem se apaga uma observação (correção = nova linha com corrige_id);
--   - toda observação traz a fonte (fonte + evidencia) e não pode ser de uma data futura;
--   - equivalência 'confirmada' exige evidência e a confirmação do dono; a IA (origem 'ia') só pode propor ('provavel');
--   - nenhuma chamada de IA, cobrança ou coleta externa existe neste lote.
begin;

-- 1) Configuração privada (um registro por dono). O CEP padrão é preenchido pelo dono; o repositório nunca o contém.
create table if not exists public.radar_config (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cep_padrao    text check (cep_padrao is null or cep_padrao ~ '^\d{8}$'),   -- só os 8 dígitos; frete é sempre conferido para este CEP
  atualizado_em timestamptz not null default now(),
  unique (dono)
);

-- 2) Lojas / fontes
create table if not exists public.radar_lojas (
  id               uuid primary key default gen_random_uuid(),
  dono             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome             text not null check (length(btrim(nome)) between 1 and 80),
  dominio          text check (dominio is null or (length(dominio) between 3 and 120 and dominio ~ '^[a-z0-9.-]+$')),   -- só o host, sem https:// nem caminho
  tipo             text not null default 'varejo' check (tipo in ('varejo', 'marketplace', 'fabricante', 'atacado', 'fisica', 'outro')),
  fonte_padrao     text not null default 'manual' check (fonte_padrao in ('manual', 'pagina', 'api', 'feed')),
  coleta_permitida boolean not null default false,   -- só vira true depois de conferir os termos da fonte (Lote 5)
  frete_calculavel boolean not null default true,
  observacoes      text check (observacoes is null or length(observacoes) <= 500),
  ativa            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz,
  unique (id, dono)
);
create unique index if not exists radar_lojas_nome_unico on public.radar_lojas (dono, lower(btrim(nome)));

-- 3) Itens monitorados (o produto em si, comprado ou que o dono quer comprar)
create table if not exists public.radar_itens (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome          text not null check (length(btrim(nome)) between 1 and 160),
  marca         text check (marca is null or length(marca) <= 80),
  modelo        text check (modelo is null or length(modelo) <= 120),
  variante      text check (variante is null or length(variante) <= 120),       -- cor, voltagem, tamanho...
  apresentacao  text check (apresentacao is null or length(apresentacao) <= 120),   -- "caixa com 12", "2 L"
  gtin          text check (gtin is null or gtin ~ '^(\d{8}|\d{12,14})$'),      -- GTIN/EAN
  origem        text not null default 'monitorado' check (origem in ('comprado', 'monitorado')),
  observacoes   text check (observacoes is null or length(observacoes) <= 500),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  unique (id, dono)
);
create unique index if not exists radar_itens_gtin_unico on public.radar_itens (dono, gtin) where gtin is not null;

-- 4) Ofertas: o mesmo item numa loja (link, vendedor, equivalência e situação)
create table if not exists public.radar_ofertas (
  id                  uuid primary key default gen_random_uuid(),
  dono                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id             uuid not null,
  loja_id             uuid not null,
  url                 text check (url is null or (url ~ '^https://[^\s]+$' and length(url) <= 2000)),
  vendedor            text check (vendedor is null or length(vendedor) <= 120),
  codigo_loja         text check (codigo_loja is null or length(codigo_loja) <= 80),   -- SKU/ID do anúncio na loja
  equivalencia        text not null default 'nao_confirmada' check (equivalencia in ('confirmada', 'provavel', 'nao_confirmada', 'rejeitada')),
  equivalencia_origem text not null default 'dono' check (equivalencia_origem in ('dono', 'regra', 'ia')),
  evidencias          jsonb not null default '[]'::jsonb check (jsonb_typeof(evidencias) = 'array' and jsonb_array_length(evidencias) <= 20 and pg_column_size(evidencias) <= 8000),
  confirmada_em       timestamptz,
  situacao            text not null default 'ativa' check (situacao in ('ativa', 'pausada', 'encerrada')),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  unique (id, dono),
  foreign key (item_id, dono) references public.radar_itens (id, dono),   -- sem apagar em cascata: o histórico não some
  foreign key (loja_id, dono) references public.radar_lojas (id, dono),
  /* equivalência confirmada: com evidência, com a confirmação do dono e nunca marcada pela IA */
  constraint radar_ofertas_equiv_confirmada check (equivalencia <> 'confirmada'
    or (confirmada_em is not null and jsonb_array_length(evidencias) >= 1 and equivalencia_origem <> 'ia'))
);
create index if not exists radar_ofertas_item on public.radar_ofertas (dono, item_id);
create unique index if not exists radar_ofertas_url_unica on public.radar_ofertas (dono, item_id, url) where url is not null;

-- 5) Coletas (execuções futuras, Lotes 5 e 6; neste lote só a estrutura)
create table if not exists public.radar_coletas (
  id             uuid primary key default gen_random_uuid(),
  dono           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loja_id        uuid,
  origem         text not null default 'manual' check (origem in ('manual', 'piloto', 'rotina')),
  status         text not null default 'em_andamento' check (status in ('em_andamento', 'ok', 'parcial', 'falha')),
  iniciada_em    timestamptz not null default now(),
  terminada_em   timestamptz,
  ofertas_lidas  integer not null default 0 check (ofertas_lidas >= 0),
  precos_gravados integer not null default 0 check (precos_gravados >= 0),
  falhas         integer not null default 0 check (falhas >= 0),
  erro_codigo    text check (erro_codigo is null or erro_codigo ~ '^[a-z0-9_]{2,40}$'),
  erro_mensagem  text check (erro_mensagem is null or length(erro_mensagem) <= 300),
  unique (id, dono),
  foreign key (loja_id, dono) references public.radar_lojas (id, dono),
  constraint radar_coletas_tempo check (terminada_em is null or terminada_em >= iniciada_em),
  constraint radar_coletas_fim check (status = 'em_andamento' or terminada_em is not null),
  constraint radar_coletas_erro check (status <> 'falha' or erro_codigo is not null)
);

-- 6) Observações de preço: histórico só de acréscimo
create table if not exists public.radar_precos (
  id                   uuid primary key default gen_random_uuid(),
  dono                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  oferta_id            uuid not null,
  coleta_id            uuid,
  corrige_id           uuid,    -- se esta linha corrige uma observação anterior (a anterior continua no histórico)
  observado_em         timestamptz not null default now(),
  registrado_em        timestamptz not null default now(),
  fonte                text not null check (fonte in ('manual', 'coleta', 'nota_fiscal')),
  evidencia            text not null check (length(btrim(evidencia)) between 1 and 500),   -- link, nº da nota ou descrição do print conferido
  modalidade           text not null check (modalidade in ('a_vista', 'parcelado')),
  meio                 text not null default 'outro' check (meio in ('pix', 'boleto', 'debito', 'credito', 'dinheiro', 'outro')),
  preco_produto        numeric(12,2) not null check (preco_produto > 0),   -- parcelado: igual ao total parcelado
  parcelas             integer check (parcelas is null or parcelas between 2 and 48),
  valor_parcela        numeric(12,2) check (valor_parcela is null or valor_parcela > 0),
  total_parcelado      numeric(12,2) check (total_parcelado is null or total_parcelado > 0),
  sem_juros            boolean,
  juros_mensal_pct     numeric(7,4) check (juros_mensal_pct is null or juros_mensal_pct >= 0),
  frete_situacao       text not null default 'desconhecido' check (frete_situacao in ('desconhecido', 'confirmado', 'gratis_confirmado', 'retirada')),
  frete_valor          numeric(12,2) check (frete_valor is null or frete_valor >= 0),
  frete_cep_padrao     boolean not null default false,   -- o frete foi calculado para o CEP padrão (radar_config); o CEP em si não é copiado
  taxas                numeric(12,2) not null default 0 check (taxas >= 0),
  desconto             numeric(12,2) not null default 0 check (desconto >= 0),
  cupom                text check (cupom is null or length(cupom) <= 40),
  disponibilidade      text not null default 'desconhecida' check (disponibilidade in ('disponivel', 'indisponivel', 'desconhecida')),
  foreign key (oferta_id, dono) references public.radar_ofertas (id, dono),
  foreign key (coleta_id, dono) references public.radar_coletas (id, dono),
  unique (id, dono),
  foreign key (corrige_id, dono) references public.radar_precos (id, dono),
  /* à vista e parcelado nunca se misturam */
  constraint radar_precos_avista check (modalidade <> 'a_vista'
    or (parcelas is null and valor_parcela is null and total_parcelado is null and sem_juros is null and juros_mensal_pct is null)),
  constraint radar_precos_parcelado check (modalidade <> 'parcelado'
    or (parcelas is not null and valor_parcela is not null and total_parcelado is not null and sem_juros is not null
        and meio in ('credito', 'boleto', 'outro')
        and abs(total_parcelado - preco_produto) <= 0.02
        and abs(parcelas * valor_parcela - total_parcelado) <= parcelas * 0.01 + 0.005
        and (not sem_juros or coalesce(juros_mensal_pct, 0) = 0))),
  /* frete desconhecido não é grátis e não tem valor */
  constraint radar_precos_frete check (
       (frete_situacao = 'desconhecido' and frete_valor is null)
    or (frete_situacao = 'confirmado' and frete_valor is not null and frete_valor > 0)
    or (frete_situacao in ('gratis_confirmado', 'retirada') and frete_valor = 0)),
  constraint radar_precos_desconto check (desconto <= preco_produto + coalesce(frete_valor, 0) + taxas),
  constraint radar_precos_nao_corrige_a_si check (corrige_id is null or corrige_id <> id)
);
create index if not exists radar_precos_oferta_tempo on public.radar_precos (dono, oferta_id, observado_em desc);
/* a mesma observação (oferta, modalidade, meio, parcelas, instante) não entra duas vezes */
create unique index if not exists radar_precos_unica on public.radar_precos (oferta_id, modalidade, meio, coalesce(parcelas, 0), observado_em);

-- 7) Regras que o CHECK não alcança: data futura e histórico só de acréscimo
create or replace function public.radar_precos_regras() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.observado_em > now() + interval '5 minutes' then
    raise exception 'a observação não pode ter data futura' using errcode = '23514';
  end if;
  new.registrado_em := now();   -- o carimbo de registro é sempre do servidor
  return new;
end $$;
revoke all on function public.radar_precos_regras() from public, anon, authenticated;
drop trigger if exists radar_precos_regras on public.radar_precos;
create trigger radar_precos_regras before insert on public.radar_precos
  for each row execute function public.radar_precos_regras();

/* editar e apagar são recusados; só passa a remoção em cascata de quando a própria conta é excluída (gatilho dentro de gatilho) */
create or replace function public.radar_precos_so_acrescenta() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and pg_trigger_depth() <= 1 then
    raise exception 'o histórico de preços só recebe novas observações; corrija com uma nova linha (corrige_id)' using errcode = '42501';
  end if;
  if tg_op = 'TRUNCATE' then
    raise exception 'o histórico de preços não pode ser apagado' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.radar_precos_so_acrescenta() from public, anon, authenticated;
drop trigger if exists radar_precos_so_acrescenta on public.radar_precos;
create trigger radar_precos_so_acrescenta before update or delete on public.radar_precos
  for each row execute function public.radar_precos_so_acrescenta();
drop trigger if exists radar_precos_sem_truncate on public.radar_precos;
create trigger radar_precos_sem_truncate before truncate on public.radar_precos
  for each statement execute function public.radar_precos_so_acrescenta();

-- 8) Preço final (view): só existe quando o frete é conhecido e o item está disponível; nunca mistura modalidades
create or replace view public.radar_precos_final with (security_invoker = true) as
select p.*,
       case when p.frete_situacao <> 'desconhecido' and p.disponibilidade = 'disponivel'
            then round(p.preco_produto + coalesce(p.frete_valor, 0) + p.taxas - p.desconto, 2) end as preco_final
  from public.radar_precos p;

-- 9) Segurança: RLS, só o dono, trava "mfa", nada para anon
do $$
declare t text;
begin
  foreach t in array array['radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for all to authenticated
      using (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()))
      with check (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update, delete on public.radar_config, public.radar_lojas, public.radar_itens, public.radar_ofertas to authenticated;
grant select, insert, update on public.radar_coletas to authenticated;
grant select, insert on public.radar_precos to authenticated;   -- sem update nem delete: histórico só de acréscimo
revoke all on public.radar_precos_final from public, anon, authenticated;
grant select on public.radar_precos_final to authenticated;

-- 10) A auditoria seguranca_estado() passa a conferir a trava "mfa" das tabelas do Radar (igual à da 038 + as seis tabelas)
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'pedidos', 'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs',
    'compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos',
    'notas_fiscais_tentativas', 'notas_fiscais_situacoes',
    'radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos', 'seguranca_eventos'];
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'sem login' using errcode = '42501'; end if;
  select jsonb_build_object(
    'aal', coalesce((select auth.jwt()->>'aal'), 'aal1'),
    'fatores', (select count(*) from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'sem_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '[]'::jsonb),
    'anon_le', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')), '[]'::jsonb),
    'sem_trava_mfa', coalesce((select jsonb_agg(t order by t) from unnest(pessoais) t
                where pg_catalog.to_regclass('public.' || t) is not null
                  and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), '[]'::jsonb),
    'cofres_publicos', coalesce((select jsonb_agg(b.id order by b.id) from storage.buckets b where b.public), '[]'::jsonb),
    'funcoes_abertas', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'conferido', now()) into r;
  return r;
end $$;
revoke all on function public.seguranca_estado() from public, anon;
grant execute on function public.seguranca_estado() to authenticated;

commit;

-- conferir depois (só leitura; ver também seguranca_estado() depois de rodar o 022 de novo):
--   select public.seguranca_estado();   -- sem_trava_mfa e anon_le sem nada de radar_*
--   select c.relname, c.relrowsecurity from pg_class c where c.relname like 'radar\_%' and c.relkind = 'r';
--   select has_table_privilege('anon', 'public.radar_precos', 'SELECT');   -- false
--   select tablename, policyname, permissive from pg_policies where tablename like 'radar\_%' order by 1, 2;
