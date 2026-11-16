-- PROPOSTA 058 · NÃO APLICADA EM PRODUÇÃO (decisão do dono em 16/11/2026: "Sim, liberar" a leitura de nota por IA para a Fernanda).
-- LIGA a ação fiscal.nota (Claude Sonnet, paga) para a casa. É a única parte do acesso igual que gera custo, por isso fica num arquivo à parte e só o dono roda.
-- Rode DEPOIS de: 057 aplicada, função rac-ia republicada (acoes.ts com o papel "casa") e site publicado. Pode rodar de novo sem duplicar nada.
-- O que faz: acrescenta 'fiscal.nota' em acoes_casa e em acoes_reais_casa da linha da casa, SÓ se o modo já for REAL e a ação já estiver em acoes_reais
--   (para o dono ela já está desde 08/11/2026). Preserva as outras ações. Não muda modo, limite em reais, câmbio nem margens. O consumo vai para o mesmo orçamento
--   de IA da casa (reserva antes de cada chamada, uma chamada por clique, sem repetição automática).
-- Não toca: hoje.analise e newsletter.resumo (continuam proibidas para a casa pelo banco).
-- Para DESLIGAR de novo para a casa (a leitura do dono não muda), rode o UPDATE comentado no fim.
begin;

update public.ia_config
   set acoes_casa = (select array_agg(distinct x) from unnest(acoes_casa || array['fiscal.nota']) x),
       acoes_reais_casa = (select array_agg(distinct x) from unnest(acoes_reais_casa || array['fiscal.nota']) x),
       atualizado_em = now()
 where modo = 'REAL' and 'fiscal.nota' = any (acoes_reais);

commit;

-- conferência (só leitura): esperado, na linha da casa em REAL, fiscal.nota em acoes_reais, acoes_reais_casa e acoes_casa
select modo, acoes_reais, acoes_reais_casa, acoes_casa from public.ia_config;

-- DESLIGAR para a casa:
--   update public.ia_config
--      set acoes_casa = array_remove(acoes_casa, 'fiscal.nota'), acoes_reais_casa = array_remove(acoes_reais_casa, 'fiscal.nota'), atualizado_em = now();
