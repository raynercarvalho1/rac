-- Aplicado em produção em 12/11/2026 pelo dono, no SQL Editor (conferência supabase/conferencias/048_conferir_producao.sql: 26 de 29 na primeira rodada, pelas únicas falhas REFERENCES, TRIGGER e TRUNCATE do service_role, que vêm do privilégio padrão do Supabase
-- (pg_default_acl do postgres; origem confirmada por conferencias/048_diagnostico_privilegios_service_role.sql). A conferência passou a comparar só os privilégios de dados do service_role e, rodada em produção depois do ajuste, deu 29 de 29 (TUDO OK, 0 problemas; resultado informado pelo dono em 12/11/2026). A função radar foi republicada pelo dono (informado em 12/11/2026, depois do commit b056c43) e a aba Descobrir já fez buscas reais (contador do RAC: 3 de 200 créditos no mês na primeira conferência).
-- 048 · Radar de Preços: descoberta de ofertas pelo SerpApi, 11/11/2026. O site e a função funcionam mesmo sem ela (a função responde "migracao_pendente" e a aba Descobrir avisa). Pode rodar de novo sem estragar nada.
-- Por que existe: o Radar monitorava só links cadastrados à mão. A descoberta pesquisa o produto (Google Shopping via SerpApi), guarda cada anúncio visto como CANDIDATO (individual, kit, combo, outra apresentação, relacionado), com preço, loja, link,
--   composição e preço por medida, e registra cada consulta (cache de 24 h e controle de consumo). Nada vira oferta nem histórico de preço sozinho: o dono decide ("Acompanhar" usa o fluxo de oferta que já existe).
-- O que faz (só cria; nada é apagado nem alterado em dado existente). Provedor e engine são texto livre validado por formato (sem lista fechada): um provedor novo (Mercado Livre, VTEX...) não exige nova migration:
--   radar_consultas   uma linha por chamada ao provedor (provedor, engine, origem manual/rotina, consulta, status reservada/ok/erro/cache/bloqueada_orcamento/incerto, http, erro, resultados, créditos gastos, duração). Serve de cache e de medidor do consumo,
--                     por engine e por origem. 'reservada' (crédito travado ANTES da chamada) e 'incerto' (rede, tempo esgotado, resposta ilegível, 5xx, falha ao gravar, reserva órfã) retêm o crédito. Sem a chave de API.
--   ORÇAMENTO ATÔMICO: radar_reservar_consulta confere limite diário, mensal, por engine, de expansões e da rotina E grava a reserva numa só transação, sob trava por dono (como ia_reservar da 015); radar_concluir_consulta resolve a reserva
--                     uma única vez. Só service_role executa. O JavaScript não decide o orçamento: só pede a reserva.
--   radar_candidatos  anúncios vistos. Único por (dono, produto, loja+título+preço). Guarda os preços anteriores (até 20), o token do Google (vida curta) e a decisão do dono (pendente, acompanhando, ignorado).
--   radar_historico   observações dos anúncios, SÓ DE ACRÉSCIMO (nada edita nem apaga), por IDENTIDADE do produto (produto_chave) e da apresentação (apresentacao_chave), não por anúncio: trocar de loja ou de anúncio não corta a série, e
--                     kit, combo e outro tamanho têm a própria apresentação (não se misturam com o avulso). Não é o histórico confirmado do Radar (radar_precos): aqui o preço é o que o provedor mostrou.
--   Recria seguranca_estado() (a da 043) com as três tabelas novas na conferência da trava "mfa".
-- Segurança: RLS "so o dono" (membros da casa não veem), trava restritiva "mfa", nada para anon/public. O site (authenticated) só LÊ as consultas e só lê, atualiza a decisão/oferta e apaga candidatos.
--   O service_role (a função radar) recebe só o necessário: consultas select+insert; candidatos select+insert+update; histórico select+insert; execute nas 2 funções do orçamento (o status da consulta só muda por elas) (lição da 047: sem GRANT a rotina falha com 42501).
-- Backup: as três já estão em NUCLEO.SEG_TABELAS como só-exportar e marcadas "dep: 048" (antes desta migration a exportação as ignora sem acusar falha; page_token nunca sai no backup: segLimpar). Rollback: drop function public.radar_reservar_consulta, radar_concluir_consulta (com os tipos dos argumentos); drop table public.radar_historico; drop table public.radar_candidatos; drop table public.radar_consultas; e recriar seguranca_estado() com o texto da 043.
-- Depende de: 043 (radar_itens, radar_ofertas), 022 (rac_aal_ok), 047 (privilégios do service_role nas tabelas do Radar). Pode rodar de novo sem estragar nada.
begin;

create table if not exists public.radar_consultas (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id       uuid,
  provedor      text not null default 'serpapi' check (provedor ~ '^[a-z0-9_]{2,30}$'),
  engine        text not null check (engine ~ '^[a-z0-9_]{2,40}$'),
  origem        text not null default 'manual' check (origem in ('manual', 'rotina')),
  variante      text check (variante is null or length(variante) <= 40),
  chave_cache   text not null check (length(chave_cache) between 1 and 600),
  consulta      text check (consulta is null or length(consulta) <= 200),
  status        text not null check (status in ('ok', 'erro', 'cache', 'bloqueada_orcamento', 'incerto', 'reservada')),   -- 'reservada' = crédito travado ANTES da chamada externa; só radar_concluir_consulta a resolve
  http_status   integer check (http_status is null or http_status between 100 and 599),
  erro_codigo   text check (erro_codigo is null or erro_codigo ~ '^[a-z0-9_]{2,40}$'),
  erro_mensagem text check (erro_mensagem is null or length(erro_mensagem) <= 300),
  resultados    integer not null default 0 check (resultados >= 0),
  buscas_gastas integer not null default 0 check (buscas_gastas between 0 and 5),
  iniciada_em   timestamptz not null default now(),
  duracao_ms    integer not null default 0 check (duracao_ms >= 0),
  cache_de      uuid,
  finalizada_em        timestamptz,     -- quando a reserva foi resolvida (ok, erro ou incerto)
  criado_em     timestamptz not null default now(),
  unique (id, dono),
  foreign key (item_id, dono) references public.radar_itens (id, dono),
  /* só reserva, busca bem-sucedida ou de resultado incerto gasta crédito; cache, bloqueio e erro definitivo não gastam; erro e incerto sempre trazem o código */
  constraint radar_consultas_gasto check (buscas_gastas = 0 or status in ('ok', 'incerto', 'reservada')),
  constraint radar_consultas_erro check (status not in ('erro', 'incerto') or erro_codigo is not null)
);
create index if not exists radar_consultas_cache on public.radar_consultas (dono, item_id, chave_cache, iniciada_em desc);
create index if not exists radar_consultas_uso on public.radar_consultas (dono, iniciada_em desc) where buscas_gastas > 0;
create index if not exists radar_consultas_origem on public.radar_consultas (dono, origem, iniciada_em desc) where buscas_gastas > 0;
create index if not exists radar_consultas_reservas on public.radar_consultas (dono, chave_cache) where status = 'reservada';

create table if not exists public.radar_candidatos (
  id                 uuid primary key default gen_random_uuid(),
  dono               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id            uuid not null,
  consulta_id        uuid,
  provedor           text not null default 'serpapi' check (provedor ~ '^[a-z0-9_]{2,30}$'),
  engine             text not null check (engine ~ '^[a-z0-9_]{2,40}$'),
  id_externo         text not null check (length(id_externo) between 1 and 400),
  pai_externo        text check (pai_externo is null or length(pai_externo) <= 400),
  titulo             text not null check (length(btrim(titulo)) between 1 and 300),
  loja               text check (loja is null or length(loja) <= 120),
  link               text check (link is null or (link ~ '^https://[^\s]+$' and length(link) <= 2000)),
  link_tipo          text not null default 'desconhecido' check (link_tipo in ('loja', 'google', 'desconhecido')),
  preco              numeric(12,2) check (preco is null or preco > 0),
  preco_texto        text check (preco_texto is null or length(preco_texto) <= 60),
  moeda              text check (moeda is null or moeda ~ '^[A-Z]{3}$'),
  preco_original     numeric(12,2) check (preco_original is null or preco_original > 0),
  desconto_texto     text check (desconto_texto is null or length(desconto_texto) <= 80),
  frete_situacao     text not null default 'desconhecido' check (frete_situacao in ('desconhecido', 'informado_provedor', 'gratis_informado_provedor')),   -- do provedor; NUNCA é o frete confirmado do Radar
  frete_valor        numeric(12,2) check (frete_valor is null or frete_valor >= 0),
  frete_texto        text check (frete_texto is null or length(frete_texto) <= 60),
  total              numeric(12,2) check (total is null or total > 0),
  pagamento_texto    text check (pagamento_texto is null or length(pagamento_texto) <= 200),
  parcelamento_texto text check (parcelamento_texto is null or length(parcelamento_texto) <= 80),
  entrega_texto      text check (entrega_texto is null or length(entrega_texto) <= 120),
  detalhes           text check (detalhes is null or length(detalhes) <= 160),
  avaliacao          numeric(4,2) check (avaliacao is null or avaliacao between 0 and 5),
  avaliacoes         numeric(12,0) check (avaliacoes is null or avaliacoes >= 0),
  tipo_oferta        text not null default 'indeterminado' check (tipo_oferta in ('individual', 'kit_mesmo_produto', 'combo', 'outra_apresentacao', 'relacionado', 'indeterminado')),
  relevancia         integer not null default 0 check (relevancia between 0 and 100),
  quantidade         integer not null default 1 check (quantidade between 1 and 99),
  medida_valor       numeric(12,3) check (medida_valor is null or medida_valor > 0),
  medida_unidade     text check (medida_unidade is null or medida_unidade in ('g', 'ml')),
  composicao         jsonb not null default '[]'::jsonb check (jsonb_typeof(composicao) = 'array' and jsonb_array_length(composicao) <= 30 and pg_column_size(composicao) <= 8000),
  preco_por_medida   numeric(12,2) check (preco_por_medida is null or preco_por_medida > 0),
  base_medida        text check (base_medida is null or base_medida in ('100 g', '100 ml', 'unidade')),
  grupo_chave        text not null default '' check (length(grupo_chave) <= 200),
  produto_chave      text check (produto_chave is null or length(produto_chave) <= 200),   -- identidade do PRODUTO (marca|modelo ou EAN), igual em qualquer loja, anúncio ou tamanho; nula para relacionado/indeterminado
  apresentacao_chave text not null default '-' check (length(apresentacao_chave) <= 120),   -- 454g, 2x454g, 250g+454g, combo
  chave_dedup        text not null check (length(chave_dedup) between 1 and 300),
  catalogo           boolean not null default false,
  varias_fontes      boolean not null default false,
  product_id         text check (product_id is null or length(product_id) <= 60),
  page_token         text check (page_token is null or length(page_token) <= 4500),   -- token do Google para listar as lojas: vida curta (a documentação não diz quanto)
  token_observado_em timestamptz,
  evidencias         jsonb not null default '[]'::jsonb check (jsonb_typeof(evidencias) = 'array' and jsonb_array_length(evidencias) <= 12 and pg_column_size(evidencias) <= 4000),
  sinais             jsonb not null default '[]'::jsonb check (jsonb_typeof(sinais) = 'array' and jsonb_array_length(sinais) <= 12),
  observado_em       timestamptz not null,
  precos_anteriores  jsonb not null default '[]'::jsonb check (jsonb_typeof(precos_anteriores) = 'array' and jsonb_array_length(precos_anteriores) <= 20),
  decisao            text not null default 'pendente' check (decisao in ('pendente', 'acompanhando', 'ignorado')),
  oferta_id          uuid,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz,
  unique (id, dono),
  unique (dono, item_id, chave_dedup),
  foreign key (item_id, dono) references public.radar_itens (id, dono),
  foreign key (consulta_id, dono) references public.radar_consultas (id, dono),
  foreign key (oferta_id, dono) references public.radar_ofertas (id, dono),
  constraint radar_candidatos_acompanhando check (decisao <> 'acompanhando' or oferta_id is not null)
);
create index if not exists radar_candidatos_item on public.radar_candidatos (dono, item_id, tipo_oferta, preco_por_medida);
create index if not exists radar_candidatos_pai on public.radar_candidatos (dono, item_id, pai_externo) where pai_externo is not null;
create index if not exists radar_candidatos_produto on public.radar_candidatos (dono, item_id, produto_chave, apresentacao_chave);

create table if not exists public.radar_historico (
  id                 uuid primary key default gen_random_uuid(),
  dono               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id            uuid not null,
  consulta_id        uuid,
  produto_chave      text check (produto_chave is null or length(produto_chave) <= 200),
  apresentacao_chave text not null default '-' check (length(apresentacao_chave) <= 120),
  provedor           text not null check (provedor ~ '^[a-z0-9_]{2,30}$'),
  engine             text not null check (engine ~ '^[a-z0-9_]{2,40}$'),
  id_externo         text not null check (length(id_externo) between 1 and 400),
  loja               text check (loja is null or length(loja) <= 120),
  titulo             text not null check (length(btrim(titulo)) between 1 and 300),
  tipo_oferta        text not null check (tipo_oferta in ('individual', 'kit_mesmo_produto', 'combo', 'outra_apresentacao', 'relacionado', 'indeterminado')),
  quantidade         integer not null default 1 check (quantidade between 1 and 99),
  medida_valor       numeric(12,3) check (medida_valor is null or medida_valor > 0),
  medida_unidade     text check (medida_unidade is null or medida_unidade in ('g', 'ml')),
  preco              numeric(12,2) not null check (preco > 0),
  total              numeric(12,2) check (total is null or total > 0),
  preco_por_medida   numeric(12,2) check (preco_por_medida is null or preco_por_medida > 0),
  base_medida        text check (base_medida is null or base_medida in ('100 g', '100 ml', 'unidade')),
  frete_situacao     text not null default 'desconhecido' check (frete_situacao in ('desconhecido', 'informado_provedor', 'gratis_informado_provedor')),
  link_tipo          text not null default 'desconhecido' check (link_tipo in ('loja', 'google', 'desconhecido')),
  observado_em       timestamptz not null,
  registrado_em      timestamptz not null default now(),
  unique (id, dono),
  foreign key (item_id, dono) references public.radar_itens (id, dono),
  foreign key (consulta_id, dono) references public.radar_consultas (id, dono)
);
create index if not exists radar_historico_serie on public.radar_historico (dono, item_id, produto_chave, apresentacao_chave, observado_em desc);
create index if not exists radar_historico_anuncio on public.radar_historico (dono, item_id, provedor, id_externo, observado_em desc);

/* só de acréscimo: editar e apagar são recusados; só passa a remoção em cascata de quando a própria conta é excluída (gatilho dentro de gatilho), como em radar_precos (043) */
create or replace function public.radar_historico_so_acrescenta() returns trigger
  language plpgsql set search_path = '' as $f$
begin
  if tg_op in ('UPDATE', 'DELETE') and pg_trigger_depth() <= 1 then
    raise exception 'o histórico de observações só recebe novas linhas' using errcode = '42501';
  end if;
  if tg_op = 'TRUNCATE' then raise exception 'o histórico de observações não pode ser apagado' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;
revoke all on function public.radar_historico_so_acrescenta() from public, anon, authenticated;
drop trigger if exists radar_historico_so_acrescenta on public.radar_historico;
create trigger radar_historico_so_acrescenta before update or delete on public.radar_historico for each row execute function public.radar_historico_so_acrescenta();
drop trigger if exists radar_historico_sem_truncate on public.radar_historico;
create trigger radar_historico_sem_truncate before truncate on public.radar_historico for each statement execute function public.radar_historico_so_acrescenta();

/* ---------- ORÇAMENTO ATÔMICO (reserva antes da chamada externa) ----------
   A conferência dos limites e a gravação da reserva acontecem NUMA só função, sob a trava por dono (pg_advisory_xact_lock, como ia_reservar da 015): duas chamadas simultâneas nunca passam juntas pelo último crédito.
   Contam no orçamento: reservada, ok e incerto (buscas_gastas > 0). Erro definitivo, cache e bloqueio contam 0.
   Ciclo da reserva:  reservada → ok       (resposta recebida e gravada; HTTP 200 vazio também fica ok e CONTA: o provedor documenta busca bem-sucedida, não "com resultados")
                      reservada → erro     (erro definitivo e documentado como não cobrado: chave recusada, 429, 4xx, status "Error": libera o crédito)
                      reservada → incerto  (rede, tempo esgotado, resposta ilegível, 5xx, falha ao gravar depois da chamada, reserva órfã: o crédito CONTINUA contado)
                      incerto   → fica contado (sem reconciliação nem liberação: o orçamento só ganha folga quando o dia e o mês viram).
   Só service_role executa (a função radar); nem o site nem o anon chamam. */
create or replace function public.radar_reservar_consulta(
  p_dono uuid, p_item_id uuid, p_provedor text, p_engine text, p_origem text, p_variante text, p_chave_cache text, p_consulta text,
  p_custo integer, p_limites jsonb, p_forcar boolean, p_cache_desde timestamptz, p_agora timestamptz default null)
  returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_agora timestamptz := coalesce(p_agora, pg_catalog.now());
  v_dia date := (coalesce(p_agora, pg_catalog.now()) at time zone 'America/Sao_Paulo')::date;
  v_mes_ini date := pg_catalog.date_trunc('month', coalesce(p_agora, pg_catalog.now()) at time zone 'America/Sao_Paulo')::date;
  v_mes_fim date := (pg_catalog.date_trunc('month', coalesce(p_agora, pg_catalog.now()) at time zone 'America/Sao_Paulo') + interval '1 month')::date;
  v_id uuid; v_res integer; v_lim jsonb := coalesce(p_limites, '{}'::jsonb);
  u_mes bigint; u_dia bigint; u_eng_mes bigint; u_eng_dia bigint; u_exp bigint; u_rot bigint;
  l_mes integer := coalesce((v_lim->>'mes')::integer, 0); l_dia integer := coalesce((v_lim->>'dia')::integer, 0); l_exp integer := coalesce((v_lim->>'expansoes_dia')::integer, 0);
  l_rot integer := coalesce((v_lim->>'rotina_dia')::integer, 0); l_eng_mes integer := (v_lim->>'engine_mes')::integer; l_eng_dia integer := (v_lim->>'engine_dia')::integer;
  v_motivo text; v_usado bigint; v_limite integer; v_msg text;
begin
  if p_dono is null or p_item_id is null or p_custo is null or p_custo < 1 or p_custo > 5 or p_origem is null or p_origem not in ('manual', 'rotina') or p_engine is null or p_chave_cache is null then
    return jsonb_build_object('ok', false, 'motivo', 'entrada_invalida');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('radar-consultas:' || p_dono::text, 0));

  /* reserva órfã (a função parou depois de reservar): vira incerto e CONTINUA contando; nunca é liberada por prazo */
  update public.radar_consultas set status = 'incerto', erro_codigo = 'reserva_orfa', erro_mensagem = 'a reserva ficou sem resposta registrada; o crédito segue contado', finalizada_em = v_agora
   where dono = p_dono and status = 'reservada' and iniciada_em < v_agora - interval '10 minutes';

  /* a mesma consulta já em andamento: não paga duas vezes (vale também com "forçar": é o toque duplo) */
  select c.id into v_id from public.radar_consultas c where c.dono = p_dono and c.item_id = p_item_id and c.chave_cache = p_chave_cache and c.status = 'reservada' order by c.iniciada_em desc limit 1;
  if found then return jsonb_build_object('ok', false, 'motivo', 'em_andamento', 'id', v_id); end if;

  /* cache dentro da trava: a segunda chamada simultânea enxerga o resultado da primeira em vez de pagar de novo */
  if not coalesce(p_forcar, false) and p_cache_desde is not null then
    select c.id, c.resultados into v_id, v_res from public.radar_consultas c
     where c.dono = p_dono and c.item_id = p_item_id and c.chave_cache = p_chave_cache and c.status = 'ok' and c.iniciada_em >= p_cache_desde order by c.iniciada_em desc limit 1;
    if found then return jsonb_build_object('ok', false, 'motivo', 'cache', 'cache_de', v_id, 'resultados', v_res); end if;
  end if;

  select coalesce(sum(u.g), 0), coalesce(sum(u.g) filter (where u.d = v_dia), 0),
         coalesce(sum(u.g) filter (where u.e = p_engine), 0), coalesce(sum(u.g) filter (where u.e = p_engine and u.d = v_dia), 0),
         coalesce(sum(u.g) filter (where u.d = v_dia and u.e <> 'google_shopping'), 0), coalesce(sum(u.g) filter (where u.d = v_dia and u.o = 'rotina'), 0)
    into u_mes, u_dia, u_eng_mes, u_eng_dia, u_exp, u_rot
    from (select c.buscas_gastas g, c.engine e, c.origem o, (c.iniciada_em at time zone 'America/Sao_Paulo')::date d from public.radar_consultas c
           where c.dono = p_dono and c.buscas_gastas > 0 and (c.iniciada_em at time zone 'America/Sao_Paulo')::date >= v_mes_ini and (c.iniciada_em at time zone 'America/Sao_Paulo')::date < v_mes_fim) u;

  /* mesma ordem e mesmas regras de autorizar() em descoberta.ts (testadas lado a lado) */
  if u_mes + p_custo > l_mes then v_motivo := 'mes'; v_usado := u_mes; v_limite := l_mes; v_msg := 'limite mensal de buscas do RAC atingido';
  elsif u_dia + p_custo > l_dia then v_motivo := 'dia'; v_usado := u_dia; v_limite := l_dia; v_msg := 'limite diário de buscas do RAC atingido';
  elsif l_eng_mes is not null and u_eng_mes + p_custo > l_eng_mes then v_motivo := 'engine_mes'; v_usado := u_eng_mes; v_limite := l_eng_mes; v_msg := 'limite mensal do engine ' || p_engine || ' atingido';
  elsif l_eng_dia is not null and u_eng_dia + p_custo > l_eng_dia then v_motivo := 'engine_dia'; v_usado := u_eng_dia; v_limite := l_eng_dia; v_msg := 'limite diário do engine ' || p_engine || ' atingido';
  elsif p_engine <> 'google_shopping' and u_exp + p_custo > l_exp then v_motivo := 'expansoes'; v_usado := u_exp; v_limite := l_exp; v_msg := 'limite diário de expansões de lojas atingido';
  elsif p_origem = 'rotina' and u_rot + p_custo > l_rot then v_motivo := 'rotina'; v_usado := u_rot; v_limite := l_rot; v_msg := 'limite diário da rotina automática atingido';
  end if;
  if v_motivo is not null then
    v_msg := v_msg || ' (' || v_usado || '/' || v_limite || ')';
    insert into public.radar_consultas (dono, item_id, provedor, engine, origem, variante, chave_cache, consulta, status, erro_codigo, erro_mensagem, iniciada_em, finalizada_em)
    values (p_dono, p_item_id, p_provedor, p_engine, p_origem, p_variante, p_chave_cache, p_consulta, 'bloqueada_orcamento', 'orcamento_' || v_motivo, pg_catalog.left(v_msg, 300), v_agora, v_agora)
    returning id into v_id;
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'usado', v_usado, 'limite', v_limite, 'mensagem', v_msg, 'id', v_id);
  end if;

  insert into public.radar_consultas (dono, item_id, provedor, engine, origem, variante, chave_cache, consulta, status, buscas_gastas, iniciada_em)
  values (p_dono, p_item_id, p_provedor, p_engine, p_origem, p_variante, p_chave_cache, p_consulta, 'reservada', p_custo, v_agora) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'custo', p_custo);
