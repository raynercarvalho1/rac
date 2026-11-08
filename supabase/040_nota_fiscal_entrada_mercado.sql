-- status: pendente
-- PROPOSTA 040 · NÃO APLICADA EM PRODUÇÃO (Lote 1.6, pedido do dono em 08/11/2026). O dono roda no SQL Editor do Supabase ANTES de usar "Dar entrada no Mercado" no site.
-- Por que existe: muitas notas de mercado não têm chave legível e o dono quer lançar a compra NO SISTEMA dele na hora, sem esperar a validação fiscal (protocolo).
-- A situação fiscal (pendente/autorizada) é só uma etiqueta da nota; a ENTRADA no Mercado vale pelo "Conferi" do dono. As duas coisas ficam separadas.
-- O que faz: nota_fiscal_entrada_mercado(p_nota_id, p_conferi) cria UMA compra no Mercado (notas + itens, e o mercado e os produtos que faltarem) a partir da nota já guardada na Central Fiscal,
--   e registra o vínculo (notas_fiscais_vinculos, modulo 'mercado', gera_despesa = false). NÃO cria despesa nem toca no Financeiro. NÃO muda a situação fiscal da nota.
-- Regras: só o dono (e com MFA); p_conferi precisa ser verdadeiro; nota cancelada ou rejeitada não entra; a mesma nota entra uma vez só (vínculo + trava de concorrência: clicar de novo devolve a compra
--   que já existe); chave já presente numa compra do Mercado = duplicidade, nada é criado; exige data, total e emitente. Os itens vêm do banco (notas_fiscais_itens), não do navegador.
-- Itens: g e ml viram kg e l (quantidade/1000, unitário x1000); as demais unidades viram 'un'. Produto: reaproveita o produto de um item anterior com a mesma descrição; senão cria o produto com
--   o nome da nota em "Nome Próprio" e categoria 'Mercearia' (o dono ajusta em Mercado → Produtos). Desconto do item vai em itens.desconto, como o Mercado já faz.
-- SECURITY INVOKER (RLS e as travas "mfa" valem); tudo numa transação; não cria tabela, política nem gatilho; não altera dado existente. Pode rodar de novo sem estragar nada.
-- Conferência depois de aplicar: supabase/conferencias/040_conferir_producao.sql (só leitura).
begin;

create or replace function public.nota_fiscal_entrada_mercado(p_nota_id uuid, p_conferi boolean)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_casa uuid := public.dono_da_casa();
  n public.notas_fiscais%rowtype;
  v_merc uuid; v_mnota uuid; v_prod uuid; v_cat text; v_it record; v_n integer := 0;
  v_av jsonb := '[]'::jsonb; v_total numeric; v_soma numeric := 0;
  v_q numeric; v_un text; v_vu numeric; v_vt numeric; v_ds numeric; v_nome text; v_fonte text; v_obs text;
