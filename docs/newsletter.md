# Newsletter Inteligente

A edição diária do Dia a Dia RAC: notícias de fontes RSS oficiais, em oito categorias, sem repetidas, com os
acontecimentos agrupados, uma ordem de relevância que o dono ajusta, busca, guardadas, histórico, resumo da semana,
aviso no celular e, opcionalmente, um resumo em português feito pela RAC Intelligence (com conferência antes de salvar).

## Estado (31/10/2026)

| Peça | Estado | Quem faz |
|---|---|---|
| Coletor `scripts/atualizar_newsletter.py` + `noticias.yml` | Pronto, testado (local) | Publica junto com o site |
| Página `#newsletter`, cartão no Início, busca do site, Sistema | Pronto, testado (local), versão `2026-10-31.4` | Push no `main` |
| SQL `018_newsletter.sql` (edições e avisos) | **Pendente**: preparado, não executado | Dono, no SQL Editor, **antes** do site |
| Função `rac-newsletter` (avisos) | **Pendente**: código pronto, não publicada | Dono, pela CLI |
| SQL `019_newsletter_avisos.sql` (agendamento) | **Pendente**: rodar **depois** de publicar a função | Dono, no SQL Editor |
| Ação `newsletter.resumo` na `rac-ia` | Pronta em **DEMO** (`real: false`); a `rac-ia` precisa ser republicada | Dono, pela CLI |
| SQL `020_newsletter_real.sql` | **Preparado para o futuro. Não rodar agora** | Só com autorização do primeiro uso REAL |

Nada disso liga o modo REAL, mexe nas listas `acoes_reais`/`acoes_reais_casa`, no Mercado, no orçamento, nos Secrets ou
na função `garmin`.

## Como funciona

```
GitHub Actions (noticias.yml, 6h/12h/18h)          Supabase                          Site (iPhone)
  atualizar_newsletter.py                            newsletter_edicoes (018)          #newsletter (js/newsletter.js)
   ├ 52 feeds RSS/Atom oficiais                       newsletter_avisos  (018)           ├ Hoje: resumo, destaques, seções
   ├ link original limpo, dedup, categorias            ▲          ▲                       ├ Buscar, Guardadas, Edições, Semana
   ├ agrupamento e relevância base                     │          │                       ├ Ajustes (PESSOAL.newsletter)
   └ newsletter.json  ──────────────(Pages)────────────┼──────────┼──────────────────────►└ Resumir com IA → racIA() → rac-ia
                                                       │   rac-newsletter (019, cron)         (newsletter.resumo, DEMO)
                                                       └── edição base + 1 aviso/dia (push)
```

1. **Coleta** (`scripts/atualizar_newsletter.py`, só biblioteca padrão). Lê os feeds em paralelo, guarda o que é das
   últimas 48 horas (até 20 por fonte) com título, veículo, link original, data (UTC), trecho de até 200 caracteres e
   imagem (media:content, media:thumbnail, enclosure ou a primeira imagem da descrição). Link: só http(s), sem
   fragmento e sem parâmetros de rastreamento (`utm_*`, `fbclid`, `gclid`, `ref`…); redirecionamento do Google
   Notícias é descartado. Data no futuro vira a hora da coleta.
2. **Repetidas.** O mesmo link (de qualquer feed) sai. A mesma manchete no mesmo veículo sai. A mesma manchete em
   outro veículo (texto de agência republicado) fica e conta como mais uma fonte do acontecimento.
3. **Categorias.** Palavras-chave no título e no trecho (sem acento), com +3 para a categoria da fonte; a principal é a
   de maior pontuação, e as outras citadas viram etiquetas (até 3). Sorocaba e região: tudo do g1 Sorocaba, e qualquer
   notícia que cite a cidade ou a região.
4. **Tipo.** Opinião (`/opiniao/`, `/colunas/`, `/blog/`… no link, "Opinião:" no título ou categoria do feed),
   análise (entenda, explica, guia, analysis, how to…, ou fonte de análise) e notícia.
5. **Agrupamento.** Títulos com 3 ou mais radicais em comum (60% do menor título), ou 4 ou mais (40% de tudo), até 36
   horas de distância, viram um grupo. Nenhuma fonte é apagada: o grupo lista até 6 e conta todas (`n`).
