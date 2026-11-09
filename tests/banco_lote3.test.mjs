// Lote 3 · migrations 030 (compras multiorigem + compras_gravar), 031 (reembolsos) e 032 (Central Fiscal).
// PARTE 1 (sempre roda, sem banco): estrutura do SQL, segurança escrita no arquivo, e igualdade entre os valores permitidos no SQL e os do núcleo.
// PARTE 2 (precisa do PGlite, o Postgres que roda dentro do Node): o SQL de verdade, com o ambiente do Supabase imitado (papéis, auth, casa, MFA).
//   O PGlite não é dependência do site: no GitHub vem do testes.yml; aqui, com RAC_PGLITE=<caminho do pacote>. Sem ele, a parte 2 fica ignorada.
// Nada disto fala com o Supabase. Todos os dados abaixo são fictícios.
//
// FIDELIDADE da PARTE 2 (o que cada teste realmente prova — o PGlite NÃO é um Supabase):
//  • É Postgres de verdade (o mesmo motor de SQL, constraints, gatilhos, funções plpgsql, índices únicos, vistas, RLS e privilégios): o SQL real dos arquivos
//    025, 026, 030, 031, 032 e 033 é executado sem alteração, e as funções dono_da_casa() (002) e rac_aal_ok() (022) são copiadas do TEXTO real desses arquivos.
//  • SIMULADO pelo teste (não vem do Supabase): os papéis anon/authenticated/service_role e os privilégios PADRÃO que o Supabase dá a eles; auth.users e
//    auth.mfa_factors (tabelas mínimas); auth.jwt()/auth.uid() lendo o claim de set_config (no Supabase vêm do JWT validado pelo GoTrue); o claim "aal"
//    (no Supabase o aal2 só é emitido depois do código TOTP); storage.buckets/storage.objects (tabelas mínimas SEM políticas); notas, pedidos e registros (só o id).
//  • Portanto: provado aqui = a lógica das migrations e o RLS/privilégios/MFA escritos nelas, dado um JWT e uma tabela de fatores como os do teste.
//    NÃO provado aqui (continua pendente de validação específica no Supabase real): emissão e verificação do JWT/aal2, as políticas do Storage e do bucket
//    "familia", os privilégios padrão reais do projeto, o cadastro de usuários do Auth, a versão do Postgres de produção, PostgREST (RPC/vistas via API),
//    e CONCORRÊNCIA real (o PGlite tem uma conexão só: as confirmações simultâneas são testadas em sequência).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const S30 = ler("supabase/030_compras_multiorigem.sql"), S31 = ler("supabase/031_compras_reembolsos.sql"), S32 = ler("supabase/032_central_fiscal.sql"), S33 = ler("supabase/033_seguranca_compras_fiscal.sql");
const C30 = semComent(S30), C31 = semComent(S31), C32 = semComent(S32), C33 = semComent(S33);
const NOVAS = ["compras_importacoes", "compras_reembolsos", "compras_reembolsos_estornos", "notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs", "notas_fiscais_vinculos"];
const lista = (txt) => [...txt.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
const dentro = (txt, re) => { const m = re.exec(txt); assert.ok(m, "não achou " + re); return lista(m[1]); };

// ================= PARTE 1 · estrutura =================
test("SQL: sintaxe básica conferida à mão (parênteses, aspas, $$, begin/commit) — não substitui rodar no Postgres", () => {
  for (const [nome, sql] of [["030", C30], ["031", C31], ["032", C32], ["033", C33]]) {
    const sem = sql.replace(/'(?:[^']|'')*'/g, "''");     // sem o conteúdo das aspas simples
    assert.equal((sem.match(/\(/g) || []).length, (sem.match(/\)/g) || []).length, nome + ": parênteses desbalanceados");
    assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, nome + ": $$ desbalanceado");
    assert.equal((sql.match(/'/g) || []).length % 2, 0, nome + ": aspas desbalanceadas");
    assert.match(sql, /^\s*begin;/m); assert.match(sql, /^commit;/m); assert.match(sql, /notify pgrst, 'reload schema';\s*$/);
    for (const m of sql.matchAll(/create or replace function [\w.]+\([^)]*\)[\s\S]*?\$\$;?/g)) assert.ok(/language/.test(m[0]), nome + ": função sem language");
    const aberturas = (sql.match(/\bas \$\$/g) || []).length, fechos = (sql.match(/end \$\$;|\$\$;/g) || []).length;
    assert.ok(fechos >= aberturas, nome + ": função sem fechamento");
  }
});
test("SQL: pode rodar de novo (idempotente) e não altera nem apaga dados existentes", () => {
  for (const [nome, sql] of [["030", C30], ["031", C31], ["032", C32], ["033", C33]]) {
    for (const m of sql.matchAll(/create table (?!if not exists)/g)) assert.fail(nome + ": create table sem if not exists");
    for (const m of sql.matchAll(/create (unique )?index (?!if not exists)/g)) assert.fail(nome + ": índice sem if not exists");
    assert.ok(!/^\s*(drop table|truncate|delete from)\b/mi.test(sql.replace(/\$\$[\s\S]*?\$\$/g, "")), nome + ": apaga dados ou tabela");
    assert.ok(!/^update\b/mi.test(sql.replace(/\$\$[\s\S]*?\$\$/g, "")), nome + ": UPDATE solto em dados existentes (só dentro de funções)");
    assert.ok(!/^insert into\b/mi.test(sql.replace(/\$\$[\s\S]*?\$\$/g, "")), nome + ": INSERT solto");
    for (const m of sql.matchAll(/create policy "([^"]+)" on (public\.\w+)/g)) assert.match(sql, new RegExp(`drop policy if exists "${m[1]}" on ${m[2].replace(".", "\\.")}`), `${nome}: política ${m[1]} de ${m[2]} sem drop antes`);
    for (const m of sql.matchAll(/create trigger (\w+) /g)) assert.match(sql, new RegExp(`drop trigger if exists ${m[1]} on`), nome + ": gatilho sem drop antes");
    assert.ok(!/create function/.test(sql), nome + ": use create or replace function");
  }
  /* o que o 030 faz nas tabelas existentes é só somar colunas e trocar constraints */
  assert.ok(!/alter table public\.compras_online\s+(drop|alter) column|rename/i.test(C30));
  assert.ok(!/\bdrop column\b/i.test(C30 + C31 + C32));
});
test("SQL: toda tabela nova tem RLS, a regra da casa, a trava da 2ª etapa (mfa), nada para anon", () => {
  const tabelas = { "030": ["compras_importacoes"], "031": ["compras_reembolsos", "compras_reembolsos_estornos"], "032": ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs", "notas_fiscais_vinculos"] };
  const sqls = { "030": C30, "031": C31, "032": C32 };
  for (const [n, ts] of Object.entries(tabelas)) for (const t of ts) {
    assert.match(sqls[n], new RegExp(`create table if not exists public\\.${t} `), t);
    assert.ok(new RegExp(`enable row level security`).test(sqls[n]), t + " sem RLS");
    assert.match(sqls[n], new RegExp(`(revoke all on [^;]*public\\.${t}[^;]* from anon[,;])`), t + " sem revoke de anon");
    assert.match(sqls[n], new RegExp(`grant select on [^;]*public\\.${t}[^;]* to service_role;`), t);
    assert.match(sqls[n], /as restrictive for all to authenticated\s+using \(\(select public\.rac_aal_ok\(\)\)\)/, n + " sem mfa");
    assert.match(sqls[n], /using \(user_id = public\.dono_da_casa\(\)\)/, n + " sem a regra da casa");
  }
  assert.match(C32, /foreach t in array array\['notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos'\] loop/);
  /* o 022 (histórico, já aplicado) não conhece as tabelas novas; quem as cobre é o 033, depois das migrations 030 a 032 */
  const o22 = ler("supabase/022_seguranca.sql");
  for (const t of Object.values(tabelas).flat()) {
    assert.ok(!o22.includes(`'${t}'`), t + ": o 022 não pode ser alterado");
    const lista33 = /foreach t in array array\[([^\]]*)\] loop/.exec(S33)[1], audit33 = /pessoais text\[\] := array\[([\s\S]*?)\];/.exec(S33)[1];
    assert.ok(lista33.includes(`'${t}'`) && audit33.includes(`'${t}'`), t + " precisa estar nas duas listas do 033 (trava e auditoria)");
    assert.ok(N.segDef(t), t + " fora do SEG_TABELAS");
  }
  assert.match(C31, /create or replace view public\.compras_creditos with \(security_invoker = true\)/); assert.match(C31, /revoke all on public\.compras_creditos, public\.compras_creditos_historico from anon, authenticated;/);
});
test("SQL: funções novas rodam como quem chamou (invoker), com search_path vazio, e só quem fez login executa; nenhuma é security definer", () => {
  for (const sql of [C30, C31, C32]) {
    assert.ok(!/security definer/i.test(sql));
    for (const m of sql.matchAll(/create or replace function (public\.\w+)\(([^)]*)\)[\s\S]*?as \$\$/g)) {
      assert.match(m[0], /set search_path = ''/, m[1] + " sem search_path vazio");
      assert.match(sql, new RegExp(`revoke all on function ${m[1].replace(".", "\\.")}\\([^)]*\\) from public, anon;`), m[1] + " sem revoke");
    }
  }
  assert.match(C30, /grant execute on function public\.compras_gravar\(jsonb, jsonb, jsonb, boolean\) to authenticated;/);
  assert.match(C31, /grant execute on function public\.reembolso_confirmar\(uuid, numeric, date\) to authenticated;/);
});
test("compras_gravar: valida dono, campos, pasta do documento e arquivo no cofre; não grava conteúdo bruto", () => {
  const g = C30.slice(C30.indexOf("create or replace function public.compras_gravar"));
  for (const re of [/public\.dono_da_casa\(\)/, /errcode = '42501'/, /campo não permitido na compra/, /campo não permitido no produto/, /campo não permitido no documento/, /fora da pasta desta compra/,
    /storage\.objects o where o\.bucket_id = 'familia' and o\.name/, /on conflict \(user_id, sha256\) do nothing/, /for update/, /docs_repetidos/, /v_pasta := v_casa::text \|\| '\/compras\/'/])
    assert.match(g, re);
  for (const campo of ["user_id", "criado_por", "criado_em", "versoes", "atualizado_em"]) assert.ok(!new RegExp(`campos constant text\\[\\] := array\\[[^\\]]*'${campo}'`).test(g), campo + " não pode ser mandado pelo site");
  assert.ok(!/raise (notice|log|warning)/i.test(g), "nada vai para log");
  assert.ok(!/campos_doc constant text\[\] := array\[[^\]]*'(conteudo|dados|base64|blob|texto)'/.test(g), "o conteúdo do arquivo não passa pela função");
});
test("valores permitidos no SQL = os do núcleo (uma só fonte da verdade)", () => {
  assert.deepEqual(dentro(C30, /compras_online_canal_check\s+check \(canal is null or canal in \(([^)]*)\)\)/), Object.keys(N.CO_CANAIS));
  assert.deepEqual(dentro(C31, /canal\s+text not null check \(canal in \(([^)]*)\)\)/), Object.keys(N.CO_CANAIS));
  assert.deepEqual(dentro(C31, /estado\s+text not null default 'solicitado' check \(estado in \(([^)]*)\)\)/), Object.keys(N.CO_REEMB_ESTADOS));
  assert.deepEqual(dentro(C32, /modelo\s+text not null check \(modelo in \(([^)]*)\)\)/), Object.keys(N.NF_MODELOS));
  assert.deepEqual(dentro(C32, /situacao\s+text not null default 'pendente' check \(situacao in \(([^)]*)\)\)/), Object.keys(N.NF_SITUACOES));
  assert.deepEqual(dentro(C32, /modulo\s+text not null check \(modulo in \(([^)]*)\)\)/), Object.keys(N.NF_MODULOS));
  assert.deepEqual(dentro(C32, /formato_origem\s+text not null check \(formato_origem in \(([^)]*)\)\)/), Object.keys(N.NF_FORMATOS));
  assert.deepEqual(dentro(C32, /unidade\s+text not null default 'un' check \(unidade in \(([^)]*)\)\)/), [...Object.keys(JSON.parse(JSON.stringify(unidades()))), "outra"]);
  /* natureza do item e situação do item = o que o leitor da Amazon produz */
  assert.deepEqual(dentro(C30, /compras_online_itens_natureza_check check \(natureza is null or natureza in \(([^)]*)\)\)/), ["fisica", "digital", "indefinida"]);
  assert.deepEqual(dentro(C30, /compras_online_itens_situacao_check\s+check \(situacao is null or situacao in \(([^)]*)\)\)/), ["concluido", "autorizado", "cancelado", "desconhecido"]);
  assert.deepEqual(dentro(C30, /compras_online_natureza_check\s+check \(natureza is null or natureza in \(([^)]*)\)\)/), ["fisica", "digital", "mista", "indefinida"]);
  /* os tipos de documento de compras_gravar = os que o 026 aceita e os que o site usa */
  const tiposRpc = dentro(C30, /tipos_doc constant text\[\] := array\[([^\]]*)\]/), tiposTabela = dentro(semComent(ler("supabase/026_compras_emails.sql")), /check \(tipo in \(([^)]*)\)\)/);
  assert.deepEqual(tiposRpc, tiposTabela);
  assert.deepEqual(tiposRpc, [...ler("nucleo.js").match(/CO_DOC_TIPOS=\[([^\]]*)\]/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  /* a origem nova existe e o leitor da Amazon a usa */
  assert.ok(dentro(C30, /compras_online_origem_check\s+check \(origem in \(([^)]*)\)\)/).includes("historico_amazon"));
  assert.equal(N.amLerHistorico("Order ID,Order Date,Total Amount,Product Name\n701-1-2222222,2023-01-01T00:00:00Z,1.00,X\n").pedidos[0].origem, "historico_amazon");
});
function unidades() { const o = {}; for (const k of ["un", "pc", "cx", "pct", "par", "kg", "g", "l", "ml", "m"]) o[k] = 1; return o; }
test("unidades do SQL cobrem todas as que o núcleo fiscal reconhece", () => {
  for (const u of ["un", "und", "UNID", "pc", "cx", "pct", "par", "kg", "Quilograma", "g", "Grama", "l", "Litro", "ml", "Mililitro", "m"]) assert.ok(Object.keys(unidades()).includes(N.nfUnidade(u).cod), u);
});
test("030: registros antigos — nada é preenchido por UPDATE e as colunas novas nascem neutras (sem canal, histórico falso)", () => {
  assert.match(C30, /add column if not exists canal text;/); assert.match(C30, /add column if not exists historico boolean not null default false;/);
  assert.ok(!/add column[^;]*\bnatureza text not null/.test(C30) && !/add column if not exists canal text not null/.test(C30));
  assert.ok(!/visivel_casa/i.test(C30 + C31 + C32), "a visibilidade da família continua pendente: nenhuma coluna de visibilidade");
  assert.match(C30, /constraint compras_online_historico_ok check \(not historico or coalesce\(canal = 'amazon' and natureza is not null, false\)\)/);
  assert.match(C30, /new\.origem := old\.origem; new\.historico := old\.historico; new\.importacao_id := old\.importacao_id;/);
  assert.equal(N.coCanalDe({ loja: "amazon" }), "amazon", "o núcleo continua deduzindo o canal pela loja quando a coluna está vazia");
  assert.equal(N.coClassificar({ loja: "amazon", total_pago: 95 }).tratamento, "despesa", "sem a marca de histórico, o tratamento financeiro é o de sempre");
});
test("031: regras financeiras escritas no banco (soma limitada, trava da compra, recebido definitivo, vínculo preservado, sem segunda tabela de crédito)", () => {
  assert.match(C31, /select \* into v_c from public\.compras_online where id = new\.compra_id for update;/);
  assert.match(C31, /v_outros \+ new\.valor_recebido > v_c\.total_pago/);
  assert.match(C31, /compra_id\s+uuid not null references public\.compras_online\(id\),/, "sem cascade: a compra não some enquanto houver reembolso");
  assert.match(C31, /um reembolso recebido e confirmado não muda/); assert.match(C31, /não se apaga/);
  assert.match(C31, /constraint compras_reembolsos_recebido_valor check \(\(estado = 'recebido'\) = \(valor_recebido is not null\)\)/);
  assert.match(C31, /create unique index if not exists compras_reembolsos_referencia_unica/);
  assert.match(C31, /date_trunc\('month', r\.recebido_em\)::date as mes/); assert.match(C31, /where r\.estado = 'recebido'/);
  assert.ok(!/create table if not exists public\.compras_creditos/.test(C31), "crédito é vista, não tabela");
  assert.ok(!/(insert into|update) public\.(compras_online|pedidos|notas|registros)\b/.test(C31.replace(/select[\s\S]*?;/g, "")), "reembolso não lança em nenhuma tabela de gastos");
});
test("032: sem CPF nem dado do consumidor, vínculo nunca gera despesa, situação só com evidência, sem IA", () => {
  const colunas = [...C32.matchAll(/^\s{2}([a-z_0-9]+)\s+(?:uuid|text|date|smallint|numeric|jsonb|boolean|bigint|integer|timestamptz)/gm)].map((m) => m[1]);
  assert.ok(colunas.length > 40);
  assert.deepEqual(colunas.filter((c) => /cpf|consumidor|destinat|cliente|comprador|telefone|email|endereco|cartao|cvv|senha/i.test(c)), []);
  assert.match(C32, /gera_despesa\s+boolean not null default false check \(gera_despesa = false\)/);
  assert.match(C32, /tipo\s+text not null default 'conferencia' check \(tipo = 'conferencia'\)/);
  assert.match(C32, /create unique index if not exists notas_fiscais_vinculo_unico on public\.notas_fiscais_vinculos \(user_id, nota_id, modulo, registro_id\)/);
  assert.match(C32, /situacao <> 'autorizada' or protocolo is not null/); assert.match(C32, /situacao <> 'contingencia' or protocolo is null/);
  assert.match(C32, /nota % não documenta compra/); assert.match(C32, /update public\.notas_fiscais_vinculos set valido = false/);
  assert.match(C32, /pagamentos::text !~ '\\d\{13,\}'/);
  assert.ok(!/\b(ia_config|ia_uso|ia_cobranca|ia_custos|rac-ia|racIA)\b/.test(C32), "a Central Fiscal não toca na IA paga");
  assert.ok(!/(insert into|update|delete from) public\.(compras_online|compras_online_itens|pedidos|pedido_itens|notas|itens|registros|compras_reembolsos)\b/.test(C32), "a nota não escreve em nenhuma tabela de gastos");
});
test("Garmin, Edge Functions e configurações do projeto intocados; backup do site cobre as tabelas novas", () => {
  for (const s of [S30, S31, S32]) assert.ok(!/garmin|functions\/v1|cron\./i.test(semComent(s)), "as migrations não mexem na Garmin nem em agendamentos");
  assert.ok(!/functions\/v1|cron\.|garmin_dia[^,]*garmin_ativ[^,]*,\s*'erros'\s*[^\]]*\]\s*loop/i.test(C33.replace(/pessoais text\[\][\s\S]*?\];/, "")), "o 033 só cita as tabelas da Garmin na lista da auditoria; não mexe na função nem em agendamentos");
  const nomes = N.SEG_TABELAS.map((d) => d.t);
  for (const t of ["compras_importacoes", "compras_reembolsos", "notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs", "notas_fiscais_vinculos"]) assert.ok(nomes.includes(t), t);
  const ordem = (t) => nomes.indexOf(t);
  for (const d of N.SEG_TABELAS) for (const pai of Object.values(d.fk || {})) assert.ok(ordem(pai) >= 0 && ordem(pai) < ordem(d.t), `${pai} precisa vir antes de ${d.t}`);
  assert.match(ler("js/sistema.js"), /t==="compras_online_docs"\|\|t==="notas_fiscais_docs"/, "os originais das notas entram nos anexos do .zip");
});

