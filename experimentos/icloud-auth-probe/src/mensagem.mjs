// P2 · leitura controlada de UMA mensagem da pasta de teste (RAC-TESTE), SOMENTE LEITURA. Nada é alterado, nada é guardado.
// Comandos (lista fechada, conferida em código, em teste e na inspeção do pacote): CAPABILITY, LOGIN, LIST (só a pasta de teste), EXAMINE (só a pasta
// de teste; abre somente leitura), FETCH (só "* (UID)") e UID FETCH (um UID; só estrutura e BODY.PEEK parcial) e LOGOUT. Uma única tentativa de login.
// Proibido (não existe no código): SELECT, STORE, COPY, MOVE, EXPUNGE, DELETE, APPEND, CREATE, RENAME, busca (SEARCH), BODY[...] sem PEEK, SMTP.
// A resposta usa esquema fechado: só booleanos, contagens, tamanhos e códigos de lista fechada. Assunto, endereços, texto, HTML, nomes de pasta e de
// arquivo, bytes de anexo e a credencial NUNCA saem daqui: a mensagem é lida em variáveis locais, resumida em indicadores e descartada.
import { POLITICA } from "./politica.mjs";
import {
  ErroMime, lerSexp, analisarEstrutura, classificarPartes, categoriaDe, CATEGORIAS_ANEXO, decodificarTransferencia, decodificarTexto, NOMES_CHARSET,
  estatisticasTexto, indicadoresHtml, analisarCabecalhos, detectarTipo, tipoConfere, TIPOS_DETECTADOS,
} from "./mime.mjs";

export class ErroP2 extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

export const ESTAGIOS_P2 = Object.freeze([
  "inicio", "conexao", "saudacao", "capability_pre", "login", "pasta_localizar", "pasta_examinar", "mensagem_localizar", "mensagem_estrutura",
  "mensagem_conteudo", "logout", "concluido",
]);
export const ERROS_P2 = Object.freeze([
  "conexao_falhou", "timeout", "saudacao_invalida", "capability_falhou", "login_desabilitado", "autenticacao_recusada", "login_erro_protocolo",
  "pasta_inexistente", "pasta_erro", "examine_recusado", "pasta_vazia", "uid_invalido", "uid_inexistente", "mensagem_erro", "conteudo_falhou",
  "mime_invalido", "mime_limite_excedido", "resposta_malformada", "resposta_inesperada", "resposta_conflitante", "resposta_grande_demais", "limite_excedido",
  "comando_nao_permitido", "falha_inesperada",
]);
export const STATUS_PARTE = Object.freeze([
  "nao_presente", "nao_lido", "lido", "truncado", "vazio", "grande_demais", "codificacao_invalida", "codificacao_desconhecida", "charset_nao_suportado",
]);
const SUBTIPOS_MULTIPART = Object.freeze(["mixed", "alternative", "related", "outro"]);

// ÚNICOS verbos que este módulo pode enviar. Qualquer outro derruba a chamada antes de escrever no socket.
const VERBOS_P2 = Object.freeze(["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"]);
const CAMPOS_CABECALHO = "FROM TO CC SUBJECT DATE MESSAGE-ID MIME-VERSION CONTENT-TYPE";
const SEGURO_PARA_COMANDO = /^[^"\\\r\n\u0000]+$/;
const NOME_PASTA = /^[A-Za-z0-9._-]{1,64}$/;
const ITENS_ESTRUTURA = "UID RFC822.SIZE BODYSTRUCTURE";
const UID_MAX = 4294967295;

// Conferência final de CADA comando antes de ir ao socket: verbo permitido e argumentos exatamente nos formatos desta etapa.
// FETCH só pede UID; UID FETCH só pede a estrutura ou leituras PARCIAIS com PEEK (que não mudam flags) de cabeçalhos ou de uma parte.
const UID_FETCH = new RegExp(
  "^ FETCH [1-9]\\d{0,9} \\((?:" + ITENS_ESTRUTURA.replace(/\./g, "\\.") + "|(?:BODY\\.PEEK\\[(?:HEADER\\.FIELDS \\(" + CAMPOS_CABECALHO + "\\)|\\d{1,3}(?:\\.\\d{1,3}){0,5})\\]<0\\.[1-9]\\d{0,5}>(?: |(?=\\))))+)\\)$",
);
export function comandoPermitido(verbo, args, pasta) {
  if (!VERBOS_P2.includes(verbo)) return false;
  if (verbo === "CAPABILITY" || verbo === "LOGOUT") return args === "";
  if (verbo === "LOGIN") return /^ "[^"\\\r\n\u0000]+" "[^"\\\r\n\u0000]+"$/.test(args);
  if (verbo === "LIST") return args === ' "" "' + pasta + '"';
  if (verbo === "EXAMINE") return args === ' "' + pasta + '"';
  if (verbo === "FETCH") return args === " * (UID)";
  if (verbo === "UID") return UID_FETCH.test(args);
  return false;
}

function latin1(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096));
  return s; // 1 byte = 1 caractere, sem a tabela do windows-1252: os bytes originais continuam recuperáveis
}

