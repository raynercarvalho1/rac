# Mapa de contexto por módulo

**Leia somente os arquivos relevantes para a tarefa atual. Consulte dependências adicionais somente quando necessário.**
Comece pela linha do módulo; abra o doc pelo título da seção que interessa, não inteiro. Os testes grandes (`ia`, `navegador`,
`newsletter`, `hoje`) se leem por busca (`describe`/`test` com o nome), nunca inteiros. Conferido em 06/11/2026; se um caminho
mudar, corrija esta tabela.

Base de tudo (só quando a tarefa mexe nela): `index.html` (CSS e telas), `js/app.js` (rotas `ROTA_MODS`, dependências `MOD_DEPS`,
login, Início, `racIA`, `racDica`, botão ↻), `nucleo.js` (funções puras, `NUCLEO.*`), `sw.js` (`VERSAO`), `mercado.js` (cliente do Supabase).
Testes da base: `tests/estrutura.test.mjs`, `tests/nucleo.test.mjs`, `tests/atualizar.test.mjs`, `tests/atualizar_modulos.test.mjs`.

| Módulo (rota) | JavaScript | Documento | Teste | SQL | Edge Function / robô |
|---|---|---|---|---|---|
| Mercado (`#mercado`) | `mercado.js` | — (README) | `mercado.test.mjs` | `schema.sql`, `002` | — |
| Lista (`#lista`) | `js/lista.js` | — | `nucleo.test.mjs` | `009`, `013` | `garmin` (atalhos do iPhone) |
| Eddie, Olivia, Documentos (`#eddie`, `#olivia`, `#documentos`) | `js/familia.js`, `js/bebe.js`, `js/oms.js` | — | `nucleo.test.mjs` | `004`, `005`, `010` | — |
| Veículos (`#veiculos`) | `js/familia.js` | `docs/veiculos.md` | `veiculos.test.mjs` | `006` (usa `registros`) | `rac-ia` (`abastecimento.interpretar`) |
| Saúde e treinos (`#saude`) | `js/saude.js` | — | `fit.test.mjs` | `007` | **`garmin` — intocável sem autorização expressa** |
| MBA, Conexões (`#mba`, `#conexoes`) | `js/mba.js`, `js/conexoes.js` | — | — | `003` (`pessoal`) | `scripts/atualizar_tecdados.py` |
| Carreira, Rede (`#carreira`, `#rede`) | `js/carreira.js`, `js/rede.js` | — | `nucleo.test.mjs` | `003`, `004` | `scripts/atualizar_vagas.py` |
| Sistema, Agenda, Busca (`#sistema`, `#agenda`, `#busca`) | `js/sistema.js` (Agenda e cartão Próxima melhor ação; régua em `nucleo.js`, `NUCLEO.pri*`) | `docs/hoje.md` (Régua de prioridades) | `estrutura.test.mjs`, `nucleo.test.mjs`, `hoje.test.mjs` | `008`, `011`, `012`, `014` | `garmin` (rotina, push, backup) |
| Resumo (`#resumo`) | `js/resumo.js` | — | — | — | — |
| Segurança (`#seguranca`) | `js/seguranca.js` | `docs/seguranca.md` | `central.test.mjs`, `seguranca.test.mjs` | `022` | — |
| Painel (`#painel`) | `js/painel.js` | `docs/painel.md` | `painel.test.mjs` | — | — |
| Alimentação (`#alimentacao`) | `js/alimentacao.js` | `docs/alimentacao.md` | `alimentacao.test.mjs`, `alimentacao_banco.test.mjs` | `024`, `027` | `rac-ia` (`alimentacao.pedido`, DEMO) |
| Compras online (`#compras`) | `js/compras.js`; núcleo multiorigem, Amazon histórico, reembolsos e a regra financeira única `coResumo`/`coRegra` em `nucleo.js` (`co*`, `am*`) | `docs/compras.md` | `compras.test.mjs`, `compras_multiorigem.test.mjs`, `compras_resumo.test.mjs` (regra financeira única, Lote 5.0), `compras_loja.test.mjs` (detalhe por loja/categoria/produto, Lote 5.2), `compras_gravar.test.mjs` (payload e erros de `compras_gravar`, Lote 5.1 etapa 1), `compras_035.test.mjs` (migration 035: texto do SQL sempre; banco real com PGlite; paridade do simulador `_compras_falso.mjs` com o SQL real), `compras_gravar_fluxo.test.mjs` (o `ccGravar`/`ccAnexar` reais contra um banco e cofre de mentira que recusa qualquer gravação direta; foto só como documento, Lote 5.1 etapa 2), `banco_lote3.test.mjs` | `025`, `026`, `030`, `031`, `035` | — |
| Central Fiscal (`#fiscal`: ler XML, conferir e salvar — Lote A e B) | `js/fiscal.js`; regras em `nucleo.js` (`nf*`, restauração fiscal `seg*`); restauração em `js/seguranca.js` | `docs/fiscal.md`, `docs/seguranca.md` | `fiscal.test.mjs`, `fiscal_tela.test.mjs`, `fiscal_validacao.test.mjs`, `fiscal_ia.test.mjs`, `banco_foto_pdf.test.mjs` (PGlite, proposta 037 revisada), `fiscal_gravacao.test.mjs`, `banco_nota_salvar.test.mjs` (PGlite), `banco_lote3.test.mjs` | `032`, `033`, `034` (aplicada em 07/11/2026), `036` (IA fiscal, aplicada), `propostas/037_notas_fiscais_foto_pdf.sql` (**proposta, aplicação autorizada e ainda não executada**) e `propostas/037_conferir_producao.sql` (conferência só leitura) | — |
| Esportes (`#esportes`) | `js/esportes.js`, `js/esportes-central.js` | `docs/esportes.md` | `esportes.test.mjs` | — | `rac-ia` (`esportes.*`, DEMO); `scripts/atualizar_rumores.py` |
| Newsletter (`#newsletter`) | `js/newsletter.js` | `docs/newsletter.md` | `newsletter.test.mjs` | `018`–`021`, `023` | `rac-newsletter`; `rac-ia` (`newsletter.resumo`, REAL); `scripts/atualizar_newsletter.py` |
| RAC Hoje (`#rachoje`) | `js/hoje.js` (coleta, análise e tela) | `docs/hoje.md` | `hoje.test.mjs` | `028`, `029` | `rac-ia` (`hoje.analise`, só REAL) |
| Custos de IA (`#iacustos`) | `js/iacustos.js` (só lê `ia_custos`, `ia_config`, `ia_precos`) | `docs/hoje.md` (Monitor de custos) | `hoje.test.mjs` | `029` | — |
| IA (RAC Intelligence) | `racIA()` em `js/app.js` | `docs/rac-intelligence.md` | `ia.test.mjs` | `015`, `016`, `017` (+ `020`, `028`: ações liberadas) | `rac-ia` (`acoes.ts`, `demo.ts`, `orcamento.ts`, `provedores.ts`…) |
| Notícias, vagas, robôs | — | — | `estrutura.test.mjs` | — | `scripts/*.py`, `.github/workflows/*.yml` |

Banco inteiro: `tests/banco.test.mjs` (lê o banco real; `SEM_REDE=1` pula). Navegador: `tests/navegador.test.mjs` (só no GitHub).
Procedimentos: skills `rac-publicar`, `rac-sql-novo` e `rac-acao-ia` (em `.claude/skills/`, só nesta máquina).
