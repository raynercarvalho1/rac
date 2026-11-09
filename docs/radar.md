# Radar de Preços

Acompanha o preço de produtos que o dono comprou ou quer comprar, em várias lojas, com **histórico real** e **preço final comparável**.
**Só o dono** usa. Fernanda e demais membros da casa não veem nada do Radar (o banco recusa).

Estado: **Lote 1** (dados e segurança, aplicado em produção) e **Lote 2** (tela, leitura de página, coletor piloto, oportunidades, aviso e ação de IA). **Parte do Lote 2 depende de publicação e de autorização:** veja "O que está ativo" no fim deste arquivo. Fontes externas: `docs/radar-fontes.md`.
Migration: `supabase/043_radar_precos.sql` (**aplicada em produção em 09/11/2026**). Núcleo: `nucleo.js` (`rd*`, `RD_*`). Testes: `tests/radar.test.mjs`.

## Por que 043
A auditoria encontrou `040` em `supabase/` (proposta, não aplicada), `041` em `supabase/propostas/` (não aplicada) e `042` só como conferência
(`supabase/conferencias/042_conferir_alertas_push.sql`, alertas por push, sem migration). O próximo número livre e sem risco de duplicar é o **043**.
Ela não depende da 040 nem da 041. Depende do 002 (`membros`), do 022 (`rac_aal_ok()`) e do 038 (`seguranca_estado()`, que a 043 recria com as tabelas do Radar).
Ordem: 022 → 033 → 037 → 038 → **043**. Se alguma dessas rodar de novo depois, rode a 043 em seguida.

## Tabelas
| Tabela | Para que serve |
|---|---|
| `radar_config` | configuração privada do dono (hoje: `cep_padrao`, só 8 dígitos). **O CEP não está em nenhum arquivo do repositório.** |
| `radar_lojas` | fontes: nome, domínio (só o host), tipo, fonte padrão, `coleta_permitida` (só depois de conferir os termos), se o frete é calculável |
| `radar_itens` | o produto: nome, marca, modelo, variante, apresentação, GTIN/EAN, origem `comprado` ou `monitorado` |
| `radar_ofertas` | o item numa loja: link `https://`, vendedor, código na loja, **equivalência** (+ evidências e quem decidiu), situação |
| `radar_precos` | **histórico só de acréscimo** das observações (ver abaixo) |
| `radar_coletas` | execuções futuras de coleta (status, contagens, erro); neste lote só a estrutura |
| `radar_precos_final` (view) | `radar_precos` + `preco_final`, que fica **vazio** quando o frete é desconhecido ou o item não está disponível |

Ajuste em relação ao pedido: criei também `radar_config` (para o CEP privado) e a view `radar_precos_final`. Os filhos ligam ao pai por chave composta
`(id, dono)`, então uma observação nunca aponta para oferta de outra conta, e a ligação não apaga em cascata (o histórico não some por acidente).

## Regras financeiras (no banco e no núcleo)
- **À vista** (`a_vista`): sem parcelas, sem total parcelado, sem juros. **Parcelado**: `parcelas` (2 a 48), `valor_parcela`, `total_parcelado`, `sem_juros`,
  `juros_mensal_pct`; o preço do produto é o total parcelado e parcelas × valor da parcela fecha com o total (folga de 1 centavo por parcela).
- **Frete**: `desconhecido` (sem valor, **não é grátis**), `confirmado` (valor > 0), `gratis_confirmado` e `retirada` (valor 0). `frete_cep_padrao` só diz se foi calculado para o CEP padrão.
- **Preço final** = produto + frete confirmado + taxas − desconto/cupom (`NUCLEO.rdPrecoFinal`). Frete desconhecido, item indisponível ou disponibilidade desconhecida: sem preço final confirmado,
  fora do ranking (aparece em "fora" com o motivo).
- **Ranking** (`NUCLEO.rdRanking`): exige **uma** modalidade; à vista e parcelado nunca se misturam. Só entram ofertas ativas com equivalência confirmada. Série = oferta + modalidade + meio + nº de parcelas.
- **Comparações**: `rdVariacao` (última observação contra a anterior da mesma série) e `rdJanela` (mínimo/máximo na janela de N dias à escolha, só com observações reais; poucas observações = "insuficiente").
  Sem desconto mínimo arbitrário e sem mediana obrigatória.

