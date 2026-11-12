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

**Excluir e arquivar**: produto sem ofertas pode ser **excluído**; com ofertas (e histórico) só se **arquiva** (sai da lista, as ofertas ficam pausadas, nada é apagado; "Mostrar arquivados" traz de volta). Oferta sem preços e loja sem ofertas também podem ser excluídas. O histórico de preços nunca é apagado pela tela (o banco também recusa).
**Oferta pelo link**: se a loja do endereço ainda não existe, a tela oferece cadastrá-la junto (domínio do próprio link, coleta desligada). Links encurtados (como `a.co`) levam a outro domínio e a leitura automática não os acompanha: use o link final. Erros aparecem junto do formulário e **não apagam o que foi digitado**. O que você pagou aparece no produto e na lista.

## O que está ativo (e o que não está) — Lote 3, 09/11/2026
| Parte | Estado real |
|---|---|
| Aba Radar, cadastros, histórico, gráficos, ranking, oportunidades na tela, CEP, excluir/arquivar | **funciona com o site publicado** (usa só as tabelas da 043) |
| Equivalência por regras: GTIN, marca, modelo, variante **e medidas dos títulos** (capacidade, quantidade, voltagem, GB, polegadas, BTU) | **funciona**; só sugere, o dono confirma |
| Sinais de anúncio suspeito (queda grande, marketplace sem vendedor, parcelado abaixo do à vista, disponibilidade incerta) | **funciona** na aba Oportunidades; nunca descarta a oferta |
| IA (`radar.equivalencia`) | **fiação pronta na tela, desligada por padrão** (Ajustes). Sem 044, sem republicar a `rac-ia` e sem liberação REAL, o servidor responde `sem_real` e **não cobra**. **Nenhuma chamada real já foi feita** |
| Leitura de URL ("Ler da página") e coleta | código pronto e testado; **função `radar` não publicada**. Leitura real de páginas confirmada hoje em KaBuM e Fast Shop (`docs/radar-fontes.md`); coleta automática **não está operando** |
| Aviso por notificação | **independente da Garmin** (`radar/push.ts` + `rotina.ts`), testado com decifragem do lado do aparelho; **não ligado**: depende de publicar a função e de agendar (045). **Nenhuma notificação foi enviada** |
| Agendamento | `supabase/045_radar_rotina.sql` (**aplicada**; funciona desde a 047) |
| Mercado Livre | **depende de credencial**; mapeamento pronto e testado só com dados fictícios; ciclo OAuth ainda não existe |

### IA: o que ela pode e não pode
Só **sugere** equivalência (`provavel`, `nao_confirmada`, `divergente`; o esquema nem oferece "confirmada"). Cada evidência precisa citar texto que realmente veio na entrada (senão é descartada); "provável" sem duas evidências verificáveis é rebaixado; GTIN com números diferentes não vale; preço, link ou número fora da entrada derrubam a resposta. O texto do anúncio entra só como dado entre `<dados>`; mesmo que a IA obedeça uma instrução escondida e responda "confirmada", o RAC recusa. Nunca grava. Sem demonstração (uma equivalência simulada enganaria): em DEMO a função responde `sem_real`.
**O que vai para a IA:** só o produto cadastrado (nome, marca, modelo, variante, apresentação, GTIN) e o anúncio (título, marca, modelo, GTIN, vendedor). **Nunca** preço, frete, CEP ou histórico. A tela mostra a sugestão, mas confirmar é decisão do dono; a evidência da IA é gravada marcada como `origem: ia`.

