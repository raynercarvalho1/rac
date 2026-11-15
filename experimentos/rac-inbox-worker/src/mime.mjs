// RAC Inbox · Worker de produto: análise PURA de e-mail (sem rede, sem armazenamento, sem credencial).
// Lê respostas IMAP (listas parentetizadas e BODYSTRUCTURE), decodifica transferência (base64/quoted-printable), charset, cabeçalhos (RFC 2047), nomes de pasta (UTF-7 modificado do IMAP)
// e converte HTML em TEXTO puro. O Worker NUNCA devolve HTML: o navegador só recebe texto (sem superfície de script, imagem remota ou formulário).
// Os textos do servidor chegam como "latin1" (1 caractere = 1 byte); as funções trabalham em bytes. Limites e códigos de erro fechados em todas as entradas.

export class ErroMime extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
// códigos desta camada (lista fechada): resposta_malformada, mime_invalido, mime_limite_excedido, codificacao_invalida, codificacao_desconhecida

// ---------- listas parentetizadas do IMAP ----------
// Cada literal do servidor já vem trocado por \u0001<índice>\u0001 e `literais` guarda os conteúdos. Saída: árvore de arrays (NIL → null, número puro → Number).
const TOKEN = /\s*(?:(\()|(\))|"((?:[^"\\\r\n]|\\.)*)"|\u0001(\d{1,4})\u0001|(BODY(?:\.PEEK)?\[[^\]\u0001]*\](?:<\d+>)?)|([^\s()"\u0001]+))/y;
export function lerSexp(texto, literais, { maxItens = 6000, maxProfundidade = 32 } = {}) {
  const raiz = [], pilha = [raiz];
  let itens = 0, pos = 0;
  while (pos < texto.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(texto);
    if (!m) { if (/^\s*$/.test(texto.slice(pos))) break; throw new ErroMime("resposta_malformada"); }
    pos = TOKEN.lastIndex;
    if (++itens > maxItens) throw new ErroMime("mime_limite_excedido");
    const topo = pilha[pilha.length - 1];
    if (m[1] !== undefined) { const l = []; topo.push(l); pilha.push(l); if (pilha.length > maxProfundidade) throw new ErroMime("mime_limite_excedido"); }
    else if (m[2] !== undefined) { if (pilha.length === 1) throw new ErroMime("resposta_malformada"); pilha.pop(); }
    else if (m[3] !== undefined) topo.push(m[3].replace(/\\(.)/g, "$1"));
    else if (m[4] !== undefined) { const lit = literais[Number(m[4])]; if (typeof lit !== "string") throw new ErroMime("resposta_malformada"); topo.push(lit); }
    else {
      const a = m[5] !== undefined ? m[5] : m[6];
      if (/^nil$/i.test(a)) topo.push(null); else if (/^\d{1,15}$/.test(a)) topo.push(Number(a)); else topo.push(a);
    }
  }
  if (pilha.length !== 1) throw new ErroMime("resposta_malformada");
  return raiz;
}

// ---------- estrutura MIME (BODYSTRUCTURE) ----------
const paramsDe = (l) => { const m = {}; if (Array.isArray(l)) for (let i = 0; i + 1 < l.length; i += 2) if (typeof l[i] === "string" && typeof l[i + 1] === "string") m[l[i].toLowerCase()] = l[i + 1]; return m; };

function folha(no, caminho) {
  if (no.length < 7) throw new ErroMime("mime_invalido");
  const [tipo, subtipo, params, id, , codificacao, tamanho] = no;
  if (typeof tipo !== "string" || typeof subtipo !== "string" || !tipo || !subtipo || (params !== null && !Array.isArray(params))) throw new ErroMime("mime_invalido");
  if (typeof codificacao !== "string" || !Number.isSafeInteger(tamanho) || tamanho < 0) throw new ErroMime("mime_invalido");
  const p = paramsDe(params);
  let disposicao = null, nome = p.name || null;
  for (let i = 7; i < no.length; i++) {
    const x = no[i];
    if (Array.isArray(x) && typeof x[0] === "string" && /^(?:attachment|inline)$/i.test(x[0]) && (x[1] === null || Array.isArray(x[1]))) { disposicao = x[0].toLowerCase(); const q = paramsDe(x[1]); if (q.filename) nome = q.filename; break; }
  }
  return { caminho, tipo: tipo.toLowerCase(), subtipo: subtipo.toLowerCase(), charset: p.charset ? p.charset.toLowerCase() : null, codificacao: codificacao.toLowerCase(), tamanho, disposicao, nome, temCid: typeof id === "string" && id !== "" };
}