// ================= Revisão corretiva do Lote 3 · estrutura =================
test("sequência de migrations: 022 original (sem as tabelas novas), 030, 031, 032 e 033 em ordem, cada uma declarando de quem depende", () => {
  const arqs = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const pos = (n) => arqs.findIndex((f) => f.startsWith(n));
  assert.ok(pos("022") < pos("030") && pos("030") < pos("031") && pos("031") < pos("032") && pos("032") < pos("033"));
  assert.ok(pos("033") < pos("034"), "a 034 (Lote B, Central Fiscal) vem depois da 033"); assert.ok(pos("034") < pos("035"), "a 035 (Lote 5.1: compras_anexar e foto) vem depois da 034"); assert.ok(pos("035") < pos("036"), "a 036 (Lote 1.4: IA fiscal, proposta) vem depois da 035"); assert.ok(pos("036") < pos("037"), "a 037 (Lote 1.5: foto/PDF, tentativas e histórico) vem depois da 036"); assert.ok(pos("037") < pos("038"), "a 038 (Lote 1.6: seguranca_estado com as tabelas da 037) vem depois da 037"); assert.ok(pos("038") < pos("039"), "a 039 (Lote 1.6: foto/PDF sem chave, só com a revisão do dono) vem depois da 038"); assert.ok(pos("039") < pos("040"), "a 040 (Lote 1.6: entrada da nota no Mercado) vem depois da 039"); assert.ok(pos("040") < pos("043"), "a 043 (Radar de Preços, Lote 1) vem depois da 040"); assert.equal(arqs[arqs.length - 1].slice(0, 3), "043");
  const o22 = ler("supabase/022_seguranca.sql");
  for (const t of NOVAS) assert.ok(!o22.includes(t), "022 intacto: " + t);
  assert.match(S30, /Rode depois do 026\/027/); assert.match(S31, /Rode depois do 030/); assert.match(S32, /Rode depois do 031/); assert.match(S33, /Rode DEPOIS delas e do 022/);
  assert.match(S33, /Ordem: 022 \(já aplicado\) → 030 → 031 → 032 → 033/); assert.match(S33, /Sempre que isso acontecer, rode este 033 em seguida/);
  assert.match(C33, /if to_regclass\('public\.' \|\| t\) is not null then/);
  /* 033: mesma função de auditoria do 022 (definer, search_path vazio, só quem entrou), com a lista ampliada e nada mais */
  assert.match(C33, /create or replace function public\.seguranca_estado\(\) returns jsonb\s+language plpgsql stable security definer set search_path = ''/);
  assert.match(C33, /revoke all on function public\.seguranca_estado\(\) from public, anon;/); assert.match(C33, /grant execute on function public\.seguranca_estado\(\) to authenticated;/);
  assert.ok(!/(create|alter|drop) table|insert into|update |delete from|storage\.|create policy "casa"/i.test(C33.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/format\('[^']*'/g, "")), "033 só trava e audita");
  assert.match(C33, /create policy "mfa" on public\.%I as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\) with check \(\(select public\.rac_aal_ok\(\)\)\)/);
});
test("status: o SQL aceita os antigos e os novos; histórico exige status explícito; e o núcleo trata cada um como esperado", () => {
  const vocab = dentro(C30, /compras_online_status_vocab\s+check \(status is null or status in \(([^)]*)\)\)/);
  assert.deepEqual(vocab.sort(), ["autorizado", "cancelado", "cancelamento_informado", "concluido", "desconhecido", "reembolso_informado"]);
  assert.match(C30, /compras_online_status_vocab[\s\S]*?not valid;/, "NOT VALID: as linhas antigas não são reexaminadas");
  assert.match(C30, /compras_online_historico_status\s+check \(not historico or coalesce\(status in \('concluido', 'autorizado', 'cancelado', 'desconhecido'\), false\)\)/);
  /* a 025 deixava o status livre (texto até 40): nada que já estava gravado fica fora do vocabulário */
  assert.match(semComent(ler("supabase/025_compras_online.sql")), /status\s+text check \(status is null or length\(status\) <= 40\)/);
  /* comportamento financeiro por status, com o MESMO registro */
  const base = { id: "x", data: "2026-10-03", loja: "amazon", total_pago: 95 };
  const entra = (status) => N.coDespesas([{ ...base, status }]).length === 1;
  for (const s of [null, undefined, "cancelamento_informado", "reembolso_informado", "concluido"]) assert.equal(entra(s), true, "antigo/efetivado entra: " + s);
  for (const s of ["autorizado", "desconhecido", "cancelado"]) assert.equal(entra(s), false, "fora das despesas: " + s);
  assert.equal(N.coClassificar({ ...base, status: "autorizado" }).tratamento, "pendente"); assert.equal(N.coClassificar({ ...base, status: "cancelado" }).tratamento, "cancelado");
  for (const hist of [{ status: "desconhecido" }, { status: null }, { status: "autorizado" }]) assert.notEqual(N.coClassificar({ ...base, canal: "amazon", natureza: "digital", historico: true, ...hist }).tratamento, "despesa_digital", "histórico não efetivado nunca vira despesa");
  assert.equal(N.coClassificar({ ...base, canal: "amazon", natureza: "digital", historico: true, status: "concluido" }).tratamento, "despesa_digital");
  /* o que o leitor da Amazon grava é exatamente o que o SQL aceita no item e no pedido */
  const p = N.amLerHistorico("Order ID,Order Date,Total Amount,Product Name,Order Status,Shipping Option\n701-1-2222222,2023-01-01T00:00:00Z,1.00,X,Closed,Digital\n701-2-2222222,2023-01-01T00:00:00Z,1.00,X,Authorized,Digital\n701-3-2222222,2023-01-01T00:00:00Z,1.00,X,Mistério,Digital\n701-4-2222222,2023-01-01T00:00:00Z,1.00,X,Cancelled,Digital\n").pedidos;
  assert.deepEqual(p.map((x) => x.status_norm), ["concluido", "autorizado", "desconhecido", "cancelado"]);
  for (const x of p) assert.ok(vocab.includes(x.status_norm));
  assert.deepEqual(p.map((x) => N.coDespesas([x]).length), [1, 0, 0, 0]);
});
test("estorno (031): auditável, único, só acrescenta, devolve o valor ao limite e tira o crédito do resultado", () => {
  assert.match(C31, /create table if not exists public\.compras_reembolsos_estornos/);
  for (const re of [/reembolso_id\s+uuid not null references public\.compras_reembolsos\(id\),/, /valor\s+numeric\(12,2\) not null check \(valor > 0\)/, /mes_credito\s+date not null/,
    /motivo\s+text not null check \(length\(btrim\(motivo\)\) between 5 and 200\)/, /estornado_por\s+uuid references auth\.users\(id\)/, /estornado_em\s+timestamptz not null default now\(\)/,
    /constraint compras_reembolsos_estornos_unico unique \(reembolso_id\)/, /o histórico de estornos só acrescenta/, /new\.valor := v_r\.valor_recebido; new\.mes_credito :=/,
    /create or replace function public\.reembolso_estornar\(p_id uuid, p_motivo text\)/, /grant execute on function public\.reembolso_estornar\(uuid, text\) to authenticated;/,
    /revoke all on public\.compras_reembolsos_estornos from anon, authenticated;\s+grant select, insert on public\.compras_reembolsos_estornos to authenticated;/,
    /and not exists \(select 1 from public\.compras_reembolsos_estornos e where e\.reembolso_id = r\.id\);\s+create or replace view public\.compras_creditos_historico/, /this recebimento foi estornado|este recebimento foi estornado/])
    assert.match(C31, re);
  assert.ok(!/grant[^;]*(update|delete)[^;]*compras_reembolsos_estornos/i.test(C31), "o site não tem update/delete nos estornos");
  assert.match(C31, /um reembolso recebido e confirmado não muda/, "continua sem edição direta de recebido");
  assert.match(C31, /create trigger compras_reembolsos_estornos_regras before insert or update or delete/);
});
test("o núcleo não conta como crédito um recebimento estornado", () => {
  const compra = { id: "c1", loja: "amazon", numero: "701-1-1", total_pago: 100 };
  const rb = { id: "r1", numero: "701-1-1", valor: 100, estado: "recebido", recebido_confirmado: true, recebido_em: "2026-11-04" };
  assert.equal(N.coReembCreditos([rb], [compra]).creditos.length, 1);
  const e = N.coReembCreditos([{ ...rb, estornado: true }], [compra]); assert.equal(e.creditos.length, 0); assert.match(e.sem_credito[0].motivo, /estornado/);
  assert.equal(N.coReembCreditos([{ ...rb, estornado_em: "2026-11-05T10:00:00Z" }], [compra]).creditos.length, 0);
});
test("tabelas novas no backup do site, com os pais antes; anexos fiscais incluídos; backup do servidor (Garmin) fora desta mudança", () => {
  const nomes = N.SEG_TABELAS.map((d) => d.t);
  for (const t of NOVAS) assert.ok(nomes.includes(t), t + " em SEG_TABELAS");
  assert.deepEqual(N.segDef("compras_reembolsos_estornos").fk, { reembolso_id: "compras_reembolsos", compra_id: "compras_online" });
  assert.match(ler("js/sistema.js"), /t==="compras_online_docs"\|\|t==="notas_fiscais_docs"/);
  const g = ler("supabase/functions/garmin/index.ts"); assert.ok(!/notas_fiscais|compras_reembolsos|compras_importacoes/.test(g), "o backup semanal do servidor segue sem as tabelas novas");
  for (const d of N.SEG_TABELAS) for (const pai of Object.values(d.fk || {})) assert.ok(nomes.indexOf(pai) >= 0 && nomes.indexOf(pai) < nomes.indexOf(d.t), `${pai} antes de ${d.t}`);
});
test("documentação: vista de créditos, estorno, limitação do backup semanal e consultas do Painel/Hoje", () => {
  const dc = ler("docs/compras.md"), df = ler("docs/fiscal.md");
  for (const re of [/compras_creditos/, /mês de recebimento|mês do recebimento/, /parcial/i, /estorn/i, /compras_creditos_historico/, /único.*soma|única consulta/i, /Painel e Hoje|Painel\/Hoje|Hoje.*Painel/, /canal.*natureza.*historico|`canal`, `natureza`, `historico`/])
    assert.match(dc, re);
  assert.match(df, /backup semanal do servidor/); assert.match(dc + df, /033/);
});

