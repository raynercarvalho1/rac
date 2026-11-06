# RAC Hoje e monitor de custos da IA

O assistente do dia do dono: junta o que pede atenção em todos os módulos, explica o que mudou e recomenda, com a IA real
(ação `hoje.analise`, Sonnet 5.5). **Só da conta do dono.** A Fernanda (papel casa) continua exatamente como estava.

## Estado (02/11/2026, Etapa 2)

| Parte | Estado |
|---|---|
| Coletor `hojeColetar()` (`js/hoje.js`) | Pronto e testado (local) |
| Regras do dia `NUCLEO.hoje*` (`nucleo.js`) | Prontas e testadas |
| Ação `hoje.analise` na `rac-ia` | Pronta e testada (local); **não publicada** |
| SQL `028_hoje.sql` (libera a ação) e `029_ia_monitor.sql` (monitor) | **Aplicados em produção** em 02/11/2026 |
| Monitor de custos `NUCLEO.iaMonitor` + view `ia_custos` | Contas prontas e testadas; view no ar, só do dono |
| `rac-ia` | **v8 publicada** em 02/11/2026 (`hoje.analise` REAL; detalhe de custo no registro) |
| Tela do RAC Hoje (`#rachoje`) e painel Custos de IA (`#iacustos`) | Prontas e testadas (local, 06/11/2026); **não publicadas** |
| Chamadas reais à IA | **3 em 02/11/2026** (validação; 2 aceitas e 1 recusada pela validação), US$ 0,089226 estimados |
| Site com o RAC Hoje e os Custos de IA | Ainda **não publicado** (trocar `VERSAO` e `MOD_VERSAO` na publicação) |

## Arquitetura (cada parte separada)

1. **Coleta** — `hojeColetar(forcar)` em `js/hoje.js`: 13 fontes em paralelo, cada uma `{ok, v, vazio, quando}` ou `{ok:false, erro}`
   (uma falha nunca derruba as outras), 12 s por fonte, uma leitura por sessão (10 min; pedidos simultâneos dividem a mesma; o ↻ e
   `forcar` leem de novo). Só lê, e só o período que interessa ao dia.
2. **Regras** — `NUCLEO.hoje*`: estado das fontes (ok, vazia, falhou, desatualizada, ausente), prioridade (a régua da Próxima ação),
   itens sem repetição (o mesmo assunto em duas fontes vira um, com as duas), finanças do mês contra o mesmo trecho do mês anterior,
   projeção e orçamento, saúde (prontidão do núcleo, dias sem treino, atraso do relógio), vagas compatíveis e o que mudou desde ontem.
3. **Contexto** — `NUCLEO.hojeContexto`: o pacote de fatos `<fato id="fNN" fonte="…" periodo="…">`, até 12 mil caracteres, com as
   fontes que falharam como fatos (para a IA dizer o que não sabe). Minimização: sem links, e-mails, números longos (documentos,
   cartões, contas), sem nada que pareça senha, token ou chave; sem fotos.
4. **IA** — `hojeAnalisar({pergunta, nova})` chama `racIA("hoje","hoje.analise", …)`. No servidor, a ação tem instruções fixas,
   formato JSON obrigatório e validação: todo trecho cita fatos do pacote, todo número tem de estar nos fatos citados, cada relação
   cruza pelo menos duas fontes, há pelo menos um item de atenção e uma recomendação, as incertezas não têm números, e com pergunta a
   resposta é obrigatória. A IA não calcula (as contas já vêm nos fatos), não grava, não compra, não envia e não sincroniza.
5. **Validação e falhas** — só conta como análise a resposta REAL, concluída e no formato. DEMO, erro, resposta inválida, falta de
   conexão e tempo esgotado (120 s) voltam `ok:false` com o motivo, e o resultado determinístico vem junto, marcado
   "regras do RAC (sem IA)". **Sem demonstração**: em DEMO a `rac-ia` responde o erro `sem_real` (nada reservado nem cobrado).
6. **Cache** — por pacote de fatos + pergunta (`NUCLEO.hojeChave` sobre `NUCLEO.hojeTextoChave`, que tira da chave o tempo: os fatos
   da fonte Tempo e o estado dela; a IA continua recebendo o tempo): o mesmo dia com os mesmos dados não é pago de novo (guardado neste
   aparelho, as 8 últimas análises; a mesma chave também é a idempotência da `rac-ia`, que não cobra duas vezes). `nova:true` é a nova
   análise pedida pelo dono (outra chave). Pedidos simultâneos da mesma análise fazem uma chamada só.
