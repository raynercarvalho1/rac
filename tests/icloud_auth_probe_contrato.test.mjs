// RAC Inbox · POC autenticada iCloud — CONTRATO workflow -> Worker, de ponta a ponta e SEM rede externa.
// Executa DE VERDADE os passos do job `executar` do workflow (bash + curl + jq, exatamente o texto do .yml) contra um servidor HTTP local que roda o
// `tratar` REAL do Worker (esquema do corpo, uso único com SQLite, resposta de esquema fechado). Só duas peças são simuladas: o token OIDC (um texto
// sintético que o servidor aceita; a validação real do JWT é testada em tests/icloud_auth_probe.test.mjs) e o IMAP (executarP1 devolve um resultado fixo,
// registrando o que recebeu). Nenhuma conexão com a Apple, nenhuma credencial real (só sentinelas), nenhum segredo lido.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { tratar, DETALHES_CORPO } from "../experimentos/icloud-auth-probe/src/rotas.mjs";
import { ConsumoUnico, pedirConsumo } from "../experimentos/icloud-auth-probe/src/consumo.mjs";
import { executarP2 } from "../experimentos/icloud-auth-probe/src/mensagem.mjs";

const raiz = new URL("../", import.meta.url);
const WF = fs.readFileSync(new URL(".github/workflows/icloud-auth-probe.yml", raiz), "utf8").replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
const tem = (c) => spawnSync(c, ["--version"]).status === 0;
const semFerramentas = tem("bash") && tem("jq") && tem("curl") ? false : "bash, jq ou curl não encontrados";

// passos do job executar (mesma extração do teste do workflow)
const JOB = WF.slice(WF.search(/^  executar:\s*$/m));
const PASSOS = [...JOB.matchAll(/^      - /gm)].map((m) => m.index).map((i, k, a) => JOB.slice(i, k + 1 < a.length ? a[k + 1] : JOB.length));
const nomeDe = (p) => (/- name: (.+)/.exec(p) || [, ""])[1].trim();
function script(passo) {
  const m = /\n        run: \|\n((?:          .*\n|\s*\n)+)/.exec(passo.endsWith("\n") ? passo : passo + "\n");
  assert.ok(m, "passo sem run: " + nomeDe(passo));
  return m[1].replace(/^ {10}/gm, "");
}
const PRE = PASSOS.find((p) => nomeDe(p).startsWith("Validar o JWT no Worker"));
const SINT = PASSOS.find((p) => nomeDe(p).startsWith("Prova sintética do uso único"));
const P1 = PASSOS.find((p) => nomeDe(p).startsWith("P1 IMAP"));
const P2 = PASSOS.find((p) => nomeDe(p).startsWith("P2 IMAP"));

const SENHA = "qwer-asdf-zxcv-poiu"; // sentinelas com o formato; NÃO são credenciais
const USUARIO = "sentinela.contrato@example.com";
const TMPS = [];
process.on("exit", () => { for (const d of TMPS) fs.rmSync(d, { recursive: true, force: true }); });

