-- Diagnóstico das notas da Central Fiscal, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor: mostra, por categoria, quantas notas estão em estado incompatível e quais são, para você saber o que a rotina vai resolver sozinha
-- e o que precisa de você. Nada é apagado nem recriado por este arquivo.
select 'confirmada_sem_compra (a rotina retoma sozinha; depois de 6 falhas use "Tentar de novo")' as categoria, count(*) as notas from public.notas_fiscais_entradas where estado in ('falhou', 'pendente')
union all select 'falha_sem_retomada_automatica (6 tentativas esgotadas)', count(*) from public.notas_fiscais_entradas where estado = 'falhou' and tentativas >= 6
union all select 'sem_entrada_e_compra_existente_pela_chave (a reconciliação liga, sem criar compra)', count(*) from public.notas_fiscais n where not exists (select 1 from public.notas_fiscais_entradas e where e.nota_id = n.id) and n.situacao not in ('cancelada', 'rejeitada')
   and n.chave is not null and exists (select 1 from public.notas m where m.user_id = n.user_id and m.chave_nfce = n.chave)
union all select 'sem_entrada_e_sem_compra (nota antiga: precisa do "Estou de acordo")', count(*) from public.notas_fiscais n where not exists (select 1 from public.notas_fiscais_entradas e where e.nota_id = n.id) and n.situacao not in ('cancelada', 'rejeitada')
   and not exists (select 1 from public.notas_fiscais_vinculos v where v.nota_id = n.id and v.modulo = 'mercado' and v.valido) and not (n.chave is not null and exists (select 1 from public.notas m where m.user_id = n.user_id and m.chave_nfce = n.chave))
union all select 'pendente_ou_contingencia_sem_chave (a consulta oficial não consegue; refaça a leitura ou use a atualização manual)', count(*) from public.notas_fiscais where situacao in ('pendente', 'contingencia') and chave is null
union all select 'pendente_ou_contingencia_com_chave (a rotina consulta)', count(*) from public.notas_fiscais where situacao in ('pendente', 'contingencia') and chave is not null
union all select 'lancada_mas_cancelada_ou_rejeitada_depois (compra mantida; revisar)', count(*) from public.notas_fiscais_entradas where revisar is not null
union all select 'entrada_concluida_sem_compra_ligada', count(*) from public.notas_fiscais_entradas where estado in ('concluida', 'ja_no_mercado') and mercado_nota_id is null;
-- notas com problema (as 50 mais recentes): estado, erro e tentativas
select n.emitente_nome, n.data_emissao, n.valor_total, n.situacao as situacao_fiscal, e.estado as entrada_mercado, e.tentativas, e.proxima_em, e.erro, (n.chave is not null) as tem_chave
  from public.notas_fiscais n left join public.notas_fiscais_entradas e on e.nota_id = n.id
 where e.estado in ('falhou', 'pendente') or e.id is null order by n.data_emissao desc nulls last limit 50;
