// P6 · sincronização incremental SOMENTE LEITURA da pasta de teste (RAC-TESTE). Nada é alterado, nada é guardado, nenhuma mensagem é lida.
// Comandos (lista fechada; subconjunto dos da P2, conferido a cada envio): CAPABILITY, LOGIN, LIST (só a pasta de teste), EXAMINE (só a pasta de teste) e LOGOUT.
// Nenhum FETCH. O Worker não guarda estado: o "estado anterior" (UIDVALIDITY e UIDNEXT de uma execução passada) vem do cliente, só como dois números.
// Resposta de esquema fechado: números (UIDVALIDITY, UIDNEXT, EXISTS, duração), booleanos e códigos de lista fechada. Nenhum texto do servidor sai daqui.
import { POLITICA } from "./politica.mjs";
import { ErroP2, ERROS_P2, executarComando, criarLeitor, capabilities, pastaListada, inteiroAte, SEGURO_PARA_COMANDO, NOME_PASTA, UID_MAX } from "./mensagem.mjs";

export const ESTAGIOS_P6 = Object.freeze(["inicio", "conexao", "saudacao", "capability_pre", "login", "pasta_localizar", "pasta_examinar", "logout", "concluido"]);
export const TIPOS_SINCRONIZACAO = Object.freeze(["primeira_leitura", "sem_mudanca", "novas_mensagens", "uidvalidity_mudou", "uidnext_regrediu"]);
export const CODIGOS_EXAME = Object.freeze(["READ-ONLY", "READ-WRITE", "NENHUM", "OUTRO"]);
export const PERMANENTFLAGS = Object.freeze(["vazio", "nao_vazio", "ausente"]);
const DURACAO_MAX_MS = 600000;

// Decisão de sincronização (função pura): compara o que o servidor informa agora com o estado anterior do cliente.
//   UIDVALIDITY diferente = os UIDs antigos deixaram de valer: recarga total. Mesmo UIDVALIDITY: UIDNEXT maior = há mensagens novas (no máximo a diferença,
//   porque UIDs podem ter lacunas); igual = sem mudança; MENOR = inconsistência (não deveria acontecer com o mesmo UIDVALIDITY).
export function compararSincronizacao(atual, anterior) {
  if (!anterior) return { tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 };
  if (atual.uidvalidity !== anterior.uidvalidity) return { tipo: "uidvalidity_mudou", uidvalidity_mudou: true, uids_novos_no_maximo: 0 };
  if (atual.uidnext === anterior.uidnext) return { tipo: "sem_mudanca", uidvalidity_mudou: false, uids_novos_no_maximo: 0 };
  if (atual.uidnext > anterior.uidnext) return { tipo: "novas_mensagens", uidvalidity_mudou: false, uids_novos_no_maximo: atual.uidnext - anterior.uidnext };
  return { tipo: "uidnext_regrediu", uidvalidity_mudou: false, uids_novos_no_maximo: 0 };
}

// lê só números e códigos conhecidos das linhas soltas do EXAMINE (nunca guarda texto do servidor)
function lerExame(soltas, restoEtiquetado) {
  let existentes = null;
  const e = { uidvalidity: null, uidnext: null, highestmodseq_presente: false, permanentflags: "ausente" };
  for (const s of soltas) {
    let m = /^\* (\d{1,10}) EXISTS$/i.exec(s.texto);
    if (m) { existentes = Number(m[1]); continue; }
    m = /^\* OK \[UIDVALIDITY (\d{1,10})\]/i.exec(s.texto);
    if (m) { e.uidvalidity = Number(m[1]); continue; }
    m = /^\* OK \[UIDNEXT (\d{1,10})\]/i.exec(s.texto);
    if (m) { e.uidnext = Number(m[1]); continue; }
    if (/^\* OK \[HIGHESTMODSEQ \d{1,20}\]/i.test(s.texto)) { e.highestmodseq_presente = true; continue; }
    m = /^\* OK \[PERMANENTFLAGS \(([^)]*)\)\]/i.exec(s.texto);
    if (m) e.permanentflags = m[1].trim() === "" ? "vazio" : "nao_vazio";
  }
  const c = /^[A-Za-z]+ \[([A-Za-z-]+)[\] ]/.exec(restoEtiquetado || "");
  const cod = c ? c[1].toUpperCase() : null;
  e.codigo = cod === null ? "NENHUM" : cod === "READ-ONLY" || cod === "READ-WRITE" ? cod : "OUTRO";
  return { existentes, exame: e };
}

