// DS-4.3 · S1: a fonte única da Saúde (js/fonte-saude.js) e a consolidação dos leitores. Banco falso que pagina de verdade e registra tudo; dados inventados.
// Cobre: sucesso, vazio, parcial, falha, paginação, classificação legado/meus, leituras simultâneas, nenhuma escrita, e a REGRESSÃO dos consumidores (Saúde/Painel/Resumo,
// RAC Hoje, Sistema e Carreira): os leitores de antes (copiados da main) e os de agora, no mesmo banco falso, entregam exatamente o mesmo.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { N, HOJE, dia, js, ler, pausa, agoraMenos, bancoSaude, gerarDias, gerarAtivs, ativ, diaGarmin, LEGADO_DIAS, LEGADO_ATIVS, ambienteBase } from "./_saude_ambiente.mjs";

const congelar = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(congelar); } return o; };

test("fonte: sucesso — dias em ordem crescente, treinos do mais novo ao mais antigo, só o que é meu, com último dia, origem e hora da última atualização", async () => {
  const b = bancoSaude({ garmin_dia: [...LEGADO_DIAS, ...gerarDias(30)], garmin_ativ: [...LEGADO_ATIVS, ...gerarAtivs(10)] }), c = ambienteBase(b);
  const r = js(await c.fonteLer("saude"));
  assert.equal(r.ok, true); assert.equal(r.vazio, false); assert.equal(r.parcial, false); assert.equal(r.origem, "banco"); assert.equal(r.ultimo, HOJE); assert.equal(r.quando, HOJE + "T23:59:00-03:00");
  const ds = r.v.dias.map((d) => d.data); assert.deepEqual(ds, [...ds].sort(), "dias do mais antigo ao mais novo"); assert.equal(ds.length, 30); assert.ok(ds.every((d) => d >= "2026-01-01"));
  const as = r.v.ativs.map((a) => a.inicio); assert.deepEqual(as, [...as].sort().reverse(), "treinos do mais novo ao mais antigo"); assert.equal(as.length, 10);
  assert.deepEqual(r.v.legado, { dias: 2, ativs: 2 }, "o legado é contado, preservado e fora da entrega"); assert.ok(r.v.atualizado && Date.now() - Date.parse(r.v.atualizado) < 2 * 3600e3);
  assert.deepEqual(Object.keys(r).sort(), ["falhas", "nota", "ok", "origem", "parcial", "quando", "ultimo", "v", "vazio"]);
});

test("fonte: classificação — 31/12 é legado, 01/01 é meu (inclusive); a data do evento decide, nunca o recebimento; o legado fica fora de toda conta", async () => {
  const b = bancoSaude({ garmin_dia: [diaGarmin("2025-12-31"), diaGarmin("2026-01-01"), diaGarmin("2026-01-02")], garmin_ativ: [ativ(1, "2025-12-31T23:50:00", "running"), ativ(2, "2026-01-01T00:05:00", "running")] }), c = ambienteBase(b);
  const L = await c.saudeColetarLeitura();
  assert.deepEqual(L.dias.map((d) => d.data), ["2026-01-01", "2026-01-02"]); assert.deepEqual(L.ativs.map((a) => a.id), [2]); assert.deepEqual(L.legado, { dias: 1, ativs: 1 });
  assert.equal(N.SAU_MARCO.data, "2026-01-01", "a regra de propriedade não mudou");
  /* tudo legado: a fonte diz 'vazia' (não é falha), mas o legado continua contado */
  const so = ambienteBase(bancoSaude({ garmin_dia: LEGADO_DIAS, garmin_ativ: LEGADO_ATIVS })), r = js(await so.fonteLer("saude"));
  assert.equal(r.ok, true); assert.equal(r.vazio, true); assert.deepEqual(r.v.dias, []); assert.deepEqual(r.v.legado, { dias: 2, ativs: 2 }); assert.equal(r.ultimo, null);
});

