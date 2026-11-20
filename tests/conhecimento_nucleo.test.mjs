// RAC Knowledge · regras puras (NUCLEO.kn*), a ferramenta dos agentes (scripts/conhecimento.mjs), os registros e o índice do repositório (docs/conhecimento/), e o protocolo
// no CLAUDE.md. Sem banco e sem rede. O índice em dia é conferido aqui: se alguém editar um registro e esquecer de rodar "node scripts/conhecimento.mjs indice", o CI reprova.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { lerTudo, indiceEmDia, criar, textoIndice, principal, DIR, INDICE } from "../scripts/conhecimento.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const J = (x) => JSON.parse(JSON.stringify(x));

const ARQ = `---
titulo: Teste de banco falha sem PGlite
tipo: erro
categoria: testes
tags: PGlite, Teste, pglite
estado: resolvido
origem: PR #54
data: 2026-11-20
relacionados: regra/tudo-e-global
---

O teste não roda no PGlite ausente.

## Causa

Ambiente sem preparar.

## Solução

Usar scripts/nuvem_testes.sh.

## Prevenção

Sempre pela nuvem.
`;

test("arquivo .md: lê o cabeçalho e as seções; tags normalizadas; relações como refs; o inverso (knParaArquivo) devolve o mesmo registro", () => {
  const r = N.knLerArquivo(ARQ, "teste-de-banco"); assert.ok(!r.erro, r.erro); const g = J(r.reg);
  assert.equal(g.ref, "erro/teste-de-banco"); assert.deepEqual(g.tags, ["pglite", "teste"]); assert.deepEqual(g.relacionados, ["regra/tudo-e-global"]); assert.equal(g.estado, "resolvido");
  assert.equal(g.conteudo, "O teste não roda no PGlite ausente."); assert.equal(g.causa, "Ambiente sem preparar."); assert.equal(g.solucao, "Usar scripts/nuvem_testes.sh."); assert.equal(g.prevencao, "Sempre pela nuvem.");
  assert.deepEqual(J(N.knLerArquivo(N.knParaArquivo(g), "teste-de-banco").reg), g, "ida e volta sem perder nada");
  assert.ok(N.knLerArquivo("sem cabeçalho", "x-yz").erro); assert.match(N.knLerArquivo(ARQ.replace("tipo: erro", "tipo: bobagem"), "teste-de-banco").erro, /tipo inválido/);
  assert.match(N.knLerArquivo(ARQ, "Nome Ruim").erro, /nome do arquivo inválido/); assert.match(N.knLerArquivo(ARQ.replace("titulo: Teste de banco falha sem PGlite", "titulo: ab"), "teste-de-banco").erro, /título/);
  assert.equal(N.knLerArquivo(ARQ.replace("## Causa", "## Causa\r"), "teste-de-banco").reg.causa.length > 0, true, "aceita fim de linha do Windows");
});

test("validação e segredos: o detector do núcleo é o mesmo do gatilho do banco (mesmas famílias), e texto normal passa", () => {
  const ok = { tipo: "regra", titulo: "Regra boa", conteudo: "A chave sb_publishable_x é pública; nunca a service_role no navegador." };
  assert.deepEqual(N.knValidar(ok), []);
  for (const t of ["sk-ant-api03-" + "A".repeat(30), "sb_secret_" + "b".repeat(20), "ghp_" + "c".repeat(36), "github_pat_" + "d".repeat(40), "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk1234", "-----BEGIN RSA PRIVATE KEY-----", "123.456.789-09", "AIza" + "e".repeat(35)])
    assert.ok(N.knSegredo(t), t.slice(0, 14)), assert.match(N.knValidar({ ...ok, conteudo: t }).join(), /parece conter chave/);
  const sql = ler("supabase/062_conhecimento.sql"); for (const re of N.KN_SEGREDOS || []) assert.ok(re, "x");
  for (const f of ["sk-ant-", "sb_secret_", "gh[pousr]_", "github_pat_", "AIza", "PRIVATE KEY", "eyJ"]) assert.ok(sql.includes(f), "o gatilho do banco cobre " + f);
  assert.match(N.knValidar({ tipo: "x", titulo: "a" }).join("; "), /tipo inválido; título precisa/);
  assert.match(N.knValidar({ ...ok, ref: "Ruim" }).join(), /ref inválida/); assert.match(N.knValidar({ ...ok, data_ref: "20/11/2026" }).join(), /data inválida/); assert.match(N.knValidar({ ...ok, causa: "x".repeat(4001) }).join(), /Causa passa de 4.000/);
});

