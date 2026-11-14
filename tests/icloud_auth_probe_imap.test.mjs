// RAC Inbox · POC autenticada iCloud — P1 (IMAP somente leitura): TUDO contra um servidor IMAP FALSO em memória. Nenhuma rede, nenhuma conta Apple,
// nenhuma credencial real (a "senha" é um sentinela com o formato da senha de app). Prova o protocolo, os comandos permitidos e o esquema da resposta;
// NÃO prova o comportamento do servidor real da Apple nem o runtime do Workers (isso é a execução da P1 no workflow).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { executarP1, montarRespostaP1, ERROS_P1, ESTAGIOS_P1 } from "../experimentos/icloud-auth-probe/src/imap.mjs";

const SENHA = "zzzz-yyyy-xxxx-wwww"; // sentinela
const USUARIO = "sentinela.p1@example.com";
const enc = (t) => new TextEncoder().encode(t);
const dec = (b) => new TextDecoder("latin1").decode(b);

// servidor falso: `roteiro(verbo, args, tag)` devolve o texto a enviar (com CRLF), null (silêncio) ou "FECHAR"
function servidorFalso(roteiro, { saudacao = "* OK IMAP4rev1 pronto\r\n" } = {}) {
  const enviados = [];
  let controle;
  const readable = new ReadableStream({ start(c) { controle = c; if (saudacao !== null) c.enqueue(enc(saudacao)); } });
  let fechado = false;
  const writable = new WritableStream({
    write(pedaco) {
      const texto = dec(pedaco);
      enviados.push(texto);
      const m = /^(a\d+) ([A-Z]+)(.*)\r\n$/.exec(texto);
      const resp = m ? roteiro(m[2], m[3], m[1]) : "* BAD formato\r\n";
      if (resp === "FECHAR") { fechado = true; controle.close(); } else if (resp !== null && resp !== undefined) controle.enqueue(enc(resp));
    },
  });
  return { socket: { readable, writable, close: async () => { if (!fechado) { fechado = true; try { controle.close(); } catch (_) { /* já fechado */ } } } }, enviados };
}
const CAPS = "IMAP4rev1 IDLE MOVE UIDPLUS CONDSTORE SPECIAL-USE NAMESPACE ID XAPPLEPUSHSERVICE AUTH=PLAIN";
const LISTA = [
  '* LIST (\\HasNoChildren) "/" "INBOX"', '* LIST (\\HasNoChildren \\Sent) "/" "Sent Messages"', '* LIST (\\HasNoChildren \\Drafts) "/" "Drafts"',
  '* LIST (\\HasNoChildren \\Trash) "/" "Deleted Messages"', '* LIST (\\HasNoChildren \\Junk) "/" "Junk"', '* LIST (\\HasNoChildren \\Archive) "/" "Archive"',
  '* LIST (\\HasChildren) "/" "Pessoal"', '* LIST (\\HasNoChildren) "/" "Pessoal/Banco Secreto"', '* LIST (\\Noselect \\HasChildren) "/" "Contas"', '* LIST (\\HasNoChildren) "/" "RAC-TESTE"',
];
function icloud(opc = {}) {
  const { caps = CAPS, capsPos = CAPS, login = "OK", lista = LISTA, status = {}, extraLogin = "" } = opc;
  return (verbo, args, tag) => {
    if (status[verbo]) return status[verbo](tag);
    if (verbo === "CAPABILITY") return "* CAPABILITY " + (opc._depois ? capsPos : caps) + "\r\n" + tag + " OK CAPABILITY concluído\r\n";
    if (verbo === "LOGIN") { opc._depois = login === "OK"; return extraLogin + tag + " " + login + (login === "OK" ? " LOGIN concluído" : ' [AUTHENTICATIONFAILED] a senha ' + SENHA + ' foi recusada para ' + USUARIO) + "\r\n"; }
    if (verbo === "LIST") return lista.map((l) => l + "\r\n").join("") + tag + " OK LIST concluído\r\n";
    if (verbo === "LOGOUT") return "* BYE até logo\r\n" + tag + " OK LOGOUT concluído\r\n";
    return tag + " BAD comando desconhecido\r\n";
  };
}
async function rodar(roteiro, opcoes = {}, politica = POLITICA) {
  const srv = servidorFalso(roteiro, opcoes.servidor);
  const abertos = [];
  const abrir = opcoes.abrir || (async (host, porta) => { abertos.push([host, porta]); return srv.socket; });
  const r = await executarP1({ abrir, usuario: USUARIO, senha: SENHA, politica });
  return { r, srv, abertos, verbos: srv.enviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]) };
}
const rapida = { ...POLITICA, imap: { ...POLITICA.imap, timeoutMs: 60 } };

