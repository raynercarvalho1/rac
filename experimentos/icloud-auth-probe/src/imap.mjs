// P1 · autenticação IMAP no iCloud, SOMENTE LEITURA da estrutura técnica. Nada de mensagens, nada de alteração.
// Comandos enviados (lista fechada, conferida em código e em teste): CAPABILITY, LOGIN, LIST e LOGOUT. Uma única tentativa de login por chamada.
// A resposta usa esquema fechado: só booleanos, contagens, o estágio alcançado e um código de erro de lista fechada. Nomes de pastas, endereços,
// texto do servidor e a credencial NUNCA saem daqui (a pasta de teste vira só um booleano). A credencial vive só em variáveis locais da chamada.
import { POLITICA } from "./politica.mjs";

export class ErroImap extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

export const ESTAGIOS_P1 = Object.freeze(["inicio", "conexao", "saudacao", "capability_pre", "login", "capability_pos", "listagem", "logout", "concluido"]);
export const ERROS_P1 = Object.freeze([
  "conexao_falhou", "timeout", "saudacao_invalida", "capability_falhou", "login_desabilitado", "autenticacao_recusada", "login_erro_protocolo",
  "listagem_falhou", "resposta_inesperada", "resposta_grande_demais", "limite_excedido", "comando_nao_permitido", "falha_inesperada",
]);

// ÚNICOS verbos que este módulo pode enviar. Qualquer outro derruba a chamada antes de escrever no socket.
const VERBOS_PERMITIDOS = Object.freeze(["CAPABILITY", "LOGIN", "LIST", "LOGOUT"]);

// capacidades técnicas reportadas (nome no servidor, em minúsculas -> campo da resposta). Qualquer outra só entra na contagem total.
const CAPACIDADES = Object.freeze([
  ["imap4rev1", "imap4rev1"], ["imap4rev2", "imap4rev2"], ["idle", "idle"], ["condstore", "condstore"], ["qresync", "qresync"], ["uidplus", "uidplus"],
  ["move", "move"], ["special-use", "special_use"], ["namespace", "namespace"], ["enable", "enable"], ["children", "children"], ["list-extended", "list_extended"],
  ["list-status", "list_status"], ["literal+", "literal_mais"], ["unselect", "unselect"], ["id", "id"], ["sort", "sort"], ["auth=plain", "auth_plain"],
  ["auth=xoauth2", "auth_xoauth2"], ["logindisabled", "login_desabilitado"], ["starttls", "starttls"],
]);
const USO_ESPECIAL = Object.freeze({
  "\\sent": "enviados", "\\drafts": "rascunhos", "\\trash": "lixeira", "\\junk": "spam", "\\archive": "arquivo", "\\all": "todas", "\\flagged": "sinalizadas", "\\important": "importantes",
});
const SEGURO_PARA_COMANDO = /^[^"\\\r\n\u0000]+$/;

function linhasDeCapability(soltas) {
  const tokens = [];
  for (const l of soltas) {
    const m = /^\* CAPABILITY (.*)$/i.exec(l);
    if (m) for (const t of m[1].split(" ")) if (t) tokens.push(t.toLowerCase());
  }
  return tokens;
}

function montarCapabilities(tokens) {
  const saida = { total: tokens.length };
  for (const [nome, campo] of CAPACIDADES) saida[campo] = tokens.includes(nome);
  return saida;
}

// LIST: só atributos e contagens; o nome da pasta é comparado com a pasta de teste e descartado
function resumirPastas(soltas, pastaTeste) {
  const pastas = { total: 0, nao_selecionaveis: 0, com_filhos: 0, uso_especial: {} };
  for (const campo of Object.values(USO_ESPECIAL)) pastas.uso_especial[campo] = 0;
  let pastaTesteExiste = false;
  for (const l of soltas) {
    const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) ?(.*)$/i.exec(l);
    if (!m) continue;
    pastas.total += 1;
    const attrs = m[1].toLowerCase().split(" ").filter(Boolean);
    if (attrs.includes("\\noselect") || attrs.includes("\\nonexistent")) pastas.nao_selecionaveis += 1;
    if (attrs.includes("\\haschildren")) pastas.com_filhos += 1;
    for (const a of attrs) if (USO_ESPECIAL[a]) pastas.uso_especial[USO_ESPECIAL[a]] += 1;
    const nome = m[2].startsWith('"') ? m[2].slice(1, m[2].lastIndexOf('"')) : m[2];
    if (nome === pastaTeste) pastaTesteExiste = true;
  }
  return { pastas, pastaTesteExiste };
}

