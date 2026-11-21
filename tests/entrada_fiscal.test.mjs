// Lote C (docs/central-areas.md, "Lote C"): a Central Fiscal é a Entrada de tudo (notas, pedidos online, delivery); Pedidos online (antes Compras online) sem gráficos nem recorrências;
// nada de "pendente" na tela da Central Fiscal (decisão do dono, 21/11/2026). Só leitura de código e funções puras: sem rede e sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { registro } from "./_rotas.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Central Fiscal: o chip, a linha, a frase e o aviso de 'pendente' saíram da tela; o estado e a regra continuam intactos no núcleo", () => {
  const js = ler("js/fiscal.js");
  assert.match(js, /if\(x\.chave==="fiscal"&&n\.situacao==="pendente"\)return;/, "o chip da situação 'pendente' não é desenhado");
  assert.match(js, /if\(n\.situacao!=="pendente"\)c\.appendChild\(fxLinha\("Situação fiscal"/, "a linha 'Situação fiscal: Pendente' não é desenhada");
  assert.ok(!/pendente na SEFAZ|ainda não estão lançadas no Mercado|ainda não está lançada no Mercado|pendente fiscal/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "nenhuma das frases antigas está no código da tela (só em comentários)");
  const e = N.nfEstadosNota({ situacao: "pendente", formato_origem: "pdf" }, null); assert.ok(e.some((x) => x.chave === "fiscal" && x.rotulo === "Pendente"), "o dado continua calculado (a tela é que não o mostra)");
  assert.equal(N.NF_SITUACOES.pendente, "Pendente"); assert.deepEqual(N.NF_TRANSICOES.pendente, ["autorizada", "cancelada", "rejeitada"]);
});
test("os avisos de gravação não falam em 'pendente': 'sem validação oficial'; a decisão (modo pendente_fiscal) é a mesma", () => {
  const CONT = { chave: null, situacao: "contingencia", tp_emis: 9 };
  const v = N.nfVeredito ? null : null; void v;
  const txt = ler("nucleo.js"); const a = txt.indexOf("function nfResultadoConfirmar"), b = txt.indexOf("\n", txt.indexOf("estado:r,gravada:true", a));
  assert.ok(!/pendente fiscal|pendente de validação|até a autorização/.test(txt.slice(a, b + 400)), "texto de resultado sem 'pendente'");
  assert.equal(N.nfResultadoDoc({ criado: true, resultado: "pendente_fiscal" }).estado, "pendente_fiscal", "o estado interno não muda"); void CONT;
  assert.match(N.nfResultadoDoc({ criado: true, resultado: "pendente_fiscal" }).texto, /sem validação oficial/);
});
test("a Central Fiscal é a Entrada: notas, pedidos online (lista e importar) e pedido de delivery, num atalho só", () => {
  const js = ler("js/fiscal.js");
  for (const h of ['href:"#fiscal"', 'href:"#compras/lista"', 'href:"#compras/importar"', 'href:"#alimentacao/novo"']) assert.ok(js.includes(h), h);
  assert.match(js, /aria-label":"Entradas"/);
});
test("Pedidos online (antes Compras online): só a entrada; sem resumo, produtos, loja, categoria nem recorrências; sem item no menu; a casa abre", () => {
  const js = ler("js/compras.js"), RT = registro();
  assert.match(js, /var CC_ABAS=\[\["lista","Pedidos"\],\["importar","Importar"\],\["nova","＋ Manual"\]\];/);
  assert.match(js, /location\.replace\("#mercado\/central"\)/, "resumo, produto, loja e categoria abrem a Central de Compras");
  assert.ok(!/Recorrência \(separada|recorrencia_status===|Voltar para a confirmar|Recorrência informada/.test(js), "recorrência fora da tela");
  assert.match(js, /x\.recorrencia=rec;/, "o que já estava gravado é preservado ao editar");
  assert.match(js, /href:"#fiscal",text:"‹ Central Fiscal"/); assert.match(js, /href:"#mercado\/central",text:"Central de Compras ›"/);
  assert.ok(!RT.menu.includes('href="#compras"') && RT.DA_CASA.includes("compras") && RT.rotas.find((r) => r.id === "compras").titulo === "Pedidos online");
  for (const f of ["supabase/025_compras_online.sql", "supabase/035_compras_gravar_foto.sql"]) { if (fs.existsSync(new URL("../" + f, import.meta.url))) assert.ok(true); }
  const m = ler("mercado.js"); assert.match(m, /href: "#compras\/lista", text: "Abrir o pedido online \(conta, documentos e anexos\)"/);
});
