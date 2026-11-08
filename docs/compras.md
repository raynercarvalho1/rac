# Central de Compras (compras online)

Página `#compras` (menu → Compras online), código em `js/compras.js`, contas em `nucleo.js` (`NUCLEO.co*`, testes em
`tests/compras.test.mjs`), banco em `supabase/025_compras_online.sql`. No ar desde 01/11/2026 (versão `2026-11-01.9`); a versão publicada mais recente é a `2026-11-07.1` (Central Fiscal). O Lote 5.0 (seção "Lote 5.0" abaixo) está só no código local, não publicado.

## O que faz

Registra pedidos de lojas online (Amazon primeiro; Mercado Livre, Shopee, Magazine Luiza e "outra loja" no mesmo formato) a partir
dos documentos da própria loja, guardando sempre o **arquivo original** e o que foi extraído dele.

| Entrada | Como é lida (tudo no aparelho, sem IA paga) |
|---|---|
| PDF de resumo do pedido / DANFE | pdf.js 3.11.174 (cdnjs): texto de todas as páginas e as imagens que parecem de produto |
| XML da NF-e | `NUCLEO.coLerNFe`: chave, número, emitente, CNPJ, itens, totais, forma de pagamento e o nº do pedido em `infCpl` |
| CSV de histórico (Amazon "Solicitar seus dados" → Retail.OrderHistory) | `NUCLEO.coLerCSV`: um pedido por número, cancelados fora |
| ZIP exportado pela loja | JSZip 3.10.1 (cdnjs): lê os PDF, XML, CSV, e-mails e imagens de dentro |
| E-mail (Gmail, .eml ou texto colado) | MIME decodificado (quoted-printable/base64, HTML sem tags) e anexos PDF/XML; confirmação, pagamento, envio, entrega, cancelamento, reembolso e nota fiscal |
| Print / foto do pedido | OCR local com Tesseract.js 5.1.1 (jsDelivr; dados do português baixados na primeira vez) |

- **Histórico oficial da Amazon, sem senha:** Central de Privacidade → "Solicitar seus dados" → "Seus pedidos". A Amazon manda um
  ZIP com o CSV de todos os pedidos; importar o ZIP traz o histórico inteiro. O site nunca pede nem guarda a senha da loja, não
  faz raspagem do site da loja e não faz nenhuma ação na conta (comprar, cancelar, mudar).

## Gmail (só leitura)

A Amazon está cadastrada numa das contas do Gmail do dono. O quadro do Gmail em Compras → Importar (só para o dono):

- **Login:** usa o login do Google que o site já tinha: o Client ID público (`GOOGLE_CLIENT_ID`) e a permissão **`gmail.readonly`**
  (`GM_SCOPE`), ambos em `js/app.js`, pelo Google Identity Services (modelo de token, sem segredo e sem token de renovação).
  - O token da Central de Compras fica **só na memória da página** (`CC_GM`). Não vai para o localStorage, o sessionStorage, o banco
    nem o GitHub; vale cerca de 1 hora e some ao tocar em Desconectar ou ao fechar a página.
  - Os alertas de vagas e o cartão de E-mail continuam com a conexão deles, sem mudança.
- **Conta certa:** a lista de contas vem do cartão de E-mail (`PESSOAL.emails`, na conta, nunca no código público). Depois do login,
  a página confere o endereço (`/users/me/profile`); se o Google conectar outra conta, nada é lido. A conta usada fica lembrada em
  `PESSOAL.compras.gmail` (só o endereço, nunca o acesso) e aparece primeiro na próxima vez.
- **Só leitura:** só `gmail.readonly`, com `include_granted_scopes: false` (o token não carrega outras permissões). Só há leituras
  (GET): nada é enviado, apagado, movido ou marcado, e a senha nunca passa pelo site.
- **Busca:** `from:amazon.com.br after:AAAA/MM/DD`, com período de 30, **90 (padrão)**, 180 ou 365 dias. Segue para as páginas
  seguintes até no máximo **200 e-mails**; se houver mais, avisa para escolher um período menor.
- **Leitura:** cada e-mail é baixado no original (formato raw do Gmail; os bytes exatos vão para o cofre como `.eml`) e classificado:
  pedido/confirmação, pagamento, envio, entrega, cancelamento, reembolso ou nota fiscal. E-mail sem pedido, sem total e sem anexo
  (propaganda, aviso geral) é ignorado e só entra na contagem.
- **Anexos PDF e XML** (DANFE, NF-e, resumo): lidos como arquivo e guardados no original. Sem número de pedido próprio, ficam no pedido
  do e-mail. Anexo ilegível, grande demais (mais de 15 MB) ou XML que não é NF-e aparece em "Documentos sem pedido reconhecido".
