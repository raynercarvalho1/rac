-- Alimentação e Delivery (docs/alimentacao.md): o pedido e os itens gravados numa operação só (Etapa B.2b). Rode depois do 024.
-- Pode rodar de novo sem estragar nada. Nenhuma tabela, coluna, política ou dado muda; nada de IA, segredos ou agendamentos.
--
-- Antes, a edição era em três chamadas (atualiza o pedido → apaga os itens → grava os itens): se a última falhasse, o pedido ficava
-- sem itens. Agora o site chama public.pedido_salvar uma vez, e qualquer erro desfaz tudo (a chamada inteira é uma transação).
--
-- Segurança:
-- • security invoker: a função roda como quem chamou (authenticated), então valem as mesmas regras de hoje nas duas tabelas:
--   "casa" (dono_da_casa(): o Rayner e a Fernanda, mais ninguém) e a trava restritiva "mfa" (022). Ela não ganha nenhum poder extra.
-- • search_path vazio e nomes completos (public., pg_catalog implícito): ninguém troca uma tabela ou função por outra de mesmo nome.
-- • Só quem fez login executa (o Supabase dá EXECUTE a anon por padrão: aqui é tirado).
-- • Campos que o site não pode mandar: user_id, criado_por, criado_em, versoes, atualizado_em (o banco preenche) e, na edição, origem.
--   Campo desconhecido é recusado com erro (não é ignorado em silêncio).
-- • O gatilho pedidos_protegidos guarda user_id, criado_por, criado_em e origem também contra um UPDATE direto na tabela.
--   INSERT direto continua como hoje (a restauração do backup grava as linhas originais assim).
begin;

create or replace function public.pedido_salvar(p_pedido jsonb, p_itens jsonb, p_novo boolean)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campos constant text[] := array['id', 'data', 'hora', 'estabelecimento', 'plataforma', 'modo', 'numero', 'pagamento', 'subtotal',
    'taxa_entrega', 'taxa_servico', 'gorjeta', 'desconto_loja', 'desconto_plataforma', 'total_pago', 'observacoes', 'arquivos', 'origem'];
  campos_item constant text[] := array['descricao', 'qtd', 'unidade', 'total', 'desconto', 'observacao', 'produto_id'];
  campos_arq constant text[] := array['path', 'nome', 'tipo', 'tamanho'];
  dinheiro constant text[] := array['subtotal', 'taxa_entrega', 'taxa_servico', 'gorjeta', 'desconto_loja', 'desconto_plataforma', 'total_pago'];
  v_id uuid; v_data date; v_ant public.pedidos%rowtype; v_k text; v_v numeric; v_i jsonb; v_n integer;
  v_liquido numeric := 0; v_arq jsonb; v_ant_arq jsonb := '[]'::jsonb; v_pasta text; v_versao jsonb; v_versoes jsonb;
