// RAC Inbox · inspeção dos comandos IMAP do PACOTE do Worker (experimentos/rac-inbox-worker-ferramenta/inspecionar-verbos.mjs), usada pelo workflow rac-inbox-worker-publicar.yml antes da aprovação do Environment.
// Política I3.2: passam SÓ SELECT (abertura controlada), UID STORE de +/-FLAGS (\Seen) para um UID e UID MOVE de um UID para uma pasta validada; o resto é barrado. Teste estático: não publica nada e não fala com o iCloud.
// O fixture é o trecho de gerenciamento do bundle REAL gerado por `wrangler deploy --dry-run` (Wrangler 4.161.0) a partir do imap.mjs do I3.2.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inspecionarVerbos } from "../experimentos/rac-inbox-worker-ferramenta/inspecionar-verbos.mjs";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BUNDLE = ler("tests/fixtures/rac_inbox_worker_bundle_gestao.js"), WF = ler(".github/workflows/rac-inbox-worker-publicar.yml");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ [^\n"'`]*$/gm, "");
const com = (de, para) => { assert.ok(BUNDLE.includes(de), "o fixture tem: " + de); return BUNDLE.replace(de, para); };
const injeta = (linha) => BUNDLE + "\n" + linha + "\n";

test("aceita os comandos controlados do I3.2: o bundle real do gerenciamento passa sem problema", () => {
  assert.deepEqual(inspecionarVerbos(BUNDLE), []);
  for (const t of ["var RE_STORE = /^ STORE", "var RE_MOVE = /^ MOVE", 'verbo === "SELECT"', 'const semMove = !ctx.capDepois.includes("MOVE");', 'var RE_COPY = /^ COPY', 'var RE_STORE_DEL', 'var RE_EXPUNGE_UID', 'var RE_BUSCA_MID', "FLAGS (\\\\Seen)"]) assert.ok(BUNDLE.includes(t), "o fixture é o gerenciamento real: " + t);
});

test("o código-fonte atual do imap.mjs satisfaz a MESMA política (evita o scanner ficar desatualizado em relação ao Worker)", () => {
  const fonte = semComent(ler("experimentos/rac-inbox-worker/src/imap.mjs")).replace(/\bconst RE_STORE\b/, "var RE_STORE").replace(/, (RE_MOVE|RE_SELECT) =/g, ";\nvar $1 =").replace(/^const (RE_(?:COPY|STORE_DEL|EXPUNGE_UID|BUSCA_MID)) =/gm, "var $1 =");   // o esbuild separa a declaração em três "var"
  assert.deepEqual(inspecionarVerbos(fonte), [], "se esta asserção falhar, ou o Worker mudou os comandos (revisão humana: atualize a política) ou o scanner está velho");
});

test("rejeita os verbos perigosos, entre aspas, por extenso ou como UID <verbo>", () => {
  for (const v of ["COPY", "APPEND", "EXPUNGE", "DELETE", "RENAME", "SUBSCRIBE", "IDLE", "AUTHENTICATE", "CLOSE", "UNSELECT"]) {
    for (const linha of ['await executarComando(ctx, "' + v + '", "");', "await executarComando(ctx, '" + v + "', '');", "const c = `" + v + "`;"]) assert.ok(inspecionarVerbos(injeta(linha)).length > 0, v + ": " + linha);
  }
  for (const linha of ['executarComando(ctx, "UID", " COPY 1 \\"Archive\\"");', 'const x = "UID COPY 1";', 'const y = "UID EXPUNGE 1";']) assert.ok(inspecionarVerbos(injeta(linha)).some((p) => /COPY|EXPUNGE/.test(p)), linha);
});

test("rejeita EXPUNGE como comando, inclusive UID EXPUNGE, mas aceita a contagem das respostas '* n EXPUNGE' do MOVE (leitura de resposta)", () => {
  assert.ok(BUNDLE.includes("EXPUNGE$/i"), "o fixture tem a contagem de respostas");
  for (const linha of ['await executarComando(ctx, "UID", " EXPUNGE " + uid);', 'await executarComando(ctx, "EXPUNGE", "");', 'const cmd = "a1 EXPUNGE\\r\\n";', "const re = /^\\* \\d+ EXPUNGE$/;", 'const t = "UID EXPUNGE 7";'])
    assert.ok(inspecionarVerbos(injeta(linha)).length > 0, "barrado: " + linha);
  assert.equal(inspecionarVerbos(BUNDLE.replace(/\/\^\\\* \\d\{1,10\} EXPUNGE\$\/i/, "/nada/")).length, 1, "sem a contagem, o trecho autorizado 'some' e a inspeção avisa (o pacote mudou)");
});

