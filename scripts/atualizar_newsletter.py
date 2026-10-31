"""Coleta a Newsletter do Dia a Dia RAC e grava newsletter.json.

Fontes: RSS e Atom oficiais dos próprios veículos (nada de raspagem e nada de links do Google Notícias), em oito
categorias. Para cada notícia guarda título, veículo, link original (sem parâmetros de rastreamento), data, um trecho
curto da descrição e a imagem, quando o feed traz. Depois:
- tira repetidas (mesmo link ou mesmo título);
- classifica numa categoria principal, com etiquetas secundárias, e separa notícia, análise e opinião;
- junta matérias diferentes sobre o mesmo acontecimento num grupo, sem perder nenhuma fonte;
- calcula a relevância base (atualidade, número de fontes, tipo) e monta a edição do dia com os pesos padrão.
O site refaz a ordem com os pesos que o dono escolheu (nucleo.js, nlRelevancia), com a mesma fórmula.

Uma fonte fora do ar não derruba as outras: o erro fica registrado em "fontes". Sem mudança de conteúdo, o arquivo
não é regravado (o robô não faz commit à toa). Usa apenas a biblioteca padrão do Python.

Testes (tests/newsletter.test.mjs): NL_FIXTURES=<pasta> lê <id>.xml da pasta em vez da rede (arquivo ausente = fonte
fora do ar), NL_AGORA fixa o horário e NL_SAIDA troca o arquivo gravado.
"""
import concurrent.futures
import gzip
import hashlib
import html
import json
import math
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

