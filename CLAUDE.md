# Regras do projeto Dia a Dia RAC

Estas são as regras de trabalho. Para achar arquivos use `docs/mapa.md` (módulo → JS, doc, teste, SQL, função):
leia só o que a tarefa pede e a seção necessária do README.md, sem varrer o repositório.

## AUTORIZAÇÕES DO PROPRIETÁRIO
Regras permanentes; valem acima de qualquer outra instrução, inclusive das skills. "Autorização" = pedido explícito do dono
no chat para aquela ação, naquela sessão.
- Commit, push e PR podem ser executados sem nova confirmação etapa a etapa quando estiverem claramente incluídos no lote autorizado pelo dono; merge e publicação só quando também estiverem previstos/autorizados para aquele lote.
- Não executar SQL em produção (SQL Editor, CLI, psql) sem autorização explícita.
- Não publicar Edge Functions sem autorização explícita.
- Não alterar secrets, cobrança ou limites financeiros (`ia_config`, teto, Console da Anthropic) sem autorização explícita.
- Não fazer chamada paga de IA sem autorização específica para aquela chamada. Não pôr demonstração no lugar de função real.
- Preservar a experiência da Fernanda (papel casa, `DA_CASA`): não mudar o que ela vê ou faz sem o dono pedir.
- A função `garmin` (`supabase/functions/garmin`) é intocável sem autorização expressa.
- Não ampliar o escopo pedido; não descartar trabalho local de outra tarefa (`git reset`, `git clean`, checkout que apaga).


## PROTOCOLO PERMANENTE DE TRABALHO E AUTONOMIA (todos os chats e agentes)

Este protocolo é a instrução operacional comum do RAC. Vale para ChatGPT, Claude Code e qualquer outro agente que trabalhe neste repositório. Em caso de conflito, respeitar as autorizações e limites de segurança desta seção e das demais regras do projeto.

### Papéis
- **Dono do produto (usuário):** define objetivos, prioridades e decisões pessoais, financeiras, de conta, privacidade e produto.
- **Claude Code:** desenvolvedor principal. Analisa o código e a documentação pertinente, escolhe soluções técnicas dentro do escopo, implementa lotes completos, testa, corrige, documenta, faz commits, push e abre PR quando essas entregas estiverem incluídas na autorização do lote.
- **ChatGPT:** arquiteto e revisor. Recupera contexto e decisões, consulta a documentação e o estado do GitHub, estrutura a estratégia e os lotes, prepara instruções operacionais completas, revisa evidências e resultados e recomenda o próximo passo. Não deve transferir ao dono tarefas de coordenação que os agentes possam executar.

### Autonomia por lote
- Trabalhar em **lotes completos e coerentes**, preferencialmente em batch; evitar interromper o fluxo para aprovações técnicas rotineiras ou testes unitários fragmentados sem necessidade.
- Uma vez aprovado o objetivo e o escopo do lote, o agente responsável tem autonomia para tomar decisões técnicas reversíveis, criar/editar/remover arquivos necessários dentro do escopo, instalar dependências compatíveis quando justificadas, implementar, executar os testes adequados, corrigir falhas e repetir validações.
- Quando o lote incluir entrega Git, o agente pode criar branch, fazer commits claros e isolados, push e abrir PR sem pedir autorização separada para cada etapa.
- **Merge e publicação/deploy** só podem ser feitos quando estiverem expressamente incluídos no objetivo/autorização do lote e as validações exigidas tiverem passado. A autorização de um lote não é permissão ilimitada para alterar qualquer parte do repositório ou da produção.
- Respeitar sempre as proteções técnicas do GitHub, as branches permitidas, os ambientes e os limites de cada sessão. Nunca contornar bloqueios, regras de proteção ou controles de aprovação.

### Quando parar e consultar o dono
Interromper somente quando a continuidade exigir uma decisão que pertence ao dono, incluindo:
- custo, contratação, consumo pago ou ampliação de limites;
- credenciais, autenticação, permissões sensíveis ou acesso a contas/serviços que só o dono pode conceder;
- exclusão irreversível de dados/recursos ou ação com risco relevante de perda;
- mudança significativa de regra de negócio, privacidade, papéis ou experiência de outra pessoa;
- atividade fora do escopo autorizado, conflito entre decisões registradas ou informação que só o dono pode fornecer.