test("P1 · sucesso: conecta em imap.mail.me.com:993, consulta capabilities e pastas, faz LOGOUT; comandos na ordem e uma única tentativa de login", async () => {
  const { r, srv, abertos, verbos } = await rodar(icloud());
  assert.deepEqual(abertos, [["imap.mail.me.com", 993]]);
  assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "CAPABILITY", "LIST", "LOGOUT"]);
  assert.equal(srv.enviados.filter((e) => / LOGIN /.test(e)).length, 1, "uma única tentativa de login");
  assert.equal(r.ok, true);
  assert.equal(r.estagio, "concluido");
  assert.equal(r.autenticado, true);
  assert.equal(r.logout, true);
  assert.equal(r.erro, null);
  assert.equal(r.capabilities.idle, true);
  assert.equal(r.capabilities.move, true);
  assert.equal(r.capabilities.special_use, true);
  assert.equal(r.capabilities.auth_plain, true);
  assert.equal(r.capabilities.logindisabled, undefined);
  assert.equal(r.capabilities.login_desabilitado, false);
  assert.equal(r.capabilities.total, CAPS.split(" ").length);
  assert.deepEqual(r.pastas, { total: 10, nao_selecionaveis: 1, com_filhos: 2, uso_especial: { enviados: 1, rascunhos: 1, lixeira: 1, spam: 1, arquivo: 1, todas: 0, sinalizadas: 0, importantes: 0 } });
  assert.equal(r.pasta_teste_existe, true);
});

test("P1 · pasta de teste ausente vira apenas false; sucesso sem pasta de teste continua válido", async () => {
  const { r } = await rodar(icloud({ lista: LISTA.filter((l) => !l.includes("RAC-TESTE")) }));
  assert.equal(r.ok, true);
  assert.equal(r.pasta_teste_existe, false);
  assert.equal(r.pastas.total, 9);
});

test("P1 · a resposta ao cliente NÃO contém nomes de pastas, credencial, texto do servidor nem endereços (esquema fechado)", async () => {
  const { r } = await rodar(icloud());
  const saida = montarRespostaP1(r);
  const texto = JSON.stringify(saida);
  for (const proibido of ["Pessoal", "Banco", "Secreto", "Contas", "Sent Messages", "INBOX", "RAC-TESTE", USUARIO, SENHA, "example.com", "pronto", "concluído", "XAPPLEPUSHSERVICE"]) assert.ok(!texto.includes(proibido), "vazou: " + proibido);
  assert.deepEqual(Object.keys(saida).sort(), ["autenticado", "capabilities", "estagio", "logout", "ok", "operacao", "pasta_teste_existe", "pastas"]);
  assert.equal(saida.operacao, "p1_imap");
  assert.ok(Object.values(saida.capabilities).every((v) => typeof v === "boolean" || Number.isInteger(v)));
});

test("P1 · só os comandos CAPABILITY, LOGIN, LIST e LOGOUT são enviados, em todos os cenários (nenhum comando de leitura de mensagem ou de alteração)", async () => {
  const PROIBIDOS = ["SELECT", "EXAMINE", "FETCH", "STORE", "COPY", "MOVE", "UID", "SEARCH", "EXPUNGE", "APPEND", "CREATE", "DELETE", "RENAME", "SUBSCRIBE", "UNSUBSCRIBE", "STATUS", "IDLE", "NOOP", "CHECK", "CLOSE", "UNSELECT", "AUTHENTICATE", "STARTTLS", "LSUB", "NAMESPACE", "ENABLE", "ID", "SORT", "THREAD", "GETQUOTA"];
  const cenarios = [icloud(), icloud({ login: "NO" }), icloud({ login: "BAD" }), icloud({ caps: CAPS + " LOGINDISABLED" }), icloud({ status: { LIST: (t) => t + " NO falha\r\n" } }), icloud({ status: { CAPABILITY: (t) => t + " BAD\r\n" } })];
  for (const roteiro of cenarios) {
    const { verbos } = await rodar(roteiro);
    for (const v of verbos) { assert.ok(["CAPABILITY", "LOGIN", "LIST", "LOGOUT"].includes(v), "verbo fora da lista: " + v); assert.ok(!PROIBIDOS.includes(v)); }
  }
});