#### Proposta financeira da IA (aguarda sua aprovação; nada foi ativado)
- **Provedor e modelo:** Anthropic, `claude-haiku-5-5` (a ação usa Haiku por ser comparação curta). Preços de `ia_precos` (fonte e data no banco): US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída.
- **Custo por sugestão:** ≈ 1.500 tokens de entrada e ≈ 400 de saída = ≈ US$ 0,00035 ≈ **R$ 0,0024** (câmbio padrão 6,00 e margem de impostos de 12%). A função reserva um pouco mais por chamada (teto de saída), e o monitor de custos mostra o real.
- **Cenários por mês:** 10 sugestões ≈ R$ 0,02 · 50 ≈ R$ 0,12 · 200 ≈ R$ 0,47 · 1.000 ≈ R$ 2,35.
- **O que roda sem IA (R$ 0):** comparação de GTIN, marca, modelo, variante e medidas dos títulos; preço final, histórico, oportunidades, deduplicação e sinais de suspeita. A IA só entra quando o dono toca em "Pedir sugestão da IA".
- **Proteções:** desligada por padrão (chave em Ajustes); confirmação antes de cada chamada avisando que é paga; uma chamada por toque, sem repetição automática; chave de idempotência nova por toque (o servidor recusa repetir a mesma); limite mensal da IA do RAC (`ia_config.limite_brl`, hoje padrão R$ 50 compartilhado por todos os módulos) com reserva antes de cada chamada; ação só do dono (`acoes_reais_casa` proíbe a casa); sem DEMO.
- **A migration 044 é necessária?** Sim, **só** para o banco aceitar `radar.equivalencia` em `ia_config.acoes_reais` (a restrição atual lista as ações permitidas; sem ela a ação fica sempre em DEMO). Não cria tabela nem muda RLS.
- **Saldo/crédito:** não presumo que exista; a chave da Anthropic e o saldo são da conta do dono (Console), que não vi nem altero.
- **Para ativar (cada passo depende de você):** (1) aprovar o gasto (sugestão: manter o limite global atual; o Radar usa centavos); (2) rodar a 044; (3) republicar a `rac-ia`; (4) ligar a ação com o `update` comentado na 044; (5) ligar a chave em Ajustes → Radar.

### Aviso por notificação: arquitetura independente (sem tocar na Garmin)
`avisosRadar()` manda **1 aviso por dia, só ao dono**, com até 3 linhas, e nunca repete o mesmo preço: a chave é `rdop:<id da observação>` (imutável), reservada **antes** do envio com conferência de versão (duas execuções simultâneas enviam uma vez só; falha ou "nenhum aparelho" devolve a reserva; o "dia" é o de Brasília). Configuração e histórico ficam em `pessoal` (`radar-config`, `radar-avisos`), sem migration. Dados insuficientes não geram aviso (preço final exige frete confirmado, item disponível, equivalência confirmada e vendedor aceitável).
O envio é **`supabase/functions/radar/push.ts`**: o mesmo mecanismo da Garmin (VAPID + aes128gcm, RFC 8291/8292), copiado e adaptado — só lê as chaves VAPID de `rac_segredos` (nunca cria), só fala com as inscrições do dono e só apaga inscrição morta dele. O teste decifra a mensagem do lado do aparelho e confere a assinatura VAPID.
- **Arquivos afetados:** só `supabase/functions/radar/` (novos: `push.ts`, `rotina.ts`; alterado: `index.ts`). **Nenhum arquivo da Garmin foi lido para alteração, alterado ou referenciado** (um teste garante que a Garmin não menciona o Radar).
- **Garmin precisa mudar?** **Não.** A proposta anterior (um passo novo em `garmin/index.ts`) fica **descartada**, a menos que você prefira ela.
- **Para ligar:** publicar a função `radar`; ter as notificações ativas em Sistema (chaves e aparelho inscrito); aplicar `supabase/045_radar_rotina.sql` (agenda 6h20 e 18h20 de Brasília). **Rollback:** `select cron.unschedule('radar-rotina');` desliga tudo; a função pode ser despublicada; nenhuma tabela nova.
- **Isolamento:** a rotina só trata donos que **não** estão em `membros`; a casa (Fernanda) nunca recebe; o site recusa membro com 403.

