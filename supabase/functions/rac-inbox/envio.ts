// RAC Inbox · I3: a lógica PURA do envio e da prova de viabilidade do SMTP (docs/inbox.md, "Envio"). Sem Deno, sem rede própria: o Worker, o banco e o relógio entram como dependências (tests/inbox_envio_servico.test.mjs).
// Três resultados, nunca misturados:
//   ENVIADO         o Worker confirmou o 2xx do servidor SMTP depois do corpo;
//   FALHA CONFIRMADA o servidor recusou ou o erro ocorreu ANTES de o corpo ser transmitido (tentar de novo é seguro; a reserva do envio_id volta a permitir);
//   INCERTO         o corpo pode ter sido aceito e a resposta não chegou (timeout, conexão cortada, falha do canal depois do pedido): NUNCA se repete sozinho; o dono confere a pasta Enviados.
// A credencial só existe aqui como argumento desta chamada e nunca entra em resposta, erro ou registro. Nenhum texto do e-mail, assunto ou endereço é registrado.
import type { Banco, Worker } from "./servico.ts";
import type { Pedido } from "./contrato.ts";
import { sincronizarPasta } from "./sync.ts";

export const ETAPAS_PROVA = ["conexao_tcp", "saudacao", "ehlo", "starttls", "tls", "ehlo_tls", "autenticacao", "remetente", "destinatario", "dados", "envio"] as const;
const RE_COD = /^[a-z][a-z0-9_]{1,40}$/, RE_MSGID = /^<[A-Za-z0-9._%+=-]{1,120}@[A-Za-z0-9.-]{1,120}>$/;
const CANAL_RECUSADO = ["assinatura_invalida", "chave_desconhecida", "timestamp_fora_da_janela", "cabecalhos_invalidos", "replay", "canal_nao_configurado", "operacao_divergente", "registro_indisponivel"];
// o Worker recusou ANTES de transmitir o corpo: falha confirmada, com o código que o navegador entende
const FALHA_CONFIRMADA: Record<string, string> = {
  smtp_autenticacao_recusada: "smtp_autenticacao_recusada", remetente_recusado: "remetente_recusado", destinatario_recusado: "destinatario_recusado", dados_recusados: "envio_recusado", envio_recusado: "envio_recusado",
  destinatario_invalido: "destinatario_invalido", destinatarios_demais: "destinatarios_demais", assunto_invalido: "assunto_invalido", texto_grande_demais: "texto_grande_demais", mensagem_grande_demais: "mensagem_grande_demais",
};
// códigos em que NÃO se sabe se o Worker chegou a transmitir: tratados como incerto
const INCERTO_NO_WORKER = ["envio_incerto", "falha_interna", "falha_inesperada"];

export type ResultadoEnvio = { tipo: "sucesso"; corpo: Record<string, unknown> } | { tipo: "falha"; codigo: string; detalhe?: string };
export interface EntradaEnvio {
  p: Pedido; dono: string; conta: string; credencial: { usuario: string; senha: string };
  worker: Worker; banco: Banco | null; agora: () => Date; marcarAtiva: () => Promise<void>;
}
const isoSemMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const detalheDe = (e: unknown): string => { const m = e instanceof Error ? e.message : ""; return /^(canal_falhou|resposta_invalida|resposta_grande_demais|http_\d{3})$/.test(m) ? m : "servico_indisponivel"; };

/* a resposta da prova, copiada só no esquema conhecido (o que o Worker mandar além disso nunca passa) */
export function filtrarProva(d: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof d.aprovada !== "boolean" || !Array.isArray(d.etapas) || d.etapas.length > 20) return null;
  const etapas: Array<Record<string, unknown>> = [];
  for (const e of d.etapas as Array<Record<string, unknown>>) {
    if (!e || typeof e.etapa !== "string" || !(ETAPAS_PROVA as readonly string[]).includes(e.etapa) || typeof e.ok !== "boolean" || typeof e.ms !== "number" || !Number.isInteger(e.ms) || e.ms < 0 || e.ms > 600000) return null;
    const x: Record<string, unknown> = { etapa: e.etapa, ok: e.ok, ms: e.ms };
    if (e.codigo !== undefined) { if (typeof e.codigo !== "number" || !Number.isInteger(e.codigo) || e.codigo < 100 || e.codigo > 599) return null; x.codigo = e.codigo; }
    etapas.push(x);
  }
  const teste = typeof d.teste === "string" && ["nao_enviado", "enviado", "incerto"].includes(d.teste) ? d.teste : null;
  if (!teste || typeof d.total_ms !== "number" || !Number.isInteger(d.total_ms) || d.total_ms < 0) return null;
  const r: Record<string, unknown> = { aprovada: d.aprovada, host: "smtp.mail.me.com", porta: 587, etapas, total_ms: d.total_ms, teste };
  if (!d.aprovada) {
    if (typeof d.erro !== "string" || !RE_COD.test(d.erro) || typeof d.etapa_falha !== "string" || !RE_COD.test(d.etapa_falha)) return null;
    r.erro = d.erro; r.etapa_falha = d.etapa_falha;
  }
  return r;
}

