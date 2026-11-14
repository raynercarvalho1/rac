// RAC Inbox · P2 — CORRELAÇÃO das respostas FETCH. Servidor IMAP falso e roteirizado (nenhuma rede, nenhuma conta Apple, valores sentinela).
// Defeito corrigido: antes, QUALQUER segunda resposta "* n FETCH" para o mesmo comando (inclusive uma atualização de flags legítima do servidor)
// derrubava a execução com resposta_inesperada, e chaves repetidas numa resposta eram sobrescritas em silêncio. Agora as respostas da MESMA mensagem
// (o UID pedido) são acumuladas e correlacionadas item a item, com limites: repetição idêntica é idempotente, repetição diferente é
// resposta_conflitante, dado de outro UID ou sem UID é resposta_inesperada, e item não pedido é recusado. Nada é sobrescrito nem descartado em silêncio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { executarP2, montarRespostaP2, ERROS_P2 } from "../experimentos/icloud-auth-probe/src/mensagem.mjs";

const SENHA = "zzzz-yyyy-xxxx-wwww";
const USUARIO = "sentinela.fetch@example.com";
const S = { assunto: "SENTINELA-ASSUNTO-FETCH-7k2", de: "sentinela.fetch.de@exemplo.invalid", texto: "SENTINELA-CORPO-FETCH-9q4", flag: "SENTINELA-FLAG-3m8", modseq: "SENTINELA-MODSEQ-6p1" };
const SENTINELAS = [...Object.values(S), SENHA, USUARIO];
const enc = (x) => Uint8Array.from(Buffer.from(x, "latin1"));

// ---- a mensagem do servidor (texto puro, UID 7) ----
const CAB = "From: <" + S.de + ">\r\nSubject: " + S.assunto + "\r\nDate: Fri, 13 Nov 2026 10:00:00 -0300\r\n\r\n";
const CORPO = S.texto + " linha um\r\nlinha dois\r\n";
const ESTRUTURA = '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "8BIT" ' + CORPO.length + " 2 NIL NIL NIL)";
const SECAO_CAB = "BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID MIME-VERSION CONTENT-TYPE)]<0>";
const lit = (chave, dados) => chave + " {" + dados.length + "}\r\n" + dados;
const resp = (seq, ...itens) => "* " + seq + " FETCH (" + itens.join(" ") + ")\r\n";
const BASE = {
  descoberta: () => resp(1, "UID 7"),
  estrutura: () => resp(1, "UID 7", "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA),
  conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[1]<0>", CORPO)),
};

// servidor: `fases` troca a resposta de uma fase; `pedaco` fragmenta cada resposta em blocos de N bytes; `FECHAR` e `null` como no teste da P2
function servidor(fases = {}, { pedaco = 0, saudacao = "* OK pronto\r\n" } = {}) {
  const enviados = [];
  const F = { ...BASE, ...fases };
  let c;
  const readable = new ReadableStream({ start(x) { c = x; x.enqueue(enc(saudacao)); } });
  const mandar = (texto) => { const b = enc(texto); if (!pedaco) c.enqueue(b); else for (let i = 0; i < b.length; i += pedaco) c.enqueue(b.subarray(i, i + pedaco)); };
  const writable = new WritableStream({
    write(p) {
      const tx = Buffer.from(p).toString("latin1");
      enviados.push(tx);
      const [, tag, verbo, args] = /^(a\d+) ([A-Z]+)(.*)\r\n$/.exec(tx);
      let r;
      if (verbo === "CAPABILITY") r = "* CAPABILITY IMAP4rev1\r\n" + tag + " OK ok\r\n";
      else if (verbo === "LOGIN") r = tag + " OK ok\r\n";
      else if (verbo === "LIST") r = '* LIST (\\HasNoChildren) "/" "RAC-TESTE"\r\n' + tag + " OK ok\r\n";
      else if (verbo === "EXAMINE") r = "* 1 EXISTS\r\n" + tag + " OK [READ-ONLY] ok\r\n";
      else if (verbo === "LOGOUT") r = "* BYE\r\n" + tag + " OK ok\r\n";
      else {
        const fase = verbo === "FETCH" ? "descoberta" : /BODYSTRUCTURE/.test(args) ? "estrutura" : "conteudo";
        const corpo = F[fase](args);
        if (corpo === "FECHAR") { c.close(); return; }
        if (corpo === null) return;
        r = corpo + tag + " OK ok\r\n";
      }
      mandar(r);
    },
  });
  return { socket: { readable, writable, close: async () => { try { c.close(); } catch (_) { /* já fechado */ } } }, enviados };
}
async function rodar(fases, opc = {}, politica = POLITICA, uid = null) {
  const srv = servidor(fases, opc);
  const r = await executarP2({ abrir: async () => srv.socket, usuario: USUARIO, senha: SENHA, uid, politica });
  return { r, srv, resposta: montarRespostaP2(r), verbos: srv.enviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]) };
}
const semVazar = (v, n = "") => { const t = JSON.stringify(v).toLowerCase(); for (const s of SENTINELAS) assert.ok(!t.includes(s.toLowerCase()), "vazamento (" + n + "): " + s.slice(0, 16)); };
const comLimites = (l) => ({ ...POLITICA, p2: { ...POLITICA.p2, ...l } });
const esperaErro = async (nome, fases, erro, opc) => { const x = await rodar(fases, opc); assert.equal(x.resposta.ok, false, nome); assert.equal(x.resposta.erro, erro, nome); semVazar(x.resposta, nome); assert.ok(ERROS_P2.includes(x.resposta.erro)); return x; };

