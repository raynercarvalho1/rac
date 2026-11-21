// RAC Inbox · sincronização automática e aviso de e-mail novo (docs/inbox.md, "Automático"). Lógica PURA e testada (tests/inbox_automatico.test.mjs): o cofre, o Worker, o banco, o Web Push e o relógio entram como
// dependências, então os testes provam com versões de mentira: nada depende de navegador aberto, só uma sincronização por conta ao mesmo tempo, falha de uma conta não derruba as outras, recuperação na rodada seguinte,
// credencial recusada vira estado (e a conta sai da rotina), a primeira leitura nunca avisa, nada é avisado duas vezes, o aviso não leva conteúdo do e-mail e a credencial nunca sai.
// A rotina é chamada pelo pg_cron (supabase/propostas/055_inbox_agendamento.sql) a cada 10 min com a senha da rotina; o Worker continua SÓ LEITURA (EXAMINE/FETCH BODY.PEEK): nada muda na caixa original.
import { desempacotar } from "./contrato.ts";
import { AUTENTICACAO_RECUSADA, CANAL_RECUSADO, REPASSA, detalheDe, type Banco, type Cofre, type ResultadoOauth, type Worker } from "./servico.ts";
import { sincronizarPasta } from "./sync.ts";
import type { Entrega, Msg } from "./push.ts";

/* o que o aviso precisa de uma mensagem, tudo do cache já gravado pela sincronização (nenhuma consulta nova ao provedor); o id é o da linha em inbox_mensagens_ref */
export interface Pendente { id: string; pasta_id: string; assunto: string | null; nome: string | null; endereco: string | null }
export interface ContaAuto { conta: string; dono: string; provedor: string; apelido: string; notificar: boolean; pasta_id: string; falhas: number; ultima_tentativa_em: string | null }
export interface BancoRotina {
  contasAutomaticas(): Promise<ContaAuto[]>;
  pendentes(dono: string, conta: string): Promise<Pendente[]>;                       // mensagens não lidas ainda não tratadas pelo aviso, da mais nova para a mais antiga (as lidas e as antigas já saem marcadas)
  marcarNotificadas(dono: string, conta: string, ids: string[]): Promise<void>;
  naoLidasEntrada(dono: string): Promise<number>;
  rotinaAutorizada(segredo: string): Promise<boolean>;
}
export interface Aviso { enviar(dono: string, msg: Msg): Promise<Entrega> }
export interface Resumo { contas: number; sincronizadas: number; sem_mudanca: number; novas: number; avisos: number; falhas: number; ignoradas: number; em_andamento: number }
/* TEMPO (tests/inbox_automatico.test.mjs confere estes números com a 055 e a documentação):
   ORCAMENTO_MS  = 45 s: depois disso não começa conta nova e a leitura por páginas para (o cursor só avança até onde leu);
   CHAMADA_MAX_MS = 40 s: limite de UMA chamada ao Worker (o Worker faz no máximo 25 s por sessão IMAP);
   PRAZO_DURO_MS = 90 s: nenhuma chamada ao Worker termina depois disso (cada chamada recebe min(40 s, o que resta) e é recusada com "prazo_esgotado" se restarem menos de CHAMADA_MIN_MS);
   margem de 10 s para gravar no banco e responder = a rodada acaba em ≤ 100 s, abaixo do timeout do pg_net (120 s) e do limite da função (150 s). */
export const ORCAMENTO_MS = 45_000, CHAMADA_MAX_MS = 40_000, CHAMADA_MIN_MS = 5_000, PRAZO_DURO_MS = 90_000, MARGEM_GRAVACAO_MS = 10_000, INTERVALO_MIN = 10;

/* depois de falhas seguidas a conta espera mais (10 min por rodada vira 20, 40, 80 e no máximo 120); uma rodada que dá certo zera a contagem. Autenticação recusada não entra: a conta sai da rotina. */
export const esperaMin = (falhas: number): number => (falhas < 3 ? 0 : Math.min(INTERVALO_MIN * 2 ** (falhas - 2), 120));

/* código fechado a partir do que o Worker respondeu (a mesma tabela da sincronização manual) */
export function codigoDoErro(erro: string): string {
  if (AUTENTICACAO_RECUSADA.includes(erro)) return "credencial_invalida";
  if (REPASSA.includes(erro)) return erro;
  if (CANAL_RECUSADO.includes(erro)) return "canal_recusado";
  return "servico_indisponivel";
}

/* ---- o aviso (decisão do dono, 15/11/2026: assunto e remetente na notificação; NUNCA o corpo) ----
   Uma notificação por mensagem, até MAX_INDIVIDUAIS; passando disso, as 3 mais novas vão individuais e UMA notificação-resumo cobre as demais.
   Cada notificação individual leva o assunto e o remetente DA MESMA mensagem (montados de uma só linha do cache) e abre essa mensagem: o destino é o id estável da linha. */