- **Conferência obrigatória:** tudo vai para a conferência em lote; nada é salvo sem o toque em Salvar (ou em "Salvar todos os que estão
  prontos"). Não há importação automática.
- **Deduplicação:** pedido que já existe (mesmo número ou mesma chave de NF-e) só recebe os documentos novos; o mesmo arquivo (mesmo
  SHA-256) nunca é guardado duas vezes. Cancelamento e reembolso só avisam; a despesa só muda quando o dono confirma.
- **Erros tratados:** janela do Google fechada ou bloqueada, acesso negado, permissão não concedida, conta errada, token vencido (pede
  para conectar de novo), limite de uso (429/5xx: espera e tenta de novo até 2 vezes; 403: avisa) e anexo inválido. As mensagens de
  erro não trazem conteúdo dos e-mails.
- **E-mail da nota fiscal:** o banco guarda esse tipo como `outro`, com o tipo verdadeiro no extraído (sem SQL novo).

### Google Cloud (já configurado)

No projeto do Client ID do site: a Gmail API ativada, a origem `https://raynercarvalho.com.br` autorizada, `gmail.readonly` na lista de
acesso a dados, e o público Externo **em teste**, com a conta da Amazon como usuário de teste. Em teste não é preciso
verificar o aplicativo: aparece o aviso de "app em teste" no consentimento, e o limite é de 100 usuários de teste.

## Processamento

- **Leitura do pedido** (`coLerTexto`): loja, número, data, vendedor, produtos e quantidades, subtotal, desconto (inclusive
  Programe e Poupe/cupom), frete, taxas, total pago e forma de pagamento.
- **Pagamento:** só a bandeira e os 4 últimos dígitos ("Mastercard final 1234"). O banco recusa sequências de 5 ou mais números.
- **Junção:** documentos do mesmo pedido (mesma loja + número, ou mesma chave de NF-e) viram um só pedido (`coMesclar`).
  O resumo/e-mail manda nos preços e no desconto; a NF-e completa chave, número, emitente e CNPJ.
- **Divergências:** valores diferentes entre os documentos (subtotal, desconto, frete, total) ficam registrados no pedido e
  aparecem com ⚠. Nada é trocado em silêncio.
- **Duplicidade** (`coDuplicata` e o banco):
  - mesmo pedido ou mesma nota = o mesmo registro: o documento novo só é anexado;
  - o mesmo arquivo (mesmo SHA-256) não é guardado duas vezes;
  - mesmo dia e mesmo total em outra fonte pede um segundo toque.
- **Recorrência:** a informada pela loja ("entrega automática a cada 4 meses") fica **a confirmar** (Confirmar/Descartar na
  compra). A próxima data aparece só como estimativa; **nenhuma compra futura é criada**. Também aparecem as recorrências
  percebidas (o mesmo produto comprado mais de uma vez).
- **Histórico de preços por produto** (`coPrecos`), pelo nome padronizado (`alChaveProduto`). Desde o Lote 5.0 o preço é o **pago**, com o desconto do item (seção "Lote 5.0").
- **Categorias** (`CO_CATEGORIAS`): Pet, Saúde e farmácia, Casa, Eletrônicos, Higiene e beleza, Bebê, Alimentação, Livros e
  papelaria, Veículos, Vestuário, Presentes, Outros. São sugeridas pelo nome do produto e podem ser trocadas na conferência.
- **Lote:** vários arquivos de uma vez; um quadro de conferência por pedido e "Salvar todos os que estão prontos".

## Banco e arquivos (025)

| Tabela | O que guarda |
|---|---|
| `compras_online` | loja, número, data, vendedor, subtotal, desconto, frete, taxas, **total pago** (a despesa), pagamento, categoria, recorrência (texto, meses, status), NF-e (chave, número, emitente, CNPJ), "já contada em outro lugar", divergências, observações, origem, versões |
| `compras_online_itens` | produto, código (ASIN/anúncio), quantidade, unitário, total, desconto, categoria, caminho da imagem |
| `compras_online_docs` | tipo (PDF, DANFE, XML, CSV, ZIP, e-mails, print, foto do produto), nome, caminho no cofre, tipo do arquivo, tamanho, SHA-256 e o que foi extraído |

- O banco confere a conta (total = subtotal − desconto + frete + taxas, 2 centavos de folga) e não aceita o mesmo pedido, a mesma
  NF-e nem o mesmo arquivo duas vezes.
- RLS "casa": o Rayner e a Fernanda veem e lançam juntos. Há a trava "mfa", nada é visível sem login, e o 022 foi rodado de novo.
- **Arquivos:** os originais ficam no cofre privado `familia`, em `<dono>/compras/<compra>/`. O 025 liberou nele XML, CSV, ZIP,
  e-mail e texto, além de imagem, vídeo e PDF. Continua privado, com o limite de 50 MB.
- **Backup e restauração:** as três tabelas estão em `NUCLEO.SEG_TABELAS`, e os originais vão em `anexos/` do .zip do site.
  O backup semanal do servidor (função `garmin`, que não muda) ainda não inclui as compras online.

## Integração

- **Painel de Produtividade:** cada compra entra uma vez nos gastos pelo total pago (fonte "Compras online", categoria do pedido ou
  do produto principal). Finanças tem o quadro **Compras online** (mês, categoria). Compra marcada como "já está contada em outro
  lugar" (ex.: também lançada no Mercado) fica fora. Mercado, registros, pedidos e MBA não mudam.
- Despesas por período, loja, categoria e produto: abas Resumo e Produtos e recorrências.

## Primeiro pedido real

O primeiro pedido (Amazon, 01/11/2026, um antipulgas para o Eddie) foi registrado a partir dos dados informados pelo dono: subtotal,
desconto, frete zero e o **total pago como despesa**, com a entrega automática informada pela loja como recorrência **a confirmar**
(separada da compra; não cria compra nem despesa futura). Depois, o DANFE original foi anexado à mesma compra, sem criar outra nem
duplicar a despesa: número e série da nota, chave de acesso (dígito verificador conferido), emitente, CNPJ, emissão e o código do produto
foram preenchidos, e os valores da nota bateram com os do pedido. O DANFE não traz foto do produto (só o logotipo da loja).

Os números do pedido, da nota, a chave de acesso e o final do cartão ficam só no banco (com login), nunca neste repositório: a chave de
acesso permite consultar a nota na Sefaz, com os dados do comprador.

## Multiorigem, histórico da Amazon e reembolsos (Lote 2: só o núcleo, sem tela nem banco)

Tudo em `nucleo.js`, testado em `tests/compras_multiorigem.test.mjs`. **Nada disso está ligado à tela nem ao banco ainda.**

- **Canal** (`CO_CANAIS`): `amazon`, `shopee`, `mercado_livre`, `outro_marketplace`, `presencial`. `coCanalDe(c)` usa o campo `canal` e,
  em registro antigo (sem ele), deduz pela `loja` (`CO_LOJA_CANAL`). Nenhum dado existente muda de significado.
- **Tratamento** (`coClassificar(c)`, que `coDespesas` já usa):

  | Registro | Tratamento |
  |---|---|
  | Compra atual, qualquer canal, e registro antigo | `despesa`, pelo total pago |
  | Amazon físico **histórico** (`historico`/`origem: historico_amazon`, `natureza: fisica`) | `referencia_historica`: só indicadores da Amazon, nunca nas despesas gerais |
  | Amazon digital histórico | `despesa_digital`: entra sozinho em **Compras online · Digital** |
  | Histórico com itens digitais e físicos | `misto`: só a parte digital entra |
  | Histórico sem natureza identificada | `referencia_historica` + aviso, até alguém revisar |
  | `segmento: supermercado` / `combustivel` | `outro_modulo`: continuam no Mercado / em Veículos |
- **Histórico Amazon** (`amLerHistorico`, `amIndicadores`): cabeçalhos reais do `Order History.csv` (`Total Amount`, `Original Quantity`,
  `Payment Method Type`); os antigos (`Total Owed`, `Quantity`, `Payment Instrument Type`) continuam aceitos. `Total Amount` é por **linha**:
  o pedido soma as linhas (se todas repetem o mesmo total e nenhuma fecha a conta, conta uma vez só). Imposto, frete e desconto ficam
  separados (`taxas`, `frete`, `desconto`); a conta é conferida linha a linha. Status: cancelado (fora dos totais), autorizado, concluído.
  Linha inválida vai para `invalidas` e a importação segue; cabeçalho obrigatório ausente devolve erro claro, sem exceção.
  `coLerCSV` (usado pela tela) agora usa o mesmo leitor e continua devolvendo um pedido por número, sem cancelados.
- **Privacidade do ZIP** (`amSelecionarArquivos`, `amImportar`, `amReconstruirCSV`, `amAuditarSanitizado`): só os CSVs de pedidos são lidos;
  imagens e o resto são ignorados. O CSV reconstruído tem só `AM_CAMPOS_SAIDA` (pedido, data, status, natureza, produto, asin, quantidade,
  preço, imposto, frete, desconto, total, pagamento como bandeira + final); endereço, telefone, coordenadas, destinatário e rastreio nunca
  saem do original. **Nenhum envio:** o ZIP não é guardado e o cofre não é tocado neste lote.
- **Reembolsos** (`coReembCreditos`, `coReembVincular`): solicitado e aprovado **não** são crédito; só `estado: recebido` com
  `recebido_confirmado: true` e `recebido_em` (o crédito cai no mês do recebimento). Exige o pedido original e não passa do valor pago;
  a chave (`reemb:<id>` ou pedido + valor + data) impede crédito duplicado, inclusive contra créditos já lançados.

**Ainda depende de SQL/tela:** colunas `canal`, `natureza`, `historico`, `origem` em `compras_online` (e o tipo `presencial`), tabela de
reembolsos e de créditos, o cofre do CSV sanitizado, a tela de importação com prévia e a leitura do ZIP no navegador.
**Cuidado até lá:** a tela atual ainda salva o CSV como compra comum; não importe o histórico real por ela, senão o físico entraria nas despesas.

## Banco do Lote 3 (030 a 033: aplicados em produção em 06/11/2026)

Ordem: **022 (já aplicado, não muda) → 030 → 031 → 032 → 033.** Aplicadas pelo proprietário no SQL Editor (Postgres 17.11), com backup prévio, e conferidas por uma consulta só-leitura de 34 verificações: tudo como esperado (veja "Aplicação em produção" abaixo). A 022 não roda de novo.

- **Status do pedido** (`coSituacao`, decisão de 06/11/2026): cancelado não contabiliza; **autorizado é pendente** (fora das despesas efetivas,
  o valor aparece em `valor_pendente`); concluído/efetivado/enviado/entregue contabiliza. No histórico, status desconhecido ou ausente nunca
  vira compra efetivada sozinho. Registro antigo não muda (sem status, `cancelamento_informado` e `reembolso_informado` seguem como despesa até
  o dono confirmar o cancelamento). Amazon físico histórico continua só referência, em qualquer status.
  No banco (030), `compras_online.status` era texto livre; agora aceita `concluido`, `autorizado`, `cancelado`, `desconhecido` **e** os antigos
  (`cancelamento_informado`, `reembolso_informado`, vazio), como CHECK `NOT VALID` (vale para o que for gravado daqui em diante, sem reexaminar as
  linhas antigas; o dono pode rodar `validate constraint` depois de conferir os dados). Histórico exige status explícito.
- **030** (`supabase/030_compras_multiorigem.sql`): `compras_online` ganha `canal`, `natureza`, `historico`, `importacao_id`, `impostos_info`
  (todas vazias/falsas nos registros antigos; nenhum UPDATE de dados); `compras_online_itens` ganha `natureza`, `total_linha`, `situacao`;
  `origem` aceita também `historico_amazon`; tabela `compras_importacoes` (nome lógico, contagens, estado, resumo de erros sem dado pessoal, SHA-256
  do CSV sanitizado); gatilho que impede mudar dono, origem, histórico e importação por UPDATE direto. **Sem coluna de visibilidade:** a decisão sobre
  o histórico da Amazon para a Fernanda segue pendente (hoje vale a regra da casa, igual a todo o módulo).
- **`compras_gravar(p_compra, p_itens, p_docs, p_novo)`**: grava compra, produtos e documentos numa transação (roda como quem chamou: valem a casa e
  a trava da 2ª etapa). Só enxerga e edita compra da casa de quem chama (RLS); o dono dos dados é sempre `dono_da_casa()`; `user_id`, `criado_*`,
  `versoes` e `atualizado_em` não podem ser enviados; documento só entra se o caminho for `<dono>/compras/<compra>/…` e o arquivo já estiver no cofre
  `familia`. Fluxo novo do site (ainda não ligado): 1) envia os originais ao cofre; 2) chama a função uma vez; 3) se der erro, apaga os arquivos que
  enviou; os caminhos devolvidos em `docs_repetidos` (mesmo SHA-256) também são apagados. Suposição a confirmar: o cadastro de novos usuários do Auth
  fica fechado (como em todos os módulos, quem não é da casa só enxerga os próprios dados vazios). **Dependência de interface:** trocar
  `ccSalvar`/`ccSubirDocs` em `js/compras.js` por essa sequência (próximo lote, com a tela).
