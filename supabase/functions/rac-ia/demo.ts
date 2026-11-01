// RAC Intelligence: respostas simuladas do modo DEMO. Não fazem nenhuma chamada externa, não gravam nada no banco,
// não contam no orçamento e são marcadas em três lugares (modo "DEMO", resultado._demo e valores obviamente falsos).
// No site, uma resposta DEMO só aparece numa prévia de leitura: nunca entra nas telas que salvam (docs/rac-intelligence.md).

import { ACOES, fatosDaEntrada, idsDaEntrada, type Entrada } from "./acoes.ts";
import type { Resposta } from "./contrato.ts";

const FIXTURES: Record<string, (ctx: Record<string, unknown>, entrada?: Entrada) => Record<string, unknown>> = {
  "abastecimento.interpretar": (ctx) => ({
    veiculo: ctx.veiculo_sugerido === "carro" ? "carro" : "moto", data: null, km: 0, litros: 1, preco_litro: 1, total: 1,
    combustivel: "gasolina", posto: "POSTO DEMONSTRAÇÃO", alertas: [],
  }),
  "mercado.nota": () => ({
    mercado: "MERCADO DEMONSTRAÇÃO", cnpj: null, data: null, numero: null, serie: null, chave: null, pagamento: "DEMONSTRAÇÃO",
    total_pago: 3, desconto_nota: 0,
    itens: [
      { descricao: "ITEM DE DEMONSTRAÇÃO 1", qtd: 1, un: "un", unitario: 1, total: 1, desconto: 0 },
      { descricao: "ITEM DE DEMONSTRAÇÃO 2", qtd: 2, un: "un", unitario: 1, total: 2, desconto: 0 },
    ],
  }),
  "alimentacao.pedido": () => ({
    estabelecimento: "RESTAURANTE DEMONSTRAÇÃO", plataforma: "outro", modo: "delivery", data: null, numero: null, pagamento: "DEMONSTRAÇÃO",
    subtotal: 2, taxa_entrega: 1, taxa_servico: 0, gorjeta: 0, desconto_loja: 0, desconto_plataforma: 0, total_pago: 3,
    itens: [{ descricao: "PRATO DE DEMONSTRAÇÃO", qtd: 1, unitario: 2, total: 2, desconto: 0, observacao: null }],
  }),
  /* usa os ids que vieram na entrada (senão a validação recusaria); os textos são obviamente simulados */
  "newsletter.resumo": (_ctx, entrada) => {
    const ids = idsDaEntrada(entrada).slice(0, 5);
    return {
      resumo_dia: "DEMONSTRAÇÃO: este é um resumo simulado. Nenhuma notícia foi lida pela IA.",
      destaques: ids.map((id, i) => ({ id, titulo: "Destaque de demonstração " + (i + 1), resumo: "Resumo simulado, sem relação com a notícia.", relevancia: "Texto de demonstração." })),
      categorias: [],
    };
  },
  /* cita só ids que vieram e não escreve nenhum número: passa pela mesma validação, e é obviamente simulado */
  "esportes.analise": (_ctx, entrada) => espDemo(entrada),
  "esportes.giro": (_ctx, entrada) => espDemo(entrada),
};
function espDemo(entrada?: Entrada): Record<string, unknown> {
  const ids = [...fatosDaEntrada(entrada).keys()];
  return {
    titulo: "Análise de demonstração",
    resumo: "DEMONSTRAÇÃO: texto simulado. Nenhum fato foi lido pela IA; os fatos citados abaixo são os enviados, sem interpretação.",
    resumo_fatos: ids.slice(0, 2),
    pontos: ids.slice(0, 3).map((id, i) => ({ tipo: ["destaque", "tendencia", "atencao"][i], texto: "Ponto de demonstração, sem relação com o fato citado.", fatos: [id] })),
    insuficiente: ["Demonstração: a análise de verdade só existe no modo REAL."],
  };
}

export const AVISO_DEMO = "DEMONSTRAÇÃO: resposta simulada, não veio do Claude. Não pode ser salva.";

export function respostaDemo(acao: string, contexto: Record<string, unknown>, motivo: string, avisos: string[], entrada?: Entrada): Resposta {
  const a = ACOES[acao], f = FIXTURES[acao];
  if (!a || !f) throw new Error("ação sem demonstração: " + acao);
  /* passa pela mesma validação do modo REAL, para testar o contrato de verdade */
  const v = a.validar(f(contexto, entrada), contexto, entrada);
  if (!v.ok) throw new Error("demonstração inválida para " + acao + ": " + v.motivo);
  return {
    ok: true, versao: 1, id: null, modulo: a.modulo, acao: a.id, modo: "DEMO", estado: "demo",
    resultado: { ...v.resultado, _demo: true },
    mensagem: AVISO_DEMO + (motivo ? " " + motivo : ""),
    avisos,
    consumo: { modelo: "nenhum (demonstração)", uso_api: null, reservado_usd: null, estimado_rac_usd: null, cobranca_efetiva: null, observacao: "Modo DEMO: nenhuma chamada paga." },
  };
}

export function temDemo(acao: string): boolean { return Object.prototype.hasOwnProperty.call(FIXTURES, acao); }
