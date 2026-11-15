// RAC Inbox: o serviço da função "rac-inbox" (docs/inbox.md). Puro e testado (tests/inbox_cofre_servico.test.mjs e tests/inbox_sync_servico.test.mjs): o cofre (Vault), o banco, o Worker e o registro entram como
// dependências, então os testes usam versões de mentira e provam: a credencial nunca sai em resposta, erro ou registro; conta sem credencial nunca chega ao Worker; falha do cofre
// interrompe a operação sem alternativa; só uma sincronização por conta ao mesmo tempo. SEM estado global: nada é guardado entre chamadas, e o segredo descriptografado vive só em variáveis locais de uma chamada.
import { aalOk as _aalOk, desempacotar, empacotar, ERROS, erroDoCofre, validarPedido, VERSAO_FUNCAO } from "./contrato.ts";
import { filtrarAnexo, filtrarLeitura, filtrarPastas, sincronizarPasta, type AplicacaoSync } from "./sync.ts";

export type EstadoCredencial = "ausente" | "ativa" | "invalida";
export interface Cofre {
  guardar(dono: string, conta: string, segredo: string): Promise<void>;
  ler(dono: string, conta: string): Promise<string | null>;
  remover(dono: string, conta: string): Promise<boolean>;
  estado(dono: string, conta: string): Promise<EstadoCredencial>;
  marcar(dono: string, conta: string, estado: "ativa" | "invalida"): Promise<void>;
}
export type ResultadoWorker = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };
export interface Worker {
  executar(operacao: string, pedido: Record<string, unknown>, credencial: { usuario: string; senha: string } | null): Promise<ResultadoWorker>;
}
/* o cache de cabeçalhos e o cursor (tabelas da 051/053); a implementação SQL é de repositorio.ts */
export interface PastaSalva { id: string; nome_externo: string; nome_exibicao: string; uso: string }
export interface Banco {
  pasta(dono: string, conta: string, pastaId: string): Promise<{ id: string; nome_externo: string } | null>;
  salvarPastas(dono: string, conta: string, pastas: Array<{ nome: string; nome_exibicao: string; uso: string; selecionavel: boolean }>): Promise<PastaSalva[]>;
  estadoSync(dono: string, conta: string, pastaId: string): Promise<{ uidvalidity: number | null; uidnext: number | null; reconciliada_em?: string | null } | null>;
  semMudanca?(dono: string, conta: string, pastaId: string, a: { uidvalidity: number; uidnext: number; total: number; duracao_ms: number | null }): Promise<void>;   // só a rotina (modo agenda)
  travar(conta: string): Promise<boolean>;
  destravar(conta: string): Promise<void>;
  aplicarSync(dono: string, conta: string, pastaId: string, a: AplicacaoSync): Promise<{ novas: number; atualizadas: number; removidas: number }>;
  falhaSync(dono: string, conta: string, pastaId: string, erro: string): Promise<void>;
  estadoConta(dono: string, conta: string, estado: "conectada" | "erro_autenticacao" | "atrasada", erro: string | null): Promise<void>;
}
export interface Contexto {
  usuario: { id: string; mfaOk: boolean } | null;   // já autenticado pelo index.ts (JWT validado)
  cofre: Cofre;
  banco?: Banco | null;                             // cache e cursor; ausente = operações que dependem dele respondem "banco_indisponivel"
  worker: Worker | null;                            // null se o canal assinado não está configurado (sem URL ou sem chave)
  registrar: (e: { operacao: string; codigo: string; status: number; detalhe?: string }) => void;   // SÓ operação, código fechado, status e, se houver, o código FECHADO do Worker (nunca texto)
}
export type Resposta = { status: number; corpo: Record<string, unknown> };