test("fonte: vazio (tabelas lidas, sem linhas) não é falha; parcial (uma tabela falhou) segue marcada; falha (nenhuma lida) é erro e nunca vira 'vazio'", async () => {
  const vazia = ambienteBase(bancoSaude()), v = js(await vazia.fonteLer("saude")); assert.equal(v.ok, true); assert.equal(v.vazio, true); assert.equal(v.parcial, false); assert.deepEqual(v.falhas, []);
  const par = ambienteBase(bancoSaude({ garmin_dia: gerarDias(5), garmin_ativ: [], erro: { garmin_ativ: "timeout do banco" } })), p = js(await par.fonteLer("saude"));
  assert.equal(p.ok, true); assert.equal(p.parcial, true); assert.equal(p.vazio, false); assert.equal(p.v.dias.length, 5); assert.match(p.falhas[0], /garmin_ativ: timeout do banco/);
  assert.deepEqual(par.erros.map((e) => e[0]), ["saúde"], "a falha vai para o registro de erros");
  const so = ambienteBase(bancoSaude({ garmin_dia: [], garmin_ativ: [], erro: { garmin_dia: "sem rede", garmin_ativ: "sem rede" } })), f = js(await so.fonteLer("saude"));
  assert.equal(f.ok, false); assert.match(f.erro, /a leitura do relógio falhou/); assert.match(f.erro, /garmin_dia: sem rede/);
  const L = await so.saudeColetarLeitura(); assert.equal(L.estado, "falha"); assert.equal((await ambienteBase(bancoSaude({ garmin_dia: gerarDias(2) })).saudeColetarLeitura()).estado, "completa");
  assert.equal((await par.saudeColetarLeitura()).estado, "parcial");
  /* a leitura estrita (Painel, Resumo e Saúde) continua lançando erro em qualquer falha, como sempre */
  await assert.rejects(par.saudeLer(), /garmin_ativ: timeout do banco/); await assert.rejects(so.saudeLer(), /garmin_dia/);
});

test("fonte: paginação — mais de 1000 linhas chegam completas, sem repetir nem perder, e a ordem é a prometida", async () => {
  const muitas = []; for (let k = 0; k < 2350; k++) muitas.push(ativ(5000 + k, N.somaDiasISO("2026-01-01", Math.floor(k / 3)) + "T" + String(6 + (k % 3) * 4).padStart(2, "0") + ":00:00", "running"));
  const dias = gerarDias(1200, N.somaDiasISO("2026-01-01", 1199)), b = bancoSaude({ garmin_dia: dias, garmin_ativ: muitas }), c = ambienteBase(b), L = await c.saudeColetarLeitura();
  assert.equal(L.ativs.length, 2350); assert.equal(new Set(L.ativs.map((a) => a.id)).size, 2350, "sem repetir"); assert.equal(L.dias.length, 1200); assert.equal(new Set(L.dias.map((d) => d.data)).size, 1200);
  assert.deepEqual(b.log.filter((x) => x.t === "garmin_ativ").map((x) => x.entregues), [1000, 1000, 350], "três páginas"); assert.deepEqual(b.log.filter((x) => x.t === "garmin_dia").map((x) => x.entregues), [1000, 200]);
  assert.ok(L.ativs[0].inicio > L.ativs[2349].inicio); assert.ok(L.dias[0].data < L.dias[1199].data);
  /* exatamente 1000 linhas: confere a página seguinte (vazia) */
  const exato = bancoSaude({ garmin_ativ: muitas.slice(0, 1000) }); assert.equal((await ambienteBase(exato).saudeColetarLeitura()).ativs.length, 1000); assert.deepEqual(exato.log.filter((x) => x.t === "garmin_ativ").map((x) => x.entregues), [1000, 0], "página cheia: confere a seguinte");
});

test("fonte: janelas e colunas — desdeDias/desdeAtiv filtram no banco, limiteAtiv pega os mais novos, semDias/semAtiv não leem a tabela", async () => {
  const b = bancoSaude({ garmin_dia: gerarDias(90), garmin_ativ: gerarAtivs(40) }), c = ambienteBase(b);
  const r = await c.saudeColetarLeitura({ desdeDias: dia(-9), desdeAtiv: dia(-9), colsDia: "data,dados", colsAtiv: "inicio,tipo" });
  assert.equal(r.dias.length, 10); assert.ok(r.ativs.every((a) => a.inicio.slice(0, 10) >= dia(-9)));
  const gd = b.log.find((x) => x.t === "garmin_dia"); assert.deepEqual(gd.ops.find((o) => o[0] === "gte"), ["gte", "data", dia(-9)]); assert.deepEqual(gd.ops.find((o) => o[0] === "select"), ["select", "data,dados"]);
  const b2 = bancoSaude({ garmin_dia: gerarDias(10), garmin_ativ: gerarAtivs(40) }), r2 = await ambienteBase(b2).saudeColetarLeitura({ semDias: true, limiteAtiv: 5 });
  assert.equal(r2.ativs.length, 5); assert.equal(b2.lidas("garmin_dia"), 0, "semDias não lê garmin_dia"); assert.deepEqual(r2.ativs[0].id, 1000, "os 5 mais novos"); assert.ok(b2.log[0].ops.some((o) => o[0] === "limit" && o[1] === 5));
  const r3 = await ambienteBase(bancoSaude({ garmin_dia: gerarDias(3), garmin_ativ: gerarAtivs(4) })).saudeColetarLeitura({ semAtiv: true }); assert.equal(r3.ativs.length, 0); assert.equal(r3.dias.length, 3);
  const so = ambienteBase(bancoSaude({ garmin_ativ: [], erro: { garmin_ativ: "x" } })); assert.equal((await so.saudeColetarLeitura({ semDias: true })).estado, "falha", "a única tabela pedida falhou");
});

