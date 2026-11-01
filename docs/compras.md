# Central de Compras (compras online)

Página `#compras` (menu → Compras online), código em `js/compras.js`, contas em `nucleo.js` (`NUCLEO.co*`, testes em
`tests/compras.test.mjs`), banco em `supabase/025_compras_online.sql`. No ar desde 01/11/2026 (versão `2026-11-01.8`).

## O que faz

Registra pedidos de lojas online (Amazon primeiro; Mercado Livre, Shopee, Magazine Luiza e "outra loja" no mesmo formato) a partir
dos documentos da própria loja, guardando sempre o **arquivo original** e o que foi extraído dele.

| Entrada | Como é lida (tudo no aparelho, sem IA paga) |
|---|---|
| PDF de resumo do pedido / DANFE | pdf.js 3.11.174 (cdnjs): texto de todas as páginas e as imagens que parecem de produto |
| XML da NF-e | `NUCLEO.coLerNFe`: chave, número, emitente, CNPJ, itens, totais, forma de pagamento e o nº do pedido em `infCpl` |
| CSV de histórico (Amazon "Solicitar seus dados" → Retail.OrderHistory) | `NUCLEO.coLerCSV`: um pedido por número, cancelados fora |
| ZIP exportado pela loja | JSZip 3.10.1 (cdnjs): lê os PDF, XML, CSV, e-mails e imagens de dentro |
| E-mail (.eml, texto colado, Outlook ou Gmail) | MIME decodificado (quoted-printable/base64, HTML sem tags); confirmação, pagamento, envio, entrega, cancelamento e reembolso |
| Print / foto do pedido | OCR local com Tesseract.js 5.1.1 (jsDelivr; dados do português baixados na primeira vez) |

- **Gmail:** o botão "Buscar no Gmail" usa a mesma conexão do Gmail que o site já tinha (só leitura, no navegador do dono, com o
  token do próprio Google). Procura e-mails da Amazon e do Mercado Livre dos últimos 90 dias, baixa o original (.eml) e lê.
- **Histórico oficial da Amazon, sem senha:** Central de Privacidade → "Solicitar seus dados" → "Seus pedidos". A Amazon manda um
  ZIP com o CSV de todos os pedidos; importar o ZIP traz o histórico inteiro. O site nunca pede nem guarda a senha da loja, não
  faz raspagem do site da loja e não faz nenhuma ação na conta (comprar, cancelar, mudar).

## Outlook (Microsoft Graph, só leitura)

O e-mail que recebe os pedidos da Amazon é Outlook. O botão **✉ Conectar e buscar no Outlook** (só para o dono):

- **Login:** abre a janela de login da própria Microsoft (OAuth 2.0 com PKCE, autoridade `consumers`, para contas pessoais). Volta em
  `ms.html`, que só repassa o código; a troca pelo token é feita na página, sem segredo. O token fica só no aparelho, vale cerca de 1 hora
  e não pede acesso offline. Desconectar apaga o token.
- **Permissão única:** `Mail.Read` (delegada). Nada é enviado, movido, marcado ou apagado, e nenhum outro serviço Microsoft é usado.
  A senha nunca passa pelo site.
- **Busca:** `GET /me/messages?$search="from:amazon.com.br"`, últimos 90 dias, assuntos de pedido, pagamento, envio, entrega,
  cancelamento ou reembolso.
- **Importação:** cada e-mail é baixado no original (`GET /me/messages/{id}/$value`, .eml) e passa pela mesma leitura dos arquivos.
  Com "importar sozinho o que estiver completo", os pedidos completos são salvos. O que já existe (mesmo número de pedido) só ganha o
  e-mail como documento, e o que está incompleto fica na conferência.
- **Cancelamento e reembolso:** o e-mail só marca "informado" e avisa na compra. A compra só sai das despesas quando o dono toca em
  **Confirmar cancelamento**.

### O que falta para ligar (uma vez, feito pelo dono; nenhum dado inventado)

1. Entrar em <https://entra.microsoft.com> (ou portal.azure.com) com a conta Microsoft. Uma conta pessoal precisa ter um diretório
   (um tenant gratuito do Azure); se o portal pedir, é só criar o diretório gratuito.
2. **Registros de aplicativo → Novo registro:** nome "Dia a Dia RAC"; tipos de conta: **"Somente contas Microsoft pessoais"** (ou
   "qualquer diretório e contas pessoais").
3. **Autenticação → Adicionar plataforma → Aplicativo de página única (SPA)**, com o URI de redirecionamento
   `https://raynercarvalho.com.br/ms.html`. Não marcar "tokens de ID" nem "tokens de acesso" (fluxo implícito).
4. **Permissões de API → Microsoft Graph → Permissões delegadas → `Mail.Read`.** Conta pessoal não precisa de consentimento do
   administrador: o próprio dono consente no primeiro login.
5. **Não criar segredo do cliente.**
6. Copiar o **ID do aplicativo (cliente)** e colar no quadro do Outlook (Compras → Importar), ou mandar para entrar no código
   (`CC_MS_CLIENT_ID`). Ele é público, como o Client ID do Google que o site já usa.

**No iPhone:** o login abre em outra janela. Se o app da tela inicial não voltar sozinho, conecte pelo Safari (o token fica naquele
navegador).

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
