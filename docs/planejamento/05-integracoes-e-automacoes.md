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
| Gmail API (hoje só leitura; evolução RAC Inbox em I0) | Hoje: cartão de e-mail e importação de compras; futuro: cliente multicon­ta, gestão e envio | Hoje: Google Identity Services no navegador; futuro: OAuth de servidor | Hoje: Client ID público; futuro: refresh tokens protegidos no servidor, sujeitos a verificação Google | Hoje: —; futuro: contas/sincronização a definir | Hoje: só leitura; I0 mapeia envio, alteração, filtros e restrições de escopo |
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

**Ambiente e opções de I0 (13/11/2026):** Vault `supabase_vault` 0.3.1 já está instalado; os privilégios da view descriptografada foram conferidos e só dão leitura a `postgres` e `service_role`. A implantação atual tem quatro Edge Functions, sem função de e-mail. Para o iCloud, Cloudflare Workers Paid (US$ 5/mês de cobrança mínima) é a primeira candidata de POC por suportar TCP/STARTTLS; bloqueia a porta 25, mas não lista a 587 entre as portas bloqueadas. Cron tem até 15 min de tempo total; numa agenda de 1 min, CPU Paid é limitada a 30 s por execução (Free: 10 ms). O limite de 5 min vale para requisições HTTP, não para esse Cron. Railway Pro (US$ 20/mês com crédito de uso) é a alternativa mais convencional; SMTP só é habilitado no Pro. Conectividade real com Apple ainda não foi testada. Nenhum plano foi contratado nem serviço criado.

**I0 · primeira auditoria (13/11/2026):** o cartão atual usa `gmail.readonly` no navegador e armazena o token por cerca de uma hora; a importação de compras usa o mesmo escopo e mantém seu token em memória. A documentação de compras registra o app Google como Externo/em teste; confirmar o Console atual, pois esse estado limita usuários de teste e tokens de atualização a sete dias. Microsoft Graph dispõe de OAuth delegado, envio, movimentação, regras e delta por pasta. No iCloud, a Apple exige SMTP na porta 587, que o Supabase Edge Functions bloqueia; o envio exige worker em runtime separado. Auditoria apenas documental: nenhuma conta foi conectada nem houve teste de credenciais.


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
| `fiscal-entradas` | pg_cron (`060`) → função SQL `nf_rotina_fiscal_sql` | `10 */6 * * *` | a cada 6 h | Central Fiscal: retoma sozinha a entrada no Mercado das notas confirmadas que falharam (intervalo crescente, até 6 tentativas) e liga notas antigas a compras que já existem (proposta, não aplicada) |
| `inbox-sync` | pg_cron (`055`, job ativo em produção) → função `rac-inbox` | `*/10 * * * *` | a cada 10 min | RAC Inbox: sincroniza as caixas conectadas e avisa as mensagens novas (só do dono); grava `inbox_sincronizacao` |
| `monitor-alerta` | pg_cron (`069`) → função `monitor-alerta` | `*/30 * * * *` | a cada 30 min | O vigia do Monitor (M4): abre, atualiza e fecha incidentes em `sinais` e manda um push consolidado quando um processo atrasa ou falha (só o dono; silêncio das 22h às 7h; no máximo 3 por dia) |
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
| M3 | Uma view no banco (`security_invoker`) que junta `rotina_log`, `radar_coletas`, `newsletter_edicoes` e `ia_uso` no formato do contrato, para o servidor e a IA lerem o mesmo que a tela | Sim (pequena) | Mesmo resultado na tela e na view (teste PGlite) **Concluído em 26/11/2026 (seção 4.5)** |
| M4 | Alerta proativo: uma função agendada no banco detecta processo atrasado e cria um **sinal** ([Documento 04](04-rac-intelligence.md)); o aviso sai no resumo diário | Sim | Robô parado aparece como sinal e no aviso das 6h, uma vez **Concluído em 26/11/2026 (seção 4.5)** |

Para o aviso por push de M4 é preciso uma Edge Function que envie (a `garmin` é editável pelo agente desde 23/11/2026): decisão do dono
([Documento 07](07-decisoes-e-pendencias.md)).

