// Alimentação e Delivery sem rede e sem custo: a conta do pedido (taxas, gorjeta, descontos, arredondamento), as categorias de
// alimentação, os nomes de produtos, a duplicidade, a entrada no Painel sem contar em dobro, o SQL 024 (casa, RLS, trava da 2ª
// etapa, backup) e a IA só em DEMO (docs/alimentacao.md). Os estabelecimentos dos testes são fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ACOES } from "../supabase/functions/rac-ia/acoes.ts";
import { respostaDemo } from "../supabase/functions/rac-ia/demo.ts";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const pedido = (extra = {}) => ({ id: "p1", data: "2026-10-30", plataforma: "ifood", modo: "delivery", estabelecimento: "Pizzaria Exemplo",
  itens: [{ descricao: "Pizza grande", qtd: 1, unitario: 59.9, total: 59.9 }, { descricao: "Coca-Cola 2L", qtd: 1, total: 14 }],
  taxa_entrega: 7.99, taxa_servico: 0.99, gorjeta: 5, desconto_plataforma: 10, total_pago: 77.88, ...extra });

test("conta do pedido: itens + entrega + serviço + gorjeta − descontos = total pago, em centavos", () => {
  const c = N.alPedidoConta(pedido());
  assert.equal(c.ok, true, c.erros.join(" "));
  assert.deepEqual([c.subtotal, c.taxas, c.gorjeta, c.descontos, c.calculado, c.pago], [73.9, 8.98, 5, 10, 77.88, 77.88]);
  /* 0,1 + 0,2: sem erro de ponto flutuante */
  assert.equal(N.alPedidoConta({ itens: [{ descricao: "a", total: 0.1 }, { descricao: "b", total: 0.2 }], total_pago: 0.3 }).ok, true);
  assert.equal(N.alCent("R$ 1.234,56"), 123456); assert.equal(N.alCent("12,5"), 1250); assert.equal(N.alCent(1.005), 101);
  /* desconto do item e da loja; textos com vírgula */
  const d = N.alPedidoConta({ itens: [{ descricao: "x", qtd: "2", unitario: "10,00", total: "20,00", desconto: "2" }], desconto_loja: "3", taxa_entrega: "5", total_pago: "20,00" });
  assert.equal(d.ok, true, d.erros.join(" ")); assert.equal(d.subtotal, 18);
});
test("conta do pedido: valores inválidos, divergência e total ausente impedem; tolerância de 2 centavos", () => {
  assert.match(N.alPedidoConta(pedido({ total_pago: 80 })).erros.join(" "), /A conta dá R\$ 77,88.*total pago é R\$ 80,00/);
  assert.equal(N.alPedidoConta(pedido({ total_pago: 77.9 })).ok, true, "2 centavos de arredondamento passam");
  assert.equal(N.alPedidoConta(pedido({ total_pago: 77.91 })).ok, false);
  assert.match(N.alPedidoConta(pedido({ total_pago: null })).erros.join(" "), /Preencha o total pago/);
  assert.match(N.alPedidoConta(pedido({ gorjeta: -1 })).erros.join(" "), /gorjeta/);
  assert.match(N.alPedidoConta(pedido({ taxa_entrega: "abc" })).erros.join(" "), /taxa de entrega/);
  assert.match(N.alPedidoConta({ itens: [], total_pago: 1 }).erros.join(" "), /pelo menos um item/);
  assert.match(N.alPedidoConta({ itens: [{ descricao: "x", qtd: 2, unitario: 10, total: 25 }], total_pago: 25 }).erros.join(" "), /quantidade × unitário/);
  assert.match(N.alPedidoConta({ itens: [{ descricao: "x", total: 10, desconto: 11 }], total_pago: 0 }).erros.join(" "), /desconto/);
  assert.match(N.alPedidoConta({ itens: [{ descricao: "x", total: 10 }], desconto_plataforma: 20, total_pago: 0 }).erros.join(" "), /descontos passam/);
  const c = N.alConferir({ ...pedido(), data: "2026-12-01", plataforma: "x", estabelecimento: " " }, { hoje: "2026-11-01" });
  assert.equal(c.ok, false); assert.match(c.erros.join(" "), /estabelecimento.*futuro.*onde foi o pedido/s);
});
test("despesas do pedido: comida, taxas e gorjeta separadas, somando o total pago; delivery × restaurante", () => {
  const L = N.alPedidoDespesas(pedido());
  assert.deepEqual(L.map((x) => [x.cat, x.v, x.f]), [["Alimentação · Delivery", 63.9, "Delivery"], ["Alimentação · Taxas de entrega e serviço", 8.98, "Delivery"], ["Alimentação · Gorjeta", 5, "Delivery"]]);
  assert.equal(Math.round(L.reduce((s, x) => s + x.v, 0) * 100), 7788);
  assert.equal(N.alPedidoDespesas(pedido({ plataforma: "direto", modo: "no_local", taxa_entrega: 0, taxa_servico: 0, total_pago: 68.9 }))[0].cat, "Alimentação · Restaurante");
  assert.equal(N.alModo({ plataforma: "ifood" }), "delivery"); assert.equal(N.alModo({ plataforma: "ifood", modo: "retirada" }), "restaurante");
  /* cupom maior que a comida: o resto desconta das taxas, e o total continua batendo */
  const g = N.alPedidoDespesas({ data: "2026-10-30", plataforma: "ifood", itens: [{ descricao: "x", total: 5 }], taxa_entrega: 8, desconto_plataforma: 6, total_pago: 7 });
  assert.deepEqual(g.map((x) => [x.cat, x.v]), [["Alimentação · Taxas de entrega e serviço", 7]]);
  assert.deepEqual(N.alPedidoDespesas(pedido({ total_pago: 99 })), [], "pedido com conta errada não entra em conta nenhuma");
});
test("categorias: as oito de alimentação; limpeza, higiene, descartáveis e fraldas ficam fora; as do Mercado não mudam", () => {
  assert.deepEqual(N.AL_CATEGORIAS, ["Alimentação · Supermercado", "Alimentação · Açougue/Peixaria", "Alimentação · Padaria", "Alimentação · Hortifrúti",
    "Alimentação · Delivery", "Alimentação · Restaurante", "Alimentação · Taxas de entrega e serviço", "Alimentação · Gorjeta"]);
  /* toda categoria que o Mercado sugere hoje tem destino explícito (comida ou fora), nunca "sem classificação" */
  const cats = N.MK_CATEGORIAS;
  assert.equal(cats.length, 11);
  for (const c of cats) assert.notEqual(N.alCatMercado(c, "x"), null, c);
  assert.equal(N.alCatMercado("Mercearia", "Arroz 5kg"), "Alimentação · Supermercado");
  assert.equal(N.alCatMercado("Açougue/Frios", "Fraldinha bovina"), "Alimentação · Açougue/Peixaria", "fraldinha é carne");
  assert.equal(N.alCatMercado("Hortifruti", "Banana"), "Alimentação · Hortifrúti"); assert.equal(N.alCatMercado("Padaria", "Pão"), "Alimentação · Padaria");
  for (const [c, p] of [["Limpeza", "Detergente"], ["Higiene Pessoal", "Sabonete"], ["Limpeza/Descartáveis", "Guardanapo"], ["Mercearia", "Fralda Pampers G"], ["Mercearia", "Lenço umedecido"]])
    assert.equal(N.alCatMercado(c, p), "", c + " / " + p);
  assert.equal(N.alCatMercado("Brinquedos", "Carrinho"), null, "categoria nova fica sem classificação (aparece à parte, não some)");
  const m = N.alMercadoDespesas([{ data: "2026-10-01", categoria: "Mercearia", produto: "Arroz", valor_total: 30 }, { data: "2026-10-01", categoria: "Limpeza", produto: "Omo", valor_total: 20 }]);
  assert.equal(m.linhas.length, 1); assert.equal(m.fora, 20);
});
test("produtos: normaliza espaços, acentos, pontuação e unidades; nunca junta marca, tamanho ou versão diferente", () => {
  const r = (a, b) => N.alCompararProdutos(a, b).resultado;
  assert.equal(r("Coca Cola 2L", "Coca-Cola 2 litros"), "igual"); assert.equal(r("Coca-Cola 2 LT", "Coca-Cola 2 L"), "igual");
  assert.equal(r("CocaCola 2L", "Coca Cola 2000ml"), "igual"); assert.equal(r("Café Pilão 500g", "CAFÉ PILÃO 500 G"), "igual");
  assert.equal(N.alChaveProduto("Coca Cola 2L"), N.alChaveProduto("coca-cola 2 litros"));
  assert.equal(r("Coca-Cola 2L", "Coca-Cola Zero 2L"), "diferente"); assert.equal(r("Coca-Cola 2L", "Coca-Cola 350ml"), "diferente");
  assert.equal(r("Leite Integral 1L", "Leite Desnatado 1L"), "diferente"); assert.equal(r("Arroz Camil 5kg", "Arroz Tio João 5kg"), "diferente");
  assert.equal(r("Coca-Cola 2L", "Pepsi 2L"), "diferente"); assert.equal(r("Pizza grande", "Pizza média"), "diferente");
  assert.equal(r("Refrigerante Coca-Cola 2L", "Coca-Cola 2L"), "possivel", "dúvida: pergunta antes"); assert.equal(r("Café Pilão 500g", "Café Pilão Tradicional 500g"), "possivel");
  assert.equal(r("Coca-Cola", "Coca-Cola 2L"), "possivel", "sem tamanho num dos nomes: não junta sozinho");
  assert.deepEqual(N.alTamanho("Óleo 900 ml"), { ml: 900 }); assert.deepEqual(N.alTamanho("Picanha 1,5 kg"), { g: 1500 });
  assert.deepEqual(N.alPrecoBase("Coca-Cola 2L", 12), { v: 6, por: "L" });
  /* pratos não entram no histórico de preços do Mercado; produto ligado entra */
  assert.equal(N.alNoHistorico({ descricao: "Pizza grande" }), false); assert.equal(N.alNoHistorico({ descricao: "Coca", produto_id: "x" }), true);
});
test("duplicidade: mesmo número na mesma plataforma é confirmada; mesmo lugar, dia e valor é só possível; números diferentes não bloqueiam", () => {
  const ex = [{ id: "a", data: "2026-10-30", estabelecimento: "Pizzaria Exemplo", plataforma: "ifood", numero: "0012-34", total_pago: 77.88 }];
  assert.equal(N.alDuplicata({ ...pedido({ id: "b" }), numero: "1234" }, ex).nivel, "confirmada");
  assert.equal(N.alDuplicata({ ...pedido({ id: "b" }), numero: "9999" }, ex), null, "outro número: pedido legítimo com o mesmo valor");
  assert.equal(N.alDuplicata({ ...pedido({ id: "b" }), numero: null }, ex).nivel, "possivel");
  assert.equal(N.alDuplicata({ ...pedido({ id: "b" }), numero: null, total_pago: 50 }, ex), null);
  assert.equal(N.alDuplicata({ ...pedido({ id: "b" }), numero: null, data: "2026-10-31" }, ex), null);
  assert.equal(N.alDuplicata({ ...pedido({ id: "a" }) }, ex).motivo, "é o mesmo lançamento");
  assert.equal(N.alDuplicata({ ...pedido({ id: "a" }), numero: "1234" }, ex, "a"), null, "editando o próprio pedido");
  assert.match(N.alDuplicata({ ...pedido({ id: "b", plataforma: "direto" }), numero: null }, ex).motivo, /outra origem/);
});
test("integridade: pedido gravado íntegro passa; sem itens, itens ≠ subtotal, conta aberta e desconto de item apontam; nada é corrigido", () => {
  /* como vem do banco: itens em pedido_itens, números como texto, unitário derivado (total ÷ qtd) */
  const gravado = (extra = {}) => ({ id: "g1", data: "2026-10-30", estabelecimento: "Pizzaria Exemplo", plataforma: "ifood", modo: "delivery",
    subtotal: "73.90", taxa_entrega: "7.99", taxa_servico: "0.99", gorjeta: "5.00", desconto_loja: "0.00", desconto_plataforma: "10.00", total_pago: "77.88",
    pedido_itens: [{ ordem: 1, descricao: "Coca-Cola 2L", qtd: "1.000", unitario: "14.00", total: "14.00", desconto: "0.00" },
      { ordem: 0, descricao: "Pizza grande", qtd: "1.000", unitario: "59.90", total: "59.90", desconto: "0.00" }], ...extra });
  assert.deepEqual(N.alIntegridade(gravado()), { ok: true, problemas: [] });
  assert.deepEqual(N.alIntegridade({ ...gravado(), pedido_itens: undefined, itens: gravado().pedido_itens }), { ok: true, problemas: [] }, "aceita itens também");
  /* unitário derivado e arredondado (10 ÷ 7 = 1,43; 7 × 1,43 = 10,01) não é falso alarme */
  assert.equal(N.alIntegridade({ subtotal: 10, total_pago: 10, pedido_itens: [{ descricao: "Esfiha", qtd: 7, unitario: 1.43, total: 10 }] }).ok, true);
  assert.equal(N.alIntegridade({ subtotal: 10, total_pago: 10, pedido_itens: [{ descricao: "Pão de queijo", qtd: 9, unitario: 1.11, total: 10 }] }).ok, true);
  assert.deepEqual(N.alIntegridade(gravado({ pedido_itens: [] })), { ok: false, problemas: ["O pedido está gravado sem nenhum item."] });
  assert.match(N.alIntegridade(gravado({ pedido_itens: undefined })).problemas.join(" "), /sem nenhum item/);
  assert.match(N.alIntegridade(gravado({ pedido_itens: [gravado().pedido_itens[1]] })).problemas.join(" "), /Os itens somam R\$ 59,90, mas o subtotal do pedido é R\$ 73,90/);
  assert.match(N.alIntegridade(gravado({ total_pago: "80.00" })).problemas.join(" "), /A conta dá R\$ 77,88.*total pago é R\$ 80,00/);
  assert.match(N.alIntegridade(gravado({ pedido_itens: [{ descricao: "Pizza grande", qtd: 1, total: 59.9, desconto: 60 }] })).problemas.join(" "), /desconto de “Pizza grande” passa do valor do item/);
  assert.match(N.alIntegridade(gravado({ pedido_itens: [{ descricao: "Pizza grande", qtd: 1, total: "abc" }] })).problemas.join(" "), /Confira o total de “Pizza grande”/);
  /* arredondamento: 1 e 2 centavos passam, 3 apontam */
  assert.equal(N.alIntegridade(gravado({ total_pago: "77.89" })).ok, true); assert.equal(N.alIntegridade(gravado({ total_pago: "77.90" })).ok, true);
  assert.equal(N.alIntegridade(gravado({ total_pago: "77.91" })).ok, false);
  /* só aponta: o pedido recebido não muda */
  const g = gravado({ total_pago: "80.00" }), copia = JSON.parse(JSON.stringify(g)); N.alIntegridade(g); assert.deepEqual(g, copia);
  const l = N.alIntegridadeLista([gravado(), gravado({ id: "g2", pedido_itens: [] }), gravado({ id: "g3", total_pago: 1 }), null]);
  assert.equal(l.total, 4); assert.equal(l.comProblema, 3); assert.deepEqual(l.pedidos.map((x) => x.id), ["g2", "g3", null]);
  assert.deepEqual(N.alIntegridadeLista([]), { total: 0, comProblema: 0, pedidos: [] });
});
test("duplicidade com o Mercado: mesma loja, dia e valor numa nota é só 'possível' (nunca bloqueia); qualquer diferença não avisa", () => {
  const p = { id: "p9", data: "2026-10-30", estabelecimento: "Padaria Exemplo", plataforma: "direto", modo: "no_local", total_pago: 42.5 };
  const nota = (extra = {}) => ({ id: "n1", data: "2026-10-30", total: 42.5, mercado: "Padaria Exemplo", ...extra });
  const d = N.alDuplicataMercado(p, [nota()]);
  assert.equal(d.nivel, "possivel"); assert.equal(d.nota.id, "n1"); assert.match(d.motivo, /nota do Mercado/);
  assert.equal(N.alDuplicataMercado(p, [nota({ mercado: "PADARIA EXEMPLO" })]).nivel, "possivel", "caixa diferente");
  assert.equal(N.alDuplicataMercado(p, [nota({ mercado: "Padaria-Exemplo." })]).nivel, "possivel", "pontuação diferente");
  assert.equal(N.alDuplicataMercado({ ...p, estabelecimento: "Pão de Açúcar" }, [nota({ mercado: "Pao de Acucar" })]).nivel, "possivel", "acento diferente");
  assert.equal(N.alDuplicataMercado(p, [nota({ mercado: undefined, mercados: { nome: "Padaria Exemplo" } })]).nivel, "possivel", "formato do select embutido");
  assert.equal(N.alDuplicataMercado(p, [nota({ total: "42.52" })]).nivel, "possivel", "2 centavos passam");
  assert.equal(N.alDuplicataMercado(p, [nota({ total: "42.53" })]), null, "3 centavos não");
  assert.equal(N.alDuplicataMercado(p, [nota({ mercado: "Padaria Outra" })]), null, "valor igual em outro lugar");
  assert.equal(N.alDuplicataMercado(p, [nota({ data: "2026-10-31" })]), null, "outro dia");
  assert.equal(N.alDuplicataMercado(p, [nota({ total: null })]), null, "nota sem total não é comparada");
  assert.equal(N.alDuplicataMercado({ ...p, total_pago: null }, [nota()]), null, "pedido sem total");
  assert.equal(N.alDuplicataMercado({ ...p, estabelecimento: " " }, [nota({ mercado: "" })]), null, "sem nome não compara");
  assert.equal(N.alDuplicataMercado(p, []), null); assert.equal(N.alDuplicataMercado(p, null), null);
  assert.equal(N.alDuplicataMercado(p, [nota({ id: "n0", mercado: "Outra" }), nota()]).nota.id, "n1", "acha a nota certa no meio da lista");
  /* nunca "confirmada": a mesma loja, dia e valor podem ser duas compras legítimas */
  assert.ok(![nota(), nota({ total: "42.51" })].some((n) => N.alDuplicataMercado(p, [n]).nivel !== "possivel"));
});
test("Painel: os pedidos entram como uma fonte a mais, sem mudar Mercado, registros e MBA (nada contado duas vezes)", () => {
  const compras = [{ data: "2026-10-01", valor_total: 30, categoria: "Mercearia" }], regs = [{ quem: "civic", tipo: "abastecimento", data: "2026-10-02", dados: { custo: 100 } }];
  const antes = N.pnDespesas(compras, regs, [], null), depois = N.pnDespesas(compras, regs, [], null, [pedido()]);
  assert.deepEqual(depois.slice(3), antes, "as fontes antigas continuam iguais");
  assert.equal(depois.length, antes.length + 3);
  const pm = N.pnPorMes(depois, ["2026-10"]);
  assert.equal(Math.round(pm["2026-10"].total * 100), 3000 + 10000 + 7788);
  assert.equal(Math.round(pm["2026-10"].por.Delivery * 100), 7788);
  const pn = ler("js/painel.js");
  assert.match(pn, /SB\.from\("pedidos"\)\.select\("id,data,plataforma,modo,estabelecimento,subtotal/);
  assert.match(pn, /NUCLEO\.pnDespesas\([^)]*pnFonteReg,D\.pedidos&&D\.pedidos\.ok\?D\.pedidos\.v:\[\][,)]/);
  assert.match(pn, /function pnAlimentacao\(D,B\)/);
});
test("SQL 024: pedidos e itens na casa, com RLS, trava da 2ª etapa, nada para anon, conta fechada no banco, sem mexer no Mercado", () => {
  const bruto = ler("supabase/024_alimentacao.sql"), s = semComent(bruto);
  assert.match(s, /^\s*begin;/m); assert.match(s, /commit;/);
  for (const t of ["pedidos", "pedido_itens"]) {
    assert.match(s, new RegExp(`create table if not exists public\\.${t} `));
    assert.match(s, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(s, new RegExp(`drop policy if exists "casa" on public\\.${t};\\s*create policy "casa" on public\\.${t} for all to authenticated\\s+using \\(user_id = public\\.dono_da_casa\\(\\)\\)`));
    assert.match(s, new RegExp(`create policy "mfa" on public\\.${t} as restrictive for all to authenticated using \\(\\(select public\\.rac_aal_ok\\(\\)\\)\\)`));
  }
  assert.match(s, /revoke all on public\.pedidos, public\.pedido_itens from anon;/); assert.match(s, /revoke all on public\.alimentacao_gastos from anon;/);
  assert.match(s, /create or replace view public\.alimentacao_gastos\s+with \(security_invoker = true\)/);
  assert.match(s, /constraint pedidos_conta_fecha check \(abs\(total_pago - \(subtotal \+ taxa_entrega \+ taxa_servico \+ gorjeta - desconto_loja - desconto_plataforma\)\) <= 0\.02\)/);
  assert.match(s, /create unique index if not exists pedidos_numero_unico/);
  assert.match(s, /p\.id = pedido_id and p\.user_id = public\.dono_da_casa\(\)/, "o item só entra num pedido da mesma casa");
  assert.ok(!/(alter|drop|delete|update|truncate)\s+(table\s+)?public\.(mercados|produtos|notas|itens|compras|orcamentos)/i.test(s), "o Mercado não muda");
  assert.ok(!/ia_config|acoes_reais|limite_brl|vault|cron\./i.test(s), "nada de IA, orçamento, segredos ou agendamentos");
  /* o 022 (rodado de novo depois) cobre as tabelas novas na trava e na auditoria */
  const s22 = ler("supabase/022_seguranca.sql");
  assert.match(s22, /'newsletter_avisos', 'pedidos', 'pedido_itens'[\],]/); assert.match(s22, /'pedidos', 'pedido_itens', [^\]]*'seguranca_eventos'\];/);
  /* backup: as duas tabelas, com o item apontando para o pedido; as fotos dos pedidos vão junto */
  const d = N.segDef("pedido_itens"); assert.ok(N.segDef("pedidos")); assert.deepEqual(d.fk, { pedido_id: "pedidos", produto_id: "produtos" });
  assert.ok(N.SEG_TABELAS.findIndex((x) => x.t === "pedidos") < N.SEG_TABELAS.findIndex((x) => x.t === "pedido_itens"));
  assert.match(ler("js/sistema.js"), /if\(t==="registros"\|\|t==="pedidos"[^)]*\)regs=regs\.concat\(l\);/);
  assert.match(ler("tests/seguranca.test.mjs"), /"pedidos", "pedido_itens", "alimentacao_gastos"/);
});
test("IA: alimentacao.pedido só em DEMO (no código e no banco); a resposta simulada nunca preenche nada", () => {
  const a = ACOES["alimentacao.pedido"];
  assert.equal(a.real, false); assert.deepEqual(a.papeis, ["dono", "casa"]); assert.equal(a.modelo, ACOES["mercado.nota"].modelo, "o mesmo modelo da nota do Mercado");
  assert.deepEqual(Object.values(ACOES).filter((x) => x.real).map((x) => x.id).sort(), ["abastecimento.interpretar", "fiscal.nota", "hoje.analise", "newsletter.resumo"]);
  assert.ok(!/alimentacao/.test(ler("supabase/028_hoje.sql").replace(/^--.*$/gm, "")), "o 028 também não aceita a Alimentação em REAL");
  assert.match(ler("supabase/020_newsletter_real.sql"), /check \(acoes_reais <@ array\['abastecimento\.interpretar', 'newsletter\.resumo'\]::text\[\]\)/, "o banco nem aceita a Alimentação em REAL");
  const r = respostaDemo("alimentacao.pedido", {}, "", []);
  assert.equal(r.modo, "DEMO"); assert.equal(r.resultado._demo, true);
  const v = a.validar({ ...r.resultado, _demo: undefined }, {}); assert.equal(v.ok, true);
  assert.equal(N.iaModulo("alimentacao"), "Alimentação");
  const js = ler("js/alimentacao.js");
  assert.match(js, /iaBotao\(\{modulo:"alimentacao",acao:"alimentacao\.pedido"/); assert.match(js, /demo:"DEMONSTRAÇÃO: a leitura do pedido com IA ainda não está ligada/);
});
test("tela: rota, menu, a casa (Fernanda) vê e lança, service worker, Salvar só com a conferência completa", () => {
  const app = ler("js/app.js"), html = ler("index.html"), js = ler("js/alimentacao.js");
  assert.match(app, /var DA_CASA=\["mercado","alimentacao",/); assert.match(app, /alimentacao:\["alimentacao"\]/); assert.match(app, /alimentacao:\["resumo"\]/);
  assert.match(app, /if\(top==="alimentacao"\)\{sideMark\("alimentacao","alimentacao"\);renderAlimentacao\(parts\[1\],parts\[2\]\);return\}/);
  assert.match(html, /<section id="alimentacao" hidden><div id="alimentacao-view" class="stack"><\/div><\/section>/);
  assert.match(html, /href="#alimentacao" data-k="alimentacao"/); assert.match(html, /:not\(\[data-k="alimentacao"\]\)/);
  assert.match(ler("sw.js"), /"\.\/js\/alimentacao\.js"/);
  assert.match(js, /salvar\.disabled=!c\.ok\|\|salvando/); assert.match(js, /if\(!navigator\.onLine\)\{falta\.textContent="Sem internet: não salvei/);
  assert.match(js, /enviarArquivos\("alimentacao",id,fotos\.files/); assert.match(js, /SB\.rpc\("pedido_salvar"/, "versões e gravação ficam no banco (027; tests/alimentacao_banco)");
  assert.match(js, /if\(!confirm\("Apagar o pedido de "/, "apagar pede confirmação");
  assert.ok(!/rac-ia|anthropic/i.test(js), "a IA só passa por racIA/iaBotao");
});
