-- status: pendente
-- Newsletter: PERMITE (não liga) o resumo com IA em REAL no futuro. Não rode agora: só quando o dono autorizar o
-- primeiro uso REAL da Newsletter (docs/newsletter.md, "Ligar o REAL"). Pode rodar de novo sem estragar nada.
--
-- Este arquivo só alarga a lista do que o banco aceita em acoes_reais: 'newsletter.resumo' passa a ser aceito, mas a
-- lista continua como está (vazia hoje), o modo da casa continua DEMO e o código da função ainda tem real: false.
-- Ligar de verdade exige, nesta ordem e com autorização específica: real: true em acoes.ts e nova publicação da rac-ia;
-- depois, no SQL Editor, acrescentar 'newsletter.resumo' em acoes_reais (e o modo da casa em REAL).
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
