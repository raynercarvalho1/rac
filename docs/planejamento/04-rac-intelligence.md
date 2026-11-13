# RAC · 04 · RAC Intelligence: inteligência proativa, não um chatbot

Diagnóstico da IA atual e arquitetura proposta para a inteligência proativa (13/11/2026). **Nada desta proposta foi
implementado.** O detalhe técnico da camada existente continua em `docs/rac-intelligence.md` e `docs/hoje.md`.
Convenções [Fato] / [Hipótese] / [Recomendação]: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

## 1. Como a IA funciona hoje [Fato]

```text
tela ──racIA(módulo, ação, entrada)──► rac-ia (Edge Function)
                                         ├─ quem chamou e papel (login + tabela membros)
                                         ├─ modo DEMO/REAL (ia_config + teto da ação no código + chave existe?)
                                         ├─ reserva no orçamento (ia_reservar, trava por casa)
                                         ├─ uma chamada à Anthropic (sem repetição, idempotência por clique)
                                         ├─ validação do JSON da ação (acoes.ts)
                                         └─ registro em ia_uso (estado, tokens, custo estimado)
tela ◄── resultado validado ── conferência humana ── só o clique em Salvar grava
```

- **Uma porta só**: `racIA()` em `js/app.js` → `supabase/functions/rac-ia` (`index.ts`, `servico.ts`, `orcamento.ts`,
  `contrato.ts`, `acoes.ts`, `provedores.ts`, `demo.ts`). Há teste que proíbe outro arquivo de chamar a Anthropic.
- **Catálogo fechado de 9 ações** (`ACOES` em `acoes.ts`):

| Ação | Modelo | Papéis | Pode ser REAL? | Estado conhecido |
|---|---|---|---|---|
| `abastecimento.interpretar` | Haiku 5.5 | dono, casa | sim, se liberada | Em DEMO em produção, segundo `docs/veiculos.md` (o banco não a liberou para REAL) |
| `mercado.nota` | Sonnet 5.5 | dono, casa | **não** (DEMO fixo) | Só demonstração |
| `alimentacao.pedido` | Sonnet 5.5 | dono, casa | **não** | Só demonstração |
| `newsletter.resumo` | Haiku 5.5 | dono | sim | **Automático** às 6h, 12h e 18h pela `rac-newsletter` (única exceção autorizada, 31/10/2026) |
| `esportes.analise`, `esportes.giro` | Haiku 5.5 | dono | **não** | Só demonstração |
| `hoje.analise` | Sonnet 5.5 | dono | só REAL, sem demonstração | Em uso a pedido; 3 chamadas de validação em 02/11/2026 (≈ US$ 0,089) |
| `fiscal.nota` | Sonnet 5.5 | dono | só REAL | Central Fiscal congelada (frente retirada do planejamento) |
| `radar.equivalencia` | Haiku 5.5 | dono | sim, quando o banco liberar | Proposta `044` **não aplicada** |

- **Orçamento em camadas**: teto interno de R$ 50/mês (≈ US$ 6,70 com câmbio e margens, em `ia_config`), reserva transacional
  antes de cada chamada, limites de 2 em andamento por pessoa, 10 por minuto e 150 por dia por casa, alertas a 50/80/100%; na
  Anthropic, créditos pré-pagos sem recarga automática. Custos em `ia_uso` e na view `ia_custos` (página `#iacustos`).
  Preços só em `ia_precos` (Haiku 5.5 US$ 0,10/0,50 e Sonnet 5.5 US$ 2/10 por milhão de tokens, conferidos em 30/10/2026).
- **Como o contexto é montado**: cada ação recebe só `texto`, `imagens` e os campos de `contexto` que ela declara; o servidor
  embrulha tudo em `<dados>` (conteúdo é dado, nunca instrução). No RAC Hoje, o navegador monta o **pacote de fatos**
  (`NUCLEO.hojeContexto`, até 12 mil caracteres, `<fato id fonte periodo>`), com minimização (sem links, e-mails, números longos,
  senhas, fotos). A IA não calcula: as contas já vêm nos fatos, e o servidor recusa resposta com número que não está nos fatos citados.
