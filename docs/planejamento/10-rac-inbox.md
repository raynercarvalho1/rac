# RAC · 10 · RAC Inbox — Caixa de E-mail Inteligente

Data da decisão: 13/11/2026  
Estado: **proposta aprovada pelo dono; não implementada**.  
Prioridade: **próxima grande frente após a conclusão da modernização da Saúde (S1–S5)**.  
Objetivo de produto: tornar o RAC o cliente principal de e-mail do dono e permitir que o Spark seja desinstalado somente depois de uma substituição comprovada no uso real.

## 1. Visão e objetivo

O RAC Inbox não será apenas um cartão que reúne links ou uma tela que lê mensagens. Será um **cliente de e-mail completo, multicon­ta e inteligente**, integrado ao restante do RAC.

A experiência deverá permitir administrar diretamente as caixas Gmail, Outlook/Microsoft e iCloud, respeitando as capacidades reais de cada provedor. O usuário não deve precisar voltar ao Spark para tarefas cotidianas como responder, enviar, arquivar, excluir, marcar spam, organizar pastas ou administrar filtros.

A meta é superar a experiência atual do Spark no uso diário, com controle real sobre as contas originais e com funcionalidades de inteligência que agreguem valor ao RAC.

**Princípios de produto**

1. **A caixa original é a fonte da verdade.** Uma ação apresentada como concluída precisa ter sido aceita pelo provedor. Uma regra local do RAC nunca deve ser apresentada como regra nativa da Apple, Google ou Microsoft.
2. **Uma interface, conectores independentes.** O usuário vê uma caixa unificada, mas cada operação é executada pelo adaptador correto e na conta certa.
3. **Paridade honesta.** Mostrar quais recursos são nativos, quais são executados pelo RAC e quais não estão disponíveis naquele provedor.
4. **Controle do dono.** A IA sugere; o usuário aprova ações que alteram mensagens, pastas, filtros ou enviam e-mails.
5. **Segurança antes da conveniência.** Tokens e senhas nunca ficam no JavaScript, no HTML ou no `localStorage`.
6. **Degradação clara.** Uma conta desconectada ou uma API indisponível não pode fazer as outras caixas parecerem vazias ou saudáveis.

## 2. Provedores e viabilidade inicial

| Provedor | Conector previsto | Capacidades comprovadas na documentação | Ponto a validar |
|---|---|---|---|
| Gmail | Gmail API + OAuth | Listar e ler mensagens, alterar marcadores, mover para lixeira, restaurar, enviar, acessar anexos e criar/listar/excluir filtros | Scopes mínimos, consentimento OAuth, verificação do app e limites de API |
| Outlook, Hotmail e Live | Microsoft Graph + OAuth | Ler, responder, encaminhar, enviar, mover mensagens entre pastas, excluir e criar/listar regras da Caixa de Entrada | Scopes delegados mínimos, diferenças entre contas pessoais e corporativas e comportamento de spam |
| iCloud Mail | IMAP/SMTP + senha específica do app ou autorização compatível | A Apple documenta IMAP para entrada e SMTP para saída; pastas e operações de mensagem dependem das capacidades efetivas do servidor | Conexão IMAP/SMTP a partir da infraestrutura escolhida, movimentação para lixo/spam, flags, pastas especiais e sincronização |

### 2.1 Gmail

A integração existente em `js/app.js` é somente leitura e está limitada ao Gmail. Ela usa Google Identity Services no navegador e mantém token de curta duração no aparelho. Isso é insuficiente para o novo produto.

O RAC Inbox deverá migrar para fluxo OAuth apropriado ao servidor, com autorização por conta, renovação segura e scopes separados por capacidade. A seleção de scopes deve seguir o menor privilégio possível: leitura e alteração de mensagens, envio e administração de filtros não precisam ser tratados como uma permissão indistinta.

A API documenta operações para mensagens, marcadores, lixeira, restauração, envio, anexos e filtros. O filtro nativo do Gmail deverá ser criado e administrado na própria conta, não apenas simulado no RAC.

### 2.2 Outlook / Microsoft

Usar Microsoft Graph com autorização OAuth delegada. A arquitetura deverá pedir permissões progressivamente, conforme o dono habilitar os recursos: leitura e gravação de mensagens, envio e administração de regras da Caixa de Entrada.

A API documenta operações de movimentação de mensagens entre pastas, envio de mensagens e criação/listagem de regras. O RAC deverá preservar as regras e pastas já existentes no Outlook, sem substituí-las por um espelho próprio.

### 2.3 iCloud

A integração iCloud é viável para uma primeira versão de cliente de e-mail via IMAP/SMTP. A Apple documenta:

