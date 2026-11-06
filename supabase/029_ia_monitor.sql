-- Aplicado em produção em 02/11/2026 (Etapa 3 do RAC Hoje).
-- Monitor de custos da IA (docs/hoje.md, "Monitor de custos"). Pode rodar de novo sem erro. Não cria tabela nova: o registro de cada
-- chamada paga continua em ia_uso (015), que já tem id, data, ação, modelo, tokens, estimativa, estado, tempo e a conferência com o
-- Console (reconciliado_usd = o valor cobrado que o dono copiou). Este arquivo acrescenta:
--   1) ia_uso: provedor, id da requisição no provedor, tokens de cache, custo de entrada e de saída, o preço e o câmbio usados na hora
--      (o histórico original nunca é reescrito: recalcular com preço novo é a view ia_custos, que não grava nada);
--   2) ia_precos: preço do cache (vazio até o dono conferir na página oficial; vazio = o cache conta como entrada cheia, por excesso);
--   3) ia_concluir com o detalhe (a rac-ia nova manda; a antiga continua funcionando com a versão de 6 argumentos);
--   4) ia_config: avisos (50/75/90 % por padrão no código) e fator de consumo atípico, vazios: nenhum limite é configurado aqui;
--   5) view ia_custos: só o dono vê, só as chamadas da casa dele (a Fernanda não vê nada; a política de ia_uso não muda).
-- Sem conteúdo: nada de texto, pergunta, resposta, chave ou token de autenticação nestas colunas.
-- Ordem: rodar depois do 028 e antes de publicar a rac-ia nova (ela lê as colunas de cache de ia_precos e manda p_detalhe).
begin;

alter table public.ia_uso add column if not exists provedor text check (provedor is null or provedor ~ '^[a-z_]{2,20}$');
alter table public.ia_uso add column if not exists requisicao_id text check (requisicao_id is null or requisicao_id ~ '^[A-Za-z0-9_-]{4,80}$');
alter table public.ia_uso add column if not exists tokens_cache_leitura integer check (tokens_cache_leitura >= 0);
alter table public.ia_uso add column if not exists tokens_cache_escrita integer check (tokens_cache_escrita >= 0);
alter table public.ia_uso add column if not exists custo_entrada_usd numeric(12,6) check (custo_entrada_usd >= 0);
alter table public.ia_uso add column if not exists custo_saida_usd numeric(12,6) check (custo_saida_usd >= 0);
alter table public.ia_uso add column if not exists preco_entrada_usd_mtok numeric(10,4) check (preco_entrada_usd_mtok >= 0);
alter table public.ia_uso add column if not exists preco_saida_usd_mtok numeric(10,4) check (preco_saida_usd_mtok >= 0);
alter table public.ia_uso add column if not exists preco_cache_leitura_usd_mtok numeric(10,4) check (preco_cache_leitura_usd_mtok >= 0);
alter table public.ia_uso add column if not exists preco_cache_escrita_usd_mtok numeric(10,4) check (preco_cache_escrita_usd_mtok >= 0);
alter table public.ia_uso add column if not exists precos_conferido_em date;
alter table public.ia_uso add column if not exists cache_como_entrada boolean;
alter table public.ia_uso add column if not exists cambio_brl_usd numeric(8,4) check (cambio_brl_usd > 0);
alter table public.ia_uso add column if not exists custo_brl numeric(12,6) check (custo_brl >= 0);
create index if not exists ia_uso_dono_criado on public.ia_uso (dono, criado_em desc);

alter table public.ia_precos add column if not exists cache_leitura_usd_mtok numeric(10,4) check (cache_leitura_usd_mtok >= 0);
alter table public.ia_precos add column if not exists cache_escrita_usd_mtok numeric(10,4) check (cache_escrita_usd_mtok >= 0);

alter table public.ia_config add column if not exists avisos_pct integer[]
  check (avisos_pct is null or (array_length(avisos_pct, 1) between 1 and 5 and 1 <= all (avisos_pct) and 100 >= all (avisos_pct)));
alter table public.ia_config add column if not exists atipico_fator numeric(4,1) check (atipico_fator is null or atipico_fator between 1.5 and 20);

-- a conclusão com o detalhe: os mesmos campos de antes + o detalhe (números conferidos aqui; o que não vier fica vazio, nunca inventado)
create or replace function public.ia_concluir(p_id uuid, p_tokens_entrada integer, p_tokens_saida integer, p_estimado_usd numeric,
                                              p_ms integer, p_erro text, p_detalhe jsonb) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(p_detalhe, '{}'::jsonb);
  mudou integer;
