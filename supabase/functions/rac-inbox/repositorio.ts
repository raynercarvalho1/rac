// RAC Inbox · I2: o repositório SQL do cache de cabeçalhos e do cursor de sincronização (tabelas da 051 e da 053). Sem Deno: recebe um executor de SQL (`Sessao`), então a MESMA
// consulta roda na função (conexão direta ao Postgres, como dono das tabelas) e nos testes (PGlite com as migrations reais: tests/inbox_sync_sql.test.mjs).
// Todo valor vai por parâmetro ($1, $2…): nenhum texto do e-mail entra no SQL. A conexão da função NÃO passa pelo RLS (é a dona das tabelas), então todo comando filtra por `dono` E `conta_id`.
// O que se grava: SÓ cabeçalhos (data, assunto, remetente, destinatários, flags, tamanho, Message-ID) e o cursor. Corpo, HTML, prévia e anexos NUNCA (a 053 nem tem coluna para isso).
import type { Banco, PastaSalva } from "./servico.ts";
import type { BancoRotina } from "./rotina.ts";
import type { BancoPush } from "./push.ts";
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

export function criarRepositorio(sessao: Sessao): Banco & BancoRotina {
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
      const r = await sessao.exec("select uidvalidity, uidnext, reconciliada_em from public.inbox_sincronizacao where pasta_id = $1 and conta_id = $2 and dono = $3", [pastaId, conta, dono]);
      return r[0] ? { uidvalidity: num(r[0].uidvalidity), uidnext: num(r[0].uidnext), reconciliada_em: r[0].reconciliada_em ? new Date(r[0].reconciliada_em as string).toISOString() : null } : null;
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
        // O LOTE vai como TEXTO e só vira jsonb no servidor (`$5::text::jsonb`). Com `$5::jsonb`, o postgres.js 3.4.4 descobre que o parâmetro é jsonb e aplica de novo o JSON.stringify:
        // o texto chega duplamente codificado, o PostgreSQL vê um jsonb ESCALAR (string) e `jsonb_to_recordset` falha com 22023 "cannot call jsonb_to_recordset on a non-array" (tests/inbox_sync_driver.test.mjs).
        const lote = JSON.stringify(a.mensagens.map((m) => ({
          uid: m.uid, recebida: m.recebida, assunto: m.assunto, remetente_nome: m.de?.nome ?? null, remetente_endereco: m.de?.endereco ?? null, destinatarios: m.para,
          lida: m.lida, sinalizada: m.sinalizada, respondida: m.respondida, tamanho: m.tamanho, anexo_provavel: m.anexo_provavel, message_id: m.message_id,
        })));
        const gravadas = a.mensagens.length === 0 ? [] : await s.exec(
          `insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid, recebida_em, assunto, remetente_nome, remetente_endereco, destinatarios, lida, sinalizada, respondida, tamanho, anexo_provavel, message_id, sincronizada_em, notificada_em)
           select $1::uuid, $2::uuid, $3::uuid, ($4::bigint)::text || ':' || m.uid::text, $4::bigint, m.uid, m.recebida, m.assunto, m.remetente_nome, m.remetente_endereco, m.destinatarios, m.lida, m.sinalizada, m.respondida, m.tamanho, m.anexo_provavel, m.message_id, now(), case when $6::boolean then now() end
           from jsonb_to_recordset($5::text::jsonb) as m(uid bigint, recebida timestamptz, assunto text, remetente_nome text, remetente_endereco text, destinatarios jsonb, lida boolean, sinalizada boolean, respondida boolean, tamanho integer, anexo_provavel boolean, message_id text)
           on conflict (conta_id, coalesce(pasta_id, '${SEM_PASTA}'::uuid), id_externo) do update set recebida_em = excluded.recebida_em, assunto = excluded.assunto, remetente_nome = excluded.remetente_nome,
             remetente_endereco = excluded.remetente_endereco, destinatarios = excluded.destinatarios, lida = excluded.lida, sinalizada = excluded.sinalizada, respondida = excluded.respondida,
             tamanho = excluded.tamanho, anexo_provavel = excluded.anexo_provavel, message_id = excluded.message_id, sincronizada_em = now()
           returning (xmax = 0) as inserida`, [dono, conta, pastaId, a.uidvalidity, lote, a.silenciosa !== false]);   // padrão silencioso: só a rotina pede aviso (silenciosa: false)
        const novas = gravadas.filter((r) => r.inserida === true).length;
        // removidas no provedor: dentro da faixa que a leitura cobriu, o que o servidor não devolveu mais sai do cache
        const removidas = a.purgar || a.semRemocao ? 0 : (await s.exec(
          `delete from public.inbox_mensagens_ref where conta_id = $1 and pasta_id = $2 and dono = $3 and uidvalidity = $4 and uid between $5 and $6 and uid <> all($7::bigint[]) returning 1`,
          [conta, pastaId, dono, a.uidvalidity, a.removerDe, Math.max(a.removerAte, a.removerDe), literalArray(a.mensagens.map((m) => m.uid))])).length;
        await s.exec(
          `update public.inbox_pastas set total = $4, nao_lidas = least($4::integer, (select count(*)::integer from public.inbox_mensagens_ref r where r.pasta_id = $2 and r.conta_id = $1 and r.dono = $3 and not r.lida))
           where id = $2 and conta_id = $1 and dono = $3`, [conta, pastaId, dono, a.total]);
        await s.exec(
          `insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, uidvalidity, uidnext, tipo_ultima, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro, origem, reconciliada_em)
           values ($1, $2, $3, $4, $5, $6, now(), now(), 0, $7, null, $8, case when $9::boolean then now() end)
           on conflict (pasta_id) do update set uidvalidity = excluded.uidvalidity, uidnext = excluded.uidnext, tipo_ultima = excluded.tipo_ultima, ultima_ok_em = now(), ultima_tentativa_em = now(),
             falhas_seguidas = 0, duracao_ms = excluded.duracao_ms, erro = null, origem = excluded.origem, reconciliada_em = case when $9::boolean then now() else public.inbox_sincronizacao.reconciliada_em end`,
          [dono, conta, pastaId, a.uidvalidity, a.cursor, a.tipo, a.duracao_ms, a.origem ?? "manual", a.reconciliada !== false]);
        return { novas, atualizadas: gravadas.length - novas, removidas };
      });
    },

    async falhaSync(dono, conta, pastaId, erro) {
      await sessao.exec(
        `insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, ultima_tentativa_em, falhas_seguidas, erro) values ($1, $2, $3, now(), 1, $4)
         on conflict (pasta_id) do update set ultima_tentativa_em = now(), falhas_seguidas = public.inbox_sincronizacao.falhas_seguidas + 1, erro = excluded.erro`, [dono, conta, pastaId, erro]);
    },

    // rotina: o cursor não mudou, nada foi lido. Só registra a tentativa bem-sucedida (horário, duração, origem) e a contagem da pasta.
    async semMudanca(dono, conta, pastaId, a) {
      await sessao.transacao(async (s) => {
        await s.exec("update public.inbox_pastas set total = $4, nao_lidas = least(coalesce(nao_lidas, 0), $4::integer) where id = $2 and conta_id = $1 and dono = $3", [conta, pastaId, dono, a.total]);
        await s.exec(
          `insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, uidvalidity, uidnext, tipo_ultima, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro, origem)
           values ($1, $2, $3, $4, $5, 'sem_mudanca', now(), now(), 0, $6, null, 'agenda')
           on conflict (pasta_id) do update set tipo_ultima = 'sem_mudanca', ultima_ok_em = now(), ultima_tentativa_em = now(), falhas_seguidas = 0, duracao_ms = excluded.duracao_ms, erro = null, origem = 'agenda'`,
          [dono, conta, pastaId, a.uidvalidity, a.uidnext, a.duracao_ms]);
      });
    },

    // ---- rotina automática (054) ----
    // contas iCloud com credencial ativa, "sincronizar automaticamente" ligado e pasta de entrada conhecida; a casa (membros) nunca entra
    async contasAutomaticas() {
      const r = await sessao.exec(
        `select distinct on (c.id) c.id as conta, c.dono, c.apelido, c.notificar, p.id as pasta_id, coalesce(s.falhas_seguidas, 0) as falhas, s.ultima_tentativa_em
         from public.inbox_contas c
         join public.inbox_credenciais k on k.conta_id = c.id and k.dono = c.dono and k.estado = 'ativa'
         join public.inbox_pastas p on p.conta_id = c.id and p.dono = c.dono and p.uso = 'entrada' and p.ativa
         left join public.inbox_sincronizacao s on s.pasta_id = p.id
         where c.provedor = 'icloud' and c.sync_auto and c.estado not in ('erro_autenticacao', 'desconectada')
           and not exists (select 1 from public.membros m where m.membro = c.dono)
         order by c.id limit 20`);
      return r.map((x) => ({ conta: String(x.conta), dono: String(x.dono), apelido: String(x.apelido), notificar: x.notificar === true, pasta_id: String(x.pasta_id), falhas: Number(x.falhas),
        ultima_tentativa_em: x.ultima_tentativa_em ? new Date(x.ultima_tentativa_em as string).toISOString() : null }));
    },
    // o que ainda não foi tratado pelo aviso: não lidas, dos últimos 24 h, com assunto e remetente (já gravados pela sincronização: nenhuma consulta extra ao provedor). As lidas e as antigas são marcadas como tratadas (nunca viram aviso tardio).
    async pendentes(dono, conta) {
      await sessao.exec("update public.inbox_mensagens_ref set notificada_em = now() where conta_id = $1 and dono = $2 and notificada_em is null and (lida or criado_em <= now() - interval '24 hours')", [conta, dono]);
      const r = await sessao.exec("select id, pasta_id, assunto, remetente_nome, remetente_endereco from public.inbox_mensagens_ref where conta_id = $1 and dono = $2 and notificada_em is null and not lida and pasta_id is not null order by recebida_em desc nulls last, uid desc limit 200", [conta, dono]);
      return r.map((x) => ({ id: String(x.id), pasta_id: String(x.pasta_id), assunto: (x.assunto as string | null) ?? null, nome: (x.remetente_nome as string | null) ?? null, endereco: (x.remetente_endereco as string | null) ?? null }));
    },
    async marcarNotificadas(dono, conta, ids) {
      if (!ids.length) return;
      await sessao.exec("update public.inbox_mensagens_ref set notificada_em = now() where conta_id = $1 and dono = $2 and notificada_em is null and id = any($3::uuid[])", [conta, dono, literalArray(ids)]);
    },
    async naoLidasEntrada(dono) {
      const r = await sessao.exec("select coalesce(sum(nao_lidas), 0)::integer as n from public.inbox_pastas where dono = $1 and uso = 'entrada' and ativa", [dono]);
      return Number(r[0]?.n ?? 0);
    },
    async rotinaAutorizada(segredo) {
      const r = await sessao.exec("select public.rac_rotina_ok($1::text) as ok", [segredo]);
      return r[0]?.ok === true;
    },

    /* ---- I3 · envio (migration 056) ---- */
    async contaEndereco(dono, conta) {
      const r = await sessao.exec("select endereco from public.inbox_contas where id = $1 and dono = $2", [conta, dono]);
      return r[0] ? String(r[0].endereco) : null;
    },
    async contaProvedor(dono, conta) {
      const r = await sessao.exec("select provedor, endereco from public.inbox_contas where id = $1 and dono = $2", [conta, dono]);
      return r[0] ? { provedor: String(r[0].provedor), endereco: String(r[0].endereco) } : null;
    },
    async pastaPorUso(dono, conta, uso) {
      const r = await sessao.exec("select id, nome_externo from public.inbox_pastas where conta_id = $1 and dono = $2 and uso = $3 and ativa order by nome_externo limit 1", [conta, dono, uso]);
      return r[0] ? { id: String(r[0].id), nome_externo: String(r[0].nome_externo) } : null;
    },
    // Reserva o envio_id. `novo: true` = primeira vez (pode transmitir). Se já existia: devolve o estado registrado; "falha" CONFIRMADA volta a "pendente" (nada foi entregue: tentar de novo é seguro);
    // "pendente" velho (mais de 2 min: a chamada anterior morreu sem registrar o fim) vira "incerto"; "enviado" e "incerto" nunca voltam a transmitir.
    async envioIniciar(dono, conta, envioId, a) {
      return await sessao.transacao(async (s) => {
        const ins = await s.exec(
          `insert into public.inbox_envios (id, dono, conta_id, estado, message_id, modo, destinatarios) values ($1, $2, $3, 'pendente', $4, $5, $6)
           on conflict (id) do nothing returning id`, [envioId, dono, conta, a.message_id, a.modo, a.destinatarios]);
        if (ins[0]) return { novo: true, estado: "pendente" as const, message_id: a.message_id };
        const r = await s.exec("select estado, message_id, (now() - atualizado_em) > interval '2 minutes' as velho from public.inbox_envios where id = $1 and dono = $2 and conta_id = $3 for update", [envioId, dono, conta]);
        if (!r[0]) return null;   // o id pertence a outro dono ou conta: nada é revelado
        const estado = String(r[0].estado) as "pendente" | "enviado" | "falha" | "incerto", mid = String(r[0].message_id);
        if (estado === "falha") { await s.exec("update public.inbox_envios set estado = 'pendente', codigo = null, message_id = $4 where id = $1 and dono = $2 and conta_id = $3", [envioId, dono, conta, a.message_id]); return { novo: true, estado: "pendente" as const, message_id: a.message_id }; }
        if (estado === "pendente" && r[0].velho === true) { await s.exec("update public.inbox_envios set estado = 'incerto', codigo = 'envio_incerto' where id = $1 and dono = $2 and conta_id = $3", [envioId, dono, conta]); return { novo: false, estado: "incerto" as const, message_id: mid }; }
        return { novo: false, estado, message_id: mid };
      });
    },
    async envioFinalizar(dono, conta, envioId, estado, codigo) {
      await sessao.exec("update public.inbox_envios set estado = $4, codigo = $5 where id = $1 and dono = $2 and conta_id = $3 and estado = 'pendente'", [envioId, dono, conta, estado, codigo]);
    },

    /* ---- I3.2 · gerenciamento (sem migration) ---- */
    async pastaDetalhe(dono, conta, pastaId) {
      const r = await sessao.exec("select id, nome_externo, uso from public.inbox_pastas where id = $1 and conta_id = $2 and dono = $3 and ativa", [pastaId, conta, dono]);
      return r[0] ? { id: String(r[0].id), nome_externo: String(r[0].nome_externo), uso: String(r[0].uso) } : null;
    },
    async mensagemRef(dono, conta, pastaId, uid) {
      const r = await sessao.exec("select id, uid, uidvalidity, message_id, tamanho, lida from public.inbox_mensagens_ref where conta_id = $1 and pasta_id = $2 and dono = $3 and uid = $4 order by uidvalidity desc nulls last limit 1", [conta, pastaId, dono, uid]);
      return r[0] ? { id: String(r[0].id), uid: Number(r[0].uid), uidvalidity: num(r[0].uidvalidity), message_id: (r[0].message_id as string | null) ?? null, tamanho: num(r[0].tamanho), lida: r[0].lida === true } : null;
    },
    // Só depois da confirmação do servidor. Uma transação: tudo ou nada. Tudo filtra por dono E conta (a conexão da função não passa pelo RLS).
    //  - lida: muda a flag no cache e recalcula as não lidas da pasta;
    //  - mover: copia a linha para a pasta de destino com o UID NOVO (se o servidor o informou; do contrário a próxima sincronização a traz), apaga a da origem, ajusta total e não lidas das duas pastas.
    //    A linha do destino nasce já "tratada" (notificada_em): mover não gera aviso de e-mail novo.
    async aplicarOrganizacao(dono, conta, a) {
      await sessao.transacao(async (s) => {
        const recontar = async (pastaId: string) => s.exec(
          `update public.inbox_pastas p set nao_lidas = least(coalesce(p.total, 2147483647), (select count(*)::integer from public.inbox_mensagens_ref r where r.pasta_id = p.id and r.conta_id = p.conta_id and r.dono = p.dono and not r.lida))
           where p.id = $1 and p.conta_id = $2 and p.dono = $3`, [pastaId, conta, dono]);
        if (a.tipo === "lida") {
          await s.exec("update public.inbox_mensagens_ref set lida = $4, sincronizada_em = now() where id = $1 and conta_id = $2 and dono = $3", [a.mensagemId, conta, dono, a.lida]);
          await recontar(a.pastaId);
          return;
        }
        let inserida = false;
        if (a.destinoUidvalidity !== undefined && a.destinoUid !== undefined) {
          const r = await s.exec(
            `insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid, recebida_em, assunto, remetente_nome, remetente_endereco, destinatarios, lida, sinalizada, respondida, tamanho, anexo_provavel, message_id, sincronizada_em, notificada_em)
             select o.dono, o.conta_id, $4::uuid, ($5::bigint)::text || ':' || ($6::bigint)::text, $5::bigint, $6::bigint, o.recebida_em, o.assunto, o.remetente_nome, o.remetente_endereco, o.destinatarios, o.lida, o.sinalizada, o.respondida, o.tamanho, o.anexo_provavel, o.message_id, now(), now()
             from public.inbox_mensagens_ref o where o.id = $1 and o.conta_id = $2 and o.dono = $3
             on conflict (conta_id, coalesce(pasta_id, '${SEM_PASTA}'::uuid), id_externo) do nothing returning id`, [a.mensagemId, conta, dono, a.destinoPastaId, a.destinoUidvalidity, a.destinoUid]);
          inserida = r.length === 1;
        }
        const apagada = (await s.exec("delete from public.inbox_mensagens_ref where id = $1 and conta_id = $2 and dono = $3 returning 1", [a.mensagemId, conta, dono])).length === 1;
        // ordem que respeita a regra "não lidas ≤ total" (051): na origem recontar ANTES de baixar o total; no destino subir o total ANTES de recontar
        await recontar(a.pastaId);
        if (apagada) await s.exec("update public.inbox_pastas set total = case when total is null then null else greatest(total - 1, 0) end where id = $1 and conta_id = $2 and dono = $3", [a.pastaId, conta, dono]);
        if (inserida) await s.exec("update public.inbox_pastas set total = case when total is null then null else total + 1 end where id = $1 and conta_id = $2 and dono = $3", [a.destinoPastaId, conta, dono]);
        await recontar(a.destinoPastaId);
      });
    },

    async estadoConta(dono, conta, estado, erro) {
      await sessao.exec("update public.inbox_contas set estado = $3, ultimo_erro = $4 where id = $2 and dono = $1", [dono, conta, estado, erro]);
    },
  };
}

/* o banco do Web Push (as chaves VAPID e as inscrições do dono); a conexão é a do dono das tabelas, então tudo filtra por user_id. As inscrições que o serviço de push diz que morreram (404/410) são apagadas. */
export function criarBancoPush(sessao: Sessao): BancoPush {
  return {
    async vapid() {
      const r = await sessao.exec("select valor from public.rac_segredos where chave = 'vapid'");
      const v = r[0]?.valor as unknown;
      const o = (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch (_) { return null; } })() : v) as { publica?: unknown; jwk?: unknown } | null;
      return o && typeof o.publica === "string" && o.jwk && typeof o.jwk === "object" ? { publica: o.publica, jwk: o.jwk as JsonWebKey } : null;
    },
    async inscricoes(uid) {
      const r = await sessao.exec("select id, endpoint, p256dh, auth from public.push_inscricoes where user_id = $1 order by id", [uid]);
      return r.map((x) => ({ id: Number(x.id), endpoint: String(x.endpoint), p256dh: String(x.p256dh), auth: String(x.auth) }));
    },
    async apagarInscricao(uid, id) { await sessao.exec("delete from public.push_inscricoes where id = $1 and user_id = $2", [id, uid]); },
  };
}
