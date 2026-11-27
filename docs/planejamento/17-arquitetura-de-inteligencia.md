# RAC · 17 · Arquitetura de inteligência (RAC Intelligence no novo RAC)

Documento 6 do conjunto Novo RAC (Lote 0, 27/11/2026). Especifica **três níveis** de inteligência e como se encaixam em Workspace, Timeline, Captura, espaços e Mapa. **[Recomendação]; nada implementado.**
Complementa, sem substituir, o [Documento 04](04-rac-intelligence.md) (três camadas: detecção, interpretação, apresentação) e `docs/rac-intelligence.md` (a camada de IA existente). Regras de IA do `CLAUDE.md` valem integralmente.
Decisões `N-xx`: [Registro](19-registro-de-decisoes.md).

## 1. Princípio: o RAC funciona inteiro sem IA (N-11)

Os níveis 1 e 2 são **determinísticos e gratuitos**; o nível 3 é **opcional, pago, desligável e sempre a pedido ou dentro dos limites já aprovados**. Desligar a IA não remove nenhuma tela, widget ou aviso dos níveis 1 e 2.

| Nível | O que faz | Como | Custo | Pode ser desligado |
|---|---|---|---|---|
| **1. Organização determinística** | Classifica, agrupa, ordena, deduplica e prioriza | regras puras em `nucleo.js` | zero | n/a (é o motor do app) |
| **2. Percepção** | Percebe novidades, alterações e pendências e as transforma em **sinais** | regras sobre dados originais + tabela `sinais` + push opcional | zero | por tipo de sinal |
| **3. Interpretação por IA** | Resume, relaciona e explica o que as regras já encontraram | só `rac-ia`, com fatos agregados, a pedido do usuário | pago, com teto | sim, por ação e geral |

## 2. Nível 1: organização determinística

Já existe em partes e passa a ser **camada reaproveitável**, com os mesmos testes:

- **Classificação** de itens da **Captura** (URL, compra, data, projeto), de compras (`mk*`, áreas `ar*`), de treinos (`sauClassificar`), de e-mails (regras do Inbox).
- **Agrupamento:** Newsletter (matérias do mesmo fato), Timeline (por dia, semana, categoria), Central de Compras (por área).
- **Priorização:** régua de prioridades (`NUCLEO.pri*`: atrasado > hoje > amanhã > 3 dias > semana > sem data, com peso por área) usada pela Agenda, Próxima ação e Hoje.
- **Deduplicação:** vínculos entre nota fiscal e compra; junção de produtos; mensagens do Inbox por Message-ID.
- **Preferências do usuário** como entrada das regras (interesses do Descobrir, fontes silenciadas, áreas de consumo).
- **Contrato:** funções puras, sem tela e sem banco, com teste; o resultado é **explicável** (cada saída diz a regra e os dados usados: "Por que estou vendo isto").

## 3. Nível 2: percepção de novidades, alterações e pendências

### 3.1 Sinais (a tabela já existe)

A tabela `sinais` (067, aplicada em produção; 4 linhas, todas do Monitor) é **genérica**: tipo (`<dominio>.<nome>`), área, severidade (`info|atencao|urgente`), estado (`aberto|fechado`), fatos, `porque`, `link`, histórico e
ciclo de vida (abre, atualiza, fecha sozinho). O Monitor é o primeiro tipo. O novo RAC a usa como **única** estrutura de percepção.

### 3.2 Catálogo de tipos a partir de fontes que já existem

| Tipo | Regra (determinística) | Fonte |
|---|---|---|
| `agenda.vencendo` | item datado em ≤ N dias, não feito | `agenda` |
| `casa.documento_vence` | documento ou garantia vence em ≤ 30 dias | `familia` |
| `familia.remedio_acabando` | estoque calculado ≤ N dias | `familia`, `NUCLEO.famMeds` |
| `saude.queda_prontidao` | prontidão cai X pontos em 3 dias | `saude` |
| `financas.gasto_anormal` | área acima da média móvel | Central de Compras |
| `financas.oferta` | preço abaixo do pago | Radar |
| `captura.pendente` | itens da caixa com mais de 3 dias | Captura |
| `projetos.parado` | projeto ativo sem movimento em 14 dias | Projetos |
| `descoberta.novo` | novos itens de interesse desde a última visita | Newsletter, vagas, esportes |
| `monitor.processo` | robô ou rotina atrasados (existe) | `monitor_processos` |

### 3.3 Ajustes necessários para suportar espaços (Lote 5)