- Entrada: `imap.mail.me.com`, porta 993, SSL.
- Saída: `smtp.mail.me.com`, porta 587, SSL/TLS ou STARTTLS.
- Senha específica do aplicativo; a conta Apple precisa ter autenticação de dois fatores.

**Risco técnico importante:** o exemplo oficial do Supabase para SMTP alerta que o runtime usado por Edge Functions não permite conexões de saída às portas 25 e 587. Como a Apple documenta a porta 587 para SMTP, não se deve assumir que o envio iCloud funcionará diretamente por uma Edge Function. Antes de decidir a arquitetura, executar uma prova de conceito de IMAP na porta 993 e SMTP na porta 587 a partir do ambiente real. Se houver bloqueio, avaliar um serviço de conexão controlado, outra infraestrutura de execução ou alternativa oficialmente suportada. Não armazenar senha no cliente para contornar a restrição.

A Apple não documenta uma API pública equivalente à API de filtros do Gmail ou às regras do Outlook. Portanto, o RAC não deverá prometer criação de regras nativas do iCloud. Poderá oferecer **regras gerenciadas pelo RAC**, com execução em serviço ativo e sincronização periódica. O usuário deverá saber que essas regras dependem do serviço do RAC estar funcionando e não serão necessariamente visíveis na interface do iCloud.com.

A paridade do iCloud será avaliada por recurso. Limitações pequenas podem ser aceitas; receber, enviar, responder e organizar as mensagens de forma confiável são requisitos essenciais para substituir o Spark.

## 3. Escopo funcional

### 3.1 Núcleo obrigatório — cliente de e-mail

A primeira versão utilizável deverá contemplar:

- Conectar várias contas Gmail, Outlook e iCloud.
- Caixa unificada e visão por conta.
- Identificação clara da conta de origem e do endereço remetente.
- Pastas e marcadores/categorias disponíveis em cada provedor.
- Lista de conversas, leitura de mensagens e encadeamento de respostas.
- Pesquisa por remetente, destinatário, assunto, texto, período, conta e presença de anexo, respeitando os recursos de cada conector.
- Compor, responder, responder a todos, encaminhar, salvar rascunho e enviar.
- Escolher explicitamente a conta remetente ao compor.
- Anexar arquivos e visualizar ou baixar anexos recebidos.
- Marcar como lido/não lido, sinalizar/importância quando suportado, arquivar, mover e excluir.
- Lixeira e restauração quando o provedor permitir.
- Marcar como spam/lixo eletrônico e retirar dessa pasta quando o provedor permitir.
- Atualizar e sincronizar sem duplicar mensagens.
- Informar estado de cada conta: conectada, sincronizando, atrasada, erro de autenticação ou desconectada.

Uma mensagem nunca poderá ser alterada na conta errada por causa de IDs coincidentes entre provedores. Toda operação deverá carregar identificador do provedor, identificador da conta e ID original da mensagem.

### 3.2 Administração e filtros

- Criar, editar, ativar, desativar, ordenar e excluir filtros.
- Condições por remetente, domínio, destinatário, assunto, palavras-chave, presença de anexo e conta.
- Ações: mover para pasta, aplicar marcador/categoria, marcar como lido, arquivar e enviar para spam quando suportado.
- Exceções e ordem de execução, quando disponíveis no provedor.
- Regras nativas no Gmail e Outlook sempre que a API permitir.
- Regras gerenciadas pelo RAC para o iCloud, claramente identificadas como externas às regras nativas da Apple.
- Prévia obrigatória antes de aplicar uma regra retroativamente: quantidade de mensagens encontradas e amostra das correspondências.
- Separar "aplicar somente a novas mensagens" de "aplicar também às mensagens existentes".
- Nenhuma regra destrutiva ou em massa será ativada sem confirmação explícita.

O RAC deverá manter um modelo comum de regras e traduzir cada uma para a capacidade nativa do provedor quando existir. Quando não existir, deverá declarar que a regra será executada pela infraestrutura do RAC e explicar sua dependência de sincronização ativa.

### 3.3 Organização e produtividade

Itens desejáveis para a evolução do núcleo:

- Categorias inteligentes: pessoal, trabalho, financeiro, compras, entregas, newsletters, notificações e promoções.
- Ações em massa com prévia e desfazer quando possível.
- Adiar mensagem e reapresentar na data escolhida.
- Lembrete de acompanhamento para mensagens enviadas sem resposta.
- Envio programado e janela curta de desfazer envio, quando a arquitetura conseguir garantir a execução e o cancelamento.
- Gerenciamento de newsletters e sugestões de cancelamento de inscrição.
- Histórico de conversas por contato, mesmo quando mensagens chegam por contas diferentes.
- Biblioteca de anexos com filtros por tipo, conta, remetente e data.
- Assinaturas por conta e identidade de envio.
- Notificações configuráveis por conta e categoria.