export const MAX_INDIVIDUAIS = 4, INDIVIDUAIS_NO_LOTE = 3, TITULO_MAX = 100, CORPO_MAX = 140;
/* sem controles, sem caracteres de direção (a tela de bloqueio não pode ser enganada por texto invertido), espaços normalizados */
const limpa = (s: string | null | undefined): string => (s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]+/g, " ").replace(/\s+/g, " ").trim();
const cortar = (s: string, max: number): string => { const l = [...s]; return l.length > max ? l.slice(0, max - 1).join("").trimEnd() + "…" : s; };   // por caractere (não parte um emoji ao meio)
export const tituloDoAviso = (assunto: string | null): string => cortar(limpa(assunto), TITULO_MAX) || "(Sem assunto)";
export function corpoDoAviso(nome: string | null, endereco: string | null): string {
  const n = limpa(nome), e = limpa(endereco);
  const c = n && e && n.toLowerCase() !== e.toLowerCase() ? n + " — " + e : e || n || "Remetente desconhecido";
  return cortar(c, CORPO_MAX);
}
export const destinoDaMensagem = (conta: string, p: { id: string; pasta_id: string }): string => "./#inbox/" + conta + "/" + p.pasta_id + "/" + p.id;
export function montarAviso(conta: string, p: Pendente, naoLidas: number): Msg {
  return { titulo: tituloDoAviso(p.assunto), corpo: corpoDoAviso(p.nome, p.endereco), url: destinoDaMensagem(conta, p), tag: "inbox-msg-" + p.id, badge: Math.max(0, naoLidas), renotificar: true };
}
export function montarResumo(conta: string, novas: number, naoLidas: number): Msg {
  return { titulo: "RAC Inbox", corpo: novas === 1 ? "Mais 1 nova mensagem" : "Mais " + novas + " novas mensagens", url: "./#inbox", tag: "inbox-" + conta, badge: Math.max(0, naoLidas), renotificar: true };
}
/* o que enviar: [aviso, ids que ele cobre]; do mais antigo ao mais novo, para o mais novo ficar por cima na tela de bloqueio */
export function planejarAvisos(conta: string, lista: Pendente[], naoLidas: number): Array<{ msg: Msg; ids: string[] }> {
  const ind = lista.length <= MAX_INDIVIDUAIS ? lista : lista.slice(0, INDIVIDUAIS_NO_LOTE), resto = lista.slice(ind.length);
  const envios = ind.map((p) => ({ msg: montarAviso(conta, p, naoLidas), ids: [p.id] }));
  if (resto.length) envios.push({ msg: montarResumo(conta, resto.length, naoLidas), ids: resto.map((p) => p.id) });
  return envios.reverse();
}

