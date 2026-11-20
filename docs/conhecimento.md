# RAC Knowledge

Memória técnica permanente do projeto, dentro do próprio site (`#conhecimento`, só do dono). Guarda o que um agente de IA (ou o próprio dono, meses depois) precisa saber
para **não repetir erros, não desfazer decisões aprovadas e não executar procedimentos já identificados como errados**.

Criado em 20/11/2026. Migration `supabase/062_conhecimento.sql` (**aplicada em produção em 20/11/2026**, conferida), tela `js/conhecimento.js`, regras puras `NUCLEO.kn*` (`nucleo.js`),
ferramenta dos agentes `scripts/conhecimento.mjs`, registros iniciais em `docs/conhecimento/registros/`, testes `tests/conhecimento_*.test.mjs`.

## O que existe

Seis tipos de registro: **regra** (vale sempre), **decisão** (e por quê), **erro** (causa-raiz, solução, prevenção), **procedimento**, **estado** do projeto e **diário** (lotes).
Cada registro tem título, conteúdo, categoria, tags, estado (`ativo`, `resolvido`, `substituido`, `arquivado`), origem/referência técnica (arquivo, PR, commit, migration ou lote),
data, relações com outros registros e histórico de versões. Campos extras por tipo: `motivo` (decisão); `causa`, `solucao`, `prevencao` (erro).

## Arquitetura (e por que não há estrutura duplicada)

- **Supabase** guarda e serve o celular (duas tabelas novas: `conhecimento` e `conhecimento_historico`). Não existia tabela adequada: `erros` e `rotina_log` são logs técnicos de
  execução (`docs/seguranca.md`), sem tipo, tags, relações nem versões; `pessoal` é chave-valor e não pesquisável por registro. Nada existente foi alterado.
- **GitHub** continua a fonte oficial do código, das migrations, dos testes e da documentação técnica. Os registros que os agentes escrevem moram em
  `docs/conhecimento/registros/<tipo>/<nome>.md` (Markdown com cabeçalho), com o índice `docs/conhecimento/indice.json` (gerado; o site importa dele).
- **Ponte** entre os dois: o agente **não tem acesso ao banco** (sem credencial; `psql`, CLI do Supabase e API de gerenciamento são negados em `.claude/settings.json`) e **isso não
  mudou**. Por isso o caminho do agente é por Git: lê e escreve arquivos, e o dono importa para o banco com um toque. Nenhuma Edge Function nova, nenhuma chave no navegador.

```
Agente (Claude Code)  ──lê/escreve .md──▶  repositório (PR, revisão)  ──publicado com o site──▶  site (#conhecimento)
                                                                                                      │ "Sincronizar" (toque do dono, MFA)
celular (dono) ◀────── lê, busca, edita, registra erro ──────────────────────────────────────────── banco (RLS + MFA)
        └── "Copiar para o agente" ──cola no chat──▶ agente salva em docs/conhecimento ──▶ PR
```

## Modelo de dados (062)

`conhecimento`: `id`, `dono`, `tipo`, `titulo` (3–200), `conteudo` (≤20.000), `motivo`/`causa`/`solucao`/`prevencao` (≤4.000), `categoria`, `tags[]` (≤12, minúsculas, ≤40 letras),
`estado`, `origem`, `relacionados uuid[]` (≤30), `data_ref`, `ref_externa` (`tipo/nome`, única por dono), `origem_hash` (sha256 do arquivo importado), `editado_no_site`, `versao`,
`criado_em`, `atualizado_em`. `conhecimento_historico`: `conhecimento_id`, `dono`, `versao`, `operacao` (`atualizacao`/`exclusao`), `snapshot jsonb`, `criado_em`
(sem chave estrangeira de propósito: sobrevive à exclusão).

