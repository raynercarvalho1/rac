// RAC Inbox: o serviço da função "rac-inbox" (docs/inbox.md). Puro e testado (tests/inbox_cofre_servico.test.mjs e tests/inbox_sync_servico.test.mjs): o cofre (Vault), o banco, o Worker e o registro entram como
// dependências, então os testes usam versões de mentira e provam: a credencial nunca sai em resposta, erro ou registro; conta sem credencial nunca chega ao Worker; falha do cofre
// interrompe a operação sem alternativa; só uma sincronização por conta ao mesmo tempo. SEM estado global: nada é guardado entre chamadas, e o segredo descriptografado vive só em variáveis locais de uma chamada.
import { aalOk as _aalOk, desempacotar, empacotar, ERROS, erroDoCofre, validarPedido, VERSAO_FUNCAO } from "./contrato.ts";
import { envioPuro } from "./envio.ts";
import { organizarPuro } from "./organizar.ts";
import { desempacotarOauth, empacotarOauth, hashDoEstado, identidade, novoPkce, renovarAcesso as _renovar, revogar, trocarCodigo, urlAutorizacao, type AmbienteOauth, type Http, type ProvedorOauth } from "./oauth.ts";
import { criarWorkerGmail, type BancoGmail } from "./gmail.ts";
import { criarWorkerOutlook } from "./outlook.ts";
import { filtrarAnexo, filtrarLeitura, filtrarPastas, sincronizarPasta, type AplicacaoSync } from "./sync.ts";

export type EstadoCredencial = "ausente" | "ativa" | "invalida";
export interface Cofre {
  guardar(dono: string, conta: string, segredo: string): Promise<void>;
  ler(dono: string, conta: string): Promise<string | null>;
  remover(dono: string, conta: string): Promise<boolean>;
  estado(dono: string, conta: string): Promise<EstadoCredencial>;
  marcar(dono: string, conta: string, estado: "ativa" | "invalida"): Promise<void>;
  /* I4 · OAuth (migration 063): o state de uso único e o verificador PKCE ficam no schema privado; opcionais para os contextos antigos */
  oauthAbrir?(dono: string, conta: string, estadoHash: string, verificador: string): Promise<string>;
  oauthConsumir?(dono: string, estadoHash: string): Promise<{ conta_id: string; provedor: string; verificador: string } | null>;
}
export type ResultadoWorker = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };
export interface Worker {
  executar(operacao: string, pedido: Record<string, unknown>, credencial: { usuario: string; senha: string } | null, opcoes?: { timeoutMs?: number }): Promise<ResultadoWorker>;   // opcoes.timeoutMs só ENCURTA o limite do canal (a rotina usa para respeitar o prazo)
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
  /* I3 · envio (migration 056). Opcionais para que os contextos antigos (rotina, testes de leitura) continuem válidos; sem elas o envio responde "registro_envio_indisponivel" */
  contaEndereco?(dono: string, conta: string): Promise<string | null>;
  /* I4 lote 2 (Gmail): uid sintético por pasta (BancoGmail, em gmail.ts); a mesma conexão do banco */
  pastaIdPorNome?: BancoGmail["pastaIdPorNome"]; idsExternos?: BancoGmail["idsExternos"]; maiorUid?: BancoGmail["maiorUid"]; idExterno?: BancoGmail["idExterno"];
  contaProvedor?(dono: string, conta: string): Promise<{ provedor: string; endereco: string } | null>;   // I4: o provedor da conta (icloud, gmail, outlook)
  pastaPorUso?(dono: string, conta: string, uso: string): Promise<{ id: string; nome_externo: string } | null>;
  envioIniciar?(dono: string, conta: string, envioId: string, a: { message_id: string; modo: string; destinatarios: number }): Promise<{ novo: boolean; estado: "pendente" | "enviado" | "falha" | "incerto"; message_id: string } | null>;
  envioFinalizar?(dono: string, conta: string, envioId: string, estado: "enviado" | "falha" | "incerto", codigo: string | null): Promise<void>;
  /* I3.2 · gerenciamento (sem migration: usa as tabelas 051/053). Opcionais pelo mesmo motivo do envio: sem elas, "organizar_mensagem" responde "banco_indisponivel" */
  pastaDetalhe?(dono: string, conta: string, pastaId: string): Promise<{ id: string; nome_externo: string; uso: string } | null>;
  mensagemRef?(dono: string, conta: string, pastaId: string, uid: number): Promise<{ id: string; uid: number; uidvalidity: number | null; message_id: string | null; tamanho: number | null; lida: boolean } | null>;
  aplicarOrganizacao?(dono: string, conta: string, a: AplicacaoOrganizacao): Promise<void>;
}
export type AplicacaoOrganizacao =
  | { tipo: "lida"; mensagemId: string; pastaId: string; lida: boolean }
  | { tipo: "mover"; mensagemId: string; pastaId: string; destinoPastaId: string; destinoUidvalidity?: number; destinoUid?: number };
