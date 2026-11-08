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

## Web Push (próxima etapa, não feita)
Para um resumo diário por push seria preciso o servidor recalcular os alertas: a rotina diária (`garmin`, que já envia o aviso das 6h) leria `pessoal["mercado-alertas"]` e as compras com a mesma lógica em TypeScript, e juntaria uma linha ao push existente
(por exemplo "2 alertas de preço novos"), gravando no `estado` o que já foi avisado para não repetir. Isso exige **autorização expressa para alterar e republicar a função `garmin`**; por isso ficou fora deste lote. Push imediato por evento exigiria uma rotina nova, que também não foi criada.