function criarLeitor(readable, prazo, maxBytes) {
  const leitor = readable.getReader();
  let buf = "";
  let total = 0;
  async function puxar() {
    const r = await Promise.race([leitor.read(), prazo]);
    if (r.done) throw new ErroP2("resposta_inesperada");
    total += r.value.byteLength;
    if (total > maxBytes) throw new ErroP2("resposta_grande_demais");
    buf += latin1(r.value);
  }
  return {
    async linha() {
      for (;;) {
        const i = buf.indexOf("\r\n");
        if (i >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); return l; }
        await puxar();
      }
    },
    async bytes(n) {
      while (buf.length < n) await puxar();
      const t = buf.slice(0, n);
      buf = buf.slice(n);
      return t;
    },
    liberar() { try { leitor.releaseLock(); } catch (_) { /* já liberado */ } },
  };
}

// Envia UM comando e lê a resposta até a linha etiquetada. Devolve { status, resto, soltas } com `soltas` = linhas lógicas { texto, literais }:
// cada literal do servidor vira o marcador \u0001<índice>\u0001 no texto e o conteúdo fica em `literais` (limite por literal: `maxLiteral`).
async function executarComando(ctx, verbo, args, maxLiteral) {
  if (!comandoPermitido(verbo, args || "", ctx.pasta)) throw new ErroP2("comando_nao_permitido");
  ctx.n += 1;
  const tag = "a" + ctx.n;
  await Promise.race([ctx.escritor.write(ctx.codificador.encode(tag + " " + verbo + (args || "") + "\r\n")), ctx.prazo]);
  const soltas = [];
  for (;;) {
    let l = await ctx.leitor.linha();
    if (l.includes("\u0001")) throw new ErroP2("resposta_malformada");
    const literais = [];
    let lit = /\{(\d{1,7})\}$/.exec(l);
    while (lit) {
      const n = Number(lit[1]);
      if (n > maxLiteral) throw new ErroP2("resposta_grande_demais");
      if (literais.length >= 32) throw new ErroP2("limite_excedido");
      const conteudo = await ctx.leitor.bytes(n);
      const resto = await ctx.leitor.linha();
      if (resto.includes("\u0001")) throw new ErroP2("resposta_malformada");
      l = l.slice(0, lit.index) + "\u0001" + literais.length + "\u0001" + resto;
      literais.push(conteudo);
      lit = /\{(\d{1,7})\}$/.exec(l);
    }
    if (l.length > ctx.maxLinha) throw new ErroP2("resposta_grande_demais"); // linha lógica (literais já fora): a estrutura MIME tem tamanho máximo
    if (l.startsWith(tag + " ")) {
      const depois = l.slice(tag.length + 1);
      return { status: depois.split(" ")[0].toUpperCase(), resto: depois, soltas };
    }
    if (l.startsWith("* ")) {
      soltas.push({ texto: l, literais });
      if (soltas.length > ctx.maxLinhas) throw new ErroP2("limite_excedido");
      continue;
    }
    throw new ErroP2("resposta_inesperada"); // inclui "+" (o servidor pedindo literal, que nunca enviamos) e linhas fora de ordem
  }
}

function capabilities(soltas) {
  const tokens = [];
  for (const s of soltas) {
    const m = /^\* CAPABILITY (.*)$/i.exec(s.texto);
    if (m) for (const t of m[1].split(" ")) if (t) tokens.push(t.toLowerCase());
  }
  return tokens;
}

