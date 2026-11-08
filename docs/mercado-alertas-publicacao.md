# Publicar o resumo diário de alertas (função `garmin`)

A publicação da função é uma etapa **separada** do site. O Web Push de alertas só conta como operacional depois de uma **notificação real recebida no aparelho do dono**.

## O que muda na função
- Arquivo novo `supabase/functions/garmin/alertas_preco.ts` e, em `index.ts`, **3 linhas**: um `import` e um passo (`passo("alertas_preco", …)`) entre os avisos da agenda e o backup. Nada do relógio, do push existente, do agendamento nem dos secrets foi alterado.
- Sem migration e sem secret novo. O passo usa o dono que a rotina já identifica e `pushPara(adm, uid, …)`.

## Antes de publicar (conferência local, só leitura)
1. `git log -1 -- supabase/functions/garmin` deve mostrar o commit deste lote; `git diff <commit anterior> -- supabase/functions/garmin/index.ts` deve mostrar só as 3 linhas acima.
2. `node --test tests/mercado_alertas_push.test.mjs` (regras iguais às do site, destinatário só do dono, idempotência, falhas, regressão da rotina).

## Publicar
Com o projeto ligado (`supabase link`, como já foi feito): `supabase functions deploy garmin` (o arquivo novo vai junto, é um import relativo). Ou, no painel: Edge Functions → garmin → colar `index.ts` e adicionar o arquivo `alertas_preco.ts`.

## Conferir
1. `supabase/conferencias/042_conferir_alertas_push.sql` (só leitura), bloco a bloco, depois da rotina das 6h.
2. **Teste real:** com pelo menos um alerta de preço **novo e não lido** de compra dos últimos 7 dias, a notificação "RAC Mercado — Resumo de preços" chega às 6h no aparelho do dono; tocar abre Mercado → Alertas. Sem alertas novos nenhuma notificação é enviada (esperado). Para não esperar o dia seguinte, rodar a rotina uma vez à mão (ela também manda o aviso diário normal e sincroniza a Garmin, como todo dia) só com a sua autorização.
3. Só depois de receber a notificação no aparelho dá para declarar o recurso operacional.

## Desligar
Alertas → Ajustes → desmarcar "Receber o resumo diário por notificação (6h)". Para voltar à função anterior, republicar o `index.ts` sem o `import` e sem a linha do passo.