function sqlDe(db) {
  return { exec(q, ...v) { if (/^\s*CREATE/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...v); return { toArray: () => l }; } };
}
// servidor IMAP falso mínimo (só o que a P2 usa): uma mensagem de texto puro com SENTINELAS de conteúdo; o UID 7 existe, os demais não
const SENT = { assunto: "SENTINELA-ASSUNTO-CONTRATO", de: "sentinela.de@exemplo.invalid", texto: "SENTINELA-CORPO-CONTRATO" };
function imapFalso(enviados) {
  const enc = (x) => Uint8Array.from(Buffer.from(x, "latin1"));
  let c;
  const readable = new ReadableStream({ start(x) { c = x; x.enqueue(enc("* OK pronto\r\n")); } });
  const cab = "From: <" + SENT.de + ">\r\nSubject: " + SENT.assunto + "\r\nDate: Fri, 13 Nov 2026 10:00:00 -0300\r\n\r\n";
  const corpo = SENT.texto + "\r\n";
  const estrutura = '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" ' + corpo.length + " 1 NIL NIL NIL)";
  const writable = new WritableStream({
    write(p) {
      const tx = Buffer.from(p).toString("latin1");
      enviados.push(tx);
      const [, tag, verbo, args] = /^(a\d+) ([A-Z]+)(.*)\r\n$/.exec(tx);
      let r = tag + " BAD\r\n";
      if (verbo === "CAPABILITY") r = "* CAPABILITY IMAP4rev1\r\n" + tag + " OK ok\r\n";
      else if (verbo === "LOGIN") r = tag + " OK ok\r\n";
      else if (verbo === "LIST") r = '* LIST (\\HasNoChildren) "/" "RAC-TESTE"\r\n' + tag + " OK ok\r\n";
      else if (verbo === "EXAMINE") r = "* 1 EXISTS\r\n" + tag + " OK [READ-ONLY] ok\r\n";
      else if (verbo === "FETCH") r = "* 1 FETCH (UID 7)\r\n" + tag + " OK ok\r\n";
      else if (verbo === "UID") {
        const x = /^ FETCH (\d+) \((.*)\)$/.exec(args);
        r = tag + " OK ok\r\n";
        if (Number(x[1]) === 7) {
          if (/BODYSTRUCTURE/.test(x[2])) r = "* 1 FETCH (UID 7 RFC822.SIZE 400 BODYSTRUCTURE " + estrutura + ")\r\n" + r;
          else r = "* 1 FETCH (UID 7 BODY[HEADER.FIELDS (FROM SUBJECT DATE)]<0> {" + cab.length + "}\r\n" + cab + " BODY[1]<0> {" + corpo.length + "}\r\n" + corpo + ")\r\n" + r;
        }
      } else if (verbo === "LOGOUT") r = "* BYE\r\n" + tag + " OK ok\r\n";
      c.enqueue(enc(r));
    },
  });
  return { readable, writable, close: async () => { try { c.close(); } catch (_) { /* já fechado */ } } };
}
// servidor local: /token (o "GitHub") e /auth-probe (o Worker real, com consumo em SQLite)
async function subirServidor({ runId = "26700000001", p2Real = false } = {}) {
  const db = new DatabaseSync(":memory:");
  const state = { storage: { sql: sqlDe(db), transactionSync: (fn) => fn() } };
  const obj = new ConsumoUnico(state, {}, {});
  const ns = { idFromName: (n) => n, get: () => ({ fetch: (u, i) => obj.fetch(new Request(u, i)) }) };
  const registro = { tokens: [], posts: [], p1Recebido: [], p2Recebido: [], imapEnviados: [] };
  let n = 0;
  const verificar = async (token) => {
    const m = /^tok\.(.+)\.(\d+)$/.exec(token);
    if (!m) return { ok: false, motivo: "token_invalido" };
    return { ok: true, claims: { aud: m[1], jti: "jti-contrato-" + m[2] + "-xxxxxxxx", run_id: runId, run_attempt: "1" } };
  };
  const executarP1 = async (cred) => {
    registro.p1Recebido.push({ ...cred });
    return { ok: true, estagio: "concluido", autenticado: true, logout: true, capabilities: { total: 5, idle: true }, pastas: { total: 3, nao_selecionaveis: 0, com_filhos: 1, uso_especial: { enviados: 1 } }, pasta_teste_existe: false };
  };
  // P2: por padrão só registra o que recebeu; com p2Real usa o executarP2 REAL do Worker contra um servidor IMAP falso em memória (mensagem com sentinelas)
  const executarP2Falso = async (dados) => {
    registro.p2Recebido.push({ ...dados });
    if (!p2Real) return { ok: true, estagio: "concluido", autenticado: true, logout: true, erro: null, pasta_teste_existe: true, somente_leitura: true, mensagens_na_pasta: 1, mensagem: { cabecalhos: { lidos: true, from: true } } };
    return executarP2({ abrir: async () => imapFalso(registro.imapEnviados), usuario: dados.usuario, senha: dados.senha, uid: dados.uid });
  };
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const partes = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", async () => {
      const corpo = Buffer.concat(partes);
      if (url.pathname === "/token") {
        const aud = url.searchParams.get("audience");
        registro.tokens.push({ audience: aud, auth: req.headers.authorization });
        n += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ value: "tok." + aud + "." + n }));
      }
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(",") : v;
      const pedido = new Request("http://127.0.0.1" + req.url, { method: req.method, headers, body: req.method === "POST" ? corpo : undefined });
      const resp = await tratar(pedido, { verificar, consumir: (d) => pedirConsumo(ns, d), executarP1, executarP2: executarP2Falso });
      const texto = await resp.text();
      registro.posts.push({ metodo: req.method, auth: req.headers.authorization, tipo: req.headers["content-type"], corpo: corpo.toString("utf8"), status: resp.status, resposta: texto });
      res.writeHead(resp.status, { "Content-Type": "application/json" });
      res.end(texto);
    });
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + servidor.address().port;
  return { base, registro, db, fechar: () => new Promise((r) => servidor.close(r)) };
}

