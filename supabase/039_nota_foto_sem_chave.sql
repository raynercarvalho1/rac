-- PROPOSTA 039 · NÃO APLICADA EM PRODUÇÃO (Lote 1.6, pedido do dono em 08/11/2026). O dono roda no SQL Editor do Supabase ANTES de usar "gravar sem chave" no site.
-- Por que existe: a 037 recusa nota de foto/PDF sem chave de acesso (resultado "bloqueada"). O dono pediu poder gravar nota sem chave, confirmando que conferiu com o documento.
-- O que muda: SÓ a função nota_fiscal_salvar_doc é recriada, igual à da 037 com uma única diferença: chave ausente + revisada = true (o dono conferiu) deixa de bloquear.
--   A nota é gravada SEMPRE como pendente fiscal: se a leitura dizia "autorizada", a situação gravada vira "pendente" (sem chave não há como provar a autorização; o dono autoriza depois
--   com nota_fiscal_atualizar_situacao e o protocolo). Nunca "validada", nunca conferida na gravação, nunca gera despesa. Sem a revisão do dono, chave ausente continua bloqueando.
-- Custo assumido pelo dono: sem chave não há checagem de duplicidade pela chave (continua a do arquivo, pelo SHA-256, e a do id) nem validação da chave.
-- Não cria tabela, não altera dado, política, gatilho nem permissão; mesmas permissões (revoke de public e anon; execute só para authenticated). Pode rodar de novo sem estragar nada.
-- Conferência depois de aplicar: supabase/conferencias/039_conferir_producao.sql (só leitura).
begin;

