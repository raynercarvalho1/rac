// Lote 4 do novo RAC · a CAPTURA UNIVERSAL, a CAIXA DE ENTRADA e a BIBLIOTECA num navegador de verdade (Chromium, pelo Playwright), com um banco e um cofre SIMULADOS (a mesma regra de ids e de "upsert ignora repetido" do banco real).
// Cobre: o campo do botão + em qualquer tela (2 toques para texto, foto e arquivo), os atalhos de antes intactos, a fila offline (a MESMA de sempre) com foto guardada no aparelho, subida e idempotência, erro retido com
// "Tentar novamente", a Caixa (sugestão, conferência, confirmar, desfazer, descartar, arquivar, voltar), o que NÃO acontece sem confirmar, o compartilhamento (Share Target) como item pendente, a Fernanda sem mudança,
// a Biblioteca (guardar, filtrar, abrir arquivo por URL temporária, referenciar documento sem cópia, excluir só a referência) e a validação visual (3 larguras × 2 temas: sem rolagem lateral, alvos de 44 px).
// Roda no GitHub (testes.yml instala o Playwright); sem Playwright, é pulado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pw, pular, abrir, raiz } from "./_timeline_comum.mjs";

test("no GitHub, o navegador do teste está instalado", { skip: !process.env.CI }, () => assert.ok(pw, "Playwright não foi instalado no testes.yml"));
const ESP = "aaaaaaaa-0000-4000-8000-0000000000e1", USR = "bbbbbbbb-0000-4000-8000-0000000000d1";   // ids reais são UUID (o caminho do cofre exige)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/* o banco simulado: tabelas em memória, as mesmas operações do cliente do Supabase que o site usa, o cofre e o interruptor de rede/erro */
function instalarBanco(cfg) {
  const db = window.__bd = { t: { captura_itens: [], biblioteca_itens: [], lista: [], registros: [], notas_fiscais_docs: [] }, st: [], escritas: [], recusar: null, rede: true, assinadas: [] };
  Object.assign(db.t, cfg.t || {});
  const clone = (x) => JSON.parse(JSON.stringify(x)), res = (data, error, extra) => Promise.resolve(Object.assign({ data: data === undefined ? null : data, error: error || null }, extra || {}));
  const falhaRede = () => { const e = new Error("Failed to fetch"); return Promise.reject(e); };
  function B(t) {
    const q = { op: "select", f: [], ord: null, lim: null, payload: null, opt: null, head: false, count: false };
    const api = {
      select: (c, o) => { if (o && o.count) q.count = true; if (o && o.head) q.head = true; return api; }, eq: (c, v) => { q.f.push((r) => r[c] === v); return api; }, in: (c, v) => { q.f.push((r) => v.includes(r[c])); return api; },
      is: (c, v) => { q.f.push((r) => (v === null ? r[c] == null : r[c] === v)); return api; }, not: () => api, or: () => api,
      order: (c, o) => { q.ord = [c, o && o.ascending === false ? -1 : 1]; return api; }, limit: (n) => { q.lim = n; return api; },
      insert: (p) => { q.op = "insert"; q.payload = p; return api; }, upsert: (p, o) => { q.op = "upsert"; q.payload = p; q.opt = o; return api; }, update: (p) => { q.op = "update"; q.payload = p; return api; }, delete: () => { q.op = "delete"; return api; },
      then: (ok, no) => {
        if (!db.rede) return falhaRede().then(ok, no);
        const tab = db.t[t] || (db.t[t] = []); db.st.push(t + "." + q.op);
        if (q.op !== "select") { if (db.recusar && db.recusar.t === t && db.recusar.op === q.op && (!db.recusar.quando || db.recusar.quando(q.payload))) return res(null, { message: db.recusar.msg }).then(ok, no); db.escritas.push(t + "." + q.op); }
        const casa = (r) => q.f.every((f) => f(r));
        if (q.op === "select") { let l = tab.filter(casa).map(clone); if (q.ord) l.sort((a, b) => (a[q.ord[0]] > b[q.ord[0]] ? 1 : a[q.ord[0]] < b[q.ord[0]] ? -1 : 0) * q.ord[1]); const n = l.length; if (q.lim) l = l.slice(0, q.lim); return res(q.head ? null : l, null, q.count ? { count: n } : {}).then(ok, no); }
        if (q.op === "insert" || q.op === "upsert") { const l = Array.isArray(q.payload) ? q.payload : [q.payload]; for (const r of l) { const i = tab.findIndex((x) => x.id === r.id); if (i >= 0) { if (q.op === "insert") return res(null, { message: 'duplicate key value violates unique constraint "' + t + '_pkey"' }).then(ok, no); continue; }
          if (t === "captura_itens") Object.assign(r, { criado_em: r.criado_em || new Date().toISOString() }); if (t === "biblioteca_itens") Object.assign(r, { criado_em: new Date().toISOString(), arquivada_em: null, projeto_id: null }); tab.push(clone(r)); } return res(null).then(ok, no); }
        if (q.op === "update") { tab.filter(casa).forEach((r) => Object.assign(r, clone(q.payload))); return res(null).then(ok, no); }
        if (q.op === "delete") { const a = tab.filter(casa); a.forEach((r) => tab.splice(tab.indexOf(r), 1)); return res(null).then(ok, no); }
      } };
    return api;
  }
  const obj = {};
  window.SB = { from: B, rpc: (n) => (db.rede ? res(n === "rac_iniciar_espacos" ? clone(cfg.espacos) : true) : falhaRede()),
    storage: { from: (b) => ({
      upload: (path, blob, o) => { if (!db.rede) return falhaRede(); if (db.recusar && db.recusar.t === "storage") return res(null, { message: db.recusar.msg }); obj[b + "/" + path] = { tipo: o && o.contentType, tamanho: blob.size }; db.st.push("storage.upload:" + path); return res({ path }); },
      createSignedUrl: (path, s) => { db.assinadas.push({ b, path, s }); return res({ signedUrl: "https://arquivo.exemplo/" + encodeURIComponent(path) + "?token=t" }); },
      remove: (ps) => { ps.forEach((p) => { delete obj[b + "/" + p]; }); return res([]); }, createSignedUrls: () => res([]) }) }, functions: { invoke: () => res(null) } };
  db.objetos = obj;
  window.EU = { id: cfg.usuario, email: "dono@teste" };
}
const ESPACOS = [{ id: ESP, tipo: "pessoal", nome: "Pessoal", papel: "proprietario", casa: false, arquivado: false }, { id: "bbbbbbbb-0000-4000-8000-0000000000e2", tipo: "compartilhado", nome: "Casa", papel: "editor", casa: true, arquivado: false }];
async function ambiente(cfg = {}, opc = {}) {
  const a = await abrir({}, { hash: "#componentes", ...opc });
  await a.pag.evaluate(instalarBanco, { espacos: ESPACOS, usuario: USR, ...cfg });
  await a.pag.evaluate(() => { window.PESSOAL.lembretes = []; window.PESSOAL.salvos = window.PESSOAL.salvos || []; localStorage.removeItem("rac-fila"); });
  await a.pag.evaluate(() => { if (!document.querySelector(".capbtn")) iniciar(); capAtualizar(); });
  return a;
}
const bd = (pag) => pag.evaluate(() => JSON.parse(JSON.stringify({ t: window.__bd.t, st: window.__bd.st, escritas: window.__bd.escritas, objetos: window.__bd.objetos, assinadas: window.__bd.assinadas })));
const fila = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem("rac-fila") || "[]"));
const abrirFolha = async (pag) => { await pag.click(".capbtn"); await pag.waitForSelector("#capfundo .cap-txt", { timeout: 10000 }); };
const idb = (pag) => pag.evaluate(() => capIdbOp("readonly", (s) => s.getAllKeys()));
const esperar = (pag, fn, arg) => pag.waitForFunction(fn, arg, { timeout: 15000 });

