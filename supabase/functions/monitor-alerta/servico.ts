// Monitor de integrações (M4): o vigia. Uma rodada = lê os processos (banco e JSON dos robôs), atualiza os incidentes em sinais e, se puder, manda UM push consolidado.
// Lógica sem rede nem banco aqui: tudo entra por "deps" (tests/monitor_alerta.test.mjs roda com um banco de verdade, PGlite, e com envio falso).
// Ordem que protege o aviso: grava o incidente → manda o push → só então marca como avisado. Se o push falhar, o incidente continua pendente e a próxima rodada tenta de novo
// (no pior caso, um push repetido; nunca um aviso perdido). Ensaio (tipo "ensaio") só lê: não grava incidente, não envia e não marca nada.
import { ROBOS, avaliarRobo, decidirEnvio, itemDoBanco } from "./regras.ts";
import type { Item, LinhaView, Mensagem, Pendente, Resolvido, Resposta } from "./regras.ts";
import type { Entrega } from "./push.ts";

export type Deps = {
  agora(): number;
  donos(): Promise<string[]>;
  processosBanco(agora: number): Promise<LinhaView[]>;
  baixar(arquivo: string): Promise<Resposta>;
  sincronizar(dono: string, itens: Item[], agora: number): Promise<{ abertos: number; atualizados: number; fechados: number }>;
  pendentes(dono: string, agora: number): Promise<{ pushes_hoje: number; abertos: Pendente[]; resolvidos: Resolvido[] }>;
  push(dono: string, msg: Mensagem): Promise<Entrega>;
  marcar(dono: string, ids: string[], lote: string, agora: number): Promise<number>;
  novoLote(): string;
};
export type ResultadoDono = {
  itens: { entidade: string; estado: string }[]; incidentes?: { abertos: number; atualizados: number; fechados: number };
  pendentes: number; resolvidos_sem_aviso: number; pushes_hoje: number; envio: string; erro?: string;
};
export type Resultado = { ok: boolean; ensaio: boolean; donos: number; por_dono: ResultadoDono[] };

export async function rodar(d: Deps, opcoes: { ensaio?: boolean } = {}): Promise<Resultado> {
  const ensaio = !!opcoes.ensaio, agora = d.agora(), donos = await d.donos();
  const respostas: Record<string, Resposta> = {};
  await Promise.all(ROBOS.flatMap((r) => r.arquivos).map(async (f) => { respostas[f.arquivo] = await d.baixar(f.arquivo).catch(() => null); }));
  const robos = ROBOS.map((r) => avaliarRobo(r, respostas, agora));
  const view = donos.length ? await d.processosBanco(agora) : [];
  const por_dono: ResultadoDono[] = [];
  for (const dono of donos) {
    const itens: Item[] = [...(view.filter((l) => l.dono === dono).map(itemDoBanco).filter((x): x is Item => !!x)), ...robos];
    const r: ResultadoDono = { itens: itens.map((i) => ({ entidade: i.entidade, estado: i.estado })), pendentes: 0, resolvidos_sem_aviso: 0, pushes_hoje: 0, envio: "nao" };
    try {
      if (!ensaio) r.incidentes = await d.sincronizar(dono, itens, agora);
      const p = await d.pendentes(dono, agora);
      r.pendentes = p.abertos.length; r.resolvidos_sem_aviso = p.resolvidos.length; r.pushes_hoje = p.pushes_hoje;
      const dec = decidirEnvio({ abertos: p.abertos, resolvidos: p.resolvidos, pushesHoje: p.pushes_hoje, agora });
      if (!dec.enviar) r.envio = dec.motivo;
      else if (ensaio) r.envio = "ensaio: enviaria";
      else {
        const e = await d.push(dono, dec.mensagem);
        if (e.enviados > 0) { await d.marcar(dono, dec.ids, d.novoLote(), agora); r.envio = "enviado"; }
        else r.envio = e.semChaves ? "sem_chaves" : e.aparelhos === 0 ? "sem_aparelho" : "falhou";   // continua pendente: a próxima rodada tenta de novo
      }
    } catch (e) { r.erro = (e as Error)?.name === "Error" ? "falha ao processar" : String((e as Error)?.name ?? "erro"); }
    por_dono.push(r);
  }
  return { ok: por_dono.every((x) => !x.erro), ensaio, donos: donos.length, por_dono };
}
