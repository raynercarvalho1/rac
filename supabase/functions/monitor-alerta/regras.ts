// Monitor de integrações (M4): as regras PURAS do vigia (testadas sem rede em tests/monitor_alerta.test.mjs).
//  · o que o servidor vigia: Rotina das 6h, Newsletter e Inbox (a view monitor_processos, do banco) e os robôs de notícias e vagas (pela data real de coleta
//    dos JSON publicados). Radar e Central Fiscal só registram quando há o que fazer: ficam na visão operacional e NUNCA geram alerta. Os testes automáticos
//    ficam fora (a falha aparece no GitHub e no Monitor);
//  · robôs: diferencia ATRASO (a data de coleta passou do limite), FALHA (coleta recente, mas vazia ou com todas as fontes fora do ar) e INDISPONIBILIDADE da
//    fonte (não consegui ler o arquivo): só os dois primeiros alertam, indisponível sem evidência nunca gera alarme;
//  · quando avisar: silêncio das 22h às 7h (Brasília, UTC-3 fixo, sem horário de verão) e no máximo 3 pushes por dia; o que ficou de fora continua registrado
//    em sinais (nada é descartado) e sai depois, num único push consolidado.

export type Estado = "ok" | "atrasado" | "falhou" | "desconhecido" | "desligado" | "indisponivel";
export type Item = { entidade: string; estado: Estado; nome: string; motivo: string; fonte: string; fatos: Record<string, unknown> };
export type LinhaView = {
  dono: string; processo: string; nome: string; fonte: string; estado: string; motivo: string | null; limite_min: number | null; alerta: boolean;
  ultima_execucao: string | null; ultimo_sucesso: string | null;
};
export type Resposta = { status: number; corpo: unknown } | null;
export type Arquivo = { arquivo: string; rotulo: string; campo: string; idadeMaxH: number };
export type Robo = { processo: string; nome: string; arquivos: Arquivo[] };
export type Pendente = { id: string; entidade: string; nome: string | null; estado: string | null; severidade: string; detectado_em: string };
export type Resolvido = { id: string; entidade: string; nome: string | null; detectado_em: string; encerrado_em: string };

const H = 36e5;
export const LIMITE_PUSHES_DIA = 3, SILENCIO_INICIO_H = 22, SILENCIO_FIM_H = 7;

/* os mesmos arquivos e limites do Monitor da tela (js/sistema.js, sisMonColetar; o teste confere os números) */
export const ROBOS: Robo[] = [
  { processo: "noticias", nome: "Robô de notícias", arquivos: [
    { arquivo: "noticias.json", rotulo: "Sorocaba", campo: "noticias", idadeMaxH: 8 }, { arquivo: "tecdados.json", rotulo: "tecnologia", campo: "noticias", idadeMaxH: 8 },
    { arquivo: "rumores.json", rotulo: "rumores da MLB", campo: "liga", idadeMaxH: 8 }, { arquivo: "newsletter.json", rotulo: "Newsletter", campo: "grupos", idadeMaxH: 14 }] },
  { processo: "vagas", nome: "Robô de vagas", arquivos: [{ arquivo: "vagas.json", rotulo: "vagas", campo: "vagas", idadeMaxH: 30 }] },
];
/* o que o servidor deixa abrir incidente (Radar e Central Fiscal não) */
export const ALERTAVEIS_BANCO = ["rotina", "newsletter", "inbox"];

const ms = (x: unknown): number | null => { if (x == null || x === "") return null; const t = typeof x === "number" ? x : Date.parse(String(x)); return Number.isFinite(t) ? t : null; };
const horas = (n: number) => (n >= 48 ? Math.round(n / 24) + " dias" : Math.round(n) + " h");

/* um arquivo JSON de um robô: indisponível (não deu para ler), atrasado, falhou (vazio ou todas as fontes fora) ou ok */
export function avaliarArquivo(r: Resposta, f: Arquivo, agora: number): { estado: Estado; motivo: string } {
  const c = r && r.status === 200 && r.corpo && typeof r.corpo === "object" && !Array.isArray(r.corpo) ? (r.corpo as Record<string, unknown>) : null;
  if (!c) return { estado: "indisponivel", motivo: `não consegui ler ${f.rotulo}` };
  const t = ms(c.coletado);
  if (t == null) return { estado: "indisponivel", motivo: `${f.rotulo}: sem data de coleta` };
  const idade = (agora - t) / H;
  if (idade > f.idadeMaxH) return { estado: "atrasado", motivo: `${f.rotulo}: sem coleta há ${horas(idade)} (limite ${f.idadeMaxH} h)` };
  const itens = Array.isArray(c[f.campo]) ? (c[f.campo] as unknown[]).length : 0;
  if (!itens) return { estado: "falhou", motivo: `${f.rotulo}: coleta recente, mas vazia` };
  const fontes = Array.isArray(c.fontes) ? (c.fontes as { ok?: unknown }[]) : [];
  if (fontes.length && fontes.every((x) => !x || !x.ok)) return { estado: "falhou", motivo: `${f.rotulo}: todas as fontes fora do ar` };
  return { estado: "ok", motivo: "" };
}