// a pasta existe e pode ser aberta? Compara o nome só com a constante da política (nenhum nome sai daqui)
function pastaListada(soltas, pasta) {
  let achou = false;
  let abrivel = false;
  for (const s of soltas) {
    const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.*)$/i.exec(s.texto);
    if (!m) continue;
    const nome = m[2].startsWith('"') ? m[2].slice(1, m[2].lastIndexOf('"')) : m[2];
    if (nome !== pasta) continue;
    achou = true;
    const attrs = m[1].toLowerCase().split(" ").filter(Boolean);
    abrivel = !(attrs.includes("\\noselect") || attrs.includes("\\nonexistent"));
  }
  return { achou, abrivel };
}

// FETCH · LEITURA e CORRELAÇÃO das respostas de UM comando. Duas etapas, ambas deterministas e com limites:
//  1) lerRespostasFetch: cada "* n FETCH (...)" vira uma lista de itens { tipo, id, valor } NA ORDEM em que chegou (nada é sobrescrito aqui);
//  2) consolidarFetch: junta as respostas da MESMA mensagem (o UID pedido) item a item.
// Regras (RFC 3501, 7.4.2: o servidor PODE repartir os dados de uma mensagem em várias respostas FETCH e PODE enviar FETCH não solicitado, por
// exemplo atualização de FLAGS por outro cliente):
//  - Item de METADADO (FLAGS, MODSEQ e afins) nunca é guardado nem devolvido: uma resposta só com metadados não é dado da mensagem e é tolerada,
//    seja de outra mensagem ou da mesma. Nada além disso é descartado em silêncio.
//  - Toda resposta que traga dado (UID, tamanho, estrutura, cabeçalho ou parte) PRECISA trazer o próprio UID (o UID FETCH o inclui em cada resposta) e
//    ele PRECISA ser o UID pedido: dado sem UID, ou de outro UID, é resposta_inesperada (não se associa por sequência nem por ordem).
//  - Item repetido (na mesma resposta ou em respostas diferentes): valor IDÊNTICO é aceito como idempotente; valor DIFERENTE é resposta_conflitante.
//    Nunca há sobrescrita.
//  - Só os itens pedidos podem aparecer: seção não pedida, origem diferente de <0>, RFC822.*, ENVELOPE, BINARY etc. são resposta_inesperada.
//  - No máximo `maxRespostasFetch` respostas com dado por comando (o total de linhas e de bytes já é limitado pelo leitor).
// itens que CARREGAM conteúdo e que nunca pedimos (por prefixo: BODY..., RFC..., BINARY..., ENVELOPE, INTERNALDATE, PREVIEW); o que não começa assim é metadado
const ITENS_DE_CONTEUDO = /^(?:BODY|RFC|BINARY|ENVELOPE|INTERNALDATE|PREVIEW)/i;
function classificarItemFetch(chave) {
  const k = chave.toUpperCase();
  if (k === "UID") return { tipo: "uid" };
  if (k === "RFC822.SIZE") return { tipo: "tamanho" };
  if (k === "BODYSTRUCTURE") return { tipo: "estrutura" };
  const sec = /^BODY\[(.*)\](?:<(\d+)>)?$/i.exec(chave);
  if (sec) {
    if (sec[2] !== undefined && Number(sec[2]) !== 0) return { tipo: "invalido" }; // só pedimos a partir do byte 0
    const nome = sec[1].toUpperCase();
    if (nome.startsWith("HEADER.FIELDS")) return { tipo: "cabecalho" };
    if (/^\d+(?:\.\d+)*$/.test(nome)) return { tipo: "parte", id: nome };
    return { tipo: "invalido" };
  }
  if (ITENS_DE_CONTEUDO.test(chave)) return { tipo: "invalido" }; // item que carrega conteúdo e que nunca pedimos
  return { tipo: "metadado" };
}

function lerRespostasFetch(soltas, lim) {
  const saida = [];
  for (const s of soltas) {
    const m = /^\* \d{1,10} FETCH (.*)$/i.exec(s.texto);
    if (!m) continue;
    const arvore = lerSexp(m[1], s.literais, { maxItens: lim.maxItensSexp, maxProfundidade: lim.maxProfundidade + 4 });
    if (arvore.length !== 1 || !Array.isArray(arvore[0]) || arvore[0].length % 2 !== 0) throw new ErroMime("resposta_malformada");
    const lista = arvore[0];
    const itens = [];
    for (let i = 0; i < lista.length; i += 2) {
      if (typeof lista[i] !== "string") throw new ErroMime("resposta_malformada");
      itens.push({ ...classificarItemFetch(lista[i]), valor: lista[i + 1] });
    }
    saida.push(itens);
  }
  return saida;
}