6. **Relevância** (igual no Python e no site, `nlRelevancia`):
   `peso da categoria × (4 × atualidade + 2 × ln(1 + fontes) + tipo + imagem + interesse)`, com atualidade de 1 (agora)
   a 0 (36 horas), tipo 0,5 notícia / 0,3 análise / 0 opinião, imagem 0,2 e +1,5 por assunto de interesse (até 3).
7. **Destaques:** 5 a 10, no máximo 3 por categoria, nunca opinião. Só entra o que tem até 30 horas, ou até 48 horas se
   ainda repercute (3 fontes ou mais); o motivo aparece no cartão ("ainda repercute, publicado há 40 h"). Se houver
   menos de 5, completa com os melhores restantes e diz "entre as mais recentes disponíveis".
8. **Sem mudança, sem commit:** o arquivo só é regravado quando o conteúdo muda; uma fonte fora do ar fica registrada em
   `fontes` com o erro e `falha_desde`. Mais da metade das fontes fora (ou nenhuma notícia): o robô falha de propósito,
   mantém o arquivo anterior e o GitHub avisa por e-mail. O Sistema mostra a coleta e as fontes fora do ar.

## Fontes (52, todas por RSS/Atom oficial)

| Categoria | Fontes |
|---|---|
| Inteligência Artificial | OpenAI, Google AI, Google DeepMind, Hugging Face, MIT News, The Verge (IA), TechCrunch (IA), MIT Technology Review |
| Tecnologia | g1 Tecnologia, Tecnoblog, Canaltech, Olhar Digital, The Verge, Ars Technica |
| Ciência e inovação | g1 Ciência e Saúde, Jornal da USP, Revista Pesquisa FAPESP, Revista Galileu, Inovação Tecnológica, ScienceDaily, Nature, New Scientist, Science News |
| Economia e negócios | g1 Economia, Valor Econômico, InfoMoney, Agência Brasil (Economia), Exame, Bloomberg Línea |
| Política e atualidades | g1 Política, Agência Brasil (Política e Internacional), BBC News Brasil, Folha (Poder e Mundo) |
| Ciência de Dados e Analytics | KDnuggets, Towards Data Science, Analytics Vidhya, Microsoft Power BI, dbt Labs, AWS Big Data, Databricks, Snowflake, FlowingData, R-bloggers, Data Hackers |
| Games e entretenimento tecnológico | IGN Brasil, Adrenaline, Eurogamer, Polygon, Kotaku |
| Sorocaba e região | g1 Sorocaba e Jundiaí |

Conferidas em 31/10/2026: todas responderam. Ficaram de fora por não responderem: Jornal Cruzeiro do Sul (403),
Jovem Nerd e DataCamp (404), The Enemy (certificado), TecMundo (feed vazio) e Agência FAPESP (XML quebrado). Algumas
fontes têm paywall (Valor, Folha): o link original continua sendo o do veículo. Só manchete, trecho curto e link: o
texto completo fica no site do veículo.

## Armazenamento

- **Público (repositório):** `newsletter.json`, um grupo por linha (o histórico do git fica pequeno). Cerca de 100 KB.
- **Conta do dono (Supabase):**
  - `newsletter_edicoes` (018): uma edição por dono e por dia (`unique (dono, data)`), com um retrato compacto dos
    destaques e das seções (os links originais ficam junto, para o histórico continuar legível), `origem` (`regras` ou
    `ia`), `modelo`, `ia_uso_id`, `chave`, criação e atualização. RLS: só o dono (quem é da casa fica de fora), nada
    para anon. Um gatilho garante: edição `ia` só com uma chamada REAL **concluída** de `newsletter.resumo` desta casa e
    com a mesma chave de idempotência (resposta DEMO não tem chamada, então nunca chega aqui); `ia` não volta a `regras`;
    dono e data não mudam.
  - `newsletter_avisos` (018): um registro por aviso (`dia:AAAA-MM-DD`, `semana:AAAA-Www`); a chave primária impede
    aviso repetido. Só o servidor grava; o dono lê os dele.
  - `pessoal.newsletter`: pesos por categoria (0 esconde, até 3), assuntos de interesse, palavras para esconder e
    avisos ligados ou não. `pessoal.salvos`: as guardadas (o mesmo lugar das Conexões do dia; nada antigo quebra).
