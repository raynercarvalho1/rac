-- status: pendente (preparada em 07/11/2026; NÃO foi executada em lugar nenhum; o dono roda no SQL Editor)
-- Compras · Lote 5.1, etapa 3 (docs/compras.md): completar a compra ao anexar documentos e vincular a foto ao produto, SEM gravação fora da transação.
-- Rode depois do 030 e do 034 (precisa de compras_gravar, dono_da_casa() e das tabelas de Compras). Pode rodar de novo sem estragar nada.
--
-- O que faz (só soma: nenhuma tabela, coluna, política ou dado existente muda; compras_gravar continua exatamente como é):
-- • compras_anexar(p_id, p_docs, p_complemento): anexa documentos a uma compra que já existe (usa compras_gravar no modo "só documentos") E completa a compra,
--   tudo na MESMA transação: se qualquer parte falhar, nada fica (nem o documento, nem o campo). Substitui o que o site fazia com um update separado (ccCompletar):
--     chave_nfe, numero_nf, emitente e cnpj: só preenchem o que está VAZIO (nunca trocam o que já está gravado);
--     status: só vira cancelamento_informado ou reembolso_informado quando a compra está sem status (o e-mail só avisa; confirmar o cancelamento continua sendo do dono);
--     divergencias: as novas entram no fim da lista, sem repetir o texto de uma que já existe.
--   Se a chave da nota já pertence a outra compra, o índice único recusa e a transação inteira volta (o documento também não fica).
-- • compras_gravar_com_foto(p_compra, p_itens, p_docs, p_novo, p_foto): o mesmo que compras_gravar, e, na mesma transação, liga o PRIMEIRO produto à foto
--   (compras_online_itens.imagem_path) SÓ se a foto ficou registrada como documento (tipo foto_produto, desta compra) e o produto ainda não tem imagem.
--   Foto repetida (mesmo SHA-256, que compras_gravar descarta) nunca é ligada: nenhum item aponta para arquivo que sumiu. Edição que já tem imagem_path não muda.
-- Segurança: as duas funções são security invoker (valem a regra "casa" e a trava restritiva "mfa" do 022 nas tabelas), search_path vazio, anon e public sem EXECUTE.
-- Mensagens de erro: as da própria compras_gravar (mesmos códigos 22023, 42501, P0002, 23505), mais as validações do complemento (22023).
begin;

-- 1) compras_anexar ------------------------------------------------------------------------------------------------------------------------
create or replace function public.compras_anexar(p_id uuid, p_docs jsonb, p_complemento jsonb)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campos constant text[] := array['chave_nfe', 'numero_nf', 'emitente', 'cnpj', 'status', 'divergencias'];
  v_k text; v_r jsonb; v_c public.compras_online%rowtype; v_comp jsonb := coalesce(p_complemento, '{}'::jsonb);
  v_ch text; v_nf text; v_em text; v_cn text; v_st text; v_novas jsonb := '[]'::jsonb; v_e jsonb; v_n integer; v_feitos text[] := '{}';
