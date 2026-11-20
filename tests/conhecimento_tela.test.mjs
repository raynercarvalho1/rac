// RAC Knowledge · tela (js/conhecimento.js): roda o código de verdade num ambiente falso (sem banco e sem rede) e confere o que o dono vê e faz no celular:
// lista com busca e filtros, detalhe, registro rápido de erro, edição, histórico, importação do repositório (sem sobrescrever o que foi editado aqui) e o que a tela NÃO faz
// (nada para a casa, nenhum segredo gravado, nenhuma chave de servidor, nenhum endereço externo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function el(tag, attrs, ...kids) {
  const e = { tag, attrs: { ...(attrs || {}) }, children: [], appendChild(c) { if (c == null) throw new TypeError("appendChild(null): o navegador recusa"); e.children.push(c); return c; }, setAttribute(k, v) { e.attrs[k] = v; }, focus() {}, select() {} };
  if (tag === "input" || tag === "textarea" || tag === "select") e.value = "";
  Object.defineProperty(e, "innerHTML", { set() { e.children = []; }, get() { return ""; } });
  Object.defineProperty(e, "textContent", { set(v) { e.children = []; e.attrs.text = v; }, get() { return e.attrs.text || ""; } });
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(typeof k === "number" ? String(k) : k); };
  kids.forEach(add); return e;
}
const todos = (e, f, acc = []) => { if (e && typeof e === "object") { if (f(e)) acc.push(e); (e.children || []).forEach((c) => todos(c, f, acc)); } return acc; };
const texto = (e) => (e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(texto)].filter(Boolean).join(" "));
const classe = (e, c) => ((e.attrs && e.attrs.class) || "").split(/\s+/).includes(c);
const porClasse = (r, c) => todos(r, (x) => x.attrs && classe(x, c));
const botao = (r, rot) => todos(r, (x) => x.tag === "button" && texto(x).includes(rot))[0];
const porTag = (r, t) => todos(r, (x) => x.tag === t);
const J = (x) => JSON.parse(JSON.stringify(x));
const pausa = () => new Promise((r) => setTimeout(r, 15));

const U1 = "aaaaaaaa-0000-4000-8000-000000000001", U2 = "aaaaaaaa-0000-4000-8000-000000000002", U3 = "aaaaaaaa-0000-4000-8000-000000000003", U4 = "aaaaaaaa-0000-4000-8000-000000000004";
const reg = (o) => ({ id: U1, tipo: "regra", titulo: "Registro", conteudo: "", motivo: null, causa: null, solucao: null, prevencao: null, categoria: null, tags: [], estado: "ativo", origem: null, relacionados: [], data_ref: "2026-11-20",
  ref_externa: null, origem_hash: null, editado_no_site: false, versao: 1, criado_em: "2026-11-20T10:00:00Z", atualizado_em: "2026-11-20T10:00:00Z", ...o });
const BASE = () => [
  reg({ id: U1, tipo: "regra", titulo: "Nunca usar force push", conteudo: "Sem force push em nenhuma branch.", categoria: "git", tags: ["git", "push"] }),
  reg({ id: U2, tipo: "erro", titulo: "Teste de banco falha sem PGlite", conteudo: "O teste não roda.", causa: "PGlite ausente", solucao: "Usar scripts/nuvem_testes.sh", prevencao: "Rodar pela nuvem", estado: "resolvido", categoria: "testes", tags: ["pglite"], relacionados: [U1], versao: 3 }),
  reg({ id: U3, tipo: "decisao", titulo: "Decisão antiga", conteudo: "Era assim.", motivo: "porque sim", estado: "arquivado", categoria: "git" }),
  reg({ id: U4, tipo: "procedimento", titulo: "Publicar o site", conteudo: "Primeiro SQL, depois função, depois site.", ref_externa: "procedimento/publicar-o-site", origem_hash: "a".repeat(64) }),
];