## Publicação da função radar (Lote 4) — roteiro para o dono
O `.claude/settings.json` nega `supabase functions deploy`, `supabase db`/`migration`, `psql` e a API de gerenciamento, e a CLI nem está instalada na máquina do Claude: a publicação e o SQL são feitos por você (ou pelo painel). Verificações já feitas no código (Lote 4): a função não importa de outra função (cópia própria de `chaves.ts`); DNS com fallback seguro (`dns.ts`); rodada com orçamento de 90 s (a Edge Function tem limite de duração); logs só com o nome do erro; recusa anônimo (401), membro (403) e corpo grande (413).
1. **Publicar só a `radar`** (projeto `hofnhbxnfebfnncwxrds`; **`--no-verify-jwt` é obrigatório**: a rotina chama sem login, e a própria função confere o login do dono ou a senha da rotina):
   `npx supabase@2.121.0 functions deploy radar --project-ref hofnhbxnfebfnncwxrds --use-api --no-verify-jwt`
2. **Conferir sem login** (não dispara coleta): um POST qualquer em `https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/radar` deve responder **401** `nao_autenticado`; hoje responde **404** (não publicada).
3. **Só depois**, no SQL Editor: `show cron.timezone;` (deve ser GMT/UTC) e então o conteúdo de `supabase/045_radar_rotina.sql` (agenda **6h20 e 18h20 de Brasília** = 9h20 e 21h20 UTC; um único job `radar-rotina`; só agendamento, nenhuma tabela é tocada).
4. **Conferir** (só leitura): `select jobid, jobname, schedule, active from cron.job where jobname = 'radar-rotina';` (exatamente 1 linha, ativo) e, depois da primeira execução, `select status, start_time, return_message from cron.job_run_details where jobid = <jobid> order by start_time desc limit 5;` e `select status, iniciada_em, ofertas_lidas, precos_gravados, falhas, erro_codigo from public.radar_coletas order by iniciada_em desc limit 10;`.
5. **Rollback:** `select cron.unschedule('radar-rotina');` (desliga tudo) e, se quiser, despublicar a função no painel.
Pré-requisitos do aviso: notificações ativas em Sistema (chaves VAPID em `rac_segredos` e um aparelho inscrito). Sem lojas com "coleta liberada", a rodada só confere os avisos.

## IA com teto de R$ 10,00 por mês: análise de viabilidade (nada foi ativado)
- **Modelo e preço:** `claude-haiku-5-5`, US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída (`ia_precos`).
- **Custo por sugestão:** ≈ 1.500 tokens de entrada + ≈ 400 de saída ≈ US$ 0,00035 ≈ **R$ 0,0024** (câmbio 6,00, impostos 12%). **Reserva** por chamada (pior caso: saída máxima de 1.500 tokens, margem de contagem de 15%): ≈ US$ 0,0010 ≈ R$ 0,0070.
- **Por mês (custo estimado ≈ reais):** 10 → R$ 0,02 · 100 → R$ 0,24 · 500 → R$ 1,18 · 1.000 → R$ 2,35. **Mesmo 1.000 sugestões ficam longe de R$ 10.**
- **Margem cambial:** o teto interno já embute margem de segurança de 10% e usa o câmbio configurado (6,00). Com o dólar a R$ 7,50 (+25%), 1.000 sugestões custariam ≈ R$ 2,94, ainda muito abaixo.
- **Como o RAC controla (código real, `015_ia.sql`):** `ia_teto_usd` = limite ÷ (câmbio × (1 + impostos)) × (1 − margem). Com limite R$ 10: **US$ 1,339 de teto ≈ R$ 9,00 de gasto comprometido**. Antes de cada chamada, `ia_reservar` (com trava por dono, `pg_advisory_xact_lock`) soma o já comprometido do mês (concluídas × fator de correção; abertas e **incertas pela reserva cheia**; reconciliadas pelo cobrado) e **recusa com `orcamento_esgotado`** se a nova reserva passar do teto. Também limita: 2 chamadas em andamento, 10 por minuto e 150 por dia.
- **Falha do provedor:** erro 4xx/antes do envio não conta; timeout ou 5xx viram **"incerto" e retêm a reserva cheia até você reconciliar** (o custo real pode ter ocorrido); não há repetição automática; o Radar inteiro continua funcionando sem IA (a tela só mostra a mensagem).
- **É um teto efetivo?** **Para as chamadas que passam pelo RAC, sim**: a reserva é gravada antes do envio e o banco serializa os pedidos. **Limitações:** (1) é contabilidade interna, não um bloqueio do provedor: outro uso da mesma chave fora do RAC, ou um erro de contagem, não é visto; (2) a estimativa de custo usa tokens contados e depende de `ia_precos` estar correto; (3) o limite real de cobrança só existe no Console da Anthropic (crédito pré-pago sem recarga automática e/ou limite de gasto do workspace), que o RAC não controla nem eu alterei. **Recomendação:** crédito pré-pago pequeno, sem recarga automática, como teto externo.
- **ATENÇÃO — o limite é global:** `ia_config.limite_brl` vale para **todos** os módulos de IA (Newsletter, RAC Hoje, leitura de notas, abastecimento), hoje R$ 50. Baixar para R$ 10 reduz o orçamento de todos. O Radar sozinho gastaria centavos; se quiser um teto **só do Radar**, é preciso um limite por ação (código no `rac-ia` e SQL), que **não fiz** (rac-ia e 044 estão fora desta etapa).
- **Para ativar, ainda dependem de você:** aprovar o gasto; rodar a 044; republicar a `rac-ia`; ligar a ação (`update` comentado na 044); ligar a chave em Ajustes → Radar. **Nada disso foi feito.**

