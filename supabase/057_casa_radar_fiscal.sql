-- PROPOSTA 057 · NÃO APLICADA EM PRODUÇÃO (pedido do dono em 16/11/2026: "a Fernanda deverá ter acesso igual ao meu em todo Finanças e compras").
-- O dono roda no SQL Editor do Supabase ANTES de o site e as funções novas irem ao ar. Pode rodar de novo sem erro.
-- O que muda (só o que era "só do dono" dentro de Finanças e compras; o resto do site e do banco não é tocado):
--   1) pessoal: as 6 chaves do Mercado/Radar passam a valer para a casa (a Fernanda lê e grava as MESMAS linhas do dono; nenhuma outra chave).
--   2) Radar (9 tabelas): a política "so o dono" vira "casa" (dono = dono_da_casa()); novas linhas nascem com o dono da casa.
--   3) Central Fiscal (nota de foto/PDF, situação fiscal e entrada no Mercado): sai SÓ a linha "só o dono da casa" das 3 funções (nota_fiscal_salvar_doc,
--      nota_fiscal_atualizar_situacao, nota_fiscal_entrada_mercado), dentro da definição que já está no banco. Não recria a função inteira: se a 039 ou a 040
--      ainda não foram aplicadas, este arquivo NÃO as ativa. Se você aplicar a 039/040 DEPOIS, rode este arquivo de novo.
--      Saem as políticas restritivas "foto so dono ..." e a leitura de tentativas e histórico passa de "só o dono" para "a casa".
--   4) ia_config: sai a trava "ia_config_fiscal_so_dono" (o banco deixa de proibir fiscal.nota para a casa). NÃO liga nada: o consumo pago só começa
--      quando o dono rodar o UPDATE comentado no fim deste arquivo.
-- Não muda: a trava "mfa" (continua em todas as tabelas), o RLS ligado, nada para anon, as ações hoje.analise e newsletter.resumo (continuam só do dono),
--   a restauração de backup (só o dono) e a função garmin.
-- Ordem de publicação: 1) este SQL, 2) função "radar", 3) função "rac-ia", 4) o site. Conferência depois: supabase/conferencias/057_conferir_producao.sql (só leitura).
begin;

-- 1) pessoal: só estas 6 chaves são da casa; o resto da tabela continua "so o dono" (a Fernanda não vê nada além delas)
drop policy if exists "casa compartilha" on public.pessoal;
create policy "casa compartilha" on public.pessoal for all to authenticated
  using (user_id = (select public.dono_da_casa())
         and chave in ('radar-config', 'radar-pagos', 'radar-vinculos', 'mercado-equivalencias', 'mercado-alertas', 'mercado-canais'))
  with check (user_id = (select public.dono_da_casa())
         and chave in ('radar-config', 'radar-pagos', 'radar-vinculos', 'mercado-equivalencias', 'mercado-alertas', 'mercado-canais'));

-- 2) Radar: da conta do dono para a casa
do $$
declare t text;
begin
  foreach t in array array['radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos',
                           'radar_consultas', 'radar_candidatos', 'radar_historico'] loop
    if to_regclass('public.' || t) is null then raise notice '% ainda não existe (migration 043/048 pendente): nada a fazer', t; continue; end if;
    execute format('alter table public.%I alter column dono set default public.dono_da_casa()', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format('drop policy if exists "casa" on public.%I', t);
    execute format('create policy "casa" on public.%I for all to authenticated using (dono = (select public.dono_da_casa())) with check (dono = (select public.dono_da_casa()))', t);
  end loop;
end $$;

-- 3) Central Fiscal: tira só a linha "só o dono da casa" (se a função existir); o login e a trava de MFA continuam
do $$
declare f text; r regprocedure; d text; d2 text;
begin
  foreach f in array array['public.nota_fiscal_salvar_doc(jsonb,jsonb,jsonb,jsonb)', 'public.nota_fiscal_atualizar_situacao(uuid,text,text,text,text)',
                           'public.nota_fiscal_entrada_mercado(uuid,boolean)'] loop
    r := to_regprocedure(f);
    if r is null then raise notice '% ainda não existe: nada a fazer (se aplicar a migration depois, rode a 057 de novo)', f; continue; end if;
    d := pg_get_functiondef(r);
    d2 := regexp_replace(d, '\n[[:space:]]*if \(select auth\.uid\(\)\) <> v_casa then raise exception ''[^'']*'' using errcode = ''42501''; end if;', '', 'g');
    if d2 = d then raise notice '% já estava liberada para a casa', f;
    else execute d2; raise notice '% liberada para a casa', f; end if;
  end loop;
end $$;

-- 3b) escrever nota de foto/PDF, itens e documentos deixa de ser só do dono (as RPCs seguem sendo o caminho normal e gravam a trilha)
drop policy if exists "foto so dono insere" on public.notas_fiscais;
drop policy if exists "foto so dono altera" on public.notas_fiscais;
drop policy if exists "foto so dono apaga" on public.notas_fiscais;
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais_itens', 'notas_fiscais_docs'] loop
    execute format('drop policy if exists "foto so dono insere" on public.%I', t);
    execute format('drop policy if exists "foto so dono altera" on public.%I', t);
    execute format('drop policy if exists "foto so dono apaga" on public.%I', t);
  end loop;
  -- tentativas de leitura e histórico da situação fiscal: a casa lê (só leitura; a escrita continua só pelas funções)
  foreach t in array array['notas_fiscais_tentativas', 'notas_fiscais_situacoes'] loop
    if to_regclass('public.' || t) is null then raise notice '% ainda não existe (migration 037 pendente): nada a fazer', t; continue; end if;
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for select to authenticated using (user_id = (select public.dono_da_casa()))', t);
  end loop;
end $$;

-- 4) ia_config: o banco deixa de proibir fiscal.nota para a casa (a 036 criou esta trava). Não liga a ação.
alter table public.ia_config drop constraint if exists ia_config_fiscal_so_dono;

commit;

notify pgrst, 'reload schema';

-- PARA LIGAR a leitura por IA para a Fernanda (decisão e custo do dono; NÃO faz parte do que roda acima). Só depois do SQL, da função rac-ia e do site no ar,
-- com a casa em REAL e fiscal.nota já em acoes_reais. Preserva as outras ações e não duplica:
--   update public.ia_config
--      set acoes_casa = (select array_agg(distinct x) from unnest(acoes_casa || array['fiscal.nota']) x),
--          acoes_reais_casa = (select array_agg(distinct x) from unnest(acoes_reais_casa || array['fiscal.nota']) x),
--          atualizado_em = now()
--    where modo = 'REAL' and 'fiscal.nota' = any (acoes_reais);
-- Para DESLIGAR de novo para a casa (a leitura do dono não muda):
--   update public.ia_config
--      set acoes_casa = array_remove(acoes_casa, 'fiscal.nota'), acoes_reais_casa = array_remove(acoes_reais_casa, 'fiscal.nota'), atualizado_em = now();