// `arvore`: o valor do item BODYSTRUCTURE (um array). Devolve as FOLHAS em ordem, com o caminho IMAP de cada uma ("1", "2.1"…).
export function analisarEstrutura(arvore, { maxPartes = 40, maxProfundidade = 8 } = {}) {
  if (!Array.isArray(arvore) || arvore.length === 0) throw new ErroMime("mime_invalido");
  const partes = [];
  (function visitar(no, caminho, raiz, prof) {
    if (prof > maxProfundidade) throw new ErroMime("mime_limite_excedido");
    if (!Array.isArray(no) || no.length === 0) throw new ErroMime("mime_invalido");
    if (Array.isArray(no[0])) {
      let i = 0;
      while (i < no.length && Array.isArray(no[i])) { visitar(no[i], raiz ? String(i + 1) : caminho + "." + (i + 1), false, prof + 1); i += 1; }
      if (typeof no[i] !== "string" || no[i] === "") throw new ErroMime("mime_invalido");
      return;
    }
    partes.push(folha(no, raiz ? "1" : caminho));
    if (partes.length > maxPartes) throw new ErroMime("mime_limite_excedido");
  })(arvore, "", true, 1);
  if (!partes.length) throw new ErroMime("mime_invalido");
  return partes;
}

// corpo = primeira parte text/plain e primeira text/html que não sejam anexo; o resto é anexo (inclusive imagem inline, marcada)
export function classificarPartes(partes) {
  let texto = null, html = null;
  const anexos = [];
  for (const p of partes) {
    const corpo = p.tipo === "text" && (p.subtipo === "plain" || p.subtipo === "html") && p.disposicao !== "attachment" && !p.nome;
    if (corpo && p.subtipo === "plain" && !texto) texto = p;
    else if (corpo && p.subtipo === "html" && !html) html = p;
    else if (!corpo) anexos.push(p);
  }
  return { texto, html, anexos };
}

// ---------- decodificação ----------
const paraBytes = (t) => { const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 0xff; return b; };
export function base64DeBytes(u8) { let s = ""; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return btoa(s); }

// `truncado`: o texto é só o começo da parte; o fim incompleto (quarteto base64 ou "=XX" cortados) é descartado
export function decodificarTransferencia(bruto, codificacao, truncado = false) {
  const enc = String(codificacao).toLowerCase();
  if (enc === "7bit" || enc === "8bit" || enc === "binary") return paraBytes(bruto);
  if (enc === "base64") {
    let l = bruto.replace(/[\r\n\t ]+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(l)) throw new ErroMime("codificacao_invalida");
    if (truncado && !/=$/.test(l)) l = l.slice(0, l.length - (l.length % 4));
    if (l.length % 4 === 1) throw new ErroMime("codificacao_invalida");
    while (l.length % 4 !== 0) l += "=";
    try { return paraBytes(atob(l)); } catch (_) { throw new ErroMime("codificacao_invalida"); }
  }
  if (enc === "quoted-printable") {
    let t = bruto.replace(/=\r?\n/g, "");
    if (truncado) t = t.replace(/=[0-9A-Fa-f]?$/, "");
    const s = [];
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c === 0x3d && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { s.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else s.push(c & 0xff); }
    return Uint8Array.from(s);
  }
  throw new ErroMime("codificacao_desconhecida");
}

// só rótulos simples de charset; o TextDecoder do runtime decide se conhece (desconhecido → null, e quem chama usa windows-1252)
const RE_CHARSET = /^[a-z0-9][a-z0-9_.:-]{1,40}$/;
export function decodificarTexto(bytes, charset, truncado = false) {
  const r = String(charset === null || charset === undefined ? "us-ascii" : charset).toLowerCase();
  const rotulo = r === "us-ascii" || r === "ascii" ? "windows-1252" : r;
  if (!RE_CHARSET.test(rotulo)) return null;
  try { return new TextDecoder(rotulo, { fatal: false }).decode(bytes, { stream: truncado }); } catch (_) { return null; }
}

