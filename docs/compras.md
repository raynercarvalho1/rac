# Central de Compras (compras online)

Página `#compras` (menu → Compras online), código em `js/compras.js`, contas em `nucleo.js` (`NUCLEO.co*`, testes em
`tests/compras.test.mjs`), banco em `supabase/025_compras_online.sql`. No ar desde 01/11/2026 (versão `2026-11-01.9`).

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
- **Histórico de preços por produto** (`coPrecos`), pelo nome padronizado (`alChaveProduto`).
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
- **Pendências de interface (não implementadas):** os selects do **Painel e Hoje** (`js/painel.js`, `js/hoje.js`) precisam passar a trazer `canal`,
  `natureza`, `historico`, `status` e os produtos (`natureza`, `total_linha`, `situacao`) para a classificação multiorigem valer sobre dados do banco;
  ligar `compras_gravar`, a tela de reembolsos/estorno e a importação.
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
- **Interface:** nada do site usa as tabelas novas ainda; as consultas de Painel e Hoje precisam passar a trazer `canal`, `natureza`, `historico` e os campos dos produtos.
