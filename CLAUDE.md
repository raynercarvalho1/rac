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
- Quando o dono autorizar o commit: no `main`, como `github-actions[bot]`. O push fica bloqueado para o Claude (`.claude/settings.json`):
  o dono roda `git pull --rebase` e `git push` (os robôs também publicam).

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