/* códigos do Worker (lista fechada) e o que a função faz com cada um */
export const AUTENTICACAO_RECUSADA = ["autenticacao_recusada", "autenticacao_falhou", "login_recusado", "credencial_recusada"];
export const REPASSA = ["pasta_inexistente", "mensagem_inexistente", "parte_inexistente", "anexo_grande_demais", "uidvalidity_mudou"];   // informativos e seguros: o navegador sabe lidar
export const CANAL_RECUSADO = ["assinatura_invalida", "chave_desconhecida", "timestamp_fora_da_janela", "cabecalhos_invalidos", "replay", "canal_nao_configurado", "operacao_divergente"];
const UID_MAX = 4294967295, RE_COD = /^[a-z][a-z0-9_]{1,40}$/, RE_DETALHE = /^(?:[a-z][a-z0-9_]{1,40}|http_\d{3})$/, RE_VERSAO = /^[a-z0-9@._-]{1,60}$/;   // detalhe = código fechado do Worker ou "http_NNN"
const uidOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= UID_MAX;
const inteiroOuNulo = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/* só copia o que conhece (esquema fechado): o que o Worker responder além disso nunca chega ao navegador */
export function filtrarResposta(operacao: string, dados: Record<string, unknown>): Record<string, unknown> | null {
  if (operacao === "estado_pasta") {
    const ex = dados.exame as Record<string, unknown> | undefined;
    if (!ex || !uidOk(ex.uidvalidity) || !uidOk(ex.uidnext)) return null;
    return { exame: { uidvalidity: ex.uidvalidity, uidnext: ex.uidnext }, mensagens_na_pasta: inteiroOuNulo(dados.mensagens_na_pasta), duracao_ms: inteiroOuNulo(dados.duracao_ms) };
  }
  if (operacao === "ler_mensagem") return filtrarLeitura(dados);
  if (operacao === "baixar_anexo") return filtrarAnexo(dados);
  return {};   // testar_conta: só o "ok"
}