end $f$;

/* resolve a reserva UMA vez: só quem ainda está "reservada" muda (uma reserva nunca é consumida duas vezes, e a que já virou incerto não é desfeita por uma resposta atrasada). "erro" libera o crédito. */
create or replace function public.radar_concluir_consulta(p_dono uuid, p_id uuid, p_status text, p_http integer, p_erro_codigo text, p_erro_mensagem text, p_resultados integer, p_duracao_ms integer)
  returns boolean language plpgsql security definer set search_path = '' as $f$
declare n integer;
begin
  if p_status is null or p_status not in ('ok', 'erro', 'incerto') then raise exception 'status de conclusão inválido' using errcode = '22023'; end if;
  update public.radar_consultas set status = p_status, http_status = p_http, erro_codigo = p_erro_codigo, erro_mensagem = pg_catalog.left(p_erro_mensagem, 300),
         resultados = greatest(coalesce(p_resultados, 0), 0), duracao_ms = greatest(coalesce(p_duracao_ms, 0), 0), finalizada_em = pg_catalog.now(),
         buscas_gastas = case when p_status = 'erro' then 0 else buscas_gastas end
   where id = p_id and dono = p_dono and status = 'reservada';
  get diagnostics n = row_count;
  return n = 1;
end $f$;

revoke all on function public.radar_reservar_consulta(uuid, uuid, text, text, text, text, text, text, integer, jsonb, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.radar_concluir_consulta(uuid, uuid, text, integer, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.radar_reservar_consulta(uuid, uuid, text, text, text, text, text, text, integer, jsonb, boolean, timestamptz, timestamptz) to service_role;
grant execute on function public.radar_concluir_consulta(uuid, uuid, text, integer, text, text, integer, integer) to service_role;

/* RLS, só o dono, trava "mfa", nada para anon (o mesmo padrão da 043) */
do $$
declare t text;
begin
  foreach t in array array['radar_consultas', 'radar_candidatos', 'radar_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for all to authenticated
      using (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()))
      with check (dono = auth.uid() and not exists (select 1 from public.membros m where m.membro = auth.uid()))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select on public.radar_consultas, public.radar_historico to authenticated;   -- o site só lê o histórico: ele é só de acréscimo
grant select, delete on public.radar_candidatos to authenticated;
grant update (decisao, oferta_id, atualizado_em) on public.radar_candidatos to authenticated;   -- o site só muda a decisão e a oferta ligada
grant select, insert on public.radar_consultas, public.radar_historico to service_role;
grant select, insert, update on public.radar_candidatos to service_role;

-- Segurança: a auditoria seguranca_estado() (a da 043) passa a conferir a trava "mfa" das duas tabelas novas
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'pedidos', 'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs',
    'compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos',
    'notas_fiscais_tentativas', 'notas_fiscais_situacoes',
    'radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos',
    'radar_consultas', 'radar_candidatos', 'radar_historico', 'seguranca_eventos'];
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'sem login' using errcode = '42501'; end if;
  select jsonb_build_object(
    'aal', coalesce((select auth.jwt()->>'aal'), 'aal1'),
    'fatores', (select count(*) from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'sem_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '[]'::jsonb),
    'anon_le', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')), '[]'::jsonb),
    'sem_trava_mfa', coalesce((select jsonb_agg(t order by t) from unnest(pessoais) t
                where pg_catalog.to_regclass('public.' || t) is not null
                  and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), '[]'::jsonb),
    'cofres_publicos', coalesce((select jsonb_agg(b.id order by b.id) from storage.buckets b where b.public), '[]'::jsonb),
    'funcoes_abertas', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'conferido', now()) into r;
  return r;
end $$;
revoke all on function public.seguranca_estado() from public, anon;
grant execute on function public.seguranca_estado() to authenticated;

commit;

-- conferir depois (só leitura):
--   select table_name from information_schema.tables where table_schema = 'public' and table_name in ('radar_consultas', 'radar_candidatos', 'radar_historico');   -- 3 linhas
--   select tablename, policyname from pg_policies where tablename in ('radar_consultas', 'radar_candidatos', 'radar_historico') order by 1, 2;   -- 2 por tabela ("so o dono" e "mfa")
--   select has_table_privilege('anon', 'public.radar_candidatos', 'SELECT');                                                                   -- false
