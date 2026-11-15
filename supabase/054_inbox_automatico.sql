-- status: pendente
-- RAC Inbox · sincronização automática e notificações (docs/inbox.md, "Automático"): colunas de preferência, de controle da rotina e de deduplicação do aviso.
-- PREPARADA, NÃO APLICADA em produção (o dono roda no SQL Editor, com autorização própria). Pode rodar de novo sem estragar nada.
-- Ordem: 051 → 053 → este arquivo. O AGENDAMENTO (pg_cron a cada 10 min) NÃO está aqui: fica em supabase/propostas/055_inbox_agendamento.sql e só entra depois que a função rac-inbox v3 estiver publicada.
--
-- O QUE ENTRA (só metadados; nenhum conteúdo de e-mail, nenhuma credencial):
--   inbox_contas.sync_auto            preferência do dono: sincronizar sozinho a cada 10 min (padrão ligado, só vale com credencial ativa)
--   inbox_contas.notificar            preferência do dono: avisar por Web Push sobre e-mail novo (padrão ligado)
--   inbox_sincronizacao.reconciliada_em  quando a janela inteira foi relida pela última vez (a rotina só relê a janela de hora em hora; no resto do tempo olha só o cursor)
--   inbox_sincronizacao.origem        quem fez a última sincronização: 'manual' (botão) ou 'agenda' (rotina do servidor)
--   inbox_mensagens_ref.notificada_em momento em que a mensagem já foi tratada pelo aviso (nunca avisa duas vezes; a primeira leitura e a sincronização manual já nascem tratadas)
-- Mensagens que JÁ existem no cache nascem tratadas (nada de aviso retroativo ao ligar a rotina): o preenchimento só roda quando a coluna é criada agora.
begin;

alter table public.inbox_contas
  add column if not exists sync_auto boolean not null default true,
  add column if not exists notificar boolean not null default true;

alter table public.inbox_sincronizacao
  add column if not exists reconciliada_em timestamptz,
  add column if not exists origem text check (origem is null or origem in ('manual', 'agenda'));

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inbox_mensagens_ref' and column_name = 'notificada_em') then
    alter table public.inbox_mensagens_ref add column notificada_em timestamptz;
    update public.inbox_mensagens_ref set notificada_em = now();   -- o que já está no cache nunca vira aviso
  end if;
end $$;

-- a rotina procura só o que ainda não foi tratado (índice parcial, pequeno)
create index if not exists inbox_ref_pendentes on public.inbox_mensagens_ref (conta_id, criado_em) where notificada_em is null;

commit;

-- conferir depois (só leitura):
--   select column_name from information_schema.columns where table_name = 'inbox_contas' and column_name in ('sync_auto','notificar');                  -- 2 linhas
--   select column_name from information_schema.columns where table_name = 'inbox_sincronizacao' and column_name in ('reconciliada_em','origem');       -- 2 linhas
--   select count(*) from public.inbox_mensagens_ref where notificada_em is null;                                                                       -- 0 logo depois de aplicar