// ================= Revisão final de segurança · estrutura (NÃO prova a segurança: isso depende de rodar os testes de banco) =================
test("vistas de créditos: security_invoker, só SELECT para quem entrou, nada para anon, sem política em vista, e as tabelas de baixo é que têm RLS e a trava da 2ª etapa", () => {
  for (const v of ["compras_creditos", "compras_creditos_historico"]) {
    assert.match(C31, new RegExp(`create or replace view public\\.${v} with \\(security_invoker = true\\) as`), v + " sem security_invoker");
    assert.ok(!new RegExp(`create policy [^;]* on public\\.${v}\\b`).test(C31 + C33), "política direta em vista comum não funciona: " + v);
    assert.match(C33, new RegExp(`'${v}'`), v + " tratada no 033");
  }
  assert.match(C31, /revoke all on public\.compras_creditos, public\.compras_creditos_historico from anon, authenticated;\s+grant select on public\.compras_creditos, public\.compras_creditos_historico to authenticated, service_role;/);
  assert.match(C33, /alter view public\.%I set \(security_invoker = true\)/); assert.match(C33, /revoke all on public\.%I from anon, authenticated/); assert.match(C33, /grant select on public\.%I to authenticated, service_role/);
  /* guarda de versão: security_invoker exige PostgreSQL 15 (a 002, a 024 e a 029, já em produção, usam o mesmo recurso) */
  for (const s of [C31, C33]) assert.match(s, /current_setting\('server_version_num'\)::integer < 150000/);
  for (const a of ["002_casa_compartilhada", "024_alimentacao", "029_ia_monitor"]) assert.match(ler(`supabase/${a}.sql`), /security_invoker = true/);
  /* as vistas só leem tabelas com RLS casa + mfa */
  for (const tb of ["compras_reembolsos", "compras_reembolsos_estornos"]) {
    assert.match(C31, new RegExp(`alter table public\\.${tb} enable row level security;`));
    assert.match(C31, new RegExp(`create policy "mfa" on public\\.${tb} as restrictive for all to authenticated\\s+using \\(\\(select public\\.rac_aal_ok\\(\\)\\)\\)`));
  }
  assert.match(C31, /create policy "casa" on public\.compras_reembolsos for all to authenticated\s+using \(user_id = public\.dono_da_casa\(\)\)/);
  assert.match(C31, /create policy "casa le" on public\.compras_reembolsos_estornos for select to authenticated using \(user_id = public\.dono_da_casa\(\)\)/);
});
test("033: privilégios mínimos nas tabelas novas (sem anon; estornos só select/insert; sem TRUNCATE/REFERENCES/TRIGGER por padrão) e RLS + mfa reafirmados", () => {
  assert.match(C33, /execute format\('revoke all on public\.%I from anon, authenticated', t\);/);
  assert.match(C33, /if t = 'compras_reembolsos_estornos' then\s+execute format\('grant select, insert on public\.%I to authenticated', t\);/);
  assert.match(C33, /grant select, insert, update, delete on public\.%I to authenticated/);
  assert.match(C33, /execute format\('alter table public\.%I enable row level security', t\);/);
  assert.ok(!/grant[^;]*\b(truncate|references|trigger|all)\b[^;]*to (authenticated|anon)/i.test(C33 + C31.replace(/revoke[^;]*;/g, "")), "nenhum grant largo");
});
test("estornos e auditoria: imutáveis até para quem tem permissão total; responsáveis sem ON DELETE; recebido não muda nem nas observações; total pago não cai abaixo do reembolsado", () => {
  assert.match(C31, /if tg_op <> 'INSERT' then raise exception 'estorno: o histórico de estornos só acrescenta'/);
  assert.match(C31, /before insert or update or delete on public\.compras_reembolsos_estornos/);
  assert.match(C31, /confirmado_por\s+uuid references auth\.users\(id\),/); assert.match(C31, /estornado_por\s+uuid references auth\.users\(id\),/);
  assert.ok(!/(confirmado_por|estornado_por)\s+uuid references auth\.users\(id\) on delete/.test(C31), "apagar a conta de quem confirmou/estornou não reescreve a auditoria");
  assert.match(C31, /new\.referencia, new\.motivo, new\.observacoes,/); assert.match(C31, /old\.referencia, old\.motivo, old\.observacoes,/);
  assert.match(C31, /create trigger compras_online_limite_reembolsos before update of total_pago on public\.compras_online/);
  assert.match(C31, /o total pago \(%\) não pode ficar abaixo do que já foi reembolsado/);
  assert.ok(!/grant[^;]*(update|delete)[^;]*compras_reembolsos_estornos/i.test(C31 + C33.replace(/else[\s\S]*?end if;/, "")), "sem update/delete nos estornos");
});
test("compras_gravar: invoker, sem anon, validações de dono, campos protegidos, pasta e existência do arquivo", () => {
  assert.match(C30, /create or replace function public\.compras_gravar\(p_compra jsonb, p_itens jsonb, p_docs jsonb, p_novo boolean\)\s+returns jsonb language plpgsql security invoker set search_path = ''/);
  assert.match(C30, /revoke all on function public\.compras_gravar\(jsonb, jsonb, jsonb, boolean\) from public, anon;/);
  assert.match(C30, /if \(select auth\.uid\(\)\) is null or v_casa is null then raise exception 'compras_gravar: faça login' using errcode = '42501'/);
  assert.match(C30, /select \* into v_ant from public\.compras_online where id = v_id for update;\s+if not found then raise exception 'compras_gravar: compra não encontrada'/);
  assert.match(C30, /p_compra \? 'origem' and \(p_compra->>'origem'\) is distinct from v_ant\.origem/); assert.match(C30, /origem não muda na edição/); assert.match(C30, /historico não muda na edição/); assert.match(C30, /importacao_id não muda na edição/);
  assert.match(C30, /v_pasta := v_casa::text \|\| '\/compras\/' \|\| v_id::text \|\| '\/'/);
  assert.match(C30, /from storage\.objects o where o\.bucket_id = 'familia' and o\.name = \(v_i->>'path'\)/);
  assert.match(C30, /insert into public\.compras_online_docs \(user_id, compra_id,[^)]*\)\s+select v_casa, v_id,/, "o dono do documento vem da casa de quem chama, nunca do JSON");
});