/* um robô = vários arquivos: vale o pior entre os que deu para ler; se NENHUM deu para ler, é indisponível (sem evidência, sem alarme) */
export function avaliarRobo(def: Robo, respostas: Record<string, Resposta>, agora: number): Item {
  const l = def.arquivos.map((f) => ({ f, ...avaliarArquivo(respostas[f.arquivo] ?? null, f, agora) }));
  const lidos = l.filter((x) => x.estado !== "indisponivel");
  const ordem: Estado[] = ["falhou", "atrasado", "ok"];
  const estado: Estado = lidos.length ? (ordem.find((e) => lidos.some((x) => x.estado === e)) as Estado) : "indisponivel";
  const ruins = lidos.filter((x) => x.estado === estado && estado !== "ok");
  const motivo = estado === "indisponivel" ? l.map((x) => x.motivo).join("; ") : ruins.map((x) => x.motivo).join("; ");
  return { entidade: def.processo, estado, nome: def.nome, motivo, fonte: "JSON publicados do robô", fatos: { arquivos: def.arquivos.map((a) => a.arquivo), lidos: lidos.length } };
}

/* uma linha da view monitor_processos → item para o ciclo de incidentes (só os processos que podem alertar) */
export function itemDoBanco(l: LinhaView): Item | null {
  if (!ALERTAVEIS_BANCO.includes(l.processo)) return null;
  const estado: Estado = ["ok", "atrasado", "falhou", "desconhecido", "desligado"].includes(l.estado) ? (l.estado as Estado) : "desconhecido";
  return { entidade: l.processo, estado, nome: l.nome, motivo: l.motivo ?? "", fonte: l.fonte,
    fatos: { limite_min: l.limite_min, ultima_execucao: l.ultima_execucao, ultimo_sucesso: l.ultimo_sucesso } };
}

/* ---------- quando e como avisar ---------- */
const brt = (t: number) => new Date(t - 3 * H);   // relógio de Brasília lido com os métodos getUTC*
const dois = (n: number) => String(n).padStart(2, "0");
export const horaBRT = (t: number) => { const d = brt(t); return d.getUTCHours() + d.getUTCMinutes() / 60; };
/* "14:30" se for do dia de Brasília de agora; senão "25/11 03:10" */
export function quandoBRT(t: number, agora: number): string {
  const d = brt(t), a = brt(agora), hm = `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
  return d.toISOString().slice(0, 10) === a.toISOString().slice(0, 10) ? hm : `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)} ${hm}`;
}
export const emSilencio = (agora: number) => { const h = horaBRT(agora); return h >= SILENCIO_INICIO_H || h < SILENCIO_FIM_H; };

export type Mensagem = { titulo: string; corpo: string; url: string; tag: string; renotificar: boolean };
/* só nome do processo e situação: nada de dado pessoal na tela bloqueada */
export function montarMensagem(abertos: Pendente[], resolvidos: Resolvido[], agora: number): Mensagem {
  const n = abertos.length, sit = (e: string | null) => (e === "falhou" ? "falhou" : "atrasado");
  const linhas = abertos.slice(0, 4).map((a) => `${a.nome ?? a.entidade}: ${sit(a.estado)} (desde ${quandoBRT(Date.parse(a.detectado_em), agora)})`);
  if (n > 4) linhas.push(`e mais ${n - 4}`);
  if (resolvidos.length) linhas.push(`Já resolvida${resolvidos.length > 1 ? "s" : ""}: ${resolvidos.slice(0, 3).map((r) => r.nome ?? r.entidade).join(", ")}${resolvidos.length > 3 ? " e mais " + (resolvidos.length - 3) : ""}`);
  linhas.push("Abra o Monitor para os detalhes.");
  return { titulo: `RAC Monitor: ${n} ocorrência${n > 1 ? "s" : ""}`, corpo: linhas.join("\n"), url: "./#monitor", tag: "monitor-alerta", renotificar: true };
}

export type Decisao =
  | { enviar: false; motivo: "nada" | "silencio" | "limite" }
  | { enviar: true; motivo: "ok"; mensagem: Mensagem; ids: string[] };
/* Um push consolidado por vez: todos os abertos ainda não avisados (mais os resolvidos sem aviso, que só entram como "já resolvida"; resolvido sozinho nunca gera push).
   Silêncio e limite do dia NÃO descartam nada: os incidentes seguem sem aviso em sinais e saem no próximo envio permitido. */
export function decidirEnvio(p: { abertos: Pendente[]; resolvidos: Resolvido[]; pushesHoje: number; agora: number; limiteDia?: number }): Decisao {
  if (!p.abertos.length) return { enviar: false, motivo: "nada" };
  if (emSilencio(p.agora)) return { enviar: false, motivo: "silencio" };
  if (p.pushesHoje >= (p.limiteDia ?? LIMITE_PUSHES_DIA)) return { enviar: false, motivo: "limite" };
  return { enviar: true, motivo: "ok", mensagem: montarMensagem(p.abertos, p.resolvidos, p.agora), ids: [...p.abertos.map((a) => a.id), ...p.resolvidos.map((r) => r.id)] };
}
