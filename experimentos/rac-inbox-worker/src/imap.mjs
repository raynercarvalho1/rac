// RAC Inbox · Worker de produto: cliente IMAP SOMENTE LEITURA para o iCloud (TLS implícito, porta 993; host e porta vêm só da política).
// Comandos permitidos (lista FECHADA, conferida a cada envio por expressão regular ANTES de escrever no socket): CAPABILITY, LOGIN, LIST, EXAMINE, FETCH (por número de ordem),
// UID FETCH, UID SEARCH e LOGOUT. NUNCA: SELECT, STORE, COPY, MOVE, APPEND, EXPUNGE, DELETE, RENAME, SUBSCRIBE, IDLE, AUTHENTICATE, STARTTLS. EXAMINE (não SELECT) e BODY.PEEK (não BODY)
// garantem que nada muda no servidor, nem a flag \Seen. Uma única tentativa de login por chamada. A credencial vive só em variáveis locais da chamada: nunca é registrada nem devolvida.
// Toda resposta é de ESQUEMA FECHADO; toda falha é um CÓDIGO de lista fechada (nunca texto do servidor, nunca a credencial).
import { POLITICA } from "./politica.mjs";
import { ErroMime, lerSexp, analisarEstrutura, classificarPartes, decodificarTransferencia, decodificarTexto, decodificarCabecalho, lerCabecalhos, lerEnderecos, decodificarPasta, htmlParaTexto, base64DeBytes } from "./mime.mjs";

export class ErroImap extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
export const ERROS_IMAP = Object.freeze([
  "conexao_falhou", "timeout", "saudacao_invalida", "capability_falhou", "login_desabilitado", "autenticacao_recusada", "login_erro_protocolo",
  "listagem_falhou", "pasta_invalida", "pasta_inexistente", "examine_recusado", "uidvalidity_mudou", "fetch_falhou", "busca_falhou", "mensagem_inexistente",
  "parte_inexistente", "anexo_grande_demais", "resposta_inesperada", "resposta_malformada", "resposta_grande_demais", "limite_excedido", "comando_nao_permitido",
  "mime_invalido", "mime_limite_excedido", "codificacao_invalida", "codificacao_desconhecida", "parametro_invalido", "falha_inesperada",
]);

const SEGURO_PARA_COMANDO = /^[^"\\\r\n\u0000]+$/;
const NOME_PASTA = /^[ !#-[\]-~]{1,200}$/;                    // ASCII imprimível, sem aspas nem barra invertida (nomes do iCloud vêm em UTF-7 modificado, que é ASCII)
const CAMINHO_PARTE = /^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){0,5}$/;
const UID_MAX = 4294967295;
const uidOk = (v) => Number.isSafeInteger(v) && v >= 1 && v <= UID_MAX;
const CAMPOS = "FROM TO CC SUBJECT DATE MESSAGE-ID REFERENCES CONTENT-TYPE";
const ITENS_LISTA = "UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (" + CAMPOS + ")]<0.8192>";
const ITENS_ESTRUTURA = "UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (" + CAMPOS + ")]<0.8192>";
const RE_ITENS = new RegExp("^(?:" + [ITENS_LISTA, ITENS_ESTRUTURA].map((s) => s.replace(/[.[\]()]/g, "\\$&")).join("|") + "|BODY\\.PEEK\\[\\d{1,3}(?:\\.\\d{1,3}){0,5}\\](?:<0\\.[1-9]\\d{0,6}>)?)$");
const RE_CONJUNTO_UID = /^(?:[1-9]\d{0,9}(?::(?:[1-9]\d{0,9}|\*))?|[1-9]\d{0,9}(?:,[1-9]\d{0,9}){0,99})$/;
const RE_CONJUNTO_SEQ = /^[1-9]\d{0,9}:[1-9]\d{0,9}$/;

// Conferência final de CADA comando (verbo e argumentos nos formatos exatos desta etapa)
export function comandoPermitido(verbo, args) {
  if (verbo === "CAPABILITY" || verbo === "LOGOUT") return args === "";
  if (verbo === "LOGIN") return /^ "[^"\\\r\n\u0000]+" "[^"\\\r\n\u0000]+"$/.test(args);
  if (verbo === "LIST") return args === ' "" "*"';
  if (verbo === "EXAMINE") { const m = /^ "(.*)"$/.exec(args); return !!m && NOME_PASTA.test(m[1]); }
  if (verbo === "FETCH") { const m = /^ (\S+) \((.*)\)$/.exec(args); return !!m && RE_CONJUNTO_SEQ.test(m[1]) && RE_ITENS.test(m[2]); }
  if (verbo === "UID") {
    let m = /^ FETCH (\S+) \((.*)\)$/.exec(args);
    if (m) return RE_CONJUNTO_UID.test(m[1]) && RE_ITENS.test(m[2]);
    m = /^ SEARCH UID 1:([1-9]\d{0,9})$/.exec(args);
    return !!m && uidOk(Number(m[1]));
  }
  return false;
}

// ---------- leitura do socket ----------
const latin1 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return s; };
export function criarLeitor(readable, prazo, maxBytes) {
  const leitor = readable.getReader();
  let buf = "", total = 0;
  async function puxar() {
    const r = await Promise.race([leitor.read(), prazo]);
    if (r.done) throw new ErroImap("resposta_inesperada");
    total += r.value.byteLength;
    if (total > maxBytes) throw new ErroImap("resposta_grande_demais");
    buf += latin1(r.value);
  }
  return {
    async linha() { for (;;) { const i = buf.indexOf("\r\n"); if (i >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); return l; } await puxar(); } },
    async bytes(n) { while (buf.length < n) await puxar(); const t = buf.slice(0, n); buf = buf.slice(n); return t; },
    liberar() { try { leitor.releaseLock(); } catch (_) { /* já liberado */ } },
  };
}