test("P1 · login recusado: UMA tentativa, erro autenticacao_recusada, sem repetir e sem vazar o texto do servidor (que ecoa a credencial)", async () => {
  const { r, srv, verbos } = await rodar(icloud({ login: "NO" }));
  assert.equal(srv.enviados.filter((e) => / LOGIN /.test(e)).length, 1);
  assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "LOGOUT"], "nada de capabilities pós-login nem listagem; só encerra");
  assert.equal(r.ok, false);
  assert.equal(r.autenticado, false);
  assert.equal(r.estagio, "login");
  assert.equal(r.erro, "autenticacao_recusada");
  const saida = montarRespostaP1(r);
  assert.deepEqual(saida, { ok: false, operacao: "p1_imap", estagio: "login", autenticado: false, logout: true, erro: "autenticacao_recusada" });
  assert.ok(!JSON.stringify(saida).includes(SENHA) && !JSON.stringify(saida).includes(USUARIO));
});

test("P1 · LOGINDISABLED: a credencial NEM CHEGA a ser enviada", async () => {
  const { r, srv, verbos } = await rodar(icloud({ caps: CAPS + " LOGINDISABLED" }));
  assert.equal(r.erro, "login_desabilitado");
  assert.deepEqual(verbos, ["CAPABILITY", "LOGOUT"]);
  assert.ok(!srv.enviados.join("").includes(SENHA) && !srv.enviados.join("").includes(USUARIO));
});

test("P1 · a credencial só aparece na linha do LOGIN enviada ao servidor, uma única vez, e nunca em outro lugar (resultado, erros, resposta)", async () => {
  for (const roteiro of [icloud(), icloud({ login: "NO" }), icloud({ login: "BAD" }), icloud({ status: { LIST: (t) => t + " NO " + SENHA + "\r\n" } }), icloud({ status: { CAPABILITY: (t) => "* CAPABILITY " + SENHA + "\r\n" + t + " OK\r\n" } })]) {
    const { r, srv } = await rodar(roteiro);
    const comCredencial = srv.enviados.filter((e) => e.includes(SENHA));
    assert.ok(comCredencial.length <= 1, "a credencial é enviada no máximo uma vez");
    for (const e of comCredencial) assert.match(e, /^a\d+ LOGIN "sentinela\.p1@example\.com" "zzzz-yyyy-xxxx-wwww"\r\n$/);
    const bruto = JSON.stringify(r), saida = JSON.stringify(montarRespostaP1(r));
    for (const s of [bruto, saida]) { assert.ok(!s.includes(SENHA), "senha vazou"); assert.ok(!s.includes(USUARIO), "usuário vazou"); }
  }
});

test("P1 · nenhum console, nenhum log: nada é escrito nem em falhas internas", async () => {
  const chamadas = [];
  const originais = {};
  for (const m of ["log", "info", "warn", "error", "debug", "trace"]) { originais[m] = console[m]; console[m] = (...a) => chamadas.push(a.join(" ")); }
  try {
    for (const roteiro of [icloud(), icloud({ login: "NO" }), icloud({ status: { LIST: () => "lixo sem formato\r\n" } })]) await rodar(roteiro);
    await rodar(icloud(), { abrir: async () => { throw new Error("falhou " + SENHA); } });
  } finally { for (const m of Object.keys(originais)) console[m] = originais[m]; }
  assert.equal(chamadas.length, 0);
});

