# Regras do projeto Dia a Dia RAC

Estas são as regras de trabalho. Para achar arquivos use `docs/mapa.md` (módulo → JS, doc, teste, SQL, função):
leia só o que a tarefa pede e a seção necessária do README.md, sem varrer o repositório.

## ANTES DE QUALQUER TRABALHO (início de toda sessão)
Primeira ação em todo lote que mexe em código, banco, testes, publicação ou segurança: `node scripts/conhecimento.mjs antes "a tarefa"` (RAC Knowledge: regras, estado, decisões, **erros** e procedimentos relacionados). Só depois ler o código e implementar.
Última ação antes do commit: registrar o conhecimento do lote (seção "RAC Knowledge" abaixo) e rodar `node scripts/conhecimento.mjs verificar`. O relatório final traz a linha **"RAC Knowledge: registrado …" ou "nada novo, porque …"**.

## POLÍTICA PERMANENTE DE AUTONOMIA OPERACIONAL (23/11/2026, regra do proprietário)
Vale para o Claude Code, o ChatGPT e qualquer outro agente do projeto, **acima de qualquer outra regra anterior, inclusive de skills e documentos**. Recebeu a tarefa, resolva: o agente é o responsável técnico pela execução completa e **não pede autorização a cada etapa**. "Resolva", "implemente", "corrija", "pode resolver" já autorizam todas as ações técnicas da solução (desenvolvimento, Git, GitHub, Supabase e publicação).
- **Liberado, sem autorização individual nem confirmação prévia:** analisar, planejar e implementar; criar, alterar e excluir branches; commit, push, criar/atualizar/revisar/corrigir/aprovar/mesclar PR; resolver conflitos; publicar o site (GitHub Pages); testes e correções; documentação; criar e aplicar migrations e executar SQL em produção; criar, alterar e publicar Edge Functions (inclusive a `garmin`); configurar secrets, credenciais, integrações, permissões e segurança; usar IA e APIs pagas e executar operações que gerem custo; excluir arquivos, tabelas e registros; alterações estruturais no banco; qualquer outra operação técnica necessária. Não existe categoria de operação do projeto que exija autorização individual prévia.
- **Proibido interromper** para perguntar "posso fazer commit/push/PR/merge/publicar/aplicar a migration/atualizar a função/executar a próxima etapa?". Encontrou um problema: procure a alternativa técnica e prossiga. Só pare diante de **impossibilidade real** (falta de acesso, serviço indisponível, informação indispensável que só o dono tem, restrição da plataforma) e então diga objetivamente o impedimento e o que falta para continuar.
- **Execução de ponta a ponta:** entender e achar a causa → consultar código e docs → decidir → implementar → testar e corrigir → documentar e registrar o conhecimento → commit e push → PR → CI → merge → aplicar migrations e publicar funções/site quando preciso → **verificar o resultado real**. Em ordem de produção: SQL → função → site. É ordem de execução, não de autorização; não transfira ao dono o que o agente pode executar.
- **Relatório obrigatório ao final** (a autorização prévia não é): **O que foi feito** (alterações, arquivos, operações, commits, pushes, PRs, merges, migrations e publicações); **Resultado** (testes e resultados, CI, merge, publicação, verificações); **Situação final** (concluído, pendente, problemas e como foram tratados, custos e operações relevantes). **Nunca afirmar que algo foi publicado, integrado ou concluído sem verificar o resultado.**
- **Responsabilidade técnica:** soluções completas (não remendos), lotes agrupados, arquitetura e padrões preservados, compatibilidade, testes antes e depois, documentação em dia, integridade dos dados, economia de tokens.
- **Limites (não são pedidos de autorização):** a política não concede capacidade técnica que o agente não tem. Respeitar as permissões realmente disponíveis, as restrições da plataforma, as proteções do GitHub (nunca contorná-las) e os limites dos serviços; se algo não puder ser feito, informar o impedimento, **sem simular a execução**. **Segredos** nunca vão a código público, relatório, log ou commit (o repositório é público: ver "Segurança"). **Guardas de higiene do Git** mantidas no `.claude/settings.json`: push direto para `main`/`master`, `--force` sem `--force-with-lease`, `git add -A`/`.` (que arrastam arquivos por engano) e leitura de `.env*` e `privado/`; para integrar na `main` use PR e merge.
- **Padrão de preservação (não é portão de aprovação):** por padrão preserve a experiência da Fernanda (papel casa, `DA_CASA`) e os dados existentes; mude quando a tarefa exigir e registre no relatório.