BRT = timezone(timedelta(hours=-3))
ARQ = os.environ.get("NL_SAIDA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "newsletter.json")
UA = "Mozilla/5.0 (Dia a Dia RAC; leitor RSS pessoal; https://raynercarvalho.com.br)"

CATEGORIAS = ["ia", "tec", "cie", "eco", "pol", "dados", "games", "soro"]
# (id, veículo, endereço do feed, categoria principal da fonte, idioma, tipo padrão)
FONTES = [
    ("openai", "OpenAI", "https://openai.com/news/rss.xml", "ia", "en", "noticia"),
    ("google-ai", "Google AI", "https://blog.google/technology/ai/rss/", "ia", "en", "noticia"),
    ("deepmind", "Google DeepMind", "https://deepmind.google/blog/rss.xml", "ia", "en", "noticia"),
    ("huggingface", "Hugging Face", "https://huggingface.co/blog/feed.xml", "ia", "en", "analise"),
    ("mit-ia", "MIT News", "https://news.mit.edu/rss/topic/artificial-intelligence2", "ia", "en", "noticia"),
    ("verge-ia", "The Verge", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "ia", "en", "noticia"),
    ("techcrunch-ia", "TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/", "ia", "en", "noticia"),
    ("mittr-ia", "MIT Technology Review", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "ia", "en", "analise"),
    ("g1-tec", "g1", "https://g1.globo.com/rss/g1/tecnologia/", "tec", "pt", "noticia"),
    ("tecnoblog", "Tecnoblog", "https://tecnoblog.net/feed/", "tec", "pt", "noticia"),
    ("canaltech", "Canaltech", "https://canaltech.com.br/rss/", "tec", "pt", "noticia"),
    ("olhar-digital", "Olhar Digital", "https://olhardigital.com.br/feed/", "tec", "pt", "noticia"),
    ("verge", "The Verge", "https://www.theverge.com/rss/index.xml", "tec", "en", "noticia"),
    ("ars", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "tec", "en", "noticia"),
    ("g1-ciencia", "g1", "https://g1.globo.com/rss/g1/ciencia-e-saude/", "cie", "pt", "noticia"),
    ("jornal-usp", "Jornal da USP", "https://jornal.usp.br/feed/", "cie", "pt", "noticia"),
    ("pesquisa-fapesp", "Revista Pesquisa FAPESP", "https://revistapesquisa.fapesp.br/feed/", "cie", "pt", "analise"),
    ("galileu", "Revista Galileu", "https://revistagalileu.globo.com/rss/galileu", "cie", "pt", "noticia"),
    ("inovacao-tec", "Inovação Tecnológica", "https://www.inovacaotecnologica.com.br/boletim/rss.xml", "cie", "pt", "noticia"),
    ("sciencedaily", "ScienceDaily", "https://www.sciencedaily.com/rss/all.xml", "cie", "en", "noticia"),
    ("nature", "Nature", "https://www.nature.com/nature.rss", "cie", "en", "noticia"),
    ("newscientist", "New Scientist", "https://www.newscientist.com/feed/home/", "cie", "en", "noticia"),
    ("sciencenews", "Science News", "https://www.sciencenews.org/feed", "cie", "en", "noticia"),
    ("g1-economia", "g1", "https://g1.globo.com/rss/g1/economia/", "eco", "pt", "noticia"),
    ("valor", "Valor Econômico", "https://valor.globo.com/rss/valor", "eco", "pt", "noticia"),
    ("infomoney", "InfoMoney", "https://www.infomoney.com.br/feed/", "eco", "pt", "noticia"),
    ("abr-economia", "Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml", "eco", "pt", "noticia"),
    ("exame", "Exame", "https://exame.com/feed/", "eco", "pt", "noticia"),
    ("bloomberg-linea", "Bloomberg Línea", "https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml", "eco", "pt", "noticia"),
    ("g1-politica", "g1", "https://g1.globo.com/rss/g1/politica/", "pol", "pt", "noticia"),
    ("abr-politica", "Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", "pol", "pt", "noticia"),
    ("abr-internacional", "Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml", "pol", "pt", "noticia"),
    ("bbc-brasil", "BBC News Brasil", "https://feeds.bbci.co.uk/portuguese/rss.xml", "pol", "pt", "noticia"),
    ("folha-poder", "Folha de S.Paulo", "https://feeds.folha.uol.com.br/poder/rss091.xml", "pol", "pt", "noticia"),
    ("folha-mundo", "Folha de S.Paulo", "https://feeds.folha.uol.com.br/mundo/rss091.xml", "pol", "pt", "noticia"),
    ("kdnuggets", "KDnuggets", "https://www.kdnuggets.com/feed", "dados", "en", "analise"),
    ("tds", "Towards Data Science", "https://towardsdatascience.com/feed", "dados", "en", "analise"),
    ("analytics-vidhya", "Analytics Vidhya", "https://www.analyticsvidhya.com/feed/", "dados", "en", "analise"),
    ("powerbi", "Microsoft Power BI", "https://powerbi.microsoft.com/en-us/blog/feed/", "dados", "en", "noticia"),
    ("dbt", "dbt Labs", "https://www.getdbt.com/blog/rss.xml", "dados", "en", "analise"),
    ("aws-bigdata", "AWS Big Data Blog", "https://aws.amazon.com/blogs/big-data/feed/", "dados", "en", "analise"),
    ("databricks", "Databricks", "https://www.databricks.com/feed", "dados", "en", "noticia"),
    ("snowflake", "Snowflake", "https://www.snowflake.com/feed/", "dados", "en", "noticia"),
    ("flowingdata", "FlowingData", "https://flowingdata.com/feed", "dados", "en", "analise"),
    ("r-bloggers", "R-bloggers", "https://www.r-bloggers.com/feed/", "dados", "en", "analise"),
    ("data-hackers", "Data Hackers", "https://medium.com/feed/data-hackers", "dados", "pt", "analise"),
    ("ign-br", "IGN Brasil", "https://br.ign.com/feed.xml", "games", "pt", "noticia"),
    ("adrenaline", "Adrenaline", "https://www.adrenaline.com.br/feed/", "games", "pt", "noticia"),
    ("eurogamer", "Eurogamer", "https://www.eurogamer.net/feed", "games", "en", "noticia"),
    ("polygon", "Polygon", "https://www.polygon.com/rss/index.xml", "games", "en", "noticia"),
    ("kotaku", "Kotaku", "https://kotaku.com/rss", "games", "en", "noticia"),
    ("g1-sorocaba", "g1 Sorocaba e Jundiaí", "https://g1.globo.com/rss/g1/sp/sorocaba-jundiai/", "soro", "pt", "noticia"),
]

JANELA_H = 48        # só entra o que foi publicado nas últimas 48 horas
POR_FONTE = 20       # no máximo 20 itens por fonte (as mais novas)
POR_CATEGORIA = 20   # no máximo 20 grupos por categoria no arquivo
ITENS_POR_GRUPO = 6  # fontes guardadas por grupo (a contagem "n" considera todas)
TRECHO_MAX = 200     # trecho curto da descrição: o resto está no link original
DESTAQUE_H = 30      # destaque precisa ser das últimas 30 horas...
DESTAQUE_FONTES = 3  # ...ou continuar repercutindo (3 fontes ou mais) dentro da janela
DESTAQUES_MAX, DESTAQUES_MIN, DESTAQUES_POR_CAT, SECAO_MAX = 10, 5, 3, 8

# palavras de cada categoria, sobre o texto sem acento e em minúsculas
CHAVES = {
    "ia": r"inteligencia artificial|\bia\b|\bias\b|ia generativa|artificial intelligence|\bai\b|generative|machine learning|aprendizado de maquina|\bllms?\b|chatgpt|openai|anthropic|\bclaude\b|gemini|copilot|deepmind|deepseek|mistral|\bllama\b|agentes? de ia|\bai agents?\b|redes neurais|neural network|modelo de linguagem|language model",
    "tec": r"tecnologia|technology|\btech\b|smartphone|celular|iphone|android|\bapple\b|microsoft|samsung|\bmeta\b|software|aplicativo|\bapps?\b|\bchips?\b|semicondutor|semiconductor|processador|nvidia|\bintel\b|\bamd\b|ciberseguranca|cybersecurity|hacker|ataque cibernetico|vazamento|startup|internet|\b5g\b|computador|notebook|laptop|gadget|tesla|spacex|streaming|windows|\bmac\b",
    "cie": r"ciencia|cientistas?|\bscience\b|scientists?|pesquisador|researchers?|estudo|\bstudy\b|universidade|university|\bnasa\b|telescopio|telescope|astronom|planeta|planet|fisica|physics|quimica|chemistry|biolog|genetic|genoma|genome|vacina|vaccine|\bclima\b|climate|fossil|especie|species|inovacao|innovation|descoberta|discovery|\bsaude\b|\bhealth\b",
    "eco": r"economia|economy|economic|mercado financeiro|\bbolsa\b|ibovespa|dolar|\bjuros\b|\bselic\b|inflacao|inflation|\bpib\b|\bgdp\b|banco central|copom|empresas?|lucro|receita|investimento|investidor|investor|\bacoes\b|negocios|business|varejo|industria|emprego|desemprego|imposto|tribut|fiscal|orcamento|petrobras|\bvale\b|tarifa|exportac|importac|mercado de trabalho",
    "pol": r"politic|governo|government|presidente|president|\blula\b|bolsonaro|congresso|\bcamara\b|senado|\bstf\b|supremo|ministro|ministerio|eleicao|eleicoes|election|partido|deputad|senador|prefeit|governador|guerra|\bwar\b|diplomac|\bonu\b|\botan\b|\bnato\b|trump|\beua\b|israel|ucrania|ukraine|russia|china|gaza|policia|operacao",
    "dados": r"ciencia de dados|cientista de dados|data scien|analise de dados|analista de dados|data analy|analytics|\bbi\b|business intelligence|power ?bi|tableau|looker|\bsql\b|banco de dados|database|data warehouse|lakehouse|data lake|engenharia de dados|data engineer|\betl\b|\bdbt\b|databricks|snowflake|bigquery|pandas|\bpython\b|estatistic|statistic|dashboard|visualizac\w* de dados|data ?vi[sz]|big data|\bdados\b",
    "games": r"\bgames?\b|jogos? eletronicos?|videogame|video game|playstation|\bps5\b|\bps4\b|\bxbox\b|nintendo|\bswitch\b|\bsteam\b|esports?|e-sports|gameplay|\brpg\b|\bdlc\b|\bgta\b|zelda|mario|pokemon|fortnite|minecraft|\bconsoles?\b|\bgamer\b|call of duty|battlefield",
    "soro": r"sorocaba|votorantim|\bitu\b|salto de pirapora|aracoiaba|ibiuna|piedade|tatui|porto feliz|boituva|mairinque|sao roque|\baluminio\b|jundiai|itapetininga|cerquilho|tiete",
}
REGEX = {c: re.compile(p) for c, p in CHAVES.items()}
OPINIAO_URL = re.compile(r"/(opiniao|opinion|colunas?|colunistas?|blogs?|editoria[il]s?|op-ed|commentary|artigos?)/", re.I)
OPINIAO_TIT = re.compile(r"^(opiniao|artigo|coluna|editorial|analise de|carta)\b|\bop-ed\b|^opinion\b", re.I)
ANALISE_TIT = re.compile(r"\banalise\b|\bentenda\b|\bexplica\b|o que se sabe|\bpor que\b|como funciona|\bguia\b|\bpasso a passo\b|\banalysis\b|explainer|explained|deep dive|what we know|\bwhy\b|\bhow to\b|\btutorial\b|\bguide\b", re.I)
RASTREIO = re.compile(r"^(utm_.*|fbclid|gclid|dclid|yclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|cmpid|cmp|xtor|_ga|spm|s_cid|at_.*|ito|ocid|smid|share|sr_share|origin|source|src|feed|rss|outputtype)$", re.I)
PARADAS = set("""a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sobre entre ate apos e ou que se ao aos
como mais menos ja nao sim seu sua seus suas ele ela eles elas isso esta este esse essa diz dizem afirma apos contra
the a an of to in on for and or with by from at as is are be was were has have will its it this that after over new says""".split())


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=25) as r:
        dados = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or dados[:2] == b"\x1f\x8b":
            dados = gzip.decompress(dados)
    return dados


