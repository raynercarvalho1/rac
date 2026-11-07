# Central Esportiva

A seção `#esportes` do RAC: dados esportivos ao vivo das fontes e uma camada de IA que interpreta esses dados.
Implementada em 01/11/2026. A IA funciona **só em DEMO** nesta etapa (decisão do dono, 31/10/2026).

## Páginas

| Rota | O que mostra | Arquivo |
|---|---|---|
| `#esportes` | Central: no topo, os **Destaques** de Lakers, Dodgers e Packers (o jogo mais recente de cada um, do mais recente ao mais antigo); logo abaixo o **Giro esportivo** (análise do dia com IA e as manchetes de todas as modalidades, com filtro); depois o que teve atividade nas últimas 24 horas e, por fim, os times sem jogos recentes (`NUCLEO.espCentralOrdem`). Não há aba própria do Giro: `#esportes/giro` abre a Central |
| `#esportes/beisebol` | MLB: destaque, resultados, próximos jogos, Dodgers, **classificação completa** (6 divisões, NL e AL), **líderes** (AVG, OBP, SLG, OPS, HR, RBI, SB; ERA, WHIP, K, BB, IP), mercado, rumores, prêmios | `js/esportes.js` + central |
| `#esportes/beisebol/dodgers` | Faixa, **análise com IA**, **desempenho recente**, **estatísticas do time com a posição na MLB**, **comparação com a divisão**, **jogadores em melhor fase**, **comparador de jogadores**, **calendário e retrospecto**, mercado, rumores, Ohtani | idem |
| `#esportes/basquete` (Lakers) e `#esportes/futebol-americano` (Packers) | Faixa e jogos, **análise com IA**, **desempenho recente**, classificação (NFL agora com AFC e NFC), **estatísticas do time**, **comparação com os rivais**, tabela, notícias do time, **líderes da liga**, **notícias da liga**, último jogo | idem |
| `#esportes/futebol` | Principais notícias, transferências e destaques, resultados dos últimos 3 dias (Brasileirão, Libertadores, Champions, Premier League, LaLiga, Serie A), classificação do Brasileirão e da Premier League | `js/esportes-central.js` |

Em negrito, o que esta etapa acrescentou.

## Fontes

- **MLB:** API oficial (`statsapi.mlb.com/api/v1`): agenda, placares, classificação, estatísticas de time (`/teams/stats`),
  líderes (`/stats/leaders`), elenco com estatísticas por período (`byDateRange`), séries de playoffs (`seriesStatus`), transações e as datas oficiais da temporada (`/seasons`).
- **NBA, NFL, futebol e as outras modalidades:** ESPN (`site.api.espn.com`): agenda do time, classificação, estatísticas do time, líderes (`/apis/site/v3/.../leaders`), notícias e placares.
- **Rumores da MLB:** MLB Trade Rumors, pelo robô `scripts/atualizar_rumores.py` (já existia).

Tudo é lido no aparelho quando a página abre (as duas APIs aceitam o site). Cada quadro diz a fonte e o período.
As notícias mostram fonte, data e o link para a matéria original; vídeos de melhores momentos ficam fora das listas.

## Temporada certa

`NUCLEO.espTemporada(liga, hoje, info)` decide o ano e a fase (pré-temporada, temporada regular, playoffs, fora de temporada):

- **MLB:** pelas datas oficiais (`/seasons`). Antes do dia de abertura, as estatísticas ainda são as da temporada anterior.
  `SEASON` começa com uma estimativa pelo calendário e é confirmado por `mlbTemporada()` antes de qualquer página da MLB ser desenhada.
- **NBA e NFL:** pelo `currentSeason` da ESPN (NBA 2026-27 = ano 2027; NFL = ano do começo). Sem resposta, pelo calendário (marcado como estimado).

Nada mais é escrito à mão: o desfecho dos Dodgers ("eliminados na Final da Liga pelo…") vem de `NUCLEO.mlbDesfecho()` sobre os jogos oficiais de playoffs,
e "a próxima temporada começa em…" vem da data oficial da MLB (se ainda não foi divulgada, a frase não aparece).

## Análise com IA

Duas ações novas na `rac-ia` (`supabase/functions/rac-ia/acoes.ts`), com a mesma infraestrutura de sempre (contrato, papéis, modo decidido pelo servidor,
reserva, idempotência, orçamento e registro em `ia_uso`):

| Ação | Foco | Modelo | Papéis | Pode ser REAL |
|---|---|---|---|---|
| `esportes.analise` | contexto `foco`: `dodgers`, `lakers` ou `packers` | `claude-haiku-5-5` | só dono | **não** (`real: false`) |
| `esportes.giro` | contexto `data` | `claude-haiku-5-5` | só dono | **não** (`real: false`) |