## Histórico real
- `radar_precos` tem só `select` e `insert` para o dono; um gatilho recusa `update`, `delete` e `truncate`. Corrigir um erro = nova linha com `corrige_id`; a antiga permanece (`rdVigentes` a ignora nas contas).
- Toda observação traz `fonte` (`manual`, `coleta`, `nota_fiscal`) e `evidencia` (link, nº da nota ou descrição do print conferido). Data futura é recusada; `registrado_em` é sempre do servidor.
- Nada de observação retroativa inventada: só entra o que tem evidência. A mesma observação (oferta, modalidade, meio, parcelas, instante) não entra duas vezes.

## Segurança
- RLS ligado em todas as tabelas; política **"so o dono"** (`dono = auth.uid()` e quem está em `membros` fica de fora) e a trava restritiva **"mfa"** (`rac_aal_ok()`), como a Newsletter.
- `revoke all` de `public`, `anon` e `authenticated`, depois só os `grant` mínimos. `seguranca_estado()` passa a auditar a trava "mfa" das seis tabelas.
- Backup: as seis tabelas estão em `NUCLEO.SEG_TABELAS` como `so:"exportar"` (saem no backup, **não voltam** pela restauração neste lote; a restauração do histórico será decidida com prévia e teste no Lote 3). O backup tem o CEP, que é privado do dono.
- Nenhum CEP, preço, loja, link ou dado pessoal em arquivo público.

### Cadastrar o CEP padrão (o dono; feito em 09/11/2026)
No SQL Editor, trocando `<SEU_CEP_8_DIGITOS>` (não guarde o CEP em arquivo do repositório):

```sql
insert into public.radar_config (dono, cep_padrao) values (auth.uid(), '<SEU_CEP_8_DIGITOS>')
on conflict (dono) do update set cep_padrao = excluded.cep_padrao, atualizado_em = now();
```
`auth.uid()` só funciona na sessão do site; no SQL Editor use o seu id de usuário no lugar. O Lote 2 terá um campo na tela para isso.

## IA (preparada, sem uso)
Nada de IA, custo ou coleta neste lote. Quando entrar (Lote 7, pela `rac-ia`, ação nova com a skill `rac-acao-ia`): ajudar a achar produtos equivalentes, ler títulos e variantes e analisar oportunidades.
Limites já no banco e no núcleo: a IA **nunca inventa preço nem histórico** (preço só com `fonte` + `evidencia` verificável); a IA só propõe equivalência (`provavel`, origem `ia`);
`confirmada` exige evidência e a confirmação do dono (`confirmada_em`), e a origem `ia` nunca pode ser `confirmada` (`NUCLEO.rdEquivalencia`).

## Lote 2: o que existe
**Tela** (`js/radar.js`, aba **Radar** do Mercado, só do dono; carrega sob demanda; iPhone primeiro): Oportunidades, Produtos (comprados ou desejados, com marca, modelo, variante, apresentação e GTIN/EAN), Lojas, Ajustes.
Cada produto tem várias ofertas (loja + link + vendedor), ranking **por modalidade** (à vista e parcelado nunca se misturam, só com preço final confirmado), histórico por série (loja + modalidade + meio + parcelas) com última, menor, maior, variação, janelas de 30/90/180/365 dias e todo o histórico ("insuficiente" quando há menos de 2 observações com preço final), gráfico de barras com valor e data fixos em cada barra (`racDica`) e o que o dono pagou (comparado só na mesma modalidade).
O **CEP padrão** só é cadastrado/trocado na tela (8 dígitos, confirmação ao trocar) e **nunca é mostrado**: a tela diz apenas "cadastrado".

**Regras** (`nucleo.js`): `rdHistorico`, `rdOportunidades`, `rdAnomalia`, `rdChaveAviso`/`rdNaoAvisadas`, `rdSugerirEquivalencia`, `rdUrlOk`. Oportunidade = preço final atual **menor que a última observação, que o menor da janela escolhida ou que o preço pago** (mesma modalidade), sem desconto mínimo e sem mediana. Queda de 50% ou mais **não é descartada**: fica marcada "conferir se o preço está certo". Só entra oferta com equivalência confirmada, ativa, vendedor aceitável (lista em Ajustes), frete confirmado e item disponível. As mesmas regras existem em TypeScript (`supabase/functions/radar/regras.ts`) e um teste exige resultado idêntico.

