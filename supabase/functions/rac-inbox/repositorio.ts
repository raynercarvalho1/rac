// RAC Inbox · I2: o repositório SQL do cache de cabeçalhos e do cursor de sincronização (tabelas da 051 e da 053). Sem Deno: recebe um executor de SQL (`Sessao`), então a MESMA
// consulta roda na função (conexão direta ao Postgres, como dono das tabelas) e nos testes (PGlite com as migrations reais: tests/inbox_sync_sql.test.mjs).
// Todo valor vai por parâmetro ($1, $2…): nenhum texto do e-mail entra no SQL. A conexão da função NÃO passa pelo RLS (é a dona das tabelas), então todo comando filtra por `dono` E `conta_id`.
// O que se grava: SÓ cabeçalhos (data, assunto, remetente, destinatários, flags, tamanho, Message-ID) e o cursor. Corpo, HTML, prévia e anexos NUNCA (a 053 nem tem coluna para isso).
import type { Banco, PastaSalva } from "./servico.ts";
import type { AplicacaoSync } from "./sync.ts";

export type Linha = Record<string, unknown>;
export interface Sessao {
  exec(texto: string, params?: unknown[]): Promise<Linha[]>;
  transacao<T>(f: (s: Sessao) => Promise<T>): Promise<T>;   // uma transação: tudo ou nada (falha no meio desfaz tudo)
}
const SEM_PASTA = "00000000-0000-0000-0000-000000000000";
/* array do PostgreSQL como texto (cada item entre aspas, com \\ e " escapados): independe de como o driver serializa arrays de JS */
export const literalArray = (itens: Array<string | number>): string => "{" + itens.map((i) => '"' + String(i).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));   // bigint chega como texto em alguns drivers

