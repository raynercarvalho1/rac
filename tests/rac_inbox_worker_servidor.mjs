// Ajuda dos testes do Worker de produto do RAC Inbox: um servidor IMAP FALSO em memória (nada de rede). Registra TODO comando recebido,
// para os testes provarem que só verbos de leitura saem e que a senha nunca aparece fora do LOGIN. NÃO prova o comportamento do iCloud real (isso é teste real, à parte).
export const utf8Latin1 = (s) => String.fromCharCode(...new TextEncoder().encode(s));
export const b64 = (s) => Buffer.from(s, "latin1").toString("base64");

const CAMPOS = ["FROM", "TO", "CC", "SUBJECT", "DATE", "MESSAGE-ID", "REFERENCES", "CONTENT-TYPE"];
export function mensagem({ uid, flags = ["\\Seen"], data = "14-Nov-2026 10:20:30 +0000", de = "Ana <ana@exemplo.com>", para = "Eu <eu@icloud.com>", assunto = "Assunto", tipo = "text/plain; charset=utf-8", estrutura, partes = {}, tamanho }) {
  const cab = "From: " + de + "\r\nTo: " + para + "\r\nSubject: " + assunto + "\r\nDate: Fri, 14 Nov 2026 10:20:30 +0000\r\nMessage-ID: <m" + uid + "@exemplo.com>\r\nContent-Type: " + tipo + "\r\n\r\n";
  return { uid, flags, data, cab, estrutura: estrutura || '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 11 1 NIL NIL NIL)', partes: { "1": utf8Latin1("Olá, mundo"), ...partes }, tamanho: tamanho || 1000 + uid };
}

