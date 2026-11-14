// P2 · análise PURA de e-mail (sem rede, sem armazenamento, sem credencial): lê a estrutura MIME (BODYSTRUCTURE do IMAP), decodifica partes e
// calcula só INDICADORES. Nada daqui devolve conteúdo da mensagem: quem chama recebe contagens, booleanos e códigos de lista fechada.
// Os textos chegam como "latin1" (1 caractere = 1 byte do servidor); as funções de decodificação trabalham em bytes e nunca guardam nada.

export class ErroMime extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}
// códigos desta camada (lista fechada): resposta_malformada (sintaxe IMAP), mime_invalido, mime_limite_excedido, codificacao_invalida, codificacao_desconhecida

// ---------- leitor de listas parentetizadas do IMAP ----------
// Entrada: o texto de uma linha lógica em que cada literal do servidor já foi trocado por \u0001<índice>\u0001 e `literais` guarda os conteúdos.
// Saída: árvore de arrays; texto entre aspas e átomos viram string, NIL vira null, número puro vira Number. Itens e profundidade são limitados.
const TOKEN = /\s*(?:(\()|(\))|"((?:[^"\\\r\n]|\\.)*)"|\u0001(\d{1,4})\u0001|(BODY(?:\.PEEK)?\[[^\]\u0001]*\](?:<\d+>)?)|([^\s()"\u0001]+))/y;

export function lerSexp(texto, literais, { maxItens = 4000, maxProfundidade = 32 } = {}) {
  const raiz = [];
  const pilha = [raiz];
  let itens = 0;
  let pos = 0;
  while (pos < texto.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(texto);
    if (!m) {
      if (/^\s*$/.test(texto.slice(pos))) break;
      throw new ErroMime("resposta_malformada");
    }
    pos = TOKEN.lastIndex;
    itens += 1;
    if (itens > maxItens) throw new ErroMime("mime_limite_excedido");
    const topo = pilha[pilha.length - 1];
    if (m[1] !== undefined) {
      const lista = [];
      topo.push(lista);
      pilha.push(lista);
      if (pilha.length > maxProfundidade) throw new ErroMime("mime_limite_excedido");
    } else if (m[2] !== undefined) {
      if (pilha.length === 1) throw new ErroMime("resposta_malformada");
      pilha.pop();
    } else if (m[3] !== undefined) {
      topo.push(m[3].replace(/\\(.)/g, "$1"));
    } else if (m[4] !== undefined) {
      const lit = literais[Number(m[4])];
      if (typeof lit !== "string") throw new ErroMime("resposta_malformada");
      topo.push(lit);
    } else {
      const atomo = m[5] !== undefined ? m[5] : m[6];
      if (/^nil$/i.test(atomo)) topo.push(null);
      else if (/^\d{1,15}$/.test(atomo)) topo.push(Number(atomo));
      else topo.push(atomo);
    }
  }
  if (pilha.length !== 1) throw new ErroMime("resposta_malformada");
  return raiz;
}

// ---------- estrutura MIME (BODYSTRUCTURE) ----------
function paramsDe(lista) {
  const mapa = {};
  if (!Array.isArray(lista)) return mapa;
  for (let i = 0; i + 1 < lista.length; i += 2) if (typeof lista[i] === "string" && typeof lista[i + 1] === "string") mapa[lista[i].toLowerCase()] = lista[i + 1];
  return mapa;
}

function folha(no, caminho) {
  if (no.length < 7) throw new ErroMime("mime_invalido");
  const tipo = no[0], subtipo = no[1], params = no[2], id = no[3], codificacao = no[5], tamanho = no[6];
  if (typeof tipo !== "string" || typeof subtipo !== "string" || tipo === "" || subtipo === "") throw new ErroMime("mime_invalido");
  if (params !== null && !Array.isArray(params)) throw new ErroMime("mime_invalido");
  if (typeof codificacao !== "string" || !Number.isSafeInteger(tamanho) || tamanho < 0) throw new ErroMime("mime_invalido");
  let disposicao = null;
  let temNome = paramsDe(params).name !== undefined;
  for (let i = 7; i < no.length; i++) {
    const x = no[i];
    if (Array.isArray(x) && typeof x[0] === "string" && /^(?:attachment|inline)$/i.test(x[0]) && (x[1] === null || Array.isArray(x[1]))) {
      disposicao = x[0].toLowerCase();
      if (paramsDe(x[1]).filename !== undefined) temNome = true;
      break;
    }
  }
  return {
    caminho, tipo: tipo.toLowerCase(), subtipo: subtipo.toLowerCase(), charset: paramsDe(params).charset ? paramsDe(params).charset.toLowerCase() : null,
    codificacao: codificacao.toLowerCase(), tamanho, disposicao, temNome, temCid: typeof id === "string" && id !== "",
  };
}

