#!/usr/bin/env node
// RAC Knowledge · ferramenta dos agentes (docs/conhecimento.md). Lê e grava os registros que moram no repositório (docs/conhecimento/registros/<tipo>/<nome>.md)
// e mantém o índice docs/conhecimento/indice.json, que o site importa para o banco com um toque do dono. Não usa rede, banco, chave nem dependência: só arquivos.
//   node scripts/conhecimento.mjs antes "o que vou fazer"   regras ativas + estado + decisões, erros e procedimentos relacionados (ANTES de implementar)
//   node scripts/conhecimento.mjs buscar termos [--tipo erro] [--tag x] [--categoria y] [--estado ativo]
//   node scripts/conhecimento.mjs ver <tipo/nome>           um registro inteiro
//   node scripts/conhecimento.mjs novo --tipo erro --titulo "..." [--categoria c] [--tags a,b] [--origem "PR #1"] [--conteudo "..."] [--motivo|--causa|--solucao|--prevencao "..."] [--relacionados tipo/nome,...] [--estado ativo] [--nome slug]
//   node scripts/conhecimento.mjs indice                    refaz o índice (depois de criar ou editar um .md à mão)
//   node scripts/conhecimento.mjs verificar                 confere os arquivos e se o índice está em dia (o teste do CI faz o mesmo)
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
createRequire(import.meta.url)(path.join(RAIZ, "nucleo.js"));
export const N = globalThis.RACnucleo;
export const DIR = path.join(RAIZ, "docs/conhecimento/registros"), INDICE = path.join(RAIZ, "docs/conhecimento/indice.json");

const hash = (t) => createHash("sha256").update(t.replace(/\r\n/g, "\n")).digest("hex");

/* lê todos os .md; devolve { itens (com hash), problemas } */
export function lerTudo(dir = DIR) {
  const itens = [], problemas = [];
  if (!fs.existsSync(dir)) return { itens, problemas };
  for (const t of fs.readdirSync(dir).sort()) {
    const pasta = path.join(dir, t);
    if (!fs.statSync(pasta).isDirectory()) continue;
    for (const f of fs.readdirSync(pasta).sort()) {
      if (!f.endsWith(".md")) continue;
      const rel = `${t}/${f}`, texto = fs.readFileSync(path.join(pasta, f), "utf8"), r = N.knLerArquivo(texto, f.slice(0, -3));
      if (r.erro) { problemas.push(`${rel}: ${r.erro}`); continue; }
      if (r.reg.tipo !== t) { problemas.push(`${rel}: o tipo do cabeçalho (${r.reg.tipo}) não é o da pasta (${t})`); continue; }
      itens.push({ ...r.reg, hash: hash(texto) });
    }
  }
  const refs = new Set(itens.map((i) => i.ref));
  for (const i of itens) for (const x of i.relacionados) if (!refs.has(x)) problemas.push(`${i.ref}: relacionado inexistente (${x})`);
  itens.sort((a, b) => a.ref.localeCompare(b.ref));
  return { itens, problemas };
}
export const textoIndice = (itens) => `{"versao":1,"registros":[\n${itens.map((i) => "  " + JSON.stringify(i)).join(",\n")}\n]}\n`;
export function indiceEmDia(dir = DIR, arq = INDICE) {
  const { itens, problemas } = lerTudo(dir), atual = fs.existsSync(arq) ? fs.readFileSync(arq, "utf8") : "";
  return { itens, problemas, emDia: atual === textoIndice(itens) };
}

/* cria o arquivo de um registro novo (args no formato da linha de comando) e refaz o índice; devolve { ok, msg } */
export function criar(a, dir = DIR, arq = INDICE) {
  const reg = { tipo: a.tipo, titulo: a.titulo, categoria: a.categoria || "", tags: N.knTags(a.tags), estado: a.estado || "ativo", origem: a.origem || "", data_ref: a.data || new Date().toISOString().slice(0, 10),
    relacionados: String(a.relacionados || "").split(",").map((x) => x.trim()).filter(Boolean), conteudo: a.conteudo || "", motivo: a.motivo || "", causa: a.causa || "", solucao: a.solucao || "", prevencao: a.prevencao || "" };
  const slug = a.nome || N.knSlug(reg.titulo || ""), p = N.knValidar(reg);
  if (p.length) return { ok: false, msg: "Não criei: " + p.join("; ") };
  const f = path.join(dir, String(reg.tipo), slug + ".md");
  if (fs.existsSync(f)) return { ok: false, msg: `Já existe ${reg.tipo}/${slug}: edite o arquivo (e rode "indice") ou use --nome` };
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, N.knParaArquivo(reg));
  const r = lerTudo(dir); if (r.problemas.length) { fs.unlinkSync(f); return { ok: false, msg: "Não criei: " + r.problemas.join("; ") }; }
  fs.writeFileSync(arq, textoIndice(r.itens)); return { ok: true, msg: `criado ${reg.tipo}/${slug} e índice refeito (${r.itens.length} registros)` };
}

