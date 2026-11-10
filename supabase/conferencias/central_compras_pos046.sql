-- CONFERÊNCIA SÓ DE LEITURA (um único resultado): estrutura da 046 + cortina + Pet + Amazon + repetições + totais. Sem chave de nota, número de pedido, CPF nem pagamento.
select jsonb_pretty(jsonb_build_object(
  'colunas_046', (select coalesce(jsonb_agg(table_name || '.' || column_name order by table_name, column_name), '[]') from information_schema.columns
                   where table_schema = 'public' and ((table_name = 'itens' and column_name in ('categoria_item', 'subcategoria')) or (table_name = 'produtos' and column_name = 'subcategoria') or (table_name = 'compras' and column_name = 'subcategoria'))),
  'anon_le_compras', has_table_privilege('anon', 'public.compras', 'SELECT'),
  'authenticated_le_compras', has_table_privilege('authenticated', 'public.compras', 'SELECT'),
  'view_security_invoker', (select coalesce(c.reloptions::text, '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'compras'),
  'itens_com_subcategoria_ou_categoria_item', (select count(*) from public.itens where subcategoria is not null or categoria_item is not null),
  'alimentacao_gastos_responde', (select count(*) >= 0 from public.alimentacao_gastos),
  'totais', jsonb_build_object('mercado_notas', (select count(distinct nota_id) from public.compras), 'mercado_total', (select sum(valor_total) from public.compras),
             'online_pedidos', (select count(*) from public.compras_online where coalesce(status, '') <> 'cancelado' and not coalesce(fora_das_contas, false)),
             'online_total', (select sum(total_pago) from public.compras_online where coalesce(status, '') <> 'cancelado' and not coalesce(fora_das_contas, false))),
  'cortina', (select coalesce(jsonb_agg(jsonb_build_object('data', n.data, 'emissor', m.nome, 'nota', n.numero, 'descricao', i.descricao, 'categoria', coalesce(i.categoria_item, p.categoria, i.categoria), 'valor', i.valor_total)), '[]')
                from public.itens i join public.notas n on n.id = i.nota_id join public.mercados m on m.id = n.mercado_id left join public.produtos p on p.id = i.produto_id
               where i.descricao ilike '%cortina%' or m.nome ilike '%william%'),
  'pet_nas_notas', (select coalesce(jsonb_agg(jsonb_build_object('data', n.data, 'estab', m.nome, 'descricao', i.descricao, 'categoria', coalesce(i.categoria_item, p.categoria, i.categoria), 'qtd', i.quantidade, 'valor', i.valor_total)), '[]')
                from public.itens i join public.notas n on n.id = i.nota_id join public.mercados m on m.id = n.mercado_id left join public.produtos p on p.id = i.produto_id
               where coalesce(i.categoria_item, p.categoria, i.categoria) ilike '%pet%' or i.descricao ~* '(racao|ração|antipulga|coleira|petisco|areia)'),
  'online_itens', (select coalesce(jsonb_agg(jsonb_build_object('loja', c.loja, 'data', c.data, 'status', c.status, 'canal', c.canal, 'fora', c.fora_das_contas, 'total_pago', c.total_pago, 'descricao', i.descricao, 'categoria', i.categoria, 'qtd', i.qtd, 'total', i.total, 'desconto', i.desconto)), '[]')
                from public.compras_online c left join public.compras_online_itens i on i.compra_id = c.id),
  'repetidas_nota_x_pedido', (select coalesce(jsonb_agg(jsonb_build_object('data', x.data, 'mercado', x.nome, 'total_nota', x.total, 'loja', c.loja, 'total_pedido', c.total_pago, 'fora', c.fora_das_contas, 'pedido_tem_nf', c.numero_nf is not null)), '[]')
                from (select n.data, m.nome, sum(i.valor_total) as total from public.notas n join public.mercados m on m.id = n.mercado_id join public.itens i on i.nota_id = n.id group by n.id, n.data, m.nome) x
                join public.compras_online c on c.data = x.data and abs(c.total_pago - x.total) <= 0.01)
)) as conferencia;
