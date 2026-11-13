import { connect } from "cloudflare:sockets";
import { bearerTokenMatches } from "./auth.mjs";
import { probeImap, probeSmtp } from "./probes.mjs";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/probe") {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (typeof env.PROBE_TOKEN !== "string" || env.PROBE_TOKEN.length < 32) {
      return json(503, { ok: false, error: "probe_secret_not_configured" });
    }
    if (!bearerTokenMatches(request.headers.get("Authorization"), env.PROBE_TOKEN)) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const started = performance.now();
    const [imap, smtp] = await Promise.all([probeImap(connect), probeSmtp(connect)]);
    return json(200, {
      ok: imap.ok && smtp.ok,
      imap993: imap,
      smtp587StartTls: smtp,
      elapsedMs: Math.max(0, Math.round(performance.now() - started)),
      authenticated: false,
      emailSent: false,
      purpose: "connectivity_only",
    });
  },
};
