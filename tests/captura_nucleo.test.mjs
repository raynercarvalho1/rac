// Lote 4 do novo RAC · Captura universal e Biblioteca básica: as regras PURAS do núcleo (NUCLEO.cp*, bib*; nucleo.js). Sem tela, sem banco, sem rede.
// Cobre: a classificação determinística em português (link, compra, data e hora, #projeto, nota fiscal, o resto), o que ela NUNCA faz (executar), a prioridade e as alternativas, o tipo escolhido pela pessoa,
// a validação de arquivo e de caminho, o item da Captura, o plano de cada encaminhamento (ids novos, edição antes de confirmar), a fila com erro retido e a Biblioteca (forma por tipo, referência, filtros, legado).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const HOJE = "2026-11-28";   // sábado
const cl = (texto, extra = {}) => N.cpClassificar({ texto, hoje: HOJE, ...extra });
const dest = (texto, extra) => { const s = cl(texto, extra).sugestao; return s.destino + (s.dados.tipo ? ":" + s.dados.tipo : ""); };
const ESP = "aaaaaaaa-0000-4000-8000-000000000001", USR = "bbbbbbbb-0000-4000-8000-000000000002", ID = "cccccccc-0000-4000-8000-000000000003";

test("links: URL vira link da Biblioteca (com ou sem http, com pontuação no fim); #fragmento de URL não é projeto", () => {
  assert.equal(dest("https://exemplo.com.br/artigo"), "biblioteca:link");
  assert.equal(dest("veja isso www.exemplo.com.br/a, depois"), "biblioteca:link");
  assert.deepEqual(N.cpUrls("a https://x.com/a?b=1). e www.y.org/z!"), ["https://x.com/a?b=1", "https://www.y.org/z"]);
  assert.deepEqual(N.cpUrls("sem endereço aqui, só texto.com"), []);
  assert.deepEqual(N.cpProjetos("https://x.com/pagina#secao e #reforma"), ["reforma"], "o # dentro da URL não conta");
  const c = cl("Artigo ótimo https://exemplo.com/a"); assert.equal(c.sugestao.dados.url, "https://exemplo.com/a"); assert.equal(c.sugestao.dados.titulo, "Artigo ótimo"); assert.equal(c.tipo, "link");
  assert.equal(N.cpTipoAuto("https://exemplo.com/a", []), "link");
});

test("compras: verbo de compra ou lista de quantidades vai para a Lista; frase comum não", () => {
  for (const t of ["comprar leite, pão e café", "Preciso comprar detergente", "falta café", "acabou o arroz", "2 leite", "3 kg arroz; 1 dúzia de ovos", "2 leite, 1,5 kg de carne\n6 ovos"]) assert.equal(dest(t), "lista:compra", t);
  assert.deepEqual(N.cpCompra("comprar leite, pão e café").itens, ["leite", "pão", "café"]);
  assert.deepEqual(N.cpCompra("2 leite, 1,5 kg de carne").itens, ["2 leite", "1,5 kg de carne"], "vírgula decimal não separa itens");
  for (const t of ["Reunião com o Paulo", "Anotar que o Eddie dormiu bem", "3 reuniões amanhã", "comprar"]) assert.notEqual(dest(t), "lista:compra", t);
  assert.equal(cl("comprar leite").sugestao.rotulo, "Adicionar à lista de compras (1 item)");
  /* a Lista aceita no máximo 200 letras por item e 25 itens por vez */
  assert.equal(N.cpCompra(Array.from({ length: 30 }, (_, i) => "item " + i).join(", ")), null);
});

