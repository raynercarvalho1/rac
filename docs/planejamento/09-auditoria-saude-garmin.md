# RAC · 09 · Auditoria da Saúde e potencial de Inteligência Garmin (DS-4.2A)

Data: 13/11/2026. Etapa de **investigação e especificação**: nenhum código funcional, SQL, função, secret, cron ou dado foi alterado.
Ponto de partida: `main` com a DS-4.1 mesclada (PR #10, `81c9999`); a árvore desta branch é idêntica à da `main` (conferido com `git diff`).
Relacionado: [Documento 05](05-integracoes-e-automacoes.md#garmin-o-que-existe-de-verdade) (integrações), [Documento 04](04-rac-intelligence.md) (IA e sinais),
[Documento 08](08-frentes-funcionais.md#garmin-avançado) (G1–G5), [Documento 06](06-roadmap.md) (roadmap), [Documento 07](07-decisoes-e-pendencias.md) (D-08).

## 0. Como ler e o que NÃO foi possível confirmar

Classificação usada em todo o documento:

- **[Fato confirmado]**: lido no código, nas migrations, nos testes ou na documentação do repositório (com o arquivo indicado).
- **[Hipótese]**: provável, mas depende de dado real, de comportamento da Garmin ou de teste que esta etapa não podia fazer.
- **[Oportunidade futura]**: proposta de trabalho; não existe hoje.

**Limite desta auditoria [Fato confirmado]:** não houve consulta ao banco de produção nem à Garmin (sem credenciais, rede sem acesso à Garmin, e a etapa proíbe
toda operação que toque produção). Portanto **"o campo existe no código de gravação" não prova que existe nas linhas reais**: a Garmin omite campos que o
aparelho não mede, e o código remove campos vazios. A cobertura real (quantos dias têm cada campo) é a primeira pendência, e a conferência de leitura para o dono
rodar está na seção 3.4. Todo número de volume de dados abaixo é, por isso, **limite teórico**, não contagem.

## 1. Arquitetura atual da Saúde

### 1.1 Peças e responsabilidades [Fato confirmado]

| Peça | Onde | O que faz |
|---|---|---|
| Rota | `js/rotas.js` (`id:"saude"`, área "Vida e família", rótulo curto "Saúde", sem `casa`) | Só o dono vê (a Fernanda não tem a rota; as tabelas têm RLS só do dono, `supabase/007_garmin.sql`). Abre `#saude` e `#saude/treino/ID` |
| Tela | `js/saude.js` (385 linhas, um arquivo) | Tudo da Saúde: leitura, sincronização, 6 painéis, página do treino com mapa, gráficos em SVG |
| Estado | variável global `SAUDE` (dias, treinos, métrica, período, filtro, sincronização) | Compartilhado com Painel, Resumo e Sistema |
| Regras puras | `nucleo.js`: `prontidao`, `saudeInsights`, `hojeSaude`, `priSaude`, `correlacao`, `mediana`, `TREINO_OCULTOS` | Testadas (ver 1.4) |
| Dados | tabelas `garmin_dia` e `garmin_ativ` (JSON em `dados`) | Gravadas **só** pela Edge Function `garmin` |
| Servidor | `supabase/functions/garmin/index.ts` (647 linhas) | Busca na Garmin; também faz push, Telegram, backup, atalhos do iPhone, agenda e chuva (função "faz-tudo", por isso intocável) |
| Rotina | cron `rac-rotina` às 9h UTC (6h de Brasília), `supabase/008_sistema.sql` | Chama a função em modo rotina; resultado em `rotina_log` e erros em `erros` |
| Mapa | Leaflet 1.9.4 (cdnjs) com tiles do OpenStreetMap, ou Google Maps se o dono guardou a chave (`PESSOAL.googleMaps`) | Rota do treino aberto |

Ordem da tela hoje: diário de humor (só dono) → Prontidão → "Hoje" (6 indicadores clicáveis) → Tendência (8 métricas × 30 dias, 3 meses ou 1 ano) →
Sono das últimas 14 noites → Treinos (resumo por esporte, filtro, lista, "ver mais"). Página do treino: percurso, estatísticas, gráficos (FC, ritmo, altitude,
cadência, temperatura), faixas de FC, voltas e séries da musculação.

### 1.2 Quem lê as tabelas do Garmin [Fato confirmado]

| Leitor | Como lê | Observação |
|---|---|---|
| `js/saude.js` (`saudeLer`) | `garmin_dia` e `garmin_ativ` inteiras, páginas de 1000 | Tem a própria paginação; não usa `RACdados.paginar` (`js/dados.js`) |
| `js/hoje.js` (fonte `saude`) | últimos 60 dias de `garmin_dia` e 14 de `garmin_ativ` | Leitura própria, fora do contrato de fontes (`js/fontes.js` só tem agenda, família, MBA e newsletter) |
| `js/painel.js` | via `saudeLer`/`saudeCarregar` e a variável `SAUDE` | Aba "Saúde e atividades": consistência, evolução mensal, histórico de métricas |
| `js/resumo.js` | via `SAUDE` e `TREINO_OCULTOS` | Gráficos do Resumo |
| `js/sistema.js` | 3 leituras próprias: prontidão (61 dias), busca global de treinos (1000 últimos, indexa o nome do local) e Monitor (`atualizado`) | Cartões do Início usam `priSaude` |
| `js/carreira.js` | `garmin_dia` e `garmin_ativ` inteiras, para o SQLite no navegador | Consulta livre do dono |
| Servidor | `resumoSemana` (domingo) e `backupSemanal` na função `garmin` | O backup inclui as duas tabelas (`NUCLEO.SEG_TABELAS`) |

**Seis telas ou módulos leem o banco do relógio por caminhos diferentes** e nenhum passa pelo contrato de fontes. É a principal razão para a refatoração da seção 10.

### 1.3 Responsabilidades misturadas, duplicações e acoplamentos [Fato confirmado]

1. **`js/saude.js` mistura 5 camadas**: constantes e rótulos, leitura/sincronização, regras de cálculo (agrupamento semana/mês da tendência, resumo mensal e anual por esporte, ritmo, merge do humor), desenho e mapas. Só as regras que já estão no núcleo têm teste.
2. **Escrita escondida numa leitura**: `saudeCarregar` apaga do banco, pelo navegador, linhas anteriores a `GARMIN_DESDE` (01/11/2025). A mesma limpeza existe na função (`sincAtiv`). Ler não deveria apagar; a regra existe por um bom motivo (o relógio antes era de outra pessoa), mas deveria estar num só lugar e fora da leitura.
3. **Chamada externa ao abrir a tela**: se a última atualização tem mais de 2 h, abrir `#saude` chama a função `garmin` (e esta, a Garmin). Convive com a regra do botão ↻ ("nunca chama o relógio"). É intencional, mas é um custo externo por abertura.
4. **Formatadores repetidos**: `hmDur`, `durTxt` e `hms` fazem variações da mesma conversão; `ritmo` e `ritmoDe` repetem a lógica de ritmo; `mediana` existe no núcleo e de novo (`mediana` em TypeScript) na função.
5. **Regra duplicada no servidor**: `resumoSemana` (função `garmin`) recalcula, em TypeScript, o que o Painel e a Saúde calculam no site.
6. **Estado global**: `SAUDE`, `SAUDE_MET`, `ativTipo`, `saudeLer` e `saudeCarregar` são usados por Painel, Resumo e Sistema (`MOD_DEPS`: `sistema`, `resumo` e `painel` dependem de `saude`). Qualquer redesenho precisa manter esses nomes ou migrar os três consumidores.
7. **Interface fora do Design System**: `js/saude.js` não usa `js/kit.js` (nenhum `rk*`); o CSS é o antigo, em `index.html` (`.prontw`, `.saudekpi`, `.vbpeso`, `.sonorow`…); só os gráficos usam `racDica`.
8. **Prontidão do site × "Training Readiness" da Garmin**: nome parecido para coisas diferentes (a do site é calculada aqui; a da Garmin **não é coletada**). O glossário da tela já avisa, mas a confusão é um risco de interpretação.

### 1.4 Testes existentes e lacunas [Fato confirmado]

| Coberto | Teste |
|---|---|
| Leitor do arquivo `.FIT` (zip, pontos, rota, voltas, séries) | `tests/fit.test.mjs` (dados inventados) |
| `prontidao` (cenário normal e cenário ruim) | `tests/nucleo.test.mjs` |
| `saudeInsights` idêntico ao de antes da Fase 2 (60 cenários sorteados) | `tests/nucleo_fase2.test.mjs` |
| `hojeSaude`, atraso, itens do RAC Hoje, `priSaude` | `tests/hoje.test.mjs`, `tests/nucleo.test.mjs` |
| Rota `#saude/treino/123` e módulos por rota | `tests/rotas.test.mjs` |
| Páginas abrem e não cortam o título; aba Saúde do Painel | `tests/navegador.test.mjs` (só no GitHub) |

**Lacunas:** (a) nenhum teste da tela `js/saude.js` em ambiente falso (a Agenda ganhou `tests/agenda_tela.test.mjs`; a Saúde não tem equivalente); (b) nenhum teste do mapeamento
Garmin → `dados` (funções `bloco` e `ativ` da função `garmin`, dentro de `supabase/functions/garmin/index.ts`); (c) nenhum teste de `sincDias` e `sincAtiv` (lacunas, duplicados, parada na página conhecida);
(d) nenhum teste do agrupamento de tendência (30 dias / semana / mês) nem do resumo por esporte; (e) `saudeInsights` não tem teste de limiar (por exemplo, correlação com poucas amostras);
(f) o horário de sono (`inicio`/`fim`) não tem teste de fuso; (g) sem dados reais anonimizados para regressão.

## 2. Integração Garmin: como os dados chegam

### 2.1 Fluxo [Fato confirmado]

1. A função `garmin` pede um **token** à API pessoal da Garmin com o segredo `GARMIN_PERSONAL_API_KEY` (só no servidor; um token novo a cada chamada).
2. **Dias**: blocos de até 28 dias, 3 chamadas por bloco em paralelo (`usersummary-service` resumo diário, `sleep-service` sono, `hrv-service` VFC) e, quando o bloco chega a "hoje", uma quarta (`fitnessage-service`).
3. **Treinos**: `activitylist-service`, páginas de 100, da mais nova para a mais antiga; para quando acha uma página inteira já conhecida (a menos que `completo`).
4. **Detalhe de um treino** (só quando o dono abre): `activity-service` (resumo completo) e o arquivo original `.FIT` (`download-service`), lido por um leitor próprio sem dependências. **Nada disso é guardado.**
5. Gravação com `upsert` pela chave primária: `(user_id, data)` em `garmin_dia`; `(user_id, id)` em `garmin_ativ`.

### 2.2 Frequência e janela [Fato confirmado]

| Gatilho | O que faz |
|---|---|
| Rotina diária 6h (Brasília) | `sincDias` (até 13 blocos, retoma 2 dias antes do último dia gravado) e `sincAtiv`; limite de 120 s no cron |
| Abrir a Saúde com mais de 2 h desde a última atualização | O site pede "dias" e "treinos" em rodadas |
| Botão "Atualizar agora" | Idem |
| Botão ↻ do site | **Não** chama a Garmin (só relê o banco) |
| Domingo | A rotina também manda o resumo da semana e faz o backup (inclui as tabelas do relógio) |

Primeira sincronização: volta 364 dias. Corte permanente: `GARMIN_DESDE = 2025-11-01` (antes, o relógio era de outra pessoa; dados anteriores são apagados).
**Histórico máximo teórico em 13/11/2026: ≈ 12,5 meses**, com granularidade de **1 linha por dia** e **1 linha por treino**; não há série intradiária (nem FC, nem estresse, nem Body Battery ao longo do dia) guardada.

### 2.3 Dados ausentes, incompletos e duplicados [Fato confirmado, salvo onde marcado]

- Campo vazio é **removido** (`limpa`); dia sem nenhum campo **não gera linha**. Logo, "dia sem relógio" e "dia ainda não sincronizado" são **indistinguíveis** no banco. Para qualquer análise, a cobertura precisa ser calculada, não presumida.
- Sono sem `sleepTimeSeconds` é descartado; sono e VFC entram no dia pela data de calendário informada pela Garmin.
- **Duplicados**: impossíveis pela chave primária (reenvio só substitui).
- **Substituição integral**: o `upsert` troca o JSON do dia inteiro. Uma resposta parcial posterior sobrescreve uma mais rica (risco baixo, mas real).
- **Idade do condicionamento (`idadeFitness`) só existe no dia mais recente**: é adicionada apenas quando o bloco chega a "hoje"; no dia seguinte a linha é regravada sem ela. Resultado: **não há histórico**, só o valor atual. Dá para exibir o número; **não dá para mostrar tendência**.
- **Treinos antigos não são atualizados**: a sincronização para na primeira página já conhecida; renomear um treino na Garmin ou recálculo posterior (VO₂ máx, efeito) não chega ao banco.
- Fuso: "hoje" é calculado com −3 h fixas (Brasília sem horário de verão). O horário de sono é gravado como "HH:MM" a partir de um carimbo "local" lido como UTC. **[Hipótese]** que isso dá o horário certo; não há teste nem conferência com dado real.
- O `.FIT` pode faltar (a função cai para série/rota vazias e a tela avisa); o painel mostra os números do resumo.

### 2.4 Logs, monitoramento e dependências [Fato confirmado]

- `rotina_log` (um registro por rotina: `ok` e resumo por passo: `garmin_token`, `garmin_dias`, `garmin_treinos`…) e tabela `erros` (cada passo que falha). O **Monitor** da página Sistema lê `rotina_log` e a idade de `garmin_dia.atualizado` (alerta quando velho). Erros do site vão para `logErro("Garmin")`.
- Dependências externas: API pessoal da Garmin (chave que pode **expirar**: a função trata o 401 com mensagem própria); Supabase (Edge Function, cron, pg_net); Leaflet (cdnjs) e tiles do OpenStreetMap ou Google Maps no site.
- **Limitações conhecidas [Fato confirmado]**: a função é intocável sem autorização expressa; a rede desta nuvem não alcança a Garmin; o conjunto real de serviços da API pessoal **não está documentado no repositório** (ver 3.3).
- **[Hipótese]** A Garmin só recebe os dados quando o relógio sincroniza com o aplicativo no celular; o RAC não consegue forçar isso. Dia "sem dado" pode ser só o relógio ainda não sincronizado.

## 3. Inventário real das métricas

Frequência de todas as linhas da coluna "Atualização": rotina das 6h + abertura da Saúde (mais de 2 h) + botão. "Histórico": até 12,5 meses (limite teórico, seção 2.2).
Campos que o código grava; **a presença real depende do relógio e do dia** (seção 0). "Exibida" = aparece hoje na tela Saúde (ou no Painel, quando indicado).

### 3.1 Resumo do dia (`garmin_dia.dados`, serviço de resumo diário)

| Métrica | Campo | Unidade | Confiabilidade e limitações | Exibida? |
|---|---|---|---|---|
| Passos, meta de passos | `passos`, `metaPassos` | passos | Dia corrente está em andamento (o RAC Hoje usa o último dia completo) | Sim |
| Distância | `distancia` | m | Do dia todo, não só de treinos | Sim (junto dos passos) |
| Andares subidos | `andares` | andares | Depende do altímetro | **Não** |
| FC de repouso | `fcRepouso` | bpm | Valor calculado pela Garmin; bom indicador de tendência | Sim |
| FC mínima e máxima do dia | `fcMin`, `fcMax` | bpm | Só extremos; **sem série intradiária** | Sim (texto de apoio) |
| Estresse médio e máximo | `estresse`, `estresseMax` | 0–100 | Derivado da VFC ao longo do dia (Garmin); sem série | Médio sim; máximo **não** |
| Proporção de estresse alto e de descanso | `estresseAlto`, `descanso` | fração 0–1 | Idem | Alto sim; descanso **não** |
| Body Battery | `bbMin`, `bbMax`, `bbCarga`, `bbGasto` | 0–100 | Só o resumo do dia; **sem linha do tempo**, então não há "bateria ao acordar" exata (o máximo do dia costuma ocorrer após o sono, **[Hipótese]**) | `bbMax`, carga e gasto sim; `bbMin` **não** |
| Minutos de intensidade | `minModerados`, `minVigorosos`, `metaMinutos` | min | Meta semanal da Garmin (150 min); moderados + 2× vigorosos | Só o dia de hoje |
| Calorias | `calorias`, `caloriasAtivas` | kcal | Estimativa; só hoje | Só hoje |
| Respiração e SpO₂ (média do dia) | `respiracao`, `spo2` | resp./min; % | SpO₂ depende da configuração do relógio. **A tela rotula como "média da noite", mas lê o campo do dia** (o campo do sono, `sono.spo2`, é gravado e não usado) — **[Hipótese]** de rótulo impreciso, a confirmar com dado real | Só hoje |

### 3.2 Sono, VFC, idade do condicionamento (`garmin_dia.dados`)

| Métrica | Campo | Unidade | Confiabilidade e limitações | Exibida? |
|---|---|---|---|---|
| Duração total do sono | `sono.total` | s | Boa; vem do relógio | Sim |
| Estágios (profundo, leve, REM, acordado) | `sono.profundo`, `leve`, `rem`, `acordado` | s | Estimativa por frequência cardíaca e movimento (não é exame de sono); útil para tendência, não para diagnóstico | Sim (14 noites) |
| Nota do sono | `sono.nota` | 0–100 | Pontuação geral da Garmin; **os sub-escores** (duração, REM, profundo, agitação…) **não são guardados** | Sim |
| Qualificação, despertares, estresse no sono, respiração e SpO₂ do sono | `sono.qualidade`, `despertares`, `estresse`, `respiracao`, `spo2` | texto; n; 0–100; resp./min; % | Gravados | **Não** |
| Horário de dormir e acordar | `sono.inicio`, `sono.fim` | "HH:MM" local | Só texto de hora (sem data); atravessa a meia-noite; ver fuso em 2.3 | Só no cartão do dia; usado em `saudeInsights` |
| VFC da noite | `vfc.noite` | ms | Média da noite pela Garmin; sensível a álcool, doença, relógio mal ajustado, sono curto | Sim |
| VFC média semanal e pico de 5 min | `vfc.semana`, `vfc.pico` | ms | Gravados | **Não** |
| Status e faixa normal da VFC (linha de base da Garmin) | `vfc.status`, `faixaMin`, `faixaMax` | texto; ms | Faixa calculada pela Garmin ao longo de semanas | Sim |
| Idade do condicionamento (real e possível) | `idadeFitness.fitness`, `real`, `possivel` | anos | **Só o valor mais recente** (ver 2.3) | Sim (último disponível) |

### 3.3 Treinos (`garmin_ativ`: `id`, `inicio`, `tipo`, `dados`) e o que é lido sob demanda

| Métrica | Campo | Unidade | Limitações | Exibida? |
|---|---|---|---|---|
| Tipo, início, nome, **local** (nome do lugar dado pela Garmin) | `tipo`, `inicio`, `nome`, `local` | texto; data/hora local | `local` é texto sensível (indexado pela busca global) | Sim |
| Distância, duração, tempo em movimento, velocidade média e máxima | `distancia`, `duracao`, `emMovimento`, `velocidade`, `velocidadeMax` | m; s; m/s | Natação em metros | Máxima **não** (só no detalhe) |
| FC média e máxima; faixas de FC (1 a 5) | `fc`, `fcMax`, `zonas` | bpm; s por faixa | Só resumo | Sim |
| Calorias, subida, passos, voltas | `calorias`, `subida`, `passos`, `voltas` | kcal; m; n | | Parcial (subida e voltas só no detalhe) |
| Carga de exercício | `carga` | pontos Garmin | Depende de o relógio calcular para o tipo de treino | Sim (detalhe); usada em `saudeInsights` |
| Efeito aeróbico, anaeróbico e rótulo | `efeitoAerobico`, `efeitoAnaerobico`, `efeito` | 0–5; texto | | Sim |
| **VO₂ máx** | `vo2max` | ml/kg/min | Gravado **por treino** (a Garmin só informa em certas atividades, em geral corrida/bike ao ar livre — **[Hipótese]**); **não existe em nenhuma tela hoje** (conferido por busca no código) | **Não** |
| Cadência, passada, potência | `cadencia`, `passada`, `potencia` | ppm; cm; W | Potência só com sensor | Cadência e passada no detalhe; potência **não** |
| Natação | `piscina`, `swolf` | cm; pontos | | Sim |
| **Musculação (resumo)** | `series`, `repeticoes` | n | Totais por treino; **sem exercício, carga (kg) nem grupo muscular** | Séries sim; repetições **não** |
| Minutos de intensidade do treino | `minModerados`, `minVigorosos` | min | | Detalhe |
| Recorde pessoal | `recorde` | boolean | | Sim (🏅) |
| **Detalhe (não guardado)**: resumo completo, série até 600 pontos (FC, velocidade, altitude, cadência, temperatura), voltas, **séries de musculação por exercício (repetições, peso, tempo)**, **rota GPS** (até 1.500 pontos) | lido de `activity-service` e do `.FIT` ao abrir o treino | vários | Cada abertura faz 2 chamadas à Garmin; nada fica no banco; se o `.FIT` falhar, só vem o resumo | Sim, na página do treino |
| Tipos escondidos do quadro de Treinos | `TREINO_OCULTOS` = aparelhos, águas abertas e bike | — | Decisão de produto antiga; os dados existem | Ocultos |

### 3.4 O que **não** é coletado hoje [Fato confirmado: não há campo nem chamada no código]

Peso e composição corporal · hidratação · **Training Readiness** e **Training Status** da Garmin · carga aguda/crônica e **tempo de recuperação** nativos ·
pontuações de resistência e previsões de prova · linha do tempo (minuto a minuto) de FC, estresse, Body Battery e SpO₂ · sub-escores do sono · necessidade de sono ·
ciclo menstrual/saúde da mulher · medidas manuais (pressão, glicose). **[Hipótese]** Parte disso pode existir na API pessoal da Garmin (o Documento 05 já registra o mesmo); só uma investigação autorizada
(D-08, etapa G4) confirma o que o relógio e a API fornecem.

**Conferência de cobertura real (só leitura; o dono roda quando e se quiser, no SQL Editor — nesta etapa não foi executada):**

```sql
-- 1) cobertura de cada campo do dia (quantos dias têm o campo) e período
select k, count(*) as dias, min(data) as primeiro, max(data) as ultimo
from public.garmin_dia, lateral jsonb_object_keys(dados) as k
group by k order by dias desc;
-- 2) o mesmo para o sono e a VFC (campos aninhados)
select 'sono.' || k as campo, count(*) as dias
from public.garmin_dia, lateral jsonb_object_keys(coalesce(dados->'sono','{}'::jsonb)) as k group by 1
union all
select 'vfc.' || k, count(*) from public.garmin_dia, lateral jsonb_object_keys(coalesce(dados->'vfc','{}'::jsonb)) as k group by 1 order by 1;
-- 3) treinos: tipos, quantidade e cobertura de VO2 máx, carga e séries (sem mostrar nome nem local)
select tipo, count(*) as treinos,
  count(*) filter (where dados ? 'vo2max') as com_vo2max,
  count(*) filter (where dados ? 'carga') as com_carga,
  count(*) filter (where dados ? 'series') as com_series,
  min(inicio)::date as primeiro, max(inicio)::date as ultimo
from public.garmin_ativ group by tipo order by treinos desc;
```

## 4. Mapa de origem dos dados

```
Relógio ─(sincroniza com o app Garmin Connect, fora do RAC)─> Garmin
   Garmin ──API pessoal (chave só no servidor)──> função garmin ──upsert──> garmin_dia / garmin_ativ ──(RLS só do dono)──> site
   (abrir um treino) site ──> função garmin ──> activity-service + arquivo .FIT ──> memória da página (nada é guardado)
   garmin_dia/ativ ──> backup semanal (cofre privado) · resumo da semana (push) · Monitor (idade dos dados)
   site lê: Saúde · Painel · Resumo · RAC Hoje · Sistema (prontidão, busca, Monitor) · Carreira (SQLite)
```

## 5. Potencial de inteligência

Legenda: **A** já possível com dados existentes · **B** possível após transformação ou cálculo local · **C** depende de novos dados (o dono informa) ·
**D** depende de mudança na integração · **E** não viável com a fonte atual. Todas são **[Oportunidade futura]**, exceto onde diz "existe hoje".

| Tema | Capacidade | Classe | Fundamento e restrição |
|---|---|---|---|
| Recuperação | Body Battery (nível do dia, carga e gasto) | **A** (existe hoje) | `bbMax` etc.; sem linha do tempo, **"bateria ao acordar" exata é E** com a fonte atual |
| | Tendência de Body Battery (carga média 7 dias × 30) | **B** | séries diárias |
| | VFC contra a linha de base (Garmin e própria) | **A** existe hoje (prontidão); persistência de vários dias **B** | `vfc.noite` × `faixaMin`/`faixaMax` e mediana de 60 dias |
| | FC de repouso: desvio persistente | **B** (hoje só o dia isolado) | `fcRepouso` |
| | Estresse: aumento persistente | **B** | `estresse`, `estresseAlto` |
| | Cruzar sono × VFC × estresse × FC | **B** (parte existe em `saudeInsights`) | correlação com poucas amostras exige cautela (seção 6) |
| | Recuperação após treino (tempo até a VFC voltar ao normal) | **B** | `carga` + VFC dos dias seguintes; o "tempo de recuperação" nativo da Garmin é **D** |
| Sono | Duração e tendência | **A/B** | `sono.total` |
| | Regularidade (variação do horário de dormir) | **B** | `inicio`/`fim` (só hora; ver 2.3) |
| | Estágios | **A** (14 noites hoje); tendência de estágios **B** | estimativa, não polissonografia |
| | Sub-escores do sono, necessidade de sono | **D** | não guardados; **[Hipótese]** a API entrega |
| Atividades | Histórico de musculação (datas, duração, FC, séries/repetições totais) | **A** | `garmin_ativ` tipo `strength_training` |
| | Frequência e consistência (semanas seguidas, dias ativos) | **A** (existe no Painel) | reaproveitar, não refazer |
| | Duração e intensidade (efeito, carga, faixas de FC) | **A** | por treino |
| | FC durante a atividade (resumo e faixas) | **A**; curva completa **D** para histórico (hoje só sob demanda, por treino) | `.FIT` não é guardado |
| | Carga semanal e razão aguda:crônica | **B** | soma de `carga` por semana; atenção: `saudeInsights` hoje mistura "carga" e "minutos" quando falta carga (escalas diferentes) |
| | Intervalo entre sessões de musculação | **B** | datas dos treinos |
| | **Volume de musculação** (kg × repetições) e grupos musculares | **D** | só existe no `.FIT`, hoje não guardado; **caminho sem mexer na função**: o navegador pedir o detalhe de cada treino de musculação e somar (1 chamada à Garmin por treino, custo e limites a validar) — **[Hipótese]** |
| Condicionamento | VO₂ máx e tendência | **B** (campo já guardado por treino, **nunca exibido**; cobertura real a conferir, seção 3.4) | médias móveis por atividade com valor |
| | Tendência da idade do condicionamento | **D** (só o valor atual é guardado) | persistir diariamente |
| | Eficiência aeróbica (FC média em ritmo parecido) | **B** (corrida/caminhada: distância, duração, FC) | confundidores: calor, relevo, sono |
| | Minutos de intensidade semanais × meta de 150 | **B** (hoje só o dia) | `minModerados`, `minVigorosos` |
| | Training Status/Readiness, previsões de prova, resistência | **D** (**[Hipótese]** a API oferece) | não coletados |
| | Peso e composição corporal | **C/D** | não coletados |
| Mapas | Mapa de **um** treino | **A** (existe hoje) | `.FIT` sob demanda |
| | Mapa de vários trajetos, mapa de calor, histórico geográfico | **D** | rota não é guardada; ver privacidade (seção 8) |
| | Filtro por local | **A** com o nome do local (`local`); granularidade é a que a Garmin der — **[Hipótese]** | texto sensível |

## 6. Análises determinísticas propostas (sem IA, sem custo)

Princípios [Oportunidade futura]:

1. **Persistência antes de alerta**: nenhum sinal por um dia só. Padrão: "M dos últimos K dias" (ou N seguidos) **e** cobertura mínima de dados (ex.: ≥ 70% dos dias da janela com o campo). Para sair do alerta, 2 dias normais (histerese).
2. **Linha de base própria**: mediana e dispersão robusta (quartis) dos 60 dias anteriores, como a prontidão já faz; a faixa da Garmin entra como segunda opinião, não como única.
3. **Três níveis de texto**: **Observação** (o dado: "VFC média 7 dias: 48 ms; seu normal: 56 ms"), **Hipótese** ("isso costuma acompanhar sono curto ou carga alta; no seu histórico, ocorreu em X de Y vezes"), **Recomendação** (ação leve e não clínica: "considere um treino leve hoje"). Sem diagnóstico, sem causa afirmada; sempre com a nota "o relógio não substitui avaliação médica; se persistir ou houver sintomas, procure orientação profissional".
4. **Qualidade dos dados primeiro**: relógio sem sincronizar há mais de 24 h, ou cobertura baixa, **suprime** os sinais e avisa.
5. Funções puras em `nucleo.js`, com testes de borda; a tela só desenha.

| ID | Análise | Dados | Regra determinística sugerida | IA? | Quando avaliar | Como apresentar | Riscos de interpretação |
|---|---|---|---|---|---|---|---|
| S1 | **VFC abaixo da linha de base** | `vfc.noite`, `faixaMin`, `faixaMax` | `noite < faixaMin` em ≥ 3 das últimas 5 noites, ou média de 7 dias < mediana de 60 − 1 desvio robusto por ≥ 3 noites seguidas | Não | Diária, depois da rotina das 6h | Selo "observação" + mini-série de 14 noites com a faixa | Álcool, doença, viagem, relógio frouxo, sono curto; VFC isolada varia muito |
| S2 | **FC de repouso elevada** | `fcRepouso` | ≥ 5 bpm acima da mediana de 30 dias em ≥ 3 dos últimos 5 dias | Não | Diária | Observação com a diferença em bpm | Calor, café, treino pesado no dia anterior, infecção; não é diagnóstico |
| S3 | **Estresse persistente** | `estresse`, `estresseAlto` | média de 7 dias ≥ mediana de 60 + 10 pontos em ≥ 5 dos 7 dias | Não | Diária | Observação com a semana vs. o normal | Estresse da Garmin é fisiológico (VFC), não emocional; exercício também eleva |
| S4 | **Sono curto e irregular** | `sono.total`, `inicio` | < 6 h em ≥ 3 das últimas 5 noites; desvio-padrão do horário de dormir > 60 min em 14 dias; "déficit" contra uma **meta escolhida pelo dono** (padrão 7 h; decisão D-S2) | Não | Diária | Observação + regularidade em barras | Horário de sono vem só como texto de hora; trabalho em turnos distorce |
| S5 | **Sono × VFC × recuperação** | estágios, nota, VFC, carga do dia anterior | Já existe em `saudeInsights` (treino forte × VFC e nota); acrescentar **tamanho da amostra** e janela de 8 semanas; exibir só com ≥ 8 pares e |r| ≥ 0,4 (hoje 0,25 com 8 amostras, que é fraco) | Não | Semanal | "Hipótese" com n visível ("em 12 noites") | Correlação não é causa; amostra pequena engana |
| S6 | **Carga de treino subindo rápido** | `carga` (e duração, quando faltar, **separando as escalas**) | carga da semana > 1,5 × média das 4 anteriores, com ≥ 3 treinos nas 4 semanas | Não | Semanal e após cada treino | Barras semanais com a média e a faixa | Carga é estimativa da Garmin; semana de retorno de pausa dispara falso alerta |
| S7 | **Consistência de treino** | datas de `garmin_ativ` | dias ativos por semana, semanas seguidas, semanas abaixo da meta pessoal (reaproveitar o cálculo do Painel) | Não | Semanal | Faixa de semanas (kit) | Tipos escondidos e musculação sem sensor podem subestimar |
| S8 | **Recuperação após treino forte** | `carga`, VFC, FC de repouso, sono nos 3 dias seguintes | "dias até a VFC voltar à mediana" por treino forte (60º percentil de carga, como hoje); mediana desses dias | Não | Mensal | "Seu corpo costuma levar ~2 dias" com n | Poucos treinos fortes; confundidores (sono, estresse) |
| S9 | **Intervalo entre sessões de musculação** | datas dos treinos `strength_training` | mediana e máximo do intervalo; sessões em dias seguidos | Não | Semanal | Linha do tempo de 8 semanas | Sem exercício/grupo muscular, não diz **o que** foi treinado (D) |
| S10 | **Tendência de condicionamento** | `vo2max` por treino; FC média × ritmo | mediana móvel de 4 semanas do VO₂ máx; variação ≥ 1 ponto em 2 janelas seguidas | Não | Mensal | Linha com 3 e 6 meses | Valor muda pouco e depende do tipo de treino; pode não existir nos dados (conferir) |
| S11 | **Mudança persistente (qualquer métrica)** | séries diárias | mediana das últimas 4 semanas × 4 anteriores com limiar por métrica; **só alerta se a mesma direção se repetir em 2 janelas** | Não | Semanal | "Tendência" separada de "oscilação" | Sazonalidade, férias, doença |
| S12 | **Saúde dos dados** | `atualizado`, cobertura | sem sincronizar > 24 h; cobertura < 70% | Não | A cada leitura | Aviso fixo e sinais suprimidos | — |

Aproveitar o que já existe: `prontidao` (alertas de dia isolado) e `saudeInsights` seguem; S1–S4 **estendem** os alertas para persistência e **não substituem** a prontidão. As regras novas
entram como funções puras no núcleo (prefixo próprio, por exemplo `sau*`, para não colidir com nomes existentes: `tests/estrutura.test.mjs` falha com nome repetido).

## 7. Oportunidades de IA (RAC Intelligence)

Princípio [Fato confirmado, regras do projeto]: toda IA passa pela função `rac-ia` e, no site, só por `racIA()`; a IA nunca grava; saúde só como **números agregados** (sem séries brutas e sem rota/coordenadas); só para o dono; nada automático sem autorização expressa; preços só em `ia_precos`. Esta etapa **não** implementa IA e **não** faz chamada externa.

| Proposta [Oportunidade futura] | Agrega algo real? | Observação |
|---|---|---|
| **Recuperação da semana** (G3): texto curto que relaciona carga, sono, VFC e consistência da semana já calculados pelas regras S1–S11 | **Sim**, é interpretação de vários sinais em linguagem natural | Ação nova em `rac-ia` (modelo barato), **a pedido do dono**, nunca automática; entrada = agregados (médias, contagens, tendências) |
| **Explicar um conjunto de sinais** (3 ou mais sinais ao mesmo tempo) | Sim, mas só depois que as regras existirem | Mesma ação, mesmo formato |
| Perguntas livres sobre os dados ("por que dormi mal?") | Pouco: alto risco de causa inventada | **Não recomendado** nesta fase |
| Plano de treino / prescrição | Não | **Fora de escopo**: risco de orientação indevida |
| Qualquer coisa com rota, local ou dado bruto | — | **Proibido** (privacidade) |

Política de interpretação para qualquer texto de IA: separar **observação** (vem das regras), **hipótese** (a IA pode levantar, rotulada) e **recomendação** (leve, não clínica); **nunca** diagnosticar, citar doença ou substituir médico;
validar o JSON da resposta e recusar texto que contenha diagnóstico ou dosagem. Decisões D-S5 e D-S6 (seção 12) tratam de DEMO × só REAL e do custo.

## 8. Requisitos de privacidade

[Fato confirmado hoje]: dados do relógio só do dono (RLS; a Fernanda não vê); incluídos no backup; o repositório é público (nenhum dado real nos documentos, exemplos ou testes); a rota GPS **não é guardada** e só trafega ao abrir um treino;
o **nome do local** (`local`) é guardado e indexado na busca global; o mapa envia ao OpenStreetMap ou ao Google a **região visualizada** (tiles) — aceitável para o dono, mas deve ser dito.

Requisitos [Oportunidade futura] para qualquer evolução:

1. **Nada de coordenada em relatório, teste, log, push ou documento.** Fixtures de teste com rota inventada.
2. **Trajetos guardados só com ativação voluntária pelo dono**, desligados por padrão (já registrado em D-08), com: precisão reduzida (4 casas, ≈ 11 m), pontos limitados, **zonas de privacidade** (raio em volta de casa e outros lugares que o dono escolher; o trecho é cortado **antes** de gravar), retenção configurável (ex.: 12 meses), botão "apagar todos os trajetos", RLS só do dono e fora do papel casa.
3. Entrar em `NUCLEO.SEG_TABELAS` (backup com pk/fk), na trava "mfa" e em `tests/seguranca.test.mjs`; restauração nunca grava sem prévia e confirmação.
4. **Push e e-mail** com texto genérico ("há novidades em Saúde"); nunca o valor, o local ou o sinal.
5. IA recebe **só agregados**; nunca rota, local, nome do treino ou texto livre do diário.
6. A busca global não deve indexar mais nada além do que já indexa; o campo `local` deve poder ser **escondido** pelo dono (decisão D-S7).
7. Em tela compartilhada (iPhone), um modo "ocultar valores" para saúde é desejável (**[Hipótese]** de valor; decisão D-S8).
8. Mapa: preferir OpenStreetMap por padrão; o Google Maps só com a chave do dono (como hoje).

## 9. Proposta de experiência e navegação

### 9.1 Estrutura [Oportunidade futura]

A Saúde deixa de ser uma página longa e vira um **hub com abas**, na linguagem do RAC Modern Workspace (abertura azul, abas segmentadas, cartões com `kit.js`, gráficos com `racDica`, tema claro e escuro), no padrão que o Painel já usa (`#painel/<aba>`): o roteador já entrega o 2º trecho da rota (`p[1]`). `#saude/treino/ID` continua como está.

| Aba (rota) | Conteúdo | Resumo principal? |
|---|---|---|
| **Visão geral** (`#saude`) | Abertura com a frase do dia; **5 indicadores** (Prontidão, Sono, VFC, FC de repouso, Body Battery) com delta contra o normal; **Sinais ativos** (S1–S4, S12; no máximo 3, só os persistentes); **último treino** e **semana** (treinos, dias ativos); atalho do humor | **Sim**: só o essencial e o que exige atenção |
| **Recuperação** (`#saude/recuperacao`) | Prontidão explicada por parte; VFC × faixa; FC de repouso; Body Battery; estresse; S1–S3, S8; cruzamentos | Detalhe |
| **Sono** (`#saude/sono`) | Duração, estágios, nota, regularidade (S4), tendência, sono × VFC (S5) | Detalhe |
| **Atividades** (`#saude/atividades`) | Lista com filtro; **musculação** (frequência, intervalos S9, séries/repetições totais; volume quando existir); carga semanal (S6); consistência (S7, do Painel) | Detalhe |
| **Condicionamento** (`#saude/condicionamento`) | VO₂ máx e tendência (S10), idade do condicionamento, minutos de intensidade semanais, eficiência aeróbica | Detalhe |
| **Tendências** (`#saude/tendencias`) | A tendência atual (8 métricas, 30 dias/3 meses/1 ano) e S11; comparação entre períodos | Detalhe |
| **Mapas** (`#saude/mapas`) | Só quando o dono ativar: trajetos, mapa de calor, filtro por local e período; começa **desligada** | Detalhe, opt-in |
| **Inteligência** (`#saude/inteligencia`) | Todos os sinais com histórico e "por quê"; "Recuperação da semana" por IA **a pedido** | Detalhe |

### 9.2 Desktop e iPhone

- **Desktop**: abertura + abas horizontais; Visão geral em grade de 2–3 colunas (indicadores, sinais, último treino); detalhes em 2 colunas com gráfico à esquerda e leitura à direita.
- **iPhone**: abas em faixa rolável no topo (como o Painel), indicadores em 2 colunas, sinais empilhados; a barra inferior continua a do Modern Workspace (Saúde está em "Vida e família"). Alvos de toque ≥ 44 px (catraca da DS-4.1). Mapa só abre por toque.
- **Hierarquia**: no resumo, **no máximo 5 números e 3 sinais**; tudo o mais fica um toque abaixo. Cada indicador leva à aba de detalhe. Estados vazio, falha e "dados antigos" usam `rkEstado`.
- Reuso (já existe): `rkKpi`, `rkCard`, `rkMedidor`, `rkComparar`, `rkAlerta`, `rkEstado`, `rkLista`, `rkRecolher` (`js/kit.js`); `rsColunas`, `rsBarras`, `rsKpis` (`js/graficos.js`); `racDica`. Sem dependências novas.
- Casa (Fernanda): a Saúde continua inexistente para ela; a DS-4.2 não pode alterar o que ela vê.

## 10. Lacunas técnicas e riscos

| # | Item | Tipo | Risco | Mitigação [Recomendação] |
|---|---|---|---|---|
| L1 | Cobertura real dos campos desconhecida | Fato (lacuna) | Planejar sobre dado que não existe | Rodar a conferência da seção 3.4 antes de fechar o escopo das abas Condicionamento e Sono |
| L2 | `js/saude.js` monolítico, sem teste de tela | Fato | Regressão ao redesenhar | Extrair regras para o núcleo e criar o teste de tela da Saúde (modelo: `tests/agenda_tela.test.mjs`) **antes** de redesenhar |
| L3 | Seis leitores do banco do relógio | Fato | Divergência de regra e de leitura | Fonte única "saude" no contrato de fontes (`js/fontes.js`), com o arquivo da fonte da Saúde (fonte-saude, a criar) a criar; RAC Hoje, Sistema e Painel passam a ler por ela |
| L4 | Limpeza `GARMIN_DESDE` dentro da leitura | Fato | Escrita inesperada | Separar leitura e limpeza (a função já faz a sua); decisão do dono |
| L5 | `idadeFitness` só no último dia | Fato | Sem tendência | Depende de mudar a função (D) ou aceitar só o valor atual |
| L6 | Musculação sem exercício/carga guardados | Fato | Volume e grupos musculares impossíveis em histórico | Opção D (função) ou leitura em lote pelo navegador (custo/limites a validar) |
| L7 | VO₂ máx guardado e nunca exibido; cobertura desconhecida | Fato + Hipótese | Entregar tela vazia | Conferir (L1); se houver dados, é ganho rápido (classe B) |
| L8 | Rótulo "média da noite" lendo campo do dia (SpO₂ e respiração) | Hipótese | Informação imprecisa | Confirmar com dado real e corrigir o rótulo ou o campo |
| L9 | Fuso do horário de sono não testado | Hipótese | Regularidade errada | Teste com carimbos reais anonimizados |
| L10 | `saudeInsights` mistura carga e minutos; correlação fraca com poucas amostras | Fato | Frase enganosa | Separar escalas; piso de amostra e de |r| (S5) |
| L11 | Nome "Prontidão" × Training Readiness da Garmin | Fato | Confusão | Explicação visível ("cálculo do RAC") ou outro nome (decisão D-S3) |
| L12 | Dia sem linha = não sincronizado ou sem relógio | Fato | Falso "sem dado" | Calcular cobertura; suprimir sinais (S12) |
| L13 | Dependência da Garmin (chave que expira, API pessoal, sincronização do relógio) | Fato + Hipótese | Dados parados | Monitor já alerta idade; aviso claro na tela |
| L14 | Função `garmin` intocável e "faz-tudo" | Fato | Qualquer mudança de coleta arrisca push, backup e atalhos | Mudanças de integração só com autorização, com teste do trecho e publicação da função antes do site |
| L15 | Mapa externo (Leaflet no cdnjs, tiles, Google) | Fato | Falha de terceiro e privacidade de região | Já há queda para o OpenStreetMap; documentar |
| L16 | Chamada externa ao abrir a tela (> 2 h) | Fato | Custo e limites da Garmin | Manter; considerar mostrar "atualizando" só quando necessário |

## 11. Roadmap recomendado (valor × complexidade)

Cada fase é independente, em lotes funcionais, e só avança com a aprovação do dono. **Nenhuma exige mexer na função `garmin` até a fase S6.**

| Fase | Conteúdo | Valor | Complexidade | Toca em | Autorização extra |
|---|---|---|---|---|---|
| **S0 · Conferência** | Dono roda a conferência de cobertura (3.4); registramos o que realmente existe | Alto (evita retrabalho) | Baixa | Nada no código | SQL só de leitura, do dono |
| **S1 · Fundação sem mudar a tela** | Regras de tendência/agrupamento para o núcleo (`sau*`); fonte "saude" (o arquivo da fonte da Saúde (fonte-saude, a criar)); teste de tela e de `sincDias`/mapeamento com dados inventados; consolidar os 6 leitores | Alto (base) | Média | `nucleo.js`, `js/saude.js`, RAC Hoje, Sistema, Painel | Não |
| **S2 · Visão geral + Recuperação + Sono** (no Design System) | Hub com abas; abertura; indicadores; **sinais persistentes S1–S4 e S12**; sono com regularidade | **Muito alto** | Média | `js/saude.js` (ou módulo novo), CSS do Modern Workspace | Não |
| **S3 · Atividades e musculação** | Lista, frequência, intervalos (S9), carga semanal (S6), consistência (S7) | Alto | Média | Idem | Não |
| **S4 · Condicionamento** | VO₂ máx (S10), minutos de intensidade semanais, eficiência aeróbica | Médio-alto (depende de L1) | Baixa–média | Idem | Não |
| **S5 · Tendências e Inteligência (regras)** | S5, S8, S11; aba Inteligência com o histórico dos sinais | Alto | Média | Idem | Não |
| **S6 · Mudanças de integração** (opcionais) | Guardar sub-escores do sono, `idadeFitness` diário, resumo de séries de musculação, dados extras da API (G4) | Médio-alto | Média–alta | **Função `garmin`**, migration | **Sim, expressa** (D-08), SQL antes, função antes do site |
| **S7 · Mapas e trajetos** | Histórico geográfico opt-in, zonas de privacidade, retenção, apagar tudo | Médio | Alta | Função/migration ou gravação pelo navegador | **Sim, expressa** e decisões de privacidade |
| **S8 · IA "Recuperação da semana"** | Ação nova em `rac-ia`, a pedido, só agregados, só REAL | Médio | Média | `rac-ia`, tela | **Sim, por chamada** (IA paga) |

Ordem recomendada: **S0 → S1 → S2 → S3 → S4 → S5**, e decidir S6/S7/S8 depois de ver S2–S5 funcionando com dados reais.

## 12. Critérios de aceitação para a futura implementação

**Gerais** (valem para S1–S5):

1. `node --test tests/*.test.mjs` passando; módulo testado durante o trabalho; `VERSAO` (sw.js) e `MOD_VERSAO` (js/app.js) trocadas juntas; JavaScript ES5 puro, sem build e sem dependência nova.
2. Nenhuma alteração em `supabase/functions/garmin`, SQL, secrets, cron, workflows ou `.claude/settings.json` (S1–S5); Fernanda idêntica byte a byte à `main` (comparação de telas, como na DS-4.1).
3. Regras puras no núcleo, com testes de borda (limiar, cobertura mínima, histerese, dados ausentes); nomes novos sem colisão (`tests/estrutura.test.mjs`).
4. Todo gráfico novo com `racDica.ligar`/`racDica.em` e valor e rótulo fixos (há teste); cores só por tokens (catraca de cores).
5. Chromium real em 390, 768 e 1280 px, claro e escuro: sem rolagem horizontal, alvos ≥ 44 px, sem erro de console.
6. Estados verdadeiros: vazio, falha, dados antigos (> 24 h) e cobertura baixa **suprimem** sinais em vez de mostrar zero ou normalidade.
7. Mantidos: Prontidão (mesma fórmula, mesmos testes), diário de humor, página do treino com mapa, botão ↻ sem chamar a Garmin, resumo e Painel funcionando (mesmos números).
8. Documentação: [Documento 05](05-integracoes-e-automacoes.md), `docs/mapa.md`, roadmap e histórico diário atualizados; um guia da tela (docs, saude.md) criado na implementação.

**Dos sinais**: cada sinal tem (a) dado e regra documentados, (b) persistência mínima e cobertura mínima, (c) texto em observação/hipótese/recomendação, (d) nota de limite ("não substitui orientação médica"), (e) teste com cenário de oscilação isolada **que não dispara** e cenário persistente **que dispara**.

**Privacidade**: nenhum dado real ou coordenada em código, teste, doc, log ou notificação; push genérico; IA (se houver) só com agregados.

## 13. Decisões que dependem do dono

| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-S1 | Aprovar o escopo e a ordem S0–S5 | Aprovar · ajustar | Aprovar como está |
| D-S2 | Meta de sono e de treino por semana usadas pelos sinais | Padrão 7 h e 3 treinos/semana · valores do dono | Dono informa; padrão editável |
| D-S3 | Nome "Prontidão" | Manter com explicação · renomear (ex.: "Disposição RAC") | Manter, com texto "cálculo do RAC, não a da Garmin" |
| D-S4 | Tipos de treino escondidos (aparelhos, águas abertas, bike) | Manter · mostrar na aba Atividades | Mostrar na aba Atividades, com filtro |
| D-S5 | IA de saúde: DEMO ou só REAL; automática ou a pedido | Só REAL a pedido (como `hoje.analise`) · com demonstração | Só REAL, a pedido, depois da S5 |
| D-S6 | Orçamento de IA para saúde | Pelo teto atual · teto próprio | Pelo teto atual, sem mexer em `ia_config` sem autorização |
| D-S7 | Esconder o campo `local` na busca global e nas telas | Manter · opção de esconder | Opção de esconder |
| D-S8 | Modo "ocultar valores" de saúde | Sim · não | Sim, simples |
| D-S9 | Autorizar a investigação só de leitura dos dados extras da Garmin (G4, D-08) | Sim · não agora | Sim, depois da S2 |
| D-S10 | Mapas e trajetos guardados (S7): ativar? retenção? zonas de privacidade? | Não · sim com proteções | Decidir depois da S5; desligado por padrão |
| D-S11 | Rodar a conferência de cobertura (3.4) | Sim · não | Sim, antes da S1 |
| D-S12 | Começar a implementação (S1) e em qual branch | Autorizar · aguardar | Aguardar a sua revisão desta auditoria |

## 14. Resumo das classificações

- **Fatos confirmados**: arquitetura e leitores (1.x), fluxo e limites da integração (2.x), campos gravados e o que não é coletado (3.x), cobertura de testes (1.4), regras de privacidade vigentes (8).
- **Hipóteses**: presença real de cada campo; VO₂ máx e carga por tipo de treino; rótulo "média da noite"; fuso do horário de sono; o que a API pessoal oferece além do que o código usa; sincronização do relógio com o app.
- **Oportunidades futuras**: tudo das seções 5 a 9 e 11.

## 15. Complemento (13/11/2026): marco temporal de propriedade do Garmin

Pedido do dono: trocar o filtro provisório por um **marco temporal de propriedade** (o Garmin foi comprado usado). Regra desejada: registros **anteriores** ao marco são legado e não entram nas análises pessoais; os **a partir** do marco são do dono; **todos os registros originais são preservados**; nenhuma exclusão nem limpeza automática.
Continua tudo **somente leitura e sem implementação**. Este complemento não altera as seções 1 a 14.

### 15.1 Resultado da investigação: não há evidência confiável da data do primeiro login

**Conclusão [Fato confirmado]: o repositório não contém nenhum registro da data do primeiro login ou da configuração do relógio. Por isso a data NÃO é inventada aqui; ela precisa da sua confirmação (seção 15.9).**

| Fonte consultada | O que mostra | Serve como evidência do primeiro login? |
|---|---|---|
| Constante `GARMIN_DESDE = "2025-11-01"` (`js/saude.js` e `supabase/functions/garmin/index.ts`) | Um corte de calendário no dia 1º de um mês, com o comentário "antes desta data o relógio era de outra pessoa" | **Não**: é uma data redonda, sem registro de quem a definiu, quando e com base em quê. Pode ser uma aproximação. Tratar como **informação do dono ainda não confirmada**, não como prova |
| Documentos (`docs/painel.md`, Documento 05) | Repetem a mesma data e a mesma frase | Não: citam a constante, não a origem |
| Histórico do Git | O clone é **raso** (`git rev-parse --is-shallow-repository` = `true`) e só tem commits de 09/11/2026 em diante (70 commits). A constante já aparece no primeiro commit visível | **Não**: o histórico anterior não existe aqui, então não dá para datar quando a constante nasceu |
| Migration `supabase/007_garmin.sql` e função `garmin` | Criam as tabelas e a sincronização; nenhuma data de configuração do relógio é gravada | Não |
| Dados da API Garmin (código atual) | A função só pede resumo diário, sono, VFC, idade do condicionamento, lista de treinos e o detalhe de um treino. **Nenhuma chamada traz perfil, registro do dispositivo, data de ativação ou primeiro uso** | Não (o que a API pessoal oferece além disso é **[Hipótese]** não verificada) |
| Logs do RAC (`rotina_log`, `erros`, `garmin_dia.atualizado`) | Registram quando o **RAC** recebeu dados, não quando o relógio foi configurado | Só como limite superior (15.2); não consultados nesta etapa (sem acesso ao banco) |
| "Filtro geográfico provisório" | **Não existe no repositório**: não há filtro por local, cidade ou coordenada em `js/saude.js`, no núcleo nem na função. O único filtro é o corte por data acima. Se existe algum filtro geográfico, está fora do código versionado (por exemplo, aplicado à mão no banco) e **não pôde ser verificado** | — |

Descoberta importante sobre o filtro atual [Fato confirmado], que **conflita com a regra "não excluir nada"**:

- A função `garmin` **não guarda** treinos anteriores ao corte (`filter(a.inicio >= GARMIN_DESDE)`) e, a cada rotina diária (que chama `sincAtiv` com início 0), **apaga** de `garmin_ativ` o que for anterior ao corte.
- O site, ao carregar a Saúde, **apaga** de `garmin_ativ` e de `garmin_dia` o que for anterior ao corte (`saudeCarregar`).
- Consequência: **hoje o legado já é descartado de forma recorrente.** Treinos anteriores ao corte nunca foram guardados; dias anteriores ao corte só sobrevivem até a próxima abertura da Saúde. Os backups semanais (cofre privado, 8 mais novos) podem conter restos, **[Hipótese]** a conferir. Recuperar o que já foi descartado só é possível **sincronizando de novo com a Garmin** (função intocável; fora desta etapa).
- Para cumprir "preservar integralmente", o corte por exclusão precisa **deixar de existir** (no site e na função) e ser trocado por classificação na leitura. Mexer na função exige autorização expressa (fase S6, seção 11).

### 15.2 Quatro eventos diferentes (não se confundem)

| Evento | Significado | Onde se descobre | O RAC enxerga? | Serve de marco? |
|---|---|---|---|---|
| **Primeiro login/configuração** | Quando você vinculou o relógio ao seu perfil e o configurou | Conta Garmin (e-mail de boas-vindas ou de registro do dispositivo, aplicativo/site Garmin Connect, exportação de dados da conta). **[Hipótese]**: a exportação oficial da conta traz datas de registro; a confirmar por você | **Não** | **Sim, é o evento certo**: marca o início da posse |
| **Primeira sincronização** | A primeira vez que o relógio enviou dados ao Garmin Connect depois da posse | Garmin Connect (primeiro dia com dados seus) | Só indiretamente (primeiro dia gravado) | Aproxima o login, mas pode ser **horas ou dias depois** |
| **Primeira atividade** | O primeiro treino seu | `garmin_ativ` (data de início) | Sim | **Não**: você pode ter usado o relógio sem treinar; a data só limita o marco por cima |
| **Primeiro registro recebido pelo RAC** | Quando o RAC gravou a primeira linha (`garmin_dia.atualizado`, `rotina_log.quando`) | Banco | Sim | **Não**: depende de quando o RAC foi ligado, e a primeira sincronização volta até 364 dias; seria um marco **posterior** ao real e jogaria dados seus para o legado |

Recomendação [Recomendação]: o marco é o **primeiro login/configuração**, com a data confirmada por você e, de preferência, **corroborada por uma segunda evidência** (por exemplo, a data do e-mail de registro do dispositivo). Os eventos 2 a 4 servem para **conferir a coerência** (nenhum dado seu pode ser anterior ao marco).

### 15.3 Classificar os dados diários pela data do registro, sem associar a atividades

[Fato confirmado: estrutura dos dados]
- `garmin_dia` tem uma linha por **data de calendário** (`data`), e `garmin_ativ` uma por **treino**, com `inicio` (data e hora local) e `id`. **As duas tabelas são independentes**: nada no banco liga um dia a um treino.
- O sono entra na data em que você **acorda**; a VFC e o resumo, na data de calendário informada pela Garmin.

Recomendação [Recomendação]:
- **Dias**: classificar pela própria `data` do registro (sem olhar os treinos). **Treinos**: classificar pelo próprio `inicio` (e pela hora, se o marco tiver hora). **Um dia nunca é classificado por causa de um treino**, nem o contrário.
- O **diário de humor** (`PESSOAL.diario`) é escrito por você, então não é legado e fica fora do filtro.

### 15.4 Registros que cruzam o dia do marco e dados que chegam depois

| Situação | Problema | Regra proposta [Recomendação] |
|---|---|---|
| **O dia do marco (D)**: o resumo diário (passos, estresse, Body Battery, calorias, FC) é um total do dia inteiro; o relógio **não guarda série intradiária no RAC** | Não dá para separar a parte "antes do login" da parte "depois" | O dia D é classificado como **"revisar"** (nem usado nem descartado) até você decidir: **conservador** (D fica legado) ou **inclusivo** (D é seu). Padrão sugerido: conservador, por ser o caminho que não mistura dados de outra pessoa |
| **A noite do marco**: o sono de D é a noite de D−1 para D | Pode ser a noite anterior ao login | Sono de D e **a VFC de D** também vão para "revisar" |
| **Treino iniciado antes e terminado depois do marco** (se o marco tiver hora) | Treino que cruza o instante | Classificar pelo **início**; se o início for anterior ao marco, é legado, e o caso é marcado para revisão |
| **Dado recebido depois do marco com data anterior ao marco** | O relógio só envia ao Garmin o que ele guarda quando sincroniza; uma primeira sincronização pode enviar dias ou treinos **gravados no relógio antes do login** (inclusive os do antigo dono, se o relógio não foi restaurado de fábrica) — **[Hipótese]** | A classificação é **sempre pela data do evento**, nunca pela data de recebimento: data anterior ao marco = legado, mesmo que o RAC tenha recebido depois. Esses casos (recebido depois, data anterior) são **marcados** para revisão. A data de recebimento continua guardada como auditoria (`atualizado`) |
| **Dado recebido depois com data posterior ao marco** (sincronização atrasada) | Nenhum | Meu, pela regra comum |
| **Recálculo posterior pela Garmin** de um dia ou treino | A linha é regravada, mas a **data** do registro não muda | A classificação não muda (depende da data do evento, não da gravação) |

### 15.5 Exceções que exigem revisão manual

1. O **dia do marco** e a **noite/VFC do marco** (15.4).
2. Treino com início anterior ao marco **recebido depois** (a ordem dos números `id` dos treinos costuma acompanhar a ordem de criação na Garmin, o que ajuda a achar esses casos — **[Hipótese]**).
3. Dados **seus** anteriores ao marco, se a conta Garmin já existia antes do relógio usado (por exemplo, com outro aparelho seu): a regra "antes do marco = legado" **os jogaria fora indevidamente**. Só você sabe; é a pergunta 2 da seção 15.9.
4. Dados do antigo dono **depois** do marco (relógio em outras mãos por alguns dias, ou conta compartilhada): improvável, mas só a revisão manual resolve.
5. Linhas cuja data parece fora de ordem (por exemplo, um treino com `id` muito maior que os vizinhos de datas anteriores).
6. Um possível **filtro geográfico** do passado (15.1): se você o usou para decidir o que é legado, os casos em que as duas regras (data × lugar) discordarem devem ser revisados. O lugar pode servir de **sinal de apoio**, nunca de regra.

### 15.6 Estrutura simples e auditável (proposta, não implementada)

Princípio: **a classificação é feita na leitura, nunca no banco**: nenhuma linha é apagada, alterada ou marcada. O marco é um **registro de configuração**, e o resto é uma função pura.

Registro de configuração (proposta: uma chave do dono em `pessoal`, que já tem RLS só do dono e já entra no backup; **sem migration nova**), com estes campos:

| Campo | Exemplo (fictício) | Para quê |
|---|---|---|
| `marco.data` | `"AAAA-MM-DD"` | A data do marco (e, opcionalmente, `marco.hora`) |
| `marco.evento` | `"primeiro_login"` | Qual dos 4 eventos da 15.2 |
| `marco.origem` | `"informado_pelo_dono"` + `"corroborado_por"` | De onde veio a data (e a segunda evidência) |
| `marco.evidencia` | texto livre, **sem dado pessoal sensível** | Descrição da prova (por exemplo, "e-mail de registro do dispositivo, data X") |
| `marco.confirmado_em` / `por` | data e `"dono"` | Quem confirmou e quando |
| `regra` | `"data_do_registro"`, `"dia_do_marco": "revisar"` | A regra de classificação, versionada (`regra.versao`) |
| `revisoes` | lista de `{ chave, decisao: "meu"/"legado", motivo, em }` | Decisões manuais por dia (`data`) ou treino (`id`); **só acrescenta**, não apaga |

Função pura no núcleo (a criar, com prefixo próprio, por exemplo `sau*`, e teste de bordas): recebe as linhas de `garmin_dia` e `garmin_ativ` e o registro do marco, e devolve **três grupos**: `meus`, `legado` e `revisar`, cada linha com o **motivo** da classificação (para a tela dizer "legado: anterior ao marco de AAAA-MM-DD"). **Toda análise** (Prontidão, sinais S1–S12, Painel, Resumo, RAC Hoje, backup de insights) passa a consumir só `meus` (mais as linhas de `revisar` que você liberar); o `legado` **continua no banco**, visível em uma área "Histórico anterior à posse" (somente leitura, opt-in), **nunca** em médias, linha de base, tendências ou IA.

Mudanças necessárias para a regra valer [Fato confirmado: o que existe hoje que precisa mudar]:

1. Retirar a exclusão do site (`saudeCarregar`) — só JavaScript.
2. Retirar a exclusão **e o filtro de gravação** da função `garmin` (`sincAtiv`) — função intocável: **autorização expressa**, SQL (se houver) antes, função antes do site.
3. Trocar a constante `GARMIN_DESDE` (nove usos em quatro arquivos: `js/saude.js`, `js/painel.js`, `js/resumo.js` e a função) pelo marco lido do registro; o Painel e o Resumo também usam a data (limite do período e primeiro ano exibido).
4. Atualizar `docs/painel.md` e o Documento 05 (hoje dizem "só desde 01/11/2025").
5. Testes: marco no meio de uma série, dia D, treino que cruza, dado tardio com data antiga, e **teste que garante que nenhuma exclusão acontece**.

### 15.7 Revisão manual futura

Cada decisão de revisão vira uma entrada em `revisoes` (por data ou `id`), com motivo e data; o marco pode ser **corrigido** (nova data) sem perder o histórico: a data antiga fica registrada em uma lista de marcos anteriores. Como a classificação é só leitura, **mudar o marco reclassifica tudo na hora, sem reprocessar nem apagar nada**.

### 15.8 Conferência de coerência (só leitura; o dono roda se quiser; nesta etapa **não** foi executada)

```sql
-- quando o RAC recebeu o primeiro dado do relógio e o primeiro treino
select min(data) as primeiro_dia, min(atualizado) as primeira_gravacao, count(*) as dias from public.garmin_dia;
select min(inicio) as primeiro_treino, count(*) as treinos from public.garmin_ativ;
select min(quando) as primeira_rotina from public.rotina_log;
-- como os dias foram chegando, mês a mês (cobertura e quando foram gravados)
select date_trunc('month', data)::date as mes, count(*) as dias,
  count(*) filter (where dados ? 'sono') as com_sono, min(atualizado) as primeira_gravacao
from public.garmin_dia group by 1 order by 1;
-- treinos por mês e faixa de numeração (ajuda a achar treino de data antiga recebido tarde)
select date_trunc('month', inicio)::date as mes, count(*) as treinos, min(id) as id_menor, max(id) as id_maior
from public.garmin_ativ group by 1 order by 1;
```

Nenhuma dessas consultas mostra nome, local ou coordenada.

### 15.9 Recomendação técnica e o que ainda preciso de você

**Recomendação [Recomendação]:** adotar o **primeiro login/configuração** como marco, guardado como **registro auditável** (15.6), com classificação **só na leitura** (`meus` / `legado` / `revisar`), **dia do marco em "revisar" (padrão conservador)**, **sem nenhuma exclusão** e com o corte atual (`GARMIN_DESDE`) tratado como **provisório** até a data ser confirmada. Entrega em duas etapas: (1) só site e núcleo, **sem tocar na função** (classificar na leitura e parar de apagar no site); (2) com autorização expressa, retirar a exclusão e o filtro da função e, só então, sincronizar de novo para recuperar o que já foi descartado.

**Informação que ainda preciso de você (nada disso pôde ser confirmado no repositório):**

| # | Pergunta | Por quê |
|---|---|---|
| M1 | **Qual é a data (e, se souber, a hora aproximada) do seu primeiro login/configuração do relógio, e como você sabe?** (e-mail de registro, aplicativo Garmin Connect, exportação de dados da conta, memória) | É o marco. Sem isso, o RAC não pode classificar com evidência |
| M2 | **A conta Garmin Connect usada pelo RAC foi criada por você para este relógio, ou já existia (com outro aparelho seu) ou era herdada do antigo dono?** | Define se dados anteriores ao marco são de outra pessoa (legado) ou seus (exceção 3) |
| M3 | O relógio foi **restaurado de fábrica** antes do seu primeiro login? | Explica se dados do antigo dono podem ter subido na sua primeira sincronização (dados "recebidos depois, com data antiga") |
| M4 | A data **01/11/2025** é a que você informou, uma aproximação ou veio de outra origem? E existe um **filtro geográfico** aplicado em algum lugar fora do repositório (qual)? | Esclarece a origem do corte atual e a discrepância encontrada na 15.1 |
| M5 | O **dia do marco** (e a noite anterior): tratar de forma **conservadora** (não usar) ou **inclusiva**? | Regra de borda (15.4) |
| M6 | Posso, **numa etapa futura e só com a sua autorização expressa**, retirar a exclusão da função `garmin` e sincronizar de novo? | Única forma de recuperar o que o corte atual já descartou |
| M7 | (Opcional) Você aceita que eu procure, **somente leitura**, no seu e-mail por mensagens de registro do dispositivo Garmin, para datar o marco? Se não, você mesmo olha. | Só farei isso se você disser que sim; não o fiz nesta etapa |
| M8 | (Opcional) Rodar as consultas da 15.8 e me passar os resultados | Mostra, com dados reais, quando o RAC começou a receber e se há dados fora de ordem |

Enquanto M1 não for respondida, **nenhuma data de marco é assumida**: o corte provisório de 01/11/2025 continua só como está no código, e nada será alterado.

## 16. Decisões definitivas sobre a propriedade dos dados e plano de implementação (13/11/2026)

O dono respondeu M1 a M4 e aprovou a regra. Esta seção **substitui, onde houver diferença, as recomendações provisórias da seção 15** (o texto da 15 fica preservado como registro da investigação). Continua **somente leitura e sem implementação**; a implementação espera autorização específica.

### 16.1 Decisões confirmadas pelo dono

| Item | Decisão |
|---|---|
| **Marco de propriedade** | **01/01/2026, inclusive** |
| M1 | Primeiro login/configuração do relógio: 01/01/2026 |
| M2 | A conta Garmin Connect é pessoal, criada pelo dono |
| M3 | O relógio foi restaurado para as configurações de fábrica antes do primeiro login |
| M4 | Nenhum critério geográfico: **a regra é só temporal** |
| Antes de 01/01/2026 | `legado` |
| De 01/01/2026 em diante | `meus` |
| Critério | **A data do evento**, nunca a data em que o RAC recebeu ou sincronizou o registro |
| Dia 01/01/2026 | **Pertence ao dono**: não é excluído nem vai automaticamente para revisão |
| Originais | Preservados integralmente; a classificação **não apaga nem modifica** nada |
| Atividades antigas no Garmin Connect | Irrelevante para a propriedade; **não** se tenta resolver com localização nem com dados da conta |

Evidência registrada: informação direta do dono (M1 a M4), em 13/11/2026. Não há segunda evidência no repositório; a data é **decisão do dono**, não dado verificável no código **[Fato confirmado]**.

O que isto muda em relação à seção 15 [Fato confirmado]:

- **Não existe mais "revisar" automático**: o dia do marco (e o sono e a VFC dele) são `meus`. A classificação tem **dois grupos**, `meus` e `legado`. As revisões manuais continuam possíveis, mas **só por pedido explícito do dono**, nunca por regra.
- **O corte muda de 01/11/2025 para 01/01/2026**: os dias e treinos de **01/11/2025 a 31/12/2025**, que hoje o site trata como seus, passam a ser `legado`. Isso altera tendências, períodos do Painel e lista de anos do Resumo (16.3).
- A pergunta M5 (dia do marco) está respondida; a M6 (recuperar) fica para o plano 16.6; as M7 e M8 deixam de ser necessárias.
- Consequência aceita da regra: o **sono** é datado pela manhã em que você acorda; o sono da noite de 31/12 para 01/01 é `meus` (data 01/01). Um treino iniciado em 31/12 é `legado` mesmo que termine em 01/01 (vale a data de início).

### 16.2 Regra de classificação (definitiva)

```
para cada dia de garmin_dia:   data >= "2026-01-01"                  -> meus   senão -> legado
para cada treino de garmin_ativ: início (AAAA-MM-DD do campo inicio) >= "2026-01-01" -> meus   senão -> legado
```

- Dias e treinos são classificados **separadamente**, cada um pela **própria data**; um não decide o outro.
- Data do evento, não do recebimento: `atualizado` e a ordem dos `id` **não entram** na regra.
- Função pura no núcleo, que **não altera as linhas recebidas** (devolve novos grupos) e não toca no banco.
- Onde fica o marco [Recomendação, revisão da 15.6]: um **objeto constante versionado no núcleo** (data, evento, origem "informado pelo dono em 13/11/2026", regra, `inclusivo: true`). Vantagens sobre guardar no banco: **nenhuma escrita em produção e nenhuma migration**, auditável pelo histórico do Git, igual para todos os módulos e à prova de falha de leitura da conta. O registro em `pessoal` e a lista de revisões ficam como evolução opcional.
- Saída: os dois grupos mais **contagens** (quantos dias e treinos legado foram preservados), para a tela poder dizer "N dias anteriores à posse, preservados e não usados".

### 16.3 Os nove pontos que usam `GARMIN_DESDE` (nos quatro arquivos) e como cada um muda

Levantamento [Fato confirmado], com a linha do código no momento desta auditoria:

| # | Arquivo e linha | O que faz hoje | Natureza | Mudança proposta |
|---|---|---|---|---|
| 1 | `js/saude.js` 33 | Define `GARMIN_DESDE = "2025-11-01"` | Definição | Remover a constante e usar o marco do núcleo (01/01/2026) |
| 2 | `js/saude.js` 49 | **Apaga** `garmin_ativ` e `garmin_dia` anteriores ao corte, quando `saudeLer` acusa "antigos" | **Exclusão** | **Remover** (prioridade 1) |
| 3 | `js/saude.js` 54 | Descarta, na leitura, dias e treinos anteriores ao corte; calcula `antigos` | Filtro de leitura | Trocar por classificação do núcleo: `SAUDE.dias` e `SAUDE.ativs` recebem só `meus`; contar `legado`; remover `antigos` |
| 4 | `js/painel.js` 282 | Limita o início do período ao corte (`ini`) | Piso do período | Piso = marco (ou o início do período, o que for mais recente) |
| 5 | `js/painel.js` 283 | Rótulo "relógio Garmin (desde …)" e aviso de período vazio | Texto | Mostrar "desde 01/01/2026" lido do marco |
| 6 | `js/resumo.js` 10 | Primeiro ano da lista de anos | Piso da lista | Primeiro ano = ano do marco |
| 7 | `supabase/functions/garmin/index.ts` 231 | Define `GARMIN_DESDE` | Definição | Remover |
| 8 | `supabase/functions/garmin/index.ts` 234 | **Apaga** treinos anteriores ao corte a **cada rotina diária** (`sincAtiv` com início 0) | **Exclusão** | **Remover** (prioridade 1) |
| 9 | `supabase/functions/garmin/index.ts` 241 | **Não grava** treinos anteriores ao corte | Filtro de gravação | Remover: a função grava tudo que a Garmin devolve; a classificação é só na leitura |

**Leitores que não usam `GARMIN_DESDE` e hoje recebem tudo o que estiver no banco** [Fato confirmado]: todos precisam passar pela mesma classificação, senão o legado preservado vazaria para as análises quando deixar de ser apagado.

| Leitor | Onde | Como aplicar o marco |
|---|---|---|
| RAC Hoje (fonte `saude`) | `js/hoje.js` 46–47 (60 dias de `garmin_dia`, 14 de `garmin_ativ`) | Aplicar a classificação ao resultado; hoje as janelas já ficam depois do marco, mas a regra precisa valer sempre |
| Sistema: prontidão e cartões do Início | `js/sistema.js` 84–85 (61 dias) | Idem |
| Sistema: busca global de treinos | `js/sistema.js` 179 (os 1000 treinos mais novos) | Só treinos `meus` entram na busca |
| Sistema: Monitor | `js/sistema.js` 265 e 340 (`atualizado`) | **Sem filtro**: mede a saúde da integração, não é análise |
| Carreira (consulta SQLite no navegador) | `js/carreira.js` 312 (as duas tabelas inteiras) | Filtrar `meus` ao montar as tabelas `saude` e `treinos` |
| Painel e Resumo (via `SAUDE`) | `js/painel.js`, `js/resumo.js` | Passam a receber só `meus` da Saúde; os pontos 4 a 6 acima ajustam período e texto |
| Servidor: resumo da semana | `resumoSemana` na função (7 dias) | Sem mudança (janela recente) |
| Servidor: backup semanal | `backupSemanal` na função | **Sem filtro, de propósito**: o backup guarda **tudo**, inclusive o legado |

Ponto único de entrada [Recomendação]: uma função do núcleo (prefixo próprio, nome sem colisão com os existentes) que todos os leitores usam. **Nenhum leitor refaz a regra por conta própria.**

### 16.4 Prioridade 1: remover com segurança o que descarta dados anteriores a 01/11/2025

Os dois mecanismos de descarte e a ordem segura:

| Mecanismo | Onde | Risco de remover | Condição para remover |
|---|---|---|---|
| **A. Exclusão ao abrir a Saúde** | `js/saude.js` 49 | Sem a exclusão **e** sem filtro, dias de `01/11/2025` a `31/12/2025` (e qualquer legado) entrariam nas análises | Remover **junto** com a classificação (pontos 2 e 3 no **mesmo lote**), nunca separado |
| **B. Exclusão na rotina e filtro de gravação** | função `garmin`, pontos 8 e 9 | Nenhum para as análises (a leitura já classifica); a função passa a gravar mais linhas por sincronização (só no primeiro preenchimento) | **Autorização expressa** (função intocável); o dono publica a função **antes** do site se o site depender dela |

Regras de segurança da remoção [Recomendação]:

1. **Primeiro a leitura, depois o descarte**: a classificação (16.2) entra no site **antes ou junto** com a retirada da exclusão. Nunca o contrário.
2. A etapa do site **não depende** da função: pode ir primeiro. Enquanto a função não for republicada, a rotina continua apagando treinos anteriores a 01/11/2025 e não gravando-os; isso **não prejudica** as análises (são legado) e a etapa da função fecha a lacuna depois.
3. **Teste de guarda permanente**: um teste que varre o código do site e da função e falha se houver `delete`/`remove` sobre `garmin_dia` ou `garmin_ativ` (a regra "nunca excluir" vira verificável).
4. Sem SQL, sem migration e sem mudança de cron nesta frente.
5. **Efeito visível que o dono precisa saber**: ao adotar 01/01/2026, os meses de novembro e dezembro de 2025 **saem** das tendências, do Painel e do Resumo (continuam no banco e no backup). Os indicadores recalculados mudam.

### 16.5 O que já foi descartado e o que não foi [Fato confirmado, com limites]

| Dado | Situação hoje | Fundamento |
|---|---|---|
| Treinos anteriores a 01/11/2025 | **Nunca foram gravados** e o que chegou a existir foi apagado a cada rotina | pontos 8 e 9 |
| Dias de `garmin_dia` anteriores a 01/11/2025 | Podem ter sido gravados pela primeira sincronização (que volta até 364 dias) e **apagados** quando a Saúde foi aberta | pontos 2 e 3. **A quantidade real é desconhecida** (sem acesso ao banco) |
| Dias e treinos de 01/11/2025 a 31/12/2025 | **Preservados** no banco (e no backup) e agora classificados `legado` | gravados normalmente |
| Dias e treinos de 01/01/2026 em diante | Preservados, `meus` | — |
| Detalhe do treino (`.FIT`, rota, séries) | **Nunca foi guardado**; não faz parte do que se recupera | seção 2.1 |

Todo o descartado é **anterior a 01/11/2025**, portanto **legado também pelo marco novo**: **não há perda de dado do dono**. A recuperação serve só à preservação do histórico original, e é **opcional** (decisão do dono, 16.6).

### 16.6 Plano de recuperação dos registros excluídos (sem presumir sucesso)

Premissa [Fato confirmado]: o que o RAC guardava era a **versão resumida** do que a Garmin entrega (campos escolhidos pela função), não o JSON original. "Recuperar" significa **gravar de novo essa versão resumida**; o que a Garmin não devolver mais, não volta. **Não se presume que a sincronização recupere tudo**: a Garmin pode limitar o histórico acessível pela API pessoal, o relógio e a conta podem não ter os dados daquele período, e o que o dono apagou na Garmin não existe mais. **[Hipótese]** sobre cada um desses limites; nada foi testado.

| Etapa | O que faz | Toca em produção? | Autorização |
|---|---|---|---|
| **R0 · Inventário local** | O dono roda consultas **de leitura** (contagem de dias e treinos por mês, menor data de cada tabela) e vê a lista de arquivos do cofre `backups` (datas dos 8 mais novos). Abrir um backup em busca de linhas anteriores a 01/11/2025 é **leitura**, feita pelo dono | Não (só leitura) | Do dono, para rodar |
| **R1 · Recuperação por backup, se existir** | Se algum backup tiver dias anteriores a 01/11/2025, eles seriam devolvidos por **inserção que não sobrescreve nada**, via o fluxo de restauração existente (sempre com prévia e confirmação, `docs/seguranca.md`) | Sim | **Expressa**, por backup |
| **R2 · Medição na Garmin, sem gravar** | Modo novo da função, de **contagem**: por mês, quantos dias e treinos a Garmin ainda devolve **antes de 01/11/2025**, **sem gravar** | Chamada externa à Garmin | **Expressa** (função alterada e publicada antes) |
| **R3 · Preenchimento controlado** | Com o resultado da R2, o dono decide se vale a pena. Se sim, **janelas pequenas**, todas **terminando em 31/10/2025** (nunca tocam linhas de 2026), uma autorização por janela. Treinos pela lista paginada da Garmin; dias em blocos de 28 dias | Sim (gravação) | **Expressa**, por janela |
| **R4 · Conferência** | Comparar o que voltou com a medição da R2; relatório de **o que voltou e o que não voltou**, por mês; backup manual depois; registrar no histórico diário | Leitura | — |

Salvaguardas [Recomendação]:

- A recuperação **nunca é automática** e não faz parte da rotina das 6h (limite de tempo e de custo).
- Nunca sobrescrever linhas `meus` (janelas só até 31/10/2025 **ou**, quando o dono quiser recuperar também novembro e dezembro de 2025, até 31/12/2025, **apenas inserindo o que faltar**).
- A recuperação só roda **depois** da função sem exclusão e sem filtro (senão seria apagada/filtrada de novo) e **depois** da classificação no site (senão o legado entraria nas análises).
- Se a R2 mostrar que a Garmin não devolve esse período, **a recuperação termina aí** e fica registrada como "indisponível na fonte". Isso é um resultado válido, não uma falha.

### 16.7 Sequência de implementação, testes e recuperação

Cada fase é um lote; todas dependem de **autorização específica** (commit e push só com "autorizo commit" e "autorizo push" no chat). Revisa o roadmap da seção 11: a **Fase M** vem antes da S1.

| Fase | Conteúdo | Toca em | Testes obrigatórios | Autorização |
|---|---|---|---|---|
| **M0 · Decisão** | Esta seção (feita) | Documentação | `git diff --check`, testes de planejamento | — |
| **M1 · Núcleo** | Marco constante; função pura de classificação (`meus`/`legado`, sem mutar, com contagens) | `nucleo.js` | Bordas: `2025-12-31` legado, `2026-01-01` meu (inclusive), `2026-01-02` meu; treino de 31/12 às 23:50 legado; treino de 01/01 às 00:05 meu; dia e treino independentes; recebimento tardio com data antiga continua legado; entrada vazia; entrada **congelada** (a função não altera as linhas, e as linhas de saída são as mesmas); dado sem data é ignorado com aviso, não apagado | Implementação |
| **M2 · Leitura no site** | `saudeLer`/`saudeCarregar` usam a classificação; **retirar a exclusão** (ponto 2); fim de `GARMIN_DESDE` no site (pontos 1, 3 a 6); leitores de 16.3 passam pelo ponto único | `js/saude.js`, `js/painel.js`, `js/resumo.js`, `js/hoje.js`, `js/sistema.js`, `js/carreira.js`, `sw.js`/`js/app.js` (versão) | Teste de tela da Saúde com Supabase falso e linhas antes/depois do marco; **teste de guarda** (nenhum `delete` sobre as tabelas do relógio); Painel e Resumo sem o legado; busca só com treinos `meus`; RAC Hoje com a mesma prontidão; `tests/rotas.test.mjs`, `tests/hoje.test.mjs`, `tests/estrutura.test.mjs`; Chromium 390/768/1280, claro e escuro; **Fernanda idêntica à `main`** (a Saúde nem existe para ela) | Implementação + commit/push |
| **M3 · Função** | Retirar a exclusão e o filtro de gravação (pontos 7 a 9); acrescentar o modo de contagem da R2 (opcional) | `supabase/functions/garmin/index.ts` | Teste do trecho extraído (como `tests/fit.test.mjs`): sincronização com cliente de mentira que **registra todas as chamadas** — nenhuma exclusão e nenhum filtro por data; página inteira conhecida ainda encerra; push, backup, atalhos e agenda sem mudança | **Expressa** (função intocável); o dono publica a função (antes do site, se o site já depender) |
| **M4 · Recuperação** | R0 a R4 (16.6) | Banco e Garmin, por janela | Contagens antes e depois por mês; nenhuma linha `meus` alterada (comparação por contagem e por `atualizado`) | **Expressa por etapa** |
| **M5 · Documentação e fechamento** | `docs/painel.md` e Documento 05 (hoje dizem "só desde 01/11/2025"), mapa, roadmap, histórico diário | Documentação | Testes de planejamento | Com o commit |

Observações de sequência [Fato/Recomendação]:

- **M2 pode ir ao ar sem a M3** (a função continua só a apagar legado que não importa); **M3 não deve ir sem a M2** (senão o legado preservado apareceria nas análises).
- Sem SQL, sem cron, sem secrets, sem IA, em nenhuma fase.
- Versão do site (`VERSAO` em `sw.js` e `MOD_VERSAO` em `js/app.js`) trocada junto na M2.
- Suíte completa só na preparação da publicação; durante o trabalho, o teste do módulo.

### 16.8 Riscos e pontos de atenção

| # | Risco | Tipo | Mitigação |
|---|---|---|---|
| R-1 | Marco muda os números exibidos (novembro e dezembro de 2025 saem) | Fato | Avisar na tela ("a posse começa em 01/01/2026") e no relatório da M2 |
| R-2 | Recuperar **não** é garantido | Hipótese | Medir antes (R2); aceitar "indisponível na fonte" |
| R-3 | Legado preservado vaza para uma análise esquecida | Fato (risco de projeto) | Ponto único de entrada e teste que varre os leitores |
| R-4 | Ao retirar o filtro de gravação, a função grava mais linhas por rotina | Hipótese | Só no primeiro preenchimento; o limite de 120 s do cron foi pensado para 2 dias; conferir no teste da M3 |
| R-5 | `idadeFitness`, sono e VFC do dia 01/01 podem refletir a noite anterior | Fato (consequência aceita) | Decisão do dono: o dia é seu |
| R-6 | O legado ainda existe na Garmin Connect e pode voltar a ser sincronizado | Fato | Irrelevante para a propriedade (decisão do dono); a classificação por data o mantém fora das análises |
| R-7 | Treino que cruza a meia-noite de 31/12 para 01/01 | Fato | Vale a data de início: legado |

### 16.9 O que ainda preciso de você

Nenhuma informação adicional é necessária para a **M0 a M2**. Para continuar:

1. **Autorização específica para a implementação**, indicando até onde: apenas **M1 e M2** (núcleo e site, sem tocar na função), ou também M3 e M4 depois.
2. **R0**: se quiser, rodar as consultas de leitura de contagem por mês (seção 15.8 serve) e listar os arquivos do cofre `backups`, para sabermos o que existe antes de planejar a recuperação.
3. Dizer se a **recuperação do legado anterior a 01/11/2025** vale uma chamada à Garmin (M4), já que o dado é legado e não entra nas suas análises; a recomendação é decidir só depois de ver o R0.
4. Confirmar que os meses de **novembro e dezembro de 2025** podem sair das suas tendências e do Painel (continuam preservados).

## 17. Execução da DS-4.2 (13/11/2026): o que foi feito, o que ficou bloqueado e como concluir

O dono autorizou a execução completa (M1 a M5), inclusive SQL, publicação da função, recuperação e merge. Esta seção registra o **resultado real**, separando o que foi feito e verificado do que **não pôde ser executado neste ambiente**. Nada foi dado como concluído sem verificação.

### 17.1 O que foi implementado e verificado [Fato confirmado: código e testes no repositório]

| Fase | Entrega | Onde |
|---|---|---|
| **M1 · Núcleo** | Marco `NUCLEO.SAU_MARCO` (01/01/2026, inclusivo, origem registrada) e a função pura `NUCLEO.sauClassificar` (dois grupos, `meus` e `legado`, mais contagens; devolve as **mesmas** linhas, sem alterar nem copiar; classifica dias e treinos cada um pela própria data; linha sem data utilizável é contada à parte, nunca vira dado do dono) | `nucleo.js` |
| **M2 · Leitores** | Os **nove pontos** de `GARMIN_DESDE` removidos (constante, exclusão e filtro de leitura em `js/saude.js`; piso do período e rótulo em `js/painel.js`; lista de anos em `js/resumo.js`; as três da função). Todos os leitores do relógio passam pela classificação: Saúde, RAC Hoje (`js/hoje.js`), Sistema (prontidão e busca de treinos, `js/sistema.js`) e Carreira (`js/carreira.js`); Painel e Resumo recebem só `meus` pela Saúde. **A exclusão que a Saúde fazia ao abrir foi removida.** Backup e Monitor continuam sem filtro, de propósito | `js/*.js` |
| **M3 · Função (código)** | Sem `GARMIN_DESDE`, sem o `delete` de `garmin_ativ` na rotina e sem o filtro de gravação: a função grava tudo que a Garmin devolve e **não apaga mais nada** das tabelas do relógio. Dois modos novos e opcionais para a recuperação: `somenteNovos` (insere só o que não existe; nunca sobrescreve) e `apenasContar` (não grava; conta, por mês, o que a Garmin devolve e quanto já está no banco); `desde` e `ate` limitam a janela de dias | `supabase/functions/garmin/index.ts` |
| **M4 · Ferramenta de recuperação** | Painel "Histórico anterior à posse" na Saúde (só o dono): conta o legado guardado, **mede** (`apenasContar`) e **recupera** (`somenteNovos`) em janelas de 112 dias para trás a partir de 31/12/2025, até 4 janelas seguidas sem nenhum dia na Garmin; treinos pela lista completa. Mostra o relatório por mês e mantém o resultado depois do redesenho. **Trava de segurança**: antes de medir ou gravar, a tela confere se a função publicada responde no formato novo (resposta com `porMes`); a função antiga ignoraria os modos e gravaria por cima, então, nesse caso, nada do histórico é pedido | `js/saude.js` |
| **M5 · Testes e documentação** | `tests/saude_marco.test.mjs` (16 testes), documentos atualizados | `tests/`, `docs/` |

Decisão de projeto [Recomendação adotada]: o marco é uma **constante versionada no núcleo** (auditável pelo Git), não uma linha no banco. Por isso **não há migration, RPC nem gravação em produção** nesta solução.

### 17.2 Testes automatizados (resultado real, nesta sessão)

- `tests/saude_marco.test.mjs`: bordas do marco (31/12 legado, 01/01 meu, 02/01 meu; treino de 31/12 23:50 legado; de 01/01 00:05 meu), dias e treinos independentes, recebimento tardio com data antiga continua legado, entrada congelada e sem alteração, entradas vazias e sem data; **guarda permanente** (nenhum `delete` sobre as tabelas do relógio no site nem na função; `GARMIN_DESDE` e o corte de 01/11/2025 não existem mais; todo leitor passa pela classificação); a **função extraída do código real** contra um banco de mentira que registra toda chamada: grava treinos de qualquer data, não apaga, para na página já conhecida, `apenasContar` não grava nada, `somenteNovos` não toca em linha existente e é idempotente, sincronização comum continua sobrescrevendo como antes; e a trava de versão da tela.
- Verificação em **Chromium real** (Playwright, 390 e 1280 px, claro e escuro, banco e função de mentira com dados inventados): `SAUDE.dias` e `SAUDE.ativs` só com datas de 01/01/2026 em diante (01/01 incluído), contagem do legado correta, nenhuma gravação nem exclusão ao abrir, sem rolagem horizontal, sem erro de console; a medição não gravou nada, a recuperação só pediu `somenteNovos`, e o resultado continuou na tela. **Bug encontrado e corrigido nessa verificação**: o relatório sumia quando a tela se redesenhava depois da recuperação.
- Suíte completa (`bash scripts/nuvem_testes.sh`, equivalente ao CI): **Grupo 1: 1509 testes, 1507 ok, 0 falhas, 2 `todo`; Grupo 2 (PGlite): 73 ok, 0 falhas** (eram 1493 e 73 antes da DS-4.2). O teste de navegador do GitHub roda no PR.

### 17.3 O que NÃO pôde ser executado neste ambiente, e por quê [Fato confirmado]

| Operação autorizada | Situação | Motivo real |
|---|---|---|
| Publicar a Edge Function `garmin` | **Não feito** | O ambiente não tem credencial do Supabase (nenhuma variável de acesso) e o `.claude/settings.json` bloqueia a CLI `supabase`, o `psql` e a API de gerenciamento; o `CLAUDE.md` também diz que quem republica a função é o dono. Não contornei o bloqueio |
| Aplicar SQL/migrations | **Nada a aplicar** | A solução não precisa de SQL (17.1) |
| Backup verificável antes de operações que alterem dados | **Não aplicável até agora** | Nenhuma operação em produção foi feita. A recuperação é só-inserção (`somenteNovos`), mas o backup semanal e o botão "Exportar tudo" do Sistema devem ser conferidos antes de rodá-la |
| Executar sincronizações e a recuperação (M4) | **Não feito** | A rede deste ambiente **não alcança a Garmin** (conexão recusada) e o segredo `GARMIN_PERSONAL_API_KEY` só existe no servidor do Supabase. Sem a função publicada não há como rodar |
| Contar registros preservados e recuperados por período e tabela | **Não medido** | Sem acesso ao banco de produção. Os números reais só existem depois do passo 17.4 |
| Verificar o site publicado em produção | **Não verificável daqui** | O domínio do site não é acessível por este ambiente. A publicação é o GitHub Pages a partir da `main`; confirmo pelo estado do merge e dos testes, não por abertura do site |

### 17.4 Como concluir M3 e M4 (passos do dono, na ordem)

1. **Site** (já fica no ar com o merge, antes da função, sem risco): a Saúde passa a classificar e a **não apagar mais nada**; a trava impede que o painel de recuperação rode contra a função antiga.
2. **Publicar a função**: Supabase → Edge Functions → `garmin` → Code → colar o conteúdo de `supabase/functions/garmin/index.ts` → Deploy (README, "Publicar"). Isso encerra as exclusões e o filtro que ainda estão ativos na função antiga (ela continua apagando treinos anteriores a 01/11/2025 a cada rotina até lá).
3. **Backup**: Sistema → "Exportar tudo" (ou conferir o backup de domingo no cofre).
4. **Medir**: Saúde → "Histórico anterior à posse" → "Medir o que a Garmin ainda tem". Nada é gravado. Anote o relatório por mês.
5. **Recuperar**: "Recuperar o que falta" (só insere o que não existe; nunca altera nem apaga). Repetir "Medir" para conferir que "novos" zerou.
6. **Conferência opcional** no SQL Editor (só leitura): as consultas da seção 15.8 e a contagem por mês de `garmin_dia` e `garmin_ativ`.

Se a Garmin não devolver determinado período, **a limitação é um resultado válido**: nada é inventado nem reconstruído (o painel mostra apenas o que a Garmin devolveu).

### 17.5 O que se sabe sobre o que foi preservado e perdido [Fato confirmado, com limite]

- **Preservado** (e agora nunca mais apagado pelo RAC): tudo o que já está no banco, inclusive os dias e treinos de 01/11/2025 a 31/12/2025, que passam a `legado` (fora das análises, dentro do banco e do backup).
- **Já descartado no passado** (pelo corte antigo): dias e treinos anteriores a 01/11/2025; treinos desse período nem chegavam a ser gravados. Eles são `legado` também pelo marco novo, então **não há perda de dado do dono**. Quanto disso a Garmin ainda devolve só se saberá no passo 17.4.
- Contagens reais por período e por tabela: **pendentes** (sem acesso ao banco), a preencher no histórico diário após o passo 5.

### 17.6 Situação final por fase

| Fase | Situação |
|---|---|
| M0 Decisão | Concluída |
| M1 Núcleo | **Implementada e testada** |
| M2 Site | **Implementada e testada** (Node e Chromium) |
| M3 Função | Código **implementado e testado**; **publicação pendente do dono** (17.4, passo 2) |
| M4 Recuperação | Ferramenta **implementada e testada** contra a função de mentira; **execução pendente** (depende da função publicada e da Garmin) |
| M5 Documentação | Concluída com esta seção |


## 18. Encerramento e confirmação de produção — 13/11/2026

Esta seção atualiza o estado operacional que constava na seção 17. Os itens 17.3–17.6 registram corretamente o que era conhecido antes da publicação; os fatos abaixo são a conferência posterior em produção.

### 18.1 Publicação confirmada

- **PR #11:** mergeado na `main` pelo commit `b893d34bc74b10083328cb2a3caee4270e93f88f`.
- **CI da `main`:** execução `43438657518`, concluída com sucesso.
- **GitHub Pages:** execução `43438657212`, concluída com sucesso. Versão no `sw.js`: `2026-11-13.6`.
- **Edge Function `garmin`:** publicada diretamente no projeto Supabase RAC, versão **13**, status `ACTIVE`, `verify_jwt: false` preservado. O deploy incluiu `index.ts` e a dependência `alertas_preco.ts`.
- O entrypoint publicado não contém `GARMIN_DESDE` nem exclusão das tabelas `garmin_dia` e `garmin_ativ`; os modos `apenasContar` e `somenteNovos` estão disponíveis.
- Nenhuma migration ou alteração SQL foi necessária para a DS-4.2.

### 18.2 Contagens observadas no banco de produção

Consultas somente leitura executadas após a publicação:

| Tabela | Total | Legado (antes de 01/01/2026) | Meus (a partir de 01/01/2026) |
|---|---:|---:|---:|
| `garmin_dia` | 314 | 19 | 295 |
| `garmin_ativ` | 952 | 0 | 952 |

Detalhamento dos dias:
- Novembro/2025: 5 registros, todos legados.
- Dezembro/2025: 14 registros, todos legados.
- Janeiro/2026: 9 registros (23 a 31/01), todos do dono.
- Fevereiro a outubro/2026: 28, 31, 30, 31, 30, 31, 31, 30 e 31 registros, respectivamente.
- Novembro/2026: 13 registros (01 a 13/11).

Detalhamento das atividades: janeiro/2026 = 25; fevereiro = 109; março = 87; abril = 96; maio = 104; junho = 75; julho = 102; agosto = 105; setembro = 103; outubro = 105; novembro = 41. Total = 952, todas com data de evento a partir de 24/01/2026.

Há dois backups no cofre privado `backups`: `2026-11-01.json` e `2026-11-08.json`. O backup de 08/11 registra `verificado: true` no log de rotina. Não foi executada nova exportação manual nesta etapa.

### 18.3 Recuperação histórica: opcional e adiada

- A ferramenta de medição/recuperação foi publicada com o site e a função nova. A medição não grava; a recuperação usa `somenteNovos`, preservando linhas existentes.
- A recuperação do período anterior a 01/11/2025 **não foi executada**. A rotina Garmin teve respostas HTTP 504 ao solicitar o token em 12 e 13/11/2026; não foi possível confirmar a disponibilidade da API para o backfill.
- O dono decidiu não gastar tempo com a medição ou recuperação agora e pediu que o assunto fosse considerado encerrado, podendo retornar caso sinta falta de algum registro.
- Portanto, R0–R4 ficam **opcionais e fora do caminho crítico**. Não solicitar que o dono use o relógio por um dia, faça uma atividade ou rode medições para concluir a DS-4.2.
- Os registros anteriores a 01/01/2026 são legados pela regra de propriedade. A contagem de dados históricos que a Garmin ainda poderia devolver permanece desconhecida; isso não impede o funcionamento da classificação nem a continuidade do desenvolvimento do site.

### 18.4 Estado final e continuidade

| Componente | Estado |
|---|---|
| M0 · Decisão do marco | Concluída |
| M1 · Núcleo e classificação | Concluída e publicada |
| M2 · Leitores e remoção das exclusões no site | Concluída e publicada (`2026-11-13.6`) |
| M3 · Edge Function sem corte ou exclusão | Concluída e publicada (versão 13) |
| M4 · Ferramenta de medição/recuperação | Concluída e publicada; uso do backfill opcional |
| M5 · Documentação e validação | Concluída |
| R0–R4 · Backfill do legado anterior a 01/11/2025 | Opcional; adiado pelo dono; não bloqueia |
| S2–S5 · Redesenho da Saúde e sinais | Não iniciado; possível próxima etapa da DS-4 |

**Conclusão:** DS-4.2 encerrada em 13/11/2026 no escopo de proteção, classificação e publicação em produção. A recuperação de legado não é critério de aceite nem pendência do desenvolvimento atual. Qualquer retomada futura será por solicitação do dono.


## 19. Implementação S1–S5 (DS-4.3) — 13/11/2026

Registro do que foi feito na branch `claude/saude-modernizacao-s2-s5`. Guia funcional: [`docs/saude.md`](../saude.md). Os estados abaixo são separados de propósito: **implementado e testado ≠ publicado**.

| Item | Situação |
|---|---|
| S1 · Fonte única `js/fonte-saude.js` (paginação, classificação inalterada, estado completa/vazia/parcial/falha, leituras simultâneas compartilhadas) | Implementado e testado |
| S1 · Consolidação dos leitores (RAC Hoje, Sistema, Carreira; Painel e Resumo por `saudeLer`) com os mesmos resultados | Implementado e testado (regressão contra os leitores de antes, `tests/fonte_saude.test.mjs`) |
| S1 · Regras `sau*` no núcleo, sem mexer em `SAU_MARCO`, `sauClassificar`, `prontidao` ou `saudeInsights` | Implementado e testado (`tests/saude_regras.test.mjs`) |
| S2 · Hub com 7 abas, Visão geral, Recuperação, Sono; sinais S1–S4 e S12 com histerese | Implementado e testado (`tests/saude_tela.test.mjs`, Chromium) |
| S3 · Atividades e musculação (S6, S7 reaproveitado do Painel, S9) | Implementado e testado |
| S4 · Condicionamento (S10, minutos de intensidade, eficiência aeróbica, idade do condicionamento só como valor atual) | Implementado e testado |
| S5 · Tendências e Inteligência por regras (S5, S8, S11, histórico dos sinais) | Implementado e testado |
| Preferências (metas, ocultar valores, esconder local) em `PESSOAL.saudePrefs` | Implementado e testado |

Decisões de interpretação (onde o texto admitia mais de uma leitura): S4 dispara por sono curto **ou** por irregularidade com média abaixo da meta; baseline de S1/S3 = 60 dias que terminam 7 dias antes da janela, de S2 = 30 dias que terminam 5 dias antes; S6 usa 1,3×/0,7× em duas semanas completas para "persistente"; S11 usa uma segunda janela deslocada 2 semanas; S8 trata "não voltou em 5 dias" como 6 dias.

**Fora do escopo (não feito):** mapas e trajetos históricos, IA de Saúde, coleta adicional da Garmin, alteração da função `garmin`, SQL, secrets, cron, workflows, recuperação do histórico anterior a 01/11/2025. Nenhuma ação de produção foi executada.

**Publicação:** não publicado. Commit, envio ao GitHub e PR são tratados no histórico diário; o merge e a publicação em produção continuam do dono.
