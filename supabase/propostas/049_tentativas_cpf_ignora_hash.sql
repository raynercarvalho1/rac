-- ============================================================================================================================================
-- PROPOSTA (NÃO APLICADA). Escrita em 12/11/2026; o dono aplica no SQL Editor, depois de aprovar. Nada aqui roda sozinho.
-- ============================================================================================================================================
-- Central Fiscal · trava de CPF da tabela notas_fiscais_tentativas (migration 037) não pode reagir a hash nem a caminho de arquivo.
--
-- PROBLEMA (confirmado no CI de 12/11/2026, commit 4fa83df): a trava notas_fiscais_tentativas_sem_cpf aplica nf_tem_cpf() sobre docs::text. Em docs ficam o SHA-256 e o
-- path do arquivo (…/<uuid>/<sha256>.jpg). Um hash tem, por acaso, 11 dígitos seguidos entre letras (ex.: "d00536588686eb"), e se os dígitos verificadores fecham como CPF,
-- o banco recusa a gravação ("violates check constraint notas_fiscais_tentativas_sem_cpf"). No teste, o hash vinha de randomBytes e a falha era intermitente.
-- Em produção a chance é pequena (estimativa: na ordem de 1 em alguns milhares de arquivos), mas é real: uma foto ou PDF legítimos seriam recusados sem motivo.
--
-- CORREÇÃO: a trava continua olhando motivos, incertos e o NOME do arquivo em docs (onde um CPF de verdade poderia aparecer), mas não olha mais as chaves "path" e "sha256",
-- que são identificadores gerados pelo sistema (hash e uuids), nunca texto da nota. Nada mais muda: nenhuma outra tabela, política, gatilho ou função existente é alterada.
--
-- SEGURANÇA: função nova imutável, search_path vazio, sem acesso para anon (mesmo padrão da nf_tem_cpf, 034). A nova trava é MAIS PERMISSIVA só nas duas chaves acima, então
-- toda linha já gravada continua válida (o ADD CONSTRAINT confirma isso ao rodar). Pode rodar de novo sem erro. Não apaga nem altera dados.
--
-- Atômica (begin/commit): a função e a trava entram juntas ou nenhuma entra. Usa só recursos antigos do Postgres (jsonb_typeof, jsonb_array_elements, string_agg e o operador
-- jsonb - text), por isso roda igual no 17.11 da produção. Testada em PGlite (Postgres 18.6, tests/banco_foto_pdf.test.mjs, "proposta 049") e em Postgres 16 de verdade.
--
-- ANTES DE APLICAR: nada a mudar. DEPOIS: conferir em produção (só leitura):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'notas_fiscais_tentativas_sem_cpf';   -- deve citar nf_docs_texto(docs)
--   select count(*) from pg_proc where proname = 'nf_docs_texto' and pronamespace = 'public'::regnamespace;    -- 1
-- Quando for aplicada: mover para supabase/, trocar o cabeçalho para "APLICADA EM PRODUÇÃO em <data>" e ajustar o teste que hoje a lê de supabase/propostas/.
-- ============================================================================================================================================

begin;

create or replace function public.nf_docs_texto(d jsonb) returns text
  language sql immutable set search_path = '' as $$
  select coalesce(string_agg(case when jsonb_typeof(e) = 'object' then (e - 'path' - 'sha256')::text else e::text end, ' '), '')
  from jsonb_array_elements(case when jsonb_typeof(d) = 'array' then d else '[]'::jsonb end) e
$$;
revoke all on function public.nf_docs_texto(jsonb) from public, anon;
grant execute on function public.nf_docs_texto(jsonb) to authenticated;

alter table public.notas_fiscais_tentativas drop constraint if exists notas_fiscais_tentativas_sem_cpf;
alter table public.notas_fiscais_tentativas add constraint notas_fiscais_tentativas_sem_cpf
  check (not public.nf_tem_cpf(motivos::text) and not public.nf_tem_cpf(incertos::text) and not public.nf_tem_cpf(public.nf_docs_texto(docs)));

commit;