test("P1 · falhas controladas: cada uma devolve estágio e código de lista fechada, sem repetir o login", async () => {
  const casos = [
    ["saudação inválida", icloud(), { servidor: { saudacao: "* BYE sem serviço\r\n" } }, "saudacao_invalida", "saudacao"],
    ["saudação PREAUTH não é aceita", icloud(), { servidor: { saudacao: "* PREAUTH ok\r\n" } }, "saudacao_invalida", "saudacao"],
    ["CAPABILITY falha", icloud({ status: { CAPABILITY: (t) => t + " NO\r\n" } }), {}, "capability_falhou", "capability_pre"],
    ["login com erro de protocolo", icloud({ login: "BAD" }), {}, "login_erro_protocolo", "login"],
    ["LIST falha", icloud({ status: { LIST: (t) => t + " NO\r\n" } }), {}, "listagem_falhou", "listagem"],
    ["resposta fora de ordem", icloud({ status: { LIST: () => "lixo sem tag\r\n" } }), {}, "resposta_inesperada", "listagem"],
    ["servidor pede literal (+)", icloud({ status: { LIST: () => "+ pronto para literal\r\n" } }), {}, "resposta_inesperada", "listagem"],
    ["conexão cai no meio do LIST", icloud({ status: { LIST: () => "FECHAR" } }), {}, "resposta_inesperada", "listagem"],
  ];
  for (const [nome, roteiro, opc, erro, estagio] of casos) {
    const { r, srv } = await rodar(roteiro, opc);
    assert.equal(r.ok, false, nome);
    assert.equal(r.erro, erro, nome);
    assert.equal(r.estagio, estagio, nome);
    assert.ok(ERROS_P1.includes(r.erro) && ESTAGIOS_P1.includes(r.estagio));
    assert.ok(srv.enviados.filter((e) => / LOGIN /.test(e)).length <= 1, nome + ": no máximo um login");
    assert.equal(montarRespostaP1(r).ok, false);
  }
});

test("P1 · falha de conexão, TLS ou abertura: conexao_falhou, nada enviado", async () => {
  const { r } = await rodar(icloud(), { abrir: async () => { throw new Error("TLS: certificado inválido " + SENHA); } });
  assert.equal(r.erro, "conexao_falhou");
  assert.equal(r.estagio, "conexao");
  assert.equal(r.autenticado, false);
  assert.ok(!JSON.stringify(r).includes(SENHA));
});

test("P1 · timeout: servidor mudo na saudação, no meio da resposta ou na abertura vira erro timeout dentro do prazo", async () => {
  const t0 = Date.now();
  const mudo = await rodar(icloud(), { servidor: { saudacao: null } }, rapida);
  assert.equal(mudo.r.erro, "timeout");
  assert.equal(mudo.r.estagio, "saudacao");
  const meio = await rodar(icloud({ status: { LIST: () => null } }), {}, rapida);
  assert.equal(meio.r.erro, "timeout");
  assert.equal(meio.r.estagio, "listagem");
  assert.equal(meio.r.autenticado, true);
  const abrindo = await rodar(icloud(), { abrir: () => new Promise(() => {}) }, rapida);
  assert.equal(abrindo.r.erro, "timeout");
  assert.ok(Date.now() - t0 < 2000, "não pendura");
});

test("P1 · limites: resposta enorme, linhas demais e literal grande demais são recusados", async () => {
  const gigante = icloud({ lista: ['* LIST (\\HasNoChildren) "/" "' + "x".repeat(POLITICA.imap.maxBytes) + '"'] });
  assert.equal((await rodar(gigante)).r.erro, "resposta_grande_demais");
  const muitas = icloud({ lista: Array.from({ length: POLITICA.imap.maxLinhas + 5 }, (_, i) => '* LIST (\\HasNoChildren) "/" "p' + i + '"') });
  assert.equal((await rodar(muitas)).r.erro, "limite_excedido");
  const literalGrande = icloud({ status: { LIST: (t) => '* LIST (\\HasNoChildren) "/" {99999}\r\n' + t + " OK\r\n" } });
  assert.equal((await rodar(literalGrande)).r.erro, "resposta_grande_demais");
});