export function criarRepositorio(sessao: Sessao): Banco {
  return {
    async pasta(dono, conta, pastaId) {
      const r = await sessao.exec("select id, nome_externo from public.inbox_pastas where id = $1 and conta_id = $2 and dono = $3 and ativa", [pastaId, conta, dono]);
      return r[0] ? { id: String(r[0].id), nome_externo: String(r[0].nome_externo) } : null;
    },

    async salvarPastas(dono, conta, pastas): Promise<PastaSalva[]> {
      return await sessao.transacao(async (s) => {
        const salvas: PastaSalva[] = [];
        for (const p of pastas) {
          const r = await s.exec(
            `insert into public.inbox_pastas (dono, conta_id, nome_externo, nome_exibicao, uso, ativa) values ($1, $2, $3, $4, $5, $6)
             on conflict (conta_id, nome_externo) do update set nome_exibicao = excluded.nome_exibicao, uso = excluded.uso, ativa = excluded.ativa
             returning id, nome_externo, nome_exibicao, uso, ativa`, [dono, conta, p.nome, p.nome_exibicao, p.uso, p.selecionavel]);
          if (r[0] && r[0].ativa === true) salvas.push({ id: String(r[0].id), nome_externo: String(r[0].nome_externo), nome_exibicao: String(r[0].nome_exibicao), uso: String(r[0].uso) });
        }
        // pasta que sumiu do provedor deixa de ser oferecida (o cache dela fica até a conta sair; apagar a pasta apaga o cache em cascata)
        await s.exec("update public.inbox_pastas set ativa = false where conta_id = $1 and dono = $2 and nome_externo <> all($3::text[])", [conta, dono, literalArray(pastas.map((p) => p.nome))]);
        return salvas;
      });
    },

    async estadoSync(dono, conta, pastaId) {
      const r = await sessao.exec("select uidvalidity, uidnext from public.inbox_sincronizacao where pasta_id = $1 and conta_id = $2 and dono = $3", [pastaId, conta, dono]);
      return r[0] ? { uidvalidity: num(r[0].uidvalidity), uidnext: num(r[0].uidnext) } : null;
    },

    // travamento por conta: de SESSÃO (some se a conexão cair) e não bloqueante; a função usa conexão direta (não o pooler), onde o travamento de sessão é confiável
    async travar(conta) {
      const r = await sessao.exec("select pg_try_advisory_lock(hashtextextended($1::text, 7)) as ok", ["inbox_sync:" + conta]);
      return r[0]?.ok === true;
    },
    async destravar(conta) { await sessao.exec("select pg_advisory_unlock(hashtextextended($1::text, 7))", ["inbox_sync:" + conta]); },

    async aplicarSync(dono, conta, pastaId, a: AplicacaoSync) {
      return await sessao.transacao(async (s) => {
        if (a.purgar) await s.exec("delete from public.inbox_mensagens_ref where conta_id = $1 and pasta_id = $2 and dono = $3", [conta, pastaId, dono]);
        const lote = JSON.stringify(a.mensagens.map((m) => ({
          uid: m.uid, recebida: m.recebida, assunto: m.assunto, remetente_nome: m.de?.nome ?? null, remetente_endereco: m.de?.endereco ?? null, destinatarios: m.para,
          lida: m.lida, sinalizada: m.sinalizada, respondida: m.respondida, tamanho: m.tamanho, anexo_provavel: m.anexo_provavel, message_id: m.message_id,
        })));
        const gravadas = a.mensagens.length === 0 ? [] : await s.exec(
          `insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid, recebida_em, assunto, remetente_nome, remetente_endereco, destinatarios, lida, sinalizada, respondida, tamanho, anexo_provavel, message_id, sincronizada_em)
           select $1::uuid, $2::uuid, $3::uuid, ($4::bigint)::text || ':' || m.uid::text, $4::bigint, m.uid, m.recebida, m.assunto, m.remetente_nome, m.remetente_endereco, m.destinatarios, m.lida, m.sinalizada, m.respondida, m.tamanho, m.anexo_provavel, m.message_id, now()
           from jsonb_to_recordset($5::jsonb) as m(uid bigint, recebida timestamptz, assunto text, remetente_nome text, remetente_endereco text, destinatarios jsonb, lida boolean, sinalizada boolean, respondida boolean, tamanho integer, anexo_provavel boolean, message_id text)
           on conflict (conta_id, coalesce(pasta_id, '${SEM_PASTA}'::uuid), id_externo) do update set recebida_em = excluded.recebida_em, assunto = excluded.assunto, remetente_nome = excluded.remetente_nome,
             remetente_endereco = excluded.remetente_endereco, destinatarios = excluded.destinatarios, lida = excluded.lida, sinalizada = excluded.sinalizada, respondida = excluded.respondida,
             tamanho = excluded.tamanho, anexo_provavel = excluded.anexo_provavel, message_id = excluded.message_id, sincronizada_em = now()
           returning (xmax = 0) as inserida`, [dono, conta, pastaId, a.uidvalidity, lote]);
        const novas = gravadas.filter((r) => r.inserida === true).length;
        // removidas no provedor: dentro da faixa que a leitura cobriu, o que o servidor não devolveu mais sai do cache
        const removidas = a.purgar ? 0 : (await s.exec(
          `delete from public.inbox_mensagens_ref where conta_id = $1 and pasta_id = $2 and dono = $3 and uidvalidity = $4 and uid between $5 and $6 and uid <> all($7::bigint[]) returning 1`,
          [conta, pastaId, dono, a.uidvalidity, a.removerDe, Math.max(a.removerAte, a.removerDe), literalArray(a.mensagens.map((m) => m.uid))])).length;
        await s.exec(
          `update public.inbox_pastas set total = $4, nao_lidas = least($4::integer, (select count(*)::integer from public.inbox_mensagens_ref r where r.pasta_id = $2 and r.conta_id = $1 and r.dono = $3 and not r.lida))
           where id = $2 and conta_id = $1 and dono = $3`, [conta, pastaId, dono, a.total]);
        await s.exec(
          `insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, uidvalidity, uidnext, tipo_ultima, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro)
           values ($1, $2, $3, $4, $5, $6, now(), now(), 0, $7, null)
           on conflict (pasta_id) do update set uidvalidity = excluded.uidvalidity, uidnext = excluded.uidnext, tipo_ultima = excluded.tipo_ultima, ultima_ok_em = now(), ultima_tentativa_em = now(),
             falhas_seguidas = 0, duracao_ms = excluded.duracao_ms, erro = null`, [dono, conta, pastaId, a.uidvalidity, a.cursor, a.tipo, a.duracao_ms]);
        return { novas, atualizadas: gravadas.length - novas, removidas };
      });
    },

    async falhaSync(dono, conta, pastaId, erro) {
      await sessao.exec(
        `insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, ultima_tentativa_em, falhas_seguidas, erro) values ($1, $2, $3, now(), 1, $4)
         on conflict (pasta_id) do update set ultima_tentativa_em = now(), falhas_seguidas = public.inbox_sincronizacao.falhas_seguidas + 1, erro = excluded.erro`, [dono, conta, pastaId, erro]);
    },

    async estadoConta(dono, conta, estado, erro) {
      await sessao.exec("update public.inbox_contas set estado = $3, ultimo_erro = $4 where id = $2 and dono = $1", [dono, conta, estado, erro]);
    },
  };
}