## Migration 047: privilégios do service_role (aplicada em 10/11/2026)
**Problema (produção, rotina das 06:20/18:20):** HTTP 500 na etapa `rotina_listar_donos`, erro PostgreSQL `42501 permission denied for table radar_lojas`. A função usa a chave de servidor (papel `service_role`; a etapa anterior, `rac_rotina_ok`, só existe para esse papel e passou). A 043 concedeu as tabelas do Radar só ao `authenticated`; neste projeto o `service_role` não herda privilégio de tabela (cada migration concede o seu). O RLS não é o problema: o `service_role` o ignora, mas precisa do privilégio de tabela.
**Correção mínima (`supabase/047_radar_service_role.sql`, só `grant`, idempotente):** `select` em `radar_lojas`, `radar_ofertas`, `radar_itens`; `select, insert, update` em `radar_coletas`; `select, insert` em `radar_precos` (histórico só de acréscimo: sem update nem delete). Não toca em `anon`, `public`, `authenticated`, políticas, trava "mfa" nem em `radar_config`. A exclusão dos membros da rotina continua na função (`index.ts`).
**Testes:** `tests/radar_service_role.test.mjs` (texto e PGlite): reproduz o 42501 antes, comprova o mínimo depois (inclui "preço não se atualiza nem se apaga") e que anon/authenticated/políticas ficam iguais. **Limitação:** o PGlite prova os privilégios de tabela, não a Edge Function, a chave nem o cron em produção; isso só se comprova disparando a rotina uma vez.
**Aplicada e conferida pelo dono em 10/11/2026** (`supabase/conferencias/047_conferir_producao.sql`: tudo como esperado). Rodada manual depois dela: HTTP 200, `{"ok":true,"resultado":{}}` (antes, o cron das 18:20 dava 500). `resultado` vazio = nenhum dono com loja no Radar; a coleta, os preços e o push só se comprovam com uma loja com coleta liberada (pendente).

## Descoberta de ofertas pelo SerpApi (11/11/2026) — implementada localmente, NÃO publicada
**Por quê.** O Radar só acompanhava links cadastrados à mão. A descoberta recebe o produto (nome, marca, modelo, tamanho, EAN), pesquisa e traz **candidatos**: anúncios vistos pelo provedor, ainda **não confirmados na loja**. Aprendizados da PoC (10 e 11/11): a busca acha lojas que a leitura direta não alcança, o EAN misturado a muitas palavras piora a relevância e o preço por loja exige uma segunda consulta.
**Decisão do dono: nada é descartado.** Kits, combos, outros tamanhos e relacionados entram na lista; cada um é classificado e comparado quando há dados. Tipos: `individual`, `kit_mesmo_produto`, `combo`, `outra_apresentacao`, `relacionado`, `indeterminado` (`ofertas.ts`, `classificar`). Cada anúncio mostra marca, peso/volume, unidades, composição (sugerida pelo título), preço total, **preço por 100 g / 100 ml / unidade** quando calculável (combos e anúncios sem medida ficam sem valor: nada é estimado), pagamento, loja e link.

