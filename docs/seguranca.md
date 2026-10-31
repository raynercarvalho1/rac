# Central de Segurança, Backup e Recuperação

Página `#seguranca` (menu → Segurança), código em `js/seguranca.js`, funções puras em `nucleo.js` (`NUCLEO.seg*`) e o banco em
`supabase/022_seguranca.sql`. Feita em 31/10/2026.

## O que a página tem

| Quadro | Quem vê | O que faz |
|---|---|---|
| Proteção da conta | todos | nota de 0 a 100 (senha, 2ª etapa, app reserva, trava no banco, backup baixado, backup do servidor, auditoria) |
| Verificação em duas etapas | todos | ativar (QR code + chave, confirma com um código), ver os apps cadastrados, cadastrar um reserva, desativar (pede um código atual) |
| Backup e exportação | dono | JSON estruturado (formato 2) ou o pacote .zip de antes (JSON + CSV, com ou sem fotos e PDFs) |
| Restaurar um backup | dono | lê `.json` ou `.zip`, confere, compara com o que existe hoje, mostra a prévia e só grava depois da confirmação |
| Histórico de backups | dono | backups automáticos do servidor (baixar, conferir, prévia da restauração) e o registro de segurança |
| Auditoria | dono | conferência de dentro do banco (`seguranca_estado()`) e o resultado da revisão do código |
| Se perder o acesso | todos | orientações de recuperação (abaixo) |

O painel "Backup e portabilidade" do Sistema virou um atalho para cá (nada duplicado). Quem é da casa vê só a proteção, a 2ª etapa e a recuperação.

## Backup

**Formato 2 (`rac-backup-AAAA-MM-DD.json`):**

```
{ formato: "rac-backup", versao: 2, site, criado, conta,
  tabelas: { mercados: [...], produtos: [...], notas: [...], itens: [...], orcamentos, registros, lista, bebe, pessoal,
             garmin_dia, garmin_ativ, newsletter_edicoes },
  resumo:  { <tabela>: { linhas, sha256 } },      // SHA-256 do JSON canônico (chaves em ordem) de cada tabela
  relacoes: [["notas.mercado_id","mercados.id"], ["itens.nota_id","notas.id"], ["itens.produto_id","produtos.id"]],
  fora: [ caminhos do que foi tirado ], falhas: [ tabelas que não abriram ] }
```

- As tabelas e a ordem (pai antes do filho) vêm de `NUCLEO.SEG_TABELAS`; o `.zip` do Sistema usa a mesma lista
  (antes faltavam `lista` e `bebe`).
- Os ids e as colunas de relação vão como estão, então o backup pode ir para outro banco.
- Só entram linhas que o RLS mostra para a conta. **Não entram**: `pessoal.atalho` (resumo da chave dos atalhos do iPhone;
  restaurar reativaria uma chave já trocada), `pessoal.googleMaps`, qualquer campo com nome de senha/token/chave de API
  em qualquer nível (`NUCLEO.segLimpar`), `push_inscricoes`, `rac_segredos`, `membros`, `erros`, `rotina_log`, `ia_*`,
  `newsletter_avisos` e o histórico de segurança.
- Cada exportação grava a data em `pessoal.ultimoBackup` (como antes) e um evento `exportacao` com o SHA-256 do arquivo.

## Backup automático

| Opção | Custo | Situação |
|---|---|---|
| Backup do RAC no servidor (função `garmin`, todo domingo às 6h, cofre privado `backups`, guarda os 8 mais novos, lê de volta para conferir) | grátis | **já existe**, não foi alterado |
| Backup diário do Supabase (Database → Backups) | só no Pro (US$ 25/mês): 7 dias; Team: 14 | o projeto está no grátis: **não há** backup nativo |
| Point-in-Time Recovery | add-on do Pro: ~US$ 100/mês (7 dias), 200 (14), 400 (28) | não contratado |
| `supabase db dump` (CLI) | grátis | recomendação do Supabase para o plano grátis; precisa da senha do banco, então fica com o dono |

Escolha: manter o backup semanal do servidor (8 semanas de retenção, conferido na gravação) + o backup baixado pelo dono
todo mês (a Central e a agenda avisam depois de 30 dias; o automático parado há mais de 9 dias também vira aviso). Nada pago foi ligado.
Os backups do Supabase não incluem os arquivos do Storage: as fotos e PDFs só ficam guardados fora pelo "Pacote com fotos e PDFs".