- **031** (`supabase/031_compras_reembolsos.sql`): `compras_reembolsos` (compra original, canal e pedido copiados da compra, valores solicitado, aprovado e
  recebido, datas, confirmação com quem e quando). O banco garante: solicitado/aprovado não geram crédito; a soma dos recebidos (sem os estornados) nunca
  passa do total pago (parciais valem, várias linhas por compra); a compra é travada (`FOR UPDATE`) antes de somar, então confirmações simultâneas não
  duplicam; recebido não se edita (nem as observações) nem se apaga; o total pago da compra não pode cair abaixo do que já foi reembolsado (sem contar estornos) e a compra não pode ser apagada com reembolso ligado; `reembolso_confirmar` é idempotente.
- **Estorno** (`compras_reembolsos_estornos` + `reembolso_estornar(id, motivo)`): corrige um recebimento confirmado por engano **sem editar nem apagar**
  o reembolso. Grava quem estornou, quando, o motivo (5 a 200 letras) e o valor e o mês do crédito desfeito (copiados do reembolso pelo banco). Só
  acrescenta (update/delete são recusados até para quem tem permissão total), vale uma vez por reembolso (unique; repetir devolve `ja_estornado`),
  vale só para recebido, respeita a casa e a 2ª etapa. O valor estornado volta a caber no limite da compra (dá para registrar o reembolso certo).
