// RAC Inbox · POC autenticada iCloud — P2 (leitura controlada de UMA mensagem da pasta RAC-TESTE, somente leitura).
// TUDO contra um servidor IMAP FALSO em memória: nenhuma rede, nenhuma conta Apple, nenhuma credencial real (usuário e senha são sentinelas) e nenhuma
// mensagem real (assuntos, endereços, textos e anexos são sentinelas fabricados aqui). Prova o protocolo, os comandos permitidos, o MIME, os limites e o
// esquema fechado da resposta; NÃO prova o comportamento do servidor real da Apple nem o runtime do Workers (isso é a execução real da P2).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { ConsumoUnico, pedirConsumo } from "../experimentos/icloud-auth-probe/src/consumo.mjs";
import { tratar, examinarCorpo } from "../experimentos/icloud-auth-probe/src/rotas.mjs";
import { executarP2, montarRespostaP2, comandoPermitido, ERROS_P2, ESTAGIOS_P2, STATUS_PARTE } from "../experimentos/icloud-auth-probe/src/mensagem.mjs";
import {
  lerSexp, analisarEstrutura, classificarPartes, decodificarTransferencia, decodificarTexto, estatisticasTexto, indicadoresHtml, analisarCabecalhos, detectarTipo, tipoConfere,
} from "../experimentos/icloud-auth-probe/src/mime.mjs";

const SENHA = "zzzz-yyyy-xxxx-wwww"; // sentinela
const USUARIO = "sentinela.p2@example.com";
// sentinelas de CONTEÚDO: se qualquer um aparecer numa resposta, houve vazamento
const S = {
  assunto: "SENTINELA-ASSUNTO-9f3k", de: "sentinela.remetente@exemplo.invalid", para: "sentinela.destino@exemplo.invalid", texto: "SENTINELA-CORPO-TEXTO-4d8h", html: "SENTINELA-CORPO-HTML-2m7p",
  arquivo: "SENTINELA-ARQUIVO-8w1z", anexo: "SENTINELA-ANEXO-5t6y", pasta: "Pessoal/Banco Secreto", msgid: "SENTINELA-ID-1c2d",
};
const TODOS_SENTINELAS = [...Object.values(S), SENHA, USUARIO];
const b64 = (t, quebra = 76) => Buffer.from(t, "latin1").toString("base64").replace(new RegExp("(.{" + quebra + "})", "g"), "$1\r\n");
const utf8 = (t) => Buffer.from(t, "utf8").toString("latin1"); // texto UTF-8 como "string de bytes" (o servidor falso fala latin1)

// ---------- servidor IMAP falso (fala bytes/latin1) ----------
const enc = (t) => Uint8Array.from(Buffer.from(t, "latin1"));
const dec = (b) => Buffer.from(b).toString("latin1");
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

// parte MIME folha: devolve { estrutura (texto BODYSTRUCTURE), dados (o que o servidor guarda) }
function folha(tipo, subtipo, { params = "NIL", codificacao = "7BIT", dados = "", disp = "NIL", id = "NIL" } = {}) {
  const linhas = tipo === "TEXT" ? " " + (dados.split("\n").length) : "";
  return { estrutura: '("' + tipo + '" "' + subtipo + '" ' + params + " " + id + ' NIL "' + codificacao + '" ' + dados.length + linhas + " NIL " + disp + " NIL NIL)", dados };
}
const multi = (subtipo, ...filhos) => ({ estrutura: "(" + filhos.map((f) => f.estrutura).join("") + ' "' + subtipo + '" ("BOUNDARY" "limite-sentinela") NIL NIL)', filhos });
const CAB = (extra = {}) => ["From: Sentinela <" + S.de + ">", "To: " + S.para, "Subject: " + S.assunto, "Date: Fri, 13 Nov 2026 10:00:00 -0300", "Message-ID: <" + S.msgid + "@exemplo.invalid>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", ""].join("\r\n").replace(/^(.*)$/s, (t) => { for (const [k, v] of Object.entries(extra)) t = t.replace(new RegExp("^" + k + ":.*\\r\\n", "m"), v === null ? "" : k + ": " + v + "\r\n"); return t; }) + "\r\n";

// monta a "mensagem do servidor" a partir da árvore de partes: caminhos IMAP calculados como o servidor real faria
function mensagem(raiz, { uid = 7, cab = CAB(), tamanho = null } = {}) {
  const partes = {};
  if (raiz.filhos) (function visitar(no, prefixo) { no.filhos.forEach((f, i) => { const c = prefixo ? prefixo + "." + (i + 1) : String(i + 1); if (f.filhos) visitar(f, c); else partes[c] = f.dados; }); })(raiz, "");
  else partes["1"] = raiz.dados;
  return { uid, cab, estrutura: raiz.estrutura, partes, tamanho: tamanho === null ? 1000 + Object.values(partes).reduce((s, d) => s + d.length, 0) : tamanho };
}
function respostaFetch(m, itens, seq = 1) {
  let out = "* " + seq + " FETCH (UID " + m.uid;
  if (/RFC822\.SIZE/.test(itens)) out += " RFC822.SIZE " + m.tamanho;
  if (/BODYSTRUCTURE/.test(itens)) out += " BODYSTRUCTURE " + m.estrutura;
  for (const x of itens.matchAll(/BODY\.PEEK\[([^\]]+)\]<0\.(\d+)>/g)) {
    const dados = x[1].startsWith("HEADER.FIELDS") ? m.cab : (m.partes[x[1]] === undefined ? "" : m.partes[x[1]]);
    const pedaco = dados.slice(0, Number(x[2]));
    out += " BODY[" + x[1] + "]<0> {" + pedaco.length + "}\r\n" + pedaco;
  }
  return out + ")\r\n";
}
const CAPS = "IMAP4rev1 IDLE MOVE UIDPLUS CONDSTORE SPECIAL-USE NAMESPACE ID AUTH=PLAIN";
// roteiro do iCloud falso. opc.msgs: mensagens da pasta (por UID); opc.pasta: false (sem a pasta de teste) ou "noselect"; opc.existentes: força o EXISTS.
function icloud(opc = {}) {
  const { msgs = [], login = "OK", pasta = true, existentes = null, status = {}, caps = CAPS, extra = {} } = opc;
  return (verbo, args, tag) => {
    if (status[verbo]) { const r = status[verbo](args, tag); if (r !== undefined) return r; }
    if (verbo === "CAPABILITY") return "* CAPABILITY " + caps + "\r\n" + tag + " OK CAPABILITY concluído\r\n";
    if (verbo === "LOGIN") return tag + " " + login + (login === "OK" ? " LOGIN concluído" : " [AUTHENTICATIONFAILED] a senha " + SENHA + " foi recusada para " + USUARIO) + "\r\n";
    if (verbo === "LIST") {
      if (pasta === false) return tag + " OK LIST concluído\r\n";
      return '* LIST (' + (pasta === "noselect" ? "\\Noselect" : "\\HasNoChildren") + ') "/" "RAC-TESTE"\r\n' + tag + " OK LIST concluído\r\n";
    }
    if (verbo === "EXAMINE") return "* " + (existentes === null ? msgs.length : existentes) + " EXISTS\r\n* OK [UIDVALIDITY 1700000000] ok\r\n* OK [UIDNEXT 99] ok\r\n" + tag + " OK [READ-ONLY] EXAMINE concluído\r\n";
    if (verbo === "FETCH") { const m = msgs[msgs.length - 1]; return (m ? "* " + msgs.length + " FETCH (UID " + m.uid + ")\r\n" : "") + tag + " OK FETCH concluído\r\n"; }
    if (verbo === "UID") {
      const x = /^ FETCH (\d+) \((.*)\)$/.exec(args);
      const m = msgs.find((y) => y.uid === Number(x[1]));
      return (m ? (extra.antes || "") + respostaFetch(m, x[2], msgs.indexOf(m) + 1) : "") + tag + " OK UID FETCH concluído\r\n";
    }
    if (verbo === "LOGOUT") return "* BYE até logo\r\n" + tag + " OK LOGOUT concluído\r\n";
    return tag + " BAD comando desconhecido\r\n";
  };
}
async function rodar(roteiro, { politica = POLITICA, uid = null, usuario = USUARIO, senha = SENHA, servidor } = {}) {
  const srv = servidorFalso(roteiro, servidor);
  const abertos = [];
  const r = await executarP2({ abrir: async (h, p) => { abertos.push([h, p]); return srv.socket; }, usuario, senha, uid, politica });
  return { r, srv, abertos, resposta: montarRespostaP2(r), verbos: srv.enviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]) };
}
const comLimites = (l) => ({ ...POLITICA, p2: { ...POLITICA.p2, ...l } });
const semVazar = (valor, nome = "") => { const t = JSON.stringify(valor).toLowerCase(); for (const s of TODOS_SENTINELAS) assert.ok(!t.includes(s.toLowerCase()), "vazamento de " + nome + ": " + s.slice(0, 14) + "…"); };