def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


def chave_titulo(titulo):
    return re.sub(r"[^a-z0-9]+", " ", sem_acento(titulo)).strip()


def normalizar_url(u):
    """Link original limpo: só http(s), sem fragmento e sem parâmetros de rastreamento; None se não servir."""
    u = html.unescape((u or "").strip())
    try:
        p = urllib.parse.urlsplit(u)
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    host = p.netloc.lower()
    if host.endswith(":443") or host.endswith(":80"):
        host = host.rsplit(":", 1)[0]
    # links de redirecionamento do Google Notícias não servem: a newsletter usa só o endereço original do veículo
    if host in ("news.google.com", "www.google.com", "google.com") or host.endswith(".feedproxy.google.com"):
        return None
    qs = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not RASTREIO.match(k)]
    query = urllib.parse.urlencode(sorted(qs))
    path = p.path or "/"
    return urllib.parse.urlunsplit(("https" if p.scheme == "https" else "http", host, path, query, ""))


def chave_url(u):
    p = urllib.parse.urlsplit(u)
    host = p.netloc[4:] if p.netloc.startswith("www.") else p.netloc
    return host + (p.path.rstrip("/") or "/") + ("?" + p.query if p.query else "")


def limpar(t, n=TRECHO_MAX):
    t = html.unescape(re.sub(r"<[^>]+>", " ", html.unescape(t or "")))
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s*(The post .* appeared first on .*|Continue reading.*|Leia mais.*|Read more.*|\[(…|\.\.\.)\])$", "", t, flags=re.I).strip()
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def _nome(tag):
    return tag.rsplit("}", 1)[-1]