begin
  /* ---- o pedido ---- */
  if p_novo is null then raise exception 'pedido_salvar: diga se o pedido é novo ou uma edição' using errcode = '22023'; end if;
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then raise exception 'pedido_salvar: o pedido precisa ser um objeto' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(p_pedido) loop
    if not v_k = any (campos) then raise exception 'pedido_salvar: campo não permitido no pedido: %', v_k using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(p_pedido->'id') is distinct from 'string' or (p_pedido->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'pedido_salvar: identificador do pedido inválido' using errcode = '22023'; end if;
  v_id := (p_pedido->>'id')::uuid;
  foreach v_k in array array['data', 'estabelecimento', 'plataforma', 'modo'] loop
    if jsonb_typeof(p_pedido->v_k) is distinct from 'string' then raise exception 'pedido_salvar: falta o campo %', v_k using errcode = '22023'; end if;
  end loop;
  foreach v_k in array array['hora', 'numero', 'pagamento', 'observacoes', 'origem'] loop
    if p_pedido ? v_k and jsonb_typeof(p_pedido->v_k) not in ('string', 'null') then raise exception 'pedido_salvar: o campo % precisa ser texto', v_k using errcode = '22023'; end if;
  end loop;
  if (p_pedido->>'data') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'pedido_salvar: data inválida' using errcode = '22023'; end if;
  v_data := (p_pedido->>'data')::date;
  if v_data < date '2000-01-01' or v_data > current_date + 1 then raise exception 'pedido_salvar: a data está fora do esperado' using errcode = '22023'; end if;
  /* dinheiro: número, de zero a R$ 100.000, no máximo 2 casas (nada é arredondado em silêncio) */
  foreach v_k in array dinheiro loop
    if v_k in ('subtotal', 'total_pago') and jsonb_typeof(p_pedido->v_k) is distinct from 'number' then
      raise exception 'pedido_salvar: falta o valor de %', v_k using errcode = '22023'; end if;
    if p_pedido ? v_k and jsonb_typeof(p_pedido->v_k) not in ('number', 'null') then raise exception 'pedido_salvar: % precisa ser número', v_k using errcode = '22023'; end if;
    v_v := (p_pedido->>v_k)::numeric;
    if v_v is not null and (v_v < 0 or v_v > 100000 or v_v <> round(v_v, 2)) then raise exception 'pedido_salvar: valor inválido em %', v_k using errcode = '22023'; end if;
  end loop;

  /* ---- os itens: de 1 a 200, cada um conferido antes de gravar qualquer coisa ---- */
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'pedido_salvar: o pedido precisa de pelo menos um item' using errcode = '22023'; end if;
  if jsonb_array_length(p_itens) > 200 then raise exception 'pedido_salvar: itens demais (máximo 200)' using errcode = '22023'; end if;
  v_n := 0;
  for v_i in select e from jsonb_array_elements(p_itens) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_i) <> 'object' then raise exception 'pedido_salvar: o item % precisa ser um objeto', v_n using errcode = '22023'; end if;
    for v_k in select jsonb_object_keys(v_i) loop
      if not v_k = any (campos_item) then raise exception 'pedido_salvar: campo não permitido no item %: %', v_n, v_k using errcode = '22023'; end if;
    end loop;
    if jsonb_typeof(v_i->'descricao') is distinct from 'string' or btrim(v_i->>'descricao') = '' then raise exception 'pedido_salvar: falta o nome do item %', v_n using errcode = '22023'; end if;
    foreach v_k in array array['unidade', 'observacao', 'produto_id'] loop
      if v_i ? v_k and jsonb_typeof(v_i->v_k) not in ('string', 'null') then raise exception 'pedido_salvar: o campo % do item % precisa ser texto', v_k, v_n using errcode = '22023'; end if;
    end loop;
    if jsonb_typeof(v_i->'total') is distinct from 'number' then raise exception 'pedido_salvar: falta o total do item %', v_n using errcode = '22023'; end if;
    foreach v_k in array array['qtd', 'desconto'] loop
      if v_i ? v_k and jsonb_typeof(v_i->v_k) not in ('number', 'null') then raise exception 'pedido_salvar: o campo % do item % precisa ser número', v_k, v_n using errcode = '22023'; end if;
    end loop;
    v_v := (v_i->>'total')::numeric;
    if v_v < 0 or v_v > 100000 or v_v <> round(v_v, 2) then raise exception 'pedido_salvar: total inválido no item %', v_n using errcode = '22023'; end if;
    if coalesce((v_i->>'desconto')::numeric, 0) < 0 or coalesce((v_i->>'desconto')::numeric, 0) > v_v or (v_i->>'desconto')::numeric <> round((v_i->>'desconto')::numeric, 2) then
      raise exception 'pedido_salvar: desconto inválido no item %', v_n using errcode = '22023'; end if;
    if coalesce((v_i->>'qtd')::numeric, 1) <= 0 or coalesce((v_i->>'qtd')::numeric, 1) > 1000 then raise exception 'pedido_salvar: quantidade inválida no item %', v_n using errcode = '22023'; end if;
    if v_i->>'produto_id' is not null then
      if (v_i->>'produto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'pedido_salvar: produto inválido no item %', v_n using errcode = '22023'; end if;
      /* a chave estrangeira não olha o RLS: aqui só vale produto que a casa enxerga */
      if not exists (select 1 from public.produtos pr where pr.id = (v_i->>'produto_id')::uuid) then raise exception 'pedido_salvar: produto não encontrado no item %', v_n using errcode = '22023'; end if;
    end if;
    v_liquido := v_liquido + v_v - coalesce((v_i->>'desconto')::numeric, 0);
  end loop;
  /* o subtotal é a soma dos itens (já com o desconto de cada um), 2 centavos de folga; a conta inteira o banco já confere (pedidos_conta_fecha) */
  if abs(v_liquido - (p_pedido->>'subtotal')::numeric) > 0.02 then
    raise exception 'pedido_salvar: os itens somam %, mas o subtotal é %', v_liquido, (p_pedido->>'subtotal')::numeric using errcode = '22023'; end if;

  /* ---- novo ou edição ---- */
  if p_novo then
    /* toque duplo: o mesmo pedido já gravado volta como está, sem gravar de novo */
    if exists (select 1 from public.pedidos where id = v_id) then return jsonb_build_object('id', v_id, 'criado', false, 'ja_existia', true); end if;
  else
    if p_pedido ? 'origem' then raise exception 'pedido_salvar: a origem não muda na edição' using errcode = '22023'; end if;
    /* só acha pedido da própria casa (RLS); trava a linha até o fim */
    select * into v_ant from public.pedidos where id = v_id for update;
    if not found then raise exception 'pedido_salvar: pedido não encontrado' using errcode = 'P0002'; end if;
    v_ant_arq := v_ant.arquivos;
  end if;

  /* fotos: na edição as que já existem ficam iguais e na mesma ordem; as novas só na pasta deste pedido no cofre */
  v_arq := coalesce(p_pedido->'arquivos', '[]'::jsonb);
  if jsonb_typeof(v_arq) = 'null' then v_arq := '[]'::jsonb; end if;
  if jsonb_typeof(v_arq) <> 'array' or jsonb_array_length(v_arq) > 50 then raise exception 'pedido_salvar: lista de fotos inválida' using errcode = '22023'; end if;
  if jsonb_array_length(v_arq) < jsonb_array_length(v_ant_arq) then raise exception 'pedido_salvar: as fotos já guardadas não saem pela edição' using errcode = '22023'; end if;
  v_pasta := public.dono_da_casa()::text || '/alimentacao/' || v_id::text || '/';
  for v_n in 0 .. jsonb_array_length(v_arq) - 1 loop
    v_i := v_arq->v_n;
    if v_n < jsonb_array_length(v_ant_arq) then
      if v_i is distinct from v_ant_arq->v_n then raise exception 'pedido_salvar: as fotos já guardadas não mudam pela edição' using errcode = '22023'; end if;
      continue;
    end if;
    if jsonb_typeof(v_i) <> 'object' or jsonb_typeof(v_i->'path') is distinct from 'string' then raise exception 'pedido_salvar: foto sem caminho' using errcode = '22023'; end if;
    for v_k in select jsonb_object_keys(v_i) loop
      if not v_k = any (campos_arq) then raise exception 'pedido_salvar: campo não permitido na foto: %', v_k using errcode = '22023'; end if;
    end loop;
    if left(v_i->>'path', length(v_pasta)) <> v_pasta or position('..' in v_i->>'path') > 0 or length(v_i->>'path') > 300 then
      raise exception 'pedido_salvar: foto fora da pasta deste pedido' using errcode = '22023'; end if;
  end loop;

  if p_novo then
    insert into public.pedidos (id, data, hora, estabelecimento, plataforma, modo, numero, pagamento, subtotal, taxa_entrega, taxa_servico,
      gorjeta, desconto_loja, desconto_plataforma, total_pago, observacoes, arquivos, origem)
    values (v_id, v_data, p_pedido->>'hora', p_pedido->>'estabelecimento', p_pedido->>'plataforma', p_pedido->>'modo', p_pedido->>'numero',
      p_pedido->>'pagamento', (p_pedido->>'subtotal')::numeric, coalesce((p_pedido->>'taxa_entrega')::numeric, 0),
      coalesce((p_pedido->>'taxa_servico')::numeric, 0), coalesce((p_pedido->>'gorjeta')::numeric, 0), coalesce((p_pedido->>'desconto_loja')::numeric, 0),
      coalesce((p_pedido->>'desconto_plataforma')::numeric, 0), (p_pedido->>'total_pago')::numeric, p_pedido->>'observacoes', v_arq,
      coalesce(p_pedido->>'origem', 'manual'));
  else
    /* a versão anterior (o mesmo formato de NUCLEO.alVersao), montada aqui com o que está no banco; guarda as 10 últimas */
    v_versao := jsonb_strip_nulls(jsonb_build_object('em', coalesce(v_ant.atualizado_em, v_ant.criado_em), 'quando', now(),
      'data', v_ant.data, 'estabelecimento', v_ant.estabelecimento, 'plataforma', v_ant.plataforma, 'modo', v_ant.modo, 'numero', v_ant.numero,
      'pagamento', v_ant.pagamento, 'subtotal', v_ant.subtotal, 'taxa_entrega', v_ant.taxa_entrega, 'taxa_servico', v_ant.taxa_servico,
      'gorjeta', v_ant.gorjeta, 'desconto_loja', v_ant.desconto_loja, 'desconto_plataforma', v_ant.desconto_plataforma, 'total_pago', v_ant.total_pago,
      'observacoes', v_ant.observacoes))
      || jsonb_build_object('itens', (select coalesce(jsonb_agg(jsonb_build_object('descricao', it.descricao, 'qtd', it.qtd, 'total', it.total) order by it.ordem), '[]'::jsonb)
                                      from public.pedido_itens it where it.pedido_id = v_id));
    select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) into v_versoes
      from (select e, n from jsonb_array_elements(v_ant.versoes || jsonb_build_array(v_versao)) with ordinality as a(e, n) order by n desc limit 10) x;
    update public.pedidos set data = v_data, hora = p_pedido->>'hora', estabelecimento = p_pedido->>'estabelecimento',
      plataforma = p_pedido->>'plataforma', modo = p_pedido->>'modo', numero = p_pedido->>'numero', pagamento = p_pedido->>'pagamento',
      subtotal = (p_pedido->>'subtotal')::numeric, taxa_entrega = coalesce((p_pedido->>'taxa_entrega')::numeric, 0),
      taxa_servico = coalesce((p_pedido->>'taxa_servico')::numeric, 0), gorjeta = coalesce((p_pedido->>'gorjeta')::numeric, 0),
      desconto_loja = coalesce((p_pedido->>'desconto_loja')::numeric, 0), desconto_plataforma = coalesce((p_pedido->>'desconto_plataforma')::numeric, 0),
      total_pago = (p_pedido->>'total_pago')::numeric, observacoes = p_pedido->>'observacoes', arquivos = v_arq,
      versoes = v_versoes, atualizado_em = now()
    where id = v_id;
    delete from public.pedido_itens where pedido_id = v_id;
  end if;

  /* os itens na ordem da tela; o unitário é derivado (total ÷ quantidade), como o site já fazia */
  insert into public.pedido_itens (pedido_id, ordem, descricao, qtd, unidade, unitario, total, desconto, observacao, produto_id)
  select v_id, (a.n - 1)::integer, btrim(a.e->>'descricao'), coalesce((a.e->>'qtd')::numeric, 1), coalesce(a.e->>'unidade', 'un'),
         round((a.e->>'total')::numeric / coalesce((a.e->>'qtd')::numeric, 1), 2), (a.e->>'total')::numeric,
         coalesce((a.e->>'desconto')::numeric, 0), a.e->>'observacao', (a.e->>'produto_id')::uuid
  from jsonb_array_elements(p_itens) with ordinality as a(e, n);

  return jsonb_build_object('id', v_id, 'criado', p_novo, 'ja_existia', false);
end $$;
revoke all on function public.pedido_salvar(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.pedido_salvar(jsonb, jsonb, boolean) to authenticated;

-- user_id, criado_por, criado_em e origem não mudam por UPDATE, nem direto na tabela. Mantém o valor de antes em silêncio (não dá erro)
-- para não quebrar a restauração do backup, que troca linhas inteiras (upsert) quando o dono marca.
create or replace function public.pedidos_protegidos() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  new.user_id := old.user_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em; new.origem := old.origem;
  return new;
end $$;
revoke all on function public.pedidos_protegidos() from public, anon;
drop trigger if exists pedidos_protegidos on public.pedidos;
create trigger pedidos_protegidos before update on public.pedidos for each row execute function public.pedidos_protegidos();

commit;

notify pgrst, 'reload schema';