function novoResultado() {
  return { ok: false, estagio: "inicio", erro: null, autenticado: false, logout: false, pasta_teste_existe: null, mensagens_na_pasta: null, exame: null, capacidades: null, sincronizacao: null, duracao_ms: 0 };
}

// `anterior`: null ou { uidvalidity, uidnext } (números). `relogio`: função que devolve milissegundos (injetável em teste). Nunca lança: devolve sempre um resultado.
export async function executarP6({ abrir, usuario, senha, anterior = null, politica = POLITICA, relogio = () => Date.now() }) {
  const imap = politica.imap;
  const cfg = politica.p2;
  const r = novoResultado();
  const inicio = relogio();
  let socket = null;
  let ctx = null;
  let temporizador;
  const prazo = new Promise((_, rejeita) => { temporizador = setTimeout(() => rejeita(new ErroP2("timeout")), cfg.timeoutMs); });
  prazo.catch(() => {});
  try {
    if (typeof usuario !== "string" || typeof senha !== "string" || !SEGURO_PARA_COMANDO.test(usuario) || !SEGURO_PARA_COMANDO.test(senha)) throw new ErroP2("comando_nao_permitido");
    if (typeof cfg.pasta !== "string" || !NOME_PASTA.test(cfg.pasta)) throw new ErroP2("comando_nao_permitido");
    if (anterior !== null) {
      const ok = (v) => Number.isSafeInteger(v) && v >= 1 && v <= UID_MAX;
      if (typeof anterior !== "object" || !ok(anterior.uidvalidity) || !ok(anterior.uidnext)) throw new ErroP2("comando_nao_permitido");
    }

    r.estagio = "conexao";
    try { socket = await Promise.race([abrir(imap.host, imap.porta), prazo]); } catch (e) { throw e instanceof ErroP2 ? e : new ErroP2("conexao_falhou"); }
    ctx = { n: 0, prazo, pasta: cfg.pasta, maxLinhas: cfg.maxLinhas, maxLinha: cfg.maxEstruturaBytes, codificador: new TextEncoder(), escritor: socket.writable.getWriter(), leitor: criarLeitor(socket.readable, prazo, cfg.maxBytes) };

    r.estagio = "saudacao";
    if (!/^\* OK( |$)/i.test(await ctx.leitor.linha())) throw new ErroP2("saudacao_invalida");

    r.estagio = "capability_pre";
    const pre = await executarComando(ctx, "CAPABILITY", "", 1024);
    if (pre.status !== "OK") throw new ErroP2("capability_falhou");
    const caps = capabilities(pre.soltas);
    if (caps.includes("logindisabled")) throw new ErroP2("login_desabilitado");
    r.capacidades = { condstore: caps.includes("condstore"), qresync: caps.includes("qresync"), idle: caps.includes("idle"), uidplus: caps.includes("uidplus"), move: caps.includes("move"), namespace: caps.includes("namespace") };

    r.estagio = "login";
    const login = await executarComando(ctx, "LOGIN", ' "' + usuario + '" "' + senha + '"', 1024);
    if (login.status === "NO") throw new ErroP2("autenticacao_recusada");
    if (login.status !== "OK") throw new ErroP2("login_erro_protocolo");
    r.autenticado = true;

    r.estagio = "pasta_localizar";
    const lista = await executarComando(ctx, "LIST", ' "" "' + cfg.pasta + '"', 1024);
    if (lista.status !== "OK") throw new ErroP2("pasta_erro");
    const achada = pastaListada(lista.soltas, cfg.pasta);
    r.pasta_teste_existe = achada.achou;
    if (!achada.achou || !achada.abrivel) throw new ErroP2("pasta_inexistente");

    r.estagio = "pasta_examinar"; // EXAMINE: somente leitura por definição do protocolo
    const ex = await executarComando(ctx, "EXAMINE", ' "' + cfg.pasta + '"', 1024);
    if (ex.status !== "OK") throw new ErroP2("examine_recusado");
    const lido = lerExame(ex.soltas, ex.resto);
    if (lido.existentes === null || lido.exame.uidvalidity === null || lido.exame.uidnext === null || lido.exame.uidvalidity < 1 || lido.exame.uidnext < 1) throw new ErroP2("resposta_malformada");
    r.mensagens_na_pasta = lido.existentes;
    r.exame = lido.exame;
    r.sincronizacao = compararSincronizacao({ uidvalidity: lido.exame.uidvalidity, uidnext: lido.exame.uidnext }, anterior);
  } catch (e) {
    r.erro = e instanceof ErroP2 && ERROS_P2.includes(e.codigo) ? e.codigo : "falha_inesperada";
  }
  if (ctx && r.erro !== "timeout" && r.erro !== "conexao_falhou" && r.erro !== "resposta_inesperada" && r.erro !== "resposta_malformada" && r.erro !== "comando_nao_permitido") {
    try {
      if (r.erro === null) r.estagio = "logout";
      const fim = await executarComando(ctx, "LOGOUT", "", 1024);
      r.logout = fim.status === "OK";
    } catch (_) { r.logout = false; }
  }
  if (r.erro === null && r.autenticado && r.exame) { r.ok = true; r.estagio = "concluido"; }
  r.duracao_ms = inteiroAte(relogio() - inicio, DURACAO_MAX_MS);
  clearTimeout(temporizador);
  if (ctx) ctx.leitor.liberar();
  if (socket) { try { await socket.close(); } catch (_) { /* já fechado */ } }
  return r;
}

