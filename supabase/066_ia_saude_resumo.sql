-- 066 · Resumo semanal da Saúde com IA (Lote 6). APLICADA EM PRODUÇÃO em 23/11/2026 (Supabase MCP, conferida por leitura: acoes_reais com saude.resumo, acoes_reais_casa sem ela, limite_brl intacto). Pode rodar de novo sem erro.
-- RAC Intelligence: libera a ação saude.resumo (Haiku 5.5) em REAL, só para o dono. Mesmo molde da 028 (hoje.analise):
--   1) o banco passa a aceitar 'saude.resumo' em acoes_reais (continuam as outras quatro);
--   2) saude.resumo nunca vale para quem é da casa (acoes_reais_casa): a Fernanda continua exatamente como está;
--   3) liga saude.resumo na casa que já está em REAL, sem mexer em modo, limite, câmbio, teto, margem nem nas outras ações.
-- Não cria tabela nem muda RLS. O consumo continua em ia_uso (modulo 'saude'), dentro do mesmo limite mensal da IA (nada de teto novo).
-- Ordem: rodar este arquivo e só então publicar a rac-ia (ela precisa da ação liberada aqui). Sem a publicação, o botão do site recebe "ação inválida" e avisa.
-- Se a 016, a 020, a 028 ou a 036 forem rodadas de novo, rode esta logo depois (elas voltam a lista do que o banco aceita).
begin;

alter table public.ia_config drop constraint if exists ia_config_acoes_reais_permitidas;
alter table public.ia_config add constraint ia_config_acoes_reais_permitidas
  check (acoes_reais <@ array['abastecimento.interpretar', 'newsletter.resumo', 'hoje.analise', 'fiscal.nota', 'saude.resumo']::text[]);
alter table public.ia_config drop constraint if exists ia_config_saude_so_dono;
alter table public.ia_config add constraint ia_config_saude_so_dono
  check (not ('saude.resumo' = any (acoes_reais_casa)));

update public.ia_config
   set acoes_reais = array_append(acoes_reais, 'saude.resumo'), atualizado_em = now()
 where modo = 'REAL' and not ('saude.resumo' = any (acoes_reais));

commit;

-- conferir depois (só leitura):
--   select modo, acoes_reais, acoes_reais_casa, limite_brl from public.ia_config;