def _data(txt):
    txt = (txt or "").strip()
    if not txt:
        return None
    try:
        d = parsedate_to_datetime(txt)
    except Exception:
        try:
            d = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        except Exception:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _imagem(el, textos):
    for ch in el.iter():
        n = _nome(ch.tag)
        url = ch.get("url") or ch.get("href") if n in ("content", "thumbnail", "enclosure", "link") else None
        if not url:
            continue
        tipo, medium = (ch.get("type") or ""), (ch.get("medium") or "")
        if n == "link" and ch.get("rel") != "enclosure":
            continue
        if n in ("enclosure", "link") and not tipo.startswith("image/"):
            continue
        if n == "content" and medium not in ("", "image") and not tipo.startswith("image/"):
            continue
        if ch.get("width") in ("1", "0"):
            continue
        u = normalizar_url(url)
        if u and u.startswith("https://") and len(u) < 400:
            return u
    for t in textos:
        m = re.search(r"<img[^>]+src=[\"'](https://[^\"']+)[\"']", html.unescape(t or ""), re.I)
        if m and len(m.group(1)) < 400 and not re.search(r"(pixel|tracker|feedburner|1x1)", m.group(1), re.I):
            return m.group(1)
    return None


def ler_feed(dados, fonte, agora):
    """Lê um RSS ou Atom e devolve as notícias da janela (mais novas primeiro). Levanta erro se o XML não servir."""
    fid, veiculo, _url, cat, lang, tipo_padrao = fonte
    raiz = ElementTree.fromstring(dados)
    itens = []
    for el in raiz.iter():
        if _nome(el.tag) not in ("item", "entry"):
            continue
        campos, cats, desc, conteudo, link = {}, [], "", "", ""
        for ch in el:
            n = _nome(ch.tag)
            if n == "title":
                campos["t"] = "".join(ch.itertext())
            elif n == "link":
                if ch.get("href"):
                    if ch.get("rel") in (None, "alternate"):
                        link = link or ch.get("href")
                else:
                    link = link or (ch.text or "")
            elif n in ("pubDate", "published", "date", "issued") and "d" not in campos:
                campos["d"] = _data(ch.text)
            elif n in ("updated", "modified") and "u" not in campos:
                campos["u"] = _data(ch.text)
            elif n in ("description", "summary"):
                desc = "".join(ch.itertext()) if len(ch) else (ch.text or "")
            elif n == "encoded":
                conteudo = ch.text or ""
            elif n == "category":
                cats.append(ch.get("term") or ch.text or "")
        titulo = limpar(campos.get("t", ""), 300)
        u = normalizar_url(link)
        d = campos.get("d") or campos.get("u")
        if not titulo or not u or not d:
            continue
        if d > agora + timedelta(hours=1):
            d = agora  # data no futuro (fuso errado no feed): vale a hora da coleta
        if agora - d > timedelta(hours=JANELA_H):
            continue
        resumo = limpar(desc or conteudo)
        if chave_titulo(resumo) == chave_titulo(titulo):
            resumo = ""
        itens.append({
            "id": "n" + hashlib.sha1(chave_url(u).encode()).hexdigest()[:10], "t": titulo, "u": u, "f": veiculo, "fid": fid,
            "d": d.astimezone(timezone.utc).replace(microsecond=0).isoformat(), "r": resumo, "img": _imagem(el, [desc, conteudo]),
            "lang": lang, "cf": cat, "tp": tipo_padrao, "cats": " ".join(cats),
        })
    itens.sort(key=lambda x: x["d"], reverse=True)
    return itens[:POR_FONTE]