export async function envioPuro(a: EntradaEnvio): Promise<ResultadoEnvio> {
  const { p, dono, conta, credencial, worker, banco } = a;
  if (p.operacao === "smtp_prova") return await prova(a, p.enviar_teste);
  if (p.operacao !== "enviar_mensagem") return { tipo: "falha", codigo: "operacao_invalida" };

  /* ---- reservas e conferências ANTES de qualquer coisa ir ao provedor ---- */
  if (!banco || !banco.envioIniciar || !banco.envioFinalizar || !banco.contaEndereco) return { tipo: "falha", codigo: "registro_envio_indisponivel" };
  let de: string | null;
  try { de = await banco.contaEndereco(dono, conta); } catch (_) { return { tipo: "falha", codigo: "banco_indisponivel" }; }
  if (!de) return { tipo: "falha", codigo: "conta_inexistente" };
  de = de.toLowerCase();
  const dominio = de.slice(de.lastIndexOf("@") + 1), messageId = "<" + p.envio_id + "@" + dominio + ">";
  const dedup = (l: string[]) => l.filter((e) => !(p.modo === "responder_todos" && (e === de || e === credencial.usuario.toLowerCase())));   // responder a todos nunca inclui o próprio dono
  const para = dedup(p.para), cc = dedup(p.cc), cco = dedup(p.cco);
  if (para.length === 0) return { tipo: "falha", codigo: "destinatario_invalido" };

  let reserva;
  try { reserva = await banco.envioIniciar(dono, conta, p.envio_id, { message_id: messageId, modo: p.modo, destinatarios: para.length + cc.length + cco.length }); } catch (_) { return { tipo: "falha", codigo: "registro_envio_indisponivel" }; }
  if (!reserva) return { tipo: "falha", codigo: "id_invalido" };
  if (!reserva.novo) {   // repetição do MESMO envio: nunca transmite de novo
    if (reserva.estado === "enviado") return { tipo: "sucesso", corpo: { resultado: "enviado", message_id: reserva.message_id, repetido: true, enviados: "nao_atualizada" } };
    if (reserva.estado === "incerto") return { tipo: "falha", codigo: "envio_incerto" };
    return { tipo: "falha", codigo: "envio_em_andamento" };
  }
  const terminar = async (estado: "enviado" | "falha" | "incerto", codigo: string | null) => { try { await banco.envioFinalizar!(dono, conta, p.envio_id, estado, codigo); } catch (_) { /* o registro fica "pendente": a próxima tentativa o trata como incerto depois de 2 min */ } };
  const falhou = async (codigo: string, detalhe?: string): Promise<ResultadoEnvio> => { await terminar("falha", codigo); return { tipo: "falha", codigo, detalhe }; };

  /* ---- contexto da conversa (responder / responder a todos): lido do provedor, nunca confiado ao navegador ---- */
  let emResposta: string | undefined, referencias: string[] = [];
  if (p.modo !== "novo") {
    let pasta;
    try { pasta = await banco.pasta(dono, conta, p.pasta_id as string); } catch (_) { return await falhou("banco_indisponivel"); }
    if (!pasta) return await falhou("pasta_inexistente");
    if (p.modo !== "encaminhar") {
      let est;
      try { est = await banco.estadoSync(dono, conta, p.pasta_id as string); } catch (_) { return await falhou("banco_indisponivel"); }
      const ped: Record<string, unknown> = { conta_id: conta, pasta: pasta.nome_externo, uid: p.uid };
      if (est && est.uidvalidity !== null) ped.uidvalidity_esperado = est.uidvalidity;
      let lida;
      try { lida = await worker.executar("ler_mensagem", ped, credencial); } catch (e) { return await falhou("servico_indisponivel", detalheDe(e)); }
      if (!lida.ok) return await falhou(CANAL_RECUSADO.includes(lida.erro) ? "canal_recusado" : ["mensagem_inexistente", "uidvalidity_mudou", "pasta_inexistente"].includes(lida.erro) ? lida.erro : "servico_indisponivel", lida.erro);
      const m = lida.dados.mensagem as Record<string, unknown> | undefined;
      if (m && typeof m.message_id === "string" && RE_MSGID.test(m.message_id)) {
        emResposta = m.message_id;
        if (Array.isArray(m.referencias)) referencias = (m.referencias as unknown[]).filter((r): r is string => typeof r === "string" && RE_MSGID.test(r)).slice(-10);
      }
    }
  }

  /* ---- a transmissão: UMA tentativa ---- */
  const ped: Record<string, unknown> = { conta_id: conta, de, para, cc, cco, assunto: p.assunto, texto: p.texto, message_id: messageId, data: isoSemMs(a.agora()) };
  if (emResposta) { ped.em_resposta_a = emResposta; if (referencias.length) ped.referencias = referencias; }
  let r;
  try { r = await worker.executar("enviar", ped, credencial); }
  catch (e) { await terminar("incerto", "envio_incerto"); return { tipo: "falha", codigo: "envio_incerto", detalhe: detalheDe(e) }; }   // a chamada pode ter chegado ao Worker: não se sabe
  if (!r.ok) {
    if (INCERTO_NO_WORKER.includes(r.erro)) { await terminar("incerto", "envio_incerto"); return { tipo: "falha", codigo: "envio_incerto", detalhe: r.erro }; }
    if (CANAL_RECUSADO.includes(r.erro)) return await falhou("canal_recusado", r.erro);
    return await falhou(FALHA_CONFIRMADA[r.erro] ?? "smtp_indisponivel", r.erro);
  }
  if (r.dados.resultado !== "enviado") { await terminar("incerto", "envio_incerto"); return { tipo: "falha", codigo: "envio_incerto", detalhe: "resposta_invalida" }; }   // sem confirmação clara, nunca se diz "enviado"
  await terminar("enviado", null);
  await a.marcarAtiva();

  /* ---- Enviados: depois da confirmação, atualiza o cache da pasta (melhor esforço: falhar aqui não muda o resultado do envio) ---- */
  let enviados: "atualizada" | "nao_atualizada" = "nao_atualizada";
  try {
    const pe = banco.pastaPorUso ? await banco.pastaPorUso(dono, conta, "enviados") : null;
    if (pe && (await banco.travar(conta))) {
      try {
        const s = await sincronizarPasta({ dono, conta, pastaId: pe.id, worker: { executar: (op, ped2, c) => worker.executar(op, ped2, c) }, banco, credencial });
        if (s.ok) enviados = "atualizada";
      } finally { try { await banco.destravar(conta); } catch (_) { /* a conexão se fecha no fim */ } }
    }
  } catch (_) { /* melhor esforço */ }
  return { tipo: "sucesso", corpo: { resultado: "enviado", message_id: messageId, enviados } };
}