// caixas: { "INBOX": { uidvalidity, uidnext, msgs: [...] } }; pastas: linhas "* LIST ..." prontas
export function servidorFalso({ senha = "abcd-efgh-ijkl-mnop", pastas = [], caixas = {}, literalPrimeiro = false, aoComando = () => {} } = {}) {
  const log = [];
  const c2s = new TransformStream(), s2c = new TransformStream();
  const escritor = s2c.writable.getWriter(), leitor = c2s.readable.getReader();
  const enc = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
  const dec = new TextDecoder("latin1");
  let atual = null, buf = "";
  const env = (s) => escritor.write(enc(s));
  const cx = () => atual && caixas[atual];

  function itens(m, seq, texto, porUid = false) {
    const pedidos = porUid && !/(^|[ (])UID /.test("(" + texto) ? ["UID"] : [], reg = /(UID|FLAGS|INTERNALDATE|RFC822\.SIZE|BODYSTRUCTURE|BODY\.PEEK\[HEADER\.FIELDS \([A-Z -]+\)\]<0\.\d+>|BODY\.PEEK\[[\d.]+\](?:<0\.\d+>)?)/g;
    let r; while ((r = reg.exec(texto))) pedidos.push(r[1]);
    const simples = [], lits = [];
    for (const p of pedidos) {
      if (p === "UID") simples.push("UID " + m.uid);
      else if (p === "FLAGS") simples.push("FLAGS (" + m.flags.join(" ") + ")");
      else if (p === "INTERNALDATE") simples.push('INTERNALDATE "' + m.data + '"');
      else if (p === "RFC822.SIZE") simples.push("RFC822.SIZE " + m.tamanho);
      else if (p === "BODYSTRUCTURE") simples.push("BODYSTRUCTURE " + m.estrutura);
      else if (p.startsWith("BODY.PEEK[HEADER")) { const n = Number(/<0\.(\d+)>/.exec(p)[1]); const campos = /\(([A-Z -]+)\)/.exec(p)[1]; lits.push(["BODY[HEADER.FIELDS (" + campos + ")]<0>", m.cab.slice(0, n)]); }
      else { const mm = /BODY\.PEEK\[([\d.]+)\](?:<0\.(\d+)>)?/.exec(p); const dado = m.partes[mm[1]]; if (dado === undefined) continue; lits.push(["BODY[" + mm[1] + "]" + (mm[2] ? "<0>" : ""), mm[2] ? dado.slice(0, Number(mm[2])) : dado]); }
    }
    let linha = "* " + seq + " FETCH (", partes = literalPrimeiro ? [...lits.map((l) => ({ l })), ...simples.map((s) => ({ s }))] : [...simples.map((s) => ({ s })), ...lits.map((l) => ({ l }))];
    let primeiro = true, saida = "";
    for (const p of partes) {
      if (p.s) { saida += (primeiro ? "" : " ") + p.s; }
      else { saida += (primeiro ? "" : " ") + p.l[0] + " {" + p.l[1].length + "}\r\n" + p.l[1]; }
      primeiro = false;
    }
    return linha + saida + ")\r\n";
  }
  const conjunto = (txt, max) => { // "5", "2:4", "3:*", "1,4,9"
    if (txt.includes(",")) return txt.split(",").map(Number);
    const m = /^(\d+)(?::(\d+|\*))?$/.exec(txt); if (!m) return [];
    const a = Number(m[1]), b = m[2] === undefined ? a : m[2] === "*" ? max : Number(m[2]);
    const r = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) r.push(i); return r;
  };

  async function tratar(linha) {
    log.push(linha); aoComando(linha);
    const m = /^(a\d+) ([A-Z]+)(.*)$/.exec(linha); if (!m) return;
    const [, tag, verbo, resto] = m;
    if (verbo === "CAPABILITY") { await env("* CAPABILITY IMAP4rev1 UIDPLUS MOVE NAMESPACE\r\n" + tag + " OK done\r\n"); return; }
    if (verbo === "LOGIN") { const mm = /^ "([^"]*)" "([^"]*)"$/.exec(resto); await env(mm && mm[2] === senha ? tag + " OK LOGIN completed\r\n" : tag + " NO [AUTHENTICATIONFAILED] Authentication failed\r\n"); return; }
    if (verbo === "LOGOUT") { await env("* BYE bye\r\n" + tag + " OK LOGOUT completed\r\n"); return; }
    if (verbo === "LIST") { await env(pastas.join("\r\n") + (pastas.length ? "\r\n" : "") + tag + " OK LIST completed\r\n"); return; }
    if (verbo === "EXAMINE") {
      const nome = /^ "(.*)"$/.exec(resto)[1]; const c = caixas[nome];
      if (!c) { await env(tag + " NO [NONEXISTENT] Mailbox does not exist\r\n"); return; }
      atual = nome;
      await env("* " + c.msgs.length + " EXISTS\r\n* OK [UIDVALIDITY " + c.uidvalidity + "] UIDs valid\r\n* OK [UIDNEXT " + c.uidnext + "] Predicted next UID\r\n" + tag + " OK [READ-ONLY] EXAMINE completed\r\n"); return;
    }
    if (verbo === "FETCH") {
      const mm = /^ (\S+) \((.*)\)$/.exec(resto); let out = "";
      for (const seq of conjunto(mm[1], cx().msgs.length)) { const msg = cx().msgs[seq - 1]; if (msg) out += itens(msg, seq, mm[2]); }
      await env(out + tag + " OK FETCH completed\r\n"); return;
    }
    if (verbo === "UID") {
      const sub = /^ (FETCH|SEARCH)/.exec(resto)[1], maxUid = Math.max(...cx().msgs.map((x) => x.uid));
      if (sub === "SEARCH") { const n = Number(/UID 1:(\d+)/.exec(resto)[1]); const l = cx().msgs.filter((x) => x.uid <= n).map((x) => x.uid); await env("* SEARCH" + (l.length ? " " + l.join(" ") : "") + "\r\n" + tag + " OK SEARCH completed\r\n"); return; }
      const mm = /^ FETCH (\S+) \((.*)\)$/.exec(resto); let out = "";
      const uids = mm[1].includes("*") ? (() => { const a = Number(mm[1].split(":")[0]); const r = cx().msgs.filter((x) => x.uid >= a).map((x) => x.uid); return r.length ? r : [maxUid]; })() : conjunto(mm[1], maxUid);
      for (const u of uids) { const i = cx().msgs.findIndex((x) => x.uid === u); if (i >= 0) out += itens(cx().msgs[i], i + 1, mm[2], true); }   // UID FETCH: o servidor SEMPRE devolve o UID (RFC 3501)
      await env(out + tag + " OK UID FETCH completed\r\n"); return;
    }
    await env(tag + " BAD comando desconhecido\r\n");
  }

  (async () => {
    await env("* OK IMAP ready\r\n");
    for (;;) {
      const { done, value } = await leitor.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\r\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); await tratar(l); }
    }
  })().catch(() => {});
  return { log, socket: { readable: s2c.readable, writable: c2s.writable, close: async () => { try { await escritor.close(); } catch (_) { /* já fechado */ } } } };
}