function criarLeitor(readable, prazo, maxBytes) {
  const leitor = readable.getReader();
  const decodificador = new TextDecoder("latin1"); // 1 byte = 1 caractere: contagem de literais sempre confiável
  let buf = "";
  let total = 0;
  async function puxar() {
    const r = await Promise.race([leitor.read(), prazo]);
    if (r.done) throw new ErroImap("resposta_inesperada");
    total += r.value.byteLength;
    if (total > maxBytes) throw new ErroImap("resposta_grande_demais");
    buf += decodificador.decode(r.value, { stream: true });
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
      buf = buf.slice(n);
    },
    liberar() { try { leitor.releaseLock(); } catch (_) { /* já liberado */ } },
  };
}

async function executarComando(ctx, verbo, args) {
  if (!VERBOS_PERMITIDOS.includes(verbo)) throw new ErroImap("comando_nao_permitido");
  ctx.n += 1;
  const tag = "a" + ctx.n;
  await Promise.race([ctx.escritor.write(ctx.codificador.encode(tag + " " + verbo + (args || "") + "\r\n")), ctx.prazo]);
  const soltas = [];
  for (;;) {
    let l = await ctx.leitor.linha();
    let lit = /\{(\d{1,6})\}$/.exec(l);
    while (lit) { // literal do servidor (ex.: nome de pasta com caracteres especiais): consome os bytes e a continuação da linha, sem guardar nada
      const n = Number(lit[1]);
      if (n > 8192) throw new ErroImap("resposta_grande_demais");
      await ctx.leitor.bytes(n);
      l = l.slice(0, lit.index) + "\u0000" + (await ctx.leitor.linha());
      lit = /\{(\d{1,6})\}$/.exec(l);
    }
    if (l.startsWith(tag + " ")) return { status: l.slice(tag.length + 1).split(" ")[0].toUpperCase(), soltas };
    if (l.startsWith("* ")) {
      soltas.push(l);
      if (soltas.length > ctx.maxLinhas) throw new ErroImap("limite_excedido");
      continue;
    }
    throw new ErroImap("resposta_inesperada"); // inclui "+" (o servidor pedindo literal, que nunca enviamos) e linhas fora de ordem
  }
}