async function prova(a: EntradaEnvio, enviarTeste: boolean): Promise<ResultadoEnvio> {
  const { dono, conta, credencial, worker, banco } = a;
  const ped: Record<string, unknown> = { conta_id: conta };
  if (enviarTeste) {   // a mensagem de teste vai SÓ para o endereço da própria conta
    let de: string | null = null;
    try { de = banco?.contaEndereco ? await banco.contaEndereco(dono, conta) : null; } catch (_) { return { tipo: "falha", codigo: "banco_indisponivel" }; }
    if (!de) return { tipo: "falha", codigo: banco?.contaEndereco ? "conta_inexistente" : "banco_indisponivel" };
    de = de.toLowerCase();
    ped.enviar_teste = true; ped.endereco = de; ped.message_id = "<teste-" + crypto.randomUUID() + "@" + de.slice(de.lastIndexOf("@") + 1) + ">"; ped.data = isoSemMs(a.agora());
  }
  let r;
  try { r = await worker.executar("smtp_prova", ped, credencial); } catch (e) { return { tipo: "falha", codigo: "servico_indisponivel", detalhe: detalheDe(e) }; }
  if (!r.ok) return { tipo: "falha", codigo: CANAL_RECUSADO.includes(r.erro) ? "canal_recusado" : "servico_indisponivel", detalhe: r.erro };
  const f = filtrarProva(r.dados);
  if (!f) return { tipo: "falha", codigo: "servico_indisponivel", detalhe: "resposta_invalida" };
  return { tipo: "sucesso", corpo: f };   // a prova relata a causa de uma falha; não marca a credencial como inválida (o IMAP pode estar bom)
}