test("datas e horários em português viram SUGESTÃO de lembrete (hoje = sábado 28/11/2026)", () => {
  const d = (t) => N.cpData(t, HOJE);
  assert.deepEqual(d("pagar o IPVA dia 15"), { data: "2026-12-15", hora: null }, "dia 15 já passou neste mês: o próximo");
  assert.deepEqual(d("ligar dia 30"), { data: "2026-11-30", hora: null });
  assert.deepEqual(d("reunião amanhã às 14h30"), { data: "2026-11-29", hora: "14:30" });
  assert.deepEqual(d("dentista depois de amanhã 9:00"), { data: "2026-11-30", hora: "09:00" });
  assert.deepEqual(d("15/12 dentista"), { data: "2026-12-15", hora: null }); assert.deepEqual(d("10/01"), { data: "2027-01-10", hora: null }, "sem ano e já passou: ano que vem");
  assert.deepEqual(d("vence 05/03/2027"), { data: "2027-03-05", hora: null }); assert.deepEqual(d("31/02"), null, "data que não existe");
  assert.deepEqual(d("viagem 3 de janeiro"), { data: "2027-01-03", hora: null }); assert.deepEqual(d("prova em 3 dias"), { data: "2026-12-01", hora: null });
  assert.deepEqual(d("ligar para o João sexta"), { data: "2026-12-04", hora: null }); assert.deepEqual(d("reunião sábado"), { data: "2026-12-05", hora: null }, "o mesmo dia da semana: o da semana que vem");
  assert.deepEqual(d("semana que vem"), { data: "2026-12-05", hora: null }); assert.deepEqual(d("fazer hoje"), { data: HOJE, hora: null });
  assert.deepEqual(d("ligar às 14h"), { data: HOJE, hora: "14:00" }, "só hora: hoje");
  assert.equal(d("pedir segunda via do boleto"), null, "'segunda via' não é segunda-feira"); assert.equal(d("anotar a ideia do site"), null);
  assert.equal(dest("Reunião amanhã às 14h30"), "lembrete"); const l = cl("Reunião amanhã às 14h30").sugestao; assert.equal(l.rotulo, "Criar lembrete para 29/11 às 14:30"); assert.equal(l.dados.data, "2026-11-29");
  assert.equal(N.cpData("amanhã", "lixo"), null, "sem a data de hoje não adivinha");
});

test("#projeto, nota fiscal e o resto; prioridade (nota fiscal > link > compra > data > projeto > anexo > nota) e alternativas", () => {
  const p = cl("Pintar a sala #reforma"); assert.equal(p.sugestao.destino, "projeto"); assert.equal(p.sugestao.dados.tag, "reforma"); assert.match(p.sugestao.rotulo, /«reforma»/);
  assert.deepEqual(N.cpProjetos("#Reforma-2026 e #reforma-2026 e #x"), ["reforma-2026"], "minúsculas, sem repetir, mínimo 2 letras");
  assert.equal(dest("Nota fiscal do mercado"), "fiscal"); assert.equal(dest("chave 3526 1112 3456 7890 1234 5678 9012 3456 7890 1234 5678"), "fiscal"); assert.equal(dest("cupom fiscal da padaria"), "fiscal");
  assert.equal(dest("", { anexos: [{ nome: "cupom-fiscal.jpg", tipo: "image/jpeg" }] }), "fiscal", "foto cujo nome diz que é cupom");
  assert.equal(dest("", { anexos: [{ nome: "IMG_2041.jpg", tipo: "image/jpeg" }] }), "biblioteca:arquivo", "foto sem pista: Biblioteca (sem OCR)");
  assert.equal(cl("", { anexos: [{ nome: "IMG_2041.jpg", tipo: "image/jpeg" }] }).tipo, "foto"); assert.equal(cl("", { anexos: [{ nome: "contrato.pdf", tipo: "application/pdf" }] }).tipo, "arquivo");
  assert.equal(dest("Anotar que o Eddie dormiu bem"), "biblioteca:nota"); assert.equal(dest("segunda via do boleto"), "biblioteca:nota");
  /* conflitos: a primeira regra vence e as outras viram alternativas (a pessoa decide) */
  const c = cl("comprar presente dia 20 #natal"); assert.equal(c.sugestao.destino, "lista"); assert.deepEqual(c.alternativas.map((a) => a.destino).sort(), ["biblioteca", "lembrete", "projeto"]);
  const k = cl("https://x.com/a comprar leite"); assert.equal(k.sugestao.destino, "biblioteca", "URL antes de compra"); assert.ok(k.alternativas.some((a) => a.destino === "lista"));
  for (const t of ["comprar leite", "pagar luz dia 10", "oi", "https://a.com"]) assert.ok(cl(t).alternativas.concat(cl(t).sugestao).some((a) => a.destino === "biblioteca"), "a Biblioteca está sempre à mão: " + t);
});