Não anunciar cancelamento de inscrição como concluído apenas porque o RAC ocultou mensagens. A ação deverá seguir o mecanismo real de cancelamento ou, se indisponível, explicar a alternativa.

## 4. Inteligência do RAC Inbox

A IA será uma camada de interpretação e assistência, não um substituto para os conectores nem para as regras de negócio.

### 4.1 Casos de uso

- Responder perguntas em linguagem natural: "Quais e-mails precisam da minha atenção hoje?", "Encontre o e-mail sobre o ar-condicionado Samsung", "Quais recrutadores me escreveram no último mês?".
- Resumir conversas longas preservando remetentes, datas, decisões e pendências.
- Classificar mensagens e detectar assuntos prioritários.
- Extrair datas, valores, vencimentos, códigos de rastreio, números de pedido e compromissos.
- Identificar newsletters e remetentes recorrentes que podem receber filtros.
- Sugerir regras a partir de padrões de organização repetidos pelo dono.
- Sugerir respostas e rascunhos; nunca enviar sem comando explícito.
- Identificar mensagens que aguardam resposta ou que merecem acompanhamento.

### 4.2 Fluxo seguro de inteligência

1. A coleta/sincronização obtém os dados da conta por meio do conector.
2. Regras determinísticas fazem normalização, deduplicação e classificações simples.
3. A IA recebe somente o conteúdo necessário para a tarefa solicitada e devolve resultado estruturado.
4. O RAC mostra a mensagem original e a evidência usada, além da sugestão.
5. O dono confirma qualquer ação que altere a caixa ou outro módulo.

Não enviar a caixa inteira à IA por padrão. Não enviar anexos, conversas completas ou informações sensíveis quando um conjunto mínimo de metadados for suficiente. O RAC Intelligence deverá operar por chamada a pedido ou por regra claramente autorizada, com orçamento, registro de uso e controles de privacidade existentes no projeto.

### 4.3 Integração com o restante do RAC

| Tipo de mensagem | Destino sugerido |
|---|---|
| Vagas, recrutadores e entrevistas | Carreira |
| Compra, pedido, nota e comprovante | Central de Compras |
| Código de rastreio e atualização de entrega | Encomendas / RAC Hoje |
| Boleto, cobrança e vencimento | Finanças / Agenda |
| Convite, reunião e compromisso | Agenda |
| Newsletter e conteúdo | Informação |
| Mensagem pessoal importante | RAC Hoje, como sugestão ou lembrete |

O fluxo inicial é sugerir e aguardar confirmação. Não criar despesas, alterar compras, cadastrar compromissos ou mover mensagens automaticamente sem uma autorização configurada.

## 5. Arquitetura proposta

O RAC continua com HTML, CSS e JavaScript ES5 puro no front-end. O Inbox deverá ser um módulo isolado, sem transformar `js/app.js` num arquivo de implementação de e-mail.

Peças lógicas propostas:

| Peça | Responsabilidade |
|---|---|
| js/inbox.js (arquivo previsto para a fase de implementação) | Interface, navegação, lista, leitura, composição e ações |
| Adaptadores por provedor | Contrato comum para Gmail, Microsoft Graph e IMAP/SMTP |
| Camada de autenticação | OAuth, callbacks, renovação e revogação de acesso |
| Serviço de sincronização | Novas mensagens, atualizações, cursores, deduplicação e reconciliação |
| Serviço de ações | Envio, resposta, arquivamento, lixeira, spam, pastas e filtros |
| Normalizador | Formato interno comum sem apagar os campos originais do provedor |
| Serviço de regras | Regras nativas e regras gerenciadas pelo RAC |
| Serviço de IA | Classificação, resumo, extração e sugestões |
| Integrações RAC | Interfaces controladas para Carreira, Compras, Agenda e RAC Hoje |

### 5.1 Modelo de dados

O desenho definitivo dependerá da prova de conceito, mas deverá distinguir:

- Conta conectada e provedor.
- Estado da autorização e escopos concedidos.
- Tokens e credenciais protegidos, fora das tabelas públicas e do front-end.
- Cursor/estado de sincronização por conta e pasta.
- Metadados mínimos necessários para a caixa unificada e busca.
- Regras do RAC e associação entre regra interna e regra nativa.
- Registro de ações executadas e resultado confirmado pelo provedor.
- Sugestões e classificações de IA, separadas do conteúdo original.

Não persistir cópias completas de todas as mensagens e anexos por padrão. A decisão de indexar conteúdo para busca global deverá considerar privacidade, volume, retenção, custo e capacidade de apagar a cópia local sem apagar a mensagem original.

A necessidade de migrations e tabelas próprias deverá ser demonstrada na arquitetura técnica. Nenhuma migration será aplicada em produção sem autorização específica.

