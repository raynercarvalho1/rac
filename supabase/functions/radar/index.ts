// Radar de Preços: a única porta do RAC para páginas de lojas e o aviso de oportunidades (docs/radar.md, docs/radar-fontes.md). Este é o único arquivo da pasta que usa Deno e o Supabase;
// o resto é lógica pura e testada (tests/radar_servidor.test.mjs e radar_lote3.test.mjs). NÃO FOI PUBLICADA: precisa da autorização do dono (README: "Edge Function: o dono republica").
// Duas entradas:
//   1) o site (login do dono): { tipo: "ler_url", url }  → lê a página (só domínios das lojas do dono), extrai os dados e devolve para o dono conferir. Não grava nada.
//   2) a rotina do servidor (senha x-rac-rotina conferida no banco por rac_rotina_ok): { tipo: "rodada" } → para cada dono: coleta as ofertas liberadas e manda o aviso de oportunidades
//      (Web Push só para os aparelhos do dono, por push.ts, sem depender da função garmin). Só vale depois de um agendamento próprio (supabase/propostas/045_radar_rotina.sql, não aplicada).
// Descoberta (SerpApi): { tipo: "descobrir" | "expandir" | "uso_descoberta" | "cota_provedor" }, só o dono; o orçamento é reservado no banco ANTES da chamada (radar_reservar_consulta, atômico); o Secret SERPAPI_API_KEY é o único segredo novo e nunca sai da função. Membro da casa (Fernanda) é recusado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chavePublica, chaveServidor } from "./chaves.ts";
import { configPadrao, type Banco as BancoAvisos } from "./avisos.ts";
import type { BancoColeta } from "./coletores.ts";
import { extrairPagina } from "./extrair.ts";
import { erroDoBanco, registroDeErro } from "./diag.ts";
import { resolverNome } from "./dns.ts";
import { cotaDoProvedor, descobrir, expandir, prepararGravacao, usoDescoberta, type BancoDesc, type CandRow, type Contexto as ContextoDescoberta, type UltimaObs } from "./descoberta.ts";
import { chaveObservacao } from "./ofertas.ts";
import { type BancoPush } from "./push.ts";
import { rodadaDoDono } from "./rotina.ts";
import { lerPagina, type Deps } from "./ssrf.ts";