const iguais = (a, b) => (typeof a === "object" && a !== null ? JSON.stringify(a) === JSON.stringify(b) : a === b);
function mesclar(destino, campo, valor) {
  if (destino[campo] === undefined) destino[campo] = valor;
  else if (!iguais(destino[campo], valor)) throw new ErroP2("resposta_conflitante");
}

// `alvo`: o UID pedido, ou null quando o próprio comando serve para DESCOBRIR o UID (FETCH * (UID)); nesse caso todas as respostas com dado têm de
// concordar em UM único UID. `permitidos`: { estrutura, cabecalho, partes: Set } do que o comando pediu. Devolve { respostas, uid, tamanho, estrutura,
// cabecalho, partes } (campos não recebidos ficam undefined; `respostas` = quantas respostas traziam dado da mensagem).
function consolidarFetch(respostas, { alvo, permitidos, lim }) {
  const r = { respostas: 0, uid: undefined, tamanho: undefined, estrutura: undefined, cabecalho: undefined, partes: {} };
  for (const itens of respostas) {
    const naoMeta = itens.filter((i) => i.tipo !== "metadado");
    if (naoMeta.length === 0) continue; // só metadados (ex.: FLAGS de uma atualização não solicitada)
    let uidDaResposta;
    for (const i of naoMeta) {
      if (i.tipo !== "uid") continue;
      if (!Number.isSafeInteger(i.valor) || i.valor < 1 || i.valor > UID_MAX) throw new ErroP2("resposta_malformada");
      if (uidDaResposta !== undefined && uidDaResposta !== i.valor) throw new ErroP2("resposta_conflitante");
      uidDaResposta = i.valor;
    }
    const dados = naoMeta.filter((i) => i.tipo !== "uid"); // dado da mensagem: tamanho, estrutura, cabeçalho, parte (ou item inválido)
    if (alvo !== null) {
      // o UID sozinho (com ou sem metadados) só identifica a mensagem: de outra mensagem é tolerado, nunca associado
      if (uidDaResposta !== alvo) {
        if (dados.length > 0) throw new ErroP2("resposta_inesperada"); // dado sem UID ou de outro UID: não se associa por ordem nem por sequência
        continue;
      }
    } else {
      // descoberta do UID: toda resposta com UID conta, e todas precisam concordar em UM único UID
      if (dados.length > 0 || uidDaResposta === undefined) throw new ErroP2("resposta_inesperada");
      if (r.uid !== undefined && r.uid !== uidDaResposta) throw new ErroP2("resposta_inesperada");
    }
    r.respostas += 1;
    if (r.respostas > lim.maxRespostasFetch) throw new ErroP2("limite_excedido");
    mesclar(r, "uid", uidDaResposta);
    for (const i of dados) {
      if (i.tipo === "invalido") throw new ErroP2("resposta_inesperada");
      if (i.tipo === "tamanho") { if (!permitidos.estrutura) throw new ErroP2("resposta_inesperada"); mesclar(r, "tamanho", i.valor); }
      else if (i.tipo === "estrutura") { if (!permitidos.estrutura) throw new ErroP2("resposta_inesperada"); mesclar(r, "estrutura", i.valor); }
      else if (i.tipo === "cabecalho") { if (!permitidos.cabecalho) throw new ErroP2("resposta_inesperada"); mesclar(r, "cabecalho", i.valor === null ? "" : i.valor); }
      else if (i.tipo === "parte") { if (!permitidos.partes.has(i.id)) throw new ErroP2("resposta_inesperada"); mesclar(r.partes, i.id, i.valor === null ? "" : i.valor); }
    }
  }
  return r;
}

const SEM_PERMISSAO = Object.freeze({ estrutura: false, cabecalho: false, partes: new Set() });

const inteiroAte = (v, max) => (Number.isSafeInteger(v) && v >= 0 ? Math.min(v, max) : 0);

function parteVazia() {
  return { presente: false, status: "nao_presente", tamanho_bytes: 0, bytes_lidos: 0, truncado: false, charset: null, caracteres: 0, linhas: 0, caracteres_invalidos: false };
}