- **Créditos (vistas, sem segunda fonte da verdade)**:
  - `compras_creditos` é **a única consulta que se soma**: um crédito por reembolso `recebido` e confirmado **sem estorno**. O valor é o recebido; um
    **reembolso parcial** aparece como uma linha com o seu valor (nunca agrupado nem rateado); o **mês do crédito é o mês de recebimento** (`recebido_em`),
    não o do pedido nem o da aprovação.
  - Um **estorno** tira a linha de `compras_creditos` no mesmo instante (a vista é calculada na hora, não há cópia para apagar), então um crédito
    estornado não pode continuar sendo contabilizado.
  - `compras_creditos_historico` é só **auditoria**: todo recebido, com `estornado`, `situacao` (`credito` ou `credito_estornado`), quem estornou, quando e o
    motivo. Não deve ser somada.
  - Segurança: `security_invoker` (vale o RLS de quem consulta), nada para anon.
- **033** (`supabase/033_seguranca_compras_fiscal.sql`): como o 022 é histórico e não muda, o 033 reafirma a trava da 2ª etapa e o fechamento para anon nas
  tabelas novas e atualiza `seguranca_estado()` (auditoria) com elas. Se o 022 rodar de novo, rode o 033 em seguida.
- **Backup:** as tabelas novas estão em `NUCLEO.SEG_TABELAS` (pais antes dos filhos) e os originais das notas vão em `anexos/` do .zip do site. O
  **backup semanal do servidor** (dentro da função `garmin`, que não muda) não inclui nenhuma tabela de Compras nem fiscal: incluir exige alterar a
  função e fica como proposta separada.
- **Pendências de interface (não implementadas):** ligar `compras_gravar`, a tela de reembolsos/estorno e a importação. (Os selects do **Painel, Hoje e Compras** já trazem `canal`,
  `natureza`, `historico`, `origem`, `impostos_info`, `status` e os produtos desde o Lote 5.0.)
- **Revisão de segurança das vistas e dos privilégios:** vista comum não tem RLS própria; por isso `compras_creditos` e `compras_creditos_historico` usam
  `security_invoker = true` (PostgreSQL 15+; a 031 e a 033 param com erro claro em versão menor) e leem tabelas que têm RLS: a regra da casa e a política
  restritiva "mfa". **A trava da 2ª etapa vem dessa política das tabelas de baixo, não da vista** (RLS e MFA são coisas separadas: o RLS filtra por casa; o "mfa"
  exige aal2 de quem tem fator). Privilégios (033): nada para `anon`; `authenticated` só `select` nas vistas e nas tabelas de estorno também `insert`
  (sem update/delete/truncate); responsáveis (`confirmado_por`, `estornado_por`) sem `ON DELETE`, para a auditoria não ser reescrita.
- **Auth (pendência):** não há `config.toml` nem qualquer registro local sobre o cadastro público de novos usuários do Supabase Auth; só o painel de
  produção diz se está desabilitado. Nada foi suposto nem alterado: conferir em Authentication → Sign In / Providers ("Allow new users to sign up").

### Aplicação em produção (06/11/2026)

- **Antes:** Postgres 17.11; cadastro público e login anônimo do Auth desligados e e-mail confirmado ligado (informado pelo proprietário); 025, 026 e 027 aplicadas; bucket `familia` privado; nenhum objeto da 030 a 033 existia; 1 compra (status vazio, origem `manual`), 2 contas, 0 fatores TOTP. Backup feito pelo proprietário antes de aplicar.
- **Depois (consulta só-leitura, tudo como esperado):** 7 tabelas e 2 views novas; as 2 views com `security_invoker`; RLS ligado nas 7 tabelas com a política restritiva `mfa` e as políticas da casa (8); `anon` sem nenhum privilégio nas 9 relações; `authenticated` só com `select` nas views e só `select`/`insert` nos estornos; 13 funções novas, nenhuma `security definer`, todas com `search_path` fixo e fechadas para `anon`; RPCs `compras_gravar`, `reembolso_confirmar` e `reembolso_estornar` executáveis por `authenticated`; 8 constraints, 7 gatilhos e 5 índices únicos novos; a regra de status é `NOT VALID`; `seguranca_estado()` cobre as tabelas novas; tabelas novas vazias; a compra antiga intacta (sem marca nova, mesmo status e origem), com seu item e documento; bucket e políticas do Storage intactos.
- **Não comprovado (continua pendente):** sessão real com MFA/aal2 (não há conta com TOTP), acesso real ao Storage pela RPC (exigiria enviar um arquivo), concorrência real nos reembolsos, e uso das views e RPCs pela API (PostgREST) com uma sessão autenticada. Nenhum teste criou compra, nota ou reembolso reais.
- **Interface:** o site ainda não usa as tabelas e RPCs novas (`compras_gravar`, reembolsos, importações). As consultas de Painel, Hoje e Compras já trazem `canal`, `natureza`, `historico`, `origem`, `impostos_info` e os campos dos produtos (Lote 5.0, só no código local).

## Lote 5.0 · uma só regra financeira (07/11/2026, só no código local; nada publicado, sem SQL)

`NUCLEO.coResumo` (`nucleo.js`, testes em `tests/compras_resumo.test.mjs`) concentra as contas que antes estavam espalhadas em `compras.js`
(Resumo e lista), `painel.js` e `hoje.js`. Resumo, cabeçalho da lista, Painel e Hoje passam pela mesma regra, então os totais batem.

**Peças (todas puras, no núcleo):**

