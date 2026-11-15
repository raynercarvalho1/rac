// RAC Inbox · sincronização automática e aviso de e-mail novo (docs/inbox.md, "Automático"). Lógica PURA e testada (tests/inbox_automatico.test.mjs): o cofre, o Worker, o banco, o Web Push e o relógio entram como
// dependências, então os testes provam com versões de mentira: nada depende de navegador aberto, só uma sincronização por conta ao mesmo tempo, falha de uma conta não derruba as outras, recuperação na rodada seguinte,
// credencial recusada vira estado (e a conta sai da rotina), a primeira leitura nunca avisa, nada é avisado duas vezes, o aviso não leva conteúdo do e-mail e a credencial nunca sai.
// A rotina é chamada pelo pg_cron (supabase/propostas/055_inbox_agendamento.sql) a cada 10 min com a senha da rotina; o Worker continua SÓ LEITURA (EXAMINE/FETCH BODY.PEEK): nada muda na caixa original.
import { desempacotar } from "./contrato.ts";
import { AUTENTICACAO_RECUSADA, CANAL_RECUSADO, REPASSA, detalheDe, type Banco, type Cofre, type Worker } from "./servico.ts";
import { sincronizarPasta } from "./sync.ts";
import type { Entrega, Msg } from "./push.ts";

export interface ContaAuto { conta: string; dono: string; apelido: string; notificar: boolean; pasta_id: string; falhas: number; ultima_tentativa_em: string | null }
export interface BancoRotina {
  contasAutomaticas(): Promise<ContaAuto[]>;
  pendentes(dono: string, conta: string): Promise<string[]>;                         // ids das mensagens não lidas ainda não tratadas pelo aviso (as lidas e as antigas já saem marcadas)
  marcarNotificadas(dono: string, conta: string, ids: string[]): Promise<void>;
  naoLidasEntrada(dono: string): Promise<number>;
  rotinaAutorizada(segredo: string): Promise<boolean>;
}
export interface Aviso { enviar(dono: string, msg: Msg): Promise<Entrega> }
export interface Resumo { contas: number; sincronizadas: number; sem_mudanca: number; novas: number; avisos: number; falhas: number; ignoradas: number; em_andamento: number }
export const ORCAMENTO_MS = 45_000, INTERVALO_MIN = 10;

/* depois de falhas seguidas a conta espera mais (10 min por rodada vira 20, 40, 80 e no máximo 120); uma rodada que dá certo zera a contagem. Autenticação recusada não entra: a conta sai da rotina. */
export const esperaMin = (falhas: number): number => (falhas < 3 ? 0 : Math.min(INTERVALO_MIN * 2 ** (falhas - 2), 120));

/* código fechado a partir do que o Worker respondeu (a mesma tabela da sincronização manual) */
export function codigoDoErro(erro: string): string {
  if (AUTENTICACAO_RECUSADA.includes(erro)) return "credencial_invalida";
  if (REPASSA.includes(erro)) return erro;
  if (CANAL_RECUSADO.includes(erro)) return "canal_recusado";
  return "servico_indisponivel";
}

/* o aviso: SÓ a contagem. Remetente, assunto, corpo, endereço e nome da conta nunca entram (a tela de bloqueio é pública). */
export function montarAviso(conta: string, novas: number, naoLidas: number): Msg {
  return { titulo: "RAC Inbox", corpo: novas === 1 ? "1 nova mensagem" : novas + " novas mensagens", url: "./#inbox", tag: "inbox-" + conta, badge: Math.max(0, naoLidas), renotificar: true };
}

export async function rodarRotina(d: {
  banco: Banco & BancoRotina; cofre: Cofre; worker: Worker; aviso: Aviso | null;
  registrar: (e: { operacao: string; codigo: string; status: number; detalhe?: string }) => void; agora?: () => number; orcamentoMs?: number;
}): Promise<Resumo> {
  const agora = d.agora ?? Date.now, inicio = agora(), limite = d.orcamentoMs ?? ORCAMENTO_MS;
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
      let cred = bruto === null ? null : desempacotar(bruto);
      bruto = null;
      if (!cred) { res.falhas++; reg(ausente ? "credencial_ausente" : "credencial_corrompida"); continue; }
      let r;
      try { r = await sincronizarPasta({ dono: c.dono, conta: c.conta, pastaId: c.pasta_id, worker: d.worker, banco: d.banco, credencial: cred, modo: "agenda", agora, prazo: inicio + limite }); }
      catch (e) { cred = null; res.falhas++; reg("servico_indisponivel", detalheDe(e)); try { await d.banco.falhaSync(c.dono, c.conta, c.pasta_id, "servico_indisponivel"); } catch (_) { /* a próxima rodada tenta de novo */ } continue; }
      cred = null;
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
      // ---- aviso: só o que a rotina encontrou de novo e ainda não foi tratado ----
      const ids = await d.banco.pendentes(c.dono, c.conta);
      if (ids.length === 0) continue;
      if (!c.notificar || !d.aviso) { await d.banco.marcarNotificadas(c.dono, c.conta, ids); continue; }   // preferência desligada: trata sem avisar (ao ligar, não vem enxurrada)
      let ent: Entrega;
      try { ent = await d.aviso.enviar(c.dono, montarAviso(c.conta, ids.length, await d.banco.naoLidasEntrada(c.dono))); } catch (_) { reg("aviso_falhou"); continue; }   // não marca: a próxima rodada tenta de novo (dentro de 24 h)
      if (ent.aparelhos === 0 || ent.enviados > 0) { await d.banco.marcarNotificadas(c.dono, c.conta, ids); if (ent.enviados > 0) res.avisos++; }
      else reg("aviso_falhou");   // havia aparelho e nenhum aceitou (ou faltam as chaves): fica pendente
    } catch (_) {
      res.falhas++; reg("interno");
    } finally {
      if (travada) { try { await d.banco.destravar(c.conta); } catch (_) { /* some com a conexão */ } }
    }
  }
  reg("ok");
  return res;
}