## PROTOCOLO PERMANENTE DE TRABALHO E AUTONOMIA (todos os chats e agentes)

Este protocolo é a instrução operacional comum do RAC. Vale para ChatGPT, Claude Code e qualquer outro agente que trabalhe neste repositório. Em caso de conflito, respeitar as autorizações e limites de segurança desta seção e das demais regras do projeto.

### Papéis
- **Dono do produto (usuário):** define objetivos, prioridades e decisões pessoais, financeiras, de conta, privacidade e produto.
- **Claude Code:** desenvolvedor principal. Analisa o código e a documentação pertinente, escolhe soluções técnicas dentro do escopo, implementa lotes completos, testa, corrige, documenta, faz commits, push e abre PR quando essas entregas estiverem incluídas na autorização do lote.
- **ChatGPT:** arquiteto e revisor. Recupera contexto e decisões, consulta a documentação e o estado do GitHub, estrutura a estratégia e os lotes, prepara instruções operacionais completas, revisa evidências e resultados e recomenda o próximo passo. Não deve transferir ao dono tarefas de coordenação que os agentes possam executar.

### Autonomia por lote
- Trabalhar em **lotes completos e coerentes**, preferencialmente em batch; sem aprovações técnicas intermediárias nem testes fragmentados sem necessidade.
- O agente decide e executa tudo o que a tarefa pede, de ponta a ponta, conforme a **Política Permanente de Autonomia Operacional** acima: código, banco, funções, Git, GitHub, publicação, segredos e custos. **Commit, push, PR, merge, migrations, SQL em produção, publicação de funções e do site não pedem autorização.**
- Respeitar as proteções técnicas do GitHub, as branches protegidas, os ambientes e os limites de cada sessão; nunca contornar bloqueios.

### Quando parar e consultar o dono
Somente diante de **impossibilidade real de continuar**: falta de acesso ou credencial que só o dono pode conceder (ex.: um token que ele precisa criar), serviço indisponível, restrição da plataforma ou informação indispensável que só o dono tem (preferência pessoal, regra de negócio nova que a tarefa não define). Nesses casos, explicar objetivamente o impedimento e o que é necessário. Não parar por formalidade, por custo, por exclusão de dados ou por risco rotineiro: decidir, executar, verificar e relatar.

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


## RAC Knowledge (memória técnica do projeto, `docs/conhecimento.md`) — protocolo obrigatório
Os agentes não têm acesso ao banco: o conhecimento chega por arquivos em `docs/conhecimento/registros/<tipo>/<nome>.md` (índice `docs/conhecimento/indice.json`; o dono importa para o site em RAC Knowledge → ⇄ Repositório).
- **ANTES de implementar** (todo lote que mexe em código, banco, testes, publicação ou segurança): `node scripts/conhecimento.mjs antes "a tarefa"` — ou Grep/Read em `docs/conhecimento/registros/` se o script não puder rodar. Ler as regras permanentes,
  as decisões e os **erros** relacionados (repetir erro registrado ou desfazer decisão aprovada é falha), os procedimentos aplicáveis e o estado atual do projeto. Se um registro contradiz o que o dono pediu, parar e consultar o dono.
- **DEPOIS de implementar** (checklist, antes do commit do lote): registrar só o que é novo e reutilizável, em registros pequenos: (1) **decisão nova**, com o motivo; (2) **erro relevante**, com causa-raiz, solução e prevenção; (3) **procedimento que mudou**; (4) **estado do projeto** atualizado (versão, o que está aplicado ou pendente); (5) resultado de testes, commit, PR e publicação como `diario`, só quando o lote tiver marco real.
  Use `node scripts/conhecimento.mjs novo ...` ou edite o `.md`; depois `node scripts/conhecimento.mjs indice` e `verificar`. Tudo vai **no commit do lote** (os testes reprovam arquivo inválido e índice desatualizado). Corrigir o registro existente em vez de duplicar; decisão que substitui outra a cita em `relacionados`. Nada de novo = dizer isso no relatório final, com o motivo.
- Não registrar detalhe trivial. **Nunca** registrar senha, chave, token, CPF, endereço, telefone, placa, foto ou exame: o repositório é público e o banco e o script recusam. Registro de decisão ou regra do dono só com o que o dono realmente decidiu; o resto é hipótese e vai como tal.
- Isto complementa, não substitui, `docs/planejamento/` (histórico diário e decisões) e o restante deste arquivo; em conflito vale a Política Permanente de Autonomia Operacional.