### Provedores: o que existe e o que é futuro
A estrutura é por **provedor** (`provedores.ts`, interface `Provedor`: planejar e executar busca, planejar e executar expansão de lojas, custo por engine). O orquestrador (`descoberta.ts`) não conhece o SerpApi: cache, orçamento, histórico e classificação valem para qualquer provedor. `provedor` e `engine` no banco são validados por formato, sem lista fechada: um provedor novo não exige migration.
| Provedor | Estado | Observação |
|---|---|---|
| **SerpApi** (Google Shopping) | **implementado** | UM provedor com 3 engines/operações: `google_shopping` (busca), `google_immersive_product` e `google_product` (expansão de lojas). Os 3 engines NÃO são 3 provedores. |
| Mercado Livre (API oficial) | planejado, sem código de descoberta | Exige aplicativo e OAuth do dono; a API responde 403 sem token. `mercadolivre.ts` serve só à coleta por link. |
| Páginas de lojas VTEX (leitura direta) | planejado | A PoC leu 7 lojas (EAN e preço no estado da página). Falta o adaptador (descobrir a página, respeitar robots.txt, orçamento por loja). |
| Consulta direta a lojas | planejado | Busca interna proibida pelo robots.txt ou dependente de JavaScript; só vale com a URL (a coleta por link já existe). |
| Feeds de afiliados (Awin, Lomadee, Shopee) | planejado | Exigem conta e aprovação. |
Os planejados estão em `PROVEDORES_PLANEJADOS`, aparecem na aba ("ainda não implementada") e **nunca são chamados**. Para incluir um: implementar `Provedor` num arquivo novo, registrá-lo em `provedoresDe` e testar; nada mais muda.

