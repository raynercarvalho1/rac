-- Alimentação e Delivery (docs/alimentacao.md): pedidos de delivery e restaurante, com os itens, e a visão unificada dos gastos
-- com comida (Mercado + pedidos). Rode depois do 023 e, logo em seguida, o 022 de novo (ele inclui as tabelas novas na trava da
-- 2ª etapa e na auditoria). Pode rodar de novo sem estragar nada.
--
-- Arquitetura híbrida: supermercado, açougue, padaria e hortifrúti continuam no Mercado (notas e itens, sem mudança). Aqui só
-- entram pedidos (iFood, 99Food, direto no restaurante). Nenhuma compra do Mercado é copiada, então nada é contado duas vezes.
-- Fica na "casa", como o Mercado: o Rayner e a Fernanda veem e lançam juntos (dono_da_casa()). Fotos no cofre "familia",
-- na pasta <dono>/alimentacao/<pedido>/ (a regra do cofre e a trava da 2ª etapa já valem para ela).
begin;

create table if not exists public.pedidos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  data                date not null,
  hora                text check (hora is null or hora ~ '^\d{2}:\d{2}$'),
  estabelecimento     text not null check (length(estabelecimento) between 1 and 120),
  plataforma          text not null check (plataforma in ('ifood', '99food', 'direto', 'outro')),
  modo                text not null check (modo in ('delivery', 'retirada', 'no_local')),
  numero              text check (numero is null or length(numero) <= 40),
  pagamento           text check (pagamento is null or length(pagamento) <= 60),   -- texto livre ("Crédito"), nunca o número do cartão
  subtotal            numeric(12,2) not null check (subtotal >= 0),
  taxa_entrega        numeric(12,2) not null default 0 check (taxa_entrega >= 0),
  taxa_servico        numeric(12,2) not null default 0 check (taxa_servico >= 0),
  gorjeta             numeric(12,2) not null default 0 check (gorjeta >= 0),
  desconto_loja       numeric(12,2) not null default 0 check (desconto_loja >= 0),
  desconto_plataforma numeric(12,2) not null default 0 check (desconto_plataforma >= 0),
  total_pago          numeric(12,2) not null check (total_pago >= 0),
  observacoes         text check (observacoes is null or length(observacoes) <= 1000),
  arquivos            jsonb not null default '[]'::jsonb check (jsonb_typeof(arquivos) = 'array'),   -- [{path, nome, tipo, tamanho}]
  origem              text not null default 'manual' check (origem in ('manual', 'ia', 'claude')),
  versoes             jsonb not null default '[]'::jsonb check (jsonb_typeof(versoes) = 'array'),    -- valores anteriores (até 10)
  criado_por          uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  /* a conta fecha: total = subtotal + entrega + serviço + gorjeta − descontos (2 centavos de tolerância) */
  constraint pedidos_conta_fecha check (abs(total_pago - (subtotal + taxa_entrega + taxa_servico + gorjeta - desconto_loja - desconto_plataforma)) <= 0.02)
);
create index if not exists pedidos_casa_data on public.pedidos (user_id, data desc);
/* o mesmo pedido da mesma plataforma não entra duas vezes (número sem pontuação e sem zeros à esquerda) */
create unique index if not exists pedidos_numero_unico on public.pedidos
  (user_id, plataforma, (ltrim(upper(regexp_replace(numero, '[^A-Za-z0-9]', '', 'g')), '0')))
  where numero is not null and regexp_replace(numero, '[^A-Za-z0-9]', '', 'g') <> '';

create table if not exists public.pedido_itens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  ordem       integer not null default 0,
  descricao   text not null check (length(descricao) between 1 and 160),
  qtd         numeric(12,3) not null default 1 check (qtd > 0),
  unidade     text not null default 'un' check (unidade in ('un', 'kg', 'l')),
  unitario    numeric(12,2) check (unitario is null or unitario >= 0),
  total       numeric(12,2) not null check (total >= 0),
  desconto    numeric(12,2) not null default 0 check (desconto >= 0 and desconto <= total),
  observacao  text check (observacao is null or length(observacao) <= 300),
  produto_id  uuid references public.produtos(id) on delete set null,   -- só quando é um produto de mercado (entra no histórico de preços)
  criado_em   timestamptz not null default now()
);
create index if not exists pedido_itens_pedido on public.pedido_itens (pedido_id, ordem);

-- segurança por linha: a casa (dono e quem ele liberou); o item só entra num pedido da mesma casa
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
drop policy if exists "casa" on public.pedidos;
create policy "casa" on public.pedidos for all to authenticated
  using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
drop policy if exists "casa" on public.pedido_itens;
create policy "casa" on public.pedido_itens for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = public.dono_da_casa()));
-- a trava da 2ª etapa (a mesma do 022, que também é rodado de novo depois deste arquivo)
drop policy if exists "mfa" on public.pedidos;
create policy "mfa" on public.pedidos as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
drop policy if exists "mfa" on public.pedido_itens;
create policy "mfa" on public.pedido_itens as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));

grant select, insert, update, delete on public.pedidos, public.pedido_itens to authenticated;
revoke all on public.pedidos, public.pedido_itens from anon;
grant select on public.pedidos, public.pedido_itens to service_role;

-- visão unificada dos gastos com alimentação: cada item do Mercado (como na view compras) e cada pedido, uma vez.
-- A separação entre comida e o resto do Mercado (limpeza, higiene, fraldas) é feita no site (NUCLEO.alCatMercado).
create or replace view public.alimentacao_gastos
with (security_invoker = true) as
select 'mercado'::text as origem, c.id as ref, c.user_id, c.data, c.mercado as estabelecimento, null::text as plataforma, null::text as modo,
       c.categoria, c.produto, c.valor_total as valor, 0::numeric as taxas, 0::numeric as gorjeta, c.desconto as descontos
from public.compras c
union all
select 'pedido'::text, p.id, p.user_id, p.data, p.estabelecimento, p.plataforma, p.modo,
       null::text, null::text, p.total_pago, p.taxa_entrega + p.taxa_servico, p.gorjeta, p.desconto_loja + p.desconto_plataforma
from public.pedidos p;
grant select on public.alimentacao_gastos to authenticated;
revoke all on public.alimentacao_gastos from anon;

commit;

notify pgrst, 'reload schema';
