// Lote 3 do novo RAC · os PROVEDORES da Timeline e da Busca (js/prov.js e js/prov-*.js) sobre um banco simulado que aplica as MESMAS regras de acesso do real (RLS por usuário: garmin e e-mail só do dono,
// registros e compras só da casa). Sem rede e sem navegador. Prova: contrato, identidade estável, isolamento (dois usuários, espaço compartilhado, membro removido, parâmetros manipulados), falha e tempo-limite de um
// provedor sem derrubar os outros, paginação sem perder nem repetir, deduplicação por vínculo, busca (acento, termo parcial, espaços, filtros, texto curto) e escala (10 mil registros).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const J = (x) => JSON.parse(JSON.stringify(x));   // os objetos do vm têm outro Array: compara por valor
const HOJE = "2026-11-27", dia = (n) => { const d = new Date(Date.UTC(2026, 10, 27 + n, 12)); return d.toISOString().slice(0, 10); };
const ARQS = ["js/prov.js", "js/prov-registros.js", "js/prov-saude.js", "js/prov-fiscal.js", "js/prov-compras.js", "js/prov-inbox.js", "js/prov-newsletter.js", "js/prov-lembretes.js", "js/prov-agenda.js", "js/prov-conteudo.js"];
const DOMINIOS = ["registros", "saude", "fiscal", "compras", "mercado", "inbox", "newsletter", "lembretes", "agenda", "mba", "aniversarios", "projetos", "vagas", "noticias"];

/* ---------- o banco simulado: filtros do PostgREST que os provedores usam + RLS por usuário ---------- */
function banco(tabelas, rls, quem) {
  const log = { chamadas: [], linhas: 0 };
  const campo = (r, c) => { if (c.includes("->>")) { const [a, b] = c.split("->>"); return (r[a] || {})[b]; } if (c.includes(".")) { const [a, b] = c.split("."); return (r[a] || {})[b]; } return r[c]; };
  function from(t) {
    const st = { f: [], ord: [], lim: null, falha: null }, q = {
      select: () => q, eq: (c, v) => (st.f.push((r) => campo(r, c) === v), q), gte: (c, v) => (st.f.push((r) => String(campo(r, c)) >= v), q), lte: (c, v) => (st.f.push((r) => String(campo(r, c)) <= v), q),
      in: (c, l) => (st.f.push((r) => l.includes(campo(r, c))), q),
      not: (c, op, v) => (st.f.push((r) => (op === "is" ? campo(r, c) != null : !String(v).replace(/[()]/g, "").split(",").includes(String(campo(r, c))))), q),
      or: (s) => { const ps = s.split(/,(?=[a-z_>.-]+\.imatch\.)/).map((x) => { const m = /^(.+?)\.imatch\."(.*)"$/.exec(x); return { c: m[1], re: new RegExp(m[2], "i") }; }); st.f.push((r) => ps.some((p) => p.re.test(String(campo(r, p.c) == null ? "" : campo(r, p.c))))); return q; },
      order: (c, o) => (st.ord.push([c, o && o.ascending === false ? -1 : 1]), q), limit: (n) => (st.lim = n, q),
      then: (ok, no) => { log.chamadas.push(t); if (rls.falhar && rls.falhar[t]) return rls.falhar[t](ok, no);
        let l = (tabelas[t] || []).filter((r) => (rls.politica[t] ? rls.politica[t](r, quem()) : true)).filter((r) => st.f.every((f) => f(r)));
        for (const [c, d] of st.ord.slice().reverse()) l.sort((a, b) => { const x = campo(a, c), y = campo(b, c); return (x > y ? 1 : x < y ? -1 : 0) * d; });
        if (st.lim) l = l.slice(0, st.lim); log.linhas += l.length; return Promise.resolve({ data: JSON.parse(JSON.stringify(l)), error: null }).then(ok, no); } };
    return q;
  }
  return { SB: { from }, log };
}
function ambiente({ tabelas = {}, usuario = { id: "dono", dono: true, casa: true }, politica, pessoal = {}, agenda = [], falhar = null, desligarRls = false } = {}) {
  const atual = { u: usuario }, rls = { politica: desligarRls ? {} : (politica || {}), falhar }, b = banco(tabelas, rls, () => atual.u);
  const ctx = { NUCLEO: N, SB: b.SB, PESSOAL: pessoal, console, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Date, Number, Math, RegExp, isFinite, logErro() {}, hojeISO: () => HOJE, dataBR: (d) => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4),
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, isOwner: () => atual.u.dono, precisa: () => Promise.resolve(), fonteOuErro: (n) => (n === "agenda" ? Promise.resolve({ v: agenda }) : Promise.reject(new Error("fonte " + n))),
    fonteRegistrar() {}, buscaMontar: () => Promise.resolve({ idx: pessoal.idx || [] }) };
  vm.createContext(ctx); vm.runInContext(ler("js/fonte-familia.js"), ctx); ARQS.forEach((a) => vm.runInContext(ler(a), ctx));
  return { ctx, log: b.log, como: (u) => { atual.u = u; }, rodar: (t) => vm.runInContext(t, ctx), janela: (op) => ctx.provJanela(op).then(J), buscar: (op) => ctx.provBuscar(op).then(J), proximos: (op) => ctx.provProximos(op).then(J) };
}
/* a política de cada tabela = a do banco real (RLS): quem lê o quê */
const POLITICA = {
  garmin_ativ: (r, u) => u.dono && r.user_id === u.id, inbox_mensagens_ref: (r, u) => u.dono && r.dono === u.id, inbox_pastas: (r, u) => u.dono && r.dono === u.id, newsletter_edicoes: (r, u) => u.dono && r.dono === u.id,
  registros: (r, u) => u.casa, compras_online: (r, u) => u.casa, notas_fiscais: (r, u) => u.casa, notas_fiscais_vinculos: (r, u) => u.casa, notas: (r, u) => u.casa, produtos: (r, u) => u.casa };