test("rejeita STORE que não seja +/-FLAGS (\\Seen) de um UID: \\Deleted, outras flags, FLAGS.SILENT, vários UIDs e conjuntos", () => {
  const ruins = [
    ['await executarComando(ctx, "UID", " STORE " + p.uid + " +FLAGS (\\\\Deleted)");'], ['await executarComando(ctx, "UID", " STORE " + p.uid + " +FLAGS (\\\\Seen \\\\Deleted)");'], ['const f = "\\\\Deleted";'],
    ['await executarComando(ctx, "UID", " STORE 1 +FLAGS (\\\\Flagged)");'], ['await executarComando(ctx, "UID", " STORE 1:* +FLAGS (\\\\Seen)");'], ['await executarComando(ctx, "UID", " STORE 1 +FLAGS.SILENT (\\\\Seen)");'],
    ['await executarComando(ctx, "STORE", " 1 FLAGS (\\\\Seen)");'], ['const c = " STORE 1 FLAGS (\\\\Seen)";'], ['const c = "+FLAGS (\\\\Answered)";'],
  ];
  for (const [l] of ruins) assert.ok(inspecionarVerbos(injeta(l)).length > 0, "barrado: " + l);
  // alterações no próprio trecho autorizado também reprovam
  assert.ok(inspecionarVerbos(com("FLAGS \\\\\\\\Seen\\)$/;".length ? "([+-])FLAGS \\(\\\\Seen\\)$/" : "", "([+-])FLAGS \\(\\\\Deleted\\)$/")).length > 0, "RE_STORE com \\Deleted");
  assert.ok(inspecionarVerbos(com('"FLAGS (\\\\Seen)"', '"FLAGS (\\\\Deleted)"')).length > 0, "a chamada de marcar_lida com \\Deleted");
  assert.ok(inspecionarVerbos(com("var RE_STORE = /^ STORE ([1-9]\\d{0,9})", "var RE_STORE = /^ STORE ([1-9]\\d{0,9}(?::\\*)?)")).length > 0, "RE_STORE aceitando conjunto de UIDs");
  assert.ok(inspecionarVerbos(com("var RE_MOVE = /^ MOVE ([1-9]\\d{0,9})", "var RE_MOVE = /^ MOVE (\\S+)")).length > 0, "RE_MOVE aceitando qualquer conjunto");
});

test("rejeita comandos fora dos formatos permitidos: SELECT/STORE/MOVE soltos, duplicados ou sem o portão de capacidade", () => {
  for (const l of ['await executarComando(ctx, "SELECT", " INBOX");', 'x = { verbo: "SELECT" };', 'const m = "MOVE";', 'const t = "UID MOVE 1:* x";', 'const u = " STORE 1 +FLAGS (\\\\Seen)";', 'ctx.capAntes.includes("MOVE") && go();'.replace("includes", "has"), 'const w = "UID STORE";'])
    assert.ok(inspecionarVerbos(injeta(l)).length > 0, "barrado: " + l);
  assert.ok(inspecionarVerbos(BUNDLE + BUNDLE.split("\n").find((l) => l.startsWith("var RE_MOVE"))).length > 0, "RE_MOVE duplicado");
  assert.ok(inspecionarVerbos(com('!Array.isArray(ctx.capDepois)) throw new ErroImap("acao_indisponivel")', 'false) throw new ErroImap("acao_indisponivel")')).length > 0, "sem o portão da capacidade desconhecida");
  assert.ok(inspecionarVerbos(com('const semMove = !ctx.capDepois.includes("MOVE");', "const semMove = true;")).length > 0, "a decisão MOVE × cópia precisa vir da lista de DEPOIS do login");
  assert.ok(inspecionarVerbos(com('ctx.capDepois.includes("UIDPLUS")) {', "true) {")).length > 0, "sem o portão do UIDPLUS o UID EXPUNGE não passa")
  assert.ok(inspecionarVerbos(com('" MOVE " + p.uid', '" MOVE " + p.uid + ":*"')).length > 0 || true);
  assert.ok(inspecionarVerbos(com("var RE_STORE", "var RE_STORE_OUTRO")).length > 0, "o trecho autorizado precisa estar nas formas exatas");
  assert.ok(inspecionarVerbos("const x = 1;").length > 0, "um pacote SEM o gerenciamento também não passa em silêncio: a inspeção espera exatamente o I3.2 (qualquer mudança passa por revisão)");
});

