# Radar de Preços: fontes externas (inventário de 09/11/2026)

Conferido com o **próprio código do Radar** (`ssrf.ts` + `extrair.ts`: robots.txt, SSRF, limites), um pedido por endereço, com 5 s de intervalo, sem login e sem contornar nada. O inventário em código está em
`supabase/functions/radar/fontes.ts` (a tela repete a lista de domínios barrados, com teste de igualdade). **Coleta operacional só existe depois de publicar a função `radar`** (ainda não publicada): o que está
abaixo como "funciona" significa "a leitura de uma página real deu certo neste teste", não "já está coletando sozinho".

| Fonte | Classe | Método | Credencial | Status | Evidência (09/11/2026) |
|---|---|---|---|---|---|
| **KaBuM** | dados estruturados públicos | página de produto, JSON-LD | não | **funciona** | 2 páginas de produto lidas: nome, marca, preço em BRL, disponibilidade. Sem GTIN, modelo ou vendedor |
| **Fast Shop** | dados estruturados públicos | página de produto (`site.fastshop.com.br/.../p`), JSON-LD | não | **funciona** | 2 páginas lidas: nome, marca, **GTIN válido**, preço em BRL, disponibilidade. Uma tentativa anterior do mesmo dia levou 503 do anti-robô: 503 = parar |
| **Americanas** | sem evidência | página de produto (esperado) | não | **sem teste de produto** | home e categorias abrem, mas sem preço de produto nos dados estruturados; não achei URL de produto para testar |
| **Pichau** | bloqueada | — | — | bloqueada | home respondeu 403 ao leitor identificado |
| **Magazine Luiza** | bloqueada | — | — | bloqueada | `robots.txt` respondeu 403: sem conferir as regras, não se lê |
| **Casas Bahia** | bloqueada | — | — | bloqueada | `robots.txt` respondeu 403 |
| **Terabyte** | bloqueada | — | — | bloqueada | `robots.txt` respondeu 403 |
| **Mercado Livre** | API oficial com credencial | `GET /items/{id}` com `Authorization: Bearer` | **sim** | **depende de credencial** | sem token, `/items`, `/sites/MLB/search` e `/products/search` respondem 403 (PolicyAgent); o `robots.txt` do site barra agentes de IA; a documentação oficial exige token |
| **Amazon** | não permitida | — | API de afiliados (credencial) | não testada | não foi testada nesta auditoria; termos e `robots.txt` restringem coleta automática (auditoria anterior) |
| Outras (feeds e programas de afiliados) | API/feed com credencial | — | sim | não avaliadas | exigem cadastro e aprovação do dono; nada foi contratado |

### Limites conhecidos e frequência
- KaBuM e Fast Shop: sem limite publicado; o Radar usa 1 pedido por vez por loja, 5 s de intervalo, no máximo 20 ofertas por rodada e **12 h** de intervalo mínimo por oferta (duas rodadas por dia). Três rodadas seguidas com falha pausam a loja.
- Mercado Livre (documentação oficial): token de 6 h, refresh token de uso único e **rotativo**, limite por aplicativo (ex.: 18.000 requisições/hora no exemplo da documentação).
- **O preço do JSON-LD pode não ser o preço Pix/à vista da vitrine.** Por isso a coleta só grava o preço anunciado, na mesma modalidade/meio da última observação do dono (só à vista), e deixa **frete desconhecido** (sem preço final).

## Travas do coletor genérico (testadas em `tests/radar_servidor.test.mjs` e `radar_lote3.test.mjs`)
- só `https`, porta 443, sem usuário/senha, sem IP nem nome interno; **o domínio precisa ser o de uma loja do dono**, com "coleta liberada" marcada por ele;
- fonte classificada como barrada (tabela acima) **nunca entra na rodada**, mesmo com "coleta liberada": o servidor pula com o motivo `fonte_barrada` e a tela recusa liberar;
- IP resolvido barrado se for privado/loopback/link-local/reservado; cada redirecionamento (máximo 3) é revalidado e resolvido de novo;
- 12 s, 1,5 MB, só `text/html`; `robots.txt` obrigatório (403, 5xx ou ilegível = não lê); 401/403/429/503, captcha ou verificação humana = **para**, sem contornar;
- User-Agent próprio (`RAC-Radar`), que se identifica;
- limite conhecido: entre resolver o nome e o `fetch` há uma janela mínima de DNS rebinding; a lista de domínios do dono mitiga.

