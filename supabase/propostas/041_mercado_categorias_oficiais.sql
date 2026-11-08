-- status: pendente
-- PROPOSTA 041 · NÃO APLICADA EM PRODUÇÃO (Lote Mercado: padronização e classificação, 08/11/2026). O dono roda no SQL Editor do Supabase; o site já funciona antes e depois dela
-- (o site mostra "Limpeza/Descartáveis" como "Limpeza" por conta própria; esta proposta só deixa o banco igual ao que o site mostra).
-- O que faz: unifica "Limpeza/Descartáveis" (e as variações de escrita) na categoria oficial "Limpeza", em produtos.categoria e itens.categoria, e junta o orçamento das duas (soma).
-- O que NÃO faz: não apaga produto, nota nem item; não mexe em id, quantidade, valor, data, desconto, vínculo nota/compra nem histórico de preços; não cria tabela, política, função nem gatilho;
--   não reclassifica nenhum outro produto (a correção manual do dono em Mercado → Produtos continua valendo).
-- Única linha removida: a linha de orçamento da categoria antiga (orcamentos), depois de somada à "Limpeza". Pode rodar de novo sem estragar nada (na 2ª vez nada casa).
-- Conferência: supabase/conferencias/041_conferir_producao.sql (só leitura). Rode o bloco 1 ANTES (anote os números) e todos DEPOIS.
begin;

update public.produtos set categoria = 'Limpeza'
 where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis');

update public.itens set categoria = 'Limpeza'
 where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis');

-- orçamento: soma o valor da categoria antiga na "Limpeza" (cria a linha se não existia) e só então tira a antiga
insert into public.orcamentos (user_id, categoria, valor)
select o.user_id, 'Limpeza', sum(o.valor)
  from public.orcamentos o
 where lower(btrim(o.categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis')
 group by o.user_id
on conflict (user_id, categoria) do update set valor = public.orcamentos.valor + excluded.valor;

delete from public.orcamentos
 where lower(btrim(categoria)) in ('limpeza/descartáveis', 'limpeza/descartaveis', 'limpeza / descartáveis', 'limpeza / descartaveis', 'descartáveis', 'descartaveis');

commit;