### Operações que podem consumir crédito (todas passam pelo mesmo orçamento)
| Operação | Engine | Conta no orçamento? | Observação |
|---|---|---|---|
| Busca de produto | `google_shopping` | **sim**, 1 | HTTP 200 vazio também conta (busca bem-sucedida, `search_metadata.status = Success` mesmo com `error` preenchido; código `sem_resultados`) e vira cache |
| Expansão de lojas | `google_immersive_product` | **sim**, 1 (assumido) | custo NÃO documentado; teto próprio de 10 por dia |
| Expansão por `google_product` | `google_product` | **sim**, 1 (assumido) | idem; mesmo teto de expansões |
| Busca da rotina automática | qualquer | **sim**, marcada `origem = rotina` | desligada por padrão; teto próprio de 6 créditos por dia |
| Resultado incerto (rede, tempo esgotado, resposta ilegível, outro 4xx (sem respaldo documental de gratuidade), HTTP 5xx, HTTP 200 com erro sem `search_metadata`, status `Processing`, exceção inesperada) | qualquer | **sim, retém o crédito** (`status = incerto`) | o provedor pode ter cobrado; interrompe as demais consultas da busca; **não há reconciliação**: continua contado até o dia/mês virar |
| Resposta bem-sucedida, mas a gravação dos candidatos falhou | qualquer | **sim, retém o crédito** (`incerto`, `falha_persistencia`) | a cobrança é certa, os dados se perderam; nada é repetido sozinho; não vira cache |
| Reserva sem resposta registrada (a função parou depois de reservar) | qualquer | **sim, retém o crédito** (`incerto`, `reserva_orfa`, após 10 min) | nunca é liberada por prazo |
| Cache do RAC (24 h) | — | não | só vale para o mesmo produto e a mesma consulta (o do provedor, de 1 h, não é visível) |
| Erro definitivo documentado como não cobrado (chave recusada 401/403, limite 429, `search_metadata.status = Error`) | qualquer | não (a reserva é liberada) | registrado com o código |
| Bloqueio por orçamento | — | não | registrado com o motivo (`orcamento_dia`, `_mes`, `_engine_dia`, `_engine_mes`, `_expansoes`, `_rotina`) |
| Conferir a cota (`account.json`) | conta | não | endpoint gratuito (documentação), só números |
O custo por engine é configurável (`custo_por_engine`, mínimo 1). A tela e a ação `uso_descoberta` mostram o uso **por engine e por origem**.
**Limites internos** (200/mês, 20/dia, 10 expansões/dia, 6 da rotina/dia; configuração `radar-descoberta` em `pessoal`, só leitura pela função) são **conservadores e não são a franquia real** do SerpApi (250/mês e 50/hora no plano gratuito): a cota real vem de `cota_provedor`. Limites opcionais por engine (`limite_por_engine: { google_shopping: { dia, mes } }`, sem padrão). **Orçamento atômico (048):** o crédito é RESERVADO no banco antes da chamada, por `radar_reservar_consulta`, que confere limite mensal, diário, por engine, de expansões e da rotina e grava a reserva na mesma transação, sob `pg_advisory_xact_lock` por dono (o mesmo mecanismo de `ia_reservar`, 015); o JavaScript só pede a reserva. Duas chamadas simultâneas (inclusive rotina × manual) nunca levam juntas o último crédito; a mesma consulta já em andamento e o cache também são conferidos dentro da trava. Ciclo: `reservada` → `ok` (conta) / `erro` (libera) / `incerto` (retém); `radar_concluir_consulta` resolve a reserva **uma única vez** (resposta atrasada não a consome de novo nem desfaz um incerto). Incerto **permanece contado**: não existe reconciliação, ação, botão ou função para liberá-lo (decisão do dono); o orçamento só ganha folga quando o dia e o mês viram, e a cota real pode ser conferida em `cota_provedor`. Sem orçamento, a aba mostra só "O limite de consultas foi atingido." (o motivo detalhado fica em `radar_consultas.erro_codigo`).
**Limitações do orçamento:** (1) é contabilidade interna: outro uso da mesma chave fora do RAC não é visto; (2) o teste de concorrência roda no PGlite, que tem uma conexão: ele prova que conferir e reservar são um passo só e que a regra está certa, mas a exclusão entre conexões paralelas depende da trava advisory do Postgres real (só se confirma com a 048 aplicada); (3) a validade da reserva órfã (10 min) é maior que o tempo limite da chamada (30 s), mas uma chamada que passe disso e responda depois será registrada como incerta (conservador, não perde crédito); (4) sem a 048 aplicada, a função responde `migracao_pendente`.

### Identidade e histórico do produto
Cada candidato tem `produto_chave` (marca|modelo, ou EAN; igual em qualquer loja, anúncio ou tamanho; vazia para relacionado e indeterminado) e `apresentacao_chave` (`454g`, `2x454g`, `250g+454g`, `combo`), além da identificação do anúncio original (`provedor`, `engine`, `id_externo`, `loja`, `titulo`). Cada vez que um anúncio é visto com preço (primeira vez, preço novo ou após 20 h) entra uma linha em **`radar_historico`** (só de acréscimo: nem o administrador edita ou apaga). A série é por **identidade**, não por anúncio: trocar de loja ou de anúncio não corta o histórico; o kit tem a série `2x454g`, o avulso a `454g`, o combo a própria; relacionado e indeterminado não entram em série. O quadro "Menor preço por 100 g já visto" compara tamanhos e kits do **mesmo** produto, nunca combos. O candidato ainda guarda `precos_anteriores` (até 20) para a leitura rápida.
Limite: é o preço que o provedor mostrou (sem evidência de loja). **Não é** o histórico confirmado do Radar (`radar_precos`, por oferta, com evidência e confirmação do dono), e nada é copiado para lá sozinho.

