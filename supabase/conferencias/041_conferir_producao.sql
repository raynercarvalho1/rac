-- Conferência da 041, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor; o bloco 1 antes e depois de aplicar supabase/propostas/041_mercado_categorias_oficiais.sql. Rode cada bloco separado.
-- 1) contagens que NÃO podem mudar com a 041 (anote antes, compare depois): produtos, notas, itens e a soma dos valores. Esperado: iguais antes e depois.
select (select count(*) from public.produtos) as produtos, (select count(*) from public.notas) as notas, (select count(*) from public.itens) as itens,
       (select coalesce(sum(valor_total), 0) from public.itens) as soma_valor_itens, (select coalesce(sum(quantidade), 0) from public.itens) as soma_quantidade;

-- 2) nada mais com a categoria antiga. Esperado depois de aplicar: 0 e 0 e 0.
select (select count(*) from public.produtos where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis')) as produtos_antigos,
       (select count(*) from public.itens    where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis')) as itens_antigos,
       (select count(*) from public.orcamentos where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis')) as orcamentos_antigos;

-- 3) categorias em uso e quantos produtos/itens em cada. Esperado: só as 11 oficiais (Mercearia, Padaria, Açougue/Frios, Hortifruti, Chocolates/Doces, Bebidas, Limpeza, Higiene Pessoal, Peixaria, Casa/Utilidades, Bebê/Infantil);
-- qualquer outra aparece aqui para o dono ajustar em Mercado → Produtos (a 041 não mexe nelas).
select categoria, count(*) as itens, count(distinct produto_id) as produtos from public.itens group by categoria order by itens desc;

-- 4) vínculos intactos: item sem nota ou produto apontando para produto que não existe. Esperado: 0 e 0.
select (select count(*) from public.itens i where not exists (select 1 from public.notas n where n.id = i.nota_id)) as itens_sem_nota,
       (select count(*) from public.itens i where i.produto_id is not null and not exists (select 1 from public.produtos p where p.id = i.produto_id)) as itens_produto_inexistente;