// ================= PARTE 2 · Postgres de verdade (PGlite) =================
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;   // no GitHub (CI) nunca se pula: sem PGlite o teste FALHA em vez de ficar ignorado
test("no GitHub, o Postgres do teste (PGlite) está instalado", { skip: !process.env.CI }, () => assert.ok(PGlite, "PGlite não foi instalado no testes.yml"));
test("PGlite · versão do Postgres suporta security_invoker (15 ou mais)", { skip: pular }, async () => {
  const db = await PGlite.create();
  const v = (await db.query("select current_setting('server_version_num')::int as n, current_setting('server_version') as v")).rows[0];
  console.log("PGlite · versão do Postgres: " + v.v + " (" + v.n + ")");
  assert.ok(v.n >= 150000, "o PGlite instalado usa Postgres " + v.v + ", sem security_invoker");
  await db.exec("create table t1 (id int); create view v1 with (security_invoker = true) as select * from t1;");
  assert.match((await db.query("select reloptions::text as o from pg_class where relname = 'v1'")).rows[0].o, /security_invoker=true/);
  await db.close();
});

const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const C1 = "c0000000-0000-4000-8000-000000000001", C2 = "c0000000-0000-4000-8000-000000000002";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean default false, allowed_mime_types text[]);
    insert into storage.buckets (id, name, public) values ('familia', 'familia', false);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    grant select on storage.objects to authenticated;
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`
    insert into public.membros (membro, dono) values ('${F}', '${R}');
    create table public.notas (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.pedidos (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.registros (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
  `);
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal"]) await db.exec(ler(`supabase/${a}.sql`));
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };
const pasta = (id = C1) => `${R}/compras/${id}/`;
const compra = (o = {}) => ({ id: C1, loja: "amazon", canal: "amazon", natureza: "fisica", numero: "701-0000001-0000001", data: "2026-10-03", subtotal: 100, desconto: 5, frete: 0, taxas: 0, total_pago: 95, origem: "manual", ...o });
const itensOk = () => [{ descricao: "Ração Exemplo", qtd: 1, total: 100, total_linha: 95, natureza: "fisica", situacao: "concluido" }];
const doc = (n = 1, o = {}) => ({ tipo: "resumo_pdf", nome: `resumo${n}.pdf`, path: `${pasta()}arq${n}.pdf`, mime: "application/pdf", tamanho: 10, sha256: String(n).repeat(64).slice(0, 64), extraido: {}, ...o });
const noCofre = (db, ...paths) => db.query("insert into storage.objects (bucket_id, name) select 'familia', unnest($1::text[])", [paths]);
const gravar = (db, uid, c, i, d, novo, aal) => como(db, uid, "select public.compras_gravar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(c), i == null ? null : JSON.stringify(i), JSON.stringify(d), novo], aal).then((r) => r[0].r);
const contar = async (db, t) => +(await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n;

test("030 + compras_gravar: criar, editar e anexar numa operação só; erro no meio desfaz tudo; compra antiga intacta", { skip: pular }, async () => {
  const db = await banco();
  /* compra antiga, gravada como o site fazia (025): sem as colunas novas */
  await como(db, R, "insert into public.compras_online (loja, numero, data, subtotal, total_pago) values ('amazon', '1', '2026-01-01', 10, 10)");
  const antigo = (await como(db, R, "select canal, natureza, historico, importacao_id, impostos_info, origem, status from public.compras_online"))[0];
  assert.deepEqual(antigo, { canal: null, natureza: null, historico: false, importacao_id: null, impostos_info: null, origem: "manual", status: null });
  /* nova, com produtos e dois documentos */
  await noCofre(db, doc(1).path, doc(2).path);
  const r = await gravar(db, R, compra(), itensOk(), [doc(1), doc(2)], true);
  assert.deepEqual([r.criado, r.ja_existia, r.docs_gravados, r.docs_repetidos], [true, false, 2, []]);
  assert.equal(await contar(db, "compras_online_itens"), 1); assert.equal(await contar(db, "compras_online_docs"), 2);
  /* toque duplo */
  assert.equal((await gravar(db, R, compra(), itensOk(), [doc(1)], true)).ja_existia, true); assert.equal(await contar(db, "compras_online"), 2);
  /* arquivo que não está no cofre: nada é gravado */
  const e1 = await erro(gravar(db, R, compra({ id: C2, numero: "X2" }), itensOk(), [doc(3, { path: `${pasta(C2)}nao-existe.pdf` })], true));
  assert.match(e1.message, /não está no cofre|fora da pasta/); assert.equal(await contar(db, "compras_online"), 2);
  /* produto inválido na posição 2: a compra também não fica */
  const e2 = await erro(gravar(db, R, compra({ id: C2, numero: "X3" }), [...itensOk(), { descricao: "", total: 1 }], [], true));
  assert.match(e2.message, /falta o nome do produto 2/); assert.equal(await contar(db, "compras_online"), 2); assert.equal(await contar(db, "compras_online_itens"), 1);
  /* conta que não fecha: o CHECK do banco desfaz a transação inteira */
  const e3 = await erro(gravar(db, R, compra({ id: C2, numero: "X4", total_pago: 50 }), itensOk(), [], true));
  assert.match(e3.message, /compras_online_conta_fecha/); assert.equal(await contar(db, "compras_online"), 2);
  /* campo proibido, pasta alheia e documento repetido */
  assert.match((await erro(gravar(db, R, compra({ id: C2, numero: "X5", user_id: X }), itensOk(), [], true))).message, /campo não permitido na compra: user_id/);
  assert.match((await erro(gravar(db, R, compra({ id: C2, numero: "X6" }), itensOk(), [doc(4, { path: `${X}/compras/${C2}/a.pdf` })], true))).message, /fora da pasta/);
  await noCofre(db, `${pasta()}dup.pdf`);
  const rep = await gravar(db, R, { id: C1 }, null, [doc(9, { path: `${pasta()}dup.pdf`, sha256: doc(1).sha256 })], false);
  assert.deepEqual([rep.docs_gravados, rep.docs_repetidos], [0, [`${pasta()}dup.pdf`]], "mesmo SHA-256: nenhuma linha, e o arquivo repetido volta para o site apagar");
  /* edição: troca os produtos, guarda a versão anterior, não deixa mudar origem/histórico */
  await gravar(db, R, compra({ subtotal: 120, total_pago: 115 }), [{ descricao: "Outro", qtd: 2, total: 120 }], [], false);
  const ed = (await como(db, R, "select total_pago, jsonb_array_length(versoes) as v, (select count(*)::int from public.compras_online_itens where compra_id = $1) as n from public.compras_online where id = $1", [C1]))[0];
  assert.deepEqual([+ed.total_pago, ed.v, ed.n], [115, 1, 1]);
  assert.match((await erro(gravar(db, R, compra({ historico: true }), itensOk(), [], false))).message, /historico não muda na edição/);
  /* só documentos */
  await noCofre(db, doc(5).path);
  assert.equal((await gravar(db, R, { id: C1 }, null, [doc(5)], false)).docs_gravados, 1);
  assert.match((await erro(gravar(db, R, { id: C1, loja: "amazon" }, null, [], false))).message, /apenas o id/);
  await db.close();
});

test("030: quem é da casa edita; estranho não vê nem edita; sem login ou sem o código da 2ª etapa não grava", { skip: pular }, async () => {
  const db = await banco();
  await noCofre(db, doc(1).path);
  await gravar(db, R, compra(), itensOk(), [doc(1)], true);
  assert.equal((await gravar(db, F, compra({ subtotal: 110, total_pago: 105 }), itensOk(), [], false)).id, C1, "Fernanda (da casa) edita");
  assert.match((await erro(gravar(db, X, compra(), itensOk(), [], false))).message, /compra não encontrada/, "estranho não enxerga a compra");
  assert.match((await erro(gravar(db, null, compra({ id: C2 }), itensOk(), [], true))).message, /permission denied for function compras_gravar/, "anon não executa");
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.match((await erro(gravar(db, R, compra({ id: C2, numero: "M1" }), itensOk(), [], true, "aal1"))).message, /row-level security/, "com fator e sem o código, o banco recusa");
  assert.equal((await gravar(db, R, compra({ id: C2, numero: "M1" }), itensOk(), [], true, "aal2")).criado, true);
  await db.close();
});

test("030: valores permitidos, histórico só com Amazon e natureza, proteção de campos e controle de importações", { skip: pular }, async () => {
  const db = await banco();
  const ins = (campos, valores) => como(db, R, `insert into public.compras_online (loja, numero, data, subtotal, total_pago, ${campos}) values ('amazon', '${Math.random()}', '2026-01-01', 10, 10, ${valores})`);
  await ins("canal", "'amazon'"); await ins("canal, natureza, historico, origem, status", "'amazon', 'digital', true, 'historico_amazon', 'concluido'");
  for (const [c, v] of [["canal", "'ebay'"], ["canal", "'shopee'"], ["natureza", "'quimica'"], ["historico, canal", "true, 'amazon'"], ["historico, natureza", "true, 'fisica'"], ["origem", "'telepatia'"], ["impostos_info", "-1"]])
    assert.equal((await erro(ins(c, v))).code, "23514", c + " = " + v);
  await como(db, R, "insert into public.compras_online (loja, numero, data, subtotal, total_pago, canal) values ('outra', 'P1', '2026-01-01', 10, 10, 'presencial')");
  /* UPDATE direto não muda histórico/origem/importação */
  const id = (await como(db, R, "select id from public.compras_online where historico limit 1"))[0].id;
  await como(db, R, "update public.compras_online set historico = false, origem = 'manual' where id = $1", [id]);
  assert.deepEqual((await como(db, R, "select historico, origem from public.compras_online where id = $1", [id]))[0], { historico: true, origem: "historico_amazon" });
  /* importações */
  const imp = (o = {}) => como(db, R, "insert into public.compras_importacoes (origem, nome_logico, sha256, pedidos_processados, pedidos_gravados, registros_rejeitados, estado, resumo_erros) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id",
    [o.origem || "amazon_csv", o.nome || "Order History.csv", o.sha || "a".repeat(64), o.proc ?? 10, o.grav ?? 8, o.rej ?? 2, o.estado || "concluida_com_erros", JSON.stringify(o.erros || [{ linha: 3, motivo: "valor total ausente ou inválido" }])]);
  const ok = (await imp())[0].id;
  assert.equal((await erro(imp())).code, "23505", "o mesmo CSV sanitizado não entra duas vezes");
  for (const o of [{ sha: "b".repeat(64), nome: "C:\\Users\\x\\a.csv" }, { sha: "c".repeat(64), grav: 11 }, { sha: "d".repeat(64), estado: "quase" }, { sha: "e".repeat(64), erros: [{ linha: 1, motivo: "joao@example.com" }] },
    { sha: "f".repeat(64), erros: [{ linha: 1, motivo: "CPF 12345678909" }] }, { sha: "1".repeat(64), erros: [{ linha: 1, motivo: "ok", conteudo: "linha inteira" }] }, { sha: "2".repeat(64), erros: "texto" }])
    assert.equal((await erro(imp(o))).code, "23514");
  await gravar(db, R, compra({ origem: "historico_amazon", historico: true, status: "concluido", importacao_id: ok }), itensOk(), [], true);
  assert.match((await erro(gravar(db, R, compra({ id: C2, numero: "Z", origem: "historico_amazon", historico: true, status: "concluido", importacao_id: "99999999-9999-4999-8999-999999999999" }), itensOk(), [], true))).message, /importação não encontrada/);
  assert.equal((await como(db, X, "select count(*)::int as n from public.compras_importacoes"))[0].n, 0, "estranho não vê importações");
  await db.close();
});

/* ---- 031 ---- */
const insCompra = (db, id, total, data = "2026-10-03") => como(db, R, "insert into public.compras_online (id, loja, canal, numero, data, subtotal, total_pago) values ($1, 'amazon', 'amazon', $2, $3, $4, $4)", [id, "701-" + id.slice(-4), data, total]);
const reemb = (db, o = {}) => como(db, o.uid || R, "insert into public.compras_reembolsos (compra_id, estado, valor_solicitado, valor_aprovado, referencia) values ($1, $2, $3, $4, $5) returning id", [o.compra || C1, o.estado || "solicitado", o.sol ?? 50, o.apr ?? null, o.ref ?? null]).then((r) => r[0].id);
const confirmar = (db, id, valor, data, uid = R, aal) => como(db, uid, "select public.reembolso_confirmar($1, $2, $3) as r", [id, valor, data], aal).then((r) => r[0].r);
const creditos = (db, uid = R) => como(db, uid, "select reembolso_id, valor::float as valor, to_char(mes, 'YYYY-MM') as mes, canal, pedido_numero from public.compras_creditos order by recebido_em, valor");

test("031: solicitado e aprovado não geram crédito; recebido confirmado gera, no mês do recebimento", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 187);
  const a = await reemb(db), b = await reemb(db, { estado: "aprovado", apr: 40, sol: 60 });
  assert.deepEqual(await creditos(db), []);
  assert.equal((await como(db, R, "select canal, pedido_numero from public.compras_reembolsos where id = $1", [a]))[0].canal, "amazon", "canal e pedido vêm da compra");
  assert.deepEqual(await confirmar(db, b, 40, "2026-11-04"), { id: b, confirmado: true, ja_confirmado: false, mes: "2026-11" });
  const c = await creditos(db); assert.equal(c.length, 1); assert.deepEqual([c[0].valor, c[0].mes, c[0].reembolso_id], [40, "2026-11", b]);
  const conf = (await como(db, R, "select confirmado_por, confirmado_em is not null as em, estado from public.compras_reembolsos where id = $1", [b]))[0];
  assert.deepEqual([conf.confirmado_por, conf.em, conf.estado], [R, true, "recebido"], "quem confirmou e quando ficam gravados");
  assert.equal((await como(db, R, "select count(*)::int as n from public.compras_creditos where reembolso_id = $1", [a]))[0].n, 0, "o solicitado segue sem crédito");
  await db.close();
});
test("031: reembolso parcial e total; nunca passa do valor pago; repetir a confirmação não duplica; recebido é definitivo", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 187);
  const r1 = await reemb(db, { sol: 50 }), r2 = await reemb(db, { sol: 100 }), r3 = await reemb(db, { sol: 50 });
  await confirmar(db, r1, 50, "2026-10-15"); await confirmar(db, r2, 100, "2026-11-04");
  assert.deepEqual((await creditos(db)).map((c) => [c.valor, c.mes]), [[50, "2026-10"], [100, "2026-11"]], "cada crédito no seu mês");
  const ex = await erro(confirmar(db, r3, 50, "2026-11-05")); assert.equal(ex.code, "23514"); assert.match(ex.message, /passariam do valor pago/);
  assert.equal((await confirmar(db, r3, 37, "2026-11-05")).confirmado, true, "o que sobra (37) cabe");
  assert.equal((await confirmar(db, r1, 50, "2026-10-15")).ja_confirmado, true); assert.equal((await creditos(db)).length, 3, "repetir não cria outro crédito");
  assert.match((await erro(confirmar(db, r1, 51, "2026-10-15"))).message, /já foi confirmado com outro valor/);
  assert.match((await erro(como(db, R, "update public.compras_reembolsos set valor_recebido = 1 where id = $1", [r1]))).message, /não muda/);
  assert.match((await erro(como(db, R, "delete from public.compras_reembolsos where id = $1", [r1]))).message, /não se apaga/);
  assert.match((await erro(como(db, R, "update public.compras_reembolsos set observacoes = 'conferido' where id = $1", [r1]))).message, /não muda/, "nem as observações de um recebido mudam");
  await como(db, R, "update public.compras_reembolsos set valor_solicitado = valor_solicitado where id = $1", [r1]);   // UPDATE idêntico (restauração do backup) passa
  assert.equal((await erro(como(db, R, "delete from public.compras_online where id = $1", [C1]))).code, "23503", "a compra não some com reembolso ligado");
  await db.close();
});
test("031: duas confirmações seguidas do mesmo reembolso ou de reembolsos que juntos passam do valor pago geram um crédito só", { skip: pular }, async () => {
  /* O PGlite tem uma conexão só: aqui as chamadas são em sequência. A concorrência de verdade (duas conexões) depende de um Postgres real: a trava é
     o FOR UPDATE da compra no gatilho (conferido na parte 1) e a soma é refeita depois da trava. */
  const db = await banco(); await insCompra(db, C1, 100);
  const a = await reemb(db, { sol: 100 }), b = await reemb(db, { sol: 100 });
  const res = await Promise.allSettled([confirmar(db, a, 100, "2026-11-04"), confirmar(db, b, 100, "2026-11-04"), confirmar(db, a, 100, "2026-11-04")]);
  assert.equal(res.filter((x) => x.status === "fulfilled").length, 2, "a confirmação de b é recusada");
  assert.deepEqual((await creditos(db)).map((c) => c.valor), [100], "um crédito só");
  await db.close();
});
test("031: validações — data, referência repetida, recusado, confirmação por pessoa da casa, casa e 2ª etapa", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 187);
  const a = await reemb(db, { ref: "RF-1" });
  assert.equal((await erro(reemb(db, { ref: "RF-1" }))).code, "23505", "o mesmo reembolso da loja não entra duas vezes");
  assert.match((await erro(confirmar(db, a, 10, "2099-01-01"))).message, /no futuro/);
  assert.match((await erro(confirmar(db, a, 10, "2026-01-01"))).message, /anterior à compra/);
  assert.match((await erro(confirmar(db, a, 0, "2026-11-01"))).message, /valor inválido/);
  /* forjar a confirmação de outra pessoa */
  assert.equal((await erro(como(db, R, "insert into public.compras_reembolsos (compra_id, estado, valor_solicitado, valor_recebido, recebido_em, confirmado_em, confirmado_por) values ($1, 'recebido', 5, 5, '2026-11-01', now(), $2)", [C1, X]))).code, "42501");
  const rec = await reemb(db, { sol: 20 }); await como(db, R, "update public.compras_reembolsos set estado = 'recusado' where id = $1", [rec]);
  assert.match((await erro(confirmar(db, rec, 20, "2026-11-02"))).message, /recusado/);
  /* Fernanda (da casa) confirma e consulta; o estranho não vê nada */
  const b = await reemb(db, { sol: 30, uid: F }); assert.equal((await confirmar(db, b, 30, "2026-11-03", F)).confirmado, true);
  assert.equal((await como(db, F, "select confirmado_por from public.compras_reembolsos where id = $1", [b]))[0].confirmado_por, F);
  assert.equal((await creditos(db, F)).length, 1); assert.equal((await creditos(db, X)).length, 0);
  assert.match((await erro(como(db, X, "insert into public.compras_reembolsos (compra_id, valor_solicitado) values ($1, 5)", [C1]))).message, /row-level security|não encontrada/);
  assert.match((await erro(como(db, null, "select * from public.compras_creditos"))).message, /permission denied/);
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.deepEqual(await creditos(db, R), [], "com fator e sem o código, nada aparece");
  await db.close();
});

