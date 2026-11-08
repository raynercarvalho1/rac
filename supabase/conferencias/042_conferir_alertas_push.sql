-- Conferência do resumo diário de alertas de preço por Web Push, SÓ LEITURA (nenhum comando altera dado). Não há migration: o estado fica em public.pessoal.
-- Rode cada bloco separado no SQL Editor, DEPOIS de republicar a função "garmin" e de a rotina das 6h (ou uma execução manual autorizada) ter rodado.

-- 1) as inscrições de notificação são só do dono (nenhuma da casa). Esperado: uma linha, com o user_id do dono, e eh_membro = false.
select i.user_id, count(*) as aparelhos, exists (select 1 from public.membros m where m.membro = i.user_id) as eh_membro
  from public.push_inscricoes i group by i.user_id order by aparelhos desc;

-- 2) o último resultado da rotina trouxe o passo novo, sem erro. Esperado: a chave "alertas_preco" no resumo (enviado/estado ou o motivo, como "sem alertas novos"); "ok" true.
select quando, ok, resumo -> 'alertas_preco' as alertas_preco from public.rotina_log order by quando desc limit 3;

-- 3) o registro de cada dia que teve resumo (uma chave por dia). Esperado: estado enviado (ou parcial), a quantidade de ids e o resultado "N de N aparelhos".
select chave, valor ->> 'estado' as estado, jsonb_array_length(valor -> 'ids') as alertas, valor -> 'contagem' as contagem, valor ->> 'resultado' as resultado, valor ->> 'enviado_em' as enviado_em
  from public.pessoal where chave like 'mercado-alertas-push:%' order by chave desc limit 10;

-- 4) o servidor NÃO mexeu nas preferências nem nas leituras do dono: a chave dos alertas só muda pelo site. Compare "atualizado" com a última vez que você ajustou ou marcou alertas.
select chave, atualizado, jsonb_array_length(coalesce(valor -> 'estado' -> 'lidos', '[]'::jsonb)) as lidos, valor -> 'cfg' -> 'push' as push
  from public.pessoal where chave = 'mercado-alertas';

-- 5) erros do passo novo na rotina (esperado: nenhuma linha).
select quando, origem, mensagem from public.erros where origem = 'rotina: alertas_preco' order by quando desc limit 5;