export interface Contexto {
  usuario: { id: string; mfaOk: boolean } | null;   // já autenticado pelo index.ts (JWT validado)
  cofre: Cofre;
  banco?: Banco | null;                             // cache e cursor; ausente = operações que dependem dele respondem "banco_indisponivel"
  oauth?: AmbienteOauth;                            // I4: client id/secret e redirect de cada provedor (Secrets da função); ausente = "oauth_nao_configurado"
  http?: Http;                                      // I4: a rede do OAuth (os testes passam uma de mentira)
  worker: Worker | null;                            // null se o canal assinado não está configurado (sem URL ou sem chave)
  agora?: () => Date;                               // relógio (só os testes trocam)
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

    /* ---- I4 · conexão OAuth do Gmail e do Outlook: o código volta ao site, que o entrega aqui (JWT + MFA); a troca usa o client secret dos Secrets; só o refresh token vai ao Vault ---- */
    if (p.operacao === "oauth_iniciar" || p.operacao === "oauth_concluir") {
      const http = ctx.http, banco = ctx.banco;
      if (!banco?.contaProvedor || !ctx.cofre.oauthAbrir || !ctx.cofre.oauthConsumir) return falha("banco_indisponivel");
      if (!http) return falha("oauth_nao_configurado");
      if (p.operacao === "oauth_iniciar") {
        let c; try { c = await banco.contaProvedor(dono, p.conta_id); } catch (_) { return falha("banco_indisponivel"); }
        if (!c) return falha("conta_inexistente");
        if (c.provedor !== "gmail" && c.provedor !== "outlook") return falha("provedor_invalido");
        const cfg = ctx.oauth?.[c.provedor as ProvedorOauth];
        if (!cfg) return falha("oauth_nao_configurado");
        const k = await novoPkce();
        try { await ctx.cofre.oauthAbrir(dono, p.conta_id, k.estadoHash, k.verificador); } catch (e) { return falha(codigoDe(e)); }
        return sucesso({ provedor: c.provedor, url: urlAutorizacao(c.provedor as ProvedorOauth, cfg, { estado: k.estado, desafio: k.desafio, loginHint: c.endereco }) });
      }
      let est; try { est = await ctx.cofre.oauthConsumir(dono, await hashDoEstado(p.state)); } catch (e) { return (e as { codigo?: string })?.codigo === "P0002" ? falha("oauth_estado_invalido") : falha(codigoDe(e)); }
      if (!est) return falha("oauth_estado_invalido");
      const prov = est.provedor as ProvedorOauth, cfg = ctx.oauth?.[prov];
      if (!cfg) return falha("oauth_nao_configurado");
      const t = await trocarCodigo(prov, cfg, { codigo: p.code, verificador: est.verificador }, http, (ctx.agora ?? (() => new Date()))().getTime());
      if (!t.ok) return falha(t.erro);
      if (!t.refresh) { await revogar(prov, t.acesso, http); return falha("oauth_recusado"); }   // sem refresh token a conta não ficaria conectada
      let c; try { c = await banco.contaProvedor(dono, est.conta_id); } catch (_) { return falha("banco_indisponivel"); }
      if (!c) return falha("conta_inexistente");
      const quem = await identidade(prov, t.acesso, http);
      if (!quem) return falha("oauth_indisponivel");
      if (quem !== c.endereco.toLowerCase()) { await revogar(prov, t.refresh, http); return falha("oauth_conta_divergente"); }   // outra conta foi autorizada: nada é guardado
      try { await ctx.cofre.guardar(dono, est.conta_id, empacotarOauth(t.refresh)); } catch (e) { return falha(codigoDe(e)); }
      try { await ctx.cofre.marcar(dono, est.conta_id, "ativa"); } catch (_) { /* o estado fica como está */ }
      try { await banco.estadoConta(dono, est.conta_id, "conectada", null); } catch (_) { /* idem */ }
      return sucesso({ conectada: true, provedor: prov });   // nunca devolve token
    }