test("a classificação SÓ sugere: devolve dados, nunca um efeito; e o tipo escolhido pela pessoa manda", () => {
  const c = cl("comprar leite"); assert.deepEqual(Object.keys(c).sort(), ["alternativas", "sugestao", "tipo"]); assert.equal(typeof c.sugestao.rotulo, "string");
  assert.ok(Object.values(c.sugestao).every((v) => typeof v !== "function"), "nada executável na sugestão");
  assert.equal(dest("trocar a lâmpada", { tipo: "tarefa" }), "lista:tarefa"); assert.deepEqual(cl("trocar a lâmpada; limpar o filtro", { tipo: "tarefa" }).sugestao.dados.itens, ["trocar a lâmpada", "limpar o filtro"]);
  const i = cl("app de receitas", { tipo: "ideia" }); assert.equal(i.sugestao.dados.tipo, "nota"); assert.deepEqual(i.sugestao.dados.etiquetas, ["ideia"]);
  assert.equal(dest("https://a.com/x", { tipo: "referencia" }), "biblioteca:referencia"); assert.equal(dest("fala do Rayner", { tipo: "observacao" }), "biblioteca:nota");
  assert.equal(cl("comprar leite", { tipo: "texto" }).sugestao.destino, "lista", "'texto' é o automático");
  assert.equal(cl("x", { tipo: "inventado" }).tipo, "texto", "tipo desconhecido vira automático");
});

test("arquivo e caminho: formato, tamanho e nome seguro; caminho espaço/autor/pasta/arquivo", () => {
  assert.equal(N.cpArquivoOk({ nome: "a.jpg", tipo: "image/jpeg", tamanho: 1000 }).ok, true); assert.equal(N.cpArquivoOk({ nome: "IMG", tipo: "", tamanho: 10 }).ok, false, "sem tipo nem extensão");
  assert.equal(N.cpArquivoOk({ nome: "a.heic", tipo: "", tamanho: 10 }).mime, "image/heic", "iPhone sem tipo: vale a extensão");
  assert.equal(N.cpArquivoOk({ nome: "x.pdf", tipo: "application/pdf", tamanho: 52428801 }).ok, false, "passa de 50 MB"); assert.equal(N.cpArquivoOk({ nome: "x.pdf", tipo: "application/pdf", tamanho: 52428800 }).ok, true);
  assert.equal(N.cpArquivoOk({ nome: "x.pdf", tipo: "application/pdf", tamanho: 0 }).ok, false, "vazio");
  for (const ruim of [["a.svg", "image/svg+xml"], ["a.html", "text/html"], ["a.exe", "application/x-msdownload"], ["a.js", "text/javascript"]]) assert.equal(N.cpArquivoOk({ nome: ruim[0], tipo: ruim[1], tamanho: 10 }).ok, false, ruim[0]);
  assert.equal(N.cpNomeSeguro("Relatório Final (v2).PDF"), "relatorio-final-v2.pdf"); assert.equal(N.cpNomeSeguro("../../etc/passwd"), "etc-passwd"); assert.equal(N.cpNomeSeguro("???"), "arquivo");
  assert.equal(N.cpCaminho(ESP, USR, ID, "Foto Nota.JPG"), `${ESP}/${USR}/${ID}/foto-nota.jpg`); assert.equal(N.cpCaminho("x", USR, ID, "a.jpg"), null, "espaço inválido");
});

