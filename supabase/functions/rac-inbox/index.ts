// RAC Inbox: a função de servidor do e-mail (docs/inbox.md). Publicar (ou republicar) é passo do dono, com autorização própria: a versão com o canal assinado e a sincronização (P7/I2) exige as migrations 051, 052 e 053
// e os secrets RAC_CANAL_K1 e RAC_INBOX_WORKER_URL (Edge Functions → Secrets; valores nunca no repositório).
// Este é o único arquivo da pasta que usa Deno, o Supabase e o Postgres; o resto é lógica pura e testada (tests/inbox_cofre_servico.test.mjs).
// Autenticação: o JWT do dono é validado no próprio Supabase (auth.getUser); a 2ª etapa (MFA) é exigida como no banco. Cofre: conexão DIRETA ao Postgres (SUPABASE_DB_URL, só
// em Edge Functions → Secrets automáticos) chamando as funções do schema PRIVADO inbox_cofre (052); a chave de serviço NÃO é usada e não há RPC na Data API. A credencial
// nunca é logada nem devolvida; os parâmetros vão por ligação (nunca dentro do texto do SQL). O canal assinado com o Worker (P7) é canal.ts: sem a URL e a chave nos Secrets, worker = null e as operações de leitura respondem "worker_nao_configurado".
// Publicar pela CLI (sem --no-verify-jwt): npx supabase@<versão> functions deploy rac-inbox --use-api --project-ref <projeto>
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";
import { aalOk, ENVIO_CORPO_MAX_CARACTERES, ERROS } from "./contrato.ts";
import { atender, type Cofre, type EstadoCredencial } from "./servico.ts";
import { criarBancoPush, criarRepositorio } from "./repositorio.ts";
import { rodarRotina } from "./rotina.ts";
import { entregar } from "./push.ts";
import { sessaoPostgres } from "./sessao.ts";
import { criarWorkerHttp } from "./canal.ts";

