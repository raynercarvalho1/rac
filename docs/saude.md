# Saúde (`#saude`) · hub de recuperação, sono, treino e condicionamento (DS-4.3)

Guia funcional da Saúde no RAC Modern Workspace. Especificação: [Documento 09](planejamento/09-auditoria-saude-garmin.md) (seções 5 a 13, 16 e 18 e a seção 19, que registra esta entrega).
Só o dono vê a página (a Fernanda não tem a rota; as tabelas têm RLS só do dono). Sem IA, sem chamada paga e sem escrever nas tabelas do relógio.

## Arquitetura

| Peça | Arquivo | Papel |
|---|---|---|
| Fonte única | `js/fonte-saude.js` | Única leitura de `garmin_dia` e `garmin_ativ` para análise: paginação (`dadosPaginar`), classificação `NUCLEO.sauClassificar` (só 01/01/2026 em diante é "meu"), leituras simultâneas iguais compartilham a consulta, estado completa/vazia/parcial/falha, último dia, origem e hora da atualização. `saudeLer()` mantém o contrato de Painel e Resumo |
| Regras puras | `nucleo.js`, prefixo `sau*` | Sinais, qualidade dos dados, indicadores, carga, musculação, VO₂ máx, intensidade, eficiência, S5, S8, S11, preferências. Testadas em `tests/saude_regras.test.mjs` |
| Tela | `js/saude-hub.js` | Abertura, 7 abas, filtros, ocultar valores, ajustes. Usa `js/kit.js` (`rk*`) e `js/graficos.js` (`rs*`); todo gráfico com `racDica` |
| Treino | `js/saude.js` | Página `#saude/treino/ID` (mapa, percurso, séries, gráficos, voltas), sincronização, recuperação do histórico |
| Estilo | `css/rac.css`, seção 6 | Faixa de abas, 5 indicadores, estágios do sono (só tokens de cor) |

Consumidores que passaram à fonte única, sem mudar contrato nem resultado: RAC Hoje (`js/hoje.js`), Sistema (prontidão e busca de treinos), Carreira, Painel e Resumo (via `saudeLer`/`saudeCarregar`). O Monitor do Sistema continua lendo só `atualizado` (mede a integração, não é análise); backup e função guardam tudo, de propósito.

## Rotas

`#saude` (Visão geral), `#saude/recuperacao`, `#saude/sono`, `#saude/atividades`, `#saude/condicionamento`, `#saude/tendencias`, `#saude/inteligencia` e `#saude/treino/ID` (como sempre). As abas usam o 2º trecho da rota do roteador existente.

## As abas

- **Visão geral**: data, frase-resumo (só com o que os dados dizem), 5 indicadores (Prontidão, Sono, VFC, FC de repouso, Body Battery) com o seu normal de 60 dias quando há 14 valores de base, até 3 sinais persistentes, último treino, semana contra a meta, diário de humor.
- **Recuperação**: Prontidão explicada (é cálculo do RAC, não o Training Readiness da Garmin; fórmula e resultados inalterados), VFC com faixa pessoal e a da Garmin, FC de repouso, Body Battery, estresse (30 dias), sinais S1 a S3, glossário.
- **Sono**: última noite, média de 7 dias, horários e regularidade, estágios (estimativa do relógio, não exame), tendência, meta pessoal e déficit, S4, sono × VFC (S5).
- **Atividades**: todos os tipos (inclusive aparelhos, águas abertas e bike), filtro por modalidade e período, consistência (`NUCLEO.pnConsistencia`, a do Painel; S7), carga semanal (S6), musculação (S9), esforço do período, histórico com "ver mais".
- **Condicionamento**: VO₂ máx (só valores existentes; sem valor, explica), minutos de intensidade contra 150, eficiência aeróbica, idade do condicionamento (só o valor atual).
- **Tendências**: as 8 métricas em 30 dias, 3 meses e 1 ano; 4 semanas × 4 anteriores (S11), separando tendência de oscilação.
- **Inteligência**: todos os sinais com o "por quê", histórico (quando começou, quando deixou de ser relevante), análises de padrão, saúde dos dados (S12), ajustes, padrões antigos do diário (regras anteriores, preservadas) e o painel "Histórico anterior à posse".

