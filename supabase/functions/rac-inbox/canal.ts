// RAC Inbox · P7: o lado SUPABASE do canal assinado com o Worker (docs/inbox.md, "Canal assinado com o Worker"). Lógica pura (sem Deno, sem banco): `fetch`, relógio e gerador de nonce entram como
// dependências, então tests/inbox_canal.test.mjs prova a assinatura contra o vetor fixo do Worker e o comportamento com um Worker de mentira.
// Autenticação ENTRE SERVIÇOS, separada da do usuário (o JWT do dono já foi conferido em index.ts). A chave de assinatura (RAC_CANAL_K1) vive só em Edge Functions → Secrets e no Worker.
// A credencial iCloud vai no CORPO, por HTTPS, só nesta chamada; este arquivo não a registra, não a devolve e não a coloca em nenhum erro. Redirecionamento NÃO é seguido (o corpo nunca vai para outro destino).
import type { ResultadoWorker, Worker } from "./servico.ts";

const codificador = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const VERSAO_CANAL = "rac-canal-v1", CAMINHO_CANAL = "/v1/op";
const RE_CODIGO = /^[a-z][a-z0-9_]{1,40}$/, RE_CHAVE = /^k[1-9]$/;
export const RESPOSTA_MAX_CARACTERES = 6291456;   // cobre um anexo de até 3 MiB em base64 e a lista de mensagens

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}
export function stringCanonica(p: { metodo: string; caminho: string; chave: string; timestamp: string; nonce: string; operacao: string; hashCorpo: string }): string {
  return [VERSAO_CANAL, p.metodo, p.caminho, p.chave, p.timestamp, p.nonce, p.operacao, p.hashCorpo].join("\n");
}
export async function assinar(p: { segredo: string; chave: string; timestamp: number; nonce: string; operacao: string; corpoBytes: Uint8Array; metodo?: string; caminho?: string }): Promise<string> {
  const canonica = stringCanonica({ metodo: p.metodo ?? "POST", caminho: p.caminho ?? CAMINHO_CANAL, chave: p.chave, timestamp: String(p.timestamp), nonce: p.nonce, operacao: p.operacao, hashCorpo: await sha256Hex(p.corpoBytes) });
  const k = await crypto.subtle.importKey("raw", codificador.encode(p.segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "v1=" + hex(await crypto.subtle.sign("HMAC", k, codificador.encode(canonica)));
}
/* 24 bytes aleatórios → 32 caracteres base64url (o Worker aceita de 16 a 43) */
export function nonceAleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ConfigCanal {
  url: string;                   // base do Worker, ex.: https://rac-inbox-worker.conta.workers.dev (só HTTPS; o caminho /v1/op é fixo)
  segredo: string;               // RAC_CANAL_K1 (mínimo 32 caracteres)
  chave?: string;                // "k1" (padrão) ou "k2" durante uma rotação
  timeoutMs?: number;            // padrão 40 s: acima do tempo máximo do Worker (25 s por sessão IMAP)
  fetchFn?: (entrada: string, init: RequestInit) => Promise<Response>;
  agoraS?: () => number;
  nonce?: () => string;
}

// `null` quando a configuração não permite assinar com segurança (a função então responde "worker_nao_configurado"; nada é enviado)
export function criarWorkerHttp(cfg: ConfigCanal | null): Worker | null {
  if (!cfg || typeof cfg.url !== "string" || typeof cfg.segredo !== "string" || cfg.segredo.length < 32) return null;
  let base: URL;
  try { base = new URL(cfg.url); } catch (_) { return null; }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) return null;
  const chave = cfg.chave ?? "k1";
  if (!RE_CHAVE.test(chave)) return null;
  const destino = base.origin + CAMINHO_CANAL, fetchFn = cfg.fetchFn ?? ((u, i) => fetch(u, i)), agora = cfg.agoraS ?? (() => Math.floor(Date.now() / 1000)), gerarNonce = cfg.nonce ?? nonceAleatorio;
  return {
    async executar(operacao, pedido, credencial): Promise<ResultadoWorker> {
      const corpoBytes = codificador.encode(JSON.stringify({ operacao, ...pedido, usuario: credencial.usuario, senha: credencial.senha }));
      const timestamp = agora(), nonce = gerarNonce();
      const assinatura = await assinar({ segredo: cfg.segredo, chave, timestamp, nonce, operacao, corpoBytes });
      let resp: Response, texto: string;
      try {
        resp = await fetchFn(destino, {
          method: "POST", redirect: "error", body: corpoBytes, signal: AbortSignal.timeout(cfg.timeoutMs ?? 40000),
          headers: { "Content-Type": "application/json", "X-RAC-Key-Id": chave, "X-RAC-Timestamp": String(timestamp), "X-RAC-Nonce": nonce, "X-RAC-Operacao": operacao, "X-RAC-Assinatura": assinatura },
        });
        texto = await resp.text();
      } catch (_) { throw new Error("canal_falhou"); }   // rede, tempo esgotado, redirecionamento: mensagem FIXA (a original poderia citar destino ou conteúdo)
      if (texto.length > RESPOSTA_MAX_CARACTERES) throw new Error("resposta_grande_demais");   // mensagem fixa: nada do corpo
      let j: unknown;
      try { j = JSON.parse(texto); } catch (_) { throw new Error("resposta_invalida"); }
      const o = j && typeof j === "object" ? (j as Record<string, unknown>) : null;
      if (resp.status === 200 && o && o.ok === true && o.dados && typeof o.dados === "object" && !Array.isArray(o.dados)) return { ok: true, dados: o.dados as Record<string, unknown> };
      if (o && o.ok === false && typeof o.erro === "string" && RE_CODIGO.test(o.erro)) return { ok: false, erro: o.erro };
      throw new Error("resposta_invalida");
    },
  };
}