function tela({ linhas = BASE(), dono = true, indice = null, historico = [], falhaGravar = null } = {}) {
  const log = [], erros = [], root = el("div"), copiados = []; let n = 0;
  const falhou = () => { const p = Promise.resolve({ data: null, error: { message: falhaGravar } }); p.select = () => p; return p; };
  const cadeia = (data) => { const q = { eq: () => q, order: () => q, range: () => q, select: () => q, then: (a, b) => Promise.resolve({ data, error: null }).then(a, b) }; return q; };
  const SB = { from: (t) => t === "conhecimento_historico" ? { select: () => cadeia(historico) } : {
    select: () => cadeia(linhas.map((x) => ({ ...x }))),
    insert: (l) => { if (falhaGravar) return falhou(); const arr = Array.isArray(l) ? l : [l]; log.push(["insert", arr]); const novas = arr.map((x) => reg({ ...x })); linhas.push(...novas); return cadeia(novas); },
    update: (p) => ({ eq: (c, v) => { if (falhaGravar) return falhou(); log.push(["update", v, p]); const r = linhas.find((x) => x.id === v); Object.assign(r, p, { versao: r.versao + 1 }); if (!("origem_hash" in p)) r.editado_no_site = true; return cadeia([{ ...r }]); } }) } };
  const ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, RegExp, Uint8Array, NUCLEO: N, isOwner: () => dono, logErro: (o, e) => erros.push([o, e && e.message]),
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, norm: (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), SB,
    RACdados: { PAGINA: 1000, paginar: (c) => Promise.resolve(c(0)).then((r) => { if (r.error) throw new Error(r.error.message); return r.data; }) },
    h: el, $: () => root, loading: () => el("p", { class: "empty", text: "Carregando…" }), failed: (f, e) => el("div", { class: "empty", text: "Não consegui carregar agora. " + (e && e.message) }),
    panel: (t, s) => el("div", { class: "panel" }, t ? el("h2", { text: t }) : null, s ? el("p", { class: "sub", text: s }) : null),
    location: { hash: "" }, crypto: { randomUUID: () => "bbbbbbbb-0000-4000-8000-" + String(++n).padStart(12, "0") }, navigator: { clipboard: { writeText: (t) => { copiados.push(t); return Promise.resolve(); } } },
    window: { confirm: () => true }, fetch: (url) => { log.push(["fetch", url]); return indice ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(indice) }) : Promise.resolve({ ok: false, status: 404 }); } };
  ctx.window.crypto = ctx.crypto; vm.createContext(ctx); vm.runInContext(ler("js/conhecimento.js"), ctx, { filename: "js/conhecimento.js" });
  return Object.assign(ctx, { log, erros, root, copiados, linhas });
}
const itens = (c) => porClasse(c.root, "kn-item").map(texto);

test("Lista: mostra só os registros vigentes (arquivado fica fora), com tipo, título e resumo; busca e filtros funcionam sem acento nem maiúscula", async () => {
  const c = tela(); c.renderConhecimento(); await pausa();
  assert.equal(itens(c).length, 3); assert.ok(!itens(c).some((t) => /Decisão antiga/.test(t)), "o arquivado não aparece na visão padrão");
  assert.match(itens(c).join("|"), /Regra.*Nunca usar force push/); assert.match(itens(c).join("|"), /Erro/); assert.match(itens(c).join("|"), /Sem force push em nenhuma branch/, "o resumo vem do conteúdo");
  const busca = porTag(c.root, "input").find((i) => i.attrs.type === "search"); assert.ok(busca, "a busca está visível no topo"); assert.equal(busca.attrs["aria-label"], "Buscar no RAC Knowledge");
  busca.value = "BANCO pglite"; busca.oninput(); assert.deepEqual(itens(c).length, 1); assert.match(itens(c)[0], /Teste de banco falha/);
  busca.value = "inexistente"; busca.oninput(); assert.match(texto(c.root), /Nada encontrado com estes filtros/);
  busca.value = ""; busca.oninput();
  const pills = porClasse(c.root, "kn-pill"); assert.equal(pills.length, 7, "Todos + 6 tipos"); assert.match(texto(pills[0]), /Todos \(3\)/);
  botao(c.root, "Erros e soluções").onclick(); assert.equal(itens(c).length, 1);
  const sel = porTag(c.root, "select").find((s) => s.attrs["aria-label"] === "Estado"); sel.value = ""; sel.onchange(); botao(c.root, "Todos").onclick(); assert.equal(itens(c).length, 4, "com o estado em 'todos' o arquivado aparece");
  assert.equal(c.erros.length, 0);
});

test("Lista vazia explica como começar; sem a tabela (062 pendente) a tela diz o que falta; a casa não vê nada", async () => {
  const v = tela({ linhas: [] }); v.renderConhecimento(); await pausa(); assert.match(texto(v.root), /Ainda não há registros/); assert.match(texto(v.root), /Repositório/);
  const casa = tela({ dono: false }); casa.renderConhecimento(); await pausa(); assert.match(texto(casa.root), /só da conta do dono/); assert.equal(porClasse(casa.root, "kn-item").length, 0); assert.equal(casa.log.length, 0, "nenhuma leitura");
  const sem = tela(); sem.SB.from = () => ({ select: () => ({ order: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: "relation public.conhecimento does not exist" } }) }) }) }) });
  sem.renderConhecimento(); await pausa(); assert.match(texto(sem.root), /falta aplicar a migration supabase\/062_conhecimento\.sql/);
});