### 5.2 Autenticação e credenciais

- OAuth com `state`, validação de retorno, proteção contra CSRF e fluxo apropriado ao servidor.
- Tokens de acesso curtos e renovação segura quando o provedor oferecer refresh token.
- Credenciais iCloud armazenadas em cofre seguro, com acesso restrito e opção de revogar/remover a conta.
- Nunca gravar tokens, senhas ou códigos de autorização em `localStorage`, arquivos públicos, logs ou mensagens de erro.
- Escopos progressivos: leitura primeiro; gravação e envio somente quando o dono ativar esses recursos.
- Isolamento por conta e por usuário, com validação de autorização em toda operação.
- Revogação/desconexão remove o acesso e interrompe a sincronização futura.

### 5.3 Sincronização

A sincronização deverá ser incremental e idempotente, com cursor por conta/pasta, tratamento de exclusões e alterações, retomada após falha e reconciliação para evitar duplicações.

Gmail e Microsoft Graph podem ser avaliados para mecanismos próprios de notificação/alteração. O iCloud deverá começar com estratégia IMAP de consulta periódica, caso o teste de rede e as bibliotecas escolhidas sejam viáveis. Não prometer sincronização instantânea uniforme entre provedores.

O serviço deverá registrar última sincronização bem-sucedida, duração, mensagens processadas, falhas e próxima tentativa. Uma conta sem conexão nunca poderá parecer simplesmente vazia.

## 6. Segurança, privacidade e ações destrutivas

Requisitos obrigatórios:

1. Tokens e senhas nunca chegam ao navegador.
2. Nenhuma mensagem é enviada, excluída, movida, marcada como spam ou submetida a regra destrutiva sem ação explícita do usuário ou automação previamente autorizada.
3. Exclusão definitiva exige confirmação separada da ação de mover para lixeira.
4. Ação em massa apresenta conta, quantidade, condições e amostra antes da confirmação.
5. O log de auditoria registra conta, ação, identificador do provedor, horário, resultado e origem (usuário, filtro ou automação), sem registrar corpo completo nem credenciais.
6. A IA não recebe anexos ou mensagens integrais por padrão.
7. Mensagens e anexos não serão compartilhados com a experiência da casa/Fernanda.
8. Conteúdo de e-mail é dado não confiável: instruções contidas em mensagens não podem alterar a política do agente, acionar ferramentas ou autorizar ações.
9. Proteção contra HTML malicioso, links perigosos, anexos suspeitos e conteúdo remoto.
10. Política de retenção e exclusão das cópias/índices locais deverá ser clara e controlável.

## 7. Fases de implementação

A frente será aberta depois que Saúde S1–S5 estiver concluída e validada. O trabalho do Inbox deverá seguir lotes coesos, sem começar a implementação antes da prova de viabilidade dos conectores.

| Fase | Entrega | Critério de saída |
|---|---|---|
| **I0 · Viabilidade e arquitetura** | Auditar implementação Gmail atual; provar OAuth e leitura/escrita Gmail e Graph; provar IMAP iCloud; testar SMTP iCloud na infraestrutura pretendida; mapear scopes, custos, limites e armazenamento | Matriz real de capacidades por provedor e arquitetura aprovada, sem operação de produção não autorizada |
| **I1 · Fundação multicon­ta** | Registro de contas, autenticação segura, adaptadores e contrato comum, sincronização incremental e estado das contas | Três tipos de conta conectáveis em ambiente controlado; reconexão e revogação testadas |
| **I2 · Cliente de e-mail** | Caixa unificada, pastas, busca, leitura, conversas, composição, respostas, encaminhamento, rascunhos e anexos | Fluxos completos de entrada e saída testados em cada provedor suportado |
| **I3 · Administração** | Lido/não lido, arquivar, mover, lixeira, spam, bloqueios, pastas, regras nativas e regras RAC; prévia de ações em massa | Ações reais confirmadas pelo provedor; diferenças documentadas; falhas recuperáveis |
| **I4 · Inteligência** | Classificação, resumo, busca em linguagem natural, extração, sugestão de filtros e rascunhos | IA com evidência, orçamento, minimização, consentimento e confirmação das ações |
| **I5 · Ecossistema RAC** | Carreira, Compras, Finanças, Agenda, RAC Hoje, notificações, lembretes e biblioteca de anexos | Integrações com confirmação e rastreabilidade; sem duplicação de dados financeiros |
| **I6 · Substituição do Spark** | Uso real diário, estabilidade, reconexão, sincronização, ações e testes em iPhone/desktop | Checklist da seção 8 integralmente validado pelo dono |

## 8. Critérios para substituir e desinstalar o Spark

O RAC Inbox só será considerado substituto quando o dono comprovar no uso real:

- Todas as contas desejadas estão conectadas e sincronizam de forma confiável.
- Receber, enviar, responder, responder a todos e encaminhar funcionam em cada conta.
- Rascunhos, enviados, anexos, conversas e busca funcionam.
- Pastas, arquivamento, spam, lixeira e restauração funcionam conforme a capacidade de cada provedor.
- Filtros nativos e regras RAC estão claramente identificados e executados no lugar correto.
- Ações em massa mostram prévia e têm comportamento previsível.
- Notificações são confiáveis e configuráveis por conta.
- Reconexão após expiração/revogação não perde estado nem duplica mensagens.
- Testes de sincronização entre RAC e os clientes originais não mostram perda, duplicação ou alteração inesperada.
- O uso no iPhone e desktop atende à rotina real do dono.
- Limitações do iCloud estão documentadas e foram aceitas conscientemente.

**Até cumprir esses critérios, manter Spark instalado como contingência.** A desinstalação será decisão posterior do dono, baseada em uso real, não no simples lançamento do Inbox.

## 9. Fora do escopo inicial

- Migrar ou apagar mensagens do provedor original.
- Substituir provedores de e-mail ou alterar DNS/domínios.
- Enviar e-mails automaticamente por decisão da IA.
- Exclusão permanente automática, bloqueios em massa ou regras destrutivas sem aprovação.
- Compartilhar e-mails ou anexos com a conta da casa.
- Armazenar todo o histórico ou todos os anexos no Supabase sem necessidade demonstrada.
- Criar regra nativa de iCloud sem API documentada e validada.
- Prometer paridade absoluta entre os provedores antes das provas de conceito.
- Começar RAC Inbox antes do encerramento da frente atual Saúde S1–S5.

## 10. Referências técnicas oficiais

As capacidades devem ser reconfirmadas na fase I0, pois APIs, scopes, limites e políticas podem mudar.

- Google Gmail API: https://developers.google.com/workspace/gmail/api/reference/rest
- Google Gmail API — OAuth scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Microsoft Graph — visão geral de e-mail: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0
- Microsoft Graph — mover mensagem: https://learn.microsoft.com/en-us/graph/api/message-move?view=graph-rest-1.0
- Microsoft Graph — enviar mensagem: https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0
- Microsoft Graph — criar regras da Caixa de Entrada: https://learn.microsoft.com/en-us/graph/api/mailfolder-post-messagerules?view=graph-rest-1.0
- Microsoft Graph — listar regras: https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messagerules?view=graph-rest-1.0
- Apple — ajustes IMAP/SMTP do iCloud Mail: https://support.apple.com/en-us/102525
- Apple — senhas específicas de apps: https://support.apple.com/en-us/102654
- Supabase — Edge Functions: https://supabase.com/docs/guides/functions
- Exemplo oficial Supabase de SMTP e observação sobre portas de saída: https://github.com/supabase/supabase/tree/master/examples/edge-functions/supabase/functions/send-email-smtp

## 11. Decisão e prioridade

Em 13/11/2026, o dono aprovou o RAC Inbox como **próxima grande frente após a conclusão da Saúde S1–S5**, e como prioridade máxima do desenvolvimento posterior.

A entrega deverá ser um cliente de e-mail real, multicon­ta, com administração das caixas originais e inteligência integrada. A aceitação de limitações pequenas do iCloud é permitida após prova técnica e alinhamento; falhas em receber, enviar ou responder não serão consideradas pequenas.

O projeto está **planejado, não implementado**. Não há autorização nesta decisão para aplicar SQL, publicar serviços, conectar contas reais ou alterar produção. Cada ação de produção será autorizada no momento apropriado.

## 12. Fase I0 — primeira auditoria técnica (13/11/2026)

**Estado desta rodada:** auditoria do código existente e da documentação oficial concluída; provas de conceito com contas e credenciais reais ainda pendentes. Nenhuma conta foi conectada, nenhum token ou senha foi criado, nenhuma migration foi aplicada e nenhum serviço foi publicado.

### 12.1 Gmail — situação encontrada no RAC

- O cartão de e-mail do Início está em `js/app.js`: usa Google Identity Services no navegador, escopo `gmail.readonly`, token de acesso com duração aproximada de uma hora e armazenamento em `localStorage` (`rac-gm-*`). Mostra perfil, contador de não lidos e uma amostra curta da caixa de entrada; não envia, move, marca nem organiza mensagens.
- A busca de e-mails usada pelo cartão também é somente leitura, com metadados e trechos. Não existe hoje uma sessão de Gmail mantida pelo servidor.
- A importação de compras em `js/compras.js` reutiliza o mesmo Client ID e o mesmo escopo, mas mantém o token em memória (`CC_GM`), confere se a conta conectada é a selecionada, lê mensagens originais e anexos da Amazon e exige conferência manual antes de gravar pedidos. Esse fluxo não deve ser confundido com um cliente de e-mail.
- `docs/compras.md` registra que o projeto Google Cloud estava configurado como Externo/em teste, com conta de teste. **Esse registro precisa ser confirmado no Console atual** antes da implementação: projetos Externos em teste têm limite de 100 usuários de teste e tokens de atualização com validade de sete dias quando solicitam escopos Gmail.