// ---------- cabeçalhos ----------
// Palavras codificadas (RFC 2047): =?charset?B|Q?texto?=; palavras vizinhas separadas só por espaço se juntam.
export function decodificarCabecalho(valor) {
  if (typeof valor !== "string") return "";
  const v = valor.replace(/(\?=)\s+(?==\?)/g, "$1");
  return v.replace(/=\?([^?\s]{1,40})\?([bBqQ])\?([^?\s]*)\?=/g, (_, cs, enc, texto) => {
    try {
      const bytes = enc.toUpperCase() === "B" ? decodificarTransferencia(texto, "base64") : decodificarTransferencia(texto.replace(/_/g, " "), "quoted-printable");
      return decodificarTexto(bytes, cs) ?? texto;
    } catch (_e) { return texto; }
  });
}

// Campos do cabeçalho desdobrados: { nome(minúsculo): valor }; o primeiro de cada nome vale. Limites: 64 campos e 8 KiB por valor.
export function lerCabecalhos(bruto) {
  const saida = {};
  let atual = null, n = 0;
  for (const l of String(bruto).split("\r\n")) {
    if (l === "") continue;
    if (/^[ \t]/.test(l)) { if (atual && saida[atual].length < 8192) saida[atual] += " " + l.trim(); continue; }
    const m = /^([!-9;-~]{1,64}):[ \t]*(.*)$/.exec(l);
    if (!m) { atual = null; continue; }
    const nome = m[1].toLowerCase();
    if (nome in saida) { atual = null; continue; }
    if (++n > 64) break;
    saida[nome] = m[2]; atual = nome;
  }
  return saida;
}

// "Nome <a@b>, outro@c" → [{ nome, endereco }]; tolera aspas e grupos; no máximo 50 endereços. Nunca lança.
export function lerEnderecos(valor) {
  const texto = decodificarCabecalho(String(valor || "")).slice(0, 4096);
  const itens = []; let atual = "", aspas = false, ang = false;
  for (const ch of texto) {
    if (ch === '"') aspas = !aspas; else if (!aspas && ch === "<") ang = true; else if (!aspas && ch === ">") ang = false;
    if (ch === "," && !aspas && !ang) { itens.push(atual); atual = ""; } else atual += ch;
  }
  itens.push(atual);
  const saida = [];
  for (const bruto of itens) {
    const s = bruto.trim(); if (!s) continue;
    const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
    const endereco = m ? m[2] : (/^[^<>\s"]+@[^<>\s"]+$/.test(s) ? s : null);
    if (!endereco) continue;
    saida.push({ nome: m ? m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1").slice(0, 200) : "", endereco: endereco.slice(0, 254) });
    if (saida.length >= 50) break;
  }
  return saida;
}

// ---------- nomes de pasta: UTF-7 modificado do IMAP (RFC 3501, 5.1.3) ----------
export function decodificarPasta(nome) {
  return String(nome).replace(/&([^-]*)-/g, (_, b) => {
    if (b === "") return "&";
    try {
      const bin = atob(b.replace(/,/g, "/") + "=".repeat((4 - (b.length % 4)) % 4));
      let s = ""; for (let i = 0; i + 1 < bin.length; i += 2) s += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
      return s;
    } catch (_e) { return "&" + b + "-"; }
  });
}

// ---------- HTML → texto ----------
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€" };
export function htmlParaTexto(html, limite = 262144) {
  let t = String(html).slice(0, limite);
  t = t.replace(/<(script|style|head)[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, "\n").replace(/<\s*li[^>]*>/gi, "• ");
  t = t.replace(/<[^>]*>/g, "");
  t = t.replace(/&(#x?[0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (m, e) => {
    if (e[0] === "#") { const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) && c > 8 && c < 0x110000 && !(c >= 0xd800 && c < 0xe000) ? String.fromCodePoint(c) : ""; }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
  return t.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
