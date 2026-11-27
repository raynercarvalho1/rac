// RAC Inbox · I3.2: a lógica PURA do gerenciamento de mensagens (docs/inbox.md, "Gerenciamento"): marcar lida/não lida, arquivar, mover para pasta, excluir (para a Lixeira) e spam / não é spam.
// Sem Deno e sem rede própria: o Worker, o banco e o credencial entram como dependências (tests/inbox_organizar_servico.test.mjs).
// Regras que este arquivo garante (todas testadas):
//   - quem manda é conferido NO BANCO antes de qualquer coisa: a pasta e a mensagem pertencem a este dono e a esta conta; o nome da pasta e o UID vêm do banco, nunca do navegador;
//   - o destino de arquivar/excluir/spam/não-é-spam é a pasta que o SERVIDOR identificou (uso arquivo/lixo/spam/entrada, vindo dos atributos do LIST); sem ela, a ação não existe ("destino_ausente");
//   - excluir é SEMPRE mover para a Lixeira: não há exclusão definitiva nem expurgo em nenhum caminho;
//   - uma operação por vez por conta (o mesmo travamento da sincronização): toque duplo ou sincronização concorrente não se atropelam;
//   - o cache só muda DEPOIS da confirmação do Worker (que só afirma depois da resposta etiquetada do IMAP) ou da verificação do estado real;
//   - resposta incerta NUNCA é repetida: a função pergunta ao servidor (verificar_mensagem) e só então decide: aplicada, "acao_nao_aplicada" (nada mudou) ou "acao_incerta" (nem a verificação respondeu).
// A credencial só existe como argumento desta chamada; nada do conteúdo da mensagem é lido, devolvido ou registrado aqui (só cabeçalhos já existentes no cache).
import type { Banco, Worker } from "./servico.ts";
import type { AcaoOrganizar, Pedido } from "./contrato.ts";

type Org = Extract<Pedido, { operacao: "organizar_mensagem" }>;
export type ResultadoOrganizar = { tipo: "sucesso"; corpo: Record<string, unknown> } | { tipo: "falha"; codigo: string; detalhe?: string };
export interface EntradaOrganizar {
  p: Org; dono: string; conta: string; credencial: { usuario: string; senha: string };
  worker: Worker; banco: Banco | null; marcarAtiva: () => Promise<void>; credencialRecusada: () => Promise<void>;
}
const UID_MAX = 4294967295;
const uidOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= UID_MAX;
const RE_MSGID_WORKER = /^[\x21-\x7e]{1,255}$/;
const CANAL_RECUSADO = ["assinatura_invalida", "chave_desconhecida", "timestamp_fora_da_janela", "cabecalhos_invalidos", "replay", "canal_nao_configurado", "operacao_divergente", "registro_indisponivel"];
const AUTENTICACAO_RECUSADA = ["autenticacao_recusada", "autenticacao_falhou", "login_recusado", "credencial_recusada"];
// o Worker recusou SEM ter alterado a caixa: falha confirmada, com o código que o navegador entende
const FALHA_CONFIRMADA: Record<string, string> = {
  uidvalidity_mudou: "uidvalidity_mudou", mensagem_inexistente: "mensagem_inexistente", pasta_inexistente: "pasta_inexistente", pasta_invalida: "destino_invalido", identidade_divergente: "identidade_divergente",
  acao_indisponivel: "acao_indisponivel", acao_parcial: "acao_parcial", acao_recusada: "acao_recusada", pasta_somente_leitura: "pasta_somente_leitura", parametro_invalido: "acao_recusada",
};
const detalheDe = (e: unknown): string => { const m = e instanceof Error ? e.message : ""; return /^(canal_falhou|resposta_invalida|resposta_grande_demais|http_\d{3})$/.test(m) ? m : "servico_indisponivel"; };
// O servidor não oferece MOVE: pergunta (SÓ LEITURA, a operação "capacidades" do Worker) se ao menos anuncia UIDPLUS. A resposta vira um código FECHADO para o registro da função; qualquer falha da pergunta mantém o código simples.
// Serve para decidir, com evidência real, se existe um caminho seguro além do MOVE. Nada é alterado e a pergunta não muda a resposta ao usuário.
async function detalheSemMove(worker: Worker, conta: string, credencial: { usuario: string; senha: string }): Promise<string> {
  try {
    const c = await worker.executar("capacidades", { conta_id: conta }, credencial);
    if (c.ok && typeof c.dados.uidplus === "boolean") return c.dados.uidplus ? "sem_move_com_uidplus" : "sem_move_sem_uidplus";
  } catch (_) { /* a pergunta é só diagnóstico */ }
  return "acao_indisponivel";
}
const USO_DESTINO: Partial<Record<AcaoOrganizar, string>> = { arquivar: "arquivo", excluir: "lixo", spam: "spam", nao_spam: "entrada" };

