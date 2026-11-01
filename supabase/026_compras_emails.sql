-- Central de Compras (docs/compras.md): os e-mails de pagamento, cancelamento e reembolso (lidos do Outlook ou do Gmail) também viram
-- documentos da compra. Rode depois do 025. Pode rodar de novo sem estragar nada. Só amplia a lista de tipos de documento: nenhuma
-- tabela, política, permissão ou dado muda.
begin;

alter table public.compras_online_docs drop constraint if exists compras_online_docs_tipo_check;
alter table public.compras_online_docs add constraint compras_online_docs_tipo_check
  check (tipo in ('resumo_pdf', 'danfe', 'nfe_xml', 'csv', 'zip', 'email_confirmacao', 'email_envio', 'email_entrega', 'email_pagamento',
                  'email_cancelamento', 'email_reembolso', 'imagem', 'foto_produto', 'comprovante', 'outro'));

commit;
