// Central Fiscal · QR Code da NFC-e (16/11/2026, correção do lote da confirmação única; docs/fiscal.md, "QR Code").
// O QR Code é lido NO APARELHO (jsQR por CDN, versão exata, carregado sob demanda); a chave de acesso (parâmetro p da URL) só vale depois dos 44 dígitos e do dígito verificador, complementa a leitura
// da IA e é confrontada com a chave que a IA leu: divergência vira conflito mostrado (nunca escolhe em silêncio). Sem QR, ilegível ou leitor indisponível: segue só com a IA. A consulta pública da
// SEFAZ NÃO é feita (proteção antirobô); indisponível ou não, nunca bloqueia o Mercado nem torna autorizada uma nota pendente. Tudo fictício; sem rede e sem IA paga (leitor, IA e banco são objetos de teste).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const DONO = "11111111-1111-4111-8111-111111111111", CNPJ = "11222333000181";
const chaveDe = (n = "000000123", tp = "1", cnpj = CNPJ) => { const b = "31" + "2611" + cnpj + "65" + "001" + n + tp + "12345678"; return b + N.nfDvChave(b); };
const K1 = chaveDe("000000123"), K2 = chaveDe("000000456"), K3 = chaveDe("000000789");
const urlSP = (k, resto = "|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01") => "https://www.nfce.fazenda.sp.gov.br/qrcode?p=" + k + resto;