Ficam em DEMO por três travas: `real: false` no código, a constraint `ia_config_acoes_reais_permitidas` do banco (que não aceita `esportes.*`)
e nenhuma migração nova. Ligar o REAL exige código novo, um SQL novo, publicação da função e autorização do dono.

**Pacote de fatos (obrigatório).** O site junta os dados das fontes e monta, com `NUCLEO.espFatos()`, uma lista de fatos:
`<fato id="f01" fonte="MLB Stats API" periodo="2026-09-26 a 2026-10-15">Últimos 10 jogos…</fato>`. Cada fato é uma frase escrita pelo sistema com números
tirados da fonte (inclusive as contas do RAC, como médias e variação, marcadas com a fonte "cálculo do RAC sobre…").

- Dodgers: fase da temporada, campanha, desfecho dos playoffs, últimos 10 e os 10 anteriores, variação, cada um dos 10 jogos, rebatida e arremesso com a posição na MLB,
  os rivais da NL Oeste, jogadores em melhor fase no período e as movimentações oficiais dos últimos 30 dias.
- Lakers e Packers: fase, campanha, forma, jogos, estatísticas do time, rivais da conferência (NBA) ou da divisão (NFL), jogadores do time entre os líderes da liga e as manchetes do time.
- Giro: até 4 manchetes por modalidade, o último jogo de cada time do dono e as melhores campanhas recentes (NBA, NFL e, na temporada, MLB).

**A IA só interpreta.** As instruções proíbem acrescentar estatística, resultado, data, lesão, notícia ou conta nova. A resposta tem `titulo`, `resumo` + `resumo_fatos`,
`pontos` (destaque, tendência, atenção ou comparação, cada um com `fatos`) e `insuficiente` (o que os dados não permitem dizer).
A validação do servidor recusa a resposta inteira se: um id não estava no pacote; um trecho não cita fato; **qualquer número escrito não aparece nos fatos que aquele trecho cita**;
o título ou `insuficiente` tem número. O aparelho confere de novo (`NUCLEO.espAplicarIA`) antes de mostrar.

**Período, fontes e horário são do sistema**, mostrados abaixo da análise a partir do pacote, nunca da resposta da IA.
O botão "Ver os dados que serão enviados" mostra o pacote antes de qualquer chamada.

**Sob demanda.** Só acontece quando o dono toca em "Analisar … com IA". Com menos de 3 fatos, nada é enviado ("dados insuficientes").
Não há geração automática, nem repetição sozinha.

**Sem pagar duas vezes.** A chave de idempotência é `NUCLEO.espChaveIA(ação, foco, fatos)`: os mesmos fatos dão a mesma chave, e o servidor recusa a
repetição. Em REAL, a análise conferida fica guardada neste aparelho (`localStorage` `rac-esp-ia-v1`, as 8 mais recentes) e aparece de novo sem chamar.
Resposta DEMO nunca é guardada. Se uma chamada paga falhar, repetir é um botão a mais, com confirmação (o mesmo desenho da Newsletter).

**Nada grava.** A Central não escreve no banco; a análise só é mostrada.

## Testes

`tests/esportes.test.mjs` (sem rede e sem custo): temporada das três ligas, desfecho dos playoffs, desempenho recente, pacote de fatos, chave, conferência
no aparelho, cache, as duas ações (Haiku, só dono, DEMO mesmo com o banco liberando, validação dos números e ids, DEMO válido), nenhuma migração citando
`esportes.*`, sem temporada fixa nem resultado escrito à mão, rotas, Central sem banco e com uma única chamada `racIA("esportes", …)`, notícias com fonte, data e link.

## Limitações conhecidas

- As fontes da ESPN e do MLB Trade Rumors são em inglês; os nomes e as manchetes aparecem como vieram.
- Não há fonte de lesões confiável integrada: a IA é instruída a não falar de lesões que não estejam nos fatos (as movimentações oficiais da MLB, como lista de lesionados, entram quando existem).
- As APIs da ESPN não têm documentação oficial e podem mudar sem aviso; cada quadro mostra "não consegui carregar" quando isso acontece.
- Futebol cobre seis competições e só os últimos 3 dias de resultados.
- Comparações entre jogadores existem só para os Dodgers (elenco da temporada); para Lakers e Packers, a comparação é entre times.

## Ordem das páginas dos times (07/11/2026)

- **Lakers e Packers** (`#esportes/basquete`, `#esportes/futebol-americano`): faixa, **Destaque** (1º item), **Tabela da temporada** (2º), análise com IA, **Desempenho recente**, **Classificação**, e só então **Últimos resultados e Próximos jogos**; depois estatísticas, comparação, notícias e o último jogo em detalhes.
- **Dodgers** (`#esportes/beisebol/dodgers`): faixa, **Calendário e retrospecto** (a tabela da temporada), análise com IA, **Desempenho recente**, comparação com a divisão (a classificação), **Últimos jogos**; depois estatísticas, jogadores em melhor fase, comparador, mercado e rumores.