// roda um passo do workflow contra o servidor (assíncrono: o servidor vive no mesmo processo)
function rodarPasso(passo, base, extraEnv = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rac-contrato-")); TMPS.push(temp);
  const env = { PATH: process.env.PATH, HOME: temp, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: path.join(temp, "resumo.md"), GITHUB_REF: "refs/heads/main", WORKER_URL: base,
    AUDIENCIA_PREFIXO: POLITICA.audienciaPrefixo.replace(/:$/, ""), ACTIONS_ID_TOKEN_REQUEST_URL: base + "/token?api-version=2.0", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "pedido-sintetico", NO_PROXY: "127.0.0.1", ...extraEnv };
  fs.writeFileSync(env.GITHUB_STEP_SUMMARY, "");
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-e", "-o", "pipefail", "-c", script(passo)], { cwd: temp, env });
    let out = "", err = "";
    proc.stdout.on("data", (d) => { out += d; }); proc.stderr.on("data", (d) => { err += d; });
    proc.on("close", (codigo) => resolve({ codigo, out, err, temp, resumo: fs.readFileSync(env.GITHUB_STEP_SUMMARY, "utf8") }));
  });
}
function todosOsArquivos(dir) { const lista = []; (function v(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? v(path.join(d, e.name)) : lista.push(path.join(d, e.name)); })(dir); return lista; }
const semCredencial = (r, ...segredos) => {
  const tudo = [r.out, r.err, r.resumo, ...todosOsArquivos(r.temp).map((f) => fs.readFileSync(f, "utf8").replace(/^/, ""))].join("\n");
  for (const s of segredos) assert.ok(!tudo.includes(s), "a credencial apareceu em log, resumo ou arquivo: " + s.slice(0, 6) + "…");
};

test("CONTRATO · validar_oidc: o workflow envia exatamente { operacao } e o Worker responde 200 com o esquema esperado", { skip: semFerramentas }, async () => {
  const s = await subirServidor();
  try {
    const r = await rodarPasso(PRE, s.base);
    assert.equal(r.codigo, 0, r.err + r.out);
    assert.deepEqual(s.registro.tokens.map((t) => t.audience), ["rac-inbox-icloud-poc:validar_oidc"]);
    assert.equal(s.registro.posts.length, 1);
    assert.deepEqual(JSON.parse(s.registro.posts[0].corpo), { operacao: "validar_oidc" });
    assert.match(s.registro.posts[0].auth, /^Bearer tok\.rac-inbox-icloud-poc:validar_oidc\.\d+$/);
    assert.match(s.registro.posts[0].tipo, /^application\/json/);
    assert.deepEqual(JSON.parse(s.registro.posts[0].resposta), { ok: true, operacao: "validar_oidc", oidc: "validado", operacao_reconhecida: true });
    assert.equal(s.registro.p1Recebido.length, 0);
  } finally { await s.fechar(); }
});

