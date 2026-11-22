// RAC Inbox · I4 lote 3: LEITURA do Outlook / Microsoft pela Microsoft Graph API (docs/inbox.md, "Outlook"). Mesma forma do adaptador do Gmail (gmail.ts) e do Worker do iCloud (`Worker.executar(operacao, pedido)`),
// com os MESMOS formatos de resposta: a sincronização (sync.ts), o cache, o contrato e a tela são os mesmos; não existe sistema paralelo por provedor.
//  - Identidade: a tela usa `uid` numérico. No Outlook o servidor atribui um uid SINTÉTICO por pasta (contador crescente, guardado com o cache); o ID da mensagem na Graph fica em `id_externo`
//    (ID imutável: não muda quando a mensagem troca de pasta). `uidvalidity` é sempre 1. O navegador nunca vê o ID da Graph.
//  - Pastas: as do sistema pelos apelidos fixos da Graph (inbox, sentitems, drafts, deleteditems, junkemail, archive); as do usuário (nível de cima) pelo ID.
//  - LEITURA (GET em mailFolders, messages e attachments) e, desde o lote 4, GERENCIAR uma mensagem por vez (PATCH isRead, move) e ENVIAR. Nunca apaga de vez: Itens Excluídos é o fim (única exceção: o rascunho que o próprio envio criou e não conseguiu enviar).
//  - O token de acesso vive só na closure desta chamada; nada é registrado. Toda falha vira código fechado ("autenticacao_recusada", "http_NNN", "canal_falhou", …).
import type { Http } from "./oauth.ts";
import type { ResultadoWorker, Worker } from "./servico.ts";
import { erroDeEnvio, htmlParaTexto, lerPedidoEnvio, MAX_ANEXO_BYTES, type BancoGmail, type End } from "./gmail.ts";

const API = "https://graph.microsoft.com/v1.0/me/";
export const UIDVALIDITY_OUTLOOK = 1;
const PASTAS_SISTEMA: Array<{ alias: string; exib: string; uso: string }> = [
  { alias: "inbox", exib: "Caixa de entrada", uso: "entrada" }, { alias: "sentitems", exib: "Enviados", uso: "enviados" }, { alias: "drafts", exib: "Rascunhos", uso: "rascunhos" },
  { alias: "deleteditems", exib: "Lixeira", uso: "lixeira" }, { alias: "junkemail", exib: "Spam", uso: "spam" }, { alias: "archive", exib: "Arquivo", uso: "arquivo" },
];
const ALIAS = new Set(PASTAS_SISTEMA.map((p) => p.alias));
const RE_ID = /^[A-Za-z0-9_=+-]{1,200}$/;   // IDs da Graph (pasta, mensagem, anexo): validados antes de irem à URL
const CAMPOS_RESUMO = "id,receivedDateTime,isRead,flag,from,toRecipients,subject,internetMessageId,hasAttachments";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/* ---------- resumo (esquema de sync.ts) ---------- */
function fim(v: unknown): End | null {
  const e = obj(obj(v)?.emailAddress), endereco = str(e?.address).trim();
  return /^[^\s<>"@]+@[^\s<>"@]+$/.test(endereco) && endereco.length <= 254 ? { nome: str(e?.name).trim().slice(0, 200), endereco } : null;
}
const iso = (v: unknown): string | null => { const t = Date.parse(str(v)); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().replace(/\.\d{3}Z$/, ".000Z") : null; };
function resumoDe(m: Obj, uid: number, ext: string): Obj {
  return { uid, ext, recebida: iso(m.receivedDateTime), tamanho: null, lida: m.isRead !== false, sinalizada: str(obj(m.flag)?.flagStatus) === "flagged", respondida: false,
    de: fim(m.from), para: arr(m.toRecipients).map(fim).filter((x): x is End => !!x).slice(0, 20), assunto: str(m.subject).slice(0, 500),
    message_id: str(m.internetMessageId).slice(0, 255) || null, anexo_provavel: m.hasAttachments === true };
}