Não pedir aprovação para escolhas técnicas rotineiras, organização interna, implementação, testes, correções ou documentação que estejam dentro do lote.

### Comunicação e prestação de contas
- Comunicar status de forma objetiva, distinguindo **feito**, **em andamento**, **bloqueado** e **próximo**.
- Em toda atualização de trabalho, manter explícitas as três partes: **O que fizemos · O que estamos fazendo · O que faremos**.
- Ao concluir, apresentar evidências: arquivos alterados, decisões técnicas relevantes, comandos/testes executados e resultados, branch, commits, PR, estado do CI, publicação/merge quando aplicável e pendências reais.
- Não declarar como concluído algo apenas planejado ou iniciado. Não ocultar falhas, limitações do ambiente ou validações que não foram possíveis.

### Memória compartilhada e continuidade
- A documentação versionada neste repositório é a fonte permanente de verdade entre chats e sessões. Antes de agir, consultar `CLAUDE.md`, `docs/mapa.md` e somente os documentos específicos pertinentes à tarefa.
- Ao concluir cada lote, atualizar os documentos afetados e `docs/planejamento/historico-diario.md`, com data e as três partes acima; registrar decisões permanentes em `docs/planejamento/07-decisoes-e-pendencias.md`.
- Não criar documentos paralelos de continuidade nem duplicar informação se já houver um documento oficial adequado. Corrigir a fonte oficial.
- Se o contexto de um chat acabar, o próximo agente deve retomar pela documentação e pelo estado real do GitHub, sem pedir ao dono para reconstruir o histórico já registrado.


## Planejamento e histórico diário
- Planejamento oficial (visão, arquitetura, roadmap, decisões e pendências): `docs/planejamento/` (Documento 1).
- Ao fim de cada dia de trabalho, registrar em `docs/planejamento/historico-diario.md` (datado, sem apagar o passado) em três partes:
  o que fizemos (concluído, testes, commits, PRs, publicações confirmadas, decisões), o que estamos fazendo (andamento, bloqueios,
  dependências) e o que vamos fazer (próximos passos, prioridades, critérios). Planejado nunca é registrado como concluído (há teste).

## Código
- JavaScript ES5 puro, sem framework, sem build e sem dependências novas no site. Bibliotecas só de CDN com versão exata.
- Tudo é global: antes de criar uma função ou variável de topo, procure se o nome já existe (`tests/estrutura` falha se repetir).
- Funções puras e testáveis vão em `nucleo.js` (expostas em `window.RACnucleo`, usadas como `NUCLEO.x`), com teste em `tests/nucleo.test.mjs`.
  Nada de tela nem de banco no núcleo.
- Siga o estilo dos arquivos vizinhos: `h(tag, attrs, ...filhos)`, `panel()`, `wCard()`, textos em português, comentários curtos.
- Todo gráfico novo usa `racDica.ligar`/`racDica.em`, com valor e rótulo fixos em cada barra (há teste).
- Em edições por script Python: caminho e regex como string crua (`r"..."`), senão `\b` vira caractere de controle (há teste).

## Publicação (skill `rac-publicar`)
- O Claude prepara e valida; para antes de commit, push, SQL em produção, deploy de função ou publicação, e entrega ao dono
  a lista do que falta e em que ordem (SQL → função → site). Só segue o passo que o dono autorizar.
- Durante o trabalho, rode só o teste do módulo (`node --test tests/x.test.mjs`); a suíte inteira só na preparação da publicação.
- Sempre: `node --test tests/*.test.mjs` passando, e `VERSAO` (sw.js) e `MOD_VERSAO` (js/app.js) trocadas juntas.
- SQL novo (skill `rac-sql-novo`): arquivo numerado em `supabase/` (pode rodar de novo sem erro), com RLS ligado, `revoke all ... from anon`
  e a tabela incluída em `tests/seguranca.test.mjs`. O dono roda no SQL Editor antes do site ir ao ar.
- Tabela pessoal nova: entra no backup (`NUCLEO.SEG_TABELAS`, com pk/fk) e ganha a trava restritiva "mfa" do 022 (há teste).
  Restauração nunca grava sem prévia e confirmação, e nunca sobrescreve sem o dono marcar (docs/seguranca.md).
