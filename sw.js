/* Service worker do Dia a Dia RAC: deixa o site instalável como app, funcionando também sem internet.
   - Arquivos do site (páginas e módulos): rede primeiro; sem internet, a última versão guardada.
   - Dados que os robôs atualizam (notícias, Newsletter, vagas, tecnologia): abre na hora com a cópia guardada e atualiza por trás;
     com ?atualizar=1 (botão de atualizar) vai à rede primeiro.
   - Bibliotecas de CDN (mapa, gráficos de PDF, Supabase): guardadas na primeira vez, porque o endereço já tem a versão.
   - Notificações push: mostra o aviso e, ao tocar, abre a página certa.
   A cada publicação, VERSAO muda: os caches velhos do site são apagados na ativação. */
const VERSAO = "2026-11-13.4";
const APP = "rac-app-" + VERSAO, DADOS = "rac-dados", LIBS = "rac-libs";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./css/rac.css", "./nucleo.js", "./js/dados.js", "./mercado.js", "./js/rotas.js", "./js/app.js", "./js/graficos.js", "./js/fontes.js", "./js/fonte-familia.js", "./js/fonte-mba.js", "./js/fonte-newsletter.js", "./js/fonte-agenda.js", "./js/esportes.js", "./js/radar.js", "./js/esportes-central.js", "./js/familia.js", "./js/mba.js", "./js/saude.js", "./js/conexoes.js", "./js/sistema.js", "./js/lista.js", "./js/carreira.js", "./js/bebe.js", "./js/oms.js", "./js/resumo.js", "./js/rede.js", "./js/newsletter.js", "./js/seguranca.js", "./js/painel.js", "./js/alimentacao.js", "./js/compras.js", "./js/fiscal.js", "./js/hoje.js", "./js/iacustos.js", "./js/componentes.js", "./js/kit.js", "./icons/icon-192.png", "./icons/icon-512.png"];
const LIB_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => ![APP, DADOS, LIBS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* "no-cache": sempre pergunta ao servidor se o arquivo mudou (o GitHub deixa guardar por 10 minutos e a correção demorava a chegar) */
function redePrimeiro(req) {
  return fetch(req, { cache: "no-cache" }).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(APP).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)));
}
function guardadoEAtualiza(req, chave) {
  return caches.open(DADOS).then(c => c.match(chave).then(guardado => {
    const rede = fetch(req).then(res => { if (res.ok) c.put(chave, res.clone()); return res; }).catch(() => guardado);
    return guardado || rede;
  }));
}
/* botão de atualizar (?atualizar=1): pergunta à rede agora e renova a cópia; sem rede, devolve a cópia de antes (a tela não fica vazia) */
function redeEGuarda(req, chave) {
  return caches.open(DADOS).then(c => fetch(req, { cache: "no-cache" }).then(res => { if (res.ok) c.put(chave, res.clone()); return res; })
    .catch(() => c.match(chave).then(guardado => guardado || Response.error())));
}
function guardadoPrimeiro(req) {
  return caches.open(LIBS).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; })));
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === self.location.origin) {
    if (/\.json$/.test(url.pathname) && !/manifest/.test(url.pathname)) {
      e.respondWith(url.searchParams.get("atualizar") === "1" ? redeEGuarda(req, url.origin + url.pathname) : guardadoEAtualiza(req, url.origin + url.pathname));
      return;
    }
    e.respondWith(redePrimeiro(req));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) e.respondWith(guardadoPrimeiro(req));
  /* o resto (Supabase, MLB, ESPN, Garmin, mapas) sempre ao vivo */
});

/* ---------- notificações ---------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Dia a Dia RAC", {
    body: d.corpo || "", icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "./#agenda" },
  }));
});
/* Ao tocar: abre o destino que o aviso traz (o servidor escolhe; aqui ele não muda). Só endereço deste site; outro vira o início.
   - App aberto: traz a janela para a frente e avisa a página ("rac-abrir"), que troca de página sozinha (js/app.js, notifIr).
     Página carregada antes desta versão (sem o aviso): o navigate do navegador, quando existe; se falhar, nada quebra.
   - App fechado: abre uma janela já no destino.
   - Reserva: o destino fica guardado por alguns minutos em rac-dados (não é apagado na troca de versão); a página confere ao
     abrir e ao voltar a ficar visível, para o iPhone que abre o início em vez do endereço e para a página que perdeu o aviso. */
const DESTINO = new URL("./__rac-destino", self.location.href).href;
function destinoDe(dados) {
  try { const u = new URL((dados && dados.url) || "./", self.location.href); if (u.origin === self.location.origin) return u.href; } catch (_) { /* endereço inválido */ }
  return new URL("./", self.location.href).href;
}
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = destinoDe(e.notification.data);
  const guardar = caches.open(DADOS)
    .then(c => c.put(DESTINO, new Response(JSON.stringify({ url: alvo, quando: Date.now() }), { headers: { "Content-Type": "application/json" } })))
    .catch(() => {});
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    const daqui = l.filter(c => c.url.startsWith(self.location.origin));
    const c = daqui.filter(x => x.focused)[0] || daqui.filter(x => x.visibilityState === "visible")[0] || daqui[0];
    if (!c) return Promise.all([guardar, self.clients.openWindow(alvo)]);
    /* o foco primeiro: o toque só libera trazer a janela para a frente por pouco tempo */
    const foco = Promise.resolve().then(() => c.focus()).catch(() => {});
    const avisar = guardar.then(() => c.postMessage({ tipo: "rac-abrir", url: alvo })).catch(() => {});
    /* navigate só para trocar o "#…" do mesmo endereço: nunca recarrega a página (o que apagaria um texto não salvo) */
    const mesma = c.url.split("#")[0] === alvo.split("#")[0];
    const ir = mesma && c.url !== alvo && typeof c.navigate === "function" ? Promise.resolve().then(() => c.navigate(alvo)).catch(() => {}) : null;
    return Promise.all([foco, avisar, ir]);
  }));
});
