# Radar de Preços: fontes externas (auditoria de 09/11/2026)

Conferido só com leituras públicas (um `GET` por endereço, sem login, sem burlar nada). Resultado:

| Fonte | O que encontrei | Decisão |
|---|---|---|
| API do Mercado Livre (`api.mercadolibre.com`) | busca e itens respondem 403 (`PolicyAgent`) e produtos 401 ("authorization value not present"): exigem token OAuth de um aplicativo | **Pendente de credencial.** Coletor listado como `exige_credencial`; nada é simulado |
| Site do Mercado Livre | `robots.txt` bloqueia agentes de IA (ClaudeBot, GPTBot…) | Nenhuma leitura de páginas do site |
| KaBuM, Pichau, Americanas | `robots.txt` abre as páginas de produto (com restrições de carrinho, conta, busca e `?`) | Candidatas ao piloto genérico; **a validação em página real fica para o dono, depois da publicação** (não consegui uma URL de produto estável para testar daqui) |
| Fast Shop | respondeu 503 (Akamai, anti-robô) a uma requisição automática | Fora: não se contorna |
| Magalu, Casas Bahia, Terabyte | `robots.txt` responde 403 | Fora: sem conseguir conferir o robots, não se lê |
| Amazon | `robots.txt` restritivo e termos que proíbem coleta automática | Fora |

## O que foi construído (piloto)
Um coletor genérico, `pagina_publica` (`supabase/functions/radar/`): lê **uma página de produto** de uma loja que o dono cadastrou com domínio e marcou "coleta liberada", depois de conferir o `robots.txt`, e extrai o que a página declara em dados estruturados (schema.org JSON-LD, com Open Graph como apoio). Não é cobertura da internet: só lojas cadastradas, páginas permitidas e que publicam esses dados.

Travas (testadas em `tests/radar_servidor.test.mjs`):
- só `https`, porta 443, sem usuário/senha, sem IP nem nome interno; **o domínio precisa ser o de uma loja do dono**;
- IP resolvido barrado se for privado, de loopback, link-local (metadados) ou reservado; cada redirecionamento (máximo 3) é revalidado e resolvido de novo;
- 12 s de tempo, 1,5 MB por página, só `text/html`; `robots.txt` obrigatório (403, 5xx ou ilegível = não lê);
- 401/403/429/503, captcha ou verificação humana = **para** (nunca tenta contornar), e três rodadas seguidas com falha pausam a loja;
- um pedido por vez por loja, com 5 s de intervalo; no máximo 20 ofertas por rodada; intervalo mínimo de 12 h por oferta;
- User-Agent próprio (`RAC-Radar`), que se identifica e respeita o `robots.txt`;
- limite conhecido: entre resolver o nome e o `fetch` há uma janela mínima de DNS rebinding; por isso a lista de domínios é obrigatória.

## O que a coleta grava
Só o **preço anunciado** e a disponibilidade, na mesma modalidade/meio da última observação do dono (só à vista). O frete depende do CEP: a observação entra com frete `desconhecido` (**sem preço final**, fora de ranking e de oportunidade) e o dono confirma o frete numa linha de correção (histórico só de acréscimo). A página nunca decide à vista × parcelado nem equivalência. Duplicidade: o índice único do banco e a regra "mesmo preço e disponibilidade em menos de 24 h não grava".

## Pendências desta etapa (dependem do dono)
1. Publicar a função `radar` (`supabase/functions/radar/`, pela CLI, como a `rac-ia`).
2. (Opcional) agendamento da rodada automática: migration própria, como a 019 da Newsletter. **Não escrita nem aplicada.**
3. Mercado Livre: criar um aplicativo no portal de desenvolvedores do Mercado Livre e fornecer o token; só então se implementa o coletor `mercadolivre_api`.