- **Quais módulos já fornecem dados à IA**: Abastecimento (fotos), Newsletter (grupos de notícias), Esportes (pacote de fatos,
  DEMO), RAC Hoje (13 fontes: agenda, tarefas, Mercado, Alimentação, Compras online, orçamentos, Saúde/Garmin, MBA, vagas,
  Newsletter, notícias, esporte, tempo), Fiscal (fotos/PDF, congelado), Radar (proposta).

### 1.1 Implementado × só planejado

| Implementado e no ar | Só planejado ou proposto |
|---|---|
| Porta única, orçamento, idempotência, DEMO isolado, validação por ação | P2: guardar no servidor o texto de uma análise paga, para recuperá-la (`docs/hoje.md`) |
| RAC Hoje com IA real a pedido, cache por pacote de fatos, trava entre abas (Web Locks) | P5: validar de verdade "fato × inferência" (`docs/hoje.md`) |
| Resumo automático da Newsletter (porta da rotina) | IA no Radar (`044`, proposta) |
| Monitor de custos (`#iacustos`) | Inteligência proativa (este documento) |

### 1.2 Detecções determinísticas que já existem, espalhadas [Fato]

A "camada 1" já existe em pedaços, sem um formato comum:

| Onde | O que detecta |
|---|---|
| `NUCLEO.hoje*` (`nucleo.js`) | Finanças do mês × mesmo trecho do mês anterior, projeção e orçamento, dias sem treino, atraso do relógio, vagas compatíveis, o que mudou desde ontem |
| `NUCLEO.pri*` (régua de prioridades) | Ordem de urgência de prazos (Próxima melhor ação, Agenda, briefing, RAC Hoje) |
| `NUCLEO.mkal*` e `garmin/alertas_preco.ts` | Alertas de preço do Mercado (aumento, queda, mínimos, melhor mercado), com resumo semanal por push |
| `supabase/functions/radar/avisos.ts` | Oportunidades de preço do Radar, um aviso por dia |
| `saudeInsights` e `prontidao` (`js/saude.js`, `nucleo.js`) | Treino forte × VFC e sono; horário de dormir × nota do sono; prontidão por VFC, FC de repouso, sono e Body Battery contra a mediana de 60 dias |
| `agendaServidor` (função `garmin`) | Vencimentos e prazos dos próximos dias para o aviso das 6h |
| `sisSaude` (`js/sistema.js`) | Robôs e rotina parados, falhas dos últimos 30 dias, backup |

## 2. Diagnóstico

1. **A segurança e o controle de custo são o ponto mais forte do RAC.** Devem ser preservados como estão.
2. **A IA é reativa**: só responde a um clique (ou ao horário da Newsletter). Não há o conceito de "algo que merece atenção"
   com estado (novo, visto, adiado, resolvido).
