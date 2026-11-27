var RE_STORE = /^ STORE ([1-9]\d{0,9}) ([+-])FLAGS \(\\Seen\)$/;
var RE_MOVE = /^ MOVE ([1-9]\d{0,9}) "(.*)"$/;
var RE_SELECT = /^ "(.*)"$/;
var RE_COPY = /^ COPY ([1-9]\d{0,9}) "(.*)"$/;
var RE_STORE_DEL = /^ STORE ([1-9]\d{0,9}) \+FLAGS \(\\Deleted\)$/;
var RE_EXPUNGE_UID = /^ EXPUNGE ([1-9]\d{0,9})$/;
var RE_BUSCA_MID = /^ SEARCH HEADER Message-ID "(<[^<>"\\\s\u0000-\u001f\u007f-\uffff]{1,250}>)"$/;
function comandoGestaoPermitido(verbo, args) {
  if (verbo === "SELECT") { const m = RE_SELECT.exec(args); return !!m && NOME_PASTA.test(m[1]); }
  if (verbo === "UID") {
    let m = RE_STORE.exec(args); if (m) return uidOk(Number(m[1]));
    m = RE_MOVE.exec(args); if (m) return uidOk(Number(m[1])) && NOME_PASTA.test(m[2]);
    m = RE_COPY.exec(args); if (m) return uidOk(Number(m[1])) && NOME_PASTA.test(m[2]);
    m = RE_STORE_DEL.exec(args); if (m) return uidOk(Number(m[1]));
    m = RE_EXPUNGE_UID.exec(args); if (m) return uidOk(Number(m[1]));
    return RE_BUSCA_MID.test(args);
  }
  return false;
}
const GESTAO = Object.freeze({ permitido: comandoGestaoPermitido, muta: (verbo, args) => verbo === "UID" && /^ (?:STORE|MOVE|COPY|EXPUNGE) /.test(args) });
async function selecionar(ctx, pasta, uidvalidityEsperado) {
  const r = await executarComando(ctx, "SELECT", ' "' + conferirPasta(pasta) + '"', 1024);
  if (r.status === "OK" && /\[READ-ONLY\]/i.test(r.resto)) throw new ErroImap("pasta_somente_leitura");
  return interpretarAbertura(r, uidvalidityEsperado);
}
async function conferirIdentidade(ctx, p) {
  const cfg = ctx.politica.imap;
  const r = await executarComando(ctx, "UID", " FETCH " + p.uid + " (" + ITENS_IDENTIDADE + ")", cfg.maxLiteralCabecalho);
  if (r.status !== "OK") throw new ErroImap("fetch_falhou");
  const f = lerFetch(r.soltas, cfg.maxItensSexp).find((x) => x.uid === p.uid);
  if (!f) throw new ErroImap("mensagem_inexistente");
  if (p.message_id_esperado !== undefined) {
    const mid = lerCabecalhos(f.cabecalho)["message-id"];
    if (typeof mid !== "string" || mid.trim() !== p.message_id_esperado) throw new ErroImap("identidade_divergente");
  }
  if (p.tamanho_esperado !== undefined && f.tamanho !== p.tamanho_esperado) throw new ErroImap("identidade_divergente");
  return f;
}
async function flagsDe(ctx, uid) {
  const r = await executarComando(ctx, "UID", " FETCH " + uid + " (" + ITENS_FLAGS + ")", ctx.politica.imap.maxLiteralCabecalho);
  if (r.status !== "OK") throw new ErroImap("fetch_falhou");
  const f = lerFetch(r.soltas, ctx.politica.imap.maxItensSexp).find((x) => x.uid === uid);
  return f && f.flagsInformadas ? f.flags : null;
}
const COPYUID = /\[COPYUID (\d{1,10}) (\d{1,10}) (\d{1,10})\]/i;
const RE_MID_BUSCA = /^<[^<>"\\\s\u0000-\u001f\u007f-\uffff]{1,250}>$/;
async function achouCopia(ctx, destino, mid) {  
  const ab = await executarComando(ctx, "EXAMINE", ' "' + conferirPasta(destino) + '"', 1024);
  if (ab.status !== "OK") throw new ErroImap("examine_recusado");
  const b = await executarComando(ctx, "UID", ' SEARCH HEADER Message-ID "' + mid + '"', 1024);
  if (b.status !== "OK") throw new ErroImap("busca_falhou");
  return b.soltas.flatMap((x) => (/^\* SEARCH((?: \d{1,10})*)$/i.exec(x.texto) || [, ""])[1].split(" ").filter(Boolean)).length;
}
async function copiarEExcluir(ctx, p) {
  await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
  const f = await conferirIdentidade(ctx, p);
  const mid = lerCabecalhos(f.cabecalho)["message-id"];
  if (typeof mid !== "string" || !RE_MID_BUSCA.test(mid.trim())) throw new ErroImap("acao_recusada");  
  const id = mid.trim();
  if (f.flags.includes("\\deleted") && (await achouCopia(ctx, p.destino, id)) > 0) return { resultado: "aplicada", limpeza: "feita_pelo_servidor" };  
  let existe = await achouCopia(ctx, p.destino, id);
  let copiada = false;
  if (existe === 0) {
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);  
    const c = await executarComando(ctx, "UID", " COPY " + p.uid + ' "' + p.destino + '"', ctx.politica.imap.maxLiteralCabecalho);
    if (c.status !== "OK") throw new ErroImap("acao_recusada");  
    copiada = true;
    existe = await achouCopia(ctx, p.destino, id);  
    if (existe === 0) throw new ErroImap("acao_incerta");  
  }
  try {
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
    await conferirIdentidade(ctx, p);
    const m = await executarComando(ctx, "UID", " STORE " + p.uid + " +FLAGS (\\Deleted)", ctx.politica.imap.maxLiteralCabecalho);
    if (m.status !== "OK") throw new ErroImap("acao_recusada");
    const g = lerFetch(m.soltas, ctx.politica.imap.maxItensSexp).find((x) => x.uid === p.uid);
    let flags = g && g.flagsInformadas ? g.flags : null;
    if (flags === null) flags = await flagsDe(ctx, p.uid);
    if (flags === null || !flags.includes("\\deleted")) throw new ErroImap("confirmacao_ausente");
  } catch (e) {
    if (e instanceof ErroImap && ["acao_recusada", "confirmacao_ausente", "mensagem_inexistente", "identidade_divergente", "uidvalidity_mudou", "pasta_somente_leitura"].includes(e.codigo)) throw new ErroImap("acao_parcial");
    throw e;
  }
  let limpeza = "pendente";
  if (ctx.capDepois.includes("UIDPLUS")) {
    try {
      const x = await executarComando(ctx, "UID", " EXPUNGE " + p.uid, ctx.politica.imap.maxLiteralCabecalho);
      if (x.status === "OK") { let resta = null; try { resta = await flagsDe(ctx, p.uid); } catch (_) { resta = null; } limpeza = resta === null ? "feita" : "pendente"; }
    } catch (_) { limpeza = "pendente"; }  
  } else limpeza = "indisponivel";  
  return { resultado: "aplicada", limpeza, copia: copiada ? "nova" : "ja_existia" };
}
const OPERACOES_GESTAO = {
  async marcar_lida(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado) || typeof p.lida !== "boolean") throw new ErroImap("parametro_invalido");
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
    const antes = await conferirIdentidade(ctx, p);
    if (antes.flags.includes("\\seen") === p.lida) return { resultado: "ja_estava", lida: p.lida };  
    const r = await executarComando(ctx, "UID", " STORE " + p.uid + " " + (p.lida ? "+" : "-") + "FLAGS (\\Seen)", ctx.politica.imap.maxLiteralCabecalho);
    if (r.status !== "OK") throw new ErroImap("acao_recusada");  
    const g = lerFetch(r.soltas, ctx.politica.imap.maxItensSexp).find((x) => x.uid === p.uid);
    let flags = g && g.flagsInformadas ? g.flags : null;
    if (flags === null) { try { flags = await flagsDe(ctx, p.uid); } catch (_) { flags = null; } }
    if (flags === null || flags.includes("\\seen") !== p.lida) throw new ErroImap("confirmacao_ausente");
    return { resultado: "aplicada", lida: p.lida };
  },
  async mover_mensagem(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado) || typeof p.destino !== "string") throw new ErroImap("parametro_invalido");
    conferirPasta(p.pasta); conferirPasta(p.destino);
    if (p.destino === p.pasta) throw new ErroImap("pasta_invalida");
    if (!Array.isArray(ctx.capDepois)) throw new ErroImap("acao_indisponivel");  
    const semMove = !ctx.capDepois.includes("MOVE");  
    const { pastas } = await OPERACOES.listar_pastas(ctx);
    const origem = pastas.find((x) => x.nome === p.pasta), destino = pastas.find((x) => x.nome === p.destino);
    if (!origem) throw new ErroImap("pasta_inexistente");
    if (!destino) throw new ErroImap("pasta_inexistente");
    if (!destino.selecionavel || !origem.selecionavel) throw new ErroImap("pasta_invalida");
    if (semMove) return copiarEExcluir(ctx, p);
    await selecionar(ctx, p.pasta, p.uidvalidity_esperado);
    await conferirIdentidade(ctx, p);
    const r = await executarComando(ctx, "UID", " MOVE " + p.uid + ' "' + p.destino + '"', ctx.politica.imap.maxLiteralCabecalho);
    if (r.status !== "OK") throw new ErroImap("acao_recusada");  
    if (r.soltas.filter((s) => /^\* \d{1,10} EXPUNGE$/i.test(s.texto)).length > 1) throw new ErroImap("acao_incerta");
    const cu = COPYUID.exec(r.resto) || r.soltas.map((s) => COPYUID.exec(s.texto)).find(Boolean);
    const saida = { resultado: "aplicada" };
    if (cu && Number(cu[2]) === p.uid && uidOk(Number(cu[1])) && uidOk(Number(cu[3]))) saida.destino = { uidvalidity: Number(cu[1]), uid: Number(cu[3]) };
    let restou = null; try { restou = await flagsDe(ctx, p.uid); } catch (_) { restou = null; }
    if (restou !== null) throw new ErroImap("acao_incerta");
    return saida;
  },
  async verificar_mensagem(ctx, p) {
    if (!uidOk(p.uid) || !uidOk(p.uidvalidity_esperado)) throw new ErroImap("parametro_invalido");
    await examinar(ctx, p.pasta, p.uidvalidity_esperado);
    const flags = await flagsDe(ctx, p.uid);
    return flags === null || flags.includes("\\deleted") ? { existe: false } : { existe: true, lida: flags.includes("\\seen") };  
  },
  async capacidades(ctx) {
    const antes = ctx.capAntes || [], depois = ctx.capDepois || [];
    return { antes_login: antes, depois_login: depois, mover: depois.includes("MOVE"), uidplus: depois.includes("UIDPLUS") };
  },
};
for (const f of resp) { if (f.uid === null) continue; if (f.flags.includes("\\deleted")) continue; }