    /* contas Gmail/Outlook não aceitam senha de app. Gmail e Outlook LEEM (conta, pastas, sincronização, mensagem, anexo); envio e gerenciamento ainda não existem para eles:
       respostas honestas, antes de ler o Vault ou chamar o Worker */
    let provedorConta = "icloud";
    const LEITURA_GMAIL = ["testar_conta", "listar_pastas", "estado_pasta", "sincronizar_pasta", "ler_mensagem", "baixar_anexo"];
    if (ctx.banco?.contaProvedor && p.operacao !== "credencial_estado" && p.operacao !== "credencial_remover") {
      let c; try { c = await ctx.banco.contaProvedor(dono, (p as { conta_id: string }).conta_id); } catch (_) { return falha("banco_indisponivel"); }
      if (!c) return falha("conta_inexistente");
      provedorConta = c.provedor;
      if (c.provedor !== "icloud") {
        if (p.operacao === "credencial_guardar") return falha("provedor_invalido");
        if ((c.provedor === "gmail" || c.provedor === "outlook") && LEITURA_GMAIL.includes(p.operacao)) { /* segue: adaptador do Gmail ou do Outlook (só leitura) */ }
        else if (["enviar_mensagem", "smtp_prova", "organizar_mensagem"].includes(p.operacao)) return falha("provedor_sem_operacao");
        else return falha("provedor_sem_leitura");
      }
    }