// resultado de referência: uma resposta FETCH válida por comando
const REF = await rodar({});
test("FETCH · uma resposta válida por comando: resultado de referência (comandos, indicadores, sem vazamento)", () => {
  assert.equal(REF.resposta.ok, true);
  assert.deepEqual(REF.verbos, ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "UID", "LOGOUT"]);
  assert.equal(REF.resposta.mensagem.texto_puro.status, "lido"); assert.equal(REF.resposta.mensagem.cabecalhos.from, true);
  semVazar(REF.resposta, "referência");
});

// ---------- o caso real: respostas não solicitadas e legítimas ----------
test("FETCH · CASO REAL: atualizações de flags não solicitadas (da mesma mensagem e de outras) em todas as fases NÃO derrubam a execução e não mudam o resultado", async () => {
  const flagsMesma = resp(1, "UID 7", "FLAGS (\\Seen " + S.flag + ")");
  const flagsSemUid = resp(1, "FLAGS (\\Flagged " + S.flag + ")");
  const outra = resp(2, "FLAGS (\\Answered)") + resp(9, "UID 12", "MODSEQ (" + S.modseq + ")", "FLAGS ()");
  const x = await rodar({
    descoberta: () => flagsSemUid + BASE.descoberta() + resp(5, "FLAGS (\\Seen)"),
    estrutura: () => flagsMesma + BASE.estrutura() + outra,
    conteudo: () => outra + BASE.conteudo() + flagsMesma + flagsSemUid,
  });
  assert.equal(x.resposta.ok, true);
  assert.deepEqual(x.resposta, REF.resposta, "idêntico ao caso sem respostas extras");
  semVazar(x.resposta, "flags não solicitadas"); semVazar(x.r, "resultado interno");
});

// ---------- dados repartidos em várias respostas (legítimo) e ordem ----------
test("FETCH · dados repartidos em várias respostas da MESMA mensagem (cada uma com o UID), em qualquer ordem, dão o mesmo resultado", async () => {
  const a = await rodar({
    estrutura: () => resp(1, "UID 7", "BODYSTRUCTURE " + ESTRUTURA) + resp(1, "UID 7", "RFC822.SIZE 900"),
    conteudo: () => resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) + resp(1, "UID 7", lit(SECAO_CAB, CAB)),
  });
  assert.deepEqual(a.resposta, REF.resposta, "estrutura e conteúdo em duas respostas, ordem trocada");
  const b = await rodar({ conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB)) + resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) });
  assert.deepEqual(b.resposta, REF.resposta, "cabeçalho primeiro, corpo depois");
  const c = await rodar({ descoberta: () => resp(1, "UID 7") + resp(1, "UID 7") });
  assert.deepEqual(c.resposta, REF.resposta, "descoberta com a resposta do UID repetida");
});

