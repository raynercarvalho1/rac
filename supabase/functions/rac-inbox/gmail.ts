// RAC Inbox · I4 lote 2: LEITURA do Gmail pela Gmail API (docs/inbox.md, "Gmail"). Este adaptador tem a MESMA forma do Worker do iCloud (`Worker.executar(operacao, pedido)`) e devolve os
// MESMOS formatos (pastas, resumos, leitura, anexo), então a sincronização (sync.ts), o cache, o contrato e a tela são os mesmos: não existe sistema paralelo por provedor.
//  - Identidade: o contrato e a tela usam `uid` numérico. No Gmail o servidor atribui um uid SINTÉTICO por pasta (contador crescente, guardado com o cache) e a identidade do provedor fica em
//    `id_externo` (o ID da mensagem no Gmail); `uidvalidity` é sempre 1 (rótulos do Gmail não reiniciam). O navegador nunca vê o ID do Gmail.
//  - LEITURA (GET em profile, labels, messages e attachments) e, desde o lote 4, GERENCIAR uma mensagem por vez (modify/trash/untrash) e ENVIAR. Nunca apaga de vez: Lixeira é o fim.
//  - O token de acesso vive só na closure desta chamada; nada é registrado. Toda falha vira código fechado ("autenticacao_recusada", "http_NNN", "canal_falhou", …).
import type { Http } from "./oauth.ts";
import type { ResultadoWorker, Worker } from "./servico.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/";
export const UIDVALIDITY_GMAIL = 1;
export const MAX_ANEXO_BYTES = 3 * 1024 * 1024;
const PASTAS_SISTEMA: Array<{ id: string; exib: string; uso: string }> = [
  { id: "INBOX", exib: "Caixa de entrada", uso: "entrada" }, { id: "SENT", exib: "Enviados", uso: "enviados" }, { id: "DRAFT", exib: "Rascunhos", uso: "rascunhos" },
  { id: "TRASH", exib: "Lixeira", uso: "lixeira" }, { id: "SPAM", exib: "Spam", uso: "spam" },
];
export const PASTA_ARQUIVO = "ARQUIVO";   // "Todos os e-mails" do Gmail fora da entrada, enviados, rascunhos, lixeira e spam
const Q_ARQUIVO = "-in:inbox -in:sent -in:drafts -in:trash -in:spam";
const RE_ID_PASTA = /^[A-Za-z0-9_\-]{1,100}$/, RE_ID_MSG = /^[0-9a-f]{8,32}$/;
const ROTULOS_DE_PASTA = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"];   // quem não tem nenhum destes está no "Arquivo"
/* o que muda nos rótulos ao levar uma mensagem de uma pasta para outra (nomes externos; "ARQUIVO" não é rótulo: é a ausência dos de pasta). Lixeira usa os endpoints trash/untrash (mover_mensagem). */
export function rotulosDaAcao(origem: string, destino: string): { adicionar: string[]; remover: string[] } {
  const remover = origem === "ARQUIVO" ? [] : [origem];
  if (destino === "ARQUIVO" && origem !== "INBOX" && origem !== "ARQUIVO") remover.push("INBOX");
  return { adicionar: destino === "ARQUIVO" ? [] : [destino], remover };
}

