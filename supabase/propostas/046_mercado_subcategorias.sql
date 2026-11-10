-- status: pendente
-- PROPOSTA 046 · NÃO APLICADA EM PRODUÇÃO (Mercado: reclassificar itens e subcategoria). O dono roda no SQL Editor; o site funciona antes e depois (sem ela, a edição "só este item" e a subcategoria ficam desligadas com aviso).
-- Por que existe: hoje a categoria de um item vem do PRODUTO (view compras: coalesce(p.categoria, i.categoria)); corrigir um item sem mexer nas outras compras do mesmo produto não é possível, e não há subcategoria.
-- O que faz (só acrescenta; nada é apagado nem regravado):
--   itens.categoria_item   categoria só deste item (opcional; vence a do produto)
--   itens.subcategoria     subcategoria só deste item (opcional)
--   produtos.subcategoria  subcategoria de todas as compras do produto (opcional)
--   view compras: categoria = coalesce(i.categoria_item, p.categoria, i.categoria); nova coluna subcategoria no FIM (coalesce(i.subcategoria, p.subcategoria)).
-- O que NÃO faz: não muda id, valor, quantidade, data, desconto, nota, mercado nem o histórico; não reclassifica nenhum registro existente (todas as colunas novas nascem vazias, então todos os totais ficam IGUAIS até o dono editar).
-- Segurança: as tabelas já têm RLS ("casa") e a trava "mfa"; colunas novas herdam as políticas. A view continua security_invoker e sem acesso do anon. A alimentacao_gastos (024) lê compras.categoria e passa a refletir a edição.
-- Pode rodar de novo sem estragar nada. Rollback: alter table public.itens drop column if exists categoria_item, drop column if exists subcategoria; alter table public.produtos drop column if exists subcategoria;
--   e recriar a view com a definição do 002 (create or replace view public.compras ... coalesce(p.categoria, i.categoria) ...).
begin;

alter table public.itens add column if not exists categoria_item text;
alter table public.itens add column if not exists subcategoria text;
alter table public.produtos add column if not exists subcategoria text;

alter table public.itens drop constraint if exists itens_categoria_item_tam;
alter table public.itens add constraint itens_categoria_item_tam check (categoria_item is null or length(btrim(categoria_item)) between 1 and 40);
alter table public.itens drop constraint if exists itens_subcategoria_tam;
alter table public.itens add constraint itens_subcategoria_tam check (subcategoria is null or length(btrim(subcategoria)) between 1 and 40);
alter table public.produtos drop constraint if exists produtos_subcategoria_tam;
alter table public.produtos add constraint produtos_subcategoria_tam check (subcategoria is null or length(btrim(subcategoria)) between 1 and 40);

create or replace view public.compras
with (security_invoker = true) as
select i.id, i.user_id, n.data, date_trunc('month', n.data)::date as mes,
       m.nome as mercado, n.numero, n.forma_pagamento,
       coalesce(i.categoria_item, p.categoria, i.categoria) as categoria, i.descricao, coalesce(p.nome, i.descricao) as produto, i.produto_id,
       i.quantidade, i.unidade, i.valor_unitario, i.valor_total, i.desconto, i.observacao, i.nota_id,
       coalesce(i.subcategoria, p.subcategoria) as subcategoria
from public.itens i
join public.notas n on n.id = i.nota_id
join public.mercados m on m.id = n.mercado_id
left join public.produtos p on p.id = i.produto_id;
grant select on public.compras to authenticated;
revoke all on public.compras from anon;

commit;

-- conferir depois (só leitura):
--   select column_name from information_schema.columns where table_name = 'compras' and column_name in ('categoria', 'subcategoria');
--   select count(*) from public.compras where subcategoria is not null;   -- 0 até a primeira edição
--   select has_table_privilege('anon', 'public.compras', 'SELECT');        -- false