// ---------- repetição IDÊNTICA: idempotente ----------
test("FETCH · resposta duplicada IDÊNTICA é idempotente (nenhum conteúdo muda) e conta para o limite de respostas", async () => {
  const x = await rodar({
    descoberta: () => BASE.descoberta() + BASE.descoberta(),
    estrutura: () => BASE.estrutura() + BASE.estrutura(),
    conteudo: () => BASE.conteudo() + resp(1, "UID 7", lit(SECAO_CAB, CAB)) + resp(1, "UID 7", lit("BODY[1]<0>", CORPO)),
  });
  assert.deepEqual(x.resposta, REF.resposta);
  // idêntica dentro da MESMA resposta (item repetido)
  const y = await rodar({ conteudo: () => resp(1, "UID 7", "UID 7", lit("BODY[1]<0>", CORPO), lit("BODY[1]<0>", CORPO), lit(SECAO_CAB, CAB)) });
  assert.deepEqual(y.resposta, REF.resposta);
  // o limite vale também para duplicadas: mais de maxRespostasFetch respostas com dado = limite_excedido
  assert.equal(POLITICA.p2.maxRespostasFetch, 8);
  await esperaErro("9 respostas com dado", { estrutura: () => BASE.estrutura().repeat(9) }, "limite_excedido");
  assert.equal((await rodar({ estrutura: () => BASE.estrutura().repeat(8) })).resposta.ok, true, "8 ainda cabem");
});

// ---------- repetição CONFLITANTE: nunca sobrescreve ----------
test("FETCH · duplicada com conteúdo CONFLITANTE é recusada (resposta_conflitante) em cada tipo de item, entre respostas e dentro da mesma resposta; LOGOUT é feito", async () => {
  const casos = [
    ["cabeçalho diferente", { conteudo: () => BASE.conteudo() + resp(1, "UID 7", lit(SECAO_CAB, CAB + "X-Extra: 1\r\n")) }],
    ["parte diferente", { conteudo: () => BASE.conteudo() + resp(1, "UID 7", lit("BODY[1]<0>", CORPO + "x")) }],
    ["parte diferente por último na mesma resposta", { conteudo: () => resp(1, "UID 7", lit("BODY[1]<0>", CORPO), lit("BODY[1]<0>", "outro\r\n"), lit(SECAO_CAB, CAB)) }],
    ["estrutura diferente", { estrutura: () => BASE.estrutura() + resp(1, "UID 7", 'BODYSTRUCTURE ("TEXT" "HTML" NIL NIL NIL "8BIT" 5 1 NIL NIL NIL)') }],
    ["tamanho diferente", { estrutura: () => BASE.estrutura() + resp(1, "UID 7", "RFC822.SIZE 901") }],
    ["UID repetido com valor diferente na mesma resposta", { estrutura: () => resp(1, "UID 7", "UID 8", "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA) }],
    ["a segunda resposta tenta trocar o cabeçalho depois de uma parte", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB)) + resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) + resp(1, "UID 7", lit(SECAO_CAB, "From: <outro@exemplo.invalid>\r\n\r\n")) }],
  ];
  for (const [nome, fases] of casos) { const x = await esperaErro(nome, fases, "resposta_conflitante"); assert.equal(x.resposta.logout, true, nome + ": encerrou com LOGOUT"); }
});