## Regras dos sinais (todas em `nucleo.js`)

Cada sinal diz: observação, comparação com o seu normal, janela e amostra, **hipótese** (rotulada) e orientação leve. Nunca diagnostica. Limite fixo: "O relógio não substitui avaliação médica…".

| Sinal | Dispara quando | Cobertura exigida |
|---|---|---|
| S1 VFC | ≥3 das últimas 5 noites abaixo da faixa da Garmin; ou média de 7 dias < mediana (60 dias) − desvio robusto (mín. 3 ms) com ≥3 dessas noites abaixo do limite | ≥4 de 5 noites; ≥14 de base |
| S2 FC de repouso | ≥5 bpm acima da mediana de 30 dias em ≥3 dos últimos 5 dias | ≥4 de 5; ≥14 de base |
| S3 Estresse | média de 7 dias ≥ mediana (60 dias) + 10 e ≥5 de 7 dias elevados | ≥5 de 7; ≥14 de base |
| S4 Sono | <6 h em ≥3 das últimas 5 noites; ou horário de dormir com desvio >60 min em 14 noites (≥8 horários) **e** média de 7 dias abaixo da meta (7 h, editável) | ≥4 de 5 |
| S12 Dados | último dado/atualização >24 h suprime **todos** os sinais; cobertura <70% em 14 dias é avisada e suprime o sinal da medida | — |

**Histerese**: o sinal liga no primeiro dia do critério e só desliga depois de 2 dias normais seguidos (dia sem dado não conta como normal). O histórico guarda cada episódio.

Análises: **S5** sono × VFC (8 semanas, ≥8 pares, |r| ≥ 0,4; sempre associação); **S6** carga semanal na escala da Garmin (nunca preenchida com minutos; ≥3 treinos com carga nas 4 semanas de referência; persistente = 2 semanas completas ≥1,3× ou ≤0,7× a média; pico isolado ≥1,5× não vira sinal); **S8** dias até a VFC voltar à mediana depois de treino forte (percentil 60 da carga diária, ≥5 treinos analisados); **S9** intervalo entre sessões de musculação (sem grupo muscular); **S10** mediana móvel de 4 semanas do VO₂ máx, tendência só com ≥1 ponto em duas janelas; **S11** 4 semanas × 4 anteriores com limiar por medida, tendência só se repetir numa janela deslocada 2 semanas.

## Preferências e privacidade

Guardadas em `PESSOAL.saudePrefs` (mecanismo `pessoalGravar` já existente; sem tabela, migration ou SQL): meta de sono (7 h), meta de treinos (3 por semana; **caminhada não conta** para a meta, na Visão geral e na aba Atividades, e continua na lista e no histórico; `NUCLEO.sauContaTreino`), **ocultar valores** (máscara de apresentação: valores, dicas dos gráficos e detalhes dos sinais; dados e contas não mudam) e **esconder o local** (telas e busca global). Local, coordenadas e rotas nunca entram em sinais, textos de análise, testes, logs ou notificações.

## Fora do escopo desta entrega

Mapas e trajetos históricos (S7 do roadmap), IA de Saúde (S8), coleta extra da Garmin (S6 do roadmap), qualquer alteração em `supabase/functions/garmin`, SQL, secrets, cron ou workflows, e a recuperação do histórico anterior a 01/11/2025 (opcional, adiada pelo dono).

## Dados extras do relógio (Lote 2, corrigido em 23/11/2026)
A função `garmin` tem o tipo `extras` (`supabase/functions/garmin/extras.ts` + `sincExtras` em `index.ts`), com os **endpoints oficiais da Personal API** (conferidos no cliente Python publicado pela Garmin, `github.com/garmin/connect-personal-api-python`):