def classificar(item):
    """Categoria principal e etiquetas: palavras-chave no título e no trecho, com +3 para a categoria da fonte."""
    texto = sem_acento(item["t"] + " " + item.get("r", "") + " " + item.get("cats", ""))
    acertos = {c: len(REGEX[c].findall(texto)) for c in CATEGORIAS}
    if item.get("lang") == "en":
        acertos["ia"] -= len(re.findall(r"\bias\b", texto))  # "ias" não é IA em inglês
    # a fonte regional vale mais: tudo o que o g1 Sorocaba publica é da região, mesmo sem citar a cidade
    pontos = {c: acertos[c] * 2 + ((6 if c == "soro" else 3) if c == item["cf"] else 0) for c in CATEGORIAS}
    # Sorocaba e região: quando o texto cita a região, ela ganha de qualquer fonte nacional; sem citar, só a fonte regional
    if acertos["soro"]:
        pontos["soro"] += 4
    elif item["cf"] != "soro":
        pontos["soro"] = -1
    principal = max(CATEGORIAS, key=lambda c: (pontos[c], c == item["cf"], -CATEGORIAS.index(c)))
    tags = [c for c in CATEGORIAS if c != principal and acertos[c] > 0][:3]
    return principal, tags


def tipo_de(item):
    if OPINIAO_URL.search(urllib.parse.urlsplit(item["u"]).path) or OPINIAO_TIT.search(sem_acento(item["t"])) or re.search(r"opini|coluna|opinion|editorial", sem_acento(item.get("cats", ""))):
        return "opiniao"
    if ANALISE_TIT.search(sem_acento(item["t"])) or item.get("tp") == "analise":
        return "analise"
    return "noticia"