**Histórico real**: a tela nunca atualiza nem apaga observações. "Confirmar frete" grava uma **nova linha** com `corrige_id` (1 s depois, porque o índice único não aceita o mesmo instante); a original continua no banco e só some das contas.

## O que está ativo (e o que não está)
| Parte | Estado |
|---|---|
| Aba Radar, cadastros, histórico, gráficos, ranking, oportunidades na tela, CEP | **funciona com o site publicado** (usa só as tabelas da 043) |
| Equivalência por regras (GTIN, marca, modelo, variante) | funciona; **só sugere**, o dono confirma |
| Leitura de URL ("Ler da página") e coleta | código pronto e testado em `supabase/functions/radar/`, **função não publicada**: sem ela o botão avisa e o preenchimento é manual |
| IA (`radar.equivalencia`) | ação no `rac-ia`, só REAL, sem demonstração; **botão desabilitado**. Precisa da proposta `supabase/propostas/044_ia_radar_equivalencia.sql`, republicar a `rac-ia` e ligar a ação. Cada chamada é paga (Haiku) e só acontece quando o dono tocar no botão |
| Aviso por notificação | lógica pronta e testada (`radar/avisos.ts`); **não ligado**: ver abaixo |
| Coleta agendada | **não existe** (precisa de migration de agendamento e de publicação; não escrita) |
| Mercado Livre | **exige credencial** (`docs/radar-fontes.md`) |

### IA: o que ela pode e não pode
Só **sugere** equivalência (`provavel`, `nao_confirmada`, `divergente`; o esquema nem oferece "confirmada"). Cada evidência precisa citar texto que realmente veio na entrada (senão é descartada); "provável" sem duas evidências verificáveis é rebaixado; GTIN com números diferentes não vale; preço, link ou número fora da entrada derrubam a resposta. O texto do anúncio entra só como dado entre `<dados>`; mesmo que a IA obedeça uma instrução escondida e responda "confirmada", o RAC recusa. Nunca grava. Sem demonstração (uma equivalência simulada enganaria): em DEMO a função responde `sem_real`. Nenhuma chamada paga foi feita.

### Aviso por notificação (passo isolado, ainda desligado)
`avisosRadar()` (`supabase/functions/radar/avisos.ts`) manda **1 aviso por dia, só ao dono**, com até 3 linhas, e nunca repete o mesmo preço: a chave é `rdop:<id da observação>` (imutável), reservada **antes** do envio com conferência de versão (duas execuções simultâneas enviam uma vez só; falha ou "nenhum aparelho" devolve a reserva). Configuração e histórico ficam em `pessoal` (`radar-config`, `radar-avisos`), sem migration. A Fernanda não recebe: a função só recebe o `uid` do dono.
Para ligar **sem mexer em nada do que a Garmin já faz**, bastaria um passo novo em `supabase/functions/garmin/index.ts` (proposta, **não aplicada**, depende da sua autorização):
```diff
+import { avisosRadar } from "../radar/avisos.ts";
 ...
   await passo("alertas_preco", () => resumoAlertasPreco(adm, uid, hoje, (msg) => pushPara(adm, uid, msg)));
+  /* Radar de Preços: só o dono (uid acima), passo isolado; ver docs/radar.md */
+  await passo("radar_avisos", () => avisosRadar(uid, hoje, (msg) => pushPara(adm, uid, msg), bancoRadar(adm)));
```
(`bancoRadar` é o adaptador do banco, a escrever junto.) Nenhum horário, rotina existente ou destinatário muda.

## Custos e dependências
Nenhum custo criado e nenhum serviço contratado. Dependem de você: publicar a função `radar`; migration 044 + republicar a `rac-ia` + ligar a ação (IA, paga por uso); credencial do Mercado Livre; agendamento da coleta; o passo do aviso na Garmin.