// lê UMA parte de texto (texto puro ou HTML): decodifica, calcula indicadores e descarta o texto
function resumirTexto(parte, bruto, limite, ehHtml) {
  const r = parteVazia();
  r.presente = true;
  r.tamanho_bytes = parte.tamanho;
  if (parte.tamanho === 0) { r.status = "vazio"; return r; }
  if (typeof bruto !== "string") { r.status = "nao_lido"; return r; }
  if (bruto.length > limite) throw new ErroP2("resposta_grande_demais");
  r.bytes_lidos = bruto.length;
  r.truncado = bruto.length < parte.tamanho;
  let bytes;
  try { bytes = decodificarTransferencia(bruto, parte.codificacao, r.truncado); } catch (e) {
    if (e instanceof ErroMime && (e.codigo === "codificacao_invalida" || e.codigo === "codificacao_desconhecida")) { r.status = e.codigo; return r; }
    throw e;
  }
  const dec = decodificarTexto(bytes, parte.charset, r.truncado);
  if (!dec) { r.status = "charset_nao_suportado"; return r; }
  r.charset = dec.charset;
  Object.assign(r, estatisticasTexto(dec.texto));
  if (ehHtml) Object.assign(r, indicadoresHtml(dec.texto));
  r.status = r.truncado ? "truncado" : "lido";
  return r;
}

function novoResultado() {
  return { ok: false, estagio: "inicio", erro: null, autenticado: false, logout: false, pasta_teste_existe: null, somente_leitura: null, mensagens_na_pasta: null, mensagem: null };
}