O **gatilho** `conhecimento_guarda` (security definer, `search_path` vazio) faz, no banco e não no site: guarda a versão anterior no histórico a cada alteração; controla `versao` e as datas;
impede trocar o dono; normaliza as tags; marca `editado_no_site` quando a alteração não veio de uma importação; e **recusa** texto que pareça segredo (chave da Anthropic, do Supabase, do
GitHub, JWT, chave privada, CPF), porque o registro vira público ao ser exportado para o repositório. O detector tem a mesma lista no núcleo (`NUCLEO.knSegredo`), para avisar antes.

## Segurança

- RLS em ambas as tabelas: política `so o dono` (a casa, Fernanda, fica de fora, como no Inbox) **e** a trava restritiva `mfa` (`rac_aal_ok()`, 022).
- `anon` e `service_role` sem nenhum privilégio. O site (`authenticated`) tem `select, insert, update` em `conhecimento` e só `select` no histórico: o histórico não se burla e o
  registro **não se apaga pelo site** (arquiva-se; o botão não existe). Apagar só por fora do site, e mesmo assim o gatilho guarda o registro no histórico.
- Funções `conhecimento_guarda` e `conhecimento_segredo` fechadas para todos os papéis do site.
- Catálogo da auditoria (`seguranca_catalogo`, 050) e backup (`NUCLEO.SEG_TABELAS`, só exporta: restaurar apagaria versões) incluem as duas tabelas. Teste com o banco real: `tests/seguranca.test.mjs`.
- Um usuário autenticado que não seja o dono só enxergaria o que ele mesmo criasse (nunca o do dono); no uso real só existem o dono e a casa.
- **Não registre credenciais nem dados pessoais.** Registre o fato ("a chave X expirou"), nunca o valor.

## Usando pelo celular (iPhone)

Menu → Sistema → **RAC Knowledge** (`#conhecimento`). A busca fica no topo; abaixo, os tipos (Todos, Regras, Decisões, Erros e soluções, Procedimentos, Estado, Diário) e os filtros de categoria,
tag e estado (padrão: vigentes = ativos e resolvidos). Toque num registro para ler. Botões:

- **+ Novo registro**: tipo, título, conteúdo, categoria, tags, estado, origem, relacionados. Os campos de motivo (decisão) e causa/solução/prevenção (erro) aparecem só no tipo certo.
- **⚡ Erro e solução**: registro rápido, 6 campos: título, o que aconteceu, causa, solução, prevenção e tags. Com solução, nasce "resolvido".
- **Editar**, **Histórico** (cada versão anterior, o que mudou, **Restaurar** cria versão nova), **Arquivar/Reativar**, **Copiar para o agente** (o `.md` do registro).
- **⇄ Repositório**: importa do repositório e prepara o que o agente ainda não conhece (abaixo). **Copiar resumo para o agente**: regras, estado, decisões e erros vigentes, para colar num chat.

### Importar do repositório (⇄ Repositório)

Mostra o plano antes de gravar: **novos**, **atualizações** (o arquivo mudou e você não editou aqui), **a vincular** (já existe aqui, sem arquivo, com o mesmo tipo e título) e **em conflito**
(você editou aqui e o arquivo também mudou: nunca é sobrescrito sozinho; escolha "Usar o arquivo do repositório" por registro). Só grava ao tocar em Importar. O site lê
`docs/conhecimento/indice.json` do próprio site (publicado com cada versão), então o conhecimento novo chega depois do merge e da publicação.

**Só no site ou alterados aqui**: registros que o repositório não tem. "Copiar N para o agente" gera um texto com um bloco por registro e o caminho do arquivo; cole no chat do Claude Code, que
salva, roda o índice e faz o commit do lote. Depois do merge e da publicação, eles passam a constar como iguais.

## Como o Claude Code consulta e grava (protocolo obrigatório, também no `CLAUDE.md`)