test("P1 · nome de pasta enviado como literal do servidor é consumido sem vazar e sem confundir a contagem", async () => {
  const comLiteral = icloud({ status: { LIST: (t) => '* LIST (\\HasNoChildren \\Sent) "/" {12}\r\nPasta Secreta\r\n* LIST (\\HasNoChildren) "/" "RAC-TESTE"\r\n' + t + " OK LIST concluído\r\n" } });
  const { r } = await rodar(comLiteral);
  assert.equal(r.ok, true);
  assert.equal(r.pastas.total, 2);
  assert.equal(r.pastas.uso_especial.enviados, 1);
  assert.equal(r.pasta_teste_existe, true);
  assert.ok(!JSON.stringify(montarRespostaP1(r)).includes("Secreta"));
});

test("P1 · usuário ou senha com aspas, barra ou quebra de linha nunca viram comando (injeção de IMAP)", async () => {
  for (const [u, s] of [['a"b@example.com', SENHA], [USUARIO, 'x" LIST "" "*'], ["a\r\nb@example.com", SENHA], [USUARIO, "a\\b"], ["", SENHA], [USUARIO, ""], [1, SENHA]]) {
    const srv = servidorFalso(icloud());
    const r = await executarP1({ abrir: async () => srv.socket, usuario: u, senha: s });
    assert.equal(r.ok, false);
    assert.equal(r.erro, "comando_nao_permitido");
    assert.equal(srv.enviados.length, 0, "nada foi enviado ao servidor");
  }
});

test("P1 · o socket é sempre fechado e o resultado sempre devolvido (nunca lança)", async () => {
  let fechou = 0;
  const srv = servidorFalso(icloud({ status: { LIST: () => "lixo\r\n" } }));
  const socket = { ...srv.socket, close: async () => { fechou += 1; } };
  const r = await executarP1({ abrir: async () => socket, usuario: USUARIO, senha: SENHA });
  assert.equal(r.ok, false);
  assert.equal(fechou, 1);
});

test("P1 · montarRespostaP1 é fechada mesmo com entrada hostil ou vazia", () => {
  for (const hostil of [undefined, null, {}, { ok: true }, { ok: "sim", estagio: "<script>", erro: SENHA, capabilities: "x", pastas: [1] }, { pastas: { total: 1e12, uso_especial: null }, capabilities: { total: -5 } }]) {
    const saida = montarRespostaP1(hostil);
    const texto = JSON.stringify(saida);
    assert.ok(!texto.includes(SENHA) && !texto.includes("<script>"));
    assert.equal(typeof saida.ok, "boolean");
    assert.ok(ESTAGIOS_P1.includes(saida.estagio));
    if (!saida.ok) assert.ok(ERROS_P1.includes(saida.erro));
  }
});

test("P1 · escopo do código: nenhum comando proibido, nenhum SMTP, só o host e a porta da política, sem logs", () => {
  const ler = (n) => fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/" + n, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/\s.*$/gm, "");
  const imap = ler("imap.mjs"), politica = ler("politica.mjs");
  for (const verbo of ["SELECT", "EXAMINE", "FETCH", "STORE", "COPY", "UID", "SEARCH", "EXPUNGE", "APPEND", "CREATE", "DELETE", "RENAME", "SUBSCRIBE", "STATUS", "IDLE", "NOOP", "AUTHENTICATE", "STARTTLS", "NAMESPACE", "UNSELECT", "CLOSE"])
    assert.ok(!new RegExp("\\b" + verbo + "\\b").test(imap), "verbo proibido no código: " + verbo);
  assert.ok(/VERBOS_PERMITIDOS = Object\.freeze\(\["CAPABILITY", "LOGIN", "LIST", "LOGOUT"\]\)/.test(imap));
  for (const x of [/smtp/i, /console/, /\bfetch\(/, /\bimport\(/, /\beval\(/, /process\.env/]) assert.ok(!x.test(imap), "não deve haver: " + x);
  assert.ok(!/mail\.me\.com/.test(imap), "o host vem só da política");
  assert.match(politica, /host: "imap\.mail\.me\.com", porta: 993/);
  assert.deepEqual([...politica.matchAll(/[a-z0-9.-]+\.mail\.me\.com/g)].map((m) => m[0]), ["imap.mail.me.com"], "nenhum outro host da Apple (SMTP) na política");
});