7. **Consumo** — tudo pela `rac-ia`: reserva no orçamento antes, uma chamada com tempo máximo, registro em `ia_uso` (modulo `hoje`).

## Fontes

| Fonte | De onde | Período |
|---|---|---|
| Agenda e aniversários | `agendaColetar()` (Família, Veículos, Documentos, IPVA, MBA, aniversários, lembretes, Carreira, backup) | o que a agenda já junta |
| Tarefas da casa | `lista` (tarefas abertas) | até 50 |
| Vagas e carreira | `vagas.json` já carregado (`VG`), perfil e funil (`PESSOAL`) | vagas até 7 dias |
| Newsletter | `newsletter.json` + `NUCLEO.nlEdicao` **em memória** (a aba Hoje não é aberta: nada gravado no histórico) | edição atual |
| Notícias de Sorocaba | `noticias.json` | as 6 primeiras |
| Esportes | jogo dos Dodgers hoje (API pública da MLB, a mesma do resumo falado) | hoje |
| Mercado | `compras` (data e valor) | do 1º dia do mês passado |
| Alimentação | `pedidos` (data e total) | do 1º dia do mês passado |
| Compras online | `compras_online` (+ recorrências a confirmar) | do 1º dia do mês passado |
| Orçamentos | `orcamentos` | — |
| Saúde e relógio | `garmin_dia` e `garmin_ativ` **do banco** (nunca a função garmin) | 60 e 14 dias |
| MBA | `mbaAulas`, `mbaAvals`, `mbaFin` (PESSOAL) | próximas |
| Tempo | Open-Meteo (o mesmo do Início) | hoje |

**Pendentes** (ficam para depois, com motivo): Gmail (nunca automático; só com o toque do dono); Família/Olivia/Eddie/Veículos em
detalhe (a agenda já traz vacinas, retornos, revisões, IPVA e garantias; ler os registros inteiros e as fotos seria pesado para o dia);
Segurança (estado do código de verificação; precisa do módulo da Central); Resumo e Painel (retrospectivas, não o dia); Conexões, X e
Rede (a Rede já entra pela agenda e sai do site no roteiro).

**Consultas repetidas eliminadas**: a Agenda e a Próxima ação do Início (e o resumo falado) liam a tabela `registros` inteira cada uma;
agora quem pede enquanto uma leitura está em curso usa a mesma (`agendaColetar` em `js/sistema.js`; nada fica guardado depois).
O RAC Hoje não chama a Próxima ação (tem as mesmas regras no núcleo), então não repete a leitura da agenda nem a do relógio.

## Monitor de custos

O registro de cada chamada paga já existia em `ia_uso` (015): id, data, ação, módulo (a funcionalidade), modelo, tokens de entrada e
saída, custo estimado, estado, tempo, e a conferência com o Console (`reconciliado_usd` = o valor cobrado de verdade). A mesma chamada
não é contada duas vezes (chave de idempotência única e estados que só avançam). O `029_ia_monitor.sql` acrescenta, sem reescrever o
histórico: provedor, id da requisição (`msg_…`), tokens de cache, custo de entrada e de saída, os preços e a data da tabela usados, o
câmbio e o custo em reais; o preço do cache em `ia_precos` (vazio até o dono conferir na página oficial: vazio = o cache conta como
entrada cheia, por excesso, e o registro diz isso); avisos e fator de consumo atípico em `ia_config` (vazios: nenhum limite é
configurado); e a view `ia_custos`, só do dono (a Fernanda não vê nada), com o custo **conhecido** (cobrado), o **estimado** (uso ×
tabela da hora) e o **recalculado** com o preço de hoje, sem gravar nada.

`NUCLEO.iaMonitor(linhas, hoje, config, filtro)` faz as contas do painel futuro: hoje, 7 dias, mês e total; chamadas, tokens (com cache)
e custo médio; por funcionalidade e por modelo; evolução diária (30 dias) e mensal; % do limite mensal em reais com os avisos (50, 75 e
90% por padrão); consumo atípico (hoje acima de 3× a mediana dos dias com gasto nas duas semanas anteriores, com pelo menos 5 dias de
base); e funcionalidades com mais da metade do gasto do mês. Sem informação de custo, nada é inventado (tipo `sem_dado`).