const ORIGENS = ["https://raynercarvalho.com.br", "https://www.raynercarvalho.com.br", "https://raynercarvalho1.github.io"];
const origemPermitida = (o: string | null) => (o && (ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : ORIGENS[0]);
const cabecalhos = (req: Request) => ({
  "Access-Control-Allow-Origin": origemPermitida(req.headers.get("Origin")), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rac-rotina",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json",
});
const ambiente = (n: string) => Deno.env.get(n);

const deps: Deps = {
  /* DNS do ambiente, com DNS sobre HTTPS (endereço fixo) se o ambiente não oferecer Deno.resolveDns; sem resposta, a leitura é recusada */
  resolver: (host) => resolverNome(host, { resolveDns: typeof Deno.resolveDns === "function" ? (h, t) => Deno.resolveDns(h, t) : undefined, fetch: (u, i) => fetch(u, i) }),
  fetch: (url, init) => fetch(url, init),
};

type Adm = ReturnType<typeof createClient>;
const ler = async <T>(p: PromiseLike<{ data: T | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>, nome: string): Promise<T> => { const { data, error } = await p; if (error) throw erroDoBanco(nome, error); return (data ?? []) as T; };

function bancoColetaSupabase(adm: Adm): BancoColeta {
  return {
    lojas: (uid) => ler(adm.from("radar_lojas").select("id,nome,dominio,coleta_permitida,ativa").eq("dono", uid), "radar_lojas"),
    ofertas: (uid) => ler(adm.from("radar_ofertas").select("id,item_id,loja_id,url,situacao,equivalencia").eq("dono", uid), "radar_ofertas"),
    ultimas: (uid) => ler(adm.from("radar_precos").select("oferta_id,modalidade,meio,parcelas,preco_produto,disponibilidade,observado_em,fonte").eq("dono", uid).order("observado_em", { ascending: false }).limit(5000), "radar_precos"),
    coletasRecentes: (uid, desde) => ler(adm.from("radar_coletas").select("loja_id,status,iniciada_em").eq("dono", uid).gte("iniciada_em", desde), "radar_coletas"),
    async abrirColeta(uid, lojaId, origem, iniciadaEm) {
      const { data, error } = await adm.from("radar_coletas").insert({ dono: uid, loja_id: lojaId, origem, status: "em_andamento", iniciada_em: iniciadaEm }).select("id").single();
      if (error || !data) throw erroDoBanco("radar_coletas(abrir)", error);
      return data.id as string;
    },
    async fecharColeta(id, r) {
      const { error } = await adm.from("radar_coletas").update(r).eq("id", id);
      if (error) throw erroDoBanco("radar_coletas(fechar)", error);
    },
    async gravarPreco(uid, o) {
      const { error } = await adm.from("radar_precos").insert({ ...o, dono: uid });
      if (!error) return "gravado";
      if (error.code === "23505") return "duplicado"; // índice único: a mesma observação nunca entra duas vezes
      throw erroDoBanco("radar_precos(gravar)", error);
    },
  };
}

/* aviso: configuração e controle de duplicidade ficam em "pessoal" (sem migration); a reserva usa conferência de versão (coluna atualizado) */
function bancoAvisosSupabase(adm: Adm): BancoAvisos {
  const pessoal = async (uid: string, chave: string) => { const { data, error } = await adm.from("pessoal").select("valor,atualizado").eq("user_id", uid).eq("chave", chave).maybeSingle(); if (error) throw erroDoBanco("pessoal(" + chave + ")", error); return data; };
  return {
    async config(uid) { return configPadrao((await pessoal(uid, "radar-config"))?.valor); },
    async precos(uid) {
      const out: unknown[] = [];
      for (let de = 0; de < 20000; de += 1000) { const l = await ler<unknown[]>(adm.from("radar_precos").select("*").eq("dono", uid).order("observado_em").order("id").range(de, de + 999), "radar_precos"); out.push(...l); if (l.length < 1000) break; }
      return out as never;
    },
    ofertas: (uid) => ler(adm.from("radar_ofertas").select("id,item_id,situacao,equivalencia,vendedor").eq("dono", uid), "radar_ofertas"),
    itens: (uid) => ler(adm.from("radar_itens").select("id,nome").eq("dono", uid).eq("ativo", true), "radar_itens"),
    async pagos(uid) { const v = (await pessoal(uid, "radar-pagos"))?.valor; return v && typeof v === "object" ? v : {}; },
    async avisados(uid) {
      const r = await pessoal(uid, "radar-avisos"), v = r?.valor ?? {};
      return { chaves: Array.isArray(v.chaves) ? v.chaves.filter((x: unknown) => typeof x === "string") : [], ultimoDia: typeof v.ultimoDia === "string" ? v.ultimoDia : null, versao: r?.atualizado ?? null };
    },
    async gravarAvisados(uid, v, versaoLida) {
      const agora = new Date().toISOString();
      if (versaoLida === null) { // primeira vez: a chave primária impede duas reservas
        const { error } = await adm.from("pessoal").insert({ user_id: uid, chave: "radar-avisos", valor: v, atualizado: agora });
        if (!error) return true; if (error.code === "23505") return false; throw erroDoBanco("pessoal(radar-avisos insert)", error);
      }
      const { data, error } = await adm.from("pessoal").update({ valor: v, atualizado: agora }).eq("user_id", uid).eq("chave", "radar-avisos").eq("atualizado", versaoLida).select("chave");
      if (error) throw erroDoBanco("pessoal(radar-avisos update)", error);
      return (data ?? []).length > 0; // 0 linhas: outra execução mudou antes
    },
  };
}

/* descoberta (048, aplicada em produção em 12/11/2026; a função ainda não foi republicada): consultas ao provedor e candidatos. Sem a migration as tabelas não existem e a função responde "migracao_pendente" em vez de falhar. */
const COLUNAS_CAND = ["provedor", "engine", "id_externo", "pai_externo", "titulo", "loja", "link", "link_tipo", "preco", "preco_texto", "moeda", "preco_original", "desconto_texto", "frete_situacao", "frete_valor", "frete_texto", "total", "pagamento_texto",
  "parcelamento_texto", "entrega_texto", "detalhes", "avaliacao", "avaliacoes", "tipo_oferta", "relevancia", "quantidade", "medida_valor", "medida_unidade", "composicao", "preco_por_medida", "base_medida", "grupo_chave", "chave_dedup", "catalogo",
  "varias_fontes", "product_id", "page_token", "token_observado_em", "evidencias", "sinais", "observado_em", "precos_anteriores", "produto_chave", "apresentacao_chave"] as const;
const linhaCand = (c: Record<string, unknown>) => Object.fromEntries(COLUNAS_CAND.map((k) => [k, c[k] ?? null]));
type ErroPg = { code?: string; message?: string; details?: string; hint?: string } | null;
function bancoDescobertaSupabase(adm: Adm): BancoDesc {
  const falha = (nome: string, err: ErroPg) => { if (err?.code === "42P01" || err?.code === "42883" || err?.code === "PGRST202" || /does not exist|schema cache|could not find the function/i.test(err?.message ?? "")) { const x = new Error("migration 048 não aplicada"); x.name = "MigracaoPendente"; return x; } return erroDoBanco(nome, err); };
  return {
    async item(uid, id) { const { data, error } = await adm.from("radar_itens").select("id,nome,marca,modelo,apresentacao,gtin,ativo").eq("dono", uid).eq("id", id).maybeSingle(); if (error) throw erroDoBanco("radar_itens(descoberta)", error); return (data as never) ?? null; },
    async itensParaRotina(uid, max) {
      const { data: its, error } = await adm.from("radar_itens").select("id,nome,marca,modelo,apresentacao,gtin,ativo").eq("dono", uid).eq("ativo", true).eq("origem", "monitorado").limit(200); if (error) throw erroDoBanco("radar_itens(rotina)", error);
      const { data: cs, error: ec } = await adm.from("radar_consultas").select("item_id,iniciada_em").eq("dono", uid).eq("engine", "google_shopping").order("iniciada_em", { ascending: false }).limit(500); if (ec) throw falha("radar_consultas(rotina)", ec);
      const ultima = new Map<string, string>(); for (const c of cs ?? []) if (!ultima.has(c.item_id as string)) ultima.set(c.item_id as string, c.iniciada_em as string);
      return ((its ?? []) as { id: string }[]).sort((a, b) => ((ultima.get(a.id) ?? "") < (ultima.get(b.id) ?? "") ? -1 : 1)).slice(0, max) as never;
    },
    async config(uid) { const { data, error } = await adm.from("pessoal").select("valor").eq("user_id", uid).eq("chave", "radar-descoberta").maybeSingle(); if (error) throw erroDoBanco("pessoal(radar-descoberta)", error); return data?.valor ?? {}; },
    async usos(uid, desde) { const { data, error } = await adm.from("radar_consultas").select("iniciada_em,buscas_gastas,engine,origem,provedor").eq("dono", uid).gt("buscas_gastas", 0).gte("iniciada_em", desde).limit(5000); if (error) throw falha("radar_consultas(usos)", error); return (data ?? []) as never; },
    /* ORÇAMENTO ATÔMICO: a reserva (limites + cache + consulta em andamento + gravação) é UMA função do banco sob trava por dono; o JavaScript só pede (048) */
    async reservar(uid, p) {
      const { data, error } = await adm.rpc("radar_reservar_consulta", { p_dono: uid, p_item_id: p.item_id, p_provedor: p.provedor, p_engine: p.engine, p_origem: p.origem, p_variante: p.variante, p_chave_cache: p.chave_cache, p_consulta: p.consulta,
        p_custo: p.custo, p_limites: p.limites, p_forcar: p.forcar, p_cache_desde: p.cache_desde, p_agora: null });  /* o relógio que vale é o do banco (now()), não o da função */
      if (error || !data || typeof data !== "object") throw falha("radar_reservar_consulta", error);
      return data as never;
    },
    async concluir(uid, id, c) { const { data, error } = await adm.rpc("radar_concluir_consulta", { p_dono: uid, p_id: id, p_status: c.status, p_http: c.http, p_erro_codigo: c.codigo, p_erro_mensagem: c.mensagem, p_resultados: c.resultados, p_duracao_ms: c.duracao_ms }); if (error) throw falha("radar_concluir_consulta", error); return data === true; },
    async registrarConsulta(uid, c) { const { data, error } = await adm.from("radar_consultas").insert({ ...c, dono: uid }).select("id").single(); if (error || !data) throw falha("radar_consultas(registrar)", error); return data.id as string; },
    async candidatoPorId(uid, id) { const { data, error } = await adm.from("radar_candidatos").select("*").eq("dono", uid).eq("id", id).maybeSingle(); if (error) throw falha("radar_candidatos(ler)", error); return (data as never) ?? null; },
    async gravarCandidatos(uid, itemId, consultaId, lista) {
      const { data: ex, error } = await adm.from("radar_candidatos").select("*").eq("dono", uid).eq("item_id", itemId).limit(3000); if (error) throw falha("radar_candidatos(existentes)", error);
      const { inserir, atualizar } = prepararGravacao((ex ?? []) as CandRow[], lista);
      for (let i = 0; i < inserir.length; i += 100) { const { error: ei } = await adm.from("radar_candidatos").insert(inserir.slice(i, i + 100).map((c) => ({ ...linhaCand(c as never), dono: uid, item_id: itemId, consulta_id: consultaId }))); if (ei) throw falha("radar_candidatos(inserir)", ei); }
      for (const c of atualizar) { const { error: eu } = await adm.from("radar_candidatos").update({ ...linhaCand(c as never), consulta_id: consultaId }).eq("dono", uid).eq("id", c.id); if (eu) throw falha("radar_candidatos(atualizar)", eu); }
      return { novos: inserir.length, atualizados: atualizar.length };
    },
    async ultimasObservacoes(uid, itemId) {
      const { data, error } = await adm.from("radar_historico").select("provedor,id_externo,loja,preco,observado_em").eq("dono", uid).eq("item_id", itemId).order("observado_em", { ascending: false }).limit(5000); if (error) throw falha("radar_historico(ultimas)", error);
      const m: Record<string, UltimaObs> = {}; for (const o of data ?? []) { const k = chaveObservacao(o as never); if (!(k in m)) m[k] = { preco: o.preco == null ? null : Number(o.preco), observado_em: o.observado_em as string }; } return m;
    },
    async inserirHistorico(uid, itemId, consultaId, obs) { for (let i = 0; i < obs.length; i += 100) { const { error } = await adm.from("radar_historico").insert(obs.slice(i, i + 100).map((o) => ({ ...o, dono: uid, item_id: itemId, consulta_id: consultaId }))); if (error) throw falha("radar_historico(inserir)", error); } },
    async invalidarToken(uid, id) { await adm.from("radar_candidatos").update({ page_token: null, token_observado_em: null }).eq("dono", uid).eq("id", id); },
  };
}

/* push: só lê as chaves VAPID e as inscrições do dono (push.ts); nunca cria chave */
function bancoPushSupabase(adm: Adm): BancoPush {
  return {
    async vapid() { const { data, error } = await adm.from("rac_segredos").select("valor").eq("chave", "vapid").maybeSingle(); if (error) throw erroDoBanco("rac_segredos", error); return (data?.valor as never) ?? null; },
    inscricoes: (uid) => ler(adm.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", uid), "push_inscricoes"),
    async apagarInscricao(uid, id) { await adm.from("push_inscricoes").delete().eq("id", id).eq("user_id", uid); },
  };
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  let etapa = "inicio";
  try {
    etapa = "ambiente";
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("SUPABASE_URL ausente");
    if (!chaveServidor(ambiente)) throw new Error("chave de servidor ausente");
    etapa = "cliente_supabase";
    const adm = createClient(url, chaveServidor(ambiente), { auth: { persistSession: false } });
    etapa = "ler_corpo";
    const texto = await req.text();
    if (texto.length > 20_000) return json({ ok: false, erro: "muito_grande" }, 413);
    let corpo: Record<string, unknown>; try { corpo = JSON.parse(texto); } catch (_) { return json({ ok: false, erro: "entrada_invalida" }, 400); }

    const senha = req.headers.get("x-rac-rotina");
    if (senha !== null) {
      etapa = "rotina_rpc_rac_rotina_ok";
      const { data: ok, error: erroRpc } = await adm.rpc("rac_rotina_ok", { segredo: senha });
      if (erroRpc) throw erroDoBanco("rac_rotina_ok", erroRpc);
      if (ok !== true) return json({ ok: false, erro: "nao_autenticado" }, 401);
      if (corpo.tipo !== "rodada") return json({ ok: false, erro: "entrada_invalida" }, 400);
      etapa = "rotina_listar_donos";
      const [a, m] = await Promise.all([adm.from("radar_lojas").select("dono"), adm.from("membros").select("membro")]);
      if (a.error) throw erroDoBanco("radar_lojas(donos)", a.error);
      if (m.error) throw erroDoBanco("membros(donos)", m.error);
      const membros = new Set((m.data ?? []).map((x) => x.membro as string));
      const donos = [...new Set((a.data ?? []).map((x) => x.dono as string))].filter((d) => !membros.has(d));
      etapa = "rotina_rodada";
      const chaveSerp = ambiente("SERPAPI_API_KEY") ?? "";
      const descoberta: ContextoDescoberta | undefined = chaveSerp ? { banco: bancoDescobertaSupabase(adm), fetch: (u, i) => fetch(u, i), chave: chaveSerp, agora: () => Date.now() } : undefined;
      const contexto = { coleta: bancoColetaSupabase(adm), avisos: bancoAvisosSupabase(adm), push: bancoPushSupabase(adm), deps, agora: () => Date.now(), descoberta }, resultado: Record<string, unknown> = {};
      for (const d of donos) { etapa = "rotina_rodada_dono_" + d.slice(0, 8); const r = await rodadaDoDono(d, contexto); resultado[d.slice(0, 8)] = r;
        for (const passo of ["coleta", "descoberta", "aviso"]) { const erro = (r[passo] as { erro?: string } | undefined)?.erro; if (erro) console.error(JSON.stringify(registroDeErro("rodada_" + passo, new Error(erro)))); } }
      return json({ ok: true, resultado });
    }

    etapa = "login_jwt";
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const publico = createClient(url, chavePublica(ambiente), { auth: { persistSession: false } });
    const { data: u, error: eu } = await publico.auth.getUser(jwt);
    if (eu || !u?.user?.id) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const uid = u.user.id;
    etapa = "login_membro";
    const { data: mem } = await adm.from("membros").select("dono").eq("membro", uid).maybeSingle();
    if (mem) return json({ ok: false, erro: "sem_permissao" }, 403); // a casa não usa o Radar
    if (typeof corpo.tipo === "string" && ["descobrir", "expandir", "uso_descoberta", "cota_provedor"].includes(corpo.tipo)) {
      /* descoberta de ofertas pelo provedor (SerpApi): só o dono; a chave vem do Secret SERPAPI_API_KEY (só o nome aparece aqui) e nunca sai da função */
      etapa = "descoberta_" + corpo.tipo;
      const ctx: ContextoDescoberta = { banco: bancoDescobertaSupabase(adm), fetch: (u, i) => fetch(u, i), chave: ambiente("SERPAPI_API_KEY") ?? "", agora: () => Date.now() };
      const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      try {
        if (corpo.tipo === "uso_descoberta") return json(await usoDescoberta(uid, ctx));
        if (corpo.tipo === "cota_provedor") return json(await cotaDoProvedor(ctx));
        if (!ctx.chave) return json({ ok: false, erro: "sem_chave_serpapi", mensagem: "O Secret SERPAPI_API_KEY não está cadastrado na função." });
        if (corpo.tipo === "descobrir") {
          if (!uuid(corpo.item_id)) return json({ ok: false, erro: "entrada_invalida" }, 400);
          const variantes = Array.isArray(corpo.variantes) ? corpo.variantes.filter((x: unknown): x is string => typeof x === "string").slice(0, 3) : undefined;
          return json(await descobrir(uid, { item_id: corpo.item_id, variantes, forcar: corpo.forcar === true }, ctx));
        }
        if (!uuid(corpo.candidato_id)) return json({ ok: false, erro: "entrada_invalida" }, 400);
        return json(await expandir(uid, { candidato_id: corpo.candidato_id, engine: corpo.engine === "produto" ? "produto" : "imersivo", forcar: corpo.forcar === true }, ctx));
      } catch (e) {
        if ((e as Error)?.name === "MigracaoPendente") return json({ ok: false, erro: "migracao_pendente", mensagem: "A migration 048 (descoberta) ainda não foi aplicada no banco." });
        throw e;
      }
    }
    if (corpo.tipo !== "ler_url" || typeof corpo.url !== "string") return json({ ok: false, erro: "entrada_invalida" }, 400);
    const { data: lojas, error: el } = await adm.from("radar_lojas").select("dominio").eq("dono", uid).not("dominio", "is", null);
    if (el) throw erroDoBanco("radar_lojas(dominios)", el);
    etapa = "ler_url";
    const dominios = (lojas ?? []).map((l) => l.dominio as string).filter(Boolean);
    const pag = await lerPagina(corpo.url, dominios, deps);
    if (!pag.ok) return json({ ok: false, erro: pag.codigo, motivo: pag.motivo });
    return json({ ok: true, urlFinal: pag.urlFinal, extraido: extrairPagina(pag.html, pag.urlFinal) });
  } catch (e) {
    console.error(JSON.stringify(registroDeErro(etapa, e)));
    return json({ ok: false, erro: "interno" }, 500);
  }
});
