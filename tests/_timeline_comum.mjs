// Auxiliar dos testes de tela da Timeline e da Busca (Lote 3): servidor estático, navegador, banco simulado (o de tests/workspace_tela.test.mjs) e os dados de exemplo. Não é um teste (o nome começa com "_").
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const raiz = fileURLToPath(new URL("../", import.meta.url));
export let pw = null;
try { pw = await import("playwright"); } catch (_) { /* sem Playwright: pula */ }
export const pular = !pw ? "Playwright não instalado (roda no GitHub)" : false;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const abrirNavegador = () => pw.chromium.launch(process.env.RAC_CHROMIUM ? { executablePath: process.env.RAC_CHROMIUM } : {});
const fonteTeste = fs.readFileSync(path.join(raiz, "tests/workspace_tela.test.mjs"), "utf8");
export const instalar = fonteTeste.slice(fonteTeste.indexOf("function instalar(cfg) {"), fonteTeste.indexOf("const PESSOAL")).trim();

const pad = (n) => String(n).padStart(2, "0");
export const iso = (dd = 0) => { const d = new Date(); d.setDate(d.getDate() + dd); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const utc = (dd, h) => { const d = new Date(); d.setDate(d.getDate() + dd); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00:00Z`; };
export const PESSOAL = { id: "e-pessoal", tipo: "pessoal", nome: "Pessoal", papel: "proprietario", casa: false, arquivado: false }, CASA = { id: "e-casa", tipo: "compartilhado", nome: "Casa", papel: "editor", casa: true, arquivado: false };
export const base = () => ({
  registros: [{ id: "r1", quem: "olivia", tipo: "vacina", data: iso(-1), titulo: "Vacina V10", valor: "dose 2", arquivos: [{ path: "x" }], criado_em: utc(-1, 10) }, { id: "r2", quem: "civic", tipo: "revisao", data: iso(-3), titulo: "Revisão de 70 mil km", arquivos: [], criado_em: utc(-3, 10) }, { id: "r3", quem: "eddie", tipo: "consulta", data: iso(-40), titulo: "Consulta de rotina antiga", arquivos: [] }],
  garmin_ativ: [{ user_id: "u-dono", id: 11, inicio: iso(-1) + "T07:10:00", tipo: "running", dados: { distancia: 5200, duracao: 1750, nome: "Corrida no parque" } }],
  inbox_pastas: [{ id: "p-ent", dono: "u-dono", uso: "entrada", ativa: true }],
  inbox_mensagens_ref: [{ id: "m1", dono: "u-dono", conta_id: "c1", pasta_id: "p-ent", recebida_em: utc(0, 12), assunto: "Fatura do cartão", remetente_nome: "Banco Azul", lida: false, anexo_provavel: true }],
  newsletter_edicoes: [{ id: "n1", dono: "u-dono", data: iso(0), turno: "manha", origem: "ia", criado_em: utc(0, 9) }],
  notas_fiscais: [{ id: "nf1", numero: "123", data_emissao: iso(-2), emitente_nome: "Loja Estrela", valor_total: 89.9, valor_a_pagar: 89.9, situacao: "autorizada", criado_em: utc(-2, 11) }],
  notas_fiscais_vinculos: [{ nota_id: "nf1", modulo: "compras", registro_id: "co1", valido: true }],
  compras_online: [{ id: "co1", loja: "amazon", numero: "A-1", data: iso(-2), vendedor: "Estrela Eletro", status: "entregue", total_pago: 89.9, categoria: "Casa", criado_em: utc(-2, 9) }],
  notas: [{ id: "mn1", data: iso(-1), numero: "555", total: 120.5, created_at: utc(-1, 19), mercados: { nome: "Mercado Alfa (Centro)" } }],
  produtos: [{ nome: "Café torrado", categoria: "Mercearia" }, { nome: "Açúcar", categoria: "Mercearia" }], lista: [] });
export const LEMBRETES = [{ id: "l1", t: "Pagar o IPVA", data: iso(-1), feito: false }, { id: "l2", t: "Reunião da escola", data: iso(3), feito: false }];

export async function abrir(cfg = {}, { largura = 1280, altura = 900, hash = "#timeline", tema = "light", papel = "dono" } = {}) {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const nav = await abrirNavegador(), ctx = await nav.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema }), pag = await ctx.newPage(), erros = [];
  pag.on("pageerror", (e) => erros.push("erro: " + e.message));
  { const esperar = pag.waitForFunction.bind(pag); pag.waitForFunction = (fn, arg, opt) => esperar(fn, arg, { polling: 100, ...opt }); }   // sondagem por intervalo, não por requestAnimationFrame (ver tests/workspace_tela.test.mjs)
  await pag.goto(`http://127.0.0.1:${servidor.address().port}/`); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
  await pag.evaluate(new Function("return " + instalar)(), { espacos: [PESSOAL, CASA], tabelas: { ...base(), ...(cfg.tabelas || {}) }, papel, ...cfg, tabelas: { ...base(), ...(cfg.tabelas || {}) } });
  await pag.evaluate((a) => { document.documentElement.setAttribute("data-theme", a.tema); window.PESSOAL.lembretes = a.lembretes; if (a.papel === "casa") document.documentElement.classList.add("casa"); }, { tema, lembretes: cfg.semLembretes ? [] : LEMBRETES, papel });
  await pag.evaluate(async (h) => { document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true; history.replaceState(null, "", h); route(); }, hash);
  return { pag, erros, fechar: async () => { await nav.close(); servidor.close(); } };
}