### 4.3 Implementação de M1 e M2 (Fase 1, 13/11/2026)

[Histórico, 13/11/2026; a conclusão está na seção 4.4] Estado: **na branch** `claude/fase-1-confiabilidade-rac-dhwm7a`, no PR da Fase 1; **sem merge e sem publicação**. Sem migration, sem SQL
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

### 4.4 Conclusão de M1 e M2 (26/11/2026)

Estado: **concluído, mesclado (PR #105, `b3a140e`) e publicado** em 26/11/2026; o site servido pelo domínio está na versão `2026-11-26.1` (verificado). A validação no iPhone foi confirmada pelo dono em 26/11/2026 ("Validado", sem detalhes; [histórico diário](historico-diario.md)). Sem migration, tabela, Edge Function, IA ou mudança nos robôs.

[Fato] Conferência com a produção (leitura de `cron.job`, 26/11/2026): cinco jobs ativos, `rac-rotina`, `rac-newsletter`, `radar-rotina`, `fiscal-entradas` e `inbox-sync`, todos com o horário do catálogo. `fiscal-validacao` (061) **não** existe em produção (proposta reservada). O `inbox-sync` estava fora do catálogo: o arquivo `supabase/propostas/055_inbox_agendamento.sql` seguia marcado "não aplicada", embora o job esteja ativo (o texto aplicado não foi comparado com o arquivo). O arquivo fica em `propostas/` porque os testes do Inbox o tratam assim; o teste do Monitor tem uma lista explícita (`APLICADAS_EM_PROPOSTAS`) para lê-lo.

**Matriz de cobertura** (o que o Monitor consegue provar):

| Processo | Origem | Agendamento (UTC) | Evidência | Falha identificável | Limite de observabilidade |
|---|---|---|---|---|---|
| Rotina das 6h | pg_cron `008` → `garmin` | `0 9 * * *` | `rotina_log` (comprova a execução) | sim (`ok=false`, erro por passo) | não registra o início: sem duração; backup e relógio são só sub-linhas |
| Newsletter | pg_cron `023` → `rac-newsletter` | `50 0-2,9-23 * * *` | `newsletter_edicoes` (comprova só a edição gravada) | não | tentativa sem edição não deixa registro; vale a idade (14 h) |
| Radar | pg_cron `045` → `radar` | `20 9,21 * * *` | `radar_coletas` | sim, quando registra | sem oferta não há registro: "sem informação", nunca falha |
| Central Fiscal (entrada) | pg_cron `060` | `10 */6 * * *` | `notas_fiscais_entradas` (comprova só dados) | não | só registra quando há o que tratar |
| Inbox (sincronização) | pg_cron `055` → `rac-inbox` | `*/10 * * * *` | `inbox_sincronizacao` (comprova a execução) | sim (`falhas_seguidas`, erro) | só do dono; falhas em 7 dias não registradas; uma sincronização manual recente também atualiza |
| Robô de notícias | GitHub `noticias.yml` | `15 */3 * * *` e `40 * * * *` | execuções da `main` + JSON | sim | cota de 60 consultas/h por IP; as 30 execuções lidas cobrem cerca de 1 dia |
| Robô de vagas | GitHub `vagas.yml` | `0 10 * * *` | execuções da `main` + `vagas.json` | sim | o GitHub atrasa e pula rodadas |
| Testes | GitHub `testes.yml` | `30 10 * * 1` (+ push e PR) | execuções da `main` | sim | só as execuções da `main` |

Fora do catálogo, de propósito: backup (passo da rotina; vale o resumo em `rotina_log`, o arquivo no Storage não prova o sucesso), último dado da Garmin (sub-linha da rotina), `ia_uso` (registra chamadas, não é rotina agendada), push (passo da rotina), publicação do Pages (mecanismo nativo, sem arquivo no repositório), `garmin-publicar.yml`, `rac-inbox-worker-publicar.yml` e `icloud-auth-probe.yml` (manuais, sem cron) e `fiscal-validacao` (não existe em produção).

[Fato] Decisões de apresentação (conferidas com o dono em 26/11/2026):

- **Subpágina `#monitor`** aberta a partir da página Sistema, que mantém só um resumo de uma linha; as duas leem a mesma coleta (`sisMonColetar`, guardada 60 s).
- **Quatro cartões**: monitoradas, normais, exigem atenção (falhou e atrasado) e sem verificação (desligado e desconhecido); tocar num cartão filtra a lista. Sem "% de sucesso", sem "tempo médio" e sem gráficos de atividade: as fontes não são comparáveis e quatro processos não registram duração. A referência visual (duas imagens, números ilustrativos) foi adaptada ao design system, não copiada.
- **Alertas e observações** no topo (falha, atraso e "info": sem registro ou desligado), cada um com o que aconteceu, quando, onde o processo roda e a fonte que acusou. Causa externa só quando a evidência a indica; senão a tela diz o componente e a fonte.
- **Falha** é a execução mais recente terminada com erro; um sucesso posterior volta o estado a ok e o detalhe diz "falhou em X e recuperou em Y".
- **Em andamento** nunca é atraso; passou de 2 h vira alerta ("pode ter travado"); a falha continua valendo até um sucesso.
- **Janela do GitHub**: o rótulo diz "falhas em 7 dias" só quando as 30 execuções lidas cobrem 7 dias; senão diz "nas últimas N execuções (desde dd/mm hh:mm)". O erro anterior era contar só 30 execuções e rotular "7 dias".
- **Fita de 7 execuções** (com `racDica`, data e resultado) só nos processos que têm histórico (rotina, Radar e os três do GitHub).
- **Horários em Brasília** (`America/Sao_Paulo`), não no fuso do aparelho. A tela mostra a hora da consulta e se o GitHub veio do cache (15 min) ou da cópia de até 24 h.
- **Inbox** só para o dono (a tabela é por dono); com a sincronização automática desligada em todas as contas, o estado é "desligado".

Continua fora do escopo: cartão no RAC Hoje, listagem do Storage e qualquer fonte nova. M3 e M4 estão na seção 4.5.

### 4.5 M3 e M4: tabela `sinais`, visão no servidor e o vigia (26/11/2026)

Estado: **aplicado em produção em 26/11/2026** (migrations `067`, `068` e `069`, conferidas por leitura; função `monitor-alerta` versão 1 ativa, `verify_jwt` desligado e autenticação pela senha da rotina, como as outras). O que o primeiro push real mostrou e a publicação do site `2026-11-26.2` ficam no [histórico diário](historico-diario.md), só depois de verificados. A função `garmin` **não foi tocada**; sem IA, sem Telegram, sem chave nova.

[Fato] O que o desenho precisou respeitar:

- O servidor só enxerga o que grava no banco. Os robôs do GitHub (notícias e vagas) deixam rastro só nos JSON publicados; o vigia usa a **data real de coleta** deles (os mesmos arquivos e limites da tela).
- O banco não interpreta cron. Na view, "atrasado" é pela **idade da última execução** (Rotina 25 h = 24 h + 60 min, Newsletter 14 h, Inbox 30 min); a tela continua pelo horário do cron, mais preciso. Os dois concordam nos casos claros (teste de paridade no PGlite) e podem divergir por até a tolerância em casos de borda.
- O `service_role` não tinha SELECT em `rotina_log`, `inbox_contas`, `inbox_sincronizacao` e `notas_fiscais_entradas`: o ensaio em produção respondeu 500. A `068` concede SELECT **só nas colunas** que o Monitor usa (não libera o `resumo` da rotina nem o endereço de e-mail das contas).

**O que existe agora**

| Peça | O que é |
|---|---|
| `public.sinais` (067) | Tabela genérica de sinais do [Documento 04](04-rac-intelligence.md), reutilizável pelo RAC Hoje: um incidente por linha (`tipo`, `area`, `origem`, `entidade`, `chave` única, `severidade`, `estado` aberto/fechado, `fatos`, `porque`, `historico`, `detectado_em`, `encerrado_em`, `encerramento`, `notificado_em`, `lote_push`). RLS só do dono (mais a trava `mfa`); só o `service_role` grava, pelas funções. No máximo **um incidente aberto** por tipo e entidade (índice único parcial). Não entra no backup do site (dado derivado). Para o Monitor, `entidade` é o id do processo |
| `monitor_processos_em(agora)` e a view `monitor_processos` (067) | O contrato do Monitor dos processos que gravam no banco (Rotina, Newsletter, Inbox, Radar, Central Fiscal), `security_invoker`: quem lê vê só o que as políticas das tabelas deixam |
| `monitor_sinais_sincronizar/_pendentes/_marcar` (067) | O ciclo de incidentes; só o `service_role` executa |
| Edge Function `monitor-alerta` (069 agenda a cada 30 min) | Lê a view e os JSON dos robôs, atualiza os incidentes, decide e manda o push |
| Bloco "Ocorrências recentes" em `#monitor` | Mostra os incidentes de `sinais` (abertos e resolvidos), se já foram avisados por push ou esperam o próximo envio |

**Quem alerta e quem não alerta**

| Processo | Fonte no servidor | Alerta quando |
|---|---|---|
| Rotina das 6h | `rotina_log` | última execução falhou, ou sem execução há mais de 25 h |
| Newsletter (edições) | `newsletter_edicoes` | sem edição gravada há mais de 14 h |
| Inbox (sincronização) | `inbox_sincronizacao` | falha seguida, ou sem sincronização há mais de 30 min; desligado se a sincronização automática está desligada em todas as contas |
| Robô de notícias | JSON (`noticias`, `tecdados`, `rumores`: 8 h; `newsletter`: 14 h) | atraso (coleta velha) ou falha (coleta recente, mas vazia, ou todas as fontes fora do ar) |
| Robô de vagas | `vagas.json` (30 h) | idem |
| Radar, Central Fiscal | view | **nunca**: só registram quando há o que fazer; sem registro é "desconhecido" |
| Testes automáticos | GitHub | **nunca** (a falha já aparece no GitHub e no Monitor) |

Arquivo que não deu para ler é **indisponível** (sem evidência, sem alarme); falha parcial de fontes de um robô não alarma.

**Ciclo do incidente.** Atrasado ou falhou abre o incidente; se já houver um aberto, **atualiza o mesmo** (atrasado vira falhou sem novo registro nem novo push, e o histórico guarda a sequência); a recuperação **fecha sozinha** (`recuperou`), preservando o histórico; processo desligado fecha como `desligado`; desconhecido e indisponível não abrem nem fecham.

**Quando avisar.** Verificação a cada 30 min; **um push por incidente**, consolidado (todos os pendentes numa mensagem só, com a hora em que cada um abriu), no máximo **3 por dia** (dia de Brasília) e **silêncio das 22h às 7h**. O limite e o silêncio **nunca descartam** incidente: ele fica em `sinais` sem aviso e sai no próximo envio permitido; o que abriu e já se resolveu antes do aviso só aparece como "já resolvida" dentro de um push que de qualquer forma sairia (resolvido sozinho nunca gera push) e, sempre, em "Ocorrências recentes". Sem push de recuperação. O aviso leva só o nome do processo e a situação. Se o push falhar, o incidente continua pendente e a próxima rodada tenta de novo (no pior caso um aviso repetido, nunca um perdido).

[Fato] Limites conhecidos: (1) **o vigia não avisa da própria falha** (um aviso disso exigiria um serviço externo, fora do escopo); o `cron.job` e a função são vistos pela leitura de produção; (2) a falha do **workflow** em si (execução vermelha no GitHub) não é visível ao servidor, que só vê a data de coleta dos JSON; ela continua visível na tela do Monitor; (3) o aviso depende de o aparelho ter as notificações ativas (Sistema → Notificações) e das chaves VAPID da função `garmin`.

**Operação.** Ensaio, que só lê e não grava, não envia e não marca nada: chamar a função com `{"tipo":"ensaio"}` pelo banco (`net.http_post` com a senha do Vault, sem expô-la) e ler a resposta em `net._http_response`. Desligar: `select cron.unschedule('monitor-alerta');`. O job fica fora do catálogo do Monitor de propósito (`FORA_DO_CATALOGO` em `tests/monitor.test.mjs`).

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
resistência). **Nada disso foi confirmado**: a rede deste ambiente não alcança a Garmin e a função é editável pelo agente desde 23/11/2026.
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
