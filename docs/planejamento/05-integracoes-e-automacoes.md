# RAC · 05 · Integrações e automações

Inventário real das integrações, robôs e agendamentos, o que já existe para saber quando algo para, a proposta do Monitor
de integrações, as automações futuras e o que a integração Garmin entrega de verdade (13/11/2026).
Convenções [Fato] / [Hipótese] / [Recomendação]: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

## 1. Inventário de integrações [Fato]

| Integração | Para quê | Onde roda | Credencial | Grava em | Como se sabe hoje que falhou |
|---|---|---|---|---|---|
| Supabase (Postgres, Auth, Storage, Realtime) | Banco, login, arquivos, lista em tempo real | site e servidor | chave pública no site; secreta só nas funções | tudo | erro na tela; `erros` |
| Garmin (API pessoal) | Dias (resumo, sono, VFC, idade fitness) e treinos | função `garmin` | secret `GARMIN_PERSONAL_API_KEY` | `garmin_dia`, `garmin_ativ` | `rotina_log` (passos), `erros`, idade do último dado no Sistema |
| Anthropic (Claude) | RAC Intelligence | função `rac-ia` | secret `ANTHROPIC_API_KEY` | `ia_uso` | estado da chamada em `ia_uso`; mensagens da tela |
| Web Push (VAPID) | Avisos no celular | funções `garmin`, `rac-newsletter`, `radar` | chaves VAPID em `rac_segredos` | `push_inscricoes` | resumo do passo em `rotina_log`; Sistema → Notificações |
| Telegram (opcional) | Cópia do aviso diário | função `garmin` | secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | — | resumo em `rotina_log` |
| Open-Meteo | Tempo e chuva | site (`js/app.js`, `js/hoje.js`) e função `garmin` | nenhuma | — | só a tela |
| MLB Stats API | Jogos, classificação, estatísticas | site (`js/esportes.js`) | nenhuma | — | só a tela |
| ESPN (API pública do site, não oficial) | NBA, NFL, futebol | site (`js/esportes.js`, `js/esportes-central.js`) | nenhuma | — | só a tela |
| MLB Trade Rumors (RSS) | Rumores da MLB | robô `scripts/atualizar_rumores.py` | nenhuma | `rumores.json` | o robô falha de propósito; e-mail do GitHub |
| g1 e Google Notícias (RSS) | Notícias de Sorocaba | robô `scripts/atualizar_noticias.py` | nenhuma | `noticias.json` | idem |
| Google Notícias (RSS por tema) | Notícias de dados e tecnologia | robô `scripts/atualizar_tecdados.py` | nenhuma | `tecdados.json` | idem |
| 52 feeds RSS/Atom oficiais | Newsletter | robô `scripts/atualizar_newsletter.py` | nenhuma | `newsletter.json` (com `fontes[].ok`) | idem + fontes fora do ar no Sistema |
| Portal Mentora Dados | Vagas de Dados e BI | robô `scripts/atualizar_vagas.py` (página e `admin-ajax.php` do portal) | nenhuma | `vagas.json` | idem |
| Gmail API (hoje só leitura; futura expansão RAC Inbox) | Hoje: Compras online por e-mail e cartão de e-mail do Início; futuro: cliente multicon­ta, gestão e envio | Hoje: navegador (Google Identity Services), token de 1 h; futuro: OAuth no servidor | Hoje: ID de cliente público; futuro: tokens protegidos no servidor | Hoje: —; futuro: contas/sincronização a definir | Hoje: só leitura; futuro: leitura, envio e gestão conforme Documento 10 |
| Google Maps (opcional) / OpenStreetMap + Leaflet | Mapa do treino | site (`js/saude.js`) | chave opcional em `PESSOAL.googleMaps` | — | aviso na tela e troca para o OpenStreetMap |
| SerpApi (pago) | Descoberta de ofertas do Radar | função `radar` | secret do provedor | `radar_consultas`, `radar_candidatos` | `radar_consultas` (orçamento atômico) |
| Mercado Livre (API oficial) | Preço de anúncio do Radar | função `radar` | nenhuma | `radar_precos` | `radar_coletas` |
| GitHub Pages e Actions | Publicação do site e robôs | GitHub | `GITHUB_TOKEN` dos workflows | repositório | e-mail do GitHub; selo de testes no Sistema |
| CDNs (cdnjs, jsDelivr), Google Fonts | Bibliotecas e fontes com versão exata | site | nenhuma | cache do service worker | só a tela |