// ---------- mensagens de exemplo ----------
const TEXTO_UTF8 = utf8(S.texto + " acentuação: ção, é, ü\r\nsegunda linha\r\n");
const HTML_QP = "<html><body><p>" + S.html + " =C3=A7=C3=A3o</p><script>x()</script><img src=3D\"https://rastreio.exemplo.invalid/p.gif\"></body></html>\r\n";
const PDF = "%PDF-1.4\r\n" + S.anexo + "\r\n%%EOF\r\n";
const PLAIN = () => mensagem(folha("TEXT", "PLAIN", { params: '("CHARSET" "utf-8")', codificacao: "8BIT", dados: TEXTO_UTF8 }));
const HTML = () => mensagem(folha("TEXT", "HTML", { params: '("CHARSET" "utf-8")', codificacao: "QUOTED-PRINTABLE", dados: HTML_QP }));
const ALT = () => mensagem(multi("ALTERNATIVE",
  folha("TEXT", "PLAIN", { params: '("CHARSET" "UTF-8")', codificacao: "BASE64", dados: b64(TEXTO_UTF8) }),
  folha("TEXT", "HTML", { params: '("CHARSET" "UTF-8")', codificacao: "QUOTED-PRINTABLE", dados: HTML_QP })));
const COM_ANEXO = (anexo = PDF, extra = {}) => mensagem(multi("MIXED",
  multi("ALTERNATIVE",
    folha("TEXT", "PLAIN", { params: '("CHARSET" "UTF-8")', codificacao: "BASE64", dados: b64(TEXTO_UTF8) }),
    folha("TEXT", "HTML", { params: '("CHARSET" "UTF-8")', codificacao: "QUOTED-PRINTABLE", dados: HTML_QP })),
  folha("APPLICATION", "PDF", { params: '("NAME" "' + S.arquivo + '.pdf")', codificacao: "BASE64", dados: b64(anexo), disp: '("ATTACHMENT" ("FILENAME" "' + S.arquivo + '.pdf"))', ...extra })));

// ================= fluxo feliz, por tipo de mensagem =================

test("P2 · texto puro: conecta, abre RAC-TESTE em somente leitura, lê UMA mensagem (a última) e devolve só indicadores", async () => {
  const { r, resposta, abertos, verbos } = await rodar(icloud({ msgs: [PLAIN()] }));
  assert.deepEqual(abertos, [["imap.mail.me.com", 993]]);
  assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "UID", "LOGOUT"]);
  assert.equal(r.ok, true);
  assert.equal(resposta.estagio, "concluido");
  assert.equal(resposta.autenticado, true); assert.equal(resposta.logout, true);
  assert.equal(resposta.pasta_teste_existe, true); assert.equal(resposta.somente_leitura_confirmado, true); assert.equal(resposta.mensagens_na_pasta, 1);
  const m = resposta.mensagem;
  assert.equal(m.multipart, false); assert.equal(m.multipart_subtipo, null); assert.equal(m.partes, 1);
  assert.deepEqual(m.cabecalhos, { lidos: true, bytes: m.cabecalhos.bytes, truncado: false, campos: 7, linhas_invalidas: 0, from: true, to: true, cc: false, assunto: true, data: true, data_valida: true, message_id: true, mime_version: true, assunto_codificado: false });
  assert.equal(m.texto_puro.presente, true); assert.equal(m.texto_puro.status, "lido"); assert.equal(m.texto_puro.charset, "utf-8"); assert.equal(m.texto_puro.linhas, 2);
  assert.equal(m.texto_puro.caracteres, (S.texto + " acentuação: ção, é, ü\r\nsegunda linha\r\n").length); assert.equal(m.texto_puro.caracteres_invalidos, false); assert.equal(m.texto_puro.truncado, false);
  assert.equal(m.html.presente, false); assert.equal(m.html.status, "nao_presente");
  assert.deepEqual(m.anexos, { total: 0, inline: 0, bytes_total: 0, maior_bytes: 0, categorias: { imagem: 0, pdf: 0, texto: 0, audio: 0, video: 0, mensagem: 0, aplicacao: 0, outro: 0 } });
  assert.deepEqual(m.anexo_lido, { tentado: false, status: "nao_presente", tamanho_codificado: 0, bytes_decodificados: 0, tipo_detectado: null, tipo_confere: null });
  semVazar(resposta, "texto puro");
});

test("P2 · HTML (quoted-printable): decodifica e só marca indicadores (script, imagem remota); nunca devolve o HTML", async () => {
  const { resposta } = await rodar(icloud({ msgs: [HTML()] }));
  const h = resposta.mensagem.html;
  assert.equal(resposta.ok, true);
  assert.equal(h.presente, true); assert.equal(h.status, "lido"); assert.equal(h.charset, "utf-8");
  assert.equal(h.tem_script, true); assert.equal(h.tem_imagem_remota, true); assert.equal(h.tem_formulario, false); assert.equal(h.tem_iframe, false);
  assert.equal(resposta.mensagem.texto_puro.presente, false);
  semVazar(resposta, "html");
});

test("P2 · multipart/alternative (texto + HTML em base64/QP): as duas partes lidas, sem anexos", async () => {
  const { resposta, srv } = await rodar(icloud({ msgs: [ALT()] }));
  const m = resposta.mensagem;
  assert.equal(resposta.ok, true);
  assert.equal(m.multipart, true); assert.equal(m.multipart_subtipo, "alternative"); assert.equal(m.partes, 2); assert.equal(m.profundidade, 2);
  assert.equal(m.texto_puro.status, "lido"); assert.equal(m.html.status, "lido"); assert.equal(m.html.tem_script, true);
  assert.equal(m.anexos.total, 0); assert.equal(m.anexo_lido.status, "nao_presente");
  const conteudo = srv.enviados.find((e) => /BODY\.PEEK\[1\]/.test(e));
  assert.match(conteudo, /BODY\.PEEK\[HEADER\.FIELDS \(FROM TO CC SUBJECT DATE MESSAGE-ID MIME-VERSION CONTENT-TYPE\)\]<0\.8192> BODY\.PEEK\[1\]<0\.32768> BODY\.PEEK\[2\]<0\.32768>\)/);
  semVazar(resposta, "multipart");
});

test("P2 · multipart/mixed com anexo PDF pequeno: identifica, lê os bytes e devolve só tipo detectado, tamanhos e contagens (sem nome de arquivo)", async () => {
  const { resposta, srv } = await rodar(icloud({ msgs: [COM_ANEXO()] }));
  const m = resposta.mensagem;
  assert.equal(resposta.ok, true);
  assert.equal(m.multipart_subtipo, "mixed"); assert.equal(m.partes, 3); assert.equal(m.profundidade, 3);
  assert.equal(m.anexos.total, 1); assert.equal(m.anexos.inline, 0); assert.equal(m.anexos.categorias.pdf, 1); assert.equal(m.anexos.maior_bytes, b64(PDF).length);
  assert.deepEqual(m.anexo_lido, { tentado: true, status: "lido", tamanho_codificado: b64(PDF).length, bytes_decodificados: PDF.length, tipo_detectado: "pdf", tipo_confere: true });
  assert.match(srv.enviados.find((e) => /BODY\.PEEK\[2\]/.test(e)), /BODY\.PEEK\[1\.1\]<0\.32768> BODY\.PEEK\[1\.2\]<0\.32768> BODY\.PEEK\[2\]<0\.24576>\)/);
  semVazar(resposta, "anexo");
});

test("P2 · anexo de tipo declarado errado: a assinatura dos bytes é detectada e tipo_confere vira false", async () => {
  const png = "\x89PNG\r\n\x1a\n" + S.anexo;
  const m = COM_ANEXO(png, {});
  m.estrutura = m.estrutura.replace('"APPLICATION" "PDF"', '"APPLICATION" "PDF"');
  const { resposta } = await rodar(icloud({ msgs: [m] }));
  assert.equal(resposta.mensagem.anexo_lido.tipo_detectado, "png");
  assert.equal(resposta.mensagem.anexo_lido.tipo_confere, false);
});

