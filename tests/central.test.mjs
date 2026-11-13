// Central de Segurança sem rede e sem banco: o SQL 022 (trava da 2ª etapa, histórico, auditoria), a página e a integração
// com o login, as rotas e o service worker, e as regras de produção (nada apagado, nada sobrescrito sem pedir, garmin intocada).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { registro, rota } from "./_rotas.mjs";   // registro de rotas e do menu (js/rotas.js, Fase 2 · A3)

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const sql = ler("supabase/022_seguranca.sql"), seg = ler("js/seguranca.js"), app = ler("js/app.js"), sis = ler("js/sistema.js");
/* tabelas que os .sql criam, menos as que não são de ninguém (preços da IA), que o site nem enxerga (segredos do servidor) ou o catálogo da
   auditoria (050, Fase 2 · A6: nenhum privilégio para o site; tests/seguranca_catalogo.test.mjs) */
const todasSql = fs.readdirSync(new URL("supabase/", raiz)).filter((f) => /^\d{3}_.*\.sql$|^schema\.sql$/.test(f)).map((f) => ler("supabase/" + f)).join("\n");
const tabelas = [...new Set([...todasSql.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]))].filter((t) => !["ia_precos", "rac_segredos", "seguranca_catalogo"].includes(t));
const listaMfa = (txt) => [...(/foreach t in array array\[([\s\S]*?)\] loop/.exec(txt) || [, ""])[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

test("022: aplicado em produção em 31/10/2026 (sem a marca de pendente) e pode rodar de novo", () => {
  assert.ok(!/^-- status: pendente/.test(sql), "o 022 já rodou: tests/banco.test.mjs confere as funções e a tabela no banco");
  for (const m of sql.matchAll(/create policy "([^"]+)" on ([a-z_.]+\.[a-z_]+) /g)) assert.ok(sql.includes(`drop policy if exists "${m[1]}" on ${m[2]};`), `política ${m[1]} sem drop antes`);
  assert.match(sql, /drop policy if exists "mfa" on public\.%I/);
  assert.match(sql, /create table if not exists public\.seguranca_eventos/);
  assert.ok(!/^\s*(delete|update|truncate|drop table|alter table [^\n]* drop column)\b/im.test(sql), "não apaga nem altera dado existente");
  assert.ok(!/insert into auth\.|auth\.mfa_factors\s*\(|mfa\.enroll/i.test(sql), "não liga MFA para ninguém");
});

test("022: a trava da 2ª etapa cobre todas as tabelas pessoais e os cofres, como política restritiva", () => {
  const cobertas = listaMfa(sql), sql33 = ler("supabase/033_seguranca_compras_fiscal.sql"), cobertas33 = listaMfa(sql33);
  /* a 037 (Lote 1.5) cria as próprias tabelas e aplica a trava "mfa" no mesmo laço; seguranca_estado() ainda não as audita (entra na implementação) */
  const cobertas37 = listaMfa(ler("supabase/037_notas_fiscais_foto_pdf.sql"));
  assert.deepEqual(cobertas37, ["notas_fiscais_tentativas", "notas_fiscais_situacoes"]);
  /* a 043 (Radar de Preços) também aplica a trava "mfa" no próprio laço e recria seguranca_estado() com as suas seis tabelas */
  const cobertas43 = listaMfa(ler("supabase/043_radar_precos.sql"));
  assert.deepEqual(cobertas43, ["radar_config", "radar_lojas", "radar_itens", "radar_ofertas", "radar_coletas", "radar_precos"]);
  /* a 048 (Radar: descoberta e orçamento) aplica a trava "mfa" no próprio laço e recria seguranca_estado() com as suas três tabelas */
  const cobertas48 = listaMfa(ler("supabase/048_radar_descoberta.sql"));
  assert.deepEqual(cobertas48, ["radar_consultas", "radar_candidatos", "radar_historico"]);
  /* o 022 é histórico e não muda: as tabelas das migrations 030 a 032 são cobertas pelo 033 e as da 037 por ela mesma */
  for (const t of tabelas) if (t !== "seguranca_eventos") assert.ok(cobertas.includes(t) || cobertas33.includes(t) || cobertas37.includes(t) || cobertas43.includes(t) || cobertas48.includes(t), `${t} sem a trava da 2ª etapa no 022, no 033, na 037, na 043 nem na 048`);
  assert.match(sql, /create policy "mfa" on public\.%I as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\) with check \(\(select public\.rac_aal_ok\(\)\)\)/);
  assert.match(sql, /create policy "mfa" on public\.seguranca_eventos as restrictive/);
  assert.match(sql, /create policy "mfa cofres" on storage\.objects as restrictive[\s\S]*'familia', 'backups'/);
  /* a conferência de dentro do banco olha a mesma lista (mais o histórico) */
  const audit = [...(/pessoais text\[\] := array\[([\s\S]*?)\];/.exec(sql)[1].matchAll(/'([a-z_]+)'/g))].map((m) => m[1]);
  assert.deepEqual(audit, [...cobertas, "seguranca_eventos"]);
  /* e a auditoria do 033 olha a lista do 022 mais as tabelas novas */
  const audit33 = [...(/pessoais text\[\] := array\[([\s\S]*?)\];/.exec(sql33)[1].matchAll(/'([a-z_]+)'/g))].map((m) => m[1]);
  assert.deepEqual(audit33, [...cobertas, ...cobertas33, "seguranca_eventos"]);
});

test("022: rac_aal_ok só deixa sem código quem não tem fator confirmado; funções fechadas para quem não entrou", () => {
  const f = /create or replace function public\.rac_aal_ok\(\)[\s\S]*?\$\$;/.exec(sql)[0];
  assert.match(f, /security definer set search_path = ''/);
  assert.match(f, /auth\.jwt\(\)->>'aal'\), 'aal1'\) = 'aal2'/);
  assert.match(f, /not exists \(select 1 from auth\.mfa_factors f where f\.user_id = \(select auth\.uid\(\)\) and f\.status = 'verified'\)/);
  for (const fn of ["rac_aal_ok", "seguranca_estado"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(\\) to authenticated;`));
  }
  assert.match(/create or replace function public\.seguranca_estado\(\)[\s\S]*?end \$\$;/.exec(sql)[0], /if \(select auth\.uid\(\)\) is null then raise exception/);
});

test("022: o histórico de segurança só acrescenta, só a própria conta lê, e o visitante não vê nada", () => {
  assert.match(sql, /alter table public\.seguranca_eventos enable row level security/);
  assert.match(sql, /revoke all on public\.seguranca_eventos from anon, authenticated;\r?\ngrant select, insert on public\.seguranca_eventos to authenticated;/);
  assert.ok(!/grant[^;]*(update|delete)[^;]*seguranca_eventos/i.test(sql), "ninguém altera nem apaga o histórico pelo site");
  assert.match(sql, /for select to authenticated using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /for insert to authenticated\s+with check \(user_id = auth\.uid\(\)/);
  assert.match(ler("tests/seguranca.test.mjs"), /"seguranca_eventos"/, "a tabela nova está no teste de segurança com o banco");
});

test("backup: as tabelas do site são as do núcleo e cobrem o backup do servidor; o que é segredo ou interno fica fora", () => {
  const nomes = N.SEG_TABELAS.map((d) => d.t);
  assert.match(sis, /var BKP_TABELAS=NUCLEO\.SEG_TABELAS\.map/);
  const servidor = JSON.parse(/for \(const t of (\[[^\]]+\])\)/.exec(ler("supabase/functions/garmin/index.ts"))[1].replace(/'/g, '"'));
  for (const t of servidor) assert.ok(nomes.includes(t), `${t} está no backup do servidor e falta no do site`);
  for (const t of ["push_inscricoes", "rac_segredos", "membros", "erros", "rotina_log", "ia_uso", "ia_config", "ia_cobranca", "newsletter_avisos", "seguranca_eventos"]) assert.ok(!nomes.includes(t), `${t} não entra no backup`);
  assert.deepEqual(Object.keys(N.SEG_CHAVES_FORA).sort(), ["atalho", "googleMaps"]);
  assert.match(sis, /NUCLEO\.segLimpar\(t,l0\)/, "o .zip também sai sem segredos");
});

test("restauração: só depois da prévia e do confirm; novas por insert, troca só se pedir; anexos sem sobrescrever; nada apagado", () => {
  assert.ok(!/function restaurarBackup/.test(sis), "a restauração antiga (que sobrescrevia) saiu");
  assert.ok(!/upsert:true/.test(sis + seg), "nenhum envio de arquivo sobrescreve");
  assert.match(seg, /\.upload\(path,mime\?new Blob\(\[dados\],\{type:mime\}\):new Blob\(\[dados\]\),mime\?\{upsert:false,contentType:mime\}:\{upsert:false\}\)/, "sem tipo (Compras e demais): Blob e opções exatamente como antes; com tipo (anexo fiscal): o mime do registro");
  assert.ok(!/SB\.from\([^)]*\)\.(delete|update)\(|\.remove\(|\.truncate/.test(seg), "a Central não apaga nem altera linhas por fora do plano");
  assert.deepEqual([...seg.matchAll(/\.(delete|update)\(\{passkeyId/g)].length, 2, "só a passkey da própria conta é removida ou renomeada");
  assert.match(seg, /op\.op==="insert"\?SB\.from\(op\.t\)\.insert\(/);
  assert.match(seg, /NUCLEO\.segEscrita\(plano,cSub\.checked\)/, "troca só com a caixa marcada");
  const clique = /grava\.onclick=function\(\)\{([\s\S]*?)\n    area\.appendChild/.exec(seg)[1];
  assert.ok(clique.indexOf("confirm(") >= 0 && clique.indexOf("confirm(") < clique.indexOf("segGravar("), "confirmação antes de gravar");
  assert.match(seg, /grava\.disabled=[^;]*plano\.outraConta&&!cConta\.checked/, "outra conta exige marcar a caixa");
  assert.match(seg, /cCopia=h\("input",\{type:"checkbox",checked:""\}\)/, "cópia do que existe hoje, marcada por padrão");
  assert.match(seg, /if\(!H\.ok\)\{erro\(H\.problemas/, "assinatura errada para tudo antes de comparar");
});

test("MFA: o login pede o código antes de ler qualquer tabela, e nada liga MFA sozinho", () => {
  const ent = /function entrar\(\)\{([\s\S]*?)\n  function iniciar/.exec(app)[1];
  assert.ok(ent.indexOf("mfaPrecisa()") >= 0 && ent.indexOf("mfaPrecisa()") < ent.indexOf('SB.from("membros")'), "o código vem antes da primeira leitura");
  assert.match(app, /d\.nextLevel==="aal2"&&d\.currentLevel!=="aal2"/);
  assert.match(app, /challengeAndVerify\(\{factorId:sel\.value,code:c\}\)/);
  /* enroll só no clique de ativar; desativar pede um código atual antes */
  assert.equal((seg.match(/mfa\.enroll\(/g) || []).length, 1);
  assert.match(seg, /at\.onclick=function\(\)\{at\.disabled=true;segAtivar\(/);
  assert.match(seg, /challengeAndVerify\(\{factorId:fator\.id,code:c\}\)\.then\(function\(r\)\{if\(r\.error\)throw r\.error;return SB\.auth\.mfa\.unenroll/);
  assert.ok(!/mfa\.enroll|unenroll/.test(app), "o login nunca cadastra nem remove fator");
});

test("Central: rota, menu, seção, papel casa, service worker e versão", () => {
  const html = ler("index.html"), sw = ler("sw.js");
  const RT = registro(); assert.ok(RT.tabs.includes("seguranca")); assert.ok(RT.DA_CASA.includes("seguranca"));
  assert.deepEqual(RT.ROTA_MODS.seguranca, ["seguranca"]); assert.match(app, /seguranca:\["sistema"\]/);
  const rs = rota("seguranca"); assert.ok(!rs.marcaPropria); assert.match(rs.abrirTexto, /renderSeguranca\(p\[1\]\)/);
  assert.match(RT.menu, /<a class="it" href="#seguranca" data-k="seguranca" data-casa="1">/); assert.match(html, /<section id="seguranca" hidden><div id="seguranca-view" class="stack"><\/div><\/section>/);
  assert.match(html, /html\.casa #navgrp a\.it:not\(\[data-casa\]\)/, "quem é da casa vê a Central (só MFA e recuperação): item com data-casa");
  assert.match(sw, /"\.\/js\/seguranca\.js"/);
  assert.match(seg, /if\(isOwner\(\)\)\{root\.appendChild\(segBackupPainel\(\)\)/, "backup, restauração, histórico e auditoria só para o dono");
  assert.match(sis, /href:"#seguranca",text:"Abrir a Central de Segurança"/, "o Sistema aponta para a Central em vez de repetir o backup");
});

test("restrições de produção: a função garmin e as outras Edge Functions não mudam, e a IA não entra na Central", () => {
  assert.ok(!/functions\/v1\/garmin|cron\.(un)?schedule/.test(sql), "o 022 não mexe na função nem na rotina da garmin");
  assert.ok(!/racIA\(|anthropic/i.test(seg));
  assert.ok(!/functions\.invoke/.test(seg), "a Central não chama Edge Function");
});

test("Face ID: botão no login só com suporte do navegador, senha continua igual, e a sessão passa pelo mesmo entrar()", () => {
  const html = ler("index.html"), merc = ler("mercado.js");
  assert.match(html, /<button type="button" id="gate-passkey" hidden>Entrar com Face ID<\/button>/);
  for (const id of ["gate-email", "gate-pw", "gate-enter", "gate-esqueci"]) assert.match(html, new RegExp(`id="${id}"`), `${id} continua na tela de entrar`);
  assert.match(app, /signInWithPassword\(/, "a senha continua como alternativa");
  assert.match(app, /if\(passkeyOk\(\)\)\{\$\("#gate-passkey"\)\.hidden=false/);
  const clique = /\$\("#gate-passkey"\)\.addEventListener\("click",function\(\)\{([\s\S]*?)\}\)\}\);/.exec(app)[1];
  assert.match(clique, /sb\.auth\.signInWithPasskey\(\)/);
  assert.match(clique, /entrar\(\)/, "depois do Face ID, o mesmo caminho da senha (papel, código se a conta usa TOTP)");
  assert.equal((app.match(/signInWithPasskey\(/g) || []).length, 1, "o Face ID só é pedido no toque do botão");
  assert.match(ler("js/dados.js"), /experimental: \{ passkey: true \}/, "opção do SDK para as passkeys (no cliente único, js/dados.js)");
  assert.ok(!/createClient/.test(merc), "o Mercado não cria outro cliente");
});

test("Face ID na Central: cada conta vê e cadastra só as suas; remover pede confirmação; nada de API de administrador", () => {
  assert.match(seg, /SB\.auth\.passkey\.list\(\)/);
  assert.ok(!/auth\.admin/.test(seg + app), "o site não usa a API de administrador (lista de outra conta)");
  assert.equal((seg.match(/registerPasskey\(/g) || []).length, 1);
  assert.match(seg, /cad\.onclick=function\(\)\{[^]*?SB\.auth\.registerPasskey\(\)/, "cadastro só no toque");
  const rm = /rm\.onclick=function\(\)\{([\s\S]*?)\};\r?\n/.exec(seg)[1];   // aceita LF (commit) e CRLF (checkout no Windows com autocrlf)
  assert.ok(rm.indexOf("confirm(") >= 0 && rm.indexOf("confirm(") < rm.indexOf("passkey.delete("), "confirma antes de remover");
  assert.match(seg, /root\.appendChild\(segProtecao\(\)\);root\.appendChild\(segPasskeys\(\)\);root\.appendChild\(segMfa\(\)\);/, "quem é da casa também cadastra o seu Face ID");
  assert.match(sql, /'passkey_cadastrada', 'passkey_removida'/);
});

test("Face ID não enfraquece o banco: a sessão da passkey é aal1 e a trava do 022 continua exigindo aal2 de quem usa TOTP", () => {
  const f = /create or replace function public\.rac_aal_ok\(\)[\s\S]*?\$\$;/.exec(sql)[0];
  assert.ok(!/amr|passkey/i.test(f), "a trava não aceita a passkey no lugar do código");
  assert.ok(!/disable row level security|no force row level security/i.test(sql));
  assert.match(app, /d\.nextLevel==="aal2"&&d\.currentLevel!=="aal2"/, "o código continua sendo pedido uma vez por sessão para quem tem TOTP");
  assert.ok(!/mfa\.enroll|mfa\.unenroll|registerPasskey/.test(app), "o login não cadastra nada sozinho");
});