// Executa a P2. `abrir(host, porta)` devolve o socket TLS já aberto ({ readable, writable, close }). `uid` (opcional): o UID a ler; sem ele, a última
// mensagem da pasta de teste. Nunca lança: devolve sempre um resultado.
export async function executarP2({ abrir, usuario, senha, uid = null, politica = POLITICA }) {
  const imap = politica.imap;
  const cfg = politica.p2;
  const r = novoResultado();
  let socket = null;
  let ctx = null;
  let temporizador;
  const prazo = new Promise((_, rejeita) => { temporizador = setTimeout(() => rejeita(new ErroP2("timeout")), cfg.timeoutMs); });
  prazo.catch(() => {});
  try {
    if (typeof usuario !== "string" || typeof senha !== "string" || !SEGURO_PARA_COMANDO.test(usuario) || !SEGURO_PARA_COMANDO.test(senha)) throw new ErroP2("comando_nao_permitido");
    if (typeof cfg.pasta !== "string" || !NOME_PASTA.test(cfg.pasta)) throw new ErroP2("comando_nao_permitido");
    if (uid !== null && !(Number.isSafeInteger(uid) && uid >= 1 && uid <= UID_MAX)) throw new ErroP2("uid_invalido");

    r.estagio = "conexao";
    try { socket = await Promise.race([abrir(imap.host, imap.porta), prazo]); } catch (e) { throw e instanceof ErroP2 ? e : new ErroP2("conexao_falhou"); }
    ctx = { n: 0, prazo, pasta: cfg.pasta, maxLinhas: cfg.maxLinhas, maxLinha: cfg.maxEstruturaBytes, codificador: new TextEncoder(), escritor: socket.writable.getWriter(), leitor: criarLeitor(socket.readable, prazo, cfg.maxBytes) };

    r.estagio = "saudacao";
    if (!/^\* OK( |$)/i.test(await ctx.leitor.linha())) throw new ErroP2("saudacao_invalida");

    r.estagio = "capability_pre";
    const pre = await executarComando(ctx, "CAPABILITY", "", 1024);
    if (pre.status !== "OK") throw new ErroP2("capability_falhou");
    if (capabilities(pre.soltas).includes("logindisabled")) throw new ErroP2("login_desabilitado"); // a credencial nem chega a ser enviada

    r.estagio = "login"; // UMA única tentativa, sem repetição
    const login = await executarComando(ctx, "LOGIN", ' "' + usuario + '" "' + senha + '"', 1024);
    if (login.status === "NO") throw new ErroP2("autenticacao_recusada");
    if (login.status !== "OK") throw new ErroP2("login_erro_protocolo");
    r.autenticado = true;

    r.estagio = "pasta_localizar"; // só a pasta de teste; nenhum outro nome é pedido nem devolvido
    const lista = await executarComando(ctx, "LIST", ' "" "' + cfg.pasta + '"', 1024);
    if (lista.status !== "OK") throw new ErroP2("pasta_erro");
    const achada = pastaListada(lista.soltas, cfg.pasta);
    r.pasta_teste_existe = achada.achou;
    if (!achada.achou || !achada.abrivel) throw new ErroP2("pasta_inexistente");

    r.estagio = "pasta_examinar"; // EXAMINE = somente leitura, por definição do protocolo
    const exame = await executarComando(ctx, "EXAMINE", ' "' + cfg.pasta + '"', 1024);
    if (exame.status !== "OK") throw new ErroP2("examine_recusado");
    r.somente_leitura = /\[READ-ONLY\]/i.test(exame.resto);
    let existentes = null;
    for (const s of exame.soltas) { const m = /^\* (\d{1,10}) EXISTS$/i.exec(s.texto); if (m) existentes = Number(m[1]); }
    if (existentes === null) throw new ErroP2("resposta_malformada");
    r.mensagens_na_pasta = existentes;
    if (existentes === 0) throw new ErroP2("pasta_vazia");

    r.estagio = "mensagem_localizar"; // uma única mensagem: o UID pedido ou, sem ele, a última da pasta
    let alvo = uid;
    if (alvo === null) {
      const ultima = await executarComando(ctx, "FETCH", " * (UID)", 1024);
      if (ultima.status !== "OK") throw new ErroP2("mensagem_erro");
      const achada = consolidarFetch(lerRespostasFetch(ultima.soltas, cfg), { alvo: null, permitidos: SEM_PERMISSAO, lim: cfg });
      if (achada.respostas === 0 || !Number.isSafeInteger(achada.uid)) throw new ErroP2("resposta_inesperada");
      alvo = achada.uid;
    }

    r.estagio = "mensagem_estrutura";
    const est = await executarComando(ctx, "UID", " FETCH " + alvo + " (" + ITENS_ESTRUTURA + ")", 4096);
    if (est.status !== "OK") throw new ErroP2("mensagem_erro");
    const dEst = consolidarFetch(lerRespostasFetch(est.soltas, cfg), { alvo, permitidos: { estrutura: true, cabecalho: false, partes: new Set() }, lim: cfg });
    if (dEst.respostas === 0) throw new ErroP2("uid_inexistente");
    if (dEst.uid !== alvo || !Number.isSafeInteger(dEst.tamanho) || !Array.isArray(dEst.estrutura)) throw new ErroP2("resposta_inesperada");
    const estrutura = analisarEstrutura(dEst.estrutura, cfg);
    const cls = classificarPartes(estrutura.partes);
    const m = {
      tamanho_bytes: inteiroAte(dEst.tamanho, UID_MAX), multipart: estrutura.multipart, multipart_subtipo: estrutura.multipart ? (SUBTIPOS_MULTIPART.includes(estrutura.subtipoRaiz) ? estrutura.subtipoRaiz : "outro") : null,
      partes: estrutura.partes.length, profundidade: estrutura.profundidade,
      cabecalhos: { lidos: false }, texto_puro: parteVazia(), html: parteVazia(),
      anexos: { total: cls.anexos.length, inline: 0, bytes_total: 0, maior_bytes: 0, categorias: {} },
      anexo_lido: { tentado: false, status: "nao_presente", tamanho_codificado: 0, bytes_decodificados: 0, tipo_detectado: null, tipo_confere: null },
    };
    for (const c of CATEGORIAS_ANEXO) m.anexos.categorias[c] = 0;
    for (const a of cls.anexos) {
      if (cls.inline(a)) m.anexos.inline += 1;
      m.anexos.categorias[categoriaDe(a.tipo, a.subtipo)] += 1;
      m.anexos.bytes_total += a.tamanho;
      if (a.tamanho > m.anexos.maior_bytes) m.anexos.maior_bytes = a.tamanho;
    }
    r.mensagem = m;

    // quais partes ler: cabeçalhos sempre; texto puro e HTML (parcial, com limite); o primeiro anexo que couber no limite (comuns antes dos embutidos)
    const candidatos = [...cls.anexos.filter((a) => !cls.inline(a)), ...cls.anexos.filter((a) => cls.inline(a))];
    const anexo = candidatos.find((a) => a.tamanho > 0 && a.tamanho <= cfg.maxAnexoBytes) || null;
    m.anexo_lido.status = cls.anexos.length === 0 ? "nao_presente" : (anexo ? "nao_lido" : "grande_demais");
    const pedidos = [["BODY.PEEK[HEADER.FIELDS (" + CAMPOS_CABECALHO + ")]<0." + cfg.maxCabecalhoBytes + ">", cfg.maxCabecalhoBytes]];
    const quer = (p, limite) => { if (p && p.tamanho > 0) pedidos.push(["BODY.PEEK[" + p.caminho + "]<0." + limite + ">", limite]); };
    quer(cls.texto, cfg.maxTextoBytes);
    quer(cls.html, cfg.maxHtmlBytes);
    if (anexo) pedidos.push(["BODY.PEEK[" + anexo.caminho + "]<0." + cfg.maxAnexoBytes + ">", cfg.maxAnexoBytes]);

    r.estagio = "mensagem_conteudo";
    const maiorLimite = Math.max(...pedidos.map((p) => p[1]));
    const cont = await executarComando(ctx, "UID", " FETCH " + alvo + " (" + pedidos.map((p) => p[0]).join(" ") + ")", maiorLimite);
    if (cont.status !== "OK") throw new ErroP2("conteudo_falhou");
    const dados = consolidarFetch(lerRespostasFetch(cont.soltas, cfg), { alvo, permitidos: { estrutura: false, cabecalho: true, partes: new Set(pedidos.slice(1).map((p) => /^BODY\.PEEK\[([\d.]+)\]/.exec(p[0])[1])) }, lim: cfg });
    if (dados.respostas === 0) throw new ErroP2("resposta_inesperada");

    if (typeof dados.cabecalho !== "string") throw new ErroP2("mime_invalido");
    if (dados.cabecalho.length > cfg.maxCabecalhoBytes) throw new ErroP2("resposta_grande_demais");
    m.cabecalhos = analisarCabecalhos(dados.cabecalho, dados.cabecalho.length >= cfg.maxCabecalhoBytes);
    if (cls.texto) m.texto_puro = resumirTexto(cls.texto, dados.partes[cls.texto.caminho], cfg.maxTextoBytes, false);
    if (cls.html) m.html = resumirTexto(cls.html, dados.partes[cls.html.caminho], cfg.maxHtmlBytes, true);
    if (anexo) {
      const bruto = dados.partes[anexo.caminho];
      const a = m.anexo_lido;
      a.tentado = true;
      a.tamanho_codificado = anexo.tamanho;
      if (typeof bruto !== "string") a.status = "nao_lido";
      else {
        if (bruto.length > cfg.maxAnexoBytes) throw new ErroP2("resposta_grande_demais");
        try {
          const bytes = decodificarTransferencia(bruto, anexo.codificacao, bruto.length < anexo.tamanho);
          a.bytes_decodificados = bytes.length;
          a.tipo_detectado = detectarTipo(bytes);
          a.tipo_confere = tipoConfere(a.tipo_detectado, anexo.tipo, anexo.subtipo);
          a.status = bruto.length < anexo.tamanho ? "truncado" : "lido";
        } catch (e) {
          if (e instanceof ErroMime && (e.codigo === "codificacao_invalida" || e.codigo === "codificacao_desconhecida")) a.status = e.codigo; else throw e;
        }
      }
    }
  } catch (e) {
    if (e instanceof ErroP2 && ERROS_P2.includes(e.codigo)) r.erro = e.codigo;
    else if (e instanceof ErroMime && ERROS_P2.includes(e.codigo)) r.erro = e.codigo;
    else r.erro = "falha_inesperada";
  }
  // encerramento educado, mesmo depois de uma falha (menos quando a conexão já não existe ou o tempo acabou)
  if (ctx && r.erro !== "timeout" && r.erro !== "conexao_falhou" && r.erro !== "resposta_inesperada" && r.erro !== "resposta_malformada" && r.erro !== "comando_nao_permitido") {
    try {
      if (r.erro === null) r.estagio = "logout";
      const fim = await executarComando(ctx, "LOGOUT", "", 1024);
      r.logout = fim.status === "OK";
    } catch (_) { r.logout = false; }
  }
  if (r.erro === null && r.autenticado && r.mensagem && r.mensagem.cabecalhos.lidos) { r.ok = true; r.estagio = "concluido"; }
  clearTimeout(temporizador);
  if (ctx) ctx.leitor.liberar();
  if (socket) { try { await socket.close(); } catch (_) { /* já fechado */ } }
  return r;
}

