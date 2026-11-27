// Lote 3 do novo RAC · as contas PURAS da Timeline e da Busca (nucleo.js: tl*, bs*). Sem rede, sem banco e sem navegador.
// Prova: contrato do evento, identidade estável, fuso e virada de dia, ordem total, deduplicação por relação, cursor por provedor (keyset: sem perder nem repetir, mesmo com empates e gravações novas),
// mesclagem, filtros, agrupamentos, períodos e o texto da busca (acento, termos parciais, espaços, caracteres especiais, expressão do banco conferida no Postgres de verdade).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }

const ev = (id, quando, extra = {}) => ({ id: "t:tab:" + id, quando, categoria: "casa", tipo: "t.x", titulo: "Evento " + id, ...extra });

test("fuso: data e hora locais de Brasília viram ISO com -03:00; timestamp sem fuso já é local; com Z ou offset é convertido; dia inteiro fica 00:00; virada de dia", () => {
  assert.equal(N.tlQuandoDe("2026-11-27"), "2026-11-27T00:00:00-03:00"); assert.equal(N.tlQuandoDe("2026-11-27", "09:30"), "2026-11-27T09:30:00-03:00");
  assert.equal(N.tlQuandoDe("2026-11-27T07:10:00"), "2026-11-27T07:10:00-03:00", "garmin_ativ.inicio: hora local");
  assert.equal(N.tlQuandoDe("2026-11-27T22:30:00Z"), "2026-11-27T19:30:00-03:00"); assert.equal(N.tlQuandoDe("2026-11-28T01:30:00+00:00"), "2026-11-27T22:30:00-03:00", "01:30 UTC ainda é o dia anterior em Brasília");
  assert.equal(N.tlQuandoDe("2026-11-28T00:30:00-03:00"), "2026-11-28T00:30:00-03:00"); assert.equal(N.tlQuandoDe(""), ""); assert.equal(N.tlQuandoDe("lixo"), ""); assert.equal(N.tlQuandoDe(null), "");
  assert.equal(N.tlDia("2026-11-28T01:30:00Z"), "2026-11-27"); assert.equal(N.tlHora("2026-11-28T01:30:00Z"), "22:30"); assert.equal(N.tlDia("2026-12-01T02:59:59Z"), "2026-11-30", "meia-noite de Brasília = 03:00 UTC");
  assert.equal(N.tlDia("2026-12-01T03:00:00Z"), "2026-12-01"); assert.equal(N.tlDia("2026-11-27"), "2026-11-27");
});
test("tlId: <provedor>:<tabela>:<chave>[:<parte>], estável e sem espaços", () => {
  assert.equal(N.tlId("saude", "garmin_ativ", 123456), "saude:garmin_ativ:123456"); assert.equal(N.tlId("fiscal", "notas_fiscais", "ab-12", "item 1"), "fiscal:notas_fiscais:ab-12:item_1");
  assert.equal(N.tlId("a", "b", "c"), N.tlId("a", "b", "c"), "o mesmo registro, o mesmo id");
});
test("tlEvento: confere o contrato; descarta campos desconhecidos (referência leve, não cópia); recusa id, fuso, categoria, tipo, título e link inválidos", () => {
  const ok = N.tlEvento({ id: "saude:garmin_ativ:1", quando: "2026-11-27T07:10:00-03:00", categoria: "saude", tipo: "saude.atividade", titulo: "  Corrida  ", resumo: "5 km", registroInteiro: { segredo: 1 }, link: "#saude/treino/1" });
  assert.equal(ok.ok, true); assert.equal(ok.evento.titulo, "Corrida"); assert.equal(ok.evento.espaco, "pessoal"); assert.equal("registroInteiro" in ok.evento, false); assert.deepEqual(ok.evento.relacionados, []);
  const ruins = [{ id: "sem-formato" }, { quando: "2026-11-27" }, { categoria: "x" }, { tipo: "semponto" }, { titulo: "" }, { link: "http://inseguro.com" }, { link: "javascript:alert(1)" }];
  const base = { id: "aa:bb:cc", quando: "2026-11-27T07:10:00-03:00", categoria: "casa", tipo: "a.b", titulo: "T" };
  for (const r of ruins) assert.equal(N.tlEvento({ ...base, ...r }).ok, false, JSON.stringify(r));
  assert.equal(N.tlEvento({ ...base, link: "https://exemplo.com/x" }).ok, true); assert.equal(N.tlEvento(null).ok, false);
  assert.ok(N.TL_CATEGORIAS.includes("saude") && N.TL_CATEGORIAS.length === 10); assert.equal(N.tlEvento({ ...base, relacionados: Array.from({ length: 30 }, (_, i) => "a:b:" + i) }).evento.relacionados.length, 10);
});
test("ordem: do mais novo ao mais antigo, empate pelo id (total e estável); eventos de dia inteiro ficam depois dos com hora do mesmo dia", () => {
  const l = [ev("a", "2026-11-27T10:00:00-03:00"), ev("c", "2026-11-27T10:00:00-03:00"), ev("b", "2026-11-27T10:00:00-03:00"), ev("d", "2026-11-27T00:00:00-03:00"), ev("e", "2026-11-28T00:00:00-03:00")];
  assert.deepEqual(N.tlOrdenar(l).map((e) => e.id.slice(-1)), ["e", "c", "b", "a", "d"]); assert.deepEqual(N.tlOrdenar(l.slice().reverse()).map((e) => e.id.slice(-1)), ["e", "c", "b", "a", "d"], "a ordem de entrada não importa");
  assert.deepEqual(N.tlOrdenar(l, true).map((e) => e.id.slice(-1)), ["d", "a", "b", "c", "e"]);
  assert.ok(N.tlInstante("2026-11-27T10:00:00-03:00") === N.tlInstante("2026-11-27T13:00:00Z"), "instantes iguais em fusos diferentes empatam");
});
test("deduplicação: nota fiscal (prioridade 1) que aponta para a compra (prioridade 2) presente na lista some e a compra ganha o id; sem a compra, a nota fica; ids repetidos viram um", () => {
  const compra = ev("compra1", "2026-11-26T00:00:00-03:00", { prioridade: 2, tipo: "compras.pedido" }), nota = ev("nota1", "2026-11-26T00:00:00-03:00", { prioridade: 1, relacionados: [compra.id], tipo: "fiscal.nota" }), outra = ev("nota2", "2026-11-25T00:00:00-03:00", { prioridade: 1, relacionados: ["compras:compras_online:ausente"] });
  const r = N.tlDeduplicar([nota, compra, outra, { ...compra }]); assert.deepEqual(r.map((e) => e.id), [compra.id, outra.id]); assert.deepEqual(r[0].relacionados, [nota.id], "a compra guarda a relação com a nota absorvida");
  assert.deepEqual(N.tlDeduplicar([compra, nota]).map((e) => e.id), [compra.id], "a ordem de entrada não muda o resultado"); assert.equal(nota.relacionados.length, 1, "o evento de entrada não foi alterado");
  const par = ev("p1", "2026-11-26T00:00:00-03:00", { prioridade: 2, relacionados: [compra.id] }); assert.equal(N.tlDeduplicar([par, compra]).length, 2, "mesma prioridade: nenhum some (ninguém é 'mais rico')");
});
test("filtros: categoria, tipo, espaço, pessoa, anexo, pendente e texto (sem acento, todos os termos); filtro vazio não filtra", () => {
  const l = [ev("1", "2026-11-27T10:00:00-03:00", { categoria: "saude", tipo: "saude.atividade", titulo: "Corrida no parque", espaco: "p", pessoa: "Rayner" }), ev("2", "2026-11-27T11:00:00-03:00", { categoria: "financas", tipo: "mercado.nota", titulo: "Açougue do João", espaco: "c", anexo: true, pendente: true }), ev("3", "2026-11-27T12:00:00-03:00", { titulo: "Consulta" })];
  const ids = (f) => N.tlFiltrar(l, f).map((e) => e.id.slice(-1)).join("");
  assert.equal(ids({}), "123"); assert.equal(ids({ categorias: ["saude"] }), "1"); assert.equal(ids({ tipos: ["mercado.nota"] }), "2"); assert.equal(ids({ espacos: ["c"] }), "2"); assert.equal(ids({ pessoas: ["Rayner"] }), "1");
  assert.equal(ids({ comAnexo: true }), "2"); assert.equal(ids({ pendentes: true }), "2"); assert.equal(ids({ texto: "acougue joao" }), "2"); assert.equal(ids({ texto: "ACOUGUE" }), "2"); assert.equal(ids({ texto: "parq corr" }), "1", "termos parciais, em qualquer ordem");
  assert.equal(ids({ texto: "x" }), "123", "uma letra só não filtra (muito curto)"); assert.equal(ids({ texto: "inexistente" }), ""); assert.equal(ids({ texto: "saude" }), "1", "o texto também olha a categoria");
});
test("cursor por provedor (keyset): nada se perde nem se repete ao paginar, mesmo com vários eventos no mesmo instante e com gravações novas no meio", () => {
  /* 3 provedores, 120 eventos; muitos no mesmo instante (dia inteiro) para forçar empates na fronteira */
  const provs = { a: [], b: [], c: [] }, t0 = Date.parse("2026-11-27T12:00:00-03:00");
  let n = 0; for (const p of Object.keys(provs)) for (let i = 0; i < 40; i++) { const dia = i % 7; provs[p].push(ev(p + String(i).padStart(3, "0"), new Date(t0 - dia * 864e5).toISOString().replace("Z", "+00:00"), {})); n++; }
  const pagina = (p, cur, lim, dados) => { const l = N.tlCursorFiltrar(N.tlOrdenar(dados[p]), cur); return l.slice(0, lim + (cur ? cur.vistos.length : 0)); };
  function percorrer(lim, antes) { let cur = {}, todos = [], rodadas = 0; const dados = JSON.parse(JSON.stringify(provs));
    for (;;) { const listas = {}; for (const p of Object.keys(dados)) listas[p] = pagina(p, cur[p], lim, dados); const m = N.tlMesclar(listas, cur, lim); if (!m.eventos.length) break; todos = todos.concat(m.eventos); cur = m.cursores; if (++rodadas === 2 && antes) antes(dados); if (rodadas > 500) throw new Error("não terminou"); }
    return todos; }
  for (const lim of [1, 7, 25, 50, 200]) { const todos = percorrer(lim); const ids = todos.map((e) => e.id); assert.equal(ids.length, n, "limite " + lim + ": todos entregues"); assert.equal(new Set(ids).size, n, "limite " + lim + ": nenhum repetido");
    const t = todos.map((e) => N.tlInstante(e.quando)); assert.ok(t.every((x, i) => !i || x <= t[i - 1]), "limite " + lim + ": do mais novo ao mais antigo"); }
  /* uma gravação NOVA (mais nova que tudo) entre uma página e outra não desloca nem repete nada (offset faria os dois) */
  const todos = percorrer(10, (d) => { d.a.push(ev("a999", "2026-11-28T09:00:00-03:00")); }); const ids = todos.map((e) => e.id); assert.equal(new Set(ids).size, ids.length, "sem repetição com gravação no meio"); assert.equal(ids.length, n, "o evento novo (mais novo que o cursor) não entra no meio da paginação; as páginas seguintes seguem completas");
});
test("tlMesclar: pega os N mais novos de todos; só avança o cursor de quem teve evento entregue; devolve o que sobrou", () => {
  const a = [ev("a1", "2026-11-27T12:00:00-03:00"), ev("a2", "2026-11-25T12:00:00-03:00")], b = [ev("b1", "2026-11-26T12:00:00-03:00")], c = [];
  const m = N.tlMesclar({ a, b, c }, { c: { quando: "2026-11-01T00:00:00-03:00", vistos: ["x"] } }, 2); assert.deepEqual(m.eventos.map((e) => e.id.slice(-2)), ["a1", "b1"]); assert.equal(m.sobrou, 1);
  assert.equal(m.cursores.a.quando, a[0].quando); assert.equal(m.cursores.b.quando, b[0].quando); assert.equal(m.cursores.c.vistos[0], "x", "quem não entregou mantém o cursor");
  assert.deepEqual(N.tlCursorAvancar(null, []), null); assert.deepEqual(N.tlCursorAvancar({ quando: "q", vistos: ["z"] }, []), { quando: "q", vistos: ["z"] });
  const c2 = N.tlCursorAvancar({ quando: a[0].quando, vistos: ["t:tab:a1"] }, [ev("a1b", a[0].quando)]); assert.deepEqual(c2.vistos.sort(), ["t:tab:a1", "t:tab:a1b"], "no mesmo instante os vistos se somam");
});
test("período e agrupamentos: 7 dias é o padrão; dia, semana (segunda a domingo), mês, categoria e pessoa; rótulos em português", () => {
  assert.deepEqual(N.tlPeriodo("7d", "2026-11-27"), { valor: "7d", de: "2026-11-21", ate: "2026-11-27", rotulo: "7 dias" }); assert.equal(N.tlPeriodo("hoje", "2026-11-27").de, "2026-11-27"); assert.equal(N.tlPeriodo("tudo", "2026-11-27").de, ""); assert.equal(N.tlPeriodo("lixo", "2026-11-27").valor, "7d");
  assert.equal(N.tlRotuloDia("2026-11-27", "2026-11-27"), "Hoje · sexta-feira, 27 de novembro"); assert.equal(N.tlRotuloDia("2026-11-26", "2026-11-27"), "Ontem · quinta-feira, 26 de novembro"); assert.equal(N.tlRotuloDia("2026-11-24", "2026-11-27"), "terça-feira, 24 de novembro"); assert.equal(N.tlRotuloDia("2026-11-28", "2026-11-27"), "Amanhã · sábado, 28 de novembro");
  assert.equal(N.tlSegunda("2026-11-29"), "2026-11-23", "domingo pertence à semana que começou na segunda anterior"); assert.equal(N.tlSegunda("2026-11-23"), "2026-11-23");
  const l = [ev("1", "2026-11-27T10:00:00-03:00", { categoria: "saude", pessoa: "Rayner" }), ev("2", "2026-11-27T23:30:00-03:00", { categoria: "financas" }), ev("3", "2026-11-20T10:00:00-03:00", { categoria: "saude", ator: "Ana" })];
  assert.deepEqual(N.tlAgrupar(l, "dia", "2026-11-27").map((g) => g.chave + ":" + g.eventos.length), ["2026-11-27:2", "2026-11-20:1"]); assert.deepEqual(N.tlAgrupar(l, "semana", "2026-11-27").map((g) => g.rotulo), ["Semana de 23 de novembro", "Semana de 16 de novembro"]);
  assert.deepEqual(N.tlAgrupar(l, "mes", "2026-11-27").map((g) => g.rotulo), ["novembro de 2026"]); assert.deepEqual(N.tlAgrupar(l, "categoria", "2026-11-27").map((g) => g.rotulo), ["Finanças", "Saúde"]); assert.deepEqual(N.tlAgrupar(l, "pessoa", "2026-11-27").map((g) => g.rotulo), ["Ana", "Rayner", "Sem pessoa"]);
  assert.equal(N.tlAgrupar([ev("z", "2026-11-28T01:30:00+00:00")], "dia", "2026-11-27")[0].chave, "2026-11-27", "01:30 UTC de 28/11 é noite de 27/11 em Brasília");
});
test("busca: termos sem acento, minúsculos, só com 2 letras ou mais, sem repetir, até 6; espaços extras, aspas e controle saem; casa em qualquer ordem e parcial", () => {
  assert.deepEqual(N.bsTermos("  Açougue   do JOÃO a  "), ["acougue", "do", "joao"]); assert.deepEqual(N.bsTermos("a"), []); assert.deepEqual(N.bsTermos(""), []); assert.deepEqual(N.bsTermos(null), []); assert.deepEqual(N.bsTermos('leite "integral" leite'), ["leite", "integral"]);
  assert.equal(N.bsTermos("um dois tres quatro cinco seis sete oito").length, 6); assert.deepEqual(N.bsTermos("a\u0000b cc"), ["cc"], "caractere de controle separa");
  assert.equal(N.bsCasa(["joao", "acoug"], ["Açougue do João"]), true); assert.equal(N.bsCasa(["joao", "padaria"], ["Açougue do João"]), false); assert.equal(N.bsCasa([], ["x"]), true); assert.equal(N.bsCasa(["x1"], [null, undefined]), false);
  assert.equal(N.bsNorm("  ÀÉÎÕÜ  Ç "), "aeiou c");
});
test("bsPontuar e bsAgrupar: título que começa pelo termo vale mais; grupos na ordem pedida; dentro do grupo, mais relevante e depois mais novo", () => {
  const it = (id, titulo, dominio, quando = "") => ({ id, titulo, resumo: "", dominio, origem: dominio.toUpperCase(), quando });
  assert.ok(N.bsPontuar(it("1", "Leite integral", "a"), ["leite"]) > N.bsPontuar(it("2", "Compra de leite", "a"), ["leite"])); assert.ok(N.bsPontuar(it("3", "Compra de leite", "a"), ["leite"]) > N.bsPontuar({ titulo: "X", resumo: "leite" }, ["leite"]));
  const g = N.bsAgrupar([it("1", "Compra de leite", "b", "2026-11-01"), it("2", "Leite", "a"), it("3", "Leite longa vida", "b", "2026-11-20"), it("4", "Leite", "c")], ["leite"], ["b", "a"]);
  assert.deepEqual(g.map((x) => x.dominio), ["b", "a", "c"]); assert.deepEqual(g[0].itens.map((x) => x.id), ["3", "1"], "o título que começa pelo termo vem antes"); assert.equal(g[0].rotulo, "B");
});
test("bsRegex: cada letra vira uma classe com as formas acentuadas e os caracteres especiais são escapados (sem injeção de expressão)", () => {
  const re = (t, s) => new RegExp(N.bsRegex(t), "i").test(s);
  assert.equal(re("acougue", "Açougue do João"), true); assert.equal(re("açougue", "ACOUGUE"), true); assert.equal(re("joao", "João"), true); assert.equal(re("cafe", "Café com pão"), true); assert.equal(re("sao", "São Paulo"), true);
  assert.equal(re("a.b", "axb"), false, "o ponto é literal"); assert.equal(re("a.b", "a.b"), true); assert.equal(re("(x", "contém (x aqui"), true); assert.equal(re("a|b", "a"), false, "a barra é literal"); assert.equal(re("[abc]", "a"), false); assert.equal(re("c++", "c++"), true);
  assert.doesNotThrow(() => new RegExp(N.bsRegex("(((*+?[\\]{}^$"), "i")); assert.equal(N.bsRegex('a"b'), N.bsRegex("ab"), "aspas saem: não quebram o filtro do PostgREST");
});
test("bsRegex no Postgres de verdade (PGlite): o operador ~* acha o mesmo que bsCasa, com acento, maiúscula, parcial e caracteres especiais", { skip: !PGlite }, async () => {
  const db = new PGlite(); await db.exec("create table t (id int, txt text)");
  const linhas = ["Açougue do João", "Padaria São Pedro", "Café & Cia (matriz)", "Pão de queijo", "Mercado A+B", "Farmácia 24h", "AÇAÍ da Ana", "contém 50% off", "Ünico lugar", "x.y/z"]; for (let i = 0; i < linhas.length; i++) await db.query("insert into t values ($1,$2)", [i, linhas[i]]);
  for (const termo of ["acougue", "açougue", "joao", "são pedro", "cafe", "cia", "(matriz", "pao", "a+b", "farmacia", "acai", "50%", "unico", "x.y", "y/z", "a.b", "queijo", "ZZZ"]) {
    const termos = N.bsTermos(termo); if (!termos.length) continue;
    const esperado = linhas.map((l, i) => (N.bsCasa(termos, [l]) ? i : -1)).filter((i) => i >= 0).join(",");
    const sql = "select id from t where " + termos.map((t) => "txt ~* $" + (termos.indexOf(t) + 1)).join(" and ") + " order by id"; const r = await db.query(sql, termos.map((t) => N.bsRegex(t)));
    assert.equal(r.rows.map((x) => x.id).join(","), esperado, "termo: " + termo); }
});
