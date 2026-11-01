# Veículos: abastecimentos, consumo e custos

Os veículos (Civic, Moto, C3 antigo) são entradas da lista `FAM` em `js/familia.js`. Placa, ano e cor ficam num registro com
`dados.ficha`, na conta, e nunca no código (o repositório é público).

## Onde ficam os dados

Não há tabela nova. Cada abastecimento é uma linha da tabela `registros` (004), com `tipo = "abastecimento"` e os detalhes na coluna
JSON `dados` (005). O RLS, o backup (`NUCLEO.SEG_TABELAS`) e a trava "mfa" (022) dessa tabela já valiam antes.

| Campo | Onde | Observação |
|---|---|---|
| identificador | `id` | gerado na tela, uma vez por formulário (ver Duplicidade) |
| veículo | `quem` | `civic`, `moto`, `c3` |
| data | `data` | data do abastecimento |
| hora | `dados.hora` | opcional, `HH:MM` |
| hodômetro | `dados.km` | inteiro, o ODO (nunca o Trip) |
| combustível | `dados.combustivel` | gasolina comum, gasolina aditivada, etanol ou diesel (os antigos podem ter só "gasolina") |
| litros | `dados.litros` | |
| preço por litro | `dados.precoLitro` | |
| total | `dados.custo` | é este valor que entra nos gastos, uma vez |
| posto | `valor` | texto livre |
| pagamento | `dados.pagamento` | texto livre (ex.: "Crédito Mastercard"); nunca o número do cartão |
| tanque | `dados.tanque` | `cheio` ou `parcial`; ausente = **não informado** (registros antigos) |
| origem | `dados.origem` | `manual`, `ia` (RAC Intelligence) ou `claude` (resposta colada) |
| fotos | `arquivos` | cofre privado `familia` |
| criação | `criado_em` | nunca muda |
| edição | `dados.atualizadoEm` e `dados.versoes` | a cada edição, os valores anteriores vão para `versoes` (até 10) |
| observações | `detalhes` | |

## O fluxo (Veículos → ⛽ Novo abastecimento)

1. Veículo, foto do painel e foto da bomba (a nota fiscal é opcional, no campo de mais fotos).
2. Ler: **Ler com IA** (ação `abastecimento.interpretar`) ou **Ler pelo Claude e colar a resposta**. Ou preencher à mão.
3. Conferência: todos os campos editáveis; o tanque (cheio ou parcial) é obrigatório no lançamento novo.
4. Salvar: só o toque em Salvar grava. Sem litros e sem total, vira só um registro de Quilometragem.

A leitura só preenche a conferência. A ação continua em **DEMO** em produção (o banco só libera REAL para `newsletter.resumo`):
a resposta simulada aparece na prévia e nunca chega à conferência (`NUCLEO.iaAbastTexto` recusa `_demo`). A Edge Function `rac-ia`
não mudou nesta entrega: a leitura de hora e de "gasolina aditivada" pela IA fica para quando o REAL do abastecimento for liberado.

## Duplicidade

- **Toque duplo:** o botão trava na hora do primeiro toque (`salvando`) e fica desabilitado.
- **Nova tentativa depois de falha de rede:** o insert leva o `id` gerado na tela; se o banco disser que o id já existe (23505),
  é a mesma gravação, e nada é gravado de novo.
- **Mesmo abastecimento lançado de novo (outro aparelho, outra tela):** antes de gravar, a tela consulta o banco
  (`NUCLEO.abDuplicado`): mesmo veículo e data, e mesma km, ou mesmo total e litros. Se achar, não grava e mostra o que já existe.
- **Painel:** cada abastecimento entra uma vez nos gastos (`NUCLEO.pnDespesas`); registro com `dados.compra` (veio de uma nota do
  Mercado) não conta de novo.
- **Sem internet:** o Salvar avisa e não tenta gravar; os dados continuam na tela.

## Cálculos (`nucleo.js`, testados em `tests/veiculos.test.mjs`)

- **Consumo (método do tanque cheio):** entre dois abastecimentos de tanque cheio do mesmo veículo, km rodados ÷ litros colocados
  depois do primeiro (os parciais do meio e o segundo cheio). O primeiro cheio é só referência.
- **Trecho descartado (nunca estimado):** falta a km de algum dos cheios; a km não aumentou; km de um abastecimento do meio fora de
  ordem; faltam os litros de algum abastecimento; um abastecimento do meio sem marcação de tanque; ou consumo fora de 3 a 70 km/l.
  O motivo aparece na linha do histórico.
- **Média do período:** ponderada = soma dos km ÷ soma dos litros dos trechos válidos. A média simples (média dos km/l de cada
  trecho) aparece separada, com o nome.
- **Custo de combustível por km:** total pago nos trechos válidos ÷ km desses trechos (trecho com algum total faltando sai do custo).
- **Preço por litro:** ponderado = total pago ÷ litros (só registros com os dois); simples = média dos preços anotados.
- **Por período:** só entram trechos inteiros dentro do período.
- Consumo e custo por km são sempre **por veículo** (moto e carro não se misturam).

## Registros antigos

Ficam como "tanque não informado" e fora do consumo. Nada é alterado sozinho. No histórico, **Informar tanque** pede a escolha
(cheio ou parcial) e depois **Confirmar**, um registro por vez; a marcação também anota `atualizadoEm` e a versão anterior.

## Painel de Produtividade → Finanças

- **Combustível:** gasto do período e comparação com o período anterior, litros, preço médio ponderado (e simples), gasto por mês,
  preço por litro do mês e os últimos abastecimentos.
- **Consumo e custo por km:** por veículo, com a metodologia escrita no quadro; sem dois cheios seguidos, o quadro avisa.
- **Despesas dos veículos:** por veículo e categoria (Combustível, Manutenção, Seguro, Impostos e licenciamento, Outros).
- **Categorias de despesas:** os registros dos veículos aparecem como "Veículos · Combustível" e "Veículos · Manutenção".

## Manutenção (já existe; próximos passos planejados)

Já existem os tipos Revisão, Troca de óleo, Manutenção, Pneu, Bateria, Seguro e Licenciamento/IPVA, com "próxima com X km" e
"próxima data", previsão pelo ritmo de uso e lembretes na Agenda. Planejado: quadro de custo de manutenção por km, lembrete de pneu
por km, e o seguro/IPVA anual como compromisso recorrente.