// Envia UM comando e lê até a linha etiquetada. `soltas` = linhas lógicas { texto, literais }: cada literal do servidor vira \u0001<índice>\u0001 e o conteúdo fica em `literais`.
export async function executarComando(ctx, verbo, args, maxLiteral) {
  if (!comandoPermitido(verbo, args || "")) throw new ErroImap("comando_nao_permitido");
  ctx.n += 1;
  const tag = "a" + ctx.n;
  await Promise.race([ctx.escritor.write(ctx.codificador.encode(tag + " " + verbo + (args || "") + "\r\n")), ctx.prazo]);
  const soltas = [];
  for (;;) {
    let l = await ctx.leitor.linha();
    if (l.includes("\u0001")) throw new ErroImap("resposta_malformada");
    const literais = [];
    let lit = /\{(\d{1,8})\}$/.exec(l);
    while (lit) {
      const n = Number(lit[1]);
      if (n > maxLiteral) throw new ErroImap("resposta_grande_demais");
      if (literais.length >= 64) throw new ErroImap("limite_excedido");
      const conteudo = await ctx.leitor.bytes(n);
      const resto = await ctx.leitor.linha();
      if (resto.includes("\u0001")) throw new ErroImap("resposta_malformada");
      l = l.slice(0, lit.index) + "\u0001" + literais.length + "\u0001" + resto;
      literais.push(conteudo);
      lit = /\{(\d{1,8})\}$/.exec(l);
    }
    if (l.length > ctx.maxLinhaLogica) throw new ErroImap("resposta_grande_demais");
    if (l.startsWith(tag + " ")) { const d = l.slice(tag.length + 1); return { status: d.split(" ")[0].toUpperCase(), resto: d, soltas }; }
    if (l.startsWith("* ")) { soltas.push({ texto: l, literais }); if (soltas.length > ctx.maxLinhas) throw new ErroImap("limite_excedido"); continue; }
    throw new ErroImap("resposta_inesperada");   // inclui "+" (continuação, que nunca enviamos) e linhas fora de ordem
  }
}