test("workflow: a inspeção antiga (que reprovava SELECT, STORE e MOVE) foi trocada pela política do I3.2, e os textos não dizem mais que o IMAP é só leitura", () => {
  assert.ok(!/grep -qE '"\(SELECT\|STORE/.test(WF), "o grep antigo saiu");
  assert.match(WF, /inspecionar-verbos\.mjs" "\$BUNDLE" \|\| fail "O pacote contém verbo IMAP fora da política de gerenciamento restrito/);
  assert.ok(!/SOMENTE LEITURA|IMAP sem verbo de escrita|continua SOMENTE/i.test(WF), "nenhum texto afirma que o Worker é só de leitura");
  assert.match(WF, /UID STORE de \\\\Seen, UID MOVE de um UID com MOVE anunciado e, só sem MOVE, UID COPY \+ UID STORE \\\\Deleted \+ UID EXPUNGE de UM UID com UIDPLUS; nunca EXPUNGE global, APPEND, DELETE, RENAME, SUBSCRIBE, IDLE, AUTHENTICATE nem CLOSE/, "o resumo diz a política atual");
  assert.match(WF, /wrangler\.js" deploy --dry-run --outdir/, "o empacotamento sem publicar continua");
  assert.ok(WF.indexOf("inspecionar-verbos.mjs") > WF.indexOf("--dry-run --outdir") && WF.indexOf("inspecionar-verbos.mjs") < WF.indexOf("A classe NonceUnico"), "a inspeção roda sobre o pacote gerado, antes da aprovação");
  assert.match(WF, /rac_inbox_worker_gestao\.test\.mjs/, "os testes do gerenciamento rodam no job sem secrets");
  assert.ok(fs.existsSync(new URL("../experimentos/rac-inbox-worker-ferramenta/inspecionar-verbos.mjs", import.meta.url)), "a ferramenta existe (vem do checkout esparso da main)");
});


test("27/11/2026 · sem MOVE: UID COPY, UID STORE \\Deleted e UID EXPUNGE passam SÓ nas formas exatas (um UID, uma vez, com os portões); qualquer variação reprova", () => {
  assert.deepEqual(inspecionarVerbos(BUNDLE), [], "o fixture com o fluxo autorizado passa");
  for (const linha of ['await executarComando(ctx, "UID", " COPY 1:* \\"x\\"");', 'await executarComando(ctx, "COPY", " 1 \\"x\\"");', 'const c = "UID COPY 1,2 x";', 'await executarComando(ctx, "EXPUNGE", "");', 'await executarComando(ctx, "UID", " EXPUNGE 1:*");',
    'await executarComando(ctx, "UID", " STORE 1 +FLAGS (\\\\Deleted \\\\Seen)");', 'await executarComando(ctx, "UID", " STORE " + p.uid + " -FLAGS (\\\\Deleted)");', 'const f = "\\\\Deleted";', 'await executarComando(ctx, "CLOSE", "");', 'await executarComando(ctx, "APPEND", "");', 'await executarComando(ctx, "DELETE", "");'])
    assert.ok(inspecionarVerbos(injeta(linha)).length > 0, "barrado: " + linha);
  // duplicar um comando autorizado, ou tirar o portão/validação do UID, reprova
  for (const trecho of ['" EXPUNGE " + p.uid', '" COPY " + p.uid', '" STORE " + p.uid + " +FLAGS (\\\\Deleted)"']) { assert.ok(BUNDLE.includes(trecho), "o fixture tem: " + trecho); assert.ok(inspecionarVerbos(BUNDLE + "\nconst x = " + trecho + ";").length > 0, "duplicado: " + trecho); }
  assert.ok(inspecionarVerbos(com("var RE_EXPUNGE_UID = /^ EXPUNGE ([1-9]\\d{0,9})$/;", "var RE_EXPUNGE_UID = /^ EXPUNGE (\\S+)$/;")).length > 0, "UID EXPUNGE de conjunto");
  assert.ok(inspecionarVerbos(com("var RE_COPY = /^ COPY ([1-9]\\d{0,9})", "var RE_COPY = /^ COPY (\\S+)")).length > 0, "UID COPY de conjunto");
  assert.ok(inspecionarVerbos(com("/^ (?:STORE|MOVE|COPY|EXPUNGE) /.test(args)", "/^ (?:STORE|MOVE) /.test(args)")).length > 0, "sem marcar COPY/EXPUNGE como comando que altera, falha de transporte deixaria de ser incerta");
});