| Função | Faz |
|---|---|
| `coRegra(c)` | decide se o pedido entra nas despesas, com que valor e, se não entra, o motivo |
| `coValorDespesa(c)` | o valor que o pedido soma (0 quando fica de fora); é o que o Hoje usa |
| `coResumo(lista, {hoje})` | linhas que contam, regra de cada pedido, total por mês (para a lista), o que ficou de fora por motivo e o período de 12 meses (mês, ano, ticket, por mês/categoria/loja, descontos) |
| `coDespesas(lista)` | `coResumo(lista).despesas`: o Painel soma isto; o formato `{d, v, f, cat, id}` não mudou |
| `coRotulo(c)` | selo de status e selos do tratamento financeiro, só com estados que já existem |
| `coDeBanco(linha)` | linha do banco → formato das regras (números, `itens` com `natureza`, `total_linha`, `situacao`; os demais campos como vieram) |
| `coPrecoLiquido`, `coMultipack` | preço pago do item; detector de pacote/kit (para o preço por kg/litro) |
| `coDescontos(c)` | desconto de um pedido sem duplicidade: geral, itens e total, com o modo (contemplado, somado, incerto, sem_itens) |
| `coSegmentoDe(c)` | deduz supermercado/combustível de campos que existem no banco (ver abaixo) |
| `coPedidoNoPreco(c)`, `coItemNoPreco(i)` | quem entra no histórico de preços |

**Regras (motivo → o que conta):**

| Motivo | Quando | Despesa |
|---|---|---|
| `conta` | compra normal, de qualquer canal, e registro antigo (sem os campos novos); `cancelamento_informado` e `reembolso_informado` até o dono confirmar | total pago |
| `conta` (digital) | Amazon histórico digital efetivado; no misto, só a parte digital | parte digital, em "Compras online · Digital" |
| `cancelada` | status `cancelado` (confirmado pelo dono) | 0 |
| `fora_das_contas` | o dono marcou "já está contada em outro lugar" | 0 |
| `referencia_historica` | Amazon físico histórico (e a parte física do misto), em qualquer status | 0 (só indicadores da Amazon) |
| `outro_modulo` | supermercado/combustível: `segmento` explícito (prevalece) ou, sem ele (dado do banco), canal `presencial` + categoria Supermercado/Mercado (→ Mercado) ou Combustível/Abastecimento (→ Veículos) | 0 (fica no Mercado/Veículos) |
| `pendente` | `autorizado` e `desconhecido` (e histórico sem status); no histórico, também o **item digital autorizado ou desconhecido** dentro de pedido concluído (só o valor dele) | 0; o valor aparece como pendente |
| `sem_data` / `sem_valor` | data ausente; total null, vazio ou não numérico | 0, e não conta como pedido |

- **Os três mecanismos não se misturam:** `fora_das_contas` é decisão manual por pedido; `referencia_historica` é regra do histórico da Amazon; `outro_modulo` é
  pertencimento a outro módulo. Cada um tem o seu próprio total em `coResumo().fora` (`{n, valor}`).
- **Precedência do rótulo** quando mais de um vale (o valor é zero em todos): cancelada, fora_das_contas, outro_modulo, depois o resto.
- **Descontos (decisão de 07/11/2026):** gerais e individuais ficam separados e a **economia total** nunca conta duas vezes (`coDescontos`). O desconto do pedido pode já
  conter o dos itens (NF-e: o `vDesc` do total é a soma dos itens) ou ser outra camada; a evidência está nos valores gravados. Subtotal ≈ soma dos itens **brutos** e desconto do
  pedido ≥ o dos itens → **contemplado** (economia = desconto do pedido; geral = o que passa dos itens). Subtotal ≈ soma dos itens **líquidos** → **somado** (as duas camadas).
  Sem subtotal ou sem nenhuma das duas conferências → **incerto**: nunca se soma, vale o maior dos dois (piso) e a tela avisa quantos pedidos estão assim. Só entram pedidos que contam.
  O indicador do Resumo passou a se chamar "Economia (12 meses)", com a nota "desconto geral + desconto nos itens = economia".
- **Preço histórico (`coPrecos`, decisão de 07/11/2026):** preço pago = (total do item − desconto do item) ÷ quantidade; sem total, o unitário menos o desconto por unidade. O
  desconto geral do pedido **não é rateado**. **Entram:** confirmadas (inclusive com cancelamento ou reembolso apenas *informado*), fora das contas, histórico físico e digital e
  compras de outro módulo. **Saem:** canceladas, pendentes (autorizado e desconhecido) e os itens cancelados, autorizados ou desconhecidos. Cada ponto leva a
  **origem** (`origem`: módulo, canal, histórico, natureza, tratamento, fora_das_contas) e cada produto leva `origens` (contagem por módulo) e `outros_modulos`; a tela escreve
  "inclui N compras de outro módulo (Mercado, Veículos)". **Reembolso nunca apaga o preço:** informado marca o ponto como "informado"; recebido (só o confirmado e válido de
  `coReembCreditos`, passado como 2º argumento) marca "recebido" e traz o evento (valor, mês) à parte em `eventos`. A tela ainda não lê a tabela de reembolsos, então hoje só aparece
  o "informado". **Preço por kg/litro** (`base`, via `alPrecoBase`): só quando todas as compras do produto trazem o tamanho no nome, na mesma unidade, e o nome não indica pacote
  ou kit; senão é `null` e nada é inventado.
- **Status na tela:** selo de status (Confirmada, Concluída, Cancelada, Cancelamento informado, Reembolso informado, Autorizada · pendente, Status desconhecido ·
  pendente) e, à parte, selo do tratamento (Fora das contas, Referência histórica, Digital · histórico, Histórico misto, Outro módulo). O valor de quem não conta
  aparece riscado. Nenhum estado novo foi criado.
- **Correção de leitura:** o `coClassificar` procurava `status_norm` no item, mas o banco grava `situacao`; item cancelado do histórico entrava na parte digital.
  Agora lê `status_norm` ou `situacao`.
- **Selects:** Painel, Hoje e Compras passaram a ler `canal`, `natureza`, `historico`, `origem` (o `coClassificar` usa para reconhecer `historico_amazon`),
  `impostos_info` (só informativo: nunca entra no total) e `categoria` (no Hoje, para deduzir o módulo) e, nos produtos, `natureza`, `total_linha` e `situacao`. Antes o histórico físico lido do banco virava despesa comum.
  A tela de edição não descarta mais `natureza`, `total_linha` e `situacao` do produto ao regravar.
