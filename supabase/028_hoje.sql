-- Aplicado em produção em 02/11/2026 (Etapa 3 do RAC Hoje).
-- RAC Hoje (docs/hoje.md): libera a ação hoje.analise (Sonnet 5.5) em REAL, só para o dono. Pode rodar de novo sem erro.
--   1) o banco passa a aceitar 'hoje.analise' em acoes_reais (continua aceitando o abastecimento e a Newsletter);
--   2) hoje.analise nunca vale para quem é da casa (acoes_reais_casa): a Fernanda continua exatamente como está;
--   3) liga hoje.analise na casa que já está em REAL, sem mexer em modo, limite, câmbio, teto, margem nem nas outras ações.
-- Não cria tabela nem muda RLS. O consumo continua em ia_uso (modulo 'hoje'), dentro do mesmo limite mensal da IA.
-- Ordem: rodar este arquivo, depois o 029, e só então publicar a rac-ia (ela precisa da ação liberada aqui).
-- Se o 016 ou o 020 forem rodados de novo, rode este logo depois (eles voltam a lista do que o banco aceita).
begin;

alter table public.ia_config drop constraint if exists ia_config_acoes_reais_permitidas;
alter table public.ia_config add constraint ia_config_acoes_reais_permitidas
  check (acoes_reais <@ array['abastecimento.interpretar', 'newsletter.resumo', 'hoje.analise']::text[]);
alter table public.ia_config drop constraint if exists ia_config_hoje_so_dono;
alter table public.ia_config add constraint ia_config_hoje_so_dono
  check (not ('hoje.analise' = any (acoes_reais_casa)));

update public.ia_config
   set acoes_reais = array_append(acoes_reais, 'hoje.analise'), atualizado_em = now()
 where modo = 'REAL' and not ('hoje.analise' = any (acoes_reais));

commit;

-- conferir depois (só leitura):
--   select modo, acoes_reais, acoes_reais_casa, limite_brl from public.ia_config;