const T = (extra = {}) => ({
  registros: [{ id: "r1", quem: "olivia", tipo: "vacina", data: dia(-1), titulo: "Vacina V10", valor: "dose 2", arquivos: [{ path: "x" }], criado_em: dia(-1) + "T10:00:00Z" }, { id: "r2", quem: "civic", tipo: "revisao", data: dia(-3), titulo: "Revisão de 70 mil km", valor: null, arquivos: [], criado_em: dia(-3) + "T10:00:00Z" }, { id: "r3", quem: "eddie", tipo: "consulta", data: dia(-20), titulo: "Consulta de rotina", arquivos: [] }],
  garmin_ativ: [{ user_id: "dono", id: 11, inicio: dia(-1) + "T07:10:00", tipo: "running", dados: { distancia: 5200, duracao: 1750, nome: "Corrida no parque" } }, { user_id: "dono", id: 12, inicio: dia(-2) + "T18:30:00", tipo: "cycling", dados: { distancia: 20000, duracao: 3600 } }, { user_id: "outro", id: 99, inicio: dia(-1) + "T08:00:00", tipo: "running", dados: { nome: "Treino alheio" } }],
  inbox_pastas: [{ id: "p-ent", dono: "dono", uso: "entrada", ativa: true }, { id: "p-env", dono: "dono", uso: "enviados", ativa: true }],
  inbox_mensagens_ref: [{ id: "m1", dono: "dono", conta_id: "c1", pasta_id: "p-ent", recebida_em: dia(0) + "T13:05:00Z", assunto: "Fatura do cartão", remetente_nome: "Banco Azul", lida: false, anexo_provavel: true }, { id: "m2", dono: "dono", conta_id: "c1", pasta_id: "p-env", recebida_em: dia(0) + "T14:00:00Z", assunto: "Enviado por mim", remetente_nome: "Eu", lida: true }, { id: "m3", dono: "outro", conta_id: "c9", pasta_id: "p-ent", recebida_em: dia(0) + "T15:00:00Z", assunto: "E-mail alheio", remetente_nome: "X" }],
  newsletter_edicoes: [{ id: "n1", dono: "dono", data: dia(0), turno: "manha", origem: "ia", criado_em: dia(0) + "T09:00:00Z" }],
  notas_fiscais: [{ id: "nf1", numero: "123", data_emissao: dia(-2), emitente_nome: "Loja Estrela", valor_total: 89.9, valor_a_pagar: 89.9, situacao: "autorizada", criado_em: dia(-2) + "T11:00:00Z" }, { id: "nf2", numero: "77", data_emissao: dia(-4), emitente_nome: "Posto Sol", valor_total: 200, situacao: "pendente" }],
  notas_fiscais_vinculos: [{ nota_id: "nf1", modulo: "compras", registro_id: "co1", valido: true }],
  compras_online: [{ id: "co1", loja: "amazon", numero: "A-1", data: dia(-2), vendedor: "Estrela Eletro", status: "entregue", total_pago: 89.9, categoria: "Casa", criado_em: dia(-2) + "T09:00:00Z" }],
  notas: [{ id: "mn1", data: dia(-1), numero: "555", total: 120.5, created_at: dia(-1) + "T19:00:00Z", mercados: { nome: "Mercado Alfa (Centro)" } }],
  produtos: [{ nome: "Café torrado", categoria: "Mercearia" }, { nome: "Açúcar", categoria: "Mercearia" }], ...extra });