### Ligação com o Radar e com a Central de Compras
A aba Descobrir **não cria fluxo paralelo**: usa os produtos (`radar_itens`) e as lojas do Radar, o mesmo `rtOfertaComLoja`/`rtSalvarOferta` da oferta manual ("Acompanhar" cria loja e oferta, com a evidência da descoberta, equivalência continua **não confirmada**), o valor pago (`radar-pagos`) e depois as mesmas regras de ranking, equivalência, histórico confirmado e aviso. Acompanhar kit, combo ou outro tamanho mostra o aviso de que o preço não é o do frasco avulso. O Radar vive na Central de Compras como aba; **ainda não há ligação automática** entre os candidatos e as compras registradas (notas do Mercado, pedidos online): o "paguei" é informado à mão. Ligar o preço pago por medida às compras reais é uma extensão futura.

### Segurança e backup
- Chave: Secret `SERPAPI_API_KEY` da função (só o nome aparece no código); nunca vai ao site, ao banco, a log, a resposta nem a mensagem de erro (testes com chave de mentira); o adaptador só fala com `serpapi.com`, com 3 engines e lista fixa de parâmetros. Só o dono chama (a casa é recusada antes). Sem IA paga: a classificação é por regras.
- Banco (048): RLS "so o dono", trava "mfa", nada para anon; o site só lê consultas e histórico e só muda a decisão dos candidatos; o `service_role` recebe o mínimo (consultas e histórico: select+insert; candidatos: select+insert+update).
- Backup do site (JSON e .zip): `radar_consultas`, `radar_candidatos` e `radar_historico` estão em `NUCLEO.SEG_TABELAS` como só-exportar, marcadas `dep: "048"`: antes da migration são ignoradas sem acusar falha (`segTabelaAusente`); depois, entram. `page_token` nunca sai (`segLimpar`). Restaurar não as recria (são dados derivados). O backup semanal do servidor (função `garmin`, intocável) tem a própria lista e **não** inclui estas tabelas.

### Banco: `supabase/048_radar_descoberta.sql` (**aplicada em 12/11/2026**)
`radar_consultas` (uma linha por chamada: provedor, engine, origem, status `reservada/ok/erro/cache/bloqueada_orcamento/incerto`, créditos gastos, `finalizada_em`; é o cache e o medidor) e as funções `radar_reservar_consulta` e `radar_concluir_consulta` (só `service_role` executa), `radar_candidatos` (anúncios vistos, identidade, token, decisão) e `radar_historico` (observações, só de acréscimo). Recria `seguranca_estado()` com as três.

### Para ligar (depende do dono; nada disso foi feito)
(1) aplicar a 048: **feito em 12/11/2026** (conferência `conferencias/048_conferir_producao.sql`; os privilégios extras `REFERENCES`/`TRIGGER`/`TRUNCATE` do `service_role` são padrão do Supabase, ver `conferencias/048_diagnostico_privilegios_service_role.sql`); (2) republicar a função `radar` (o Secret `SERPAPI_API_KEY` já está cadastrado); (3) autorizar o teste integrado final (1 busca + 1 expansão reais, dentro da franquia gratuita) e conferir a cota antes e depois; (4) commit e push. Até lá a aba Descobrir avisa ("precisa da migration 048") e o resto do Radar não muda; a função responde `migracao_pendente`.
**Limites conhecidos (documentação oficial, 11/11/2026):** a validade do `page_token` não é documentada; o custo em créditos de `google_immersive_product` e `google_product` não é informado (assumido 1); Pix, parcelamento, prazo de entrega e condição não são campos documentados das lojas; não se sabe se o link da loja é direto ou redirecionado. Testes: `radar_descoberta_ofertas`, `radar_descoberta`, `radar_descoberta_sql` (PGlite), `radar_orcamento` (concorrência, HTTP 200, falhas após a chamada, incertas; só mocks), `radar_orcamento_sql` (PGlite) e `radar_tela`.

## Custos e dependências
**Custo incorrido nesta etapa: R$ 0,00** (nenhuma chamada de IA, nenhum serviço contratado). Dependem de você: publicar a função `radar`; 044 + republicar a `rac-ia` + ligar a ação (IA, paga por uso); 045 (agendamento); credencial do Mercado Livre; um link de produto da Americanas para validar.
