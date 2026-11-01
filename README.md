# Dia a Dia RAC

Painel pessoal e da casa do Rayner, publicado em <https://raynercarvalho.com.br> (GitHub Pages).
Esportes, perfis no X, vagas e carreira, mercado, lista de compras, Olivia, Eddie, veículos, documentos,
saúde (relógio Garmin), MBA, agenda, resumo, Newsletter, notificações no celular, a Central de Segurança e o Painel de Produtividade.

## Como funciona

- **Site estático, sem build.** `index.html` (CSS e telas) + `nucleo.js` (funções puras, testadas) + `mercado.js`
  (Mercado e o cliente do Supabase) + `js/app.js` (rotas `#seção/sub`, login, Início). Os outros módulos de `js/`
  são carregados quando a seção abre (`ROTA_MODS`, `MOD_DEPS` e `precisa()` em `js/app.js`).
- **Os módulos conversam por nomes globais** (sem import/export). Por isso um teste proíbe nome repetido entre arquivos.
- **Dados no Supabase** (Postgres + Auth + Storage). O site usa só a chave pública; quem protege os dados é o RLS
  (cada linha é do dono; a casa compartilhada usa `dono_da_casa()`).
- **Servidor:** Edge Functions. `garmin` (Garmin, rotina diária, push, atalhos do iPhone), `rac-ia` (IA, abaixo) e
  `rac-newsletter` (avisos da Newsletter, chamada só pelo agendamento do banco). Os segredos ficam em Edge Functions →
  Secrets e no Vault, nunca no repositório.
- **Robôs** (`scripts/*.py`, só biblioteca padrão) rodam no GitHub Actions e gravam `noticias.json`, `tecdados.json`,
  `rumores.json`, `newsletter.json` (Newsletter: 52 fontes RSS oficiais, [docs/newsletter.md](docs/newsletter.md)) e `vagas.json`.
- **PWA:** `manifest.webmanifest` + `sw.js` (rede primeiro para o site, cópia guardada para os JSON, push).

## RAC Intelligence (IA)

Camada única de IA: `supabase/functions/rac-ia` (Claude, da Anthropic), usada pelo site só por `racIA()` em `js/app.js`.
Começa em DEMO, com orçamento travado no banco (`supabase/015_ia.sql`) e confirmação humana antes de salvar.
Tudo em [docs/rac-intelligence.md](docs/rac-intelligence.md). A função `rac-ia` é publicada pela CLI, não pelo painel.

## Central de Segurança

Página `#seguranca` (`js/seguranca.js`): proteção da conta, verificação em duas etapas (TOTP do Supabase Auth, opcional),
backup em JSON com assinatura por tabela, histórico, restauração com prévia e confirmação (nada é sobrescrito sem pedir) e a
auditoria das permissões. O `supabase/022_seguranca.sql` faz o banco exigir o código de quem ativou a 2ª etapa.
Tudo em [docs/seguranca.md](docs/seguranca.md).

## Painel de Produtividade

Página `#painel` (`js/painel.js`): a evolução mês a mês de gastos, treinos, estudos, tarefas e competências, com a fonte e o período
de cada número, só com dados que já existem no site. Tudo em [docs/painel.md](docs/painel.md).

## Central Esportiva

Página `#esportes` (`js/esportes.js` + `js/esportes-central.js`): MLB com os Dodgers em destaque, Lakers, Packers, futebol e o giro das outras
modalidades, com classificação, líderes, estatísticas, desempenho recente e comparações, e a análise com IA sobre um pacote de fatos
(ações `esportes.analise` e `esportes.giro`, só DEMO nesta etapa). Tudo em [docs/esportes.md](docs/esportes.md).

## Veículos e abastecimentos

Página `#veiculos` (`js/familia.js`): ⛽ Novo abastecimento pelas fotos do painel e da bomba, conferência antes de salvar, histórico,
consumo de tanque cheio a tanque cheio, custo por km e os quadros de combustível no Painel. Usa a tabela `registros` (sem tabela
nova); as contas ficam em `NUCLEO.ab*`. Tudo em [docs/veiculos.md](docs/veiculos.md).

## Publicar

1. `node --test tests/*.test.mjs` (tem que passar tudo).
2. Mudar juntas `VERSAO` em `sw.js` e `MOD_VERSAO` em `js/app.js` (o teste confere).
3. Se tiver SQL novo: rodar no Supabase (SQL Editor) **antes** de publicar o site.
4. Se mexeu numa Edge Function: publicar a função **antes** do site (garmin: Edge Functions → garmin → Code → Deploy;
   `rac-ia` e `rac-newsletter`: pela CLI, como em docs/rac-intelligence.md e docs/newsletter.md).
5. `git push` no `main`. O Pages publica em cerca de 1 minuto; a página Sistema mostra a versão em uso no aparelho.

## Banco (pasta `supabase/`)

`schema.sql` e depois `002` a `022`, em ordem, no SQL Editor. Cada arquivo pode rodar de novo sem estragar nada.
Um arquivo que começa com `-- status: pendente` ainda não foi rodado (hoje nenhum: o 022 foi aplicado em 31/10/2026).

## Testes (`tests/`)

| Arquivo | O que confere |
|---|---|
| `nucleo.test.mjs`, `mercado.test.mjs`, `fit.test.mjs` | funções puras (leitura de notas, abastecimento, arquivos .FIT…) |
| `estrutura.test.mjs` | nomes repetidos, sintaxe de todos os arquivos, versões iguais, service worker, dados pessoais, padrão dos gráficos |
| `seguranca.test.mjs` | sem login nada é lido nem gravado; a função recusa quem não entrou |
| `banco.test.mjs` | o banco real tem as tabelas, views e funções que os arquivos SQL criam |
| `ia.test.mjs` | RAC Intelligence sem rede e sem custo: orçamento, reserva, concorrência, DEMO, contrato, segurança do SQL |
| `newsletter.test.mjs` | Newsletter sem rede e sem custo: coletor com feeds fictícios, categorias, grupos, relevância, edição, IA em DEMO, avisos, SQL |
| `painel.test.mjs` | Painel de Produtividade sem rede: rotas, só leitura (exceto o orçamento), sem IA, fontes e vazios |
| `central.test.mjs` | Central de Segurança sem rede: SQL 022, regras da restauração, código no login, rotas |
| `esportes.test.mjs` | Central Esportiva sem rede: temporada, desfecho, forma, pacote de fatos, ações `esportes.*` só em DEMO, sem dado escrito à mão |
| `navegador.test.mjs` | abre o site num navegador de verdade (só no GitHub, com Playwright) e procura erros |

`SEM_REDE=1` pula os testes que acessam o Supabase. Os testes rodam a cada publicação e toda segunda (`.github/workflows/testes.yml`).

## O que nunca vai para este repositório (ele é público)

Senhas, chaves secretas, tokens, CPF, documentos, endereço, telefone, placas, fotos, exames e listas de amigos.
Esses dados ficam no Supabase (com login) ou em `privado/` (ignorado pelo git).