/* ---- 032 ---- */
const K65 = "35261011222333000181650020000006781112233448", K65_CONT = "35261011222333000181650020000006799112233440", K55 = "35261011222333000181550010000123451876543218";
const N1 = "f0000000-0000-4000-8000-000000000001", N2 = "f0000000-0000-4000-8000-000000000002";
const nota = (o = {}) => ({ id: N1, modelo: "65", chave: K65, numero: "678", serie: "2", data_emissao: "2026-10-20", emitente_cnpj: "11222333000181", emitente_uf: "SP", tp_emis: 1, situacao: "autorizada", protocolo: "135260000000123",
  valor_total: 54, valor_a_pagar: 50, pagamentos: [{ codigo: "03", forma: "Cartão de crédito", valor: 50, bandeira: "Mastercard", final: "1234" }], formato_origem: "xml", requer_conferencia: false, ...o });
const insNota = (db, n, uid = R) => como(db, uid, `insert into public.notas_fiscais select * from jsonb_populate_record(null::public.notas_fiscais, $1::jsonb || jsonb_build_object('user_id', public.dono_da_casa(), 'criado_em', now(), 'denegada', coalesce(($1::jsonb)->>'denegada', 'false')::boolean, 'requer_conferencia', coalesce(($1::jsonb)->>'requer_conferencia', 'true')::boolean, 'situacao', coalesce(($1::jsonb)->>'situacao', 'pendente'), 'pagamentos', coalesce(($1::jsonb)->'pagamentos', '[]'::jsonb)))`, [JSON.stringify(n)]);
const vinc = (db, o = {}) => como(db, o.uid || R, "insert into public.notas_fiscais_vinculos (nota_id, modulo, registro_id, gera_despesa) values ($1, $2, $3, $4) returning id", [o.nota || N1, o.modulo || "compras", o.reg || C1, o.gera ?? false]);

