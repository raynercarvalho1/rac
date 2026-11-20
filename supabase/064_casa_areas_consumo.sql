-- PROPOSTA 064 · NÃO APLICADA EM PRODUÇÃO (correção de regra do dono em 20/11/2026: a Fernanda tem acesso integral à Central de Compras,
-- inclusive às áreas de consumo e à Gestão de categorias, e a configuração é a MESMA para os dois).
-- O dono roda no SQL Editor do Supabase ANTES de o site 2026-11-20.10 ir ao ar. Pode rodar de novo sem erro. Requer a 003 (pessoal) e a 002 (dono_da_casa()).
-- O que muda: só a política "casa compartilha" da tabela pessoal ganha UMA chave a mais, 'mercado-areas' (as 6 da 057 continuam). A Fernanda passa a ler e
--   gravar a MESMA linha do dono (user_id = dono_da_casa()); nenhuma outra chave pessoal fica visível para ela.
-- Não muda: RLS ligado, a trava restritiva "mfa", nada para anon, o backup (a tabela pessoal já entra nele), módulos só do dono (Gmail, custos de IA, Sistema,
--   RAC Hoje, Inbox, restauração) e a função garmin.
-- ATENÇÃO: se a 057 for executada DEPOIS desta, ela recria a política com 6 chaves e a Fernanda perde 'mercado-areas'; nesse caso rode a 064 de novo.
-- Conferência depois (só leitura): supabase/conferencias/064_conferir_producao.sql. Rollback: rodar a parte 1 da 057 (volta às 6 chaves).
begin;

drop policy if exists "casa compartilha" on public.pessoal;
create policy "casa compartilha" on public.pessoal for all to authenticated
  using (user_id = (select public.dono_da_casa())
         and chave in ('radar-config', 'radar-pagos', 'radar-vinculos', 'mercado-equivalencias', 'mercado-alertas', 'mercado-canais', 'mercado-areas'))
  with check (user_id = (select public.dono_da_casa())
         and chave in ('radar-config', 'radar-pagos', 'radar-vinculos', 'mercado-equivalencias', 'mercado-alertas', 'mercado-canais', 'mercado-areas'));

commit;
notify pgrst, 'reload schema';
