# RAC · 16 · Arquitetura de identidade e compartilhamento

Documento 5 do conjunto Novo RAC (Lote 0, 27/11/2026). Define usuários, espaços, propriedade e permissões para o novo RAC. Parte do estado real descrito na
[seção 6 do diagnóstico](12-diagnostico-do-rac-atual.md#6-identidade-e-permissões-fato-salvo-onde-marcado). **[Recomendação]; nenhuma migration foi criada neste lote.**
Decisões `N-xx`: [Registro](19-registro-de-decisoes.md).

## 1. Por que isto é fundação e não detalhe

Hoje existem só dois papéis (`dono`, `casa`) calculados no navegador e **uma casa por dono**: o conteúdo é "do dono" ou "da casa" (`dono_da_casa()`). Isso resolve o uso atual, mas **não** permite:
(a) mais de um espaço, (b) compartilhar uma página ou um projeto com uma pessoa específica, (c) níveis de acesso (ver, editar, administrar), (d) preferências de interface por pessoa **com** propriedade de dados clara.
Uma preferência de interface (esconder um bloco) **não** decide quem pode ler um dado: quem decide é o banco. Por isso o novo RAC nasce com um modelo de **espaços e permissões no banco** (N-09, N-10).

## 2. As três situações de conteúdo

| # | Situação | Definição | Quem lê | Quem edita |
|---|---|---|---|---|
| 1 | **Privado do usuário** | `espaco_id` do **espaço pessoal** do usuário (ou nulo) e `criado_por = usuário` | só o dono | só o dono |
| 2 | **Compartilhado entre usuários autorizados** | Um **recurso específico** (página, projeto, item da Biblioteca) com **concessões** explícitas a pessoas | dono + concedidos | conforme o papel concedido |
| 3 | **Pertencente a um espaço compartilhado** | O conteúdo é **do espaço** (não de uma pessoa): `espaco_id` de um espaço compartilhado | membros conforme o papel | conforme o papel |

A diferença entre 2 e 3: em 2 o dono continua **dono** e empresta acesso; em 3 o conteúdo é **coletivo** e sobrevive à saída de um membro (a casa é o caso típico, como hoje).

## 3. Modelo proposto

```text
espacos             id, tipo ('pessoal'|'compartilhado'), nome, criado_por, criado_em, arquivado_em
espaco_membros      espaco_id, user_id, papel ('visualizador'|'editor'|'administrador'), convidado_por, desde, estado ('ativo'|'convite'|'removido')
espaco_modulos      espaco_id, modulo (id de rota), habilitado     -- o que o espaço oferece (hoje: DA_CASA para a casa)
concessoes          recurso_tipo, recurso_id, user_id, papel ('visualizador'|'editor'), concedido_por, desde   -- situação 2
usuario_prefs       user_id, chave, valor jsonb                    -- preferências pessoais de interface (tema, página inicial, atalhos)
```

Funções de apoio (SQL, `security definer`, `search_path` fixo, no molde de `dono_da_casa()` e `rac_aal_ok()`):
`rac_meus_espacos()`, `rac_papel_no_espaco(espaco)` e `rac_pode(recurso_tipo, recurso_id, nivel)`. Toda política nova usa estas funções.

### 3.1 Regra geral de acesso para tabelas novas

```text
leitura:  criado_por = auth.uid()  (espaço pessoal)
       OU rac_papel_no_espaco(espaco_id) em (visualizador, editor, administrador)
       OU existe concessão para o recurso
escrita:  espaço pessoal → só o dono; espaço compartilhado → editor ou administrador; concessão → papel 'editor'
admin:    membros, módulos do espaço, desativar tipos de widget, arquivar páginas → administrador
em todas: política restritiva "mfa" (rac_aal_ok), sem acesso para anon, backup e catálogo de segurança
```

### 3.2 Propriedade dos registros

- `criado_por` registra **quem criou** (já existe em `registros`). `espaco_id` registra **de quem é**. Um registro **nunca muda de espaço por efeito colateral**; mover é uma ação explícita, com registro de auditoria (`seguranca_eventos` ou equivalente).
- Excluir o espaço **não** apaga conteúdo automaticamente: o conteúdo exige destino (mover para o espaço pessoal do criador) ou exclusão confirmada.
- Remover um membro **não** apaga o que ele criou no espaço (continua do espaço); o conteúdo da situação 2 volta a ser exclusivo dele.

## 4. Compatibilidade com o que existe (migração em duas camadas)

| Camada | Estratégia | Quando |
|---|---|---|
| **Tabelas novas** (workspace, captura, biblioteca, projetos, lugares) | Nascem **já com `espaco_id`** e as políticas da seção 3.1 | Lotes 1 a 7 |
| **Tabelas legadas** (`mercados`, `produtos`, `notas`, `itens`, `registros`, `lista`, `bebe`, `pessoal` com 7 chaves) | Continuam com `user_id = dono_da_casa()` e `membros`. Seed: o espaço compartilhado "Casa" é criado **a partir de `membros`**, com o dono como administrador e a Fernanda como editor, **sem alterar nenhuma linha legada** | Lote 1 (seed) |
| **Consolidação** | Adicionar `espaco_id` às tabelas legadas, preenchido pelo espaço "Casa", e reescrever as políticas para o modelo novo, mantendo `dono_da_casa()` como alias durante a transição; só então remover o `PAPEL` fixo do cliente | Fase 8 (lote próprio, com testes de regressão da Fernanda) |

Consequência: **nenhum dado nem política existente muda antes da Fase 8**. O risco de regressão fica concentrado num único lote, com prévia, backup e rollback.

## 5. Experiência familiar flexível (casos de uso)

1. **Rayner** (administrador do espaço "Casa" e do pessoal): vê tudo o que vê hoje; monta páginas pessoais e compartilhadas.
2. **Fernanda** (editora do espaço "Casa"): continua vendo exatamente as telas de hoje (Mercado, Fiscal, Lista, Olivia, Eddie, Veículos, Documentos, Rede, Segurança) por `espaco_modulos`; ganha **páginas e preferências próprias** na Fase 8, sem acesso a e-mail, saúde pessoal do dono, Inbox, custos de IA etc.
3. **Nova pessoa** (ex.: um familiar): convidada ao espaço "Casa" como **visualizador** (vê a lista e a agenda, não edita) ou a **um projeto** (concessão), sem ver o resto.
4. **Espaço "Viagem" ou "Reforma"**: criado pelo dono, com membros e módulos escolhidos (Projetos, Biblioteca, Mapa, Lista), encerrado e arquivado depois.
5. **Preferências independentes:** cada pessoa tem tema, página inicial, widgets ocultos em páginas compartilhadas e atalhos próprios (`usuario_prefs`, `workspace_pessoal`), **sem alterar o que os outros veem**.

## 6. O que nunca pode vazar (regras de privacidade)

- **P-1.** Widgets, Timeline, Busca, Mapa e Intelligence leem **com a sessão de quem vê**; nunca por `service_role` em nome de outra pessoa. Rotinas de servidor (push, sinais, IA) filtram **explicitamente** por espaço e destinatário e têm teste.
- **P-2.** Conteúdo privado (saúde do dono, e-mail, conhecimento, custos) é **tipo não compartilhável**: o catálogo de widgets e provedores marca `compartilhavel:false` e o motor recusa colocá-lo em página de espaço compartilhado.
- **P-3.** Um membro que perde acesso deixa de ver o conteúdo na próxima leitura (RLS), inclusive em páginas que ainda o referenciam (aparece "sem acesso", sem título).
- **P-4.** Títulos, resumos de Timeline, resultados de busca e prévias de Captura passam pelo **mesmo filtro de permissão** dos dados (não vazam existência).
- **P-5.** A IA recebe apenas fatos que **o usuário que pediu** pode ver, nunca dados de outro membro ou de espaço diferente do ativo (Documento 17).
- **P-6.** Concessões e mudanças de papel geram evento de auditoria; convites expiram.

## 7. Identidade do usuário e autenticação

- Mantém: Supabase Auth com senha, TOTP e passkey; `rac_aal_ok()` em tabelas pessoais. **Convites** usam o fluxo de contas do Supabase (conta criada pelo administrador do projeto; **o cadastro aberto continua desligado**, a verificar: ver "Hipótese" no diagnóstico).
- **Perfil:** nome de exibição, foto opcional e fuso (padrão `America/Sao_Paulo`) em `usuario_prefs`; sem dado civil (CPF, endereço etc. nunca no repositório).
- **Sessão ativa e espaço ativo:** o cliente guarda o espaço ativo (padrão: pessoal); trocar de espaço muda o contexto de widgets, Captura e Busca, mostrado **sempre** na interface (selo do espaço), para ninguém gravar no lugar errado.

## 8. Permissões por módulo

Hoje: `casa: true` em `js/rotas.js` (11 rotas) e política por tabela. No novo modelo: `espaco_modulos` diz o que **o espaço** oferece, e o papel diz o que **a pessoa** pode fazer dentro dele.
A tela **continua** só escondendo o que o RLS já recusa; a regra de segurança jamais depende do cliente (N-09). O teste de rotas (`tests/rotas.test.mjs`) passa a verificar também as permissões derivadas de `espaco_modulos`.

## 9. Riscos e casos extremos (Grill Me)

| Risco | Tratamento |
|---|---|
| Migração das tabelas legadas quebra a Fernanda | Fase 8 em lote próprio, com seed idempotente, prévia, comparação antes × depois (como na Fase 2) e rollback; até lá nada legado muda |
| Um administrador se remove e o espaço fica sem dono | Regra no banco: sempre ao menos 1 administrador ativo (restrição por função/gatilho) |
| Concessão a um recurso que depois muda de espaço | Mover recurso revoga concessões e exige confirmação |
| Conflito: o mesmo `user_id` como `membro` do legado e `editor` do novo | Mapeamento único gerado do seed; `membros` segue sendo a fonte do legado até a Fase 8 |
| Convite a uma pessoa que não tem conta | Conta criada pelo administrador do projeto (sem cadastro aberto); convite pendente até a primeira entrada |
| Função `security definer` mal escrita vaza dados | `search_path` fixo, sem SQL dinâmico, teste de política em PGlite para cada papel (visualizador, editor, administrador, de fora) |
| Backup e restauração de tabelas de espaço | Entram em `NUCLEO.SEG_TABELAS`; restauração nunca sobrescreve sem marcar e nunca recria permissões sem prévia (regra existente) |
| IA e push enxergando espaço errado | P-1 e P-5, com teste que simula dois espaços e dois usuários |

## Estado de implementação (Lote 1, 27/11/2026)

O modelo desta página foi implementado no Lote 1 pela migration `supabase/070_espacos_e_workspace.sql` (**aplicada em produção em 27/11/2026**, hash do corpo das 14 funções conferido contra o arquivo; testes: `tests/espacos_sql.test.mjs`, 18 casos em Postgres de verdade).
O que mudou em relação à proposta de 27/11/2026 (Lote 0) e por quê:

| Proposta (Lote 0) | Implementado (Lote 1) | Motivo |
|---|---|---|
| Papéis administrador, editor, **visualizador** | **proprietário** (o `dono` do espaço, nunca em `espaco_membros`), administrador, editor e **leitor** | pedido do dono no Lote 1; o proprietário é intocável e não depende de uma linha que alguém possa apagar |
| Casa legada com participantes copiados de `membros` | **Derivada ao vivo**: em `espacos.casa_de`, a Fernanda é editora enquanto existir a linha em `membros`; nenhuma cópia, nenhum sincronismo | tirar a linha de `membros` tira o acesso na mesma leitura (testado); sem janela de acesso velho |
| Tabelas `concessoes`, `espaco_modulos` e `usuario_prefs` | **Adiadas**: ainda não há quem as use. As preferências por pessoa moram em `workspace_pessoal` | "não criar tabelas desnecessárias"; entram junto do primeiro consumidor (Lotes 4, 7 e 8) |
| Alterar participantes por funções | Idêntico: `rac_espaco_criar`, `rac_espaco_membro_definir`, `rac_espaco_membro_remover`, `rac_espaco_arquivar`, `rac_iniciar_espacos` e `rac_espaco_membros` (leitura); nenhuma tabela de espaço aceita INSERT, UPDATE ou DELETE direto do site | a regra fica numa porta só, testada |

**Regras que o banco impõe (todas com teste):** (1) quem é de fora não vê espaço, página, versão nem preferência alheia, e "sem acesso" é igual a "não existe"; (2) ninguém altera o próprio papel; (3) o administrador não cria, rebaixa nem remove outro administrador;
(4) o proprietário não pode ser alterado nem removido; (5) o espaço pessoal e a Casa legada não aceitam participantes explícitos e não são arquivados; (6) espaço arquivado é só leitura; (7) cada função exige login **e** a segunda etapa (MFA), porque funções `security definer`
não passam pela trava restritiva das tabelas; (8) no máximo 10 espaços compartilhados por proprietário e 30 páginas ativas por espaço; (9) a página nunca muda de espaço nem de autor; (10) `espacos.dono` e `workspace_paginas.criado_por` usam `on delete restrict`:
apagar um usuário que ainda é dono de espaço é recusado pelo banco (decisão consciente: nada some por efeito colateral; exige destino explícito).
**Cadastro público do Supabase: DESATIVADO** (confirmado pelo dono em 27/11/2026; a hipótese do diagnóstico está resolvida). Nenhum caminho novo de cadastro ou de convite por e-mail foi criado: participantes entram por `user_id` de contas já existentes.

**Ainda não existe (próximos lotes):** convite por e-mail e tela de membros (Lote 8), compartilhamento de um recurso específico (`concessoes`), `espaco_id` nas tabelas legadas e fim do `PAPEL` fixo no cliente (Lote 8), transferência de propriedade.
**Risco residual:** o cliente ainda decide o que mostrar pelo `PAPEL` (legado); os widgets novos dependem só do RLS. Remover contas em `auth.users` que sejam donas de espaço exige antes mover ou arquivar o espaço.