test("o item da Captura: id gerado no aparelho, estado pendente, sugestão guardada, validação igual à do banco", () => {
  const a = { path: `${ESP}/${USR}/${ID}/a.jpg`, nome: "a.jpg", tipo: "image/jpeg", tamanho: 1234 };
  const it = N.cpItem({ id: ID, espaco: ESP, usuario: USR, texto: "  comprar leite  ", anexos: [a], hoje: HOJE, origem: "compartilhar" });
  assert.equal(it.id, ID); assert.equal(it.estado, "pendente"); assert.equal(it.conteudo, "comprar leite"); assert.equal(it.origem, "compartilhar"); assert.equal(it.tipo, "foto"); assert.equal(it.sugestao.destino, "lista");
  assert.deepEqual(Object.keys(it.anexos[0]).sort(), ["nome", "path", "tamanho", "tipo"]); assert.equal(N.cpValidar(it).ok, true);
  assert.equal(N.cpItem({ id: ID, espaco: ESP, usuario: USR, texto: "x", origem: "xyz", hoje: HOJE }).origem, "app", "origem desconhecida volta para 'app'");
  const ruim = (mud) => N.cpValidar({ ...it, ...mud });
  assert.equal(ruim({ conteudo: "", anexos: [] }).ok, false, "sem conteúdo nem anexo"); assert.equal(ruim({ conteudo: "", anexos: [a] }).ok, true, "só anexo basta");
  assert.equal(ruim({ id: "123" }).ok, false); assert.equal(ruim({ tipo: "poema" }).ok, false); assert.equal(ruim({ conteudo: "x".repeat(20001) }).ok, false);
  assert.equal(ruim({ anexos: [{ ...a, path: `${USR}/x/${ID}/a.jpg` }] }).ok, false, "anexo fora da pasta do espaço"); assert.equal(ruim({ anexos: [{ ...a, path: `${ESP}/../a.jpg` }] }).ok, false);
});

test("a caixa: ordem (mais novo primeiro), contagem e o lembrete suave de 3 dias; a fila do aparelho com erro retido (3 tentativas, depois só manualmente)", () => {
  const agora = Date.parse("2026-11-28T12:00:00Z");
  const itens = [{ id: "a", estado: "pendente", criado_em: "2026-11-27T12:00:00Z" }, { id: "b", estado: "pendente", criado_em: "2026-11-20T12:00:00Z" }, { id: "c", estado: "classificado", criado_em: "2026-11-01T12:00:00Z" }, { id: "d", estado: "descartado", criado_em: "2026-11-28T11:00:00Z" }];
  assert.deepEqual(N.cpOrdenar(itens).map((i) => i.id), ["d", "a", "b", "c"]);
  assert.deepEqual(N.cpContar(itens, agora), { pendente: 2, classificado: 1, arquivado: 0, descartado: 1, antigos: 1 }, "só o pendente com mais de 3 dias é 'antigo'");
  const op = { t: "captura_itens", acao: "upsert", dados: { id: ID, tipo: "texto", conteudo: "x" }, reter: true, quando: 5 };
  assert.deepEqual(N.cpFilaItens([op, { t: "lista", acao: "insert", dados: [] }, { t: "captura_itens", acao: "update", id: ID, dados: {} }]).map((f) => f.id), [ID], "só os envios de itens novos aparecem como 'aguardando'");
  let o = op; for (let i = 1; i <= 3; i++) { o = N.cpErroFila(o, "check violation " + i); assert.equal(o.tent, i); assert.equal(o.parada, i >= N.CP_TENTATIVAS); }
  assert.equal(o.erro, "check violation 3"); assert.equal(N.cpFilaItens([o])[0].parada, true); assert.equal(o.dados.id, ID, "o dado é retido inteiro: nada se perde");
});

