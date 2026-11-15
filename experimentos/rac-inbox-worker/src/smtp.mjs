// RAC Inbox · Worker de produto (I3): cliente SMTP para o iCloud (smtp.mail.me.com:587, STARTTLS). Host e porta vêm só da política. É a ÚNICA parte do Worker que escreve no mundo.
// Regras de segurança:
//  · a credencial só é enviada DEPOIS de o STARTTLS ter sido aceito e a camada TLS aberta (o runtime valida o certificado contra o nome do servidor); sem TLS, não há AUTH;
//  · se o servidor mandar qualquer byte logo depois do "220" do STARTTLS, a sessão é abortada (ataque de injeção de comando em texto aberto);
//  · cada comando é conferido por expressão regular ANTES de escrever no socket (lista fechada: EHLO, STARTTLS, AUTH PLAIN, MAIL FROM, RCPT TO, DATA, QUIT);
//  · uma única tentativa de AUTH por chamada; nunca repete o envio;
//  · registra NADA: nem senha, nem destinatário, nem texto. A prova devolve só etapas, códigos de resposta de 3 dígitos e durações.
// Resultado de um envio, em três classes (nunca se afirma "enviado" sem o 250 final do servidor):
//  · ENVIADO     → o servidor respondeu 2xx depois do ".";
//  · FALHA CONFIRMADA → qualquer erro ANTES de o corpo começar a ser transmitido, ou resposta 4xx/5xx do servidor depois do ".": nada foi entregue (ou o servidor recusou);
//  · INCERTO     → o corpo já foi (ou começou a ser) transmitido e a resposta final nunca chegou (timeout, conexão cortada): a mensagem PODE ter sido aceita. O chamador não repete sozinho.
import { POLITICA } from "./politica.mjs";
import { mensagemDeTeste, montarMensagem } from "./saida.mjs";

export class ErroSmtp extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
export const ERROS_SMTP = Object.freeze([
  "conexao_falhou", "timeout", "saudacao_invalida", "ehlo_falhou", "starttls_indisponivel", "starttls_falhou", "tls_falhou", "smtp_autenticacao_nao_suportada", "smtp_autenticacao_recusada",
  "remetente_recusado", "destinatario_recusado", "dados_recusados", "envio_recusado", "envio_incerto", "resposta_inesperada", "resposta_grande_demais", "limite_excedido", "comando_nao_permitido",
]);

const RE_END = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
const RE_B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function comandoSmtpPermitido(linha, politica = POLITICA) {
  if (linha === "STARTTLS" || linha === "DATA" || linha === "QUIT") return true;
  if (linha === "EHLO " + politica.smtp.helo) return true;
  let m = /^AUTH PLAIN (\S+)$/.exec(linha);
  if (m) return m[1].length <= 600 && RE_B64.test(m[1]);
  m = /^MAIL FROM:<([^<>\s]+)>(?: SIZE=(\d{1,7}))?$/.exec(linha);
  if (m) return RE_END.test(m[1]);
  m = /^RCPT TO:<([^<>\s]+)>$/.exec(linha);
  return !!m && RE_END.test(m[1]);
}

const latin1 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return s; };
function criarLeitor(readable, prazo, estado, maxBytes) {
  const leitor = readable.getReader();
  let buf = "";
  async function puxar() {
    const r = await Promise.race([leitor.read(), prazo]);
    if (r.done) throw new ErroSmtp("resposta_inesperada");
    estado.total += r.value.byteLength;
    if (estado.total > maxBytes) throw new ErroSmtp("resposta_grande_demais");
    buf += latin1(r.value);
  }
  return {
    async linha() { for (;;) { const i = buf.indexOf("\r\n"); if (i >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); return l; } if (buf.length > 4096) throw new ErroSmtp("resposta_grande_demais"); await puxar(); } },
    pendente: () => buf.length,
    liberar() { try { leitor.releaseLock(); } catch (_) { /* já liberado */ } },
  };
}

// lê UMA resposta (possivelmente em várias linhas "250-..." até "250 ..."): { codigo, linhas }
async function lerResposta(ctx) {
  const linhas = []; let codigo = null;
  for (;;) {
    const l = await ctx.leitor.linha();
    const m = /^(\d{3})([ -])(.*)$/.exec(l) || /^(\d{3})()$/.exec(l);
    if (!m || (codigo !== null && Number(m[1]) !== codigo)) throw new ErroSmtp("resposta_inesperada");
    codigo = Number(m[1]); linhas.push(m[3] === undefined ? "" : m[3]);
    if (linhas.length > ctx.politica.smtp.maxLinhasResposta) throw new ErroSmtp("limite_excedido");
    if (m[2] !== "-") return { codigo, linhas };
  }
}
async function escrever(ctx, texto) { await Promise.race([ctx.escritor.write(ctx.codificador.encode(texto)), ctx.prazo]); }
async function comando(ctx, linha) {
  if (!comandoSmtpPermitido(linha, ctx.politica)) throw new ErroSmtp("comando_nao_permitido");
  await escrever(ctx, linha + "\r\n");
  return await lerResposta(ctx);
}
const classe = (r) => Math.floor(r.codigo / 100);
const capacidades = (r) => r.linhas.map((x) => x.toUpperCase());