## 1.1 RAC Inbox — expansão de e-mail planejada (13/11/2026)

O cartão atual de e-mail do Início lê Gmail; não é um cliente completo. O dono aprovou o RAC Inbox como próxima grande frente após a conclusão da Saúde S1–S5, com objetivo de substituir o Spark no uso diário.

- Gmail: evoluir para OAuth apropriado ao servidor e capacidades de leitura/escrita, envio, filtros e organização via API.
- Outlook/Hotmail/Live: avaliar Microsoft Graph para mensagens, pastas, envio e regras.
- iCloud: avaliar IMAP/SMTP com senha específica do app; onde não houver API pública de regras nativas, oferecer regras executadas pelo próprio RAC com essa limitação explícita.
- A fase I0 deverá provar conectividade e portas na infraestrutura real. SMTP iCloud (porta 587 documentada pela Apple) é ponto de risco a testar antes da decisão arquitetural.
- Nenhuma credencial ficará no navegador. Nenhuma conta real será conectada, migration aplicada ou serviço publicado antes das fases próprias e das autorizações correspondentes.

Especificação: [Documento 10 · RAC Inbox](10-rac-inbox.md).


Riscos externos [Fato/Hipótese]: a API da ESPN não é oficial e pode mudar sem aviso; o Google Notícias pode limitar robôs; a
chave pessoal da Garmin pode expirar ("a Garmin recusou a chave" é tratado na função); os créditos da Anthropic são pré-pagos
e sem recarga; o GitHub atrasa ou pula agendamentos (por isso a Newsletter tem tentativas de hora em hora); o plano do
Supabase limita arquivos a 50 MB.

## 2. Agendamentos [Fato]

| Processo | Onde | Quando (UTC) | Horário de Brasília | O que faz |
|---|---|---|---|---|
| `rac-rotina` | pg_cron (`008`) → função `garmin` | `0 9 * * *` | 6h | Garmin (dias, até 13 blocos de 28 dias, e treinos), tempo, resumo da semana (domingo), "deve estar acabando", aviso da Agenda (push e Telegram), resumo de alertas de preço (domingo), backup semanal (domingo); grava `rotina_log` |
| `rac-newsletter` | pg_cron (`023`) → função `rac-newsletter` | `50 0-2,9-23 * * *` | de hora em hora | Edição base de cada turno (6h, 12h, 18h), resumo com IA (só REAL validado), no máximo um aviso por dia |
| `radar-rotina` | pg_cron (`045`) → função `radar` | `20 9,21 * * *` | 6h20 e 18h20 | Coleta de ofertas, descoberta (se ligada), aviso de oportunidade |
| Atualizar notícias | GitHub (`noticias.yml`) | `15 */3 * * *` e `40 * * * *` | a cada 3 h (+ Newsletter de hora em hora, só se preciso) | Notícias, tecnologia, rumores e Newsletter; commit na `main` |
| Atualizar vagas | GitHub (`vagas.yml`) | `0 10 * * *` | 7h | `vagas.json`; commit na `main` |
| Testes | GitHub (`testes.yml`) | push e PR na `main` (exceto os `.json` dos robôs) e `30 10 * * 1` | segunda, 7h30 | Grupo 1 e Grupo 2 |
| Publicação | GitHub Pages | a cada push na `main` | — | Publica o site (inclusive a cada commit dos robôs) |

[Fato, 13/11/2026] O GitHub atrasa e pula agendamentos: o robô de Vagas (agendado para 10h UTC) começou entre 15h57 e 20h16 UTC em
todas as execuções de 07/11 a 12/11; o de Notícias teve 96 execuções desde a criação do workflow (26/10) até 13/11, cerca de 5 por dia, bem menos que as rodadas
agendadas. Por isso o monitor (seção 4.3) mede os robôs pela idade da última execução, e não pelo horário do cron.