test("CONTRATO · validar_uso_unico: dez chamadas simultâneas = 1 aceita e 9 recusadas (409), e o replay do mesmo token e de um token novo é recusado", { skip: semFerramentas }, async () => {
  const s = await subirServidor({ runId: "26700000002" });
  try {
    const r = await rodarPasso(SINT, s.base);
    assert.equal(r.codigo, 0, r.err + r.out);
    assert.equal(s.registro.posts.length, 12, "10 simultâneas + 2 replays");
    for (const p of s.registro.posts) assert.deepEqual(JSON.parse(p.corpo), { operacao: "validar_uso_unico" }, "o corpo é sempre exatamente { operacao }");
    assert.equal(s.registro.posts.filter((p) => p.status === 200).length, 1);
    assert.equal(s.registro.posts.filter((p) => p.status === 409).length, 11);
    assert.deepEqual(JSON.parse(s.registro.posts.find((p) => p.status === 200).resposta), { ok: true, operacao: "validar_uso_unico", uso_unico: "consumido", operacao_reconhecida: true });
    assert.ok(s.registro.tokens.every((t) => t.audience === "rac-inbox-icloud-poc:validar_uso_unico"));
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM consumo").get().n, 1, "uma única chave consumida");
    assert.match(r.resumo, /\*\*1 aceita\(s\) \(HTTP 200\)\*\*, \*\*9 recusada\(s\) \(HTTP 409\)\*\*/);
  } finally { await s.fechar(); }
});

test("CONTRATO · p1_imap: o workflow envia EXATAMENTE operacao, usuario e senha; o Worker os aceita e entrega os mesmos valores ao IMAP; uma única chamada", { skip: semFerramentas }, async () => {
  const s = await subirServidor({ runId: "26700000003" });
  try {
    const r = await rodarPasso(P1, s.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA });
    assert.equal(r.codigo, 0, r.err.replaceAll(SENHA, "***") + r.out.replaceAll(SENHA, "***"));
    assert.equal(s.registro.posts.length, 1, "uma única chamada, sem repetição");
    assert.deepEqual(s.registro.tokens.map((t) => t.audience), ["rac-inbox-icloud-poc:p1_imap"]);
    const enviado = JSON.parse(s.registro.posts[0].corpo);
    assert.deepEqual(Object.keys(enviado).sort(), ["operacao", "senha", "usuario"], "os três campos do contrato, nenhum a mais");
    assert.deepEqual(enviado, { operacao: "p1_imap", usuario: USUARIO, senha: SENHA });
    assert.equal(s.registro.posts[0].status, 200);
    assert.deepEqual(s.registro.p1Recebido, [{ usuario: USUARIO, senha: SENHA }]);
    const resp = JSON.parse(s.registro.posts[0].resposta);
    assert.deepEqual(Object.keys(resp).sort(), ["autenticado", "capabilities", "estagio", "logout", "ok", "operacao", "pasta_teste_existe", "pastas"]);
    assert.match(r.resumo, /"autenticado": true/);
    semCredencial(r, SENHA, USUARIO);
    assert.ok(!JSON.stringify(s.registro.posts[0].resposta).includes(SENHA));
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM consumo").get().n, 1);
    assert.ok(!JSON.stringify(s.db.prepare("SELECT * FROM consumo").all()).includes(SENHA), "a credencial não vai ao registro de uso único");
  } finally { await s.fechar(); }
});

test("CONTRATO · p1_imap com segredos salvos com quebra de linha ou espaço nas pontas (como ao colar no GitHub): aceitos, e o Worker usa os valores aparados", { skip: semFerramentas }, async () => {
  for (const [u, p] of [[USUARIO + "\n", SENHA + "\n"], [" " + USUARIO, SENHA + " \r\n"]]) {
    const s = await subirServidor({ runId: "26700000004" });
    try {
      const r = await rodarPasso(P1, s.base, { ICLOUD_USER: u, ICLOUD_APP_PASSWORD: p });
      assert.equal(r.codigo, 0, r.err.replaceAll(SENHA, "***"));
      assert.deepEqual(s.registro.p1Recebido, [{ usuario: USUARIO, senha: SENHA }]);
      semCredencial(r, SENHA, USUARIO);
    } finally { await s.fechar(); }
  }
});