export interface DepsOutlook { acesso: string; http: Http; banco: BancoGmail; dono: string; conta: string; agora?: () => number }
type Api = { ok: true; j: Obj } | { ok: false; erro: string };
export function criarWorkerOutlook(d: DepsOutlook): Worker {
  const agora = d.agora ?? Date.now;
  /* IdType imutável: o ID da mensagem não muda ao trocar de pasta. O corpo vem como texto puro direto da Microsoft (sem HTML para o navegador). */
  const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"';
  async function api(caminho: string, naoEncontrado = "mensagem_inexistente"): Promise<Api> {
    let r;
    try { r = await d.http(caminho.startsWith("https://") ? caminho : API + caminho, { headers: { Authorization: "Bearer " + d.acesso, Accept: "application/json", Prefer: PREFER } }); } catch (_) { return { ok: false, erro: "canal_falhou" }; }
    let j: Obj | null = null; try { j = obj(await r.json()); } catch (_) { /* corpo inválido */ }
    if (r.ok && j) return { ok: true, j };
    const codigo = str(obj(j?.error)?.code);
    if (r.status === 404 || (r.status === 400 && /InvalidId|ItemNotFound/i.test(codigo))) return { ok: false, erro: naoEncontrado };
    if (r.status === 401 || (r.status === 403 && !/throttl|limit|quota/i.test(codigo))) return { ok: false, erro: "autenticacao_recusada" };
    return { ok: false, erro: "http_" + (r.status >= 100 && r.status <= 599 ? r.status : 502) };
  }
  /* ESCRITA: 4xx do pedido = `recusado` (nada mudou); rede, 5xx ou 429 = `incerto` (pode ter sido aplicado: quem chama confere o estado real, nunca repete). 202/204 sem corpo é sucesso. */
  async function escrever(metodo: "PATCH" | "POST" | "DELETE", caminho: string, corpo: Obj | null, recusado: string, incerto: string): Promise<Api> {
    let r;
    try { r = await d.http(API + caminho, { method: metodo, headers: { Authorization: "Bearer " + d.acesso, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}), Prefer: PREFER }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) }); } catch (_) { return { ok: false, erro: incerto }; }   // sem corpo, sem Content-Type: a Graph recusa "Empty Payload"
    let j: Obj | null = null; try { j = obj(await r.json()); } catch (_) { /* corpo vazio (202/204) */ }
    if (r.ok) return { ok: true, j: j ?? {} };
    const codigo = str(obj(j?.error)?.code);
    if (r.status === 404 || (r.status === 400 && /InvalidId|ItemNotFound/i.test(codigo))) return { ok: false, erro: "mensagem_inexistente" };
    if (r.status === 401) return { ok: false, erro: "autenticacao_recusada" };   // 403 numa ESCRITA é recusa daquela ação (ex.: pasta protegida), não da conta: só 401 invalida a credencial
    return { ok: false, erro: r.status >= 400 && r.status < 500 && r.status !== 429 ? recusado : incerto };
  }
  const enc = encodeURIComponent;
  const pastaValida = (nome: string): boolean => ALIAS.has(nome) || RE_ID.test(nome);
  const pastaId = (nome: string) => d.banco.pastaIdPorNome(d.dono, d.conta, nome);

  /* as mensagens mais novas da pasta (a Graph já devolve os cabeçalhos: uma chamada só) */
  const lista = async (nome: string, max: number, campos: string): Promise<{ ok: true; itens: Obj[]; mais: boolean } | { ok: false; erro: string }> => {
    if (!pastaValida(nome)) return { ok: false, erro: "pasta_inexistente" };
    const r = await api(`mailFolders/${enc(nome)}/messages?$top=${max}&$orderby=${enc("receivedDateTime desc")}&$select=${campos}`, "pasta_inexistente"); if (!r.ok) return r;
    const itens = arr(r.j.value).map(obj).filter((x): x is Obj => !!x && RE_ID.test(str(x.id)));
    return { ok: true, itens, mais: typeof r.j["@odata.nextLink"] === "string" };
  };
  const total = async (nome: string, fallback: number): Promise<number> => {
    const r = await api(`mailFolders/${enc(nome)}?$select=totalItemCount`, "pasta_inexistente"); const n = r.ok ? Number(r.j.totalItemCount) : NaN;
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };

  type Anexo = { id: string; nome: string | null; tipo: string; tamanho: number; inline: boolean; arquivo: boolean };
  const anexosDe = async (id: string): Promise<{ ok: true; lista: Anexo[] } | { ok: false; erro: string }> => {
    const r = await api(`messages/${enc(id)}/attachments?$top=50&$select=id,name,contentType,size,isInline`); if (!r.ok) return r;
    const lista = arr(r.j.value).map(obj).filter((x): x is Obj => !!x && RE_ID.test(str(x.id))).map((x) => ({ id: str(x.id), nome: str(x.name) ? str(x.name).slice(0, 200) : null, tipo: (str(x.contentType) || "application/octet-stream").slice(0, 100),
      tamanho: Number(x.size) >= 0 ? Math.min(Number(x.size), 2147483647) : 0, inline: x.isInline === true, arquivo: str(x["@odata.type"]).toLowerCase().endsWith("fileattachment") }));
    return { ok: true, lista: lista.slice(0, 30) };
  };

  async function executar(operacao: string, pedido: Record<string, unknown>): Promise<ResultadoWorker> {
    const t0 = agora(), nome = str(pedido.pasta);
    if (operacao === "testar_conta") { const r = await api("mailFolders/inbox?$select=id"); return r.ok ? { ok: true, dados: {} } : r; }

    if (operacao === "listar_pastas") {
      /* UMA requisição por vez: a Graph aceita 4 simultâneas por aplicativo e caixa e responde 429 (Too Many Requests) acima disso */
      const sis: Array<{ s: (typeof PASTAS_SISTEMA)[number]; r: Api }> = [];
      for (const s of PASTAS_SISTEMA) sis.push({ s, r: await api(`mailFolders/${s.alias}?$select=id`, "pasta_inexistente") });
      const falha = sis.find((x) => !x.r.ok && x.r.erro !== "pasta_inexistente"); if (falha && !falha.r.ok) return falha.r;
      if (!sis.some((x) => x.s.alias === "inbox" && x.r.ok)) return { ok: false, erro: "pasta_inexistente" };
      const idsSistema = new Set(sis.filter((x) => x.r.ok).map((x) => str((x.r as { j: Obj }).j.id)));
      const pastas: Obj[] = sis.filter((x) => x.r.ok).map((x) => ({ nome: x.s.alias, nome_exibicao: x.s.exib, uso: x.s.uso, selecionavel: true }));
      const u = await api("mailFolders?$top=100&$select=id,displayName"); if (!u.ok) return u;
      for (const x of arr(u.j.value)) { const o = obj(x); if (o && RE_ID.test(str(o.id)) && !idsSistema.has(str(o.id)) && str(o.displayName)) pastas.push({ nome: str(o.id), nome_exibicao: str(o.displayName).slice(0, 200), uso: "outra", selecionavel: true }); }
      return { ok: true, dados: { pastas } };
    }

    if (operacao === "estado_pasta" || operacao === "listar_mensagens") {
      const pid = await pastaId(nome); if (!pid) return { ok: false, erro: "pasta_inexistente" };
      /* com cursor (rotina) só vale a janela de 50 do estado_pasta: as das posições 51+ nunca receberam uid e NÃO são novidade (ver gmail.ts) */
      const comCursor = typeof pedido.desde_uid === "number", limite = comCursor ? 50 : operacao === "listar_mensagens" ? Math.min(100, Math.max(1, Number(pedido.ultimas ?? pedido.limite ?? 50) || 50)) : 50;
      const l = await lista(nome, limite, operacao === "listar_mensagens" ? CAMPOS_RESUMO : "id,receivedDateTime"); if (!l.ok) return l;
      const ids = l.itens.map((x) => str(x.id)), mapa = await d.banco.idsExternos(d.dono, d.conta, pid, ids), maior = await d.banco.maiorUid(d.dono, d.conta, pid), novos = ids.filter((i) => !mapa.has(i));
      if (operacao === "estado_pasta") return { ok: true, dados: { exame: { uidvalidity: UIDVALIDITY_OUTLOOK, uidnext: maior + novos.length + 1 }, mensagens_na_pasta: await total(nome, ids.length), duracao_ms: agora() - t0 } };
      const porId = new Map(l.itens.map((x) => [str(x.id), x]));
      /* uids novos: crescentes, da mensagem mais ANTIGA para a mais nova (a mais nova fica com o maior uid) */
      const data = (i: string) => Date.parse(str(porId.get(i)?.receivedDateTime)) || 0;
      let prox = maior; for (const i of novos.slice().sort((a, b) => data(a) - data(b))) mapa.set(i, ++prox);
      if (prox > 4294967295) return { ok: false, erro: "resposta_invalida" };
      let mensagens = ids.map((i) => resumoDe(porId.get(i)!, mapa.get(i)!, i));
      if (typeof pedido.desde_uid === "number") mensagens = mensagens.filter((m) => (m.uid as number) >= (pedido.desde_uid as number));
      return { ok: true, dados: { exame: { uidvalidity: UIDVALIDITY_OUTLOOK, uidnext: prox + 1 }, mensagens, mensagens_na_pasta: await total(nome, ids.length), mais: comCursor ? false : l.mais, duracao_ms: agora() - t0 } };
    }

    if (operacao === "ler_mensagem" || operacao === "baixar_anexo") {
      const pid = await pastaId(nome), uid = Number(pedido.uid); if (!pid || !Number.isInteger(uid)) return { ok: false, erro: "pasta_inexistente" };
      if (pedido.uidvalidity_esperado !== undefined && pedido.uidvalidity_esperado !== UIDVALIDITY_OUTLOOK) return { ok: false, erro: "uidvalidity_mudou" };
      const id = await d.banco.idExterno(d.dono, d.conta, pid, uid); if (!id || !RE_ID.test(id)) return { ok: false, erro: "mensagem_inexistente" };
      if (operacao === "baixar_anexo") {
        const a = await anexosDe(id); if (!a.ok) return a;
        const n = /^[1-9]\d{0,2}$/.test(str(pedido.parte)) ? Number(pedido.parte) : 0, p = n >= 1 ? a.lista[n - 1] : undefined;
        if (!p || !p.arquivo) return { ok: false, erro: "parte_inexistente" };
        if (p.tamanho > MAX_ANEXO_BYTES) return { ok: false, erro: "anexo_grande_demais" };
        const r = await api(`messages/${enc(id)}/attachments/${enc(p.id)}`, "parte_inexistente"); if (!r.ok) return r;
        const b64 = str(r.j.contentBytes).replace(/\s+/g, ""); if (!b64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return { ok: false, erro: "parte_inexistente" };
        const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0); if (bytes > MAX_ANEXO_BYTES) return { ok: false, erro: "anexo_grande_demais" };
        return { ok: true, dados: { anexo: { nome: p.nome, tipo: p.tipo, tamanho_bytes: bytes, base64: b64 } } };
      }
      const r = await api(`messages/${enc(id)}?$select=${CAMPOS_RESUMO},ccRecipients,body`); if (!r.ok) return r;
      const corpo = obj(r.j.body), bruto = str(corpo?.content), html = str(corpo?.contentType).toLowerCase() === "html";
      const texto = html ? htmlParaTexto(bruto) : bruto.replace(/\r\n/g, "\n").trim();
      const anexos = r.j.hasAttachments === true ? await anexosDe(id) : { ok: true as const, lista: [] as Anexo[] }; if (!anexos.ok) return anexos;
      return { ok: true, dados: { mensagem: { ...resumoDe(r.j, uid, id), anexo_provavel: anexos.lista.some((x) => !x.inline), cc: arr(r.j.ccRecipients).map(fim).filter((x): x is End => !!x).slice(0, 20),
        texto: texto.slice(0, 65536), formato: !texto ? "sem_corpo" : html ? "html_convertido" : "texto", truncado: texto.length > 65536,
        anexos: anexos.lista.map((x, i) => ({ parte: String(i + 1), nome: x.nome, tipo: x.tipo, tamanho: x.tamanho, inline: x.inline })) } } };
    }

    /* ---- gerenciar UMA mensagem (os mesmos verbos que organizar.ts usa com o Worker do iCloud) ---- */
    if (operacao === "marcar_lida" || operacao === "mover_mensagem" || operacao === "verificar_mensagem") {
      const pid = await pastaId(nome), uid = Number(pedido.uid); if (!pid || !Number.isInteger(uid) || !pastaValida(nome)) return { ok: false, erro: "pasta_inexistente" };
      if (pedido.uidvalidity_esperado !== undefined && pedido.uidvalidity_esperado !== UIDVALIDITY_OUTLOOK) return { ok: false, erro: "uidvalidity_mudou" };
      const id = await d.banco.idExterno(d.dono, d.conta, pid, uid); if (!id || !RE_ID.test(id)) return { ok: false, erro: "mensagem_inexistente" };
      if (operacao === "verificar_mensagem") {
        const m = await api(`messages/${enc(id)}?$select=parentFolderId,isRead`); if (!m.ok) return m.erro === "mensagem_inexistente" ? { ok: true, dados: { existe: false, lida: true } } : m;
        const f = await api(`mailFolders/${enc(nome)}?$select=id`, "pasta_inexistente"); if (!f.ok) return f;
        return { ok: true, dados: { existe: !!str(f.j.id) && str(m.j.parentFolderId) === str(f.j.id), lida: m.j.isRead !== false } };
      }
      const esperado = str(pedido.message_id_esperado);
      const antes = (operacao === "marcar_lida" || esperado) ? await api(`messages/${enc(id)}?$select=isRead,internetMessageId`) : null; if (antes && !antes.ok) return antes;
      if (antes && esperado && str(antes.j.internetMessageId) !== esperado) return { ok: false, erro: "identidade_divergente" };   // o cache não é desta mensagem: nada é alterado
      if (operacao === "marcar_lida") {
        const lida = pedido.lida === true; if (antes && antes.j.isRead === lida) return { ok: true, dados: { resultado: "ja_estava", lida } };
        const r = await escrever("PATCH", `messages/${enc(id)}`, { isRead: lida }, "acao_recusada", "acao_incerta"); if (!r.ok) return r;
        return { ok: true, dados: { resultado: "aplicada", ...(typeof r.j.isRead === "boolean" ? { lida: r.j.isRead } : {}) } };
      }
      const destino = str(pedido.destino);
      if (!pastaValida(destino)) return { ok: false, erro: "pasta_inexistente" };
      if (destino === nome) return { ok: false, erro: "acao_recusada" };
      const r = await escrever("POST", `messages/${enc(id)}/move`, { destinationId: destino }, "acao_recusada", "acao_incerta");
      return r.ok ? { ok: true, dados: { resultado: "aplicada" } } : r;
    }

    /* ---- ENVIAR (o mesmo verbo que envio.ts usa com o Worker do iCloud): UMA tentativa; sem confirmação clara = envio_incerto, que o envio.ts nunca repete.
       Mensagem nova e encaminhar: sendMail (202 sem corpo = sucesso). Resposta: createReply → PATCH com o texto do dono → send (a conversa fica agrupada). A Graph não deixa definir o Message-ID. ---- */
    if (operacao === "enviar") {
      const p = lerPedidoEnvio(pedido); if (!p) return { ok: false, erro: "destinatario_invalido" };
      const dest = (l: string[]) => l.map((a) => ({ emailAddress: { address: a } }));
      const msg = { subject: p.assunto.replace(/[\r\n]+/g, " "), body: { contentType: "Text", content: p.texto }, toRecipients: dest(p.para), ccRecipients: dest(p.cc), bccRecipients: dest(p.cco) };
      let origem = "";
      if (p.em_resposta_a) {   // a mensagem original, pelo Message-ID; sem achar, envia como nova (não falha por causa da conversa)
        const b = await api(`messages?$filter=${enc("internetMessageId eq '" + p.em_resposta_a.replace(/'/g, "''") + "'")}&$select=id&$top=1`);
        const id = b.ok ? str(obj(arr(b.j.value)[0])?.id) : ""; if (RE_ID.test(id)) origem = id;
      }
      if (!origem) {
        const r = await escrever("POST", "sendMail", { message: msg, saveToSentItems: true }, "envio_recusado", "envio_incerto");
        return r.ok ? { ok: true, dados: { resultado: "enviado" } } : { ok: false, erro: erroDeEnvio(r.erro) };
      }
      const c = await escrever("POST", `messages/${enc(origem)}/createReply`, null, "envio_recusado", "envio_recusado");   // ainda nada saiu: qualquer falha aqui é confirmada
      const rascunho = c.ok ? str(c.j.id) : ""; if (!c.ok || !RE_ID.test(rascunho)) return { ok: false, erro: erroDeEnvio(c.ok ? "envio_recusado" : c.erro) };
      const limpar = async () => { await escrever("DELETE", `messages/${enc(rascunho)}`, null, "envio_recusado", "envio_recusado"); };   // só o rascunho que ESTE envio criou; melhor esforço
      const u = await escrever("PATCH", `messages/${enc(rascunho)}`, msg, "envio_recusado", "envio_recusado");
      if (!u.ok) { await limpar(); return { ok: false, erro: erroDeEnvio(u.erro) }; }
      const e = await escrever("POST", `messages/${enc(rascunho)}/send`, null, "envio_recusado", "envio_incerto");
      if (e.ok) return { ok: true, dados: { resultado: "enviado" } };
      if (e.erro !== "envio_incerto") await limpar();   // recusa confirmada: não sobra rascunho; incerto: PODE ter saído, o rascunho fica
      return { ok: false, erro: erroDeEnvio(e.erro) };
    }
    return { ok: false, erro: "operacao_desconhecida" };   // nada mais escreve aqui
  }
  return { executar: (op, ped) => executar(op, ped) };
}