- **`segmento` sem coluna (decisão de 07/11/2026):** não existe coluna `segmento` no banco e não se criou migration. No dado do Supabase, `coSegmentoDe` deduz de `canal` e
  `categoria`, que existem: só compra de canal **presencial** com categoria Supermercado/Mercado ou Combustível/Abastecimento (sem acento e sem diferenciar maiúsculas) sai de Compras.
  Compra online (Amazon, Shopee, Mercado Livre…) **nunca** é deduzida, mesmo com essa categoria. Um `segmento` explícito, de qualquer valor preenchido, **prevalece** e nunca é deduzido: `supermercado`/`combustivel` levam ao módulo; qualquer outro valor (ex.: `compras`) mantém em Compras. A dedução só vale com o segmento vazio. Painel, Hoje e Compras
  precisam trazer `canal` e `categoria` no select (o Hoje passou a trazer `categoria`). A tela de lançamento ainda não oferece essas categorias; uma coluna própria ficaria para uma migration futura.
- **Item autorizado ou desconhecido em pedido concluído (histórico):** o valor do item digital autorizado ou desconhecido fica **pendente** (fora das despesas, avisado) e o resto do pedido segue o status dele; físico
  autorizado continua só referência; item cancelado não é nada. O importador já marca o pedido inteiro como autorizado quando algum item está; esta regra cobre o que chega ao banco
  com o pedido concluído. Pedido que não é histórico não olha a situação do item (o total pago não se divide por item). O item autorizado ou desconhecido também sai do histórico de preços, em pedido histórico ou não.
- **Pedido com situação desconhecida:** é pendente (`status` `desconhecido`, `status_norm` do importador e histórico sem status reconhecido): fora das despesas e do histórico de preços, com o valor
  em `pendente`; ao ser efetivado, entra normalmente. Registro antigo não muda: texto de status legado qualquer em pedido que não é histórico segue como confirmado.
- **Limites conhecidos:** `compras_gravar`, reembolsos e a importação do histórico seguem sem tela (Lote 5.1 e seguintes).

## Lote 5.2 · detalhe por loja, categoria e produto (07/11/2026, só no código local; nada publicado, sem SQL)
No Resumo, cada barra de "Por categoria" e de "Por loja" é um link para uma tela própria (como o Mercado leva do painel ao produto); nenhuma conta nova, nenhuma tabela nova.
- **Rotas:** `#compras/loja/<nome>`, `#compras/categoria/<nome>` e `#compras/produto/<chave>/<origem>` (origem = `loja:<nome>`, `categoria:<nome>` ou `produtos`). "Voltar" leva à origem do clique e devolve a rolagem de antes (pilha em `CC.nav`); o botão voltar do navegador também funciona.
- **Loja:** produtos dos pedidos que contam (quantidade, total pago, preço médio = total ÷ quantidade) + "Ajustes dos pedidos" à parte. Produtos + ajustes = valor da barra (`coDetalheLoja`).
- **Categoria:** cada produto está na categoria dele (a do item; sem ela, `coCategoria(descrição)`; sem identificação, "Outros"); a categoria do pedido não vale para os itens. O que o pedido paga fora dos produtos
  (frete, taxas, descontos gerais, outros) **não é de nenhuma categoria**: vem numa linha independente, uma vez só, sem rateio (`periodo.ajustesPedidos`). Categorias + ajustes = total dos 12 meses; a tela confere a conta.
  O histórico digital da Amazon continua em "Compras online · Digital". `porCategoria` mudou de distribuição, nunca de total.
- **Ajustes:** frete, taxas, descontos gerais (só a parte que passa dos itens, `coDescontos`) e "outros" aberto em itens cancelados, itens sem identificação, pedidos sem itens e diferença não explicada (nada é forçado para fechar).
- **Produto:** `coPrecos` (todas as lojas e origens, a regra do Lote 5.0 do histórico de preços) + `coProdutoResumo` (só soma o que o `coPrecos` já calculou): total gasto, quantidade e preço médio dos 12 meses, último preço, menor preço do histórico,
  gráfico (`RACmercado.grafico`), preços em todas as lojas e datas das compras com a situação (confirmada, histórico, provisório = cancelamento ou reembolso informado, reembolso recebido). A loja do clique vem marcada com ★, sem restringir o histórico a ela.
- **Limites conhecidos:** o período do Resumo é fixo em 12 meses; produto = nome padronizado (sem junção de produtos nem unidade kg/L, exceto `base` quando o nome traz o tamanho); o histórico de preços inclui fora das contas, histórico físico e outros módulos,
  então o total de um produto no histórico pode diferir do detalhe da loja (que só conta o que entra nas despesas); sem dados reais ainda (1 pedido), o gráfico mostra um ponto.

## Lote 5.1 · etapa 1: payload e erros de `compras_gravar` (07/11/2026, só núcleo; nada publicado, sem SQL, `js/compras.js` não mudou)
O site ainda grava a compra, os produtos e os documentos em chamadas separadas. Esta etapa só prepara as funções puras (`nucleo.js`) para ligar a RPC `compras_gravar` (030, já em produção) na etapa 2:
- **`coPayloadGravar(ant, form, cand, opc)`** → `{id, p_novo, p_compra, p_itens}`. **Edição:** a base é a LINHA INTEIRA já gravada, porque a RPC substitui todas as colunas do UPDATE (campo que faltasse virava NULL ou falso:
  apagaria `status`, `canal`, `natureza`, `impostos_info`, `fora_das_contas`, `recorrencia_status`, os dados da nota e as divergências); por cima entra só o que o formulário traz (`undefined` = não mexeu; `null` = o usuário limpou).
  `origem`, `historico` e `importacao_id` vêm sempre do gravado (a RPC os protege). **Compra nova:** só formulário e documento; `canal`, `natureza`, `status`, histórico e importação só se o documento disser; `opc.id` é obrigatório e deve ser o mesmo em toda
  tentativa (a RPC trata o toque duplo). Os campos da nota (`chave_nfe`, `numero_nf`, `emitente`, `cnpj`) só entram se o documento trouxer valor.
- **`coDocPayload(d, path)`**: o documento no formato da RPC, com `coLimparExtraido` (e-mail, CPF, telefone, CEP; linhas com dado pessoal saem do texto bruto), tipo desconhecido vira `outro` (o tipo original vai em `extraido`).
- **`coErroGravar(e)`** → `{codigo, tipo, mensagem, repetir, tecnico, original}`: `23505` (pedido, NF, documento ou id repetidos), `22023` (dados inválidos, arquivo fora do cofre ou da pasta, campo protegido), `42501` (sessão ou 2ª etapa),
  `P0002` (compra ou arquivo não encontrados), mais `23514` (conta, reembolso), `23503` e rede. `mensagem` é para a tela; `tecnico` (código | mensagem | detalhe | dica) é para o diário de erros.
