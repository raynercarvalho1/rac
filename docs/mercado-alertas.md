# Mercado: alertas de preço

Aba **Alertas** (`#mercado/alertas`, só do dono): `viewAlertas` e `ajustesAlertas` em `mercado.js`; regras em `nucleo.js` (`mkal*`, puras). Testes: `tests/mercado_alertas.test.mjs`.
Sem IA e sem custo: regras fixas sobre o histórico real da view `compras`. "Menor preço" quer dizer o menor **registrado no RAC**, nunca o menor do mercado.

## Arquitetura (auditada)
- **Web Push já existente:** `push_inscricoes` (um aparelho por linha, RLS do dono), chaves VAPID em `rac_segredos`, `sw.js` (mostra o aviso e abre a URL) e o envio `pushPara`/`enviarPush`, que vive **dentro da função `garmin`**
  e roda na rotina diária do banco (`rac-rotina`, 09:00 UTC, 6h em Brasília). Não existe envio por evento, e a função `garmin` é intocável sem autorização expressa.
- **Decisão deste lote:** alertas **dentro do RAC** (aba, contador na aba "Alertas (n)"), sem tocar em `garmin`, `sw.js` nem nas rotinas. Nenhum Web Push é enviado e não há rotina nova.
- **Onde ficam os dados (sem migration):** `PESSOAL["mercado-alertas"]` = `{ v:1, cfg, estado }`, na tabela `pessoal` que já existe (só a própria conta, a casa não grava, trava MFA e backup). `cfg` guarda os tipos ligados, percentuais, janelas e limites;
  `estado.lidos` guarda os ids já lidos (máximo de 1500). Os alertas em si **não são gravados**: são recalculados do histórico e têm id fixo, então o "histórico de alertas" é o próprio histórico de compras.
  Limitações: só o dono vê/configura; não dá para consultar por SQL; sem envio fora do app.

## Tela (painel navegável)
Só a apresentação: o motor (`mkal*`), a leitura e a gravação em `pessoal` são os mesmos. A vista atual fica em `st.al.vista` e sobrevive ao redesenho (por exemplo, depois de marcar como lido).
1. **Painel:** indicadores compactos e clicáveis (Novos + um por tipo, cada um com ícone e cor própria; tipo desligado aparece "desligado" e leva aos ajustes; o "menor no período" só aparece ligado), uma prévia de até 5 novos mais recentes, "⚙ Ajustes" e "Marcar todos como lidos". Nenhum detalhe é carregado aqui. No celular a grade vira 2 colunas.
2. **Lista de um tipo (ou de todos):** título, quantidade de novos e no total, filtro por tipo, "Mostrar lidos e anteriores", "Marcar todos (deste tipo) como lidos". Linhas compactas: produto e unidade, estabelecimento, data, novo/lido, preços e variação.
3. **Detalhe do alerta:** motivo, comparação de preços, compra que originou, "Ver histórico do produto" (abre Preços na unidade certa), "Marcar como lido" e os outros alertas do mesmo produto.
4. **Ajustes:** tela própria (tipos, percentuais, janelas, janela de novos e limites por produto e unidade). Todas as vistas têm "← Painel".

## Identidade e comparabilidade
Produto = nome + unidade (`mkcChaveProd`, `mkcUn`), a mesma identidade de Preços, Consumo e Comparar. kg, L, un e unidades desconhecidas (ex.: ml) nunca se misturam; embalagens diferentes são produtos de nomes diferentes.
Preço = `valor_unitario` da linha; a ordem das compras é por data e id (`mkcOrd`).

## Regras (todas têm motivo escrito no cartão)
- **Aumento / queda:** preço da compra contra a compra anterior do mesmo produto e unidade; variação = (atual − anterior) ÷ anterior; alerta se ≥ +15% / ≤ −15% (configurável de 1% a 500%). Exige uma compra anterior.
- **Menor preço histórico:** preço atual menor que **todos** os anteriores (empatar não conta). Exige pelo menos 2 compras anteriores.
- **Menor preço no período:** menor que todos os registros dos últimos N dias (padrão 90), com pelo menos 2 nessa janela e sem ser já um novo mínimo histórico. Padrão: desligado.
- **Melhor preço em outro mercado:** para cada compra, a compra mais recente até então em cada outro mercado, na mesma unidade e a no máximo N dias de distância (padrão 60); alerta se o preço de lá for ≥ 10% menor. Registros mais distantes não são comparados.
  O cartão mostra produto, unidade, mercado, preço, mercado de referência, diferença (R$ e %) e as datas.
- **Limite do usuário:** por produto e unidade (escolhido entre os que existem no histórico); toda compra com preço ≤ limite alerta. Editar o limite cria uma regra nova (id novo); remover tira os alertas.

## Deduplicação e leitura
Id = tipo | produto+unidade | id da compra que originou [| limite]. Rodar de novo gera os mesmos ids; compra nova gera ids novos e mantém os antigos. **Novo** = não lido e de uma compra dos últimos 30 dias (configurável);
o resto vai para "Lidos e anteriores". Marcar como lido grava só o id.

## Resumo diário por Web Push
O dono recebe, às 6h (Brasília), **uma** notificação com as contagens dos alertas novos. Autorizado pelo dono: alterar e republicar a função `garmin` só para isso.
- **Onde:** `supabase/functions/garmin/alertas_preco.ts` (regras iguais às do site, em TypeScript, com teste de paridade) e **um passo novo** na rotina existente (`passo("alertas_preco", …)` entre os avisos da agenda e o backup; mais um `import`). Não há rotina nova nem agendamento novo; o resto da função não foi tocado.
- **Destinatário (só o dono):** o `uid` que a rotina já calcula (quem tem dados pessoais e não é membro da casa; a Fernanda é membro). O envio usa `pushPara(adm, uid, …)`, que só lê `push_inscricoes` desse `uid`. Sem dono identificado, a rotina para (404) e nada é enviado. Nenhuma inscrição é criada.
- **O que entra:** alertas ligados, de compras dos últimos 7 dias, **não lidos** pelo dono e que ainda não foram levados a um resumo anterior. Sem alertas = sem notificação.
- **Mensagem:** só contagens ("3 quedas de preço", "2 aumentos relevantes", "1 novo menor preço histórico", "1 oportunidade em outro mercado", "1 limite de preço atingido"), sem produto, preço ou mercado na tela bloqueada. Toque abre `./#mercado/alertas`; tag `mercado-alertas` (não substitui o aviso da rotina, que usa a tag `rotina`).
- **Idempotência:** o resumo do dia é reservado com um `insert` em `pessoal` na chave `mercado-alertas-push:AAAA-MM-DD` (a chave primária impede duas reservas). Estados: `enviando`, `enviado`, `parcial` (alguns aparelhos), `falhou` e `sem_aparelho` (podem tentar de novo no mesmo dia) e `indefinido`. Rodar duas vezes no mesmo dia não reenvia; no dia seguinte os alertas já avisados não voltam.
- **Leitura:** nada é marcado como lido. O servidor nunca grava `mercado-alertas` (preferências e leituras do dono); só a chave do dia.
- **Ajuste do dono:** em Alertas → Ajustes, "Receber o resumo diário por notificação (6h)" (`cfg.push.on`, padrão ligado).
- **Banco:** nenhuma migration. `service_role` já tem `select` nas tabelas do Mercado e `insert/update` em `pessoal`; não há `delete`.
- **Publicação da função (etapa separada):** ver `docs/mercado-alertas-publicacao.md`. O Web Push só vale como operacional depois de uma notificação real recebida no aparelho do dono.