test("P2 · anexo grande demais (acima do limite codificado): não é pedido ao servidor, só contado; sem anexo nenhum fica nao_presente", async () => {
  const grande = "%PDF" + "x".repeat(30000);
  const m = COM_ANEXO(grande);
  const { resposta, srv } = await rodar(icloud({ msgs: [m] }));
  assert.equal(resposta.ok, true);
  assert.equal(resposta.mensagem.anexos.total, 1);
  assert.deepEqual(resposta.mensagem.anexo_lido, { tentado: false, status: "grande_demais", tamanho_codificado: 0, bytes_decodificados: 0, tipo_detectado: null, tipo_confere: null });
  assert.ok(!srv.enviados.some((e) => /BODY\.PEEK\[2\]/.test(e)), "os bytes do anexo grande nem foram pedidos");
});

test("P2 · só lê o PRIMEIRO anexo que cabe (anexos embutidos por último) e conta o resto", async () => {
  const dois = mensagem(multi("MIXED",
    folha("TEXT", "PLAIN", { dados: "oi\r\n" }),
    folha("IMAGE", "PNG", { codificacao: "BASE64", dados: b64("\x89PNG\r\n\x1a\nabc"), disp: '("INLINE" NIL)', id: '"<cid1>"' }),
    folha("APPLICATION", "ZIP", { params: '("NAME" "x.zip")', codificacao: "BASE64", dados: b64("PK\x03\x04conteudo"), disp: '("ATTACHMENT" ("FILENAME" "x.zip"))' })));
  const { resposta, srv } = await rodar(icloud({ msgs: [dois] }));
  assert.equal(resposta.mensagem.anexos.total, 2); assert.equal(resposta.mensagem.anexos.inline, 1);
  assert.equal(resposta.mensagem.anexos.categorias.imagem, 1); assert.equal(resposta.mensagem.anexos.categorias.aplicacao, 1);
  assert.equal(resposta.mensagem.anexo_lido.tipo_detectado, "zip"); // o anexo comum vem antes do embutido
  assert.equal(srv.enviados.filter((e) => /BODY\.PEEK\[(2|3)\]/.test(e)).length, 1);
  assert.match(srv.enviados.find((e) => /BODY\.PEEK\[3\]/.test(e)), /BODY\.PEEK\[3\]<0\.24576>\)/);
  assert.ok(!/BODY\.PEEK\[2\]/.test(srv.enviados.join("")), "o embutido não foi pedido");
});

test("P2 · UID pedido: lê exatamente aquele UID (sem FETCH * antes); UID inexistente vira uid_inexistente e a sessão é encerrada", async () => {
  const msgs = [{ ...PLAIN(), uid: 11 }, { ...ALT(), uid: 12 }];
  const a = await rodar(icloud({ msgs }), { uid: 11 });
  assert.equal(a.resposta.ok, true);
  assert.deepEqual(a.verbos, ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "UID", "UID", "LOGOUT"]);
  assert.equal(a.resposta.mensagem.multipart, false, "leu a 11, não a última");
  assert.ok(a.srv.enviados.some((e) => / UID FETCH 11 /.test(e) || /^a\d+ UID FETCH 11 /.test(e)));
  const b = await rodar(icloud({ msgs }), { uid: 999 });
  assert.equal(b.resposta.ok, false); assert.equal(b.resposta.erro, "uid_inexistente"); assert.equal(b.resposta.estagio, "mensagem_estrutura");
  assert.equal(b.resposta.logout, true); assert.equal(b.resposta.mensagem, undefined);
  for (const uid of [0, -1, 1.5, 4294967296, "7", NaN]) { const c = await rodar(icloud({ msgs }), { uid }); assert.equal(c.resposta.erro, "uid_invalido", String(uid)); assert.equal(c.srv.enviados.length, 0, "nada foi enviado ao servidor"); }
});

// ================= pasta de teste =================

test("P2 · pasta RAC-TESTE inexistente (ou não selecionável): erro fechado, EXAMINE nunca é enviado, LOGOUT é feito", async () => {
  for (const pasta of [false, "noselect"]) {
    const { resposta, verbos } = await rodar(icloud({ msgs: [PLAIN()], pasta }));
    assert.equal(resposta.ok, false); assert.equal(resposta.erro, "pasta_inexistente"); assert.equal(resposta.estagio, "pasta_localizar");
    assert.equal(resposta.pasta_teste_existe, pasta === false ? false : true);
    assert.ok(!verbos.includes("EXAMINE") && !verbos.includes("FETCH") && !verbos.includes("UID"));
    assert.equal(resposta.logout, true);
  }
});

test("P2 · pasta vazia (EXISTS 0): erro pasta_vazia e nenhum FETCH; EXISTS ausente é resposta malformada", async () => {
  const a = await rodar(icloud({ msgs: [] }));
  assert.equal(a.resposta.erro, "pasta_vazia"); assert.equal(a.resposta.mensagens_na_pasta, 0); assert.ok(!a.verbos.includes("FETCH")); assert.equal(a.resposta.logout, true);
  const b = await rodar(icloud({ msgs: [PLAIN()], status: { EXAMINE: (_, tag) => tag + " OK [READ-ONLY] sem exists\r\n" } }));
  assert.equal(b.resposta.erro, "resposta_malformada");
  const c = await rodar(icloud({ msgs: [PLAIN()], status: { EXAMINE: (_, tag) => tag + " NO pasta não pôde ser aberta\r\n" } }));
  assert.equal(c.resposta.erro, "examine_recusado"); assert.equal(c.resposta.logout, true);
});

test("P2 · EXAMINE sem o código READ-ONLY não é falha (EXAMINE já é somente leitura), mas fica registrado como não confirmado", async () => {
  const { resposta } = await rodar(icloud({ msgs: [PLAIN()], status: { EXAMINE: (_, tag) => "* 1 EXISTS\r\n" + tag + " OK EXAMINE concluído\r\n" } }));
  assert.equal(resposta.ok, true); assert.equal(resposta.somente_leitura_confirmado, false);
});

// ================= limites =================

test("P2 · texto maior que o limite: leitura parcial, status truncado, sem erro de decodificação no corte (UTF-8 cortado no meio)", async () => {
  const longo = utf8("ç".repeat(40) + S.texto);
  const m = mensagem(folha("TEXT", "PLAIN", { params: '("CHARSET" "utf-8")', codificacao: "8BIT", dados: longo }));
  const { resposta, srv } = await rodar(icloud({ msgs: [m] }), { politica: comLimites({ maxTextoBytes: 33 }) });
  const t = resposta.mensagem.texto_puro;
  assert.equal(resposta.ok, true);
  assert.equal(t.status, "truncado"); assert.equal(t.truncado, true); assert.equal(t.bytes_lidos, 33); assert.equal(t.tamanho_bytes, longo.length);
  assert.equal(t.caracteres_invalidos, false, "o byte cortado ao meio de um caractere não conta como inválido");
  assert.match(srv.enviados.find((e) => /BODY\.PEEK\[1\]/.test(e)), /BODY\.PEEK\[1\]<0\.33>/);
  semVazar(resposta, "truncado");
});

test("P2 · cabeçalho: no limite marca truncado; maior que o limite (servidor desobedece) é resposta_grande_demais", async () => {
  const cab = CAB() + "X-Enchimento: " + "a".repeat(300) + "\r\n";
  const a = await rodar(icloud({ msgs: [{ ...PLAIN(), cab }] }), { politica: comLimites({ maxCabecalhoBytes: 200 }) });
  assert.equal(a.resposta.ok, true); assert.equal(a.resposta.mensagem.cabecalhos.truncado, true); assert.equal(a.resposta.mensagem.cabecalhos.bytes, 200);
  const b = await rodar(icloud({ msgs: [PLAIN()], status: { UID: (args, tag) => (/HEADER/.test(args) ? "* 1 FETCH (UID 7 BODY[HEADER.FIELDS (FROM)]<0> {9000}\r\n" + "a".repeat(9000) + ")\r\n" + tag + " OK ok\r\n" : undefined) } }));
  assert.equal(b.resposta.erro, "resposta_grande_demais"); assert.equal(b.resposta.logout, true);
});