/* o que o adaptador precisa do banco (implementado em repositorio.ts) */
export interface BancoGmail {
  pastaIdPorNome(dono: string, conta: string, nome: string): Promise<string | null>;
  idsExternos(dono: string, conta: string, pastaId: string, ids: string[]): Promise<Map<string, number>>;   // ID do Gmail → uid sintético já atribuído
  maiorUid(dono: string, conta: string, pastaId: string): Promise<number>;                                   // o maior uid já atribuído na pasta (cache e cursor)
  idExterno(dono: string, conta: string, pastaId: string, uid: number): Promise<string | null>;
}
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/* ---------- cabeçalhos: palavras codificadas (RFC 2047) e endereços ---------- */
const decB = (s: string): Uint8Array => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function decodificar(bytes: Uint8Array, charset: string): string { try { return new TextDecoder(charset.toLowerCase()).decode(bytes); } catch (_) { return new TextDecoder("utf-8").decode(bytes); } }
export function palavrasCodificadas(v: string): string {
  return v.replace(/=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=(\s+(?==\?))?/g, (_m, cs: string, enc: string, tx: string) => {
    try {
      if (enc.toLowerCase() === "b") return decodificar(decB(tx), cs);
      const bytes: number[] = []; const t = tx.replace(/_/g, " ");
      for (let i = 0; i < t.length; i++) { if (t[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(t.charCodeAt(i)); }
      return decodificar(new Uint8Array(bytes), cs);
    } catch (_) { return tx; }
  });
}
export interface End { nome: string; endereco: string }
export function enderecos(v: string): End[] {
  const saida: End[] = []; let atual = "", aspas = false, ang = 0;
  const partes: string[] = [];
  for (const c of v) { if (c === '"') aspas = !aspas; if (!aspas && c === "<") ang++; if (!aspas && c === ">") ang = Math.max(0, ang - 1); if (c === "," && !aspas && ang === 0) { partes.push(atual); atual = ""; } else atual += c; }
  partes.push(atual);
  for (const p0 of partes) {
    const p = p0.trim(); if (!p) continue;
    const m = /^(.*?)<([^<>]+)>\s*$/.exec(p), end = (m ? m[2] : p).trim().replace(/^mailto:/i, ""), nome = m ? palavrasCodificadas(m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1")).trim() : "";
    if (/^[^\s<>"@]+@[^\s<>"@]+$/.test(end) && end.length <= 254) saida.push({ nome: nome.slice(0, 200), endereco: end });
  }
  return saida;
}
const cab = (p: Obj | null, n: string): string => { const h = arr(p?.headers).map(obj).find((x) => x && str(x.name).toLowerCase() === n); return h ? palavrasCodificadas(str(h.value)).trim() : ""; };
const cabBruto = (p: Obj | null, n: string): string => { const h = arr(p?.headers).map(obj).find((x) => x && str(x.name).toLowerCase() === n); return h ? str(h.value).trim() : ""; };

/* ---------- corpo: partes MIME numeradas como no IMAP ("1", "2.1"), texto e anexos ---------- */
export interface Parte { caminho: string; tipo: string; nome: string | null; tamanho: number; attachmentId: string | null; dados: string | null; inline: boolean; charset: string; cabecalhos: Obj | null }
export function partes(payload: Obj | null): Parte[] {
  const saida: Parte[] = [];
  function visitar(p: Obj, caminho: string) {
    const filhos = arr(p.parts).map(obj).filter((x): x is Obj => !!x), tipo = str(p.mimeType).toLowerCase() || "application/octet-stream", corpo = obj(p.body);
    if (filhos.length) { filhos.slice(0, 100).forEach((f, i) => visitar(f, caminho ? caminho + "." + (i + 1) : String(i + 1))); return; }
    const ct = cabBruto(p, "content-type"), cs = /charset="?([A-Za-z0-9._-]+)"?/i.exec(ct)?.[1] ?? "utf-8", disp = cabBruto(p, "content-disposition").toLowerCase();
    const nome = str(p.filename) ? palavrasCodificadas(str(p.filename)).slice(0, 200) : null;
    saida.push({ caminho: caminho || "1", tipo: tipo.slice(0, 100), nome, tamanho: Number(corpo?.size) >= 0 ? Number(corpo?.size) : 0, attachmentId: str(corpo?.attachmentId) || null, dados: str(corpo?.data) || null,
      inline: disp.startsWith("inline") || (!!cabBruto(p, "content-id") && !nome), charset: cs, cabecalhos: p });
  }
  if (payload) visitar(payload, "");
  return saida;
}
const ehAnexo = (x: Parte): boolean => !!x.nome || (!!x.attachmentId && !/^text\/(plain|html)$/.test(x.tipo));
export function htmlParaTexto(h: string): string {
  const ent: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
  return h.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ent[m] ?? m).replace(/&#(\d{1,6});/g, (_m, n: string) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function corpoDaMensagem(ps: Parte[]): { texto: string; formato: "texto" | "html_convertido" | "sem_corpo"; truncado: boolean } {
  const lim = (t: string) => ({ texto: t.length > 65536 ? t.slice(0, 65536) : t, truncado: t.length > 65536 });
  const corpos = ps.filter((x) => !ehAnexo(x) && x.dados);
  const p = corpos.find((x) => x.tipo === "text/plain");
  if (p) return { ...lim(decodificar(decB(p.dados!), p.charset)), formato: "texto" };
  const h = corpos.find((x) => x.tipo === "text/html");
  if (h) return { ...lim(htmlParaTexto(decodificar(decB(h.dados!), h.charset))), formato: "html_convertido" };
  return { texto: "", formato: "sem_corpo", truncado: false };
}

/* ---------- montar a mensagem para ENVIAR (RFC 822): o Gmail recebe o MIME inteiro em base64url ---------- */
export interface PedidoEnvio { de: string; para: string[]; cc: string[]; cco: string[]; assunto: string; texto: string; message_id: string; data: string; em_resposta_a?: string; referencias?: string[] }
const utf8 = new TextEncoder();
const base64 = (b: Uint8Array): string => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
const base64url = (t: string): string => base64(utf8.encode(t)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const RE_ENDERECO = /^[^\s<>",;]+@[^\s<>",;]+$/;
/* assunto: quebra de linha vira espaço (nada injeta cabeçalho); ASCII passa como está; o resto vai em palavras codificadas de até 36 bytes (linhas curtas, letras nunca partidas) */
function assuntoMime(v: string): string {
  const t = v.replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const partes: string[] = []; let atual = "", bytes = 0;
  for (const ch of t) { const n = utf8.encode(ch).length; if (bytes + n > 36) { partes.push(atual); atual = ""; bytes = 0; } atual += ch; bytes += n; }
  if (atual) partes.push(atual);
  return partes.map((p) => "=?UTF-8?B?" + base64(utf8.encode(p)) + "?=").join("\r\n ");
}
/* o pedido de envio do envio.ts, conferido (endereços, Message-ID, data); null = recusado ANTES de qualquer chamada. Compartilhado com o Outlook. */
const RE_MSGID_ENVIO = /^<[^<>\s]{1,250}>$/;
export function lerPedidoEnvio(p: Record<string, unknown>): PedidoEnvio | null {
  const lista = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= 60 && v.every((x) => typeof x === "string" && x.length <= 254 && RE_ENDERECO.test(x)) ? (v as string[]) : null);
  const para = lista(p.para), cc = lista(p.cc ?? []), cco = lista(p.cco ?? []), de = str(p.de), id = str(p.message_id), orig = str(p.em_resposta_a);
  if (!para || !para.length || !cc || !cco || !RE_ENDERECO.test(de) || !RE_MSGID_ENVIO.test(id) || !Number.isFinite(Date.parse(str(p.data)))) return null;
  return { de, para, cc, cco, assunto: str(p.assunto), texto: str(p.texto), message_id: id, data: str(p.data),
    ...(RE_MSGID_ENVIO.test(orig) ? { em_resposta_a: orig, referencias: arr(p.referencias).map(str).filter((x) => RE_MSGID_ENVIO.test(x)).slice(-10) } : {}) };
}
/* códigos de erro do envio que o envio.ts entende (falha confirmada x incerto) */
export const erroDeEnvio = (e: string): string => (e === "autenticacao_recusada" ? "smtp_autenticacao_recusada" : e === "mensagem_inexistente" ? "envio_recusado" : e);

export function montarMime(p: PedidoEnvio): string {
  const dobra = (l: string[]) => l.join(",\r\n ");   // listas longas: linhas curtas (RFC 5322); desdobradas, é a mesma lista
  const l = [`From: ${p.de}`, `To: ${dobra(p.para)}`];
  if (p.cc.length) l.push(`Cc: ${dobra(p.cc)}`);
  if (p.cco.length) l.push(`Bcc: ${dobra(p.cco)}`);
  l.push(`Subject: ${assuntoMime(p.assunto)}`, `Date: ${new Date(p.data).toUTCString().replace("GMT", "+0000")}`, `Message-ID: ${p.message_id}`);
  if (p.em_resposta_a) { l.push(`In-Reply-To: ${p.em_resposta_a}`, `References: ${(p.referencias?.length ? p.referencias : [p.em_resposta_a]).join(" ")}`); }   // sem lista de referências, a cadeia começa na mensagem respondida
  l.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  const corpo = (base64(utf8.encode(p.texto.replace(/\r?\n/g, "\r\n"))).match(/.{1,76}/g) ?? []).join("\r\n");
  return l.join("\r\n") + "\r\n\r\n" + corpo;
}

/* ---------- resumo (esquema de sync.ts) ---------- */
const iso = (ms: unknown): string | null => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().replace(/\.\d{3}Z$/, ".000Z") : null; };
function resumoDe(m: Obj, uid: number, ext: string): Obj {
  const p = obj(m.payload), rot = arr(m.labelIds).map(String), de = enderecos(cab(p, "from"))[0] ?? null;
  return { uid, ext, recebida: iso(m.internalDate), tamanho: Number(m.sizeEstimate) >= 0 ? Math.min(Number(m.sizeEstimate), 2147483647) : null, lida: !rot.includes("UNREAD"), sinalizada: rot.includes("STARRED"), respondida: false,
    de, para: enderecos(cab(p, "to")).slice(0, 20), assunto: cab(p, "subject").slice(0, 500), message_id: cabBruto(p, "message-id").slice(0, 255) || null, anexo_provavel: str(p?.mimeType).toLowerCase().startsWith("multipart/mixed") };
}

export interface DepsGmail { acesso: string; http: Http; banco: BancoGmail; dono: string; conta: string; agora?: () => number }
type Api = { ok: true; j: Obj } | { ok: false; erro: string };
export function criarWorkerGmail(d: DepsGmail): Worker {
  const agora = d.agora ?? Date.now;
  async function api(caminho: string, naoEncontrado = "mensagem_inexistente"): Promise<Api> {
    let r;
    try { r = await d.http(API + caminho, { headers: { Authorization: "Bearer " + d.acesso, Accept: "application/json" } }); } catch (_) { return { ok: false, erro: "canal_falhou" }; }
    let j: Obj | null = null; try { j = obj(await r.json()); } catch (_) { /* corpo inválido */ }
    if (r.ok && j) return { ok: true, j };
    if (r.status === 404) return { ok: false, erro: naoEncontrado };
    const motivo = str(obj(arr(obj(j?.error)?.errors)[0])?.reason);
    if (r.status === 401 || (r.status === 403 && !/ratelimit|quota|limit/i.test(motivo))) return { ok: false, erro: "autenticacao_recusada" };
    return { ok: false, erro: "http_" + (r.status >= 100 && r.status <= 599 ? r.status : 502) };
  }
  /* ESCRITA (POST): 4xx do pedido = `recusado` (nada mudou); rede, 5xx ou 429 = `incerto` (pode ter sido aplicado: quem chama confere o estado real, nunca repete). Resposta sem corpo é sucesso. */
  async function escrever(caminho: string, corpo: Obj | null, recusado: string, incerto: string): Promise<Api> {
    let r;
    try { r = await d.http(API + caminho, { method: "POST", headers: { Authorization: "Bearer " + d.acesso, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(corpo ?? {}) }); } catch (_) { return { ok: false, erro: incerto }; }
    let j: Obj | null = null; try { j = obj(await r.json()); } catch (_) { /* corpo vazio ou inválido */ }
    if (r.ok) return { ok: true, j: j ?? {} };
    if (r.status === 404) return { ok: false, erro: "mensagem_inexistente" };
    if (r.status === 401) return { ok: false, erro: "autenticacao_recusada" };   // 403 numa ESCRITA é recusa daquela ação (mensagem ou pasta), não da conta: só 401 invalida a credencial
    return { ok: false, erro: r.status >= 400 && r.status < 500 && r.status !== 429 ? recusado : incerto };
  }
  const enc = encodeURIComponent;
  /* a mensagem ainda está nesta pasta? ("ARQUIVO" = nenhum rótulo de pasta) */
  const naPasta = (rot: string[], nome: string): boolean => (nome === PASTA_ARQUIVO ? !rot.some((x) => ROTULOS_DE_PASTA.includes(x)) : rot.includes(nome));
  /* a consulta de uma pasta: rótulo do sistema/do usuário (labelIds) ou o "Arquivo" (consulta) */
  const consulta = (nome: string, max: number): string | null => {
    if (nome === PASTA_ARQUIVO) return `messages?maxResults=${max}&q=${enc(Q_ARQUIVO)}`;
    if (!RE_ID_PASTA.test(nome)) return null;
    return `messages?maxResults=${max}&labelIds=${enc(nome)}${nome === "TRASH" || nome === "SPAM" ? "&includeSpamTrash=true" : ""}`;
  };
  const ids = async (nome: string, max: number): Promise<{ ok: true; ids: string[]; mais: boolean; estimativa: number } | { ok: false; erro: string }> => {
    const c = consulta(nome, max); if (!c) return { ok: false, erro: "pasta_inexistente" };
    const r = await api(c, "pasta_inexistente"); if (!r.ok) return r;
    const lista = arr(r.j.messages).map((x) => str(obj(x)?.id)).filter((x) => RE_ID_MSG.test(x));
    return { ok: true, ids: lista, mais: typeof r.j.nextPageToken === "string", estimativa: Number(r.j.resultSizeEstimate) || lista.length };
  };
  const total = async (nome: string, fallback: number): Promise<number> => {
    if (nome === PASTA_ARQUIVO || !RE_ID_PASTA.test(nome)) return fallback;
    const r = await api("labels/" + enc(nome), "pasta_inexistente"); const n = r.ok ? Number(r.j.messagesTotal) : NaN;
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };
  const buscar = async (id: string): Promise<Api> => api(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`);
  const emLotes = async <T, R>(l: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> => { const r: R[] = []; for (let i = 0; i < l.length; i += n) r.push(...(await Promise.all(l.slice(i, i + n).map(f)))); return r; };
  const pastaId = (nome: string) => d.banco.pastaIdPorNome(d.dono, d.conta, nome);

  async function executar(operacao: string, pedido: Record<string, unknown>): Promise<ResultadoWorker> {
    const t0 = agora(), nome = str(pedido.pasta);
    if (operacao === "testar_conta") { const r = await api("profile"); return r.ok ? { ok: true, dados: {} } : r; }

    if (operacao === "listar_pastas") {
      const r = await api("labels"); if (!r.ok) return r;
      const existentes = new Set(arr(r.j.labels).map((x) => str(obj(x)?.id)));
      const pastas: Obj[] = PASTAS_SISTEMA.filter((s) => existentes.has(s.id)).map((s) => ({ nome: s.id, nome_exibicao: s.exib, uso: s.uso, selecionavel: true }));
      pastas.push({ nome: PASTA_ARQUIVO, nome_exibicao: "Arquivo", uso: "arquivo", selecionavel: true });
      for (const x of arr(r.j.labels)) { const o = obj(x); if (o && str(o.type) === "user" && RE_ID_PASTA.test(str(o.id)) && str(o.name)) pastas.push({ nome: str(o.id), nome_exibicao: str(o.name).slice(0, 200), uso: "outra", selecionavel: true }); }
      return { ok: true, dados: { pastas } };
    }

    if (operacao === "estado_pasta" || operacao === "listar_mensagens") {
      const pid = await pastaId(nome); if (!pid) return { ok: false, erro: "pasta_inexistente" };
      /* com cursor (rotina: "o que veio depois de desde_uid") só vale a janela de 50 do estado_pasta: as mensagens das posições 51+ nunca receberam uid e NÃO são novidade; sem isso a rotina avisava de e-mails antigos */
      const comCursor = typeof pedido.desde_uid === "number", limite = comCursor ? 50 : operacao === "listar_mensagens" ? Math.min(100, Math.max(1, Number(pedido.ultimas ?? pedido.limite ?? 50) || 50)) : 50;
      const l = await ids(nome, limite); if (!l.ok) return l;
      const mapa = await d.banco.idsExternos(d.dono, d.conta, pid, l.ids), maior = await d.banco.maiorUid(d.dono, d.conta, pid), novos = l.ids.filter((i) => !mapa.has(i));
      if (operacao === "estado_pasta") return { ok: true, dados: { exame: { uidvalidity: UIDVALIDITY_GMAIL, uidnext: maior + novos.length + 1 }, mensagens_na_pasta: await total(nome, l.ids.length), duracao_ms: agora() - t0 } };
      const metas = await emLotes(l.ids, 8, async (id) => ({ id, r: await buscar(id) }));
      const falha = metas.find((x) => !x.r.ok); if (falha && !falha.r.ok) return { ok: false, erro: falha.r.erro === "mensagem_inexistente" ? "canal_falhou" : falha.r.erro };
      const porId = new Map(metas.map((x) => [x.id, (x.r as { j: Obj }).j]));
      /* uids novos: crescentes, da mensagem mais ANTIGA para a mais nova (a mais nova fica com o maior uid) */
      const ordemNovos = novos.slice().sort((a, b) => Number(obj(porId.get(a))?.internalDate ?? 0) - Number(obj(porId.get(b))?.internalDate ?? 0));
      let prox = maior; for (const i of ordemNovos) mapa.set(i, ++prox);
      if (prox > 4294967295) return { ok: false, erro: "resposta_invalida" };
      let mensagens = l.ids.map((i) => resumoDe(porId.get(i)!, mapa.get(i)!, i));
      if (typeof pedido.desde_uid === "number") mensagens = mensagens.filter((m) => (m.uid as number) >= (pedido.desde_uid as number));
      return { ok: true, dados: { exame: { uidvalidity: UIDVALIDITY_GMAIL, uidnext: prox + 1 }, mensagens, mensagens_na_pasta: await total(nome, l.ids.length), mais: comCursor ? false : l.mais, duracao_ms: agora() - t0 } };
    }

    if (operacao === "ler_mensagem" || operacao === "baixar_anexo") {
      const pid = await pastaId(nome), uid = Number(pedido.uid); if (!pid || !Number.isInteger(uid)) return { ok: false, erro: "pasta_inexistente" };
      if (pedido.uidvalidity_esperado !== undefined && pedido.uidvalidity_esperado !== UIDVALIDITY_GMAIL) return { ok: false, erro: "uidvalidity_mudou" };
      const id = await d.banco.idExterno(d.dono, d.conta, pid, uid); if (!id || !RE_ID_MSG.test(id)) return { ok: false, erro: "mensagem_inexistente" };
      const r = await api(`messages/${id}?format=full`); if (!r.ok) return r;
      const ps = partes(obj(r.j.payload));
      if (operacao === "baixar_anexo") {
        const p = ps.find((x) => x.caminho === str(pedido.parte) && ehAnexo(x)); if (!p) return { ok: false, erro: "parte_inexistente" };
        let b64u = p.dados;
        if (!b64u && p.attachmentId) {
          if (p.tamanho > MAX_ANEXO_BYTES) return { ok: false, erro: "anexo_grande_demais" };
          const a = await api(`messages/${id}/attachments/${enc(p.attachmentId)}`, "parte_inexistente"); if (!a.ok) return a;
          b64u = str(a.j.data);
        }
        if (!b64u) return { ok: false, erro: "parte_inexistente" };
        const bytes = decB(b64u); if (bytes.length > MAX_ANEXO_BYTES) return { ok: false, erro: "anexo_grande_demais" };
        let b = ""; for (let i = 0; i < bytes.length; i += 8192) b += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { ok: true, dados: { anexo: { nome: p.nome, tipo: p.tipo, tamanho_bytes: bytes.length, base64: btoa(b) } } };
      }
      const resumo = resumoDe(r.j, uid, id), p = obj(r.j.payload), corpo = corpoDaMensagem(ps), anexos = ps.filter(ehAnexo);
      return { ok: true, dados: { mensagem: { ...resumo, anexo_provavel: anexos.length > 0, cc: enderecos(cab(p, "cc")).slice(0, 20), texto: corpo.texto, formato: corpo.formato, truncado: corpo.truncado,
        anexos: anexos.slice(0, 30).map((x) => ({ parte: x.caminho, nome: x.nome, tipo: x.tipo, tamanho: x.tamanho, inline: x.inline })) } } };
    }

    /* ---- gerenciar UMA mensagem (os mesmos verbos que organizar.ts usa com o Worker do iCloud) ---- */
    if (operacao === "marcar_lida" || operacao === "mover_mensagem" || operacao === "verificar_mensagem") {
      const pid = await pastaId(nome), uid = Number(pedido.uid); if (!pid || !Number.isInteger(uid)) return { ok: false, erro: "pasta_inexistente" };
      if (pedido.uidvalidity_esperado !== undefined && pedido.uidvalidity_esperado !== UIDVALIDITY_GMAIL) return { ok: false, erro: "uidvalidity_mudou" };
      const id = await d.banco.idExterno(d.dono, d.conta, pid, uid); if (!id || !RE_ID_MSG.test(id)) return { ok: false, erro: "mensagem_inexistente" };
      if (operacao === "verificar_mensagem") {
        const r = await api(`messages/${id}?format=minimal`);
        if (!r.ok) return r.erro === "mensagem_inexistente" ? { ok: true, dados: { existe: false, lida: true } } : r;
        const rot = arr(r.j.labelIds).map(String); return { ok: true, dados: { existe: naPasta(rot, nome), lida: !rot.includes("UNREAD") } };
      }
      const esperado = str(pedido.message_id_esperado);
      if (esperado) {   // a identidade do cache tem de ser a da mensagem real: senão nada é alterado
        const r = await api(`messages/${id}?format=metadata&metadataHeaders=Message-ID`); if (!r.ok) return r;
        if (cabBruto(obj(r.j.payload), "message-id") !== esperado) return { ok: false, erro: "identidade_divergente" };
      }
      if (operacao === "marcar_lida") {
        const lida = pedido.lida === true, r = await escrever(`messages/${id}/modify`, lida ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }, "acao_recusada", "acao_incerta"); if (!r.ok) return r;
        return { ok: true, dados: { resultado: "aplicada", ...(Array.isArray(r.j.labelIds) ? { lida: !r.j.labelIds.map(String).includes("UNREAD") } : {}) } };
      }
      const destino = str(pedido.destino);
      if (destino !== PASTA_ARQUIVO && !RE_ID_PASTA.test(destino)) return { ok: false, erro: "pasta_inexistente" };
      if (destino === nome) return { ok: false, erro: "acao_recusada" };
      if (destino === "TRASH") { const r = await escrever(`messages/${id}/trash`, null, "acao_recusada", "acao_incerta"); return r.ok ? { ok: true, dados: { resultado: "aplicada" } } : r; }
      if (nome === "TRASH") { const u = await escrever(`messages/${id}/untrash`, null, "acao_recusada", "acao_incerta"); if (!u.ok) return u; }   // sai da Lixeira; o untrash pode devolvê-la à entrada
      const rot = nome === "TRASH" ? { adicionar: destino === PASTA_ARQUIVO ? [] : [destino], remover: destino === "INBOX" ? [] : ["INBOX"] } : rotulosDaAcao(nome, destino);
      const r = await escrever(`messages/${id}/modify`, { addLabelIds: rot.adicionar, removeLabelIds: rot.remover }, nome === "TRASH" ? "acao_incerta" : "acao_recusada", "acao_incerta");   // saindo da Lixeira o untrash JÁ mudou a mensagem: recusa do modify não é "nada mudou"
      return r.ok ? { ok: true, dados: { resultado: "aplicada" } } : r;
    }

    /* ---- ENVIAR (o mesmo verbo que envio.ts usa com o Worker do iCloud): UMA tentativa; sem confirmação clara = envio_incerto, que o envio.ts nunca repete ---- */
    if (operacao === "enviar") {
      const p = lerPedidoEnvio(pedido); if (!p) return { ok: false, erro: "destinatario_invalido" };
      let threadId = "";
      if (p.em_resposta_a) {   // a conversa: achada pelo Message-ID; sem achar, o envio segue só com os cabeçalhos de resposta
        const b = await api(`messages?maxResults=1&q=${enc("rfc822msgid:" + p.em_resposta_a.slice(1, -1))}`);
        if (b.ok) threadId = str(obj(arr(b.j.messages)[0])?.threadId);
      }
      const r = await escrever("messages/send", { raw: base64url(montarMime(p)), ...(threadId ? { threadId } : {}) }, "envio_recusado", "envio_incerto");
      if (!r.ok) return { ok: false, erro: erroDeEnvio(r.erro) };
      return { ok: true, dados: { resultado: "enviado" } };
    }
    return { ok: false, erro: "operacao_desconhecida" };   // nada mais escreve aqui
  }
  return { executar: (op, ped) => executar(op, ped) };
}
