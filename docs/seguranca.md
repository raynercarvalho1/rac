# Central de Segurança, Backup e Recuperação

Página `#seguranca` (menu → Segurança), código em `js/seguranca.js`, funções puras em `nucleo.js` (`NUCLEO.seg*`) e o banco em
`supabase/022_seguranca.sql`. Feita em 31/10/2026.

**Estado (31/10/2026):** em produção. Passkeys ligadas no Supabase (RP ID `raynercarvalho.com.br`), 022 aplicado (21 travas "mfa" + "mfa cofres";
nenhum dado alterado; nenhuma conta com TOTP no dia), site na versão `2026-10-31.6`. Falta só o primeiro cadastro de Face ID num iPhone.

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

### Central Fiscal: tentativas e histórico no backup (Lote 1.6)
`notas_fiscais_tentativas` e `notas_fiscais_situacoes` (migration 037) entram no backup (JSON, `.zip` e pacote completo) como `so:"exportar"`: o banco só deixa a função `nota_fiscal_salvar_doc` gravá-las, então a restauração **não** as escreve; `nota_id` e `tentativa_id` guardam o vínculo no arquivo. O pacote "com fotos e PDFs" inclui os originais guardados em tentativas (inclusive de nota bloqueada). Nada fiscal vai a destino público. A auditoria `seguranca_estado()` só enxerga a trava "mfa" dessas tabelas depois da migration 038 (proposta: rode `supabase/038_seguranca_estado_tentativas.sql` e confira com `supabase/conferencias/038_conferir_producao.sql`).

### Central Fiscal na restauração (Lote B)
Só as tabelas `notas_fiscais`, `notas_fiscais_itens` e `notas_fiscais_docs` têm regras próprias (veja docs/fiscal.md): nota conferida de hoje e os filhos dela não mudam (contados como "congelados" na prévia); o registro de documento nunca é trocado; a conferência original volta **depois** dos itens e documentos, com a autoria histórica; cada documento é conferido (tipo, arquivo no pacote, tamanho e SHA-256) antes de gravar e, em outra conta, ganha o caminho da conta nova. Anexo fiscal fora do plano é ignorado e contado, sem interromper os demais. **Nenhuma outra tabela e nenhum outro anexo mudou** (Compras, Eddie, Olivia, documentos).

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

## Entrar com Face ID (passkeys)

**Auditoria (31/10/2026):**
- SDK do site (`@supabase/supabase-js@2.117.3`): tem `auth.signInWithPasskey()`, `auth.registerPasskey()` e
  `auth.passkey.list/update/delete`. Ele mesmo faz a cerimônia WebAuthn (`navigator.credentials`), com credenciais
  *discoverable* (o iPhone mostra as contas que têm passkey ali; não precisa digitar o e-mail). O recurso é **experimental**
  no Supabase (a API pode mudar); o cliente liga a opção `experimental: { passkey: true }` em `mercado.js`.
- Projeto: `/auth/v1/settings` respondeu `passkeys_enabled: false` → hoje o servidor recusa com `passkey_disabled`
  (conferido no navegador; o site mostra "ainda não foi ligado"). A documentação não cita custo.
- **AAL**: no código do Supabase Auth (`internal/models/amr.go`), a entrada por passkey gera `amr: passkey` e sessão **aal1**,
  igual à senha; só TOTP, telefone, WebAuthn-MFA e código de recuperação dão aal2. Com o 022:
  - conta **sem** código (TOTP): Face ID entra direto e lê tudo (o 022 aceita aal1 de quem não tem fator);
  - conta **com** código: depois do Face ID o site pede o código **uma vez por entrada**; a sessão fica salva e renova sozinha
    (não pede ao abrir o app nem ao navegar). Cadastrar ou remover passkey também exige a sessão com código (regra do Supabase).
- Cada passkey é ligada à conta que estava logada quando foi cadastrada; `passkey.list()` só devolve as da própria conta.
  O site não usa a API de administrador.