// ---------- esquema FECHADO da resposta ao cliente ----------
// Copia só campos conhecidos e do tipo certo; qualquer outra coisa do resultado é descartada. Nenhum texto vindo do servidor passa por aqui.
const bool = (v) => v === true;
const boolOuNulo = (v) => (v === true ? true : v === false ? false : null);
const emLista = (lista, v, padrao) => (lista.includes(v) ? v : padrao);

function montarParte(p, html) {
  const x = p && typeof p === "object" ? p : {};
  const s = {
    presente: bool(x.presente), status: emLista(STATUS_PARTE, x.status, "nao_presente"), tamanho_bytes: inteiroAte(x.tamanho_bytes, UID_MAX), bytes_lidos: inteiroAte(x.bytes_lidos, UID_MAX),
    truncado: bool(x.truncado), charset: emLista(NOMES_CHARSET, x.charset, null), caracteres: inteiroAte(x.caracteres, UID_MAX), linhas: inteiroAte(x.linhas, UID_MAX),
    caracteres_invalidos: bool(x.caracteres_invalidos),
  };
  if (html) { s.tem_script = bool(x.tem_script); s.tem_imagem_remota = bool(x.tem_imagem_remota); s.tem_formulario = bool(x.tem_formulario); s.tem_iframe = bool(x.tem_iframe); }
  return s;
}