## Planejamento e histórico diário
- Planejamento oficial (visão, arquitetura, roadmap, decisões e pendências): `docs/planejamento/` (Documento 1).
- Ao fim de cada dia de trabalho, registrar em `docs/planejamento/historico-diario.md` (datado, sem apagar o passado) em três partes:
  o que fizemos (concluído, testes, commits, PRs, publicações confirmadas, decisões), o que estamos fazendo (andamento, bloqueios,
  dependências) e o que vamos fazer (próximos passos, prioridades, critérios). Planejado nunca é registrado como concluído (há teste).

## Qualidade visual e UX (decisão do dono, 27/11/2026)
- Toda funcionalidade relevante só está **concluída** com três qualidades: **funcional**, **técnica** e **visual e de experiência** (hierarquia clara, composição coerente com o Design System, estados vazio/carregando/erro/sucesso desenhados, desktop, tablet e celular, tema claro e escuro equivalentes).
- Tela nova usa o Design System (`css/rac.css`, `js/kit.js`: faixa, `rkBtn`, `rkCard`, `rkEstado`, `rkSelo`, tokens), nunca `panel()`/`ghostbtn` para código novo; sem reformulação indiscriminada das telas antigas (a consolidação é por tela, com antes × depois).
- A validação visual é parte do lote: capturas (computador, tablet, celular, claro e escuro, modo normal e de edição), medição (rolagem lateral, sobreposição, alvos de 44 px, contraste) e correção do que aparecer; o relatório traz uma seção "Qualidade visual e UX". Referência e método: `docs/planejamento/20-auditoria-visual-e-ux.md`, exemplo de teste: `tests/workspace_visual.test.mjs`.

## Código
- JavaScript ES5 puro, sem framework, sem build e sem dependências novas no site. Bibliotecas só de CDN com versão exata.
- Tudo é global: antes de criar uma função ou variável de topo, procure se o nome já existe (`tests/estrutura` falha se repetir).
- Funções puras e testáveis vão em `nucleo.js` (expostas em `window.RACnucleo`, usadas como `NUCLEO.x`), com teste em `tests/nucleo.test.mjs`.
  Nada de tela nem de banco no núcleo.
- Siga o estilo dos arquivos vizinhos: `h(tag, attrs, ...filhos)`, `panel()`, `wCard()`, textos em português, comentários curtos.
- Todo gráfico novo usa `racDica.ligar`/`racDica.em`, com valor e rótulo fixos em cada barra (há teste).
- Em edições por script Python: caminho e regex como string crua (`r"..."`), senão `\b` vira caractere de controle (há teste).

## Publicação (skill `rac-publicar`)
- O Claude **prepara, valida e publica** de ponta a ponta (política de autonomia, 23/11/2026): SQL → função → site, conferindo cada resultado antes de afirmar que está publicado. Nada disso pede autorização.
- Durante o trabalho, rode só o teste do módulo (`node --test tests/x.test.mjs`); a suíte inteira só na preparação da publicação.
- Sempre: `node --test tests/*.test.mjs` passando, e `VERSAO` (sw.js) e `MOD_VERSAO` (js/app.js) trocadas juntas.
- SQL novo (skill `rac-sql-novo`): arquivo numerado em `supabase/` (pode rodar de novo sem erro), com RLS ligado, `revoke all ... from anon`
  e a tabela incluída em `tests/seguranca.test.mjs`. O agente aplica em produção (Supabase MCP, `apply_migration`) e confere o resultado; depois troca o cabeçalho do arquivo para "aplicada" com a data. Tabela nova precisa dar `select, insert, update` à `service_role` quando a rotina diária da função grava nela (como `garmin_ativ` e `garmin_rotas`).
- Tabela pessoal nova: entra no backup (`NUCLEO.SEG_TABELAS`, com pk/fk) e ganha a trava restritiva "mfa" do 022 (há teste).
  Restauração nunca grava sem prévia e confirmação, e nunca sobrescreve sem o dono marcar (docs/seguranca.md).