**No site:** botão "Entrar com Face ID" na tela de entrar (só aparece se o navegador tem passkey), com a senha embaixo como
alternativa; na Central, o quadro "Entrar com Face ID" lista (nome, criada, último uso), cadastra ("Cadastrar o Face ID deste
aparelho", com o nome do aparelho e a data) e remove (com confirmação). A Fernanda vê e cadastra a dela. O Face ID não entra na
nota da proteção: ele facilita a entrada, mas a senha continua abrindo a conta.

**Decisão pendente (não implementada):** para quem tiver o código **e** o Face ID entrar sem digitar o código, a trava do 022
teria que aceitar `amr = passkey` como equivalente ao código. A passkey com Face ID é forte (aparelho + biometria, à prova de
phishing), mas o Supabase pede a verificação do usuário como "preferida", não "obrigatória": uma chave física sem PIN também
passaria. Por isso a trava ficou como está. Caminho recomendado hoje: usar **Face ID sem código**; quem quiser o código aceita
digitá-lo uma vez por entrada.

**Ligar (o dono, no painel):** Authentication → Passkeys → *Enable Passkey authentication*, com Relying Party Display Name
`Dia a Dia RAC`, Relying Party ID `raynercarvalho.com.br` e Origins `https://raynercarvalho.com.br,https://www.raynercarvalho.com.br`.
Não troque o RP ID depois: as passkeys cadastradas param de funcionar. O endereço `github.io` e o `localhost` não podem usar
passkeys desse RP ID (por isso o teste real só acontece no domínio, no iPhone).

**Teste no iPhone (depois de publicar):** Safari → entrar com a senha → Segurança → Cadastrar o Face ID → sair → Entrar com Face ID.
Repetir no app instalado na tela de início (ele tem a sessão separada do Safari, mas usa as mesmas passkeys do iCloud).
A Fernanda faz o mesmo no iPhone dela, com a conta dela.

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

### RAC Knowledge (062)
`conhecimento` e `conhecimento_historico` (`docs/conhecimento.md`): só o dono (a casa fica de fora), trava "mfa", `anon` e `service_role` sem privilégio, histórico só de leitura para o site (gravado pelo gatilho, que também recusa texto que pareça chave, token, chave privada ou CPF) e sem DELETE pelo site. Entram no catálogo e no backup (só exportam). Conferência: `supabase/conferencias/062_conferir_producao.sql`.

### Catálogo da auditoria

Fase 2 · A6 (13/11/2026). Até a 048, `seguranca_estado()` tinha uma **lista fixa** de tabelas pessoais e precisava ser recriada a cada tabela
nova (022, 033, 038, 043 e 048). A migration `supabase/050_seguranca_catalogo.sql` troca a lista por um catálogo no banco,
`public.seguranca_catalogo` (tabela, `trava_mfa`, `backup`, origem, motivo), preenchido com as mesmas 44 tabelas pessoais de antes, as duas
que ficavam de fora de propósito (`ia_precos` e `rac_segredos`) e o próprio catálogo. Só quem roda migration no SQL Editor escreve nele
(RLS ligado, nenhuma política, nenhum privilégio para `anon`, `authenticated` e `service_role`). A auditoria passa a conferir a trava "mfa"
de toda tabela do catálogo com `trava_mfa` e ganha dois itens informativos: `fora_do_catalogo` (tabela que existe e ninguém classificou:
aparece na Auditoria do dono como pendência e **não** entra sozinha na conferência, porque uma tabela não é confiável só por existir) e
`catalogo_sem_tabela`. RLS, visitante sem login, cofres e funções abertas continuam conferidos do mesmo jeito.

**Situação: preparada e testada, NÃO aplicada em produção** (testes com Postgres de verdade no PGlite: `tests/seguranca_catalogo.test.mjs`).
Aplicar é livre ao agente (política de autonomia de 23/11/2026; antes era passo do dono): rodar a 050 inteira (Supabase MCP ou SQL Editor) (pode rodar de novo sem estragar nada), depois a
conferência só de leitura `supabase/conferencias/050_conferir_producao.sql` (tudo `true`), tirar a linha `-- status: pendente` do arquivo e
conferir a Auditoria no site (a linha "Catálogo da auditoria" aparece com ✓). Antes da 050 o site funciona igual: a linha só aparece quando
a função nova responde, e a Fernanda não vê a Auditoria. Desfazer: recriar `seguranca_estado()` com o texto da 048 e depois
`drop table public.seguranca_catalogo`.

**Tabela nova, depois da 050** (na própria migration que cria a tabela):

1. RLS ligado, `revoke all ... from anon` e a política restritiva "mfa", como sempre;
2. `insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('nova', true, true, 'NNN', 'por quê') on conflict (tabela) do nothing;`
   (`trava_mfa` = dado pessoal, exige a trava; `backup` = entra no backup do site; tabela sem dado pessoal: `false, false` e o motivo);
3. **não** recriar `seguranca_estado()`;
4. se `backup`, a tabela em `NUCLEO.SEG_TABELAS` (com pk/fk); e sempre em `tests/seguranca.test.mjs` (sem login não lê).

`tests/seguranca_catalogo.test.mjs` falha se uma migration depois da 050 criar tabela sem catalogá-la, se o `backup` do catálogo divergir de
`NUCLEO.SEG_TABELAS`, se uma tabela com trava não tiver a política "mfa" ou se faltar no teste de segurança com o banco real.

## Casa (Fernanda) e Finanças e compras (decisão do dono, 16/11/2026)

O dono pediu que a Fernanda (papel casa, `membros`) tenha **acesso igual ao dele em toda a área Finanças e compras** (Central de Compras, Alimentação, Compras online,
Central Fiscal). Antes, o Radar de Preços, os alertas de preço, a junção de produtos, o canal da nota e a leitura de nota por IA eram só do dono. Como ficou
(migration `supabase/057_casa_radar_fiscal.sql`, **proposta, não aplicada** até o dono rodar; conferência só de leitura em `supabase/conferencias/057_conferir_producao.sql`):

| Parte | Antes | Agora |
|---|---|---|
| `pessoal` | só o dono | a casa lê e grava **7 chaves** (a sétima, `mercado-areas`, é da migration 064, aplicada em 20/11/2026) na linha do dono (política "casa compartilha"): `radar-config`, `radar-pagos`, `radar-vinculos`, `mercado-equivalencias`, `mercado-alertas`, `mercado-canais`. A chave `mercado-areas` (áreas de consumo e categorias, 20/11/2026) é a 7ª, liberada à casa pela **064** (aplicada em 20/11/2026): dono e Fernanda leem e gravam a mesma linha. Qualquer outra chave continua invisível para ela |
| Radar (9 tabelas) | política "so o dono" (`dono = auth.uid()` e fora de `membros`) | política "casa" (`dono = dono_da_casa()`); linhas novas nascem do dono da casa; a trava "mfa" continua |
| Função `radar` | 403 `sem_permissao` para membro | a casa usa na conta do dono; a rotina e o push seguem só para o dono |
| Central Fiscal (foto/PDF, situação, entrada no Mercado) | as 3 funções recusavam quem não era o dono da casa; políticas restritivas "foto so dono"; tentativas e histórico só do dono | sem a linha "só o dono da casa" (editada dentro da definição existente: **não ativa a 039/040 se ainda não aplicadas**; rodar a 057 de novo depois de aplicá-las); sem as políticas "foto so dono"; a casa lê tentativas e histórico |
| IA fiscal (`fiscal.nota`) | `acoes.ts` só `dono`; trava `ia_config_fiscal_so_dono` | `acoes.ts` aceita `casa`; a trava do banco sai; **só liga quando o dono roda `supabase/058_ligar_ia_fiscal_casa.sql`** (acrescenta `fiscal.nota` em `acoes_casa` e `acoes_reais_casa`; arquivo à parte porque é a única parte que gera custo), com a casa em REAL |

**Continua só do dono:** importar do Gmail (usa o e-mail dele), custos de IA, Sistema, backup e restauração, RAC Hoje (`hoje.analise`), Newsletter (`newsletter.resumo`),
aviso de preço por push (a rotina trata só o dono) e a função `garmin` (não foi tocada). O MFA (`rac_aal_ok()`) vale para a casa em tudo isso.
**Custos:** a Fernanda passa a poder disparar buscas pagas do Radar (mesma chave, mesmo limite e mesma conta do dono) e, quando o dono ligar, a leitura fiscal por IA
(mesmo orçamento de IA da casa). **Dados compartilhados:** ela edita os mesmos produtos, lojas, vínculos, junções e ajustes de alertas do dono, não uma cópia.
**Ordem de publicação:** SQL (057) → função `radar` → função `rac-ia` → site; por último a 058 (liga a IA fiscal para a casa; o mesmo arquivo traz o comando de desligar).

### Central Fiscal: rotinas, consulta oficial e retomada (20/11/2026; migration 060 proposta, não aplicada; 061 reservada em `supabase/propostas/`; função `fiscal-consulta` não publicada e DESLIGADA por padrão)
- Tabela nova `notas_fiscais_consultas` (log das consultas oficiais): RLS ligado, sem `anon`, só `SELECT` para quem entrou (política da casa + trava restritiva "mfa"), no catálogo da auditoria e no backup (`SEG_TABELAS`, `dep: "060"`); **ninguém escreve direto**, só as funções `security definer` (`search_path` vazio). O `service_role` não herda privilégio de tabela: acessa só pelas funções, que só ele executa (`nf_validacao_pendentes`, `nf_validacao_registrar`, `nf_entradas_retomar`, `nf_entradas_reconciliar`, `nf_rotina_fiscal_sql`).
- **Situação fiscal só muda com evidência oficial** (origem `sefaz_ws`, mesma chave, cStat e protocolo válidos, evidência registrada); resultado sem evidência vira `invalida` e nada muda. Sem CPF no log (constraint `nf_tem_cpf`). Cancelamento posterior preserva compra e histórico.
- A função `fiscal-consulta` (consulta SEFAZ **não habilitada**: sem `FISCAL_CONSULTA_ATIVA=1` e certificado ela não consulta nem grava nada) entra só pela senha da rotina (`rac_rotina_ok`, Vault `rac_rotina`; nenhum segredo novo no banco); credenciais da SEFAZ (certificado e endereços) seriam **Secrets da função**, nunca no repositório nem no banco. Sem elas: "indisponível", nada muda. O portal público da SEFAZ não é raspado.
- O job `fiscal-entradas` (060, SQL, a cada 6 h) está no Monitor e no Documento 05; o `fiscal-validacao` (061) só existirá quando a consulta oficial for habilitada. Confirmação humana nunca é repetida nem criada pela rotina; a retomada usa as decisões já guardadas; a reconciliação só liga a compra existente (mesma chave) com `gera_despesa = false`.
- **Ordem:** 060 → site (a função e a 061 ficam para o lote da SEFAZ). Conferência: `supabase/conferencias/060_conferir_producao.sql`; diagnóstico: `060_diagnostico_notas.sql` (só leitura).

### Central Fiscal: confirmação única e a tabela `notas_fiscais_entradas` (16/11/2026; migration 059, proposta, não aplicada)
- Tabela nova **`notas_fiscais_entradas`** (uma linha por nota confirmada: quem clicou em "Estou de acordo", quando, as decisões de produto e o estado da entrada no Mercado): RLS ligado; política "casa" **só de leitura**; trava restritiva **"mfa"**; `revoke all` do anon e do authenticated e `grant select` só para quem entrou (**ninguém escreve direto**; só as funções); entra em `NUCLEO.SEG_TABELAS` (só exportar) e em `seguranca_estado()` (lista da trava "mfa").
- Funções `nota_fiscal_confirmar` e `nota_fiscal_entrada_mercado`: **SECURITY DEFINER** com `search_path` vazio (como a 037, para a trilha não ser forjável); conferem login, MFA (`rac_aal_ok()`) e a casa por conta própria e gravam sempre com `user_id = dono_da_casa()`; **dono e casa** (sem a linha "só o dono"). Os ajudantes `nf_mercado_lancar` e `nf_entrada_processar` **não são executáveis** por quem entrou. `anon` não executa nenhuma. Não chamam IA, não criam despesa e não alteram `notas_fiscais` nem os itens originais.
- A 059 **não enfraquece** RLS, MFA, validações nem a proteção do Storage; a gravação fiscal continua sendo a da 034/037/039. Limite conhecido: as funções chamadas por dentro rodam com o dono da função (RLS não se aplica ao que elas gravam; por isso cada gravação filtra a casa explicitamente e a validação de MFA/login é refeita).
- **Ordem:** 034 → 037 → 038 → 039 → (057, para a Fernanda gravar foto/PDF) → **059** → site. Depois: `supabase/conferencias/059_conferir_producao.sql`. A 040 foi substituída e **não deve ser aplicada**.

## Implantação (nesta ordem)

1. `node --test tests/*.test.mjs` passando.
2. SQL Editor: rodar `supabase/022_seguranca.sql` inteiro (pode rodar de novo). Depois, tirar a linha `-- status: pendente` do arquivo.
3. Conferir em Authentication → Multi-Factor que o TOTP está ligado (vem ligado) e ligar as Passkeys (seção Face ID acima).
4. `git push` (versão `2026-10-31.6`).
5. No site: Segurança → conferir a Auditoria (tudo ✓), baixar um backup, abrir a prévia da restauração com ele (deve dar tudo "igual").
6. Cadastrar o Face ID no iPhone (Safari e app instalado) e testar sair/entrar; a Fernanda faz o mesmo na conta dela.
7. Opcional: ativar o código (TOTP) e cadastrar um app reserva (com ele, o Face ID pede o código uma vez por entrada).

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
