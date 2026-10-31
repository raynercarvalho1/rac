// Painel de Produtividade sem rede: integração com rotas, menu e service worker, e as regras do módulo
// (só lê, a única gravação é o orçamento no botão Salvar, sem IA, sem chamar a função garmin, fonte em todo quadro, só para o dono).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const pn = ler("js/painel.js"), app = ler("js/app.js"), html = ler("index.html"), sw = ler("sw.js");

test("Painel: rota, menu, seção, módulo com as dependências do Resumo e da Agenda, e service worker", () => {
  assert.match(app, /var tabs=\[[^\]]*"painel"/);
  assert.match(app, /painel:\["painel"\]/); assert.match(app, /painel:\["resumo","sistema"\]/, "reaproveita os gráficos do Resumo e a Agenda do Sistema");
  assert.match(app, /if\(top==="painel"\)\{sideMark\("painel","painel"\);renderPainel\(parts\[1\]\);return\}/);
  assert.match(html, /<a class="it" href="#painel" data-k="painel">/); assert.match(html, /<section id="painel" hidden><div id="painel-view" class="stack"><\/div><\/section>/);
  assert.match(sw, /"\.\/js\/painel\.js"/);
  assert.ok(!/DA_CASA=\[[^\]]*painel/.test(app), "dados pessoais: quem é da casa não vê o Painel");
});

test("Painel: só lê; a única gravação é o orçamento, por upsert na tabela que já existia, dentro do clique em Salvar", () => {
  assert.ok(!/\.(insert|delete|update)\(/.test(pn), "nada de insert, delete ou update");
  assert.equal((pn.match(/\.upsert\(/g) || []).length, 1);
  assert.match(pn, /sv\.onclick=function\(\)\{[^]*?SB\.from\("orcamentos"\)\.upsert\(linhas,\{onConflict:"user_id,categoria"\}\)/);
  assert.ok(!/pessoalGravar\(/.test(pn), "não mexe nos dados pessoais");
});

test("Painel: sem IA, sem API paga e sem chamar a função garmin", () => {
  assert.ok(!/racIA\(|anthropic|functions\.invoke|saudeSincronizar\(/i.test(pn));
  assert.ok(!/fetch\(/.test(pn), "só o banco do site (SB), nenhuma API de fora");
});

test("Painel: todo quadro diz a fonte, sem dado aparece aviso (nunca número de exemplo) e os gráficos são os do padrão", () => {
  const paineis = (pn.match(/panel\("/g) || []).length, fontes = (pn.match(/pnFonte\(/g) || []).length;
  assert.ok(fontes >= paineis - 1, `cada quadro com fonte (${fontes} fontes para ${paineis} quadros, menos o do topo)`);
  assert.ok((pn.match(/pnVazio\(/g) || []).length >= 15, "estados vazios");
  assert.ok(!/Math\.random|exemplo|fict[ií]cio|demo/i.test(pn.replace(/\/\*[\s\S]*?\*\//g, "")), "nada de dado de exemplo");
  assert.match(pn, /rsColunas\(/); assert.match(pn, /rsBarras\(/);
  assert.match(ler("js/resumo.js"), /racDica\.ligar\(c,/, "as colunas reaproveitadas já têm a dica padrão e o valor fixo");
});

test("Painel: a lata de fórmula que veio do Mercado não entra duas vezes nas despesas", () => {
  assert.match(pn, /NUCLEO\.pnDespesas\(/);
  assert.match(ler("nucleo.js"), /d\.compra\|\|!r\.data\)return/);
});
