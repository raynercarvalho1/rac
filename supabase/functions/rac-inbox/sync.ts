// RAC Inbox · I2: a lógica PURA da sincronização e os filtros de esquema fechado (docs/inbox.md, "Sincronização"). Sem Deno, sem rede, sem banco: o Worker e o banco entram como dependências,
// então tests/inbox_sync_servico.test.mjs prova o algoritmo com versões de mentira, e tests/inbox_sync_sql.test.mjs prova o SQL do repositório no PGlite.
// O iCloud NÃO tem IDLE, CONDSTORE nem QRESYNC: nada aqui depende deles. Estratégia (polling + comparação de UIDs):
//   1. sempre relê a JANELA das últimas mensagens (flags e remoções ficam em dia);
//   2. compara UIDVALIDITY/UIDNEXT com o cursor guardado: primeira leitura, sem mudança, novas mensagens, UIDVALIDITY mudou (apaga e relê) ou UIDNEXT regrediu (idem);
//   3. se há mais mensagens novas do que cabem na janela, busca desde o cursor em páginas (limite de páginas por chamada; o cursor só avança até onde chegou);
//   4. mensagens do cache dentro da janela que o provedor não devolve mais foram removidas lá: saem do cache. Tudo idempotente (a identidade é uidvalidity:uid).
// Tudo que vem do Worker passa por filtros de esquema fechado: o que não é conhecido, do tipo certo e dentro do limite é descartado (ou a resposta inteira é recusada).
import { UID_MAX } from "./contrato.ts";
import type { Banco, Worker } from "./servico.ts";

export const JANELA = 50, PAGINA = 100, MAX_PAGINAS = 5, RECONCILIAR_MS = 60 * 60 * 1000;   // a rotina só relê a janela inteira de hora em hora
export type TipoSinc = "primeira_leitura" | "sem_mudanca" | "novas_mensagens" | "uidvalidity_mudou" | "uidnext_regrediu";
export interface Cursor { uidvalidity: number; uidnext: number }
export interface Endereco { nome: string; endereco: string }
export interface Resumo {
  uid: number; recebida: string | null; tamanho: number | null; lida: boolean; sinalizada: boolean; respondida: boolean;
  de: Endereco | null; para: Endereco[]; assunto: string; message_id: string | null; anexo_provavel: boolean;
}
export interface AplicacaoSync {
  uidvalidity: number; cursor: number; tipo: TipoSinc; total: number; duracao_ms: number | null;
  mensagens: Resumo[]; purgar: boolean; removerDe: number; removerAte: number;
  // rotina automática (054): leitura só do que é novo não pode apagar nada do cache; "silenciosa" = as mensagens novas nascem já tratadas pelo aviso
  semRemocao?: boolean; silenciosa?: boolean; reconciliada?: boolean; origem?: "manual" | "agenda";
}

const uidOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= UID_MAX;
const inteiroOuNulo = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2147483647 ? v : null);
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const sempreBool = (v: unknown): boolean => v === true;

/* mesma decisão da P6 (comprovada): compara o que o servidor informa agora com o cursor guardado */
export function compararSincronizacao(atual: Cursor, anterior: { uidvalidity: number | null; uidnext: number | null } | null): TipoSinc {
  if (!anterior || anterior.uidvalidity === null || anterior.uidnext === null) return "primeira_leitura";
  if (atual.uidvalidity !== anterior.uidvalidity) return "uidvalidity_mudou";
  if (atual.uidnext === anterior.uidnext) return "sem_mudanca";
  return atual.uidnext > anterior.uidnext ? "novas_mensagens" : "uidnext_regrediu";
}

/* uso informado pelo Worker → vocabulário do banco (051) */
const USOS: Record<string, string> = { entrada: "entrada", enviados: "enviados", rascunhos: "rascunhos", lixeira: "lixo", spam: "spam", arquivo: "arquivo" };
export const usoDoBanco = (uso: unknown): string => (typeof uso === "string" && USOS[uso]) || "outra";

