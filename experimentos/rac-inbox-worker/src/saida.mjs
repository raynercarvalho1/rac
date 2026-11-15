// RAC Inbox · Worker de produto (I3): montagem PURA da mensagem de SAÍDA (sem rede, sem armazenamento, sem credencial) e validação fechada do pedido "enviar".
// A mensagem sai em ASCII puro: cabeçalhos com RFC 2047 (UTF-8, base64) e corpo text/plain UTF-8 em base64. Assim acentos e emoji chegam intactos, nenhuma linha passa de 76 colunas e o
// corpo nunca contém uma linha "." sozinha (o "dot-stuffing" do SMTP continua aplicado por segurança). Nenhum valor do cliente entra em cabeçalho sem passar por validação: CR, LF e NUL são recusados.
// O corpo é SEMPRE texto: o Worker não monta HTML (conteúdo HTML é não confiável; o destinatário recebe o texto exato que o dono escreveu).
import { POLITICA } from "./politica.mjs";

export class ErroSaida extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
// códigos desta camada (lista fechada): pedido_invalido, destinatario_invalido, destinatarios_demais, assunto_invalido, texto_grande_demais, mensagem_grande_demais, message_id_invalido

const RE_END = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
const RE_MSGID = /^<[A-Za-z0-9._%+=-]{1,120}@[A-Za-z0-9.-]{1,120}>$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SEM_CONTROLE = /^[^\u0000-\u001f\u007f]*$/;
const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const enc = new TextEncoder();
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return btoa(s); };

export const enderecoValido = (e) => typeof e === "string" && e.length <= POLITICA.smtp.maxEndereco && RE_END.test(e);
export const normalizarEndereco = (e) => e.trim().toLowerCase();

/* cabeçalho não ASCII → palavras codificadas (RFC 2047, B/UTF-8), cada uma com até 45 bytes de origem e sem partir um caractere UTF-8 ao meio */
export function codificarCabecalho(valor) {
  if (/^[\x20-\x7e]*$/.test(valor)) return valor;
  const palavras = []; let atual = "";
  const fecha = () => { if (atual) { palavras.push("=?UTF-8?B?" + b64(enc.encode(atual)) + "?="); atual = ""; } };
  for (const ch of valor) { if (enc.encode(atual + ch).length > 45) fecha(); atual += ch; }
  fecha();
  return palavras.join("\r\n ");
}
/* corpo em base64, linhas de 76 colunas */
const base64Linhas = (u8) => (b64(u8).match(/.{1,76}/g) || []).join("\r\n");

/* data de cabeçalho (RFC 5322) a partir de um instante ISO em UTC ("2026-11-15T12:00:00Z") */
export function dataRfc(iso) {
  const d = new Date(iso);
  if (!RE_DATA.test(iso) || Number.isNaN(d.getTime())) throw new ErroSaida("pedido_invalido");
  const p = (n) => String(n).padStart(2, "0");
  return DIAS[d.getUTCDay()] + ", " + p(d.getUTCDate()) + " " + MESES[d.getUTCMonth()] + " " + d.getUTCFullYear() + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " +0000";
}