- **Provas:** `tests/compras_gravar.test.mjs` LÊ o SQL da 030 (sem executá-lo): as listas de campos, de produto, de documento e os tipos são comparados com as do SQL, e o UPDATE da edição é simulado a partir do texto do SQL para provar que uma edição sem mudanças
  deixa todas as colunas iguais e que, sem a linha inteira, a RPC apagaria campos.
- **Fora desta etapa:** ligar a RPC no site, o complemento dos campos fiscais ao anexar documento (possível migration 035, só com autorização) e o controle de edição simultânea (fora do Lote 5.1).

## Lote 5.1 · etapa 2: o site grava por `compras_gravar` (07/11/2026, só no código local; nada publicado, sem SQL, sem migration 035)
`ccGravar` (js/compras.js) deixou de gravar compra, produtos e documentos em chamadas separadas. O fluxo novo:
1. **Preparo:** a imagem do produto (a do PDF ou do e-mail) vira um documento "foto do produto", enviado só se o mesmo conteúdo (SHA-256) ainda não estiver guardado. Ela fica **só como documento**: o item NÃO recebe `imagem_path` (limitação temporária, abaixo).
   Os arquivos originais vão para o cofre privado `familia` (`<dono>/compras/<compra>/`), um por vez; o JSON vem de `NUCLEO.coPayloadGravar` (edição: a linha inteira gravada + o que o formulário mudou) e `NUCLEO.coDocPayload` (com a limpeza de dados pessoais).
2. **Uma única chamada** `SB.rpc("compras_gravar", …)`: tudo ou nada.
3. **Limpeza:** o que foi enviado e NÃO ficou registrado é apagado do cofre (documento repetido, compra que já existia, falha). Antes de apagar, o site só LÊ `compras_online_docs` e `compras_online_itens.imagem_path`: o que está registrado ou referenciado nunca é apagado e,
   se a conferência falhar, nada é apagado (sobra um arquivo, não se perde um registrado).
- **Nenhuma gravação direta:** nesse fluxo não há `insert`, `update` nem `delete` em `compras_online`, `compras_online_itens` ou `compras_online_docs`; tudo grava pela RPC (um teste proíbe e o banco simulado recusa qualquer gravação direta).
- **ID estável:** o quadro de conferência cria o id da compra uma vez (`idNovo`) e o usa em toda tentativa: salvar de novo depois de um erro reaproveita a compra (a RPC devolve `ja_existia` no toque duplo).
- **Erros:** `NUCLEO.coErroGravar` traduz o erro do banco ou da rede; a tela mostra a mensagem em português e "Os dados continuam aqui."; o detalhe técnico (código | mensagem | detalhe | dica) vai para o diário de erros (`logErro`).
- **(Superado na etapa 3: agora é `compras_anexar`.) Anexar documentos a uma compra que já existe:** modo "só documentos" da RPC (`coPayloadSoDocs`: `p_itens` nulo e `p_compra` só com o id). Os campos da nota (chave, NF, emitente, CNPJ), as divergências e o status "cancelamento/reembolso informado" que o site
  completava ao anexar **não são mais atualizados** (a RPC ainda não suporta; dependem da migration 035, só com autorização). `ccCompletar` ficou no código, sem uso.
- **Provas:** `tests/compras_gravar_fluxo.test.mjs` roda o `js/compras.js` real contra um banco e um cofre de mentira que imitam a RPC (sucesso, falha de envio, pedido repetido, retentativa com o mesmo id, toque duplo, documento repetido, imagem repetida, resposta perdida pela rede,
  conferência que falha, edição que preserva os campos, só documentos). O SQL de verdade continua provado pelo PGlite no GitHub.
- **(Superado na etapa 3: agora é `compras_gravar_com_foto`.) Limitação temporária das fotos:** a foto nova de um produto fica guardada como documento da compra, mas o item **não** ganha `imagem_path` (antes o site fazia um `update` do item depois de gravar). Motivo: a RPC pode descartar a foto por SHA-256 repetido e,
  sem suporte transacional na RPC, não há como desfazer o vínculo sem uma gravação fora dela. Itens novos importados de PDF/e-mail ficam sem miniatura até a migration 035 (só com autorização). Na edição, o `imagem_path` já gravado é preservado
  (`coPayloadGravar` o copia do produto de mesma descrição; produto renomeado deixa de herdá-lo, e a foto continua como documento).
- **Fora deste fluxo:** os botões de uma linha só (confirmar cancelamento, recorrência, "já contada em outro lugar") e o apagar compra continuam fazendo `update`/`delete` diretos de um campo; não fazem parte da gravação de compra, itens e documentos.
- **Limites:** edição simultânea fica como era (vence a última gravação); a primeira conferência real é depois da publicação; apagar compra com reembolso continua falhando por chave estrangeira (mensagem técnica) e não faz parte do 5.1.

## Lote 5.1 · migration 035 (APLICADA em produção em 07/11/2026, pelo dono, no SQL Editor)
`supabase/035_compras_anexar_foto.sql`: só soma duas funções (nenhuma tabela, política, gatilho ou dado muda; `compras_gravar` fica exatamente como é). Rode depois do 030 e do 034; pode rodar de novo sem estragar nada.
- **`compras_anexar(p_id, p_docs, p_complemento)`**: anexa documentos a uma compra que já existe (usa `compras_gravar` no modo só documentos) e completa a compra **na mesma transação**: `chave_nfe`, `numero_nf`, `emitente` e `cnpj` só preenchem o que está vazio;
  `status` só vira `cancelamento_informado` ou `reembolso_informado` quando a compra está sem status; `divergencias` novas entram no fim, sem repetir o texto de uma existente (máximo 20 por vez, 100 na compra). Chave da nota que já é de outra compra: o índice único recusa e tudo volta (o documento também não fica).
  Devolve `completados` (quais campos foram preenchidos) e `divergencias_novas`. É o que o site fazia com `ccCompletar` e o status por e-mail antes de anexar passar a usar a RPC (etapa 2); o site **ainda não chama** esta função.