// ---------- sessão: conexão, login, operação, logout ----------
// `fn(ctx)` roda autenticada e devolve os DADOS. Nunca lança: devolve { ok:true, dados } ou { ok:false, erro:<código fechado> }.
export async function comSessao({ abrir, usuario, senha, politica = POLITICA, relogio = () => Date.now() }, fn) {
  const cfg = politica.imap, inicio = relogio();
  let socket = null, ctx = null, temporizador, erro = null, dados = null, autenticado = false;
  const prazo = new Promise((_, rej) => { temporizador = setTimeout(() => rej(new ErroImap("timeout")), cfg.timeoutMs); }); prazo.catch(() => {});
  try {
    if (typeof usuario !== "string" || typeof senha !== "string" || !SEGURO_PARA_COMANDO.test(usuario) || !SEGURO_PARA_COMANDO.test(senha)) throw new ErroImap("comando_nao_permitido");
    try { socket = await Promise.race([abrir(cfg.host, cfg.porta), prazo]); } catch (e) { throw e instanceof ErroImap ? e : new ErroImap("conexao_falhou"); }
    ctx = { n: 0, prazo, politica, maxLinhas: cfg.maxLinhas, maxLinhaLogica: cfg.maxLinhaLogica, codificador: new TextEncoder(), escritor: socket.writable.getWriter(), leitor: criarLeitor(socket.readable, prazo, cfg.maxBytesSessao) };
    if (!/^\* OK( |$)/i.test(await ctx.leitor.linha())) throw new ErroImap("saudacao_invalida");
    const pre = await executarComando(ctx, "CAPABILITY", "", 1024);
    if (pre.status !== "OK") throw new ErroImap("capability_falhou");
    if (pre.soltas.some((s) => /^\* CAPABILITY .*\bLOGINDISABLED\b/i.test(s.texto))) throw new ErroImap("login_desabilitado");   // a credencial nem chega a ser enviada
    const login = await executarComando(ctx, "LOGIN", ' "' + usuario + '" "' + senha + '"', 1024);   // UMA tentativa, sem repetição
    if (login.status === "NO") throw new ErroImap("autenticacao_recusada");
    if (login.status !== "OK") throw new ErroImap("login_erro_protocolo");
    autenticado = true;
    dados = await fn(ctx);
  } catch (e) {
    erro = (e instanceof ErroImap || e instanceof ErroMime) && ERROS_IMAP.includes(e.codigo) ? e.codigo : "falha_inesperada";
  }
  if (ctx && autenticado && !["timeout", "conexao_falhou", "resposta_inesperada", "resposta_malformada", "comando_nao_permitido"].includes(erro)) {   // sem login não há o que encerrar: só fecha o socket
    try { await executarComando(ctx, "LOGOUT", "", 1024); } catch (_) { /* encerramento educado; falha aqui não muda o resultado */ }
  }
  clearTimeout(temporizador);
  if (ctx) ctx.leitor.liberar();
  if (socket) { try { await socket.close(); } catch (_) { /* já fechado */ } }
  const duracao_ms = Math.min(600000, Math.max(0, Math.trunc(relogio() - inicio)));
  return erro ? { ok: false, erro, autenticado } : { ok: true, dados: { ...dados, duracao_ms } };
}

// ---------- peças ----------
export function conferirPasta(pasta) {
  if (typeof pasta !== "string" || !NOME_PASTA.test(pasta)) throw new ErroImap("pasta_invalida");
  return pasta;
}

// EXAMINE: somente leitura por definição do protocolo. Devolve números; qualquer coisa a menos é malformada.
async function examinar(ctx, pasta, uidvalidityEsperado) {
  const ex = await executarComando(ctx, "EXAMINE", ' "' + conferirPasta(pasta) + '"', 1024);
  if (ex.status !== "OK") throw new ErroImap(/\[NONEXISTENT\]/i.test(ex.resto) ? "pasta_inexistente" : "examine_recusado");
  let existentes = null, uidvalidity = null, uidnext = null;
  for (const s of ex.soltas) {
    let m = /^\* (\d{1,10}) EXISTS$/i.exec(s.texto); if (m) { existentes = Number(m[1]); continue; }
    m = /^\* OK \[UIDVALIDITY (\d{1,10})\]/i.exec(s.texto); if (m) { uidvalidity = Number(m[1]); continue; }
    m = /^\* OK \[UIDNEXT (\d{1,10})\]/i.exec(s.texto); if (m) uidnext = Number(m[1]);
  }
  if (existentes === null || !uidOk(uidvalidity) || !uidOk(uidnext)) throw new ErroImap("resposta_malformada");
  if (uidvalidityEsperado !== undefined && uidvalidityEsperado !== null && uidvalidityEsperado !== uidvalidity) throw new ErroImap("uidvalidity_mudou");
  return { existentes, uidvalidity, uidnext };
}

