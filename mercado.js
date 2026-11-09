/* Aba Mercado do Dia a Dia RAC: controle de compras do mercado, privado.
   Os dados ficam no Supabase do Rayner; só quem faz login vê alguma coisa (RLS no banco).
   A chave abaixo é a publicável, feita para ficar no site; a segurança vem das regras do banco.
   Bibliotecas (supabase-js e SheetJS) só carregam quando a aba é aberta. */
(function () {
  var SB_URL = "https://hofnhbxnfebfnncwxrds.supabase.co";
  var SB_KEY = "sb_publishable_kpEqdxunDeIbStJrgxrngg_tNPv6VTL";
  var SUPA_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js";
  var XLSX_JS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

  var sb = null, user = null, rows = null, loadingRows = null;
  var st = { mes: null, q: "", prod: null, ord: { k: "var", d: -1 }, pmes: "" };

  /* ---------- utilidades ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
    });
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) { add(c); return; }
        e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
    })(Array.prototype.slice.call(arguments, 2));
    return e;
  }
  function panel(title, sub) {
    var p = h("div", { class: "panel" });
    if (title) p.appendChild(h("h2", { text: title }));
    if (sub) p.appendChild(h("p", { class: "sub", style: "margin:-6px 0 12px", text: sub }));
    return p;
  }
  function norm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function money(v) { return BRL.format(v || 0); }
  function mesKey(iso) { return iso.slice(0, 7); }
  function mesNome(k) { var p = k.split("-"); return MESES[+p[1] - 1] + " " + p[0]; }
  function mesCurto(k) { var p = k.split("-"); return MESES[+p[1] - 1].slice(0, 3) + "/" + p[0].slice(2); }
  function dataBR(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (f ? f(x) : x); }, 0); }
  function groupBy(arr, f) { var m = {}; arr.forEach(function (x) { var k = f(x); (m[k] = m[k] || []).push(x); }); return m; }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("não carregou " + src)); };
      document.head.appendChild(s);
    });
  }
  function client() {
    if (sb) return Promise.resolve(sb);
    return (window.supabase ? Promise.resolve() : loadScript(SUPA_JS)).then(function () {
      sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "rac-mercado-auth", experimental: { passkey: true } } });
      return sb;
    });
  }
  function root() { return document.getElementById("mercado-view"); }
  function msg(text) { var r = root(); r.innerHTML = ""; r.appendChild(h("div", { class: "panel" }, h("p", { class: "empty", text: text }))); }

  /* ---------- entrada: chamada pelo roteador do site ---------- */
  function render(sub) {
    msg("Carregando…");
    client().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      user = r.data && r.data.session && r.data.session.user;
      if (!user) { drawLogin(sub); return; }
      return loadRows().then(function () { drawApp(sub); });
    }).catch(function (e) { msg("Não consegui abrir o controle de mercado agora (" + (e.message || e) + ")."); });
  }

  function drawLogin(sub) {
    var r = root(); r.innerHTML = "";
    var f = h("form", { class: "panel lockbox", autocomplete: "on" },
      h("div", { class: "lockic mk" }, svgCart()),
      h("h2", { text: "Controle de mercado" }),
      h("p", { class: "sub", text: "Entre com a sua conta para ver as suas compras." }),
      h("input", { type: "email", id: "mk-email", placeholder: "E-mail", "aria-label": "E-mail", autocomplete: "username", required: "" }),
      h("input", { type: "password", id: "mk-pw", placeholder: "Senha", "aria-label": "Senha", autocomplete: "current-password", required: "" }),
      h("button", { type: "submit", id: "mk-enter", text: "Entrar" }),
      h("p", { class: "sub", id: "mk-msg", role: "status" }));
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = document.getElementById("mk-enter"), m = document.getElementById("mk-msg");
      b.disabled = true; m.textContent = "Entrando…";
      sb.auth.signInWithPassword({ email: document.getElementById("mk-email").value.trim(), password: document.getElementById("mk-pw").value })
        .then(function (res) {
          b.disabled = false;
          if (res.error) { m.textContent = /invalid/i.test(res.error.message) ? "E-mail ou senha incorretos." : "Não consegui entrar: " + res.error.message; return; }
          render(sub);
        });
    });
    r.appendChild(f);
  }

  /* Todas as linhas da visão "compras" (um item por linha), em páginas de 1000 */
  function loadRows(force) {
    if (rows && !force) return Promise.resolve(rows);
    if (loadingRows && !force) return loadingRows;
    var out = [];
    function page(from) {
      return sb.from("compras").select("id,data,mes,mercado,numero,forma_pagamento,categoria,descricao,produto,produto_id,quantidade,unidade,valor_unitario,valor_total,desconto,observacao")
        .order("data", { ascending: true }).range(from, from + 999)
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          out = out.concat(r.data || []);
          return (r.data || []).length === 1000 ? page(from + 1000) : out;
        });
    }
    loadingRows = page(0).then(function (d) {
      d.forEach(function (x) { x.categoria = catOf(x.categoria); x.valor_total = +x.valor_total; x.valor_unitario = +x.valor_unitario; x.quantidade = +x.quantidade; x.desconto = +x.desconto; x.mk = mesKey(x.data); x.nota = x.data + "|" + x.mercado + "|" + (x.numero || ""); });
      rows = d; loadingRows = null; return rows;
    });
    return loadingRows;
  }

  /* ---------- casca: abas internas e sair ---------- */
  var VIEWS = [["painel", "Painel"], ["precos", "Preços"], ["consumo", "Consumo"], ["comparar", "Comparar"], ["alertas", "Alertas"], ["notas", "Notas"], ["produtos", "Produtos"], ["importar", "Adicionar nota"]];
  function drawApp(sub) {
    var v = VIEWS.some(function (x) { return x[0] === sub; }) ? sub : (rows.length ? "painel" : "importar");
    /* redesenhar não pode pular a rolagem: senão o 2º clique cai em outro quadro */
    var y = window.scrollY, r = root(); r.innerHTML = "";
    var bar = h("div", { class: "mkbar" });
    var tabs = h("div", { class: "pills mkpills", "aria-label": "Mercado" });
    /* "Adicionar nota" fica fora das abas, como botão de destaque no topo */
    VIEWS.forEach(function (x) {
      if (x[0] === "importar" || (x[0] === "alertas" && !ehDono())) return;
      var n = x[0] === "alertas" ? alContar() : 0;
      tabs.appendChild(h("a", { href: "#mercado/" + x[0], "aria-current": x[0] === v ? "page" : null, text: x[1] + (n ? " (" + n + ")" : "") }));
    });
    var add = h("a", { class: "mkadd", href: "#mercado/importar", "aria-current": v === "importar" ? "page" : null }, h("span", { "aria-hidden": "true", text: "+" }), " Adicionar nota");
    var out = h("button", { type: "button", class: "ghostbtn", text: "Sair" });
    out.onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
    bar.appendChild(add); bar.appendChild(tabs); bar.appendChild(h("div", { class: "mkuser" }, h("span", { class: "sub", text: user.email }), out));
    r.appendChild(bar);
    var body = h("div", { class: "stack" }); r.appendChild(body);
    if (!rows.length && v !== "importar") {
      body.appendChild(h("div", { class: "panel" }, h("p", { class: "empty" }, "Ainda não há compras na sua conta. ", h("a", { class: "link", href: "#mercado/importar", text: "Importe o seu Excel" }), " para começar.")));
      return;
    }
    ({ painel: viewPainel, precos: viewPrecos, consumo: viewConsumo, comparar: viewComparar, alertas: viewAlertas, notas: viewNotas, produtos: viewProdutos, importar: viewImportar })[v](body);
    window.scrollTo(0, y);
  }

  /* ---------- Painel ---------- */
  function semCidade(n) { return String(n || "").replace(/\s*\(.*\)$/, ""); }
  function viewPainel(body) {
    var meses = Object.keys(groupBy(rows, function (x) { return x.mk; })).sort();
    if (!st.mes || meses.indexOf(st.mes) < 0) st.mes = meses[meses.length - 1];
    var doMes = rows.filter(function (x) { return x.mk === st.mes; });
    var i = meses.indexOf(st.mes);
    var total = sum(doMes, function (x) { return x.valor_total; });
    var notasMes = groupBy(doMes, function (x) { return x.nota; }), notas = Object.keys(notasMes).length;
    var desc = sum(doMes, function (x) { return x.desconto || 0; });
    if (st.pick && st.pick.mes !== st.mes) st.pick = null;
    /* comparação com o MESMO PERÍODO do mês anterior (hoje dia 8 → dia 1 a 8 do mês passado), em R$, % e quantidades */
    var Nn = NU(), P = Nn.mkcMesmoDia(st.mes, hojeLocal()), nomeAnt = MESES[+P.mesAnterior.slice(5) - 1];
    var rc = Nn.mkcResumo(Nn.mkcFiltrar(doMes, P.atual), []), rp = Nn.mkcResumo(Nn.mkcFiltrar(rows, P.anterior), []);
    var rotAnt = P.anteriorInteiro ? "o mês inteiro de " + nomeAnt : "1 a " + P.diaAnterior + " de " + nomeAnt;
    function difTxt(a, b, fmt, pct) { var d = Math.round((a - b) * 100) / 100; return (d > 0 ? "▲ +" : d < 0 ? "▼ −" : "= ") + fmt(Math.abs(d)) + (pct && b > 0 && d !== 0 ? " (" + PCT.format(Math.abs(d) / b) + ")" : ""); }

    var seg = h("div", { class: "seg mkmeses", role: "group", "aria-label": "Mês" });
    meses.slice(-12).forEach(function (k) {
      var b = h("button", { type: "button", "aria-pressed": k === st.mes ? "true" : "false", text: mesCurto(k) });
      b.onclick = function () { st.mes = k; st.kpiNota = null; drawApp("painel"); };
      seg.appendChild(b);
    });
    body.appendChild(seg);
    var exP = blocoExportar(function () { return Nn.mkxPainel(rows, st.mes, { hoje: hojeLocal() }); });
    body.appendChild(exP.el); exP.atualizar();

    /* compras do mês por mercado (quantas e quanto), usadas no número de compras e no quadro "Por mercado" */
    var porMercado = Object.entries(groupBy(Object.values(notasMes).map(function (l) { return l[0]; }), function (x) { return x.mercado; }))
      .map(function (e) { var its = doMes.filter(function (x) { return x.mercado === e[0]; }); return { m: e[0], n: e[1].length, t: sum(its, function (x) { return x.valor_total; }) }; })
      .sort(function (a, b) { return b.t - a.t; });

    var gNota = i === 0 && !rp.itens ? "primeiro mês registrado" : !rp.itens ? "sem compras em " + rotAnt : difTxt(rc.total, rp.total, money, true) + " vs " + rotAnt + " (" + money(rp.total) + ")";
    var gCls = i === 0 && !rp.itens || !rp.itens ? "" : rc.total > rp.total ? "up" : rc.total < rp.total ? "down" : "";
    function cmpLinha(a, b, un1, unN) { return (P.anteriorInteiro ? "Em " + nomeAnt + " (mês inteiro)" : "Até o dia " + P.diaAnterior + " de " + nomeAnt) + ": " + b + " " + (b === 1 ? un1 : unN) + " · " + difTxt(a, b, String, false); }
    /* os quadros do topo abrem o detalhe: os três do mês mostram as compras do mês; o total mostra mês a mês */
    /* abre e fecha no lugar, sem redesenhar a página: redesenhar mexia na rolagem e o 2º clique caía em outro quadro */
    var kdet = h("div"), kbtns = [];
    function mostrarKpi() {
      kbtns.forEach(function (x) { x[0].setAttribute("aria-pressed", String(st.kpi === x[1])); });
      kdet.innerHTML = "";
      if (st.kpi === "mes") kdet.appendChild(comprasDoMes(notasMes, total, function () { st.kpi = null; mostrarKpi(); }));
      if (st.kpi === "total") kdet.appendChild(totalPorMes(meses, function () { st.kpi = null; mostrarKpi(); }));
    }
    function abrir(qual) { return function () { st.kpi = st.kpi === qual ? null : qual; st.kpiNota = null; mostrarKpi(); }; }
    var kCompras = kpi("Compras no mês", String(notas), notas ? "média de " + money(total / notas) + " por compra" : "", "", abrir("mes"), st.kpi === "mes");
    kCompras.appendChild(h("span", { class: "kn", text: cmpLinha(rc.compras, rp.compras, "compra", "compras") }));
    kCompras.appendChild(h("div", { class: "kmerc" }, porMercado.map(function (x) { return h("span", { text: semCidade(x.m).split(" ")[0] + " " + x.n }); })));
    var kItens = kpi("Itens comprados", String(doMes.length), desc ? money(desc) + " em descontos" : "sem descontos registrados", "", abrir("mes"), st.kpi === "mes");
    kItens.appendChild(h("span", { class: "kn", text: cmpLinha(rc.itens, rp.itens, "item", "itens") }));
    body.appendChild(h("div", { class: "kpis" },
      kpi("Gasto em " + mesNome(st.mes), money(total), gNota, gCls, abrir("mes"), st.kpi === "mes"),
      kCompras,
      kItens,
      kpi("Total desde " + mesNome(meses[0]).split(" ")[0], money(sum(rows, function (x) { return x.valor_total; })), meses.length + (meses.length === 1 ? " mês" : " meses"), "", abrir("total"), st.kpi === "total")));
    body.querySelectorAll(".kbtn").forEach(function (b, n) { kbtns.push([b, n === 3 ? "total" : "mes"]); });
    body.appendChild(kdet); mostrarKpi();

    body.appendChild(ultimaCompra());

    /* linha 1: onde foram as compras + mês a mês */
    var g1 = h("div", { class: "mkgrid" });
    var pmk = panel("Por mercado", "Clique num mercado para ver as compras de " + MESES[+st.mes.slice(5) - 1]);
    pmk.appendChild(hbars(porMercado.map(function (x) { return [x.m, x.t, semCidade(x.m), x.n + (x.n === 1 ? " compra" : " compras")]; }), total, "mercado"));
    /* o detalhe abre logo abaixo do quadro clicado, na mesma coluna */
    g1.appendChild(h("div", { class: "mkcol" }, pmk, st.pick && st.pick.tipo === "mercado" ? detalhe(doMes) : null));
    var porMes = meses.map(function (k) { return [k, sum(rows.filter(function (x) { return x.mk === k; }), function (x) { return x.valor_total; })]; });
    var pm = panel("Mês a mês", "Clique numa coluna para ver o mês");
    pm.appendChild(vbars(porMes.slice(-12), st.mes));
    g1.appendChild(pm);
    body.appendChild(g1);

    /* linha 2: categorias + produtos que mais pesaram */
    var g2 = h("div", { class: "mkgrid" });
    var porCat = Object.entries(groupBy(doMes, function (x) { return x.categoria; })).map(function (e) { return [e[0], sum(e[1], function (x) { return x.valor_total; })]; }).sort(function (a, b) { return b[1] - a[1]; });
    var pc = panel("Por categoria", "Clique numa categoria para ver os itens");
    pc.appendChild(hbars(porCat, total, "categoria"));
    g2.appendChild(h("div", { class: "mkcol" }, pc, st.pick && st.pick.tipo === "categoria" ? detalhe(doMes) : null));
    var porProd = agruparProdutos(doMes).slice(0, 10);
    var pp = panel("O que mais pesou", "Os 10 produtos com maior gasto no mês. Clique para ver o histórico de preço.");
    pp.appendChild(listaProdutos(porProd));
    g2.appendChild(pp);
    body.appendChild(g2);
    /* voltando do gráfico de um produto: volta para o mesmo ponto do painel */
    if (st.voltarY != null) { var y = st.voltarY; st.voltarY = null; setTimeout(function () { window.scrollTo(0, y); }, 0); }
  }
  var hojeFixo = null;
  /* data de hoje no fuso do aparelho (o toISOString viraria o dia às 21h no Brasil) */
  function hojeLocal() { if (hojeFixo) return hojeFixo; var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function agruparProdutos(l) {
    return Object.entries(groupBy(l, function (x) { return NU().mkcChaveProd(x); })).map(function (e) {
      return { p: e[1][0].produto, k: e[0], t: sum(e[1], function (x) { return x.valor_total; }), q: sum(e[1], function (x) { return x.quantidade; }), n: e[1].length, u: e[1][0].unidade, c: e[1][0].categoria };
    }).sort(function (a, b) { return b.t - a.t; });
  }
  /* Lista de produtos (nome, quantidade e total) que quebra linha em vez de cortar; cada um abre o histórico de preço */
  function listaProdutos(l) {
    return h("div", { class: "plst" }, l.map(function (x) {
      var b = h("button", { type: "button", class: "plr", title: "Ver o histórico de preço de " + x.p },
        h("span", { class: "pln" }, h("b", { text: x.p }), h("span", { class: "sub", text: x.c })),
        h("span", { class: "plq", text: fmtQtd(x.q, x.u) }),
        h("span", { class: "plt", text: money(x.t) }));
      b.onclick = function () { st.prod = x.k; st.q = ""; st.voltar = true; st.voltarY = window.scrollY; location.hash = "#mercado/precos"; };
      return b;
    }));
  }
  /* Quadro com a compra mais recente: mercado, data, total e todos os itens do mais caro para o mais barato */
  function ultimaCompra() {
    var porNota = groupBy(rows, function (x) { return x.nota; });
    var ult = Object.values(porNota).sort(function (a, b) { return b[0].data.localeCompare(a[0].data) || (b[0].id < a[0].id ? -1 : 1); })[0];
    var p = h("div", { class: "panel" });
    if (!ult) return p;
    var f = ult[0], tot = sum(ult, function (x) { return x.valor_total; });
    p.appendChild(h("div", { class: "ulhead" },
      h("div", null, h("h2", { text: "Última compra" }), h("p", { class: "sub", text: semCidade(f.mercado) + " · " + dataBR(f.data) + " · " + ult.length + " itens" + (f.forma_pagamento ? " · " + f.forma_pagamento : "") })),
      h("b", { class: "ultot", text: money(tot) })));
    /* os itens começam recolhidos: compra grande ocupava a tela toda */
    var lista = listaProdutos(agruparProdutos(ult)), ver = h("button", { type: "button", class: "ghostbtn", "aria-expanded": "false" });
    function mostrar(abre) { lista.hidden = !abre; ver.setAttribute("aria-expanded", String(abre)); ver.textContent = abre ? "Recolher" : "Ver os " + ult.length + " itens"; }
    ver.onclick = function () { mostrar(lista.hidden); };
    mostrar(false);
    p.appendChild(h("div", { class: "vfil" }, ver));
    p.appendChild(lista);
    return p;
  }
  /* Detalhe aberto ao clicar numa barra de mercado ou de categoria */
  function detalhe(doMes) {
    var k = st.pick, mesTxt = MESES[+st.mes.slice(5) - 1];
    var fechar = h("button", { type: "button", class: "ghostbtn", text: "Fechar" });
    fechar.onclick = function () { st.pick = null; drawApp("painel"); };
    var p = h("div", { class: "panel mkdet" });
    if (k.tipo === "categoria") {
      var its = doMes.filter(function (x) { return x.categoria === k.valor; });
      p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: k.valor + " em " + mesTxt }), h("p", { class: "sub", text: its.length + " itens · " + money(sum(its, function (x) { return x.valor_total; })) })), fechar));
      p.appendChild(listaProdutos(agruparProdutos(its)));
      var an = h("button", { type: "button", class: "ghostbtn", text: "Analisar a categoria (produtos e preços)" });
      an.onclick = function () { st.c = { per: st.mes, categoria: k.valor, mercado: "", produto: "", ord: "gasto", prod: null, todos: false }; location.hash = "#mercado/consumo"; };
      p.appendChild(h("div", { class: "vfil" }, an));
    } else {
      var lm = doMes.filter(function (x) { return x.mercado === k.valor; });
      var compras = Object.values(groupBy(lm, function (x) { return x.nota; })).sort(function (a, b) { return b[0].data.localeCompare(a[0].data); });
      p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: semCidade(k.valor) + " em " + mesTxt }), h("p", { class: "sub", text: compras.length + (compras.length === 1 ? " compra" : " compras") + " · " + money(sum(lm, function (x) { return x.valor_total; })) })), fechar));
      compras.forEach(function (l) {
        var d = h("details", { class: "mknota" },
          h("summary", null, h("span", { class: "when", text: dataBR(l[0].data) }), h("span", { class: "mkn" }, h("span", { class: "sub", text: l.length + " itens" })), h("b", { class: "mkt", text: money(sum(l, function (x) { return x.valor_total; })) })),
          listaProdutos(agruparProdutos(l)));
        p.appendChild(d);
      });
    }
    return p;
  }
  function kpi(label, value, note, cls, onclick, ativo) {
    var k = h(onclick ? "button" : "div", { class: "panel kpi" + (onclick ? " kbtn" : ""), type: onclick ? "button" : null, "aria-pressed": onclick ? String(!!ativo) : null },
      h("span", { class: "kl", text: label }), h("b", { class: "kv", text: value }), note ? h("span", { class: "kn " + (cls || ""), text: note }) : null);
    if (onclick) k.onclick = onclick;
    return k;
  }
  /* Detalhe dos quadros do mês: cada compra num bloco (data, mercado, itens, desconto, total); clicar no bloco mostra os itens */
  function comprasDoMes(notasMes, total, aoFechar) {
    var mesTxt = MESES[+st.mes.slice(5) - 1];
    var compras = Object.values(notasMes).sort(function (a, b) { return b[0].data.localeCompare(a[0].data) || (b[0].id < a[0].id ? -1 : 1); });
    var fechar = h("button", { type: "button", class: "ghostbtn", text: "Fechar" });
    fechar.onclick = function () { st.kpiNota = null; aoFechar(); };
    var p = h("div", { class: "panel mkdet" });
    p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: "Compras de " + mesTxt }), h("p", { class: "sub", text: compras.length + (compras.length === 1 ? " compra" : " compras") + " · " + money(total) + " · clique numa compra para ver os itens" })), fechar));
    var grade = h("div", { class: "kblocos" }), itens = h("div"), blocos = [];
    /* mostra os itens da compra escolhida logo abaixo dos blocos, sem redesenhar */
    function mostrarItens() {
      blocos.forEach(function (x) { x[0].setAttribute("aria-pressed", String(x[1] === st.kpiNota)); });
      itens.innerHTML = "";
      var aberta = compras.filter(function (l) { return l[0].nota === st.kpiNota; })[0];
      if (!aberta) return;
      itens.appendChild(h("h3", { class: "dayh", text: semCidade(aberta[0].mercado) + " · " + dataBR(aberta[0].data) }));
      itens.appendChild(listaProdutos(agruparProdutos(aberta)));
      itens.appendChild(botaoApagar(aberta, function () { st.kpiNota = null; drawApp("painel"); }));
    }
    compras.forEach(function (l) {
      var f = l[0], tot = sum(l, function (x) { return x.valor_total; }), dsc = sum(l, function (x) { return x.desconto || 0; });
      var b = h("button", { type: "button", class: "kbloco", "aria-pressed": "false" },
        h("span", { class: "kbd", text: dataBR(f.data) }),
        h("b", { class: "kbm", text: semCidade(f.mercado) }),
        h("b", { class: "kbt", text: money(tot) }),
        h("span", { class: "sub", text: l.length + (l.length === 1 ? " item" : " itens") + (dsc ? " · " + money(dsc) + " de desconto" : "") + (f.forma_pagamento ? " · " + f.forma_pagamento : "") }));
      b.onclick = function () { st.kpiNota = st.kpiNota === f.nota ? null : f.nota; mostrarItens(); };
      blocos.push([b, f.nota]);
      grade.appendChild(b);
    });
    p.appendChild(grade); p.appendChild(itens); mostrarItens();
    return p;
  }
  /* Detalhe do total acumulado: um bloco por mês; clicar leva ao painel daquele mês já com as compras abertas */
  function totalPorMes(meses, aoFechar) {
    var fechar = h("button", { type: "button", class: "ghostbtn", text: "Fechar" });
    fechar.onclick = aoFechar;
    var p = h("div", { class: "panel mkdet" });
    p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: "Mês a mês desde " + mesNome(meses[0]) }), h("p", { class: "sub", text: "Clique num mês para ver as compras dele" })), fechar));
    var grade = h("div", { class: "kblocos" });
    meses.slice().reverse().forEach(function (k) {
      var l = rows.filter(function (x) { return x.mk === k; }), n = Object.keys(groupBy(l, function (x) { return x.nota; })).length, t = sum(l, function (x) { return x.valor_total; });
      var b = h("button", { type: "button", class: "kbloco", "aria-pressed": String(k === st.mes) },
        h("b", { class: "kbm", text: mesNome(k) }),
        h("b", { class: "kbt", text: money(t) }),
        h("span", { class: "sub", text: n + (n === 1 ? " compra" : " compras") + " · " + l.length + " itens · média de " + money(n ? t / n : 0) }));
      b.onclick = function () { st.mes = k; st.kpi = "mes"; st.kpiNota = null; drawApp("painel"); };
      grade.appendChild(b);
    });
    p.appendChild(grade);
    return p;
  }
  function fmtQtd(q, u) { return u === "kg" ? q.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " kg" : Math.round(q * 1000) / 1000 + (u === "l" ? " L" : " un"); }
  /* Barras horizontais de uma série só: rótulo, barra proporcional ao maior valor, valor e % do total.
     Cada barra é um botão: abre o detalhe daquele mercado/categoria no mês (clicar de novo fecha). */
  function hbars(list, total, tipo) {
    var max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    return h("div", { class: "hbars" }, list.map(function (x) {
      var on = st.pick && st.pick.tipo === tipo && st.pick.valor === x[0];
      var b = h("button", { type: "button", class: "hb" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", title: (x[2] || x[0]) + ": " + money(x[1]) + " (" + PCT.format(x[1] / (total || 1)) + ")" },
        h("span", { class: "hbl" }, x[2] || x[0], x[3] ? h("small", { text: x[3] }) : null),
        h("span", { class: "hbt" }, h("span", { class: "hbf", style: "width:" + (x[1] / max * 100).toFixed(1) + "%" })),
        h("span", { class: "hbv" }, money(x[1]), h("small", { text: " " + PCT.format(x[1] / (total || 1)) })));
      b.onclick = function () { st.pick = on ? null : { tipo: tipo, valor: x[0], mes: st.mes }; drawApp("painel"); };
      if (window.racDica) window.racDica.ligar(b, function () { return [x[2] || x[0], money(x[1]) + " · " + PCT.format(x[1] / (total || 1)) + " do mês" + (x[3] ? " · " + x[3] : "")]; });
      return b;
    }));
  }

  /* Colunas por mês; o mês escolhido fica destacado e cada coluna mostra o valor ao passar o mouse */
  function vbars(list, sel) {
    var max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    return h("div", { class: "vbars" }, list.map(function (x) {
      return h("button", { type: "button", class: "vb" + (x[0] === sel ? " on" : ""), title: mesNome(x[0]) + ": " + money(x[1]), "aria-label": mesNome(x[0]) + ": " + money(x[1]) },
        h("span", { class: "vbv", text: Math.round(x[1]).toLocaleString("pt-BR") }),
        h("span", { class: "vbt" }, h("span", { class: "vbf", style: "height:" + Math.max(2, x[1] / max * 100).toFixed(1) + "%" })),
        h("span", { class: "vbl", text: mesCurto(x[0]) }));
    }).map(function (b, i) { b.onclick = function () { st.mes = list[i][0]; drawApp("painel"); };
      if (window.racDica) window.racDica.ligar(b, function () { return [mesNome(list[i][0]), money(list[i][1]) + " no mercado"]; }); return b; }));
  }
  function tabela(cols, linhas, nf) {
    return h("div", { class: "tblwrap" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, cols.map(function (c, i) { return h("th", { class: i >= nf ? "num" : "", text: c }); }))),
      h("tbody", null, linhas.map(function (r) { return h("tr", null, r.map(function (c, i) { return h("td", { class: i >= nf ? "num" : "" }, c); })); }))));
  }

  /* ---------- Exportar CSV (docs/mercado-exportar.md) ----------
     O relatório é montado em NUCLEO.mkx* a partir das linhas já carregadas e dos filtros ativos da aba; aqui só ficam o botão e o download (nada vai para a rede). */
  var salvarArquivo = function (nome, texto) {
    var url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" })), a = h("a", { href: url, download: nome }), lugar = document.body || document.documentElement;
    lugar.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
  };
  /* gerar() devolve o resultado de um NUCLEO.mkx*. O texto ao lado do botão diz qual relatório sai (e quantos itens), ou que não há dados. */
  function blocoExportar(gerar) {
    var btn = h("button", { type: "button", class: "ghostbtn", text: "⬇ Exportar CSV" }), info = h("span", { class: "sub", role: "status" });
    var el = h("div", { class: "vfil mkexp" }, btn, info);
    function frase(r) { return r.ok ? "Vai exportar: " + r.descricao + "." : r.aviso; }
    btn.onclick = function () {
      var r = gerar();
      if (!r.ok) { info.textContent = r.aviso; return; }
      salvarArquivo(r.nome, r.csv);
      info.textContent = "Arquivo gerado: " + r.nome + " (" + r.linhas + (r.linhas === 1 ? " linha" : " linhas") + " de dados).";
    };
    return { el: el, atualizar: function () { info.textContent = frase(gerar()); } };
  }

  /* ---------- Preços: histórico por produto ---------- */
  /* rs: as compras consideradas (todas, ou só as de um mês) */
  /* uma linha por produto E unidade (NUCLEO.mkcPrecos, a mesma identidade da aba Consumo): Arroz kg e Arroz un nunca se misturam */
  function unRot(u) { return u === "kg" ? "kg" : u === "l" ? "L" : u === "un" ? "un" : u; }
  function produtos(rs) {
    return NU().mkcPrecos(rs || rows).map(function (p) {
      return { chave: p.chave, nome: p.nome, cat: p.categoria, u: p.unidade, compras: p.compras, ult: p.ult, pri: p.pri, varTotal: p.varTotal, varUlt: p.varUlt, min: p.min, max: p.max, mercados: p.mercados, gasto: p.gasto, qtd: p.qtd };
    });
  }
  /* Ordenação da lista: clicando no cabeçalho (como no Excel) ou pelos atalhos do seletor. d: 1 = menor para maior, -1 = maior para menor */
  var ATALHOS = [["alta", "Mais subiram", "var", -1], ["baixa", "Mais baixaram", "var", 1], ["gasto", "Mais gasto", "gasto", -1], ["compras", "Mais comprados", "compras", -1], ["nome", "Nome (A a Z)", "nome", 1]];
  var COLS = [["nome", "Produto"], ["un", "Unidade"], ["ult", "Último preço"], ["min", "Menor preço"], ["var", "Variação"], ["compras", "Compras"], ["gasto", "Total gasto"]];
  function valorCol(p, k) { return k === "un" ? p.u : k === "ult" ? p.ult.valor_unitario : k === "pri" ? p.pri.valor_unitario : k === "min" ? p.min : k === "var" ? (p.compras.length > 1 ? p.varTotal : null) : k === "compras" ? p.compras.length : k === "gasto" ? p.gasto : p.nome; }
  /* menor preço já pago; passando o mouse mostra quando e onde */
  function menorPreco(p) {
    var x = p.compras.filter(function (c) { return c.valor_unitario === p.min; }).sort(function (a, b) { return b.data.localeCompare(a.data); })[0];
    return h("span", { title: x ? dataBR(x.data) + " · " + x.mercado.replace(/\s*\(.*\)$/, "") : null, text: precoTxt(p.min, p.u) });
  }
  function viewPrecos(body) {
    /* "all" é sempre o histórico inteiro (gráfico); a lista usa o período escolhido */
    var all = produtos(), meses = Object.keys(groupBy(rows, function (x) { return x.mk; })).sort().reverse();
    if (st.pmes && meses.indexOf(st.pmes) < 0) st.pmes = "";
    var top = h("div", { class: "panel" },
      h("h2", { text: "Preços ao longo do tempo" }),
      h("p", { class: "sub", text: "Preço por unidade (ou por kg) em cada compra. Clique num produto para ver o gráfico e onde saiu mais barato." }));
    var tools = h("div", { class: "vfil" });
    var q = h("input", { type: "search", placeholder: "Buscar produto", "aria-label": "Buscar produto", value: st.q, autocomplete: "off" });
    var sort = h("select", { "aria-label": "Ordenar" },
      [["", "Pela coluna escolhida"]].concat(ATALHOS).map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    function marcarAtalho() { var a = ATALHOS.filter(function (o) { return o[2] === st.ord.k && o[3] === st.ord.d; })[0]; sort.value = a ? a[0] : ""; sort.options[0].hidden = !!a; }
    marcarAtalho();
    var per = h("select", { "aria-label": "Período" }, h("option", { value: "", text: "Desde o início" }),
      meses.map(function (k) { return h("option", { value: k, selected: st.pmes === k ? "" : null, text: mesNome(k).charAt(0).toUpperCase() + mesNome(k).slice(1) }); }));
    tools.appendChild(q); tools.appendChild(per); tools.appendChild(sort); top.appendChild(tools);
    var exPr = blocoExportar(function () { return NU().mkxPrecos(rows, { mes: st.pmes, q: st.q }, { hoje: hojeLocal() }); });
    top.appendChild(exPr.el);
    body.appendChild(top);
    var detail = h("div"); body.appendChild(detail);
    var list = h("div", { class: "panel" }); body.appendChild(list);
    function draw() {
      var nq = norm(st.q), base = st.pmes ? produtos(rows.filter(function (x) { return x.mk === st.pmes; })) : all;
      var l = base.filter(function (p) { return !nq || norm(p.nome + " " + p.cat).indexOf(nq) >= 0; });
      var k = st.ord.k, d = st.ord.d;
      /* quem não tem valor (variação de produto comprado uma vez só) fica sempre no fim */
      l.sort(function (a, b) {
        var x = valorCol(a, k), y = valorCol(b, k);
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * d || a.nome.localeCompare(b.nome) || a.u.localeCompare(b.u);
      });
      list.innerHTML = "";
      list.appendChild(h("p", { class: "sub", text: l.length + (l.length === 1 ? " produto" : " produtos") + (!l.length ? "" : " · " + money(sum(l, function (p) { return p.gasto; })) + " gastos" + (nq ? " nesses produtos" : "") + (st.pmes ? " em " + mesNome(st.pmes) : " desde " + dataBR(l.reduce(function (m, p) { return p.pri.data < m ? p.pri.data : m; }, "9999-12-31")))) }));
      var tb = tabela(COLS.map(function (c) { return c[0] === "gasto" && st.pmes ? "Gasto no mês" : c[1]; }), l.map(function (p) {
        var b = h("button", { type: "button", class: "mkprod", text: p.nome }); b.onclick = function () { st.prod = p.chave; st.voltar = false; st.voltarY = null; showProd(); window.scrollTo({ top: 0, behavior: "smooth" }); };
        return [h("span", null, b, h("span", { class: "sub", text: " · " + p.cat })), h("span", { text: unRot(p.u) }), precoTxt(p.ult.valor_unitario, p.u), menorPreco(p), varTag(p.compras.length > 1 ? p.varTotal : null), String(p.compras.length), h("b", { text: money(p.gasto) })];
      }), 2);
      /* cabeçalhos clicáveis: 1º clique do menor para o maior (nome de A a Z), o 2º inverte */
      tb.querySelectorAll("th").forEach(function (th, i) {
        var c = COLS[i][0], ativo = c === k;
        th.classList.add("ordcol"); if (ativo) th.classList.add("on");
        th.setAttribute("aria-sort", ativo ? (d === 1 ? "ascending" : "descending") : "none");
        th.tabIndex = 0; th.title = "Ordenar por " + th.textContent.toLowerCase() +
          (c === "var" ? ". Variação do 1º ao último preço " + (st.pmes ? "de " + mesNome(st.pmes) : "desde a primeira compra") : "");
        th.appendChild(h("span", { class: "ordseta", "aria-hidden": "true", text: ativo ? (d === 1 ? " ▲" : " ▼") : " ↕" }));
        function ordenar() { st.ord = { k: c, d: ativo ? -d : 1 }; marcarAtalho(); draw(); }
        th.onclick = ordenar; th.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenar(); } };
      });
      tb.classList.add("tblprec");
      list.appendChild(tb);
      exPr.atualizar();
    }
    function showProd() {
      detail.innerHTML = "";
      /* st.prod é nome+unidade; quem chega só com o nome (ex.: atalho antigo) vê a unidade com mais compras */
      var cand = all.filter(function (x) { return x.chave === st.prod; });
      if (!cand.length) cand = all.filter(function (x) { return x.nome === st.prod; }).sort(function (a, b) { return b.compras.length - a.compras.length; });
      var p = cand[0];
      if (!p) return;
      var d = panel(p.nome + " · " + unRot(p.u), p.cat + " · " + p.compras.length + (p.compras.length === 1 ? " compra" : " compras") + " · preço " + (p.u === "kg" ? "por kg" : p.u === "l" ? "por litro" : p.u === "un" ? "por unidade" : "por " + p.u) + " (outras unidades deste produto têm histórico próprio)");
      d.appendChild(h("div", { class: "kgasto" },
        h("div", null, h("span", { class: "kl", text: "Total gasto desde " + dataBR(p.pri.data) }), h("b", { class: "kv", text: money(p.gasto) })),
        h("div", null, h("span", { class: "kl", text: "Quantidade comprada" }), h("b", { class: "kv", text: fmtQtd(p.qtd, p.u) })),
        h("div", null, h("span", { class: "kl", text: "Média por compra" }), h("b", { class: "kv", text: money(p.gasto / p.compras.length) })),
        st.pmes ? h("div", null, h("span", { class: "kl", text: "Gasto em " + mesNome(st.pmes) }), h("b", { class: "kv", text: money(sum(p.compras.filter(function (x) { return x.mk === st.pmes; }), function (x) { return x.valor_total; })) })) : null));
      d.appendChild(lineChart(p));
      var porMerc = Object.entries(groupBy(p.compras, function (x) { return x.mercado; })).map(function (e) {
        var l = e[1].slice().sort(function (a, b) { return a.data.localeCompare(b.data); }), u = l[l.length - 1];
        return [e[0].replace(/\s*\(.*\)$/, ""), Math.min.apply(null, l.map(function (x) { return x.valor_unitario; })), u.valor_unitario, dataBR(u.data)];
      }).sort(function (a, b) { return a[2] - b[2]; });
      if (porMerc.length > 1) {
        d.appendChild(h("h3", { class: "dayh", text: "Onde saiu mais barato" }));
        d.appendChild(tabela(["Mercado", "Menor preço", "Último preço", "Última compra"], porMerc.map(function (m) { return [m[0], money(m[1]), money(m[2]), m[3]]; }), 1));
      }
      /* quem veio do painel volta para o painel ao fechar */
      var fechar = h("button", { type: "button", class: "ghostbtn", text: st.voltar ? "Fechar e voltar ao painel" : "Fechar gráfico" });
      fechar.onclick = function () {
        st.prod = null; detail.innerHTML = "";
        if (st.voltar) { st.voltar = false; location.hash = "#mercado/painel"; } else st.voltarY = null;
      };
      d.appendChild(h("div", { class: "vfoot" }, fechar));
      detail.appendChild(d);
    }
    /* pesquisar fecha o gráfico aberto (ex.: o que veio do painel) para a lista ficar logo abaixo da busca */
    q.addEventListener("input", function () {
      st.q = q.value;
      if (st.prod) { st.prod = null; st.voltar = false; st.voltarY = null; detail.innerHTML = ""; }
      draw();
    });
    sort.addEventListener("change", function () { var a = ATALHOS.filter(function (o) { return o[0] === sort.value; })[0]; if (a) { st.ord = { k: a[2], d: a[3] }; marcarAtalho(); draw(); } });
    per.addEventListener("change", function () { st.pmes = per.value; draw(); showProd(); });
    draw(); showProd();
  }
  function varTag(v) {
    if (v === null) return h("span", { class: "sub", text: "—" });
    var cls = v > 0.005 ? "up" : v < -0.005 ? "down" : "flat";
    return h("span", { class: "vt " + cls, text: (v > 0.005 ? "▲ " : v < -0.005 ? "▼ " : "= ") + PCT.format(Math.abs(v)) });
  }
  /* Linha do preço unitário no tempo: uma série, eixo de valores em R$, pontos com o valor e o mercado no hover */
  function lineChart(p) {
    return graficoLinha(p.compras.map(function (x) {
      return { data: x.data, v: x.valor_unitario, det: precoTxt(x.valor_unitario, p.u) + " · " + x.mercado.replace(/\s*\(.*\)$/, ""), aria: x.mercado };
    }), { fmt: money, aria: "Preço de " + p.nome + " ao longo do tempo" });
  }
  /* Gráfico de linha usado no site todo (preços do Mercado, peso do Eddie e da Olivia):
     pts = [{ data: "AAAA-MM-DD", v: número, det: texto do balão }], o.fmt formata os valores do eixo e do último ponto.
     Balão com o dia em negrito ao passar o mouse; tocar/clicar deixa o balão fixo. */
  function graficoLinha(lista, o) {
    var W = 640, H = 240, L = 58, R = 16, T = 16, B = 30;
    var pts = lista.map(function (x) { return { t: new Date(x.data + "T12:00:00").getTime(), v: x.v, x: x }; });
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t; if (t1 === t0) { t0 -= 86400000 * 3; t1 += 86400000 * 3; }
    var vmin = Math.min.apply(null, pts.map(function (q) { return q.v; })), vmax = Math.max.apply(null, pts.map(function (q) { return q.v; }));
    var pad = (vmax - vmin) * 0.15 || vmax * 0.1 || 1; vmin = Math.max(0, vmin - pad); vmax = vmax + pad;
    function X(t) { return L + (t - t0) / (t1 - t0) * (W - L - R); }
    function Y(v) { return T + (1 - (v - vmin) / (vmax - vmin)) * (H - T - B); }
    var NS = "http://www.w3.org/2000/svg";
    function s(tag, a, txt) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt) e.textContent = txt; return e; }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, class: "lchart", role: "img", "aria-label": o.aria || "" });
    for (var g = 0; g <= 3; g++) {
      var v = vmin + (vmax - vmin) * g / 3, y = Y(v);
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: "lgrid" }));
      svg.appendChild(s("text", { x: L - 8, y: y + 4, "text-anchor": "end", class: "lax" }, o.fmt(v)));
    }
    /* mais de um ano de dados: marca o início de cada ano no eixo; senão, a primeira e a última data */
    var a0 = new Date(t0).getFullYear(), a1 = new Date(t1).getFullYear();
    if (t1 - t0 > 400 * 86400000) {
      for (var a = a0 + 1; a <= a1; a++) {
        var xa = X(new Date(a + "-01-01T12:00:00").getTime());
        svg.appendChild(s("line", { x1: xa, x2: xa, y1: T, y2: H - B, class: "lgrid lano" }));
        svg.appendChild(s("text", { x: xa, y: H - 8, "text-anchor": "middle", class: "lax" }, String(a)));
      }
    } else {
      svg.appendChild(s("text", { x: L, y: H - 8, class: "lax" }, dataBR(lista[0].data)));
      svg.appendChild(s("text", { x: W - R, y: H - 8, "text-anchor": "end", class: "lax" }, dataBR(lista[lista.length - 1].data)));
    }
    if (pts.length > 1) svg.appendChild(s("polyline", { points: pts.map(function (q) { return X(q.t).toFixed(1) + "," + Y(q.v).toFixed(1); }).join(" "), class: "lline" }));
    /* balão com o dia e o detalhe: aparece ao passar o mouse e fica fixo ao tocar/clicar */
    var wrap = h("div", { class: "lwrap" }, svg), dica = h("div", { class: "ldica", hidden: true }), fixo = null;
    wrap.appendChild(dica);
    function mostrar(q, c) {
      dica.innerHTML = "";
      dica.appendChild(h("b", { text: dataBR(q.x.data) }));
      dica.appendChild(h("span", { text: q.x.det || o.fmt(q.v) }));
      dica.hidden = false;
      var rw = wrap.getBoundingClientRect(), rc = c.getBoundingClientRect();
      var x = rc.left + rc.width / 2 - rw.left + wrap.scrollLeft, y = rc.top - rw.top;
      dica.style.left = Math.max(4, Math.min(x - dica.offsetWidth / 2, wrap.scrollWidth - dica.offsetWidth - 4)) + "px";
      dica.style.top = (y - dica.offsetHeight - 10 < 0 ? y + rc.height + 10 : y - dica.offsetHeight - 10) + "px";
    }
    function esconder() { if (fixo) mostrar(fixo.q, fixo.c); else dica.hidden = true; }
    pts.forEach(function (q, i) {
      var c = s("circle", { cx: X(q.t), cy: Y(q.v), r: 5, class: "lpt" });
      /* área de toque maior que a bolinha, para o dedo acertar no celular */
      var alvo = s("circle", { cx: X(q.t), cy: Y(q.v), r: 16, class: "lhit", tabindex: 0, role: "button", "aria-label": dataBR(q.x.data) + ", " + (q.x.det || o.fmt(q.v)) });
      alvo.addEventListener("mouseenter", function () { c.classList.add("on"); mostrar(q, c); });
      alvo.addEventListener("mouseleave", function () { if (!fixo || fixo.c !== c) c.classList.remove("on"); esconder(); });
      alvo.addEventListener("click", function (e) {
        e.stopPropagation();
        if (fixo) fixo.c.classList.remove("on");
        if (fixo && fixo.c === c) { fixo = null; dica.hidden = true; return; }
        fixo = { q: q, c: c }; c.classList.add("on"); mostrar(q, c);
      });
      alvo.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alvo.dispatchEvent(new MouseEvent("click")); } });
      svg.appendChild(c);
      if (i === pts.length - 1) svg.appendChild(s("text", { x: Math.min(X(q.t), W - R - 4), y: Y(q.v) - 12, "text-anchor": "end", class: "llab" }, o.fmt(q.v)));
      svg.appendChild(alvo);
    });
    /* tocar fora das bolinhas solta o balão */
    svg.addEventListener("click", function () { if (fixo) { fixo.c.classList.remove("on"); fixo = null; dica.hidden = true; } });
    return wrap;
  }

  /* ---------- Consumo: categoria → produtos → histórico de preços (docs/mercado-consumo.md) ----------
     Os números vêm de NUCLEO.mkc* (puro, testado) sobre as linhas reais da view "compras". Um filtro só (período, categoria, mercado, produto) vale para a tela toda. */
  function precoTxt(v, u) { return money(v) + (u === "kg" ? "/kg" : u === "l" ? "/L" : ""); }
  function qtdUn(q) { return Object.keys(q).map(function (u) { return fmtQtd(q[u], u); }).join(" + "); }
  function viewConsumo(body) {
    var N = NU(), c = st.c = st.c || { per: "tudo", categoria: "", mercado: "", produto: "", ord: "gasto", prod: null, todos: false };
    var hoje = new Date().toISOString().slice(0, 10);
    var meses = Object.keys(groupBy(rows, function (x) { return x.mk; })).sort().reverse();
    var mercs = Object.keys(groupBy(rows, function (x) { return x.mercado; })).sort();
    var cats = N.MK_CATEGORIAS.slice(); rows.forEach(function (x) { var k = catOf(x.categoria); if (cats.indexOf(k) < 0) cats.push(k); });
    if (/^\d{4}-\d{2}$/.test(c.per) && meses.indexOf(c.per) < 0) c.per = "tudo";
    var top = panel("Consumo e histórico de preços", "Escolha o período, a categoria e o mercado. Tudo abaixo (totais, produtos e preços) usa os mesmos filtros, só com as compras que existem.");
    var seg = h("div", { class: "seg mkmeses", role: "group", "aria-label": "Período" }), segB = [];
    [["tudo", "Tudo"], ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"]].forEach(function (p) {
      var b = h("button", { type: "button", text: p[1] }); b.onclick = function () { c.per = p[0]; c.prod = null; mes.value = ""; draw(); }; segB.push([b, p[0]]); seg.appendChild(b);
    });
    var mes = h("select", { "aria-label": "Mês específico" }, h("option", { value: "", text: "Mês específico" }),
      meses.map(function (k) { return h("option", { value: k, selected: c.per === k ? "" : null, text: mesNome(k).charAt(0).toUpperCase() + mesNome(k).slice(1) }); }));
    mes.onchange = function () { c.per = mes.value || "tudo"; c.prod = null; draw(); };
    var selCat = h("select", { "aria-label": "Categoria" }, h("option", { value: "", text: "Todas as categorias" }),
      cats.map(function (k) { return h("option", { value: k, selected: c.categoria === k ? "" : null, text: k }); }));
    selCat.onchange = function () { c.categoria = selCat.value; c.prod = null; draw(); };
    var selMerc = h("select", { "aria-label": "Mercado" }, h("option", { value: "", text: "Todos os mercados" }),
      mercs.map(function (m) { return h("option", { value: m, selected: c.mercado === m ? "" : null, text: semCidade(m) }); }));
    selMerc.onchange = function () { c.mercado = selMerc.value; c.prod = null; draw(); };
    var busca = h("input", { type: "search", placeholder: "Buscar produto", "aria-label": "Buscar produto", value: c.produto, autocomplete: "off" });
    busca.addEventListener("input", function () { c.produto = busca.value; c.prod = null; draw(); });
    var limpar = h("button", { type: "button", class: "ghostbtn", text: "Limpar filtros" });
    limpar.onclick = function () { st.c = null; drawApp("consumo"); };
    top.appendChild(seg); top.appendChild(h("div", { class: "vfil" }, mes, selCat, selMerc, busca, limpar));
    /* exporta exatamente o que os filtros acima selecionam (mesmo período, categoria, mercado e busca) */
    var exC = blocoExportar(function () { var pr = N.mkcPeriodo(c.per, hoje); return N.mkxConsumo(rows, { de: pr.de, ate: pr.ate, categoria: c.categoria, mercado: c.mercado, produto: c.produto }, { hoje: hojeLocal(), ord: c.ord }); });
    top.appendChild(exC.el);
    body.appendChild(top);
    var out = h("div", { class: "stack" }); body.appendChild(out);

    function draw() {
      segB.forEach(function (x) { x[0].setAttribute("aria-pressed", String(c.per === x[1])); });
      selCat.value = c.categoria; selMerc.value = c.mercado; mes.value = /^\d{4}-\d{2}$/.test(c.per) ? c.per : "";
      var pr = N.mkcPeriodo(c.per, hoje), f = { de: pr.de, ate: pr.ate, categoria: c.categoria, mercado: c.mercado, produto: c.produto };
      var base = N.mkcFiltrar(rows, f, { categoria: 1 }), sel = N.mkcFiltrar(rows, f), R = N.mkcResumo(sel, base);
      out.innerHTML = ""; exC.atualizar();
      var rotPer = c.per === "tudo" ? "em todo o histórico" : /^\d/.test(c.per) && c.per.length === 7 ? "em " + mesNome(c.per) : "nos últimos " + parseInt(c.per, 10) + " meses";
      out.appendChild(h("div", { class: "kpis" },
        kpi((c.categoria || "Mercado") + " · gasto", money(R.total), rotPer),
        kpi("Participação", c.categoria ? PCT.format(R.pct) : "100%", c.categoria ? "do gasto do período (" + money(R.base) + ")" : "todas as categorias"),
        kpi("Produtos diferentes", String(R.produtos), R.itens + (R.itens === 1 ? " item" : " itens") + " comprados"),
        kpi("Compras", String(R.compras), R.compras ? "média de " + money(R.total / R.compras) + " por compra" : "")));
      if (!sel.length) {
        out.appendChild(h("div", { class: "panel" }, h("p", { class: "empty", text: c.categoria ? "Sem compras em " + c.categoria + " com esses filtros." : "Nenhuma compra com esses filtros." })));
      }
      /* categorias do período (sem o filtro de categoria, para dar para trocar) */
      var cs = N.mkcCategorias(base);
      if (cs.linhas.length) {
        var pc = panel("Por categoria", "Clique numa categoria para ver os produtos dela. Clique de novo para voltar a todas.");
        var max = Math.max.apply(null, cs.linhas.map(function (x) { return x.total; }).concat([1]));
        pc.appendChild(h("div", { class: "hbars" }, cs.linhas.map(function (x) {
          var on = c.categoria === x.categoria;
          var b = h("button", { type: "button", class: "hb" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", title: x.categoria + ": " + money(x.total) + " (" + PCT.format(x.pct) + ")" },
            h("span", { class: "hbl" }, x.categoria, h("small", { text: x.produtos + (x.produtos === 1 ? " produto" : " produtos") })),
            h("span", { class: "hbt" }, h("span", { class: "hbf", style: "width:" + (x.total / max * 100).toFixed(1) + "%" })),
            h("span", { class: "hbv" }, money(x.total), h("small", { text: " " + PCT.format(x.pct) })));
          b.onclick = function () { c.categoria = on ? "" : x.categoria; c.prod = null; c.todos = false; draw(); };
          if (window.racDica) window.racDica.ligar(b, function () { return [x.categoria, money(x.total) + " · " + PCT.format(x.pct) + " do período · " + x.produtos + (x.produtos === 1 ? " produto" : " produtos") + " · " + x.compras + (x.compras === 1 ? " compra" : " compras")]; });
          return b;
        })));
        out.appendChild(pc);
      }
      if (!sel.length) return;
      /* produtos da seleção */
      var ps = N.mkcProdutos(sel, c.ord), lim = c.todos ? ps.length : 40;
      var pp = panel(c.categoria || "Todos os produtos", ps.length + (ps.length === 1 ? " produto" : " produtos") + " · " + money(R.total) + " " + rotPer + ". Clique num produto para ver compras e preços.");
      var ord = h("select", { "aria-label": "Ordenar produtos" }, [["gasto", "Maior gasto"], ["frequencia", "Mais comprados"], ["nome", "Nome (A a Z)"]].map(function (o) { return h("option", { value: o[0], selected: c.ord === o[0] ? "" : null, text: o[1] }); }));
      ord.onchange = function () { c.ord = ord.value; draw(); };
      pp.appendChild(h("div", { class: "vfil" }, ord));
      pp.appendChild(h("div", { class: "plst" }, ps.slice(0, lim).map(function (x) {
        var b = h("button", { type: "button", class: "plr" + (c.prod === x.nome ? " on" : ""), title: "Ver compras e preços de " + x.nome },
          h("span", { class: "pln" }, h("b", { text: x.nome }), h("span", { class: "sub", text: (c.categoria ? "" : x.categoria + " · ") + x.compras + (x.compras === 1 ? " compra" : " compras") + (x.freqDias ? " · a cada ~" + x.freqDias + " dias" : "") })),
          h("span", { class: "plq", text: qtdUn(x.qtd) }), h("span", { class: "plt", text: money(x.total) }));
        b.onclick = function () { c.prod = c.prod === x.nome ? null : x.nome; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); };
        return b;
      })));
      if (ps.length > lim) { var mais = h("button", { type: "button", class: "ghostbtn", text: "Mostrar todos (" + ps.length + ")" }); mais.onclick = function () { c.todos = true; draw(); }; pp.appendChild(h("div", { class: "vfil" }, mais)); }
      /* o detalhe abre antes da lista: não precisa rolar */
      if (c.prod) { var det = detalheProduto(N, c, f); if (det) out.appendChild(det); }
      out.appendChild(pp);
      var pm = N.mkcPorMes(sel);
      if (pm.length > 1) {
        var tm = panel("Mês a mês neste filtro", "Só meses em que houve compra.");
        tm.appendChild(tabela(["Mês", "Gasto", "Compras", "Itens", "Quantidade"], pm.slice().reverse().slice(0, 24).map(function (m) { return [mesNome(m.mes), money(m.total), String(m.compras), String(m.itens), qtdUn(m.qtd)]; }), 1));
        out.appendChild(tm);
      }
    }
    draw();
  }
  /* Detalhe de um produto: um bloco por unidade de medida (nunca mistura kg com un), com último preço, variação, menor/maior, média ponderada,
     evolução, comparação entre mercados e o histórico de compras. Usa período e mercado do filtro. */
  function detalheProduto(N, c, f) {
    var rp = N.mkcFiltrar(rows, f, { categoria: 1, produto: 1 }).filter(function (x) { return x.produto === c.prod; });
    var d = N.mkcProduto(rp);
    var fechar = h("button", { type: "button", class: "ghostbtn", text: "Fechar" });
    fechar.onclick = function () { c.prod = null; drawApp("consumo"); };
    var p = h("div", { class: "panel mkdet" });
    if (!d) { p.appendChild(h("p", { class: "empty", text: "Sem compras de " + c.prod + " com esses filtros." })); p.appendChild(fechar); return p; }
    p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: d.nome }), h("p", { class: "sub", text: d.categoria + " · " + d.compras + (d.compras === 1 ? " compra" : " compras") + " · " + money(d.total) + " · " + d.mercados.map(semCidade).join(", ") })), fechar));
    if (d.unidades.length > 1) p.appendChild(h("p", { class: "qrwarn", text: "Este produto foi comprado em mais de uma unidade de medida. Os preços ficam separados por unidade, sem misturar." }));
    d.unidades.forEach(function (u) {
      var nomeU = u.unidade === "kg" ? "por kg" : u.unidade === "l" ? "por litro" : "por unidade";
      p.appendChild(h("h3", { class: "dayh", text: "Preço " + nomeU + " · " + u.compras + (u.compras === 1 ? " compra" : " compras") }));
      function kv(l, v, s) { return h("div", null, h("span", { class: "kl", text: l }), h("b", { class: "kv", text: v }), s ? h("span", { class: "sub", text: s }) : null); }
      function onde(x) { return x ? dataBR(x.data) + " · " + semCidade(x.mercado) : ""; }
      p.appendChild(h("div", { class: "kgasto" },
        kv("Último preço", precoTxt(u.ultimo.preco, u.unidade), onde(u.ultimo)),
        h("div", null, h("span", { class: "kl", text: "Contra a compra anterior" }), u.suficiente ? h("b", { class: "kv" }, varTag(u.variacaoUltimo)) : h("b", { class: "kv", text: "—" }),
          h("span", { class: "sub", text: u.suficiente ? "era " + precoTxt(u.anterior.preco, u.unidade) + " em " + dataBR(u.anterior.data) : "só 1 compra: sem comparação" })),
        kv("Menor preço", precoTxt(u.menor.preco, u.unidade), onde(u.menor)),
        kv("Maior preço", precoTxt(u.maior.preco, u.unidade), onde(u.maior)),
        kv("Preço médio", u.precoMedio === null ? "—" : precoTxt(u.precoMedio, u.unidade), "média ponderada pela quantidade"),
        kv("Quantidade comprada", fmtQtd(u.qtd, u.unidade)),
        kv("Total gasto", money(u.total), "já com os descontos")));
      if (u.suficiente) {
        p.appendChild(graficoLinha(u.serie.map(function (x) { return { data: x.data, v: x.v, det: precoTxt(x.v, u.unidade) + " · " + semCidade(x.mercado) }; }), { fmt: money, aria: "Preço de " + d.nome + " " + nomeU + " ao longo do tempo" }));
      } else p.appendChild(h("p", { class: "sub", text: "Há uma compra só nesta unidade: ainda não dá para mostrar a evolução do preço." }));
      if (u.mercados.length > 1) {
        p.appendChild(h("h3", { class: "dayh", text: "Comparação entre mercados (" + nomeU + ")" }));
        p.appendChild(tabela(["Mercado", "Compras", "Último preço", "Menor", "Médio", "Última compra"], u.mercados.map(function (m, i) {
          return [semCidade(m.mercado) + (i === 0 ? " · mais barato no último preço" : ""), String(m.compras), precoTxt(m.ultimo, u.unidade), precoTxt(m.menor, u.unidade), m.medio === null ? "—" : precoTxt(m.medio, u.unidade), dataBR(m.data)];
        }), 1));
      }
      var hist = h("details", { class: "mknota" }, h("summary", null, h("span", { class: "mkn" }, h("b", { text: "Histórico de compras" }), h("span", { class: "sub", text: " · " + u.historico.length })), h("span", { class: "mkt" })),
        tabela(["Data", "Mercado", "Qtd", "Unit.", "Total"], u.historico.slice().reverse().map(function (x) { return [dataBR(x.data), semCidade(x.mercado), fmtQtd(x.quantidade, x.unidade), precoTxt(x.unitario, x.unidade), money(x.total)]; }), 2));
      p.appendChild(hist);
    });
    return p;
  }

  /* ---------- Comparar períodos (docs/mercado-comparar.md) ----------
     A = período analisado, B = período de comparação (a base). Contas em NUCLEO.mkcComparar (puro); aqui só desenha. Só lê as linhas já carregadas. */
  var LEITURA = { ambos: "preço e quantidade", preco: "preço", quantidade: "quantidade", misto: "efeitos opostos", estavel: "estável", so_a: "só no período A", so_b: "só no período B" };
  function sinalMoney(v) { return (v > 0 ? "+" : "") + money(v); }
  function pctTxt(m) { return m.pct == null ? "—" : (m.pct > 0 ? "+" : "") + PCT.format(m.pct); }
  /* variação como o site já faz (▲/▼); sem base não inventa percentual */
  function varMetric(m) {
    if (m.pct != null) return varTag(m.pct);
    var t = m.estado === "novo" ? "novo (sem base)" : m.estado === "sumiu" ? "sem compras em A" : "—";
    return h("span", { class: "sub", text: t });
  }
  function estadoGasto(m) {
    return m.estado === "subiu" ? "▲ gastou mais" : m.estado === "caiu" ? "▼ gastou menos" : m.estado === "novo" ? "sem compras no período B: sem base para variação" :
      m.estado === "sumiu" ? "sem compras no período A" : m.estado === "zero" ? "sem compras nos dois períodos" : "= igual";
  }
  /* tabela ordenável pelo cabeçalho (como em Preços): cols = [{ t, v: item → número/texto/null, c: item → célula }]; ord = { k, d } (k < 0 mantém a ordem dada) */
  function tabelaOrd(cols, itens, ord, repintar, lim) {
    var l = itens.slice(), k = ord.k, d = ord.d;
    if (k >= 0) l.sort(function (a, b) {
      var x = cols[k].v(a), y = cols[k].v(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * d;
    });
    if (lim) l = l.slice(0, lim);
    var tb = tabela(cols.map(function (c) { return c.t; }), l.map(function (it) { return cols.map(function (c) { return c.c(it); }); }), 1);
    tb.querySelectorAll("th").forEach(function (th, i) {
      var ativo = i === k;
      th.classList.add("ordcol"); if (ativo) th.classList.add("on");
      th.setAttribute("aria-sort", ativo ? (d === 1 ? "ascending" : "descending") : "none");
      th.tabIndex = 0; th.title = "Ordenar por " + cols[i].t.toLowerCase();
      th.appendChild(h("span", { class: "ordseta", "aria-hidden": "true", text: ativo ? (d === 1 ? " ▲" : " ▼") : " ↕" }));
      function ordenar() { ord.k = i; ord.d = ativo ? -d : 1; repintar(); }
      th.onclick = ordenar; th.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenar(); } };
    });
    return tb;
  }
  function viewComparar(body) {
    var N = NU(), hoje = new Date().toISOString().slice(0, 10);
    function novo(id) { var a = N.mkcAtalho(id, hoje); return { atalho: id, a: a.a, b: a.b, categoria: "", mercado: "", produto: "", lista: "todos", prod: null, ordP: { k: -1, d: -1 }, ordM: { k: -1, d: -1 }, todos: false }; }
    var c = st.cmp = st.cmp || novo("mes");
    var mercs = Object.keys(groupBy(rows, function (x) { return x.mercado; })).sort();
    var cats = N.MK_CATEGORIAS.slice(); rows.forEach(function (x) { var k = catOf(x.categoria); if (cats.indexOf(k) < 0) cats.push(k); });
    var top = panel("Comparar períodos", "A é o período analisado e B é o de comparação (a base). Diferença = A − B; variação = (A − B) ÷ B. Os mesmos filtros valem para os dois.");
    var selA = h("select", { "aria-label": "Atalho de períodos" }, [["mes", "Este mês × mês anterior"], ["30d", "Últimos 30 dias × 30 dias anteriores"], ["3m", "Últimos 3 meses × 3 meses anteriores"], ["6m", "Últimos 6 meses × 6 meses anteriores"], ["custom", "Escolha personalizada"]]
      .map(function (o) { return h("option", { value: o[0], selected: c.atalho === o[0] ? "" : null, text: o[1] }); }));
    function data(rot, p, k) {
      var i = h("input", { type: "date", value: p[k], "aria-label": rot });
      i.addEventListener("change", function () { p[k] = i.value; c.atalho = "custom"; c.prod = null; draw(); });
      return i;
    }
    var da = [data("Período A: data inicial", c.a, "de"), data("Período A: data final", c.a, "ate")], db = [data("Período B: data inicial", c.b, "de"), data("Período B: data final", c.b, "ate")];
    selA.onchange = function () {
      if (selA.value === "custom") { c.atalho = "custom"; draw(); return; }
      var a = N.mkcAtalho(selA.value, hoje); c.atalho = selA.value; c.a = a.a; c.b = a.b; c.prod = null; draw();
    };
    var selCat = h("select", { "aria-label": "Categoria" }, h("option", { value: "", text: "Todas as categorias" }), cats.map(function (k) { return h("option", { value: k, selected: c.categoria === k ? "" : null, text: k }); }));
    selCat.onchange = function () { c.categoria = selCat.value; c.prod = null; draw(); };
    var selMerc = h("select", { "aria-label": "Mercado" }, h("option", { value: "", text: "Todos os mercados" }), mercs.map(function (m) { return h("option", { value: m, selected: c.mercado === m ? "" : null, text: semCidade(m) }); }));
    selMerc.onchange = function () { c.mercado = selMerc.value; c.prod = null; draw(); };
    var busca = h("input", { type: "search", placeholder: "Buscar produto", "aria-label": "Buscar produto", value: c.produto, autocomplete: "off" });
    busca.addEventListener("input", function () { c.produto = busca.value; c.prod = null; draw(); });
    var limpar = h("button", { type: "button", class: "ghostbtn", text: "Limpar filtros" });
    limpar.onclick = function () { st.cmp = null; drawApp("comparar"); };
    top.appendChild(h("div", { class: "vfil" }, selA));
    top.appendChild(h("div", { class: "vfil" }, h("span", { class: "sub", text: "Período A" }), da[0], h("span", { class: "sub", text: "até" }), da[1]));
    top.appendChild(h("div", { class: "vfil" }, h("span", { class: "sub", text: "Período B" }), db[0], h("span", { class: "sub", text: "até" }), db[1]));
    top.appendChild(h("div", { class: "vfil" }, selCat, selMerc, busca, limpar));
    /* exporta os períodos A e B, os filtros e a lista de produtos escolhida abaixo */
    var exCm = blocoExportar(function () { return N.mkxComparar(rows, c.a, c.b, { categoria: c.categoria, mercado: c.mercado, produto: c.produto }, { hoje: hojeLocal(), lista: c.lista }); });
    top.appendChild(exCm.el);
    body.appendChild(top);
    var out = h("div", { class: "stack" }); body.appendChild(out);

    function draw() {
      selA.value = c.atalho; selCat.value = c.categoria; selMerc.value = c.mercado;
      da[0].value = c.a.de; da[1].value = c.a.ate; db[0].value = c.b.de; db[1].value = c.b.ate;
      out.innerHTML = ""; exCm.atualizar();
      var f = { categoria: c.categoria, mercado: c.mercado, produto: c.produto };
      var r = N.mkcComparar(rows, c.a, c.b, f);
      if (!r.ok) { out.appendChild(h("div", { class: "panel" }, h("p", { class: "qrwarn", text: r.erro }))); return; }
      var G = r.geral, rotA = dataBR(r.a.de) + " a " + dataBR(r.a.ate) + " · " + r.a.dias + (r.a.dias === 1 ? " dia" : " dias"), rotB = dataBR(r.b.de) + " a " + dataBR(r.b.ate) + " · " + r.b.dias + (r.b.dias === 1 ? " dia" : " dias");
      var avisos = h("div");
      if (r.sobrepoe) avisos.appendChild(h("p", { class: "qrwarn", text: "Os períodos A e B se sobrepõem: as compras das datas em comum entram nos dois." }));
      if (r.a.dias !== r.b.dias) avisos.appendChild(h("p", { class: "sub", text: "Os períodos têm durações diferentes (A: " + r.a.dias + " dias, B: " + r.b.dias + " dias). Olhe também o gasto por dia." }));
      if (c.categoria || c.mercado || c.produto) avisos.appendChild(h("p", { class: "sub", text: "Filtros nos dois períodos:" + (c.categoria ? " categoria " + c.categoria + ";" : "") + (c.mercado ? " mercado " + semCidade(c.mercado) + ";" : "") + (c.produto ? " produto “" + c.produto + "”;" : "") }));
      out.appendChild(avisos);
      out.appendChild(h("div", { class: "kpis" },
        kpi("Gasto no período A", money(G.total.a), rotA),
        kpi("Gasto no período B", money(G.total.b), rotB),
        kpi("Diferença (A − B)", G.total.dif == null ? "—" : sinalMoney(G.total.dif), estadoGasto(G.total), G.total.estado === "subiu" ? "up" : G.total.estado === "caiu" ? "down" : ""),
        kpi("Variação", pctTxt(G.total), G.total.pct == null ? "sem base para percentual" : "sobre o gasto do período B", G.total.estado === "subiu" ? "up" : G.total.estado === "caiu" ? "down" : "")));
      /* quadro geral */
      var linhasG = [["Total gasto", G.total, money], ["Gasto por dia", G.porDia, money], ["Compras", G.compras, String], ["Itens comprados", G.itens, String], ["Produtos diferentes", G.produtos, String], ["Gasto médio por compra", G.ticket, money]]
        .concat(G.qtd.map(function (q) { return ["Quantidade (" + unRot(q.unidade) + ")", q.m, function (v) { return fmtQtd(v, q.unidade); }]; }));
      var pg = panel("Comparação geral", "Quantidades ficam separadas por unidade (kg, L, un): nunca somadas entre si.");
      pg.appendChild(tabela(["Indicador", "Período A", "Período B", "Diferença", "Variação"], linhasG.map(function (x) {
        var m = x[1], fm = x[2];
        return [x[0], m.a == null ? "—" : fm(m.a), m.b == null ? "—" : fm(m.b), m.dif == null ? "—" : (m.dif > 0 ? "+" : "") + (fm === money ? money(m.dif) : fm(m.dif)), varMetric(m)];
      }), 1));
      out.appendChild(pg);
      /* categorias: barras lado a lado (A em destaque, B em cinza), clicáveis */
      var comCompra = r.categorias.filter(function (x) { return x.m.a > 0 || x.m.b > 0; }), sem = r.categorias.filter(function (x) { return !x.m.a && !x.m.b; });
      var pc = panel("Por categoria", "Barra de cima: período A. Barra de baixo (cinza): período B. Clique numa categoria para ver só ela, com os produtos; clique de novo para voltar.");
      if (comCompra.length) {
        var max = Math.max.apply(null, comCompra.map(function (x) { return Math.max(x.m.a, x.m.b); }).concat([1]));
        pc.appendChild(h("div", { class: "hbars" }, comCompra.map(function (x) {
          var on = c.categoria === x.categoria;
          var b = h("button", { type: "button", class: "hb cmp" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", title: x.categoria + ": A " + money(x.m.a) + " · B " + money(x.m.b) },
            h("span", { class: "hbl" }, x.categoria, h("small", { text: "A " + PCT.format(x.partA) + " · B " + PCT.format(x.partB) + " do gasto" })),
            h("span", { class: "cmpt" }, h("span", { class: "hbt" }, h("span", { class: "hbf", style: "width:" + (x.m.a / max * 100).toFixed(1) + "%" })), h("span", { class: "hbt" }, h("span", { class: "hbf b", style: "width:" + (x.m.b / max * 100).toFixed(1) + "%" }))),
            h("span", { class: "hbv" }, "A " + money(x.m.a), h("small", { text: " · B " + money(x.m.b) }), h("small", { class: "vt " + (x.m.dif > 0 ? "up" : x.m.dif < 0 ? "down" : "flat"), text: " · " + (x.m.pct == null ? estadoGasto(x.m).split(":")[0] : (x.m.pct > 0 ? "▲ " : x.m.pct < 0 ? "▼ " : "= ") + PCT.format(Math.abs(x.m.pct))) })));
          b.onclick = function () { c.categoria = on ? "" : x.categoria; c.prod = null; c.todos = false; draw(); };
          if (window.racDica) window.racDica.ligar(b, function () { return [x.categoria, "A " + money(x.m.a) + " (" + PCT.format(x.partA) + ") · B " + money(x.m.b) + " (" + PCT.format(x.partB) + ") · diferença " + sinalMoney(x.m.dif || 0) + " · " + pctTxt(x.m)]; });
          return b;
        })));
      } else pc.appendChild(h("p", { class: "empty", text: "Nenhuma compra nos dois períodos com esses filtros." }));
      if (sem.length) pc.appendChild(h("p", { class: "sub", text: "Sem compras nos dois períodos: " + sem.map(function (x) { return x.categoria; }).join(", ") + "." }));
      out.appendChild(pc);

      /* detalhe de um produto (nome + unidade) */
      if (c.prod) { var det = detalheComparar(N, c, r, f); if (det) out.appendChild(det); }

      /* produtos */
      var rk = N.mkcCompRank(r.produtos, 1000);
      var LISTAS = [["todos", "Todos (maior diferença de gasto primeiro)", r.produtos], ["aumento", "Maior aumento de gasto", rk.maiorAumentoGasto], ["reducao", "Maior redução de gasto", rk.maiorReducaoGasto],
        ["qtdmais", "Aumento de quantidade", rk.aumentoQtd], ["qtdmenos", "Redução de quantidade", rk.reducaoQtd], ["precomais", "Preço unitário subiu", rk.precoSubiu], ["precomenos", "Preço unitário caiu", rk.precoCaiu],
        ["soa", "Só no período A", rk.soA], ["sob", "Só no período B", rk.soB]];
      var lista = LISTAS.filter(function (x) { return x[0] === c.lista; })[0] || LISTAS[0];
      var pp = panel("Produtos", "Cada linha é um produto numa unidade. Gasto, quantidade e preço unitário são lidos separadamente: gastar mais pode ser só comprar mais.");
      var selL = h("select", { "aria-label": "Lista de produtos" }, LISTAS.map(function (x) { return h("option", { value: x[0], selected: x[0] === lista[0] ? "" : null, text: x[1] + " (" + x[2].length + ")" }); }));
      selL.onchange = function () { c.lista = selL.value; c.ordP = { k: -1, d: -1 }; c.todos = false; draw(); };
      pp.appendChild(h("div", { class: "vfil" }, selL));
      var holder = h("div"); pp.appendChild(holder);
      var COLS = [
        { t: "Produto", v: function (x) { return x.nome; }, c: function (x) { var b = h("button", { type: "button", class: "mkprod", text: x.nome }); b.onclick = function () { c.prod = c.prod === x.chave ? null : x.chave; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); }; return h("span", null, b, h("span", { class: "sub", text: " · " + unRot(x.unidade) + " · " + x.categoria })); } },
        { t: "Gasto A", v: function (x) { return x.gasto.a; }, c: function (x) { return x.a ? money(x.a.total) : "—"; } },
        { t: "Gasto B", v: function (x) { return x.gasto.b; }, c: function (x) { return x.b ? money(x.b.total) : "—"; } },
        { t: "Dif. gasto", v: function (x) { return x.gasto.dif; }, c: function (x) { return h("span", { class: "vt " + (x.gasto.dif > 0 ? "up" : x.gasto.dif < 0 ? "down" : "flat"), text: sinalMoney(x.gasto.dif) + (x.gasto.pct != null ? " (" + pctTxt(x.gasto) + ")" : "") }); } },
        { t: "Qtd A", v: function (x) { return x.a ? x.a.qtd : null; }, c: function (x) { return x.a ? fmtQtd(x.a.qtd, x.unidade) : "—"; } },
        { t: "Qtd B", v: function (x) { return x.b ? x.b.qtd : null; }, c: function (x) { return x.b ? fmtQtd(x.b.qtd, x.unidade) : "—"; } },
        { t: "Var. qtd", v: function (x) { return x.estado === "ambos" ? x.qtd.pct : null; }, c: function (x) { return x.estado === "ambos" ? varMetric(x.qtd) : h("span", { class: "sub", text: "—" }); } },
        { t: "Preço A", v: function (x) { return x.a && x.a.preco != null ? x.a.preco : null; }, c: function (x) { return x.a && x.a.preco != null ? precoTxt(x.a.preco, x.unidade) : "—"; } },
        { t: "Preço B", v: function (x) { return x.b && x.b.preco != null ? x.b.preco : null; }, c: function (x) { return x.b && x.b.preco != null ? precoTxt(x.b.preco, x.unidade) : "—"; } },
        { t: "Var. preço", v: function (x) { return x.preco ? x.preco.pct : null; }, c: function (x) { return x.preco ? varMetric(x.preco) : h("span", { class: "sub", title: "preço só é comparado com compra nos dois períodos", text: "—" }); } },
        { t: "Explicação", v: function (x) { return LEITURA[x.leitura]; }, c: function (x) { return LEITURA[x.leitura]; } }];
      function pintarP() {
        holder.innerHTML = "";
        var itens = lista[2];
        if (!itens.length) { holder.appendChild(h("p", { class: "empty", text: "Nenhum produto nesta lista com esses filtros." })); return; }
        var lim = c.todos ? itens.length : 40;
        holder.appendChild(tabelaOrd(COLS, itens, c.ordP, pintarP, lim));
        if (itens.length > lim) { var mais = h("button", { type: "button", class: "ghostbtn", text: "Mostrar todos (" + itens.length + ")" }); mais.onclick = function () { c.todos = true; pintarP(); }; holder.appendChild(h("div", { class: "vfil" }, mais)); }
      }
      pintarP();
      out.appendChild(pp);

      /* estabelecimentos */
      var pe = panel("Estabelecimentos", "Gasto e participação de cada mercado. Gasto maior não quer dizer preço maior (produtos e quantidades mudam); para comparar preço use o produto, na lista acima.");
      var holderM = h("div"); pe.appendChild(holderM);
      var COLM = [
        { t: "Mercado", v: function (x) { return semCidade(x.mercado); }, c: function (x) { var b = h("button", { type: "button", class: "mkprod", title: "Filtrar a página por este mercado", text: semCidade(x.mercado) }); b.onclick = function () { c.mercado = c.mercado === x.mercado ? "" : x.mercado; c.prod = null; draw(); }; return b; } },
        { t: "Gasto A", v: function (x) { return x.m.a; }, c: function (x) { return money(x.m.a); } },
        { t: "Gasto B", v: function (x) { return x.m.b; }, c: function (x) { return money(x.m.b); } },
        { t: "Diferença", v: function (x) { return x.m.dif; }, c: function (x) { return h("span", { class: "vt " + (x.m.dif > 0 ? "up" : x.m.dif < 0 ? "down" : "flat"), text: sinalMoney(x.m.dif) }); } },
        { t: "Variação", v: function (x) { return x.m.pct; }, c: function (x) { return varMetric(x.m); } },
        { t: "Part. A", v: function (x) { return x.partA; }, c: function (x) { return PCT.format(x.partA); } },
        { t: "Part. B", v: function (x) { return x.partB; }, c: function (x) { return PCT.format(x.partB); } },
        { t: "Mudança de part.", v: function (x) { return x.dPart; }, c: function (x) { return (x.dPart > 0 ? "+" : "") + (x.dPart * 100).toFixed(1).replace(".", ",") + " p.p."; } },
        { t: "Compras A/B", v: function (x) { return x.comprasA; }, c: function (x) { return x.comprasA + " / " + x.comprasB; } },
        { t: "Produtos A/B", v: function (x) { return x.produtosA; }, c: function (x) { return x.produtosA + " / " + x.produtosB; } }];
      function pintarM() { holderM.innerHTML = ""; holderM.appendChild(tabelaOrd(COLM, r.mercados, c.ordM, pintarM)); }
      if (r.mercados.length) { pintarM(); out.appendChild(pe); }
    }
    draw();
  }
  /* Detalhe de um produto (nome + unidade) nos dois períodos, lado a lado. Reaproveita NUCLEO.mkcProduto em cada período. */
  function detalheComparar(N, c, r, f) {
    var item = r.produtos.filter(function (x) { return x.chave === c.prod; })[0];
    var fechar = h("button", { type: "button", class: "ghostbtn", text: "Fechar" });
    fechar.onclick = function () { c.prod = null; drawApp("comparar"); };
    var p = h("div", { class: "panel mkdet" });
    if (!item) { p.appendChild(h("p", { class: "empty", text: "Este produto não aparece com os filtros atuais." })); p.appendChild(fechar); return p; }
    function bloco(per) {
      var l = N.mkcFiltrar(rows, { de: per.de, ate: per.ate, mercado: f.mercado }, { categoria: 1, produto: 1 }).filter(function (x) { return N.mkcChaveProd(x) === item.chave; });
      var d = N.mkcProduto(l);
      return d ? d.unidades.filter(function (u) { return u.unidade === item.unidade; })[0] || null : null;
    }
    var A = bloco(c.a), B = bloco(c.b), un = item.unidade;
    p.appendChild(h("div", { class: "ulhead" }, h("div", null, h("h2", { text: item.nome + " · " + unRot(un) }), h("p", { class: "sub", text: item.categoria + " · explicação do gasto: " + LEITURA[item.leitura] })), fechar));
    function ponto(u, k) { return u && u[k] ? precoTxt(u[k].preco, un) + " · " + dataBR(u[k].data) + " · " + semCidade(u[k].mercado) : "—"; }
    var linhas = [
      ["Gasto total", A ? money(A.total) : "—", B ? money(B.total) : "—", sinalMoney(item.gasto.dif) + (item.gasto.pct != null ? " (" + pctTxt(item.gasto) + ")" : "")],
      ["Quantidade", A ? fmtQtd(A.qtd, un) : "—", B ? fmtQtd(B.qtd, un) : "—", item.estado === "ambos" ? pctTxt(item.qtd) : "—"],
      ["Compras", A ? String(A.compras) : "—", B ? String(B.compras) : "—", ""],
      ["Preço médio (ponderado)", A && A.precoMedio != null ? precoTxt(A.precoMedio, un) : "—", B && B.precoMedio != null ? precoTxt(B.precoMedio, un) : "—", item.preco ? pctTxt(item.preco) : "sem preço comparável"],
      ["Menor preço", ponto(A, "menor"), ponto(B, "menor"), ""], ["Maior preço", ponto(A, "maior"), ponto(B, "maior"), ""], ["Último preço no período", ponto(A, "ultimo"), ponto(B, "ultimo"), ""]];
    p.appendChild(tabela(["", "Período A", "Período B", "Variação"], linhas, 1));
    if (!item.preco) p.appendChild(h("p", { class: "sub", text: "O preço só é comparado quando o produto foi comprado nos dois períodos, na mesma unidade (" + unRot(un) + ")." }));
    function onde(u) { return u ? u.mercados.map(function (x) { return semCidade(x.mercado) + " (" + x.compras + (x.compras === 1 ? " compra" : " compras") + (x.medio != null ? ", médio " + precoTxt(x.medio, un) : "") + ")"; }).join("; ") : "sem compras"; }
    p.appendChild(h("p", { class: "sub", text: "Onde comprou em A: " + onde(A) }));
    p.appendChild(h("p", { class: "sub", text: "Onde comprou em B: " + onde(B) }));
    return p;
  }

  /* ---------- Alertas de preço (docs/mercado-alertas.md) ----------
     Regras fixas em NUCLEO.mkal* (sem IA). Configurações, limites e o que já foi lido ficam em PESSOAL["mercado-alertas"] (tabela pessoal: só o dono, com a trava MFA e no backup).
     Só o dono vê esta aba. Não há envio por Web Push neste lote (docs/mercado-alertas.md). */
  function ehDono() { return typeof isOwner === "function" && isOwner(); }
  function alLer() {
    var raw = (typeof PESSOAL !== "undefined" && PESSOAL && PESSOAL["mercado-alertas"]) || {};
    return { cfg: NU().mkalConfig(raw.cfg), estado: { lidos: Array.isArray(raw.estado && raw.estado.lidos) ? raw.estado.lidos : [] } };
  }
  function alGravar(cfg, estado, pronto) {
    if (typeof pessoalGravar !== "function") { if (pronto) pronto("Não consegui guardar agora."); return; }
    pessoalGravar("mercado-alertas", { v: 1, cfg: cfg, estado: estado }, pronto);
  }
  /* grava e redesenha na hora (PESSOAL já mudou); se a conta recusar depois, a mensagem aparece na próxima tela */
  function alPersistir(cfg, estado, ok) {
    st.alMsg = ok || "";
    alGravar(cfg, estado, function (erro) { if (erro) { st.alMsg = erro; drawApp("alertas"); } });
    drawApp("alertas");
  }
  function alContar() {
    if (!ehDono() || !rows) return 0;
    var L = alLer(), N = NU(), hoje = new Date().toISOString().slice(0, 10);
    return N.mkalClassificar(N.mkalGerar(rows, L.cfg), L.estado, hoje, L.cfg).resumo.novos;
  }
  /* Aba Alertas como painel: visão geral compacta (indicadores clicáveis por tipo) → lista do tipo → detalhe do alerta → ajustes.
     Só muda a apresentação: as regras (mkalGerar), a leitura (mkalClassificar/mkalMarcarLido) e a gravação (alPersistir → pessoal) são as mesmas.
     A vista atual fica em st.al.vista e sobrevive a marcar como lido (o app redesenha a tela). */
  function viewAlertas(body) {
    var N = NU(), hoje = new Date().toISOString().slice(0, 10), iconeDe = {}, rotuloDe = {};
    N.MKAL_TIPOS.forEach(function (t) { rotuloDe[t[0]] = t[1]; iconeDe[t[0]] = t[2]; });
    if (!ehDono()) { body.appendChild(h("div", { class: "panel" }, h("p", { class: "empty", text: "Os alertas de preço são só do dono." }))); return; }
    var L = alLer(), cfg = L.cfg, estado = L.estado;
    var cl = N.mkalClassificar(N.mkalGerar(rows, cfg), estado, hoje, cfg), R = cl.resumo;
    /* só os tipos ligados entram nas listas e nas contagens (como antes) */
    var todos = cl.alertas.filter(function (a) { return cfg.tipos[a.tipo].on; });
    var c = st.al = st.al || {}; c.vista = c.vista || "painel"; c.tipo = c.tipo || ""; c.anteriores = !!c.anteriores;
    if (c.vista === "produto" && !todos.some(function (a) { return a.id === c.sel; })) c.vista = c.volta === "lista" ? "lista" : "painel";
    var out = h("div", { class: "stack" }); body.appendChild(out);
    function ir(vista, extra) { c.vista = vista; Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; }); pintar(); window.scrollTo(0, 0); }
    function unTxt(a) { return a.unidade === "kg" ? "/kg" : a.unidade === "l" ? "/L" : a.unidade === "un" ? "/un" : "/" + a.unidade; }
    function salvarLidos(ids) { alPersistir(cfg, N.mkalMarcarLido(estado, ids), ""); }
    function tipoRot() { return c.tipo ? iconeDe[c.tipo] + " " + rotuloDe[c.tipo] : "Todos os alertas"; }
    function voltar(rot, fn) { var b = h("button", { type: "button", class: "ghostbtn", text: rot }); b.onclick = fn; return b; }
    /* uma linha compacta do alerta: ponto de novo/lido, produto e unidade, onde e quando, preços e variação */
    function linha(a, comTipo) {
      var su = unTxt(a), precos = a.tipo === "limite" ? "limite " + money(a.anterior) + su + " · pago " + money(a.atual) + su
        : a.tipo === "melhor" ? semCidade(a.mercado) + " " + money(a.atual) + su + " × " + semCidade(a.refMercado) + " " + money(a.anterior) + su : money(a.anterior) + su + " → " + money(a.atual) + su;
      var b = h("button", { type: "button", class: "alrow t-" + a.tipo + (a.novo ? " novo" : " lido"), title: rotuloDe[a.tipo] + ": " + a.nome, "aria-label": (a.novo ? "Novo: " : a.lido ? "Lido: " : "Anterior: ") + rotuloDe[a.tipo] + ", " + a.nome },
        h("span", { class: "aldot", "aria-hidden": "true" }),
        h("span", { class: "alt" }, h("b", { text: a.nome + " · " + (a.unidade === "l" ? "L" : a.unidade) }),
          h("span", { class: "sub", text: (c.tipo && c.vista === "lista" && !comTipo ? "" : iconeDe[a.tipo] + " " + rotuloDe[a.tipo] + " · ") + semCidade(a.mercado) + " · " + dataBR(a.data) + (a.novo ? " · novo" : a.lido ? " · lido" : "") })),
        h("span", { class: "alp" }, a.pct != null ? varTag(a.pct) : null, h("span", { class: "sub", text: precos })));
      b.onclick = function () { ir("produto", { sel: a.id, volta: c.vista === "painel" ? "painel" : "lista" }); };
      return b;
    }
    function vPainel() {
      var novos = todos.filter(function (a) { return a.novo; }), resto = todos.length - novos.length;
      var top = panel("Alertas de preço", "Regras fixas, sem IA, sobre as compras registradas no RAC. “Menor preço” é o menor registrado aqui, não o do mercado. Toque num tipo para ver os alertas dele.");
      var bar = h("div", { class: "vfil" });
      var aj = h("button", { type: "button", class: "ghostbtn", text: "⚙ Ajustes" }); aj.onclick = function () { ir("ajustes", { volta: "painel" }); }; bar.appendChild(aj);
      if (novos.length) { var tl = h("button", { type: "button", class: "ghostbtn", text: "Marcar todos como lidos" }); tl.onclick = function () { salvarLidos(novos.map(function (a) { return a.id; })); }; bar.appendChild(tl); }
      top.appendChild(bar);
      var exA = blocoExportar(function () { return N.mkxAlertas(todos, { dono: ehDono(), hoje: hojeLocal(), tipo: "", filtro: "todos os tipos ligados (novos, lidos e anteriores)" }); });
      top.appendChild(exA.el); exA.atualizar();
      /* indicadores: novos + um por tipo (o "menor no período" só aparece se estiver ligado) */
      var tipos = N.MKAL_TIPOS.filter(function (t) { return t[0] !== "minimo_periodo" || cfg.tipos.minimo_periodo.on; });
      var grade = h("div", { class: "alkpis", role: "group", "aria-label": "Alertas por tipo" });
      var tn = h("button", { type: "button", class: "altile novos", "aria-label": "Novos: " + R.novos + ". Ver todos os alertas" },
        h("span", { class: "alic", "aria-hidden": "true", text: "●" }), h("span", { class: "alnm", text: "Novos" }), h("b", { class: "alnum", text: String(R.novos) }), h("span", { class: "alsub", text: (resto ? resto + " lidos ou anteriores · " : "") + "ver todos ›" }));
      tn.onclick = function () { ir("lista", { tipo: "" }); }; grade.appendChild(tn);
      tipos.forEach(function (t) {
        var on = cfg.tipos[t[0]].on, nNovos = R.porTipo[t[0]] || 0, nTot = cl.alertas.filter(function (a) { return a.tipo === t[0]; }).length;
        var b = h("button", { type: "button", class: "altile t-" + t[0] + (on ? "" : " off"), "aria-label": t[1] + ": " + (on ? nNovos + " novos" : "desligado") },
          h("span", { class: "alic", "aria-hidden": "true", text: t[2] }), h("span", { class: "alnm", text: t[1] }), h("b", { class: "alnum", text: on ? String(nNovos) : "—" }),
          h("span", { class: "alsub", text: on ? (nTot ? nTot + " no total · ver ›" : "nenhum ainda") : "desligado · ajustar ›" }));
        b.onclick = function () { on ? ir("lista", { tipo: t[0] }) : ir("ajustes", { volta: "painel" }); };
        grade.appendChild(b);
      });
      top.appendChild(grade); out.appendChild(top);
      var rec = h("div", { class: "panel" }, h("h2", { text: "Novos mais recentes" }));
      if (!novos.length) rec.appendChild(h("p", { class: "empty", text: todos.length ? "Nada novo. Os alertas anteriores estão em cada tipo." : "Nenhum alerta com as regras de hoje." }));
      novos.slice(0, 5).forEach(function (a) { rec.appendChild(linha(a, true)); });
      if (novos.length > 5) { var vm = h("button", { type: "button", class: "ghostbtn", text: "Ver os " + novos.length + " novos" }); vm.onclick = function () { ir("lista", { tipo: "" }); }; rec.appendChild(h("div", { class: "vfil" }, vm)); }
      out.appendChild(rec);
    }
    function vLista() {
      var base = todos.filter(function (a) { return !c.tipo || a.tipo === c.tipo; }), novos = base.filter(function (a) { return a.novo; }), resto = base.filter(function (a) { return !a.novo; });
      var p = panel(tipoRot(), novos.length + (novos.length === 1 ? " novo" : " novos") + " · " + base.length + (base.length === 1 ? " alerta" : " alertas") + " no total");
      p.appendChild(h("div", { class: "vfil" }, voltar("← Painel", function () { ir("painel"); })));
      var segT = h("div", { class: "seg mkmeses", role: "group", "aria-label": "Tipo de alerta" });
      [["", "Todos"]].concat(N.MKAL_TIPOS.filter(function (t) { return cfg.tipos[t[0]].on; }).map(function (t) { return [t[0], t[2] + " " + t[1].split(" ")[0]]; })).forEach(function (x) {
        var b = h("button", { type: "button", text: x[1], "aria-pressed": String(c.tipo === x[0]), title: x[0] ? rotuloDe[x[0]] : "Todos os tipos" }); b.onclick = function () { ir("lista", { tipo: x[0] }); }; segT.appendChild(b);
      });
      p.appendChild(segT);
      var mostrar = h("label", { class: "sub" }, h("input", { type: "checkbox", "aria-label": "Mostrar lidos e anteriores", checked: c.anteriores ? "" : null }), " Mostrar lidos e anteriores");
      achar1(mostrar).onchange = function () { c.anteriores = achar1(mostrar).checked; pintar(); };
      var f = h("div", { class: "vfil" }, mostrar);
      if (novos.length) { var tl = h("button", { type: "button", class: "ghostbtn", text: c.tipo ? "Marcar todos deste tipo como lidos" : "Marcar todos como lidos" }); tl.onclick = function () { salvarLidos(novos.map(function (a) { return a.id; })); }; f.appendChild(tl); }
      p.appendChild(f);
      /* exporta o grupo aberto: o tipo escolhido, só os novos (ou também os lidos e anteriores, se a caixa estiver marcada) */
      var exL = blocoExportar(function () { return N.mkxAlertas(base.filter(function (a) { return a.novo || c.anteriores; }), { dono: ehDono(), hoje: hojeLocal(), tipo: c.tipo, filtro: (c.tipo ? rotuloDe[c.tipo] : "todos os tipos ligados") + (c.anteriores ? " (novos, lidos e anteriores)" : " (só os novos)") }); });
      p.appendChild(exL.el); exL.atualizar(); out.appendChild(p);
      var l = h("div", { class: "panel" });
      if (!novos.length) l.appendChild(h("p", { class: "empty", text: base.length ? "Nenhum alerta novo neste grupo. Use “Mostrar lidos e anteriores” para ver o resto." : "Nenhum alerta com as regras de hoje." }));
      novos.forEach(function (a) { l.appendChild(linha(a)); });
      if (c.anteriores && resto.length) {
        l.appendChild(h("h3", { class: "dayh", text: "Lidos e anteriores (" + resto.length + ")" }));
        resto.slice(0, 60).forEach(function (a) { l.appendChild(linha(a)); });
        if (resto.length > 60) l.appendChild(h("p", { class: "sub", text: "Mostrando os 60 mais recentes de " + resto.length + "." }));
      }
      out.appendChild(l);
    }
    function vProduto() {
      var a = todos.filter(function (x) { return x.id === c.sel; })[0], su = unTxt(a), un = a.unidade === "l" ? "L" : a.unidade;
      var p = panel(iconeDe[a.tipo] + " " + a.nome + " · " + un, rotuloDe[a.tipo] + " · " + dataBR(a.data) + " · " + semCidade(a.mercado) + (a.novo ? " · novo" : a.lido ? " · lido" : " · anterior"));
      p.appendChild(h("div", { class: "vfil" }, voltar("← Painel", function () { ir("painel"); }), c.volta === "lista" ? voltar("← " + tipoRot(), function () { ir("lista"); }) : null));
      p.appendChild(h("h3", { class: "dayh", text: "Por que gerou este alerta" })); p.appendChild(h("p", { text: a.motivo }));
      p.appendChild(h("h3", { class: "dayh", text: "Comparação de preços" }));
      var cmp = a.tipo === "limite" ? [["Seu limite", money(a.anterior) + su, "—"], ["Preço pago", money(a.atual) + su, dataBR(a.data) + " · " + semCidade(a.mercado)]]
        : a.tipo === "melhor" ? [["Onde você comprou", money(a.anterior) + su, dataBR(a.refData) + " · " + semCidade(a.refMercado)], ["Mais barato em", money(a.atual) + su, dataBR(a.dataEncontrado) + " · " + semCidade(a.mercado)]]
        : [["Antes", money(a.anterior) + su, (a.refData ? dataBR(a.refData) : "—") + (a.refMercado ? " · " + semCidade(a.refMercado) : "")], ["Agora", money(a.atual) + su, dataBR(a.data) + " · " + semCidade(a.mercado)]];
      p.appendChild(tabela(["", "Preço", "Quando e onde"], cmp.concat([["Variação", a.pct != null ? varTag(a.pct) : "—", ""], ["Diferença", a.anterior != null ? sinalMoney(Math.round((a.atual - a.anterior) * 100) / 100) + su : "—", ""]]), 1));
      p.appendChild(h("h3", { class: "dayh", text: "Compra que originou" }));
      p.appendChild(h("p", { class: "sub", text: dataBR(a.data) + " · " + semCidade(a.mercado) + " · " + a.nome + " (" + un + ") a " + money(a.atual) + su + " · categoria " + a.categoria }));
      var f = h("div", { class: "vfil" }), ver = h("button", { type: "button", text: "Ver histórico do produto" });
      ver.onclick = function () { st.prod = a.chave; st.q = ""; st.voltar = false; st.voltarY = null; location.hash = "#mercado/precos"; };
      f.appendChild(ver);
      if (!a.lido) { var lido = h("button", { type: "button", class: "ghostbtn", text: "Marcar como lido" }); lido.onclick = function () { salvarLidos([a.id]); }; f.appendChild(lido); }
      p.appendChild(f); out.appendChild(p);
      var outros = todos.filter(function (x) { return x.chave === a.chave && x.id !== a.id; });
      if (outros.length) { var po = h("div", { class: "panel" }, h("h2", { text: "Outros alertas deste produto (" + outros.length + ")" })); outros.slice(0, 8).forEach(function (x) { po.appendChild(linha(x, true)); }); out.appendChild(po); }
    }
    function vAjustes() {
      out.appendChild(h("div", { class: "vfil" }, voltar("← Painel", function () { ir("painel"); })));
      out.appendChild(ajustesAlertas(N, cfg, estado, msg));
    }
    var msg = h("p", { class: "sub", role: "status", text: st.alMsg || "" }); st.alMsg = "";
    function pintar() { out.innerHTML = ""; ({ painel: vPainel, lista: vLista, produto: vProduto, ajustes: vAjustes })[c.vista](); out.appendChild(msg); }
    pintar();
  }
  function achar1(label) { return label.children[0]; }
  /* Ajustes: ligar/desligar cada tipo, percentuais, janelas, limites por produto e unidade (editar = salvar de novo; remover) */
  function ajustesAlertas(N, cfg, estado, msg) {
    var d = panel("Ajustes dos alertas", "Ligue ou desligue cada tipo, mude os percentuais e as janelas e cadastre limites por produto e unidade."), box = h("div", { class: "stack" }); d.appendChild(box);
    var T = cfg.tipos, ins = {};
    function linha(chave, rot, extra) {
      var on = h("input", { type: "checkbox", "aria-label": "Ativar: " + rot, checked: T[chave].on ? "" : null }); ins[chave] = { on: on };
      var l = h("label", { class: "sub" }, on, " " + rot); var row = h("div", { class: "vfil" }, l);
      (extra || []).forEach(function (x) { var i = h("input", { type: "number", min: x.min, step: x.step, value: String(x.v), "aria-label": rot + ": " + x.rot, inputmode: "decimal" }); ins[chave][x.k] = i; row.appendChild(h("span", { class: "sub", text: x.rot })); row.appendChild(i); });
      box.appendChild(row);
    }
    linha("aumento", "Aumento de preço", [{ k: "pct", rot: "a partir de (%)", v: Math.round(T.aumento.pct * 1000) / 10, min: 1, step: 1 }]);
    linha("queda", "Queda de preço", [{ k: "pct", rot: "a partir de (%)", v: Math.round(T.queda.pct * 1000) / 10, min: 1, step: 1 }]);
    linha("minimo", "Menor preço histórico");
    linha("minimo_periodo", "Menor preço no período", [{ k: "dias", rot: "janela (dias)", v: T.minimo_periodo.dias, min: 7, step: 1 }]);
    linha("melhor", "Melhor preço em outro mercado", [{ k: "pct", rot: "diferença mínima (%)", v: Math.round(T.melhor.pct * 1000) / 10, min: 1, step: 1 }, { k: "dias", rot: "registros a até (dias)", v: T.melhor.dias, min: 7, step: 1 }]);
    linha("limite", "Limite de preço definido por mim");
    /* resumo diário por notificação (6h): só contagens, só para o dono; quem manda é a rotina diária do servidor (docs/mercado-alertas.md) */
    var pushOn = h("input", { type: "checkbox", "aria-label": "Receber o resumo diário por notificação (6h)", checked: cfg.push.on ? "" : null });
    box.appendChild(h("div", { class: "vfil" }, h("label", { class: "sub" }, pushOn, " Receber o resumo diário por notificação (6h, só contagens)")));
    var nd = h("input", { type: "number", min: 7, step: 1, value: String(cfg.novosDias), "aria-label": "Considerar novos os alertas dos últimos (dias)", inputmode: "numeric" });
    box.appendChild(h("div", { class: "vfil" }, h("span", { class: "sub", text: "Considerar novos os alertas dos últimos (dias)" }), nd));
    var salvar = h("button", { type: "button", text: "Salvar ajustes" });
    salvar.onclick = function () {
      function pct(k) { return +ins[k].pct.value / 100; }
      var novo = N.mkalConfig({ tipos: {
        aumento: { on: ins.aumento.on.checked, pct: pct("aumento") }, queda: { on: ins.queda.on.checked, pct: pct("queda") }, minimo: { on: ins.minimo.on.checked },
        minimo_periodo: { on: ins.minimo_periodo.on.checked, dias: +ins.minimo_periodo.dias.value }, melhor: { on: ins.melhor.on.checked, pct: pct("melhor"), dias: +ins.melhor.dias.value }, limite: { on: ins.limite.on.checked } },
        novosDias: +nd.value, limites: cfg.limites, push: { on: pushOn.checked } });
      alPersistir(novo, estado, "Ajustes salvos.");
    };
    box.appendChild(h("div", { class: "vfil" }, salvar));
    /* limites por produto e unidade */
    box.appendChild(h("h3", { class: "dayh", text: "Limites de preço por produto" }));
    box.appendChild(h("p", { class: "sub", text: "Gera alerta quando uma compra registrada tiver preço igual ou menor que o limite. Vale para o produto naquela unidade." }));
    if (cfg.limites.length) box.appendChild(tabela(["Produto", "Unidade", "Limite", ""], cfg.limites.map(function (l) {
      var rem = h("button", { type: "button", class: "ghostbtn", text: "Remover", "aria-label": "Remover limite de " + l.nome });
      rem.onclick = function () { alPersistir(N.mkalLimiteRemover(cfg, l.chave), estado, "Limite removido."); };
      return [l.nome, l.unidade === "l" ? "L" : l.unidade, money(l.max), rem];
    }), 2));
    else box.appendChild(h("p", { class: "sub", text: "Nenhum limite cadastrado." }));
    var opc = N.mkalOpcoes(rows);
    var sel = h("select", { "aria-label": "Produto do limite" }, h("option", { value: "", text: "Escolha o produto" }), opc.map(function (o) { return h("option", { value: o.chave, text: o.nome + " · " + (o.unidade === "l" ? "L" : o.unidade) }); }));
    var max = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Limite (R$)", "aria-label": "Limite de preço (R$)", inputmode: "decimal" });
    var add = h("button", { type: "button", text: "Salvar limite" });
    add.onclick = function () {
      var o = opc.filter(function (x) { return x.chave === sel.value; })[0];
      var r = N.mkalLimiteSalvar(cfg, { nome: o ? o.nome : "", unidade: o ? o.unidade : "", max: +max.value });
      if (r.erro) { msg.textContent = r.erro; return; }
      alPersistir(r.cfg, estado, "Limite salvo.");
    };
    box.appendChild(h("div", { class: "vfil" }, sel, max, add));
    box.appendChild(h("p", { class: "sub", text: "Os ajustes e o que você já leu ficam na sua conta, só visíveis para você." }));
    return d;
  }

  /* ---------- Notas ---------- */
  function viewNotas(body) {
    var g = Object.values(groupBy(rows, function (x) { return x.nota; })).map(function (l) {
      return { data: l[0].data, mercado: l[0].mercado, numero: l[0].numero, pag: l[0].forma_pagamento, itens: l, total: sum(l, function (x) { return x.valor_total; }) };
    }).sort(function (a, b) { return b.data.localeCompare(a.data); });
    var p = panel("Notas", g.length + " compras registradas");
    g.forEach(function (n) {
      var d = h("details", { class: "mknota" },
        h("summary", null, h("span", { class: "when", text: dataBR(n.data) }), h("span", { class: "mkn" }, h("b", { text: n.mercado.replace(/\s*\(.*\)$/, "") }), h("span", { class: "sub", text: " · " + n.itens.length + " itens" + (n.numero ? " · NF " + n.numero.replace(/^0+/, "") : "") })), h("b", { class: "mkt", text: money(n.total) })),
        tabela(["Item", "Categoria", "Qtd", "Unit.", "Total"], n.itens.map(function (x) { return [x.descricao, x.categoria, fmtQtd(x.quantidade, x.unidade), money(x.valor_unitario), money(x.valor_total)]; }), 2),
        n.pag ? h("p", { class: "sub", text: "Pagamento: " + n.pag }) : null, botaoApagar(n.itens, function () { drawApp("notas"); }));
      p.appendChild(d);
    });
    body.appendChild(p);
  }

  /* ---------- Produtos: renomear, juntar repetidos e trocar categoria ---------- */
  function viewProdutos(body) {
    var p = panel("Produtos", "Junte nomes diferentes do mesmo produto para o histórico de preços ficar num lugar só. A categoria escolhida aqui vale para todas as compras do produto.");
    var tools = h("div", { class: "vfil" });
    var q = h("input", { type: "search", placeholder: "Buscar produto", "aria-label": "Buscar produto", autocomplete: "off" });
    var juntar = h("button", { type: "button", class: "ghostbtn pri", disabled: "", text: "Juntar selecionados" });
    tools.appendChild(q); tools.appendChild(juntar); p.appendChild(tools);
    var form = h("div", { class: "mkmerge", hidden: "" }); p.appendChild(form);
    var info = h("p", { class: "sub", role: "status" }); p.appendChild(info);
    var list = h("div", { class: "mkplist" }); p.appendChild(list);
    body.appendChild(p);
    var prods = [], sel = {};
    var cats = listaCats(rows);
    var stats = groupBy(rows, function (x) { return x.produto_id || ""; });
    function carregar() {
      info.textContent = "Carregando…";
      return sb.from("produtos").select("id,nome,categoria,unidade").order("nome").then(ok).then(function (d) {
        d.forEach(function (x) { x.categoria = catOf(x.categoria); }); prods = d; cats = listaCats(rows.concat(d)); info.textContent = d.length + " produtos"; draw();
      }).catch(function (e) { info.textContent = "Não consegui carregar os produtos: " + e.message; });
    }
    function selecionados() { return prods.filter(function (x) { return sel[x.id]; }); }
    function atualizarBotao() { var n = selecionados().length; juntar.disabled = n < 2; juntar.textContent = n >= 2 ? "Juntar " + n + " selecionados" : "Juntar selecionados"; }
    function salvar(promessa, okMsg) {
      info.textContent = "Salvando…";
      return promessa.then(ok).then(function () { info.textContent = okMsg; return loadRows(true); })
        .then(function () { stats = groupBy(rows, function (x) { return x.produto_id || ""; }); return carregar(); })
        .catch(function (e) { info.textContent = /duplicate|unique/i.test(e.message) ? "Já existe um produto com esse nome. Para juntar os dois, marque ambos e use “Juntar selecionados”." : "Não consegui salvar: " + e.message; draw(); });
    }
    function draw() {
      var nq = norm(q.value);
      list.innerHTML = "";
      prods.filter(function (x) { return !nq || norm(x.nome + " " + x.categoria).indexOf(nq) >= 0; }).forEach(function (x) {
        var compras = stats[x.id] || [];
        var cb = h("input", { type: "checkbox", "aria-label": "Selecionar " + x.nome, checked: sel[x.id] ? "" : null });
        cb.onchange = function () { if (cb.checked) sel[x.id] = 1; else delete sel[x.id]; atualizarBotao(); };
        var nome = h("input", { type: "text", value: x.nome, "aria-label": "Nome do produto", class: "mkpname" });
        nome.onchange = function () { var v = nome.value.trim(); if (!v || v === x.nome) { nome.value = x.nome; return; } salvar(sb.from("produtos").update({ nome: v }).eq("id", x.id), "Nome atualizado."); };
        var cat = h("select", { "aria-label": "Categoria" }, cats.concat(cats.indexOf(x.categoria) < 0 ? [x.categoria] : []).map(function (c) { return h("option", { value: c, selected: c === x.categoria ? "" : null, text: c }); }));
        cat.onchange = function () { salvar(sb.from("produtos").update({ categoria: cat.value }).eq("id", x.id), "Categoria atualizada."); };
        list.appendChild(h("div", { class: "mkprow" }, cb, nome, cat,
          h("span", { class: "sub", text: compras.length + (compras.length === 1 ? " compra" : " compras") + (compras.length ? " · " + money(compras[compras.length - 1].valor_unitario) + (x.unidade === "kg" ? "/kg" : "") : "") })));
      });
      atualizarBotao();
    }
    juntar.onclick = function () {
      var l = selecionados(); if (l.length < 2) return;
      var mais = l.slice().sort(function (a, b) { return (stats[b.id] || []).length - (stats[a.id] || []).length; })[0];
      form.innerHTML = ""; form.hidden = false;
      var nome = h("input", { type: "text", value: mais.nome, "aria-label": "Nome final" });
      var cat = h("select", { "aria-label": "Categoria final" }, cats.map(function (c) { return h("option", { value: c, selected: c === mais.categoria ? "" : null, text: c }); }));
      var go = h("button", { type: "button", text: "Juntar" }), cancel = h("button", { type: "button", class: "ghostbtn", text: "Cancelar" });
      cancel.onclick = function () { form.hidden = true; };
      go.onclick = function () {
        var alvo = mais, outros = l.filter(function (x) { return x.id !== alvo.id; }).map(function (x) { return x.id; });
        var novoNome = nome.value.trim() || alvo.nome;
        form.hidden = true;
        info.textContent = "Juntando…";
        var conflito = prods.filter(function (x) { return x.nome === novoNome && x.id !== alvo.id && outros.indexOf(x.id) < 0; })[0];
        if (conflito) { info.textContent = "Já existe outro produto chamado “" + novoNome + "”. Marque ele também para juntar todos."; return; }
        var passo = sb.from("itens").update({ produto_id: alvo.id }).in("produto_id", outros).then(ok)
          .then(function () { return sb.from("produtos").delete().in("id", outros).then(ok); })
          .then(function () { return sb.from("produtos").update({ nome: novoNome, categoria: cat.value }).eq("id", alvo.id); });
        sel = {};
        salvar(passo, l.length + " produtos juntados em “" + novoNome + "”.");
      };
      form.appendChild(h("p", { class: "sub", text: "Juntar " + l.length + " produtos em um só. As compras de todos passam para ele." }));
      form.appendChild(h("div", { class: "vfil" }, nome, cat, go, cancel));
      nome.focus();
    };
    q.addEventListener("input", draw);
    carregar();
  }

  /* ---------- Nota pela foto do cupom ----------
     A Fazenda de SP não deixa robôs nem outros sites abrirem a nota, e ler a letra de matriz do cupom no navegador
     erra demais. Então a pessoa manda a foto para o Claude, cola a resposta aqui e confere.
     CPF e demais dados do consumidor são ignorados. */
  var ABREV = { refrig: "refrigerante", min: "mineral", fgo: "frango", frgo: "frango", ling: "linguica", tosc: "toscana", rep: "refil", liq: "liquido", cong: "congelado", choc: "chocolate", bisc: "biscoito", qj: "queijo", mus: "mussarela", mussar: "mussarela", pres: "presunto", sab: "sabonete", amac: "amaciante", deterg: "detergente", lav: "lava", pao: "pao", fr: "frances", trad: "tradicional", integ: "integral", desn: "desnatado", sach: "sache", bov: "bovino", sui: "suino", peit: "peito", file: "file", agua: "agua", cerv: "cerveja", lt: "lata" };
  function tokens(t) {
    /* "REFRIG.COCA COLA 200ML" -> refrigerante coca cola 200ml; o decimal (32,9g) vira "p" para não quebrar o número */
    return norm(t).replace(/(\d)[.,](\d)/g, "$1p$2").split(/[^a-z0-9]+/).map(function (w) { return ABREV[w] || w; })
      .filter(function (w) { return w && w.length > 1 && !/^(un|kg|de|da|do|com|c|s|e)$/.test(w); });
  }
  function semelhanca(a, b) {
    var A = tokens(a), B = tokens(b); if (!A.length || !B.length) return 0;
    var hits = A.filter(function (w) { return B.some(function (v) { return v === w || (w.length >= 4 && v.indexOf(w) === 0) || (v.length >= 4 && w.indexOf(v) === 0); }); }).length;
    var nota = hits / Math.max(A.length, Math.min(B.length, A.length + 1));
    /* tamanho de embalagem diferente (200ml x 1,5L) é outro produto */
    function tam(l) { return l.filter(function (w) { return /^\d+(p\d+)?(ml|l|g|kg)$/.test(w); }); }
    var ta = tam(A), tb = tam(B);
    if (ta.length && tb.length && !ta.some(function (x) { return tb.indexOf(x) >= 0; })) nota *= 0.5;
    return nota;
  }
  /* Nome legível e classificação do produto novo: a lógica pura fica em nucleo.js (NUCLEO.mkNome, mkClassificar, MK_CATEGORIAS; docs/mercado-classificacao.md) */
  function NU() { return window.RACnucleo; }
  function nomeBonito(t) { return NU().mkNome(t); }
  function catOf(c) { return NU().mkCatOficial(c); }
  var CATS_OFICIAIS = function () { return NU().MK_CATEGORIAS.slice(); };
  /* categorias da lista: as oficiais + qualquer outra que o dono já tenha usado (sem repetir "Limpeza/Descartáveis") */
  function listaCats(prods) { var l = CATS_OFICIAIS(); (prods || []).forEach(function (x) { var c = catOf(x.categoria); if (c && l.indexOf(c) < 0) l.push(c); }); return l; }

  /* Espalha o desconto da nota entre os itens, proporcional ao valor de cada um, para a soma bater com o que foi pago */
  function ratearDesconto(nota) {
    var soma = sum(nota.itens, function (x) { return x.vt; }), d = Math.round((nota.desconto || 0) * 100) / 100;
    /* desconto que o cupom já diz de qual item é fica nele; o resto é espalhado */
    nota.itens.forEach(function (x) { x.desc_rateio = Math.round((x.descItem || 0) * 100) / 100; });
    d = Math.round((d - sum(nota.itens, function (x) { return x.desc_rateio; })) * 100) / 100;
    if (d <= 0 || !soma) return;
    var usado = 0;
    nota.itens.forEach(function (x) { var k = Math.floor(d * x.vt / soma * 100) / 100; x.desc_rateio = Math.round((x.desc_rateio + k) * 100) / 100; usado += k; });
    var resto = Math.round((d - usado) * 100) / 100, maior = nota.itens.slice().sort(function (a, b) { return b.vt - a.vt; })[0];
    maior.desc_rateio = Math.round((maior.desc_rateio + resto) * 100) / 100;
  }

  /* Pedido que a pessoa cola no Claude junto com a foto; a resposta (JSON) é colada de volta aqui */
  /* itens em lista curta ([descrição, qtd, un, unitário, total, desconto]): resposta menor, que o app termina rápido e copia inteira */
  var PEDIDO = "Leia a foto deste cupom fiscal de supermercado e responda SOMENTE com um bloco de código JSON, sem comentários, neste formato:\n" +
    '{"mercado":"nome do mercado","cnpj":"só números","data":"AAAA-MM-DD","numero":"","serie":"","chave":"44 dígitos da chave de acesso, sem espaços","pagamento":"forma de pagamento","total_pago":0.00,"desconto_nota":0.00,' +
    '"itens":[["descrição como está no cupom",qtd,"un ou kg",valor_unitario,valor_total,desconto]]}\n' +
    "Regras: uma lista por item, na ordem do cupom, sem espaços extras. valor_total é o total da linha antes de desconto. Linha \"Desconto Item\" vai no desconto do item dela (0 se não houver). " +
    "desconto_nota é só desconto geral da nota (0 se não houver). Use ponto como separador decimal. Não inclua CPF nem dados do consumidor. Se não conseguir ler um número, use null.";
  /* JSON que o app devolve nem sempre é perfeito: aspas curvas, vírgula decimal (22,68), vírgula sobrando no fim.
     Se mesmo assim não abrir, pega item por item ({...} com "descricao"). */
  function jsonTolerante(t) {
    t = t.replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00A0/g, " ");
    function tentar(x) {
      try { return JSON.parse(x); } catch (e) { }
      x = x.replace(/,\s*([}\]])/g, "$1").replace(/:\s*(-?\d+),(\d+)(?=\s*[,}\]])/g, ":$1.$2").replace(/:\s*(?:NaN|undefined)\b/g, ":null");
      try { return JSON.parse(x); } catch (e) { return null; }
    }
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0) return null;
    var j = b > a ? tentar(t.slice(a, b + 1)) : null;
    if (j) return j;
    /* resposta cortada ou com defeito: salva os itens que estiverem inteiros */
    var itens = (t.match(/\{[^{}]*"descri[^{}]*\}/g) || []).map(tentar).filter(Boolean);
    if (!itens.length) itens = (t.match(/\[\s*"[^"]*"\s*,[^\[\]"]*"[^"]*"[^\[\]"]*\]/g) || []).map(tentar).filter(Boolean);
    if (!itens.length) return { cortado: true };
    j = { itens: itens, cortado: true };
    ["mercado", "cnpj", "data", "numero", "serie", "chave", "pagamento"].forEach(function (k) { var m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(t); if (m) j[k] = m[1]; });
    ["total_pago", "desconto_nota"].forEach(function (k) { var m = new RegExp('"' + k + '"\\s*:\\s*(-?\\d+(?:[.,]\\d+)?)').exec(t); if (m) j[k] = num(m[1]); });
    return j;
  }
  function lerResposta(txt) {
    var j = jsonTolerante(String(txt || ""));
    if (!j) return null;
    /* nomes de campo que o app às vezes troca */
    var lista = j.itens || j.items || j.produtos;
    if (!Array.isArray(lista)) return j.cortado ? { cortado: true, itens: [] } : null;
    j.itens = lista.map(function (x) {
      if (Array.isArray(x)) return { descricao: x[0], qtd: x[1], un: x[2], valor_unitario: x[3], valor_total: x[4], desconto: x[5] };
      return { descricao: x.descricao || x["descrição"] || x.nome || x.item || x.produto, qtd: x.qtd != null ? x.qtd : x.quantidade, un: x.un || x.unidade,
        valor_unitario: x.valor_unitario != null ? x.valor_unitario : x.preco_unitario, valor_total: x.valor_total != null ? x.valor_total : x.total, desconto: x.desconto };
    });
    function n2(v) { return v == null ? 0 : typeof v === "number" ? v : num(v); }
    var nota = { fonte: "foto", mercado: String(j.mercado || ""), cnpj: String(j.cnpj || "").replace(/\D/g, ""), numero: String(j.numero || "").replace(/^0+/, ""), serie: String(j.serie || ""),
      chave: String(j.chave || "").replace(/\D/g, ""), pagamento: String(j.pagamento || ""), data: /^\d{4}-\d{2}-\d{2}$/.test(j.data) ? j.data : (isoData(j.data) || "") };
    if (nota.cnpj.length !== 14) nota.cnpj = "";
    if (!/^\d{44}$/.test(nota.chave)) nota.chave = "";
    nota.itens = j.itens.map(function (x) {
      var u = norm(x.un); u = /^k/.test(u) ? "kg" : /^l/.test(u) ? "l" : "un";
      var it = { desc: String(x.descricao || "").trim(), qtd: n2(x.qtd) || 1, un: u, vu: n2(x.valor_unitario), vt: n2(x.valor_total), descItem: Math.abs(n2(x.desconto)) };
      if (!it.vt && it.vu) it.vt = Math.round(it.qtd * it.vu * 100) / 100;
      it.duvida = !it.vt || (it.vu && Math.abs(it.qtd * it.vu - it.vt) > 0.05);
      return it;
    });
    nota.desconto = Math.round((Math.abs(n2(j.desconto_nota)) + sum(nota.itens, function (x) { return x.descItem; })) * 100) / 100;
    nota.pago = n2(j.total_pago) || Math.round((sum(nota.itens, function (x) { return x.vt; }) - nota.desconto) * 100) / 100;
    nota.cortado = !!j.cortado;
    return nota;
  }

  /* Tabela em markdown (| Item | Qtd | Unit. | Total |): acha as colunas pelo cabeçalho, seja qual for a ordem.
     Linha "Desconto no item" vai para o item de cima. */
  function itensDaTabela(txt) {
    var linhas = String(txt || "").replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); });
    var itens = [], col = null;
    function celulas(l) { return l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.replace(/\*\*/g, "").trim(); }); }
    function achar(cab, re, menos) { for (var i = 0; i < cab.length; i++) if (re.test(norm(cab[i])) && !(menos && menos.test(norm(cab[i])))) return i; return -1; }
    linhas.forEach(function (l) {
      if (!/^\|.*\|$/.test(l)) { col = null; return; }
      var c = celulas(l);
      if (c.every(function (x) { return /^:?-+:?$/.test(x) || !x; })) return;
      if (!col) {
        var cab = c.map(norm);
        var ci = achar(cab, /item|descri|produto/);
        if (ci < 0) return;
        col = { item: ci, qtd: achar(cab, /qtd|quant/), unit: achar(cab, /unit|preco|pre\. ?un|vl\.? ?un/), total: -1 };
        for (var i = cab.length - 1; i >= 0; i--) if (i !== col.unit && /total|valor/.test(cab[i])) { col.total = i; break; }
        return;
      }
      var nome = c[col.item] || "", tot = col.total >= 0 ? c[col.total] || "" : "";
      if (/desconto/i.test(nome) || (!nome && /desconto/i.test(l))) {
        var dv = /(\d+[.,]\d{2})/.exec(tot || l);
        if (dv && itens.length) itens[itens.length - 1].descItem = (itens[itens.length - 1].descItem || 0) + num(dv[1]);
        return;
      }
      if (!nome || /^(subtotal|total)/i.test(nome)) return;
      var qc = col.qtd >= 0 ? c[col.qtd] || "" : "";
      var qm = /(\d+(?:[.,]\d+)?)\s*(un|und|unid|kg|l|lt|g)?\b(?:\s*[x×*]\s*(?:R\$\s*)?(\d+[.,]\d{2,3}))?/i.exec(qc);
      var u = qm && qm[2] ? qm[2].toLowerCase() : (/kg/i.test(c[col.unit] || "") ? "kg" : "un");
      u = /^k/.test(u) ? "kg" : /^l/.test(u) ? "l" : "un";
      var it = { desc: nome, qtd: qm ? num(qm[1]) || 1 : 1, un: u, vu: num(((col.unit >= 0 ? c[col.unit] : "") || (qm && qm[3]) || "").replace(/\/.*$/, "")), vt: num(tot.replace(/\(.*$/, "")) };
      var dm = /desconto[^\d]{0,15}(\d+[.,]\d{2})/i.exec(tot); if (dm) it.descItem = num(dm[1]);
      if (!it.vt && it.vu) it.vt = Math.round(it.qtd * it.vu * 100) / 100;
      if (!it.vu && it.vt) it.vu = Math.round(it.vt / it.qtd * 100) / 100;
      var bruto = Math.round(it.qtd * it.vu * 100) / 100;
      if (it.descItem && Math.abs(bruto - it.descItem - it.vt) < 0.05) it.vt = bruto;
      it.duvida = !it.vt || Math.abs(bruto - it.vt) > 0.05;
      itens.push(it);
    });
    return itens;
  }
  /* Resposta "normal" do Claude ou do ChatGPT (tabela ou lista), quando a pessoa manda só a foto sem o pedido.
     Cada item tem "qtd un × preço" e, na mesma linha ou na seguinte, o total; a descrição vem antes. */
  function lerTextoLivre(txt) {
    var ls = String(txt || "").replace(/\r/g, "").split("\n").map(function (l) {
      return l.replace(/\*\*/g, "").replace(/\|/g, "  ").replace(/\s+/g, " ").trim();
    }).filter(function (l) { return l && !/^[-:\s]+$/.test(l); });
    var QX = /(\d+(?:[.,]\d+)?)\s*(un|und|unid|kg|l|lt)\.?\s*[x×*]\s*(?:R\$\s*)?(\d+[.,]\d{2,3})/i, DIN = /(\d+[.,]\d{2})(?!\d)/;
    var nota = { itens: itensDaTabela(txt), fonte: "foto" }, usada = {};
    if (!nota.itens.length) ls.forEach(function (l, i) {
      var m = QX.exec(l); if (!m) return;
      var desc = l.slice(0, m.index).replace(/^\d{1,3}[.)]?\s+/, "").replace(/[-–—:]\s*$/, "").trim();
      if (desc.replace(/[^A-Za-zÀ-ú]/g, "").length < 3 && i > 0 && !usada[i - 1] && !QX.test(ls[i - 1])) { desc = ls[i - 1].replace(/^\d{1,3}[.)]?\s+/, "").trim(); usada[i - 1] = 1; }
      usada[i] = 1;
      var resto = l.slice(m.index + m[0].length), tot = DIN.exec(resto.replace(/desconto.*$/i, ""));
      var linhaDesc = resto;
      if (!tot && ls[i + 1] && !QX.test(ls[i + 1])) { tot = DIN.exec(ls[i + 1].replace(/desconto.*$/i, "")); linhaDesc = ls[i + 1]; usada[i + 1] = 1; }
      var u = m[2].toLowerCase(); u = /^k/.test(u) ? "kg" : /^l/.test(u) ? "l" : "un";
      var it = { desc: desc, qtd: num(m[1]) || 1, un: u, vu: num(m[3]) };
      var bruto = Math.round(it.qtd * it.vu * 100) / 100, v = tot ? num(tot[1]) : bruto;
      var dm = /desconto[^\d]{0,15}(\d+[.,]\d{2})/i.exec(linhaDesc), d = dm ? num(dm[1]) : 0;
      /* o total pode vir antes ou depois do desconto: fica o que fechar com qtd × preço */
      if (d && Math.abs(bruto - d - v) < 0.05) v = bruto;
      it.vt = v; it.descItem = d;
      it.duvida = !desc || Math.abs(bruto - v) > 0.05;
      nota.itens.push(it);
    });
    /* lista curta, sem quantidade: "1. Uva Verde 500g — R$ 12,98 (desconto R$ 1,68)". Cada item entra como 1 unidade
       e o valor da lista é o que foi pago (o desconto, se vier, é somado de volta para o total da linha) */
    if (!nota.itens.length) ls.forEach(function (l) {
      var m = /^(?:\d{1,3}[.)]|[-•*])\s*(.+?)\s*(?:[—–:]|\s-)\s*R\$\s*(\d+(?:\.\d{3})*[.,]\d{2})(.*)$/.exec(l);
      if (!m || /^(sub)?total|^desconto|^troco|^valor pago/i.test(m[1])) return;
      var pago = num(m[2]), dm = /desconto[^\d]{0,15}(\d+[.,]\d{2})/i.exec(m[3]), d = dm ? num(dm[1]) : 0;
      var vt = Math.round((pago + d) * 100) / 100;
      nota.itens.push({ desc: m[1].trim(), qtd: 1, un: "un", vu: vt, vt: vt, descItem: d, semQtd: true });
    });
    nota.semQtd = nota.itens.some(function (x) { return x.semQtd; });
    var t = ls.join("\n");
    var em = /(\d{2})\/(\d{2})\/(20\d{2})/.exec(t); nota.data = em ? em[3] + "-" + em[2] + "-" + em[1] : "";
    /* "nota de 25/10", sem o ano: este ano (ou o passado, se a data ainda não chegou) */
    var ed = !em && /\b([0-3]\d)\/([01]\d)\b(?!\/)/.exec(t);
    if (ed) { var ano = new Date().getFullYear(), d0 = ano + "-" + ed[2] + "-" + ed[1]; nota.data = d0 > new Date().toISOString().slice(0, 10) ? (ano - 1) + d0.slice(4) : d0; }
    var tp = /total\s*(?:de|pago|:)?\s*R\$\s*(\d+[.,]\d{2})/i.exec(t) || /total[^R\n]{0,30}\(?R\$\s*(\d+[.,]\d{2})/i.exec(t);
    nota.desconto = Math.round(sum(nota.itens, function (x) { return x.descItem || 0; }) * 100) / 100;
    nota.pago = tp ? num(tp[1]) : Math.round((sum(nota.itens, function (x) { return x.vt; }) - nota.desconto) * 100) / 100;
    var mm = /((?:[Ss]uper|[Hh]iper)?[Mm]ercados?|[Aa]tacad[ãa]o|[Aa]tacarejo)\s+([A-ZÀ-Ú][\wÀ-ú'&-]+(?:\s+[A-ZÀ-Ú][\wÀ-ú'&-]+)?)/.exec(t);
    nota.mercado = mm ? mm[1] + " " + mm[2] : "";
    var cn = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|CNPJ\D{0,6}(\d{14})/.exec(t); nota.cnpj = cn ? (cn[1] || cn[2]).replace(/\D/g, "") : "";
    var pg = /(cart[ãa]o de cr[ée]dito|cart[ãa]o de d[ée]bito|pix|dinheiro|vale[- ]alimenta[çc][ãa]o)/i.exec(t); nota.pagamento = pg ? pg[1] : "";
    var nn = /(?:n[úu]mero|n[º°o])\.?[:\s]*0*(\d{3,9})/i.exec(t); nota.numero = nn ? nn[1] : "";
    var se = /s[ée]rie[:\s]*0*(\d{1,3})/i.exec(t);
    var ch = /((?:\d{4}\s?){11})/.exec(t.replace(/\n/g, " ")); nota.chave = ch ? ch[1].replace(/\D/g, "") : "";
    if (!/^35\d{42}$/.test(nota.chave)) nota.chave = "";
    nota.serie = se ? se[1] : ""; nota.texto = t;
    return nota;
  }

  function painelFoto(body) {
    var p = panel("Nota pela foto", "O Claude lê a foto do cupom; você cola a resposta aqui e confere antes de salvar.");
    var ia = h("div", { class: "qrstep" });
    var cmsg = h("p", { class: "sub", role: "status" });
    var pedTxt = h("textarea", { class: "qrpaste", rows: "4", readonly: "", hidden: "", "aria-label": "Pedido para copiar" }); pedTxt.value = PEDIDO;
    /* o botão abre a conversa (ou projeto) do Claude que a pessoa usa para as notas, guardada neste aparelho,
       e no mesmo toque copia o pedido: lá é só anexar a foto e colar */
    var CH_LINK = "rac-claude-notas";
    function linkClaude() { try { return localStorage.getItem(CH_LINK) || ""; } catch (e) { return ""; } }
    var abrir = h("a", { class: "filebtn", target: "_blank", rel: "noopener", text: "Abrir o Claude" });
    abrir.onclick = function () {
      try { navigator.clipboard.writeText(PEDIDO).then(function () { cmsg.textContent = "✓ Pedido copiado. No Claude: anexe a foto do cupom, cole o pedido e envie."; }, function () { pedTxt.hidden = false; }); } catch (e) { pedTxt.hidden = false; }
    };
    var trocar = h("button", { type: "button", class: "ghostbtn" });
    var lform = h("div", { class: "vfil", hidden: "" }), lin = h("input", { type: "url", placeholder: "https://claude.ai/project/… ou /chat/…", "aria-label": "Link da conversa do Claude", autocomplete: "off" });
    var lok = h("button", { type: "button", text: "Salvar" }), lmsg = h("p", { class: "sub", role: "status" });
    function mostrarLink() {
      var l = linkClaude();
      abrir.href = l || "https://claude.ai/new";
      abrir.textContent = l ? "Abrir o Claude (sua conversa das notas)" : "Abrir o Claude";
      trocar.textContent = l ? "Trocar a conversa" : "Usar a minha conversa das notas";
    }
    trocar.onclick = function () { lform.hidden = !lform.hidden; lin.value = linkClaude(); lmsg.textContent = ""; if (!lform.hidden) lin.focus(); };
    lok.onclick = function () {
      var v = lin.value.trim();
      if (/claude\.ai\/share\//.test(v)) { lmsg.textContent = "Esse é o link de compartilhar, que abre só uma cópia para leitura. Abra a conversa (ou o projeto) no claude.ai pelo navegador e copie o endereço da barra: começa com claude.ai/chat/ ou claude.ai/project/."; return; }
      if (v && !/^https:\/\/claude\.ai\/(chat|project)\/[\w-]+/.test(v)) { lmsg.textContent = "O link precisa começar com https://claude.ai/chat/ ou https://claude.ai/project/."; return; }
      try { if (v) localStorage.setItem(CH_LINK, v); else localStorage.removeItem(CH_LINK); } catch (e) { }
      lform.hidden = true; lmsg.textContent = v ? "✓ Pronto: o botão agora abre a sua conversa das notas." : "Voltou a abrir uma conversa nova.";
      mostrarLink();
    };
    lform.appendChild(lin); lform.appendChild(lok);
    mostrarLink();
    var resp = h("textarea", { class: "qrpaste", rows: "3", placeholder: "…ou cole aqui a resposta", "aria-label": "Resposta do Claude" });
    var colar = h("button", { type: "button", text: "Colar a resposta" });
    colar.onclick = function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) { resp.focus(); return; }
      navigator.clipboard.readText().then(function (t) { resp.value = t; tentarResp(); }, function () { rmsg.textContent = "Toque no quadro abaixo e cole."; resp.focus(); });
    };
    var rmsg = h("p", { class: "sub", role: "status" });
    /* RAC Intelligence (só aparece quando estiver ligada): o resultado REAL vira o mesmo texto do fluxo manual e passa
       pela mesma conferência (nota repetida, soma dos itens, salvar); a resposta DEMO fica só na prévia do botão */
    if (typeof window.iaLigada === "function" && window.iaLigada()) ia.appendChild(window.iaBotao({ modulo: "mercado", acao: "mercado.nota",
      real: function (r) { var t = window.RACnucleo.iaNotaTexto(r); if (!t) return; resp.value = t; tentarResp(); } }));
    ia.appendChild(h("ol", { class: "how" },
      h("li", null, "Toque em Abrir o Claude. O pedido já vai copiado."),
      h("li", null, "No app, anexe a foto do cupom, cole o pedido e envie."),
      h("li", null, "Copie a resposta inteira (ícone de copiar logo abaixo dela), volte aqui e toque em ", h("b", { text: "Colar a resposta" }), ".")));
    ia.appendChild(h("div", { class: "vfil" }, abrir, trocar));
    ia.appendChild(lform); ia.appendChild(lmsg);
    ia.appendChild(cmsg); ia.appendChild(pedTxt);
    ia.appendChild(h("div", { class: "vfil" }, colar)); ia.appendChild(resp); ia.appendChild(rmsg);
    /* antes de tudo, a chave de acesso: se essa nota já está na conta, avisa e para aqui (mesmo com a resposta cortada) */
    var vez = 0;
    function tentarResp() {
      var minha = ++vez, ch = /(?:^|\D)(35\d{42})(?!\d)/.exec(resp.value.replace(/(\d)\s+(?=\d)/g, "$1"));
      rmsg.className = "sub";
      if (!resp.value.trim()) { rmsg.textContent = ""; return; }
      if (!ch) { lerEConferir(); return; }
      rmsg.textContent = "Conferindo se a nota já foi lançada…";
      sb.from("notas").select("data,total").eq("chave_nfce", ch[1]).then(ok).then(function (l) {
        if (minha !== vez) return;
        if (l.length) {
          passo2.hidden = true; passo2.innerHTML = "";
          rmsg.innerHTML = "";
          rmsg.appendChild(h("span", { class: "qrwarn", text: "Essa nota já foi lançada" + (l[0].data ? " (compra de " + dataBR(l[0].data) + (l[0].total != null ? ", " + money(+l[0].total) : "") + ")" : "") + ". Não precisa adicionar de novo. " }));
          rmsg.appendChild(h("a", { class: "link", href: "#mercado/notas", text: "Ver em Notas" }));
          return;
        }
        lerEConferir();
      }, function () { if (minha === vez) lerEConferir(); });
    }
    function lerEConferir() {
      var nota = lerResposta(resp.value), cortado = nota && nota.cortado;
      if (!nota || !nota.itens.length) nota = lerTextoLivre(resp.value);
      if (!nota || !nota.itens.length) {
        rmsg.textContent = cortado ? "O código veio cortado, sem os itens. Espere o app terminar de responder (aparece o ícone de copiar embaixo), toque nesse ícone e cole de novo."
          : "Não achei os itens nesse texto. Copie a resposta inteira (ícone de copiar logo abaixo dela) e tente de novo.";
        return;
      }
      rmsg.className = cortado ? "qrwarn" : "sub";
      rmsg.textContent = (cortado ? "⚠ Só " + nota.itens.length + " itens chegaram." : "✓ Resposta lida: " + nota.itens.length + " itens. Confira abaixo e toque em Salvar nota no fim da lista.") +
        (cortado ? " O código veio cortado (copiado antes de o app terminar?), então faltam itens. Espere a resposta terminar, copie pelo ícone e cole de novo." : "") +
        (nota.semQtd ? " A resposta não trouxe quantidade nem preço por kg, então os itens entram como 1 unidade. Para o preço por kg sair certo, use o pedido do botão (ele já vai copiado)." : "");
      conferir(nota);
      passo2.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    resp.addEventListener("paste", function () { setTimeout(tentarResp, 30); });
    resp.addEventListener("input", tentarResp);
    p.appendChild(ia);
    var passo2 = h("div", { class: "qrstep", hidden: "" });
    p.appendChild(passo2);
    body.appendChild(p);

    function conferir(nota) {
      passo2.innerHTML = ""; passo2.hidden = false;
      passo2.appendChild(h("b", { text: "Confira e salve" }));
      var info = h("p", { class: "sub", text: "Carregando seus produtos…" }); passo2.appendChild(info);
      Promise.all([sb.from("mercados").select("id,nome,cnpj").then(ok), sb.from("produtos").select("id,nome,categoria,unidade").order("nome").then(ok),
        nota.chave ? sb.from("notas").select("id").eq("chave_nfce", nota.chave).then(ok) : Promise.resolve([]),
        sb.from("itens").select("descricao,produto_id").then(ok),
        nota.data ? sb.from("notas").select("id,mercado_id,total").eq("data", nota.data).then(ok) : Promise.resolve([])]).then(function (r) {
        var mercs = r[0], prods = r[1], apelidos = {};
        prods.forEach(function (x) { x.categoria = catOf(x.categoria); });
        r[3].forEach(function (x) { if (x.produto_id) apelidos[NU().mkChave(x.descricao)] = x.produto_id; });
        info.textContent = "";
        if (r[2].length) { passo2.appendChild(h("p", { class: "qrwarn", text: "Essa nota já está cadastrada na sua conta." })); return; }
        var cats = listaCats(prods);
        /* mercado: pelo CNPJ guardado, senão pelo nome parecido */
        var merc = mercs.filter(function (m) { return m.cnpj && m.cnpj === nota.cnpj; })[0] ||
          mercs.map(function (m) { return [m, semelhanca(nota.mercado, m.nome)]; }).sort(function (a, b) { return b[1] - a[1]; }).filter(function (x) { return x[1] >= 0.5; }).map(function (x) { return x[0]; })[0] ||
          /* senão, o primeiro nome do mercado aparece em algum lugar do texto colado ("Confiança", "Reinaldo") */
          mercs.filter(function (m) { var w = norm(semCidade(m.nome)).split(" ")[0]; return w.length > 3 && norm(nota.texto || nota.mercado).indexOf(w) >= 0; })[0];
        var selMerc = h("select", { "aria-label": "Mercado" }, mercs.map(function (m) { return h("option", { value: m.id, selected: merc && merc.id === m.id ? "" : null, text: m.nome }); }),
          h("option", { value: "novo", selected: merc ? null : "", text: "Novo mercado" + (nota.mercado ? ": " + nomeBonito(nota.mercado) : "") }));
        var novoNome = h("input", { type: "text", value: nomeBonito(nota.mercado || ""), placeholder: "Nome do mercado", "aria-label": "Nome do novo mercado", hidden: merc ? "" : null });
        selMerc.addEventListener("change", function () { novoNome.hidden = selMerc.value !== "novo"; });
        var dataI = h("input", { type: "date", value: nota.data || new Date().toISOString().slice(0, 10), "aria-label": "Data da compra" });
        var pagoI = h("input", { type: "text", inputmode: "decimal", value: nota.pago ? nota.pago.toFixed(2).replace(".", ",") : "", "aria-label": "Total pago" });
        var descI = h("input", { type: "text", inputmode: "decimal", value: nota.desconto ? nota.desconto.toFixed(2).replace(".", ",") : "", placeholder: "0,00", "aria-label": "Desconto" });
        passo2.appendChild(h("div", { class: "qrhead" },
          h("div", null, h("span", { class: "sub", text: "Mercado" }), selMerc, novoNome),
          h("div", null, h("span", { class: "sub", text: "Data" }), dataI),
          h("div", null, h("span", { class: "sub", text: "Total pago (R$)" }), pagoI),
          h("div", null, h("span", { class: "sub", text: "Desconto da nota (R$)" }), descI)));
        var igual = (r[4] || []).filter(function (n) { return Math.abs(+n.total - nota.pago) < 0.02 && (!merc || n.mercado_id === merc.id); });
        if (igual.length) passo2.appendChild(h("p", { class: "qrwarn", text: "Atenção: já existe uma compra de " + money(nota.pago) + " em " + dataBR(nota.data) + (merc ? " nesse mercado" : "") + ". Se for a mesma, não salve de novo." }));
        var conta = h("p", { role: "status" }); passo2.appendChild(conta);
        var dl = h("datalist", { id: "nf-prods" }, prods.map(function (x) { return h("option", { value: x.nome }); }));
        passo2.appendChild(dl);
        var lista = h("div", { class: "qrlist" }); passo2.appendChild(lista);

        function linha(it) {
          var pid = apelidos[NU().mkChave(it.desc)], prod = pid && prods.filter(function (x) { return x.id === pid; })[0];
          if (!prod && it.desc) {
            var best = prods.filter(function (x) { return x.unidade === it.un || it.un === "un"; }).map(function (x) { return [x, semelhanca(it.desc, x.nome)]; }).sort(function (a, b) { return b[1] - a[1]; })[0];
            if (best && best[1] >= 0.6) prod = best[0];
          }
          var inp = h("input", { type: "text", list: "nf-prods", value: prod ? prod.nome : (it.desc ? nomeBonito(it.desc) : ""), placeholder: "Produto", "aria-label": "Produto" });
          /* produto novo: regras do núcleo; ambíguo não ganha categoria, fica em "Escolher categoria" até o dono decidir */
          var cl = prod ? null : NU().mkClassificar(it.desc || "", it.desc ? nomeBonito(it.desc) : "", { produtos: prods, apelidos: apelidos });
          var cat0 = prod ? prod.categoria : (cl.categoria || "");
          var cat = h("select", { "aria-label": "Categoria" }, [h("option", { value: "", selected: cat0 === "" ? "" : null, text: "Escolher categoria…" })].concat(cats.map(function (c) { return h("option", { value: c, selected: c === cat0 ? "" : null, text: c }); })));
          var qtd = h("input", { type: "text", inputmode: "decimal", class: "nfnum", value: String(it.qtd).replace(".", ","), "aria-label": "Quantidade" });
          var un = h("select", { class: "nfun", "aria-label": "Unidade" }, [["un", "un"], ["kg", "kg"], ["l", "L"]].map(function (u) { return h("option", { value: u[0], selected: u[0] === it.un ? "" : null, text: u[1] }); }));
          var vt = h("input", { type: "text", inputmode: "decimal", class: "nfnum", value: it.vt ? it.vt.toFixed(2).replace(".", ",") : "", placeholder: "0,00", "aria-label": "Valor do item" });
          var tag = h("span", { class: "qrtag" });
          var tira = h("button", { type: "button", class: "ghostbtn nfx", title: "Tirar este item", "aria-label": "Tirar este item", text: "×" });
          function marcar() {
            var p2 = prods.filter(function (x) { return x.nome === inp.value.trim(); })[0];
            tag.textContent = p2 ? "existente" : (cl && cl.revisar && !cat.value ? "novo · revisar" : "novo"); tag.className = "qrtag " + (p2 ? "old" : "new");
            if (p2) { cat.value = p2.categoria; cat.disabled = true; } else cat.disabled = false;
          }
          inp.addEventListener("input", marcar); cat.addEventListener("change", marcar); marcar();
          var row = h("div", { class: "qritem nfitem" + (it.duvida ? " duvida" : "") },
            h("div", { class: "qrdesc" }, h("span", { class: "sub", text: it.desc || "Item adicionado à mão" }),
              h("span", { class: "sub", text: it.duvida ? "Confira: quantidade × preço não bate com o total lido" : fmtQtd(it.qtd, it.un) + " × " + money(it.vu) + (it.descItem ? " · desconto de " + money(it.descItem) : "") })),
            h("div", { class: "qrprod" }, inp, tag), cat,
            h("div", { class: "nfvals" }, qtd, un, h("span", { class: "sub", text: "R$" }), vt, tira));
          var reg = { it: it, inp: inp, sel: cat, qtd: qtd, un: un, vt: vt, row: row };
          tira.onclick = function () { row.remove(); regs.splice(regs.indexOf(reg), 1); somar(); };
          [qtd, vt].forEach(function (x) { x.addEventListener("input", somar); });
          return reg;
        }
        var regs = nota.itens.map(linha);
        regs.forEach(function (g) { lista.appendChild(g.row); });
        var mais = h("button", { type: "button", class: "ghostbtn", text: "+ Adicionar item" });
        mais.onclick = function () { var g = linha({ desc: "", qtd: 1, un: "un", vu: 0, vt: 0 }); regs.push(g); lista.appendChild(g.row); g.inp.focus(); somar(); };
        passo2.appendChild(h("div", { class: "vfil" }, mais));

        function somar() {
          var soma = Math.round(sum(regs, function (g) { return num(g.vt.value); }) * 100) / 100, d = num(descI.value), pago = num(pagoI.value);
          var bate = pago && Math.abs(soma - d - pago) < 0.02;
          conta.className = bate ? "qrok" : "qrwarn";
          conta.textContent = !pago ? "Itens somam " + money(soma) + ". Preencha o total pago para conferir." :
            bate ? "✓ Os " + regs.length + " itens (" + money(soma) + (d ? " − desconto " + money(d) : "") + ") batem com o total pago (" + money(pago) + ")." :
            "Os itens somam " + money(soma - d) + (d ? " já com desconto" : "") + ", mas o total pago é " + money(pago) + ". Diferença de " + money(Math.abs(soma - d - pago)) + ": confira os valores (os itens em amarelo são os mais suspeitos).";
        }
        [pagoI, descI].forEach(function (x) { x.addEventListener("input", somar); });
        passo2.addEventListener("input", function () { if (salvarB.dataset.mesmo) { delete salvarB.dataset.mesmo; salvarB.textContent = "Salvar nota"; st3.textContent = ""; } });
        somar();

        var salvarB = h("button", { type: "button", text: "Salvar nota" }), st3 = h("p", { class: "sub", role: "status" });
        passo2.appendChild(h("div", { class: "qrsave" }, salvarB, st3));
        salvarB.onclick = function () {
          var vazios = regs.filter(function (g) { return !g.inp.value.trim() || !(num(g.vt.value) > 0); });
          if (!regs.length) { st3.textContent = "Não há itens para salvar."; return; }
          if (vazios.length) { st3.textContent = "Preencha o produto e o valor de todos os itens (ou tire com ×)."; vazios[0].inp.focus(); return; }
          var semCat = regs.filter(function (g) { return !g.sel.value; });
          if (semCat.length) { st3.textContent = "Escolha a categoria de " + (semCat.length === 1 ? "1 item marcado" : semCat.length + " itens marcados") + " como “revisar”: o sistema não adivinha o que é ambíguo."; semCat[0].sel.focus(); return; }
          if (!dataI.value) { st3.textContent = "Preencha a data da compra."; dataI.focus(); return; }
          if (selMerc.value === "novo" && !novoNome.value.trim()) { st3.textContent = "Escreva o nome do mercado."; novoNome.focus(); return; }
          /* soma dos itens longe do total pago (quase sempre resposta cortada): pede um segundo toque */
          var somaI = sum(regs, function (g) { return num(g.vt.value); }) - num(descI.value), pagoV = num(pagoI.value);
          if (pagoV && Math.abs(somaI - pagoV) > 0.5 && !salvarB.dataset.mesmo) {
            salvarB.dataset.mesmo = "1"; salvarB.textContent = "Salvar mesmo assim";
            st3.textContent = "Os itens somam " + money(somaI) + " e a nota é de " + money(pagoV) + " (faltam " + money(pagoV - somaI) + "). " +
              (nota.cortado || pagoV > somaI ? "Parece que a resposta veio cortada: espere o app terminar, copie pelo ícone de copiar e cole de novo. " : "") + "Se estiver certo assim, toque de novo para salvar.";
            conta.scrollIntoView({ behavior: "smooth", block: "center" }); return;
          }
          var final = { mercado: selMerc.value === "novo" ? novoNome.value.trim() : "", cnpj: nota.cnpj, endereco: "", data: dataI.value, numero: nota.numero, serie: nota.serie,
            chave: nota.chave, pagamento: nota.pagamento, fonte: "foto", desconto: num(descI.value),
            itens: regs.map(function (g) {
              var q = num(g.qtd.value) || 1, v = Math.round(num(g.vt.value) * 100) / 100;
              var vu = g.it.vu && Math.abs(g.it.vu * q - v) < 0.05 ? g.it.vu : Math.round(v / q * 100) / 100;
              return { desc: g.it.desc || g.inp.value.trim(), qtd: q, un: g.un.value, vt: v, vu: vu, descItem: g.it.descItem || 0, inp: g.inp, sel: g.sel };
            }) };
          final.pago = num(pagoI.value) || Math.round((sum(final.itens, function (x) { return x.vt; }) - final.desconto) * 100) / 100;
          ratearDesconto(final);
          salvarB.disabled = true; st3.textContent = "Salvando…";
          var nomeMerc = selMerc.value === "novo" ? final.mercado : selMerc.options[selMerc.selectedIndex].text;
          var riscados = [];
          salvarNota(final, selMerc.value, prods).then(function () { return riscarDaLista(final.itens).then(function (r) { riscados = r; }, function () { }); })
            .then(function () { return loadRows(true); }).then(function () {
            /* troca o quadro inteiro por uma confirmação clara do que entrou */
            p.innerHTML = "";
            var outra = h("button", { type: "button", class: "ghostbtn", text: "Adicionar outra nota" });
            outra.onclick = function () { drawApp("importar"); };
            p.appendChild(h("div", { class: "qrdone" },
              h("div", { class: "qrcheck", "aria-hidden": "true", text: "✓" }),
              h("h2", { text: "Nota salva" }),
              h("p", { text: semCidade(nomeMerc) + " · " + dataBR(final.data) + " · " + final.itens.length + " itens · " + money(final.pago) }),
              h("p", { class: "sub", text: "Ela já aparece no painel como a última compra e entrou no histórico de preços." }),
              riscados.length ? h("p", { class: "qrok", text: "✓ Riscado da lista de compras: " + riscados.join(", ") + "." }) : null,
              h("div", { class: "vfil" },
                h("a", { class: "ghostbtn pri", href: "#mercado/painel", text: "Ver no painel" }),
                h("a", { class: "ghostbtn", href: "#mercado/notas", text: "Ver notas" }), outra)));
            p.scrollIntoView({ behavior: "smooth", block: "start" });
          }).catch(function (e) { salvarB.disabled = false; st3.textContent = "Não consegui salvar: " + (e.message || e); });
        };
      }).catch(function (e) { info.textContent = "Não consegui carregar seus produtos: " + e.message; });
    }
  }

  /* "Apagar esta nota" (pede confirmação), no detalhe da compra no painel e em Notas */
  function botaoApagar(linhas, depois) {
    var apagar = h("button", { type: "button", class: "ghostbtn", text: "Apagar esta nota" }), sta = h("span", { class: "sub", role: "status" });
    apagar.onclick = function () {
      if (!confirm("Apagar a nota de " + money(sum(linhas, function (x) { return x.valor_total; })) + " do " + semCidade(linhas[0].mercado) + " em " + dataBR(linhas[0].data) + "? Os " + linhas.length + " itens saem das contas.")) return;
      apagar.disabled = true; sta.textContent = "Apagando…";
      apagarNota(linhas).then(function () { return loadRows(true); }).then(depois, function (e) { apagar.disabled = false; sta.textContent = "Não consegui apagar (" + e.message + ")."; });
    };
    return h("div", { class: "vfil" }, apagar, sta);
  }
  function apagarNota(linhas) {
    return sb.from("itens").select("nota_id").in("id", linhas.map(function (x) { return x.id; })).then(ok).then(function (l) {
      var ids = Object.keys(groupBy(l, function (x) { return x.nota_id; }));
      if (!ids.length) throw new Error("nota não encontrada");
      return sb.from("itens").delete().in("nota_id", ids).then(ok).then(function () { return sb.from("notas").delete().in("id", ids).then(ok); });
    });
  }

  /* o que estava na lista de compras e apareceu nesta nota vai para "no carrinho" (marcado) */
  function riscarDaLista(itens) {
    var N = window.RACnucleo;
    if (!N || !N.itemBate) return Promise.resolve([]);
    return sb.from("lista").select("id,item").eq("tipo", "compra").eq("feito", false).then(ok).then(function (l) {
      var bate = l.filter(function (x) { return itens.some(function (it) { return N.itemBate(x.item, (it.prodNome || "") + " " + (it.desc || "")); }); });
      if (!bate.length) return [];
      return sb.from("lista").update({ feito: true, feito_em: new Date().toISOString() }).in("id", bate.map(function (x) { return x.id; })).then(ok)
        .then(function () { return bate.map(function (x) { return x.item; }); });
    });
  }

  function salvarNota(nota, mercadoId, prods) {
    var porNome = {}; prods.forEach(function (x) { porNome[x.nome] = x; });
    var p = Promise.resolve(mercadoId);
    if (mercadoId === "novo") p = sb.from("mercados").insert({ nome: nota.mercado, cnpj: nota.cnpj || null, cidade: (/,\s*([^,]+?)\s*,\s*([A-Z]{2})\s*$/.exec(nota.endereco) || []).slice(1).join("/") || null }).select("id").single().then(ok).then(function (m) { return m.id; });
    else if (nota.cnpj) p = sb.from("mercados").update({ cnpj: nota.cnpj }).eq("id", mercadoId).is("cnpj", null).then(function () { return mercadoId; });
    var novos = {};
    nota.itens.forEach(function (it) { var n = it.inp.value.trim() || nomeBonito(it.desc); it.prodNome = n; if (!porNome[n] && !novos[n]) novos[n] = { nome: n, categoria: it.sel.value, unidade: it.un }; });
    return p.then(function (mid) {
      mercadoId = mid;
      var lista = Object.values(novos);
      return lista.length ? sb.from("produtos").insert(lista).select("id,nome,categoria,unidade").then(ok).then(function (d) { d.forEach(function (x) { porNome[x.nome] = x; }); }) : null;
    }).then(function () {
      return sb.from("notas").insert({ mercado_id: mercadoId, data: nota.data, numero: nota.numero || null, serie: nota.serie || null, chave_nfce: nota.chave || null,
        forma_pagamento: nota.pagamento || null, total: nota.pago, fonte: nota.fonte, observacao: nota.desconto ? "Desconto de " + money(nota.desconto) + " na nota" : null }).select("id").single().then(ok);
    }).then(function (n) {
      return sb.from("itens").insert(nota.itens.map(function (it) {
        var pr = porNome[it.prodNome];
        return { nota_id: n.id, produto_id: pr ? pr.id : null, descricao: it.desc, categoria: pr ? pr.categoria : it.sel.value, quantidade: it.qtd, unidade: it.un,
          valor_unitario: it.vu, valor_total: Math.round((it.vt - (it.desc_rateio || 0)) * 100) / 100, desconto: it.desc_rateio || 0,
          observacao: it.desc_rateio ? (it.descItem ? "Desconto no item: " : "Desconto da nota rateado: ") + money(it.desc_rateio) : null };
      })).then(ok);
    });
  }

  /* ---------- Importar o Excel (aba "Compras") ---------- */
  function viewImportar(body) {
    painelFoto(body);
    var p = panel("Importar planilha", "Use o seu controle_mercado.xlsx. Só a aba “Compras” é lida; notas que já estão na conta são puladas, então pode importar de novo sem duplicar.");
    var lab = h("label", { class: "filebtn", for: "mk-file", text: "Escolher o arquivo .xlsx" });
    var inp = h("input", { type: "file", id: "mk-file", accept: ".xlsx,.xls", hidden: "" });
    var out = h("div", { class: "mkimp" });
    p.appendChild(h("div", { class: "vfil" }, lab, inp));
    p.appendChild(out);
    body.appendChild(p);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      out.innerHTML = ""; out.appendChild(h("p", { class: "sub", text: "Lendo " + f.name + "…" }));
      loadScript(XLSX_JS).then(function () { return f.arrayBuffer(); }).then(function (buf) {
        var wb = window.XLSX.read(buf, { type: "array", cellDates: true });
        var ws = wb.Sheets["Compras"] || wb.Sheets[wb.SheetNames[0]];
        var linhas = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        return planejar(linhas);
      }).then(function (plano) { mostrarPlano(out, plano); inp.value = ""; })
        .catch(function (e) { out.innerHTML = ""; out.appendChild(h("p", { class: "sub", text: "Não consegui ler a planilha: " + (e.message || e) })); inp.value = ""; });
    });
  }
  function isoData(v) {
    if (v instanceof Date) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || "").trim());
    return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null;
  }
  function num(v) { if (typeof v === "number") return v; var s = String(v || "").replace(/[R$\s]/g, ""); if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); return parseFloat(s) || 0; }
  function descontoDe(obs) {
    var t = String(obs || ""), m = /\(R\$\s?([\d.,]+)\s*total\)/i.exec(t) || /Desconto de R\$\s?([\d.,]+)/i.exec(t);
    return m ? num(m[1]) : 0;
  }
  /* Lê as linhas, agrupa por nota e descobre o que ainda não existe na conta */
  function planejar(linhas) {
    var head = (linhas[0] || []).map(function (x) { return norm(x).trim(); });
    function col(re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; }
    var C = { data: col(/^data$/), merc: col(/^mercado/), nf: col(/nota/), cat: col(/^categoria/), item: col(/^item|descri/), qtd: col(/^quantidade|^qtd/), un: col(/^unidade|^unid/), vu: col(/unit/), vt: col(/total/), pag: col(/pagamento/), obs: col(/observ|^obs/) };
    if (C.data < 0 || C.merc < 0 || C.item < 0 || C.vt < 0) throw new Error("não achei as colunas Data, Mercado, Item e Valor Total");
    var itens = [];
    linhas.slice(1).forEach(function (r) {
      var d = isoData(r[C.data]); if (!d || !r[C.item]) return;
      var u = String(r[C.un] || "un").toLowerCase().trim(); if (u !== "kg" && u !== "l") u = "un";
      itens.push({ data: d, mercado: String(r[C.merc]).trim(), nf: r[C.nf] != null ? String(r[C.nf]).trim() : null, categoria: catOf(String(r[C.cat] || "Outros").trim()),
        item: String(r[C.item]).trim(), qtd: num(r[C.qtd]) || 1, un: u, vu: num(r[C.vu]), vt: num(r[C.vt]), pag: r[C.pag] ? String(r[C.pag]).trim() : null, obs: r[C.obs] ? String(r[C.obs]).trim() : null });
    });
    var notas = Object.values(groupBy(itens, function (x) { return x.data + "|" + x.mercado + "|" + (x.nf || ""); }));
    return Promise.all([sb.from("mercados").select("id,nome"), sb.from("notas").select("id,mercado_id,numero,data")]).then(function (r) {
      if (r[0].error) throw new Error(r[0].error.message); if (r[1].error) throw new Error(r[1].error.message);
      var mercs = {}; r[0].data.forEach(function (m) { mercs[m.nome] = m.id; });
      var existe = {}; r[1].data.forEach(function (n) { existe[n.mercado_id + "|" + (n.numero || "") + "|" + n.data] = 1; });
      var novas = notas.filter(function (l) { var id = mercs[l[0].mercado]; return !id || !existe[id + "|" + (l[0].nf || "") + "|" + l[0].data]; });
      return { itens: itens, notas: notas, novas: novas, mercs: mercs };
    });
  }
  function mostrarPlano(out, plano) {
    out.innerHTML = "";
    var nItens = sum(plano.novas, function (l) { return l.length; }), total = sum(plano.novas, function (l) { return sum(l, function (x) { return x.vt; }); });
    out.appendChild(h("p", null, h("b", { text: plano.notas.length + " notas " }), "na planilha (" + plano.itens.length + " itens). ",
      plano.novas.length ? h("b", { text: plano.novas.length + " novas" }) : "Nenhuma nova", plano.novas.length ? " para importar: " + nItens + " itens, " + money(total) + "." : ": tudo já está na sua conta."));
    if (!plano.novas.length) return;
    var b = h("button", { type: "button", text: "Importar " + plano.novas.length + " notas" });
    var st2 = h("p", { class: "sub", role: "status" });
    b.onclick = function () {
      b.disabled = true; st2.textContent = "Importando…";
      importar(plano, function (t) { st2.textContent = t; }).then(function (n) {
        st2.textContent = "Pronto: " + n + " notas importadas."; return loadRows(true);
      }).then(function () { setTimeout(function () { location.hash = "#mercado/painel"; }, 900); })
        .catch(function (e) { b.disabled = false; st2.textContent = "Parou com erro: " + (e.message || e) + ". O que já entrou fica salvo; pode tentar de novo que ele pula o que já existe."; });
    };
    out.appendChild(b); out.appendChild(st2);
  }
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function ok(r) { if (r.error) throw new Error(r.error.message); return r.data; }
  function importar(plano, status) {
    var novasMercs = Object.keys(groupBy(plano.novas.map(function (l) { return l[0]; }), function (x) { return x.mercado; })).filter(function (m) { return !plano.mercs[m]; });
    var p = Promise.resolve();
    if (novasMercs.length) p = p.then(function () {
      status("Cadastrando mercados…");
      return sb.from("mercados").insert(novasMercs.map(function (m) { var c = /\(([^)]+)\)\s*$/.exec(m); return { nome: m, cidade: c ? c[1] : null }; })).select("id,nome").then(ok)
        .then(function (d) { d.forEach(function (m) { plano.mercs[m.nome] = m.id; }); });
    });
    var prods = {};
    p = p.then(function () { return sb.from("produtos").select("id,nome").then(ok); }).then(function (d) {
      d.forEach(function (x) { prods[x.nome] = x.id; });
      var faltam = {}; plano.novas.forEach(function (l) { l.forEach(function (x) { if (!prods[x.item] && !faltam[x.item]) faltam[x.item] = { nome: x.item, categoria: x.categoria, unidade: x.un }; }); });
      var lista = Object.values(faltam);
      status("Cadastrando " + lista.length + " produtos…");
      return chunks(lista, 400).reduce(function (q, c) { return q.then(function () { return sb.from("produtos").insert(c).select("id,nome").then(ok).then(function (d2) { d2.forEach(function (x) { prods[x.nome] = x.id; }); }); }); }, Promise.resolve());
    });
    var feitas = 0;
    plano.novas.forEach(function (l) {
      p = p.then(function () {
        var f = l[0];
        status("Importando nota " + (feitas + 1) + " de " + plano.novas.length + "…");
        return sb.from("notas").insert({ mercado_id: plano.mercs[f.mercado], data: f.data, numero: f.nf, forma_pagamento: f.pag, total: Math.round(sum(l, function (x) { return x.vt; }) * 100) / 100, fonte: "excel" }).select("id").single().then(ok)
          .then(function (n) {
            return sb.from("itens").insert(l.map(function (x) { return { nota_id: n.id, produto_id: prods[x.item] || null, descricao: x.item, categoria: x.categoria, quantidade: x.qtd, unidade: x.un, valor_unitario: x.vu, valor_total: x.vt, desconto: descontoDe(x.obs), observacao: x.obs }; })).then(ok);
          }).then(function () { feitas++; });
      });
    });
    return p.then(function () { return feitas; });
  }

  function svgCart() {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>';
    return s;
  }

  /* Resumo para a tela inicial: gasto e compras do mês atual e a última compra */
  function resumo() {
    return client().then(function () { return loadRows(); }).then(function (l) {
      var mk = new Date().toISOString().slice(0, 7), doMes = l.filter(function (x) { return x.mk === mk; });
      var notas = groupBy(l, function (x) { return x.nota; }), ult = Object.values(notas).sort(function (a, b) { return b[0].data.localeCompare(a[0].data); })[0];
      return { mes: mesNome(mk), total: sum(doMes, function (x) { return x.valor_total; }), compras: Object.keys(groupBy(doMes, function (x) { return x.nota; })).length,
        ultima: ult ? { mercado: String(ult[0].mercado).replace(/\s*\(.*\)$/, ""), data: dataBR(ult[0].data), total: sum(ult, function (x) { return x.valor_total; }), itens: ult.length } : null };
    });
  }
  /* O login do Mercado é o login do site todo: a página inteira usa este mesmo cliente */
  /* abre o histórico de preço de um produto (usado pelos Gastos da Olivia) */
  function verProduto(nome) { st.prod = nome; st.q = ""; st.voltar = false; st.voltarY = null; location.hash = "#mercado/precos"; }
  window.RACmercado = { url: SB_URL, chave: SB_KEY, render: render, client: client, resumo: resumo, money: money, grafico: graficoLinha, verProduto: verProduto,
    /* só para os testes automáticos (tests/): leitura da resposta da nota pela foto */
    _teste: { st: st, hoje: function (v) { hojeFixo = v; }, viewPainel: viewPainel, viewAlertas: viewAlertas, viewComparar: viewComparar, viewPrecos: viewPrecos, usar: function (r, u) { rows = r; if (u) user = u; }, viewConsumo: viewConsumo, salvar: function (f) { var a = salvarArquivo; if (f) salvarArquivo = f; return a; }, nomeBonito: nomeBonito, listaCats: listaCats, jsonTolerante: jsonTolerante, lerResposta: lerResposta, lerTextoLivre: lerTextoLivre } };
})();