- **`compras_gravar_com_foto(p_compra, p_itens, p_docs, p_novo, p_foto)`**: o mesmo que `compras_gravar` e, na mesma transação, liga o 1º produto à foto (`imagem_path`) SÓ se a foto ficou registrada como documento `foto_produto` desta compra e o produto ainda não tem imagem.
  Foto repetida (descartada por SHA-256), compra que já existia (toque duplo) e produto que já tem imagem: nada é ligado. Devolve também `foto_vinculada`. Com ela, o site pode voltar a mostrar a miniatura sem gravação fora da RPC.
- **Segurança:** `security invoker`, `search_path` vazio, `anon` e `public` sem EXECUTE, só `authenticated`; valem a regra "casa" e a trava "mfa" (aal2) das tabelas.
- **Provas:** `tests/compras_035.test.mjs`: o texto do SQL (sempre) e o SQL de verdade no PGlite (no GitHub; localmente com `RAC_PGLITE`): completar, só preencher o vazio, divergência sem repetir, tudo ou nada, validações, permissões (anon, estranho, Fernanda, MFA), documento repetido, foto ligada só se registrada, toque duplo, rodar duas vezes.
- **Conferência feita em 07/11/2026 (só leitura):** `compras_anexar` e `compras_gravar_com_foto` existem; `anon` sem EXECUTE (`false`) e `authenticated` com EXECUTE (`true`) nas duas. O site AINDA NÃO usa as funções (etapa seguinte). Roteiro usado: as duas funções existem (`select proname from pg_proc where proname in ('compras_anexar','compras_gravar_com_foto')`) e o `anon` recebe `42501` ao chamá-las. Só então trocar `-- status: pendente` por "Aplicado em produção em DD/MM/AAAA".
- **Etapa seguinte (feita no código, ainda não publicada):** o site chama as duas funções e `coErroGravar` reconhece os prefixos novos: ver "Lote 5.1 · etapa 3".

## Lote 5.1 · etapa 3: o site usa `compras_anexar` e `compras_gravar_com_foto` (07/11/2026; só no código local, nada publicado)
A migration 035 já está aplicada em produção; esta etapa liga o site a ela.
- **Salvar (`ccGravar`):** chama `compras_gravar_com_foto` (uma só chamada): compra, produtos, documentos e o vínculo da foto na mesma transação. O site só diz qual é a foto (`p_foto`); quem liga o 1º produto a ela (`imagem_path`) é o BANCO, e só se ela ficou
  registrada como documento e o produto ainda não tem imagem. Foto repetida (SHA-256) nunca é ligada: nenhum item aponta para arquivo que sumiu, e não há gravação fora da RPC. Na edição, o `imagem_path` já gravado é preservado.
- **Anexar documento a uma compra que já existe (`ccAnexar`):** chama `compras_anexar` com os documentos e o **complemento** (`NUCLEO.coComplementoAnexo`): chave da nota, número da NF, emitente e CNPJ (só o que a compra ainda não tem), o aviso
  `cancelamento_informado`/`reembolso_informado` quando um e-mail de cancelamento ou reembolso é anexado e a compra está sem status, e as divergências novas (`NUCLEO.coDivergenciasAnexo`: pedido diferente e valores diferentes, sem repetir as que já existem). Tudo ou nada:
  se a chave da nota já for de outra compra, nada fica (o documento também não) e o arquivo enviado é apagado. O site só manda valores que a RPC aceita (44 e 14 dígitos, tamanhos e no máximo 20 divergências por vez); o banco só preenche o que está vazio.
- **Erros:** `coErroGravar` reconhece os prefixos `compras_gravar:`, `compras_anexar:` e `compras_gravar_com_foto:`; chave de nota repetida vinda do complemento vira "Já existe uma compra com esta nota fiscal".
- **Provas:** `tests/compras_gravar_fluxo.test.mjs` (o `ccGravar`/`ccAnexar` reais contra o banco e cofre simulados de `tests/_compras_falso.mjs`, que porta regra por regra, com as mesmas mensagens e códigos, `compras_gravar` (030), `compras_gravar_com_foto` e `compras_anexar` (035) e os CHECKs/índices únicos da 025 e 030: foto ligada só se registrada, foto repetida, toque duplo, complemento só no vazio, aviso por e-mail, chave de 44 e CNPJ de 14 dígitos, limites e 20 divergências, rollback por chave repetida, falha de envio/RPC/rede, nenhuma gravação direta, nenhum item apontando para arquivo descartado);
  **a fidelidade do simulador é provada, não suposta:** `tests/compras_035.test.mjs` roda os MESMOS passos no Postgres de verdade (PGlite, SQL real da 030 e da 035) e no simulador e compara, a cada passo, a resposta (dados, ou código e mensagem do erro) e as tabelas. A paridade já achou uma diferença (o CHECK de vocabulário do status). Fica de fora do simulador (só o PGlite prova): usuários/RLS, trava do MFA, CHECKs de tamanho e de valor mínimo, gatilhos e importações. E
  `tests/compras_gravar.test.mjs` (formatos e limites do complemento conferidos com o texto do SQL da 035). O SQL de verdade continua provado pelo PGlite (`tests/compras_035.test.mjs`).
- **Limites:** aviso de cancelamento/reembolso só entra se a compra está sem status (confirmar o cancelamento continua sendo do dono); a edição simultânea segue como era; a primeira prova com o Supabase real é depois da publicação. `ccCompletar` saiu do código (a regra está no núcleo).

## Abas da Central de Compras (07/11/2026, versão 2026-11-07.6)
São cinco abas, em `CC_ABAS`: Resumo, Compras, Importar, Produtos e recorrências e **＋ Manual** (`#compras/nova`, o cadastro manual; grava como qualquer conferência, por `ccGravar`). Até a 2026-11-07.5 a faixa rolava para o lado sem sinal nenhum e, em tela estreita, a ＋ Manual ficava fora da vista; agora a faixa quebra linha (`#compras .ccabas`) e as cinco aparecem. O botão azul flutuante "＋" do site é outro recurso ("Anotar rápido": item da lista da casa ou tarefa) e não cadastra compra. Prova: `tests/compras.test.mjs`.

**2026-11-07.7 · tela Importar:** o seletor nativo de arquivo aparecia duplicado e o botão azul "Escolher arquivos" quebrava a linha (a etiqueta era "em linha" e o campo nativo ficava solto dentro dela, empurrando a caixa de texto). Agora o campo nativo fica escondido dentro do botão, a caixa de texto ocupa a linha inteira e, ao escolher, aparece "N arquivos escolhidos". Prova: `tests/compras.test.mjs`.