create or replace function public.nota_fiscal_salvar_doc(p_nota jsonb, p_itens jsonb, p_docs jsonb, p_proc jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  m2 constant numeric := 9999999999.99;
  m4 constant numeric := 9999999999.9999;
  campos constant text[] := array['id','modelo','chave','numero','serie','data_emissao','emitente_nome','emitente_cnpj','emitente_uf','tp_emis','situacao',
    'situacao_evidencia','protocolo','denegada','valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar',
    'pagamentos','formato_origem','requer_conferencia','observacoes'];
  dinheiro constant text[] := array['valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar'];
  campos_item constant text[] := array['codigo','descricao','qtd','unidade','unidade_original','unitario','total','desconto'];
  campos_pag  constant text[] := array['codigo','forma','valor','bandeira','final'];
  campos_doc  constant text[] := array['tipo','nome','path','mime','tamanho','sha256'];
  campos_proc constant text[] := array['idem','classe','confianca','revisada','diferenca','componentes','motivos','incertos','modelo_ia','ia_uso_id'];   -- 'motivos' é informativo: o banco grava os motivos que ele mesmo calcula
  v_casa uuid; v_id uuid; v_k text; v_i jsonb; v_pags jsonb; v_d jsonb; v_meta jsonb; v_ex jsonb; v_av jsonb := '[]'::jsonb; v_mot jsonb := '[]'::jsonb; v_inc jsonb := '[]'::jsonb;
  v_chave text; v_cnpj text; v_dt text; v_formato text; v_origem text; v_sit text; v_pasta text; v_idem uuid; v_conf numeric; v_rev boolean; v_comp numeric;
  v_classe text; v_resultado text; v_tid uuid := gen_random_uuid(); v_uso uuid; v_modelo text; v_exist jsonb;
  v_paths text[] := '{}'; v_shas text[] := '{}'; v_docs jsonb := '[]'::jsonb; v_regs jsonb := '[]'::jsonb; v_sem jsonb;
  v_tam bigint; v_mime text; v_ext text; v_sha text; v_path text; v_tipo text; v_fora boolean; v_n integer;
  v_soma numeric := 0; v_desc_it numeric := 0; v_desc numeric; v_dif numeric; v_total numeric; v_qtd numeric; v_un numeric; v_it numeric; v_dsc numeric;
  v_baixa boolean := false; v_div boolean := false; v_travas bigint[]; v_lk bigint; v_prev public.notas_fiscais_tentativas%rowtype; v_lim bigint;
begin
  v_casa := public.dono_da_casa();
  if (select auth.uid()) is null or v_casa is null then raise exception 'nota_fiscal_salvar_doc: faça login' using errcode = '42501'; end if;
  if (select auth.uid()) <> v_casa then raise exception 'nota_fiscal_salvar_doc: só o dono da casa lê nota de foto ou PDF' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_salvar_doc: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;

  -- a nota
  perform public.nf_v_campos(p_nota, campos, 'nota');
  if public.nf_v_texto(p_nota, 'id', true, 36, uuid_re) is null then raise exception 'nota_fiscal_salvar_doc: identificador inválido' using errcode = '22023'; end if;
  v_id := (p_nota->>'id')::uuid;
  v_pasta := v_casa::text || '/notas-fiscais/' || v_id::text || '/';
  perform public.nf_v_texto(p_nota, 'modelo', true, 2, '^(55|65)$');
  v_formato := public.nf_v_texto(p_nota, 'formato_origem', true, 6, '^(pdf|imagem)$');
  v_origem := case v_formato when 'pdf' then 'pdf' else 'foto' end;
  if public.nf_v_bool(p_nota, 'requer_conferencia', true) is not true then raise exception 'nota_fiscal_salvar_doc: nota de foto ou PDF sempre requer conferência' using errcode = '22023'; end if;
  v_chave := public.nf_v_texto(p_nota, 'chave', false, 44, '^\d{44}$');
  if v_chave is not null and not public.nf_chave_dv_ok(v_chave) then raise exception 'nota_fiscal_salvar_doc: a chave de acesso não passa no dígito verificador' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'numero', false, 9, '^\d{1,9}$'); perform public.nf_v_texto(p_nota, 'serie', false, 3, '^\d{1,3}$');
  v_dt := public.nf_v_texto(p_nota, 'data_emissao', false, 10, '^\d{4}-\d{2}-\d{2}$');
  if v_dt is not null and (v_dt::date < date '1995-01-01' or v_dt::date > current_date + 1) then raise exception 'nota_fiscal_salvar_doc: a data está fora do esperado' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_nome', false, 120, null);
  v_cnpj := public.nf_v_texto(p_nota, 'emitente_cnpj', false, 14, '^\d{14}$');
  if v_cnpj is not null and not public.nf_cnpj_ok(v_cnpj) then raise exception 'nota_fiscal_salvar_doc: CNPJ do emitente inválido' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_uf', false, 2, '^[A-Z]{2}$'); perform public.nf_v_num(p_nota, 'tp_emis', false, 1, 9, 0);
  v_sit := public.nf_v_texto(p_nota, 'situacao', true, 12, '^(autorizada|contingencia|pendente|rejeitada|cancelada)$');
  perform public.nf_v_texto(p_nota, 'situacao_evidencia', false, 200, null); perform public.nf_v_texto(p_nota, 'protocolo', false, 15, '^\d{15}$');
  perform public.nf_v_bool(p_nota, 'denegada', false); perform public.nf_v_texto(p_nota, 'observacoes', false, 500, null);
  foreach v_k in array dinheiro loop perform public.nf_v_num(p_nota, v_k, v_k = 'valor_total', 0, m2, 2); end loop;
  v_total := (p_nota->>'valor_total')::numeric;
  if p_nota ? 'pagamentos' and jsonb_typeof(p_nota->'pagamentos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: pagamentos precisa ser uma lista' using errcode = '22023'; end if;
  v_pags := case when jsonb_typeof(p_nota->'pagamentos') = 'array' then p_nota->'pagamentos' else '[]'::jsonb end;
  if jsonb_array_length(v_pags) > 10 then raise exception 'nota_fiscal_salvar_doc: pagamentos demais (máximo 10)' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(v_pags) e loop
    perform public.nf_v_campos(v_i, campos_pag, 'pagamento'); perform public.nf_v_texto(v_i, 'codigo', false, 2, '^\d{2}$'); perform public.nf_v_texto(v_i, 'forma', false, 40, null);
    perform public.nf_v_num(v_i, 'valor', true, 0, m2, 2); perform public.nf_v_texto(v_i, 'bandeira', false, 30, null); perform public.nf_v_texto(v_i, 'final', false, 4, '^\d{4}$');
  end loop;

  -- os itens
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 990 then raise exception 'nota_fiscal_salvar_doc: a nota precisa de 1 a 990 itens' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(p_itens) e loop
    perform public.nf_v_campos(v_i, campos_item, 'item');
    perform public.nf_v_texto(v_i, 'descricao', true, 200, null); perform public.nf_v_texto(v_i, 'codigo', false, 60, null);
    perform public.nf_v_num(v_i, 'qtd', true, 0.0001, m4, 4);
    perform public.nf_v_texto(v_i, 'unidade', false, 5, '^(un|pc|cx|pct|par|kg|g|l|ml|m|outra)$'); perform public.nf_v_texto(v_i, 'unidade_original', false, 20, null);
    perform public.nf_v_num(v_i, 'unitario', false, 0, m4, 4); perform public.nf_v_num(v_i, 'total', true, 0, m2, 2); perform public.nf_v_num(v_i, 'desconto', false, 0, m2, 2);
  end loop;

  -- o processamento declarado pelo site
  perform public.nf_v_campos(p_proc, campos_proc, 'processamento');
  v_idem := public.nf_v_texto(p_proc, 'idem', true, 36, uuid_re)::uuid;
  perform public.nf_v_texto(p_proc, 'classe', true, 15, '^(consistente|divergente|baixa_confianca)$');            -- informativo: o banco refaz a conta
  v_conf := public.nf_v_num(p_proc, 'confianca', true, 0, 1, 3);
  v_rev := public.nf_v_bool(p_proc, 'revisada', true);
  perform public.nf_v_num(p_proc, 'diferenca', false, -m2, m2, 2);
  v_comp := coalesce(public.nf_v_num(p_proc, 'componentes', false, -m2, m2, 2), 0);
  v_modelo := public.nf_v_texto(p_proc, 'modelo_ia', false, 60, null);
  v_uso := public.nf_v_texto(p_proc, 'ia_uso_id', false, 36, uuid_re)::uuid;
  if p_proc ? 'motivos' and jsonb_typeof(p_proc->'motivos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: motivos precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(p_proc->'motivos') = 'array' then
    if jsonb_array_length(p_proc->'motivos') > 10 then raise exception 'nota_fiscal_salvar_doc: motivos demais' using errcode = '22023'; end if;
    for v_i in select e from jsonb_array_elements(p_proc->'motivos') e loop
      if jsonb_typeof(v_i) <> 'string' or char_length(v_i #>> '{}') > 200 then raise exception 'nota_fiscal_salvar_doc: cada motivo é um texto de até 200 caracteres' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_proc ? 'incertos' and jsonb_typeof(p_proc->'incertos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: incertos precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(p_proc->'incertos') = 'array' then
    if jsonb_array_length(p_proc->'incertos') > 20 then raise exception 'nota_fiscal_salvar_doc: incertos demais' using errcode = '22023'; end if;
    for v_i in select e from jsonb_array_elements(p_proc->'incertos') e loop
      perform public.nf_v_campos(v_i, array['campo','motivo'], 'incerto'); perform public.nf_v_texto(v_i, 'campo', true, 60, null); perform public.nf_v_texto(v_i, 'motivo', false, 200, null);
    end loop;
    v_inc := p_proc->'incertos';
  end if;

  -- os originais: PDF = 1 arquivo; imagem = 1 a 4. Caminho EXATO <dono>/notas-fiscais/<nota>/<sha256>.<ext> no cofre "familia", batendo com o objeto real
  if jsonb_typeof(p_docs) is distinct from 'array' or jsonb_array_length(p_docs) not between 1 and 4 or (v_formato = 'pdf' and jsonb_array_length(p_docs) <> 1) then
    raise exception 'nota_fiscal_salvar_doc: PDF tem 1 arquivo; fotos, de 1 a 4' using errcode = '22023'; end if;
  for v_d in select e from jsonb_array_elements(p_docs) e loop
    perform public.nf_v_campos(v_d, campos_doc, 'documento');
    v_tipo := public.nf_v_texto(v_d, 'tipo', true, 6, '^(pdf|imagem)$');
    if v_tipo <> v_formato then raise exception 'nota_fiscal_salvar_doc: o tipo do documento precisa ser igual ao formato da nota' using errcode = '22023'; end if;
    perform public.nf_v_texto(v_d, 'nome', true, 200, null);
    v_mime := public.nf_v_texto(v_d, 'mime', true, 100, '^(application/pdf|image/jpeg|image/png|image/webp)$');
    if (v_formato = 'pdf') <> (v_mime = 'application/pdf') then raise exception 'nota_fiscal_salvar_doc: o tipo do arquivo não combina com o formato da nota' using errcode = '22023'; end if;
    v_lim := case when v_formato = 'pdf' then 10485760 else 12582912 end;
    perform public.nf_v_num(v_d, 'tamanho', true, 1, v_lim, 0);
    v_sha := public.nf_v_texto(v_d, 'sha256', true, 64, '^[0-9a-f]{64}$');
    if v_sha = any (v_shas) then raise exception 'nota_fiscal_salvar_doc: arquivo repetido na mesma nota' using errcode = '22023'; end if;
    v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
    v_path := public.nf_v_texto(v_d, 'path', true, 300, null);
    if v_path <> v_pasta || v_sha || '.' || v_ext then raise exception 'nota_fiscal_salvar_doc: o caminho do documento precisa ser exatamente <dono>/notas-fiscais/<nota>/<sha256>.<extensão>' using errcode = '22023'; end if;
    select o.metadata, coalesce((to_jsonb(o)->>'is_delete_marker')::boolean, false) or (to_jsonb(o)->>'archived_at') is not null into v_meta, v_fora
      from storage.objects o where o.bucket_id = 'familia' and o.name = v_path order by ((to_jsonb(o)->>'archived_at') is not null), o.created_at desc limit 1;
    if not found or v_fora then raise exception 'nota_fiscal_salvar_doc: o arquivo não está no cofre' using errcode = '22023'; end if;
    v_tam := case when jsonb_typeof(v_meta->'size') = 'number' and (v_meta->>'size') ~ '^\d+$' then (v_meta->>'size')::bigint end;
    if v_tam is null then raise exception 'nota_fiscal_salvar_doc: o Storage não informou o tamanho do arquivo' using errcode = '22023'; end if;
    if v_tam <> (v_d->>'tamanho')::bigint then raise exception 'nota_fiscal_salvar_doc: o tamanho informado não bate com o arquivo no cofre' using errcode = '22023'; end if;
    if (case when jsonb_typeof(v_meta->'mimetype') = 'string' then lower(btrim(split_part(v_meta->>'mimetype', ';', 1))) end) is distinct from v_mime then
      raise exception 'nota_fiscal_salvar_doc: o tipo informado não bate com o arquivo no cofre' using errcode = '22023'; end if;
    v_paths := v_paths || v_path; v_shas := v_shas || v_sha;
    v_docs := v_docs || jsonb_build_array(jsonb_build_object('tipo', v_tipo, 'nome', v_d->>'nome', 'path', v_path, 'mime', v_mime, 'tamanho', (v_d->>'tamanho')::bigint, 'sha256', v_sha));
  end loop;

  -- concorrência: idem, chave, arquivos e id, por casa, em ordem crescente (sem deadlock)
  select coalesce(array_agg(t.k order by t.k), '{}') into v_travas from (select distinct x.k from unnest(array[
      public.nf_trava(v_casa::text || ':idem:' || v_idem::text), public.nf_trava(v_casa::text || ':id:' || v_id::text),
      case when v_chave is not null then public.nf_trava(v_casa::text || ':chave:' || v_chave) end]
      || array(select public.nf_trava(v_casa::text || ':sha:' || s) from unnest(v_shas) s)) as x(k) where x.k is not null) t;
  foreach v_lk in array v_travas loop perform pg_advisory_xact_lock(v_lk); end loop;

  -- o mesmo clique de novo (retentativa de rede): devolve o que já foi decidido, sem gravar nada
  select * into v_prev from public.notas_fiscais_tentativas where user_id = v_casa and idem = v_idem;
  if found then
    return jsonb_build_object('id', v_prev.nota_id, 'criado', false, 'ja_existia', true, 'resultado', v_prev.resultado, 'classe', v_prev.classe, 'tentativa_id', v_prev.id,
      'motivos', v_prev.motivos, 'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end if;

  -- a conta refeita pelo banco (itens, descontos, frete, outras despesas e componentes declarados) e a confiança mínima
  for v_i, v_n in select e.v, e.n::integer from jsonb_array_elements(p_itens) with ordinality as e(v, n) loop
    v_it := (v_i->>'total')::numeric; v_qtd := (v_i->>'qtd')::numeric; v_un := (v_i->>'unitario')::numeric; v_dsc := coalesce((v_i->>'desconto')::numeric, 0);
    v_soma := v_soma + v_it; v_desc_it := v_desc_it + v_dsc;
    if v_un is not null and abs(v_it - v_qtd * v_un) > 0.01 + v_qtd * 0.00005 then
      v_div := true; v_mot := v_mot || to_jsonb('Item ' || v_n || ': quantidade × unitário não bate com o total.'::text); end if;
    if v_dsc > v_it then v_div := true; v_mot := v_mot || to_jsonb('Item ' || v_n || ': o desconto é maior que o item.'::text); end if;
  end loop;
  v_desc := coalesce((p_nota->>'valor_descontos')::numeric, v_desc_it);
  if (p_nota->>'valor_descontos') is not null and v_desc_it > 0 and abs((p_nota->>'valor_descontos')::numeric - v_desc_it) > 0.01 then
    v_div := true; v_mot := v_mot || to_jsonb('A soma dos descontos dos itens difere do desconto total da nota.'::text); end if;
  if (p_nota->>'valor_produtos') is not null and abs(v_soma - (p_nota->>'valor_produtos')::numeric) > 0.01 then
    v_div := true; v_mot := v_mot || to_jsonb('A soma dos itens difere do total de produtos da nota.'::text); end if;
  v_dif := v_soma - v_desc + coalesce((p_nota->>'valor_frete')::numeric, 0) + coalesce((p_nota->>'valor_outras')::numeric, 0) + v_comp - v_total;
  if abs(v_dif) > 0.01 then v_div := true; v_mot := v_mot || to_jsonb('A conta dos itens difere do total fiscal em ' || to_char(abs(v_dif), 'FM999999990.00') || (case when v_dif > 0 then ' a mais.' else ' a menos.' end)); end if;
  if v_chave is null then
    if v_rev then       -- 039: sem chave só entra com a revisão do dono; nunca vira validada (sem chave não há como provar a autorização)
      if v_sit = 'autorizada' then v_sit := 'pendente'; end if;
      v_av := v_av || to_jsonb('Nota sem chave de acesso válida, gravada por revisão do dono: fica pendente fiscal, sem validação e sem conferência da duplicidade pela chave.'::text);
    else
      v_baixa := true; v_mot := v_mot || to_jsonb('A chave de acesso está ausente ou inválida.'::text);
    end if;
  end if;
  if v_conf < 0.9 and not v_rev then v_baixa := true; v_mot := v_mot || to_jsonb('Confiança da leitura abaixo do mínimo (0,90) e sem revisão do dono.'::text); end if;
  v_classe := case when v_baixa then 'baixa_confianca' when v_div then 'divergente' else 'consistente' end;
  if v_sit in ('cancelada', 'rejeitada') then v_mot := v_mot || to_jsonb('Nota ' || v_sit || ': não vale como compra fiscal validada.'); end if;
  v_resultado := case when v_classe <> 'consistente' or v_sit in ('cancelada', 'rejeitada') then 'bloqueada' when v_sit = 'autorizada' then 'validada' else 'pendente_fiscal' end;
  if v_resultado = 'pendente_fiscal' then v_av := v_av || to_jsonb('Nota em ' || v_sit || ': guardada como pendente fiscal, sem conferência até ser autorizada.'); end if;

  -- duplicidade: o mesmo id, a mesma chave ou algum arquivo já registrado numa nota
  v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[1]);
  if v_ex is null then
    for v_n in 2 .. coalesce(array_length(v_shas, 1), 0) loop
      v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[v_n]); exit when v_ex is not null;
    end loop;
  end if;
  v_sem := coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb);
  if v_ex is not null then
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, (v_ex->>'id')::uuid, v_origem, 'duplicada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id', 'motivo', v_ex->>'motivo',
      'resultado', 'duplicada', 'tentativa_id', v_tid, 'docs_para_apagar', v_sem);
  end if;

  -- originais que esta tentativa guarda: os que ainda não estão guardados em outra tentativa (mesmo arquivo lido de novo não ocupa o cofre duas vezes)
  for v_d in select e from jsonb_array_elements(v_docs) e loop
    select x into v_exist from public.notas_fiscais_tentativas t, jsonb_array_elements(t.docs) x where t.user_id = v_casa and x->>'sha256' = v_d->>'sha256' limit 1;
    if found then v_regs := v_regs || jsonb_build_array(v_exist);        -- o mesmo arquivo já está guardado: a tentativa aponta para ele e a cópia nova é a única a apagar
    else v_regs := v_regs || jsonb_build_array(v_d); end if;
  end loop;

  if v_resultado = 'bloqueada' then
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, null, v_origem, 'bloqueada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, v_regs);
    return jsonb_build_object('id', null, 'criado', false, 'bloqueada', true, 'resultado', 'bloqueada', 'classe', v_classe, 'situacao', v_sit, 'motivos', v_mot, 'tentativa_id', v_tid,
      'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end if;

  begin     -- subtransação: se algo falhar aqui dentro, nada do que foi gravado nesta chamada fica
    perform set_config('rac.nf_origem', 'gravacao', true); perform set_config('rac.nf_fonte', v_origem, true); perform set_config('rac.nf_tentativa', v_tid::text, true);
    insert into public.notas_fiscais (id, user_id, modelo, chave, numero, serie, data_emissao, emitente_nome, emitente_cnpj, emitente_uf, tp_emis, situacao, situacao_evidencia,
      protocolo, denegada, valor_produtos, valor_descontos, valor_frete, valor_outras, valor_impostos, valor_total, valor_a_pagar, pagamentos, formato_origem, requer_conferencia, observacoes)
    values (v_id, v_casa, p_nota->>'modelo', v_chave, p_nota->>'numero', p_nota->>'serie', v_dt::date, p_nota->>'emitente_nome', v_cnpj, p_nota->>'emitente_uf',
      (p_nota->>'tp_emis')::smallint, v_sit, p_nota->>'situacao_evidencia', p_nota->>'protocolo', coalesce((p_nota->>'denegada')::boolean, false),
      (p_nota->>'valor_produtos')::numeric, (p_nota->>'valor_descontos')::numeric, (p_nota->>'valor_frete')::numeric, (p_nota->>'valor_outras')::numeric,
      (p_nota->>'valor_impostos')::numeric, v_total, (p_nota->>'valor_a_pagar')::numeric, v_pags, v_formato, true, p_nota->>'observacoes');
    insert into public.notas_fiscais_itens (user_id, nota_id, ordem, descricao, codigo, qtd, unidade, unidade_original, unitario, total, desconto)
      select v_casa, v_id, (e.n - 1)::integer, btrim(e.v->>'descricao'), e.v->>'codigo', (e.v->>'qtd')::numeric, coalesce(e.v->>'unidade', 'un'), e.v->>'unidade_original',
             (e.v->>'unitario')::numeric, (e.v->>'total')::numeric, coalesce((e.v->>'desconto')::numeric, 0)
        from jsonb_array_elements(p_itens) with ordinality as e(v, n);
    insert into public.notas_fiscais_docs (user_id, nota_id, tipo, nome, path, mime, tamanho, sha256)
      select v_casa, v_id, e->>'tipo', e->>'nome', e->>'path', e->>'mime', (e->>'tamanho')::bigint, e->>'sha256' from jsonb_array_elements(v_docs) e;
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, v_id, v_origem, v_resultado, v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    perform set_config('rac.nf_origem', '', true); perform set_config('rac.nf_fonte', '', true); perform set_config('rac.nf_tentativa', '', true);
  exception when unique_violation then
    v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[1]);        -- quem chegou antes já fechou: leia o vencedor
    if v_ex is null then raise; end if;
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, (v_ex->>'id')::uuid, v_origem, 'duplicada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id', 'motivo', v_ex->>'motivo',
      'resultado', 'duplicada', 'tentativa_id', v_tid, 'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end;
  return jsonb_build_object('id', v_id, 'criado', true, 'resultado', v_resultado, 'classe', v_classe, 'situacao', v_sit, 'motivos', v_mot, 'tentativa_id', v_tid,
    'itens', jsonb_array_length(p_itens), 'docs_gravados', jsonb_array_length(v_docs), 'avisos', v_av, 'docs_para_apagar', '[]'::jsonb);
end $$;
revoke all on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