// ---------- outro UID, sem UID, não pedido ----------
test("FETCH · dado de OUTRO UID, dado SEM UID e item NÃO pedido são recusados; metadado de outro UID é só tolerado, nunca associado", async () => {
  // outro UID com dado, sozinho e misturado com a resposta certa
  await esperaErro("estrutura de outro UID", { estrutura: () => resp(1, "UID 8", "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_inesperada");
  await esperaErro("outro UID junto com o certo", { estrutura: () => BASE.estrutura() + resp(2, "UID 8", "RFC822.SIZE 1", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_inesperada");
  await esperaErro("conteúdo de outro UID", { conteudo: () => resp(1, "UID 8", lit(SECAO_CAB, CAB), lit("BODY[1]<0>", CORPO)) }, "resposta_inesperada");
  await esperaErro("conteúdo de outro UID depois do certo", { conteudo: () => BASE.conteudo() + resp(1, "UID 8", lit("BODY[1]<0>", "enganoso\r\n")) }, "resposta_inesperada");
  await esperaErro("descoberta com dois UIDs distintos", { descoberta: () => resp(1, "UID 7") + resp(2, "UID 8") }, "resposta_inesperada");
  // sem UID: não se associa por ordem nem por número de sequência
  await esperaErro("estrutura sem UID", { estrutura: () => resp(1, "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_inesperada");
  await esperaErro("conteúdo sem UID", { conteudo: () => resp(1, lit(SECAO_CAB, CAB), lit("BODY[1]<0>", CORPO)) }, "resposta_inesperada");
  await esperaErro("parte sem UID depois da resposta certa", { conteudo: () => BASE.conteudo() + resp(1, lit("BODY[1]<0>", "enganoso\r\n")) }, "resposta_inesperada");
  // itens que não pedimos
  await esperaErro("seção não pedida", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[1]<0>", CORPO), lit("BODY[2]<0>", "x")) }, "resposta_inesperada");
  await esperaErro("origem diferente de <0>", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[1]<5>", CORPO)) }, "resposta_inesperada");
  await esperaErro("seção TEXT", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[TEXT]<0>", CORPO)) }, "resposta_inesperada");
  await esperaErro("texto inteiro", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("RFC822.TEXT", CORPO)) }, "resposta_inesperada");
  await esperaErro("envelope", { estrutura: () => resp(1, "UID 7", "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA, 'ENVELOPE ("x" "y")') }, "resposta_inesperada");
  await esperaErro("cabeçalho na fase da estrutura", { estrutura: () => BASE.estrutura() + resp(1, "UID 7", lit(SECAO_CAB, CAB)) }, "resposta_inesperada");
  await esperaErro("estrutura na fase do conteúdo", { conteudo: () => BASE.conteudo() + resp(1, "UID 7", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_inesperada");
  // metadado de OUTRO UID sozinho: tolerado, não é dado da mensagem (e nunca aparece na resposta)
  const ok = await rodar({ estrutura: () => BASE.estrutura() + resp(2, "UID 8", "FLAGS (\\Seen " + S.flag + ")", "MODSEQ (" + S.modseq + ")") });
  assert.deepEqual(ok.resposta, REF.resposta); semVazar(ok.resposta, "metadado de outro UID");
  // UID inexistente continua sendo UID inexistente (resposta só de metadados não o torna existente)
  const inex = await rodar({ estrutura: () => resp(1, "FLAGS (\\Seen)") });
  assert.equal(inex.resposta.erro, "uid_inexistente");
  // pedindo um UID específico, outro UID na resposta é recusado
  const outro = await rodar({ estrutura: () => resp(1, "UID 8", "RFC822.SIZE 9", "BODYSTRUCTURE " + ESTRUTURA) }, {}, POLITICA, 7);
  assert.equal(outro.resposta.erro, "resposta_inesperada");
});

// ---------- malformadas ----------
test("FETCH · respostas malformadas ou ambíguas: UID não inteiro, zero, enorme, lista ímpar, parênteses e item sem valor", async () => {
  await esperaErro("UID entre aspas", { estrutura: () => resp(1, 'UID "7"', "RFC822.SIZE 900", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_malformada");
  await esperaErro("UID zero", { descoberta: () => resp(1, "UID 0") }, "resposta_malformada");
  await esperaErro("UID acima de 32 bits", { descoberta: () => resp(1, "UID 4294967296") }, "resposta_malformada");
  await esperaErro("UID NIL", { descoberta: () => resp(1, "UID NIL") }, "resposta_malformada");
  await esperaErro("item sem valor", { estrutura: () => "* 1 FETCH (UID 7 RFC822.SIZE)\r\n" }, "resposta_malformada");
  await esperaErro("parênteses abertos", { estrutura: () => "* 1 FETCH (UID 7 BODYSTRUCTURE (\"TEXT\"\r\n" }, "resposta_malformada");
  await esperaErro("sobra de parêntese", { estrutura: () => "* 1 FETCH (UID 7))\r\n" }, "resposta_malformada");
  await esperaErro("continuação do servidor", { conteudo: () => "+ envie\r\n" }, "resposta_inesperada");
  await esperaErro("resposta sem dado nenhum na descoberta", { descoberta: () => resp(1, "FLAGS (\\Seen)") }, "resposta_inesperada");
  await esperaErro("estrutura sem tamanho", { estrutura: () => resp(1, "UID 7", "BODYSTRUCTURE " + ESTRUTURA) }, "resposta_inesperada");
  await esperaErro("conteúdo sem cabeçalho", { conteudo: () => resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) }, "mime_invalido");
});

// ---------- fragmentação ----------
test("FETCH · respostas fragmentadas em blocos de 1, 3, 7 e 64 bytes (inclusive dentro de literais e dos marcadores) dão o MESMO resultado", async () => {
  for (const pedaco of [1, 3, 7, 64]) {
    const x = await rodar({}, { pedaco });
    assert.deepEqual(x.resposta, REF.resposta, "pedaço de " + pedaco);
    const y = await rodar({
      estrutura: () => resp(1, "FLAGS (\\Seen)") + resp(1, "UID 7", "BODYSTRUCTURE " + ESTRUTURA) + resp(1, "UID 7", "RFC822.SIZE 900"),
      conteudo: () => resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) + resp(3, "FLAGS (\\Seen)") + resp(1, "UID 7", lit(SECAO_CAB, CAB)),
    }, { pedaco });
    assert.deepEqual(y.resposta, REF.resposta, "repartida e fragmentada, pedaço de " + pedaco);
  }
  // conflito detectado também com fragmentação
  const z = await rodar({ conteudo: () => BASE.conteudo() + resp(1, "UID 7", lit("BODY[1]<0>", CORPO + "!")) }, { pedaco: 5 });
  assert.equal(z.resposta.erro, "resposta_conflitante");
});

// ---------- limites ----------
test("FETCH · limites: respostas com dado, linhas soltas, literal, estrutura e bytes da sessão continuam valendo", async () => {
  await esperaErro("mais de 200 linhas soltas", { conteudo: () => resp(1, "FLAGS ()").repeat(201) + BASE.conteudo() }, "limite_excedido");
  assert.equal((await rodar({ conteudo: () => resp(1, "FLAGS ()").repeat(150) + BASE.conteudo() })).resposta.ok, true, "150 respostas só de metadados cabem");
  await esperaErro("literal maior que o limite do cabeçalho", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, "a".repeat(9000)), lit("BODY[1]<0>", CORPO)) }, "resposta_grande_demais");
  await esperaErro("parte maior que o limite do texto", { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[1]<0>", "a".repeat(40000))) }, "resposta_grande_demais");
  await esperaErro("literais demais numa resposta", { conteudo: () => "* 1 FETCH (UID 7" + (" BODY[1]<0> {1}\r\nx").repeat(40) + ")\r\n" }, "limite_excedido");
  const x = await rodar({}, {}, comLimites({ maxBytes: 400 }));
  assert.equal(x.resposta.erro, "resposta_grande_demais");
  const y = await rodar({}, {}, comLimites({ maxEstruturaBytes: 60 }));
  assert.equal(y.resposta.erro, "resposta_grande_demais");
  const z = await rodar({}, {}, comLimites({ maxRespostasFetch: 1, maxLinhas: 200 }));
  assert.equal(z.resposta.ok, true, "uma resposta por comando cabe em maxRespostasFetch = 1");
  const w = await rodar({ conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB)) + resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) }, {}, comLimites({ maxRespostasFetch: 1 }));
  assert.equal(w.resposta.erro, "limite_excedido", "duas respostas com dado excedem maxRespostasFetch = 1");
});

// ---------- tempo, desconexão, encerramento ----------
test("FETCH · timeout e desconexão no meio de uma segunda resposta; encerramento com LOGOUT depois de erro de correlação", async () => {
  const rapida = comLimites({ timeoutMs: 80 });
  const parcial = BASE.conteudo() + "* 1 FETCH (UID 7 BODY[1]<0> {500}\r\nabc";
  const a = await rodar({ conteudo: () => parcial }, {}, rapida);
  assert.equal(a.resposta.erro, "timeout"); assert.equal(a.resposta.estagio, "mensagem_conteudo"); assert.equal(a.resposta.logout, false);
  const b = await rodar({ conteudo: () => parcial + "FECHAR" });
  // o servidor fecha a conexão sem terminar o literal: a leitura acaba (resposta_inesperada) ou o texto "FECHAR" entra no literal; nos dois casos erro fechado
  assert.equal(b.resposta.ok, false); assert.ok(ERROS_P2.includes(b.resposta.erro)); semVazar(b.resposta, "desconexão");
  const c = await rodar({ conteudo: () => "FECHAR" });
  assert.equal(c.resposta.erro, "resposta_inesperada"); assert.equal(c.resposta.logout, false);
  const d = await rodar({ estrutura: () => BASE.estrutura() + resp(1, "UID 7", "RFC822.SIZE 1") });
  assert.equal(d.resposta.erro, "resposta_conflitante");
  assert.equal(d.resposta.logout, true); assert.equal(d.verbos.at(-1), "LOGOUT", "o LOGOUT é o último comando");
  assert.equal(d.verbos.filter((v) => v === "LOGOUT").length, 1);
});

// ---------- nada de escrita, nada de logs ----------
const CENARIOS = [
  {}, { conteudo: () => BASE.conteudo() + resp(1, "UID 7", lit("BODY[1]<0>", CORPO + "x")) }, { estrutura: () => resp(1, "UID 8", "RFC822.SIZE 9", "BODYSTRUCTURE " + ESTRUTURA) },
  { descoberta: () => resp(1, "FLAGS (\\Seen " + S.flag + ")") + BASE.descoberta() }, { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB)) + resp(1, "UID 7", lit("BODY[1]<0>", CORPO)) }, { estrutura: () => BASE.estrutura().repeat(9) },
];
test("FETCH · NENHUM comando de escrita ou fora da lista é enviado em nenhum cenário (nem depois de resposta conflitante, de outro UID ou duplicada)", async () => {
  const PERMITIDOS = new Set(["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"]);
  for (const f of CENARIOS) {
    const x = await rodar(f);
    assert.ok(x.verbos.every((v) => PERMITIDOS.has(v)), x.verbos.join(","));
    const tudo = x.srv.enviados.join("");
    for (const proibido of ["SELECT", "STORE", "COPY", "MOVE", "EXPUNGE", "DELETE", "APPEND", "CREATE", "RENAME", "SEARCH", "IDLE", "STATUS", "NOOP", "STARTTLS"]) assert.ok(!new RegExp("\\b" + proibido + "\\b").test(tudo), proibido);
    assert.ok(!/BODY\[/.test(tudo) && !/RFC822(?!\.SIZE)/.test(tudo) && !/FLAGS|\\Seen|\\Deleted/.test(tudo), "nenhuma leitura sem PEEK, nenhuma flag");
    assert.equal(x.srv.enviados.filter((e) => /^a\d+ UID FETCH /.test(e)).length <= 2, true, "no máximo dois UID FETCH (estrutura e conteúdo): nada é pedido de novo por causa de respostas extras");
    assert.equal(x.srv.enviados.filter((e) => / LOGIN /.test(e)).length, 1, "uma única tentativa de login");
  }
});

test("FETCH · nenhum dado pessoal em logs, respostas ou resultado interno: o console não é usado e nenhum sentinela aparece", async () => {
  const chamadas = [];
  const originais = {};
  for (const m of ["log", "info", "warn", "error", "debug", "trace"]) { originais[m] = console[m]; console[m] = (...a) => chamadas.push([m, a.length]); }
  let resultados;
  try { resultados = await Promise.all([...CENARIOS, { conteudo: () => "FECHAR" }, { conteudo: () => resp(1, "UID 7", lit(SECAO_CAB, CAB), lit("BODY[1]<0>", CORPO), "FLAGS (" + S.flag + ")") + "* 1 FETCH (UID 7 BODY[1]<0> {9}\r\nSENTINELA" }].map((f) => rodar(f))); }
  finally { for (const m of Object.keys(originais)) console[m] = originais[m]; }
  assert.deepEqual(chamadas, [], "o Worker não usa console");
  for (const x of resultados) { semVazar(x.resposta, "resposta"); semVazar(x.r, "resultado interno"); }
  const fonte = fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/mensagem.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\s+\/\/\s.*$/gm, "");
  assert.ok(!/\bconsole\b|\bprocess\b|\bwaitUntil\b|\bfetch\(|\bconnect\(/.test(fonte), "sem console, process, rede própria nem espera em segundo plano");
});

// ---------- estrutura do código ----------
test("FETCH · o código correlaciona explicitamente: sem a leitura que exige uma única resposta e sem atribuição direta que sobrescreva", () => {
  const f = fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/mensagem.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/lerFetch\b/.test(f) && !/\.length !== 1\) throw new ErroP2\("resposta_inesperada"\)/.test(f.replace(/arvore\.length !== 1/g, "")), "a regra antiga (exatamente uma resposta) foi removida");
  assert.match(f, /function consolidarFetch\(/); assert.match(f, /function mesclar\(destino, campo, valor\)/);
  assert.match(f, /resposta_conflitante/); assert.match(f, /maxRespostasFetch/);
  assert.ok(!/item\.partes\[[^\]]+\] =|item\.uid =|item\.cabecalho =/.test(f), "nenhuma atribuição direta que sobrescreva em silêncio");
  assert.ok(Object.isFrozen(POLITICA.p2) && POLITICA.p2.maxRespostasFetch <= 8);
});