[Fato] Os robôs fazem commit direto na `main` como `github-actions[bot]` (284 dos 358 commits do histórico são desse autor,
somando robôs e o fluxo antigo de publicação). Cada commit de robô dispara uma publicação do Pages. Desde 13/11/2026 a `main`
tem uma ruleset de proteção ativa (criada pelo dono); falta comprovar que os pushes dos robôs de Notícias e Vagas continuam
passando depois dela ([Documento 07](07-decisoes-e-pendencias.md#pendências-técnicas)).

## 3. Registros (logs) que já existem [Fato]

| Registro | Quem grava | O que tem | Falta |
|---|---|---|---|
| `rotina_log` | função `garmin` | quando, ok, resumo por passo (`garmin_dias`, `garmin_treinos`, `chuva`, `alertas`, `alertas_preco`, `backup`…) | duração, contagem padronizada |
| `erros` | site e funções | quando, origem, mensagem, detalhe, aparelho | — |
| `radar_coletas` | função `radar` | origem, status, início e fim, ofertas lidas, preços gravados, falhas, erro | — (é o modelo a seguir) |
| `radar_consultas` | função `radar` | consultas pagas, reserva e conclusão | — |
| `newsletter_edicoes`, `newsletter_avisos` | função `rac-newsletter` | edição por turno, origem (`regras`/`ia`), avisos enviados | registro de execução sem edição |
| `ia_uso` | função `rac-ia` | estado da chamada, tokens, custo estimado | — |
| JSON dos robôs | robôs | `coletado`; Newsletter com `fontes[].ok`; rumores com `falhas`; vagas com `paginas_lidas` | duração, itens novos, erro |
| Execuções do GitHub Actions | GitHub | início, fim, conclusão de cada workflow (API pública do repositório) | não é lida pelo RAC |

## 4. Monitor de integrações

### 4.1 O que já existe [Fato]

Página Sistema (`js/sistema.js`): **"Saúde do RAC"** (`sisSaude`) com cinco linhas — sincronização, coletas (idade de cada JSON,
do último dado do relógio e da rotina das 6h), fontes que falharam em 30 dias (`erros`), notificações e backup — e o painel
**"Robôs de coleta"**, com a idade, a quantidade de itens e as fontes fora do ar da Newsletter, além do selo do workflow de testes.

Limites: não mostra duração, registros processados por execução, próxima execução nem histórico; não cobre a rotina do Radar, a
rotina da Newsletter nem as chamadas da IA; só aparece quando a página Sistema é aberta; o único alerta proativo é o e-mail do
GitHub quando um robô falha.

### 4.2 Proposta: um contrato de execução, sem duplicar logs

Cada processo passa a ser descrito pelo mesmo formato, **calculado a partir dos registros que já existem** (nenhum log novo
na primeira fase):

`{processo, area, ultima_execucao, ultimo_sucesso, duracao, registros, falhas, erro, proxima_prevista, estado}`
com `estado` = ok · atrasado · falhou · desligado · desconhecido.

| Processo | Fonte do estado | Registros processados | Próxima prevista |
|---|---|---|---|
| Rotina das 6h (e cada passo) | `rotina_log` | resumo do passo (`garmin_dias`, `garmin_treinos`, `itens`…) | `0 9 * * *` |
| Garmin (último dado) | `garmin_dia.atualizado` | — | depende da rotina |
| Newsletter (rotina) | `newsletter_edicoes` (última edição e origem) | grupos da edição | `50 0-2,9-23 * * *` |
| Radar (rotina) | `radar_coletas` | `ofertas_lidas`, `precos_gravados`, `falhas` | `20 9,21 * * *` |
| Robôs de notícias, tecnologia, rumores e Newsletter | `coletado` dos JSON + execuções do GitHub | quantidade no JSON | `15 */3 * * *` |
| Robô de vagas | `vagas.json` + execuções do GitHub | quantidade de vagas | `0 10 * * *` |
| IA | `ia_uso` (falhas e incertas) | chamadas do dia | — |
| Backup semanal | Storage `backups` | — | domingo, na rotina |
| Push | `push_inscricoes` + resumo da rotina | aparelhos inscritos | — |

Fases [Recomendação]:

| Fase | O que | Migration? | Critério de conclusão |
|---|---|---|---|
| M1 | Regras puras no núcleo (`NUCLEO.mon*`): normalizar cada fonte no contrato acima, calcular "próxima prevista" a partir das expressões cron e classificar o estado; tela "Monitor de integrações" no Sistema e um cartão no RAC Hoje só quando algo estiver vermelho. Um teste lê os `.yml` e os `.sql` e falha se o horário do monitor divergir do agendamento real | Não | Todos os processos da tabela aparecem com estado; teste de divergência de horários |
| M2 | Robôs gravam no JSON também `duracao_s`, `itens` e `falhas` (Python, sem segredo); o monitor lê as execuções do GitHub pela API pública (leitura, sem token, limite de 60 consultas por hora, com cache) | Não | Duração e contagem de cada robô visíveis |
| M3 | Uma view no banco (`security_invoker`) que junta `rotina_log`, `radar_coletas`, `newsletter_edicoes` e `ia_uso` no formato do contrato, para o servidor e a IA lerem o mesmo que a tela | Sim (pequena) | Mesmo resultado na tela e na view (teste PGlite) |
| M4 | Alerta proativo: uma função agendada no banco detecta processo atrasado e cria um **sinal** ([Documento 04](04-rac-intelligence.md)); o aviso sai no resumo diário | Sim | Robô parado aparece como sinal e no aviso das 6h, uma vez |

Para o aviso por push de M4 é preciso uma Edge Function que envie (a `garmin` é intocável sem autorização): decisão do dono
([Documento 07](07-decisoes-e-pendencias.md)).

### 4.3 Implementação de M1 e M2 (Fase 1, 13/11/2026)

Estado: **na branch** `claude/fase-1-confiabilidade-rac-dhwm7a`, no PR da Fase 1; **sem merge e sem publicação**. Sem migration, sem SQL
em produção, sem Edge Function. A proposta das seções 4.1 e 4.2 fica como estava; esta seção registra o que foi feito.

[Fato] O que foi feito:

- **M1**: o catálogo `MON_PROCESSOS` em `nucleo.js` lista os 6 processos agendados (3 no pg_cron e 3 no GitHub), com os crons copiados
  dos arquivos vigentes. `tests/monitor.test.mjs` lê os `.yml` de `.github/workflows/` e o pg_cron das migrations (a última que agenda
  cada job) e falha se um horário divergir, se faltar um agendamento, se o monitor mostrar um que não existe ou se citar uma migration
  substituída. As regras puras (`NUCLEO.mon*`) calculam a próxima execução pelo cron real e montam o contrato da seção 4.2.
- **Tela**: a página Sistema ganhou o painel "Monitor de integrações", logo depois da "Saúde do RAC" (`sisMonitor` em `js/sistema.js`).
  Ele incorpora o antigo painel "Robôs de coleta" (itens, fontes fora do ar e os mesmos limites de 8 h, 14 h e 30 h), que saiu para a
  mesma informação não ficar em dois lugares. O painel "Rotina automática" (as 10 últimas rotinas) continua.
- **M2**: duração, falhas em 7 dias, "rodando agora", workflow desligado e o atraso típico de cada robô vêm das **execuções públicas do
  GitHub** (API sem login; 4 consultas guardadas 15 min no aparelho; só as execuções da `main`, para um PR com teste falhando não virar
  falha do processo; sem resposta, vale a data do próprio JSON do robô). A contagem de
  itens vem dos JSON que os robôs já gravam.

| Processo | Fonte | Fica "atrasado" quando |
|---|---|---|
| Rotina das 6h (`rac-rotina`) | `rotina_log` (mais o último dado do relógio e o backup de domingo) | não rodou desde o último horário previsto, com 60 min de tolerância |
| Newsletter (`rac-newsletter`) | `newsletter_edicoes` (última edição gravada) | sem edição há mais de 14 h |
| Radar (`radar-rotina`) | `radar_coletas` da rotina (as lojas da mesma rodada viram uma execução) | nunca: sem registro no horário fica "sem informação", porque a rotina só grava quando há oferta para ler |
| Robô de notícias (`noticias.yml`) | execuções do GitHub e os 4 JSON | sem execução há mais de 8 h, ou um JSON parado ou vazio |
| Robô de vagas (`vagas.yml`) | execuções do GitHub e `vagas.json` | sem execução há mais de 30 h, ou o JSON parado ou vazio |
| Testes (`testes.yml`) | execuções do GitHub | sem execução há mais de 8 dias |

Estados: ok · atrasado · falhou (a última execução falhou) · desligado (workflow desligado no GitHub) · sem informação (fonte ilegível ou
sem registro). Nada é inventado: sem dado, o painel diz "sem informação" ou "não registradas".

Diferenças em relação à proposta da seção 4.2, e por quê:

- **M2 sem mexer nos robôs**: a proposta previa gravar `duracao_s`, `itens` e `falhas` nos JSON. Isso duplicaria o que o GitHub já
  registra em cada execução (início, fim e conclusão) e mexeria nos scripts dos robôs no meio da comprovação depois da ruleset.
- **Sem cartão no RAC Hoje por enquanto**: ligar o monitor ao RAC Hoje agora repetiria o acoplamento P-04; fica para depois do contrato de
  fontes (passo A4) ou para a F5.
- **IA e push** continuam na "Saúde do RAC" e em Custos de IA: não são processos agendados próprios (o push e o backup são passos da
  rotina das 6h e aparecem na linha dela).

[Fato] Limites conhecidos: o horário do pg_cron mostrado é o das migrations; o site não lê `cron.job` em produção. Se um agendamento
mudar direto no SQL Editor, o monitor só saberá pelo arquivo. Conferência só leitura, pelo dono, quando quiser:
`select jobname, schedule, active from cron.job order by jobname;`. A rotina das 6h não registra o início (sem duração) e a Newsletter
não registra as tentativas sem edição (falhas "não registradas").

## 5. Automações futuras

| Automação | Detecção | Ação | Canal | Depende de |
|---|---|---|---|---|
| Medicamento próximo do vencimento | regra sobre a validade (30 e 7 dias) | sinal | RAC Hoje + resumo diário | tabela de medicamentos |
| Encomenda recebida | cadastro na portaria (manual) ou e-mail lido pelo dono | sinal "na portaria" | RAC Hoje | tabela de encomendas |
| Conta próxima do vencimento | regra sobre o vencimento (3 dias) | sinal | RAC Hoje + resumo diário | tabela de contas |
| Robô com falha | monitor (M1/M4) | sinal | RAC Hoje + resumo diário | Monitor |
| Preço alterado | **já existe** (alertas do Mercado e avisos do Radar) | aviso | push semanal / diário | — |
| Garantia próxima do fim | **já existe** (`vigenciaFim` no aviso das 6h) | aviso | push diário | — |

## 6. n8n: avaliar depois, não agora

[Recomendação] **Não introduzir agora.** O que existe cobre as necessidades: pg_cron no banco (agendamento perto dos dados),
Edge Functions (segredos e chamadas externas), GitHub Actions (robôs públicos) e o RAC Hoje/Monitor (apresentação). O n8n
acrescentaria um servidor para hospedar e manter, uma cópia dos segredos fora do Supabase, outra superfície de ataque e outro
lugar para depurar. Reavaliar se: (a) surgirem integrações com muitos passos e serviços de terceiros que não cabem bem numa Edge
Function; (b) o dono quiser montar automações sem código; (c) houver necessidade de webhooks de muitos serviços. Até lá, toda
automação nova segue o padrão "regra → sinal → apresentação".

## Garmin: o que existe de verdade

### O que a integração coleta hoje [Fato]

Pela API pessoal da Garmin (`https://personal.connectapi.garmin.com`, chave pessoal no secret), a função `garmin` usa 7 chamadas:

| Chamada | Dados guardados | Onde |
|---|---|---|
| Resumo diário (`usersummary-service`) | passos, meta, distância, andares, FC de repouso/mín/máx, estresse médio/máx, proporção de estresse alto e de descanso, Body Battery (mín, máx, carga, gasto), minutos moderados e vigorosos, calorias totais e ativas, respiração, SpO2 | `garmin_dia.dados` |
| Sono (`sleep-service`) | total, profundo, leve, REM, acordado, nota e qualificação, despertares, estresse no sono, respiração, SpO2, horário de início e fim | `garmin_dia.dados.sono` |
| VFC (`hrv-service`) | média da noite, média semanal, pico de 5 min, status, faixa pessoal (mín e máx) | `garmin_dia.dados.vfc` |
| Idade fitness (`fitnessage-service`) | idade fitness, real e possível (só o dia de hoje) | `garmin_dia.dados.idadeFitness` |
| Lista de treinos (`activitylist-service`) | tipo, início, nome, **local** (nome do lugar que a Garmin dá), distância, duração, velocidade, FC, calorias, subida, passos, voltas, carga, efeito aeróbico e anaeróbico, VO2máx, cadência, passada, potência, natação, séries e repetições, minutos de intensidade, zonas de FC, recorde | `garmin_ativ` |
| Detalhe do treino (`activity-service`) | resumo completo | **não guardado**: lido na hora em que o treino é aberto |
| Arquivo original do treino (`.FIT`, `download-service`) | série (FC, velocidade, altitude, cadência, temperatura, até 600 pontos), **rota GPS (latitude e longitude com 6 casas, até 1.500 pontos)**, voltas, séries de musculação | **não guardado**: lido na hora e mantido só na memória da página (`TREINO_DET` em `js/saude.js`) |

Limites conhecidos [Fato]: **marco de propriedade em 01/01/2026, inclusive** (DS-4.2; o relógio foi comprado usado): o que tem data anterior é `legado`, preservado no banco e no
backup e fora de toda análise (`NUCLEO.sauClassificar`); a função `garmin` não corta por data nem apaga nada (o corte antigo de 01/11/2025 e as exclusões foram removidos); a primeira
sincronização volta um ano; a rotina refaz os 2 últimos dias (que ainda mudam); o botão ↻ nunca chama o relógio.

O que o site faz com isso [Fato]: prontidão (VFC, FC de repouso, sono e Body Battery contra a mediana de 60 dias), tendências,
sono, padrões treino × VFC e sono, horário de dormir × nota do sono (`saudeInsights`), página do treino com mapa colorido pela
velocidade (Google Maps com chave do dono ou OpenStreetMap), resumo semanal no domingo, Painel de Produtividade e RAC Hoje.

### O que pode existir e ainda não é usado [Hipótese]

A API pessoal da Garmin provavelmente oferece outros serviços (composição corporal e peso, prontidão de treino e status de
treino calculados pela Garmin, carga aguda, linha do tempo de estresse e de frequência cardíaca, hidratação, pontuações de
resistência). **Nada disso foi confirmado**: a rede deste ambiente não alcança a Garmin e a função é intocável sem autorização.
Para confirmar: o dono autoriza uma investigação só de leitura (documentação oficial da API pessoal e, se preciso, uma chamada de
teste numa versão separada da função), registrando o que o relógio dele de fato fornece.

### Localização e trajetos: potencial e cuidado

O que existe hoje: o **nome do local** de cada treino (guardado) e a **rota completa** (lida sob demanda, não guardada). Uma rota
que começa ou termina em casa revela o endereço; por isso qualquer evolução exige ativação voluntária.

| Nível | O que entrega | Como | Proteções |
|---|---|---|---|
| L1 · Mapa sob demanda (já existe) | Mapa de um treino | Leitura do `.FIT` na hora | Nada guardado |
| L2 · Histórico de trajetos | Mapa com todos os trajetos de um período, mapa de calor, distância por região | Guardar uma versão **reduzida** da rota (precisão de 4 casas, ≈ 11 m; até 300 pontos) numa tabela própria, só do dono | Liga e desliga pelo dono; **zonas de privacidade** (o trecho dentro de um raio escolhido em volta de lugares sensíveis é cortado antes de gravar); retenção configurável (ex.: 12 meses); botão "apagar todos os trajetos"; fora da casa (RLS só do dono); nunca vai para a IA nem para notificações |
| L3 · Lugares | "Lugares onde você treina": agrupamento dos pontos de início em lugares que o próprio dono nomeia | Agrupamento por grade aproximada (≈ 1 km), sem endereço | Os mesmos de L2; nomes dados pelo dono; sem buscar endereço em serviço externo |

L2 e L3 exigem mudar a função `garmin` (para gravar a rota reduzida na sincronização) e uma migration: **só com autorização
expressa do dono**. Um caminho que não toca a `garmin`: gravar a rota reduzida pelo navegador quando o dono abre um treino
(guarda só o que ele já viu), com as mesmas proteções.


### Atualização DS-4.3 (13/11/2026): leitura única do relógio no site

Desde a DS-4.3 todo o site lê `garmin_dia` e `garmin_ativ` para análise por uma fonte só, `js/fonte-saude.js` (contrato de fontes), que classifica pelo marco de propriedade e nunca grava. A integração em si (função `garmin`, rotina, coleta) não mudou. Detalhes: [`docs/saude.md`](../saude.md).