begin
  if (select auth.uid()) is null or v_casa is null then raise exception 'entrada no Mercado: faça login' using errcode = '42501'; end if;
  if (select auth.uid()) <> v_casa then raise exception 'entrada no Mercado: só o dono da casa dá entrada de nota' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'entrada no Mercado: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  if p_conferi is not true then raise exception 'entrada no Mercado: confirme que conferiu os itens com o documento' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(public.nf_trava(v_casa::text || ':mercado:' || p_nota_id::text));
  select * into n from public.notas_fiscais where id = p_nota_id for update;
  if not found then raise exception 'entrada no Mercado: nota não encontrada' using errcode = 'P0002'; end if;
  if n.situacao in ('cancelada', 'rejeitada') then raise exception 'entrada no Mercado: nota % não vale como compra', n.situacao using errcode = '22023'; end if;

  /* já entrou: devolve a compra que existe (clicar de novo não duplica) */
  select v.registro_id into v_mnota from public.notas_fiscais_vinculos v where v.nota_id = p_nota_id and v.modulo = 'mercado' and v.valido limit 1;
  if found then return jsonb_build_object('criado', false, 'ja_existia', true, 'mercado_nota_id', v_mnota); end if;

  if n.data_emissao is null or n.valor_total is null or nullif(btrim(coalesce(n.emitente_nome, '')), '') is null then
    raise exception 'entrada no Mercado: a nota precisa ter data, total e emitente' using errcode = '22023'; end if;
  if not exists (select 1 from public.notas_fiscais_itens i where i.nota_id = p_nota_id) then raise exception 'entrada no Mercado: a nota não tem itens' using errcode = '22023'; end if;
  if n.chave is not null then
    select m.id into v_mnota from public.notas m where m.chave_nfce = n.chave limit 1;
    if found then return jsonb_build_object('criado', false, 'duplicada', true, 'motivo', 'chave', 'mercado_nota_id', v_mnota); end if;
  end if;

  /* o mercado: pelo CNPJ ou pelo nome; senão cria */
  select m.id into v_merc from public.mercados m
    where (n.emitente_cnpj is not null and m.cnpj = n.emitente_cnpj) or lower(btrim(m.nome)) = lower(btrim(n.emitente_nome))
    order by (m.cnpj is not distinct from n.emitente_cnpj) desc limit 1;
  if not found then
    insert into public.mercados (nome, cnpj) values (left(btrim(n.emitente_nome), 120), n.emitente_cnpj)
      on conflict (user_id, nome) do update set cnpj = coalesce(public.mercados.cnpj, excluded.cnpj) returning id into v_merc;
  elsif n.emitente_cnpj is not null then
    update public.mercados set cnpj = n.emitente_cnpj where id = v_merc and cnpj is null;
  end if;

  v_total := coalesce(n.valor_a_pagar, n.valor_total);
  v_fonte := case n.formato_origem when 'xml' then 'qr' else 'foto' end;
  v_obs := left('Entrada pelo dono a partir da Central Fiscal (conferido com o documento). Situação fiscal: ' || n.situacao || '.'
    || case when coalesce(n.valor_descontos, 0) > 0 then ' Desconto de ' || to_char(n.valor_descontos, 'FM999999990.00') || ' na nota.' else '' end, 300);
  insert into public.notas (mercado_id, data, numero, serie, chave_nfce, forma_pagamento, total, fonte, observacao)
    values (v_merc, n.data_emissao, n.numero, n.serie, n.chave, nullif(left(coalesce(n.pagamentos->0->>'forma', ''), 60), ''), v_total, v_fonte, v_obs)
    returning id into v_mnota;

  for v_it in select * from public.notas_fiscais_itens i where i.nota_id = p_nota_id order by i.ordem, i.criado_em loop
    v_q := case when v_it.unidade in ('g', 'ml') then v_it.qtd / 1000 else v_it.qtd end;
    v_un := case v_it.unidade when 'kg' then 'kg' when 'g' then 'kg' when 'l' then 'l' when 'ml' then 'l' else 'un' end;
    v_ds := coalesce(v_it.desconto, 0);
    v_vt := greatest(v_it.total - v_ds, 0);
    v_vu := coalesce(round(v_it.unitario * case when v_it.unidade in ('g', 'ml') then 1000 else 1 end, 2), round(v_vt / nullif(v_q, 0), 2), v_vt);
    v_soma := v_soma + v_vt;
    select i2.produto_id, i2.categoria into v_prod, v_cat from public.itens i2
      where i2.produto_id is not null and lower(btrim(i2.descricao)) = lower(btrim(v_it.descricao)) order by i2.created_at desc limit 1;
    if not found then
      v_nome := left(initcap(lower(btrim(v_it.descricao))), 120);
      insert into public.produtos (nome, categoria, unidade) values (v_nome, 'Mercearia', v_un)
        on conflict (user_id, nome) do update set nome = public.produtos.nome returning id, categoria into v_prod, v_cat;
    end if;
    insert into public.itens (nota_id, produto_id, descricao, categoria, quantidade, unidade, valor_unitario, valor_total, desconto, observacao)
      values (v_mnota, v_prod, left(v_it.descricao, 200), v_cat, round(v_q, 3), v_un, v_vu, v_vt, v_ds,
              case when v_ds > 0 then 'Desconto no item: ' || to_char(v_ds, 'FM999999990.00') else null end);
    v_n := v_n + 1;
  end loop;

  if abs(v_soma - v_total) > 0.05 then
    v_av := v_av || to_jsonb('A soma dos itens (' || to_char(v_soma, 'FM999999990.00') || ') difere do total da nota (' || to_char(v_total, 'FM999999990.00') || '): confira no Mercado.'::text); end if;

  insert into public.notas_fiscais_vinculos (nota_id, modulo, registro_id, tipo, gera_despesa, valido, observacoes)
    values (p_nota_id, 'mercado', v_mnota, 'conferencia', false, true, 'Entrada no Mercado pelo dono com o "Conferi"; situação fiscal ' || n.situacao || '.');

  return jsonb_build_object('criado', true, 'ja_existia', false, 'mercado_nota_id', v_mnota, 'mercado_id', v_merc, 'itens', v_n, 'total', v_total, 'soma_itens', v_soma, 'avisos', v_av);
end $$;
revoke all on function public.nota_fiscal_entrada_mercado(uuid, boolean) from public, anon;
grant execute on function public.nota_fiscal_entrada_mercado(uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