test("o plano de encaminhar: Lista, Lembrete, Biblioteca e Projeto criam registros com ids novos e destino; Fiscal só abre a tela; entrada ruim é recusada com a razão", () => {
  let n = 0; const novoId = () => "id-" + ++n;
  const it = N.cpItem({ id: ID, espaco: ESP, usuario: USR, texto: "comprar leite, pão", hoje: HOJE });
  const lista = N.cpPlano(it, { destino: "lista", dados: { tipo: "compra", itens: ["leite", " pão ", ""] } }, novoId);
  assert.equal(lista.ok, true); assert.deepEqual(lista.lista.linhas, [{ id: "id-1", tipo: "compra", item: "leite" }, { id: "id-2", tipo: "compra", item: "pão" }]); assert.deepEqual(lista.destino, { modulo: "lista", tipo: "compra", ids: ["id-1", "id-2"] });
  assert.equal(N.cpPlano(it, { destino: "lista", dados: { itens: [] } }, novoId).ok, false); assert.equal(N.cpPlano(it, { destino: "lista", dados: { itens: Array(26).fill("x") } }, novoId).ok, false);
  assert.equal(N.cpPlano(it, { destino: "lista", dados: { tipo: "tarefa", itens: ["x"] } }, novoId).lista.linhas[0].tipo, "tarefa");
  const lem = N.cpPlano(it, { destino: "lembrete", dados: { titulo: "Pagar luz", data: "2026-12-10", hora: "09:00" } }, novoId);
  assert.equal(lem.ok, true); assert.equal(lem.lembrete.t, "Pagar luz às 09:00"); assert.equal(lem.lembrete.data, "2026-12-10"); assert.equal(lem.destino.modulo, "lembretes"); assert.equal(lem.destino.id, lem.lembrete.id);
  assert.equal(N.cpPlano(it, { destino: "lembrete", dados: { titulo: "", data: "2026-12-10" } }, novoId).ok, false); assert.equal(N.cpPlano(it, { destino: "lembrete", dados: { titulo: "x", data: "2026-02-30" } }, novoId).ok, false);
  /* Biblioteca: a linha usa o MESMO id da captura (um item por captura; reenviar não duplica) */
  const nota = N.cpPlano(it, { destino: "biblioteca", dados: { tipo: "nota", titulo: "Compras", etiquetas: "casa, #mercado" } }, novoId);
  assert.equal(nota.ok, true); assert.equal(nota.biblioteca.id, ID); assert.equal(nota.biblioteca.captura_id, ID); assert.equal(nota.biblioteca.origem, "captura"); assert.equal(nota.biblioteca.texto, "comprar leite, pão"); assert.deepEqual(nota.biblioteca.etiquetas, ["casa", "mercado"]);
  assert.deepEqual(nota.destino, { modulo: "biblioteca", id: ID, tipo: "nota" });
  const proj = N.cpPlano(it, { destino: "projeto", dados: { tag: "reforma", titulo: "Tinta" } }, novoId); assert.equal(proj.ok, true); assert.deepEqual(proj.biblioteca.etiquetas, ["reforma"]); assert.equal(proj.biblioteca.tipo, "nota");
  assert.deepEqual(N.cpPlano(it, { destino: "fiscal" }, novoId).fiscal, { rota: "#fiscal" }); assert.equal(N.cpPlano(it, { destino: "banana" }, novoId).ok, false);
  /* link e arquivo */
  const lk = N.cpItem({ id: ID, espaco: ESP, usuario: USR, texto: "Ótimo https://exemplo.com/a", hoje: HOJE }), pl = N.cpPlano(lk, { destino: "biblioteca", dados: { tipo: "link", titulo: "Ótimo", url: "https://exemplo.com/a" } }, novoId);
  assert.equal(pl.ok, true); assert.equal(pl.biblioteca.url, "https://exemplo.com/a"); assert.equal(N.cpPlano(lk, { destino: "biblioteca", dados: { tipo: "link", titulo: "x", url: "ftp://a" } }, novoId).ok, false);
  const a = { path: `${ESP}/${USR}/${ID}/a.jpg`, nome: "a.jpg", tipo: "image/jpeg", tamanho: 9 }, ft = N.cpItem({ id: ID, espaco: ESP, usuario: USR, texto: "", anexos: [a], hoje: HOJE }), pa = N.cpPlano(ft, { destino: "biblioteca", dados: { tipo: "arquivo", titulo: "Foto da sala" } }, novoId);
  assert.equal(pa.ok, true); assert.deepEqual(pa.biblioteca.ref, { tabela: "storage", bucket: "captura", path: a.path, nome: "a.jpg", mime: "image/jpeg", tamanho: 9 }, "aponta para o arquivo do cofre: não copia"); assert.equal(pa.biblioteca.texto, null);
});