test("fonte: leituras iguais pedidas ao mesmo tempo usam a mesma consulta; terminada, a próxima lê de novo; pedidos diferentes não se misturam", async () => {
  const b = bancoSaude({ garmin_dia: gerarDias(5), garmin_ativ: gerarAtivs(3), atraso: { garmin_dia: 20, garmin_ativ: 20 } }), c = ambienteBase(b);
  const [a1, a2, a3] = await Promise.all([c.saudeColetarLeitura(), c.saudeColetarLeitura(), c.saudeLer()]);
  assert.equal(a1, a2, "a mesma promessa"); assert.equal(b.lidas("garmin_dia"), 1); assert.equal(b.lidas("garmin_ativ"), 1); assert.equal(a3.dias.length, 5);
  await c.saudeColetarLeitura(); assert.equal(b.lidas("garmin_dia"), 2, "depois de terminada, nada fica guardado: a próxima lê de novo (o ↻ sempre relê)");
  const b2 = bancoSaude({ garmin_dia: gerarDias(5), garmin_ativ: gerarAtivs(3) }), c2 = ambienteBase(b2); const [x, y] = await Promise.all([c2.saudeColetarLeitura(), c2.saudeColetarLeitura({ desdeDias: dia(-1) })]);
  assert.notEqual(x, y); assert.equal(x.dias.length, 5); assert.equal(y.dias.length, 2); assert.equal(b2.lidas("garmin_dia"), 2);
  /* uma leitura que falha não fica presa: a seguinte tenta de novo */
  const b3 = bancoSaude({ garmin_dia: gerarDias(2), erro: { garmin_dia: "caiu", garmin_ativ: "caiu" } }), c3 = ambienteBase(b3); await c3.saudeColetarLeitura(); b3.log.length = 0; await c3.saudeColetarLeitura(); assert.equal(b3.lidas("garmin_dia"), 1);
});