- Edge Function: o dono republica a função antes do site ir ao ar.
- Quando o dono autorizar o commit pelo computador (fluxo antigo): no `main`, como `github-actions[bot]`; o dono roda `git pull --rebase` e
  `git push` (os robôs também publicam). Pela nuvem, vale a seção abaixo.

### Git pelo Claude Code Cloud

Aplicar o **Protocolo Permanente de Trabalho e Autonomia** acima. As regras técnicas abaixo continuam obrigatórias:
- Trabalhar em branch de tarefa `claude/*`, nunca diretamente em `main`; commits e push somente na branch autorizada da sessão.
- Adicionar arquivos pelos caminhos explícitos; nunca usar `git add -A` ou `git add .`. Uma tarefa coerente por commit, sem incluir alterações de outras tarefas.
- Nunca usar force push, apagar branches para contornar proteção ou descartar trabalho alheio.
- Não editar `.claude/settings.json` sem necessidade explícita do lote. SQL em produção, Edge Functions, site, segredos e IA paga continuam sujeitos aos limites de autorização acima.
- Testes na nuvem (máquina preparada pelo ambiente "RAC", `docs/nuvem.md`): `bash scripts/nuvem_testes.sh tests/x.test.mjs` (módulo) e `bash scripts/nuvem_testes.sh` (tudo, como o CI). Não rodar `npm install` dentro do repositório.

Bloqueio técnico (`.claude/settings.json`, versionado; vale em sessão nova com um repositório só):
- Nega: push com `main`/`master`, `--force`, `-f`, `+refspec`, `--delete`, `--all`, `--mirror`; `git reset --hard` e `git clean`; `psql`;
  a CLI `supabase` (deploy, db, migration, secrets); a API de gerenciamento do Supabase; escrever arquivo direto pela API do GitHub
  (`push_files`, `create_or_update_file`, `delete_file`, que escapariam do git); ler `.env*` e `privado/`.
- Os controles de confirmação do ambiente não substituem a autorização do lote nem permitem contornar rulesets do GitHub.
- `.claude/settings.local.json` e o resto de `.claude/` ficam ignorados pelo Git; nenhum segredo vai em `settings.json`.

## IA (RAC Intelligence, docs/rac-intelligence.md)
- Toda IA passa pela função `rac-ia` e, no site, só por `racIA()`. Nenhum outro arquivo chama a Anthropic (há teste).
- Ação nova (skill `rac-acao-ia`) = entrada em `acoes.ts` (modelo, papéis, limites, JSON obrigatório, validação) + demonstração
  em `demo.ts` (exceto ação só REAL, como `hoje.analise`) + testes.
- A IA nunca grava: o resultado vai para a conferência existente e só o clique em Salvar grava. Resposta DEMO nunca chega ao que salva.
- Única exceção (autorizada pelo dono em 31/10/2026): o resumo da Newsletter (`newsletter.resumo`, sempre Haiku) é feito
  sozinho às 6h, 12h e 18h pela `rac-newsletter`, que pede à `rac-ia` pela porta da rotina e salva a edição "ia" só com
  resposta REAL validada (o banco confere a chamada). Uma chamada por edição, no máximo 3 por dia, sem repetir depois de
  erro (docs/newsletter.md).
- RAC Hoje (`hoje.analise`, docs/hoje.md): só REAL e sem demonstração, por decisão do dono (02/11/2026). Em DEMO a `rac-ia` responde
  o erro `sem_real`, nunca uma análise simulada; só do dono (o banco proíbe para a casa); nunca automático, só a pedido do dono.
- Nada de repetição paga automática, de troca de modelo na recusa nem de liberar reserva incerta por prazo.
- Preços só em `ia_precos` (com fonte e data), nunca no código.

## Segurança (o repositório é público)
- Nunca escrever senhas, chaves secretas, tokens, CPF, documentos, endereço, telefone, placas, chassi, fotos ou exames no repositório.
- A única chave no código é a pública (publishable) do Supabase; a segurança vem do RLS.
- Segredos do servidor só em Edge Functions → Secrets ou no Vault. Nunca pedir ao dono a chave secreta nem a senha do banco.
- Sem automação ou raspagem do LinkedIn; respeitar os termos de cada fonte.
