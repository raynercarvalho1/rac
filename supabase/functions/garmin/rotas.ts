// Rotas simplificadas dos treinos (Lote 3, mapa geral). Funções puras, sem rede e sem banco.
// A rota completa (até 1.500 pontos) vem do arquivo .FIT de cada treino; para o mapa geral guardamos no máximo 150 pontos [lat, lon], com 5 casas (cerca de 1 m).

export const MAX_PONTOS = 150;

const ok = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/* rota = [[lat, lon, velocidade?], ...] → até MAX_PONTOS pontos [lat, lon], em passo regular, sempre com o primeiro e o último; ponto inválido ou fora do globo sai.
   Sem GPS (musculação, esteira) devolve [] — a linha é gravada assim mesmo para o treino não ser pedido de novo. */
export function simplificarRota(rota: unknown, max = MAX_PONTOS): number[][] {
  if (!Array.isArray(rota)) return [];
  const bons = rota.filter((p) => Array.isArray(p) && ok(p[0]) && ok(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && !(p[0] === 0 && p[1] === 0));
  if (!bons.length) return [];
  const n = Math.max(2, Math.floor(max)), passo = bons.length <= n ? 1 : (bons.length - 1) / (n - 1);
  const out: number[][] = [];
  for (let i = 0; i < Math.min(n, bons.length); i++) {
    const p = bons[passo === 1 ? i : Math.round(i * passo)];
    out.push([Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
  }
  return out;
}