export async function atender(corpo: unknown, ctx: Contexto): Promise<Resposta> {
  let operacao = "desconhecida";
  const falha = (codigo: string, detalhe?: string): Resposta => {
    const status = ERROS[codigo] ?? 500;
    try { ctx.registrar(detalhe && RE_DETALHE.test(detalhe) ? { operacao, codigo, status, detalhe } : { operacao, codigo, status }); } catch (_) { /* o registro nunca derruba a resposta */ }
    return { status, corpo: { ok: false, erro: codigo } };
  };
  const sucesso = (extra: Record<string, unknown>): Resposta => {
    try { ctx.registrar({ operacao, codigo: "ok", status: 200 }); } catch (_) { /* idem */ }
    return { status: 200, corpo: { ok: true, ...extra } };
  };
  let travada: string | null = null;
  try {
    if (!ctx.usuario) return falha("sem_login");
    const v = validarPedido(corpo);
    if (typeof (corpo as Record<string, unknown> | null)?.operacao === "string" && /^[a-z_]{1,40}$/.test((corpo as Record<string, string>).operacao)) operacao = (corpo as Record<string, string>).operacao;
    if (!v.ok) return falha(v.erro);
    const p = v.pedido, dono = ctx.usuario.id;
    if (!ctx.usuario.mfaOk) return falha("mfa_requerido");

    /* ---- prova do CANAL com o Worker: não lê o Vault, não toca no banco, não leva credencial e não abre o IMAP ---- */
    if (p.operacao === "testar_canal") {
      if (!ctx.worker) return falha("worker_nao_configurado");
      let r: ResultadoWorker;
      try { r = await ctx.worker.executar("ping", {}, null); } catch (e) { return falha("servico_indisponivel", detalheDe(e)); }
      if (!r.ok) return falha(CANAL_RECUSADO.includes(r.erro) ? "canal_recusado" : "servico_indisponivel", r.erro);
      const d = r.dados, w = typeof d.worker === "string" && RE_VERSAO.test(d.worker) ? d.worker : null;
      if (d.canal !== "ok" || !w) return falha("servico_indisponivel", "resposta_invalida");
      return sucesso({ canal: "ok", funcao: VERSAO_FUNCAO, worker: w });
    }

    /* ---- ciclo da credencial ---- */
    if (p.operacao === "credencial_guardar") {
      try { await ctx.cofre.guardar(dono, p.conta_id, empacotar(p.usuario, p.senha_app)); } catch (e) { return falha(codigoDe(e)); }
      return sucesso({ credencial: "guardada" });   // nunca devolve a credencial
    }
    if (p.operacao === "credencial_remover") {
      try { return sucesso({ removida: await ctx.cofre.remover(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }
    if (p.operacao === "credencial_estado") {
      try { return sucesso({ credencial: await ctx.cofre.estado(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }

    /* ---- operações no provedor (SÓ LEITURA): precisam do Worker, da credencial guardada e (as de pasta) do banco ---- */
    if (!ctx.worker) return falha("worker_nao_configurado");   // antes de abrir o cofre: sem canal para o Worker, o segredo nem é lido
    const worker = ctx.worker, banco = ctx.banco ?? null, conta = p.conta_id;
    const precisaBanco = p.operacao !== "testar_conta";
    if (precisaBanco && !banco) return falha("banco_indisponivel");
    if (p.operacao === "sincronizar_pasta") {
      // só uma sincronização por conta ao mesmo tempo (as duas esperam o mesmo cursor)
      try { if (!(await banco!.travar(conta))) return falha("sincronizacao_em_andamento"); travada = conta; } catch (_) { return falha("banco_indisponivel"); }
    }
    let bruto: string | null;
    try { bruto = await ctx.cofre.ler(dono, conta); } catch (e) { return falha(codigoDe(e)); }
    if (bruto === null) return falha("credencial_ausente");    // conta sem credencial não inicia operação IMAP
    let cred = desempacotar(bruto);
    bruto = null;
    if (!cred) return falha("credencial_corrompida");
    const credencial = cred;

    /* traduz o resultado do Worker: recusa de login marca a credencial; o resto vira código fechado */
    const traduzir = async (r: Extract<ResultadoWorker, { ok: false }>): Promise<Resposta> => {
      if (AUTENTICACAO_RECUSADA.includes(r.erro)) {
        try { await ctx.cofre.marcar(dono, conta, "invalida"); } catch (_) { /* o estado fica como está */ }
        try { await banco?.estadoConta(dono, conta, "erro_autenticacao", "credencial_invalida"); } catch (_) { /* idem */ }
        return falha("credencial_invalida");
      }
      if (REPASSA.includes(r.erro)) return falha(r.erro, r.erro);
      if (CANAL_RECUSADO.includes(r.erro)) return falha("canal_recusado", r.erro);
      return falha("servico_indisponivel", r.erro);
    };
    const marcarAtiva = async () => { try { await ctx.cofre.marcar(dono, conta, "ativa"); } catch (_) { /* a resposta continua controlada */ } };
    const chamar = async (op: string, ped: Record<string, unknown>): Promise<ResultadoWorker> => {
      try { return await worker.executar(op, { conta_id: conta, ...ped }, credencial); } catch (e) { return { ok: false, erro: detalheDe(e) }; }   // a mensagem do erro (que poderia conter o segredo) é descartada
    };
    const pastaDe = async (pastaId: string) => { try { return await banco!.pasta(dono, conta, pastaId); } catch (_) { return undefined; } };

    if (p.operacao === "testar_conta") {
      const r = await chamar("testar_conta", {});
      cred = null;
      if (!r.ok) return await traduzir(r);
      await marcarAtiva();
      return sucesso({});
    }

    if (p.operacao === "listar_pastas") {
      const r = await chamar("listar_pastas", {});
      if (!r.ok) { cred = null; return await traduzir(r); }
      const lista = filtrarPastas(r.dados.pastas);
      cred = null;
      if (!lista) return falha("servico_indisponivel");
      let salvas;
      try { salvas = await banco!.salvarPastas(dono, conta, lista); } catch (_) { return falha("banco_indisponivel"); }
      await marcarAtiva();
      return sucesso({ pastas: salvas.map((s) => ({ id: s.id, nome: s.nome_exibicao, uso: s.uso })) });
    }

    // as demais operações são de UMA pasta (já validada como UUID); o nome da pasta no provedor vem do banco, nunca do navegador
    const pastaId = (p as { pasta_id: string }).pasta_id, pasta = await pastaDe(pastaId);
    if (pasta === undefined) return falha("banco_indisponivel");
    if (pasta === null) return falha("pasta_inexistente");

    if (p.operacao === "sincronizar_pasta") {
      let r;
      try { r = await sincronizarPasta({ dono, conta, pastaId, worker: { executar: (op, ped, c) => worker.executar(op, ped, c) }, banco: banco!, credencial }); }
      catch (e) { cred = null; try { await banco!.falhaSync(dono, conta, pastaId, "servico_indisponivel"); } catch (_e) { /* idem */ } return falha("servico_indisponivel", detalheDe(e)); }
      cred = null;
      if (!r.ok) {
        const resp = await traduzir(r);
        const cod = (resp.corpo as { erro?: string }).erro;
        if (cod && RE_COD.test(cod) && cod !== "credencial_invalida") { try { await banco!.falhaSync(dono, conta, pastaId, cod); await banco!.estadoConta(dono, conta, "atrasada", cod); } catch (_) { /* idem */ } }
        return resp;
      }
      await marcarAtiva();
      try { await banco!.estadoConta(dono, conta, "conectada", null); } catch (_) { /* idem */ }
      return sucesso(r.dados);
    }

    // estado_pasta, ler_mensagem e baixar_anexo: uma chamada ao Worker; o UIDVALIDITY esperado é o do cursor (mensagem de outra "geração" da pasta não é lida)
    let est;
    try { est = await banco!.estadoSync(dono, conta, pastaId); } catch (_) { return falha("banco_indisponivel"); }
    const extra: Record<string, unknown> = { pasta: pasta.nome_externo };
    if (est && est.uidvalidity !== null && p.operacao !== "estado_pasta") extra.uidvalidity_esperado = est.uidvalidity;
    if (p.operacao === "ler_mensagem" || p.operacao === "baixar_anexo") extra.uid = p.uid;
    if (p.operacao === "baixar_anexo") extra.parte = p.parte;
    const r = await chamar(p.operacao, extra);
    cred = null;
    if (!r.ok) return await traduzir(r);
    const dados = filtrarResposta(p.operacao, r.dados ?? {});
    if (!dados) return falha("servico_indisponivel");
    await marcarAtiva();
    return sucesso(dados);
  } catch (_) {
    return falha("interno");   // qualquer imprevisto: código fixo, sem mensagem
  } finally {
    if (travada) { try { await ctx.banco?.destravar(travada); } catch (_) { /* a conexão se fecha no fim da chamada e o travamento some com ela */ } }
  }
}

/* a falha de rede do canal (canal.ts) tem mensagem FIXA: "canal_falhou", "resposta_invalida", "resposta_grande_demais" ou "http_NNN". Só isso vai para o registro; qualquer outra coisa vira "servico_indisponivel". */
export function detalheDe(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  return /^(canal_falhou|resposta_invalida|resposta_grande_demais|http_\d{3})$/.test(m) ? m : "servico_indisponivel";
}

/* erro vindo do cofre → código fechado (só o campo "codigo" do ErroCofre; a mensagem nunca é usada) */
function codigoDe(e: unknown): string {
  const c = e && typeof e === "object" ? (e as { codigo?: unknown }).codigo : undefined;
  return erroDoCofre(typeof c === "string" ? c : undefined);
}
export const aalOk = _aalOk;