## O que cada observação coletada preserva
Loja e URL exata da oferta, vendedor (o cadastrado na oferta; a coleta não troca), preço anunciado, modalidade e meio (herdados da última observação do dono), parcelas só quando o dono registrou, **frete desconhecido**,
disponibilidade quando a página declara, evidência (a URL), data e hora do servidor, e a coleta de origem (`radar_coletas`). Marca, modelo e GTIN vão para a **sugestão de equivalência**, nunca para a confirmação.
Nada é preenchido por inferência; sem preço em BRL a página não gera observação; observação repetida em 24 h não grava; histórico retroativo não existe.

## SerpApi / Google Shopping (descoberta; PoC de 11/11/2026, conta gratuita)
Não é loja: é um provedor que devolve os anúncios que o Google Shopping mostra. Servidor: `supabase/functions/radar/serpapi.ts` (adaptador), `descoberta.ts` e `ofertas.ts`; **implementado, não publicado**; nenhuma chamada é feita pelo código até o teste integrado ser autorizado. Detalhes e regras: `docs/radar.md`, "Descoberta de ofertas pelo SerpApi".
- Engines usados (documentação oficial lida em 11/11/2026): `google_shopping` (candidatos; `gl=br`, `hl=pt-br`), `google_immersive_product` (lojas por `page_token`; `more_stores` até 13) e `google_product` (`product_id` ou token; variantes e `price_insights`).
- Plano gratuito: 250 buscas/mês e 50/hora; só busca bem-sucedida conta; cache (1 h, parâmetros idênticos), erro e falha não contam. Custo em créditos dos dois engines de loja: não documentado (provável 1 cada).
- Como o RAC contabiliza cada resposta (sem inventar regra de cobrança; o que o provedor não documenta fica **incerto** e retém o crédito): HTTP 200 com resultados **conta**; HTTP 200 **vazio** (inclusive "Google hasn't returned any results", e qualquer `search_metadata.status = Success` com a chave `error` preenchida) é busca bem-sucedida e também **conta** (documentação: "empty result sets count as 1 search"; Success pode vir vazio), e vira cache; erro definitivo documentado como não cobrado (401/403 chave, 429 limite, `search_metadata.status = Error`) **não conta**; outros 4xx (sem respaldo documental de gratuidade), 5xx, HTTP 200 com erro sem `search_metadata`, status `Processing`, corpo ilegível, timeout e falha de rede são **incertos** e retêm o crédito (não há reconciliação: só a virada do dia ou do mês devolve folga). Detalhes e a tabela completa: `docs/radar.md`.
- Na PoC (1 busca real): 34 anúncios, 9 do CH-02 (7 de 250 g, 1 provável 454 g, 1 kit 2 × 454 g); nenhum link direto de loja nem entrega; as 7 lojas confirmadas pela leitura direta não apareceram para o 454 g. Conclusão: serve para **descobrir candidatos**; o preço por loja vem da expansão e o preço confirmado, da página da loja quando a coleta é permitida.
- Termos: o SerpApi é um terceiro que lê o Google (não é API oficial do Google); o risco contratual é dele, mas pesa na decisão do dono.

## Mercado Livre: como destravar (sem enviar nada pelo chat)
1. No portal de desenvolvedores do Mercado Livre, crie um aplicativo (gratuito) e anote o **App ID** e a **Secret Key**.
2. Guarde os dois só em **Supabase → Edge Functions → Secrets** (por exemplo `RADAR_ML_CLIENT_ID` e `RADAR_ML_CLIENT_SECRET`) ou no Vault. **Nunca** no site, no repositório, no chat ou em arquivo.
3. O ciclo de token (autorização uma vez, access token de 6 h, refresh rotativo guardado em tabela privada só do servidor) **ainda precisa ser construído** e depende dessa credencial. `mercadolivre.ts` já converte a resposta de `/items/{id}` em observação (testado só com dados fictícios).
Enquanto isso, ofertas do Mercado Livre continuam sendo registradas à mão.

## Pendências desta frente (dependem do dono)
1. Publicar a função `radar` (CLI, como a `rac-ia`). Sem isso, nada é coletado e o botão "Ler da página" só avisa.
2. Aplicar `supabase/045_radar_rotina.sql` (já aplicada) (agendamento 6h20 e 18h20) **depois** de publicar.
3. Fornecer um link real de produto da Americanas (para validar) e, se quiser, criar o aplicativo do Mercado Livre.