test("P2 · limites do servidor: total de bytes da sessão, linhas soltas, literal enorme e literais demais", async () => {
  const a = await rodar(icloud({ msgs: [ALT()] }), { politica: comLimites({ maxBytes: 600 }) });
  assert.equal(a.resposta.erro, "resposta_grande_demais");
  const muitas = "* OK x\r\n".repeat(300);
  const b = await rodar(icloud({ msgs: [PLAIN()], status: { LIST: (_, tag) => muitas + tag + " OK ok\r\n" } }));
  assert.equal(b.resposta.erro, "limite_excedido");
  const c = await rodar(icloud({ msgs: [PLAIN()], status: { UID: (args, tag) => (/BODYSTRUCTURE/.test(args) ? "* 1 FETCH (UID 7 BODYSTRUCTURE {99999}\r\n" + tag + " OK ok\r\n" : undefined) } }));
  assert.equal(c.resposta.erro, "resposta_grande_demais");
  const e = await rodar(icloud({ msgs: [PLAIN()] }), { politica: comLimites({ maxEstruturaBytes: 60 }) });
  assert.equal(e.resposta.erro, "resposta_grande_demais", "estrutura MIME acima do limite");
  const d = await rodar(icloud({ msgs: [PLAIN()], status: { LIST: (_, tag) => "* LIST () \"/\" {1}\r\nx\r\n".repeat(40) + tag + " OK ok\r\n" } }));
  assert.ok(["limite_excedido", "pasta_inexistente"].includes(d.resposta.erro), d.resposta.erro);
});

test("P2 · limites da estrutura MIME: partes demais e profundidade demais são recusadas com código fechado", async () => {
  const muitas = mensagem(multi("MIXED", ...Array.from({ length: 12 }, () => folha("TEXT", "PLAIN", { dados: "a\r\n" }))));
  const a = await rodar(icloud({ msgs: [muitas] }), { politica: comLimites({ maxPartes: 10 }) });
  assert.equal(a.resposta.erro, "mime_limite_excedido");
  let no = folha("TEXT", "PLAIN", { dados: "a\r\n" });
  for (let i = 0; i < 8; i++) no = multi("MIXED", no);
  const b = await rodar(icloud({ msgs: [mensagem(no)] }));
  assert.equal(b.resposta.erro, "mime_limite_excedido");
  assert.equal(b.resposta.logout, true);
});

// ================= MIME inválido e respostas malformadas =================

test("P2 · MIME inválido: estrutura fora do formato, tamanho que não é número, tipo vazio e subtipo ausente viram mime_invalido (sessão encerrada com LOGOUT)", async () => {
  const ruins = ['("TEXT" "PLAIN" NIL NIL NIL "7BIT" "muito" 1 NIL NIL NIL)', '("" "PLAIN" NIL NIL NIL "7BIT" 10 1 NIL NIL NIL)', '("TEXT" "PLAIN" NIL NIL NIL "7BIT")', "()", '(("TEXT" "PLAIN" NIL NIL NIL "7BIT" 1 1) 5)', '("TEXT" "PLAIN" "x" NIL NIL "7BIT" 1 1)'];
  for (const estrutura of ruins) {
    const { resposta } = await rodar(icloud({ msgs: [{ ...PLAIN(), estrutura }] }));
    assert.equal(resposta.ok, false, estrutura); assert.equal(resposta.erro, "mime_invalido", estrutura); assert.equal(resposta.logout, true);
  }
});

test("P2 · resposta IMAP malformada: parênteses desbalanceados, item ímpar, aspas abertas, continuação '+', controle injetado e linha desconhecida", async () => {
  const caso = async (nome, fn, esperado) => {
    const { resposta } = await rodar(icloud({ msgs: [PLAIN()], status: { UID: (args, tag) => (/BODYSTRUCTURE/.test(args) ? fn(tag) : undefined) } }));
    assert.equal(resposta.ok, false, nome); assert.equal(resposta.erro, esperado, nome);
    semVazar(resposta, nome);
  };
  await caso("parênteses abertos", (t) => "* 1 FETCH (UID 7 RFC822.SIZE 10 BODYSTRUCTURE (\"TEXT\" \"PLAIN\"\r\n" + t + " OK ok\r\n", "resposta_malformada");
  await caso("parêntese a mais", (t) => "* 1 FETCH (UID 7))\r\n" + t + " OK ok\r\n", "resposta_malformada");
  await caso("item sem valor", (t) => "* 1 FETCH (UID 7 RFC822.SIZE)\r\n" + t + " OK ok\r\n", "resposta_malformada");
  await caso("aspas abertas", (t) => "* 1 FETCH (UID 7 BODYSTRUCTURE (\"TEXT)\r\n" + t + " OK ok\r\n", "resposta_malformada");
  await caso("continuação +", (t) => "+ envie\r\n" + t + " OK ok\r\n", "resposta_inesperada");
  await caso("caractere de controle do marcador", (t) => "* 1 FETCH (UID 7 \u0001 \u0001)\r\n" + t + " OK ok\r\n", "resposta_malformada");
  await caso("linha fora de ordem", (t) => "xyz solto\r\n" + t + " OK ok\r\n", "resposta_inesperada");
  await caso("sem BODYSTRUCTURE", (t) => "* 1 FETCH (UID 7 RFC822.SIZE 10)\r\n" + t + " OK ok\r\n", "resposta_inesperada");
  await caso("UID diferente do pedido", (t) => "* 1 FETCH (UID 8 RFC822.SIZE 10 BODYSTRUCTURE (\"TEXT\" \"PLAIN\" NIL NIL NIL \"7BIT\" 1 1))\r\n" + t + " OK ok\r\n", "resposta_inesperada");
  await caso("duas mensagens para um UID", (t) => "* 1 FETCH (UID 7 RFC822.SIZE 1 BODYSTRUCTURE (\"TEXT\" \"PLAIN\" NIL NIL NIL \"7BIT\" 1 1))\r\n* 2 FETCH (UID 7)\r\n" + t + " OK ok\r\n", "resposta_inesperada");
  await caso("NO do servidor", (t) => t + " NO falhou com " + SENHA + "\r\n", "mensagem_erro");
});

test("P2 · conteúdo: FETCH sem cabeçalho, com tipo errado ou com NO viram erros fechados; base64 inválido do anexo é marcado sem derrubar o resto", async () => {
  const a = await rodar(icloud({ msgs: [PLAIN()], status: { UID: (args, tag) => (/HEADER\.FIELDS/.test(args) ? "* 1 FETCH (UID 7)\r\n" + tag + " OK ok\r\n" : undefined) } }));
  assert.equal(a.resposta.erro, "mime_invalido");
  const b = await rodar(icloud({ msgs: [PLAIN()], status: { UID: (args, tag) => (/HEADER\.FIELDS/.test(args) ? tag + " NO falhou\r\n" : undefined) } }));
  assert.equal(b.resposta.erro, "conteudo_falhou");
  const c = await rodar(icloud({ msgs: [{ ...PLAIN(), cab: "isto não é cabeçalho\r\n\r\n" }] }));
  assert.equal(c.resposta.erro, "mime_invalido");
  const ruimB64 = COM_ANEXO();
  ruimB64.partes["2"] = "@@@@ não é base64 !!!";
  const d = await rodar(icloud({ msgs: [ruimB64] }));
  assert.equal(d.resposta.ok, true); assert.equal(d.resposta.mensagem.anexo_lido.status, "codificacao_invalida"); assert.equal(d.resposta.mensagem.texto_puro.status, "lido");
  const desconhecida = mensagem(folha("TEXT", "PLAIN", { codificacao: "UUENCODE", dados: "begin\r\n" }));
  const e = await rodar(icloud({ msgs: [desconhecida] }));
  assert.equal(e.resposta.ok, true); assert.equal(e.resposta.mensagem.texto_puro.status, "codificacao_desconhecida");
  const raro = mensagem(folha("TEXT", "PLAIN", { params: '("CHARSET" "koi8-r")', codificacao: "8BIT", dados: "abc\r\n" }));
  const f = await rodar(icloud({ msgs: [raro] }));
  assert.equal(f.resposta.ok, true); assert.equal(f.resposta.mensagem.texto_puro.status, "charset_nao_suportado"); assert.equal(f.resposta.mensagem.texto_puro.charset, null);
  const vazio = mensagem(folha("TEXT", "PLAIN", { dados: "" }));
  const g = await rodar(icloud({ msgs: [vazio] }));
  assert.equal(g.resposta.ok, true); assert.equal(g.resposta.mensagem.texto_puro.status, "vazio");
  for (const x of [a, b, c, d, e, f, g]) semVazar(x.resposta, "conteúdo");
});

// ================= timeout, desconexão, autenticação =================