const PESSOAL_T = { lembretes: [{ id: "l1", data: dia(-1), t: "Pagar o IPVA", feito: false }, { id: "l2", data: dia(3), t: "Reunião da escola", feito: false }, { id: "l3", data: dia(-2), t: "Ligar para o dentista", feito: true }] };
const AGENDA_T = [{ data: dia(2), t: "Aula de SQL", sub: "às 19h", tipo: "mba", href: "#mba", pre: "Aula" }, { data: dia(-1), t: "Responder avaliação", sub: "do MBA", tipo: "mba", href: "#mba" }, { data: dia(1), t: "Pagar o IPVA", sub: "lembrete", tipo: "lembrete", lembrete: { id: "l1" } }, { data: dia(4), t: "Candidatura", sub: "follow-up", tipo: "carreira", id: "cand:abc", href: "#carreira/editar/abc" }];
const DONO = { id: "dono", dono: true, casa: true }, FERNANDA = { id: "fernanda", dono: false, casa: true }, FORA = { id: "fora", dono: false, casa: false };
const ESPACOS = [{ id: "esp-p", tipo: "pessoal" }, { id: "esp-c", tipo: "compartilhado", casa: true }];
const doDominio = (ev, d) => ev.filter((e) => e.id.startsWith(d + ":"));