test("CONTRATO · p1_imap com segredo no formato errado: HTTP 400 com o DETALHE do campo, sem vazar o valor, sem chamar o IMAP (reproduz a falha de 14/11/2026, agora diagnosticável)", { skip: semFerramentas }, async () => {
  const casos = [
    ["senha fora do formato", { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: "SenhaPrincipal-123" }, "senha_formato_invalida"],
    ["senha só com letras sem hífens", { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: "qwerasdfzxcvpoiu" }, "senha_formato_invalida"],
    ["senha com espaços no lugar dos hífens", { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: "qwer asdf zxcv poiu" }, "senha_formato_invalida"],
    ["usuário sem o domínio", { ICLOUD_USER: "sentinela.contrato", ICLOUD_APP_PASSWORD: SENHA }, "usuario_formato_invalido"],
    ["usuário com espaço no meio", { ICLOUD_USER: "sentinela contrato@example.com", ICLOUD_APP_PASSWORD: SENHA }, "usuario_formato_invalido"],
  ];
  for (const [nome, segredos, detalhe] of casos) {
    const s = await subirServidor({ runId: "26700000005" });
    try {
      const r = await rodarPasso(P1, s.base, segredos);
      assert.notEqual(r.codigo, 0, nome);
      assert.equal(s.registro.posts.length, 1, nome + ": uma única chamada, sem repetição");
      assert.equal(s.registro.posts[0].status, 400, nome);
      assert.deepEqual(JSON.parse(s.registro.posts[0].resposta), { ok: false, erro: "corpo_invalido", motivo: "esquema_invalido", detalhe }, nome);
      assert.ok(DETALHES_CORPO.includes(detalhe));
      assert.equal(s.registro.p1Recebido.length, 0, nome + ": o IMAP nem é chamado");
      assert.match(r.resumo, new RegExp('"detalhe": "' + detalhe + '"'), nome + ": o resumo do job mostra a regra que falhou");
      assert.match(r.err + r.out, /Nenhuma nova tentativa é feita/);
      semCredencial(r, ...Object.values(segredos).map((v) => v.trim()).filter((v) => v.length > 8));
    } finally { await s.fechar(); }
  }
});

test("CONTRATO · p1_imap sem os secrets: o passo para ANTES de pedir token ou chamar o Worker e não pede nem mostra valor", { skip: semFerramentas }, async () => {
  for (const segredos of [{}, { ICLOUD_USER: USUARIO }, { ICLOUD_APP_PASSWORD: SENHA }, { ICLOUD_USER: "", ICLOUD_APP_PASSWORD: "" }]) {
    const s = await subirServidor();
    try {
      const r = await rodarPasso(P1, s.base, segredos);
      assert.notEqual(r.codigo, 0);
      assert.equal(s.registro.posts.length, 0);
      assert.equal(s.registro.tokens.length, 0);
      assert.match(r.err + r.out, /Faltam os secrets ICLOUD_USER e\/ou ICLOUD_APP_PASSWORD/);
      assert.match(r.err + r.out, /nunca no chat/);
      semCredencial(r, SENHA, USUARIO);
    } finally { await s.fechar(); }
  }
});