test("fonte: só lê — nenhuma escrita, exclusão ou chamada de função; as linhas recebidas não são alteradas e o legado continua no banco", async () => {
  const dias = congelar([...LEGADO_DIAS, ...gerarDias(20)]), ativs = congelar([...LEGADO_ATIVS, ...gerarAtivs(8)]), antes = JSON.stringify([dias, ativs]);
  const b = bancoSaude({ garmin_dia: dias, garmin_ativ: ativs }), c = ambienteBase(b); await c.saudeColetarLeitura(); await c.fonteLer("saude"); await c.saudeLer();
  assert.equal(b.escritas().length, 0); assert.equal(b.chamadas.invoke.length, 0); assert.equal(JSON.stringify([dias, ativs]), antes, "nada foi alterado"); assert.equal(dias.length, 22, "o legado segue lá");
  const t = ler("js/fonte-saude.js").replace(/\/\*[\s\S]*?\*\//g, ""); assert.ok(!/\.(insert|update|upsert|delete)\(|functions\.invoke/.test(t));
});

/* ---------- regressão: os leitores de ANTES (copiados da main) × a fonte única, no mesmo banco falso ---------- */
const ANTES = `
  function pagAntes(t,cols,ord,from,acc){return SB.from(t).select(cols).order(ord,{ascending:false}).range(from,from+999).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pagAntes(t,cols,ord,from+1000,acc):acc})}
  /* js/saude.js · saudeLer */
  function saudeLerAntes(){return Promise.all([pagAntes("garmin_dia","data,dados,atualizado","data",0,[]),pagAntes("garmin_ativ","id,inicio,tipo,dados","inicio",0,[])])
      .then(function(r){var c=NUCLEO.sauClassificar(r[0].reverse(),r[1]);return {dias:c.meus.dias,ativs:c.meus.ativs,legado:c.contagem.legado}})}
  /* js/hoje.js · HOJE_LEITORES.saude */
  function hojeSaudeAntes(){var hoje=hojeISO(),ocultos=NUCLEO.TREINO_OCULTOS;
      return Promise.all([dadosPaginar(function(f){return SB.from("garmin_dia").select("data,dados").gte("data",NUCLEO.somaDiasISO(hoje,-60)).order("data").range(f,f+999)}),
        Promise.resolve().then(function(){return SB.from("garmin_ativ").select("inicio,tipo").gte("inicio",NUCLEO.somaDiasISO(hoje,-14))}).then(sbOk)])
      .then(function(r0){var c=NUCLEO.sauClassificar(r0[0],r0[1]),r=[c.meus.dias,c.meus.ativs];
        var ult=r[0][r[0].length-1];return {v:{dias:r[0],ativs:r[1].filter(function(a){return ocultos.indexOf(a.tipo)<0})},vazio:!r[0].length,quando:ult?ult.data+"T23:59:00-03:00":null,ultimo:ult?ult.data:null,origem:"banco"}})}
  /* js/sistema.js · prontidão e busca global de treinos */
  function sistemaProntidaoAntes(hoje){return Promise.resolve().then(function(){return Promise.all([SB.from("garmin_dia").select("data,dados").gte("data",maisDias(hoje,-61)).order("data").then(sbOk),
      SB.from("garmin_ativ").select("inicio,tipo").gte("inicio",maisDias(hoje,-61)).then(sbOk)])}).then(function(x){var c=NUCLEO.sauClassificar(x[0],x[1]);return [c.meus.dias,c.meus.ativs]}).catch(function(){return null})}
  function sistemaBuscaAntes(){return SB.from("garmin_ativ").select("id,inicio,tipo,dados").order("inicio",{ascending:false}).limit(1000).then(sbOk).then(function(l){return NUCLEO.sauClassificar([],l).meus.ativs})}
  /* js/carreira.js · as duas tabelas inteiras, cada uma com a sua queda para [] */
  function carreiraAntes(){function pag(t,cols,de,acc){return SB.from(t).select(cols).range(de,de+999).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pag(t,cols,de+1000,acc):acc})}
      return Promise.all([pag("garmin_dia","data,dados",0,[]).catch(function(){return []}),pag("garmin_ativ","inicio,tipo,dados",0,[]).catch(function(){return []})]).then(function(r){var cl=NUCLEO.sauClassificar(r[0],r[1]);return [cl.meus.dias,cl.meus.ativs]})}
`;
function ambienteRegressao(b) {
  const c = ambienteBase(b);
  vm.runInContext(ANTES, c, { filename: "leitores-antes (main)" });
  /* os leitores de agora: os trechos de verdade de js/hoje.js, js/sistema.js e js/carreira.js */
  const h = ler("js/hoje.js"), i = h.indexOf("    saude:function(){var hoje=hojeISO()"), j = h.indexOf("    mba:function(){");
  assert.ok(i > 0 && j > i, "leitor da Saúde no RAC Hoje"); vm.runInContext("var HOJE_NOVO={\n" + h.slice(i, j).replace(/,\s*$/, "") + "\n};", c, { filename: "hoje.js (leitor saude)" });
  vm.runInContext("function hojePag(q){return dadosPaginar(q)}", c);
  const s = ler("js/sistema.js"), p0 = s.indexOf("    var pSa=fonteLer("), p1 = s.indexOf("\n", p0); assert.ok(p0 > 0); vm.runInContext("function sistemaProntidaoAgora(hoje){\n" + s.slice(p0, p1).replace(/^\s*var pSa=/, "return ").replace(/;\s*$/, "") + ";}", c, { filename: "sistema.js (prontidão)" });
  const b0 = s.indexOf('ps.push(tenta("treinos"'), b1 = s.indexOf("\n", s.indexOf("\n", b0) + 1); assert.ok(b0 > 0);
  vm.runInContext("var buscaAdds=[];function add(tipo,t,sub,extra,alvo){buscaAdds.push({tipo:tipo,t:t,sub:sub,txt:extra,alvo:alvo})}function ativTipo(t){return [t,'•']}function datas(s){return s}\nfunction tenta(n,f){return f()}var ps=[];\nfunction sistemaBuscaAgora(){ps=[];buscaAdds=[];" + s.slice(b0, b1) + "\nreturn ps[0].then(function(){return buscaAdds})}", c, { filename: "sistema.js (busca)" });
  vm.runInContext("function carreiraAgora(){return fonteLer('saude',{colsDia:'data,dados',colsAtiv:'inicio,tipo,dados'}).then(function(r){var sa=r.ok?r.v:{dias:[],ativs:[]};return [sa.dias,sa.ativs]})}", c, { filename: "carreira.js (leitura)" });
  return c;
}
const cenario = () => ({ garmin_dia: [...LEGADO_DIAS, ...gerarDias(80)], garmin_ativ: [...LEGADO_ATIVS, ...gerarAtivs(30), ativ(77, dia(-3) + "T09:00:00", "fitness_equipment", { carga: 20 })] });

test("regressão · Saúde, Painel e Resumo: saudeLer devolve exatamente o mesmo {dias, ativs, legado} de antes (com legado e mais de uma página)", async () => {
  const muitos = gerarAtivs(60); for (let k = 0; k < 1100; k++) muitos.push(ativ(9000 + k, N.somaDiasISO("2026-02-01", Math.floor(k / 4)) + "T" + String(6 + (k % 4) * 3).padStart(2, "0") + ":00:00", "walking", { carga: 10 }));
  const c = ambienteRegressao(bancoSaude({ garmin_dia: [...LEGADO_DIAS, ...gerarDias(150)], garmin_ativ: [...LEGADO_ATIVS, ...muitos] }));
  assert.deepEqual(js(await c.saudeLer()), js(await vm.runInContext("saudeLerAntes()", c)));
  const vazio = ambienteRegressao(bancoSaude()); assert.deepEqual(js(await vazio.saudeLer()), js(await vm.runInContext("saudeLerAntes()", vazio)));
});

test("regressão · RAC Hoje: a fonte 'saude' entrega o mesmo objeto de antes (dias, treinos sem os tipos escondidos, vazio, quando, ultimo, origem); leitura incompleta continua sendo erro", async () => {
  const c = ambienteRegressao(bancoSaude(cenario())), novo = js(await vm.runInContext("HOJE_NOVO.saude()", c)), velho = js(await vm.runInContext("hojeSaudeAntes()", c));
  assert.deepEqual(novo, velho); assert.ok(novo.v.dias.length > 50 && novo.v.ativs.length > 0 && novo.v.ativs.every((a) => !["fitness_equipment", "open_water_swimming", "cycling"].includes(a.tipo)));
  assert.equal(novo.ultimo, HOJE); assert.equal(novo.origem, "banco");
  const vz = ambienteRegressao(bancoSaude()); assert.deepEqual(js(await vm.runInContext("HOJE_NOVO.saude()", vz)), js(await vm.runInContext("hojeSaudeAntes()", vz)));
  const par = ambienteRegressao(bancoSaude({ garmin_dia: gerarDias(5), erro: { garmin_ativ: "caiu" } }));
  await assert.rejects(vm.runInContext("HOJE_NOVO.saude()", par), /a leitura do relógio falhou/); await assert.rejects(vm.runInContext("hojeSaudeAntes()", par), /caiu/);
  /* os indicadores do RAC Hoje calculados sobre a leitura nova e a velha são idênticos */
  assert.deepEqual(js(N.hojeSaude({ ok: true, v: novo.v }, HOJE)), js(N.hojeSaude({ ok: true, v: velho.v }, HOJE)));
});

test("regressão · Sistema: a prontidão (dias e treinos dos últimos 61 dias) e a busca global de treinos (1000 mais novos, só os meus) são as mesmas de antes", async () => {
  const c = ambienteRegressao(bancoSaude(cenario()));
  const pn = js(await vm.runInContext("sistemaProntidaoAgora(hojeISO())", c)), pv = js(await vm.runInContext("sistemaProntidaoAntes(hojeISO())", c)), porInicio = (l) => [...l].sort((x, y) => (x.inicio < y.inicio ? -1 : 1));
  assert.deepEqual(pn[0], pv[0], "os mesmos dias, na mesma ordem"); assert.deepEqual(porInicio(pn[1]), porInicio(pv[1]), "os mesmos treinos (a ordem agora é garantida: mais novo primeiro)"); assert.ok(pn[0].length >= 60);
  assert.deepEqual(js(N.prontidao(pn[0], HOJE)), js(N.prontidao(pv[0], HOJE)), "a prontidão é a mesma, número por número");
  const bn = js(await vm.runInContext("sistemaBuscaAgora()", c)), bv = js(await vm.runInContext("sistemaBuscaAntes()", c));
  assert.deepEqual(bn.map((x) => x.alvo.href), bv.map((a) => "#saude/treino/" + a.id), "a mesma lista de treinos na busca, na mesma ordem"); assert.ok(!bn.some((x) => /#saude\/treino\/(7|8)$/.test(x.alvo.href)), "o legado não entra na busca");
  const falha = ambienteRegressao(bancoSaude({ garmin_dia: gerarDias(5), erro: { garmin_ativ: "caiu" } })); assert.equal(await vm.runInContext("sistemaProntidaoAgora(hojeISO())", falha), null); assert.equal(await vm.runInContext("sistemaProntidaoAntes(hojeISO())", falha), null, "leitura incompleta não vira cartão, como antes");
});

test("regressão · Sistema: o dono pode esconder o local dos treinos na busca global (e o texto da busca sem local continua o mesmo de antes quando não esconde)", async () => {
  const b = bancoSaude({ garmin_ativ: gerarAtivs(3) }), c = ambienteRegressao(b);
  const com = js(await vm.runInContext("sistemaBuscaAgora()", c)); assert.ok(com.some((x) => /Parque Fictício|Academia Fictícia/.test(x.txt)), "sem a preferência o local entra na busca, como antes");
  c.PESSOAL.saudePrefs = { esconderLocal: true }; const sem = js(await vm.runInContext("sistemaBuscaAgora()", c)); assert.ok(!sem.some((x) => /Parque Fictício|Academia Fictícia/.test(x.txt)), "com a preferência o local não é indexado");
  assert.equal(sem.length, com.length, "o resto da busca é o mesmo");
});

test("regressão · Carreira: as tabelas 'saude' e 'treinos' do SQLite recebem as mesmas linhas de antes; uma tabela que falha vira lista vazia, sem derrubar a outra", async () => {
  const c = ambienteRegressao(bancoSaude(cenario())), k = ler("js/carreira.js");
  assert.match(k, /fonteLer\("saude",\{colsDia:"data,dados",colsAtiv:"inicio,tipo,dados"\}\)/, "é exatamente esta chamada que a Carreira faz");
  assert.match(k, /var sa=r\[2\]\.ok\?r\[2\]\.v:\{dias:\[\],ativs:\[\]\};r\[2\]=sa\.dias;r\.splice\(3,0,sa\.ativs\)/);
  const nova = js(await vm.runInContext("carreiraAgora()", c)), velha = js(await vm.runInContext("carreiraAntes()", c));
  const chave = (l) => l.map((x) => x.data || x.inicio).sort(); assert.deepEqual(chave(nova[0]), chave(velha[0])); assert.deepEqual(chave(nova[1]), chave(velha[1]));
  assert.deepEqual(nova[0].map((d) => d.dados.passos).sort(), velha[0].map((d) => d.dados.passos).sort());
  const meio = ambienteRegressao(bancoSaude({ garmin_dia: gerarDias(5), erro: { garmin_ativ: "caiu" } })); const m = js(await vm.runInContext("carreiraAgora()", meio)), mv = js(await vm.runInContext("carreiraAntes()", meio));
  assert.deepEqual([m[0].length, m[1].length], [5, 0]); assert.deepEqual([mv[0].length, mv[1].length], [5, 0], "igual ao de antes: a tabela que falhou fica vazia e a outra segue");
});

test("regressão · Painel e Resumo continuam usando o relógio só pela leitura da Saúde (saudeLer e saudeCarregar), com os mesmos nomes e formatos", () => {
  const p = ler("js/painel.js"), r = ler("js/resumo.js"), s = ler("js/saude.js");
  assert.match(p, /saudeLer\(\)/); assert.match(p, /saudeCarregar\(\)/); assert.match(r, /saudeCarregar\(\)/); assert.match(s, /function saudeCarregar\(\)\{\n\s+return saudeLer\(\)\.then\(function\(x\)\{SAUDE\.dias=x\.dias;SAUDE\.ativs=x\.ativs;SAUDE\.legado=x\.legado\}\)\}/);
  assert.match(ler("js/fonte-saude.js"), /function saudeLer\(\)/); assert.ok(!/function saudeLer\(/.test(s), "saudeLer mora só na fonte");
  assert.match(ler("js/app.js"), /"fonte-saude":\["fontes"\]/); assert.match(ler("js/app.js"), /saude:\["fonte-saude"\]/);
});
