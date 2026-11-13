import test from "node:test";
import assert from "node:assert/strict";
import {
  createLineReader,
  readSmtpReply,
  probeImap,
  probeSmtp,
} from "../experimentos/icloud-probe/src/probes.mjs";
import { bearerTokenMatches } from "../experimentos/icloud-probe/src/auth.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function streamFor(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function readerFor(chunks) {
  return streamFor(chunks).getReader();
}

function fakeSocket(responses, options = {}) {
  const commands = [];
  let closed = false;
  let startTlsCalled = false;
  const readable = streamFor(responses);
  const writable = new WritableStream({
    write(chunk) { commands.push(decoder.decode(chunk)); },
  });
  return {
    readable,
    writable,
    commands,
    get closed() { return closed; },
    get startTlsCalled() { return startTlsCalled; },
    close() { closed = true; return Promise.resolve(); },
    startTls() {
      startTlsCalled = true;
      if (options.startTlsError) throw new Error("synthetic_tls_failure");
      closed = true;
      return options.secureSocket;
    },
  };
}

test("line reader handles split CRLF and multiple lines in one TCP chunk", async () => {
  const nextLine = createLineReader(readerFor(["* OK iCloud", " greeting\r\n250-first\r\n250 done\r\n"]));
  assert.equal(await nextLine(), "* OK iCloud greeting");
  assert.equal(await nextLine(), "250-first");
  assert.equal(await nextLine(), "250 done");
});

test("SMTP multiline reply is read completely before returning", async () => {
  const nextLine = createLineReader(readerFor(["250-mail.example\r\n250-PIPELINING\r\n250 STARTTLS\r\n"]));
  assert.deepEqual(await readSmtpReply(nextLine, 250), { code: "250", lines: 3 });
});

test("SMTP reply rejects a wrong status code", async () => {
  const nextLine = createLineReader(readerFor(["550 no service\r\n"]));
  await assert.rejects(readSmtpReply(nextLine, 220), /smtp_unexpected_550/);
});

test("bearer token check requires a sufficiently long exact secret", () => {
  const token = "0123456789abcdef0123456789abcdef";
  assert.equal(bearerTokenMatches("Bearer " + token, token), true);
  assert.equal(bearerTokenMatches("Bearer " + token.slice(1), token), false);
  assert.equal(bearerTokenMatches(token, token), false);
  assert.equal(bearerTokenMatches("Bearer short", "short"), false);
  assert.equal(bearerTokenMatches(null, token), false);
});

test("IMAP probe accepts the server greeting and closes the socket", async () => {
  const socket = fakeSocket(["* OK iCloud Mail ready\r\n"]);
  let args;
  const result = await probeImap((address, options) => { args = { address, options }; return socket; }, 100);
  assert.equal(result.ok, true);
  assert.deepEqual(args, {
    address: { hostname: "imap.mail.me.com", port: 993 },
    options: { secureTransport: "on" },
  });
  assert.equal(socket.closed, true);
});

test("IMAP probe does not accept a non-IMAP greeting", async () => {
  const socket = fakeSocket(["HTTP/1.1 200 OK\r\n"]);
  const result = await probeImap(() => socket, 100);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "imap_unexpected_greeting");
  assert.equal(socket.closed, true);
});

test("SMTP probe negotiates STARTTLS, performs EHLO again over TLS, and closes both sockets", async () => {
  const secureSocket = fakeSocket(["250 secure.example\r\n"]);
  const plainSocket = fakeSocket([
    "220 iCloud SMTP ready\r\n",
    "250-hello\r\n250-PIPELINING\r\n250 STARTTLS\r\n",
    "220 Ready to start TLS\r\n",
  ], { secureSocket });
  let args;
  const result = await probeSmtp((address, options) => { args = { address, options }; return plainSocket; }, 100);
  assert.equal(result.ok, true);
  assert.deepEqual(args, {
    address: { hostname: "smtp.mail.me.com", port: 587 },
    options: { secureTransport: "starttls" },
  });
  assert.equal(plainSocket.startTlsCalled, true);
  assert.deepEqual(plainSocket.commands, [
    "EHLO rac-inbox-poc.example.com\r\n",
    "STARTTLS\r\n",
  ]);
  assert.deepEqual(secureSocket.commands, ["EHLO rac-inbox-poc.example.com\r\n"]);
  assert.equal(plainSocket.closed, true, "STARTTLS fecha o socket em texto claro");
  assert.equal(secureSocket.closed, true);
});

test("SMTP probe reports TLS upgrade failure without leaking server greeting", async () => {
  const plainSocket = fakeSocket([
    "220 iCloud SMTP ready\r\n",
    "250 hello\r\n",
    "220 Ready to start TLS\r\n",
  ], { startTlsError: true });
  const result = await probeSmtp(() => plainSocket, 100);
  assert.equal(result.ok, false);
  assert.equal(result.stage, "tls_handshake");
  assert.equal(result.reason, "network_or_tls_error");
  assert.equal(plainSocket.closed, true);
});