test("CONTRATO · contrato exato por HTTP: nomes de campo errados, extras, ausentes, tipos e formatos inválidos recebem 400 com detalhe; operações sem credencial só aceitam operacao", { skip: semFerramentas }, async () => {
  const tabela = [
    ["p1_imap", { operacao: "p1_imap", user: USUARIO, password: SENHA }, "campos_inesperados"],
    ["p1_imap", { operacao: "p1_imap", usuario: USUARIO, senha: SENHA, extra: 1 }, "campos_inesperados"],
    ["p1_imap", { operacao: "p1_imap", usuario: USUARIO }, "campo_ausente_senha"],
    ["p1_imap", { operacao: "p1_imap", senha: SENHA }, "campo_ausente_usuario"],
    ["p1_imap", { operacao: "p1_imap", usuario: 7, senha: SENHA }, "usuario_tipo_invalido"],
    ["p1_imap", { operacao: "p1_imap", usuario: USUARIO, senha: ["x"] }, "senha_tipo_invalida"],
    ["p1_imap", { operacao: "p1_imap", usuario: "sem-arroba", senha: SENHA }, "usuario_formato_invalido"],
    ["p1_imap", { operacao: "p1_imap", usuario: USUARIO, senha: "curta" }, "senha_formato_invalida"],
    ["p1_imap", "{nao json", "corpo_nao_json"],
    ["p1_imap", "[1]", "corpo_nao_objeto"],
    ["p1_imap", { operacao: "validar_oidc", usuario: USUARIO, senha: SENHA }, "campos_inesperados"],
    ["validar_oidc", { operacao: "validar_oidc", usuario: USUARIO, senha: SENHA }, "campos_inesperados"],
    ["validar_uso_unico", { operacao: "validar_uso_unico", usuario: USUARIO }, "campos_inesperados"],
    ["validar_uso_unico", { operacao: "validar_uso_unico", senha: SENHA }, "campos_inesperados"],
    ["validar_uso_unico", {}, "operacao_invalida"],
  ];
  for (const [op, corpo, detalhe] of tabela) {
    const sv = await subirServidor({ runId: "26700000007" });
    try {
      const tk = (await (await fetch(sv.base + "/token?audience=" + POLITICA.audienciaPrefixo + op)).json()).value;
      const r = await fetch(sv.base + "/auth-probe", { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
      const texto = await r.text();
      // operação do corpo diferente da audiência é recusada depois do esquema: aqui o esquema falha primeiro, então é sempre 400
      assert.equal(r.status, 400, op + " " + JSON.stringify(corpo));
      assert.deepEqual(JSON.parse(texto), { ok: false, erro: "corpo_invalido", motivo: "esquema_invalido", detalhe }, JSON.stringify(corpo));
      assert.ok(!texto.includes(SENHA) && !texto.includes(USUARIO), "a resposta nunca devolve a credencial");
      assert.equal(sv.registro.p1Recebido.length, 0);
    } finally { await sv.fechar(); }
  }
});

test("CONTRATO · o corpo do workflow é construído sem campos extras: o programa jq do passo da P1 tem exatamente usuario, senha e operacao, lidos do ambiente", () => {
  const s = script(P1);
  const programa = /jq -n '(\{[^']*\})'/.exec(s)[1];
  assert.equal(programa, '{operacao: "p1_imap", usuario: env.ICLOUD_USER, senha: env.ICLOUD_APP_PASSWORD}');
  assert.deepEqual([...programa.matchAll(/(\w+):/g)].map((m) => m[1]), ["operacao", "usuario", "senha"]);
  assert.ok(!/--data-raw|--data-urlencode|--data '/.test(s), "o corpo vem só da entrada padrão");
  assert.equal([...PASSOS.map(script).join("\n").matchAll(/jq -n /g)].length, 2, "só os passos da P1 e da P2 montam corpo com credencial");
});

// ---------- P2 ----------
const todosSentinelas = (...extra) => [SENT.assunto, SENT.de, SENT.texto, SENHA, USUARIO, ...extra];

