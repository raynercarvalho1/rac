// RAC Inbox · inspeção dos comandos IMAP no PACOTE do Worker (bundle gerado pelo "wrangler deploy --dry-run"). Usada pelo workflow rac-inbox-worker-publicar.yml, ANTES da aprovação do Environment, e pelo teste
// tests/rac_inbox_worker_inspecao.test.mjs. Vem da ferramenta (checkout da main), não do pacote inspecionado. Sem rede, sem secrets, só lê o arquivo.
// POLÍTICA (I3.2): o Worker deixa de ser "só leitura" e passa a ter UM gerenciamento restrito (seção "I3.2 · GERENCIAMENTO" do imap.mjs). Portanto:
//   PERMITIDO, e só nestas formas exatas (cada uma exatamente UMA vez no pacote):
//     - SELECT "<pasta>" na abertura controlada de pasta (verbo === "SELECT" na lista fechada + a única chamada executarComando(ctx, "SELECT", ... conferirPasta(...)));
//     - UID STORE <um UID> +FLAGS (\Seen) | -FLAGS (\Seen): só a flag \Seen, um UID (RE_STORE e a chamada de marcar_lida);
//     - UID MOVE <um UID> "<pasta>" (RE_MOVE e a chamada de mover_mensagem), com o portão: o MOVE só vale se o servidor o anunciar DEPOIS do login (ctx.capDepois.includes("MOVE") → "acao_indisponivel").
//   PROIBIDO em qualquer forma: COPY, APPEND, EXPUNGE (inclusive UID EXPUNGE), DELETE, RENAME, SUBSCRIBE, IDLE, AUTHENTICATE, CLOSE, UNSELECT; a flag \Deleted; FLAGS.SILENT; qualquer STORE/MOVE/SELECT fora das formas
//   acima (STORE de outra flag, de vários UIDs, com \Deleted...). A única menção a EXPUNGE é o padrão que CONTA respostas "* n EXPUNGE" do MOVE (leitura de resposta; nenhum comando).
// Qualquer mudança nos comandos faz esta inspeção falhar de propósito: a lista fechada só muda com revisão humana (atualize os padrões aqui, no mesmo PR, com teste).
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const SEMPRE_PROIBIDOS = ["COPY", "APPEND", "EXPUNGE", "DELETE", "RENAME", "SUBSCRIBE", "IDLE", "AUTHENTICATE", "CLOSE", "UNSELECT"];
const ID = "[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*";   // identificador ou propriedade (p.uid, ctx.politica...)

// trechos AUTORIZADOS: { nome, padrão, vezes } — cada um tem de aparecer exatamente `vezes` vezes; depois de contados, são retirados antes da busca de qualquer verbo restante
const AUTORIZADOS = [
  { nome: "RE_STORE (um UID, só \\Seen)", re: /var RE_STORE = \/\^ STORE \(\[1-9\]\\d\{0,9\}\) \(\[\+-\]\)FLAGS \\\(\\\\Seen\\\)\$\/;/g, vezes: 1 },
  { nome: "RE_MOVE (um UID e uma pasta)", re: /var RE_MOVE = \/\^ MOVE \(\[1-9\]\\d\{0,9\}\) "\(\.\*\)"\$\/;/g, vezes: 1 },
  { nome: "RE_COPY (um UID e uma pasta; servidor sem MOVE)", re: /var RE_COPY = \/\^ COPY \(\[1-9\]\\d\{0,9\}\) "\(\.\*\)"\$\/;/g, vezes: 1 },
  { nome: "RE_STORE_DEL (um UID, só +FLAGS (\\Deleted))", re: /var RE_STORE_DEL = \/\^ STORE \(\[1-9\]\\d\{0,9\}\) \\\+FLAGS \\\(\\\\Deleted\\\)\$\/;/g, vezes: 1 },
  { nome: "RE_EXPUNGE_UID (UID EXPUNGE de UM UID)", re: /var RE_EXPUNGE_UID = \/\^ EXPUNGE \(\[1-9\]\\d\{0,9\}\)\$\/;/g, vezes: 1 },
  { nome: "RE_BUSCA_MID (busca da cópia só por Message-ID entre <>)", re: /var RE_BUSCA_MID = \/\^ SEARCH HEADER Message-ID "\(<\[\^<>"\\\\\\s\\u0000-\\u001f\\u007f-\\uffff\]\{1,250\}>\)"\$\/;/g, vezes: 1 },
  { nome: "marca de comando que altera (STORE|MOVE|COPY|EXPUNGE)", re: /\/\^ \(\?:STORE\|MOVE\|COPY\|EXPUNGE\) \/\.test\(args\)/g, vezes: 1 },
  { nome: "comando UID COPY (um UID, pasta validada, servidor sem MOVE)", re: new RegExp('" COPY " \\+ ' + ID + ' \\+ \' "\' \\+ ' + ID + " \\+ '\"'", "g"), vezes: 1 },
  { nome: "comando UID STORE +FLAGS (\\Deleted) (um UID, só depois da cópia confirmada)", re: new RegExp('" STORE " \\+ ' + ID + ' \\+ " \\+FLAGS \\(\\\\\\\\Deleted\\)"', "g"), vezes: 1 },
  { nome: "comando UID EXPUNGE (um UID, só com UIDPLUS)", re: new RegExp('" EXPUNGE " \\+ ' + ID, "g"), vezes: 1 },
  { nome: "busca da cópia pelo Message-ID", re: new RegExp("' SEARCH HEADER Message-ID \"' \\+ " + ID + " \\+ '\"'", "g"), vezes: 1 },
  { nome: "leitura da flag \\deleted (nunca comando)", re: /\.includes\("\\\\deleted"\)/g, vezes: 4 },
  { nome: "portão do UID EXPUNGE (UIDPLUS anunciado depois do login)", re: /ctx\.capDepois\.includes\("UIDPLUS"\)\) \{/g, vezes: 1 },
  { nome: "comando UID STORE de marcar_lida", re: new RegExp('" STORE " \\+ ' + ID + ' \\+ " " \\+ \\(' + ID + ' \\? "\\+" : "-"\\) \\+ "FLAGS \\(\\\\\\\\Seen\\)"', "g"), vezes: 1 },
  { nome: "comando UID MOVE de mover_mensagem", re: new RegExp('" MOVE " \\+ ' + ID + " \\+ ' \"' \\+ " + ID + " \\+ '\"'", "g"), vezes: 1 },
  { nome: "SELECT na lista fechada de gerenciamento", re: /verbo === "SELECT"/g, vezes: 1 },
  { nome: "SELECT na abertura controlada de pasta", re: /executarComando\(ctx, "SELECT", ' "' \+ conferirPasta\(/g, vezes: 1 },
  { nome: "portão da capacidade (sem saber o que o servidor anuncia, nada se altera)", re: /!Array\.isArray\(ctx\.capDepois\)\) throw new ErroImap\("acao_indisponivel"\)/g, vezes: 1 },
  { nome: "decisão MOVE × cópia (MOVE anunciado depois do login)", re: /const semMove = !ctx\.capDepois\.includes\("MOVE"\);/g, vezes: 1 },
  { nome: "relato das capacidades (somente leitura)", re: /\.includes\("MOVE"\)/g, vezes: 1 },   // o que sobra depois do portão: o campo "mover" da operação capacidades
  { nome: "contagem das respostas EXPUNGE do MOVE (leitura de resposta, não comando)", re: /\/\^\\\* \\d\{1,10\} EXPUNGE\$\/i/g, vezes: 1 },
];

