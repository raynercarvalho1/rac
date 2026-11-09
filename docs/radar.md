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
| Agendamento | proposta `supabase/propostas/045_radar_rotina.sql` (não aplicada) |
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
- **Para ligar:** publicar a função `radar`; ter as notificações ativas em Sistema (chaves e aparelho inscrito); aplicar `supabase/propostas/045_radar_rotina.sql` (agenda 6h20 e 18h20 de Brasília). **Rollback:** `select cron.unschedule('radar-rotina');` desliga tudo; a função pode ser despublicada; nenhuma tabela nova.
- **Isolamento:** a rotina só trata donos que **não** estão em `membros`; a casa (Fernanda) nunca recebe; o site recusa membro com 403.

## Publicação da função radar (Lote 4) — roteiro para o dono
O `.claude/settings.json` nega `supabase functions deploy`, `supabase db`/`migration`, `psql` e a API de gerenciamento, e a CLI nem está instalada na máquina do Claude: a publicação e o SQL são feitos por você (ou pelo painel). Verificações já feitas no código (Lote 4): a função não importa de outra função (cópia própria de `chaves.ts`); DNS com fallback seguro (`dns.ts`); rodada com orçamento de 90 s (a Edge Function tem limite de duração); logs só com o nome do erro; recusa anônimo (401), membro (403) e corpo grande (413).
1. **Publicar só a `radar`** (projeto `hofnhbxnfebfnncwxrds`; **`--no-verify-jwt` é obrigatório**: a rotina chama sem login, e a própria função confere o login do dono ou a senha da rotina):
   `npx supabase@2.121.0 functions deploy radar --project-ref hofnhbxnfebfnncwxrds --use-api --no-verify-jwt`
2. **Conferir sem login** (não dispara coleta): um POST qualquer em `https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/radar` deve responder **401** `nao_autenticado`; hoje responde **404** (não publicada).
3. **Só depois**, no SQL Editor: `show cron.timezone;` (deve ser GMT/UTC) e então o conteúdo de `supabase/propostas/045_radar_rotina.sql` (agenda **6h20 e 18h20 de Brasília** = 9h20 e 21h20 UTC; um único job `radar-rotina`; só agendamento, nenhuma tabela é tocada).
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

## Custos e dependências
**Custo incorrido nesta etapa: R$ 0,00** (nenhuma chamada de IA, nenhum serviço contratado). Dependem de você: publicar a função `radar`; 044 + republicar a `rac-ia` + ligar a ação (IA, paga por uso); 045 (agendamento); credencial do Mercado Livre; um link de produto da Americanas para validar.