- **No aparelho:** o service worker guarda `newsletter.json` e `js/newsletter.js` (a edição abre sem internet); as
  últimas 14 edições do histórico e os resumos de IA já feitos ficam no `localStorage`.

## Página (`#newsletter`)

Abas: **Hoje** (resumo do dia, destaques com manchete, veículo, data e hora, quantas fontes, link original, "Guardar" e
"As N fontes"; seções por categoria), **Buscar** (palavras, categoria, tipo, veículo, mais recentes ou mais
relevantes), **Guardadas**, **Edições** (histórico), **Semana** e **Ajustes**. Estado vazio, coleta atrasada (mais de
26 h), fontes fora do ar e "sem internet" aparecem na própria página. No Início, o cartão "Newsletter" mostra o resumo e
os 4 primeiros destaques; a busca geral do site acha as notícias. Pensada para 375 px (abas roláveis, imagem pequena à
direita, sem rolagem lateral). No celular, só nesta página, Voltar e Início ficam só com o ícone (o nome continua
para leitores de tela) para o título "Newsletter" caber inteiro; as outras páginas mantêm o cabeçalho de sempre.

Ao abrir a página, a edição de hoje (com os pesos do dono) entra no histórico como `regras`; ela é atualizada se a
coleta mudar durante o dia. Uma edição salva com IA nunca é trocada por ela.

## Resumo com IA (`newsletter.resumo`)

- Ação da `rac-ia` (`supabase/functions/rac-ia/acoes.ts`): Claude Haiku 5.5 (`claude-haiku-5-5`, o mesmo do
  abastecimento; preço em `ia_precos`, conferido em 30/10/2026), só o dono, sem imagens, até 15.000 caracteres,
  `maxTokens` 4.000, **`real: false`** (DEMO no código).
- Entrada: até 30 grupos (os destaques e os 3 primeiros de cada seção), com id, categoria, tipo, número de veículos,
  título, trecho e nomes dos veículos. **Sem links**, e sem "<" ou ">" (não dá para fechar o bloco de dados).
- Saída JSON obrigatória: `resumo_dia`, `destaques[{id, titulo, resumo, relevancia}]` (5 a 10),
  `categorias[{categoria, sintese, ids}]`. Validação: qualquer id que não veio na entrada recusa a resposta inteira;
  links são tirados dos textos; tamanhos limitados; destaque repetido e categoria desconhecida são ignorados com aviso.
- Instruções: sempre em português, só com o que está nos grupos, sem acrescentar fatos, sem opinião e sem links.
- No site: links, veículos, datas e fontes continuam vindo do coletor (`nlAplicarIA`); a IA só acrescenta os textos.
  A prévia mostra as fontes usadas. DEMO: prévia sem botão de salvar. REAL: prévia com "Salvar edição" e "Descartar";
  só o toque em Salvar grava (e o banco confere a chamada).
- **Idempotência:** a chave é `nl-<data>-<hash das notícias>` (`nlChaveIA`): a mesma edição manda sempre a mesma chave, e
  `ia_reservar` recusa a repetida (`repetida`), então a mesma edição nunca é paga duas vezes. O resultado REAL fica no
  aparelho: tocar de novo mostra o mesmo, sem chamar. Nada se repete sozinho; depois de uma chamada paga que não trouxe
  resumo, "Gerar de novo (nova chamada paga)" pede confirmação e usa outra chave.
- Reserva, orçamento, estados e reconciliação: os mesmos de sempre (`docs/rac-intelligence.md`).

### Custo estimado (Haiku 5.5, preços de `ia_precos`)

Medido com a edição real de 31/10/2026 (24 grupos, ~11.600 caracteres, ~3.300 tokens de entrada):

| | Por edição | 30 edições |
|---|---|---|
| Custo típico (~1.200 tokens de saída) | ~US$ 0,0009 | ~US$ 0,03 |
| Máximo (contagem por excesso e 4.000 de saída) | ~US$ 0,0027 | ~US$ 0,08 |
| Reserva travada antes da chamada | ~US$ 0,003 | — |

