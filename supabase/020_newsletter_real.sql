-- Newsletter: PERMITE (não liga) o resumo com IA em REAL. Autorizado pelo dono em 31/10/2026 (consumo de créditos da
-- Anthropic na Newsletter). Pode rodar de novo sem estragar nada. Ligar de verdade é o 021 (docs/newsletter.md).
--
-- Este arquivo só alarga a lista do que o banco aceita em acoes_reais: 'newsletter.resumo' passa a ser aceito, mas a
-- lista continua como está e o modo da casa também. 'abastecimento.interpretar' já era aceito desde o 016 (continua,
-- sem ser ligado); nenhuma outra ação entra.
-- O Mercado continua proibido em REAL, e a Newsletter nunca vale para quem é da casa (acoes_reais_casa).
-- Se o 016 for rodado de novo, rode este arquivo logo depois (o 016 volta a aceitar só o abastecimento).
begin;

alter table public.ia_config drop constraint if exists ia_config_acoes_reais_permitidas;
alter table public.ia_config add constraint ia_config_acoes_reais_permitidas
  check (acoes_reais <@ array['abastecimento.interpretar', 'newsletter.resumo']::text[]);
alter table public.ia_config drop constraint if exists ia_config_newsletter_so_dono;
alter table public.ia_config add constraint ia_config_newsletter_so_dono
  check (not ('newsletter.resumo' = any (acoes_reais_casa)));

commit;