test("tags e slug: minúsculas, sem repetir, até 12; slug sem acento, estável e com tamanho seguro", () => {
  assert.deepEqual(N.knTags("Git, git ,  Push,,"), ["git", "push"]); assert.deepEqual(N.knTags(["A", "a", "b"]), ["a", "b"]); assert.equal(N.knTags(Array.from({ length: 20 }, (_, i) => "t" + i)).length, 12);
  assert.equal(N.knSlug("Não usar \\b em Regex!"), "nao-usar-b-em-regex"); assert.equal(N.knSlug("ab"), "registro-ab"); assert.ok(N.knSlug("x".repeat(200)).length <= 60); assert.ok(/^[a-z0-9][a-z0-9-]+$/.test(N.knSlug("Ação — 100% pronta?")));
});

const L = [
  { id: "1", tipo: "regra", titulo: "Nunca force push", conteudo: "Sem force push", categoria: "git", tags: ["git", "push"], estado: "ativo", atualizado_em: "2026-11-01" },
  { id: "2", tipo: "erro", titulo: "Teste de banco falha", conteudo: "PGlite ausente", causa: "ambiente", categoria: "testes", tags: ["pglite", "git"], estado: "resolvido", atualizado_em: "2026-11-03" },
  { id: "3", tipo: "decisao", titulo: "Decisão velha", conteudo: "antes era assim", categoria: "git", tags: [], estado: "arquivado", atualizado_em: "2026-10-01" },
  { id: "4", tipo: "estado", titulo: "Estado atual", conteudo: "versão 3", tags: [], estado: "ativo", atualizado_em: "2026-11-05" }];
test("busca: várias palavras (todas), sem acento nem maiúscula, título pesa mais; filtros por tipo, categoria, tag e estado; 'vigentes' esconde arquivado e substituído", () => {
  const ids = (f) => N.knBusca(L, f).map((x) => x.id);
  assert.deepEqual(ids({ q: "FORCE  push" }), ["1"]); assert.deepEqual(ids({ q: "pglite ambiente" }), ["2"]); assert.deepEqual(ids({ q: "decisão" }), ["3"]); assert.deepEqual(ids({ q: "decisao" }), ["3"], "sem acento");
  assert.deepEqual(ids({ q: "git" }), ["2", "1", "3"], "pontos iguais (tag git) desempatam pela data mais nova; o que só tem a palavra na categoria vem depois");
  assert.deepEqual(ids({ q: "estado" }), ["4"]); assert.deepEqual(N.knBusca([{ id: "a", tipo: "regra", titulo: "outro", tags: [], conteudo: "teste", atualizado_em: "2026-12-01" }, { id: "b", tipo: "regra", titulo: "teste no título", tags: [], atualizado_em: "2026-01-01" }], { q: "teste" }).map((x) => x.id), ["b", "a"], "título pesa mais que a data"); assert.deepEqual(ids({ tipo: "erro" }), ["2"]); assert.deepEqual(ids({ categoria: "git" }), ["1", "3"]); assert.deepEqual(ids({ tag: "git" }), ["2", "1"], "mais recente primeiro");
  assert.deepEqual(ids({ estado: "arquivado" }), ["3"]); assert.deepEqual(ids({ estado: "vigentes" }).sort(), ["1", "2", "4"]); assert.deepEqual(ids({}).sort(), ["1", "2", "3", "4"]); assert.deepEqual(ids({ q: "nada disso" }), []);
  const f = N.knFacetas(L); assert.deepEqual(J(f.categorias), [{ k: "git", n: 2 }, { k: "testes", n: 1 }]); assert.deepEqual(J(f.tags), [{ k: "git", n: 2 }, { k: "pglite", n: 1 }, { k: "push", n: 1 }]);
});

