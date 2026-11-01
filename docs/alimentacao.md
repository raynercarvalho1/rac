# Alimentação e Delivery

Página `#alimentacao` (menu → Alimentação), código em `js/alimentacao.js`, contas em `nucleo.js` (`NUCLEO.al*`, testes em
`tests/alimentacao.test.mjs`), banco em `supabase/024_alimentacao.sql`. No ar desde 01/11/2026 (versão `2026-11-01.5`).

## Arquitetura híbrida

- **Mercado continua igual:** supermercado, açougue, padaria e hortifrúti são lançados no Mercado (notas e itens, sem nenhuma
  mudança). A Alimentação só lê a comida dessas compras para as contas.
- **Pedidos têm tabela própria:** iFood, 99Food e pedidos direto no restaurante (entrega, retirada ou no local) vão para `pedidos`
  e `pedido_itens`. Nada do Mercado é copiado para cá, então nada é contado duas vezes.
- **Visão unificada:** `alimentacao_gastos` (view, `security_invoker`) junta cada item do Mercado (como a view `compras`) e cada
  pedido, uma vez, com a origem marcada. A separação entre comida e o resto do Mercado é feita no site (`NUCLEO.alCatMercado`).
- **Casa:** o Rayner e a Fernanda veem e lançam juntos (`dono_da_casa()`, como no Mercado). A Fernanda vê "Alimentação" no menu.

## Banco (024)

| Tabela | O que guarda |
|---|---|
| `pedidos` | data, hora, estabelecimento, plataforma (`ifood`, `99food`, `direto`, `outro`), modo (`delivery`, `retirada`, `no_local`), número, pagamento (texto livre, nunca o número do cartão), subtotal, taxa de entrega, taxa de serviço, gorjeta, desconto da loja, desconto da plataforma, total pago, observações, fotos (`arquivos`), origem, versões e datas |
| `pedido_itens` | descrição, quantidade, unidade, unitário, total da linha, desconto do item, observação ("sem cebola") e, só quando é um produto de mercado, `produto_id` |

- O banco confere a conta (`pedidos_conta_fecha`: total = subtotal + entrega + serviço + gorjeta − descontos, 2 centavos de folga)
  e não aceita o mesmo número de pedido duas vezes na mesma plataforma (`pedidos_numero_unico`).
- RLS "casa" nas duas tabelas (o item só entra num pedido da mesma casa), trava "mfa" da 2ª etapa, nada para `anon`.
  O 022 foi rodado de novo em 01/11/2026 para incluir as duas na trava e na auditoria da Central de Segurança.
- Fotos no cofre privado `familia`, na pasta `<dono>/alimentacao/<pedido>/`.
- Backup e restauração: as duas tabelas estão em `NUCLEO.SEG_TABELAS` (o item aponta para o pedido) e as fotos dos pedidos vão para
  `anexos/` do .zip. O backup semanal do servidor (função `garmin`, que não foi alterada) ainda não inclui os pedidos.

## Telas

- **Resumo:** o mês (alimentação, Mercado-comida, delivery, restaurante, taxas e gorjetas, pedidos), as categorias, a evolução de 6 meses
  e os estabelecimentos onde mais foi. Limpeza, higiene, fraldas e descartáveis do Mercado ficam fora; categorias novas do Mercado
  aparecem como "sem classificação" (nada some).
- **Pedidos:** lista por mês com busca; o detalhe tem os itens, a conta, as fotos, Editar e Apagar (com confirmação; as fotos saem junto).
- **Pratos e preços:** cada item por estabelecimento (vezes, último preço, menor, variação). Pratos não entram no histórico de preços do Mercado.
- **Novo pedido / Editar:** campos vazios, conferência completa antes do Salvar (o botão fica desligado e a linha "Para salvar:" diz o que
  falta), a conta aparece enquanto se digita, fotos opcionais. Na edição, os valores anteriores vão para `versoes` (até 10).
- **Duplicidade:** mesmo número na mesma plataforma bloqueia; mesmo estabelecimento, data e valor pede um segundo toque ("Salvar mesmo
  assim"); números diferentes nunca bloqueiam. Sem internet, o Salvar não grava e os dados ficam na tela.

## Contas (`NUCLEO.al*`)

- `alPedidoConta` / `alConferir`: a conta em centavos, total pago obrigatório e igual à conta (2 centavos), sem valor inventado.
- Categorias: Alimentação · Supermercado, Açougue/Peixaria, Padaria, Hortifrúti, Delivery, Restaurante, Taxas de entrega e serviço, Gorjeta.
  Gorjeta é separada das taxas. Desconto maior que a comida (ex.: entrega grátis) desconta o resto das taxas.
- Nomes de produtos: `alChaveProduto` e `alCompararProdutos` ("Coca Cola 2L" = "Coca-Cola 2 litros"); marca, tamanho, versão (zero,
  integral, light…) ou números diferentes nunca juntam; na dúvida a resposta é "possível" e ninguém junta sozinho.
- `alDuplicata`: "confirmada" ou "possível". `alVersao`: as versões da edição.

## Painel de Produtividade

Os pedidos entram em `NUCLEO.pnDespesas` como uma fonte a mais (Delivery ou Restaurante, com taxas e gorjeta em categorias próprias).
Finanças ganhou o quadro **Alimentação** (comida do Mercado + pedidos, mês a mês). O Mercado, os registros e o MBA continuam iguais.

## IA

Ação `alimentacao.pedido` na `rac-ia` (mesmo modelo da nota do Mercado), **só em DEMO**: `real: false` no código e o banco nem aceita a
ação em `acoes_reais`. Em DEMO, a tela mostra só o aviso de que nada foi lido; nenhum campo é preenchido e nada pode ser salvo dela.
