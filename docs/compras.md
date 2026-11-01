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
