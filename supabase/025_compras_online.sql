-- Central de Compras (docs/compras.md): pedidos de lojas online (Amazon primeiro; Mercado Livre e outras no mesmo formato), com os
-- produtos, os documentos originais (PDF, DANFE, XML, CSV, ZIP, e-mail, prints) e as imagens dos produtos. Rode depois do 024 e,
-- logo em seguida, o 022 de novo (ele inclui as tabelas novas na trava da 2ª etapa e na auditoria). Pode rodar de novo sem estragar nada.
--
-- Fica na "casa", como o Mercado e a Alimentação: o Rayner e a Fernanda veem e lançam juntos (dono_da_casa()). Os arquivos ficam no
-- cofre privado "familia", na pasta <dono>/compras/<compra>/, sempre o ORIGINAL (o que foi extraído vai para a coluna extraido).
-- Nenhum dado de cartão além da bandeira e dos 4 últimos dígitos (o banco recusa sequências longas de números no pagamento).
begin;

create table if not exists public.compras_online (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  loja               text not null check (loja in ('amazon', 'mercadolivre', 'shopee', 'magalu', 'outra')),
  numero             text not null check (length(numero) between 1 and 60),
  data               date not null,
  vendedor           text check (vendedor is null or length(vendedor) <= 120),
  status             text check (status is null or length(status) <= 40),
  subtotal           numeric(12,2) not null check (subtotal >= 0),
  desconto           numeric(12,2) not null default 0 check (desconto >= 0),
  frete              numeric(12,2) not null default 0 check (frete >= 0),
  taxas              numeric(12,2) not null default 0 check (taxas >= 0),
  total_pago         numeric(12,2) not null check (total_pago >= 0),
  pagamento          text check (pagamento is null or (length(pagamento) <= 60 and pagamento !~ '\d{5,}')),   -- "Mastercard final 1234"
  categoria          text check (categoria is null or length(categoria) <= 40),
  recorrencia_texto  text check (recorrencia_texto is null or length(recorrencia_texto) <= 120),
  recorrencia_meses  numeric(5,1) check (recorrencia_meses is null or recorrencia_meses > 0),
  recorrencia_status text check (recorrencia_status is null or recorrencia_status in ('a_confirmar', 'confirmada', 'descartada')),
  chave_nfe          text check (chave_nfe is null or chave_nfe ~ '^\d{44}$'),
  numero_nf          text check (numero_nf is null or length(numero_nf) <= 20),
  emitente           text check (emitente is null or length(emitente) <= 160),
  cnpj               text check (cnpj is null or cnpj ~ '^\d{14}$'),
  fora_das_contas    boolean not null default false,   -- já contado em outro lugar (ex.: Mercado): não entra no Painel
  motivo_fora        text check (motivo_fora is null or length(motivo_fora) <= 200),
  divergencias       jsonb not null default '[]'::jsonb check (jsonb_typeof(divergencias) = 'array'),
  observacoes        text check (observacoes is null or length(observacoes) <= 1000),
  origem             text not null default 'manual' check (origem in ('manual', 'pdf', 'xml', 'csv', 'email', 'imagem', 'zip')),
  versoes            jsonb not null default '[]'::jsonb check (jsonb_typeof(versoes) = 'array'),
  criado_por         uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz,
  /* a conta fecha: total pago = subtotal − desconto + frete + taxas (2 centavos de folga) */
  constraint compras_online_conta_fecha check (abs(total_pago - (subtotal - desconto + frete + taxas)) <= 0.02)
);
create index if not exists compras_online_casa_data on public.compras_online (user_id, data desc);
/* o mesmo pedido da mesma loja e a mesma nota fiscal não entram duas vezes, venham por PDF, e-mail, XML ou CSV */
create unique index if not exists compras_online_pedido_unico on public.compras_online
  (user_id, loja, (ltrim(upper(regexp_replace(numero, '[^A-Za-z0-9]', '', 'g')), '0')));
create unique index if not exists compras_online_nfe_unica on public.compras_online (user_id, chave_nfe) where chave_nfe is not null;

create table if not exists public.compras_online_itens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  compra_id    uuid not null references public.compras_online(id) on delete cascade,
  ordem        integer not null default 0,
  descricao    text not null check (length(descricao) between 1 and 200),
  codigo       text check (codigo is null or length(codigo) <= 40),          -- ASIN, código do anúncio ou do produto na nota
  qtd          numeric(12,3) not null default 1 check (qtd > 0),
  unitario     numeric(12,2) check (unitario is null or unitario >= 0),
  total        numeric(12,2) not null check (total >= 0),
  desconto     numeric(12,2) not null default 0 check (desconto >= 0),
  categoria    text check (categoria is null or length(categoria) <= 40),
  imagem_path  text check (imagem_path is null or length(imagem_path) <= 300),
  criado_em    timestamptz not null default now()
);
create index if not exists compras_online_itens_compra on public.compras_online_itens (compra_id, ordem);

create table if not exists public.compras_online_docs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  compra_id  uuid not null references public.compras_online(id) on delete cascade,
  tipo       text not null check (tipo in ('resumo_pdf', 'danfe', 'nfe_xml', 'csv', 'zip', 'email_confirmacao', 'email_envio', 'email_entrega', 'imagem', 'foto_produto', 'comprovante', 'outro')),
  nome       text not null check (length(nome) between 1 and 200),
  path       text not null check (length(path) <= 300),
  mime       text check (mime is null or length(mime) <= 100),
  tamanho    bigint check (tamanho is null or tamanho >= 0),
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  extraido   jsonb not null default '{}'::jsonb check (jsonb_typeof(extraido) = 'object' and pg_column_size(extraido) <= 200000),
  criado_em  timestamptz not null default now()
);
create index if not exists compras_online_docs_compra on public.compras_online_docs (compra_id);
/* o mesmo arquivo (mesmo conteúdo) não é guardado duas vezes */
create unique index if not exists compras_online_docs_arquivo_unico on public.compras_online_docs (user_id, sha256);

-- segurança por linha: a casa; produto e documento só entram numa compra da mesma casa
do $$
declare t text;
begin
  foreach t in array array['compras_online', 'compras_online_itens', 'compras_online_docs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "casa" on public.%I', t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
  end loop;
end $$;
create policy "casa" on public.compras_online for all to authenticated
  using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
create policy "casa" on public.compras_online_itens for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.compras_online c where c.id = compra_id and c.user_id = public.dono_da_casa()));
create policy "casa" on public.compras_online_docs for all to authenticated
  using (user_id = public.dono_da_casa())
  with check (user_id = public.dono_da_casa() and exists (select 1 from public.compras_online c where c.id = compra_id and c.user_id = public.dono_da_casa()));

grant select, insert, update, delete on public.compras_online, public.compras_online_itens, public.compras_online_docs to authenticated;
revoke all on public.compras_online, public.compras_online_itens, public.compras_online_docs from anon;
grant select on public.compras_online, public.compras_online_itens, public.compras_online_docs to service_role;

-- o cofre "familia" passa a aceitar também os originais das compras (XML, CSV, ZIP, e-mail e texto), além de imagem, vídeo e PDF.
-- Continua privado, com o mesmo limite de 50 MB e as mesmas regras (pasta do dono da casa e trava da 2ª etapa).
update storage.buckets
   set allowed_mime_types = array['image/*', 'video/*', 'application/pdf', 'text/xml', 'application/xml', 'text/csv', 'application/vnd.ms-excel',
                                  'application/zip', 'application/x-zip-compressed', 'message/rfc822', 'text/plain']
 where id = 'familia' and public = false;

commit;

notify pgrst, 'reload schema';