## Telas (só do dono; a Fernanda não vê nenhuma)

**RAC Hoje (`#rachoje`, em `js/hoje.js`).** Abrir a tela só lê: coletor, regras do núcleo, cache deste aparelho e as últimas chamadas em
`ia_custos`. Mostra saudação e data, o estado de cada fonte (ok, sem dados, falhou, desatualizada, não lida), as prioridades do dia e o
que mudou desde ontem (regras do RAC, sem IA), a análise da IA, a pergunta contextualizada e o histórico recente. Na análise: o selo
**Atual** ou **Desatualizada** (`NUCLEO.hojeDefasagem`: outro dia, dados mudaram desde então, mais de 6 h ou sem base para comparar), data
e hora, modelo, custo estimado e tokens, **Fato** × **Inferência** em cada item de atenção, relações e recomendações marcadas como
inferência/sugestão, incertezas e os fatos utilizados (guardados na própria análise, `NUCLEO.hojeCitados`). A IA só é chamada por
"Analisar o dia" ou "Perguntar": o primeiro toque pede a confirmação (diz que é chamada paga), só "Confirmar e chamar a IA" chama, um
pedido por vez (`HJ.ocupado`), e a chave de idempotência e o cache de `hojeAnalisar` continuam valendo (mesma análise = sem nova
cobrança; "Analisar de novo (nova cobrança)" é dito no botão). DEMO, erro, resposta inválida e tempo esgotado aparecem como erro real
(com código, estado, id e o que pode ter sido cobrado), nunca como análise.

**Custos de IA (`#iacustos`, em `js/iacustos.js`).** Só leitura de `ia_custos` (em páginas de 1.000), `ia_config` e `ia_precos`: não
chama a IA, não grava, não cria limite nem muda orçamento (isso segue em Sistema → RAC Intelligence). Indicadores (hoje, 7 dias, mês,
total, em US$ e ≈ R$), limite mensal e consumo atípico quando configurados, **classes de custo** (reconciliado = valor conferido no
Console; estimado = tokens × tabela da hora; reserva = chamada incerta; sem dado; sem custo; a API informa tokens, não custo, então não
há "custo informado pelo provedor": a tela mostra quantas chamadas têm uso e id da requisição informados), tokens (entrada, saída e
cache, ou "sem dado"), gráficos (por dia nos últimos 30, por mês, por funcionalidade, por provedor e modelo; todos com `racDica` e valor
fixo em cada barra), preços e câmbio usados e o histórico (filtros por período, funcionalidade, modelo, classe e estado; ordenação;
10, 15, 25 ou 50 por página; toque na linha mostra preço, câmbio, custo recalculado e id da requisição). As contas são
`NUCLEO.iaMonitor` e `NUCLEO.iaHistorico`. Em telas estreitas (até 1180 px o histórico, 760 px as demais tabelas) as linhas viram cartões.

## Para ligar em produção (precisa de autorização específica do dono)

1. Rodar `supabase/028_hoje.sql` (libera `hoje.analise` só para o dono, sem mexer em modo, limite, câmbio nem teto).
2. Rodar `supabase/029_ia_monitor.sql` (colunas do monitor, `ia_concluir` com o detalhe, view `ia_custos`).
3. Tirar a linha `-- status: pendente` dos dois.
4. Publicar a `rac-ia` (CLI, como em docs/rac-intelligence.md): ela lê as colunas novas de `ia_precos` e manda o detalhe ao concluir,
   então só depois do 029.
5. Fazer as primeiras chamadas reais (pelo console do site logado: `RAChoje.analisar()`), conferir em `ia_custos` e no Console.
6. Publicar o site (o `js/hoje.js` entra no service worker; trocar `VERSAO` e `MOD_VERSAO`).

Custo por chamada, com a tabela de `ia_precos` (Sonnet 5.5: US$ 2 por milhão de tokens de entrada e US$ 10 de saída, conferida em
30/10/2026) e o câmbio da configuração (6,00 + 12%): típica (5,3 mil tokens de entrada, 1,5 mil de saída) ≈ US$ 0,026 (R$ 0,17);
máxima (9,8 mil de entrada, 4 mil de saída) ≈ US$ 0,060 (R$ 0,40). Os tokens de entrada são uma medida por excesso (2 caracteres por
token); o valor certo vem do uso informado pela API em cada chamada.