```
node scripts/conhecimento.mjs antes "o que vou fazer"      regras ativas + estado + decisões, erros e procedimentos relacionados
node scripts/conhecimento.mjs buscar termos [--tipo erro] [--tag x] [--categoria y] [--estado ativo]
node scripts/conhecimento.mjs ver erro/nome-do-registro
node scripts/conhecimento.mjs novo --tipo erro --titulo "..." --causa "..." --solucao "..." --prevencao "..." [--tags a,b] [--origem "PR #1"] [--relacionados regra/x]
node scripts/conhecimento.mjs indice                       refaz o índice depois de editar um .md à mão
node scripts/conhecimento.mjs verificar                    confere arquivos e índice (o teste do CI faz o mesmo)
```

**Antes de implementar:** `antes "<tarefa>"` (regras, estado, decisões, erros e procedimentos aplicáveis). Sem o script: Grep/Read em `docs/conhecimento/registros/`.
**Depois:** registrar só o que é novo e reutilizável (decisão nova; erro relevante com causa-raiz e prevenção; procedimento que mudou; estado atualizado; resultado de testes, commits, PRs
e publicação como diário), rodar `indice` e incluir no commit do lote. Não registrar cada detalhe trivial: o registro precisa ser objetivo e pesquisável. Registro que muda de estado
(erro `resolvido`, decisão `substituido`) é editado, não duplicado; decisão que substitui outra cita a antiga em `relacionados`.

Formato do arquivo (`docs/conhecimento/registros/<tipo>/<nome-em-minusculas>.md`, o `<tipo>` da pasta é o do cabeçalho):

```
---
titulo: Frase curta e pesquisável
tipo: erro            (regra | decisao | erro | procedimento | estado | diario)
categoria: banco
tags: migration, rls
estado: resolvido     (ativo | resolvido | substituido | arquivado)
origem: PR #54, supabase/062_conhecimento.sql
data: 2026-11-20
relacionados: regra/tabela-pessoal-nova, decisao/outra
---

Conteúdo.

## Motivo        (decisão)
## Causa         (erro)
## Solução       (erro)
## Prevenção     (erro)
```

O `.claude/settings.json` libera, sem pedir a cada vez, só estes subcomandos: `antes`, `buscar`, `listar`, `ver`, `novo`, `indice` e `verificar` (decisão do dono em 20/11/2026; `tests/permissoes.test.mjs` cobre). O script só lê e escreve arquivos em `docs/conhecimento/` (o nome do arquivo novo não aceita barra nem `..`). Qualquer outro comando ou argumento continua pedindo aprovação.

**Lembrete e conferência.** O `CLAUDE.md` começa com "Antes de qualquer trabalho": consultar (`antes`) é a primeira ação e registrar + `verificar` a última, e o relatório final diz "RAC Knowledge: registrado …" ou "nada novo, porque …". O que o CI fiscaliza é a forma (registros válidos, índice em dia, lembrete e permissão presentes); decidir **o que** vale registrar é do agente e é conferido na revisão do PR, não por automação.

## Aplicar em produção (já feito em 20/11/2026; o roteiro serve para outro ambiente)

1. SQL Editor: `supabase/062_conhecimento.sql` (reexecutável; roda depois da 022). Se a 050 (catálogo) ainda não foi aplicada, ele só avisa; rode a 062 de novo depois da 050.
2. Conferir: `supabase/conferencias/062_conferir_producao.sql` (só leitura; tudo "ok") e, se quiser, `tests/seguranca.test.mjs` (sem login não lê as duas tabelas).
3. Trocar o cabeçalho da 062 de `-- status: pendente` para aplicada (data) quando confirmar.
4. Site publicado pelo fluxo normal; abrir RAC Knowledge → ⇄ Repositório → Importar.
Sem a 062 a tela abre e diz o que falta; nada mais do site é afetado.

## Testes

`tests/conhecimento_nucleo.test.mjs` (regras puras, arquivos do repositório, índice, protocolo no `CLAUDE.md`), `tests/conhecimento_sql.test.mjs` (PGlite: RLS, mfa, histórico, gatilho,
segredos, privilégios), `tests/conhecimento_tela.test.mjs` (a tela real num ambiente falso, inclusive a importação). Mais: `tests/rotas.test.mjs`, `tests/seguranca*.test.mjs`.