function args(v) { const o = { _: [] }; for (let i = 0; i < v.length; i++) { if (v[i].startsWith("--")) o[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith("--") ? v[++i] : "1"; else o._.push(v[i]); } return o; }
const linha = (i) => `- [${i.ref}] ${i.titulo}${i.estado !== "ativo" ? " (" + i.estado + ")" : ""}${i.categoria ? " · " + i.categoria : ""}`;
const completo = (i) => `### ${i.titulo}  [${i.ref}${i.estado !== "ativo" ? ", " + i.estado : ""}]\n` + N.knParaArquivo(i).replace(/^---[\s\S]*?---\n/, "").trim();

function antes(itens, tarefa) {
  const at = itens.filter((i) => i.estado === "ativo"), sai = [];
  sai.push("# RAC Knowledge · antes de implementar\n", "## Regras permanentes (valem sempre)\n" + (at.filter((i) => i.tipo === "regra").map(completo).join("\n\n") || "(nenhuma)"));
  sai.push("\n## Estado atual do projeto\n" + (at.filter((i) => i.tipo === "estado").map(completo).join("\n\n") || "(nenhum)"));
  const palavras = [...new Set(N.knSlug(tarefa || "").split("-").filter((p) => p.length >= 4))], pont = new Map();
  for (const p of palavras) for (const i of N.knBusca(itens.filter((x) => x.estado !== "arquivado" && ["decisao", "erro", "procedimento"].includes(x.tipo)), { q: p })) pont.set(i, (pont.get(i) || 0) + 1);
  const rel = [...pont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]);
  sai.push("\n## Relacionados à tarefa (decisões, erros e procedimentos)\n" + (rel.length ? rel.map(completo).join("\n\n") : tarefa ? "(nada encontrado para: " + palavras.join(", ") + ")" : "(passe a tarefa entre aspas)"));
  sai.push("\nLeia os de tipo erro e decisão com atenção: repetir um erro registrado ou desfazer uma decisão aprovada é falha. Ao terminar, registre o que for novo (docs/conhecimento.md).");
  return sai.join("\n");
}

export function principal(argv) {
  const [cmd, ...resto] = argv, a = args(resto);
  if (cmd === "indice") {
    const { itens, problemas } = lerTudo();
    if (problemas.length) { console.error("Problemas:\n- " + problemas.join("\n- ")); return 1; }
    fs.writeFileSync(INDICE, textoIndice(itens)); console.log(`índice refeito: ${itens.length} registros`); return 0;
  }
  if (cmd === "verificar") {
    const r = indiceEmDia();
    if (r.problemas.length) { console.error("Problemas:\n- " + r.problemas.join("\n- ")); return 1; }
    if (!r.emDia) { console.error("docs/conhecimento/indice.json está desatualizado: rode  node scripts/conhecimento.mjs indice"); return 1; }
    console.log(`ok: ${r.itens.length} registros, índice em dia`); return 0;
  }
  const { itens, problemas } = lerTudo();
  if (problemas.length) console.error("Aviso (arquivos com problema, ignorados):\n- " + problemas.join("\n- ") + "\n");
  if (cmd === "antes") { console.log(antes(itens, a._.join(" "))); return 0; }
  if (cmd === "buscar" || cmd === "listar") {
    const r = N.knBusca(itens, { q: a._.join(" "), tipo: a.tipo, tag: a.tag, categoria: a.categoria, estado: a.estado });
    console.log(r.length ? r.map(linha).join("\n") : "nada encontrado"); return 0;
  }
  if (cmd === "ver") {
    const i = itens.find((x) => x.ref === a._[0]); if (!i) { console.error("não existe: " + a._[0]); return 1; }
    console.log(completo(i)); return 0;
  }
  if (cmd === "novo") { const r = criar(a); (r.ok ? console.log : console.error)(r.msg); return r.ok ? 0 : 1; }
  console.error("uso: node scripts/conhecimento.mjs antes|buscar|listar|ver|novo|indice|verificar (veja o topo do arquivo)"); return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(principal(process.argv.slice(2)));
