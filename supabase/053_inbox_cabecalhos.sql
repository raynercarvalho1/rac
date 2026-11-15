-- status: pendente
-- RAC Inbox · I2 (sincronização, docs/inbox.md): cache de CABEÇALHOS das mensagens, escrito só pela Edge Function "rac-inbox" (conexão direta como dono das tabelas).
-- PREPARADA, NÃO APLICADA em produção (o dono roda no SQL Editor, com autorização própria). Pode rodar de novo sem estragar nada.
-- Ordem: 051 (inbox_pastas, inbox_mensagens_ref) → este arquivo.
-- Autorização do dono (15/11/2026): a I2 persiste os metadados e referências necessários (remetente, destinatários, assunto, data e estado de leitura).
--
-- O QUE ENTRA E O QUE NUNCA ENTRA
--   Entra (em public.inbox_mensagens_ref, que já tem RLS só do dono, trava "mfa", backup só-exportar e catálogo): data de recebimento, assunto, remetente, até 20 destinatários,
--     flags (lida, sinalizada, respondida), tamanho, "anexo provável" e o Message-ID. É um índice de cabeçalhos: serve à lista e à contagem; some junto com a conta.
--   NUNCA entra: corpo, HTML, prévia/trecho, anexos, imagens, nem credencial. O corpo e os anexos são lidos SOB DEMANDA no provedor, a cada abertura, e não são guardados aqui.
-- RETENÇÃO: o cache é reconstruível (UIDVALIDITY muda → apaga e relê) e o dono pode apagá-lo sem tocar na caixa original (delete já concedido na 051; apagar a conta apaga tudo em cascata).
--   O Documento 10 (seção 5.1) continua exigindo decisão do dono sobre retenção de CORPOS e ANEXOS antes de guardá-los: esta migration não os guarda.
-- Também: nome de exibição da pasta (o nome no provedor vem em UTF-7 modificado; aqui fica o texto legível).
begin;

alter table public.inbox_mensagens_ref
  add column if not exists recebida_em        timestamptz,
  add column if not exists assunto            text check (assunto is null or length(assunto) <= 500),
  add column if not exists remetente_nome     text check (remetente_nome is null or length(remetente_nome) <= 200),
  add column if not exists remetente_endereco text check (remetente_endereco is null or length(remetente_endereco) <= 254),
  add column if not exists destinatarios      jsonb check (destinatarios is null or (jsonb_typeof(destinatarios) = 'array' and jsonb_array_length(destinatarios) <= 20)),
  add column if not exists lida               boolean not null default false,
  add column if not exists sinalizada         boolean not null default false,
  add column if not exists respondida         boolean not null default false,
  add column if not exists tamanho            integer check (tamanho is null or tamanho >= 0),
  add column if not exists anexo_provavel     boolean not null default false,
  add column if not exists message_id         text check (message_id is null or length(message_id) <= 255),
  add column if not exists sincronizada_em    timestamptz;

-- a lista de uma pasta, da mais nova para a mais antiga
create index if not exists inbox_ref_lista on public.inbox_mensagens_ref (conta_id, pasta_id, recebida_em desc, uid desc);

alter table public.inbox_pastas
  add column if not exists nome_exibicao text check (nome_exibicao is null or length(nome_exibicao) <= 200);

commit;

-- conferir depois (só leitura):
--   select column_name from information_schema.columns where table_name = 'inbox_mensagens_ref' and column_name in ('assunto','remetente_endereco','lida','recebida_em');   -- 4 linhas
--   select count(*) from public.inbox_mensagens_ref;                                                              -- 0 até a primeira sincronização
--   select column_name from information_schema.columns where table_name = 'inbox_mensagens_ref' and column_name ~ 'corpo|body|html|previa|snippet|anexo$';   -- nenhuma