test("032: chave válida entra; dígito, modelo, CNPJ, série, número ou mês que não batem são recusados; situação só com evidência", { skip: pular }, async () => {
  const db = await banco();
  await insNota(db, nota());
  assert.equal((await erro(insNota(db, nota({ id: N2 })))).code, "23505", "a mesma chave não entra duas vezes");
  const ruim = (o) => erro(insNota(db, nota({ id: N2, ...o })));
  for (const [nome, o] of [["dígito verificador", { chave: K65.slice(0, 43) + "9" }], ["modelo 55 com chave 65", { modelo: "55" }], ["CNPJ do emitente", { emitente_cnpj: "45543915000181" }],
    ["CNPJ inválido", { emitente_cnpj: "11222333000182", chave: null, requer_conferencia: true }], ["série", { serie: "3" }], ["número", { numero: "999" }], ["mês", { data_emissao: "2026-09-20" }],
    ["modelo inexistente", { modelo: "57" }], ["autorizada sem protocolo", { protocolo: null }], ["contingência com protocolo", { situacao: "contingencia" }], ["denegada autorizada", { denegada: true }],
    ["sem chave sem conferência", { chave: null, protocolo: null, situacao: "pendente", requer_conferencia: false }], ["foto sem conferência", { formato_origem: "imagem" }],
    ["número de cartão", { pagamentos: [{ codigo: "03", valor: 1, final: "4111111111111111" }] }], ["PAN no texto", { pagamentos: [{ valor: 1, bandeira: "4111111111111111" }] }]])
    assert.equal((await ruim(o)).code, "23514", nome);
  /* contingência é uma situação própria, sem protocolo */
  await insNota(db, nota({ id: N2, chave: K65_CONT, numero: "679", tp_emis: 9, situacao: "contingencia", protocolo: null, requer_conferencia: true }));
  assert.equal((await como(db, R, "select situacao from public.notas_fiscais where id = $1", [N2]))[0].situacao, "contingencia");
  assert.equal((await erro(insNota(db, nota({ id: "f0000000-0000-4000-8000-000000000003", chave: K55, modelo: "55", numero: "12345", serie: "1", situacao: "contingencia", protocolo: null, tp_emis: 1 })))).code, "23514", "contingência exige tipo de emissão de contingência");
  const cols = (await db.query("select column_name from information_schema.columns where table_name like 'notas_fiscais%'")).rows.map((r) => r.column_name);
  assert.deepEqual(cols.filter((c) => /cpf|consumidor|destinat|cliente|telefone|email|endereco|cartao|cvv/i.test(c)), []);
  await db.close();
});
test("032: itens e documentos pertencem a uma nota da casa; originais só na pasta da nota; mesmo arquivo uma vez", { skip: pular }, async () => {
  const db = await banco(); await insNota(db, nota());
  await como(db, R, "insert into public.notas_fiscais_itens (nota_id, ordem, descricao, qtd, unidade, unidade_original, unitario, total) values ($1, 0, 'BANANA PRATA', 0.7340, 'kg', 'KG', 6.99, 5.13), ($1, 1, 'AZEITE', 2, 'l', 'LT', 10, 20)", [N1]);
  assert.equal((await como(db, R, "select count(*)::int as n from public.notas_fiscais_itens"))[0].n, 2);
  assert.equal((await erro(como(db, R, "insert into public.notas_fiscais_itens (nota_id, descricao, qtd, unidade, total) values ($1, 'X', 1, 'arroba', 1)", [N1]))).code, "23514");
  const d = (p, sha = "a".repeat(64)) => como(db, R, "insert into public.notas_fiscais_docs (nota_id, tipo, nome, path, sha256) values ($1, 'xml', 'nota.xml', $2, $3)", [N1, p, sha]);
  await d(`${R}/notas-fiscais/${N1}/nota.xml`);
  assert.equal((await erro(d(`${R}/notas-fiscais/${N1}/outra.xml`))).code, "23505", "mesmo SHA-256");
  assert.match((await erro(d(`${R}/compras/${N1}/nota.xml`, "b".repeat(64)))).message, /check|row-level/);
  assert.match((await erro(d(`${X}/notas-fiscais/${N1}/nota.xml`, "c".repeat(64)))).message, /row-level/);
  assert.match((await erro(d(`${R}/notas-fiscais/${N2}/nota.xml`, "d".repeat(64)))).message, /row-level/, "pasta de outra nota");
  assert.equal((await como(db, X, "select count(*)::int as n from public.notas_fiscais"))[0].n, 0);
  assert.equal((await como(db, F, "select count(*)::int as n from public.notas_fiscais"))[0].n, 1, "Fernanda enxerga a Central Fiscal");
  await db.close();
});
test("032: vínculo é só conferência — não duplica, não gera despesa, não vale para nota cancelada/rejeitada e se invalida sozinho", { skip: pular }, async () => {
  const db = await banco();
  await insCompra(db, C1, 95); await insNota(db, nota());
  const antes = { c: await contar(db, "compras_online"), i: await contar(db, "compras_online_itens"), r: await contar(db, "compras_reembolsos") };
  await vinc(db); await vinc(db, { modulo: "mercado", reg: (await como(db, R, "insert into public.notas default values returning id"))[0].id });
  assert.equal((await erro(vinc(db))).code, "23505", "vínculo duplicado");
  assert.equal((await erro(vinc(db, { gera: true }))).code, "23514", "gera_despesa nunca é verdadeiro");
  assert.match((await erro(vinc(db, { reg: C2 }))).message, /registro não encontrado/);
  assert.match((await erro(como(db, R, "update public.notas_fiscais_vinculos set registro_id = $1", [C2]))).message, /não mudam/);
  /* nota cancelada: nada de vínculo novo; os existentes ficam inválidos e a nota não volta */
  await como(db, R, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [N1]);
  assert.deepEqual((await como(db, R, "select valido from public.notas_fiscais_vinculos")).map((r) => r.valido), [false, false]);
  await insNota(db, nota({ id: N2, chave: K65_CONT, numero: "679", tp_emis: 9, situacao: "rejeitada", protocolo: null, requer_conferencia: true }));
  assert.match((await erro(vinc(db, { nota: N2 }))).message, /rejeitada não documenta/);
  assert.match((await erro(como(db, R, "update public.notas_fiscais set situacao = 'autorizada', protocolo = '135260000000123' where id = $1", [N1]))).message, /cancelada não volta/);
  assert.match((await erro(como(db, R, "update public.notas_fiscais_vinculos set valido = true"))).message, /não volta/);
  /* nenhuma despesa nasceu */
  assert.deepEqual({ c: await contar(db, "compras_online"), i: await contar(db, "compras_online_itens"), r: await contar(db, "compras_reembolsos") }, antes);
  assert.equal((await como(db, X, "select count(*)::int as n from public.notas_fiscais_vinculos"))[0].n, 0);
  await db.close();
});
test("backup: as linhas das tabelas novas passam pela conferência do núcleo (chaves e pais)", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 95); await insNota(db, nota());
  const reg = await reemb(db, { sol: 10 });
  for (const t of ["compras_online", "compras_reembolsos", "notas_fiscais"]) {
    const linhas = (await db.query(`select * from public.${t}`)).rows;
    const def = N.segDef(t); assert.ok(def, t);
    for (const col of def.pk) assert.ok(linhas.every((l) => l[col] != null), t + " pk");
  }
  assert.ok(reg);
  await db.close();
});