## Restauração

1. **Estrutura** (`NUCLEO.segLer`): é um backup do RAC, versão conhecida, cada tabela é uma lista, toda linha tem o identificador,
   nenhuma repetida, a quantidade bate com o resumo. Tabela desconhecida vira aviso e fica de fora.
2. **Integridade** (`NUCLEO.segHashes`): SHA-256 de cada tabela igual ao do resumo. Arquivo alterado ou corrompido para aqui.
   Backups antigos (servidor e `.zip`) não têm assinatura: aviso, e vale só a estrutura.
3. **Comparação** (`NUCLEO.segPlano`) com todas as tabelas de hoje. Cada linha vira **nova**, **igual**, **mudou** ou **inválida**.
   - Duplicidade por nome: mercado ou produto com o mesmo nome, nota com a mesma chave NFC-e (ou mesmo mercado, número e data),
     evento do bebê com a mesma chave → é o mesmo registro, e os filhos passam a apontar para o id de hoje.
   - Relações: item que aponta para nota inexistente é inválido e não entra; produto inexistente fica vazio (aviso).
   - Segredos não contam como diferença, e quando uma linha é trocada os segredos de hoje continuam nela (`segRepor`).
   - Backup de outra conta: troca o dono, o caminho dos anexos e tira o "criado por"; exige marcar uma caixa a mais.
   - `newsletter_edicoes` fica só no backup (a edição com IA depende do registro da chamada em `ia_uso`).
4. **Prévia**: tabela por tabela, avisos, as linhas que entram e os campos que mudaram. Nada foi gravado até aqui.
5. **Confirmação**: caixa "baixar uma cópia de hoje antes" (marcada), caixa "trocar as que mudaram" (desmarcada) e o `confirm()`.
   - Novas entram por `insert`: se a linha passar a existir nesse meio-tempo, o banco recusa em vez de sobrescrever.
   - Trocas só por `upsert` e só com a caixa marcada. Nada é apagado.
   - Anexos do `.zip` vão com `upsert:false`: os que já estão no cofre ficam como estão.
   - Se parar no meio, a mensagem diz o que entrou; abrir a prévia de novo mostra o resto (o que entrou aparece como igual).

A restauração antiga (Sistema → Restaurar) fazia `upsert` direto, sobrescrevia anexos e trazia a chave dos atalhos: foi removida.

## Verificação em duas etapas (TOTP)

- Supabase Auth: TOTP é grátis e vem ligado em todos os projetos; MFA por SMS é pago (não usado). Não existem códigos de
  recuperação: o Supabase recomenda **um segundo app autenticador** como reserva (até 10 por conta).
- Ativar: `auth.mfa.enroll` (QR code e chave) → `challengeAndVerify` com o primeiro código. Cadastro não confirmado é desfeito na próxima tentativa.
- Login: depois da senha, se `nextLevel` é `aal2` e a sessão está em `aal1`, o site pede o código **antes de ler qualquer tabela**
  (`mfaPrecisa`/`mfaPedir` em `js/app.js`). Sem app cadastrado, nada muda.
- Desativar: pede um código atual antes de `unenroll` (quem só tem a senha não desliga a proteção).
- **No banco (022)**: `rac_aal_ok()` + política `as restrictive` "mfa" em todas as tabelas pessoais e nos cofres `familia` e `backups`.
  Quem tem fator confirmado só lê e grava com a sessão `aal2`; quem não tem continua com `aal1`. Sem o 022 o código é pedido pelo site,
  mas o banco ainda aceitaria só a senha (a Central avisa).
- Nada liga MFA sozinho e nenhuma conta é bloqueada: vale só para quem cadastrar.
- As Edge Functions usam a chave do servidor (sem RLS): rotina, Garmin, atalhos do iPhone, IA e Newsletter não mudam.

## Recuperação de acesso