export async function rodarRotina(d: {
  banco: Banco & BancoRotina; cofre: Cofre; worker: Worker; aviso: Aviso | null;
  /* I4: o Worker de uma conta Gmail/Outlook (token de acesso pedido agora, só nesta rodada); ausente = essas contas respondem oauth_nao_configurado */
  workerDaConta?: (c: ContaAuto, bruto: string) => Promise<ResultadoOauth>;
  registrar: (e: { operacao: string; codigo: string; status: number; detalhe?: string }) => void; agora?: () => number; orcamentoMs?: number;
}): Promise<Resumo> {
  const agora = d.agora ?? Date.now, inicio = agora(), limite = d.orcamentoMs ?? ORCAMENTO_MS, duro = inicio + PRAZO_DURO_MS;
  /* toda chamada ao Worker passa por aqui: recebe só o tempo que resta até o prazo duro; sem tempo, nem é feita */
  const comPrazo = (w: Worker): Worker => ({ async executar(op, ped, cred) {
    const resta = duro - agora();
    if (resta < CHAMADA_MIN_MS) return { ok: false, erro: "prazo_esgotado" };
    return await w.executar(op, ped, cred, { timeoutMs: Math.min(CHAMADA_MAX_MS, resta) });
  } });
  const worker = comPrazo(d.worker);
  const res: Resumo = { contas: 0, sincronizadas: 0, sem_mudanca: 0, novas: 0, avisos: 0, falhas: 0, ignoradas: 0, em_andamento: 0 };
  const reg = (codigo: string, detalhe?: string) => { try { d.registrar({ operacao: "rotina_sync", codigo, status: codigo === "ok" ? 200 : 502, ...(detalhe ? { detalhe } : {}) }); } catch (_) { /* o registro nunca derruba a rotina */ } };
  let contas: ContaAuto[] = [];
  try { contas = await d.banco.contasAutomaticas(); } catch (_) { reg("banco_indisponivel"); res.falhas++; return res; }
  res.contas = contas.length;
  for (const c of contas) {
    if (agora() - inicio > limite) { res.ignoradas++; continue; }   // o tempo da função acabou: as demais ficam para a próxima rodada
    const t = c.ultima_tentativa_em ? Date.parse(c.ultima_tentativa_em) : NaN;
    if (!Number.isNaN(t) && agora() - t < esperaMin(c.falhas) * 60_000) { res.ignoradas++; continue; }   // recuperação progressiva
    let travada = false;
    try {
      if (!(await d.banco.travar(c.conta))) { res.em_andamento++; continue; }   // já há uma sincronização desta conta (manual ou da rodada anterior)
      travada = true;
      let bruto: string | null = null;
      try { bruto = await d.cofre.ler(c.dono, c.conta); } catch (_) { res.falhas++; reg("cofre_indisponivel"); continue; }
      const ausente = bruto === null;
      let cred: { usuario: string; senha: string } | null = null, wk = worker;
      if (!ausente && (c.provedor === "gmail" || c.provedor === "outlook")) {   // Gmail/Outlook: o segredo é o refresh token; o token de acesso nasce agora e morre com o Worker (abrirWorkerOauth marca a credencial inválida se o provedor recusar)
        const o: ResultadoOauth = d.workerDaConta ? await d.workerDaConta(c, bruto as string) : { ok: false, erro: "oauth_nao_configurado" };
        bruto = null;
        if (!o.ok) {
          res.falhas++; reg(o.erro);
          if (o.erro === "servico_indisponivel") { try { await d.banco.falhaSync(c.dono, c.conta, c.pasta_id, "servico_indisponivel"); await d.banco.estadoConta(c.dono, c.conta, "atrasada", "servico_indisponivel"); } catch (_) { /* a próxima rodada tenta de novo */ } }
          continue;   // credencial_invalida: a conta já foi marcada e sai da rotina até o dono reconectar
        }
        wk = comPrazo(o.worker); cred = { usuario: "", senha: "" };
      } else { cred = bruto === null ? null : desempacotar(bruto); bruto = null; }
      if (!cred) { res.falhas++; reg(ausente ? "credencial_ausente" : "credencial_corrompida"); continue; }
      let r;
      try { r = await sincronizarPasta({ dono: c.dono, conta: c.conta, pastaId: c.pasta_id, worker: wk, banco: d.banco, credencial: cred, modo: "agenda", agora, prazo: inicio + limite }); }
      catch (e) { cred = null; res.falhas++; reg("servico_indisponivel", detalheDe(e)); try { await d.banco.falhaSync(c.dono, c.conta, c.pasta_id, "servico_indisponivel"); } catch (_) { /* a próxima rodada tenta de novo */ } continue; }
      cred = null;
      if (!r.ok && r.erro === "prazo_esgotado") { res.ignoradas++; reg("prazo_esgotado"); continue; }   // o tempo da rodada acabou no meio: não é falha da conta; nada foi gravado e a próxima rodada refaz
      if (!r.ok) {
        const cod = codigoDoErro(r.erro);
        res.falhas++; reg(cod, /^[a-z][a-z0-9_]{1,40}$/.test(r.erro) ? r.erro : undefined);
        if (cod === "credencial_invalida") {   // login recusado: a credencial vira "inválida" e a conta sai da rotina até o dono substituir a senha
          try { await d.cofre.marcar(c.dono, c.conta, "invalida"); } catch (_) { /* o estado fica como está */ }
          try { await d.banco.estadoConta(c.dono, c.conta, "erro_autenticacao", "credencial_invalida"); } catch (_) { /* idem */ }
        } else {
          try { await d.banco.falhaSync(c.dono, c.conta, c.pasta_id, cod); await d.banco.estadoConta(c.dono, c.conta, "atrasada", cod); } catch (_) { /* idem */ }
        }
        continue;
      }
      try { await d.banco.estadoConta(c.dono, c.conta, "conectada", null); } catch (_) { /* idem */ }
      const s = (r.dados.sincronizacao ?? {}) as { tipo?: string; novas?: number };
      if (s.tipo === "sem_mudanca") res.sem_mudanca++; else res.sincronizadas++;
      res.novas += typeof s.novas === "number" ? s.novas : 0;
      // ---- aviso (uma notificação por mensagem, ver planejarAvisos): só o que a rotina encontrou de novo e ainda não foi tratado ----
      const lista = await d.banco.pendentes(c.dono, c.conta);
      if (lista.length === 0) continue;
      if (!c.notificar || !d.aviso) { await d.banco.marcarNotificadas(c.dono, c.conta, lista.map((p) => p.id)); continue; }   // preferência desligada: trata sem avisar (ao ligar, não vem enxurrada)
      const naoLidas = await d.banco.naoLidasEntrada(c.dono);
      for (const { msg, ids } of planejarAvisos(c.conta, lista, naoLidas)) {
        let ent: Entrega;
        try { ent = await d.aviso.enviar(c.dono, msg); } catch (_) { reg("aviso_falhou"); continue; }   // não marca ESTAS mensagens: a próxima rodada tenta de novo (dentro de 24 h); as demais seguem
        if (ent.aparelhos === 0 || ent.enviados > 0) { await d.banco.marcarNotificadas(c.dono, c.conta, ids); if (ent.enviados > 0) res.avisos++; }
        else reg("aviso_falhou");   // havia aparelho e nenhum aceitou (ou faltam as chaves): ficam pendentes
      }
    } catch (_) {
      res.falhas++; reg("interno");
    } finally {
      if (travada) { try { await d.banco.destravar(c.conta); } catch (_) { /* some com a conexão */ } }
    }
  }
  reg("ok");
  return res;
}