// Devolve { partes (só folhas, em ordem), profundidade, multipart, subtipoRaiz }. `arvore` é o valor do item BODYSTRUCTURE (um array).
export function analisarEstrutura(arvore, { maxPartes = 30, maxProfundidade = 6 } = {}) {
  if (!Array.isArray(arvore) || arvore.length === 0) throw new ErroMime("mime_invalido");
  const partes = [];
  let maior = 0;
  const multipartRaiz = Array.isArray(arvore[0]);
  let subtipoRaiz = null;
  function visitar(no, caminho, raiz, prof) {
    if (prof > maxProfundidade) throw new ErroMime("mime_limite_excedido");
    if (prof > maior) maior = prof;
    if (!Array.isArray(no) || no.length === 0) throw new ErroMime("mime_invalido");
    if (Array.isArray(no[0])) {
      let i = 0;
      while (i < no.length && Array.isArray(no[i])) {
        visitar(no[i], raiz ? String(i + 1) : caminho + "." + (i + 1), false, prof + 1);
        i += 1;
      }
      if (typeof no[i] !== "string" || no[i] === "") throw new ErroMime("mime_invalido");
      if (raiz) subtipoRaiz = no[i].toLowerCase();
      return;
    }
    partes.push(folha(no, raiz ? "1" : caminho));
    if (partes.length > maxPartes) throw new ErroMime("mime_limite_excedido");
  }
  visitar(arvore, "", true, 1);
  if (partes.length === 0) throw new ErroMime("mime_invalido");
  return { partes, profundidade: maior, multipart: multipartRaiz, subtipoRaiz };
}

export const CATEGORIAS_ANEXO = Object.freeze(["imagem", "pdf", "texto", "audio", "video", "mensagem", "aplicacao", "outro"]);
export function categoriaDe(tipo, subtipo) {
  if (tipo === "image") return "imagem";
  if (tipo === "application" && subtipo === "pdf") return "pdf";
  if (tipo === "text") return "texto";
  if (tipo === "audio") return "audio";
  if (tipo === "video") return "video";
  if (tipo === "message") return "mensagem";
  if (tipo === "application") return "aplicacao";
  return "outro";
}

// separa o corpo em texto puro, HTML e anexos (só a primeira parte de cada tipo de texto é o corpo; texto com nome de arquivo ou anexo é anexo)
export function classificarPartes(partes) {
  let texto = null;
  let html = null;
  const anexos = [];
  for (const p of partes) {
    const corpo = p.tipo === "text" && (p.subtipo === "plain" || p.subtipo === "html") && p.disposicao !== "attachment" && !p.temNome;
    if (corpo && p.subtipo === "plain" && !texto) texto = p;
    else if (corpo && p.subtipo === "html" && !html) html = p;
    else if (!corpo) anexos.push(p);
  }
  const inline = (p) => p.disposicao === "inline" || (p.disposicao === null && p.temCid);
  return { texto, html, anexos, inline };
}

// ---------- decodificação ----------
function paraBytes(texto) {
  const b = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i) & 0xff;
  return b;
}

// `truncado`: o texto é só o começo da parte; o fim incompleto (quarteto base64 ou "=XX" cortados) é descartado
export function decodificarTransferencia(bruto, codificacao, truncado = false) {
  const enc = String(codificacao).toLowerCase();
  if (enc === "7bit" || enc === "8bit" || enc === "binary") return paraBytes(bruto);
  if (enc === "base64") {
    let limpo = bruto.replace(/[\r\n\t ]+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpo)) throw new ErroMime("codificacao_invalida");
    if (truncado && !/=$/.test(limpo)) limpo = limpo.slice(0, limpo.length - (limpo.length % 4));
    if (limpo.length % 4 === 1) throw new ErroMime("codificacao_invalida");
    while (limpo.length % 4 !== 0) limpo += "=";
    let binario;
    try { binario = atob(limpo); } catch (_) { throw new ErroMime("codificacao_invalida"); }
    return paraBytes(binario);
  }
  if (enc === "quoted-printable") {
    let t = bruto.replace(/=\r?\n/g, "");
    if (truncado) t = t.replace(/=[0-9A-Fa-f]?$/, "");
    const saida = [];
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c === 0x3d && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { saida.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else saida.push(c & 0xff);
    }
    return Uint8Array.from(saida);
  }
  throw new ErroMime("codificacao_desconhecida");
}

