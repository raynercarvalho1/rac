// Calibra a correspondência de produtos (NUCLEO.mkSimilaridade) com os SEUS produtos reais, sem colocar nada no repositório.
// Uso:  node scripts/calibrar_correspondencia.mjs produtos.txt [corte=60]
//   produtos.txt = um nome de produto por linha (ex.: exporte "select nome from public.produtos order by nome" do SQL Editor para um arquivo local FORA do repositório).
// Mostra os pares com semelhança a partir do corte (padrão 60), do mais parecido para o menos, com a decisão que o RAC tomaria (≥ 70 = reaproveita; abaixo = produto novo),
// para você conferir se há pares que seriam fundidos por engano (marca, tamanho, sabor) ou que deveriam ser o mesmo e não são. Só lê o arquivo; não chama rede nem banco.
import fs from "node:fs";
import { createRequire } from "node:module";
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo, [arq, corteArg] = process.argv.slice(2);
if (!arq) { console.error("Uso: node scripts/calibrar_correspondencia.mjs produtos.txt [corte=60]"); process.exit(2); }
const corte = Number(corteArg || 60), nomes = [...new Set(fs.readFileSync(arq, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean))], pares = [];
for (let i = 0; i < nomes.length; i++) for (let j = i + 1; j < nomes.length; j++) { const p = N.mkSimilaridade(nomes[i], nomes[j]); if (p >= corte) pares.push([p, nomes[i], nomes[j]]); }
pares.sort((a, b) => b[0] - a[0]);
console.log(`${nomes.length} produtos; ${pares.length} pares com semelhança >= ${corte}%\n`);
for (const [p, a, b] of pares) console.log(`${String(p).padStart(3)}%  ${p >= N.MK_CASAR_CORTE ? "REAPROVEITA" : "novo       "}  ${a}  ×  ${b}`);