// ================= núcleo: a chave do QR Code =================
test("nfQrChave: extrai a chave do parâmetro p (e de chNFe e de 44 dígitos soltos), só aceita com 44 dígitos e dígito verificador; recusa o resto com o motivo", () => {
  const a = N.nfQrChave(urlSP(K1)); assert.deepEqual([a.ok, a.chave, a.host, a.campos.numero, a.campos.modelo, a.campos.cnpj], [true, K1, "www.nfce.fazenda.sp.gov.br", 123, "65", CNPJ]);
  assert.equal(N.nfQrChave("https://www.nfce.fazenda.sp.gov.br/qrcode?p=" + encodeURIComponent(K1 + "|2|1|1|AB")).chave, K1, "com %7C");
  assert.equal(N.nfQrChave("http://nfe.exemplo.gov.br/consulta?chNFe=" + K1 + "&nVersao=100").chave, K1, "formato antigo (chNFe)"); assert.equal(N.nfQrChave(K1).chave, K1, "44 dígitos soltos");
  const dv = N.nfQrChave(urlSP(K1.slice(0, 43) + ((+K1[43] + 1) % 10))); assert.equal(dv.ok, false); assert.equal(dv.chave, null); assert.match(dv.erros.join(" "), /Dígito verificador incorreto/);
  assert.match(N.nfQrChave(urlSP("123456")).erros.join(" "), /44 dígitos/); assert.match(N.nfQrChave("https://exemplo.test/qrcode?x=1").erros.join(" "), /44 dígitos/); assert.match(N.nfQrChave("").erros.join(" "), /vazio/); assert.equal(N.nfQrChave(null).ok, false);
  assert.equal(N.nfQrChave("0".repeat(44)).ok, false, "sequência repetida"); assert.equal(N.nfQrChave(urlSP(K1.slice(0, 20) + "99" + K1.slice(22))).ok, false, "modelo inválido na chave");
});
test("nfQrConferir: IA sem chave → a do QR entra e completa modelo, série, número e CNPJ que faltavam; igual → confere; válida e DIFERENTE → conflito (a da IA fica, nada é escolhido); IA com chave inválida → a do QR entra, avisado; QR inválido ou ausente → só IA", () => {
  const base = (o = {}) => ({ formato: "imagem", chave: null, modelo: null, serie: null, numero: null, data_emissao: "2026-11-06", emitente: { nome: "MERCADO", cnpj: null }, valores: { total: 10 }, cStat: null, contingencia: false, ...o });
  const c = N.nfQrConferir(base(), N.nfQrChave(urlSP(K1))); assert.equal(c.estado, "complementou"); assert.deepEqual([c.lido.chave, c.lido.modelo, c.lido.serie, c.lido.numero, c.lido.emitente.cnpj], [K1, "65", "1", "123", CNPJ]); assert.match(c.avisos.join(" "), /veio do QR Code.*Também vieram da chave: modelo, série, número, CNPJ do emitente.*situação fiscal NÃO muda/);
  assert.equal(c.lido.cStat, null); assert.equal(c.lido.contingencia, false, "o QR Code não altera a situação fiscal");
  const nota = N.nfNormalizar(c.lido); assert.equal(nota.chave_valida, true); assert.equal(nota.situacao, "pendente", "continua pendente: QR Code não é evidência de autorização");
  const eq = N.nfQrConferir(base({ chave: K1, modelo: "65", serie: "1", numero: "123", emitente: { nome: "M", cnpj: CNPJ } }), N.nfQrChave(urlSP(K1))); assert.deepEqual([eq.estado, eq.conflitos.length], ["confere", 0]);
  const cf = N.nfQrConferir(base({ chave: K2 }), N.nfQrChave(urlSP(K1))); assert.equal(cf.estado, "conflito"); assert.equal(cf.lido.chave, K2, "não escolhe: a leitura fica como estava"); assert.equal(cf.chave_qr, K1); assert.equal(cf.chave_ia, K2); assert.match(cf.conflitos[0], /chave de acesso do QR Code \(.*\) é diferente da chave lida pela IA/);
  const ruim = N.nfQrConferir(base({ chave: K1.slice(0, 43) + ((+K1[43] + 1) % 10) }), N.nfQrChave(urlSP(K1))); assert.equal(ruim.estado, "complementou"); assert.equal(ruim.lido.chave, K1); assert.match(ruim.avisos.join(" "), /a que a IA leu estava incompleta ou inválida/);
  const inv = N.nfQrConferir(base({ chave: K2 }), N.nfQrChave(urlSP("123"))); assert.equal(inv.estado, "invalido"); assert.equal(inv.lido.chave, K2); assert.match(inv.avisos.join(" "), /seguimos só com a leitura da IA/);
  assert.equal(N.nfQrConferir(base(), null).estado, "sem_qr"); const orig = base(); N.nfQrConferir(orig, N.nfQrChave(urlSP(K1))); assert.equal(orig.chave, null, "não altera o objeto recebido");
});
test("nfConsultaSefaz: o RAC não consulta (proteção antirobô); só oferece o endereço do QR se for https de domínio .gov.br; nunca bloqueia, nunca altera a situação", () => {
  const ok = N.nfConsultaSefaz(N.nfQrChave(urlSP(K1))); assert.deepEqual([ok.automatica, ok.bloqueia, ok.altera_situacao, ok.disponivel], [false, false, false, true]); assert.equal(ok.link, urlSP(K1)); assert.match(ok.motivo, /aberta por você.*não a lê nem muda a situação fiscal/);
  for (const u of ["http://www.nfce.fazenda.sp.gov.br/qrcode?p=" + K1, "https://sefaz-falso.com/qrcode?p=" + K1, "https://nfce.fazenda.sp.gov.br.mal.com/q?p=" + K1, "javascript:alert(1)//" + K1]) { const x = N.nfConsultaSefaz(N.nfQrChave(u)); assert.equal(x.link, null, u); assert.equal(x.bloqueia, false); }
  for (const nada of [null, undefined, N.nfQrChave("lixo")]) { const x = N.nfConsultaSefaz(nada); assert.deepEqual([x.link, x.bloqueia, x.altera_situacao], [null, false, false]); assert.match(x.motivo, /Isso não impede a entrada no Mercado/); }
});
test("a consulta oficial não existe no código: sem fetch, sem XMLHttpRequest, sem chamada à SEFAZ; o QR vem só de jsQR no aparelho, com versão exata na CDN", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, ""); assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(js), "nada de rede solta"); assert.ok(!/fazenda\.sp\.gov\.br|sefaz\.[a-z]{2}\.gov/i.test(js), "nenhum endereço de SEFAZ no código");
  assert.match(js, /https:\/\/cdn\.jsdelivr\.net\/npm\/jsqr@1\.4\.0\/dist\/jsQR\.js/); assert.ok(!/jsqr@(?:latest|\^|~|1\b(?!\.4))/i.test(js), "versão exata");
  const nuc = ler("nucleo.js"); const i = nuc.indexOf("function nfQrChave"), j = nuc.indexOf("function nfCamposInfo"); assert.ok(i > 0 && j > i); assert.ok(!/SB\.|fetch\(|document\.|window\./.test(nuc.slice(i, j)), "o núcleo do QR é puro");
});