def palavras(titulo):
    """Radicais do título (5 letras; plural simples sem o "s"), sem palavras vazias; números de 2+ dígitos contam."""
    out = set()
    for w in chave_titulo(titulo).split():
        if w in PARADAS:
            continue
        if w.isdigit():
            if len(w) >= 2:
                out.add(w)
        elif len(w) >= 3:
            out.add(w[:5] if len(w) > 5 else (w.rstrip("s") if len(w) > 3 else w))
    return out


def parecidas(a, b):
    """Mesmo acontecimento: 3+ radicais em comum e 60% do título menor, ou 4+ em comum e 40% de tudo."""
    comuns = len(a & b)
    if comuns < 3:
        return False
    return comuns / min(len(a), len(b)) >= 0.6 or (comuns >= 4 and comuns / len(a | b) >= 0.4)


def agrupar(itens):
    """Junta matérias sobre o mesmo acontecimento (títulos parecidos, até 36 horas de distância). Nada é apagado."""
    grupos = []
    for it in sorted(itens, key=lambda x: x["d"]):
        p, d = palavras(it["t"]), datetime.fromisoformat(it["d"])
        alvo = None
        for g in grupos:
            if abs((d - g["_d"]).total_seconds()) > 36 * 3600:
                continue
            if any(parecidas(p, q) for q in g["_p"]):
                alvo = g
                break
        if alvo is None:
            grupos.append({"_p": [p], "_d": d, "itens": [it]})
        else:
            alvo["_p"].append(p)
            alvo["_d"] = max(alvo["_d"], d)
            alvo["itens"].append(it)
    return grupos


def relevancia(g, agora_ms, peso=1.0):
    """A mesma fórmula de nlRelevancia (nucleo.js): peso × (atualidade + fontes + tipo + imagem)."""
    idade_h = max(0.0, (agora_ms - datetime.fromisoformat(g["d"]).timestamp() * 1000) / 3.6e6)
    rec = 4 * max(0.0, 1 - idade_h / 36)
    fontes = 2 * math.log(1 + g["n"])
    tipo = {"noticia": 0.5, "analise": 0.3}.get(g["tipo"], 0.0)
    return round(peso * (rec + fontes + tipo + (0.2 if g.get("img") else 0)), 4), idade_h