function endereco(v: unknown): Endereco | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, e = texto(o.endereco, 254), n = texto(o.nome ?? "", 200);
  return e && n !== null && /^[^\s<>"]+@[^\s<>"]+$/.test(e) ? { nome: n, endereco: e } : null;
}
export function filtrarResumo(v: unknown): Resumo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!uidOk(o.uid)) return null;
  const assunto = texto(o.assunto ?? "", 500);
  if (assunto === null) return null;
  const para = Array.isArray(o.para) ? o.para.slice(0, 20).map(endereco).filter((x): x is Endereco => x !== null) : [];
  return {
    uid: o.uid, recebida: typeof o.recebida === "string" && RE_ISO.test(o.recebida) ? o.recebida : null, tamanho: inteiroOuNulo(o.tamanho),
    lida: sempreBool(o.lida), sinalizada: sempreBool(o.sinalizada), respondida: sempreBool(o.respondida), de: endereco(o.de), para, assunto,
    message_id: texto(o.message_id ?? null, 255) === "" ? null : texto(o.message_id ?? null, 255), anexo_provavel: sempreBool(o.anexo_provavel),
  };
}
/* a lista inteira ou nada: um item fora do esquema invalida a resposta (o Worker não deveria mandá-lo) */
export function filtrarResumos(v: unknown): Resumo[] | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const r = v.map(filtrarResumo);
  return r.some((x) => x === null) ? null : (r as Resumo[]);
}
function exame(v: unknown): Cursor | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  return o && uidOk(o.uidvalidity) && uidOk(o.uidnext) ? { uidvalidity: o.uidvalidity, uidnext: o.uidnext } : null;
}
export interface PastaWorker { nome: string; nome_exibicao: string; uso: string; selecionavel: boolean }
export function filtrarPastas(v: unknown): PastaWorker[] | null {
  if (!Array.isArray(v) || v.length > 300) return null;
  const r: PastaWorker[] = [];
  for (const p of v) {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : null, nome = o && texto(o.nome, 200), exib = o && texto(o.nome_exibicao, 200);
    if (!o || !nome || exib === null || typeof o.selecionavel !== "boolean") return null;
    r.push({ nome, nome_exibicao: exib, uso: usoDoBanco(o.uso), selecionavel: o.selecionavel });
  }
  return r;
}
const RE_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
export function filtrarLeitura(dados: Record<string, unknown>): Record<string, unknown> | null {
  const m = dados.mensagem && typeof dados.mensagem === "object" ? (dados.mensagem as Record<string, unknown>) : null, r = m && filtrarResumo(m);
  if (!m || !r || typeof m.texto !== "string" || m.texto.length > 65536 || !["texto", "html_convertido", "sem_corpo"].includes(m.formato as string) || !Array.isArray(m.anexos) || m.anexos.length > 30) return null;
  const anexos = [];
  for (const a of m.anexos as unknown[]) {
    const o = a && typeof a === "object" ? (a as Record<string, unknown>) : null;
    if (!o || typeof o.parte !== "string" || !/^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){0,5}$/.test(o.parte) || texto(o.tipo, 100) === null || inteiroOuNulo(o.tamanho) === null || (o.nome !== null && texto(o.nome, 200) === null)) return null;
    anexos.push({ parte: o.parte, nome: o.nome, tipo: o.tipo, tamanho: o.tamanho, inline: sempreBool(o.inline) });
  }
  return { mensagem: { ...r, cc: Array.isArray(m.cc) ? m.cc.slice(0, 20).map(endereco).filter((x) => x !== null) : [], texto: m.texto, formato: m.formato, truncado: sempreBool(m.truncado), anexos } };
}
export function filtrarAnexo(dados: Record<string, unknown>): Record<string, unknown> | null {
  const a = dados.anexo && typeof dados.anexo === "object" ? (dados.anexo as Record<string, unknown>) : null;
  if (!a || typeof a.base64 !== "string" || a.base64.length > 4400000 || !RE_BASE64.test(a.base64) || texto(a.tipo, 100) === null || inteiroOuNulo(a.tamanho_bytes) === null || (a.nome !== null && texto(a.nome, 200) === null)) return null;
  return { anexo: { nome: a.nome, tipo: a.tipo, tamanho_bytes: a.tamanho_bytes, base64: a.base64 } };
}

