# RAC · 08 · Frentes funcionais

Propostas funcionais e técnicas de cada frente (13/11/2026). **Nada aqui foi implementado.** Toda tabela citada é proposta;
os nomes são sugestões para discussão. Migrations novas começariam no número 050 (a 049 é a última aplicada; a 040 não foi aplicada
e não será, por decisão do dono; 041 e 044 são propostas). Convenções [Fato] / [Hipótese] / [Recomendação]: ver o
[Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

Regras que valem para toda tabela nova (do `CLAUDE.md`): arquivo numerado em `supabase/` que pode rodar de novo, RLS ligado,
`revoke all ... from anon`, trava restritiva "mfa" do 022, inclusão em `NUCLEO.SEG_TABELAS` (backup, com pk/fk) e em
`tests/seguranca.test.mjs`, restauração com prévia e confirmação. Por isso o passo A6 do
[Documento 02](02-auditoria-arquitetural.md#9-plano-gradual-de-melhoria) (auditoria sem lista fixa) deve vir antes desta frente.

## Central da Família e da Casa

### Pessoas e animais

**Hoje** [Fato]:

- Não há cadastro de pessoas. Os integrantes estão **fixos no código**, no objeto `FAM` de `js/familia.js`: `eddie`, `olivia`,
  os veículos (`civic`, `moto`, `c3`) e o cofre `docs`. Os nomes também aparecem num mapa da função `garmin` (`NOMES`).
- A tabela `registros` usa a coluna `quem` com um apelido curto (`^[a-z0-9-]{2,24}$`, migration `006`); `bebe.quem` tem padrão `olivia`.
- `membros` guarda **contas de login** (a Fernanda como "casa"), não integrantes da família.

**Proposta** [Recomendação]: uma tabela `integrantes` (pessoas e animais) cuja chave é o **mesmo apelido** usado hoje em
`registros.quem` (nenhum dado antigo precisa mudar):

| Coluna | Para quê |
|---|---|
| `apelido` (chave, ex.: `olivia`) | liga com `registros.quem`, `bebe.quem` e as tabelas novas |
| `nome`, `tipo` (`pessoa` ou `animal`), `especie` | exibição e regras (ex.: antipulgas só para animal) |
| `nascimento` (opcional), `foto` (caminho no cofre `familia`), `cor` | página e cartões |
| `conta` (opcional, liga a uma conta de login) | Rayner e Fernanda, se quiserem aparecer como integrantes |
| `ativo`, `ordem`, `criado_em` | organização |

- `FAM` passa a ser montado a partir da tabela, **com o objeto atual como reserva** enquanto a migration não for aplicada (o mesmo
  padrão que o Mercado usa para a 046). Veículos continuam como estão (são bens, não integrantes).
- Sem dados sensíveis na tabela (documentos continuam no cofre Documentos). Nada pessoal no código: nomes e fotos ficam no banco.
- Quem pode cadastrar e editar (só o dono, ou a casa também) é decisão do dono.

### Medicamentos

**Hoje** [Fato]: existem os **tratamentos** (receitas): `registros` do tipo `tratamento` com `dados.meds` (nome, dose, como,
início, dias, uso contínuo), e a vista "Remédios em uso" (`famMeds`, `famAtivos` em `js/familia.js`). Não existe o **estoque** (a
caixa física em casa, com validade e foto).

**Proposta** [Recomendação]: separar os dois conceitos e criar o estoque.

Tabela `medicamentos` (um registro por caixa ou frasco):

| Grupo | Colunas |
|---|---|
| Requisitos iniciais | `nome`, `quem` (apelido do integrante), `validade`, `foto` (lista de arquivos no cofre `familia`, pasta `<dono>/medicamentos/`), `criado_por`, `criado_em`, `atualizado_em` |
| Descrição | `apresentacao` (comprimido, gotas, xarope, pomada…), `concentracao`, `observacao` |
| Futuro (colunas opcionais desde o início, para não migrar depois) | `quantidade`, `unidade`, `local` (onde está guardado), `estoque_minimo`, `aberto_em`, `validade_apos_aberto_dias`, `situacao` (`guardado`, `em_uso`, `acabou`, `descartado`), `descartado_em` |

- **Histórico de cadastro**: uma tabela de histórico só de acréscimo, compartilhada pela Central da Casa (`casa_historico`:
  entidade, id, tipo do evento, quando, quem fez, dados), com gatilho que impede alterar ou apagar (o mesmo padrão do
  `radar_historico`). Eventos: cadastro, edição, uso, reposição, descarte. Uma tabela de histórico para medicamentos, encomendas
  e contas reduz o custo de tabelas novas.
- **Descartar não apaga**: marca `descartado` e fica no histórico.
- **Telas**: lista por pessoa ou animal com selo de validade (vencido · vence em N dias · ok), filtro "vencendo", cadastro pela
  câmera com conferência antes de salvar; na página da Olivia e do Eddie, a vista "Remédios" ganha "Em casa".
- **Alertas** (sinais do [Documento 04](04-rac-intelligence.md)): vence em 30 e 7 dias, vencido, estoque no mínimo, aberto há mais
  tempo que o permitido. Botão "repor" que adiciona à Lista de compras (a pessoa confirma).
- **IA, depois**: ler a foto da caixa (nome, concentração, validade) com uma ação nova, primeiro em DEMO e só com autorização.

### Contas domésticas

**Hoje** [Fato]: não existe. Só os boletos do MBA (em `PESSOAL.mba`), os orçamentos por categoria (`orcamentos`) e a Agenda.

**Proposta** [Recomendação]:

| Tabela | Uma linha por | Colunas principais |
|---|---|---|
| `contas` | conta recorrente (ex.: Naturgy, energia, água, internet, condomínio) | `fornecedor` (nome), `tipo` (gás, energia, água, internet, telefone, condomínio, seguro, assinatura, outro), `descricao`, `categoria` (a do orçamento), `recorrencia`, `dia_vencimento`, `valor_estimado`, `debito_automatico`, `ativa`, `numero_cliente` (opcional; fica só no banco) |
| `contas_lancamentos` | fatura | `conta_id`, `competencia` (mês), `vencimento`, `valor`, `consumo` e `unidade` (m³, kWh; opcional), `situacao` (`aberta`, `paga`, `cancelada`; "atrasada" é calculado), `pago_em`, `valor_pago`, `forma`, `arquivos` (fatura e comprovante no cofre), `observacao`; único por conta e competência |

- A fatura **prevista** do mês não é gravada: é calculada a partir de `contas` até a fatura de verdade ser lançada (sem dado duplicado).
- Entra no Painel e no orçamento pela categoria (sem contar duas vezes: conta da casa não aparece em notas nem pedidos).
- Sinais: vence em 3 dias, atrasada, valor ou consumo mais de 30% acima da média de 6 meses.
- Importação: manual com o PDF da fatura no começo; depois, a busca no Gmail que já existe (só leitura, no navegador) pode achar o
  e-mail da concessionária e anexar o PDF. Sem robô no servidor lendo e-mail.

### Condomínio e encomendas

**Proposta** [Recomendação]:

| Tabela | Colunas principais |
|---|---|
| `encomendas` | `destinatario` (apelido do integrante ou texto), `descricao`, `loja`, `transportadora`, `codigo_rastreio` (opcional), `compra_online_id` (opcional, liga ao pedido de Compras online), `previsao`, `recebida_em`, `local` (portaria, em mãos, armário), `situacao` (`a_caminho`, `na_portaria`, `retirada`, `devolvida`, `problema`), `retirada_em`, `retirada_por`, `foto` (opcional), `observacao` |
| `condominio_ocorrencias` | `data`, `tipo` (manutenção, barulho, segurança, aviso, assembleia, outro), `titulo`, `descricao`, `situacao` (aberta, em andamento, resolvida), `protocolo`, `arquivos` |

- Histórico e ocorrências de cada encomenda no `casa_historico`.
- Ligação com Compras online: um pedido que muda para "enviado" **sugere** criar a encomenda (a pessoa confirma).
- **Sistema de segurança do condomínio**: guardar só informação não secreta (contatos da portaria, horários, regras de entrega e
  de visitantes) numa nota ou em Documentos. **Nunca** códigos de acesso, senhas, credenciais de câmeras ou de aplicativos de
  portaria no RAC. Integrar com o aplicativo do condomínio só se ele oferecer API ou aviso oficial (a investigar), sem raspagem.
- **No RAC Hoje**: "Na portaria: 1 encomenda (há 2 dias)", "A caminho: 2".

### Organização técnica da frente

- Um módulo novo para a Casa (contas, encomendas, condomínio) com sub-rotas (ex.: `#casa/contas`) e Medicamentos acessível
  pela Casa e pelas páginas da Olivia e do Eddie. Já nascendo na arquitetura-alvo: fontes com contrato, regras no núcleo
  (`casa*`, `med*`), kit de UI e Design System.
- Ordem sugerida: integrantes → medicamentos → encomendas → contas → condomínio (do mais simples e pedido para o mais complexo).
- O que a Fernanda vê de tudo isso é decisão do dono (hoje ela vê Eddie e Olivia, Lista, Documentos e Veículos).

## RAC Hoje: painel central

**Hoje** [Fato]: o RAC Hoje (`#rachoje`, `js/hoje.js`) é do dono, lê 13 fontes (até 12 s cada, uma leitura por sessão de 10 min),
aplica as regras `NUCLEO.hoje*`, monta o pacote de fatos e oferece a análise com IA (só REAL, a pedido). O Início (`renderInicio`)
tem 13 cartões próprios, e Agenda, Resumo e Painel são outras visões agregadas (P-15 do [Documento 02](02-auditoria-arquitetural.md)).

**Proposta** [Recomendação]: o RAC Hoje vira a **porta de entrada do dono** (o Início passa a mostrar o painel; questão D-12, em aberto), com os blocos:
Precisa de atenção (sinais) · Hoje e amanhã (compromissos, contas, medicamentos, encomendas) · Números do mês · Saúde ·
Acontecimentos · Integrações (monitor) · Recomendações da IA (a pedido). **Sem duplicar dados**: cada bloco lê a fonte do módulo
responsável (contrato de fontes, passo A4). A casa continua entrando pelo Mercado.

### Requisito anterior 1: a notificação das 6h abrir o destino certo

[Fato] A rotina das 6h (`garmin`, passo "alertas") manda o endereço `./#agenda` (ou `./#resumo` no domingo, ou `./#lista` quando
só há compras). No `sw.js`, o clique procura uma janela do site com `matchAll({includeUncontrolled:true})`, chama
`client.navigate(destino)` e depois `focus()`; sem janela, abre uma nova.

[Hipótese] `navigate()` é recusado quando a janela não está sob controle do service worker (por exemplo, a primeira abertura
depois de uma atualização); a promessa falha antes do `focus()` e nada acontece. No iPhone (app instalado), a troca só do trecho
depois do `#` também pode não redesenhar se o destino já for a página aberta. **Precisa de teste no aparelho do dono.**

[Recomendação], só site e service worker (sem tocar na `garmin`):

1. No `sw.js`: primeiro `focus()` na janela encontrada, depois `postMessage({tipo:"abrir", url})`; só sem janela, `openWindow`.
2. No site: ao receber a mensagem, trocar o `location.hash` (ou redesenhar, se já for o mesmo) e atualizar os dados da página
   (com as mesmas proteções do item 2 abaixo).
3. Testar sem esperar as 6h: Sistema → "Notificações neste aparelho" → **Mandar um teste** (a função já envia um push de
   teste que abre `#sistema`).
4. Qual deve ser o destino é a questão D-05, em aberto. Trocar o destino de `#agenda` (para `#rachoje` ou para o item) exige
   mudar a `garmin`: **só com autorização**.

### Requisito anterior 2: atualizar ao voltar, sem apagar o que está sendo digitado

[Fato] Não há reação à volta para a aba (P-16). Mas a base pronta existe: `atuAtualizar()` com `NUCLEO.atuPode` (não roda com
formulário alterado, tarefa longa, sem internet ou outra atualização em curso), `atuFormSujo`/`atuCampos` (compara cada campo com o
valor antes do primeiro toque, inclusive a captura rápida) e o "busca antes, troca depois" dos módulos.

[Recomendação]:

- Ouvir `visibilitychange` (e `pageshow` vindo do cache do navegador). Se a página ficou escondida por **5 minutos ou mais**, chamar
  a atualização em modo **silencioso**.
- Não atualizar se: há campo alterado, o foco está num campo de texto, há confirmação aberta, há tarefa longa (IA, envio de
  fotos, importação, backup) ou não há internet. Nesses casos, nada muda e nada é perdido.
- Silencioso = sem aviso "Atualizando…"; só um aviso curto se algo mudou ou falhou. Nunca chama Garmin, Gmail nem IA (regra do ↻).
- A decisão fica numa função pura do núcleo (ex.: `NUCLEO.atuAoVoltar`), com teste dos casos acima.
- Limite conhecido: Resumo, Esportes e Lista ainda redesenham pelo caminho padrão (limitação aceita em 02/11/2026, README).

## Garmin avançado

Base técnica no [Documento 05](05-integracoes-e-automacoes.md#garmin-o-que-existe-de-verdade). Sequência [Recomendação]:

| Etapa | O que | Toca na `garmin`? |
|---|---|---|
| G1 | Mover as regras de padrões (`saudeInsights`) e de prontidão para o núcleo, com testes | Não |
| G2 | Sinais de saúde com os dados já guardados: VFC abaixo da faixa, FC de repouso alta, sono curto repetido, carga subindo rápido (semana × média das 4 anteriores), consistência (dias ativos por semana), tendência mensal | Não |
| G3 | "Recuperação da semana" na página Saúde: carga × sono × VFC, com explicação determinística; a IA só relaciona (a pedido) | Não |
| G4 | Investigar, só leitura, os dados extras da API pessoal | Precisa de autorização |
| G5 | Trajetos e lugares (L2, L3) com ativação voluntária e zonas de privacidade | Precisa de autorização |

**Atualização (13/11/2026, DS-4.2A):** a auditoria da Saúde e do Garmin ([Documento 09](09-auditoria-saude-garmin.md)) confirmou no código o que é coletado e o que não é, e reorganizou G1–G5 em fases S0–S8 (conferência de cobertura, fundação, abas Visão geral/Recuperação/Sono, Atividades, Condicionamento, Tendências, integração, mapas, IA). G1 a G3 seguem sem tocar na `garmin`; o que depende dela (sub-escores do sono, séries de musculação, `idadeFitness` diário, dados extras e trajetos) continua em G4 e G5, com autorização expressa. Nada foi implementado.

## Notícias e Acontecimentos

**Hoje** [Fato]: o robô da Newsletter (`scripts/atualizar_newsletter.py`) já junta matérias diferentes sobre o mesmo fato **dentro
de uma edição** (sem perder fonte; o grupo conta todas em `n`); `newsletter_edicoes` guarda um retrato por turno; o resumo com IA
é por edição. Não existe o "mesmo assunto" ao longo dos dias.

**Proposta** [Recomendação]: o **Acontecimento**, um assunto acompanhado no tempo.

- **Identidade estável**: o próprio robô (determinístico, sem IA) compara cada grupo novo com os acontecimentos ativos (títulos
  parecidos, nomes em comum, janela de dias) e reaproveita o id; mantém `acontecimentos.json` (só notícia pública, últimos 30 dias):
  título, categoria, primeiro e último registro, fontes, linha do tempo.
- **Parte pessoal** em `PESSOAL` (uma chave): acontecimentos seguidos e "visto até" de cada um.
- **Tela**: aba "Acontecimentos" na Newsletter; para cada um, a linha do tempo e **o que mudou desde a última visita** (itens novos).
- **Resumo**: só dos acontecimentos seguidos que tiveram novidade, com Haiku, cache pelo conjunto de itens, no máximo um por
  acontecimento por dia, dentro do orçamento; chamada automática só se o dono autorizar (como fez com a Newsletter).
- **RAC Hoje**: bloco "Acontecimentos que você segue".
- Limite herdado: matérias em línguas diferentes não se juntam (limitação documentada da Newsletter).

## Estudos e desenvolvimento pessoal

**Hoje** [Fato]: MBA (aulas, avaliações, boletos, links; `PESSOAL.mba`, `mbaFeito`), Estudos (exercícios de SQL, BI e Python;
`sqlFeitos`, `exercicios`), Carreira (perfil, competências, histórias STAR, candidaturas, currículos), Conexões do dia
(`tecdados.json`), Rede, e o Painel mede estudos e competências mês a mês.

**Proposta** [Recomendação]: **Trilhas** de desenvolvimento.

- Trilha (MBA, Python, SQL, Análise de Dados, BI, cursos avulsos) → etapas → **sessões de estudo** (data, minutos, o que fez) →
  **competências** com nível de 1 a 5 e **evidência** (exercício, projeto, certificado, avaliação do MBA) → certificados no cofre
  Documentos.
- Começa em `PESSOAL` (uma chave, sem migration), como o resto da área; vai para tabela só se o servidor ou a IA precisarem.
- Sinais: avaliação do MBA chegando, semana sem estudo numa trilha ativa, competência sem evidência nova há muito tempo.
- freeCodeCamp e developer-roadmap como **referência** para montar as etapas (conferir a licença antes de copiar conteúdo); sem
  integração automática (não há API oficial de progresso pessoal conhecida: [Hipótese] a confirmar).

## Central de Compras (mantida no roadmap)

**Hoje** [Fato]: Central de Compras unificada (notas do Mercado + pedidos online, sem contar duas vezes), navegação de mercado
(categoria → produto → compra; estabelecimento; evolução; oportunidades), Radar de Preços (ofertas, descoberta pelo SerpApi com
orçamento), junção de produtos com nomes diferentes, preço por unidade, alertas de preço, exportação CSV.

**Objetivo preservado** (pedido do dono): navegação por categorias, produtos comprados, gastos por categoria, histórico de
preços, estabelecimentos, comparações, kits e combos, preço total, unitário e por medida, e a evolução para patrimônio,
garantias e manutenção.

**Fica para uma etapa própria**: kits e combos, patrimônio (bens duráveis ligados à nota e à garantia em Documentos) e
manutenção. Pendentes desta área: a proposta `041` (categorias oficiais) e a `044` (IA do Radar).

**Fora do planejamento** (decisão de 13/11/2026): funcionalidades fiscais, OCR, SEFAZ, emissão e acompanhamento fiscal. A Central Fiscal
continua no ar, congelada e sem evolução; não volta ao roadmap. A migration `040` (dar entrada da nota no Mercado) não será
implementada e não é pendência ([Documento 07](07-decisoes-e-pendencias.md#decisões-tomadas)).