// ================= a tela: foto → QR Code (no aparelho) → IA, com o leitor e o navegador de teste =================
const CPF_FICT = "52998224725", IMG = { tipo: "image/jpeg", base64: "/9j/4AAQSkZJRgABAQ==" };
const resposta = (o = {}) => ({ modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: "123", serie: "1", chave: K1, data_emissao: "2026-11-06", hora_emissao: "10:30:00", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 25.5, descontos: null, frete: null, outras: null, impostos: null, total: 25.5, valor_pago: 25.5, componentes: { seguro: null, st: null, fcp_st: null, ipi: null, ii: null, ipi_devol: null, deson: null }, pagamentos: [{ forma: "Dinheiro", valor: 25.5 }],
  itens: [{ descricao: "ITEM A", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false }, { descricao: "ITEM B", codigo: null, qtd: 1, unidade: "UN", unitario: 5.5, total: 5.5, desconto: 0, incerto: false }], confianca: 0.8, incertos: [], ...o });
const REAL = (res) => ({ ok: true, versao: 1, modo: "REAL", estado: "concluido", resultado: res, avisos: [], id: "uso-1", modelo: "claude-sonnet-5-5", consumo: { mes: { alerta: 0, percentual: 3 } } });
/* o: res (resposta da IA), qr (o que o leitor devolve: texto, null ou função), leitor ("falha" = a biblioteca não carrega) */
function ambiente(o = {}) {
  const ch = { ia: [], rpc: [], sel: [], libs: [], jsqr: 0 }, tab = { notas_fiscais: o.notasFiscais || [] };
  const sb = { rpc: (nome, a) => { ch.rpc.push({ nome, args: a }); return Promise.resolve({ data: { gravada: true, fiscal: { id: a.p_nota.id, criado: true, resultado: a.p_nota.situacao === "autorizada" ? "validada" : "pendente_fiscal", docs_para_apagar: [] }, nota_id: a.p_nota.id,
      entrada: { estado: "concluida", mercado_nota_id: "m1", itens: 2, total: 25.5, produtos_novos: 2, confirmado_em: "2026-11-16T10:00:00Z", erro: null, avisos: [], ja_existia: false } } }); },
    from: (t) => { const f = []; const api = { select: () => api, eq: (c, v) => { f.push([c, v]); return api; }, order: () => api, limit: () => { ch.sel.push([t, f.slice()]); return Promise.resolve({ data: (tab[t] || []).filter((r) => f.every(([c, v]) => r[c] === v)) }); } }; return api; },
    storage: { from: () => ({ upload: () => Promise.resolve({}), remove: () => Promise.resolve({}), createSignedUrl: () => Promise.resolve({ data: { signedUrl: "x" } }) }) } };
  const stub = (tag, attrs, ...kids) => { const n = { tag, attrs: attrs || {}, kids: [], text: (attrs && attrs.text) || "", value: "" }; n.appendChild = (k) => { n.kids.push(k); k && (k.parentNode = n); return k; }; n.replaceChild = (novo, velho) => { const i = n.kids.indexOf(velho); if (i >= 0) { n.kids[i] = novo; novo.parentNode = n; } return velho; };
    kids.forEach((k) => { if (k != null) n.appendChild(typeof k === "string" ? { tag: "#t", attrs: {}, kids: [], text: k } : k); }); return n; };
  const win = { open() {}, pdfjsLib: null };
  const leitor = (data, w, h) => { ch.jsqr++; const t = typeof o.qr === "function" ? o.qr(ch.jsqr) : o.qr; return t ? { data: t } : null; };      // só aparece depois de carregarScript, como na CDN
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) }), toDataURL: () => "data:image/jpeg;base64,QUJD" });
  const c = vm.createContext({ NUCLEO: N, SB: sb, DONO, crypto: globalThis.crypto, Blob, TextEncoder, Uint8Array, Uint8ClampedArray, ArrayBuffer, Math, String, Array, JSON, Date, setTimeout: (f) => { f(); return 0; }, h: stub, isDonoOuCasa: () => true,
    brl: (v) => "R$ " + Number(v).toFixed(2).replace(".", ","), dataBR: (d) => d, carregarScript: (u) => { ch.libs.push(u); if (o.leitor === "falha") return Promise.reject(new Error("CDN fora do ar")); if (/jsqr/i.test(u)) win.jsQR = leitor; return Promise.resolve(); }, window: win,
    createImageBitmap: () => Promise.resolve({ width: 3000, height: 4000, close() {} }), document: { createElement: canvas }, iaFoto: () => Promise.resolve(IMG),
    racIA: (modulo, acao, entrada) => { ch.ia.push({ modulo, acao, entrada }); return Promise.resolve(REAL(o.res || resposta())); } });
  vm.runInContext(ler("js/fiscal.js"), c);
  return { c, ch, tab };
}
let seq = 0;
const foto = () => { const u = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0].concat(Array.from("foto" + (++seq)).map((x) => x.charCodeAt(0)))); return { name: "nota.jpg", size: u.length, type: "image/jpeg", slice: (a, b) => ({ arrayBuffer: () => Promise.resolve(u.slice(a, b).buffer) }), arrayBuffer: () => Promise.resolve(u.buffer.slice(0)) }; };
const texto = (n) => (n.textContent !== undefined ? n.textContent : n.text || "") + " " + (n.kids || []).map(texto).join(" ");
const achar = (n, f) => (f(n) ? [n] : []).concat(...(n.kids || []).map((k) => achar(k, f)));
const tick = async (k = 12) => { for (let i = 0; i < k * 4; i++) await new Promise((q) => setTimeout(q, 3)); };
const acordo = (n) => achar(n, (x) => x.tag === "button" && /^Estou de acordo$/.test(x.attrs.text || ""));
const lerFoto = async (a) => { const x = await a.c.fxIA([foto()]); assert.equal(x.estado, "lido", x.mensagem); return x.r; };
const editar = async (a, r, cartao, campos) => { const ed = achar(cartao, (n) => n.tag === "details")[0]; for (const [rot, v] of Object.entries(campos)) achar(ed, (n) => n.tag === "input" && n.attrs["aria-label"] === rot)[0].value = v;
  r.ultimoCartao = null; achar(ed, (n) => n.tag === "button" && /Aplicar correção/.test(n.attrs.text || ""))[0].onclick(); for (let i = 0; i < 40 && !r.ultimoCartao; i++) await new Promise((q) => setImmediate(q)); await tick(); return r.ultimoCartao; };

