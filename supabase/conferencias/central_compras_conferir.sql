-- CONFERÊNCIA SÓ DE LEITURA · Central de Compras (10/11/2026). Não altera nada: só SELECT. O dono roda no SQL Editor quando quiser (o Claude não roda SQL em produção).
-- Serve para confirmar no banco o que o código só pode supor: se a 046 já foi aplicada, onde estão a cortina e os itens de Pet/Amazon, e se há nota e pedido online repetidos.
-- Não mostra chave de nota, número de pedido, CPF, endereço nem pagamento.

-- 1) A migration 046 está aplicada? (3 colunas + a coluna subcategoria na view; se vier vazio, NÃO está)
select table_name, column_name from information_schema.columns
 where table_schema = 'public' and ((table_name = 'itens' and column_name in ('categoria_item', 'subcategoria'))
    or (table_name = 'produtos' and column_name = 'subcategoria') or (table_name = 'compras' and column_name = 'subcategoria'))
 order by 1, 2;

-- 2) A cortina automotiva de R$ 19,90: emissor da nota (mercado), categoria atual e valor
select n.data, m.nome as emissor_da_nota, n.numero, i.descricao, i.categoria as categoria_gravada_no_item, p.categoria as categoria_do_produto, i.valor_total
  from public.itens i join public.notas n on n.id = i.nota_id join public.mercados m on m.id = n.mercado_id left join public.produtos p on p.id = i.produto_id
 where i.descricao ilike '%cortina%' or m.nome ilike '%william%' or i.valor_total = 19.90
 order by n.data desc;

-- 3) Itens de Pet lançados como nota do Mercado
select n.data, m.nome as estabelecimento, i.descricao, coalesce(p.categoria, i.categoria) as categoria, i.quantidade, i.valor_total
  from public.itens i join public.notas n on n.id = i.nota_id join public.mercados m on m.id = n.mercado_id left join public.produtos p on p.id = i.produto_id
 where coalesce(p.categoria, i.categoria) ilike '%pet%' or i.descricao ~* '(racao|ração|antipulga|coleira|petisco|areia)'
 order by n.data desc;

-- 4) Itens de pedidos online (Amazon e outros): loja, data, situação, se conta nas despesas e o item
select c.loja, c.data, c.status, c.canal, c.fora_das_contas, c.total_pago, i.descricao, i.categoria, i.qtd, i.total, i.desconto
  from public.compras_online c left join public.compras_online_itens i on i.compra_id = c.id
 where c.loja = 'amazon' or i.categoria ilike '%pet%'
 order by c.data desc, i.ordem;

-- 5) Possível mesma compra nas duas fontes (mesma data e mesmo total): nota do Mercado × pedido online que conta nas despesas
with nota as (select n.id, n.data, m.nome, sum(i.valor_total) as total from public.notas n join public.mercados m on m.id = n.mercado_id join public.itens i on i.nota_id = n.id group by n.id, n.data, m.nome)
select nota.data, nota.nome as mercado, nota.total as total_nota, c.loja, c.total_pago as total_pedido, c.fora_das_contas, (c.numero_nf is not null) as pedido_tem_numero_de_nf
  from nota join public.compras_online c on c.data = nota.data and abs(c.total_pago - nota.total) <= 0.01
 order by nota.data desc;

-- 6) Totais por fonte, para comparar com a "Conferência dos totais" da tela (todo o histórico; o online da tela só soma o que a regra manda contar)
select 'Mercado (notas)' as fonte, count(distinct nota_id) as compras, sum(valor_total) as total from public.compras
union all
select 'Online (total pago, sem cancelados e sem "já contada em outro lugar")', count(*), sum(total_pago) from public.compras_online
 where coalesce(status, '') not in ('cancelado') and not coalesce(fora_das_contas, false);