begin
  if (select auth.uid()) is null or public.dono_da_casa() is null then raise exception 'compras_anexar: faça login' using errcode = '42501'; end if;
  if p_id is null then raise exception 'compras_anexar: falta o id da compra' using errcode = '22023'; end if;
  if p_docs is null or jsonb_typeof(p_docs) <> 'array' then raise exception 'compras_anexar: a lista de documentos precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(v_comp) <> 'object' then raise exception 'compras_anexar: o complemento precisa ser um objeto' using errcode = '22023'; end if;

  /* ---- o complemento, conferido ANTES de gravar qualquer coisa ---- */
  for v_k in select jsonb_object_keys(v_comp) loop
    if not v_k = any (campos) then raise exception 'compras_anexar: campo não permitido no complemento: %', v_k using errcode = '22023'; end if;
  end loop;
  foreach v_k in array array['chave_nfe', 'numero_nf', 'emitente', 'cnpj', 'status'] loop
    if v_comp ? v_k and jsonb_typeof(v_comp->v_k) not in ('string', 'null') then raise exception 'compras_anexar: o campo % precisa ser texto', v_k using errcode = '22023'; end if;
  end loop;
  v_ch := v_comp->>'chave_nfe'; v_nf := v_comp->>'numero_nf'; v_em := v_comp->>'emitente'; v_cn := v_comp->>'cnpj'; v_st := v_comp->>'status';
  if v_ch is not null and v_ch !~ '^\d{44}$' then raise exception 'compras_anexar: chave da nota inválida' using errcode = '22023'; end if;
  if v_cn is not null and v_cn !~ '^\d{14}$' then raise exception 'compras_anexar: CNPJ inválido' using errcode = '22023'; end if;
  if v_nf is not null and length(v_nf) > 20 then raise exception 'compras_anexar: número da nota longo demais' using errcode = '22023'; end if;
  if v_em is not null and length(v_em) > 160 then raise exception 'compras_anexar: emitente longo demais' using errcode = '22023'; end if;
  if v_st is not null and v_st not in ('cancelamento_informado', 'reembolso_informado') then raise exception 'compras_anexar: status não permitido (só cancelamento_informado ou reembolso_informado)' using errcode = '22023'; end if;
  if v_comp ? 'divergencias' and jsonb_typeof(v_comp->'divergencias') not in ('array', 'null') then raise exception 'compras_anexar: divergencias precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(v_comp->'divergencias') = 'array' then
    if jsonb_array_length(v_comp->'divergencias') > 20 then raise exception 'compras_anexar: divergências demais (máximo 20 por vez)' using errcode = '22023'; end if;
    v_n := 0;
    for v_e in select e from jsonb_array_elements(v_comp->'divergencias') e loop
      v_n := v_n + 1;
      if jsonb_typeof(v_e) <> 'object' then raise exception 'compras_anexar: a divergência % precisa ser um objeto', v_n using errcode = '22023'; end if;
      for v_k in select jsonb_object_keys(v_e) loop
        if not v_k = any (array['campo', 'texto']) then raise exception 'compras_anexar: campo não permitido na divergência %: %', v_n, v_k using errcode = '22023'; end if;
      end loop;
      if jsonb_typeof(v_e->'texto') is distinct from 'string' or btrim(v_e->>'texto') = '' or length(v_e->>'texto') > 300 then raise exception 'compras_anexar: texto inválido na divergência %', v_n using errcode = '22023'; end if;
      if v_e ? 'campo' and (jsonb_typeof(v_e->'campo') <> 'string' or length(v_e->>'campo') > 40) then raise exception 'compras_anexar: campo inválido na divergência %', v_n using errcode = '22023'; end if;
    end loop;
  end if;

  /* ---- os documentos: o modo "só documentos" de compras_gravar (valida pasta, cofre, tipo e SHA-256; documento repetido volta em docs_repetidos).
          Também confere que a compra existe e é da casa (P0002) e trava a linha até o fim. ---- */
  v_r := public.compras_gravar(jsonb_build_object('id', p_id), null, p_docs, false);

  /* ---- o complemento: só preenche o que está vazio ---- */
  select * into v_c from public.compras_online where id = p_id for update;
  if not found then raise exception 'compras_anexar: compra não encontrada' using errcode = 'P0002'; end if;
  v_ch := case when coalesce(v_c.chave_nfe, '') = '' then v_ch end;
  v_nf := case when coalesce(v_c.numero_nf, '') = '' then v_nf end;
  v_em := case when coalesce(v_c.emitente, '') = '' then v_em end;
  v_cn := case when coalesce(v_c.cnpj, '') = '' then v_cn end;
  v_st := case when v_c.status is null or v_c.status = '' then v_st end;
  if jsonb_typeof(v_comp->'divergencias') = 'array' then
    select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) into v_novas
      from (select distinct on (a.e->>'texto') a.e, a.n
              from jsonb_array_elements(v_comp->'divergencias') with ordinality as a(e, n)
             where not exists (select 1 from jsonb_array_elements(v_c.divergencias) o where o->>'texto' = a.e->>'texto')
             order by a.e->>'texto', a.n) x;
    if jsonb_array_length(v_c.divergencias) + jsonb_array_length(v_novas) > 100 then raise exception 'compras_anexar: divergências demais nesta compra (máximo 100)' using errcode = '22023'; end if;
  end if;
  if v_ch is not null then v_feitos := array_append(v_feitos, 'chave_nfe'); end if;
  if v_nf is not null then v_feitos := array_append(v_feitos, 'numero_nf'); end if;
  if v_em is not null then v_feitos := array_append(v_feitos, 'emitente'); end if;
  if v_cn is not null then v_feitos := array_append(v_feitos, 'cnpj'); end if;
  if v_st is not null then v_feitos := array_append(v_feitos, 'status'); end if;
  if jsonb_array_length(v_novas) > 0 then v_feitos := array_append(v_feitos, 'divergencias'); end if;
  if array_length(v_feitos, 1) is not null then
    update public.compras_online set chave_nfe = coalesce(v_ch, chave_nfe), numero_nf = coalesce(v_nf, numero_nf), emitente = coalesce(v_em, emitente), cnpj = coalesce(v_cn, cnpj),
      status = coalesce(v_st, status), divergencias = divergencias || v_novas, atualizado_em = now()
    where id = p_id;
  end if;
  return v_r || jsonb_build_object('completados', to_jsonb(v_feitos), 'divergencias_novas', jsonb_array_length(v_novas));
end $$;
revoke all on function public.compras_anexar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.compras_anexar(uuid, jsonb, jsonb) to authenticated;

-- 2) compras_gravar_com_foto ----------------------------------------------------------------------------------------------------------------
create or replace function public.compras_gravar_com_foto(p_compra jsonb, p_itens jsonb, p_docs jsonb, p_novo boolean, p_foto text)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_r jsonb; v_id uuid; v_n integer := 0;
begin
  if p_foto is not null and (btrim(p_foto) = '' or length(p_foto) > 300 or position('..' in p_foto) > 0) then
    raise exception 'compras_gravar_com_foto: caminho da foto inválido' using errcode = '22023'; end if;
  v_r := public.compras_gravar(p_compra, p_itens, p_docs, p_novo);
  v_id := (v_r->>'id')::uuid;
  /* só liga a foto que FICOU registrada como documento desta compra; compra que já existia (toque duplo) não muda; produto que já tem imagem não muda */
  if p_foto is not null and not coalesce((v_r->>'ja_existia')::boolean, false) then
    update public.compras_online_itens it set imagem_path = d.path
      from public.compras_online_docs d
     where it.compra_id = v_id and it.ordem = 0 and it.imagem_path is null
       and d.compra_id = v_id and d.path = p_foto and d.tipo = 'foto_produto';
    get diagnostics v_n = row_count;
  end if;
  return v_r || jsonb_build_object('foto_vinculada', v_n > 0);
end $$;
revoke all on function public.compras_gravar_com_foto(jsonb, jsonb, jsonb, boolean, text) from public, anon;
grant execute on function public.compras_gravar_com_foto(jsonb, jsonb, jsonb, boolean, text) to authenticated;

commit;

notify pgrst, 'reload schema';