- **Senha esquecida**: Esqueci a senha (e-mail). Com MFA, o código continua sendo pedido.
- **Celular perdido**: entrar com o app reserva e desativar o perdido na Central.
- **Sem nenhum app**: o dono abre o painel do Supabase → Authentication → Users → a conta → remover o fator MFA. A conta volta a entrar só com a senha.
- **O dono sem nenhum app**: o próprio acesso ao painel do Supabase é a recuperação; proteja essa conta (com a 2ª etapa do Supabase).
- **Dados apagados por engano**: Restauração com o backup baixado ou o do servidor.

## Auditoria (31/10/2026)

| Item | Resultado |
|---|---|
| RLS | ligado em todas as tabelas de `public`; pessoais por `user_id = auth.uid()` (só o dono) ou `dono_da_casa()` (casa) |
| Visitante sem login (`anon`) | `revoke all` em todas as tabelas; `tests/seguranca.test.mjs` e `tests/banco.test.mjs` conferem no banco de verdade |
| Storage | `familia` e `backups` privados; caminho começa pela conta (`<dono>/...`); `backups` só leitura para o dono |
| Funções `security definer` | `search_path` vazio ou fixo, `execute` revogado de `public`/`anon`; só `ping()` é aberta (não lê dado) |
| Edge Functions | `garmin` (não alterada), `rac-ia`, `rac-newsletter`: recusam quem não entrou ou não tem a senha da rotina; CORS só para o site |
| Segredos | só a chave pública no código; VAPID em `rac_segredos` (sem acesso pelo site); senha da rotina no Vault |
| **Corrigido** | restauração que sobrescrevia linhas e anexos sem prévia; restauração que reativava a chave dos atalhos; backup sem `lista`/`bebe` e com a chave do Google Maps |
| **Novo** | a senha sozinha não bastava mesmo para quem quisesse 2ª etapa → trava `aal2` no banco (022) |
| Atenção | `pessoal.atalho` guarda só o SHA-256 da chave (a chave nunca é guardada) — fora do backup; `erros` aceita insert do próprio dono (registro de falhas, sem risco a terceiros) |
| Recomendado ao dono (painel) | Authentication → Policies/Providers: senha mínima de 8+ caracteres; "Leaked password protection" (só no Pro); conferir em Authentication → Multi-Factor que o TOTP está "Enabled" |

A conferência viva fica em `seguranca_estado()` (022): tabelas sem RLS, tabelas que `anon` lê, tabelas pessoais sem a trava,
cofres públicos e funções privilegiadas abertas a `anon`. Só nomes, nenhum dado.

## Implantação (nesta ordem)

1. `node --test tests/*.test.mjs` passando.
2. SQL Editor: rodar `supabase/022_seguranca.sql` inteiro (pode rodar de novo). Depois, tirar a linha `-- status: pendente` do arquivo.
3. Conferir em Authentication → Multi-Factor que o TOTP está ligado (vem ligado).
4. `git push` (versão `2026-10-31.5`).
5. No site: Segurança → conferir a Auditoria (tudo ✓), baixar um backup, abrir a prévia da restauração com ele (deve dar tudo "igual").
6. Opcional: ativar a 2ª etapa na própria conta, cadastrar um app reserva e testar sair/entrar.

Não há Edge Function nova nem alterada. Desfazer o 022: `drop policy "mfa" on public.<tabela>` em cada tabela e `drop policy "mfa cofres" on storage.objects`
(o site continua funcionando, só o banco deixa de exigir o código).

## Testes

- `tests/nucleo.test.mjs`: limpeza de segredos, formato e assinatura, conferência (arquivo estranho, sem id, repetido, resumo errado,
  conteúdo alterado), plano (novas/iguais/mudadas, troca só se pedir, duplicidade por nome, relações, outra conta, segredos preservados), nota.
- `tests/central.test.mjs`: o 022 (pendente, reexecutável, trava em todas as tabelas pessoais e nos cofres, funções fechadas, histórico só
  acrescenta), regras da restauração (prévia, confirm, insert, upsert só com a caixa, anexos sem sobrescrever, nada apagado), login pede o
  código antes de ler, rotas, menu, papel casa, service worker, garmin intocada.
- `tests/navegador.test.mjs`: a página num iPhone (375 px) com banco simulado: quadros, sem rolagem lateral, backup sem segredos,
  prévia sem gravar, confirmação e só insert, cadastro do app e o código no login.
- `tests/seguranca.test.mjs`: `seguranca_eventos` fechada para quem não entrou (banco de verdade).