### 12.2 Gmail — impacto dos escopos e da verificação

- `gmail.readonly` é escopo restrito; não serve para envio nem para alterar mensagens.
- `gmail.modify` permite ler, compor, enviar e alterar mensagens, inclusive movê-las para a lixeira; não permite exclusão permanente imediata. É o candidato mais abrangente para a operação comum, mas é restrito.
- `gmail.send` é classificado como sensível; `gmail.modify` e `gmail.settings.basic` são restritos. `gmail.modify` permite leitura, composição, envio e alteração de mensagens sem exclusão permanente imediata; `gmail.settings.basic` é necessário para ler/criar/alterar filtros nativos. A prova I0 deve confirmar a combinação mínima por capacidade e evitar pedir `https://mail.google.com/`, que concede acesso mais amplo e exclusão permanente.
- Para um fluxo de servidor que precise funcionar sem o usuário presente, o Google documenta OAuth de servidor com autorização offline e token de atualização armazenado em local seguro. Tokens de atualização podem ser revogados/expirar; no estado Externo/em teste, a validade é de sete dias para escopos Gmail.
- Os escopos sensíveis/restritos exigem os procedimentos de verificação aplicáveis do Google. **Se dados de escopo restrito forem armazenados ou transmitidos por servidores, o Google exige uma avaliação de segurança independente**, sujeita às exceções previstas na política. Isso é uma dependência de produto, prazo e custo a esclarecer antes de assumir produção.

### 12.3 Outlook / Hotmail / Live

- Microsoft Graph documenta acesso a caixas pessoais e corporativas, mensagens e pastas, envio, movimentação e regras da Caixa de Entrada.
- As permissões delegadas são distintas e podem ser solicitadas progressivamente: leitura usa `Mail.Read`, gravação/movimentação usa `Mail.ReadWrite` e envio usa `Mail.Send` (permissão separada; `Mail.ReadWrite` não inclui envio). Para regras da Caixa de Entrada, listar/consultar usa `MailboxSettings.Read`; criar/alterar usa `MailboxSettings.ReadWrite`. A documentação atual lista essas permissões delegadas também para contas pessoais Microsoft.
- O fluxo recomendado é Authorization Code com PKCE; para manter acesso no servidor sem pedir login a cada sincronização, solicitar `offline_access` e proteger o token de atualização. A sincronização incremental por delta é **por pasta**, não uma única consulta global da caixa.
- A prova ainda precisa validar uma conta Microsoft pessoal real (Hotmail/Outlook/Live) e confirmar as permissões delegadas e a renovação no app registration escolhido.

### 12.4 iCloud e a restrição de SMTP

- A Apple documenta IMAP em `imap.mail.me.com:993` com SSL e SMTP em `smtp.mail.me.com:587` com SSL/TLS ou STARTTLS; exige autenticação e senha específica do app. A conta Apple precisa ter autenticação de dois fatores.
- A documentação atual do Supabase informa que conexões de saída das Edge Functions para a porta **587 não são permitidas**. Portanto, o envio iCloud por SMTP diretamente numa Edge Function hospedada pelo Supabase não é uma arquitetura viável.
- O runtime Edge do Supabase suporta conexões TCP em geral; a porta IMAP 993 não está na lista de portas bloqueadas documentada, mas **a conectividade real ainda não foi testada**. Não presumir que IMAP funcionará até a prova no ambiente escolhido.
- Consequência preliminar: o iCloud precisa de um worker/serviço controlado com saída TCP para 993 e 587, ou de outra alternativa técnica oficialmente suportada e comprovada. A senha específica do app ficará somente no servidor. Não usar senha no navegador, proxy público ou serviço SMTP genérico que não consiga autenticar a conta iCloud.

### 12.5 Arquitetura preliminar — ainda não aprovada como definitiva

1. Gmail e Microsoft Graph podem ser avaliados inicialmente via HTTPS nas Edge Functions, com OAuth Authorization Code no servidor, validação de `state`/PKCE conforme o provedor, tokens de atualização protegidos e isolamento por conta.
2. O conector iCloud deve permanecer desacoplado e depender de um worker com conectividade IMAP/SMTP comprovada. O provedor e o custo desse worker ainda não foram escolhidos.
3. O front-end recebe apenas o estado da conexão e os dados necessários à interface; tokens de provedor e senha específica do app não chegam ao navegador nem ao `localStorage`.
4. A sincronização deve manter cursor por conta e pasta (Gmail `historyId`; Graph `deltaLink`; estado IMAP a definir), suportar reconexão e refazer sincronização completa quando o cursor não puder mais ser usado.
5. Persistência de corpos e anexos continua sujeita à decisão de retenção/minimização. Esta rodada não autoriza copiar caixas inteiras nem enviar mensagens completas à IA.

