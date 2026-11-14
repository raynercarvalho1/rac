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

const SENHA = "qwer-asdf-zxcv-poiu"; // sentinelas com o formato; NÃO são credenciais
const USUARIO = "sentinela.contrato@example.com";
const TMPS = [];
process.on("exit", () => { for (const d of TMPS) fs.rmSync(d, { recursive: true, force: true }); });

function sqlDe(db) {
  return { exec(q, ...v) { if (/^\s*CREATE/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...v); return { toArray: () => l }; } };
}
// servidor local: /token (o "GitHub") e /auth-probe (o Worker real, com consumo em SQLite)
async function subirServidor({ runId = "26700000001" } = {}) {
  const db = new DatabaseSync(":memory:");
  const state = { storage: { sql: sqlDe(db), transactionSync: (fn) => fn() } };
  const obj = new ConsumoUnico(state, {}, {});
  const ns = { idFromName: (n) => n, get: () => ({ fetch: (u, i) => obj.fetch(new Request(u, i)) }) };
  const registro = { tokens: [], posts: [], p1Recebido: [] };
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
      const resp = await tratar(pedido, { verificar, consumir: (d) => pedirConsumo(ns, d), executarP1 });
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
  assert.equal([...PASSOS.map(script).join("\n").matchAll(/jq -n /g)].length, 1, "só o passo da P1 monta corpo com credencial");
});
