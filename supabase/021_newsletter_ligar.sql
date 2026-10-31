-- status: pendente
-- Newsletter: LIGA o resumo com IA em REAL (autorizado pelo dono em 31/10/2026: consumo de créditos da Anthropic na
-- Newsletter, só com Claude Haiku). Rode por ÚLTIMO, depois do 018, do 020, da rac-ia e da rac-newsletter publicadas e do
-- 019 (docs/newsletter.md, "Publicação"). Pode rodar de novo sem estragar nada.
--
-- O que muda (só a linha da casa em ia_config, que é única):
--   modo             'REAL'  (a casa; sozinho não libera nenhuma ação)
--   acoes_reais      só 'newsletter.resumo' (o abastecimento continua DEMO; o Mercado é DEMO fixo no código)
--   acoes_reais_casa vazia   (a Newsletter é só do dono; o 020 também proíbe no banco)
-- O que NÃO muda: limite (R$ 50/mês, teto interno de ~US$ 6,70), câmbio, margens, fator de correção, preços, reservas,
-- tabelas, políticas e permissões. Desligar: o comando de "Ligar e desligar o REAL da Newsletter" em docs/newsletter.md.
begin;

-- trava: exige o 020 (o banco aceitar newsletter.resumo) e uma única casa configurada; senão, nada muda
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ia_config_newsletter_so_dono') then
    raise exception 'rode antes o 020_newsletter_real.sql';
  end if;
  if (select count(*) from public.ia_config) <> 1 then
    raise exception 'esperava exatamente uma casa em ia_config';
  end if;
end $$;

update public.ia_config
   set modo = 'REAL', acoes_reais = array['newsletter.resumo']::text[], acoes_reais_casa = '{}'::text[], atualizado_em = now();

commit;