- Edge Function: o agente publica (Supabase MCP `deploy_edge_function`, ou o workflow manual `garmin-publicar.yml` quando o token do Supabase estiver no Environment) e confere a versão ativa antes do site ir ao ar.
- Pelo computador do dono (fluxo antigo): commit na `main` como `github-actions[bot]`, e o dono roda `git pull --rebase` e `git push` (os robôs também publicam). Pela nuvem, vale a seção abaixo.

### Git pelo Claude Code Cloud

Aplicar o **Protocolo Permanente de Trabalho e Autonomia** e a **Política Permanente de Autonomia Operacional** acima. Regras técnicas:
- Trabalhar em branch de tarefa `claude/*` e integrar na `main` por PR (merge liberado); nunca empurrar direto para `main`/`master`.
- Adicionar arquivos pelos caminhos explícitos; nunca `git add -A` ou `git add .` (arrastam arquivos por engano; o repositório é público). Uma tarefa coerente por commit.
- `--force-with-lease` em branch `claude/*` é permitido (necessário depois de `rebase` ou `commit --amend`); `--force` puro e `+refspec` ficam fora (use o `--with-lease`).
- Testes na nuvem (máquina preparada pelo ambiente "RAC", `docs/nuvem.md`): `bash scripts/nuvem_testes.sh tests/x.test.mjs` (módulo) e `bash scripts/nuvem_testes.sh` (tudo, como o CI). Não rodar `npm install` dentro do repositório.

Configuração técnica (`.claude/settings.json`, versionado; vale em sessão nova com um repositório só; o teste `tests/permissoes.test.mjs` mantém a política efetiva):
- **Liberado (allow):** edição de qualquer arquivo (inclusive `.claude/` e `.github/workflows/`), Git de rotina e de reescrita da própria branch (`add`, `commit`, `commit --amend`, `switch`, `checkout`, `merge`, `rebase`, `stash`, `reset`, `restore`, `rm`, `branch -d/-D`, `worktree`, `push origin claude/*` e `--force-with-lease` em `claude/*`, `push --delete` de branch `claude/*`), `gh` (PR, merge, API, runs, workflows), ferramentas do GitHub (inclusive `merge_pull_request`, `enable_pr_auto_merge`, `actions_run_trigger`), testes, o RAC Knowledge, a CLI `supabase`, `psql` e a API de gerenciamento do Supabase (precisam de credencial, que o agente nunca imprime), e as ferramentas do Supabase MCP.
- **Negado (deny), só as guardas de higiene:** push para `main`/`master`, `--force` sem lease, `+refspec`, `--all`, `--mirror`, `git add -A`/`.`, escrita direta de arquivo pela API do GitHub (`push_files`, `create_or_update_file`, `delete_file`, que escapam do Git e da PR), `rm -rf` na raiz ou no home, e leitura/edição de `.env*` e `privado/`.
- **Pedir (ask): vazio.** Nenhuma operação do projeto fica à espera de aprovação. Se a plataforma (modo de permissão da sessão, confirmação de um conector) ainda interromper, isso é restrição técnica externa: relatar, não simular.
- `.claude/settings.local.json` fica ignorado pelo Git; nenhum segredo vai em `settings.json`.

## IA (RAC Intelligence, docs/rac-intelligence.md)
- **Autonomia:** usar IA e APIs pagas para desenvolver, testar e entregar uma tarefa **não pede autorização** (política de 23/11/2026). O que segue define o **comportamento do produto** (quem chama, limites de uso e interruptores do dono no site), não portão de aprovação do agente.
- Toda IA passa pela função `rac-ia` e, no site, só por `racIA()`. Nenhum outro arquivo chama a Anthropic (há teste).
- Ação nova (skill `rac-acao-ia`) = entrada em `acoes.ts` (modelo, papéis, limites, JSON obrigatório, validação) + demonstração
  em `demo.ts` (exceto ação só REAL, como `hoje.analise`) + testes.
- A IA nunca grava: o resultado vai para a conferência existente e só o clique em Salvar grava. Resposta DEMO nunca chega ao que salva.
- Única exceção (decisão do dono em 31/10/2026): o resumo da Newsletter (`newsletter.resumo`, sempre Haiku) é feito
  sozinho às 6h, 12h e 18h pela `rac-newsletter`, que pede à `rac-ia` pela porta da rotina e salva a edição "ia" só com
  resposta REAL validada (o banco confere a chamada). Uma chamada por edição, no máximo 3 por dia, sem repetir depois de
  erro (docs/newsletter.md).