const USO_ESPECIAL = { "\\sent": "enviados", "\\drafts": "rascunhos", "\\trash": "lixeira", "\\junk": "spam", "\\archive": "arquivo", "\\all": "todas", "\\flagged": "sinalizadas", "\\important": "importantes" };
const MESES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// INTERNALDATE "14-Nov-2026 10:20:30 +0000" → ISO UTC (ou null)
export function dataInterna(texto) {
  const m = /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(String(texto));
  if (!m || !(m[2].toLowerCase() in MESES)) return null;
  const desloc = (m[7] === "-" ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
  const t = Date.UTC(Number(m[3]), MESES[m[2].toLowerCase()], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) - desloc * 60000;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Itens de uma resposta FETCH → { uid, flags, internaldate, tamanho, cabecalho(texto bruto), estrutura(árvore), partes: { "BODY[1]<0>": texto } }
function lerFetch(soltas, maxItens) {
  const saida = [];
  for (const s of soltas) {
    const m = /^\* (\d{1,10}) FETCH \(([\s\S]*)\)$/.exec(s.texto);
    if (!m) continue;
    const lista = lerSexp(m[2], s.literais, { maxItens });
    const r = { seq: Number(m[1]), uid: null, flags: [], internaldate: null, tamanho: null, cabecalho: "", estrutura: null, partes: {} };
    for (let i = 0; i + 1 < lista.length; i += 2) {
      const k = String(lista[i]).toUpperCase(), v = lista[i + 1];
      if (k === "UID" && uidOk(v)) r.uid = v;
      else if (k === "FLAGS" && Array.isArray(v)) r.flags = v.filter((f) => typeof f === "string").map((f) => f.toLowerCase());
      else if (k === "INTERNALDATE" && typeof v === "string") r.internaldate = dataInterna(v);
      else if (k === "RFC822.SIZE" && Number.isSafeInteger(v) && v >= 0) r.tamanho = v;
      else if (k === "BODYSTRUCTURE" && Array.isArray(v)) r.estrutura = v;
      else if (k.startsWith("BODY[HEADER.FIELDS") && typeof v === "string") r.cabecalho = v;
      else if (/^BODY\[\d/.test(k) && typeof v === "string") r.partes[k] = v;
    }
    saida.push(r);
  }
  return saida;
}

function resumoMensagem(f) {
  const h = lerCabecalhos(f.cabecalho), de = lerEnderecos(h.from);
  const tipo = (/^\s*([a-z0-9.+-]+\/[a-z0-9.+-]+)/i.exec(h["content-type"] || "") || [])[1];
  return {
    uid: f.uid, recebida: f.internaldate, tamanho: f.tamanho,
    lida: f.flags.includes("\\seen"), sinalizada: f.flags.includes("\\flagged"), respondida: f.flags.includes("\\answered"), rascunho: f.flags.includes("\\draft"),
    de: de[0] || null, para: lerEnderecos(h.to).slice(0, 20), cc: lerEnderecos(h.cc).slice(0, 20),
    assunto: decodificarCabecalho(h.subject || "").replace(/\s+/g, " ").trim().slice(0, 500),
    message_id: typeof h["message-id"] === "string" ? h["message-id"].trim().slice(0, 255) : null,
    referencias: typeof h.references === "string" ? (h.references.match(/<[A-Za-z0-9._%+=-]{1,120}@[A-Za-z0-9.-]{1,120}>/g) || []).slice(-10) : [],   // só para montar a resposta (In-Reply-To/References); nunca vai ao navegador
    tipo_conteudo: tipo ? tipo.toLowerCase() : null, anexo_provavel: !!tipo && /^multipart\/(mixed|signed)$/i.test(tipo),
  };
}

// ---------- operações (todas SOMENTE LEITURA) ----------
export const OPERACOES = {
  async testar_conta() { return {}; },   // chegar aqui já provou conexão, capacidades e login

  async listar_pastas(ctx) {
    const r = await executarComando(ctx, "LIST", ' "" "*"', 8192);
    if (r.status !== "OK") throw new ErroImap("listagem_falhou");
    const pastas = [];
    for (const s of r.soltas) {
      const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (?:"((?:[^"\\]|\\.)*)"|\u0001(\d{1,3})\u0001|([^\s"]+))$/i.exec(s.texto);
      if (!m) continue;
      const nome = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3] !== undefined ? s.literais[Number(m[3])] : m[4];
      if (typeof nome !== "string" || !NOME_PASTA.test(nome)) continue;   // nome que o próprio Worker não poderia abrir não é oferecido
      const attrs = m[1].toLowerCase().split(" ").filter(Boolean);
      const uso = nome.toUpperCase() === "INBOX" ? "entrada" : (attrs.map((a) => USO_ESPECIAL[a]).find(Boolean) || "outra");
      pastas.push({ nome, nome_exibicao: decodificarPasta(nome).slice(0, 200), uso, selecionavel: !attrs.includes("\\noselect") && !attrs.includes("\\nonexistent") });
      if (pastas.length >= ctx.politica.imap.maxPastas) break;
    }
    return { pastas };
  },

  async estado_pasta(ctx, p) {
    const e = await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    return { exame: { uidvalidity: e.uidvalidity, uidnext: e.uidnext }, mensagens_na_pasta: e.existentes };
  },

  // p: { pasta, ultimas | desde_uid | antes_de_uid, limite?, uidvalidity_esperado? }
  async listar_mensagens(ctx, p) {
    const cfg = ctx.politica.imap, limite = Number.isSafeInteger(p.limite) ? Math.min(Math.max(p.limite, 1), cfg.maxMensagensPorChamada) : 50;
    const modos = ["ultimas", "desde_uid", "antes_de_uid"].filter((k) => p[k] !== undefined);
    if (modos.length !== 1 || !uidOk(p[modos[0]])) throw new ErroImap("parametro_invalido");
    const e = await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    let falhas = [], mais = false, resp = [];
    const buscar = async (verbo, args) => { const r = await executarComando(ctx, verbo, args, cfg.maxLiteralCabecalho); if (r.status !== "OK") throw new ErroImap("fetch_falhou"); return lerFetch(r.soltas, cfg.maxItensSexp); };
    if (modos[0] === "ultimas") {
      if (e.existentes > 0) { const n = Math.min(p.ultimas, limite), a = Math.max(1, e.existentes - n + 1); resp = await buscar("FETCH", " " + a + ":" + e.existentes + " (" + ITENS_LISTA + ")"); mais = e.existentes > n; }
    } else if (modos[0] === "desde_uid") {
      resp = (await buscar("UID", " FETCH " + p.desde_uid + ":* (" + ITENS_LISTA + ")")).filter((f) => f.uid !== null && f.uid >= p.desde_uid).sort((a, b) => a.uid - b.uid);
      if (resp.length > limite) { resp = resp.slice(0, limite); mais = true; }
    } else if (p.antes_de_uid > 1) {
      const b = await executarComando(ctx, "UID", " SEARCH UID 1:" + (p.antes_de_uid - 1), 1024);
      if (b.status !== "OK") throw new ErroImap("busca_falhou");
      const uids = b.soltas.flatMap((s) => (/^\* SEARCH((?: \d{1,10})*)$/i.exec(s.texto) || [, ""])[1].split(" ").filter(Boolean).map(Number)).filter(uidOk).sort((x, y) => x - y);
      if (uids.length) { const escolhidos = uids.slice(-limite); mais = uids.length > limite; resp = await buscar("UID", " FETCH " + escolhidos.join(",") + " (" + ITENS_LISTA + ")"); }
    }
    const mensagens = [];
    for (const f of resp) { if (f.uid === null) { falhas.push(f.seq); continue; } mensagens.push(resumoMensagem(f)); }
    mensagens.sort((a, b) => b.uid - a.uid);   // mais nova primeiro
    return { exame: { uidvalidity: e.uidvalidity, uidnext: e.uidnext }, mensagens_na_pasta: e.existentes, mensagens, mais };
  },

  // p: { pasta, uid, uidvalidity_esperado? } → cabeçalhos, TEXTO do corpo (nunca HTML) e a lista de anexos
  async ler_mensagem(ctx, p) {
    if (!uidOk(p.uid)) throw new ErroImap("parametro_invalido");
    const cfg = ctx.politica.imap;
    const e = await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    const est = await executarComando(ctx, "UID", " FETCH " + p.uid + " (" + ITENS_ESTRUTURA + ")", cfg.maxLiteralCabecalho);
    if (est.status !== "OK") throw new ErroImap("fetch_falhou");
    const f = lerFetch(est.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
    if (!f) throw new ErroImap("mensagem_inexistente");
    if (!f.estrutura) throw new ErroImap("mime_invalido");
    const partes = analisarEstrutura(f.estrutura, { maxPartes: cfg.maxPartes, maxProfundidade: cfg.maxProfundidade }), cls = classificarPartes(partes);
    const corpo = cls.texto || cls.html;
    let texto = "", formato = "sem_corpo", truncado = false;
    if (corpo) {
      const limite = Math.min(corpo.tamanho, cfg.maxLiteralTexto) || 1;
      const r = await executarComando(ctx, "UID", " FETCH " + p.uid + " (BODY.PEEK[" + corpo.caminho + "]<0." + limite + ">)", cfg.maxLiteralTexto);
      if (r.status !== "OK") throw new ErroImap("fetch_falhou");
      const g = lerFetch(r.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
      const bruto = g && Object.values(g.partes)[0];
      if (typeof bruto === "string") {
        const cortada = corpo.tamanho > limite;
        const bytes = decodificarTransferencia(bruto, corpo.codificacao, cortada);
        const dec = decodificarTexto(bytes, corpo.charset, cortada) ?? decodificarTexto(bytes, "windows-1252", cortada) ?? "";
        texto = corpo === cls.texto ? dec.replace(/\r\n/g, "\n") : htmlParaTexto(dec);
        formato = corpo === cls.texto ? "texto" : "html_convertido";
        truncado = cortada;
        if (texto.length > cfg.maxTextoCaracteres) { texto = texto.slice(0, cfg.maxTextoCaracteres); truncado = true; }
      }
    }
    const resumo = resumoMensagem(f);
    return {
      exame: { uidvalidity: e.uidvalidity, uidnext: e.uidnext },
      mensagem: { ...resumo, texto, formato, truncado,
        anexos: cls.anexos.slice(0, 30).map((a) => ({ parte: a.caminho, nome: a.nome ? decodificarCabecalho(a.nome).slice(0, 200) : null, tipo: a.tipo + "/" + a.subtipo, tamanho: a.tamanho, inline: a.disposicao === "inline" || (a.disposicao === null && a.temCid) })) },
    };
  },

  // p: { pasta, uid, parte, uidvalidity_esperado? } → { anexo: { nome, tipo, tamanho_bytes, base64 } }; limite de tamanho CODIFICADO na política
  async baixar_anexo(ctx, p) {
    if (!uidOk(p.uid) || typeof p.parte !== "string" || !CAMINHO_PARTE.test(p.parte)) throw new ErroImap("parametro_invalido");
    const cfg = ctx.politica.imap;
    await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    const est = await executarComando(ctx, "UID", " FETCH " + p.uid + " (" + ITENS_ESTRUTURA + ")", cfg.maxLiteralCabecalho);
    if (est.status !== "OK") throw new ErroImap("fetch_falhou");
    const f = lerFetch(est.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
    if (!f) throw new ErroImap("mensagem_inexistente");
    if (!f.estrutura) throw new ErroImap("mime_invalido");
    const parte = analisarEstrutura(f.estrutura, { maxPartes: cfg.maxPartes, maxProfundidade: cfg.maxProfundidade }).find((x) => x.caminho === p.parte);
    if (!parte) throw new ErroImap("parte_inexistente");
    if (parte.tamanho > cfg.maxLiteralAnexo) throw new ErroImap("anexo_grande_demais");
    const r = await executarComando(ctx, "UID", " FETCH " + p.uid + " (BODY.PEEK[" + p.parte + "])", cfg.maxLiteralAnexo);
    if (r.status !== "OK") throw new ErroImap("fetch_falhou");
    const g = lerFetch(r.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
    const bruto = g && Object.values(g.partes)[0];
    if (typeof bruto !== "string") throw new ErroImap("parte_inexistente");
    const bytes = decodificarTransferencia(bruto, parte.codificacao);
    return { anexo: { nome: parte.nome ? decodificarCabecalho(parte.nome).slice(0, 200) : null, tipo: parte.tipo + "/" + parte.subtipo, tamanho_bytes: bytes.length, base64: base64DeBytes(bytes) } };
  },
};