test("os 14 provedores registram e cumprem o contrato; saúde, e-mail, newsletter, lembretes, agenda e o conteúdo pessoal são PRIVADOS e só do dono; registros, fiscal, pedidos e Mercado são da casa", () => {
  const a = ambiente(); const reg = J(a.rodar("provLista().map(function(d){return {d:d.dominio,c:d.compartilhavel,dono:!!(d.exige&&d.exige.dono),e:d.espaco,j:!!d.lerJanela,b:!!d.buscar,p:!!d.lerProximos,cat:d.categoria}})"));
  assert.deepEqual(reg.map((x) => x.d).sort(), DOMINIOS.slice().sort()); for (const x of reg) assert.ok(N.TL_CATEGORIAS.includes(x.cat), x.d);
  for (const d of ["saude", "inbox", "newsletter", "lembretes", "agenda", "mba", "aniversarios", "projetos", "vagas", "noticias"]) { const x = reg.find((y) => y.d === d); assert.equal(x.c, false, d + " é privado"); assert.equal(x.dono, true, d + " só do dono"); assert.equal(x.e, "pessoal", d); }
  for (const d of ["registros", "fiscal", "compras", "mercado"]) { const x = reg.find((y) => y.d === d); assert.equal(x.c, true, d + " é da casa"); assert.equal(x.e, "casa", d); }
  assert.deepEqual(reg.filter((x) => x.j).map((x) => x.d).sort(), ["agenda", "compras", "fiscal", "inbox", "lembretes", "mercado", "newsletter", "registros", "saude"], "9 domínios na Timeline (8 pedidos + o Mercado, que o Documento 15 liga à nota fiscal)");
  assert.deepEqual(reg.filter((x) => x.p).map((x) => x.d).sort(), ["agenda", "lembretes"]); assert.equal(a.rodar("provRegistrar({dominio:'x'})"), false, "definição incompleta é recusada");
  assert.equal(a.rodar("provRegistrar({dominio:'ruim',rotulo:'R',categoria:'casa',espaco:'casa',lerJanela:function(){}})"), false, "sem compartilhavel explícito é recusada");
});
test("janela de 7 dias: eventos de todos os domínios com identidade estável, contrato válido, ordem, espaço e origem impostos; o que é de outro usuário não aparece", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T }), r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100, espacos: ESPACOS });
  assert.equal(r.falhas.length, 0, JSON.stringify(r.falhas)); assert.equal(r.invalidos, 0); const ids = r.eventos.map((e) => e.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("familia:registros:r1") && ids.includes("familia:registros:r2") && !ids.includes("familia:registros:r3"), "a consulta de 20 dias atrás fica fora da janela");
  assert.ok(ids.includes("saude:garmin_ativ:11") && !ids.includes("saude:garmin_ativ:12"), "o tipo escondido pelo RAC Hoje (ciclismo) não entra"); assert.ok(!ids.includes("saude:garmin_ativ:99"), "treino de outro usuário: a RLS não entrega");
  assert.ok(ids.includes("inbox:inbox_mensagens_ref:m1") && !ids.includes("inbox:inbox_mensagens_ref:m2") && !ids.includes("inbox:inbox_mensagens_ref:m3"), "só a pasta de entrada e só as do dono");
  assert.ok(ids.includes("fiscal:notas_fiscais:nf1") && ids.includes("compras:compras_online:co1") && ids.includes("mercado:notas:mn1") && ids.includes("newsletter:newsletter_edicoes:n1"));
  assert.ok(ids.includes("lembretes:pessoal:l1") && ids.includes("agenda:itens:mba_" + dia(-1) + "_responder_avaliacao"), "lembrete e agenda (o que venceu e está pendente)"); assert.ok(!ids.some((i) => i.startsWith("agenda:itens:lembrete")), "o lembrete da Agenda fica com o provedor de lembretes");
  const t = r.eventos.map((e) => N.tlInstante(e.quando)); assert.ok(t.every((x, i) => !i || x <= t[i - 1]), "do mais novo ao mais antigo");
  for (const e of r.eventos) { assert.equal(N.tlEvento(e).ok, true, e.id); assert.ok(/^(pessoal|esp-p|esp-c)$/.test(e.espaco)); }
  assert.equal(r.eventos.find((e) => e.id.startsWith("saude:")).espaco, "esp-p"); assert.equal(r.eventos.find((e) => e.id.startsWith("familia:")).espaco, "esp-c"); assert.equal(r.eventos.find((e) => e.id.startsWith("fiscal:")).origem, "Central Fiscal");
  const corrida = r.eventos.find((e) => e.id === "saude:garmin_ativ:11"); assert.equal(corrida.link, "#saude/treino/11"); assert.equal(corrida.quando, dia(-1) + "T07:10:00-03:00"); assert.equal(corrida.categoria, "saude");
  const vac = r.eventos.find((e) => e.id === "familia:registros:r1"); assert.equal(vac.anexo, true); assert.equal(vac.pessoa, "Olivia"); assert.equal(vac.link, "#olivia"); assert.equal(vac.diaInteiro, true); assert.equal(r.eventos.find((e) => e.id === "familia:registros:r2").link, "#veiculos/civic");
  const msg = r.eventos.find((e) => e.id === "inbox:inbox_mensagens_ref:m1"); assert.equal(msg.pendente, true); assert.equal(msg.anexo, true); assert.equal(msg.link, "#inbox/c1/p-ent/m1"); assert.equal(msg.resumo, "Banco Azul"); assert.equal(msg.quando, dia(0) + "T10:05:00-03:00", "13:05 UTC = 10:05 em Brasília");
  const sub = JSON.stringify(r.eventos); assert.ok(!/segredo|corpo|html/i.test(sub));
});
test("ids estáveis: o mesmo registro dá o mesmo id depois de editado; a Agenda não usa a posição na lista", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T }), antes = (await a.janela({ de: dia(-6), ate: HOJE, limite: 100 })).eventos.map((e) => e.id).sort();
  a.ctx.SB = undefined; const b = ambiente({ tabelas: T({ registros: T().registros.map((r) => (r.id === "r1" ? { ...r, titulo: "Vacina V10 (editada)", valor: "dose 3" } : r)).reverse() }), politica: POLITICA, pessoal: { lembretes: PESSOAL_T.lembretes.slice().reverse() }, agenda: AGENDA_T.slice().reverse() });
  const depois = (await b.janela({ de: dia(-6), ate: HOJE, limite: 100 })).eventos; assert.deepEqual(depois.map((e) => e.id).sort(), antes, "mesma identidade com a edição e com a ordem das listas trocada"); assert.equal(depois.find((e) => e.id === "familia:registros:r1").titulo, "Vacina V10 (editada)", "o texto reflete a edição na próxima leitura");
});
test("AGENDADO: o futuro vem dos lembretes e da Agenda (NUCLEO.agendaItens), marcado como futuro e em ordem de data; atrasado não entra aqui", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T }), r = await a.proximos({ ate: dia(10) });
  assert.deepEqual(r.eventos.map((e) => e.id), ["agenda:itens:mba_" + dia(2) + "_aula_de_sql", "lembretes:pessoal:l2", "agenda:itens:cand_abc"], "em ordem de data: dia 2, dia 3, dia 4");
  assert.ok(r.eventos.every((e) => e.futuro === true && N.tlDia(e.quando) >= HOJE)); assert.equal(r.eventos[0].quando, dia(2) + "T00:00:00-03:00"); assert.equal(r.eventos[0].titulo, "Aula: Aula de SQL");
});
test("PRIVACIDADE: em espaço compartilhado nenhum provedor privado roda (nenhuma consulta às tabelas do relógio, do e-mail ou da newsletter), mesmo se a chamada pedir por nome", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T });
  const r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100, tipoEspaco: "compartilhado" }); assert.ok(r.eventos.length > 0); const dominios = new Set(r.eventos.map((e) => e.id.split(":")[0]));
  assert.deepEqual([...dominios].sort(), ["compras", "familia", "fiscal", "mercado"], "só os da casa"); assert.ok(!a.log.chamadas.some((t) => /garmin|inbox|newsletter/.test(t)), "nenhuma consulta privada: " + a.log.chamadas.join(","));
  const forcado = await a.janela({ de: dia(-6), ate: HOJE, tipoEspaco: "compartilhado", provedores: ["saude", "inbox", "newsletter"] }); assert.equal(forcado.eventos.length, 0); assert.equal(forcado.provedores.length, 0, "pedir por nome não contorna a regra");
  assert.deepEqual((await a.proximos({ tipoEspaco: "compartilhado" })).eventos, [], "agenda e lembretes são pessoais"); const b = await a.buscar({ texto: "fatura", tipoEspaco: "compartilhado" }); assert.equal(b.itens.length, 0); assert.ok(!a.log.chamadas.some((t) => /inbox/.test(t)));
});
test("DOIS USUÁRIOS: quem não é o dono (Fernanda) só recebe o que é da casa; de fora não recebe nada; mesmo com a tela mentindo que é o dono, a RLS do banco decide", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T, usuario: FERNANDA }); let r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100 });
  assert.deepEqual([...new Set(r.eventos.map((e) => e.id.split(":")[0]))].sort(), ["compras", "familia", "fiscal", "mercado"], "o provedor privado nem roda (exige o dono)"); assert.ok(!a.log.chamadas.some((t) => /garmin|inbox|newsletter/.test(t)));
  /* a interface mente: diz que é o dono. Os provedores rodam, mas o banco (RLS) devolve zero linhas privadas */
  a.como({ ...FERNANDA, dono: true }); a.log.chamadas.length = 0; r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100 }); const priv = r.eventos.filter((e) => /^(saude|inbox|newsletter):/.test(e.id)); assert.equal(priv.length, 0, "RLS: " + priv.map((e) => e.id)); assert.ok(a.log.chamadas.includes("garmin_ativ"), "a consulta aconteceu; quem barrou foi o banco");
  const bs = await a.buscar({ texto: "fatura cartao" }); assert.equal(bs.itens.filter((x) => x.dominio === "inbox").length, 0, "a busca também não revela e-mail de outro");
  a.como(FORA); r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100 }); assert.equal(r.eventos.length, 0, "quem não é da casa não vê nada"); assert.equal((await a.buscar({ texto: "vacina" })).itens.length, 0, "e a busca não revela a existência dos registros");
  a.como(DONO); r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100 }); assert.ok(r.eventos.length > 8, "o dono vê tudo");
});
test("MEMBRO REMOVIDO: na consulta seguinte à remoção, a casa deixa de entregar eventos e resultados (o acesso é calculado a cada leitura)", async () => {
  const membros = { fernanda: true }, pol = { ...POLITICA, registros: (r, u) => u.casa && (u.dono || membros[u.id]), compras_online: (r, u) => u.casa && (u.dono || membros[u.id]) };
  const a = ambiente({ tabelas: T(), politica: pol, usuario: FERNANDA }); assert.ok((await a.janela({ de: dia(-6), ate: HOJE })).eventos.length > 0); assert.ok((await a.buscar({ texto: "vacina" })).itens.length > 0);
  delete membros.fernanda; const r = await a.janela({ de: dia(-6), ate: HOJE }); assert.equal(r.eventos.filter((e) => /^(familia|compras):/.test(e.id)).length, 0); assert.equal((await a.buscar({ texto: "vacina" })).itens.length, 0);
});
test("o provedor não escolhe o espaço nem a origem; evento inválido é descartado e contado; link inseguro é recusado", async () => {
  const a = ambiente({ tabelas: T(), politica: POLITICA });
  a.rodar(`provRegistrar({dominio:"intruso",rotulo:"Intruso",categoria:"casa",espaco:"casa",compartilhavel:true,lerJanela:function(){return Promise.resolve({esgotado:true,eventos:[
    {id:"intruso:tab:1",quando:"${dia(-1)}T10:00:00-03:00",categoria:"casa",tipo:"intruso.x",titulo:"ok",espaco:"espaco-do-vizinho",origem:"Saúde",link:"#agenda"},
    {id:"intruso:tab:2",quando:"${dia(-1)}T10:00:00-03:00",categoria:"casa",tipo:"intruso.x",titulo:"link ruim",link:"javascript:alert(1)"},{id:"ruim",quando:"x"}]})},
    buscar:function(){return Promise.resolve({itens:[{id:"i1",titulo:"ok",link:"#agenda"},{id:"i2",titulo:"sem link",link:"http://x"},{titulo:"sem id",link:"#a"}]})}})`);
  const r = await a.janela({ de: dia(-6), ate: HOJE, provedores: ["intruso"], espacos: ESPACOS }); assert.equal(r.eventos.length, 1); assert.equal(r.eventos[0].espaco, "esp-c", "espaço imposto pelo orquestrador"); assert.equal(r.eventos[0].origem, "Intruso", "origem imposta"); assert.equal(r.invalidos, 2);
  const b = await a.buscar({ texto: "qualquer", filtros: { dominios: ["intruso"] }, espacos: ESPACOS }); assert.equal(b.itens.length, 1); assert.equal(b.itens[0].espaco, "esp-c");
});
test("um provedor que FALHA ou DEMORA não impede os outros: resultado parcial identificando a origem, sem expor texto do erro; nova tentativa só dele completa a lista", async () => {
  let consertado = false; const falhar = { compras_online: (ok, no) => (consertado ? Promise.resolve({ data: T().compras_online, error: null }).then(ok, no) : Promise.resolve({ data: null, error: { message: "tabela x: segredo do banco 42501" } }).then(ok, no)), newsletter_edicoes: () => new Promise(() => {}) };
  const a = ambiente({ tabelas: T(), politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T, falhar }), t0 = Date.now(), r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100, tempo: 80 });
  assert.ok(Date.now() - t0 < 1500, "o lento foi cortado pelo tempo-limite"); assert.equal(r.parcial, true); assert.deepEqual(r.falhas.map((f) => f.dominio).sort(), ["compras", "newsletter"]); assert.deepEqual(r.falhas.map((f) => f.erro).sort(), ["demorou demais", "sem acesso"], "mensagem curta, sem o texto do banco");
  assert.ok(!JSON.stringify(r.falhas).includes("segredo")); assert.ok(r.eventos.length > 6, "os outros entregaram"); assert.equal(r.temMais, true, "quem falhou ainda 'tem mais'"); assert.equal(r.cursores.compras, null);
  consertado = true; const de = await a.janela({ de: dia(-6), ate: HOJE, limite: 100, provedores: ["compras"], tempo: 80 }); assert.deepEqual(de.eventos.map((e) => e.id), ["compras:compras_online:co1"], "a nova tentativa só dele");
});
test("DEDUPLICAÇÃO: a nota fiscal vinculada ao pedido online aparece uma vez (o pedido fica, com a relação); a nota sem vínculo continua; nenhum registro original foi tocado", async () => {
  const dados = T(), antes = JSON.stringify(dados), a = ambiente({ tabelas: dados, politica: POLITICA }), r = await a.janela({ de: dia(-6), ate: HOJE, limite: 100 });
  const nf1 = r.eventos.find((e) => e.id === "fiscal:notas_fiscais:nf1"); assert.deepEqual(nf1.relacionados, ["compras:compras_online:co1"]); assert.equal(nf1.prioridade, 1);
  const d = N.tlDeduplicar(r.eventos); assert.ok(!d.some((e) => e.id === "fiscal:notas_fiscais:nf1")); assert.deepEqual(d.find((e) => e.id === "compras:compras_online:co1").relacionados, ["fiscal:notas_fiscais:nf1"]); assert.ok(d.some((e) => e.id === "fiscal:notas_fiscais:nf2"));
  /* nas duas páginas diferentes (a compra vem depois): a lista acumulada resolve igual */
  const p1 = (await a.janela({ de: dia(-6), ate: HOJE, provedores: ["fiscal"] })).eventos, p2 = (await a.janela({ de: dia(-6), ate: HOJE, provedores: ["compras"] })).eventos; assert.equal(N.tlDeduplicar(p1.concat(p2)).filter((e) => /co1|nf1/.test(e.id)).length, 1); assert.equal(JSON.stringify(dados), antes, "só leitura");
});
test("PAGINAÇÃO pelo orquestrador: com limite pequeno percorre tudo sem repetir nem perder, e cada página transfere no máximo limite × provedores linhas", async () => {
  const regs = [], gar = [], co = []; for (let i = 0; i < 90; i++) { regs.push({ id: "r" + String(i).padStart(3, "0"), quem: "olivia", tipo: "momento", data: dia(-(i % 30)), titulo: "Reg " + i, arquivos: [] }); gar.push({ user_id: "dono", id: 1000 + i, inicio: dia(-(i % 30)) + "T0" + (i % 9) + ":00:00", tipo: "running", dados: {} }); co.push({ id: "c" + String(i).padStart(3, "0"), loja: "amazon", data: dia(-(i % 30)), total_pago: 10, vendedor: "V" + i }); }
  const a = ambiente({ tabelas: T({ registros: regs, garmin_ativ: gar, compras_online: co, notas_fiscais: [], notas: [], inbox_mensagens_ref: [], newsletter_edicoes: [] }), politica: POLITICA }), todos = []; let cur = {}, rodadas = 0, maxLinhas = 0;
  for (;;) { a.log.linhas = 0; const r = await a.janela({ de: dia(-29), ate: HOJE, limite: 25, cursores: cur }); maxLinhas = Math.max(maxLinhas, a.log.linhas); todos.push(...r.eventos); cur = r.cursores; if (!r.temMais) break; if (++rodadas > 60) throw new Error("não terminou"); }
  const ids = todos.map((e) => e.id); assert.equal(ids.length, 270, "90 + 90 + 90"); assert.equal(new Set(ids).size, 270, "nenhum repetido"); const t = todos.map((e) => N.tlInstante(e.quando)); assert.ok(t.every((x, i) => !i || x <= t[i - 1]), "ordem global estável entre páginas");
  assert.ok(maxLinhas <= 25 * 3 + 10, "por página: no máximo limite × provedores (" + maxLinhas + ")"); assert.ok(rodadas >= 10, "paginou de verdade: " + rodadas);
});
test("BUSCA: acento, maiúscula, termo parcial e espaços extras; todos os termos; filtros por domínio, espaço e tipo; texto curto não consulta ninguém; caracteres especiais não quebram", async () => {
  const dados = T({ registros: [{ id: "r9", quem: "eddie", tipo: "consulta", data: dia(-1), titulo: "Consulta no Açougue Médico do João", detalhes: "retorno em 30 dias", arquivos: [] }, ...T().registros] }), a = ambiente({ tabelas: dados, politica: POLITICA, pessoal: PESSOAL_T, agenda: AGENDA_T, usuario: DONO });
  let r = await a.buscar({ texto: "  ACOUGUE   joao " }); assert.deepEqual(r.itens.filter((x) => x.dominio === "registros").map((x) => x.id), ["familia:registros:r9"], "sem acento e com espaços"); assert.deepEqual(r.termos, ["acougue", "joao"]);
  r = await a.buscar({ texto: "acoug" }); assert.equal(r.itens.filter((x) => x.dominio === "registros").length, 1, "termo parcial"); r = await a.buscar({ texto: "acougue estrela" }); assert.equal(r.itens.filter((x) => x.dominio === "registros").length, 0, "todos os termos precisam aparecer");
  r = await a.buscar({ texto: "cafe" }); assert.equal(r.itens.find((x) => x.dominio === "mercado").titulo, "Café torrado"); assert.equal(r.itens.find((x) => x.dominio === "mercado").acao.produto, "Café torrado");
  r = await a.buscar({ texto: "corrida" }); assert.equal(r.itens.find((x) => x.dominio === "saude").link, "#saude/treino/11"); r = await a.buscar({ texto: "fatura" }); assert.equal(r.itens[0].dominio, "inbox"); assert.equal(r.itens[0].anexo, true);
  r = await a.buscar({ texto: "ipva" }); assert.deepEqual(r.itens.map((x) => x.dominio).sort(), ["agenda", "lembretes"].filter((d) => d !== "agenda")); r = await a.buscar({ texto: "estrela" }); assert.deepEqual(r.itens.map((x) => x.dominio).sort(), ["compras", "fiscal"]);
  r = await a.buscar({ texto: "estrela", filtros: { dominios: ["fiscal"] } }); assert.deepEqual(r.itens.map((x) => x.dominio), ["fiscal"]); assert.deepEqual(r.provedores, ["fiscal"]);
  r = await a.buscar({ texto: "estrela", filtros: { espacos: ["esp-p"] }, espacos: ESPACOS }); assert.equal(r.itens.length, 0, "filtro 'só pessoal' não consulta a casa"); r = await a.buscar({ texto: "estrela", filtros: { espacos: ["esp-c"] }, espacos: ESPACOS }); assert.equal(r.itens.length, 2);
  r = await a.buscar({ texto: "estrela", filtros: { tipos: ["fiscal.nota"] } }); assert.deepEqual(r.itens.map((x) => x.tipo), ["fiscal.nota"]);
  a.log.chamadas.length = 0; for (const curto of ["", " ", "a", "é "]) { r = await a.buscar({ texto: curto }); assert.equal(r.itens.length, 0); assert.equal(r.curta, true); } assert.equal(a.log.chamadas.length, 0, "texto curto: zero consultas");
  for (const estranho of ["(((", "a|b", "[x]", "c++", "\\", '"aspas"', "%_", "a.b/c"]) await assert.doesNotReject(() => a.buscar({ texto: estranho }), estranho);
  for (const x of (await a.buscar({ texto: "estrela" })).itens) assert.ok(x.link.charAt(0) === "#" || /^https:/.test(x.link)); assert.equal((await a.buscar({ texto: "naoexisteumarcador" })).itens.length, 0);
  const sem = await a.buscar({ texto: "naoexisteumarcador" }); assert.equal(sem.parcial, false);
});
test("BUSCA com a saúde oculta: 'Ocultar valores' e 'esconder o local' valem também na busca; sem acesso a conteúdo pessoal para quem não é o dono", async () => {
  const dados = T({ garmin_ativ: [{ user_id: "dono", id: 21, inicio: dia(-1) + "T07:00:00", tipo: "running", dados: { nome: "Treino na Represa", local: "Represa de Itu" } }] }), a = ambiente({ tabelas: dados, politica: POLITICA, pessoal: { saudePrefs: { esconderLocal: true } } });
  assert.equal((await a.buscar({ texto: "represa" })).itens.filter((x) => x.dominio === "saude").length, 1, "o nome do treino acha"); assert.equal((await a.buscar({ texto: "itu" })).itens.length, 0, "o local escondido não é pesquisável");
  const b = ambiente({ tabelas: dados, politica: POLITICA, pessoal: { saudePrefs: { ocultar: true } } }); assert.equal((await b.buscar({ texto: "represa" })).itens.length, 0, "valores ocultos: a Saúde sai da busca"); const j = await b.janela({ de: dia(-6), ate: HOJE, provedores: ["saude"] }); assert.match(j.eventos[0].resumo, /ocultos/);
});
test("ESCALA: 10 mil registros em vários provedores: a primeira página sai com poucas linhas transferidas e rápida; a janela de 7 dias não varre o histórico; paginar 20 páginas não repete", async () => {
  const regs = [], gar = [], co = [], msgs = [], nf = [];
  for (let i = 0; i < 4000; i++) regs.push({ id: "r" + i, quem: i % 2 ? "olivia" : "eddie", tipo: "momento", data: dia(-(i % 1200)), titulo: "Registro " + i, arquivos: [] });
  for (let i = 0; i < 2000; i++) gar.push({ user_id: "dono", id: 10000 + i, inicio: dia(-(i % 900)) + "T0" + (i % 9) + ":30:00", tipo: "running", dados: { distancia: 5000 } });
  for (let i = 0; i < 1500; i++) co.push({ id: "c" + i, loja: "amazon", data: dia(-(i % 1000)), total_pago: 20, vendedor: "V" });
  for (let i = 0; i < 2000; i++) msgs.push({ id: "m" + i, dono: "dono", conta_id: "c1", pasta_id: "p-ent", recebida_em: new Date(Date.UTC(2026, 10, 27, 15) - i * 3600e3 * 7).toISOString(), assunto: "Mensagem " + i, remetente_nome: "R", lida: i % 3 === 0 });
  for (let i = 0; i < 500; i++) nf.push({ id: "n" + i, numero: String(i), data_emissao: dia(-(i % 700)), emitente_nome: "Loja " + i, valor_total: 10, situacao: "autorizada" });
  const a = ambiente({ tabelas: T({ registros: regs, garmin_ativ: gar, compras_online: co, inbox_mensagens_ref: msgs, notas_fiscais: nf, notas_fiscais_vinculos: [], notas: [], newsletter_edicoes: [] }), politica: POLITICA }), total = regs.length + gar.length + co.length + msgs.length + nf.length; assert.equal(total, 10000);
  let t0 = process.hrtime.bigint(); a.log.linhas = 0; const r = await a.janela({ de: dia(-6), ate: HOJE, limite: 50 }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`# DESEMPENHO 7 dias: ${r.eventos.length} eventos de ${total} registros; ${a.log.linhas} linhas transferidas; ${ms.toFixed(1)} ms (banco simulado, sem rede)`); assert.ok(a.log.linhas <= 50 * 5 + 20, "linhas transferidas: " + a.log.linhas); assert.ok(r.eventos.length === 50 && ms < 1500);
  t0 = process.hrtime.bigint(); a.log.linhas = 0; let cur = r.cursores, todos = r.eventos.slice(), n = 1; for (; n < 20; n++) { const p = await a.janela({ de: dia(-6), ate: HOJE, limite: 50, cursores: cur }); todos.push(...p.eventos); cur = p.cursores; if (!p.temMais) break; }
  console.log(`# DESEMPENHO ${n + 1} páginas de 50 na janela de 7 dias: ${todos.length} eventos, ${a.log.linhas} linhas, ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`); assert.equal(new Set(todos.map((e) => e.id)).size, todos.length, "sem repetição");
  t0 = process.hrtime.bigint(); a.log.linhas = 0; const antigo = await a.janela({ de: "", ate: HOJE, limite: 50 }); console.log(`# DESEMPENHO 'tudo' (sem período), primeira página: ${antigo.eventos.length} eventos, ${a.log.linhas} linhas transferidas de ${total}, ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`); assert.ok(a.log.linhas <= 50 * 5 + 20, "nunca o histórico inteiro: " + a.log.linhas);
  t0 = process.hrtime.bigint(); a.log.linhas = 0; const b = await a.buscar({ texto: "registro 39" }); console.log(`# DESEMPENHO busca em 10 mil: ${b.itens.length} resultados, ${a.log.linhas} linhas transferidas, ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`); assert.ok(a.log.linhas <= 12 * 8, "a busca limita por provedor: " + a.log.linhas);
});
test("virada do dia: o instante 23:30 de Brasília (02:30 UTC do dia seguinte) fica no dia certo na janela e na ordenação", async () => {
  const a = ambiente({ tabelas: T({ inbox_mensagens_ref: [{ id: "tarde", dono: "dono", conta_id: "c", pasta_id: "p-ent", recebida_em: dia(0) + "T02:30:00Z", assunto: "Quase meia-noite", remetente_nome: "X", lida: true }, { id: "cedo", dono: "dono", conta_id: "c", pasta_id: "p-ent", recebida_em: dia(0) + "T03:10:00Z", assunto: "Logo depois", remetente_nome: "X", lida: true }] }), politica: POLITICA });
  const r = await a.janela({ de: dia(-1), ate: HOJE, provedores: ["inbox"] }); const m = Object.fromEntries(r.eventos.map((e) => [e.id.split(":")[2], e])); assert.equal(N.tlDia(m.tarde.quando), dia(-1), "02:30 UTC ainda é o dia anterior"); assert.equal(N.tlDia(m.cedo.quando), dia(0), "03:10 UTC já é o dia novo");
  assert.deepEqual(r.eventos.map((e) => e.id.split(":")[2]), ["cedo", "tarde"]);
});