- RAC Hoje (`hoje.analise`, docs/hoje.md): só REAL e sem demonstração, por decisão do dono (02/11/2026). Em DEMO a `rac-ia` responde
  o erro `sem_real`, nunca uma análise simulada; só do dono (o banco proíbe para a casa); a pedido do dono (botão com confirmação).
  **Segunda exceção (decisão do dono em 22/11/2026):** com o interruptor "Análise automática" **ligado pelo dono** (`PESSOAL.hojeIaAuto`,
  desligado por padrão), a tela do Hoje pede a análise sozinha, **no máximo 2 por dia** (1ª abertura ou volta ao app a partir das 6h e a partir
  das 14h, horário de Brasília, com o app aberto), pelo mesmo caminho do botão (`hjAnalisar`). A marca da janela é gravada antes de chamar, o
  servidor conta as chamadas do dia (`ia_custos`, funcionalidade `hoje`) e, com 2 ou sem conseguir contar, não chama; sem repetir depois de
  erro. As perguntas saíram da tela do Hoje por decisão do dono (24/11/2026: ele só lê a análise); o motor (`hojeAnalisar` com pergunta) segue no código, sem botão (docs/hoje.md).
- Nada de repetição paga automática, de troca de modelo na recusa nem de liberar reserva incerta por prazo.
- Preços só em `ia_precos` (com fonte e data), nunca no código.

## Supabase MCP (acesso ao banco do RAC pelo Claude Code)
- Servidor remoto oficial, só do projeto `hofnhbxnfebfnncwxrds` (`.mcp.json`, sem segredo; `features=docs,database,debugging,development,branching,functions`: com `functions` para publicar Edge Functions, sem `storage` e sem ferramentas de conta). Autenticação **OAuth no navegador**, feita pelo dono (`/mcp` → supabase → Authenticate, ou conectar o Supabase em claude.ai → Connectors e abrir sessão nova). Nunca pedir nem guardar senha do banco, `service_role`, PAT ou token; nada disso vai para arquivo, commit ou chat.
- Os servidores MCP são lidos no início da sessão; sem a autenticação feita, as ferramentas `mcp__supabase__*` não aparecem. Não simular resultado. `psql`, a CLI `supabase` e a API de gerenciamento também estão liberados quando houver credencial; o agente nunca imprime nem guarda a credencial.
- Leitura (`list_tables`, `list_migrations`, `list_extensions`, `get_advisors`, `get_logs`, `execute_sql` com `select`) confere o estado real antes de qualquer lote com banco. **Escrita (`apply_migration`, `execute_sql` que altera, `deploy_edge_function`, branches) é liberada ao agente** (política de 23/11/2026): aplicar, conferir por leitura o resultado e registrar. Se o conector pedir uma confirmação na tela do dono e ela expirar, é restrição da plataforma: relatar, tentar o caminho alternativo (por exemplo, o dono ou outro agente rodar o SQL) e **nunca declarar aplicado sem conferir por leitura**.
- Antes de alterar produção: ler a migration inteira; conferir o impacto (tabelas, políticas, funções, dados); a sequência (`list_migrations` × arquivos de `supabase/`); rodar a conferência só leitura de `supabase/conferencias/`; preferir testar a mudança estrutural em PGlite (`tests/*_sql.test.mjs`) antes de produção. Depois de aplicar: rodar a conferência, trocar o cabeçalho da migration para aplicada (com a data) e registrar no histórico diário.
- `apply_migration` grava no histórico do Supabase com número próprio: o arquivo `supabase/NNN_*.sql` do repositório continua sendo a fonte; usar o mesmo texto, sem editar na hora.

## Segurança (o repositório é público)
- Nunca escrever senhas, chaves secretas, tokens, CPF, documentos, endereço, telefone, placas, chassi, fotos ou exames no repositório.
- A única chave no código é a pública (publishable) do Supabase; a segurança vem do RLS.
- Segredos do servidor só em Edge Functions → Secrets ou no Vault. Nunca pedir ao dono a chave secreta nem a senha do banco.
- Sem automação ou raspagem do LinkedIn; respeitar os termos de cada fonte.
- Credenciais de nuvem (Cloudflare e similares) só em Environments do GitHub, usados só por workflow privilegiado que existe na `main`, com os Environments aceitando só a `main`. Código de branch experimental entra nesse workflow apenas como dado verificado por hash e nunca é executado com secrets (`docs/icloud-poc-deploy.md`).