test("Detalhe: título, tipo, estado, causa, solução, prevenção, relacionados e quem cita; botões de editar, histórico, copiar e arquivar com altura de toque", async () => {
  const c = tela(); c.renderConhecimento(U2); await pausa(); const t = texto(c.root);
  assert.match(t, /Teste de banco falha sem PGlite/); assert.match(t, /Resolvido/); assert.match(t, /Causa/); assert.match(t, /PGlite ausente/); assert.match(t, /Solução/); assert.match(t, /Prevenção/);
  assert.match(t, /Relacionados[\s\S]*Nunca usar force push/); assert.match(t, /Só existe aqui, ainda não está no repositório/); assert.match(t, /versão 3/);
  assert.match(t, /Histórico \(2\)/); assert.ok(botao(c.root, "Editar") || porTag(c.root, "a").some((a) => texto(a) === "Editar")); assert.ok(botao(c.root, "Arquivar") && botao(c.root, "Copiar para o agente"));
  const c1 = tela(); c1.renderConhecimento(U1); await pausa(); assert.match(texto(c1.root), /Citado por[\s\S]*Teste de banco falha/);
  const css = ler("index.html"); assert.match(css, /#conhecimento-view \.ghostbtn,#conhecimento-view button\{min-height:44px/); assert.match(css, /#conhecimento-view a\.kn-item\{[^}]*min-height:44px/); assert.match(css, /#conhecimento-view input,#conhecimento-view select,#conhecimento-view textarea\{font-size:16px;min-height:44px/);
  const nada = tela(); nada.renderConhecimento("00000000-0000-4000-8000-0000000000ff"); await pausa(); assert.match(texto(nada.root), /Não achei este registro/);
});

test("Detalhe: copiar para o agente entrega o arquivo .md do registro; arquivar só muda o estado (nunca apaga)", async () => {
  const c = tela(); c.renderConhecimento(U2); await pausa(); botao(c.root, "Copiar para o agente").onclick(); await pausa();
  assert.equal(c.copiados.length, 1); assert.match(c.copiados[0], /^---\ntitulo: Teste de banco falha sem PGlite\ntipo: erro/); assert.match(c.copiados[0], /## Causa\n\nPGlite ausente/); assert.ok(!/relacionados:/.test(c.copiados[0]), "relação com registro sem arquivo não vai para o .md");
  assert.match(texto(c.root), /Copiado/);
  botao(c.root, "Arquivar").onclick(); await pausa(); const up = c.log.find((x) => x[0] === "update"); assert.deepEqual(J(up.slice(1)), [U2, { estado: "arquivado" }], "só o estado");
  assert.ok(!c.log.some((x) => x[0] === "delete"));
});

test("Erro rápido: título, o que aconteceu, causa e solução bastam; com solução já nasce 'resolvido'; sem, fica 'ativo'; tipo sempre erro", async () => {
  const c = tela(); c.renderConhecimento("erro-rapido"); await pausa(); const campos = [...porTag(c.root, "input"), ...porTag(c.root, "textarea")];
  assert.equal(campos.length, 6, "título, o que aconteceu, causa, solução, prevenção e tags: curto para o celular"); const esperado = ["Título", "O que aconteceu", "Causa-raiz", "Solução aplicada", "Como evitar de novo", "Tags"];
  assert.deepEqual(porClasse(c.root, "kn-rot").map(texto), esperado);
  const [tit, tags, o, causa, sol, prev] = campos; tit.value = "Push recusado"; o.value = "git push falhou"; causa.value = "branch protegida"; sol.value = "usar claude/*"; prev.value = ""; tags.value = "Git, git, Push";
  porTag(c.root, "form")[0].onsubmit({ preventDefault() {} }); await pausa();
  const ins = c.log.find((x) => x[0] === "insert")[1][0]; assert.equal(ins.tipo, "erro"); assert.equal(ins.estado, "resolvido"); assert.deepEqual(J(ins.tags), ["git", "push"]); assert.equal(ins.causa, "branch protegida"); assert.equal(ins.categoria, null);
  assert.match(ins.id, /^bbbbbbbb-/, "o id é gerado no aparelho"); assert.match(c.location.hash, /^#conhecimento\/bbbbbbbb-/, "abre o registro criado");
  const c2 = tela(); c2.renderConhecimento("erro-rapido"); await pausa(); const f2 = [...porTag(c2.root, "input"), ...porTag(c2.root, "textarea")]; f2[0].value = "Erro sem solução ainda"; porTag(c2.root, "form")[0].onsubmit({ preventDefault() {} }); await pausa();
  assert.equal(c2.log.find((x) => x[0] === "insert")[1][0].estado, "ativo");
});

test("Novo registro: validação clara (título curto, segredo) antes de gravar; decisão pede o motivo; campos por tipo; nada é gravado quando inválido", async () => {
  const c = tela(); c.renderConhecimento("novo"); await pausa(); const form = porTag(c.root, "form")[0], msg = porClasse(c.root, "qrwarn")[0];
  form.onsubmit({ preventDefault() {} }); assert.match(texto(msg), /título precisa ter de 3 a 200 letras/); assert.equal(c.log.length, 0);
  const campos = porTag(c.root, "input"); campos.find((i) => i.attrs.placeholder === "Frase curta e pesquisável").value = "Com segredo";
  porTag(c.root, "textarea")[0].value = "token sk-ant-api03-" + "A".repeat(30); form.onsubmit({ preventDefault() {} }); assert.match(texto(msg), /chave, token, chave privada ou CPF/); assert.equal(c.log.filter((x) => x[0] === "insert").length, 0);
  const tipo = porTag(c.root, "select").find((s) => s.attrs["aria-label"] === "Tipo"); tipo.value = "decisao"; tipo.onchange(); assert.match(porClasse(c.root, "kn-rot").map(texto).join("|"), /Por quê \(motivo\)/); assert.ok(!/Causa-raiz/.test(porClasse(c.root, "kn-rot").map(texto).join("|")));
  tipo.value = "erro"; tipo.onchange(); assert.match(porClasse(c.root, "kn-rot").map(texto).join("|"), /Causa-raiz[\s\S]*Solução aplicada[\s\S]*Como evitar de novo/);
  const f = tela({ falhaGravar: "conhecimento_sem_segredos: o texto parece" }); f.renderConhecimento("novo"); await pausa(); porTag(f.root, "input").find((i) => i.attrs.placeholder === "Frase curta e pesquisável").value = "Titulo valido"; porTag(f.root, "form")[0].onsubmit({ preventDefault() {} }); await pausa();
  assert.match(texto(porClasse(f.root, "qrwarn")[0]), /Não gravei: o texto parece conter chave, token ou CPF/, "o erro do banco é explicado em português");
});

test("Editar: carrega os valores, grava só pelo update do registro (o gatilho guarda a versão anterior); relacionar por busca", async () => {
  const c = tela(); c.renderConhecimento(U1, "editar"); await pausa(); const form = porTag(c.root, "form")[0];
  const titulo = porTag(c.root, "input").find((i) => i.value === "Nunca usar force push"); assert.ok(titulo, "o título atual aparece no campo"); titulo.value = "Nunca usar force push em main";
  const rel = porTag(c.root, "input").find((i) => i.attrs.type === "search"); rel.value = "pglite"; rel.oninput(); const op = botao(c.root, "Teste de banco falha"); assert.ok(op, "a busca oferece o registro"); op.onclick();
  form.onsubmit({ preventDefault() {} }); await pausa(); const up = c.log.find((x) => x[0] === "update");
  assert.equal(up[1], U1); assert.equal(up[2].titulo, "Nunca usar force push em main"); assert.deepEqual(J(up[2].relacionados), [U2]); assert.ok(!("versao" in up[2]) && !("dono" in up[2]) && !("origem_hash" in up[2]), "versão, dono e hash não são do cliente");
  assert.equal(c.location.hash, "#conhecimento/" + U1);
});

test("Histórico: lista as versões anteriores com o que mudou e restaura criando versão nova (confirmando antes)", async () => {
  const historico = [{ id: "h2", versao: 2, operacao: "atualizacao", criado_em: "2026-11-20T12:00:00Z", snapshot: { titulo: "Nunca usar force push", conteudo: "Sem force push.", tags: ["git"], estado: "ativo", atualizado_em: "2026-11-20T11:00:00Z" } },
    { id: "h1", versao: 1, operacao: "atualizacao", criado_em: "2026-11-20T11:00:00Z", snapshot: { titulo: "Force push", conteudo: "x", tags: [], estado: "ativo", atualizado_em: "2026-11-20T10:00:00Z" } }];
  const c = tela({ historico }); c.renderConhecimento(U1, "historico"); await pausa(); const t = texto(c.root);
  assert.match(t, /Versão 1 \(atual\)/); assert.match(t, /Versão 2/); assert.match(t, /Versão 1/); assert.match(t, /depois mudou: Conteúdo/, "diz o que mudou");
  botao(c.root, "Restaurar esta versão").onclick(); await pausa(); const up = c.log.find((x) => x[0] === "update"); assert.equal(up[2].titulo, "Nunca usar force push"); assert.equal(up[2].conteudo, "Sem force push.");
  const sem = tela({ historico: [] }); sem.renderConhecimento(U4, "historico"); await pausa(); assert.match(texto(sem.root), /nunca foi alterado/);
  const nao = tela({ historico }); nao.window.confirm = () => false; nao.renderConhecimento(U1, "historico"); await pausa(); botao(nao.root, "Restaurar esta versão").onclick(); await pausa(); assert.equal(nao.log.filter((x) => x[0] === "update").length, 0, "sem confirmar, nada é gravado");
});

const item = (o) => ({ ref: "regra/nova", tipo: "regra", titulo: "Regra nova", conteudo: "texto", motivo: "", causa: "", solucao: "", prevencao: "", categoria: "x", tags: ["a"], estado: "ativo", origem: "", data_ref: "2026-11-20", relacionados: [], hash: "c".repeat(64), ...o });

test("Sincronizar: lê o índice do repositório sem cache, mostra o plano e só importa com o toque; novo, atualização e vínculo; relações viram ids; nada sobrescreve o que foi editado aqui", async () => {
  const linhas = BASE(); linhas[3].editado_no_site = false;
  const indice = { versao: 1, registros: [
    item({}), item({ ref: "procedimento/publicar-o-site", tipo: "procedimento", titulo: "Publicar o site", hash: "d".repeat(64), conteudo: "mudou no arquivo" }),
    item({ ref: "erro/novo-erro", tipo: "erro", titulo: "Novo erro", relacionados: ["regra/nova"], hash: "e".repeat(64) }),
    item({ ref: "regra/nunca-usar-force-push", tipo: "regra", titulo: "Nunca usar force push", hash: "f".repeat(64) })] };
  const c = tela({ linhas, indice }); c.renderConhecimento("sincronizar"); await pausa();
  assert.match(c.log.find((x) => x[0] === "fetch")[1], /^docs\/conhecimento\/indice\.json\?atualizar=1$/, "caminho do próprio site, pedindo a versão nova");
  const t = texto(c.root); assert.match(t, /No repositório: 4 registros/); assert.match(t, /novos: 2/); assert.match(t, /atualizações: 1/); assert.match(t, /a vincular: 1/); assert.match(t, /em conflito: 0/); assert.equal(c.log.filter((x) => x[0] === "insert").length, 0, "nada gravado antes do toque");
  botao(c.root, "Importar 4 registros").onclick(); await pausa(); await pausa();
  const ins = c.log.find((x) => x[0] === "insert")[1]; assert.equal(ins.length, 2); assert.ok(ins.every((l) => /^bbbbbbbb-/.test(l.id) && l.editado_no_site === false && /^[0-9a-f]{64}$/.test(l.origem_hash) && l.ref_externa));
  const nova = ins.find((l) => l.ref_externa === "regra/nova"), erro = ins.find((l) => l.ref_externa === "erro/novo-erro"); assert.deepEqual(J(erro.relacionados), [nova.id], "a relação por ref virou o id gerado");
  const ups = c.log.filter((x) => x[0] === "update"); assert.equal(ups.length, 2); assert.ok(ups.every((u) => u[2].editado_no_site === false && /^[0-9a-f]{64}$/.test(u[2].origem_hash)));
  assert.equal(c.linhas.find((x) => x.id === U1).ref_externa, "regra/nunca-usar-force-push", "o registro sem arquivo foi vinculado pelo tipo e título");
  assert.match(texto(c.root), /Nada a importar/, "depois de importar o site está igual ao repositório");
});

test("Sincronizar: conflito (editado aqui e mudou no arquivo) nunca é sobrescrito sozinho; 'só no site' vira um pacote para o agente com o caminho de cada arquivo", async () => {
  const linhas = BASE(); Object.assign(linhas[3], { editado_no_site: true, conteudo: "editei no celular" });
  const indice = { versao: 1, registros: [item({ ref: "procedimento/publicar-o-site", tipo: "procedimento", titulo: "Publicar o site", hash: "d".repeat(64), conteudo: "mudou no arquivo" })] };
  const c = tela({ linhas, indice }); c.renderConhecimento("sincronizar"); await pausa(); const t = texto(c.root);
  assert.match(t, /em conflito: 1/); assert.match(t, /Nada é sobrescrito/); assert.match(t, /Nada a importar/); assert.equal(c.log.filter((x) => x[0] === "update" || x[0] === "insert").length, 0);
  assert.match(t, /Só no site ou alterados aqui \(3\)/); botao(c.root, "Copiar 3 para o agente").onclick(); await pausa();
  const pacote = c.copiados[0]; assert.match(pacote, /^Agente: salve cada bloco/); assert.match(pacote, /### docs\/conhecimento\/registros\/regra\/nunca-usar-force-push\.md\n```markdown\n---\ntitulo: Nunca usar force push/);
  assert.match(pacote, /node scripts\/conhecimento\.mjs indice/); assert.ok(!/sk-ant|sb_secret|service_role/.test(pacote));
  botao(c.root, "Usar o arquivo do repositório").onclick(); await pausa(); const up = c.log.find((x) => x[0] === "update"); assert.equal(up[2].conteudo, "mudou no arquivo"); assert.equal(up[2].editado_no_site, false, "só depois do toque explícito");
});

test("Sincronizar: índice ausente, inválido ou com registro adulterado não derruba a tela nem grava nada", async () => {
  const c = tela({ indice: null }); c.renderConhecimento("sincronizar"); await pausa(); assert.match(texto(c.root), /Não consegui carregar agora/); assert.match(texto(c.root), /404/);
  const ruim = tela({ indice: { versao: 1, registros: [item({ titulo: "ab" }), item({ ref: "regra/segredo", titulo: "Com segredo", conteudo: "sk-ant-api03-" + "A".repeat(30) }), item({ ref: "regra/semhash", titulo: "Sem hash", hash: "x" }), item({ ref: "regra/boa", titulo: "Registro bom" })] } });
  ruim.renderConhecimento("sincronizar"); await pausa(); assert.match(texto(ruim.root), /No repositório: 1 registros/, "só o registro válido entra no plano"); assert.equal(ruim.log.filter((x) => x[0] === "insert").length, 0);
  const lixo = tela({ indice: { versao: 1 } }); lixo.renderConhecimento("sincronizar"); await pausa(); assert.match(texto(lixo.root), /índice do repositório inválido/);
});

test("Resumo para o agente: regras, estado, decisões e erros vigentes, copiado com um toque", async () => {
  const c = tela(); c.renderConhecimento(); await pausa(); botao(c.root, "Copiar resumo para o agente").onclick(); await pausa();
  assert.match(c.copiados[0], /^# RAC Knowledge · resumo/); assert.match(c.copiados[0], /## Regras permanentes\n- Nunca usar force push/); assert.ok(!/Decisão antiga/.test(c.copiados[0]), "arquivado não entra");
  assert.match(texto(c.root), /Copiado/);
});

test("Segurança do código da tela: sem chave de servidor, sem endereço externo, sem HTML montado com dados, sem acesso a outra tabela e sem caminho para a casa", () => {
  const js = ler("js/conhecimento.js");
  assert.ok(!/service_role|sb_secret|sk-ant|api\.anthropic|https?:\/\//i.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "nada de segredo nem endereço externo");
  assert.ok(!/\.innerHTML\s*=\s*[^"'\s]/.test(js) && !/innerHTML\s*\+=/.test(js), "innerHTML só é usado para limpar");
  assert.ok(!/insertAdjacentHTML|document\.write|eval\(|new Function/.test(js));
  for (const m of js.matchAll(/SB\.from\("([a-z_]+)"\)/g)) assert.ok(["conhecimento", "conhecimento_historico"].includes(m[1]), "só as duas tabelas do módulo: " + m[1]);
  assert.ok(!/racIA\(|RACdados\.cliente|storage/.test(js), "sem IA paga e sem cofre de arquivos");
  assert.match(js, /if\(!isOwner\(\)\)/); assert.ok(!/\.delete\(\)/.test(js), "a tela nunca apaga");
  const rotas = ler("js/rotas.js"), linha = rotas.split("\n").find((l) => l.includes('id:"conhecimento"')); assert.ok(linha && !/casa:true/.test(linha), "rota só do dono");
});