test("status (030): os novos estados convivem com os antigos; histórico sem status explícito e vocabulário estranho são recusados; antigos seguem iguais", { skip: pular }, async () => {
  const db = await banco();
  const ins = (extra, vals) => como(db, R, `insert into public.compras_online (loja, numero, data, subtotal, total_pago${extra}) values ('amazon', '${Math.random()}', '2026-01-01', 10, 10${vals})`);
  for (const s of [null, "cancelado", "cancelamento_informado", "reembolso_informado", "concluido", "autorizado", "desconhecido"]) await ins(", status", s ? `, '${s}'` : ", null");
  assert.equal((await erro(ins(", status", ", 'enviado'"))).code, "23514", "vocabulário fechado para o que for gravado daqui em diante");
  assert.equal((await erro(ins(", canal, natureza, historico, status", ", 'amazon', 'digital', true, null"))).code, "23514", "histórico sem status explícito");
  await ins(", canal, natureza, historico, status", ", 'amazon', 'digital', true, 'autorizado'");
  /* o que o banco devolve é interpretado pelo núcleo: autorizado/desconhecido pendentes, o resto como sempre */
  const l = (await como(db, R, "select status, historico, natureza, canal, subtotal::float as total_pago, '2026-01-01' as data, 'amazon' as loja from public.compras_online")).map((r) => ({ ...r, id: r.status }));
  const entram = l.filter((r) => N.coDespesas([r]).length === 1).map((r) => r.status).sort();
  assert.deepEqual(entram, [null, "cancelamento_informado", "concluido", "reembolso_informado"].sort());
  await db.close();
});
test("estorno (031): corrige recebimento confirmado por engano sem apagar nada, uma vez só, com responsável, data, motivo e valor", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 100);
  const a = await reemb(db, { sol: 100 }); await confirmar(db, a, 100, "2026-11-04");
  assert.equal((await creditos(db)).length, 1);
  assert.match((await erro(como(db, R, "select public.reembolso_estornar($1, 'x')", [a]))).message, /motivo/);
  const r = (await como(db, R, "select public.reembolso_estornar($1, 'Valor confirmado por engano') as r", [a]))[0].r;
  assert.deepEqual([r.estornado, r.ja_estornado, r.mes], [true, false, "2026-11"]);
  assert.deepEqual(await creditos(db), [], "o crédito estornado deixa de ser contabilizado");
  const h = (await como(db, R, "select estornado, situacao, estorno_motivo, estornado_por, valor::float as valor, to_char(mes, 'YYYY-MM') as mes from public.compras_creditos_historico"))[0];
  assert.deepEqual(h, { estornado: true, situacao: "credito_estornado", estorno_motivo: "Valor confirmado por engano", estornado_por: R, valor: 100, mes: "2026-11" });
  const orig = (await como(db, R, "select estado, valor_recebido::float as v, confirmado_por from public.compras_reembolsos where id = $1", [a]))[0];
  assert.deepEqual(orig, { estado: "recebido", v: 100, confirmado_por: R }, "o registro original fica como estava");
  const e = (await como(db, R, "select valor::float as valor, to_char(mes_credito, 'YYYY-MM') as mes, estornado_em is not null as em from public.compras_reembolsos_estornos"))[0];
  assert.deepEqual(e, { valor: 100, mes: "2026-11", em: true });
  /* duplicidade e histórico que só acrescenta */
  assert.equal((await como(db, R, "select public.reembolso_estornar($1, 'Outra tentativa aqui') as r", [a]))[0].r.ja_estornado, true);
  assert.equal((await erro(como(db, R, "insert into public.compras_reembolsos_estornos (reembolso_id, motivo) values ($1, 'Duplicado direto')", [a]))).code, "23505");
  assert.match((await erro(como(db, R, "update public.compras_reembolsos_estornos set motivo = 'Mudei o motivo'"))).message, /permission denied/);
  assert.match((await erro(como(db, R, "delete from public.compras_reembolsos_estornos"))).message, /permission denied/);
  assert.match((await erro(db.query("delete from public.compras_reembolsos_estornos"))).message, /só acrescenta/, "nem por quem tem permissão total");
  assert.match((await erro(como(db, R, "update public.compras_reembolsos set valor_recebido = 5 where id = $1", [a]))).message, /não muda/, "recebido continua sem edição direta");
  assert.match((await erro(confirmar(db, a, 100, "2026-11-04"))).message, /estornado/);
  /* o valor volta a caber: novo reembolso correto */
  const b = await reemb(db, { sol: 100 }); assert.equal((await confirmar(db, b, 100, "2026-11-05")).confirmado, true);
  assert.deepEqual((await creditos(db)).map((c) => [c.valor, c.reembolso_id]), [[100, b]]);
  /* só recebido se estorna; só quem é da casa; com 2ª etapa */
  const c = await reemb(db, { sol: 10 });
  assert.match((await erro(como(db, R, "select public.reembolso_estornar($1, 'Ainda nem recebi')", [c]))).message, /só se estorna um reembolso recebido/);
  assert.match((await erro(como(db, X, "select public.reembolso_estornar($1, 'Estranho tentando')", [b]))).message, /não encontrado/);
  assert.match((await erro(como(db, null, "select public.reembolso_estornar($1, 'Sem login nenhum')", [b]))).message, /permission denied/);
  assert.equal((await como(db, F, "select public.reembolso_estornar($1, 'Fernanda corrige') as r", [b]))[0].r.estornado, true);
  assert.equal((await como(db, F, "select estornado_por from public.compras_reembolsos_estornos order by estornado_em desc limit 1"))[0].estornado_por, F);
  assert.equal((await como(db, X, "select count(*)::int as n from public.compras_creditos_historico"))[0].n, 0);
  await db.close();
});