### 12.6 Matriz de conclusão da I0

| Prova | Situação | Próxima evidência exigida |
|---|---|---|
| Auditoria do Gmail existente | **Concluída por leitura do repositório** | Revisar o Console Google atual e confirmar status de publicação, escopos e usuário de teste |
| Capacidades Gmail API e requisitos OAuth | **Mapeados na documentação oficial** | OAuth de servidor com refresh token, leitura, envio, alteração, filtros e verificação do app |
| Capacidades Microsoft Graph | **Mapeadas na documentação oficial** | App registration e teste real em conta pessoal, incluindo leitura, envio, movimento, regra e delta |
| IMAP iCloud | **Documentado; não testado** | Conexão autenticada em 993 no runtime escolhido e sincronização de uma pasta |
| SMTP iCloud | **Bloqueado diretamente no Supabase Edge Functions (porta 587)** | Prova em worker alternativo, envio e recebimento de confirmação numa conta de teste |
| Arquitetura final e custos | **Em aberto** | Comparar runtime do worker, armazenamento de tokens, operação, monitoramento e custo mensal |

**Critério de saída da I0:** os três provedores devem ter matriz de capacidades baseada em testes reais, fluxo seguro de renovação/revogação de credenciais, conectividade de entrada/saída e custos conhecidos. Até lá, não iniciar I1, não aplicar migrations e não conectar as caixas pessoais de produção.

### Referências novas da auditoria

- Google — políticas OAuth e renovação de tokens: https://developers.google.com/identity/protocols/oauth2
- Google — verificação de escopos restritos: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Google — sincronização Gmail por `historyId`: https://developers.google.com/workspace/gmail/api/guides/sync?hl=pt-br
- Microsoft — Authorization Code + PKCE: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Microsoft — delta por pasta: https://learn.microsoft.com/en-us/graph/delta-query-messages
- Supabase — limites de Edge Functions e portas de saída: https://supabase.com/docs/guides/functions/limits
- Supabase — runtime Deno e TCP: https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers
- Cloudflare — TCP Sockets e STARTTLS: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- Cloudflare — limites de Workers: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare — Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare — preços do Workers: https://developers.cloudflare.com/workers/platform/pricing/
- Railway — preços e franquias: https://docs.railway.com/pricing
- Railway — SMTP de saída por plano: https://docs.railway.com/networking/outbound-networking

### 12.7 Opções de worker para o conector iCloud

A limitação de saída SMTP do Supabase não obriga a hospedar o RAC inteiro fora dele. O worker pode ser um conector isolado: recebe chamadas autenticadas por HTTPS, acessa IMAP/SMTP externamente e grava no Supabase somente o estado e os dados necessários à sincronização.

| Candidato | Capacidade relevante documentada | Custo-base publicado | Limite/risco para o RAC |
|---|---|---:|---|
| **Cloudflare Workers Paid** | TCP de saída via `connect()` e `startTls()` para protocolos como SMTP. A restrição documentada é a porta 25; a porta 587 não aparece como bloqueada, mas isso não comprova conectividade com `smtp.mail.me.com`. Cron aceita agenda de minuto em minuto. | **US$ 5/mês** de cobrança mínima por conta Workers Paid; há franquias mensais incluídas e excedentes de uso podem ser cobrados. | Cron tem até 15 min de tempo total; para frequência menor que 1 hora, o plano Paid permite até 30 s de CPU por invocação (os 5 min de CPU aplicam-se ao handler HTTP). No Free, Cron fica limitado a 10 ms de CPU. Limite de 6 conexões TCP de saída simultâneas por requisição. Não é um processo convencional de longa duração. A primeira solução pode precisar de *polling*, não IMAP IDLE persistente. É candidato de POC pelo custo, não uma escolha aprovada. |
| **Railway Pro** | Serviço convencional/worker; SMTP de saída habilitado no plano Pro. A documentação recomenda redeploy depois de mudar de plano. | **US$ 20/mês** de assinatura-base; o valor entra como crédito de uso da plataforma, com consumo adicional possível | Mais simples para bibliotecas IMAP/SMTP tradicionais e processos de fundo, mas custa mais. Conectividade da porta 587 ainda deve ser testada contra o servidor Apple. |