3. **O contexto depende da tela aberta**: `hojeColetar` roda no navegador e lê tabelas e variáveis de outros módulos
   ([Documento 02](02-auditoria-arquitetural.md#6-problemas-encontrados-com-evidência), P-04). Uma inteligência que rode sozinha
   não tem como montar o mesmo contexto no servidor.
4. **As detecções existem, mas cada uma tem seu formato, seu canal e sua regra de repetição.** Não há histórico comum, nem
   preferências do dono por tipo, nem "por que estou vendo isto" padronizado.
5. **O resultado pago não fica guardado no servidor** (P2): uma análise cobrada que se perde no aparelho não volta.

## 3. Arquitetura proposta: três camadas

```text
 CAMADA 1 · DETECÇÃO (regras, sem IA, sem custo)
   regras puras (NUCLEO) e views SQL ──► SINAIS: {tipo, entidade, fatos, severidade, por quê, válido até}
                                          com chave de deduplicação e estado (novo · visto · adiado · resolvido · descartado)
 CAMADA 2 · INTERPRETAÇÃO (IA, opcional, com orçamento)
   vários sinais + fatos ──racIA("sinais.explicar")──► relações entre fontes, explicação curta, sugestão de ação
                                                       (cita os sinais; números só dos fatos; nunca grava)
 CAMADA 3 · APRESENTAÇÃO (no lugar certo)
   RAC Hoje (cartão "Precisa de atenção") · cartão do sinal dentro do módulo · resumo diário por push (sem dado sensível)
```

### 3.1 Camada 1: detecção determinística

- **Formato único do sinal** (proposta): `tipo` (ex.: `casa.conta_vencendo`), `area`, `entidade` (o que é: a conta, o
  remédio, o robô), `chave` (tipo + entidade + período, para não repetir), `severidade` (info, atenção, urgente), `fatos`
  (números e datas já calculados), `porque` (regra, versão da regra, fonte e período em texto), `detectado_em`, `valido_ate`,
  `estado`, `link` (rota do RAC que resolve).
- **Onde roda**, em duas etapas:
  - **Etapa A, sem migration** [Recomendação]: as regras rodam no navegador, no núcleo (`NUCLEO.sin*`, puras e testadas),
    sobre o que as **fontes** (contrato do [Documento 02](02-auditoria-arquitetural.md#8-arquitetura-alvo)) já leem. O RAC Hoje
    mostra os sinais; o que o dono adiou ou descartou fica em `PESSOAL` (uma chave), para não reaparecer.
  - **Etapa B, com migration** [Recomendação]: para avisos que precisam sair **sem a tela aberta** (push), as regras viram
    **views SQL** e uma função agendada no banco (pg_cron) grava em uma tabela `sinais` com `on conflict (dono, chave)` — sem
    Edge Function para detectar. O envio do push precisa de uma Edge Function (decisão do dono, ver
    [Documento 07](07-decisoes-e-pendencias.md)).
- **Regra de ouro**: o número é calculado uma vez, por regra testada. A IA nunca soma, compara ou projeta.

### 3.2 Camada 2: interpretação inteligente

- Uma ação nova `sinais.explicar` (Haiku 5.5 por padrão), no mesmo molde de `hoje.analise`: entrada = sinais do dia com os
  fatos; saída = para cada sinal relevante, "por que importa" e, quando houver, **relações entre fontes** ("o sono caiu na
  mesma semana em que a carga de treino subiu 40%"); cada frase cita os sinais; números só dos fatos (validação que já existe).
- **Quando chamar**: a pedido do dono (botão "Explicar") e, se o dono autorizar como fez com a Newsletter, **no máximo uma vez
  por dia, só se houver pelo menos 2 sinais novos de áreas diferentes** (sinal isolado se explica sozinho, sem IA).
- **Guardar o resultado no servidor**, ligado ao `ia_uso_id` (resolve o P2 para este fluxo).
- **Custo estimado** com os preços de `ia_precos` (estimativa, não fatura): 4 mil tokens de entrada e mil de saída custam
  ≈ US$ 0,0009 no Haiku (≈ US$ 0,03 por mês, uma por dia) ou ≈ US$ 0,018 no Sonnet (≈ US$ 0,54 por mês). Muito abaixo do teto
  de ≈ US$ 6,70; continua passando pela reserva do orçamento.

### 3.3 Camada 3: apresentação contextual

- **RAC Hoje**: cartão "Precisa de atenção" com os sinais ordenados pela régua de prioridades que já existe (`NUCLEO.pri*`).
- **Dentro do módulo**: o sinal aparece também na tela da área (ex.: o remédio vencendo aparece em Medicamentos).
- **Push**: no máximo **um resumo por dia** (o aviso das 6h, que já existe), com texto genérico para saúde e localização
  ("2 novidades em Saúde"), nunca o dado sensível na notificação.
- Cada sinal tem: **"Por que estou vendo isto"** (regra, dados, período, fonte), **Ver** (abre a rota), **Adiar** (até uma data),
  **Resolvido**, **Não mostrar este tipo**.

## 4. Catálogo inicial de sinais (proposta)

Todos determinísticos. "Existe" = a regra já está no código em algum formato.

| Área | Sinal | Regra (exemplo) | Fonte | Existe? |
|---|---|---|---|---|
| Finanças | Gasto do mês acima do mesmo período anterior | > 25% e > R$ 200 | `compras`, `pedidos`, `compras_online` | Sim (`hojeFinancas`) |
| Finanças | Preço subiu em produto recorrente | regra dos alertas do Mercado | `itens`, `notas` | Sim (`mkal*`) |
| Finanças | Recorrência a confirmar | pedido com `recorrencia_status = a_confirmar` | `compras_online` | Sim (RAC Hoje) |
| Casa | Conta vence em até 3 dias / atrasada | vencimento − hoje | contas (nova) | Não |
| Casa | Valor da conta fora do padrão | > 30% acima da média de 6 meses | contas (nova) | Não |
| Casa | Encomenda na portaria há mais de 2 dias | recebida e não retirada | encomendas (nova) | Não |
| Família | Medicamento vence em até 30 dias / vencido | validade − hoje | medicamentos (nova) | Não |
| Família | Estoque abaixo do mínimo | quantidade ≤ mínimo | medicamentos (nova) | Não |
| Família | Vacina ou retorno próximo | `registros.proxima` | `registros` | Sim (Agenda) |
| Casa | Garantia termina em até 30 dias | `dados.vigenciaFim` | `registros` (documentos) | Sim (aviso das 6h) |
| Saúde | VFC abaixo da faixa pessoal 3 noites seguidas | `vfc.noite < vfc.faixaMin` | `garmin_dia` | Parcial (prontidão) |
| Saúde | FC de repouso acima do normal | ≥ 5 bpm acima da mediana de 30 dias, 3 dias | `garmin_dia` | Parcial |
| Saúde | Sono curto repetido | < 6 h em 3 de 5 noites | `garmin_dia` | Não |
| Saúde | Carga de treino subiu rápido | semana > 1,5 × média das 4 anteriores | `garmin_ativ` | Parcial (`saudeInsights`) |
| Saúde | Relógio sem sincronizar | > 24 h | `garmin_dia.atualizado` | Sim (RAC Hoje, Sistema) |
| Estudos | Avaliação do MBA em até 3 dias | prazo − hoje | `PESSOAL.mba` | Sim (Agenda) |
| Sistema | Robô ou rotina parada | idade > limite do processo | JSON `coletado`, `rotina_log` | Sim (`sisSaude`) |
| Sistema | Backup antigo | > 30 dias | `PESSOAL.ultimoBackup` | Sim (aviso das 6h) |
| Informação | Acontecimento seguido teve novidade | itens novos desde a última visita | acontecimentos (proposta) | Não |

## 5. Controle de custos, permissões e privacidade

- **Custos**: detecção não custa nada; interpretação só com o orçamento atual (reserva, teto, alertas); nenhuma repetição paga
  automática; nenhuma troca de modelo na recusa; cache pelo conjunto de sinais (mesmos sinais = mesma explicação, sem nova cobrança).
- **Permissões**: sinais são do dono por padrão. A casa só vê sinais das áreas que já vê (ex.: medicamentos de Olivia e Eddie, se o
  dono liberar), nunca finanças pessoais, saúde do dono, carreira ou IA. O banco garante (RLS), não só a tela.
- **Privacidade**: o pacote de fatos segue as regras de minimização do RAC Hoje; **localização nunca vai para a IA** nem para a
  notificação; dados de saúde só como números agregados (médias, contagens), sem séries brutas.

## 6. Rastreabilidade, histórico e prevenção de repetição

- **Histórico**: cada sinal guarda a regra e a versão que o criou, os fatos daquele momento e a sequência de estados (quando foi
  visto, adiado, resolvido). Uma interpretação guarda o `ia_uso_id`, o modelo e os sinais que citou.
- **Sem repetição**: a `chave` impede o mesmo sinal duas vezes no mesmo período; cada tipo tem um intervalo mínimo
  (ex.: sono curto, no máximo uma vez por semana); um sinal só volta se a severidade subir ou se os fatos mudarem de forma
  relevante (ex.: o valor da conta mudou); no máximo um push por dia (o padrão que a Newsletter e o Radar já seguem).
- **"Por que estou vendo isto"** sempre disponível; sem justificativa, o sinal não é mostrado.

## 7. O dono no controle

Preferências por tipo de sinal (uma chave em `PESSOAL`, depois coluna em tabela se o servidor precisar): ligado ou desligado,
mostrar no RAC Hoje, enviar no resumo por push, severidade mínima, horário de silêncio. **Padrão conservador**: poucos tipos
ligados no começo (vencimentos, robôs parados, medicamentos), os de saúde e finanças desligados até o dono escolher.

## 8. O que não fazer

- Chat como interface principal (o RAC não é um chatbot).
- IA calculando números que o banco ou o núcleo calculam com precisão.
- Chamada paga automática sem autorização expressa do dono para aquele fluxo.
- IA gravando qualquer coisa; resposta DEMO chegando ao que salva.
- Recomendações sem justificativa, genéricas ("beba água") ou repetidas.
