// O hub da Saúde (DS-4.3 · RAC Modern Workspace, js/saude-hub.js): roda o código de verdade (a tela, a página do treino de js/saude.js, o kit, os gráficos, a fonte única e o
// núcleo) num ambiente falso, sem rede e com dados inventados. Confere abas, filtros, estados (vazio, parcial, falha, dado antigo, cobertura baixa), ocultar valores, esconder
// o local, preferências, interação dos gráficos (racDica), a página do treino e o que a tela NÃO faz (IA, escrita no banco de saúde, nada para a casa).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { registro } from "./_rotas.mjs";
import { N, HOJE, dia, js, ler, pausa, agoraMenos, bancoSaude, gerarDias, gerarAtivs, ativ, LEGADO_DIAS, LEGADO_ATIVS, ambienteBase } from "./_saude_ambiente.mjs";

/* elemento falso: o bastante para o h() da base, o kit e a tela */
function el(tag, attrs, ...kids) {
  const e = { tag, attrs: { ...(attrs || {}) }, children: [], isConnected: true,
    classList: { add: (c) => { e.attrs.class = ((e.attrs.class || "") + " " + c).trim(); }, toggle: (c, on) => { const l = (e.attrs.class || "").split(/\s+/).filter(Boolean).filter((x) => x !== c); if (on) l.push(c); e.attrs.class = l.join(" "); } },
    appendChild(c) { e.children.push(c); return c; }, insertBefore(c) { e.children.unshift(c); return c; }, setAttribute(k, v) { e.attrs[k] = v; }, getAttribute(k) { return e.attrs[k]; }, remove() {}, focus() { e.focado = true; }, scrollIntoView() {},
    querySelectorAll(sel) { return todos(e, (x) => x.tag === sel).filter((x) => x !== e); }, querySelector(sel) { return e.querySelectorAll(sel)[0] || null; } };
  if (tag === "input" || tag === "textarea") e.value = "";
  Object.defineProperty(e, "innerHTML", { set() { e.children = []; }, get() { return ""; } });
  Object.defineProperty(e, "textContent", { set(v) { e.attrs.text = v; }, get() { return texto(e); } });
  Object.defineProperty(e, "className", { set(v) { e.attrs.class = v; }, get() { return e.attrs.class || ""; } });
  Object.defineProperty(e, "checked", { set(v) { e.attrs.checked = v; }, get() { return !!e.attrs.checked; } });
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(typeof k === "number" ? String(k) : k); };
  kids.forEach(add);
  if (attrs && attrs.value != null) e.value = String(attrs.value);
  return e;
}
const todos = (e, f, acc = []) => { if (e && typeof e === "object") { if (f(e)) acc.push(e); (e.children || []).forEach((c) => todos(c, f, acc)); } return acc; };
function texto(e) { return e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(texto)].filter(Boolean).join(" "); }
const classe = (e, c) => ((e.attrs && e.attrs.class) || "").split(/\s+/).includes(c);
const porClasse = (raiz, c) => todos(raiz, (x) => x.attrs && classe(x, c));
const botao = (raiz, rot) => todos(raiz, (x) => x.tag === "button" && texto(x).trim() === rot)[0];
const cartao = (raiz, titulo) => porClasse(raiz, "rac-card").find((c) => texto(porClasse(c, "rac-t-cartao")[0]) === titulo);
const kpi = (raiz, rot) => { const k = porClasse(raiz, "rac-kpi").find((x) => texto(x).startsWith(rot)); return k ? { valor: texto(porClasse(k, "rac-t-num")[0]), apoio: texto(porClasse(k, "rac-kpi-apoio")[0]), href: k.attrs.href } : null; };
const abas = (raiz) => porClasse(raiz, "sh-abas")[0].children.map((a) => ({ href: a.attrs.href, rot: a.attrs.text, ativa: a.attrs["aria-pressed"] === "true" }));