const ORIGENS = ["https://raynercarvalho.com.br", "https://www.raynercarvalho.com.br", "https://raynercarvalho1.github.io"];
const origemPermitida = (o: string | null) => (o && (ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : ORIGENS[0]);
const cabecalhos = (req: Request) => ({
  "Access-Control-Allow-Origin": origemPermitida(req.headers.get("Origin")), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json", "Cache-Control": "no-store",
});
const CORPO_MAX_BYTES = 2048, ENVIO_CORPO_MAX_BYTES = ENVIO_CORPO_MAX_CARACTERES * 4;   // (o texto pode ter acentos de vários bytes; o limite em caracteres é conferido depois da leitura)

/* só código fechado: operação, código e status (nunca corpo, credencial, usuário, IP ou mensagem de erro) */
const registrar = (e: { operacao: string; codigo: string; status: number }) => console.log(JSON.stringify({ rac_inbox: e }));

class ErroCofre extends Error {
  codigo: string;
  constructor(codigo: string) { super(codigo); this.codigo = codigo; }   // a mensagem do erro É o código: nada do banco passa adiante
}
const codigoPg = (e: unknown) => new ErroCofre(typeof (e as { code?: unknown })?.code === "string" ? ((e as { code: string }).code) : "desconhecido");

/* uma conexão por chamada, fechada no fim: nenhum estado (nem conexão) compartilhado entre usuários */
function cofrePostgres(sql: ReturnType<typeof postgres>): Cofre {
  return {
    async guardar(dono, conta, segredo) { try { await sql`select inbox_cofre.guardar(${dono}::uuid, ${conta}::uuid, ${segredo}::text)`; } catch (e) { throw codigoPg(e); } },
    async ler(dono, conta) { try { const r = await sql`select inbox_cofre.ler(${dono}::uuid, ${conta}::uuid) as s`; return (r[0]?.s as string | null) ?? null; } catch (e) { throw codigoPg(e); } },
    async remover(dono, conta) { try { const r = await sql`select inbox_cofre.remover(${dono}::uuid, ${conta}::uuid) as r`; return r[0]?.r === true; } catch (e) { throw codigoPg(e); } },
    async estado(dono, conta) { try { const r = await sql`select inbox_cofre.estado(${dono}::uuid, ${conta}::uuid) as e`; return r[0]?.e as EstadoCredencial; } catch (e) { throw codigoPg(e); } },
    async marcar(dono, conta, estado) { try { await sql`select inbox_cofre.marcar(${dono}::uuid, ${conta}::uuid, ${estado}::text)`; } catch (e) { throw codigoPg(e); } },
  };
}

/* o canal com o Worker: só existe com a URL (HTTPS) e a chave nos Secrets; do contrário, null e nada é enviado */
const workerDoAmbiente = () => criarWorkerHttp(Deno.env.get("RAC_INBOX_WORKER_URL") && Deno.env.get("RAC_CANAL_K1") ? { url: Deno.env.get("RAC_INBOX_WORKER_URL")!, segredo: Deno.env.get("RAC_CANAL_K1")!, chave: "k1" } : null);

const payloadAal = (jwt: string): string | null => {
  try { return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal ?? null; } catch (_) { return null; }
};

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const erro = (codigo: string) => new Response(JSON.stringify({ ok: false, erro: codigo }), { status: ERROS[codigo] ?? 500, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return erro("metodo");
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    // as operações de ENVIO carregam o texto da mensagem (limite próprio); todas as outras continuam em 2 KiB
    const teto = Number(req.headers.get("content-length") ?? 0);
    if (teto > ENVIO_CORPO_MAX_BYTES) return erro("muito_grande");
    const texto = await req.text();
    if (texto.length > ENVIO_CORPO_MAX_CARACTERES) return erro("muito_grande");
    let corpo: unknown = null;
    try { corpo = JSON.parse(texto); } catch (_) { return erro("corpo_invalido"); }
    if (texto.length > CORPO_MAX_BYTES && (corpo === null || typeof corpo !== "object" || (corpo as Record<string, unknown>).operacao !== "enviar_mensagem")) return erro("muito_grande");
    /* ROTINA (pg_cron a cada 10 min): o gateway já conferiu o JWT (verify_jwt=true; o agendamento manda a chave anon em Authorization), mas ISSO NÃO AUTORIZA a rotina: não há usuário e a senha da rotina (Vault: rac_rotina, a mesma das outras rotinas) é conferida no banco. Só a operação "rotina_sync", sem nenhum outro campo. */
    const senhaRotina = req.headers.get("x-rac-rotina");
    if (senhaRotina) {
      if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo) || (corpo as Record<string, unknown>).operacao !== "rotina_sync" || Object.keys(corpo as object).length !== 1) return erro("operacao_invalida");
      const bdr = Deno.env.get("SUPABASE_DB_URL"), wr = workerDoAmbiente();
      if (!bdr) return erro("cofre_indisponivel");
      if (!wr) return erro("worker_nao_configurado");
      sql = postgres(bdr, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => {}, debug: false });
      const sessao = sessaoPostgres(sql as never), banco = criarRepositorio(sessao);
      let autorizada = false;
      try { autorizada = await banco.rotinaAutorizada(senhaRotina); } catch (_) { return erro("banco_indisponivel"); }
      if (!autorizada) { registrar({ operacao: "rotina_sync", codigo: "sem_login", status: 401 }); return erro("sem_login"); }
      const resumo = await rodarRotina({ banco, cofre: cofrePostgres(sql), worker: wr, aviso: { enviar: (dono, msg) => entregar(criarBancoPush(sessao), dono, msg) }, registrar });
      return new Response(JSON.stringify({ ok: true, resumo }), { status: 200, headers: h });   // só contagens
    }
    /* quem é: o JWT é conferido no Supabase; sem sessão válida nada acontece */
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL") ?? "", publica = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    let usuario: { id: string; mfaOk: boolean } | null = null;
    if (jwt && url && publica) {
      const { data, error } = await createClient(url, publica, { auth: { persistSession: false } }).auth.getUser(jwt);
      if (!error && data.user) usuario = { id: data.user.id, mfaOk: aalOk(data.user.factors as Array<{ status?: string }> | undefined, payloadAal(jwt)) };
    }
    const bd = Deno.env.get("SUPABASE_DB_URL");
    if (usuario && !bd) return erro("cofre_indisponivel");   // sem conexão com o banco não há alternativa: nada é guardado em outro lugar
    if (usuario && bd) sql = postgres(bd, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => {}, debug: false });
    const r = await atender(corpo, { usuario, cofre: sql ? cofrePostgres(sql) : (null as unknown as Cofre), banco: sql ? criarRepositorio(sessaoPostgres(sql as never)) : null, worker: workerDoAmbiente(), registrar });
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: h });
  } catch (_) {
    return erro("interno");   // código fixo; a exceção (que poderia conter dados) é descartada
  } finally {
    if (sql) { try { await sql.end({ timeout: 2 }); } catch (_) { /* ignora */ } }
  }
});