begin
  update public.ia_uso set estado = 'concluido', concluido_em = pg_catalog.now(), tokens_entrada = p_tokens_entrada,
         tokens_saida = p_tokens_saida, estimado_usd = p_estimado_usd, ms = p_ms, erro_codigo = p_erro,
         provedor = case when d->>'provedor' ~ '^[a-z_]{2,20}$' then d->>'provedor' end,
         requisicao_id = case when d->>'requisicao_id' ~ '^[A-Za-z0-9_-]{4,80}$' then d->>'requisicao_id' end,
         tokens_cache_leitura = case when jsonb_typeof(d->'tokens_cache_leitura') = 'number' and (d->>'tokens_cache_leitura')::numeric >= 0 then (d->>'tokens_cache_leitura')::integer end,
         tokens_cache_escrita = case when jsonb_typeof(d->'tokens_cache_escrita') = 'number' and (d->>'tokens_cache_escrita')::numeric >= 0 then (d->>'tokens_cache_escrita')::integer end,
         custo_entrada_usd = case when jsonb_typeof(d->'custo_entrada_usd') = 'number' and (d->>'custo_entrada_usd')::numeric between 0 and 100 then (d->>'custo_entrada_usd')::numeric end,
         custo_saida_usd = case when jsonb_typeof(d->'custo_saida_usd') = 'number' and (d->>'custo_saida_usd')::numeric between 0 and 100 then (d->>'custo_saida_usd')::numeric end,
         preco_entrada_usd_mtok = case when jsonb_typeof(d->'preco_entrada_usd_mtok') = 'number' and (d->>'preco_entrada_usd_mtok')::numeric between 0 and 1000 then (d->>'preco_entrada_usd_mtok')::numeric end,
         preco_saida_usd_mtok = case when jsonb_typeof(d->'preco_saida_usd_mtok') = 'number' and (d->>'preco_saida_usd_mtok')::numeric between 0 and 1000 then (d->>'preco_saida_usd_mtok')::numeric end,
         preco_cache_leitura_usd_mtok = case when jsonb_typeof(d->'preco_cache_leitura_usd_mtok') = 'number' and (d->>'preco_cache_leitura_usd_mtok')::numeric between 0 and 1000 then (d->>'preco_cache_leitura_usd_mtok')::numeric end,
         preco_cache_escrita_usd_mtok = case when jsonb_typeof(d->'preco_cache_escrita_usd_mtok') = 'number' and (d->>'preco_cache_escrita_usd_mtok')::numeric between 0 and 1000 then (d->>'preco_cache_escrita_usd_mtok')::numeric end,
         precos_conferido_em = case when d->>'precos_conferido_em' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'precos_conferido_em')::date end,
         cache_como_entrada = case when jsonb_typeof(d->'cache_como_entrada') = 'boolean' then (d->>'cache_como_entrada')::boolean end,
         cambio_brl_usd = case when jsonb_typeof(d->'cambio_brl_usd') = 'number' and (d->>'cambio_brl_usd')::numeric between 1 and 20 then (d->>'cambio_brl_usd')::numeric end,
         custo_brl = case when jsonb_typeof(d->'custo_brl') = 'number' and (d->>'custo_brl')::numeric between 0 and 2000 then (d->>'custo_brl')::numeric end
   where id = p_id and estado = 'enviando';
  get diagnostics mudou = row_count;
  return mudou > 0;
end $$;
revoke all on function public.ia_concluir(uuid, integer, integer, numeric, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.ia_concluir(uuid, integer, integer, numeric, integer, text, jsonb) to service_role;

-- o monitor: só o dono, só a casa dele. Custo conhecido (o cobrado, conferido no Console) separado do estimado (uso × tabela da hora)
-- e do recalculado com o preço de hoje (sem gravar nada). Sem conteúdo das chamadas.
create or replace view public.ia_custos with (security_invoker = true) as
  select u.id, u.criado_em, u.concluido_em, u.mes, u.modulo as funcionalidade, u.acao, coalesce(u.provedor, 'anthropic') as provedor, u.modelo,
         u.estado, u.erro_codigo, u.ms, u.requisicao_id,
         u.tokens_entrada, u.tokens_saida, u.tokens_cache_leitura, u.tokens_cache_escrita,
         u.custo_entrada_usd, u.custo_saida_usd, u.estimado_usd, u.reservado_usd,
         u.preco_entrada_usd_mtok, u.preco_saida_usd_mtok, u.precos_conferido_em, u.cache_como_entrada, u.cambio_brl_usd, u.custo_brl,
         case when u.estado = 'reconciliado' then (case when u.reconciliado_cobrado then u.reconciliado_usd else 0 end) end as conhecido_usd,
         case when u.tokens_entrada is not null and p.modelo is not null
              then round((u.tokens_entrada * p.entrada_usd_mtok + coalesce(u.tokens_saida, 0) * p.saida_usd_mtok) / 1e6, 6) end as recalculado_usd,
         p.conferido_em as preco_atual_conferido_em
    from public.ia_uso u
    left join public.ia_precos p on p.modelo = u.modelo
   where u.dono = auth.uid();
revoke all on public.ia_custos from anon, authenticated;
grant select on public.ia_custos to authenticated;

commit;

-- conferir depois (só leitura):
--   select count(*) from public.ia_custos;               -- como dono: as chamadas da casa; como a Fernanda: 0
--   select modelo, cache_leitura_usd_mtok from public.ia_precos;