function montarMensagem(m) {
  const c = m.cabecalhos && typeof m.cabecalhos === "object" ? m.cabecalhos : {};
  const an = m.anexos && typeof m.anexos === "object" ? m.anexos : {};
  const cat = an.categorias && typeof an.categorias === "object" ? an.categorias : {};
  const al = m.anexo_lido && typeof m.anexo_lido === "object" ? m.anexo_lido : {};
  const categorias = {};
  for (const k of CATEGORIAS_ANEXO) categorias[k] = inteiroAte(cat[k], 1000);
  return {
    tamanho_bytes: inteiroAte(m.tamanho_bytes, UID_MAX), multipart: bool(m.multipart), multipart_subtipo: emLista(SUBTIPOS_MULTIPART, m.multipart_subtipo, null),
    partes: inteiroAte(m.partes, 1000), profundidade: inteiroAte(m.profundidade, 100),
    cabecalhos: {
      lidos: bool(c.lidos), bytes: inteiroAte(c.bytes, UID_MAX), truncado: bool(c.truncado), campos: inteiroAte(c.campos, 1000), linhas_invalidas: inteiroAte(c.linhas_invalidas, 1000),
      from: bool(c.from), to: bool(c.to), cc: bool(c.cc), assunto: bool(c.assunto), data: bool(c.data), data_valida: bool(c.data_valida), message_id: bool(c.message_id),
      mime_version: bool(c.mime_version), assunto_codificado: bool(c.assunto_codificado),
    },
    texto_puro: montarParte(m.texto_puro, false),
    html: montarParte(m.html, true),
    anexos: { total: inteiroAte(an.total, 1000), inline: inteiroAte(an.inline, 1000), bytes_total: inteiroAte(an.bytes_total, UID_MAX), maior_bytes: inteiroAte(an.maior_bytes, UID_MAX), categorias },
    anexo_lido: {
      tentado: bool(al.tentado), status: emLista(STATUS_PARTE, al.status, "nao_presente"), tamanho_codificado: inteiroAte(al.tamanho_codificado, UID_MAX),
      bytes_decodificados: inteiroAte(al.bytes_decodificados, UID_MAX), tipo_detectado: emLista(TIPOS_DETECTADOS, al.tipo_detectado, null), tipo_confere: boolOuNulo(al.tipo_confere),
    },
  };
}

export function montarRespostaP2(r) {
  const saida = {
    ok: !!r && r.ok === true,
    operacao: "p2_imap",
    estagio: r && ESTAGIOS_P2.includes(r.estagio) ? r.estagio : "inicio",
    autenticado: !!r && bool(r.autenticado),
    logout: !!r && bool(r.logout),
  };
  if (r && (r.pasta_teste_existe === true || r.pasta_teste_existe === false)) saida.pasta_teste_existe = r.pasta_teste_existe;
  if (r && (r.somente_leitura === true || r.somente_leitura === false)) saida.somente_leitura_confirmado = r.somente_leitura;
  if (r && r.mensagens_na_pasta !== null && r.mensagens_na_pasta !== undefined) saida.mensagens_na_pasta = inteiroAte(r.mensagens_na_pasta, UID_MAX);
  if (r && r.mensagem && typeof r.mensagem === "object") saida.mensagem = montarMensagem(r.mensagem);
  if (!saida.ok) saida.erro = r && ERROS_P2.includes(r.erro) ? r.erro : "falha_inesperada";
  return saida;
}
