const ENCODER = new TextEncoder();
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_LINE_LENGTH = 4_096;
const MAX_SMTP_REPLY_LINES = 30;

export function createLineReader(reader) {
  let buffer = "";
  const decoder = new TextDecoder();

  return async function nextLine() {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        return line.endsWith("\r") ? line.slice(0, -1) : line;
      }

      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        if (buffer.length) {
          const line = buffer;
          buffer = "";
          return line.endsWith("\r") ? line.slice(0, -1) : line;
        }
        throw new Error("socket_closed_before_line");
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > MAX_LINE_LENGTH) throw new Error("protocol_line_too_long");
    }
  };
}

export async function readSmtpReply(nextLine, expectedCode) {
  let line = await nextLine();
  if (!/^\d{3}[ -]/.test(line)) throw new Error("smtp_invalid_reply");

  const code = line.slice(0, 3);
  let lines = 1;
  while (line.charAt(3) === "-") {
    if (lines >= MAX_SMTP_REPLY_LINES) throw new Error("smtp_reply_too_long");
    line = await nextLine();
    lines += 1;
    if (!new RegExp("^" + code + "[ -]").test(line)) throw new Error("smtp_inconsistent_reply");
  }

  if (code !== String(expectedCode)) throw new Error("smtp_unexpected_" + code);
  return { code, lines };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe_timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeReason(error) {
  const message = String(error && error.message ? error.message : error);
  if (message === "probe_timeout") return "timeout";
  if (/^(imap_|smtp_|protocol_)/.test(message)) return message;
  return "network_or_tls_error";
}

function release(reader, writer) {
  try { if (reader) reader.releaseLock(); } catch (_) { /* socket may already be closed */ }
  try { if (writer) writer.releaseLock(); } catch (_) { /* socket may already be closed */ }
}

async function closeSocket(socket) {
  try { if (socket) await socket.close(); } catch (_) { /* best-effort cleanup */ }
}

function elapsed(started) {
  return Math.max(0, Math.round(performance.now() - started));
}

export async function probeImap(connect, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = performance.now();
  let socket;
  let reader;
  let stage = "tcp_tls_connect";

  try {
    socket = connect({ hostname: "imap.mail.me.com", port: 993 }, { secureTransport: "on" });
    reader = socket.readable.getReader();
    stage = "imap_greeting";
    const greeting = await withTimeout(createLineReader(reader)(), timeoutMs);
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) throw new Error("imap_unexpected_greeting");
    return { ok: true, stage: "imap_greeting", elapsedMs: elapsed(started) };
  } catch (error) {
    return { ok: false, stage, reason: safeReason(error), elapsedMs: elapsed(started) };
  } finally {
    release(reader, null);
    await closeSocket(socket);
  }
}

export async function probeSmtp(connect, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = performance.now();
  let socket;
  let reader;
  let writer;
  let stage = "tcp_connect";

  try {
    socket = connect({ hostname: "smtp.mail.me.com", port: 587 }, { secureTransport: "starttls" });
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    let nextLine = createLineReader(reader);

    stage = "smtp_greeting";
    await withTimeout(readSmtpReply(nextLine, 220), timeoutMs);

    stage = "smtp_ehlo";
    await withTimeout(writer.write(ENCODER.encode("EHLO rac-inbox-poc.example.com\r\n")), timeoutMs);
    await withTimeout(readSmtpReply(nextLine, 250), timeoutMs);

    stage = "smtp_starttls";
    await withTimeout(writer.write(ENCODER.encode("STARTTLS\r\n")), timeoutMs);
    await withTimeout(readSmtpReply(nextLine, 220), timeoutMs);

    release(reader, writer);
    reader = null;
    writer = null;

    stage = "tls_handshake";
    socket = socket.startTls();
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    nextLine = createLineReader(reader);

    stage = "smtp_ehlo_over_tls";
    await withTimeout(writer.write(ENCODER.encode("EHLO rac-inbox-poc.example.com\r\n")), timeoutMs);
    await withTimeout(readSmtpReply(nextLine, 250), timeoutMs);

    return { ok: true, stage: "smtp_tls_ready", elapsedMs: elapsed(started) };
  } catch (error) {
    return { ok: false, stage, reason: safeReason(error), elapsedMs: elapsed(started) };
  } finally {
    release(reader, writer);
    await closeSocket(socket);
  }
}