| Dado | Endpoint | Consulta |
|---|---|---|
| Batimentos | `GET /wellness-service/wellness/dailyHeartRate?date=` | por data |
| SpO₂ | `GET /wellness-service/wellness/daily/spo2acclimation/{data}` | por data |
| Estresse | `GET /usersummary-service/stats/stress/daily/{ini}/{fim}` | por intervalo |
| Body Battery | `GET /wellness-service/wellness/bodyBattery/reports/daily?startDate=&endDate=` | por intervalo |
| Peso | `GET /weight-service/weight/range/{ini}/{fim}?includeAll=true` | por intervalo |
| VO₂ máx | `GET /metrics-service/metrics/maxmet/daily/{ini}/{fim}` | só sondagem (formato não confirmado; não grava) |

- **Intervalos:** uma consulta por janela de até 28 dias (hipótese conservadora, o mesmo limite dos resumos diários), nunca uma por dia. Por data: 7 em paralelo.
- **Fora da Personal API:** Training Status e Training Readiness (e o tempo de recuperação deles) **não têm endpoint documentado**: não são chamados nem gravados; a sondagem os lista em `fora_da_api_pessoal`. Respiração segue vindo dos resumos diário e de sono já coletados.
- **Gravação:** só `garmin_dia.dados.extras` (chaves `fc`, `spo2`, `estresse`, `bb`, `peso`), acrescentando; nunca apaga nem troca; nunca grava resposta vazia; só atualiza dias que já têm linha. Cada consulta é isolada; HTTP 204 e corpo vazio = "sem dado", diferente de "erro NNN" e de "falha de rede".
- **Formato das respostas:** o cliente da Garmin devolve o JSON bruto e não o descreve; os leitores aceitam os nomes conhecidos e não inventam número. **A sondagem (Inteligência → Dados extras do relógio → Testar) devolve só a estrutura (nomes e tipos, sem valores)**, inclusive dos três conjuntos já coletados (resumo diário, sono, VFC), para ajustar os leitores e achar campos úteis antes de ampliar o que se grava.
- A função precisa ser **republicada** depois de cada mudança aqui. Testes: `tests/garmin_extras.test.mjs`.

## Mapa geral dos percursos (Lote 3, 23/11/2026)
Saúde → Atividades → **Mapa geral dos percursos** (só o dono; desligado quando "esconder o local" está ativo nos Ajustes). Mostra num só mapa (Leaflet/OpenStreetMap) as rotas dos treinos do filtro de modalidade e período da aba, em linhas finas e translúcidas (onde mais se anda fica mais forte), com o ponto de partida de cada treino.
- **Dados:** tabela nova `garmin_rotas` (migration `supabase/065_garmin_rotas.sql`, aditiva, RLS só do dono + trava "mfa", sem anon, no backup): uma linha por treino com até 150 pontos `[lat, lon]` (5 casas, cerca de 1 m). Treino sem GPS grava `pontos = []`.
- **Quem grava:** a função `garmin`, tipo `rotas` (`sincRotas`, `rotas.ts`): baixa o .FIT dos treinos que ainda não têm linha, em blocos de até 10, e a rotina diária busca os novos. O site só **lê** a tabela. O botão "Buscar rotas dos treinos" recupera os treinos antigos (uma vez só).
- **Ordem de publicação:** SQL 065 → função `garmin` → site. A função antiga é denunciada pela resposta sem `restantes`.
- Testes: `tests/garmin_rotas.test.mjs`.

## Publicar a função garmin sem colar arquivos (workflow manual)
`.github/workflows/garmin-publicar.yml` (manual, só main, Environment `supabase-producao` com o segredo `SUPABASE_ACCESS_TOKEN`). Passos únicos do dono: (1) criar um token de acesso pessoal no Supabase; (2) no GitHub, criar o Environment `supabase-producao`, aceitando só a `main`, e guardar o token como segredo; (3) em Actions → "Publicar a função garmin" → Run workflow, informando a versão exata da CLI. **Não foi testado em produção.**