test("QR Code válido recupera a chave: a IA não leu a chave, o QR dá a chave validada; a nota passa a ter chave (duplicidade pela chave), segue validada e o botão aparece; a leitura aconteceu no aparelho (nada do QR foi à IA)", async () => {
  const a = ambiente({ res: resposta({ chave: null, protocolo: null, situacao: "pendente", serie: null, numero: null }), qr: urlSP(K1) }), r = await lerFoto(a);
  assert.equal(a.ch.libs.includes("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"), true, "o leitor é carregado sob demanda, versão exata"); assert.ok(a.ch.jsqr >= 1);
  assert.deepEqual([r.qr.estado, r.qr.leitor, r.nota.chave, r.nota.chave_valida, r.nota.numero, r.nota.serie], ["complementou", "ok", K1, true, "123", "1"]); assert.equal(r.nota.situacao, "pendente", "o QR Code não torna autorizada uma nota pendente");
  assert.deepEqual(a.ch.sel.find(([t, f]) => t === "notas_fiscais" && f[0] && f[0][0] === "chave"), ["notas_fiscais", [["chave", K1]]], "a duplicidade passa a ser conferida pela chave do QR");
  const t = texto(a.c.fxCartao(r, false)); assert.match(t, /QR Code: a chave de acesso veio do QR Code \(validada pelo dígito verificador\)/); assert.match(t, /Chave confere\s+Sim/); assert.doesNotMatch(t, /Chave de acesso: não impressa/); assert.doesNotMatch(a.ch.ia[0].entrada.texto || "", /fazenda|qrcode/i, "a IA não recebe o QR");
  const bloco = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(bloco).length, 1); acordo(bloco)[0].onclick(); await tick(25);
  const args = a.ch.rpc[0].args; assert.deepEqual([args.p_nota.chave, args.p_nota.situacao, args.p_nota.numero], [K1, "pendente", "123"]); assert.equal(args.p_proc.confianca, 0.8); assert.equal(r.confirmado.conf.estado, "concluida");
});
test("QR Code que confere com a chave da IA: aviso de confirmação, sem conflito e sem mudar nada", async () => {
  const a = ambiente({ qr: urlSP(K1) }), r = await lerFoto(a); assert.equal(r.qr.estado, "confere"); const t = texto(a.c.fxCartao(r, false)); assert.match(t, /QR Code: a chave de acesso confere com a da leitura da IA/); assert.doesNotMatch(t, /CONFLITO|Conflito/);
  const b = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b).length, 1);
});
test("QR Code inválido ou ilegível: fallback para a IA, sem erro e sem bloquear (chave sem dígito verificador, QR de outra coisa, QR sem chave)", async () => {
  for (const qr of [urlSP(K1.slice(0, 43) + ((+K1[43] + 1) % 10)), "https://exemplo.test/qrcode?p=123456", "WIFI:S:casa;T:WPA;P:senha;;"]) {
    const a = ambiente({ qr }), r = await lerFoto(a); assert.equal(r.qr.estado, "invalido", qr); assert.equal(r.nota.chave, K1, "segue a chave da IA"); const t = texto(a.c.fxCartao(r, false)); assert.match(t, /QR Code: lido, mas sem chave de acesso válida; segui só com a leitura da IA/);
    const b = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b).length, 1, "o botão continua"); assert.equal(a.ch.ia.length, 1);
  }
});
test("sem QR Code na imagem, ou leitor que não funciona no aparelho: segue só com a IA e diz isso; nada bloqueia", async () => {
  const sem = ambiente({ qr: null }), r1 = await lerFoto(sem); assert.deepEqual([r1.qr.estado, r1.qr.leitor], ["sem_qr", "ok"]); assert.match(texto(sem.c.fxCartao(r1, false)), /QR Code: não encontrei QR Code na imagem; segui só com a leitura da IA/);
  const falha = ambiente({ leitor: "falha" }), r2 = await lerFoto(falha); assert.deepEqual([r2.qr.estado, r2.qr.leitor], ["sem_qr", "indisponivel"]); assert.match(texto(falha.c.fxCartao(r2, false)), /QR Code: o leitor não está disponível neste aparelho; segui só com a leitura da IA/); assert.equal(falha.ch.ia.length, 1, "a IA foi chamada normalmente");
  for (const a of [sem, falha]) { const r = await lerFoto(a).catch(() => null); void r; }
  const b = falha.c.fxBlocoConfirmar(r2); await tick(); assert.equal(acordo(b).length, 1);
  const quebra = ambiente({ qr: () => { throw new Error("jsQR quebrou"); } }), r3 = await lerFoto(quebra); assert.equal(r3.qr.estado, "sem_qr", "exceção do leitor vira 'não achei'"); assert.equal(quebra.ch.ia.length, 1);
});
test("divergência entre a chave do QR Code e a da IA: o conflito é MOSTRADO com as duas chaves, nenhuma é escolhida em silêncio e o botão não aparece até a pessoa decidir no formulário", async () => {
  const a = ambiente({ res: resposta({ chave: K2, numero: "456" }), qr: urlSP(K1) }), r = await lerFoto(a);
  assert.deepEqual([r.qr.estado, r.qr.chave_qr, r.qr.chave_ia, r.nota.chave], ["conflito", K1, K2, K2]); const cartao = a.c.fxCartao(r, false), t = texto(cartao);
  assert.match(t, /QR Code: CONFLITO de chave de acesso/); assert.match(t, new RegExp("Conflito com o QR Code: a chave de acesso do QR Code \\(" + K1 + "\\) é diferente da chave lida pela IA \\(" + K2 + "\\)")); assert.match(t, /Gravação\s+Bloqueada/);
  const b0 = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b0).length, 0); assert.match(texto(b0), /Ainda não dá para confirmar: Conflito com o QR Code.*Nada foi enviado nem gravado/); assert.equal(a.ch.rpc.length, 0);
  /* decide no formulário: deixa a chave do QR → conflito some, cartão atualizado, aparece o botão */
  const novo = await editar(a, r, cartao, { "Chave de acesso": K1, "Número": "123" }); assert.equal(r.nota.chave, K1); assert.doesNotMatch(texto(novo), /Conflito com o QR Code/); assert.equal(acordo(novo).length, 1, "decidido: o único botão aparece");
  acordo(novo)[0].onclick(); await tick(25); assert.equal(a.ch.rpc[0].args.p_nota.chave, K1);
});
test("conflito de chave: manter a chave da IA também é uma decisão explícita (vale); uma terceira chave ou um valor que não é nenhuma das duas continua em conflito; dois QR com chaves diferentes são conflito", async () => {
  const a = ambiente({ res: resposta({ chave: K2, numero: "456" }), qr: urlSP(K1) }), r = await lerFoto(a), c1 = a.c.fxCartao(r, false);
  const manter = await editar(a, r, c1, {}); assert.equal(r.nota.chave, K2); assert.equal(acordo(manter).length, 1, "aplicar sem trocar = a pessoa manteve a chave da leitura, conscientemente");
  const b = ambiente({ res: resposta({ chave: K2, numero: "456" }), qr: urlSP(K1) }), rb = await lerFoto(b), terceira = await editar(b, rb, b.c.fxCartao(rb, false), { "Chave de acesso": K3, "Número": "789" });
  assert.equal(acordo(terceira).length, 0); assert.match(texto(terceira), /a chave informada \(.*\) não é nenhuma das chaves lidas \(QR Code ou IA\)/);
  const vazio = await editar(b, rb, b.c.fxCartao(rb, false), { "Chave de acesso": "" }); assert.equal(acordo(vazio).length, 1, "campo vazio: a pessoa decidiu seguir sem chave (pendente fiscal)"); assert.equal(rb.nota.chave, null);
  let n = 0; const dois = ambiente({ qr: () => (++n === 1 ? urlSP(K1) : urlSP(K3)) }), rd = await dois.c.fxIA([foto(), foto()]).then((x) => x.r);
  assert.equal(rd.qr.estado, "conflito"); assert.match(rd.qr.conflitos[0], /mais de um QR Code com chaves de acesso diferentes/); const bd = dois.c.fxBlocoConfirmar(rd); await tick(); assert.equal(acordo(bd).length, 0);
});
test("consulta SEFAZ indisponível não bloqueia o Mercado nem torna autorizada uma nota pendente: sem consulta automática, só o link oficial para a pessoa; situação continua a lida; a entrada acontece", async () => {
  const a = ambiente({ res: resposta({ situacao: "pendente", protocolo: null }), qr: urlSP(K1) }), r = await lerFoto(a);
  assert.equal(r.qr.consulta.automatica, false); assert.equal(r.qr.consulta.bloqueia, false); assert.equal(r.nota.situacao, "pendente", "a situação NÃO muda por causa do QR Code"); assert.equal(r.nota.protocolo, null, "nenhuma autorização foi inventada");
  const cartao = a.c.fxCartao(r, false), t = texto(cartao); assert.match(t, /Consulta pública oficial: não é feita automaticamente\. A consulta oficial é aberta por você/); assert.doesNotMatch(t, /Situação fiscal\s+Pendente|pendente na SEFAZ/, "a linha e a frase 'pendente' saíram da tela (decisão do dono, 21/11/2026)");
  const link = achar(cartao, (n) => n.tag === "a" && /Abrir a consulta no site oficial/.test(n.attrs.text || ""))[0]; assert.ok(link); assert.equal(link.attrs.href, urlSP(K1)); assert.match(link.attrs.rel, /noopener/); assert.equal(link.attrs.target, "_blank");
  const b = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b).length, 1, "consulta indisponível: o botão continua"); acordo(b)[0].onclick(); await tick(25);
  assert.equal(a.ch.rpc[0].args.p_nota.situacao, "pendente"); assert.equal(a.ch.rpc[0].args.p_nota.protocolo, null); assert.equal(r.confirmado.conf.estado, "concluida"); assert.equal(a.ch.rpc.length, 1, "nenhuma consulta nem outra chamada");
  const mal = ambiente({ qr: "http://golpe.example.com/qrcode?p=" + K1 }), rm = await lerFoto(mal); assert.equal(achar(mal.c.fxCartao(rm, false), (n) => n.tag === "a").length, 0, "domínio que não é .gov.br https: sem link");
});
test("situação fiscal independente do QR e da consulta: autorizada, pendente e contingência entram; cancelada e rejeitada continuam bloqueadas, com ou sem QR Code", async () => {
  for (const [sit, prot, entra] of [["autorizada", "131260000000001", true], ["pendente", null, true], ["contingencia", null, true], ["cancelada", null, false], ["rejeitada", null, false]]) {
    const a = ambiente({ res: resposta({ situacao: sit, protocolo: prot, chave: sit === "contingencia" ? chaveDe("000000123", "9") : K1 }), qr: urlSP(sit === "contingencia" ? chaveDe("000000123", "9") : K1) }), r = await lerFoto(a);
    const b = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b).length, entra ? 1 : 0, sit); if (!entra) assert.match(texto(b), /Ainda não dá para confirmar.*(cancelada|rejeitada)/i, sit);
  }
});