test("P2 · timeout (servidor mudo) e desconexão no meio: erros fechados, sem travar e sem vazar", async () => {
  const rapida = comLimites({ timeoutMs: 60 });
  const a = await rodar(icloud(), { politica: rapida, servidor: { saudacao: null } });
  assert.equal(a.resposta.erro, "timeout"); assert.equal(a.resposta.estagio, "saudacao");
  const b = await rodar(icloud({ msgs: [PLAIN()], status: { EXAMINE: () => null } }), { politica: rapida });
  assert.equal(b.resposta.erro, "timeout"); assert.equal(b.resposta.estagio, "pasta_examinar"); assert.equal(b.resposta.autenticado, true); assert.equal(b.resposta.logout, false);
  const c = await rodar(icloud({ msgs: [PLAIN()], status: { LIST: () => "FECHAR" } }));
  assert.equal(c.resposta.erro, "resposta_inesperada"); assert.equal(c.resposta.estagio, "pasta_localizar"); assert.equal(c.resposta.logout, false);
  const d = await executarP2({ abrir: async () => { throw new Error("recusou " + SENHA); }, usuario: USUARIO, senha: SENHA });
  assert.equal(montarRespostaP2(d).erro, "conexao_falhou");
  const e = await executarP2({ abrir: () => new Promise(() => {}), usuario: USUARIO, senha: SENHA, politica: rapida });
  assert.equal(montarRespostaP2(e).erro, "timeout");
  for (const x of [a, b, c]) semVazar(x.resposta, "timeout");
  semVazar(montarRespostaP2(d), "conexão recusada");
});

test("P2 · falha de autenticação: uma única tentativa, nada além do LOGIN, LOGOUT educado e a mensagem do servidor (que ecoa a credencial) nunca sai", async () => {
  const { resposta, verbos, srv } = await rodar(icloud({ msgs: [PLAIN()], login: "NO" }));
  assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "LOGOUT"]);
  assert.equal(srv.enviados.filter((e) => / LOGIN /.test(e)).length, 1);
  assert.deepEqual(resposta, { ok: false, operacao: "p2_imap", estagio: "login", autenticado: false, logout: true, erro: "autenticacao_recusada" });
  const bad = await rodar(icloud({ msgs: [PLAIN()], login: "BAD" }));
  assert.equal(bad.resposta.erro, "login_erro_protocolo");
  semVazar(resposta, "auth"); semVazar(bad.resposta, "auth bad");
});

test("P2 · LOGINDISABLED, saudação inválida e CAPABILITY recusado: a credencial nem é enviada", async () => {
  const a = await rodar(icloud({ caps: CAPS + " LOGINDISABLED" }));
  assert.equal(a.resposta.erro, "login_desabilitado"); assert.ok(!a.srv.enviados.some((e) => e.includes(SENHA)));
  const b = await rodar(icloud(), { servidor: { saudacao: "* BYE ocupado\r\n" } });
  assert.equal(b.resposta.erro, "saudacao_invalida"); assert.ok(!b.srv.enviados.some((e) => e.includes(SENHA)));
  const c = await rodar(icloud({ status: { CAPABILITY: (_, tag) => tag + " NO\r\n" } }));
  assert.equal(c.resposta.erro, "capability_falhou"); assert.ok(!c.srv.enviados.some((e) => e.includes(SENHA)));
});

// ================= segurança: comandos, escrita, vazamento =================