const bool = (v) => v === true;
const emLista = (lista, v, padrao) => (lista.includes(v) ? v : padrao);

// esquema FECHADO da resposta: copia só campos conhecidos e do tipo certo
export function montarRespostaP6(r) {
  const saida = {
    ok: !!r && r.ok === true,
    operacao: "p6_imap",
    estagio: r && ESTAGIOS_P6.includes(r.estagio) ? r.estagio : "inicio",
    autenticado: !!r && bool(r.autenticado),
    logout: !!r && bool(r.logout),
  };
  if (r && (r.pasta_teste_existe === true || r.pasta_teste_existe === false)) saida.pasta_teste_existe = r.pasta_teste_existe;
  if (r && r.mensagens_na_pasta !== null && r.mensagens_na_pasta !== undefined) saida.mensagens_na_pasta = inteiroAte(r.mensagens_na_pasta, UID_MAX);
  if (r && r.capacidades && typeof r.capacidades === "object") {
    const c = r.capacidades;
    saida.capacidades = { condstore: bool(c.condstore), qresync: bool(c.qresync), idle: bool(c.idle), uidplus: bool(c.uidplus), move: bool(c.move), namespace: bool(c.namespace) };
  }
  if (r && r.exame && typeof r.exame === "object") {
    const e = r.exame;
    saida.exame = {
      codigo_etiquetado: emLista(CODIGOS_EXAME, e.codigo, "NENHUM"), permanentflags: emLista(PERMANENTFLAGS, e.permanentflags, "ausente"),
      uidvalidity: inteiroAte(e.uidvalidity, UID_MAX), uidnext: inteiroAte(e.uidnext, UID_MAX), highestmodseq_presente: bool(e.highestmodseq_presente),
    };
  }
  if (r && r.sincronizacao && typeof r.sincronizacao === "object") {
    const s = r.sincronizacao;
    saida.sincronizacao = { tipo: emLista(TIPOS_SINCRONIZACAO, s.tipo, "primeira_leitura"), uidvalidity_mudou: bool(s.uidvalidity_mudou), uids_novos_no_maximo: inteiroAte(s.uids_novos_no_maximo, UID_MAX) };
  }
  if (r) saida.duracao_ms = inteiroAte(r.duracao_ms, DURACAO_MAX_MS);
  if (!saida.ok) saida.erro = r && ERROS_P2.includes(r.erro) ? r.erro : "falha_inesperada";
  return saida;
}
