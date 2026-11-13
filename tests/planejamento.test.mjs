// Documentação de planejamento (docs/planejamento/, o Documento 1 do RAC): os arquivos esperados existem, os links internos
// abrem (arquivo e âncora, como o GitHub gera), os caminhos citados entre crases existem, nada parece dado pessoal e o histórico
// diário tem as três partes em cada dia, em ordem de data, sem perder o primeiro registro (regra do CLAUDE.md).
// Sem rede e sem banco: só lê arquivos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
const pasta = new URL("docs/planejamento/", raiz);
const ESPERADOS = ["01-visao-e-mapa-mestre.md", "02-auditoria-arquitetural.md", "03-design-system.md", "04-rac-intelligence.md",
  "05-integracoes-e-automacoes.md", "06-roadmap.md", "07-decisoes-e-pendencias.md", "08-frentes-funcionais.md", "historico-diario.md"];
const docs = fs.readdirSync(pasta).filter((f) => f.endsWith(".md")).sort();
const ler = (nome) => fs.readFileSync(new URL(nome, pasta), "utf8");

/* linhas fora dos blocos de código (``` ... ```) */
function foraDeCodigo(texto) {
  let dentro = false;
  return texto.split("\n").filter((l) => { if (/^\s*```/.test(l)) { dentro = !dentro; return false; } return !dentro; });
}
/* âncora de um título como o GitHub faz: minúsculas, sem pontuação nem símbolos, cada espaço vira hífen; acentos ficam */
function ancora(titulo) {
  return titulo.replace(/`/g, "").replace(/\*\*/g, "").trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
}
function ancorasDe(texto) {
  const vistas = {}, out = new Set();
  for (const l of foraDeCodigo(texto)) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(l);
    if (!m) continue;
    const base = ancora(m[1]);
    const a = vistas[base] === undefined ? base : base + "-" + vistas[base];
    vistas[base] = (vistas[base] ?? 0) + 1;
    out.add(a);
  }
  return out;
}

test("planejamento: os nove documentos existem", () => {
  for (const f of ESPERADOS) assert.ok(docs.includes(f), `falta docs/planejamento/${f}`);
});

test("planejamento: todo link interno abre o arquivo e a âncora certos", () => {
  for (const f of docs) {
    const t = ler(f);
    for (const l of foraDeCodigo(t)) {
      for (const m of l.matchAll(/\]\(([^)\s]+)\)/g)) {
        const alvo = m[1];
        if (/^(https?:|mailto:)/.test(alvo)) continue;
        const [arq, anc] = alvo.split("#");
        const url = arq ? new URL(arq, new URL(f, pasta)) : new URL(f, pasta);
        assert.ok(fs.existsSync(url), `${f}: link para ${alvo} não abre (arquivo não existe)`);
        if (anc && /\.md$/.test(url.pathname)) {
          const ancs = ancorasDe(fs.readFileSync(url, "utf8"));
          assert.ok(ancs.has(decodeURIComponent(anc)), `${f}: âncora #${anc} não existe em ${arq || f}`);
        }
      }
    }
  }
});

test("planejamento: todo caminho do repositório citado entre crases existe", () => {
  const RAIZ_ARQ = ["index.html", "nucleo.js", "mercado.js", "sw.js", "manifest.webmanifest", "CLAUDE.md", "README.md"];
  for (const f of docs) {
    for (const m of ler(f).matchAll(/`([^`\s]+)`/g)) {
      const c = m[1];
      /* arquivo ainda não criado é escrito com NNN (ex.: migration futura); curingas e modelos ficam de fora */
      if (/NNN|\*|<|>/.test(c)) continue;
      const ehCaminho = /^(js|supabase|tests|docs|scripts|\.github|\.claude)\/[\w.\/-]*$/.test(c) || RAIZ_ARQ.includes(c);
      if (!ehCaminho) continue;
      assert.ok(fs.existsSync(new URL(c, raiz)), `${f} cita \`${c}\`, que não existe no repositório`);
    }
  }
});

test("planejamento: nada que pareça dado pessoal (o repositório é público)", () => {
  const proibidos = [/@gmail\.com/i, /@icloud\.com/i, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, /class\.mbx\.academy\/\?t=/, /AIza[\w-]{30,}/,
    /sb_secret_/i, /latitude=-?\d/i, /\b\d{5}-\d{3}\b/];
  for (const f of docs) {
    const t = ler(f);
    for (const p of proibidos) assert.ok(!p.test(t), `${f} tem algo que parece dado pessoal (${p})`);
  }
});

test("histórico diário: cada dia tem as três partes, em ordem, e o primeiro registro continua lá", () => {
  const t = ler("historico-diario.md");
  const dias = [...t.matchAll(/^## (\d{2})\/(\d{2})\/(\d{4})\s*$/gm)];
  assert.ok(dias.length >= 1, "nenhum dia registrado");
  assert.equal(`${dias[0][1]}/${dias[0][2]}/${dias[0][3]}`, "13/11/2026", "o primeiro registro (13/11/2026) não pode ser apagado");
  let anterior = "";
  dias.forEach((d, i) => {
    const iso = `${d[3]}-${d[2]}-${d[1]}`;
    assert.ok(iso >= anterior, `o dia ${d[0].slice(3)} está fora da ordem cronológica`);
    anterior = iso;
    const corpo = t.slice(d.index, i + 1 < dias.length ? dias[i + 1].index : t.length);
    const partes = ["### 1. O que fizemos", "### 2. O que estamos fazendo", "### 3. O que vamos fazer"].map((p) => corpo.indexOf(p));
    assert.ok(partes.every((x) => x > 0), `o dia ${d[0].slice(3)} não tem as três partes (fizemos, fazendo, vamos fazer)`);
    assert.ok(partes[0] < partes[1] && partes[1] < partes[2], `as três partes do dia ${d[0].slice(3)} estão fora de ordem`);
  });
});

test("planejamento: o mapa, o README e o CLAUDE.md apontam para os documentos", () => {
  assert.match(fs.readFileSync(new URL("docs/mapa.md", raiz), "utf8"), /docs\/planejamento\//);
  assert.match(fs.readFileSync(new URL("README.md", raiz), "utf8"), /docs\/planejamento\//);
  assert.match(fs.readFileSync(new URL("CLAUDE.md", raiz), "utf8"), /docs\/planejamento\/historico-diario\.md/);
});