test("CONTRATO · p2_imap ponta a ponta (workflow + Worker REAL + IMAP falso), sem UID: lê a última mensagem, uma única chamada, só indicadores no resumo e nenhum sentinela em log, resumo ou arquivo", { skip: semFerramentas }, async () => {
  const s = await subirServidor({ runId: "26700000011", p2Real: true });
  try {
    const r = await rodarPasso(P2, s.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: "" });
    assert.equal(r.codigo, 0, r.err + r.out);
    assert.equal(s.registro.tokens.length, 1);
    assert.equal(s.registro.tokens[0].audience, POLITICA.audienciaPrefixo + "p2_imap");
    assert.equal(s.registro.posts.length, 1, "uma única chamada, sem repetição");
    assert.deepEqual(JSON.parse(s.registro.posts[0].corpo), { operacao: "p2_imap", usuario: USUARIO, senha: SENHA }, "sem UID, o corpo tem só os três campos");
    assert.deepEqual(s.registro.p2Recebido, [{ usuario: USUARIO, senha: SENHA, uid: null }]);
    assert.equal(s.registro.posts[0].status, 200);
    const resp = JSON.parse(s.registro.posts[0].resposta);
    assert.equal(resp.ok, true); assert.equal(resp.operacao, "p2_imap"); assert.equal(resp.mensagem.texto_puro.status, "lido"); assert.equal(resp.mensagem.cabecalhos.from, true);
    assert.equal(resp.somente_leitura_confirmado, true);
    const verbos = s.registro.imapEnviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]);
    assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "UID", "LOGOUT"]);
    assert.ok(!s.registro.imapEnviados.some((e) => /STORE|COPY|MOVE|EXPUNGE|DELETE|APPEND|SELECT|SEARCH|BODY\[/.test(e)), "nenhum comando de escrita ou leitura sem PEEK");
    assert.match(r.resumo, /### P2 · leitura controlada/); assert.match(r.resumo, /a última da pasta/); assert.match(r.resumo, /"somente_leitura_confirmado": true/); assert.match(r.resumo, /"texto_puro"/);
    assert.match(r.out, /P2 concluída/);
    semCredencial(r, ...todosSentinelas());
    for (const x of s.registro.posts) for (const sent of [SENT.assunto, SENT.de, SENT.texto]) assert.ok(!x.resposta.includes(sent), "a resposta HTTP não tem conteúdo da mensagem");
  } finally { await s.fechar(); }
});

test("CONTRATO · p2_imap com UID: o workflow envia o UID como NÚMERO, o Worker o repassa e o IMAP lê aquele UID; UID inexistente vira erro fechado sem vazar nada", { skip: semFerramentas }, async () => {
  const a = await subirServidor({ runId: "26700000012", p2Real: true });
  try {
    const r = await rodarPasso(P2, a.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: "7" });
    assert.equal(r.codigo, 0, r.err + r.out);
    assert.deepEqual(JSON.parse(a.registro.posts[0].corpo), { operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uid: 7 });
    assert.deepEqual(a.registro.p2Recebido, [{ usuario: USUARIO, senha: SENHA, uid: 7 }]);
    assert.deepEqual(a.registro.imapEnviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]), ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "UID", "UID", "LOGOUT"]);
    assert.match(r.resumo, /UID 7/);
    semCredencial(r, ...todosSentinelas());
  } finally { await a.fechar(); }
  const b = await subirServidor({ runId: "26700000013", p2Real: true });
  try {
    const r = await rodarPasso(P2, b.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: "123456" });
    assert.notEqual(r.codigo, 0);
    assert.equal(b.registro.posts[0].status, 502);
    assert.equal(JSON.parse(b.registro.posts[0].resposta).erro, "uid_inexistente");
    assert.equal(b.registro.posts.length, 1, "sem nova tentativa");
    assert.match(r.err + r.out, /Nenhuma nova tentativa é feita/);
    assert.match(r.resumo, /"erro": "uid_inexistente"/);
    semCredencial(r, ...todosSentinelas());
  } finally { await b.fechar(); }
});

test("CONTRATO · p2_imap: UID inválido no workflow (letras, zero, zeros à esquerda, negativo, espaço, muito longo, injeção) para ANTES do token e da chamada", { skip: semFerramentas }, async () => {
  for (const uid of ["12abc", "0", "007", "-5", "1 2", "12345678901", "1;rm -rf /", "$(id)", "1e3", "٣"]) {
    const s = await subirServidor();
    try {
      const r = await rodarPasso(P2, s.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: uid });
      assert.notEqual(r.codigo, 0, JSON.stringify(uid));
      assert.equal(s.registro.tokens.length, 0, "nenhum token pedido"); assert.equal(s.registro.posts.length, 0, "nenhuma chamada ao Worker");
      assert.match(r.err + r.out, /uid_mensagem deve ser um número inteiro positivo/);
      semCredencial(r, SENHA, USUARIO);
    } finally { await s.fechar(); }
  }
});