Muito abaixo do teto interno de US$ 6,70 por mês. O valor real aparece no painel do Sistema e no Console.

### Ligar o REAL (só com autorização específica; nada disto foi feito)

1. Em `acoes.ts`, `real: true` em `newsletter.resumo`; testes; republicar a `rac-ia` pela CLI.
2. SQL `020_newsletter_real.sql` no SQL Editor (só permite; a lista continua vazia).
3. No SQL Editor: acrescentar `'newsletter.resumo'` em `acoes_reais` (e a casa em REAL, se ainda não estiver).
4. Uma edição de teste, conferida e salva; depois comparar com o Console.

## Avisos no celular (`rac-newsletter` + 019)

- O agendamento (019) chama a função às 6h45, 8h45 e 10h45 de Brasília, com a senha da rotina que já existe no Vault
  (`rac_rotina`, do 008). A função só segue se a edição de hoje já saiu.
- Para cada dono (quem tem notificações ativas ou configurou a Newsletter; quem é da casa fica de fora): guarda a
  edição base do dia, se ainda não existir, e manda **um** aviso ("📰 Newsletter de hoje: N destaques"). No domingo, o
  resumo da semana. O registro em `newsletter_avisos` vem antes do envio: nada chega duas vezes.
- Respeita a permissão: só aparelhos que ativaram as notificações (Sistema → Notificações) têm inscrição, e o dono pode
  desligar em Newsletter → Ajustes. Usa as chaves VAPID que a `garmin` criou (só lê; não cria outras). Não usa IA.

## Publicação (ordem)

1. `node --test tests/*.test.mjs` passando.
2. SQL `018_newsletter.sql` no SQL Editor (antes do site). Tirar a linha `-- status: pendente` do 018.
3. Republicar a `rac-ia` (a ação nova, em DEMO): `npx supabase@2.121.0 functions deploy rac-ia --project-ref hofnhbxnfebfnncwxrds --use-api --no-verify-jwt`.
4. Push no `main` (site `2026-10-31.4`). Rodar o robô "Atualizar notícias" na mão uma vez, para a primeira edição.
5. Publicar a `rac-newsletter`: `npx supabase@2.121.0 functions deploy rac-newsletter --project-ref hofnhbxnfebfnncwxrds --use-api --no-verify-jwt`
   (o gateway não confere login; a função recusa quem não tem a senha da rotina). Trocar `RAC_NEWSLETTER_PUBLICADA` em
   `tests/seguranca.test.mjs`.
6. SQL `019_newsletter_avisos.sql` no SQL Editor. Tirar a linha `-- status: pendente` do 019.
7. Não rodar o 020.

## Testes

`tests/newsletter.test.mjs` (sem rede, sem custo): coletor com feeds fictícios (`tests/fixtures/newsletter`), falhas de
fontes, deduplicação, agrupamento, oito categorias, tipos, links, datas, relevância igual no Python e no site, edição,
busca e filtros, guardadas, histórico e semana, a ação de IA (DEMO, validação de JSON e de ids, idempotência, bloqueio
de geração repetida, orçamento, nenhuma chamada paga), avisos sem repetição e os SQL. `tests/navegador.test.mjs` abre a
página num navegador de verdade com os dados fictícios: tela de 375 px, guardar, busca, prévia DEMO sem salvar,
conferência REAL simulada e funcionamento sem internet. `tests/seguranca.test.mjs`: sem login nada é lido.

## Limitações

- O resumo (com ou sem IA) vem do título e do trecho do RSS: não há texto completo (de propósito, sem raspagem).
- O agrupamento não junta matérias em línguas diferentes (o mesmo fato em inglês e em português fica em dois grupos).
- Categorias por palavras-chave erram às vezes; as etiquetas secundárias e os pesos ajudam a compensar.
- O GitHub pode atrasar o agendamento; o aviso tenta três vezes e só sai quando a edição do dia já existe.
- Imagens vêm do site do veículo; sem internet, o cartão aparece sem a imagem.