- `sinais` hoje tem `dono` e só o dono lê. Precisa de **destinatário/espaço** (`espaco_id`, `visivel_para`) para sinais de espaço compartilhado ("a lista da casa tem 12 itens", "documento do carro vence"), com a regra P-1 do [Documento 16](16-arquitetura-de-identidade-e-compartilhamento.md#6-o-que-nunca-pode-vazar-regras-de-privacidade): o servidor que cria sinais filtra explicitamente por espaço e pessoa.
- **Preferências por pessoa e tipo:** ligar/desligar, silêncio, frequência (como o Monitor: silêncio 22h–7h, no máximo 3 push por dia).
- **Apresentação** (camada 3 do Documento 04): widget **Sinais abertos**, selo na barra, seção "Sugerido agora" na Minha Casa, push consolidado. Nunca alerta repetido; sinal fechado não reaparece sem fato novo.
- **Contexto (inteligência contextual determinística):** hora, dia da semana, página ativa, espaço ativo e última atividade escolhem **qual página sugerir** (a página tem `contexto` opcional: "dia útil", "fim de semana", "viagem") e **quais sinais aparecem primeiro**. É **sugestão**, o usuário mantém controle (N-11); nenhuma troca automática de layout.

### 3.4 "O que mudou"

O bloco "O que mudou desde ontem" do Hoje (regras por fonte, `hjMudouAdd`) vira o widget `hoje.mudou` e passa a consumir **diferenças** por provedor da Timeline (janela "desde a última visita") quando a Timeline existir; antes disso, segue como está.

## 4. Nível 3: interpretação por IA

Todas as regras do `CLAUDE.md` e de `docs/rac-intelligence.md` permanecem: **só a função `rac-ia`, só `racIA()` no site, a IA nunca grava, DEMO nunca salva, sem repetição paga automática, sem troca de modelo na recusa, preços só em `ia_precos`**.

| Uso novo | Ação (catálogo fechado em `acoes.ts`) | Quando roda | Entrada | Resultado |
|---|---|---|---|---|
| Resumo da semana por espaço | `espaco.resumo` | a pedido | fatos agregados dos sinais e da Timeline **do usuário no espaço** | texto com fatos citados, validado; o usuário guarda |
| Sugestão de destino da Captura | `captura.sugerir` | a pedido, só quando as regras não classificam | **somente o texto do item** que o usuário escolheu enviar | destino sugerido (uma das opções fixas) |
| Por que isto importa (explicar sinal) | `sinais.explicar` | a pedido em um sinal | fatos do sinal | explicação curta, sem número novo |
| Curadoria do Descobrir | `descobrir.resumir` | automática só se o dono ligar (como a Newsletter, teto diário) | títulos e trechos públicos | resumo por tema |
| Análise do Hoje | `hoje.analise` (existe) | a pedido / 2 por dia se ligado | pacote de fatos | análise validada |

- **Cada ação nova** segue a skill `rac-acao-ia`: entrada em `acoes.ts` (modelo, papéis, limites, JSON obrigatório, validação), demonstração em `demo.ts` (exceto ação só real) e testes.
- **Privacidade:** a IA recebe **somente fatos que o usuário que pediu pode ver**, do espaço ativo, **agregados** sempre que possível; nunca conteúdo de e-mail, exames, fotos ou arquivos da Biblioteca sem escolha explícita naquele clique (P-5).
- **Orçamento:** continua o teto mensal e os limites de `ia_config`; **sem alterar teto, câmbio ou margem** neste planejamento. Ações automáticas são exceção por decisão do dono, e cada uma registra no `docs/rac-intelligence.md`.
- **Falha da IA** nunca afeta tela: o nível 1 e 2 já mostram o essencial; a interpretação aparece como complemento ("IA indisponível agora").

## 5. Integração com as camadas do novo RAC

| Camada | Uso da inteligência |
|---|---|
| **Workspace** | widgets `sinais.abertos`, `hoje.mudou`, "Sugerido agora"; página sugerida por contexto; **Desativar** uma instância pausa também os avisos que ela gerar (N-06) |
| **Timeline** | provedores alimentam "o que mudou"; sinais ligam ao registro original por `link` |
| **Captura** | classificação determinística; IA só opcional e por clique |
| **Espaços** | sinais e resumos por espaço, filtrados por papel |
| **Mapa** | sinais de rotina (ex.: "treinos fora da região habitual") só por regra e só com o consentimento do dono; sem rastreamento contínuo |
| **Projetos** | `projetos.parado`, resumo do projeto por IA a pedido |

## 6. Limites (o que a inteligência não faz)

- Não grava, não exclui, não envia e-mail nem compra por conta própria.
- Não age por inferência sobre dados de saúde, e-mail ou localização sem ação do usuário (apresenta e explica).
- Não cria avisos repetidos nem ruído: **no máximo 3 push por dia** (padrão do Monitor, ajustável por pessoa), silêncio noturno.
- Não substitui número calculado por regra por número da IA; resposta com número fora dos fatos é descartada (regra já usada em `saude.resumo`).
- Não é requisito para nenhuma função básica.

## 7. Riscos e casos extremos (Grill Me)

- **Sinal de espaço compartilhado revelando dado privado** → tipos marcados `compartilhavel`; teste com dois usuários (P-1).
- **Excesso de sinais** → limites por pessoa, agrupamento em um push, fechamento automático, "silenciar tipo".
- **Custo escondido de IA** → toda ação registrada em `ia_uso`, página de custos existente, nenhuma automática sem decisão do dono.
- **Resumo com informação errada** → validação dos números contra os fatos, conferência humana antes de guardar.
- **Servidor lento em muitas regras** → sinais calculados por job (como `monitor-alerta`) com limite por rodada; o cliente só lê a tabela.
- **Mudança de regra altera histórico** → `regra_versao` no sinal (já existe).