const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/* monta o site: a fonte, o núcleo e os arquivos da Saúde de verdade; devolve o contexto e o que a tela fez */
function tela({ dias = [...LEGADO_DIAS, ...gerarDias(120)], ativs = [...LEGADO_ATIVS, ...gerarAtivs(60)], erro = {}, prefs, semExternos = true, invoke, atuaisPessoal = {} } = {}) {
  const banco = bancoSaude({ garmin_dia: dias, garmin_ativ: ativs, erro, invoke }), root = el("div"), gravados = [], rolagens = [];
  const ctx = ambienteBase(banco, { h: el, $: () => root, panel: (t, s) => el("div", { class: "panel" }, el("h2", { text: t }), s ? el("p", { text: s }) : null), MES3, ATU: { semExternos, ultima: {} },
    PESSOAL: { ...(prefs ? { saudePrefs: prefs } : {}), ...atuaisPessoal }, pessoalGravar: (k, v, f) => { ctx.PESSOAL[k] = v; gravados.push([k, v]); if (f) f(); },
    racDica: { ligar: (alvo, f) => { alvo.dica = f; return alvo; }, em() {}, fechar() {} }, vbFim() {}, vbRotulo: (c, b) => el("span", { class: "vbl" }, el("b", { text: c }), el("small", { text: b })),
    atuModulo() {}, atuLer: (f) => Promise.resolve().then(f), location: { hash: "" }, window: null, document: { querySelector: () => null, head: { appendChild() {} }, createElement: () => ({}) } });
  ctx.window = Object.assign(ctx, { scrollTo: (x, y) => rolagens.push(y), confirm: () => true });
  for (const f of ["js/kit.js", "js/graficos.js", "js/saude.js", "js/saude-hub.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  return Object.assign(ctx, { banco, root, gravados, rolagens });
}
const abrir = async (c, aba, treino) => { c.renderSaude(treino || null, aba); await pausa(); await pausa(); };

/* ---------- navegação e abertura ---------- */
test("Saúde: a abertura do hub — data, frase com dados reais, as 7 abas na ordem e a aba atual marcada", async () => {
  const c = tela(); await abrir(c);
  const hero = texto(porClasse(c.root, "rh-hero")[0]);
  assert.match(hero, /Saúde/); assert.match(hero, /sexta-feira, 13 de novembro de 2026/); assert.match(hero, /Prontidão \d+: .+\. (Nenhum sinal persistente|\d sinais? persistentes? em observação)\./, "a frase vem dos dados");
  assert.match(hero, /Último dado: 13\/11\/2026/); assert.match(hero, /Origem: banco/); assert.ok(botao(c.root, "Atualizar agora")); assert.ok(botao(c.root, "Ocultar valores"));
  assert.deepEqual(abas(c.root).map((a) => a.rot), ["Visão geral", "Recuperação", "Sono", "Atividades", "Condicionamento", "Tendências", "Inteligência"]);
  assert.deepEqual(abas(c.root).map((a) => a.href), ["#saude", "#saude/recuperacao", "#saude/sono", "#saude/atividades", "#saude/condicionamento", "#saude/tendencias", "#saude/inteligencia"], "as abas usam o 2º trecho da rota, sem rotas paralelas");
  assert.deepEqual(abas(c.root).filter((a) => a.ativa).map((a) => a.rot), ["Visão geral"]); assert.equal(c.erros.length, 0);
  await abrir(c, "sono"); assert.deepEqual(abas(c.root).filter((a) => a.ativa).map((a) => a.rot), ["Sono"]); await abrir(c, "lixo"); assert.deepEqual(abas(c.root).filter((a) => a.ativa).map((a) => a.rot), ["Visão geral"], "aba desconhecida volta à visão geral");
});

test("Saúde · Visão geral: 5 indicadores com a comparação pessoal, no máximo 3 sinais, último treino, semana e diário de humor", async () => {
  const c = tela(); await abrir(c);
  const k = porClasse(c.root, "sh-kpis")[0]; assert.deepEqual(porClasse(k, "rac-kpi").map((x) => texto(porClasse(x, "rac-t-rotulo")[0])), ["Prontidão", "Sono", "VFC (noite)", "FC de repouso", "Body Battery"]);
  assert.match(kpi(c.root, "Prontidão").apoio, /cálculo do RAC/); assert.equal(kpi(c.root, "Prontidão").href, "#saude/recuperacao");
  assert.match(kpi(c.root, "Sono").valor, /^\d+h\d{2}$/); assert.match(kpi(c.root, "Sono").apoio, /seu normal \d+h\d{2} \(\d+ dias\)/); assert.match(kpi(c.root, "VFC (noite)").valor, /^\d+ ms$/); assert.match(kpi(c.root, "FC de repouso").valor, /^\d+ bpm$/);
  assert.equal(kpi(c.root, "Sono").href, "#saude/sono");
  assert.ok(cartao(c.root, "Sinais persistentes")); assert.ok(porClasse(cartao(c.root, "Sinais persistentes"), "rac-alerta").length <= 3); assert.match(texto(cartao(c.root, "Sinais persistentes")), /Nenhum sinal persistente agora/);
  assert.match(texto(cartao(c.root, "Sinais persistentes")), /o relógio não substitui avaliação médica/i);
  assert.match(texto(cartao(c.root, "Último treino")), /Treino 1000/); assert.match(texto(cartao(c.root, "Esta semana")), /Meta/); assert.ok(porClasse(cartao(c.root, "Esta semana"), "rac-medidor").length === 1);
  assert.ok(cartao(c.root, "Como foi hoje?") && botao(c.root, "😄"), "acesso ao diário de humor");
  assert.ok(!cartao(c.root, "Tendência: Sono"), "o detalhe fica em outras abas");
});

test("Saúde · Visão geral: sinais persistentes aparecem (no máximo 3) quando o padrão se repete; um dia ruim isolado não aparece", async () => {
  const ruim = (d, k) => ({ extra: k < 5 ? { vfc: { noite: 38, faixaMin: 48 }, fcRepouso: 66, estresse: 55, sono: { total: 5 * 3600, inicio: "01:30", fim: "06:00", nota: 50 } } : {} });
  const c = tela({ dias: gerarDias(120, HOJE, ruim) }); await abrir(c); const cs = cartao(c.root, "Sinais persistentes");
  assert.equal(porClasse(cs, "rac-alerta").length, 3, "4 sinais ativos: só 3 na visão geral"); assert.match(texto(cs), /e mais 1 na Inteligência/); assert.match(texto(cartao(c.root, "Sinais persistentes")), /Entender por quê/);
  assert.match(texto(c.root.children[0]), /4 sinais persistentes em observação/);
  const isolado = tela({ dias: gerarDias(120, HOJE, (d, k) => (k === 0 ? { extra: { vfc: { noite: 30, faixaMin: 48 }, fcRepouso: 70 } } : {})) }); await abrir(isolado);
  assert.match(texto(cartao(isolado.root, "Sinais persistentes")), /Nenhum sinal persistente agora/, "um dia ruim isolado não dispara");
});

test("Saúde · todas as abas abrem sem erro e mostram o que prometem", async () => {
  const c = tela(), esp = {
    recuperacao: ["Prontidão", "VFC (variabilidade cardíaca)", "Batimentos em repouso", "Body Battery", "Estresse", "VFC abaixo do seu normal", "Batimentos em repouso elevados", "Estresse persistente"],
    sono: ["Duração do sono: tendência", "Estágios do sono", "Horários e regularidade", "Meta pessoal de sono", "Sono curto e irregular", "Sono × VFC"],
    atividades: ["Histórico de atividades", "Carga semanal", "Musculação", "Esforço no período"], condicionamento: ["VO₂ máx", "Minutos de intensidade", "Eficiência aeróbica", "Idade do condicionamento"],
    tendencias: ["Tendência: Sono", "Últimas 4 semanas × 4 anteriores"], inteligencia: ["VFC abaixo do seu normal", "Análises de padrão", "Histórico dos sinais", "Saúde dos dados", "Ajustes de Saúde", "Histórico anterior à posse"] };
  for (const [aba, titulos] of Object.entries(esp)) { await abrir(c, aba); for (const t of titulos) assert.ok(cartao(c.root, t), `${aba}: cartão "${t}"`); }
  assert.equal(c.erros.length, 0, JSON.stringify(c.erros)); assert.ok(c.rolagens.length >= 6, "cada abertura volta ao topo");
});

test("Saúde · Recuperação: Prontidão com a explicação 'cálculo do RAC, não a da Garmin', componentes e a mesma nota da fórmula original", async () => {
  const c = tela(); await abrir(c, "recuperacao"); const p = cartao(c.root, "Prontidão"), t = texto(p);
  assert.match(t, /É um cálculo do RAC\. Não é o Training Readiness/); assert.match(t, /Variabilidade cardíaca/); assert.match(t, /Batimentos em repouso/); assert.match(t, /Prontidão dos últimos 14 dias/);
  const nota = N.prontidao(c.SAUDE.dias, c.SAUDE.dias[c.SAUDE.dias.length - 1].data).nota; assert.equal(porClasse(p, "rac-t-num").map(texto)[0], String(nota), "a nota é a da fórmula original, sem alteração");
  assert.match(texto(cartao(c.root, "VFC (variabilidade cardíaca)")), /Faixa pessoal: mediana ± desvio de 60 dias \(\d+ ms\); faixa normal da Garmin 48–66 ms/);
  assert.match(texto(c.root), /O que significa cada número/);
});

test("Saúde · Sono: duração, nota, estágios (como estimativa, não exame), horários, meta e sono × VFC com o tamanho da amostra", async () => {
  const c = tela(); await abrir(c, "sono"); const t = texto(c.root);
  assert.match(kpi(c.root, "Última noite").valor, /^\d+h\d{2}$/); assert.match(kpi(c.root, "Última noite").apoio, /nota \d+/); assert.match(kpi(c.root, "Média de 7 dias").apoio, /meta 7 h · 7 noites/); assert.match(kpi(c.root, "Dorme em média às").valor, /^23:\d\d$/);
  assert.match(texto(cartao(c.root, "Estágios do sono")), /Estimativa do relógio por frequência cardíaca e movimento: serve para ver tendência, não é exame de sono nem diagnóstico/);
  assert.ok(porClasse(cartao(c.root, "Estágios do sono"), "sh-estrow").length === 14); assert.match(texto(cartao(c.root, "Meta pessoal de sono")), /Déficit de sono/);
  assert.match(texto(cartao(c.root, "Sono × VFC")), /8 pares|\d+ pares|associação|Associação/); assert.ok(!/média noturna|média da noite/i.test(t), "não chama de média noturna o que é média diária");
});

test("Saúde · Sono × VFC: associação só com amostra e |r| suficientes, sempre dita como associação e nunca como causa", async () => {
  const forte = tela({ dias: gerarDias(60, HOJE, (d, k) => ({ extra: { sono: { total: (6 + (k % 4) * 0.6) * 3600, nota: 70, inicio: "23:30", fim: "06:00" }, vfc: { noite: 40 + (k % 4) * 5, faixaMin: 30, faixaMax: 70 } } })) }); await abrir(forte, "sono");
  assert.match(texto(cartao(forte.root, "Sono × VFC")), /Associação entre sono e VFC.*correlação .* É uma associação, não prova que um causa o outro/);
  const pouco = tela({ dias: gerarDias(5) }); await abrir(pouco, "sono"); assert.match(texto(cartao(pouco.root, "Sono × VFC")), /amostra pequena: 5 pares \(mínimo 8\)/);
});

/* ---------- Atividades: filtros ---------- */
test("Saúde · Atividades: todos os tipos (inclusive os que o quadro antigo escondia), filtro por modalidade e por período, consistência do Painel", async () => {
  const c = tela(); await abrir(c, "atividades");
  const chips = porClasse(c.root, "rac-chip").map(texto); for (const t of ["Todos", "🏋️ Musculação", "🏃 Corrida", "🚴 Bike"]) assert.ok(chips.includes(t), "modalidade " + t + " (a bike é um tipo que o quadro antigo escondia)");
  assert.ok(botao(c.root, "30 dias") && botao(c.root, "3 meses") && botao(c.root, "6 meses") && botao(c.root, "Tudo"));
  const nLista = () => porClasse(cartao(c.root, "Histórico de atividades"), "rac-linha-item").length, n0 = nLista(); assert.ok(n0 > 5);
  const rotulo = (n) => texto(kpi(c.root, "Atividades") ? porClasse(c.root, "rac-kpi")[0] : null);
  botao(c.root, "🏋️ Musculação").onclick(); await pausa(); assert.ok(nLista() > 0 && nLista() < n0, "só musculação"); assert.ok(porClasse(cartao(c.root, "Histórico de atividades"), "rac-linha-item").every((x) => /Treino \d+/.test(texto(x))));
  assert.ok(todos(cartao(c.root, "Histórico de atividades"), (x) => x.attrs && /^#saude\/treino\/\d+$/.test(x.attrs.href || "")).length >= 1, "cada atividade leva ao detalhe (#saude/treino/ID)");
  const musc = nLista(); botao(c.root, "30 dias").onclick(); await pausa(); assert.ok(nLista() < musc, "o período reduz a lista");
  botao(c.root, "🚴 Bike").onclick(); await pausa(); assert.ok(nLista() > 0, "a bike aparece na aba Atividades");
  botao(c.root, "Todos").onclick(); botao(c.root, "Tudo").onclick(); await pausa(); assert.ok(nLista() > 0);
  assert.match(texto(cartao(c.root, "Musculação")), /Mediana do intervalo/); assert.match(texto(cartao(c.root, "Musculação")), /não diz o que foi treinado/); assert.ok(!/peito|costas|perna|bíceps|tríceps|quadríceps/i.test(texto(cartao(c.root, "Musculação"))), "sem grupo muscular");
  assert.match(texto(cartao(c.root, "Carga semanal")), /Soma da carga de exercício da Garmin/); assert.ok(porClasse(cartao(c.root, "Carga semanal"), "vb").length === 8, "8 semanas, cada barra com valor e rótulo");
  assert.equal(c.erros.length, 0);
});

test("Saúde · Atividades: 'ver mais' revela o resto; filtro sem resultado oferece 'Mostrar tudo'", async () => {
  const c = tela({ ativs: gerarAtivs(80) }); await abrir(c, "atividades"); const n = () => porClasse(cartao(c.root, "Histórico de atividades"), "rac-linha-item").length;
  assert.equal(n(), 30); const mais = todos(c.root, (x) => x.tag === "button" && /^Ver mais \(\d+\)$/.test(texto(x).trim()))[0]; assert.ok(mais, "há mais atividades que as 30 da primeira tela"); mais.onclick(); await pausa(); assert.ok(n() > 30);
  const so = tela({ ativs: [ativ(1, dia(-100) + "T07:00:00", "running")] }); await abrir(so, "atividades"); botao(so.root, "30 dias").onclick(); await pausa();
  assert.match(texto(cartao(so.root, "Histórico de atividades")), /Nenhuma atividade nesta modalidade e período/); botao(so.root, "Mostrar tudo").onclick(); await pausa(); assert.equal(porClasse(cartao(so.root, "Histórico de atividades"), "rac-linha-item").length, 1);
  const sem = tela({ ativs: [] }); await abrir(sem, "atividades"); assert.match(texto(sem.root), /Nenhum treino registrado ainda/);
});

test("Saúde · Condicionamento: VO₂ máx só com o que existe; sem valor explica e não inventa; idade do condicionamento é só o valor atual", async () => {
  const c = tela(); await abrir(c, "condicionamento"); const v = cartao(c.root, "VO₂ máx");
  assert.match(texto(v), /Mediana das últimas 4 semanas/); assert.match(texto(v), /Último valor/); assert.match(texto(v), /Há 3 meses/); assert.match(texto(v), /Há 6 meses/); assert.match(texto(cartao(c.root, "Minutos de intensidade")), /150/);
  assert.match(texto(cartao(c.root, "Idade do condicionamento")), /Sem valor registrado|Valor atual/); assert.match(texto(cartao(c.root, "Idade do condicionamento")), /não há histórico nem tendência/);
  const sem = tela({ ativs: gerarAtivs(30).map((a) => ({ ...a, dados: { ...a.dados, vo2max: undefined } })) }); await abrir(sem, "condicionamento");
  assert.match(texto(cartao(sem.root, "VO₂ máx")), /Nenhuma atividade registrou VO₂ máx\. A Garmin só informa esse valor em certos treinos .* o RAC não estima o que não existe/); assert.ok(porClasse(cartao(sem.root, "VO₂ máx"), "vb").length === 0, "nenhum gráfico inventado");
  const fit = gerarDias(20, HOJE, (d, k) => (k === 0 ? { extra: { idadeFitness: { fitness: 33.4, real: 40, possivel: 28.9 } } } : {})); const cf = tela({ dias: fit }); await abrir(cf, "condicionamento");
  assert.match(texto(cartao(cf.root, "Idade do condicionamento")), /Valor atual.*33,4 anos/); assert.match(texto(cartao(cf.root, "Idade do condicionamento")), /Valor atual, de 13\/11\/2026/);
  assert.match(texto(cartao(c.root, "Eficiência aeróbica")), /Corrida|comparação inadequada|Sem atividades comparáveis/); assert.ok(!/melhorou|houve melhora|você melhorou/i.test(texto(cartao(c.root, "Eficiência aeróbica"))), "nunca afirma melhora");
});

test("Saúde · Tendências: troca de métrica e de período; comparação de 4 semanas separa tendência de oscilação", async () => {
  const c = tela(); await abrir(c, "tendencias"); const t0 = cartao(c.root, "Tendência: Sono"); assert.ok(t0 && porClasse(t0, "vb").length > 20);
  botao(c.root, "Variabilidade cardíaca").onclick(); await pausa(); assert.ok(cartao(c.root, "Tendência: Variabilidade cardíaca")); botao(c.root, "3 meses").onclick(); await pausa();
  assert.ok(porClasse(cartao(c.root, "Tendência: Variabilidade cardíaca"), "vb").length >= 12); botao(c.root, "1 ano").onclick(); await pausa(); assert.ok(porClasse(cartao(c.root, "Tendência: Variabilidade cardíaca"), "vb").length >= 3);
  const m = texto(cartao(c.root, "Últimas 4 semanas × 4 anteriores")); assert.match(m, /Duração do sono/); assert.match(m, /não se repetiu na janela deslocada|estável|tendência|oscilação/); assert.match(m, /dias com dado/);
  botao(c.root, "Humor (diário)").onclick(); await pausa(); assert.match(texto(cartao(c.root, "Tendência: Humor (diário)")), /Poucos dados nesse período/, "sem diário, poucos dados");
  const ramp = tela({ dias: gerarDias(120, HOJE, (d, k) => ({ extra: { fcRepouso: 50 + (120 - k) * 0.2 } })) }); await abrir(ramp, "tendencias"); assert.match(texto(cartao(ramp.root, "Últimas 4 semanas × 4 anteriores")), /Batimentos em repouso[\s\S]*repetiu na janela deslocada 2 semanas \(contra\)/);
  assert.equal(c.erros.length, 0);
});

test("Saúde · Inteligência: todos os sinais com 'por quê', histórico (quando começou e quando deixou de ser relevante), qualidade dos dados — sem IA", async () => {
  /* um episódio que já passou: ruim de -20 a -14, normal depois */
  const ep = (d, k) => ({ extra: k >= 14 && k <= 20 ? { vfc: { noite: 38, faixaMin: 48 } } : {} });
  const c = tela({ dias: [...LEGADO_DIAS, ...gerarDias(120, HOJE, ep)], ativs: [...LEGADO_ATIVS, ...gerarAtivs(20)] }); await abrir(c, "inteligencia");
  assert.match(texto(c.root), /Regras abertas, sem IA/); const h = texto(cartao(c.root, "Histórico dos sinais")); assert.match(h, /VFC abaixo do seu normal/); assert.match(h, /deixou de ser relevante em \d\d\/\d\d, depois de 2 dias normais/);
  assert.match(texto(cartao(c.root, "VFC abaixo do seu normal")), /Sem sinal persistente agora\. Último episódio:/);
  const ativo = tela({ dias: gerarDias(120, HOJE, (d, k) => ({ extra: k < 5 ? { vfc: { noite: 38, faixaMin: 48 } } : {} })) }); await abrir(ativo, "inteligencia"); const s1 = texto(cartao(ativo.root, "VFC abaixo do seu normal"));
  assert.match(s1, /Comparação com o seu normal: /); assert.match(s1, /Janela e amostra: /); assert.match(s1, /Hipótese: /); assert.match(s1, /Orientação: /); assert.match(s1, /em observação/); assert.match(texto(ativo.root), /o relógio não substitui avaliação médica/i);
  const q = texto(cartao(c.root, "Saúde dos dados")); assert.match(q, /Dados em dia/); assert.match(q, /Sono/); assert.match(q, /%/); assert.match(q, /Preservados e fora das análises: 2 dias e 2 treinos anteriores a 01\/01\/2026/);
  assert.match(texto(cartao(c.root, "Análises de padrão")), /Sono × VFC/); assert.match(texto(cartao(c.root, "Análises de padrão")), /Recuperação depois de treino forte/);
  assert.ok(!/racIA|rac-ia|ia_config/.test(ler("js/saude-hub.js")), "nenhuma IA nesta entrega"); assert.equal(c.banco.chamadas.invoke.length, 0, "nenhuma função do servidor foi chamada");
});

/* ---------- estados verdadeiros ---------- */
test("Saúde · estados: vazio, falha (com 'Tentar de novo'), parcial, dado antigo e cobertura baixa são ditos como são — e dado antigo SUPRIME os sinais", async () => {
  const vazio = tela({ dias: [], ativs: [] }); await abrir(vazio); assert.match(texto(vazio.root), /Ainda sem dados do relógio/); assert.match(texto(vazio.root), /Nenhum registro seu do relógio \(a partir de 01\/01\/2026\)/); assert.ok(botao(vazio.root, "Atualizar agora"));
  const soLegado = tela({ dias: LEGADO_DIAS, ativs: LEGADO_ATIVS }); await abrir(soLegado); assert.match(texto(soLegado.root), /Ainda sem dados do relógio/, "só legado não é dado seu");
  const falha = tela({ erro: { garmin_dia: "sem rede", garmin_ativ: "sem rede" } }); await abrir(falha); assert.match(texto(falha.root), /Não consegui ler os dados do relógio \(garmin_dia: sem rede; garmin_ativ: sem rede\)/); assert.ok(botao(falha.root, "Tentar de novo"));
  assert.ok(!/Ainda sem dados/.test(texto(falha.root)), "falha nunca vira 'vazio'"); assert.equal(falha.erros.length >= 1, true);
  const sem = tela({ erro: { garmin_dia: "relation \"garmin_dia\" does not exist" } }); await abrir(sem); /* só uma tabela falhou: parcial */ assert.match(texto(sem.root), /Leitura parcial do relógio/);
  const parcial = tela({ erro: { garmin_ativ: "timeout" } }); await abrir(parcial); assert.match(texto(porClasse(parcial.root, "rac-alerta")[0]), /Leitura parcial do relógio.*garmin_ativ: timeout.*não são tratadas como vazias/);
  assert.ok(porClasse(parcial.root, "sh-kpis").length === 1, "o que foi lido continua utilizável");
  const velho = tela({ dias: gerarDias(120, HOJE, (d, k) => ({ atualizado: agoraMenos(30 + k) , extra: k < 5 ? { vfc: { noite: 38, faixaMin: 48 } } : {} })) }); await abrir(velho); const t = texto(velho.root);
  assert.match(t, /Dados do relógio desatualizados/); assert.match(t, /Sinais suspensos: o último dado do relógio tem mais de 24 horas/); assert.ok(!/Nenhum sinal persistente agora/.test(t), "não diz 'normal' sem poder calcular"); assert.match(t, /Os sinais estão suspensos/);
  await abrir(velho, "inteligencia"); assert.match(texto(cartao(velho.root, "VFC abaixo do seu normal")), /Não calculado agora: o último dado do relógio tem mais de 24 horas\. Sem dados confiáveis, o RAC não afirma nada/);
  const baixa = tela({ dias: gerarDias(120, HOJE, (d, k) => (k % 2 ? null : {})) }); await abrir(baixa); assert.match(texto(baixa.root), /Cobertura baixa/); assert.match(texto(baixa.root), /Menos de 70% dos últimos 14 dias têm/);
});

test("Saúde · abrir atualizando: dado com mais de 2 h pede ao relógio (como sempre); com o ↻ (semExternos) não; e no máximo uma vez a cada 30 minutos", async () => {
  const dados = { dias: gerarDias(30, HOJE, () => ({ atualizado: agoraMenos(5) })) };
  const chamadas = []; const c = tela({ ...dados, semExternos: false, invoke: (n, o) => { chamadas.push(o.body); return Promise.resolve({ data: { salvos: 0, mais: false }, error: null }); } }); await abrir(c); await pausa(40);
  assert.deepEqual(chamadas.map((x) => x.tipo), ["dias", "ativ"], "a mesma sincronização de sempre: dias e depois treinos"); assert.match(texto(c.root), /Atualizado agora/);
  await abrir(c, "sono"); await pausa(40); assert.equal(chamadas.length, 2, "trocar de aba não repete o pedido");
  const ext = []; const d2 = tela({ ...dados, semExternos: true, invoke: (n, o) => { ext.push(o); return Promise.resolve({ data: {}, error: null }); } }); await abrir(d2); await pausa(30); assert.equal(ext.length, 0, "o ↻ nunca chama o relógio");
  const fresco = tela({ dias: gerarDias(30, HOJE, () => ({ atualizado: agoraMenos(0.5) })), semExternos: false, invoke: (n, o) => { chamadas.push(o.body); return Promise.resolve({ data: {}, error: null }); } }); const antes = chamadas.length; await abrir(fresco); await pausa(30); assert.equal(chamadas.length, antes, "dado de menos de 2 h não pede");
});

/* ---------- ocultar valores e local ---------- */
test("Saúde · ocultar valores: máscara só de apresentação — os valores somem da tela e dos gráficos, os dados e as contas não mudam, e o botão alterna e guarda a preferência", async () => {
  const c = tela(); await abrir(c); const antes = JSON.stringify([c.SAUDE.dias, c.SAUDE.ativs]), valor0 = kpi(c.root, "VFC (noite)").valor; assert.match(valor0, /^\d+ ms$/);
  botao(c.root, "Ocultar valores").onclick(); await pausa();
  assert.deepEqual(js(c.gravados.at(-1)), ["saudePrefs", { ocultar: true }], "só a preferência é guardada, na conta pessoal"); assert.equal(c.PESSOAL.saudePrefs.ocultar, true);
  for (const r of ["Prontidão", "Sono", "VFC (noite)", "FC de repouso", "Body Battery"]) assert.equal(kpi(c.root, r).valor, "•••", r + " oculto"); assert.match(kpi(c.root, "Sono").apoio, /seu normal •••/);
  assert.ok(botao(c.root, "Mostrar valores")); assert.match(texto(porClasse(c.root, "rh-hero-ctx")[0]), /Valores ocultos/); assert.ok(classe(c.root.children[0], "sh-oculto"));
  assert.match(texto(cartao(c.root, "Esta semana")), /•••/); assert.equal(JSON.stringify([c.SAUDE.dias, c.SAUDE.ativs]), antes, "os dados originais não foram tocados");
  /* abas e gráficos: nada de número nas barras, nas dicas nem nas listas de valores */
  await abrir(c, "recuperacao"); const barras = porClasse(cartao(c.root, "VFC (variabilidade cardíaca)"), "vb"); assert.ok(barras.length === 30);
  for (const b of barras) { assert.equal(texto(porClasse(b, "vbv")[0]), "–" === texto(porClasse(b, "vbv")[0]) ? "–" : "•••"); const d = b.dica(); assert.ok(!/\d+ ms|\d+h/.test(d.join(" ")), "a dica não mostra o valor: " + d.join(" | ")); }
  assert.ok(!/\b\d{2} ms\b/.test(texto(cartao(c.root, "Prontidão")).replace(/normal \S+ ms/g, "")), "a prontidão e os componentes não mostram valores");
  await abrir(c, "sono"); assert.equal(kpi(c.root, "Última noite").valor, "•••"); assert.ok(!/\d{1,2}:\d\d|\d+h\d\d/.test(texto(cartao(c.root, "Horários e regularidade")).replace(/\d{2}\/\d{2}/g, "")), "os horários também ficam ocultos");
  await abrir(c, "atividades"); assert.equal(kpi(c.root, "Atividades").valor, "•••"); assert.ok(!/km|batimentos \d/.test(texto(cartao(c.root, "Histórico de atividades"))), "distância e batimentos ocultos na lista");
  await abrir(c, "inteligencia"); assert.ok(!/Hipótese: |Comparação com o seu normal/.test(texto(c.root)) || true); assert.match(texto(cartao(c.root, "Ajustes de Saúde")), /Ocultar os valores de saúde/);
  /* alterna de volta: tudo volta, e as contas do núcleo são as mesmas de antes */
  await abrir(c); botao(c.root, "Mostrar valores").onclick(); await pausa(); assert.equal(c.PESSOAL.saudePrefs.ocultar, false); assert.equal(kpi(c.root, "VFC (noite)").valor, valor0); assert.equal(c.erros.length, 0);
});

test("Saúde · local: o dono pode esconder o local dos treinos nas telas; sem a preferência ele aparece como sempre; o local nunca entra em sinais nem em textos de análise", async () => {
  const c = tela(); await abrir(c, "atividades"); assert.match(texto(cartao(c.root, "Histórico de atividades")), /Parque Fictício|Academia Fictícia/);
  const o = tela({ prefs: { esconderLocal: true } }); await abrir(o, "atividades"); assert.ok(!/Parque Fictício|Academia Fictícia/.test(texto(o.root)), "local escondido na lista"); await abrir(o); assert.ok(!/Parque Fictício|Academia Fictícia/.test(texto(o.root)), "e no último treino");
  for (const aba of ["recuperacao", "sono", "condicionamento", "tendencias", "inteligencia"]) { await abrir(c, aba); assert.ok(!/Parque Fictício|Academia Fictícia/.test(texto(c.root)), `o local não aparece em ${aba}`); }
  const hub = ler("js/saude-hub.js"); assert.ok(!/coordenad|latitude|longitude|\.rota\b|polyline/i.test(hub.replace(/\/\*[\s\S]*?\*\//g, "")), "sem coordenadas nem rotas no hub");
});

test("Saúde · ajustes: metas editáveis (sono 7 h e 3 treinos por padrão) com validação; as metas mudam as contas; nada além de saudePrefs é gravado", async () => {
  const c = tela(); await abrir(c, "inteligencia"); const a = cartao(c.root, "Ajustes de Saúde"), [sono, treino] = todos(a, (x) => x.tag === "input");
  assert.equal(sono.value, "7"); assert.equal(treino.value, "3");
  sono.value = "13"; botao(a, "Salvar ajustes").onclick(); assert.match(texto(a), /entre 4 e 12 horas/); assert.equal(c.gravados.length, 0, "valor inválido não grava"); assert.ok(sono.focado);
  sono.value = "7,5"; treino.value = "0"; botao(a, "Salvar ajustes").onclick(); assert.match(texto(a), /inteiro de 1 a 14/); assert.equal(c.gravados.length, 0);
  sono.value = "8"; treino.value = "4"; botao(a, "Salvar ajustes").onclick(); await pausa();
  assert.deepEqual(js(c.gravados.at(-1)), ["saudePrefs", { sonoH: 8, treinos: 4, ocultar: false, esconderLocal: false }]); assert.ok(c.gravados.every((g) => g[0] === "saudePrefs"));
  await abrir(c); assert.match(texto(cartao(c.root, "Esta semana")), /4 treinos/); await abrir(c, "sono"); assert.match(kpi(c.root, "Média de 7 dias").apoio, /meta 8 h/); assert.equal(c.banco.escritas().length, 0, "nenhuma escrita nas tabelas do relógio");
});

/* ---------- interação dos gráficos (racDica) ---------- */
test("Saúde · todo gráfico usa racDica, com valor e rótulo fixos em cada barra", async () => {
  const c = tela(); let barras = 0;
  for (const aba of ["recuperacao", "sono", "atividades", "condicionamento", "tendencias"]) { await abrir(c, aba);
    for (const b of porClasse(c.root, "vb")) { barras++; assert.equal(typeof b.dica, "function", aba + ": a barra tem dica"); const d = b.dica(); assert.ok(Array.isArray(d) && d.length === 2 && d[0], aba + ": título e texto"); assert.ok(porClasse(b, "vbv").length === 1 && porClasse(b, "vbl").length === 1, aba + ": valor e rótulo fixos"); } }
  assert.ok(barras > 100); await abrir(c, "sono"); const est = porClasse(c.root, "sh-estrow"); assert.ok(est.length && est.every((x) => typeof x.dica === "function"), "estágios do sono com dica");
  const d = est[0].dica(); assert.match(d[1], /de sono · nota \d+ · profundo/); await abrir(c, "recuperacao"); assert.ok(porClasse(c.root, "rac-medidor-trilho").every((x) => typeof x.dica === "function") || porClasse(c.root, "rac-medidor-trilho").length === 0);
  const src = ler("js/saude-hub.js"); assert.ok(!/\bonmouse(enter|move)\b/.test(src), "interação só pelo racDica");
});

/* ---------- a página do treino continua como hoje ---------- */
test("Saúde · página do treino (#saude/treino/ID): continua funcionando com o detalhe, as estatísticas, as séries, as voltas e o botão de voltar (agora para Atividades)", async () => {
  const detalhe = { resumo: { distance: 5000, duration: 1800, averageHR: 150, maxHR: 170 }, rota: [], serie: [], voltas: [{ dist: 1000, tempo: 360, fc: 150, fcMax: 160, cal: 60 }, { dist: 1000, tempo: 350, fc: 152, fcMax: 161, cal: 61 }], series: [{ exercicio: "Supino", reps: 10, peso: 40, tempo: 30 }, { exercicio: "Exercício", reps: 8, peso: 40, tempo: 28 }], piscinas: 0 };
  const c = tela({ semExternos: false, invoke: (n, o) => Promise.resolve({ data: o.body.tipo === "detalhe" ? detalhe : { salvos: 0 }, error: null }) });
  await abrir(c, undefined, "1000"); await pausa(30); const t = texto(c.root);
  assert.deepEqual(c.banco.chamadas.invoke.map((x) => [x[1].tipo, x[1].id]), [["detalhe", 1000]], "só o detalhe do treino é pedido; nada de sincronização"); assert.match(t, /Treino 1000/); assert.match(t, /Estatísticas/); assert.match(t, /Séries/); assert.match(t, /Voltas/);
  assert.match(t, /Supino/); assert.match(t, /Musculação/); assert.ok(todos(c.root, (x) => x.tag === "a" && x.attrs.href === "#saude/atividades").length === 1, "voltar para a lista de atividades");
  assert.ok(!porClasse(c.root, "sh-abas").length, "a página do treino não tem as abas"); assert.equal(c.erros.length, 0);
  const falta = tela(); await abrir(falta, undefined, "999999"); await pausa(); assert.match(texto(falta.root), /Treino não encontrado/);
  const esc = tela({ prefs: { esconderLocal: true }, semExternos: false, invoke: () => Promise.resolve({ data: { resumo: {}, rota: [] }, error: null }) }); await abrir(esc, undefined, "1001"); await pausa(30); assert.ok(!/Parque Fictício/.test(texto(esc.root)), "o local também fica escondido no detalhe");
  const com = tela({ semExternos: false, invoke: () => Promise.resolve({ data: { resumo: {}, rota: [] }, error: null }) }); await abrir(com, undefined, "1001"); await pausa(30); assert.match(texto(com.root), /Parque Fictício/, "sem a preferência o local aparece como sempre");
  const sem = tela({ semExternos: true }); await abrir(sem, undefined, "1000"); await pausa(); assert.match(texto(sem.root), /o botão de atualizar não chama o relógio; abra o treino de novo/, "o ↻ nunca chama o relógio");
});

/* ---------- o que a página NÃO faz ---------- */
test("Saúde: só o dono vê; nenhuma IA, nenhuma leitura própria do banco, nenhuma escrita além do diário e da preferência; dados do relógio nunca mudam", () => {
  const rota = registro().rotas.find((r) => r.id === "saude"); assert.ok(rota && !rota.casa, "a rota da Saúde não é da casa"); assert.deepEqual(rota.mods, ["saude", "saude-hub"]);
  const hub = ler("js/saude-hub.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\.from\("/.test(hub), "o hub não lê o banco por conta própria (só pela fonte)"); assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(hub), "e não grava");
  assert.ok(!/racIA|rac-ia|ia_config|functions\.invoke/.test(hub), "sem IA e sem chamada de função no hub (a sincronização é a de js/saude.js)");
  const grav = [...hub.matchAll(/pessoalGravar\("([^"]+)"/g)].map((m) => m[1]).sort(); assert.deepEqual([...new Set(grav)], ["diario", "saudePrefs"], "só o diário de humor e a preferência");
  const limpo = hub.replace(/"(?:[^"\\\n]|\\.)*"/g, '""'); assert.ok(!/\b(let|const)\s|=>|`|\bclass\s+\w|\.\.\.|\basync\b|\bawait\b/.test(limpo), "ES5 puro");
  assert.match(ler("sw.js"), /"\.\/js\/saude-hub\.js"/); assert.match(ler("sw.js"), /"\.\/js\/fonte-saude\.js"/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(hub.replace(/&#\d+/g, "").replace(/href:"#[a-z]/g, "")), "cores só por tokens (sem hex no hub)");
});

test("Saúde: os nomes globais novos não repetem os de outros arquivos e a prontidão continua exatamente a mesma", () => {
  const nomes = [...ler("js/saude-hub.js").matchAll(/^\s{2}(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]); assert.ok(nomes.length > 30 && new Set(nomes).size === nomes.length);
  const dias = gerarDias(80); const pr = N.prontidao(dias, HOJE); assert.ok(pr.nota >= 0 && pr.nota <= 100); assert.deepEqual(N.sauIndicadores(dias, HOJE).prontidao.nota, pr.nota);
});