test("o + do dono existe em QUALQUER tela e abre a Captura universal acima dos atalhos de sempre (que continuam todos lá)", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await ambiente();
  try {
    for (const hash of ["#saude", "#esportes", "#componentes", "#lista"]) { await pag.evaluate((h) => { location.hash = h; }, hash); await pag.waitForTimeout(150); assert.equal(await pag.locator(".capbtn.capoculto").count(), 0, "botão visível em " + hash); }
    await pag.evaluate(() => { location.hash = "#saude"; }); await pag.waitForTimeout(150);   /* tela sem atalhos próprios: a folha traz a lista completa de sempre */
    await abrirFolha(pag);
    assert.match(await pag.textContent("#capfundo .caph b"), /Capturar/); assert.ok(await pag.locator("#capfundo .cap-txt").isVisible());
    const ops = await pag.$$eval("#capfundo .capgrid .capop", (l) => l.map((b) => b.textContent.trim())); for (const r of ["Item na lista de compras", "Tarefa da casa", "Lembrete com data", "Ideia ou projeto", "Guardar um link", "Peso (Eddie ou Olivia)", "Gasto (família ou veículo)", "Quilometragem do veículo"]) assert.ok(ops.some((o) => o.includes(r)), "atalho preservado: " + r);
    /* atalho de antes: item na lista grava direto no módulo (a Captura universal NÃO o intercepta) */
    await pag.click('#capfundo .capop:has-text("Item na lista")'); await pag.fill("#capfundo input", "2 leite"); await pag.click('#capfundo button:text-is("Salvar")');
    await esperar(pag, () => window.__bd.t.lista.length === 1); const b = await bd(pag); assert.equal(b.t.lista[0].item, "2 leite"); assert.equal(b.t.lista[0].tipo, "compra"); assert.deepEqual(b.t.captura_itens, [], "o atalho não cria item pendente");
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("texto em 2 toques: + e Guardar criam um item PENDENTE (id do aparelho, espaço pessoal, sugestão guardada), mostram a sugestão, o número no botão e NÃO encaminham nada", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await ambiente();
  try {
    await abrirFolha(pag); await pag.fill("#capfundo .cap-txt", "comprar leite, pão e café"); await pag.click('#capfundo .cap-comp button:text-is("Guardar")');
    await pag.waitForSelector("#capfundo .rac-estado--ok"); assert.match(await pag.textContent("#capfundo .cap-st"), /Guardado na caixa\. Sugestão: Adicionar à lista de compras \(3 itens\)/);
    assert.equal(await pag.inputValue("#capfundo .cap-txt"), "", "o campo limpa para a próxima captura");
    const b = await bd(pag), it = b.t.captura_itens[0]; assert.equal(b.t.captura_itens.length, 1); assert.match(it.id, /^[0-9a-f-]{36}$/); assert.equal(it.espaco_id, ESP); assert.equal(it.criado_por, USR); assert.equal(it.estado, "pendente"); assert.equal(it.origem, "app"); assert.equal(it.sugestao.destino, "lista");
    assert.deepEqual(b.t.lista, [], "só sugeriu: nada foi para a Lista"); assert.deepEqual(b.t.biblioteca_itens, []); assert.deepEqual(await pag.evaluate(() => PESSOAL.lembretes), []);
    assert.equal(await pag.textContent(".capbtn .capcnt"), "1");
    /* vazio e erro: sem texto nem anexo não grava; texto grande demais é recusado antes de gravar */
    await pag.click('#capfundo .cap-comp button:text-is("Guardar")'); assert.equal((await bd(pag)).t.captura_itens.length, 1);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("foto e arquivo em 2 toques: + e Foto/Arquivo (a seleção já guarda); sobem para o cofre privado em <espaço>/<autor>/<pasta>/<arquivo>; formato ruim e arquivo grande demais são recusados", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await ambiente();
  try {
    await abrirFolha(pag);
    assert.equal(await pag.getAttribute('#capfundo input[capture]', "capture"), "environment", "a câmera traseira do celular");
    await pag.setInputFiles('#capfundo input[capture]', { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: PNG });
    await esperar(pag, () => window.__bd.t.captura_itens.length === 1); let b = await bd(pag), it = b.t.captura_itens[0];
    assert.equal(it.tipo, "foto"); assert.equal(it.anexos.length, 1); assert.match(it.anexos[0].path, new RegExp(`^${ESP}/${USR}/${it.id}/img_0001\\.jpg$`)); assert.ok(b.objetos["captura/" + it.anexos[0].path], "subiu para o cofre captura");
    assert.deepEqual(await idb(pag), [], "depois de subir, nada fica guardado no aparelho");
    await pag.setInputFiles('#capfundo input[type=file]:not([capture])', { name: "contrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
    await esperar(pag, () => window.__bd.t.captura_itens.length === 2); b = await bd(pag); assert.equal(b.t.captura_itens[1].tipo, "arquivo");
    await pag.waitForSelector("#capfundo .rac-estado--ok");
    /* formato não aceito */
    await pag.setInputFiles('#capfundo input[type=file]:not([capture])', { name: "pagina.html", mimeType: "text/html", buffer: Buffer.from("<b>x</b>") });
    await pag.waitForSelector("#capfundo .rac-estado--erro"); assert.match(await pag.textContent("#capfundo .cap-st"), /formato de arquivo não é aceito/); assert.equal((await bd(pag)).t.captura_itens.length, 2);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("SEM INTERNET: texto e foto entram na MESMA fila (com a foto guardada no aparelho); aparecem como 'aguardando'; ao voltar a conexão sobem UMA vez cada (idempotente), mesmo com a fila rodando duas vezes", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await ambiente();
  try {
    await pag.evaluate(() => precisa(["captura"]).then(() => capAquecer())); await pag.waitForTimeout(300);   /* o espaço fica guardado no aparelho */
    await pag.context().setOffline(true); await pag.evaluate(() => { window.__bd.rede = false; });
    await abrirFolha(pag); await pag.fill("#capfundo .cap-txt", "ideia: app de receitas"); await pag.click('#capfundo .cap-comp button:text-is("Guardar")');
    await pag.waitForSelector("#capfundo .rac-estado--ok"); assert.match(await pag.textContent("#capfundo .cap-st"), /Sem internet: guardado neste aparelho/);
    await pag.setInputFiles('#capfundo input[capture]', { name: "nota.jpg", mimeType: "image/jpeg", buffer: PNG }); await esperar(pag, () => JSON.parse(localStorage.getItem("rac-fila") || "[]").length === 2);
    const f = await fila(pag); assert.equal(f.length, 2); assert.ok(f.every((o) => o.t === "captura_itens" && o.acao === "upsert" && o.reter === true)); assert.equal(f[1].arquivos.length, 1);
    assert.equal((await idb(pag)).length, 1, "a foto espera no aparelho (IndexedDB)"); assert.equal((await bd(pag)).t.captura_itens.length, 0);
    assert.equal(await pag.textContent(".capbtn .capcnt"), "2");
    /* a caixa mostra o que ainda não subiu, sem perder nada */
    await pag.keyboard.press("Escape"); await pag.evaluate(() => { location.hash = "#caixa"; }); await pag.waitForSelector("#caixa-view .cx-fila");
    assert.match(await pag.textContent("#caixa-view .cx-fila"), /Aguardando a conexão/); assert.match(await pag.textContent("#caixa-view .cx-fila"), /1 arquivo guardado no aparelho/);
    /* a conexão volta: sobe tudo, e rodar a fila de novo não duplica */
    await pag.evaluate(() => { window.__bd.rede = true; }); await pag.context().setOffline(false);   /* o evento "online" já dispara a fila sozinho: rodar de novo, ao mesmo tempo, não pode duplicar */
    await pag.evaluate(() => { processarFila(); processarFila(); });
    await esperar(pag, () => window.__bd.t.captura_itens.length === 2 && JSON.parse(localStorage.getItem("rac-fila") || "[]").length === 0);
    await pag.evaluate(() => { const l = JSON.parse(localStorage.getItem("rac-fila") || "[]"); return l; });
    const b = await bd(pag); assert.equal(b.t.captura_itens.length, 2); assert.ok(Object.keys(b.objetos).some((k) => k.startsWith("captura/" + ESP + "/" + USR + "/")), "a foto subiu"); assert.deepEqual(await idb(pag), [], "e saiu do aparelho");
    /* reenvio da mesma operação (a resposta se perdeu): o banco ignora o repetido */
    await pag.evaluate(() => { const it = window.__bd.t.captura_itens[0]; return executarOp({ t: "captura_itens", acao: "upsert", dados: Object.assign({}, it, { conteudo: "OUTRO" }), reter: true }); });
    assert.equal((await bd(pag)).t.captura_itens.length, 2); assert.notEqual((await bd(pag)).t.captura_itens[0].conteudo, "OUTRO");
    assert.deepEqual(erros.filter((e) => !/Failed to fetch/.test(e)), [], "só sobram os erros de rede que o próprio teste simula");
  } finally { await fechar(); }
});

test("ERRO que repetir não resolve: o item fica RETIDO na fila com o motivo (nada se perde), para depois de 3 tentativas, aparece como erro e 'Tentar novamente' o envia quando o problema some; 'Descartar da fila' limpa o aparelho", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await ambiente();
  try {
    await pag.evaluate(() => precisa(["captura"]).then(() => capAquecer())); await pag.waitForTimeout(300);
    await pag.evaluate(() => { window.__bd.rede = false; }); await pag.context().setOffline(true);
    await abrirFolha(pag); await pag.fill("#capfundo .cap-txt", "texto que o banco vai recusar"); await pag.click('#capfundo .cap-comp button:text-is("Guardar")'); await pag.waitForSelector("#capfundo .rac-estado--ok");
    await pag.keyboard.press("Escape"); await pag.context().setOffline(false);
    await pag.evaluate(() => { window.__bd.rede = true; window.__bd.recusar = { t: "captura_itens", op: "upsert", msg: 'new row violates check constraint "captura_tem_conteudo"' }; });
    for (let i = 0; i < 4; i++) await pag.evaluate(() => { processarFila(); return new Promise((r) => setTimeout(r, 200)); });
    const f = await fila(pag); assert.equal(f.length, 1, "continua na fila"); assert.match(f[0].erro, /captura_tem_conteudo/); assert.equal(f[0].tent, 3, "3 tentativas e para"); assert.equal(f[0].parada, true); assert.equal(f[0].dados.conteudo, "texto que o banco vai recusar", "o conteúdo está inteiro");
    await pag.evaluate(() => { location.hash = "#caixa"; }); await pag.waitForSelector("#caixa-view .cx-fila"); assert.match(await pag.textContent("#caixa-view .cx-fila"), /Não subiu: .*captura_tem_conteudo/); assert.ok(await pag.locator('#caixa-view .rac-selo--erro').count() > 0);
    /* o problema acabou: tentar novamente envia */
    await pag.evaluate(() => { window.__bd.recusar = null; }); await pag.click('#caixa-view button:text-is("Tentar novamente")');
    await esperar(pag, () => window.__bd.t.captura_itens.length === 1 && JSON.parse(localStorage.getItem("rac-fila") || "[]").length === 0); assert.equal((await bd(pag)).t.captura_itens[0].conteudo, "texto que o banco vai recusar");
    /* descartar da fila: some do aparelho */
    await pag.evaluate(() => { filaGravar([{ t: "captura_itens", acao: "upsert", dados: { id: "x1", tipo: "texto", conteudo: "lixo", anexos: [] }, reter: true, erro: "check", tent: 3, parada: true, arquivos: [] }]); cxCarregar(); });
    await pag.waitForSelector('#caixa-view button:text-is("Descartar da fila")'); await pag.click('#caixa-view button:text-is("Descartar da fila")'); assert.deepEqual(await fila(pag), []);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("a Caixa: sugestão com 1 toque, conferência com edição, confirmar cria o registro NO MÓDULO e marca o item, DESFAZER remove só o que foi criado e devolve a pendente; descartar, arquivar e voltar", { skip: pular, timeout: 180000 }, async () => {
  const dia = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const mk = (id, conteudo, extra = {}) => ({ id, espaco_id: ESP, criado_por: USR, tipo: "texto", conteudo, anexos: [], estado: "pendente", sugestao: null, destino: null, origem: "app", criado_em: new Date().toISOString(), classificado_em: null, ...extra });
  const { pag, erros, fechar } = await ambiente({ t: { captura_itens: [mk("c1", "comprar leite, pão"), mk("c2", "dentista amanhã às 9h"), mk("c3", "Receita https://exemplo.com/pao #cozinha"), mk("c4", "Nota fiscal do mercado"), mk("c5", "pensamento solto sobre o dia")] } });
  try {
    await pag.evaluate(() => { location.hash = "#caixa"; }); await pag.waitForSelector("#caixa-view .cx-item");
    assert.equal(await pag.locator("#caixa-view .cx-item").count(), 5); assert.match(await pag.textContent('#caixa-view .cx-item[data-id="c1"] .cx-sug'), /Adicionar à lista de compras \(2 itens\)/); assert.match(await pag.textContent('#caixa-view .cx-item[data-id="c2"] .cx-sug'), /Criar lembrete para \d\d\/\d\d às 09:00/);
    assert.equal((await bd(pag)).escritas.length, 0, "abrir a caixa não escreve nada: só sugere");
    /* 1 toque: confirmar a sugestão da lista */
    await pag.click('#caixa-view .cx-item[data-id="c1"] button:has-text("✓ Adicionar à lista")'); await esperar(pag, () => window.__bd.t.lista.length === 2);
    let b = await bd(pag); assert.deepEqual(b.t.lista.map((x) => x.item), ["leite", "pão"]); assert.ok(b.t.lista.every((x) => x.tipo === "compra" && /^[0-9a-f-]{36}$/.test(x.id)));
    const c1 = b.t.captura_itens.find((x) => x.id === "c1"); assert.equal(c1.estado, "classificado"); assert.equal(c1.destino.modulo, "lista"); assert.deepEqual(c1.destino.ids, b.t.lista.map((x) => x.id)); assert.ok(c1.classificado_em);
    assert.equal(await pag.locator('#caixa-view .cx-item[data-id="c1"]').count(), 0, "saiu dos pendentes");
    await pag.click('#caixa-view .rac-chip:has-text("Encaminhados")'); assert.match(await pag.textContent('#caixa-view .cx-item[data-id="c1"] .cx-sug'), /Enviado para Lista/);
    /* desfazer: remove os registros criados (e só eles) e volta a pendente */
    await pag.evaluate(() => { window.__bd.t.lista.push({ id: "outro", tipo: "compra", item: "ovos", feito: false }); });
    await pag.click('#caixa-view .cx-item[data-id="c1"] button:text-is("Desfazer")'); await esperar(pag, () => window.__bd.t.captura_itens.find((x) => x.id === "c1").estado === "pendente");
    b = await bd(pag); assert.deepEqual(b.t.lista.map((x) => x.id), ["outro"], "só o que veio da captura saiu"); assert.equal(b.t.captura_itens.find((x) => x.id === "c1").destino, null);
    assert.match(await pag.textContent("#caixa-view .rac-alerta"), /Desfeito/); await pag.waitForSelector('#caixa-view .cx-item[data-id="c1"]');
    /* conferência com edição: muda o texto do lembrete antes de confirmar */
    await pag.click('#caixa-view .cx-item[data-id="c2"] button:text-is("Alterar e conferir")'); await pag.fill('#caixa-view .cx-painel input[type=text]', "Dentista (limpeza)"); await pag.fill('#caixa-view .cx-painel input[type=date]', dia);
    await pag.click('#caixa-view .cx-painel button:text-is("Confirmar e enviar")'); await esperar(pag, () => window.PESSOAL.lembretes.length === 1);
    const lem = await pag.evaluate(() => PESSOAL.lembretes[0]); assert.equal(lem.t, "Dentista (limpeza) às 09:00"); assert.equal(lem.data, dia); const c2 = (await bd(pag)).t.captura_itens.find((x) => x.id === "c2"); assert.deepEqual([c2.estado, c2.destino.modulo, c2.destino.id], ["classificado", "lembretes", lem.id]);
    await pag.click('#caixa-view .rac-chip:has-text("Encaminhados")'); await pag.click('#caixa-view .cx-item[data-id="c2"] button:text-is("Desfazer")'); await esperar(pag, () => window.PESSOAL.lembretes.length === 0);
    /* Biblioteca: o link vira item da Biblioteca com o MESMO id da captura (um por captura); desfazer o apaga */
    await pag.click('#caixa-view .rac-chip:has-text("Pendentes")'); await pag.click('#caixa-view .cx-item[data-id="c3"] button:has-text("✓ Guardar")'); await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 1);
    let bib = (await bd(pag)).t.biblioteca_itens[0]; assert.equal(bib.id, "c3"); assert.equal(bib.captura_id, "c3"); assert.equal(bib.tipo, "link"); assert.equal(bib.url, "https://exemplo.com/pao"); assert.equal(bib.origem, "captura");
    await pag.click('#caixa-view .rac-chip:has-text("Encaminhados")'); await pag.click('#caixa-view .cx-item[data-id="c3"] button:text-is("Desfazer")'); await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 0);
    /* nota fiscal: a sugestão abre a Central Fiscal (nada é gravado fora da caixa) */
    await pag.click('#caixa-view .rac-chip:has-text("Pendentes")'); await pag.click('#caixa-view .cx-item[data-id="c4"] button:has-text("✓ Abrir a Central Fiscal")'); await pag.waitForFunction(() => location.hash === "#fiscal", null, { timeout: 8000 });
    assert.equal((await bd(pag)).t.captura_itens.find((x) => x.id === "c4").destino.modulo, "fiscal");
    /* descartar, arquivar tudo (com confirmação em 2 passos), voltar e excluir de vez */
    await pag.evaluate(() => { location.hash = "#caixa"; }); await pag.waitForSelector('#caixa-view .cx-item[data-id="c5"]');
    await pag.click('#caixa-view .cx-item[data-id="c5"] button:text-is("Descartar")'); await esperar(pag, () => window.__bd.t.captura_itens.find((x) => x.id === "c5").estado === "descartado");
    await pag.click('#caixa-view .rac-chip:has-text("Descartados")'); await pag.click('#caixa-view .cx-item[data-id="c5"] button:text-is("Voltar para pendentes")'); await esperar(pag, () => window.__bd.t.captura_itens.find((x) => x.id === "c5").estado === "pendente");
    await pag.click('#caixa-view .rac-chip:has-text("Pendentes")'); await pag.click('#caixa-view button:text-is("Arquivar tudo")'); assert.equal((await bd(pag)).t.captura_itens.filter((x) => x.estado === "arquivado").length, 0, "o primeiro toque só pede a confirmação");
    await pag.click('#caixa-view button:has-text("Confirmar: arquivar")'); await esperar(pag, () => window.__bd.t.captura_itens.filter((x) => x.estado === "arquivado").length >= 3);
    await pag.click('#caixa-view .rac-chip:has-text("Arquivados")'); const n = await pag.locator("#caixa-view .cx-item").count(); await pag.click('#caixa-view .cx-item >> nth=0 >> button:text-is("Excluir de vez")'); await esperar(pag, (k) => window.__bd.t.captura_itens.length === k, 4);
    assert.ok(n >= 3); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("compartilhar de outro app (Share Target): o dono ganha um item PENDENTE (origem 'compartilhar') e a Caixa abre; a Fernanda segue com o formulário de antes", { skip: pular, timeout: 120000 }, async () => {
  const d = await ambiente();
  try {
    await d.pag.evaluate(() => { history.replaceState(null, "", "/?titulo=" + encodeURIComponent("Receita de pão") + "&texto=" + encodeURIComponent("muito boa") + "&link=" + encodeURIComponent("https://exemplo.com/pao") + "#componentes"); capturaCompartilhada(); });
    await esperar(d.pag, () => window.__bd.t.captura_itens.length === 1); const it = (await bd(d.pag)).t.captura_itens[0];
    assert.equal(it.origem, "compartilhar"); assert.match(it.conteudo, /Receita de pão\nmuito boa\nhttps:\/\/exemplo\.com\/pao/); assert.equal(it.estado, "pendente"); assert.equal(it.sugestao.destino, "biblioteca");
    await d.pag.waitForFunction(() => location.hash === "#caixa", null, { timeout: 8000 }); assert.equal(await d.pag.locator("#capfundo").count(), 0, "nenhum formulário abriu"); assert.equal((await bd(d.pag)).t.lista.length + (await bd(d.pag)).t.biblioteca_itens.length, 0, "nada foi encaminhado");
    assert.equal(await d.pag.evaluate(() => location.search), "", "o endereço é limpo (nada de compartilhar duas vezes ao recarregar)");
    assert.deepEqual(d.erros, []);
  } finally { await d.fechar(); }
  const c = await ambiente({}, { papel: "casa" });
  try {
    await c.pag.evaluate(() => { history.replaceState(null, "", "/?texto=" + encodeURIComponent("2 leite, pão") + "#componentes"); capturaCompartilhada(); });
    await c.pag.waitForSelector("#capfundo input"); assert.equal(await c.pag.inputValue("#capfundo input"), "2 leite, pão", "a Fernanda: formulário de compra, como antes"); assert.equal(await c.pag.locator("#capfundo .cap-txt").count(), 0, "sem o campo de captura universal"); assert.equal((await bd(c.pag)).t.captura_itens.length, 0);
  } finally { await c.fechar(); }
});

test("Biblioteca: guarda link, nota, arquivo e documento existente (só a referência, sem cópia); filtra; abre arquivo por URL temporária; excluir tira só a referência; os links antigos de Conexões aparecem como leitura", { skip: pular, timeout: 180000 }, async () => {
  const reg = { id: "r9", quem: "olivia", tipo: "vacina", titulo: "Vacina V10", data: "2026-10-10", arquivos: [{ path: "dono-x/olivia/vacina.pdf", nome: "vacina.pdf", tipo: "application/pdf" }] };
  const { pag, erros, fechar } = await ambiente({ t: { registros: [reg] } });
  try {
    await pag.evaluate(() => { PESSOAL.salvos = [{ t: "Artigo antigo", u: "https://antigo.exemplo/a", quando: "2026-01-01" }]; location.hash = "#biblioteca"; }); await pag.waitForSelector("#biblioteca-view .bb-item");
    assert.match(await pag.textContent('#biblioteca-view .bb-item'), /Artigo antigo/); assert.ok(await pag.locator('#biblioteca-view .rac-selo:has-text("Conexões")').count() > 0);
    /* link */
    await pag.click('#biblioteca-view button:has-text("Guardar")'); await pag.fill('.bb-form input[type=url]', "https://exemplo.com/receita"); await pag.fill('.bb-form input[placeholder="separe por vírgula"]', "cozinha, Receitas"); await pag.click('.bb-form button:text-is("Guardar")');
    await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 1); let it = (await bd(pag)).t.biblioteca_itens[0]; assert.equal(it.tipo, "link"); assert.equal(it.titulo, "exemplo.com"); assert.deepEqual(it.etiquetas, ["cozinha", "receitas"]); assert.equal(it.espaco_id, ESP); assert.equal(it.origem, "manual");
    /* nota */
    await pag.click('#biblioteca-view button:has-text("＋ Guardar")'); await pag.click('.bb-form .rac-chip:text-is("Nota")'); await pag.fill('.bb-form textarea', "Medidas da sala: 4 x 5 m"); await pag.click('.bb-form button:text-is("Guardar")'); await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 2);
    /* arquivo: vai para o cofre privado e a Biblioteca guarda a referência */
    await pag.click('#biblioteca-view button:has-text("＋ Guardar")'); await pag.click('.bb-form .rac-chip:text-is("Arquivo")'); await pag.setInputFiles('.bb-form input[type=file]', { name: "garantia.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 g") }); await pag.click('.bb-form button:text-is("Guardar")');
    await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 3); let b = await bd(pag); const arq = b.t.biblioteca_itens[2]; assert.equal(arq.tipo, "arquivo"); assert.equal(arq.ref.bucket, "captura"); assert.match(arq.ref.path, new RegExp("^" + ESP + "/" + USR + "/")); assert.ok(b.objetos["captura/" + arq.ref.path]);
    /* documento existente: só a referência; o mesmo documento duas vezes é recusado */
    await pag.click('#biblioteca-view button:has-text("＋ Guardar")'); await pag.click('.bb-form .rac-chip:text-is("Documento existente")'); await pag.click('.bb-docs input[type=radio]'); await pag.click('.bb-form button:text-is("Guardar")');
    await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 4); const doc = (await bd(pag)).t.biblioteca_itens[3]; assert.equal(doc.tipo, "documento"); assert.deepEqual([doc.ref.tabela, doc.ref.bucket, doc.ref.path, doc.ref.rota], ["registros", "familia", "dono-x/olivia/vacina.pdf", "#olivia"]);
    assert.deepEqual(Object.keys((await bd(pag)).objetos).filter((k) => k.startsWith("familia/")), [], "o documento NÃO foi copiado para nenhum cofre");
    await pag.click('#biblioteca-view button:has-text("＋ Guardar")'); await pag.click('.bb-form .rac-chip:text-is("Documento existente")'); await pag.click('.bb-docs input[type=radio]'); await pag.click('.bb-form button:text-is("Guardar")'); await pag.waitForSelector(".bb-form .rac-estado--erro"); assert.match(await pag.textContent(".bb-form"), /já está na Biblioteca/); await pag.click('.bb-form button:text-is("Cancelar")');
    /* filtros: tipo, etiqueta e busca sem acento */
    await pag.click('#biblioteca-view .rac-chip:text-is("Notas")'); assert.equal(await pag.locator("#biblioteca-view .bb-item").count(), 1); await pag.click('#biblioteca-view .rac-chip:text-is("Tudo")');
    await pag.click('#biblioteca-view .rac-chip:has-text("#receitas")'); assert.equal(await pag.locator("#biblioteca-view .bb-item").count(), 1); await pag.click('#biblioteca-view .rac-chip:has-text("#receitas")');
    await pag.fill('#biblioteca-view input[type=search]', "MEDIDAS sala"); assert.equal(await pag.locator("#biblioteca-view .bb-item").count(), 1); await pag.fill('#biblioteca-view input[type=search]', "zzzz"); assert.match(await pag.textContent("#biblioteca-view .bb-lista"), /Nada com esses filtros/); await pag.fill('#biblioteca-view input[type=search]', "");
    /* abrir o arquivo: URL temporária (120 s), nunca a pública */
    const ctx = pag.context(); const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), pag.click('#biblioteca-view .bb-item:has-text("garantia") button:text-is("Abrir")')]);
    await esperar(pag, () => window.__bd.assinadas.length === 1); const as = (await bd(pag)).assinadas[0]; assert.deepEqual([as.b, as.path, as.s], ["captura", arq.ref.path, 120]); if (popup) await popup.close();
    /* excluir: pede confirmação e apaga só a referência; o arquivo do cofre continua */
    await pag.click('#biblioteca-view .bb-item:has-text("garantia") button:text-is("Excluir")'); assert.equal((await bd(pag)).t.biblioteca_itens.length, 4); await pag.click('#biblioteca-view button:has-text("Confirmar: excluir")'); await esperar(pag, () => window.__bd.t.biblioteca_itens.length === 3);
    assert.ok((await bd(pag)).objetos["captura/" + arq.ref.path], "o arquivo continua no cofre"); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("a busca global encontra a Biblioteca e a caixa (provedores novos), e o widget da caixa só LÊ", { skip: pular }, async () => {
  const src = fs.readFileSync(raiz + "js/widgets-modulos.js", "utf8"), i = src.indexOf('tipo:"captura.caixa"'), w = src.slice(i, src.indexOf("/* os espaços da pessoa", i));
  assert.ok(i > 0 && !/\.(insert|update|upsert|delete)\(/.test(w), "o widget não escreve"); assert.match(w, /compartilhavel:false/);
  for (const arq of ["js/prov-biblioteca.js", "js/prov-captura.js"]) { const t = fs.readFileSync(raiz + arq, "utf8"); assert.ok(!/\.(insert|update|upsert|delete)\(/.test(t), arq + " só lê"); assert.match(t, /provRegistrar\(\{dominio:/); }
});

/* ---------- qualidade visual e de experiência ---------- */
const LARGURAS = [[390, 844, "celular"], [768, 1024, "tablet"], [1280, 800, "computador"]];
async function medir(pag, raizSel) {
  return pag.evaluate((sel) => {
    const R = document.querySelector(sel), r = { rolagemLateral: document.documentElement.scrollWidth - window.innerWidth, pequenos: [], estouro: [], sobrepostos: 0 };
    for (const e of R.querySelectorAll("button, a.rac-btn, .rac-chip, input:not([type=file]):not([type=radio]), select, textarea")) { const b = e.getBoundingClientRect(); if (!b.width || e.closest("[hidden]")) continue; if (b.height < 43.5 && !(e.tagName === "A" && !e.classList.contains("rac-btn"))) r.pequenos.push((e.textContent || e.placeholder || e.tagName).trim().slice(0, 30) + " " + Math.round(b.height)); }
    for (const e of R.querySelectorAll(".rac-card, .cx-item, .bb-item")) { const b = e.getBoundingClientRect(); if (b.right > window.innerWidth + 1 || b.left < -1) r.estouro.push(e.className); }
    const bs = [...R.querySelectorAll("button, .rac-chip")].filter((e) => e.getBoundingClientRect().width).map((e) => e.getBoundingClientRect());
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) r.sobrepostos++; }
    return r;
  }, raizSel);
}
test("qualidade visual: Caixa, Biblioteca e a folha de captura em celular, tablet e computador, claro e escuro: sem rolagem lateral, sem sobreposição, alvos de 44 px, nada estourando", { skip: pular, timeout: 300000 }, async () => {
  const mk = (id, c, extra = {}) => ({ id, espaco_id: ESP, criado_por: USR, tipo: "texto", conteudo: c, anexos: [], estado: "pendente", sugestao: null, destino: null, origem: "app", criado_em: new Date(Date.now() - 5 * 864e5).toISOString(), classificado_em: null, ...extra });
  const itens = [mk("v1", "comprar leite, pão e café para o fim de semana inteiro com a família toda"), mk("v2", "Receita https://exemplo.com.br/uma-url-bem-comprida/que-nao-quebra-a-tela?parametro=1234567890&outro=abcdefghijklmnop"), mk("v3", "", { tipo: "foto", anexos: [{ path: ESP + "/" + USR + "/v3/foto.jpg", nome: "IMG_20261128_093000_com_nome_muito_comprido.jpg", tipo: "image/jpeg", tamanho: 1 }] })];
  const bibs = [{ id: "b1", espaco_id: ESP, tipo: "link", titulo: "Um link com um título bem comprido para provar que o texto quebra em vez de estourar o cartão", url: "https://exemplo.com", etiquetas: ["cozinha", "receitas", "casa"], origem: "manual", criado_em: new Date().toISOString() },
    { id: "b2", espaco_id: ESP, tipo: "nota", titulo: "Nota", texto: "Texto longo ".repeat(40), etiquetas: [], origem: "captura", criado_em: new Date().toISOString() }];
  const relatorio = [];
  for (const [w, h, nome] of LARGURAS) for (const tema of ["light", "dark"]) {
    const { pag, erros, fechar } = await ambiente({ t: { captura_itens: itens, biblioteca_itens: bibs } }, { largura: w, altura: h, tema });
    try {
      await pag.evaluate(() => { location.hash = "#caixa"; }); await pag.waitForSelector("#caixa-view .cx-item"); await pag.click('#caixa-view .cx-item[data-id="v1"] button:text-is("Alterar e conferir")'); await pag.waitForSelector(".cx-painel");
      relatorio.push([nome, tema, "caixa", await medir(pag, "#caixa-view")]);
      if (tema === "light" && nome !== "tablet") await pag.screenshot({ path: raiz + `docs/planejamento/img/lote4-caixa-${nome}-${tema}.png` });
      await pag.evaluate(() => { location.hash = "#biblioteca"; }); await pag.waitForSelector("#biblioteca-view .bb-item"); relatorio.push([nome, tema, "biblioteca", await medir(pag, "#biblioteca-view")]);
      if (tema === "dark" && nome === "celular") await pag.screenshot({ path: raiz + `docs/planejamento/img/lote4-biblioteca-${nome}-${tema}.png` });
      await pag.click('#biblioteca-view button:has-text("＋ Guardar")'); await pag.waitForSelector(".bb-form"); relatorio.push([nome, tema, "biblioteca-form", await medir(pag, "#biblioteca-view")]);
      await pag.click(".capbtn"); await pag.waitForSelector("#capfundo .cap-txt"); relatorio.push([nome, tema, "folha", await medir(pag, "#capfundo")]);
      if (tema === "light" && nome === "celular") await pag.screenshot({ path: raiz + `docs/planejamento/img/lote4-captura-${nome}-${tema}.png` });
      assert.deepEqual(erros, [], nome + " " + tema);
    } finally { await fechar(); }
  }
  for (const [nome, tema, tela, m] of relatorio) { const rot = `${nome}/${tema}/${tela}`; assert.ok(m.rolagemLateral <= 1, rot + ": rolagem lateral " + m.rolagemLateral); assert.deepEqual(m.pequenos, [], rot + ": alvos menores que 44 px"); assert.deepEqual(m.estouro, [], rot + ": cartão estourando a tela"); assert.equal(m.sobrepostos, 0, rot + ": botões sobrepostos"); }
});
