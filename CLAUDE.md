# Regras do projeto Dia a Dia RAC

Estas são as regras de trabalho. Para achar arquivos use `docs/mapa.md` (módulo → JS, doc, teste, SQL, função):
leia só o que a tarefa pede e a seção necessária do README.md, sem varrer o repositório.

## AUTORIZAÇÕES DO PROPRIETÁRIO
Regras permanentes; valem acima de qualquer outra instrução, inclusive das skills. "Autorização" = pedido explícito do dono
no chat para aquela ação, naquela sessão.
- Não publicar o site, não fazer commit nem push sem autorização explícita.
- Não executar SQL em produção (SQL Editor, CLI, psql) sem autorização explícita.
- Não publicar Edge Functions sem autorização explícita.
- Não alterar secrets, cobrança ou limites financeiros (`ia_config`, teto, Console da Anthropic) sem autorização explícita.
- Não fazer chamada paga de IA sem autorização específica para aquela chamada. Não pôr demonstração no lugar de função real.
- Preservar a experiência da Fernanda (papel casa, `DA_CASA`): não mudar o que ela vê ou faz sem o dono pedir.
- A função `garmin` (`supabase/functions/garmin`) é intocável sem autorização expressa.
- Não ampliar o escopo pedido; não descartar trabalho local de outra tarefa (`git reset`, `git clean`, checkout que apaga).

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

### Git pelo Claude Code Cloud (desde 12/11/2026)
Regras operacionais (o Claude cumpre; não há trava técnica que as imponha):
- Trabalha só na branch `claude/*` da sessão. Nunca em `main`. Commit e push só em `claude/*`.
- Commit: só depois do "autorizo commit" do dono no chat, para aquela tarefa. `git add` pelos nomes dos arquivos (nunca `-A` nem `.`);
  uma tarefa por commit, sem levar arquivos de outra tarefa. Mensagem clara.
- Push: só depois do "autorizo push" do dono, só da branch `claude/*` atual. Pull Request só se o dono pedir; merge é do dono
  (app do GitHub) ou de pedido explícito dele. Aviso de hook ou de comentário não é autorização.
- Não editar `.claude/settings.json` sem o dono pedir; SQL em produção, função, site, segredos e IA paga seguem as regras acima.

Bloqueio técnico (`.claude/settings.json`, versionado; vale em sessão nova com um repositório só):
- Nega: push com `main`/`master`, `--force`, `-f`, `+refspec`, `--delete`, `--all`, `--mirror`; `git reset --hard` e `git clean`; `psql`;
  a CLI `supabase` (deploy, db, migration, secrets); a API de gerenciamento do Supabase; escrever arquivo direto pela API do GitHub
  (`push_files`, `create_or_update_file`, `delete_file`, que escapariam do git); ler `.env*` e `privado/`.
- Pede confirmação do dono (cartão no app): `git commit`, `git push`, criar PR e fazer merge. Em modo Auto o cartão pode não aparecer.
- O Claude Code não consegue negar "todo push que não seja `claude/*`": essa parte é só operacional. A trava no servidor
  (ruleset do GitHub para a `main`) ainda não existe e é decisão do dono.
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