**Proposta de ordem:** testar primeiro Cloudflare Workers Paid com conexões TCP sem credenciais, depois IMAP 993 autenticado e SMTP 587/STARTTLS numa conta iCloud de teste. Medir latência e confiabilidade do *polling* a cada minuto, renovação/reconexão e compatibilidade da biblioteca. Só migrar para Railway Pro se o Worker não comportar o protocolo ou o modelo de sincronização exigido. Não contratar nenhum plano nem criar Worker nesta auditoria.

### 12.8 Cofre de credenciais e implantação Supabase atuais

- A lista de extensões do projeto Supabase RAC confirma `supabase_vault` versão `0.3.1` instalada. Vault guarda segredos cifrados em disco e fornece uma view de leitura descriptografada; é o candidato preferido para refresh tokens OAuth e senha específica do app, sujeito à revisão dos privilégios da view e do caminho de leitura pelo serviço.
- A tabela `public.rac_segredos` já existe, com RLS e sem privilégios para `anon`/ `authenticated`; atualmente serve às chaves VAPID do Push. Ela não deve ser reutilizada automaticamente para credenciais de e-mail: antes, comparar a proteção efetiva, a rotação, o isolamento por conta e o acesso do worker. Não foi lido nenhum valor secreto.
- A implantação Supabase consultada em modo somente leitura tem quatro funções ativas (`garmin` v13, `rac-ia` v11, `rac-newsletter` v3 e `radar` v6); não existe função de Inbox/e-mail nesta fotografia do ambiente.
- Nenhuma migration, linha de banco, segredo, função, cron ou conta de e-mail foi criada ou alterada. A consulta foi somente de metadados de implantação e lista de extensões.

### 12.9 Privilégios do Vault — conferência somente de metadados

A auditoria de permissões do projeto confirmou:

- `vault.decrypted_secrets`: `SELECT` concedido a `postgres` e `service_role`; nenhum grant observado para `anon` ou `authenticated`.
- `vault.secrets`: `SELECT` e `DELETE` concedidos a `postgres` e `service_role`; nenhum grant observado para `anon` ou `authenticated`.
- `vault.create_secret()` e `vault.update_secret()`: `EXECUTE` concedido a `postgres` e `service_role`.

A consulta foi somente a `information_schema.role_table_grants` e `information_schema.routine_privileges`; nenhum segredo, valor descriptografado ou nome/descrição de segredo foi consultado.

**Implicação:** a chave Supabase `service_role` é ampla e não pode ser colocada no Cloudflare Worker. A arquitetura a validar deve manter a leitura do Vault dentro de uma Edge Function Supabase, que autentica e autoriza cada conta, e chamar o worker por HTTPS com uma assinatura de serviço/HMAC e uma tarefa limitada. O worker recebe a credencial necessária apenas para aquela operação, abre a conexão TCP, devolve o resultado estritamente necessário e não persiste tokens, senhas ou corpos de e-mail. A chave de assinatura do canal fica em Secrets nos dois backends; nunca no navegador. A implementação precisa ainda limitar validade, replay, conta/provedor, tamanho de resposta e logs.

O worker não recebe a chave `service_role`, não consulta o Vault diretamente e não tem acesso direto ao banco. Este desenho é **proposta para POC**, não arquitetura implementada ou aprovada.

### 12.10 Ajustes após verificação das documentações (13/11/2026)

A revisão das fontes oficiais refinou alguns itens da análise inicial:

- Gmail: o escopo `gmail.send` é sensível; `gmail.modify` e `gmail.settings.basic` são restritos. A avaliação independente de segurança é exigida quando dados de escopos restritos são armazenados ou transmitidos em servidores, ressalvadas as exceções da política Google.
- Microsoft Graph: listar regras da Inbox exige `MailboxSettings.Read`; criar/alterar exige `MailboxSettings.ReadWrite`. `Mail.Send` é separado de `Mail.ReadWrite`; o Graph documenta permissões delegadas para contas pessoais Microsoft.
- Cloudflare Workers Paid: cobrança mínima atual de US$ 5/mês; a documentação lista TCP sockets de saída, STARTTLS, bloqueio específico da porta 25 e máximo de seis sockets de saída simultâneos por requisição. Cron tem até 15 minutos de tempo total, mas, para agenda inferior a uma hora (nosso polling de 1 minuto), o limite Paid é 30 segundos de CPU por invocação; no Free, Cron tem 10 ms. Os 5 minutos aplicam-se a requisições HTTP, não a esse Cron. A porta SMTP 587 não está na lista de bloqueios, mas a conectividade real com a Apple continua pendente.
- Railway: Pro é US$ 20/mês de assinatura com crédito de uso correspondente; SMTP é habilitado a partir do Pro. O valor final depende do consumo acima do crédito.

A decisão não muda: Cloudflare é a primeira candidata de teste, Railway é alternativa, nenhum serviço foi contratado nem implantado.