// charsets aceitos (nome do rótulo -> nome fechado que pode sair na resposta)
const CHARSETS = Object.freeze({
  "utf-8": "utf-8", utf8: "utf-8", "us-ascii": "us-ascii", ascii: "us-ascii", "iso-8859-1": "iso-8859-1", latin1: "iso-8859-1",
  "iso-8859-15": "iso-8859-15", "windows-1252": "windows-1252", cp1252: "windows-1252",
});
export const NOMES_CHARSET = Object.freeze(["utf-8", "us-ascii", "iso-8859-1", "iso-8859-15", "windows-1252"]);

// Devolve { charset, texto } ou null quando o charset não é suportado. Nunca lança por bytes inválidos (marca U+FFFD).
export function decodificarTexto(bytes, charset, truncado = false) {
  const nome = CHARSETS[charset === null || charset === undefined ? "us-ascii" : String(charset).toLowerCase()];
  if (!nome) return null;
  const rotulo = nome === "us-ascii" ? "windows-1252" : nome;
  const texto = new TextDecoder(rotulo, { fatal: false }).decode(bytes, { stream: truncado });
  return { charset: nome, texto };
}

export function estatisticasTexto(texto) {
  let linhas = 0;
  for (let i = texto.indexOf("\n"); i >= 0; i = texto.indexOf("\n", i + 1)) linhas += 1;
  if (texto.length > 0 && texto[texto.length - 1] !== "\n") linhas += 1;
  return { caracteres: texto.length, linhas, caracteres_invalidos: texto.includes("�") };
}

// indicadores de privacidade/segurança do HTML (só booleanos)
export function indicadoresHtml(texto) {
  return {
    tem_script: /<script[\s>]/i.test(texto),
    tem_imagem_remota: /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(texto),
    tem_formulario: /<form[\s>]/i.test(texto),
    tem_iframe: /<iframe[\s>]/i.test(texto),
  };
}

// ---------- cabeçalhos ----------
// `bruto` é o texto latin1 dos campos pedidos. Devolve só presença/validade (nenhum valor): lança mime_invalido se nenhum campo for reconhecível.
export function analisarCabecalhos(bruto, truncado = false) {
  const campos = [];
  let invalidas = 0;
  let atual = null;
  for (const l of bruto.split("\r\n")) {
    if (l === "") continue;
    if (/^[ \t]/.test(l)) {
      if (atual) atual.valor += " " + l.trim(); else invalidas += 1;
      continue;
    }
    const m = /^([!-9;-~]{1,64}):[ \t]*(.*)$/.exec(l);
    if (!m) { invalidas += 1; atual = null; continue; }
    atual = { nome: m[1].toLowerCase(), valor: m[2] };
    campos.push(atual);
  }
  if (campos.length === 0) throw new ErroMime("mime_invalido");
  const achar = (n) => campos.find((c) => c.nome === n);
  const tem = (n) => achar(n) !== undefined;
  const data = achar("date");
  const assunto = achar("subject");
  return {
    lidos: true, bytes: bruto.length, truncado: !!truncado, campos: campos.length, linhas_invalidas: invalidas,
    from: tem("from"), to: tem("to"), cc: tem("cc"), assunto: tem("subject"), data: tem("date"),
    data_valida: !!data && Number.isFinite(Date.parse(data.valor)), message_id: tem("message-id"), mime_version: tem("mime-version"),
    assunto_codificado: !!assunto && /=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=/.test(assunto.valor),
  };
}

// ---------- anexo: tipo pela assinatura dos primeiros bytes (códigos fechados) ----------
export const TIPOS_DETECTADOS = Object.freeze(["pdf", "png", "jpeg", "gif", "zip", "texto", "desconhecido"]);
export function detectarTipo(bytes) {
  const b = bytes;
  const inicia = (...s) => b.length >= s.length && s.every((v, i) => b[i] === v);
  if (inicia(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (inicia(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (inicia(0xff, 0xd8, 0xff)) return "jpeg";
  if (inicia(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (inicia(0x50, 0x4b, 0x03, 0x04)) return "zip";
  if (b.length > 0) {
    let imprimiveis = 0;
    const n = Math.min(b.length, 512);
    for (let i = 0; i < n; i++) if (b[i] === 9 || b[i] === 10 || b[i] === 13 || (b[i] >= 32 && b[i] < 127) || b[i] >= 128) imprimiveis += 1;
    if (imprimiveis / n >= 0.95 && !b.subarray(0, n).includes(0)) return "texto";
  }
  return "desconhecido";
}
// o tipo declarado (image/png, application/pdf...) combina com a assinatura? Só decide quando há assinatura conhecida.
export function tipoConfere(detectado, tipo, subtipo) {
  const esperado = { pdf: ["application", "pdf"], png: ["image", "png"], jpeg: ["image", "jpeg"], gif: ["image", "gif"] }[detectado];
  if (!esperado) return null;
  return tipo === esperado[0] && (subtipo === esperado[1] || (detectado === "jpeg" && subtipo === "jpg"));
}