test("P2 · só comandos de leitura: lista fechada de verbos, UID só com FETCH, só BODY.PEEK parcial, sem SELECT/STORE/COPY/MOVE/EXPUNGE/DELETE/APPEND/busca", async () => {
  const msgs = [COM_ANEXO(), ALT()];
  const { srv, verbos } = await rodar(icloud({ msgs }));
  const PERMITIDOS = new Set(["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"]);
  assert.ok(verbos.every((v) => PERMITIDOS.has(v)), verbos.join(","));
  const tudo = srv.enviados.join("");
  for (const proibido of ["SELECT", "STORE", "COPY", "MOVE", "EXPUNGE", "DELETE", "APPEND", "CREATE", "RENAME", "SEARCH", "SUBSCRIBE", "IDLE", "STATUS", "NOOP", "CLOSE", "UNSELECT", "STARTTLS", "AUTHENTICATE", "ENABLE", "NAMESPACE"])
    assert.ok(!new RegExp("\\b" + proibido + "\\b").test(tudo), "comando proibido enviado: " + proibido);
  assert.ok(!/BODY\[/.test(tudo) && !/RFC822(?!\.SIZE)/.test(tudo), "nenhuma leitura sem PEEK");
  assert.ok(!/\\Seen|FLAGS/.test(tudo), "nenhuma flag");
  for (const e of srv.enviados.filter((x) => /^a\d+ UID /.test(x))) assert.match(e, /^a\d+ UID FETCH [1-9]\d* \(/);
  assert.equal(srv.enviados.filter((e) => / EXAMINE /.test(e)).length, 1);
  assert.ok(srv.enviados.every((e) => !/\b(SMTP|MAIL FROM|RCPT TO|DATA)\b/.test(e)), "nenhum SMTP");
  assert.deepEqual(srv.enviados.filter((e) => / (LIST|EXAMINE) /.test(e)).map((e) => e.replace(/^a\d+ /, "")), ['LIST "" "RAC-TESTE"\r\n', 'EXAMINE "RAC-TESTE"\r\n'], "só a pasta de teste, sem curinga");
});

test("P2 · conferência de comandos: o que não está na lista exata é recusado ANTES de ir ao socket", () => {
  const ok = [["CAPABILITY", ""], ["LOGOUT", ""], ["LOGIN", ' "a@b.co" "xxxx-xxxx-xxxx-xxxx"'], ["LIST", ' "" "RAC-TESTE"'], ["EXAMINE", ' "RAC-TESTE"'], ["FETCH", " * (UID)"],
    ["UID", " FETCH 7 (UID RFC822.SIZE BODYSTRUCTURE)"], ["UID", " FETCH 7 (BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID MIME-VERSION CONTENT-TYPE)]<0.8192> BODY.PEEK[1.2]<0.32768>)"], ["UID", " FETCH 4294967295 (BODY.PEEK[3]<0.24576>)"]];
  for (const [v, a] of ok) assert.equal(comandoPermitido(v, a, "RAC-TESTE"), true, v + a);
  const ruins = [["SELECT", ' "RAC-TESTE"'], ["EXAMINE", ' "INBOX"'], ["EXAMINE", ' "RAC-TESTE" (CONDSTORE)'], ["LIST", ' "" "*"'], ["LIST", ' "" "%"'], ["LIST", ' "" "INBOX"'], ["LIST", ' "" "RAC-TESTE" RETURN (STATUS (MESSAGES))'],
    ["STORE", " 1 +FLAGS (\\Seen)"], ["UID", " STORE 7 +FLAGS (\\Deleted)"], ["UID", " COPY 7 \"Trash\""], ["UID", " MOVE 7 \"Trash\""], ["UID", " EXPUNGE 7"], ["UID", " SEARCH ALL"],
    ["UID", " FETCH 7 (BODY[1])"], ["UID", " FETCH 7 (BODY[1]<0.100>)"], ["UID", " FETCH 7 (BODY.PEEK[1])"], ["UID", " FETCH 7 (RFC822)"], ["UID", " FETCH 7 (RFC822.TEXT)"], ["UID", " FETCH 7 (FLAGS)"],
    ["UID", " FETCH 1:* (UID)"], ["UID", " FETCH 7,8 (UID)"], ["UID", " FETCH 0 (UID)"], ["UID", " FETCH 07 (UID)"], ["UID", " FETCH 7 (UID) (UID)"], ["UID", " FETCH 7 (BODY.PEEK[1]<0.100>; DELETE)"],
    ["UID", " FETCH 7 (BODY.PEEK[HEADER.FIELDS (BCC)]<0.100>)"], ["UID", " FETCH 7 (BODY.PEEK[1]<5.100>)"], ["UID", " FETCH 7 (BODY.PEEK[1]<0.0>)"],
    ["FETCH", " 1:* (UID)"], ["FETCH", " * (FLAGS)"], ["FETCH", " 1 (BODY.PEEK[1]<0.9>)"], ["APPEND", ' "RAC-TESTE" {1}'], ["DELETE", ' "RAC-TESTE"'], ["CREATE", ' "X"'], ["RENAME", ' "A" "B"'],
    ["EXPUNGE", ""], ["IDLE", ""], ["STARTTLS", ""], ["LOGIN", ' "a" "b" "c"'], ["LOGIN", ' "a"b" "c"'], ["CAPABILITY", " x"], ["NOOP", ""], ["", ""]];
  for (const [v, a] of ruins) assert.equal(comandoPermitido(v, a, "RAC-TESTE"), false, v + a);
  assert.equal(comandoPermitido("LIST", ' "" "RAC-TESTE"', "OUTRA"), false, "a pasta é sempre a da política");
});

test("P2 · pasta da política fora do formato seguro (aspas, barras, quebra de linha, curinga) derruba a chamada sem tocar o servidor", async () => {
  for (const pasta of ['RAC"TESTE', "RAC-TESTE\r\nA1 DELETE", "*", "a/b", "", "x".repeat(65)]) {
    const { resposta, srv } = await rodar(icloud({ msgs: [PLAIN()] }), { politica: comLimites({ pasta }) });
    assert.equal(resposta.erro, "comando_nao_permitido", pasta); assert.equal(srv.enviados.length, 0);
  }
  const u = await rodar(icloud({ msgs: [PLAIN()] }), { usuario: 'a"b@example.com' });
  assert.equal(u.resposta.erro, "comando_nao_permitido"); assert.equal(u.srv.enviados.length, 0);
});

test("P2 · nenhum vazamento de conteúdo ou credencial em NENHUM cenário (sucesso, falhas, truncamento, anexo, UID): a resposta é só indicadores", async () => {
  const cenarios = [
    [icloud({ msgs: [PLAIN()] })], [icloud({ msgs: [HTML()] })], [icloud({ msgs: [ALT()] })], [icloud({ msgs: [COM_ANEXO()] })], [icloud({ msgs: [COM_ANEXO()] }), { uid: 7 }], [icloud({ msgs: [COM_ANEXO()] }), { uid: 8 }],
    [icloud({ msgs: [PLAIN()], login: "NO" })], [icloud({ msgs: [PLAIN()], pasta: false })], [icloud({ msgs: [] })],
    [icloud({ msgs: [{ ...PLAIN(), estrutura: '("TEXT" "PLAIN" ("CHARSET" "' + S.texto + '") NIL NIL "7BIT" "' + S.assunto + '" 1)' }] })],
    [icloud({ msgs: [PLAIN()], status: { UID: (a, t) => (/BODYSTRUCTURE/.test(a) ? "* 1 FETCH (UID 7 BODYSTRUCTURE (\"" + S.assunto + "\"\r\n" + t + " OK ok\r\n" : undefined) } })],
    [icloud({ msgs: [PLAIN()], status: { LIST: (_, t) => '* LIST () "/" "' + S.pasta + '"\r\n' + t + " OK ok\r\n" } })],
    [icloud({ msgs: [COM_ANEXO()] }), { politica: comLimites({ maxTextoBytes: 20, maxCabecalhoBytes: 50 }) }],
  ];
  for (const [rot, opc] of cenarios) { const { resposta, r } = await rodar(rot, opc || {}); semVazar(resposta, "resposta"); assert.ok(!JSON.stringify(r).includes(SENHA)); }
  // o resultado interno também não carrega a credencial nem texto do servidor
  const { r } = await rodar(icloud({ msgs: [COM_ANEXO()] }));
  for (const s of [SENHA, USUARIO, S.texto, S.html, S.assunto, S.de, S.arquivo, S.anexo]) assert.ok(!JSON.stringify(r).includes(s), "no resultado interno: " + s);
});

test("P2 · esquema fechado da resposta: campos desconhecidos, tipos errados e textos do servidor são descartados ou normalizados", () => {
  const suja = {
    ok: true, estagio: "SENTINELA", erro: "texto " + S.assunto, autenticado: "sim", logout: 1, pasta_teste_existe: S.pasta, somente_leitura: true, mensagens_na_pasta: 12.5,
    extra: S.texto, segredo: SENHA,
    mensagem: {
      tamanho_bytes: 99999999999, multipart: "x", multipart_subtipo: S.assunto, partes: -3, profundidade: "5", assunto: S.assunto, from: S.de,
      cabecalhos: { lidos: true, from: S.de, to: 1, subject: S.assunto, bytes: S.assunto, valor: S.assunto },
      texto_puro: { presente: true, status: S.texto, charset: S.texto, caracteres: S.texto, conteudo: S.texto },
      html: { presente: true, status: "lido", charset: "utf-8", tem_script: "true", conteudo: S.html },
      anexos: { total: 2, categorias: { pdf: 1, [S.arquivo]: 5 }, nomes: [S.arquivo] },
      anexo_lido: { tentado: true, status: "lido", tipo_detectado: S.anexo, bytes: S.anexo, tipo_confere: "sim" },
    },
  };
  const s = montarRespostaP2(suja);
  semVazar(s, "esquema fechado");
  assert.equal(s.ok, true); assert.equal(s.estagio, "inicio"); assert.equal(s.autenticado, false); assert.equal(s.logout, false);
  assert.equal(s.pasta_teste_existe, undefined); assert.equal(s.mensagens_na_pasta, 0); assert.equal(s.somente_leitura_confirmado, true);
  assert.equal(s.mensagem.tamanho_bytes, 4294967295); assert.equal(s.mensagem.multipart, false); assert.equal(s.mensagem.multipart_subtipo, null); assert.equal(s.mensagem.partes, 0);
  assert.equal(s.mensagem.texto_puro.status, "nao_presente"); assert.equal(s.mensagem.texto_puro.charset, null); assert.equal(s.mensagem.html.tem_script, false);
  assert.deepEqual(Object.keys(s.mensagem.anexos.categorias), ["imagem", "pdf", "texto", "audio", "video", "mensagem", "aplicacao", "outro"]);
  assert.equal(s.mensagem.anexo_lido.tipo_detectado, null); assert.equal(s.mensagem.anexo_lido.tipo_confere, null);
  assert.deepEqual(Object.keys(s).sort(), ["autenticado", "logout", "mensagem", "mensagens_na_pasta", "ok", "operacao", "somente_leitura_confirmado", "estagio"].sort());
  assert.deepEqual(montarRespostaP2(null), { ok: false, operacao: "p2_imap", estagio: "inicio", autenticado: false, logout: false, erro: "falha_inesperada" });
  assert.ok(ERROS_P2.includes("falha_inesperada") && ESTAGIOS_P2.includes("concluido") && STATUS_PARTE.includes("truncado"));
});

// ================= MIME: unidades =================

test("MIME · leitor de listas: aspas com escape, NIL, números, literais, seções BODY[...] com espaços e limites", () => {
  assert.deepEqual(lerSexp('(UID 7 "a \\"b\\"" NIL (x (y 12)))', []), [["UID", 7, 'a "b"', null, ["x", ["y", 12]]]]);
  assert.deepEqual(lerSexp("(BODY[HEADER.FIELDS (FROM TO)]<0> \u00010\u0001 BODY[1] NIL)", ["literal"]), [["BODY[HEADER.FIELDS (FROM TO)]<0>", "literal", "BODY[1]", null]]);
  for (const ruim of ["(a", "a)", '("a', "(\u00019\u0001)", "(a))", '"a" "b'] ) assert.throws(() => lerSexp(ruim, []), (e) => ["resposta_malformada"].includes(e.codigo), ruim);
  assert.throws(() => lerSexp("(a b c d e)", [], { maxItens: 3 }), (e) => e.codigo === "mime_limite_excedido");
  assert.throws(() => lerSexp("(".repeat(40), [], { maxProfundidade: 8 }), (e) => e.codigo === "mime_limite_excedido");
});

test("MIME · estrutura: caminhos IMAP (1, 1.1, 2), disposição, nome, cid e classificação corpo × anexo", () => {
  const raiz = lerSexp(COM_ANEXO().estrutura, [])[0];
  const e = analisarEstrutura(raiz);
  assert.deepEqual(e.partes.map((p) => [p.caminho, p.tipo + "/" + p.subtipo, p.disposicao, p.temNome]), [["1.1", "text/plain", null, false], ["1.2", "text/html", null, false], ["2", "application/pdf", "attachment", true]]);
  assert.equal(e.multipart, true); assert.equal(e.subtipoRaiz, "mixed"); assert.equal(e.profundidade, 3);
  const c = classificarPartes(e.partes);
  assert.equal(c.texto.caminho, "1.1"); assert.equal(c.html.caminho, "1.2"); assert.equal(c.anexos.length, 1);
  const simples = analisarEstrutura(lerSexp(PLAIN().estrutura, [])[0]);
  assert.equal(simples.partes[0].caminho, "1"); assert.equal(simples.multipart, false);
  // texto com nome de arquivo ou disposição de anexo é anexo; segunda parte de texto não vira anexo nem corpo
  const t = analisarEstrutura(lerSexp('(("TEXT" "PLAIN" ("NAME" "a.txt") NIL NIL "7BIT" 1 1)("TEXT" "PLAIN" NIL NIL NIL "7BIT" 1 1)("TEXT" "PLAIN" NIL NIL NIL "7BIT" 1 1) "MIXED")', [])[0]);
  const ct = classificarPartes(t.partes);
  assert.equal(ct.anexos.length, 1); assert.equal(ct.texto.caminho, "2");
});

test("MIME · decodificação: base64 com quebras e truncado, quoted-printable (soft break, =XX, = solto), 7bit/8bit, inválidos e desconhecidos", () => {
  const txt = (u8) => Buffer.from(u8).toString("latin1");
  assert.equal(txt(decodificarTransferencia(b64("olá mundo, até logo", 8), "BASE64")), "olá mundo, até logo");
  assert.equal(txt(decodificarTransferencia(Buffer.from("abcdefghij").toString("base64").slice(0, 9), "base64", true)), "abcdef", "o quarteto incompleto do corte é descartado");
  assert.equal(txt(decodificarTransferencia("YWJj", "base64")), "abc");
  assert.equal(txt(decodificarTransferencia("YWJjZA", "base64")), "abcd", "padding ausente é tolerado");
  assert.throws(() => decodificarTransferencia("YW*j", "base64"), (e) => e.codigo === "codificacao_invalida");
  assert.throws(() => decodificarTransferencia("YWJjZ", "base64"), (e) => e.codigo === "codificacao_invalida");
  assert.equal(txt(decodificarTransferencia("a=C3=A7=\r\nb = x =4", "quoted-printable")), "a\xC3\xA7b = x =4");
  assert.equal(txt(decodificarTransferencia("abc=4", "quoted-printable", true)), "abc");
  assert.equal(txt(decodificarTransferencia("\xE9", "8bit")), "\xE9");
  assert.throws(() => decodificarTransferencia("x", "uuencode"), (e) => e.codigo === "codificacao_desconhecida");
});

test("MIME · texto: charsets suportados, byte inválido marca (sem lançar), corte no meio de caractere não marca, charset desconhecido devolve null", () => {
  assert.equal(decodificarTexto(Uint8Array.from([0xE9]), "iso-8859-1").texto, "é");
  assert.equal(decodificarTexto(Uint8Array.from([0x80]), "windows-1252").texto, "€");
  assert.equal(decodificarTexto(Uint8Array.from([0xC3, 0xA7]), "UTF-8").texto, "ç");
  assert.equal(decodificarTexto(Uint8Array.from([0x61]), null).charset, "us-ascii");
  assert.equal(decodificarTexto(Uint8Array.from([0xC3]), "utf-8", true).texto, "");
  assert.equal(estatisticasTexto(decodificarTexto(Uint8Array.from([0xC3, 0x28]), "utf-8").texto).caracteres_invalidos, true);
  assert.equal(decodificarTexto(Uint8Array.from([0x61]), "koi8-r"), null);
  assert.deepEqual(estatisticasTexto("a\nb\n"), { caracteres: 4, linhas: 2, caracteres_invalidos: false });
  assert.deepEqual(estatisticasTexto("a\nb"), { caracteres: 3, linhas: 2, caracteres_invalidos: false });
  assert.deepEqual(estatisticasTexto(""), { caracteres: 0, linhas: 0, caracteres_invalidos: false });
});

test("MIME · indicadores de HTML, cabeçalhos (só presença/validade) e assinatura do anexo", () => {
  assert.deepEqual(indicadoresHtml('<p>oi</p><SCRIPT>x</SCRIPT><img alt="" src = "https://t.invalid/x.gif"><form action=x><iframe src=y>'), { tem_script: true, tem_imagem_remota: true, tem_formulario: true, tem_iframe: true });
  assert.deepEqual(indicadoresHtml('<img src="cid:abc"><p>oi</p>'), { tem_script: false, tem_imagem_remota: false, tem_formulario: false, tem_iframe: false });
  const c = analisarCabecalhos("Subject: =?UTF-8?B?w6dh?=\r\n continua\r\nFrom: a@b.invalid\r\nDate: lixo\r\nlinha sem dois pontos\r\n\r\n");
  assert.equal(c.assunto, true); assert.equal(c.assunto_codificado, true); assert.equal(c.from, true); assert.equal(c.to, false); assert.equal(c.data, true); assert.equal(c.data_valida, false);
  assert.equal(c.linhas_invalidas, 1); assert.equal(c.campos, 3);
  assert.throws(() => analisarCabecalhos("nada aqui\r\n"), (e) => e.codigo === "mime_invalido");
  assert.throws(() => analisarCabecalhos(""), (e) => e.codigo === "mime_invalido");
  assert.equal(JSON.stringify(c).includes("a@b.invalid"), false);
  const u = (...b) => Uint8Array.from(b);
  assert.equal(detectarTipo(u(0x25, 0x50, 0x44, 0x46, 0x2d)), "pdf"); assert.equal(detectarTipo(u(0x89, 0x50, 0x4e, 0x47)), "png"); assert.equal(detectarTipo(u(0xff, 0xd8, 0xff, 0xe0)), "jpeg");
  assert.equal(detectarTipo(u(0x47, 0x49, 0x46, 0x38)), "gif"); assert.equal(detectarTipo(u(0x50, 0x4b, 0x03, 0x04)), "zip");
  assert.equal(detectarTipo(Buffer.from("texto comum\r\nlinha 2")), "texto"); assert.equal(detectarTipo(u(0, 1, 2, 3, 4, 5, 6, 7)), "desconhecido"); assert.equal(detectarTipo(u()), "desconhecido");
  assert.equal(tipoConfere("pdf", "application", "pdf"), true); assert.equal(tipoConfere("png", "application", "pdf"), false); assert.equal(tipoConfere("texto", "text", "plain"), null);
});

// ================= rota (esquema do corpo, uso único e replay) =================

function sqlDe(db) { return { exec(q, ...v) { if (/^\s*CREATE/i.test(q)) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...v); return { toArray: () => l }; } }; }
function consumoReal() {
  const db = new DatabaseSync(":memory:");
  const obj = new ConsumoUnico({ storage: { sql: sqlDe(db), transactionSync: (fn) => fn() } }, {}, {});
  const ns = { idFromName: (n) => n, get: () => ({ fetch: (u, i) => obj.fetch(new Request(u, i)) }) };
  return { db, consumir: (d) => pedirConsumo(ns, d) };
}
const claims = (op, extra = {}) => ({ aud: POLITICA.audienciaPrefixo + op, jti: "jti-p2-teste-1", run_id: "26700000042", run_attempt: "1", ...extra });
const pedido = (corpo, tipo = "application/json") => new Request("https://w.invalid/auth-probe", { method: "POST", headers: { Authorization: "Bearer tok", "Content-Type": tipo }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
const CORPO = (extra = {}) => ({ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, ...extra });

test("P2 · rota: política (operação, consumo e credencial), audiência própria e esquema do corpo com uid opcional", () => {
  assert.deepEqual(POLITICA.operacoes, ["validar_oidc", "validar_uso_unico", "p1_imap", "p2_imap"]);
  assert.ok(POLITICA.operacoesComConsumo.includes("p2_imap") && POLITICA.operacoesComCredencial.includes("p2_imap"));
  const ex = (o) => examinarCorpo(new TextEncoder().encode(JSON.stringify(o)));
  assert.deepEqual(ex(CORPO()), { corpo: CORPO() });
  assert.deepEqual(ex(CORPO({ uid: 42 })), { corpo: CORPO({ uid: 42 }) });
  for (const uid of ["7", 0, -1, 1.5, 4294967296, null, [7], { a: 1 }, true]) assert.deepEqual(ex(CORPO({ uid })), { detalhe: "uid_invalido" }, JSON.stringify(uid));
  assert.deepEqual(ex(CORPO({ pasta: "INBOX" })), { detalhe: "campos_inesperados" }, "a pasta nunca vem do cliente");
  assert.deepEqual(ex(CORPO({ mensagem: 1 })), { detalhe: "campos_inesperados" });
  assert.deepEqual(ex({ operacao: "p1_imap", usuario: USUARIO, senha: SENHA, uid: 7 }), { detalhe: "campos_inesperados" }, "uid só existe na P2");
  assert.deepEqual(ex({ operacao: "validar_uso_unico", uid: 7 }), { detalhe: "campos_inesperados" });
  assert.deepEqual(ex({ operacao: "p2_imap", usuario: USUARIO }), { detalhe: "campo_ausente_senha" });
  assert.deepEqual(ex(CORPO({ senha: "Senha-Principal" })), { detalhe: "senha_formato_invalida" });
});

test("P2 · rota: consumo antes do corpo, executa UMA vez, repasse do uid, resposta de esquema fechado e replay recusado (409) sem executar de novo", async () => {
  const { consumir, db } = consumoReal();
  const chamadas = [];
  const executarP2 = async (d) => { chamadas.push({ ...d }); return { ok: true, estagio: "concluido", autenticado: true, logout: true, erro: null, mensagem: { cabecalhos: { lidos: true, from: true } }, vazamento: S.texto }; };
  const verificar = async () => ({ ok: true, claims: claims("p2_imap") });
  const a = await tratar(pedido(CORPO({ uid: 31 })), { verificar, consumir, executarP2 });
  const corpoA = await a.text();
  assert.equal(a.status, 200);
  assert.deepEqual(chamadas, [{ usuario: USUARIO, senha: SENHA, uid: 31 }]);
  assert.equal(JSON.parse(corpoA).operacao, "p2_imap"); assert.ok(!corpoA.includes(S.texto) && !corpoA.includes(SENHA) && !corpoA.includes(USUARIO));
  const b = await tratar(pedido(CORPO({ uid: 31 })), { verificar, consumir, executarP2 }); // mesmo token, mesma execução
  assert.equal(b.status, 409); assert.deepEqual(await b.json(), { ok: false, erro: "ja_consumido", motivo: "uso_unico" });
  const c = await tratar(pedido(CORPO()), { verificar: async () => ({ ok: true, claims: claims("p2_imap", { jti: "outro-jti-xxxxxxxx" }) }), consumir, executarP2 }); // token novo, mesma execução
  assert.equal(c.status, 409);
  assert.equal(chamadas.length, 1, "a leitura só aconteceu uma vez");
  assert.deepEqual(db.prepare("SELECT chave FROM consumo").all().map((l) => l.chave), ["26700000042:1:p2_imap"]);
  const todo = JSON.stringify(db.prepare("SELECT * FROM consumo").all());
  assert.ok(!todo.includes(SENHA) && !todo.includes(USUARIO), "o registro de uso único não guarda credencial");
});

test("P2 · rota: 10 chamadas simultâneas da mesma execução = uma aceita e nove recusadas (409); o consumo vem antes de ler o corpo e falha do registro = 503 sem executar", async () => {
  const { consumir } = consumoReal();
  let exec = 0;
  const executarP2 = async () => { exec += 1; return { ok: false, estagio: "login", erro: "autenticacao_recusada" }; };
  const verificar = async () => ({ ok: true, claims: claims("p2_imap", { run_id: "26700000099" }) });
  const rs = await Promise.all(Array.from({ length: 10 }, () => tratar(pedido(CORPO()), { verificar, consumir, executarP2 })));
  const codigos = rs.map((r) => r.status).sort();
  assert.deepEqual(codigos, [409, 409, 409, 409, 409, 409, 409, 409, 409, 502]);
  assert.equal(exec, 1);
  // corpo malformado também gasta a execução (o consumo é antes de ler o corpo): o segundo pedido da mesma execução já é 409
  const { consumir: c2 } = consumoReal();
  const v2 = async () => ({ ok: true, claims: claims("p2_imap", { run_id: "26700000100" }) });
  const x = await tratar(pedido("{não é json"), { verificar: v2, consumir: c2, executarP2 });
  assert.equal(x.status, 400);
  assert.equal((await tratar(pedido(CORPO()), { verificar: v2, consumir: c2, executarP2 })).status, 409);
  exec = 0;
  const falha = await tratar(pedido(CORPO()), { verificar: async () => ({ ok: true, claims: claims("p2_imap", { run_id: "26700000101" }) }), consumir: async () => { throw new Error("caiu " + SENHA); }, executarP2 });
  assert.equal(falha.status, 503); assert.equal(exec, 0); assert.ok(!(await falha.text()).includes(SENHA));
  // token de outra operação não executa a P2
  const errada = await tratar(pedido(CORPO()), { verificar: async () => ({ ok: true, claims: claims("p1_imap", { run_id: "26700000102" }) }), consumir: consumoReal().consumir, executarP2 });
  assert.equal(errada.status, 403); assert.equal(exec, 0);
});

test("P2 · rota: falhas viram 502 com o esquema fechado (erro de lista fechada, nunca texto do servidor) e erro inesperado do executor vira falha_inesperada", async () => {
  const mk = (run) => ({ verificar: async () => ({ ok: true, claims: claims("p2_imap", { run_id: run }) }), consumir: consumoReal().consumir });
  const a = await tratar(pedido(CORPO()), { ...mk("26700000201"), executarP2: async () => ({ ok: false, estagio: "pasta_localizar", autenticado: true, erro: "pasta_inexistente", pasta_teste_existe: false }) });
  assert.equal(a.status, 502);
  assert.deepEqual(await a.json(), { ok: false, operacao: "p2_imap", estagio: "pasta_localizar", autenticado: true, logout: false, pasta_teste_existe: false, erro: "pasta_inexistente" });
  const b = await tratar(pedido(CORPO()), { ...mk("26700000202"), executarP2: async () => ({ ok: false, erro: "NO " + SENHA }) });
  assert.equal((await b.json()).erro, "falha_inesperada");
  const c = await tratar(pedido(CORPO()), { ...mk("26700000203"), executarP2: async () => { throw new Error("explodiu " + SENHA); } });
  assert.equal(c.status, 500); assert.ok(!(await c.text()).includes(SENHA));
  const d = await tratar(pedido(CORPO()), { ...mk("26700000204") });
  assert.equal(d.status, 500, "sem executor configurado");
});

// ================= escopo do código =================

test("P2 · escopo do código (mensagem.mjs): verbos exatos, só EXAMINE/PEEK, sem logs, armazenamento, SMTP nem rede própria", () => {
  const fonte = fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/mensagem.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\s+\/\/\s.*$/gm, "");
  assert.match(fonte, /const VERBOS_P2 = Object\.freeze\(\["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"\]\);/);
  for (const proibido of ["SELECT", "STORE", "COPY", "MOVE", "EXPUNGE", "DELETE", "APPEND", "CREATE", "RENAME", "SEARCH", "SUBSCRIBE", "IDLE", "STARTTLS", "AUTHENTICATE", "UNSELECT", "SMTP"])
    assert.ok(!new RegExp("\\b" + proibido + "\\b").test(fonte), "palavra proibida no código: " + proibido);
  for (const x of [/\bconsole\b/, /\bwaitUntil\b/, /\bstorage\b/, /\bsql\b/, /\blocalStorage\b/, /\bfetch\(/, /\bconnect\(/, /cloudflare:/, /process\.env/, /\beval\s*\(/, /new Function/, /mail\.me\.com/, /\bBODY\[/, /RFC822(?!\.SIZE)/, /\\Seen|\\Deleted|FLAGS/])
    assert.ok(!x.test(fonte), "uso não permitido em mensagem.mjs: " + x);
  const mime = fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/mime.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const x of [/\bconsole\b/, /\bfetch\(/, /cloudflare:/, /\bstorage\b/, /\bsql\b/, /^import /m, /\benv\b/, /\bsenha\b|\busuario\b|\bpassword\b/i]) assert.ok(!x.test(mime), "uso não permitido em mime.mjs: " + x);
});

test("P2 · política: a pasta é só RAC-TESTE (a mesma da P1), limites pequenos e fixos, e o host é o mesmo IMAP da P1", () => {
  const p = POLITICA.p2;
  assert.equal(p.pasta, "RAC-TESTE"); assert.equal(p.pasta, POLITICA.imap.pastaTeste);
  assert.ok(Object.isFrozen(p));
  assert.ok(p.timeoutMs <= 20000 && p.maxBytes <= 262144 && p.maxLinhas <= 200);
  assert.ok(p.maxCabecalhoBytes <= 8192 && p.maxTextoBytes <= 32768 && p.maxHtmlBytes <= 32768 && p.maxAnexoBytes <= 24576 && p.maxEstruturaBytes <= 32768);
  assert.ok(p.maxPartes <= 30 && p.maxProfundidade <= 6 && p.maxItensSexp <= 4000);
  const somaMaxima = p.maxCabecalhoBytes + p.maxTextoBytes + p.maxHtmlBytes + p.maxAnexoBytes + p.maxEstruturaBytes;
  assert.ok(somaMaxima < p.maxBytes, "os limites parciais cabem no limite total da sessão: " + somaMaxima);
  assert.equal(POLITICA.imap.host, "imap.mail.me.com"); assert.equal(POLITICA.imap.porta, 993);
});