// Executa a P1. `abrir(host, porta)` devolve o socket TLS já aberto ({ readable, writable, close }). Nunca lança: devolve sempre um resultado.
export async function executarP1({ abrir, usuario, senha, politica = POLITICA }) {
  const cfg = politica.imap;
  const r = { ok: false, estagio: "inicio", erro: null, autenticado: false, logout: false, capabilities: null, pastas: null, pasta_teste_existe: null };
  let socket = null;
  let ctx = null;
  let temporizador;
  const prazo = new Promise((_, rejeita) => { temporizador = setTimeout(() => rejeita(new ErroImap("timeout")), cfg.timeoutMs); });
  prazo.catch(() => {});
  try {
    if (typeof usuario !== "string" || typeof senha !== "string" || !SEGURO_PARA_COMANDO.test(usuario) || !SEGURO_PARA_COMANDO.test(senha)) throw new ErroImap("comando_nao_permitido");

    r.estagio = "conexao";
    try { socket = await Promise.race([abrir(cfg.host, cfg.porta), prazo]); } catch (e) { throw e instanceof ErroImap ? e : new ErroImap("conexao_falhou"); }
    ctx = { n: 0, prazo, maxLinhas: cfg.maxLinhas, codificador: new TextEncoder(), escritor: socket.writable.getWriter(), leitor: criarLeitor(socket.readable, prazo, cfg.maxBytes) };

    r.estagio = "saudacao";
    if (!/^\* OK( |$)/i.test(await ctx.leitor.linha())) throw new ErroImap("saudacao_invalida");

    r.estagio = "capability_pre";
    const pre = await executarComando(ctx, "CAPABILITY");
    if (pre.status !== "OK") throw new ErroImap("capability_falhou");
    if (linhasDeCapability(pre.soltas).includes("logindisabled")) throw new ErroImap("login_desabilitado"); // a credencial nem chega a ser enviada

    r.estagio = "login"; // UMA única tentativa, sem repetição
    const login = await executarComando(ctx, "LOGIN", ' "' + usuario + '" "' + senha + '"');
    if (login.status === "NO") throw new ErroImap("autenticacao_recusada");
    if (login.status !== "OK") throw new ErroImap("login_erro_protocolo");
    r.autenticado = true;

    r.estagio = "capability_pos";
    const pos = await executarComando(ctx, "CAPABILITY");
    if (pos.status !== "OK") throw new ErroImap("capability_falhou");
    r.capabilities = montarCapabilities(linhasDeCapability(pos.soltas));

    r.estagio = "listagem";
    const lista = await executarComando(ctx, "LIST", ' "" "*"');
    if (lista.status !== "OK") throw new ErroImap("listagem_falhou");
    const resumo = resumirPastas(lista.soltas, cfg.pastaTeste);
    r.pastas = resumo.pastas;
    r.pasta_teste_existe = resumo.pastaTesteExiste;
  } catch (e) {
    r.erro = e instanceof ErroImap && ERROS_P1.includes(e.codigo) ? e.codigo : "falha_inesperada";
  }
  // encerramento educado, mesmo depois de uma falha (menos quando a conexão já não existe ou o tempo acabou)
  if (ctx && r.erro !== "timeout" && r.erro !== "conexao_falhou" && r.erro !== "resposta_inesperada" && r.erro !== "comando_nao_permitido") {
    try {
      if (r.erro === null) r.estagio = "logout";
      const fim = await executarComando(ctx, "LOGOUT");
      r.logout = fim.status === "OK";
    } catch (_) { r.logout = false; }
  }
  if (r.erro === null && r.autenticado && r.pastas) { r.ok = true; r.estagio = "concluido"; }
  clearTimeout(temporizador);
  if (ctx) ctx.leitor.liberar();
  if (socket) { try { await socket.close(); } catch (_) { /* já fechado */ } }
  return r;
}

// Esquema FECHADO da resposta ao cliente: copia só campos conhecidos e do tipo certo; qualquer outra coisa do resultado é descartada.
const bool = (v) => v === true;
const inteiro = (v) => (Number.isSafeInteger(v) && v >= 0 && v <= 100000 ? v : 0);
export function montarRespostaP1(r) {
  const saida = {
    ok: !!r && r.ok === true,
    operacao: "p1_imap",
    estagio: r && ESTAGIOS_P1.includes(r.estagio) ? r.estagio : "inicio",
    autenticado: !!r && bool(r.autenticado),
    logout: !!r && bool(r.logout),
  };
  if (r && r.capabilities && typeof r.capabilities === "object") {
    const c = { total: inteiro(r.capabilities.total) };
    for (const [, campo] of CAPACIDADES) c[campo] = bool(r.capabilities[campo]);
    saida.capabilities = c;
  }
  if (r && r.pastas && typeof r.pastas === "object") {
    const u = {};
    for (const campo of Object.values(USO_ESPECIAL)) u[campo] = inteiro(r.pastas.uso_especial && r.pastas.uso_especial[campo]);
    saida.pastas = { total: inteiro(r.pastas.total), nao_selecionaveis: inteiro(r.pastas.nao_selecionaveis), com_filhos: inteiro(r.pastas.com_filhos), uso_especial: u };
    saida.pasta_teste_existe = bool(r.pasta_teste_existe);
  }
  if (!saida.ok) saida.erro = r && ERROS_P1.includes(r.erro) ? r.erro : "falha_inesperada";
  return saida;
}