test("resumo para o agente: só vigentes ativos; regras, estado, decisões e erros", () => {
  const t = N.knResumoAgente(L); assert.match(t, /^# RAC Knowledge · resumo/); assert.match(t, /## Regras permanentes\n- Nunca force push: Sem force push/); assert.match(t, /## Estado do projeto\n- Estado atual/);
  assert.ok(!/Decisão velha/.test(t) && !/Teste de banco falha/.test(t), "arquivado e resolvido ficam fora do resumo (só ativos)"); assert.equal(N.knResumoAgente([]), "# RAC Knowledge · resumo\n");
});

test("plano de importação: novo, igual, atualização, vínculo (tipo+título) e conflito; o que o site editou nunca vira atualização; 'só no site' lista o que o repositório não tem", () => {
  const ind = [{ ref: "erro/a-b-c", tipo: "erro", titulo: "A B", hash: "h1" }, { ref: "erro/novo-x", tipo: "erro", titulo: "Novo x", hash: "h2" }, { ref: "regra/vv", tipo: "regra", titulo: "Vinc", hash: "h3" },
    { ref: "regra/igual", tipo: "regra", titulo: "Igual", hash: "h4" }, { ref: "regra/atu", tipo: "regra", titulo: "Atualiza", hash: "h6" }];
  const banco = [{ id: 1, ref_externa: "erro/a-b-c", origem_hash: "h0", editado_no_site: true, tipo: "erro", titulo: "A B" }, { id: 2, tipo: "regra", titulo: "vinc", ref_externa: null }, { id: 3, tipo: "erro", titulo: "so site", ref_externa: null },
    { id: 4, ref_externa: "regra/igual", origem_hash: "h4", editado_no_site: false, tipo: "regra", titulo: "Igual" }, { id: 5, ref_externa: "regra/atu", origem_hash: "velho", editado_no_site: false, tipo: "regra", titulo: "Atualiza" },
    { id: 6, ref_externa: "regra/so-banco", origem_hash: "h5", editado_no_site: true, tipo: "regra", titulo: "Editado" }];
  const p = N.knPlano(ind, banco);
  assert.deepEqual([p.novos.length, p.conflitos.length, p.vincular.length, p.atualizar.length, p.iguais], [1, 1, 1, 1, 1]); assert.equal(p.novos[0].ref, "erro/novo-x"); assert.equal(p.conflitos[0].banco.id, 1); assert.equal(p.vincular[0].banco.id, 2); assert.equal(p.atualizar[0].banco.id, 5);
  assert.deepEqual(p.soSite.map((x) => x.id).sort(), [3, 6], "sem ref e editado no site sem arquivo");
  assert.deepEqual(J(N.knLinha({ ref: "regra/x-yz", tipo: "regra", titulo: "T", hash: "a".repeat(64), tags: ["a"] })), { tipo: "regra", titulo: "T", conteudo: "", motivo: null, causa: null, solucao: null, prevencao: null, categoria: null, tags: ["a"], estado: "ativo", origem: null, data_ref: N.knLinha({ hash: "" }).data_ref, ref_externa: "regra/x-yz", origem_hash: "a".repeat(64), editado_no_site: false });
  const row = { id: "9", tipo: "erro", titulo: "Um erro", relacionados: ["1", "2"], tags: ["a"], causa: "c" }; assert.deepEqual(J(N.knDoBanco(row, [{ id: "1", ref_externa: "regra/x-yz" }, { id: "2" }]).relacionados), ["regra/x-yz"], "relação sem arquivo não vai");
  assert.equal(N.knDoBanco(row, []).ref, "erro/um-erro");
});

test("ferramenta dos agentes (scripts/conhecimento.mjs): criar, índice determinístico, verificar, relação inexistente e pasta errada", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rac-kn-")), dir = path.join(tmp, "registros"), arq = path.join(tmp, "indice.json");
  try {
    let r = criar({ tipo: "regra", titulo: "Regra de teste", conteudo: "texto", tags: "A, b" }, dir, arq); assert.ok(r.ok, r.msg); assert.ok(fs.existsSync(path.join(dir, "regra", "regra-de-teste.md")));
    r = criar({ tipo: "erro", titulo: "Erro de teste", causa: "c", solucao: "s", relacionados: "regra/regra-de-teste" }, dir, arq); assert.ok(r.ok, r.msg);
    assert.ok(!criar({ tipo: "regra", titulo: "Regra de teste" }, dir, arq).ok, "não sobrescreve"); assert.match(criar({ tipo: "regra", titulo: "Com segredo", conteudo: "sk-ant-api03-" + "A".repeat(30) }, dir, arq).msg, /parece conter chave/);
    assert.ok(!criar({ tipo: "erro", titulo: "Relação ruim", relacionados: "regra/nao-existe" }, dir, arq).ok, "relação inexistente"); assert.ok(!fs.existsSync(path.join(dir, "erro", "relacao-ruim.md")), "o arquivo ruim é desfeito");
    const a = indiceEmDia(dir, arq); assert.ok(a.emDia && a.itens.length === 2 && !a.problemas.length); const ix = JSON.parse(fs.readFileSync(arq, "utf8")); assert.equal(ix.versao, 1); assert.deepEqual(ix.registros.map((x) => x.ref), ["erro/erro-de-teste", "regra/regra-de-teste"]);
    assert.ok(ix.registros.every((x) => /^[0-9a-f]{64}$/.test(x.hash)), "hash sha256 de cada arquivo"); assert.equal(textoIndice(lerTudo(dir).itens), fs.readFileSync(arq, "utf8"), "mesmo conteúdo, mesmo índice");
    fs.appendFileSync(path.join(dir, "regra", "regra-de-teste.md"), "\nmais uma linha\n"); assert.ok(!indiceEmDia(dir, arq).emDia, "editar o .md sem refazer o índice é detectado");
    fs.mkdirSync(path.join(dir, "decisao")); fs.copyFileSync(path.join(dir, "regra", "regra-de-teste.md"), path.join(dir, "decisao", "pasta-errada.md")); assert.match(lerTudo(dir).problemas.join(), /o tipo do cabeçalho \(regra\) não é o da pasta \(decisao\)/);
    fs.writeFileSync(path.join(dir, "regra", "quebrado.md"), "sem cabeçalho"); assert.match(lerTudo(dir).problemas.join(), /quebrado\.md|regra\/quebrado/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("os registros do repositório: todos válidos, refs únicas, relações existentes, índice em dia, nenhum segredo nem dado pessoal", () => {
  const r = indiceEmDia(); assert.deepEqual(r.problemas, []); assert.ok(r.emDia, "docs/conhecimento/indice.json desatualizado: rode  node scripts/conhecimento.mjs indice");
  assert.ok(r.itens.length >= 25); assert.equal(new Set(r.itens.map((i) => i.ref)).size, r.itens.length);
  for (const t of N.KN_TIPOS) assert.ok(r.itens.some((i) => i.tipo === t.k), "há pelo menos um registro de " + t.k);
  for (const i of r.itens) { assert.equal(N.knValidar({ ...i }).length, 0, i.ref); assert.ok(i.origem, i.ref + " tem origem (arquivo, PR, commit ou lote)"); assert.ok(i.tags.length, i.ref + " tem tags"); if (i.tipo === "erro") assert.ok(i.causa && i.solucao, i.ref + " (erro) tem causa e solução"); if (i.tipo === "decisao") assert.ok(i.motivo, i.ref + " (decisão) tem motivo"); }
  const todo = fs.readdirSync(DIR).flatMap((t) => fs.readdirSync(path.join(DIR, t)).map((f) => fs.readFileSync(path.join(DIR, t, f), "utf8"))).join("\n") + fs.readFileSync(INDICE, "utf8");
  for (const p of [/@gmail\.com/i, /@icloud\.com/i, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, /AIza[\w-]{30,}/, /sk-ant-/, /sb_secret_/, /service_role[_ ]key/i, /eyJ[\w-]{10,}\.[\w-]{10,}\./]) assert.ok(!p.test(todo), "dado pessoal ou segredo nos registros: " + p);
  const refs = new Set(r.itens.map((i) => i.ref));
  for (const rel of ["regra/autorizacoes-do-dono", "regra/a-funcao-garmin-e-intocavel", "regra/javascript-es5-puro", "regra/fernanda-papel-casa", "regra/repositorio-publico-sem-segredos", "regra/toda-ia-passa-pela-rac-ia", "regra/git-na-nuvem", "regra/tabela-pessoal-nova", "procedimento/publicar-sql-funcao-site", "procedimento/sql-novo-ate-a-producao", "procedimento/testes-na-nuvem-como-o-ci", "erro/nome-global-repetido-sobrescreve-outro-modulo", "erro/radar-falhava-com-42501-no-service-role"]) assert.ok(refs.has(rel), "registro essencial: " + rel);
});

test("a ferramenta em linha de comando: 'antes' traz regras, estado e o relacionado à tarefa; 'verificar' passa; comando desconhecido dá erro", () => {
  const saida = []; const log = console.log, err = console.error; console.log = (...a) => saida.push(a.join(" ")); console.error = () => {};
  try { assert.equal(principal(["antes", "migration nova tabela pessoal"]), 0); assert.equal(principal(["verificar"]), 0); assert.equal(principal(["buscar", "garmin"]), 0); assert.equal(principal(["ver", "erro/radar-falhava-com-42501-no-service-role"]), 0); assert.equal(principal(["ver", "regra/nao-existe"]), 1); assert.equal(principal(["xpto"]), 2); }
  finally { console.log = log; console.error = err; }
  const t = saida.join("\n"); assert.match(t, /## Regras permanentes/); assert.match(t, /## Estado atual do projeto/); assert.match(t, /## Relacionados à tarefa[\s\S]*SQL novo até a produção/); assert.match(t, /intocável/); assert.match(t, /42501/);
});

test("integração: protocolo no CLAUDE.md, documentação própria, mapa, backup, rota só do dono, arquivos no service worker e a ferramenta sem rede nem banco", () => {
  const c = ler("CLAUDE.md"); assert.match(c, /## RAC Knowledge .*protocolo obrigatório/); assert.match(c, /\*\*ANTES de implementar\*\*[\s\S]{0,300}conhecimento\.mjs antes/); assert.match(c, /\*\*DEPOIS de implementar\*\*[\s\S]{0,700}conhecimento\.mjs novo[\s\S]{0,200}indice/);
  assert.match(c, /Os agentes não têm acesso ao banco/); assert.match(c, /Nunca\*\* registrar senha, chave, token, CPF/);
  for (const t of ["Arquitetura", "Modelo de dados", "Segurança", "Usando pelo celular", "Importar do repositório", "protocolo obrigatório", "Aplicar em produção"]) assert.match(ler("docs/conhecimento.md"), new RegExp("## .*" + t.replace(/[()]/g, ".")), t);
  assert.match(ler("docs/mapa.md"), /RAC Knowledge \(`#conhecimento`/); assert.match(ler("docs/mapa.md"), /062_conhecimento\.sql/);
  const dep = N.SEG_TABELAS.filter((d) => d.dep === "062"); assert.deepEqual(dep.map((d) => d.t), ["conhecimento", "conhecimento_historico"]); assert.ok(dep.every((d) => d.so === "exportar"), "só exporta");
  assert.match(ler("sw.js"), /"\.\/js\/conhecimento\.js"/); assert.match(ler("index.html"), /<section id="conhecimento" hidden><div id="conhecimento-view" class="stack"><\/div><\/section>/);
  const fonte = ler("scripts/conhecimento.mjs").replace(/^\/\/.*$/gm, ""); assert.ok(!/fetch\(|https?:\/\/|child_process|supabase|process\.env/.test(fonte), "a ferramenta só lê e escreve arquivos");
});