export async function organizarPuro(a: EntradaOrganizar): Promise<ResultadoOrganizar> {
  const { p, dono, conta, credencial, worker, banco } = a;
  const falha = (codigo: string, detalhe?: string): ResultadoOrganizar => ({ tipo: "falha", codigo, detalhe });
  if (!banco || !banco.pastaDetalhe || !banco.mensagemRef || !banco.aplicarOrganizacao) return falha("banco_indisponivel");

  /* ---- 1. o que o BANCO sabe (e o navegador não decide): pasta e mensagem desta conta deste dono; destino ---- */
  let origem, ref, est;
  try {
    origem = await banco.pastaDetalhe(dono, conta, p.pasta_id);
    if (!origem) return falha("pasta_inexistente");
    ref = await banco.mensagemRef(dono, conta, p.pasta_id, p.uid);
    if (!ref) return falha("mensagem_inexistente");
    est = await banco.estadoSync(dono, conta, p.pasta_id);
  } catch (_) { return falha("banco_indisponivel"); }
  // identidade: o UID só vale na MESMA geração da pasta (UIDVALIDITY do cursor); cache de outra geração não se usa para alterar nada
  if (!est || est.uidvalidity === null || ref.uidvalidity === null || ref.uidvalidity !== est.uidvalidity) return falha("uidvalidity_mudou");

  const marca = p.acao === "marcar_lida" || p.acao === "marcar_nao_lida";
  let destino: { id: string; nome_externo: string; uso: string } | null = null;
  if (!marca) {
    try {
      if (p.acao === "mover") destino = await banco.pastaDetalhe(dono, conta, p.destino_pasta_id as string);   // só pasta ATIVA (selecionável) desta conta e deste dono
      else {
        if (p.acao === "nao_spam" && origem.uso !== "spam") return falha("destino_invalido");   // só se tira do Spam o que está no Spam
        if (origem.uso === USO_DESTINO[p.acao]) return falha("destino_invalido");   // já está na Lixeira / no Arquivo / no Spam / na Entrada
        destino = banco.pastaPorUso ? await banco.pastaPorUso(dono, conta, USO_DESTINO[p.acao] as string) : null;
        if (!destino) return falha("destino_ausente");   // o servidor não identificou essa pasta: não se inventa nome
      }
    } catch (_) { return falha("banco_indisponivel"); }
    if (!destino) return falha("destino_invalido");
    if (destino.id === origem.id) return falha("destino_invalido");
  }

  /* ---- 2. uma operação por vez por conta (o mesmo travamento da sincronização) ---- */
  try { if (!(await banco.travar(conta))) return falha("acao_em_andamento"); } catch (_) { return falha("banco_indisponivel"); }
  try {
    const desejada = p.acao === "marcar_lida";
    const identidade: Record<string, unknown> = { uid: p.uid, uidvalidity_esperado: est.uidvalidity };
    if (typeof ref.message_id === "string" && RE_MSGID_WORKER.test(ref.message_id)) identidade.message_id_esperado = ref.message_id;
    if (typeof ref.tamanho === "number" && Number.isInteger(ref.tamanho) && ref.tamanho >= 0) identidade.tamanho_esperado = ref.tamanho;

    /* ---- 3. a chamada ao Worker: UMA tentativa ---- */
    let r;
    try {
      r = marca ? await worker.executar("marcar_lida", { conta_id: conta, pasta: origem.nome_externo, lida: desejada, ...identidade }, credencial)
        : await worker.executar("mover_mensagem", { conta_id: conta, pasta: origem.nome_externo, destino: destino!.nome_externo, ...identidade }, credencial);
    } catch (e) { r = { ok: false as const, erro: "canal_incerto", d: detalheDe(e) }; }   // a chamada pode ter chegado ao Worker: não se sabe

    let aplicada: { resultado: "aplicada" | "ja_estava" | "verificada"; destinoUid?: { uidvalidity: number; uid: number } } | null = null;
    if (r.ok) {
      const d = r.dados, res = d.resultado;
      if (marca && (res === "aplicada" || res === "ja_estava") && d.lida === desejada) aplicada = { resultado: res };
      else if (!marca && res === "aplicada") {
        const du = d.destino as Record<string, unknown> | undefined;
        aplicada = { resultado: "aplicada", destinoUid: du && uidOk(du.uidvalidity) && uidOk(du.uid) ? { uidvalidity: du.uidvalidity, uid: du.uid } : undefined };
      }   // qualquer outra coisa (resposta fora do esquema) cai na verificação abaixo: nunca se diz "feito" sem confirmação
    } else {
      if (AUTENTICACAO_RECUSADA.includes(r.erro)) { await a.credencialRecusada(); return falha("credencial_invalida"); }
      if (CANAL_RECUSADO.includes(r.erro)) return falha("canal_recusado", r.erro);   // a assinatura foi recusada: o Worker não executou
      if (r.erro === "acao_indisponivel") return falha("acao_indisponivel", await detalheSemMove(worker, conta, credencial));   // diagnóstico: o iCloud tem UIDPLUS? (só leitura; vai ao registro como código fechado)
      if (FALHA_CONFIRMADA[r.erro]) return falha(FALHA_CONFIRMADA[r.erro], r.erro);
      // incerto: acao_incerta, confirmacao_ausente, falha do canal, erro interno ou código desconhecido → o estado REAL é consultado, nunca repetido
    }

    /* ---- 4. resposta incerta: perguntar ao servidor o que aconteceu (somente leitura) ---- */
    if (!aplicada) {
      let v;
      try { v = await worker.executar("verificar_mensagem", { conta_id: conta, pasta: origem.nome_externo, uid: p.uid, uidvalidity_esperado: est.uidvalidity }, credencial); } catch (e) { return falha("acao_incerta", detalheDe(e)); }
      if (!v.ok) return falha(v.erro === "uidvalidity_mudou" ? "uidvalidity_mudou" : "acao_incerta", v.erro);
      const existe = v.dados.existe;
      if (typeof existe !== "boolean") return falha("acao_incerta", "resposta_invalida");
      if (marca) {
        if (!existe) return falha("mensagem_inexistente");
        if (typeof v.dados.lida !== "boolean") return falha("acao_incerta", "resposta_invalida");
        if (v.dados.lida !== desejada) return falha("acao_nao_aplicada");   // o servidor mostra que NADA mudou: seguro tentar de novo, por decisão do dono
        aplicada = { resultado: "verificada" };
      } else {
        if (existe) return falha("acao_nao_aplicada");   // a mensagem continua na origem: não foi movida
        aplicada = { resultado: "verificada" };         // saiu da origem; o novo UID no destino fica para a próxima sincronização (a verificação não o conhece)
      }
    }

    /* ---- 5. confirmado: só agora o cache muda (origem, destino e contagens, numa transação) ---- */
    let cache: "atualizado" | "nao_atualizado" = "atualizado";
    try {
      await banco.aplicarOrganizacao(dono, conta, marca ? { tipo: "lida", mensagemId: ref.id, pastaId: p.pasta_id, lida: desejada }
        : { tipo: "mover", mensagemId: ref.id, pastaId: p.pasta_id, destinoPastaId: destino!.id, destinoUidvalidity: aplicada.destinoUid?.uidvalidity, destinoUid: aplicada.destinoUid?.uid });
    } catch (_) { cache = "nao_atualizado"; }   // o servidor JÁ mudou: não se diz "falhou"; o dono sincroniza para alinhar o cache
    await a.marcarAtiva();
    const corpo: Record<string, unknown> = { resultado: aplicada.resultado, acao: p.acao, cache };
    if (marca) corpo.lida = desejada; else corpo.destino_pasta_id = destino!.id;
    return { tipo: "sucesso", corpo };
  } finally {
    try { await banco.destravar(conta); } catch (_) { /* a conexão se fecha no fim da chamada e o travamento some com ela */ }
  }
}