    /* ---- ciclo da credencial ---- */
    if (p.operacao === "credencial_guardar") {
      try { await ctx.cofre.guardar(dono, p.conta_id, empacotar(p.usuario, p.senha_app)); } catch (e) { return falha(codigoDe(e)); }
      return sucesso({ credencial: "guardada" });   // nunca devolve a credencial
    }
    if (p.operacao === "credencial_remover") {
      if (ctx.http && ctx.banco?.contaProvedor) {   // OAuth: revoga o token no Google (melhor esforço; a Microsoft não tem endpoint: ver docs) antes de apagar o segredo
        try {
          const c = await ctx.banco.contaProvedor(dono, p.conta_id);
          if (c?.provedor === "gmail") { const b = await ctx.cofre.ler(dono, p.conta_id), o = b ? desempacotarOauth(b) : null; if (o) await revogar("gmail", o.refresh, ctx.http); }
        } catch (_) { /* a remoção local acontece de qualquer jeito */ }
      }
      try { return sucesso({ removida: await ctx.cofre.remover(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }
    if (p.operacao === "credencial_estado") {
      try { return sucesso({ credencial: await ctx.cofre.estado(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }

    /* ---- operações no provedor (leitura; e, desde a I3.2, o gerenciamento de UMA mensagem por vez): precisam do Worker, da credencial guardada e (as de pasta) do banco ---- */
    const oauthLeitura = provedorConta === "gmail" || provedorConta === "outlook";
    if (!ctx.worker && !oauthLeitura) return falha("worker_nao_configurado");   // antes de abrir o cofre: sem canal para o Worker, o segredo nem é lido
    let worker = ctx.worker as Worker, banco = ctx.banco ?? null, conta = p.conta_id;
    const precisaBanco = p.operacao !== "testar_conta" && p.operacao !== "smtp_prova";   // (a prova só precisa do endereço da conta quando manda o teste: o envio.ts pede ao banco)
    if (precisaBanco && !banco) return falha("banco_indisponivel");
    if (p.operacao === "sincronizar_pasta") {
      // só uma sincronização por conta ao mesmo tempo (as duas esperam o mesmo cursor)
      try { if (!(await banco!.travar(conta))) return falha("sincronizacao_em_andamento"); travada = conta; } catch (_) { return falha("banco_indisponivel"); }
    }
    let bruto: string | null;
    try { bruto = await ctx.cofre.ler(dono, conta); } catch (e) { return falha(codigoDe(e)); }
    if (bruto === null) return falha("credencial_ausente");    // conta sem credencial não inicia operação
    let cred: { usuario: string; senha: string } | null;
    if (oauthLeitura) {
      /* Gmail e Outlook: o segredo é o refresh token; o token de ACESSO é pedido agora, vive só nesta chamada e nunca é guardado */
      const o = desempacotarOauth(bruto); bruto = null;
      if (!o) return falha("credencial_corrompida");
      const prov = provedorConta as ProvedorOauth, cfg = ctx.oauth?.[prov];
      const bg = banco?.pastaIdPorNome && banco.idsExternos && banco.maiorUid && banco.idExterno ? (banco as unknown as BancoGmail) : null;
      if (!cfg || !ctx.http || !bg) return falha(!bg ? "banco_indisponivel" : "oauth_nao_configurado");
      const t = await _renovar(prov, cfg, o.refresh, ctx.http, (ctx.agora ?? (() => new Date()))().getTime());
      if (!t.ok) {
        if (t.erro === "autenticacao_recusada") {
          try { await ctx.cofre.marcar(dono, conta, "invalida"); } catch (_) { /* o estado fica como está */ }
          try { await banco.estadoConta(dono, conta, "erro_autenticacao", "credencial_invalida"); } catch (_) { /* idem */ }
          return falha("credencial_invalida");
        }
        return falha("servico_indisponivel");
      }
      if (t.refreshNovo) { try { await ctx.cofre.guardar(dono, conta, empacotarOauth(t.refreshNovo)); } catch (_) { /* a Microsoft renova o refresh token a cada uso; se não gravar, o anterior segue valendo e a próxima operação tenta de novo */ } }
      const fabrica = prov === "outlook" ? criarWorkerOutlook : criarWorkerGmail;
      worker = fabrica({ acesso: t.acesso, http: ctx.http, banco: bg, dono, conta, agora: ctx.agora ? () => ctx.agora!().getTime() : undefined });
      cred = { usuario: "", senha: "" };   // o adaptador não usa login e senha
    } else {
      cred = desempacotar(bruto);
      bruto = null;
      if (!cred) return falha("credencial_corrompida");
    }
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

    if (p.operacao === "smtp_prova" || p.operacao === "enviar_mensagem") {
      const rr = await envioPuro({ p, dono, conta, credencial, worker, banco, agora: ctx.agora ?? (() => new Date()), marcarAtiva });
      cred = null;
      if (rr.tipo === "sucesso") return sucesso(rr.corpo);
      return falha(rr.codigo, rr.detalhe);
    }

    if (p.operacao === "organizar_mensagem") {   // I3.2: lida/não lida, arquivar, mover, Lixeira, Spam (organizar.ts); a credencial só vive nesta chamada
      const rr = await organizarPuro({ p, dono, conta, credencial, worker, banco, marcarAtiva,
        credencialRecusada: async () => { try { await ctx.cofre.marcar(dono, conta, "invalida"); } catch (_) { /* o estado fica como está */ } try { await banco?.estadoConta(dono, conta, "erro_autenticacao", "credencial_invalida"); } catch (_) { /* idem */ } } });
      cred = null;
      if (rr.tipo === "sucesso") return sucesso(rr.corpo);
      return falha(rr.codigo, rr.detalhe);
    }

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