test("Biblioteca: forma por tipo, referência só do próprio espaço, abrir, filtros em português (sem acento), etiquetas e os links antigos (legado) sem migração", () => {
  const base = { id: ID, espaco_id: ESP, titulo: "T", origem: "manual", etiquetas: [] };
  const ok = (m) => N.bibValidar({ ...base, ...m }).ok;
  assert.equal(ok({ tipo: "link", url: "https://a.com" }), true); assert.equal(ok({ tipo: "link" }), false); assert.equal(ok({ tipo: "link", url: "javascript:x" }), false); assert.equal(ok({ tipo: "nota", texto: "oi" }), true); assert.equal(ok({ tipo: "nota", texto: "  " }), false);
  assert.equal(ok({ tipo: "arquivo" }), false); assert.equal(ok({ tipo: "arquivo", ref: { tabela: "storage", bucket: "captura", path: `${ESP}/${USR}/${ID}/a.pdf` } }), true);
  assert.equal(ok({ tipo: "arquivo", ref: { tabela: "storage", bucket: "captura", path: `${USR}/${USR}/${ID}/a.pdf` } }), false, "arquivo de outro espaço");
  assert.equal(ok({ tipo: "documento", ref: { tabela: "registros", bucket: "familia", path: "a/b.pdf", rota: "#olivia" } }), true); assert.equal(ok({ tipo: "documento", ref: { tabela: "usuarios" } }), false); assert.equal(ok({ tipo: "documento", ref: { tabela: "registros", bucket: "backups", path: "x" } }), false);
  assert.equal(ok({ tipo: "referencia" }), true); assert.equal(ok({ tipo: "nota", texto: "x", titulo: " " }), false); assert.equal(ok({ tipo: "nota", texto: "x", titulo: "a".repeat(201) }), false); assert.equal(ok({ tipo: "nota", texto: "x", etiquetas: Array(13).fill("a") }), false);
  assert.deepEqual(N.bibAbrir({ tipo: "link", url: "https://a.com" }), { modo: "url", url: "https://a.com" }); assert.deepEqual(N.bibAbrir({ tipo: "arquivo", titulo: "F", ref: { bucket: "captura", path: "p", nome: "n" } }), { modo: "arquivo", bucket: "captura", path: "p", nome: "n" });
  assert.deepEqual(N.bibAbrir({ tipo: "documento", ref: { rota: "#fiscal" } }), { modo: "rota", rota: "#fiscal" }); assert.deepEqual(N.bibAbrir({ tipo: "nota", texto: "x" }), { modo: "texto" });
  const itens = [{ id: "1", tipo: "link", titulo: "Receita de pão de queijo", url: "https://c.com", etiquetas: ["cozinha"], criado_em: "2026-11-20" }, { id: "2", tipo: "nota", titulo: "Orçamento da reforma", texto: "pintura e eletricista", etiquetas: ["reforma", "casa"], criado_em: "2026-11-25" },
    { id: "3", tipo: "arquivo", titulo: "Garantia", etiquetas: ["casa"], criado_em: "2026-11-22", arquivada_em: "2026-11-26T10:00:00Z", espaco_id: "E2" }];
  assert.deepEqual(N.bibFiltrar(itens, {}).map((i) => i.id), ["2", "1"], "arquivado fora; mais novo primeiro"); assert.deepEqual(N.bibFiltrar(itens, { arquivados: true }).map((i) => i.id), ["3"]);
  assert.deepEqual(N.bibFiltrar(itens, { texto: "pao queijo" }).map((i) => i.id), ["1"], "sem acento e em qualquer ordem"); assert.deepEqual(N.bibFiltrar(itens, { texto: "ELETRICISTA" }).map((i) => i.id), ["2"]);
  assert.deepEqual(N.bibFiltrar(itens, { tipo: "nota" }).map((i) => i.id), ["2"]); assert.deepEqual(N.bibFiltrar(itens, { etiqueta: "Casa" }).map((i) => i.id), ["2"]); assert.deepEqual(N.bibFiltrar(itens, { arquivados: true, espaco: "E2" }).map((i) => i.id), ["3"]);
  assert.deepEqual(N.bibEtiquetasDe(itens).map((e) => e.etiqueta + ":" + e.n), ["casa:2", "cozinha:1", "reforma:1"]);
  const leg = N.bibLegado([{ t: "Tese", u: "https://t.com/x", f: "", quando: "2026-10-01" }, { t: "sem url" }, { u: "ftp://x" }, null]); assert.equal(leg.length, 1); assert.equal(leg[0].legado, true); assert.equal(leg[0].titulo, "Tese"); assert.equal(leg[0].tipo, "link");
  assert.deepEqual(N.bibLegado(undefined), []);
  assert.deepEqual(N.cpEtiquetas("Casa, #Mercado casa x"), ["casa", "mercado"], "minúsculas, sem #, sem repetir, mínimo 2 letras");
});
