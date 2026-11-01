# Central de Compras (compras online)

Página `#compras` (menu → Compras online), código em `js/compras.js`, contas em `nucleo.js` (`NUCLEO.co*`, testes em
`tests/compras.test.mjs`), banco em `supabase/025_compras_online.sql`. No ar desde 01/11/2026 (versão `2026-11-01.7`).

## O que faz

Registra pedidos de lojas online (Amazon primeiro; Mercado Livre, Shopee, Magazine Luiza e "outra loja" no mesmo formato) a partir
dos documentos da própria loja, guardando sempre o **arquivo original** e o que foi extraído dele.

| Entrada | Como é lida (tudo no aparelho, sem IA paga) |
|---|---|
| PDF de resumo do pedido / DANFE | pdf.js 3.11.174 (cdnjs): texto de todas as páginas e as imagens que parecem de produto |
| XML da NF-e | `NUCLEO.coLerNFe`: chave, número, emitente, CNPJ, itens, totais, forma de pagamento e o nº do pedido em `infCpl` |
| CSV de histórico (Amazon "Solicitar seus dados" → Retail.OrderHistory) | `NUCLEO.coLerCSV`: um pedido por número, cancelados fora |
| ZIP exportado pela loja | JSZip 3.10.1 (cdnjs): lê os PDF, XML, CSV, e-mails e imagens de dentro |
| E-mail (.eml, texto colado ou Gmail) | MIME decodificado (quoted-printable/base64, HTML sem tags); confirmação, envio e entrega |
| Print / foto do pedido | OCR local com Tesseract.js 5.1.1 (jsDelivr; dados do português baixados na primeira vez) |

- **Gmail:** o botão "Buscar no Gmail" usa a mesma conexão do Gmail que o site já tinha (só leitura, no navegador do dono, com o
  token do próprio Google). Procura e-mails da Amazon e do Mercado Livre dos últimos 90 dias, baixa o original (.eml) e lê.
- **Histórico oficial da Amazon, sem senha:** Central de Privacidade → "Solicitar seus dados" → "Seus pedidos". A Amazon manda um
  ZIP com o CSV de todos os pedidos; importar o ZIP traz o histórico inteiro. O site nunca pede nem guarda a senha da loja, não
  faz raspagem do site da loja e não faz nenhuma ação na conta (comprar, cancelar, mudar).

## Processamento

- **Leitura do pedido** (`coLerTexto`): loja, número, data, vendedor, produtos e quantidades, subtotal, desconto (inclusive
  Programe e Poupe/cupom), frete, taxas, total pago e forma de pagamento.
- **Pagamento:** só a bandeira e os 4 últimos dígitos ("Mastercard final 3535"). O banco recusa sequências de 5 ou mais números.
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

Amazon 702-4817785-8646635, 01/11/2026: Bravecto 250 mg, 1 comprimido mastigável.
- **Valores:** subtotal R$ 136,42, desconto R$ 6,82, frete R$ 0,00 e **total pago R$ 129,60** (a despesa).
- **Vendedor e pagamento:** Amazon.com.br, Mastercard final 3535.
- **Recorrência:** entrega automática a cada 4 meses, a confirmar.

Foi registrado a partir dos dados informados pelo dono. O PDF original e a imagem do produto entram quando o PDF for importado
(Compras → o pedido → Adicionar documento, ou Importar): o sistema reconhece o mesmo número e só anexa.