export function inspecionarVerbos(texto) {
  const problemas = [];
  // 1. proibidos em qualquer forma (literal entre aspas, comando por extenso, flag)
  for (const v of SEMPRE_PROIBIDOS) {
    // padrões: literal exato, "UID <verbo>" ou argumento IMAP que começa por espaço + verbo
    if (v === "EXPUNGE" || v === "COPY") continue;   // tratados abaixo: só existem nas formas autorizadas (UID COPY/UID EXPUNGE de UM UID, sem MOVE) e na contagem de respostas
    if (new RegExp("[\"'`]" + v + "[\"'`]|\\bUID " + v + "\\b|[\"'`] " + v + "\\b").test(texto)) problemas.push("verbo proibido no pacote: " + v);
  }
  if (/FLAGS\.SILENT/i.test(texto)) problemas.push("FLAGS.SILENT aparece no pacote");
  // 2. trechos autorizados: cada um nas formas exatas e na quantidade esperada; depois de contados são retirados
  let resto = texto;
  for (const a of AUTORIZADOS) {
    const n = (resto.match(a.re) || []).length;
    if (n !== a.vezes) problemas.push("trecho autorizado ausente ou duplicado (" + n + " em vez de " + a.vezes + "): " + a.nome);
    resto = resto.replace(a.re, " ");
  }
  // 3. o que sobrar não pode conter nenhum verbo que altera a caixa nem comando de flag fora da forma autorizada
  if (/\bEXPUNGE\b/.test(resto)) problemas.push("EXPUNGE fora da contagem de respostas e do UID EXPUNGE de UM UID (comando de expurgo)");
  if (/\bCOPY\b/.test(resto)) problemas.push("COPY fora do UID COPY restrito (um UID, pasta validada, servidor sem MOVE)");
  if (/\\+Deleted/i.test(resto)) problemas.push("a flag \\Deleted fora do fluxo cópia confirmada + marca de UM UID");
  for (const [v, rot] of [["STORE", "STORE fora do UID STORE restrito a \\Seen"], ["MOVE", "MOVE fora do UID MOVE restrito (um UID, pasta validada, MOVE anunciado)"], ["SELECT", "SELECT fora da abertura controlada de pasta"]]) {
    if (new RegExp("\\b" + v + "\\b").test(resto)) problemas.push(rot);
  }
  if (/[+-]?FLAGS\s*\\?\(/.test(resto)) problemas.push("comando de FLAGS fora da forma autorizada (+/-FLAGS (\\Seen) de um UID)");
  return [...new Set(problemas)];
}

// CLI: node inspecionar-verbos.mjs <bundle>   → 0 = ok; 1 = problemas (linhas ::error:: do GitHub Actions)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arq = process.argv[2];
  if (!arq) { console.error("uso: node inspecionar-verbos.mjs <pacote.js>"); process.exit(2); }
  const p = inspecionarVerbos(fs.readFileSync(arq, "utf8"));
  if (p.length) { for (const x of p) console.log("::error::O pacote viola a política de comandos IMAP: " + x); process.exit(1); }
  console.log("Política de comandos IMAP conferida: SELECT (abertura controlada), UID STORE de \\Seen, UID MOVE restrito e, só sem MOVE, UID COPY + UID STORE \\Deleted + UID EXPUNGE de UM UID (UIDPLUS); nenhum EXPUNGE global, APPEND, DELETE, RENAME, SUBSCRIBE, IDLE, AUTHENTICATE, CLOSE nem \\Deleted fora desse fluxo.");
}