test("CONTRATO · p2_imap sem os secrets: o passo para antes de pedir token ou chamar o Worker", { skip: semFerramentas }, async () => {
  for (const segredos of [{}, { ICLOUD_USER: USUARIO }, { ICLOUD_APP_PASSWORD: SENHA }, { ICLOUD_USER: "", ICLOUD_APP_PASSWORD: "" }]) {
    const s = await subirServidor();
    try {
      const r = await rodarPasso(P2, s.base, { UID_MENSAGEM: "", ...segredos });
      assert.notEqual(r.codigo, 0);
      assert.equal(s.registro.posts.length, 0); assert.equal(s.registro.tokens.length, 0);
      assert.match(r.err + r.out, /Faltam os secrets ICLOUD_USER e\/ou ICLOUD_APP_PASSWORD/);
      semCredencial(r, SENHA, USUARIO);
    } finally { await s.fechar(); }
  }
});

test("CONTRATO · p2_imap: proteção contra replay (a mesma execução não lê duas vezes, nem com token novo) e esquema do corpo por HTTP (uid fora da faixa, campo extra, pasta vinda do cliente)", { skip: semFerramentas }, async () => {
  const s = await subirServidor({ runId: "26700000014", p2Real: true });
  try {
    const r1 = await rodarPasso(P2, s.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: "" });
    assert.equal(r1.codigo, 0, r1.err + r1.out);
    const r2 = await rodarPasso(P2, s.base, { ICLOUD_USER: USUARIO, ICLOUD_APP_PASSWORD: SENHA, UID_MENSAGEM: "" }); // mesma execução (run_id), token novo
    assert.notEqual(r2.codigo, 0);
    assert.equal(s.registro.posts[1].status, 409);
    assert.deepEqual(JSON.parse(s.registro.posts[1].resposta), { ok: false, erro: "ja_consumido", motivo: "uso_unico" });
    assert.equal(s.registro.p2Recebido.length, 1, "o IMAP só foi acessado uma vez");
    semCredencial(r2, ...todosSentinelas());
  } finally { await s.fechar(); }
  const tabela = [
    [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uid: 0 }, "uid_invalido"], [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uid: 4294967296 }, "uid_invalido"],
    [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uid: "7" }, "uid_invalido"], [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uid: 7.5 }, "uid_invalido"],
    [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, pasta: "INBOX" }, "campos_inesperados"], [{ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, mensagem: 1 }, "campos_inesperados"],
    [{ operacao: "p2_imap", usuario: USUARIO }, "campo_ausente_senha"], [{ operacao: "p2_imap", usuario: USUARIO, senha: "curta" }, "senha_formato_invalida"],
  ];
  for (const [corpo, detalhe] of tabela) {
    const sv = await subirServidor({ runId: "26700000015" });
    try {
      const tk = (await (await fetch(sv.base + "/token?audience=" + POLITICA.audienciaPrefixo + "p2_imap")).json()).value;
      const r = await fetch(sv.base + "/auth-probe", { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const texto = await r.text();
      assert.equal(r.status, 400, JSON.stringify(corpo));
      assert.deepEqual(JSON.parse(texto), { ok: false, erro: "corpo_invalido", motivo: "esquema_invalido", detalhe });
      assert.ok(DETALHES_CORPO.includes(detalhe) && !texto.includes(SENHA) && !texto.includes(USUARIO));
      assert.equal(sv.registro.p2Recebido.length, 0, "o IMAP nem é chamado");
    } finally { await sv.fechar(); }
  }
});

test("CONTRATO · o corpo do passo da P2 é construído sem campos extras: operacao, usuario e senha do ambiente e, só se houver, o uid numérico", () => {
  const s = script(P2);
  const programa = /jq -n --arg uid "\$UID_MENSAGEM" '([^']*)'/.exec(s)[1];
  assert.equal(programa, '{operacao: "p2_imap", usuario: env.ICLOUD_USER, senha: env.ICLOUD_APP_PASSWORD} + (if $uid == "" then {} else {uid: ($uid | tonumber)} end)');
  assert.ok(!/--data-raw|--data-urlencode|--data '/.test(s), "o corpo vem só da entrada padrão");
});