def montar_grupo(g, agora_ms):
    itens = sorted(g["itens"], key=lambda x: x["d"], reverse=True)
    votos = {}
    for it in itens:
        votos[it["c"]] = votos.get(it["c"], 0) + 1
    c = max(CATEGORIAS, key=lambda k: (votos.get(k, 0), -CATEGORIAS.index(k)))
    tags = sorted({t for it in itens for t in it["tags"] + [it["c"]] if t != c}, key=CATEGORIAS.index)[:3]
    tipos = {it["tipo"] for it in itens}
    tipo = "noticia" if "noticia" in tipos else ("analise" if "analise" in tipos else "opiniao")
    # manchete do grupo: de preferência em português, com imagem e com trecho; depois a mais nova
    rep = max(itens, key=lambda it: (it["lang"] == "pt", bool(it["img"]), bool(it["r"]), it["d"]))
    primeiro = min(itens, key=lambda it: (it["d"], it["u"]))
    gr = {
        "id": "g" + hashlib.sha1(chave_url(primeiro["u"]).encode()).hexdigest()[:10], "c": c, "tags": tags, "tipo": tipo,
        "t": rep["t"], "r": rep["r"] or next((it["r"] for it in itens if it["r"]), ""), "u": rep["u"], "f": rep["f"],
        "img": rep["img"] or next((it["img"] for it in itens if it["img"]), None), "lang": rep["lang"],
        "d": itens[0]["d"], "d0": itens[-1]["d"], "n": len({it["f"] for it in itens}),
    }
    # as fontes do grupo só são listadas quando há mais de uma (com uma só, são a própria manchete)
    if len(itens) > 1:
        gr["itens"] = [{"id": it["id"], "t": it["t"], "u": it["u"], "f": it["f"], "d": it["d"], "tipo": it["tipo"]} for it in itens[:ITENS_POR_GRUPO]]
    gr["s"], idade = relevancia(gr, agora_ms)
    return gr, idade


def pode_destaque(g, idade_h):
    return g["tipo"] != "opiniao" and (idade_h <= DESTAQUE_H or (g["n"] >= DESTAQUE_FONTES and idade_h <= JANELA_H))


def edicao(grupos, idades, agora):
    """Edição base do dia (pesos padrão): 5 a 10 destaques, no máximo 3 por categoria, e as seções por categoria."""
    ordem = sorted(grupos, key=lambda g: (-g["s"], g["id"]))
    destaques, por_cat = [], {}
    for g in ordem:
        if len(destaques) >= DESTAQUES_MAX:
            break
        if pode_destaque(g, idades[g["id"]]) and sum(1 for x in destaques if x["c"] == g["c"]) < DESTAQUES_POR_CAT:
            destaques.append(g)
    # poucas notícias recentes: completa até 5 com as melhores que sobraram (nunca opinião), como o nlEdicao do site
    for g in ordem:
        if len(destaques) < DESTAQUES_MIN and g not in destaques and g["tipo"] != "opiniao":
            destaques.append(g)
    for g in ordem:
        por_cat.setdefault(g["c"], [])
        if len(por_cat[g["c"]]) < SECAO_MAX:
            por_cat[g["c"]].append(g["id"])
    return {"data": agora.astimezone(BRT).date().isoformat(), "destaques": [g["id"] for g in destaques],
            "por_categoria": {c: por_cat[c] for c in CATEGORIAS if c in por_cat}}


def coletar(fonte, agora):
    fixt = os.environ.get("NL_FIXTURES")
    try:
        if fixt:
            caminho = os.path.join(fixt, fonte[0] + ".xml")
            if not os.path.exists(caminho):
                raise OSError("fonte fora do ar (teste)")
            with open(caminho, "rb") as f:
                dados = f.read()
        else:
            dados = baixar(fonte[2])
        itens = ler_feed(dados, fonte, agora)
        return fonte, itens, None
    except ElementTree.ParseError:
        return fonte, [], "XML inválido"
    except Exception as e:  # uma fonte fora do ar não derruba as outras
        cod = getattr(e, "code", None)
        return fonte, [], ("HTTP %s" % cod) if cod else (type(e).__name__ + ": " + str(e))[:80]