/* Valida o pedido "enviar" (esquema FECHADO). Devolve o pedido normalizado ou lança ErroSaida. `d` já passou pelo esquema geral (conta_id, usuario, senha). */
export function examinarEnvio(d, politica = POLITICA) {
  const c = politica.smtp, permitidos = ["operacao", "conta_id", "usuario", "senha", "de", "para", "cc", "cco", "assunto", "texto", "message_id", "em_resposta_a", "referencias", "data"];
  if (Object.keys(d).some((k) => !permitidos.includes(k))) throw new ErroSaida("pedido_invalido");
  if (!enderecoValido(d.de)) throw new ErroSaida("pedido_invalido");
  const lista = (v, obrigatoria) => {
    if (v === undefined) { if (obrigatoria) throw new ErroSaida("destinatario_invalido"); return []; }
    if (!Array.isArray(v) || (obrigatoria && v.length === 0)) throw new ErroSaida("destinatario_invalido");
    if (v.length > c.maxDestinatarios) throw new ErroSaida("destinatarios_demais");
    return v.map((e) => { if (!enderecoValido(e)) throw new ErroSaida("destinatario_invalido"); return normalizarEndereco(e); });
  };
  const para = lista(d.para, true), cc = lista(d.cc, false), cco = lista(d.cco, false);
  if (new Set([...para, ...cc, ...cco]).size !== para.length + cc.length + cco.length) throw new ErroSaida("destinatario_invalido");   // sem duplicidade entre as listas
  if (para.length + cc.length + cco.length > c.maxDestinatarios) throw new ErroSaida("destinatarios_demais");
  if (typeof d.assunto !== "string" || d.assunto.length > c.maxAssunto || !SEM_CONTROLE.test(d.assunto)) throw new ErroSaida("assunto_invalido");
  if (typeof d.texto !== "string") throw new ErroSaida("pedido_invalido");
  if (d.texto.length > c.maxTexto) throw new ErroSaida("texto_grande_demais");
  if (typeof d.message_id !== "string" || !RE_MSGID.test(d.message_id)) throw new ErroSaida("message_id_invalido");
  if (typeof d.data !== "string" || !RE_DATA.test(d.data)) throw new ErroSaida("pedido_invalido");
  let emResposta = null, refs = [];
  if (d.em_resposta_a !== undefined && d.em_resposta_a !== null) { if (typeof d.em_resposta_a !== "string" || !RE_MSGID.test(d.em_resposta_a)) throw new ErroSaida("pedido_invalido"); emResposta = d.em_resposta_a; }
  if (d.referencias !== undefined) {
    if (!Array.isArray(d.referencias) || d.referencias.length > c.maxReferencias || d.referencias.some((r) => typeof r !== "string" || !RE_MSGID.test(r))) throw new ErroSaida("pedido_invalido");
    refs = d.referencias;
  }
  if (refs.length && !emResposta) throw new ErroSaida("pedido_invalido");
  return { de: normalizarEndereco(d.de), para, cc, cco, assunto: d.assunto, texto: d.texto, message_id: d.message_id, em_resposta_a: emResposta, referencias: refs, data: d.data };
}

/* Monta a mensagem (ASCII, CRLF). O Cco NÃO aparece em cabeçalho nenhum: só vira destinatário no envelope. */
export function montarMensagem(p, politica = POLITICA) {
  const texto = p.texto.replace(/\r\n|\r|\n/g, "\r\n");
  const h = [
    "Date: " + dataRfc(p.data),
    "From: " + p.de,
    "To: " + p.para.join(", "),
  ];
  if (p.cc.length) h.push("Cc: " + p.cc.join(", "));
  h.push("Subject: " + codificarCabecalho(p.assunto), "Message-ID: " + p.message_id);
  if (p.em_resposta_a) { h.push("In-Reply-To: " + p.em_resposta_a); h.push("References: " + [...p.referencias.filter((r) => r !== p.em_resposta_a), p.em_resposta_a].join(" ")); }
  h.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  const msg = h.join("\r\n") + "\r\n\r\n" + base64Linhas(enc.encode(texto)) + "\r\n";
  if (msg.length > politica.smtp.maxMensagemBytes) throw new ErroSaida("mensagem_grande_demais");
  if (!/^[\x00-\x7f]*$/.test(msg)) throw new ErroSaida("pedido_invalido");
  return msg;
}

/* mensagem curta e controlada da prova de viabilidade: vai só para o próprio endereço da conta, com rótulo claro */
export function mensagemDeTeste(endereco, messageId, instanteIso) {
  return montarMensagem({ de: endereco, para: [endereco], cc: [], cco: [], assunto: "Teste de envio do RAC Inbox", texto: "Mensagem de teste do RAC Inbox (prova de envio SMTP). Pode apagar.\nAcentuação: ação, coração, é.", message_id: messageId, em_resposta_a: null, referencias: [], data: instanteIso });
}