test("vistas de créditos (PGlite): só a casa lê; estranho, anon e quem tem 2ª etapa mas não passou por ela veem nada; ninguém escreve pela vista", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 100);
  const a = await reemb(db, { sol: 100 }); await confirmar(db, a, 100, "2026-11-04");
  await como(db, R, "select public.reembolso_estornar($1, 'Confirmado por engano') as r", [a]);
  const hist = (uid, aal) => como(db, uid, "select count(*)::int as n from public.compras_creditos_historico", [], aal).then((r) => r[0].n);
  const efet = (uid, aal) => como(db, uid, "select count(*)::int as n from public.compras_creditos", [], aal).then((r) => r[0].n);
  assert.deepEqual([await hist(R), await hist(F), await hist(X)], [1, 1, 0], "auditoria só para a casa (dono e Fernanda)");
  assert.deepEqual([await efet(R), await efet(F), await efet(X)], [0, 0, 0], "o estornado não conta");
  assert.match((await erro(como(db, null, "select * from public.compras_creditos_historico"))).message, /permission denied/, "anon");
  for (const v of ["compras_creditos", "compras_creditos_historico"]) for (const sql of [`delete from public.${v}`, `update public.${v} set canal = 'shopee'`, `insert into public.${v} (reembolso_id) values (gen_random_uuid())`, `truncate public.${v}`])
    assert.match((await erro(como(db, R, sql))).message, /permission denied|cannot (insert|update|delete)|not (automatically )?updatable|is not a table/i, sql);
  assert.equal((await db.query("select count(*)::int as n from public.compras_reembolsos")).rows[0].n, 1, "nada foi apagado pelas vistas");
  /* a trava da 2ª etapa vem da política "mfa" das tabelas de baixo (vista invoker): com fator e sem o código, as duas vistas ficam vazias */
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.deepEqual([await hist(R, "aal1"), await efet(R, "aal1")], [0, 0], "aal1 com fator cadastrado não vê nada");
  assert.equal(await hist(R, "aal2"), 1, "com a 2ª etapa vê");
  /* as propriedades das vistas e dos privilégios, como o banco as guarda */
  const v = (await db.query("select c.relname, c.reloptions::text as o from pg_class c where c.relname in ('compras_creditos','compras_creditos_historico') order by 1")).rows;
  assert.ok(v.every((x) => /security_invoker=true/.test(x.o)), JSON.stringify(v));
  const priv = (await db.query("select has_table_privilege('anon', 'public.compras_creditos', 'select') a, has_table_privilege('authenticated', 'public.compras_creditos', 'delete') d, has_table_privilege('authenticated', 'public.compras_reembolsos_estornos', 'update') u, has_table_privilege('authenticated', 'public.compras_reembolsos_estornos', 'truncate') t, has_table_privilege('anon', 'public.notas_fiscais', 'select') n")).rows[0];
  assert.deepEqual(priv, { a: false, d: false, u: false, t: false, n: false });
  await db.close();
});
test("estorno e reembolso (PGlite): motivo e auditoria não mudam depois; total pago não cai abaixo do reembolsado", { skip: pular }, async () => {
  const db = await banco(); await insCompra(db, C1, 100);
  const a = await reemb(db, { sol: 60 }); await confirmar(db, a, 60, "2026-11-04");
  assert.match((await erro(como(db, R, "update public.compras_online set total_pago = 50, subtotal = 50 where id = $1", [C1]))).message, /não pode ficar abaixo do que já foi reembolsado/);
  await como(db, R, "select public.reembolso_estornar($1, 'Motivo original aqui') as r", [a]);
  for (const sql of ["update public.compras_reembolsos_estornos set motivo = 'Adulterado agora'", "update public.compras_reembolsos_estornos set estornado_por = null", "delete from public.compras_reembolsos_estornos"])
    for (const exec of [(s) => como(db, R, s), (s) => db.query(s)]) assert.ok((await erro(exec(sql))).message, sql);
  assert.equal((await como(db, R, "select motivo from public.compras_reembolsos_estornos"))[0].motivo, "Motivo original aqui");
  await como(db, R, "update public.compras_online set total_pago = 50, subtotal = 50 where id = $1", [C1]);   // estornado libera o limite
  assert.match((await erro(db.query("delete from auth.users where id = $1", [R]))).message, /./, "apagar a conta de quem estornou não reescreve a auditoria");
  await db.close();
});
test("compras_gravar (PGlite): anon sem execução; user_id enviado é recusado; documento de outra casa ou sem arquivo no cofre é recusado; nada fica gravado", { skip: pular }, async () => {
  const db = await banco(); await noCofre(db, doc(1).path);
  assert.match((await erro(gravar(db, null, compra(), itensOk(), [], true))).message, /permission denied for function compras_gravar/);
  assert.match((await erro(gravar(db, R, compra({ user_id: X }), itensOk(), [], true))).message, /campo não permitido na compra: user_id/);
  assert.match((await erro(gravar(db, R, compra(), [{ ...itensOk()[0], user_id: X }], [], true))).message, /campo não permitido no produto 1: user_id/);
  assert.match((await erro(gravar(db, R, compra(), itensOk(), [{ ...doc(1), user_id: X }], true))).message, /campo não permitido no documento 1: user_id/);
  assert.match((await erro(gravar(db, R, compra(), itensOk(), [doc(2)], true))).message, /não está no cofre/);
  assert.match((await erro(gravar(db, X, compra(), itensOk(), [doc(1)], true))).message, /fora da pasta desta compra/, "estranho não consegue usar o caminho da casa");
  assert.deepEqual([await contar(db, "compras_online"), await contar(db, "compras_online_itens"), await contar(db, "compras_online_docs")], [0, 0, 0]);
  await gravar(db, R, compra(), itensOk(), [doc(1)], true);
  assert.equal((await db.query("select user_id from public.compras_online_docs")).rows[0].user_id, R, "o dono do documento vem do banco");
  await db.close();
});

test("compras_gravar (PGlite): a edição aceita a linha inteira com origem/histórico/importação iguais ao gravado e recusa se diferentes; CHECKs de histórico não passam com NULL", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra({ origem: "pdf" }), itensOk(), [], true);
  assert.equal((await gravar(db, R, compra({ origem: "pdf", subtotal: 110, total_pago: 105 }), itensOk(), [], false)).criado, false, "origem igual: passa");
  assert.match((await erro(gravar(db, R, compra({ origem: "xml" }), itensOk(), [], false))).message, /origem não muda na edição/);
  assert.match((await erro(gravar(db, R, compra({ origem: "pdf", historico: true }), itensOk(), [], false))).message, /historico não muda na edição/);
  assert.match((await erro(gravar(db, R, compra({ origem: "pdf", importacao_id: "99999999-9999-4999-8999-999999999999" }), itensOk(), [], false))).message, /importacao_id não muda na edição|importação não encontrada/);
  const ins = (cols, vals) => como(db, R, `insert into public.compras_online (loja, numero, data, subtotal, total_pago, ${cols}) values ('amazon', '${Math.random()}', '2026-01-01', 10, 10, ${vals})`);
  assert.equal((await erro(ins("historico, natureza, status", "true, 'fisica', 'concluido'"))).code, "23514", "histórico sem canal (NULL) não passa");
  assert.equal((await erro(ins("historico, canal, status", "true, 'amazon', 'concluido'"))).code, "23514", "histórico sem natureza (NULL) não passa");
  assert.equal((await erro(ins("historico, canal, natureza", "true, 'amazon', 'fisica'"))).code, "23514", "histórico sem status (NULL) não passa");
  await ins("historico, canal, natureza, status", "true, 'amazon', 'fisica', 'concluido'");
  await db.close();
});