def montar(resultados, agora, anterior=None):
    """Junta tudo: deduplica, classifica, agrupa, calcula a relevância e monta o arquivo."""
    agora_ms = agora.timestamp() * 1000
    ant = {f["id"]: f for f in (anterior or {}).get("fontes", [])}
    vistos_u, vistos_t, todos, fontes = set(), set(), [], []
    for fonte, itens, erro in resultados:
        fid = fonte[0]
        falha_desde = None
        if erro:
            falha_desde = (ant.get(fid) or {}).get("falha_desde") or agora.replace(microsecond=0).isoformat()
        fontes.append({"id": fid, "n": fonte[1], "c": fonte[3], "lang": fonte[4], "ok": not erro, "itens": len(itens), "erro": erro, "falha_desde": falha_desde})
        for it in itens:
            # repetida: o mesmo link (de qualquer feed) ou a mesma manchete no mesmo veículo. A mesma manchete em outro
            # veículo (texto de agência republicado) não some: entra no mesmo grupo e conta como mais uma fonte
            ku, kt = chave_url(it["u"]), (chave_titulo(it["t"]), it["f"])
            if ku in vistos_u or kt in vistos_t:
                continue
            vistos_u.add(ku)
            vistos_t.add(kt)
            it["c"], it["tags"] = classificar(it)
            it["tipo"] = tipo_de(it)
            todos.append(it)
    grupos, idades = [], {}
    for g in agrupar(todos):
        gr, idade = montar_grupo(g, agora_ms)
        grupos.append(gr)
        idades[gr["id"]] = idade
    # no arquivo: as mais relevantes de cada categoria (o resto ficaria velho antes de alguém ler)
    por_cat = {}
    for g in sorted(grupos, key=lambda g: (-g["s"], g["id"])):
        por_cat.setdefault(g["c"], [])
        if len(por_cat[g["c"]]) < POR_CATEGORIA:
            por_cat[g["c"]].append(g)
    grupos = sorted([g for l in por_cat.values() for g in l], key=lambda g: (-g["s"], g["id"]))
    return {
        "versao": 1, "coletado": agora.replace(microsecond=0).isoformat(), "janela_h": JANELA_H,
        "fontes": fontes, "edicao": edicao(grupos, idades, agora), "grupos": grupos,
    }


def gravar(dados, caminho):
    """Um grupo por linha: o histórico do git fica pequeno e legível."""
    topo = {k: v for k, v in dados.items() if k != "grupos"}
    txt = json.dumps(topo, ensure_ascii=False, separators=(",", ":"))[:-1]
    txt += ',"grupos":[\n' + ",\n".join(json.dumps(g, ensure_ascii=False, separators=(",", ":")) for g in dados["grupos"]) + "\n]}\n"
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)


def main():
    agora = datetime.fromisoformat(os.environ["NL_AGORA"]) if os.environ.get("NL_AGORA") else datetime.now(timezone.utc)
    try:
        with open(ARQ, encoding="utf-8") as f:
            anterior = json.load(f)
    except (OSError, ValueError):
        anterior = None
    # testes: NL_FONTES="id1,id2" limita as fontes (as que não têm arquivo em NL_FIXTURES contam como fora do ar)
    so = set(filter(None, os.environ.get("NL_FONTES", "").split(",")))
    fontes = [f for f in FONTES if not so or f[0] in so]
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        resultados = list(ex.map(lambda fo: coletar(fo, agora), fontes))
    dados = montar(resultados, agora, anterior)
    falhas = [f for f in dados["fontes"] if not f["ok"]]
    for f in falhas:
        print("falhou", f["id"], f["erro"])
    # metade das fontes fora do ar ou nada coletado: falha de propósito (o GitHub avisa) e mantém o arquivo anterior
    if len(falhas) > len(fontes) // 2 or not dados["grupos"]:
        print("ALERTA: newsletter com problema (%d de %d fontes falharam, %d grupos)" % (len(falhas), len(fontes), len(dados["grupos"])), file=sys.stderr)
        sys.exit(1)
    if anterior and {k: v for k, v in anterior.items() if k != "coletado"} == {k: v for k, v in json.loads(json.dumps(dados)).items() if k != "coletado"}:
        print("sem notícias novas")
        return
    gravar(dados, ARQ)
    print(len(dados["grupos"]), "grupos,", sum(len(g.get("itens", [1])) for g in dados["grupos"]), "matérias,", len(dados["edicao"]["destaques"]), "destaques,", len(falhas), "fontes com falha")


if __name__ == "__main__":
    main()
