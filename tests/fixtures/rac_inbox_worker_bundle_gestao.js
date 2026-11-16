var RE_STORE = /^ STORE ([1-9]\d{0,9}) ([+-])FLAGS \(\\Seen\)$/;
var RE_MOVE = /^ MOVE ([1-9]\d{0,9}) "(.*)"$/;
var RE_SELECT = /^ "(.*)"$/;
function comandoGestaoPermitido(verbo, args) {
  if (verbo === "SELECT") {
    const m = RE_SELECT.exec(args);
    return !!m && NOME_PASTA.test(m[1]);
  }
  if (verbo === "UID") {
    let m = RE_STORE.exec(args);
    if (m) return uidOk(Number(m[1]));
    m = RE_MOVE.exec(args);
    return !!m && uidOk(Number(m[1])) && NOME_PASTA.test(m[2]);
  }
  return false;
}
__name(comandoGestaoPermitido, "comandoGestaoPermitido");
var GESTAO = Object.freeze({ permitido: comandoGestaoPermitido, muta: /* @__PURE__ */ __name((verbo, args) => verbo === "UID" && /^ (?:STORE|MOVE) /.test(args), "muta") });
async function selecionar(ctx, pasta, uidvalidityEsperado) {
  const r = await executarComando(ctx, "SELECT", ' "' + conferirPasta(pasta) + '"', 1024);
  if (r.status === "OK" && /\[READ-ONLY\]/i.test(r.resto)) throw new ErroImap("pasta_somente_leitura");
  return interpretarAbertura(r, uidvalidityEsperado);
}
__name(selecionar, "selecionar");
async function conferirIdentidade(ctx, p) {
  const cfg = ctx.politica.imap;
  const r = await executarComando(ctx, "UID", " FETCH " + p.uid + " (" + ITENS_IDENTIDADE + ")", cfg.maxLiteralCabecalho);
  if (r.status !== "OK") throw new ErroImap("fetch_falhou");
  const f = lerFetch(r.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
  if (!f) throw new ErroImap("mensagem_inexistente");
  if (p.message_id_esperado !== void 0) {
    const mid = lerCabecalhos(f.cabecalho)["message-id"];
    if (typeof mid !== "string" || mid.trim() !== p.message_id_esperado) throw new ErroImap("identidade_divergente");
  }
  if (p.tamanho_esperado !== void 0 && f.tamanho !== p.tamanho_esperado) throw new ErroImap("identidade_divergente");
  return f;
}
__name(conferirIdentidade, "conferirIdentidade");
async function flagsDe(ctx, uid) {
  const r = await executarComando(ctx, "UID", " FETCH " + uid + " (" + ITENS_FLAGS + ")", ctx.politica.imap.maxLiteralCabecalho);
  if (r.status !== "OK") throw new ErroImap("fetch_falhou");
  const f = lerFetch(r.soltas, ctx.politica.imap.maxItensSexp).find((x) => x.uid === uid);
  return f && f.flagsInformadas ? f.flags : null;
}
__name(flagsDe, "flagsDe");
var COPYUID = /\[COPYUID (\d{1,10}) (\d{1,10}) (\d{1,10})\]/i;
var OPERACOES_GESTAO = {
  // p: { pasta, uid, uidvalidity_esperado, lida, message_id_esperado?, tamanho_esperado? }
  async marcar_lida(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado) || typeof p.lida !== "boolean") throw new ErroImap("parametro_invalido");
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
    const antes = await conferirIdentidade(ctx, p);
    if (antes.flags.includes("\\seen") === p.lida) return { resultado: "ja_estava", lida: p.lida };
    const r = await executarComando(ctx, "UID", " STORE " + p.uid + " " + (p.lida ? "+" : "-") + "FLAGS (\\Seen)", ctx.politica.imap.maxLiteralCabecalho);
    if (r.status !== "OK") throw new ErroImap("acao_recusada");
    const g = lerFetch(r.soltas, ctx.politica.imap.maxItensSexp).find((x) => x.uid === p.uid);
    let flags = g && g.flagsInformadas ? g.flags : null;
    if (flags === null) {
      try {
        flags = await flagsDe(ctx, p.uid);
      } catch (_) {
        flags = null;
      }
    }
    if (flags === null || flags.includes("\\seen") !== p.lida) throw new ErroImap("confirmacao_ausente");
    return { resultado: "aplicada", lida: p.lida };
  },
  // p: { pasta, destino, uid, uidvalidity_esperado, message_id_esperado?, tamanho_esperado? } — o destino é um nome que a LISTAGEM do servidor comprova, selecionável e diferente da origem
  async mover_mensagem(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado) || typeof p.destino !== "string") throw new ErroImap("parametro_invalido");
    conferirPasta(p.pasta);
    conferirPasta(p.destino);
    if (p.destino === p.pasta) throw new ErroImap("pasta_invalida");
    if (!Array.isArray(ctx.capDepois) || !ctx.capDepois.includes("MOVE")) throw new ErroImap("acao_indisponivel");
    const { pastas } = await OPERACOES.listar_pastas(ctx);
    const origem = pastas.find((x) => x.nome === p.pasta), destino = pastas.find((x) => x.nome === p.destino);
    if (!origem) throw new ErroImap("pasta_inexistente");
    if (!destino) throw new ErroImap("pasta_inexistente");
    if (!destino.selecionavel || !origem.selecionavel) throw new ErroImap("pasta_invalida");
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
    await conferirIdentidade(ctx, p);
    const r = await executarComando(ctx, "UID", " MOVE " + p.uid + ' "' + p.destino + '"', ctx.politica.imap.maxLiteralCabecalho);
    if (r.status !== "OK") throw new ErroImap("acao_recusada");
    if (r.soltas.filter((s) => /^\* \d{1,10} EXPUNGE$/i.test(s.texto)).length > 1) throw new ErroImap("acao_incerta");
    const cu = COPYUID.exec(r.resto) || r.soltas.map((s) => COPYUID.exec(s.texto)).find(Boolean);
    const saida = { resultado: "aplicada" };
    if (cu && Number(cu[2]) === p.uid && uidOk(Number(cu[1])) && uidOk(Number(cu[3]))) saida.destino = { uidvalidity: Number(cu[1]), uid: Number(cu[3]) };
    let restou = null;
    try {
      restou = await flagsDe(ctx, p.uid);
    } catch (_) {
      restou = null;
    }
    if (restou !== null) throw new ErroImap("acao_incerta");
    return saida;
  },
  // só leitura (EXAMINE): a mensagem ainda existe nesta pasta? Serve para resolver um resultado incerto SEM repetir a alteração. p: { pasta, uid, uidvalidity_esperado }
  async verificar_mensagem(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado)) throw new ErroImap("parametro_invalido");
    await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    const flags = await flagsDe(ctx, p.uid);
    return flags === null ? { existe: false } : { existe: true, lida: flags.includes("\\seen") };
  },
  // o que o servidor anuncia ANTES e DEPOIS do login (a decisão de mover usa o de DEPOIS). Só leitura.
  async capacidades(ctx) {
    const antes = ctx.capAntes || [], depois = ctx.capDepois || [];
    return { antes_login: antes, depois_login: depois, mover: depois.includes("MOVE"), uidplus: depois.includes("UIDPLUS") };
  }
};