type Resultado = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };

/* A sincronização de UMA pasta. Devolve { ok:false, erro } com o código do Worker (quem chama o traduz); nunca lança por dado do Worker. */
export async function sincronizarPasta(p: { dono: string; conta: string; pastaId: string; worker: Worker; banco: Banco; credencial: { usuario: string; senha: string }; modo?: "manual" | "agenda"; agora?: () => number; prazo?: number }): Promise<Resultado> {
  const { dono, conta, pastaId, worker, banco, credencial } = p;
  const prazo = p.prazo ?? Infinity, agenda = p.modo === "agenda", origem = agenda ? "agenda" : "manual", agoraMs = p.agora ?? Date.now;
  const pasta = await banco.pasta(dono, conta, pastaId);
  if (!pasta) return { ok: false, erro: "pasta_inexistente" };
  const estado = await banco.estadoSync(dono, conta, pastaId);
  const chamar = (extra: Record<string, unknown>) => worker.executar("listar_mensagens", { conta_id: conta, pasta: pasta.nome_externo, ...extra }, credencial);

  /* ---- rotina (modo agenda): primeiro só o cursor (EXAMINE). Sem mudança = nada é lido; mensagens novas = só o que está depois do cursor; a janela inteira (flags e remoções) só de hora em hora ---- */
  if (agenda && estado && estado.uidvalidity !== null && estado.uidnext !== null) {
    const re = await worker.executar("estado_pasta", { conta_id: conta, pasta: pasta.nome_externo }, credencial);
    if (!re.ok) return re;
    const ex0 = exame(re.dados.exame), total0 = inteiroOuNulo(re.dados.mensagens_na_pasta);
    if (!ex0 || total0 === null) return { ok: false, erro: "resposta_invalida" };
    const dur0 = inteiroOuNulo(re.dados.duracao_ms), tipo0 = compararSincronizacao(ex0, estado);
    const rec = estado.reconciliada_em ? Date.parse(estado.reconciliada_em) : NaN, dif = agoraMs() - rec, vencida = !(dif >= 0 && dif < RECONCILIAR_MS);   // sem data, data inválida ou no futuro = vencida
    if (tipo0 === "sem_mudanca" && !vencida && banco.semMudanca) {
      await banco.semMudanca(dono, conta, pastaId, { uidvalidity: ex0.uidvalidity, uidnext: ex0.uidnext, total: total0, duracao_ms: dur0 });
      return { ok: true, dados: { sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: total0, mais: false } };
    }
    if (tipo0 === "novas_mensagens" && !vencida) {
      const mapa0 = new Map<number, Resumo>();
      let desde0: number | null = estado.uidnext, cursor0 = ex0.uidnext;
      for (let pagina = 0; pagina < MAX_PAGINAS && desde0 !== null && (pagina === 0 || agoraMs() < prazo); pagina++) {   // passou do prazo da rodada: para; o cursor só avança até aqui
        const rp = await chamar({ desde_uid: desde0, limite: PAGINA, uidvalidity_esperado: ex0.uidvalidity });
        if (!rp.ok) return rp;
        const ms = filtrarResumos(rp.dados.mensagens);
        if (!ms) return { ok: false, erro: "resposta_invalida" };
        for (const m of ms) mapa0.set(m.uid, m);
        desde0 = rp.dados.mais === true && ms.length > 0 ? Math.max(...ms.map((m) => m.uid)) + 1 : null;
      }
      if (desde0 !== null) cursor0 = Math.min(desde0, ex0.uidnext);   // não terminou: a próxima rodada continua daqui
      const novas0 = [...mapa0.values()].sort((a, b) => b.uid - a.uid);
      const r0 = await banco.aplicarSync(dono, conta, pastaId, { uidvalidity: ex0.uidvalidity, cursor: cursor0, tipo: "novas_mensagens", total: total0, duracao_ms: dur0, mensagens: novas0, purgar: false, removerDe: 1, removerAte: 0, semRemocao: true, silenciosa: false, reconciliada: false, origem });
      return { ok: true, dados: { sincronizacao: { tipo: "novas_mensagens", novas: r0.novas, atualizadas: r0.atualizadas, removidas: 0 }, mensagens_na_pasta: total0, mais: cursor0 < ex0.uidnext } };
    }
    // UIDVALIDITY mudou, UIDNEXT regrediu, ou a hora da releitura completa chegou: segue o caminho completo abaixo
  }

  const r1 = await chamar({ ultimas: JANELA });
  if (!r1.ok) return r1;
  const ex = exame(r1.dados.exame), janela = filtrarResumos(r1.dados.mensagens), total = inteiroOuNulo(r1.dados.mensagens_na_pasta);
  if (!ex || !janela || total === null) return { ok: false, erro: "resposta_invalida" };
  const duracao = inteiroOuNulo(r1.dados.duracao_ms);

  const tipo = compararSincronizacao(ex, estado);
  const reconstruir = tipo === "uidvalidity_mudou" || tipo === "uidnext_regrediu";
  const janelaMin = r1.dados.mais === true ? Math.min(...janela.map((m) => m.uid)) : 1;   // sem "mais", a janela cobre a pasta inteira
  const mapa = new Map<number, Resumo>(janela.map((m) => [m.uid, m]));
  let cursor = ex.uidnext;

  // mais mensagens novas do que cabem na janela: busca desde o cursor, em páginas (o cursor só avança até onde chegou)
  if (tipo === "novas_mensagens" && r1.dados.mais === true && estado && estado.uidnext !== null && estado.uidnext < janelaMin) {
    let desde: number | null = estado.uidnext;
    for (let pagina = 0; pagina < MAX_PAGINAS && desde !== null && (pagina === 0 || agoraMs() < prazo); pagina++) {
      const rp = await chamar({ desde_uid: desde, limite: PAGINA, uidvalidity_esperado: ex.uidvalidity });
      if (!rp.ok) return rp;
      const ms = filtrarResumos(rp.dados.mensagens);
      if (!ms) return { ok: false, erro: "resposta_invalida" };
      for (const m of ms) mapa.set(m.uid, m);
      desde = rp.dados.mais === true && ms.length > 0 ? Math.max(...ms.map((m) => m.uid)) + 1 : null;
    }
    if (desde !== null) cursor = Math.min(desde, ex.uidnext);   // não terminou: a próxima sincronização continua daqui
  }

  const mensagens = [...mapa.values()].sort((a, b) => b.uid - a.uid);
  // primeira leitura e reconstrução são "linha de base" (nunca viram aviso); a sincronização manual também (o dono está olhando)
  const silenciosa = !agenda || tipo === "primeira_leitura" || reconstruir;
  const r = await banco.aplicarSync(dono, conta, pastaId, { uidvalidity: ex.uidvalidity, cursor, tipo, total, duracao_ms: duracao, mensagens, purgar: reconstruir, removerDe: janelaMin, removerAte: ex.uidnext - 1, silenciosa, reconciliada: true, origem });
  return { ok: true, dados: { sincronizacao: { tipo, novas: r.novas, atualizadas: r.atualizadas, removidas: r.removidas }, mensagens_na_pasta: total, mais: cursor < ex.uidnext } };
}
