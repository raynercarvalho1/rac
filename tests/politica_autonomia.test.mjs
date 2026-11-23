// Política Permanente de Autonomia Operacional (23/11/2026): o CLAUDE.md, o RAC Knowledge e as decisões dizem a mesma coisa, e nenhuma regra antiga que exija
// autorização intermediária sobrevive. Sem rede e sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const claude = ler("CLAUDE.md"), dec = ler("docs/planejamento/07-decisoes-e-pendencias.md");
const regra = (n) => ler("docs/conhecimento/registros/regra/" + n + ".md");

test("CLAUDE.md: a política está no topo das autorizações, com a regra principal, a matriz livre, a proibição de interromper e o relatório obrigatório", () => {
  assert.match(claude, /## POLÍTICA PERMANENTE DE AUTONOMIA OPERACIONAL/);
  assert.ok(claude.indexOf("POLÍTICA PERMANENTE DE AUTONOMIA OPERACIONAL") < claude.indexOf("PROTOCOLO PERMANENTE DE TRABALHO E AUTONOMIA"), "antes do protocolo");
  for (const t of [/Recebeu a tarefa, resolva/, /não pede autorização a cada etapa/, /criar e aplicar migrations e executar SQL em produção/, /criar, alterar e publicar Edge Functions \(inclusive a `garmin`\)/,
    /Proibido interromper/, /Relatório obrigatório ao final/, /Nunca afirmar que algo foi publicado, integrado ou concluído sem verificar/, /impossibilidade real/, /sem simular a execução/, /Segredos\*\* nunca vão a código público/])
    assert.match(claude, t, String(t));
});

test("CLAUDE.md: nenhuma regra antiga exige autorização intermediária", () => {
  const PROIBIDAS = [/sem autorização explícita/i, /só com pedido explícito/i, /Continua pedindo autorização/, /é intocável/i, /confirmação manual a cada chamada/, /Só segue o passo que o dono autorizar/, /para antes de commit/,
    /o dono republica a função/, /O dono roda no SQL Editor/, /Merge e publicação só quando/, /mescla quando:/, /continuam negados/, /pede autorização para cada/i, /Edge Function: o dono/];
  for (const r of PROIBIDAS) assert.ok(!r.test(claude), "regra antiga ainda no CLAUDE.md: " + r);
  assert.ok(/Pedir \(ask\): vazio/.test(claude));
});

test("RAC Knowledge: os registros de regra refletem a política (nada que exija autorização prévia)", () => {
  assert.match(regra("autorizacoes-do-dono"), /recebeu a tarefa, resolva/i); assert.match(regra("autorizacoes-do-dono"), /Proibido interromper/); assert.match(regra("autorizacoes-do-dono"), /Relatório obrigatório/);
  assert.match(regra("a-funcao-garmin-e-intocavel"), /deixou de ser intocável/); assert.match(regra("git-na-nuvem"), /PR/); assert.ok(!/Sem force push, `reset --hard`/.test(regra("git-na-nuvem")));
  assert.ok(!/sem confirmar o resultado|sem o dono pedir\./.test(regra("documentar-ao-concluir-o-lote") + regra("fernanda-papel-casa")));
  const dir = new URL("../docs/conhecimento/registros/regra/", import.meta.url);
  for (const f of fs.readdirSync(dir)) assert.ok(!/sem autorização explícita|só com pedido explícito|é intocável/i.test(fs.readFileSync(new URL(f, dir), "utf8")), "regra antiga no registro " + f);
});

test("decisões: a política consta em 07-decisoes e as autorizações antigas ficam marcadas como superadas", () => {
  assert.match(dec, /\| 23\/11\/2026 \| \*\*POLÍTICA PERMANENTE DE AUTONOMIA OPERACIONAL\*\*/);
  assert.match(dec, /SUPERADA em 23\/11\/2026 pela política acima/);
  assert.match(ler("docs/nuvem.md"), /política de autonomia/);
});

test("configuração efetiva: .claude/settings.json sem ask, com Bash liberado, e a CLI do Supabase e o merge deixaram de ser negados ou pedidos", () => {
  const P = JSON.parse(ler(".claude/settings.json")).permissions;
  assert.deepEqual(P.ask, []); assert.ok(P.allow.includes("Bash"));
  for (const r of ["Bash(supabase *)", "Bash(psql *)", "Bash(git reset *)", "Bash(git rebase *)", "Bash(gh pr merge *)", "Bash(gh api *)"]) assert.ok(P.allow.includes(r), r);
  assert.match(ler(".mcp.json"), /features=[^"]*functions/);
});

test("nenhum documento de governança manda o agente esperar o dono para commit, push, PR, merge, SQL ou publicação", () => {
  const alvo = ["CLAUDE.md", "docs/nuvem.md"];
  for (const f of alvo) assert.ok(!/(pede|peça|aguarde|espere)[^.\n]{0,40}(autorização|aprovação)[^.\n]{0,40}(do dono|do proprietário)/i.test(ler(f).replace(/\*\*Proibido interromper\*\*[^\n]*/g, "")), f);
});