/* Executa a sessão. `etapas` recebe { etapa, ok, codigo?, ms } a cada passo (só dados fixos). `acao(ctx, etapa)` roda autenticada. Nunca lança: devolve { ok, dados?, erro?, etapas, incerto? } */
export async function comSessaoSmtp({ abrir, usuario, senha, politica = POLITICA, relogio = () => Date.now() }, acao) {
  const cfg = politica.smtp, etapas = [], t0 = relogio();
  let socket = null, temporizador, ctx = null, erro = null, dados = null, ultimo = t0;
  const estado = { total: 0 };
  const prazo = new Promise((_, rej) => { temporizador = setTimeout(() => rej(new ErroSmtp("timeout")), cfg.timeoutMs); }); prazo.catch(() => {});
  const registra = (etapa, ok, codigo) => { const agora = relogio(); etapas.push({ etapa, ok, ...(codigo !== undefined && codigo !== null ? { codigo } : {}), ms: Math.max(0, agora - ultimo) }); ultimo = agora; };
  let etapaAtual = "conexao";
  const passo = async (etapa, f) => {
    etapaAtual = etapa;
    try { const r = await f(); registra(etapa, true, r && r.codigo); return r; }
    catch (e) { registra(etapa, false, e && e.respostaCodigo); throw e; }
  };
  const esperar = (r, ok, codigoErro) => { const e = new ErroSmtp(codigoErro); e.respostaCodigo = r.codigo; if (!ok(r.codigo)) throw e; return r; };
  try {
    if (typeof usuario !== "string" || typeof senha !== "string" || !/^[^"\\\r\n\u0000 ]+$/.test(usuario) || !/^[a-z-]{19}$/.test(senha)) throw new ErroSmtp("comando_nao_permitido");
    await passo("conexao_tcp", async () => { try { socket = await Promise.race([abrir(cfg.host, cfg.porta), prazo]); } catch (e) { throw e instanceof ErroSmtp ? e : new ErroSmtp("conexao_falhou"); } return {}; });
    ctx = { politica, prazo, codificador: new TextEncoder(), escritor: socket.writable.getWriter(), leitor: criarLeitor(socket.readable, prazo, estado, cfg.maxBytesSessao) };
    await passo("saudacao", async () => esperar(await lerResposta(ctx), (c) => c === 220, "saudacao_invalida"));
    const ehlo1 = await passo("ehlo", async () => esperar(await comando(ctx, "EHLO " + cfg.helo), (c) => c === 250, "ehlo_falhou"));
    if (!capacidades(ehlo1).includes("STARTTLS")) { etapaAtual = "starttls"; registra("starttls", false); throw new ErroSmtp("starttls_indisponivel"); }
    await passo("starttls", async () => {
      const r = esperar(await comando(ctx, "STARTTLS"), (c) => c === 220, "starttls_falhou");
      if (ctx.leitor.pendente() > 0) throw new ErroSmtp("starttls_falhou");   // bytes em texto aberto depois do 220: injeção; aborta antes do TLS
      return r;
    });
    await passo("tls", async () => {
      try {
        ctx.leitor.liberar(); ctx.escritor.releaseLock();
        socket = socket.startTls({ expectedServerHostname: cfg.host });   // o runtime valida o certificado contra o nome fixo da política
        ctx.escritor = socket.writable.getWriter(); ctx.leitor = criarLeitor(socket.readable, prazo, estado, cfg.maxBytesSessao);
        if (socket.opened) await Promise.race([socket.opened, prazo]);
      } catch (e) { throw e instanceof ErroSmtp ? e : new ErroSmtp("tls_falhou"); }
      return {};
    });
    const ehlo2 = await passo("ehlo_tls", async () => esperar(await comando(ctx, "EHLO " + cfg.helo), (c) => c === 250, "ehlo_falhou"));
    const auth = capacidades(ehlo2).find((x) => x.startsWith("AUTH "));
    if (!auth || !auth.split(" ").includes("PLAIN")) { etapaAtual = "autenticacao"; registra("autenticacao", false); throw new ErroSmtp("smtp_autenticacao_nao_suportada"); }
    await passo("autenticacao", async () => {   // UMA tentativa: AUTH PLAIN com resposta inicial (a senha só viaja depois do TLS)
      const cred = btoa(String.fromCharCode(...new TextEncoder().encode("\u0000" + usuario + "\u0000" + senha)));
      const r = await comando(ctx, "AUTH PLAIN " + cred);
      if (r.codigo === 535 || r.codigo === 534 || r.codigo === 530) { const e = new ErroSmtp("smtp_autenticacao_recusada"); e.respostaCodigo = r.codigo; throw e; }
      return esperar(r, (c) => c === 235, "resposta_inesperada");
    });
    dados = await acao({ ctx, passo, esperar, comando, lerResposta, escrever, registra, classe });
  } catch (e) {
    erro = e instanceof ErroSmtp && ERROS_SMTP.includes(e.codigo) ? e.codigo : "resposta_inesperada";
    if (ctx && ctx.corpoTransmitido && !ctx.respostaFinal) erro = "envio_incerto";   // o corpo saiu e não houve resposta definitiva
  }
  clearTimeout(temporizador);
  if (ctx && !erro) { try { await Promise.race([escrever(ctx, "QUIT\r\n"), new Promise((r) => setTimeout(r, 1500))]); } catch (_) { /* encerramento educado */ } }
  try { if (ctx) { ctx.leitor.liberar(); ctx.escritor.releaseLock(); } } catch (_) { /* já liberado */ }
  try { if (socket) await Promise.race([socket.close(), new Promise((r) => setTimeout(r, 1000))]); } catch (_) { /* já fechado */ }
  const total = Math.max(0, relogio() - t0);
  return erro ? { ok: false, erro, etapas, etapa_falha: etapaAtual, total_ms: total } : { ok: true, dados, etapas, total_ms: total };
}

/* envelope + corpo. Só devolve ok com 2xx depois do ".". */
async function transmitir(s, { de, destinatarios, mensagem }) {
  const { ctx, passo, esperar, comando } = s;
  await passo("remetente", async () => esperar(await comando(ctx, "MAIL FROM:<" + de + "> SIZE=" + mensagem.length), (c) => c === 250, "remetente_recusado"));
  for (const d of destinatarios) await passo("destinatario", async () => esperar(await comando(ctx, "RCPT TO:<" + d + ">"), (c) => c === 250 || c === 251, "destinatario_recusado"));
  await passo("dados", async () => esperar(await comando(ctx, "DATA"), (c) => c === 354, "dados_recusados"));
  // daqui em diante a falta de resposta é INCERTA: o corpo pode ter sido aceito
  const corpo = mensagem.replace(/^\./gm, "..") + (mensagem.endsWith("\r\n") ? "" : "\r\n") + ".\r\n";
  ctx.corpoTransmitido = true;
  const r = await passo("envio", async () => {
    await escrever(ctx, corpo);
    const resp = await lerResposta(ctx);
    ctx.respostaFinal = true;
    return resp;
  });
  if (r.codigo >= 200 && r.codigo < 300) return { aceito: true, codigo: r.codigo };
  const e = new ErroSmtp("envio_recusado"); e.respostaCodigo = r.codigo; throw e;
}

/* ---- operações ---- */
// enviar: p já examinado por examinarEnvio. Devolve { ok:true, dados:{ resultado:"enviado", smtp:250, etapas } } ou { ok:false, erro, resultado:"falha"|"incerto" }.
export async function enviarMensagem(base, p, politica = POLITICA) {
  let mensagem;
  mensagem = montarMensagem(p, politica);
  const r = await comSessaoSmtp({ ...base, politica }, (s) => transmitir(s, { de: p.de, destinatarios: [...p.para, ...p.cc, ...p.cco], mensagem }));
  if (r.ok) return { ok: true, dados: { resultado: "enviado", smtp: r.dados.codigo, duracao_ms: r.total_ms } };
  return { ok: false, erro: r.erro, resultado: r.erro === "envio_incerto" ? "incerto" : "falha" };
}

// prova de viabilidade: devolve SEMPRE um relatório (etapas, códigos de 3 dígitos, durações). `enviar_teste` manda UMA mensagem curta ao próprio endereço; sem ele, para depois do AUTH.
export async function provarSmtp(base, { enviar_teste = false, endereco, message_id, instante }, politica = POLITICA) {
  const r = await comSessaoSmtp({ ...base, politica }, async (s) => {
    if (!enviar_teste) return { teste: "nao_enviado" };
    const t = await transmitir(s, { de: endereco, destinatarios: [endereco], mensagem: mensagemDeTeste(endereco, message_id, instante) });
    return { teste: "enviado", codigo: t.codigo };
  });
  const dados = { aprovada: r.ok, host: politica.smtp.host, porta: politica.smtp.porta, etapas: r.etapas, total_ms: r.total_ms, teste: r.ok ? r.dados.teste : "nao_enviado" };
  if (!r.ok) { dados.erro = r.erro; dados.etapa_falha = r.etapa_falha; if (r.erro === "envio_incerto") dados.teste = "incerto"; }
  return { ok: true, dados };
}
