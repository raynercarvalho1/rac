# RAC · 10 · RAC Inbox — Caixa de E-mail Inteligente

Data da decisão: 13/11/2026  
Estado: **proposta aprovada pelo dono; não implementada; escopo e arquitetura redefinidos em 13/11/2026 (seção 13)**.  
Prioridade: **próxima grande frente após a conclusão da modernização da Saúde (S1–S5)**.  
Objetivo de produto: tornar o RAC o cliente principal de e-mail do dono e permitir que o Spark seja desinstalado somente depois de uma substituição comprovada no uso real.

## 1. Visão e objetivo

O RAC Inbox não será apenas um cartão que reúne links ou uma tela que lê mensagens. Será um **cliente de e-mail completo, multicon­ta e inteligente**, integrado ao restante do RAC.

A experiência deverá permitir administrar diretamente as caixas Gmail, Outlook/Microsoft e iCloud, respeitando as capacidades reais de cada provedor. O usuário não deve precisar voltar ao Spark para tarefas cotidianas como responder, enviar, arquivar, excluir, marcar spam, organizar pastas ou administrar filtros.

**Escopo redefinido em 13/11/2026 (leia a seção 13 antes de planejar ou implementar):** o RAC Inbox é um **cliente de e-mail completo para uso pessoal de dois usuários (o dono e sua esposa)**, com iCloud Mail primeiro e outros provedores depois. **Não é um painel de notificações ou de metadados**, e nenhuma prova técnica deve terminar em "autenticou": as provas avançam até ler, baixar, organizar e enviar mensagens de teste, cada passo com a autorização e a segurança próprias.

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

| Lote | Entrega | Critério de conclusão (objetivo e verificável) |
|---|---|---|
| **I0 · Provas e decisão de runtime (iCloud)** | Sequência de provas P1 a P7 da seção 13.11, com a conta iCloud do dono (senha específica de app), restrita a pasta e mensagens de teste; medição de CPU, latência e confiabilidade; decisão do runtime do conector | P1 a P7 executadas e registradas com evidência; operações que alteram a caixa ou enviam e-mail só com autorização específica; runtime decidido por medição (Workers Free, Workers Paid ou serviço convencional) e custo aprovado pelo dono |
| **I1 · Fundação** | Contas e credenciais (Vault), Edge Function como fronteira, contrato do conector com assinatura HMAC, esquema do índice com RLS, sincronização de pastas e metadados, lista mínima na interface | Conta iCloud do dono conectada pelo fluxo definitivo (Vault); teste automatizado de isolamento (um usuário nunca lê dados do outro, nem pelo banco nem pela função); nenhum segredo em log, resposta ou navegador (testes); remover a conta apaga o segredo |
| **I2 · Leitura completa** | Mensagem completa (texto e HTML sanitizado), cabeçalhos, anexos para download, conversas, busca, sincronização incremental, notificações e não lidas | Corpus de mensagens maliciosas de teste (script, rastreador, CSS com exfiltração, `javascript:`, anexo de nome perigoso) bloqueado; sincronização incremental correta, inclusive com troca de UIDVALIDITY; notificação de nova mensagem em teste real |
| **I3 · Organização** | Lido/não lido, sinalizar, arquivar, mover, excluir (com semântica de lixeira), pastas, rascunhos, ações em lote com prévia | Toda ação confirmada pelo servidor antes de aparecer como feita; falha reverte a tela; ações idempotentes; exclusão definitiva só com confirmação; testes com mensagens identificadas como teste |
| **I4 · Composição e envio** | Escrever, responder, responder a todos, encaminhar, Cc/Cco, assinatura, anexos, SMTP, cópia em Enviados, fila de saída | Envio de teste a endereço autorizado com anexo; retentativa nunca duplica o envio; limites da Apple aplicados (20 MB, 500 destinatários por mensagem, 1.000 mensagens e 1.000 destinatários por dia); a mensagem enviada aparece em Enviados |
| **I5 · Experiência e confiabilidade** | Interface responsiva (desktop e iPhone) no design do RAC, estados de erro e reautenticação, Web Push, cache de leitura, observabilidade sem conteúdo, limites de volume; liberação para a segunda usuária | Uso real do dono por período combinado sem perda de mensagem nem envio duplicado; falhas de conexão e de credencial claras; segunda usuária liberada somente com o isolamento provado e a experiência dela já existente intacta |
| **I6 · Substituição do Spark (iCloud)** | Uso diário no lugar do Spark | Checklist da seção 8 validado pelo dono |
| **I7 · Inteligência e ecossistema RAC** | Classificação, resumo, busca em linguagem natural, sugestões; integração com Carreira, Compras, Finanças, Agenda e RAC Hoje | IA só com evidência, orçamento, minimização e confirmação; integrações com rastreabilidade |
| **I8 · Provedores adicionais** | Gmail e Microsoft (Graph) pelo mesmo contrato de conector | Matriz de capacidades por provedor baseada em testes reais |

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
- Compartilhar contas, e-mails ou anexos entre os dois usuários sem autorização explícita de cada um (cada usuário tem suas contas isoladas; ver 13.8).
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
- O runtime Edge do Supabase suporta conexões TCP em geral; a porta IMAP 993 não está na lista de portas bloqueadas documentada, mas **a conectividade real a partir das Edge Functions do Supabase não foi testada**. A prova de 13/11/2026 (seção 12.13) comprovou TCP/TLS com a Apple **a partir do Cloudflare Workers**, não a partir do Supabase.
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
| IMAP iCloud | **Conectividade TCP/TLS 993 comprovada no Cloudflare Workers Free (13/11/2026); autenticação pendente** | Com a conta iCloud do dono e senha específica de app, autenticar, ler somente pasta e mensagens de teste e medir CPU/latência/confiabilidade (provas P1 e P2 da seção 13.11); depois, sincronizar |
| SMTP iCloud | **Conectividade 587 + STARTTLS + novo EHLO comprovada no Cloudflare Workers Free (13/11/2026); autenticação e envio pendentes** (direto no Supabase Edge Functions a porta 587 é bloqueada) | Autenticar sem enviar mensagem (seção 12.14); só depois, com autorização, enviar e-mail de teste |
| Arquitetura final e custos | **Em aberto** | Comparar runtime do worker, armazenamento de tokens, operação, monitoramento e custo mensal |

**Critério de saída da I0 (revisado em 13/11/2026):** como o iCloud é o primeiro provedor, a I0 só termina com as provas P1 a P7 da seção 13.11 registradas para o iCloud, fluxo seguro de credencial e revogação, decisão de runtime por medição e custos conhecidos. As provas de Gmail e Microsoft Graph saem da I0 e passam ao lote I8. Até lá, não iniciar I1, não aplicar migrations e não conectar as caixas pessoais de produção.

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

### 12.11 Probe de conectividade iCloud — código preparado (13/11/2026); prova real na seção 12.13

Foi preparado em `experimentos/icloud-probe/` um Cloudflare Worker isolado para provar a rede real sem usar credenciais iCloud. A rota autenticada `POST /probe` verifica:

- IMAP Apple em `imap.mail.me.com:993`: conexão TCP/TLS e leitura apenas da saudação IMAP;
- SMTP Apple em `smtp.mail.me.com:587`: conexão, saudação, `EHLO`, `STARTTLS`, negociação TLS e novo `EHLO` já cifrado.

O worker não recebe parâmetros de host/porta, não autentica, não lê mensagens, não envia e-mail e não chama o Supabase. Requer um segredo de diagnóstico aleatório (`PROBE_TOKEN`) configurado como Secret Cloudflare, nunca armazenado no Git ou no RAC. A resposta só mostra sucesso/falha, estágio e duração, sem banners SMTP/IMAP brutos.

**Validação automatizada concluída no GitHub Actions (execução `43465102985`, commit `6dbf10d`):** Grupo 1 — 1.578 testes, 1.576 aprovados, 0 falhas, 0 ignorados (2 `todo`); os oito casos desta POC foram carregados e aprovados, inclusive o teste 7 de negociação SMTP STARTTLS e o teste 8 de falha de handshake sem vazamento do banner. Grupo 2 — 73 testes PGlite aprovados, 0 falhas/ignorados. A primeira execução falhou antes de carregar os testes da POC devido a imports relativos incorretos; foram corrigidos no commit `6dbf10d`. A suíte local não foi executada nesta sessão.

**Situação em 13/11/2026 (retificada):** a publicação e a prova real de rede foram feitas depois do preparo do código; resultado na seção 12.13. Continuam **não comprovados**: autenticação iCloud, leitura, envio, sincronização, IMAP IDLE e estabilidade de polling. O modo local do Wrangler não comprova a saída de rede real; a prova veio da execução no Cloudflare.

Procedimento de deploy manual, uso e remoção: `experimentos/icloud-probe/README.md`. **Caminho preferido, decidido em 13/11/2026: publicação pelo GitHub Actions (seção 12.12).** A primeira tentativa será no Workers Free; se o limite HTTP de 10 ms de CPU impedir a verificação TLS, avaliar a execução e pedir autorização específica antes de qualquer upgrade para Workers Paid. A POC é descartável e não cria domínio, rota, Cron, Durable Object ou binding de produção.

### 12.12 Publicação da POC pelo GitHub Actions — decisão (13/11/2026)

**Fatos confirmados.** A sessão de nuvem do Claude Code não alcança `api.cloudflare.com` nem `dash.cloudflare.com` (a proxy da política de rede recusa com 403), não há token Cloudflare e o `wrangler login` interativo não funciona em máquina de nuvem. O dono decidiu não fornecer token Cloudflare à sessão. À época, nada havia sido publicado; a prova real está na seção 12.13.

**Decisão.** O deploy da POC é feito por workflow **exclusivamente manual** do GitHub Actions (`icloud-probe-deploy.yml`), com secrets Cloudflare num Environment protegido (`cloudflare-poc`, aprovador e branches restritas), `PROBE_TOKEN` aleatório por execução e nunca persistido, Wrangler fixo em `4.161.0` e permissão Cloudflare mínima (`Account → Workers Scripts → Edit`). A remoção do Worker fica para atividade futura autorizada.

O workflow, seu teste e o guia operacional (desenho, configuração manual e pendências) foram entregues em **PR independente** (PR #19, na `main`) e integrados a esta branch, o que é necessário para ela aparecer em "Run workflow"; o Worker e seus testes ficam na PR #17. Guia operacional: `docs/icloud-poc-deploy.md`. O registro da prova real está na seção 12.13.

### 12.13 Prova real de conectividade iCloud no Cloudflare Workers Free (13/11/2026)

**Resultado: sucesso.** Evidência: execução do workflow manual "Publicar POC iCloud (manual)" — [execução 43500897569](https://github.com/raynercarvalho1/rac/actions/runs/43500897569) (disparo `workflow_dispatch`, tentativa 1, branch `poc/icloud-cloudflare-connectivity`, commit `3d1fccc`, 20:22:05 a 20:22:50 UTC, job `publicar` concluído com sucesso). Dados abaixo lidos dos logs do job; o Step Summary não foi lido diretamente (o log traz o mesmo JSON).

| Item | Registrado |
|---|---|
| Worker | `rac-icloud-connectivity-poc`, URL pública `https://rac-icloud-connectivity-poc.raynercarvalho.workers.dev`; Wrangler 4.161.0; upload de 7,15 KiB (gzip 2,27 KiB); Worker Startup Time de 3 ms; versão `1be2a685-c1b1-4870-b75c-823a66ace1fc` |
| IMAP `imap.mail.me.com:993` | `ok: true`, etapa `imap_greeting` (conexão TCP/TLS e saudação), **55 ms** |
| SMTP `smtp.mail.me.com:587` | `ok: true`, etapa `smtp_tls_ready` (conexão, saudação, EHLO, STARTTLS, handshake TLS e novo EHLO), **481 ms** |
| Tempo total no Worker | 481 ms (as duas verificações rodam em paralelo; o total acompanha a mais lenta) |
| Flags da resposta | `authenticated: false`, `emailSent: false`, `purpose: connectivity_only` |
| Repetição | A 1ª chamada ao `/probe` devolveu HTTP 503, repetida pelo workflow enquanto o secret propagava (o código só repete 503 nesse caso); a 2ª devolveu 200. |
| Limite de CPU do Free | Nenhum erro de limite de CPU (1102) ocorreu. **O tempo de CPU não foi medido**: os 55/481 ms são tempo de relógio, não CPU. |
| Plano | O workflow não tem nenhuma operação de plano ou cobrança e o log não exibe o plano; a informação de que foi Workers Free e de que não houve contratação vem do dono. |

**O que está comprovado:** a partir da infraestrutura Cloudflare Workers Free, o `connect()` alcança a Apple em IMAP 993 (TLS e saudação) e em SMTP 587 (STARTTLS e handshake TLS), numa execução.

**O que NÃO está comprovado:** autenticação Apple; leitura de mensagens ou pastas; envio; sincronização; estabilidade de polling (foi uma única execução); consumo real de CPU; comportamento sob Cron; IMAP IDLE; substituição do Spark. Não houve conta pessoal conectada, senha específica de app, e-mail lido ou enviado, alteração de banco, Supabase ou produção, nem plano pago. O Worker permanece publicado; como o `PROBE_TOKEN` daquela execução foi descartado, ninguém consegue chamá-lo até uma nova execução do workflow. A remoção do Worker é atividade futura, com autorização específica.

**Fase I0:** **não concluída.** Falta, no iCloud, a autenticação e as operações reais; e faltam as provas de Gmail e Microsoft Graph e os custos finais (matriz da seção 12.6).

### 12.14 Proposta da próxima prova — autenticação iCloud (13/11/2026, não executada)

> **Superada pela seção 13.11.** Esta proposta terminava em autenticação e leitura mínima de metadados, o que subdimensiona o produto. Permanecem válidos seus cuidados com a credencial e a medição (a conta é a do dono, ver 13.11); o alcance das provas foi ampliado.

**Escopo.** Provar apenas: (1) login IMAP com senha específica de app; (2) leitura mínima de metadados de uma pasta, sem corpos nem anexos; (3) login SMTP sem enviar mensagem; (4) falha de credencial; (5) efeito da revogação; (6) custo de CPU, latência e confiabilidade no runtime Cloudflare. Fora de escopo: sincronização, IDLE, envio real, Cron, conta pessoal de produção.

**Pré-requisitos da conta (corrigido em 13/11/2026).** Decisão do dono: **não será criada conta Apple de teste**; a prova usa a **conta iCloud do próprio dono**, com autenticação de dois fatores já ativa e uma senha específica de app com rótulo próprio, gerada no painel da Apple. Nunca a senha principal. O endereço da conta não é escrito no repositório (o teste de estrutura bloqueia endereços iCloud). Os cuidados por usar a conta real estão na seção 13.11.

**Entrega da credencial sem exposição.**
- *Prova 2A (recomendada primeiro, a mais simples):* o dono cadastra usuário e senha de app como secrets de um Environment novo do GitHub (aprovador obrigatório, branches restritas), digitando diretamente no formulário do GitHub — nunca no chat, no código ou em arquivo. O workflow manual lê o secret em variável de ambiente (mascarada), monta o corpo da requisição em memória e o envia por HTTPS, **no corpo do POST**, ao Worker de teste, junto de um token por execução (padrão atual). O Worker usa a credencial só durante a requisição: não grava, não registra em log, não devolve na resposta e fecha a sessão. Assim **nada da Apple fica armazenado no Cloudflare**.
- *Prova 2B (arquitetura-alvo, depois):* a credencial vive no Vault do Supabase; uma Edge Function autentica o dono, lê o Vault, assina a tarefa (HMAC com validade curta, nonce, conta, operação) e chama o Worker; o Worker verifica a assinatura e usa a credencial só naquela operação, sem `service_role`. **Nada disso existe hoje**: exigiria migration/tabela de contas, Edge Function nova, verificação HMAC no Worker e proteção contra replay, cada um com autorização própria (SQL em produção e publicação de função).
- Ressalva da 2A: o GitHub passa a guardar uma senha de app da conta real do dono, que dá acesso à caixa inteira (a Apple não permite restringi-la a uma pasta). É aceitável para a POC porque a credencial é revogável, o Environment tem aprovador e branches restritas e o Worker só executa comandos de uma lista fechada, mas **não** é o desenho final.

**Limitar a leitura ao mínimo.** O Worker só executa uma lista fixa de comandos, escrita no código, sem aceitar comando do cliente: `CAPABILITY`, `LOGIN`, `EXAMINE INBOX` (somente leitura), `STATUS`/contagens (`EXISTS`, `UIDVALIDITY`, `UIDNEXT`), opcionalmente `FETCH` de `UID FLAGS RFC822.SIZE` de poucas mensagens, e `LOGOUT`. Sem `BODY[]`, sem `ENVELOPE`, sem anexos, sem remetente ou assunto. A resposta devolve só números e booleanos por etapa, sem texto bruto do servidor nem nome de pasta ou usuário.

**SMTP autenticado, separado.** `EHLO` → `STARTTLS` → `EHLO` → `AUTH` (sucesso `235`) → `QUIT`, **sem** `MAIL FROM`, `RCPT TO` ou `DATA`. Nenhuma mensagem é criada. Uma tentativa por prova, sem repetição automática, para não bloquear a conta por tentativas de login.

**Encerramento e persistência.** `LOGOUT`/`QUIT` e fechamento dos sockets em `finally`; credencial só em memória durante a requisição; token por execução descartado; ao final, o dono **revoga a senha de app** no painel Apple.

**Comprovar autenticação, falha e revogação.** Três execuções registradas: (a) credencial válida → login aceito e metadados lidos; (b) credencial deliberadamente inválida → falha de autenticação classificada, sem eco de credencial; (c) depois da revogação pelo dono → nova tentativa com a mesma senha falha. A (c) prova que a revogação corta o acesso.

**Medir limites, CPU, latência e confiabilidade.** Latência por etapa (TCP/TLS, saudação, login, seleção, logout) devolvida na resposta; confiabilidade em N execuções (por exemplo 20, espaçadas) com taxa de sucesso e classificação dos erros. O tempo de CPU **não** aparece na resposta; precisa vir das métricas do Cloudflare (painel/observabilidade) — hipótese a confirmar, e o dono teria de ler ou colar os números, porque esta sessão não acessa a Cloudflare. O relógio dentro do Worker só avança com I/O, então o tempo medido na resposta não equivale a CPU.

**Custos e limites, Free versus Paid (a verificar na documentação vigente antes da decisão).** Free: sem custo; limite de 10 ms de CPU por requisição HTTP, e a prova atual passou sem erro de CPU, mas a CPU não foi medida e o login adiciona trabalho de TLS e *parsing*. Paid: cobrança mínima de US$ 5/mês, limite maior de CPU e 30 s de CPU por invocação de Cron abaixo de 1 hora (seção 12.8). A decisão de pagar só entra com evidência de que o Free não basta e com aprovação do dono.

**O que precisa ser criado e validado (nada existe ainda).** Módulo de autenticação IMAP/SMTP no Worker de teste (preferencialmente Worker separado, para não alterar a POC de conectividade), com lista fixa de comandos e saneamento de erros; testes com sockets simulados cobrindo sucesso, falha de login e ausência de vazamento; workflow manual com Environment próprio e jobs separados (seção 13.11); e, só na 2B, Vault, Edge Function e HMAC.

**Decisões do dono antes de executar (atualizado em 13/11/2026):** a conta (a do dono), a senha de app e a rota 2A **já foram decididas**. Seguem pendentes: autorização específica das provas que alteram a caixa ou enviam e-mail, custo adicional e quem lê as métricas de CPU (seção 13.12).

## 13. Redefinição de escopo e arquitetura recomendada (13/11/2026)

### 13.1 Decisão de produto

O RAC Inbox é um **cliente de e-mail completo, de uso pessoal e privado**, para as duas únicas pessoas que usam o RAC: o dono e sua esposa, ambos autenticados pelo sistema atual do RAC. Não é um serviço público. O objetivo é administrar as caixas dentro do RAC e **substituir progressivamente o Spark**. O primeiro provedor é o **iCloud Mail**; a arquitetura deve permitir outros depois (Gmail, Microsoft).

**Escopo funcional (visão do produto, não é a próxima etapa):**

- *Leitura:* listar e sincronizar; mensagem completa; HTML e texto com segurança; remetente, destinatários, assunto, data e cabeçalhos relevantes; conversas e encadeamento; busca por remetente, destinatário, assunto e conteúdo; atualização e acompanhamento de novas mensagens.
- *Organização:* criar, consultar e organizar pastas (conforme o provedor); lido/não lido; sinalizar; arquivar, mover e excluir; rascunhos; ações em várias mensagens.
- *Envio:* escrever, responder, responder a todos, encaminhar; Para, Cc e Cco; rascunhos; assinatura quando viável; anexos.
- *Anexos:* listar, baixar, visualizar formatos compatíveis, enviar, com limites de tamanho e validações de segurança.
- *Experiência:* responsiva (desktop e celular); notificações; indicadores de não lidas; sincronização confiável; erros de conexão e autenticação tratados; integrada ao design e à navegação do RAC.

**Regra para sessões futuras:** as limitações da POC de conectividade **não** são limitações do produto, e nenhuma prova deve terminar em autenticação ou em leitura de metadados. Segurança não significa restrição funcional: o sistema deve ler, baixar, enviar, mover e excluir quando o usuário autorizar a operação.

### 13.2 Diagnóstico da arquitetura anterior

| Item | Decisão | Motivo |
|---|---|---|
| POC de conectividade (Worker, testes, workflow manual, Environment protegido, execução 43500897569) | **Manter** como evidência e como mecanismo de provas | Comprovou TCP/TLS com a Apple a partir do Workers Free; o workflow é o único meio de acionar a Cloudflare sem token na sessão |
| Princípios de segurança (credencial só no servidor, Vault, Edge Function como fronteira, sem `service_role` no conector, sem segredo em log) | **Manter** | Servem ao produto completo |
| Worker como "ponte TCP" | **Alterar**: passa a ser um **conector de transporte substituível**, sem estado e sem credencial própria | A escolha de runtime depende de medições que ainda não existem |
| "Não persistir cópias de mensagens por padrão" | **Alterar** | Um cliente completo precisa de índice (metadados, estado de sincronização, trecho para busca) no Supabase; corpos e anexos seguem sob demanda |
| Proposta de prova 12.14 (autenticação e metadados mínimos) | **Substituir** pela sequência P1 a P7 (13.11) | Subdimensiona o produto |
| Provas de Gmail e Graph como condição da I0 | **Mover** para o lote I8 | iCloud é o primeiro provedor |
| Cloudflare Workers Paid como candidata inicial | **Alterar**: decisão do runtime por medição na I0 | Não há medição de CPU; Free pode bastar para parte das operações |
| Credencial por corpo de requisição vindo do GitHub (rota 2A da 12.14) | **Manter só para as provas P1 a P6** com a conta do dono restrita a pasta e mensagens de teste | O fluxo definitivo é Vault, Edge Function e HMAC |

### 13.3 Arquitetura recomendada

```
Navegador (RAC, módulo Inbox)
   │  JWT do usuário (HTTPS)
   ▼
Supabase
 ├─ Postgres (RLS por usuário): contas, pastas, índice de mensagens (metadados e trecho),
 │   estado de sincronização por pasta, ações, fila de saída, rascunhos locais
 ├─ Vault: senha específica de app (lida só pela Edge Function)
 ├─ Edge Function do Inbox: autentica o usuário, confere que a conta é dele, lê o Vault,
 │   assina a tarefa (HMAC), analisa o MIME, sanitiza o HTML, grava o índice, envia Web Push
 └─ pg_cron: dispara a sincronização periódica
        │  HTTPS + HMAC (uma operação curta, com validade e nonce)
        ▼
Conector de transporte IMAP/SMTP (Cloudflare Worker; trocável por Workers Paid ou serviço convencional)
        │  TCP/TLS (connect())
        ▼
iCloud: imap.mail.me.com:993 · smtp.mail.me.com:587
```

**Responsabilidades (decisão central: o conector só transporta; a inteligência fica no Supabase).**

| Componente | Faz | Não faz |
|---|---|---|
| Navegador | Interface; lê o índice por RLS; pede ações à Edge Function; mostra HTML sanitizado em `iframe` isolado | Nunca vê senha, token ou segredo; nunca fala com o iCloud |
| Edge Function | Autorização por usuário e conta; Vault; assinatura da tarefa; MIME, sanitização, índice, notificação; limites e registro sem conteúdo | Não abre SMTP 587 (bloqueado no Supabase); não guarda segredo fora do Vault |
| Conector | Executa uma lista fechada de operações IMAP/SMTP e devolve bytes ou resultados; confere assinatura, validade e nonce | Não tem `service_role`, não lê o banco, não guarda credencial, não registra conteúdo, não aceita host nem comando livre |
| Postgres | Índice, estado e trilha de ações com RLS | Não guarda senha; não guarda corpos e anexos por padrão |

**Operações do contrato do conector:** testar login; listar pastas e capacidades; sincronizar pasta (a partir de UID, e de MODSEQ quando houver); buscar mensagem (cabeçalhos, corpo, parte de anexo); alterar sinalizadores; mover/copiar; excluir e expurgar; anexar mensagem a uma pasta (rascunho, Enviados); enviar por SMTP. Um segundo provedor (Gmail, Graph) entraria como outro conector com o mesmo contrato.

**Por que não o desenho mais simples (tudo no Worker, ou tudo na Edge Function):** a Edge Function não consegue SMTP (porta 587 bloqueada) e tem 2 s de CPU por requisição; o Worker Free tem 10 ms de CPU por requisição HTTP, pouco para analisar MIME e codificar anexos. Dividir o trabalho põe o processamento pesado onde há mais CPU e deixa o conector leve, mas **isso é hipótese até a medição da I0**.

### 13.4 Dados, identidade e busca

- **Identidade de mensagem:** (conta, pasta, UIDVALIDITY, UID) é a chave no provedor; o cabeçalho Message-ID identifica a mensagem entre pastas. Se a UIDVALIDITY de uma pasta mudar, o índice dela é refeito.
- **Conversas:** montadas pelo RAC com Message-ID, In-Reply-To, References e assunto normalizado (não se presume suporte a THREAD no servidor da Apple).
- **Índice no Supabase (migrations só com autorização):** contas (sem segredo; apenas a referência ao Vault), pastas, mensagens (metadados, sinalizadores, trecho curto, conversa), estado de sincronização, fila de ações e de envio, rascunhos. Tudo com RLS por usuário. Tabela pessoal nova entra no backup e na trava de MFA por regra do projeto; como o índice é recriável a partir do provedor, avaliar na I1 se ele deve ficar de fora do backup, o que exige justificativa e ajuste dos testes existentes.
- **Corpos e anexos:** buscados sob demanda; corpo já sanitizado pode ter cache curto e limitado; anexo nunca é guardado, exceto o de uma mensagem em composição, em área temporária apagada após o envio.
- **Busca:** índice de texto em português sobre metadados e trecho, mais `SEARCH` do IMAP para busca no conteúdo completo. Indexar todo o corpo é decisão posterior (privacidade, volume, custo).
- **Dimensionamento:** duas pessoas e dezenas de milhares de mensagens cabem no banco em metadados; retenção e limite de linhas a definir na I1.

### 13.5 Sincronização e notificações

- **Polling, não IMAP IDLE**, no Workers: o runtime não é um processo de longa duração. Intervalo inicial de poucos minutos por conta via pg_cron, mais atualização sob demanda quando o app está aberto. Detecção por UIDNEXT e, se o iCloud suportar, CONDSTORE/QRESYNC; sem isso, comparação de UIDs.
- **Notificação:** a Edge Function, ao encontrar mensagem nova, envia Web Push pela infraestrutura já existente no RAC; por padrão, texto genérico ("nova mensagem em <conta>"), sem remetente nem assunto.
- **Tempo real:** só um serviço com conexão persistente (IDLE) oferece. Fica como alternativa se o polling não satisfizer o uso diário.
- **Erros:** estado da conta (ok, falha de rede, credencial recusada, revogada) sempre visível; uma conta sem conexão nunca aparece como caixa vazia.

### 13.6 Leitura segura

- **HTML:** sanitização no servidor por lista de permissões (sem script, formulário, objeto, `base`, `meta refresh`, eventos, `javascript:`, CSS com `url()` ou `@import`) e exibição em `iframe` com `sandbox` sem scripts e sem mesma origem, com política de conteúdo restritiva.
- **Conteúdo remoto:** imagens e recursos externos **bloqueados por padrão** (rastreadores); liberação por mensagem ou remetente, preferencialmente por proxy no servidor, que esconde o IP. Links externos com `noopener noreferrer`.
- **Anexos:** download com `Content-Disposition: attachment` e `nosniff`; prévia só de tipos seguros (imagens e PDF em contexto isolado); aviso para executáveis; limite de tamanho.
- **Fallback:** texto simples sempre disponível.

### 13.7 Escrita: ações, envio e exclusão

- **Fonte da verdade é o provedor:** uma ação só aparece como concluída depois que o servidor a aceitou e o estado foi relido; falha reverte a tela.
- **Idempotência:** toda ação e todo envio têm chave única e registro em fila, para uma retentativa nunca duplicar.
- **Exclusão:** mover para a lixeira é o padrão; apagar definitivamente (marcar e expurgar) só com confirmação explícita; a semântica exata do iCloud (nomes das pastas, atributo de uso especial, suporte a MOVE) é verificada na prova P3.
- **Rascunhos:** salvos no provedor (anexar à pasta de rascunhos) com buffer local de edição.
- **Envio:** a mensagem MIME é montada na Edge Function e enviada pelo conector por SMTP; a cópia em Enviados é anexada por IMAP (se o iCloud não a criar sozinho, a verificar). Limites da Apple respeitados antes do envio.
- **IA:** nunca envia nem altera mensagem sozinha (regra mantida).

### 13.8 Segurança e isolamento

- **Isolamento dos dois usuários:** RLS por `auth.uid()` em toda tabela do Inbox; a Edge Function confere que a conta pertence ao usuário do JWT antes de qualquer leitura do Vault; sem acesso administrativo cruzado. Teste automatizado obrigatório (um usuário não lê nem age na conta do outro), incluindo o papel da casa.
- **Experiência da segunda usuária:** o Inbox só aparece para ela quando o dono liberar, depois do isolamento provado, sem alterar o que ela já vê e faz.
- **Credenciais:** senha de app só no Vault; entra uma vez pelo formulário de adicionar conta (HTTPS, direto à Edge Function) e nunca é devolvida, guardada no navegador ou registrada. Remover a conta apaga o segredo; a Apple permite revogar a senha de app no painel dela.
- **Canal Edge→conector:** HMAC com validade curta, nonce (anti-repetição), conta e operação; lista fechada de comandos; host e porta fixos no código.
- **Limites:** tamanho de mensagem e de anexo, tempo por operação, número de operações por minuto e por dia, tamanho de resposta.
- **Logs e erros:** sem credenciais, sem conteúdo de mensagens ou anexos, sem endereços completos; erros genéricos ao cliente, detalhes técnicos só em log interno.
- **Sem `service_role` no conector**, sem leitura do Vault fora da Edge Function.

### 13.9 Limitações: comprovadas, documentadas e não verificadas

**Comprovado na POC (13/11/2026, uma execução, Workers Free):** TCP/TLS e saudação IMAP em `imap.mail.me.com:993` (55 ms); conexão, EHLO, STARTTLS, handshake TLS e novo EHLO em `smtp.mail.me.com:587` (481 ms); nenhum erro de limite de CPU.

**Documentado nas fontes oficiais (conferido em 13/11/2026; reconferir antes de decidir):**

| Plataforma | Limite documentado |
|---|---|
| [Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/limits/) | 10 ms de CPU por requisição HTTP; 50 subrequisições por invocação; 100.000 requisições por dia; 128 MB de memória |
| [Cloudflare Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) | Cobrança mínima de US$ 5 por mês; CPU de 30 s por padrão, até 5 min, por requisição HTTP; 10.000 subrequisições por invocação; inclui uso de Durable Objects |
| [Durable Objects no Free](https://developers.cloudflare.com/durable-objects/platform/limits/) | Só com armazenamento SQLite; 5 GB por conta; 100.000 requisições por dia; útil como estado do conector, não como conexão IMAP persistente (soquete não mantém o objeto vivo após 15 min) |
| [Cloudflare Containers](https://developers.cloudflare.com/containers/) | Exigem o plano Paid |
| [Sockets TCP no Workers](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) | Até seis conexões simultâneas por invocação; porta 25 bloqueada; o runtime não é um processo de longa duração |
| [Supabase Edge Functions](https://supabase.com/docs/guides/functions/limits) | 2 s de CPU por requisição (sem contar I/O assíncrono); 150 s (Free) ou 400 s de relógio; 256 MB; saída para as portas 25 e 587 não permitida |
| [Apple iCloud Mail](https://support.apple.com/en-us/102198) | 20 MB por mensagem (Mail Drop até 5 GB, anexos por link); 1.000 mensagens e 1.000 destinatários por dia; 500 destinatários por mensagem. A página tem cerca de 600 dias: reconfirmar |

**Não verificado (cada item vira critério de uma prova):** CPU real por operação no Workers Free; compatibilidade de bibliotecas IMAP e MIME com `connect()` e `nodejs_compat`; suporte do iCloud a IDLE, MOVE, CONDSTORE, QRESYNC, UIDPLUS, SPECIAL-USE, SORT e THREAD; limite de sessões simultâneas por conta e política antiabuso para logins frequentes (risco de bloqueio da conta do dono); se o SMTP da Apple grava em Enviados; tamanho máximo de requisição na Edge Function; IMAP 993 a partir de Edge Functions; custo de CPU do TLS em polling frequente; tamanho prático de anexo que o Worker Free consegue transportar.

**Alternativas se alguma restrição inviabilizar uma função:**

| Se falhar | Alternativa | Custo |
|---|---|---|
| CPU do Free insuficiente (TLS, análise ou anexo grande) | Workers Paid, mesmo contrato do conector | US$ 5/mês de mínimo |
| Biblioteca IMAP/SMTP incompatível com Workers, ou IDLE necessário para tempo real | Serviço convencional (por exemplo Railway Pro) com o mesmo contrato | US$ 20/mês de assinatura-base (crédito de uso incluído) |
| Anexo grande no envio | Montagem do MIME por streaming no conector, ou limite menor que 20 MB | Sem custo extra |
| IMAP 993 viável direto da Edge Function | Edge Function faz o IMAP e o Worker faz só o SMTP, reduzindo o conector ao mínimo | Sem custo extra; exige prova própria |

Nenhum plano pago será contratado sem evidência de necessidade e aprovação do dono.

### 13.10 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| CPU do Workers Free insuficiente | Operações falham ou são cortadas | Medir na I0; conector trocável; decisão de plano pelo dono |
| Bloqueio da conta Apple por logins frequentes ou falhas | Perda temporária de acesso ao e-mail pessoal do dono (a conta da POC é a real) | Um login por prova, sem retentativa automática; teste de credencial inválida uma única vez; intervalo de polling conservador; reutilizar sessão quando possível |
| Senha de app da conta real guardada no GitHub e usada no conector | Acesso à caixa inteira se vazar (a senha de app não é restringível a uma pasta) | Environment com aprovador e branches restritas; senha de app com rótulo próprio e revogada ao fim da POC; segredo mascarado; lista fechada de comandos no conector; nenhuma resposta ou log com conteúdo |
| Teste alterar ou apagar mensagem pessoal | Perda de e-mail real | Código restringe toda escrita à pasta de teste e a mensagens marcadas como teste, operação por UID, nunca `EXPUNGE` geral; autorização específica antes de cada prova que altera |
| Vazamento de credencial (log, resposta, repositório, GitHub) | Acesso à caixa | Vault; testes que procuram segredo em logs e respostas; revogação da senha de app; segredos de teste só em Environment protegido |
| HTML malicioso, rastreadores, anexo perigoso | Execução de script, rastreio, malware | Sanitização, `iframe` isolado, bloqueio remoto, download seguro, corpus de testes |
| Ação destrutiva por erro | Perda de mensagens | Lixeira como padrão, confirmação, prévia em lote, testes só com mensagens de teste |
| Envio duplicado ou indevido | Constrangimento, limites da Apple | Idempotência, fila, confirmação, limites |
| Falha de isolamento entre os dois usuários | Acesso à caixa do outro | RLS, conferência de dono na Edge Function, teste automatizado, sem acesso cruzado |
| Sincronização inconsistente (UIDVALIDITY, expurgos) | Mensagens perdidas ou fantasmas | Refazer índice quando a UIDVALIDITY mudar; reconciliação periódica; estado da conta visível |
| Dependência de serviços e custos que mudam | Surpresa de custo ou quebra | Contrato de conector estável; reconferir limites; aprovação de custo |
| Banco gratuito do Supabase cheio | Falha geral do RAC | Índice enxuto, limite de linhas, monitoramento do tamanho |
| Impacto sobre a experiência da segunda usuária | Mudança não pedida | Liberação só pelo dono, depois dos testes de isolamento |

### 13.11 Sequência de provas (provas de conceito, não são o produto)

**Decisões do dono já tomadas (13/11/2026):** a POC usa a **conta iCloud do próprio dono**; **não será criada conta de teste**; é usada **somente a senha específica de app da Apple**, nunca a senha principal; a senha é cadastrada **diretamente como secret de um GitHub Environment** (rota 2A), nunca no chat, no código, em arquivo, em log ou em commit.

**Credencial e transporte (2A):**

- Os secrets do iCloud (usuário e senha de app) ficam num **Environment dedicado, `icloud-auth-poc`**, com aprovador obrigatório e branches restritas, **separado** do `cloudflare-poc` (que continua só com as credenciais da Cloudflare, para a POC de conectividade). Não misturar as duas famílias de credenciais no mesmo Environment; ver a tabela abaixo.
- **Proteção do Worker (decidido: S3, OIDC do GitHub):** nenhum token é cadastrado à mão nem compartilhado entre jobs; o job que carrega a senha Apple se autentica no Worker com o token OIDC do GitHub, validado por política fixa (seção 13.13). A **senha Apple nunca é gravada como secret do Worker** (nada de `wrangler secret put` para ela, nem variável, KV, Durable Object ou log): existe só em memória, durante a requisição.
- Transporte exclusivamente por HTTPS: o workflow envia a credencial no corpo da requisição ao Worker; o Worker a usa só durante a requisição, em memória, e não grava, não registra e não devolve.
- Nenhum segredo em logs, respostas, rastreamentos ou mensagens de erro (teste automatizado que procura segredos), e nenhuma credencial no repositório ou no navegador.
- Ao fim da POC o dono **revoga a senha de app** no painel da Apple.

**Separação de credenciais e Environments (decisão D-ENV tomada pelo dono em 13/11/2026: S3; a recomendação e a tabela abaixo ficam como registro do raciocínio).**

Regras do GitHub que condicionam o desenho: um job usa **um único** Environment; os secrets de um Environment só chegam aos jobs que o declaram; e segredo **não pode** passar de um job a outro por output, artefato ou log (proibido por esta POC). Logo, quem precisa da senha Apple e quem precisa do token administrativo da Cloudflare ficam em jobs diferentes, e o job da senha Apple precisa se autenticar no Worker **sem um segredo compartilhado**.

| Solução | Como funciona | Credenciais por Environment | Avaliação |
|---|---|---|---|
| **S1 · Um job, `cloudflare-poc`** | iCloud e Cloudflare no mesmo Environment | Mistura as duas famílias | **Rejeitada** (decisão do dono) |
| **S2 · Um job, `icloud-auth-poc` com token Cloudflare duplicado (não adotada)** | O mesmo job publica o Worker, grava um token efêmero com `wrangler secret put` e chama o Worker com a senha Apple no corpo | `icloud-auth-poc`: iCloud **e** uma cópia do token Cloudflare | Mais simples. Duplica um segredo administrativo e junta a senha da caixa com o poder de publicar Workers no mesmo job |
| **S3 · Jobs separados por Environment, autenticação por OIDC do GitHub (DECIDIDA pelo dono; no início dois jobs, hoje três: seção 13.14)** | Job 1 `provisionar` (`cloudflare-poc`) só publica o Worker da prova autenticada, sem nenhum segredo da Apple. Job 2 `executar` (`icloud-auth-poc`, depende do job 1, com permissão para pedir token OIDC) obtém um token OIDC do GitHub, de curta duração e com audiência própria, e o envia ao Worker junto da credencial Apple no corpo HTTPS. O Worker valida assinatura (chaves públicas do GitHub), emissor, audiência, validade, repositório, branch e o Environment `icloud-auth-poc` | `cloudflare-poc`: só Cloudflare. `icloud-auth-poc`: só iCloud | Mais segura: nenhum segredo compartilhado entre jobs, nenhuma duplicação do token da Cloudflare, e a senha Apple nunca está no mesmo job que o poder de publicar. Mais complexa: o Worker passa a verificar JWT, e isso precisa caber no limite de CPU do Free |
| **S4 · Dois jobs com token efêmero por output ou artefato** | Job 1 grava o token e o entrega ao job 2 | — | **Proibida** (segredo entre jobs) |

**Decisão (13/11/2026): S3.** A S2 fica como alternativa não adotada (só voltaria à mesa se a verificação do JWT não coubesse no Workers Free; a medição indicativa da seção 13.13 mostra que cabe com folga, mas a medição no runtime da Cloudflare ainda depende de deploy autorizado). **Implementação local concluída e testada, nada executado nem publicado:** seção 13.13.

**Secrets necessários em cada Environment (nenhum foi cadastrado; cadastro é ação do dono, quando for executar a P1):**

| Environment | Secrets | Observação |
|---|---|---|
| `cloudflare-poc` (existente, inalterado) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Só para publicar Workers. **Nenhuma credencial iCloud.** Segue servindo a POC de conectividade |
| `icloud-auth-poc` (novo, a criar pelo dono) | **Nenhum para o primeiro ensaio OIDC.** `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` (e `ICLOUD_DESTINO_TESTE` só se o envio da P5 for autorizado) apenas quando a P1 for autorizada | Aprovador obrigatório (o dono) e branches restritas. **Nenhuma credencial Cloudflare** na S3 (na S2 receberia uma cópia dedicada) |
| Repositório | Nenhum | Nada de credencial no nível do repositório |

**A senha Apple não persiste em lugar nenhum fora do GitHub Environment:** o job lê o secret em variável de ambiente (já mascarada), monta o corpo da requisição em memória e o envia por HTTPS, de preferência por entrada padrão e não por argumento de linha de comando; o Worker usa a credencial só durante a requisição, não a grava (nem como secret do Worker, variável, KV ou Durable Object), não a registra (registros e observabilidade do Worker desligados, sem `console.log` de entrada) e não a devolve na resposta nem em mensagens de erro. Um teste automatizado deve falhar se o texto da senha aparecer em resposta, erro ou registro.

**Cuidados por usar a conta real (obrigatórios; a senha de app dá acesso à caixa inteira e não pode ser restrita a uma pasta, então a restrição é imposta pelo código do conector):**

- Pasta de teste dedicada e identificada (criada pelo dono ou pela prova P3, com autorização) e mensagens claramente marcadas como teste.
- Leitura limitada à pasta de teste e às mensagens marcadas como teste. Pastas e mensagens pessoais não são lidas; sobre elas só se aceitam contagens numéricas, quando necessárias.
- **Nenhuma alteração ou exclusão em mensagem pessoal.** Escrita só na pasta de teste, em mensagens marcadas, sempre por UID; **nunca `EXPUNGE` geral** (ele apagaria todas as mensagens com a marca de exclusão naquela pasta); sem `UID EXPUNGE` disponível, a exclusão definitiva só ocorre dentro da pasta de teste. Sem expurgo na caixa de entrada nem na lixeira.
- Nenhum envio a destinatário sem autorização específica; o endereço autorizado fica como secret do Environment `icloud-auth-poc` (só quando o envio da P5 for autorizado), não no repositório.
- **Logs e relatórios sem remetente, assunto, corpo, nome de arquivo ou conteúdo de anexo, e sem nome de pastas pessoais:** só contagens, booleanos, códigos de estágio, tamanhos, tempos e o resumo criptográfico de um anexo de teste.
- Lista fechada de comandos, limite de tamanho, de mensagens por prova e de tentativas de login (uma por prova).

| Prova | O que demonstra | Natureza e limites |
|---|---|---|
| **P0** · Conectividade TCP/TLS (feita) | IMAP 993 e SMTP 587 alcançáveis no Workers Free | Somente leitura, sem credencial |
| **P1** · Autenticação e estrutura | Login IMAP; capacidades do servidor; pastas (atributos de uso especial, se a pasta de teste existe, contagens); falha com credencial deliberadamente inválida, uma vez | Somente leitura; não lista nomes pessoais |
| **P2** · Leitura | Listar mensagens de teste; ler cabeçalhos e corpo de mensagem de teste; baixar anexo de teste, com limite de tamanho e conferência por resumo criptográfico | Somente leitura, só na pasta de teste; mede CPU e latência |
| **P3** · Alterações reversíveis | Marcar lida/não lida e sinalizar; criar a pasta de teste, se faltar; mover mensagem de teste entre pastas de teste | Altera a caixa **só em teste**; **autorização específica antes de executar** |
| **P4** · Exclusão controlada | Semântica de lixeira e exclusão (mover, restaurar, excluir) numa mensagem de teste | Destrutivo **só em mensagem e pasta de teste**; **autorização específica antes de executar** |
| **P5** · SMTP | Login SMTP **sem enviar**; depois envio de uma mensagem de teste com anexo; cópia em Enviados | O envio só ocorre **após autorização específica**, com destinatário autorizado |
| **P6** · Sincronização e polling | Sincronização incremental (UIDNEXT, CONDSTORE se houver), simulação de mudança de UIDVALIDITY, polling por 24 a 48 h com taxa de falha, Web Push de teste | **Somente leitura, sem alteração destrutiva**; o mecanismo agendado (agenda do GitHub ou Cron do Worker) será proposto e autorizado à parte |
| **P7** · Fronteira definitiva | Vault, Edge Function e HMAC: credencial lida só na Edge Function, tarefa assinada, conector sem segredo, teste de isolamento entre dois usuários simulados nos testes automatizados | Exige migration e função publicada (autorizações próprias) |

**Cada prova** registra: o que passou, o que falhou, CPU/latência/taxa de erro, limitações e se a conclusão é "comprovado" ou "não comprovado". Uma prova só encerra o que ela de fato demonstrou. As provas P1 a P6 usam código de experimento descartável; **o produto é construído nos lotes I1 a I5**, com os testes automatizados do projeto, e reaproveita das provas apenas o que for medido e aprovado.

### 13.12 Decisões do dono

**Já decididas (não são pendências):**

1. **Escopo:** o RAC Inbox é um cliente de e-mail completo, de uso pessoal do dono e da esposa, com isolamento total entre os dois e iCloud primeiro (seção 13.1).
2. **Conta da POC:** a conta iCloud do próprio dono; não haverá conta Apple de teste.
3. **Credencial:** somente senha específica de app, cadastrada diretamente como secret de GitHub Environment (rota 2A); nunca no chat, no código, em log ou em commit.
4. **Proteção do Worker e Environments (D-ENV, decidida em 13/11/2026): S3** — jobs separados por Environment (três desde a auditoria da seção 13.14), OIDC do GitHub, Environment dedicado `icloud-auth-poc`, nenhum segredo compartilhado entre jobs; a senha Apple nunca é gravada como secret do Worker.

**Pendentes (dependem do dono):**

1. **Autorização específica antes de cada prova que altera a caixa ou envia e-mail:** P3 (alterações), P4 (exclusão em mensagem de teste) e P5 (envio de mensagem de teste, com o destinatário autorizado indicado).
2. **Criar o Environment `icloud-auth-poc` (ação do dono):** aprovador obrigatório e branch restrita a `poc/icloud-cloudflare-connectivity` (detalhes na seção 13.13). A decisão D-ENV já foi tomada (S3).
2b. **Cadastro dos secrets Apple no Environment `icloud-auth-poc`: só quando a P1 for autorizada** (`ICLOUD_USER`, `ICLOUD_APP_PASSWORD` e, só se o envio da P5 for autorizado, `ICLOUD_DESTINO_TESTE`). **O primeiro ensaio OIDC não exige cadastro de secrets Apple.** É ação do dono; a sessão não cria nem altera secrets. O `cloudflare-poc` não recebe credencial iCloud.
3. **Custo adicional:** só se a medição mostrar que o Workers Free não basta (Workers Paid ou serviço convencional).
4. **Segunda usuária:** quando liberar o Inbox para a esposa, e quem lê as métricas de CPU no painel da Cloudflare.
5. **Mecanismo agendado da P6** (agenda do GitHub ou Cron do Worker): proposta e autorização à parte.
6. **Worker de conectividade** (`rac-icloud-connectivity-poc`): remoção só em atividade futura com autorização específica; por ora fica publicado.

### 13.13 Autenticação por OIDC (S3): política, JWKS, replay e medições (13/11/2026)

**Estado.** Decisão D-ENV: **S3**, tomada pelo dono em 13/11/2026. O Worker de validação (`experimentos/icloud-auth-probe`), o workflow (.github/workflows/icloud-auth-probe.yml; dois jobs na implementação inicial e **três jobs desde a auditoria da seção 13.14**) e os testes estão **implementados e testados localmente**. **Nada foi executado, publicado nem configurado:** nenhum Environment ou secret foi criado, o workflow não rodou, não houve deploy na Cloudflare nem acesso à Apple. A única operação do Worker é o ensaio `validar_oidc`; IMAP e SMTP reais **não existem** e exigem implementação e autorização específicas (provas P1 a P5). **O primeiro ensaio OIDC não exige cadastro de secrets Apple:** o corpo enviado é sintético e mínimo, nenhuma credencial Apple é criada, solicitada, transmitida ou armazenada nessa fase, o job `executar` nem declara secrets e o Worker não tem código que trate usuário ou senha. *Superada:* a instrução anterior (commit `480b8b4`) de cadastrar `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` antes do primeiro run; ela ampliava a exposição da senha real sem necessidade. O restante desta seção distingue o que foi **validado em fonte oficial**, o que foi **testado localmente** e o que **continua não comprovado**.

**Desenho dos jobs (atualizado pela auditoria de 13/11/2026, seção 13.14: o desenho inicial de dois jobs foi superado por três).** O job `verificar` (sem Environment e sem secrets) é o único que executa código da branch: monta o pacote a partir de uma lista fixa de arquivos, empacota sem publicar, inspeciona, calcula o `sha256` e só depois roda os testes. O job `provisionar` (Environment `cloudflare-poc`; permissão só de leitura; só `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`) **não executa nada vindo da branch**: instala o Wrangler pelo lockfile, confere o hash do pacote aprovado e o publica com uma configuração escrita no próprio workflow. O job `executar` (Environment `icloud-auth-poc`; **única** permissão `id-token: write`; sem checkout, sem Wrangler, sem credencial Cloudflare e sem nenhum secret) pede ao GitHub um token OIDC com a audiência `rac-inbox-icloud-poc:validar_oidc` e o envia ao Worker por HTTPS com um corpo sintético e mínimo (`{"operacao":"validar_oidc"}`), **sem nenhuma credencial**. Entre os jobs só vão o pacote público e o hash (de `verificar` para `provisionar`); nenhum segredo passa por outputs, artefatos, arquivos de ambiente ou logs; a URL do Worker é fixa e não sensível. A execução é só manual. Os guardas de branch dos três jobs são idênticos (só `poc/icloud-cloudflare-connectivity`), para que uma execução em outra branch, como a `main`, não publique um Worker que o job seguinte não poderia validar. Segue o teste de escopo que trava tudo isso por texto.

**Validação técnica em fonte oficial (13/11/2026).**

| Pergunta | Resposta | Fonte e situação |
|---|---|---|
| Formato do `sub` com Environment | Formato clássico `repo:ORG/REPO:environment:NOME`. Repositórios criados depois de 15/07/2026 (este foi criado em 23/10/2026) ou que optaram usam o formato imutável `repo:ORG@ID/REPO@ID:...`. O GitHub não publica exemplo imutável com Environment: `repo:raynercarvalho1@321901681/rac@1431652822:environment:icloud-auth-poc` é **inferência**. A Worker aceita exatamente os dois formatos; os demais claims restringem o contexto sem depender do `sub` | [Referência OIDC do GitHub](https://docs.github.com/en/actions/reference/security/oidc) e [changelog dos subjects imutáveis](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/). **A confirmar no primeiro run real** |
| Claims disponíveis | `iss`, `aud`, `sub`, `exp`, `iat`, `nbf`, `repository`, `repository_id`, `repository_owner`, `repository_owner_id`, `ref`, `environment` (quando o job usa Environment), `event_name`, `workflow_ref`, `job_workflow_ref`, `runner_environment` e outras | Mesma referência. `runner_environment` consta da lista do GitHub, mas o valor exato `github-hosted` é a confirmar no primeiro run |
| Audiência personalizada | Parâmetro `audience` na URL de pedido do token (`ACTIONS_ID_TOKEN_REQUEST_URL`), com `id-token: write`; sem ele, a audiência é a URL do dono do repositório | Referência OIDC do GitHub |
| Validade do token | O exemplo oficial tem `exp` 300 s depois de `iat`, mas isso não é uma garantia documentada; por isso o Worker impõe idade máxima própria (600 s) | Referência OIDC (exemplo) |
| Chaves do emissor | Documento de descoberta em `/.well-known/openid-configuration` no emissor `https://token.actions.githubusercontent.com`. As fontes divergem sobre o caminho do JWKS (`/.well-known/jwks` ou `.json`), por isso o Worker lê o `jwks_uri` do documento de descoberta do emissor fixo e só o aceita se for HTTPS e do mesmo host. A frequência de rotação não é publicada oficialmente | Documento de descoberta e exemplos de bibliotecas. **Não foi possível alcançar o emissor a partir desta máquina**: a leitura real das chaves é a confirmar no primeiro run |
| Web Crypto no Workers | RSASSA-PKCS1-v1_5 com `verify` e `importKey` é suportado. A documentação mostra importação SPKI para verificação e JWK para assinatura; **a importação de JWK para verificação não tem exemplo oficial** | [Web Crypto no Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/). A confirmar no primeiro deploy |
| Limites do Workers Free | 10 ms de CPU por requisição HTTP, 50 subrequisições por invocação, 100.000 requisições por dia, 128 MB | [Limites do Workers](https://developers.cloudflare.com/workers/platform/limits/). A verificação usa 2 subrequisições na carga do JWKS |
| Cache API em `workers.dev` | A documentação do R2 diz que chamadas de Cache API em `workers.dev` não têm efeito; outra página é ambígua | Por isso o cache do JWKS é só em memória do isolate |

**Política de confiança.** Fixa no código (`politica.mjs`), sem segredo, variável ou valor vindo do token: emissor exato; algoritmo RS256 explícito (todos os outros recusados); audiência exata por operação; `sub` exato (dois formatos); `repository`, `repository_id`, `repository_owner` e `repository_owner_id`; `environment` igual a `icloud-auth-poc`; `ref` só `refs/heads/poc/icloud-cloudflare-connectivity`; `event_name` só `workflow_dispatch`; `workflow_ref` igual ao arquivo .github/workflows/icloud-auth-probe.yml naquela branch e `job_workflow_ref` idêntico (recusa workflow reutilizável); `runner_environment` `github-hosted`; `exp` e `iat` obrigatórios e `nbf` conferido quando presente, com tolerância de 60 s e idade máxima de 600 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` são recusados. A validação ocorre **antes** de qualquer leitura do corpo (teste: o corpo nunca é consumido se o JWT falha). Respostas de recusa trazem um motivo de lista fechada, nunca valor de claim, senha ou token; o Worker não usa `console` e a observabilidade está desligada.

**JWKS: cache, rotação e indisponibilidade.** Cache em memória do isolate por 10 minutos. Kid desconhecido provoca no máximo uma recarga por minuto (falha fechada entre recargas) e a recarga **substitui** o conjunto: chave retirada pelo emissor deixa de valer na recarga seguinte. Indisponibilidade do emissor: **falha fechada na hora** quando o cache venceu e não foi possível atualizar (janela de reaproveitamento igual a zero). A janela de 1 hora do commit `480b8b4` foi **retirada** e não pode ser ampliada sem decisão do dono. Chaves RSA menores que 2048 bits, com `use` diferente de `sig` ou `alg` diferente de RS256 são ignoradas. **Implicação e limite:** mesmo sem janela, uma chave revogada pelo emissor continua aceita até o fim do cache fresco (10 minutos), porque o Worker só descobre a revogação ao recarregar. Para o ensaio, sem efeitos, fechar na hora é mais simples e seguro do que priorizar a disponibilidade; o custo é uma falha transitória se o emissor estiver fora, resolvida repetindo a execução. Não foi criada nenhuma infraestrutura persistente ou paga. **Esta política (janela, TTL e recarga) precisa ser reavaliada antes de qualquer operação real sobre a caixa de e-mail.**

**Replay (reuso do token): não está resolvido por assinatura, `exp` curto ou audiência.** Esses elementos só limitam a janela e o alcance. Dentro da validade (até cerca de 10 minutos, na prática 5 pelo exemplo oficial) o mesmo token pode ser reapresentado. O que a S3 faz: token preso a uma operação (audiência), ao Environment com aprovador, à branch e ao workflow; nada é persistido. **Risco residual:** quem capturar o token repetiria a **mesma operação autorizada**; hoje ela é só `validar_oidc`, sem credencial e sem efeito, então o impacto atual é nulo. **Uso único exigiria persistência**, e nada foi criado. Alternativas e implicações, para decidir **antes** de habilitar qualquer operação real:

| Alternativa | Como garante uso único | Custo e implicações |
|---|---|---|
| **A. Durable Object com SQLite** (recomendada para P3 em diante) | Guarda o `jti` até o `exp`; segundo uso é recusado | No Workers Free os Durable Objects existem só com SQLite, com cotas próprias e sem cobrança dentro delas (100.000 requisições por dia, 5 GB por conta; [limites](https://developers.cloudflare.com/durable-objects/platform/limits/)); exige vínculo no `wrangler.jsonc`, migração e autorização do dono; um objeto indisponível faz a validação **falhar fechada** |
| **B. KV** | Escrita eventualmente consistente: **não** garante uso único | Descartada para esse fim |
| **C. Tabela no Supabase** | Edge Function registra o `jti` | Move a fronteira, acrescenta um salto, exige migration (SQL em produção, autorização própria) |

Para as leituras de P1 e P2 o risco residual é aceitável e fica registrado; para P3 (alterações), P4 (exclusão) e P5 (envio), a alternativa A deve estar decidida e aprovada antes da execução.

**Testes e medição de CPU.**

- Testes automatizados novos: **48** (25 funcionais, 12 de escopo e 11 de isolamento), todos aprovados localmente: JWT válido; assinatura inválida; kid desconhecido; algoritmos não permitidos; `iss`, `aud`, `sub`, repositório e ID, Environment, branch, workflow e evento incorretos; expirado, ainda não válido, `iat` no futuro e token velho; claims ausentes; cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit`; JWKS indisponível, inválido, `jwks_uri` fora do emissor, chave fraca, rotação e rajada de kids desconhecidos; corpo malformado, grande, com campos extras ou com usuário e senha (recusados e nunca ecoados); corpo **nunca** lido sem OIDC válido; ensaio funcionando sem nenhum secret Apple; ausência de JWT e de qualquer credencial recusada em logs, erros e respostas. Todos com fixtures sintéticas: chaves RSA geradas em memória, emissor simulado, nenhum acesso à rede, à Cloudflare ou à Apple.
- **CPU medido (indicativo, sem deploy):** no Node 22, com chave de 2048 bits e JWT de cerca de 1,7 KB, a verificação do JWT custou mediana de 0,10 ms de CPU (p95 0,16 ms); a requisição completa do Worker com o corpo mínimo atual, mediana de 0,19 ms (p95 0,54 ms, máximo 2,0 ms); o caminho "frio" (carga simulada do JWKS, importação da chave e verificação), mediana de 0,28 ms (máximo 3,0 ms). Contra o limite de 10 ms de CPU por requisição do Workers Free, a mediana da requisição é cerca de 2% do limite e o pior caso medido (caminho frio), cerca de 30%. **Limitações:** é Node/OpenSSL, não o runtime da Cloudflare; não inclui o TLS de entrada nem de saída nem a espera de rede; ainda **não** inclui IMAP, SMTP nem o TLS com a Apple. A medição no runtime real **depende de deploy e de autorização específica**; não foi feita.

**Configuração manual futura (nenhum Environment ou secret foi criado; ações do dono, quando decidir executar):**

1. **Environment `icloud-auth-poc`:** aprovador obrigatório (o dono) e *Deployment branches* restritas a `poc/icloud-cloudflare-connectivity`. **O primeiro ensaio OIDC não exige cadastro de secrets Apple: o Environment pode ficar sem nenhum secret.** Só quando a P1 for autorizada serão cadastrados `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` (e `ICLOUD_DESTINO_TESTE` só se o envio da P5 for autorizado), e o workflow terá de ganhar essa leitura por mudança revisada e testada. Nenhuma credencial Cloudflare nele.
2. **Environment `cloudflare-poc`:** inalterado (só `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; branches `main` e `poc/icloud-cloudflare-connectivity`). **Nenhuma credencial iCloud** nele. Cada execução pedirá duas aprovações (uma por Environment).
3. **O arquivo do workflow precisa existir na branch padrão para o botão "Run workflow" aparecer** (mesma regra que exigiu a PR #19): será preciso uma PR independente só com o workflow, com autorização do dono, e o workflow deve estar também na branch da POC. A trava de branch e a política do Worker continuam limitando a execução à branch da POC.
4. **Subdomínio `workers.dev`:** o já usado pela POC de conectividade; a URL do job `executar` é fixa e deve ser ajustada se for outro.
5. **Primeiro run:** se o Worker recusar com `sub_invalido` ou `runner_environment_invalido`, o formato real do token difere do documentado; a conferência de leitura é a API de personalização do `sub` do GitHub, e a política só muda depois dessa confirmação.

**Pendências que dependem do proprietário.** Criar o Environment `icloud-auth-poc` (sem secrets; o primeiro ensaio OIDC não exige secrets Apple); autorizar a PR independente do workflow e o primeiro run (somente o ensaio `validar_oidc`, sem contato com a Apple); autorizar o deploy do Worker `rac-icloud-auth-poc` (já embutido no primeiro run) e a medição real de CPU; decidir a alternativa de uso único (A) antes de P3 a P5; autorizar, uma a uma, as provas que alteram a caixa ou enviam e-mail; e aprovar qualquer custo adicional. **Não comprovado:** o formato real das claims, a leitura do JWKS real, a verificação RSA no runtime da Cloudflare, o CPU real, qualquer autenticação na Apple e qualquer operação de e-mail.

### 13.14 Auditoria de segurança do caminho de publicação do Worker (13/11/2026)

**Escopo.** Revisão do workflow .github/workflows/icloud-auth-probe.yml e de tudo que a publicação do Worker `rac-icloud-auth-poc` toca: `experimentos/icloud-auth-probe/` (código e `wrangler.jsonc`), o Wrangler e suas dependências, as actions e os Environments. Pergunta central: **algum código, configuração, dependência ou passo controlado pela branch executa com acesso a `CLOUDFLARE_API_TOKEN` ou `CLOUDFLARE_ACCOUNT_ID`?** Nada foi publicado, executado ou configurado: sem deploy, sem run do workflow, sem Environment ou secret, sem acesso à Cloudflare ou à Apple.

**Riscos identificados e correções** (R1 a R8 corrigidos no código; R9 e R10 são residuais ou de configuração):

| # | Risco (severidade) | Evidência | Correção |
|---|---|---|---|
| R1 | **Alto.** O passo que recebia o token executava o Wrangler dentro da pasta do Worker, cujo `wrangler.jsonc` vem da branch. Uma chave `build.command` executa um comando de shell com o ambiente do passo; um `.env` ou `.dev.vars` e variáveis como `CLOUDFLARE_API_BASE_URL` (presente no Wrangler 4.161.0) podem alterar o destino das chamadas | **Demonstrado localmente:** com um `build.command` inofensivo e um token sintético, o comando executou e viu o valor da variável | A configuração de publicação é escrita **dentro do workflow**; a `wrangler.jsonc` da branch não é lida (e precisa ser equivalente, senão o job falha). A publicação roda num diretório limpo fora do repositório. A pasta do Worker só pode ter uma lista fixa de arquivos (um `.env`, `.dev.vars`, `package.json` ou `wrangler.toml` derruba o job) |
| R2 | **Alto.** Código da branch (os testes) rodava na mesma máquina do passo com secrets: um processo deixado em segundo plano, uma alteração de `PATH` ou do binário do Node poderia ler o ambiente do Wrangler depois | Análise do desenho anterior (um job só) | **Três jobs.** `verificar` (sem secrets) executa o código da branch; `provisionar` (com o Environment) não executa nada da branch. O que passa adiante é só o pacote público e o hash |
| R3 | **Médio.** `npx --yes wrangler@4.161.0` baixava o pacote sem verificar integridade e deixava as 37 dependências indiretas por faixa de versão; scripts de instalação podem rodar | O pacote tem scripts de instalação em `esbuild`, `workerd` e `fsevents` | Lockfile (`package-lock.json`) com 92 pacotes, todos com `sha512` e origem no registro oficial; `npm ci --ignore-scripts`; integridade do Wrangler conferida contra um valor escrito no workflow; nada de `npx` |
| R4 | **Médio.** Actions por tag móvel (`@v4`): a tag pode ser movida | Workflow anterior | Fixadas por SHA de commit, com a tag em comentário. **Os SHAs foram lidos das páginas públicas das releases por um agente de leitura e não foram confirmados por outra via: o dono deve conferi-los antes do primeiro run.** SHA errado faz a action não resolver e o job falhar fechado, sem risco |
| R5 | **Médio.** Integridade do pacote publicado: o empacotamento acontecia no passo com secrets, sem inspeção, e o que era enviado não era o que se podia revisar | Análise | Empacotamento sem publicar (`--dry-run`) no job sem secrets; inspeção (sem `process.env`, `eval`, `console`, sockets, endereços da Apple, `import()` dinâmico, `require`; único endereço no pacote: o emissor do GitHub); `sha256` no resumo do job; o job `provisionar` recompõe o arquivo, **confere o hash** e publica exatamente esse arquivo (`no_bundle`). **Provado offline:** o empacotamento é determinístico (duas construções, mesmo hash) e o arquivo que seria enviado tem o mesmo hash do inspecionado. A comparação do hash pelo aprovador é possível porque o job `verificar` termina antes da aprovação do Environment |
| R6 | **Baixo.** O token Cloudflare ia no argumento de um `curl`, visível na lista de processos da máquina | Workflow anterior | Passa por substituição de processo (`-K <(printf ...)`), como já ocorria com o token OIDC |
| R7 | **Baixo.** Credencial Git persistida pelo checkout e baixar mais do repositório que o necessário | `persist-credentials: false` já existia | Mantido; no job com secrets o checkout é esparso e traz só os dados da ferramenta |
| R8 | **Baixo.** Vazamento por logs ou artefatos | Revisão | A saída do Wrangler não é gravada em arquivo; o resumo só traz hash, tamanho e endereço do emissor; sem `set -x`; sem artefatos; os valores dos secrets são mascarados pelo GitHub |
| R9 | **Residual (fora do escopo, registrado).** O workflow `icloud-probe-deploy.yml` (já na `main`, usado na prova de conectividade) tem o padrão antigo: `npx` num diretório com a `wrangler.jsonc` da branch e o mesmo Environment | Leitura do arquivo | **Não alterado** nesta tarefa (está na `main` e a prova que ele serviu já foi feita). Recomendação: desativá-lo ou endurecê-lo no mesmo padrão antes de qualquer novo uso, e remover a `main` das branches do `cloudflare-poc` enquanto ele não for endurecido |
| R10 | **Residual.** O arquivo do workflow vem da branch escolhida em "Use workflow from": quem controla a branch controla o workflow e pode, por exemplo, imprimir os secrets. Os guardas de branch dentro do arquivo não são fronteira de segurança | Natureza do GitHub Actions | Só a configuração do GitHub fecha isso: ver a tabela abaixo **e a seção 13.15, que corrige esta tabela: restringir o Environment à branch da POC não basta**. O código reduz o dano (nada da branch executa no job com secrets) mas **não o elimina** |

**Efeito residual sobre o job `executar`.** Se o workflow da branch for alterado, o token OIDC pode ser enviado a outro destino. Limites: audiência fixa a uma operação, validade de poucos minutos e, hoje, operação sem credencial e sem efeito. Antes de qualquer operação real, isso se soma à decisão de uso único do token (seção 13.13).

**O que o código garante × o que depende de configuração manual do GitHub:**

| Garantido pelo código (testado) | Depende do dono, no GitHub (nada foi configurado) |
|---|---|
| Secrets só em dois passos do último job, nunca no nível do job ou do workflow | Environment `cloudflare-poc` com **aprovador obrigatório** e *Deployment branches*: **restringir à branch da POC não fecha o risco R10; a configuração recomendada passa a ser só a `main`, com o workflow privilegiado na `main` (seção 13.15)** |
| Nada da branch é executado no job com secrets; Wrangler do lockfile, sem scripts, em diretório limpo | Environment `icloud-auth-poc` com aprovador obrigatório e *Deployment branches* conforme a seção 13.15, **sem secrets** |
| Lista fixa de arquivos; config de publicação no workflow; pacote inspecionado e com hash conferido | Proteção da branch da POC: bloquear *force push* e exclusão; considerar exigir revisão antes de mudanças em `.github/workflows` |
| Actions por SHA e checkout sem credencial persistida | Aprovador deve **ler o diff do workflow e conferir o commit e o `sha256`** do resumo do job `verificar` antes de aprovar |
| `executar` sem actions, checkout, Wrangler, secrets ou credencial Cloudflare; `id-token: write` só nele | Token Cloudflare com a permissão mínima (`Account → Workers Scripts → Edit`), de uma só conta, com prazo de validade, rotacionado ou revogado ao fim da POC |
| Execução só manual, URL do Worker fixa, guardas de branch idênticos | Em *Settings → Actions*: permissão padrão do `GITHUB_TOKEN` só de leitura; exigir aprovação de execuções de colaboradores externos; permitir só actions do GitHub (e fixadas); ligar *secret scanning* e *push protection* |
| Nenhum secret Apple no workflow nem no Worker | Conferir os SHAs das actions (R4) na página de cada release |

**Evidências.** (1) Demonstração local do vetor do `build.command` com token sintético; (2) simulação offline de cada passo sem secret do workflow, com a publicação executada em `--dry-run`: o hash aprovado é igual ao do arquivo que seria enviado; (3) casos negativos, todos barrados antes de qualquer secret: `.env` escondido, `.dev.vars`, `build.command` na configuração da branch, `console.log` no código, hash adulterado; (4) 10 testes de isolamento que travam por texto: onde os secrets existem, o que pode rodar ao lado deles, lockfile e integridade, lista fixa de arquivos, pins por SHA, ausência de `npx` e de execução dinâmica no Worker. **Não comprovado:** o primeiro deploy real com este desenho (a rota de publicação sem bundle só foi exercitada em `--dry-run`), os SHAs das actions e o comportamento das aprovações de Environment no GitHub, que dependem da configuração do dono.

### 13.15 Revisão final de segurança: SHAs, workflow controlado pela branch, workflow antigo e configuração do GitHub (13/11/2026)

> **Atualização:** o desenho B recomendado nesta seção foi **aprovado pelo dono e implementado** (seção 13.16 e PR #20). As partes das seções 13.13 e 13.14 que descrevem o workflow dentro da branch da POC, e a recomendação de restringir os Environments à branch da POC, estão **superadas** pela 13.16.

**Estado.** Revisão e análise; **nenhuma mudança arquitetural foi implementada**. Nada foi executado: sem deploy, sem run do workflow OIDC, sem Environment ou secret criado, lido ou alterado, sem acesso à Apple, ao IMAP ou ao SMTP, sem alteração da `main` ou do workflow antigo.

**1. CI e SHAs das actions (verificados por fonte independente).**

| Item | Resultado |
|---|---|
| CI do commit `bddd3c2` | [Execução 43519117496](https://github.com/raynercarvalho1/rac/actions/runs/43519117496) (`Testes`, nº 191): **concluída com sucesso**; o `head_sha` da execução é exatamente `bddd3c26b4d0d3a28a8bf37a0f001efbf73c99d6`, o mesmo commit da PR #17 |
| `actions/checkout` v4.4.0 | SHA completo `11d5960a326750d5838078e36cf38b85af677262`. Fonte: o próprio repositório oficial (https://github.com/actions/checkout), tag `v4.4.0` (https://github.com/actions/checkout/releases/tag/v4.4.0), lida por `git ls-remote` e por `git fetch` do commit. É a tag mais alta da linha v4 (acima da v4.3.1). Commit "backport fixes to releases-v4 (#2524)", de 16/07/2026; o `package.json` dessa linha de backports continua em `4.3.0` (o commit de backport anterior também), o que explica a aparente discrepância |
| `actions/setup-node` v4.4.0 | SHA completo `49933ea5288caeca8642d1e84afbd3f7d6820020`. Fonte: https://github.com/actions/setup-node, tag `v4.4.0` (https://github.com/actions/setup-node/releases/tag/v4.4.0), lida por `git ls-remote` e `git fetch`. A tag móvel `v4` aponta para o mesmo commit. Commit "Bump @action/cache from 4.0.2 to 4.0.3 (#1262)", de 03/04/2025 |
| Confere com o workflow | **Sim**: o workflow usa exatamente esses dois SHAs, cada um com o comentário da tag (`# v4.4.0`), em quatro usos |

A conferência **não** depende do agente de leitura anterior: foi refeita direto nos repositórios oficiais. Limites: o SHA garante imutabilidade (a tag não pode ser movida por baixo), não a ausência de defeito no código da action, que é do GitHub e não foi auditado linha a linha.

**2. Risco residual: o workflow privilegiado vive na branch controlada.** Uma alteração maliciosa (ou descuidada) em .github/workflows/icloud-auth-probe.yml dentro da branch da PR, depois dispatchada com "Use workflow from" essa branch, **consegue**:

| Pergunta | Consegue? | Por quê |
|---|---|---|
| Remover ou alterar os controles de segurança | **Sim** | Todos os controles (lista fixa de arquivos, hash, integridade do lockfile, guardas, separação em jobs) são texto desse mesmo arquivo; os testes também são da branch |
| Adicionar passos arbitrários ao job `provisionar` | **Sim** | Basta um passo com `env: CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}` e um `curl` |
| Usar o Environment `cloudflare-poc` de outra forma | **Sim** | O vínculo com o Environment é a linha `environment:` do job; qualquer job do arquivo (ou um job novo) pode declará-la |
| Acessar o token **depois** da aprovação | **Não por troca do arquivo** (o run usa o arquivo do commit do disparo; comportamento documentado do GitHub, a confirmar no primeiro run) **mas sim, com o arquivo que foi aprovado** | A aprovação autoriza a **execução**, não os passos: a tela de aprovação não mostra o que cada passo fará |
| Publicar código diferente do pacote revisado | **Sim** | A conferência do hash está no mesmo arquivo; um arquivo alterado pode pular a conferência ou calcular o hash do pacote malicioso |
| Contornar as verificações de hash e de arquivos permitidos | **Sim** | Idem |

**O que cada proteção realmente cobre:**

| Proteção | Cobre | Não cobre |
|---|---|---|
| Aprovador obrigatório do Environment | Um humano precisa liberar cada execução | Não valida o conteúdo; só vale se o aprovador **lê o workflow do commit** antes. Se o Environment não exigir aprovador, não há nenhum portão: um sinal (a verificar) é que na execução real 43500897569 o job começou cerca de 20 s depois da criação, tempo típico de espera por máquina e não de aprovação humana, o que sugere que `cloudflare-poc` **não** exigiu aprovação |
| *Deployment branches* do Environment | O GitHub recusa, no servidor, dar o Environment a runs de **outras** refs | Não protege contra conteúdo malicioso **na ref permitida**: se a única ref permitida é a branch da POC, o arquivo malicioso da própria branch passa. **Se a única ref permitida for a `main`, um workflow da branch não obtém o Environment, qualquer que seja o conteúdo do arquivo** |
| Proteção da branch (ruleset) | Impede reescrever o histórico e apagar a branch | Não separa quem escreve de quem aprova: o agente e o dono usam a mesma identidade do GitHub (os commits e execuções aparecem como o dono), então exigir aprovação de outra pessoa é impossível ou contornável |
| Revisão de código | Só vale como ponto de decisão consciente do dono | Hoje o portão humano real são os cartões de confirmação do aplicativo (commit, push, PR e merge), que o `CLAUDE.md` avisa que podem não aparecer em modo Auto |
| Workflow privilegiado na `main` | O arquivo só muda por merge na `main`, que passa pelo cartão de confirmação do dono; com os Environments restritos à `main`, a branch deixa de ter qualquer privilégio | Não protege contra um merge indevido na `main`, nem contra Worker malicioso vindo de código da branch (por isso o pacote precisa de revisão e hash) |

**3. Recomendação (a arquitetura mais segura): workflow privilegiado na `main`, Environments restritos à `main`, código da POC só como dado verificado.** Não implementada: esta é a análise e os impactos para decisão do dono.

- **Desenho (B).** O workflow vive só na `main` (por PR reservada ao dono) e é disparado a partir da `main` com uma entrada, o commit de 40 caracteres da POC a publicar. Um job sem secrets baixa esse commit **como dados** (a lista fixa de arquivos), empacota com o Wrangler do lockfile **da `main`**, inspeciona e calcula o `sha256`; o job com o Environment (só `main`) não executa nada da branch e publica o pacote aprovado; o job `executar` também fica na `main`. O código dos testes da POC pode rodar num job sem secrets. A política OIDC do Worker passa a exigir `ref` e `workflow_ref` da `main`.
- **Por que fecha o R10.** O GitHub só entrega os secrets de `cloudflare-poc` e o Environment `icloud-auth-poc` a runs cuja ref é a `main`. Um workflow alterado na branch, mesmo dispatchado, não recebe nenhum secret, e o token OIDC dele não teria a `ref` nem o Environment que o Worker exige.
- **Impactos.** (a) O arquivo precisa estar na `main` de qualquer jeito: o botão "Run workflow" já exige isso; portanto o custo extra é decidir que a cópia da branch some, em vez de ficar nas duas. (b) Uma PR dedicada, mesclada pelo dono (cartão de confirmação); o merge dispara a publicação do site, sem mudança funcional. (c) Ajuste do workflow (entrada do commit e checkout como dados), da política do Worker (`main`) e dos testes de escopo e isolamento. (d) O dono continua com dois portões: o merge do workflow e a aprovação de cada execução, conferindo o hash. (e) O que **não** se resolve: Worker malicioso vindo da branch (mitigado por inspeção e hash do pacote, revisão do diff dos quatro arquivos e aprovação consciente) e comprometimento da `main`.
- **Alternativas avaliadas.** *C: manter o workflow na branch com Environment restrito à branch da POC*: é o desenho atual; só é seguro se o aprovador ler o workflow a cada execução, e não resolve R10. *D: dois workflows, um na branch que gera um artefato e um na `main` que o baixa*: equivalente ao B em segurança, com mais peças (artefatos entre runs, uma action a mais fixada por SHA) e sem ganho. **Recomendo B.**
- **Enquanto B não for decidido e implementado:** não criar secrets de aprovação nem executar o workflow da branch. O primeiro ensaio OIDC não tem urgência.

**4. Workflow antigo `icloud-probe-deploy.yml` (na `main`).** Permissões: `contents: read` no workflow. Credenciais: usa o Environment `cloudflare-poc` e **`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` em três passos** (conferência do token, `npx --yes wrangler@4.161.0 deploy` e `npx --yes wrangler@4.161.0 secret put PROBE_TOKEN`). Os dois últimos rodam em `experimentos/icloud-probe`, sem lockfile e com a `wrangler.jsonc` da ref; as actions estão por tag móvel (`@v4`); o guarda aceita `main` e a branch da POC. **Ainda é um caminho de exposição:** hoje a pasta `experimentos/icloud-probe` não existe na `main`, então um disparo a partir da `main` falha nos testes antes de qualquer passo com secrets; mas a **branch da POC tem uma cópia idêntica do arquivo e a pasta**, de modo que um disparo a partir dela executa o mesmo vetor do R1 (`build.command` na `wrangler.jsonc`, `.env`) com os secrets do Environment, e a branch controla ambos. Ele também reimplantaria e rotacionaria o `PROBE_TOKEN` do Worker de conectividade, que já cumpriu o papel. **Recomendação:** desativá-lo agora (*Actions → o workflow → Disable workflow*, ação do dono, reversível) e, em PR futura, removê-lo ou reescrevê-lo no mesmo padrão do novo. Nada foi alterado nesta tarefa.

**5. Configuração do GitHub que depende do dono (nada foi configurado).**

| Classe | Configuração | Observação |
|---|---|---|
| **Requisito** | Environments `cloudflare-poc` e `icloud-auth-poc` com **aprovador obrigatório** | Verificar se `cloudflare-poc` já tem: há indício de que não tinha na execução anterior |
| **Requisito** | *Deployment branches and tags* dos dois Environments restritas **só à `main`** (e o workflow privilegiado só na `main`, desenho B) | Com a branch da POC permitida, o risco R10 permanece |
| **Requisito** | Secrets só no nível do Environment, nunca no repositório; `icloud-auth-poc` sem secrets no primeiro ensaio | |
| **Requisito** | Token Cloudflare com a permissão mínima (`Account → Workers Scripts → Edit`), de uma conta, com prazo de validade, revogado ao fim da POC | |
| **Requisito** | Desativar o workflow antigo (item 4) | Ou endurecê-lo antes de qualquer novo uso |
| **Requisito** | *Settings → Actions → General*: permissão padrão do `GITHUB_TOKEN` só de leitura | Os workflows novos já declaram permissões mínimas, mas o padrão protege os demais |
| **Recomendação** | Desligar a opção de administradores contornarem as regras do Environment (*Allow administrators to bypass*) | Verificar o nome na interface |
| **Recomendação** | Proteção (ruleset) da branch da POC e da `main`: bloquear *force push* e exclusão | Não cria separação de funções, só preserva o histórico |
| **Recomendação** | Exigir aprovação de execuções de workflows de colaboradores externos; ligar *secret scanning* e *push protection* | O repositório é público |
| **Recomendação** | O aprovador abre o run, lê o workflow do commit e confere o commit e o `sha256` do resumo do job `verificar` antes de aprovar | Sem isso a aprovação é só um clique |
| **Opcional** | *Prevent self-review* no Environment | **Só com um segundo revisor**: com uma única conta ele impediria o próprio dono de aprovar |
| **Opcional** | Permitir só actions do GitHub fixadas por SHA (política de actions); Dependabot para actions e para o lockfile; CODEOWNERS para `.github/workflows` | Sem efeito de separação enquanto houver uma única conta |

**6. Próximo gate de autorização (não executado).** Duas decisões separadas e sequenciais do dono: **(a)** aprovar o desenho B (ou aceitar o C, sabendo do risco R10), o que gera uma tarefa de implementação, com a PR dedicada do workflow para a `main`; **(b)** só depois, preparar os Environments (aprovador, só `main`, `icloud-auth-poc` sem secrets), desativar o workflow antigo e autorizar a primeira validação OIDC real, **sem credenciais Apple**. Riscos do gate (b): primeiro deploy real com o desenho novo (a publicação sem bundle só foi exercitada em `--dry-run`); formato real das claims e do JWKS por confirmar; CPU real por medir; uma execução malsucedida não causa dano (falha fechada). Pré-requisitos: B decidido e implementado, Environments configurados, workflow antigo desativado, SHAs conferidos (feito aqui) e token Cloudflare de permissão mínima com prazo.

### 13.16 Desenho B implementado: workflow privilegiado só na main (13/11/2026)

**Estado.** Aprovado pelo dono e **implementado e testado localmente; não executado**. O workflow, a ferramenta (Wrangler por lockfile) e o guia estão na **PR #20** (para a `main`, sem merge); o Worker e a política OIDC atualizada estão nesta branch (PR #17, Draft). Nada foi executado: sem deploy, sem run do workflow, sem Environment ou secret criado, lido ou alterado, sem acesso à Apple, ao IMAP ou ao SMTP, sem alteração de configuração do GitHub. Guia operacional, fronteiras de confiança, permissões, configuração manual e procedência dos SHAs: `docs/icloud-poc-deploy.md` (na PR #20).

**O que mudou.**

| Antes (seções 13.13 e 13.14) | Agora (Desenho B) |
|---|---|
| O workflow privilegiado vivia na branch da POC; quem controlava a branch controlava os secrets | O workflow existe **só na `main`** (a cópia saiu desta branch); só muda por merge do dono |
| Environments restritos à branch da POC | Environments `cloudflare-poc` e `icloud-auth-poc` **só a `main`** (configuração do dono): um workflow alterado numa branch não recebe secrets nem o Environment |
| O job `verificar` rodava os testes da branch | Nenhum código da POC é executado no workflow: o commit entra como **dado** (entrada `commit`, 40 hexadecimais), copiado por uma lista fixa de arquivos (sem links simbólicos, `.env`, `.dev.vars`, `package.json` ou `wrangler.toml`) e só empacotado e inspecionado. O CI da PR da POC testa o commit |
| Ferramenta (lockfile) da própria branch | Ferramenta (Wrangler 4.161.0, `npm ci --ignore-scripts`) **da `main`** |
| Workflow antigo `icloud-probe-deploy.yml` ativo na `main` e na branch | **Retirado** (um único caminho de publicação privilegiada); cópia removida desta branch. Até o merge da PR #20, o dono neutraliza o da `main` em *Actions → o workflow → Disable workflow* |

**Fronteiras de confiança e permissões** (detalhe no guia): `verificar` (sem Environment e sem secrets, `contents: read`); `provisionar` (Environment `cloudflare-poc`, só secrets da Cloudflare nos dois últimos passos, não baixa a branch da POC, publica o arquivo cujo `sha256` foi conferido entre os jobs, sem novo empacotamento); `executar` (Environment `icloud-auth-poc`, sem nenhum secret, única permissão `id-token: write`). Entre os jobs só vão o commit, o hash e o pacote, todos públicos. Os guardas dos três jobs exigem `refs/heads/main`.

**Política OIDC do Worker (atualizada).** `ref` igual a `refs/heads/main`; `workflow_ref` e `job_workflow_ref` iguais ao arquivo na `main`; demais controles mantidos, nenhum enfraquecido: assinatura RS256, JWKS só do emissor oficial (HTTPS, mesmo host, sem reaproveitar chave velha), `iss`, `aud` por operação, `sub`, repositório e IDs, `environment`, `event_name`, `runner_environment`, `exp`, `iat`, `nbf`, rejeição de `jku`, `x5u`, `x5c`, `jwk` e `crit`. Tokens da branch da POC, de branches de agente, de PRs e de tags passam a ser recusados.

**Limitação de replay (mantida).** Assinatura, `exp` curto e audiência **não** impedem reutilizar o token dentro da validade; uso único exigiria persistência (Durable Object com SQLite), **não implementada** e dependente de autorização específica, a decidir antes de qualquer operação que altere a caixa ou envie e-mail. A única operação é `validar_oidc`, sem credencial e sem efeito.

**Critérios de aceite × testes (todos executados e aprovados localmente).**

| # | Critério | Onde é provado |
|---|---|---|
| 1 | A branch da POC não modifica o workflow privilegiado | Teste do workflow (PR #20): ele só existe e só roda na `main` (guardas de ref nos três jobs); o commit da POC só é lido como dado |
| 2 | A branch não executa comandos arbitrários com secrets | Teste do workflow: secrets só nos dois últimos passos do `provisionar`, que não baixa a branch nem executa nada dela; **execução real** recusa `.env`, `.dev.vars`, `package.json`, `wrangler.toml`, link simbólico e `build.command` na configuração |
| 3 | O artefato publicado é o inspecionado, com hash validado | Teste do workflow: inspeção, `sha256`, `no_bundle`; execução real da reconstituição |
| 4 | Artefatos adulterados são rejeitados | Execução real: pacote adulterado, hash errado, zerado, vazio e um byte a menos são recusados e nenhuma configuração de publicação é gerada |
| 5 | O job OIDC não recebe secrets Cloudflare | Teste do workflow: `executar` sem `secrets`, Wrangler, actions ou checkout |
| 6 | Tokens de origens, branches, eventos, workflows e ambientes não autorizados são rejeitados | Testes funcionais do Worker (esta branch): tabela de origens não autorizadas (branch da POC, de agente, PR, tag, workflow de cópia, outro arquivo, outro repositório, reutilizável, eventos, Environments, `sub`, runner próprio, emissor, audiência) |
| 7 | Falha de assinatura ou JWKS bloqueia | Testes funcionais: assinatura inválida, `kid` desconhecido, JWKS indisponível, inválido, fora do emissor, rotação e janela zero |
| 8 | O Worker só aceita a validação OIDC | Testes funcionais e do Worker: única operação `validar_oidc`, sem código de credencial e sem acesso à Apple |
| 9 | Campos extras e operações não autorizadas são rejeitados | Testes funcionais: usuário, senha, campo extra, operação desconhecida e corpo grande ou malformado |

**Riscos residuais.** Worker malicioso vindo de código da branch (mitigado por lista fixa, inspeção do pacote, hash e revisão do diff dos quatro arquivos antes de aprovar); comprometimento da `main`; replay; e a fronteira depende da configuração do GitHub (Environments só da `main`, aprovador obrigatório). **Não comprovado:** o primeiro deploy real com este desenho (a publicação sem bundle só foi exercitada em `--dry-run`), o formato real das claims e do JWKS, o CPU no runtime da Cloudflare e o comportamento das aprovações de Environment. A fase I0 **não** está concluída.

**Depende do dono (nada configurado).** Mesclar a PR #20; Environments com aprovador obrigatório e só a `main`; neutralizar o workflow antigo até o merge; token Cloudflare de permissão mínima com prazo; mesclar a PR #17 (Worker e política); só então autorizar o primeiro ensaio OIDC, sem credencial Apple.

### 13.17 Primeira execução OIDC real falhou em `jwks_indisponivel`: diagnóstico e correção (14/11/2026)

**O que aconteceu.** O primeiro ensaio ([execução 43530755370](https://github.com/raynercarvalho1/rac/actions/runs/43530755370), `main` `f23d9d9`, commit da POC `2a7a439`) publicou o Worker e o `executar` obteve o token OIDC do GitHub, mas o Worker respondeu **HTTP 401, motivo `jwks_indisponivel`**. A prova OIDC **não** estava concluída nesse momento (exige HTTP 200 com `ok: true`, `oidc: "validado"` e `operacao_reconhecida: true`); **concluída na execução seguinte, seção 13.18**.

**O que o resultado já prova.** O token chegou ao Worker, passou pelo formato (3 partes, JSON válido), por `alg` RS256, pela ausência de cabeçalhos proibidos e por um `kid` presente: a recusa veio só da etapa de obter a chave. Nenhuma claim chegou a ser conferida, então o formato real das claims **continua não comprovado**.

**Causa mais provável (comprovada em código, não no runtime publicado).** A busca da descoberta e do JWKS usava `redirect: "error"`. O runtime do Cloudflare Workers (workerd) só aceita `"follow"` e `"manual"`: o código-fonte do `Request` rejeita qualquer outro valor com `TypeError: Invalid redirect value, must be one of "follow" or "manual"` (o comentário no fonte diz que "error" não faz sentido na borda). O `fetch` lançava antes de qualquer rede, a exceção era capturada e `verificarJwt` a convertia em `jwks_indisponivel`, sem dizer a etapa. Isso explica por que os dois endpoints respondiam bem de fora e mesmo assim o Worker falhava, e por que os testes locais não viram o problema (o fetch simulado ignorava as opções). **Reprodução local:** o código antigo contra um fetch que aplica a regra do workerd lança exatamente esse `TypeError`. **Não comprovado:** o texto real do erro no Worker publicado, que só um novo run mostrará (a resposta agora traz o detalhe).

**Correção (a validação estrita não mudou).**
- A busca usa `redirect: "manual"` e **recusa qualquer 3xx** (nenhum redirecionamento é seguido), mantendo o espírito do `"error"`.
- A leitura do corpo agora conta **bytes** e para ao passar do limite (65.536), conferindo antes o `Content-Length`; antes lia tudo e comparava caracteres.
- A resposta 401 por falha de chaves ganha o campo **`detalhe`**, de lista fechada (`DETALHES_JWKS` em `politica.mjs`), sem JWT, claim, URL, cabeçalho ou texto de erro: `discovery_timeout`, `discovery_fetch_erro`, `discovery_redirect`, `discovery_http_erro`, `discovery_grande_demais`, `discovery_json_invalido`, `discovery_emissor_invalido`, `discovery_jwks_uri_invalido`, `jwks_timeout`, `jwks_fetch_erro`, `jwks_redirect`, `jwks_http_erro`, `jwks_grande_demais`, `jwks_json_invalido`, `jwks_sem_chave_valida`; qualquer erro fora da lista vira `jwks_erro_inesperado`. O `motivo` continua `jwks_indisponivel`.
- **Inalterados:** emissor fixo, HTTPS e mesmo host do `jwks_uri`, RS256, todas as claims, nenhuma chave vinda do token, cache de 600 s, janela de chave velha 0, recarga mínima de 60 s, timeout de 5 s, limite de 64 KB e chave RSA mínima de 256 bytes. Falha fechada.

**Verificação do formato das chaves do GitHub (item pedido).** Não foi possível ler o JWKS real: o ambiente de nuvem não alcança `token.actions.githubusercontent.com`. Os testes usam chaves RSA de 2048 bits geradas localmente no formato documentado (`kty`, `kid`, `n`, `e`, `use`, `alg`, `x5c`, `x5t`); quatro chaves ocupam uma fração do limite de 64 KB. **Comprovar com o documento real só será possível no run seguinte** (se `jwks_sem_chave_valida` ou `jwks_json_invalido` aparecer, o formato real difere do documentado).

**Testes.** Em `tests/icloud_auth_probe.test.mjs`: um fetch que imita a regra do workerd (rejeita `redirect` fora de follow/manual) com o caminho de sucesso; 26 casos de falha cobrindo as 15 categorias (um teste confere que toda categoria da lista está coberta); erro inesperado sem vazar mensagem; resposta do Worker com `detalhe`; JWKS no formato do GitHub; e uma guarda contra o retorno de `redirect: "error"`.

**Próximo passo para validar no ambiente real (depende do dono).** Como o Worker é publicado a partir do commit de entrada, o commit `2a7a439` **não contém a correção**: é preciso um novo commit na branch da POC e um novo run do workflow na `main` com esse commit (aprovando o Environment depois de conferir o resumo do job `verificar`). Nada foi executado, publicado ou alterado em Environments e secrets nesta correção. A fase I0 **não** está concluída.

### 13.18 Validação OIDC real concluída com sucesso (14/11/2026)

**Resultado.** A segunda execução manual do workflow [execução 43535195165](https://github.com/raynercarvalho1/rac/actions/runs/43535195165) (`workflow_dispatch` na `main`, `f23d9d9`; início 00:35:20 UTC, fim 00:37:55 UTC) terminou com **sucesso**: os três jobs (`verificar`, `provisionar`, `executar`) concluíram com sucesso. **O GitHub Actions autenticou-se no Worker `rac-icloud-auth-poc` por OIDC e o Worker validou o token.**

**Evidências conferidas no GitHub Actions (sem expor token nem dados sensíveis).**
- **Commit da POC publicado (entrada de dados):** `d1f25d3d1b80ad6aa1712bb8563ce616cc5b7b58`, a correção da seção 13.17. O log do `provisionar` registra "Pacote conferido: sha256 `939d49a92a3a25fda8f24663074ba4b4bac25a22aef84c2751797017f5d46bbb` (commit da POC `d1f25d3d…`)". A `main` executada foi `f23d9d9`, que contém o workflow da PR #20.
- **Publicação:** Wrangler 4.161.0 enviou 18,32 KiB (5,56 KiB com gzip); o log do Wrangler reporta "Worker Startup Time: 3 ms" (tempo de inicialização, **não** CPU por requisição). Token Cloudflare confirmado como ativo, sem exibir dados da conta.
- **Validação:** o passo "Validar o JWT no Worker" do job `executar` terminou com a mensagem "JWT OIDC aceito pelo Worker e operação reconhecida (sem credencial e sem acesso à Apple)". Pelo código do workflow, essa mensagem só é emitida quando a resposta do Worker é **HTTP 200** e o JSON satisfaz `ok == true`, `oidc == "validado"` e `operacao_reconhecida == true`, o critério de conclusão exigido. O corpo da resposta fica no resumo do job e **não foi relido nesta consolidação**; nenhum campo além desses foi assumido.

**O que ficou comprovado.**
1. A validação OIDC real funciona de ponta a ponta: o token emitido pelo GitHub foi aceito pelo Worker com a política estrita (emissor, audiência, `sub`, repositório e IDs, Environment, `ref` e `workflow_ref` da `main`, evento, `job_workflow_ref`, runner e claims temporais).
2. **O formato real das claims e do JWKS do GitHub é compatível** com a política e com a importação RSA (o Worker obteve a descoberta e o JWKS reais, importou uma chave e verificou a assinatura RS256).
3. **A correção de compatibilidade do JWKS foi validada no Cloudflare Workers:** a execução 1 (commit `2a7a439`) falhou com `jwks_indisponivel`; a execução 2 (commit `d1f25d3`) passou. A diferença entre os dois commits é exatamente a correção da seção 13.17 (`redirect: "manual"` no lugar de `"error"`, limite de leitura em bytes e detalhe de falha), o que confirma `redirect: "error"` como causa; a mudança vale como conjunto, não isola uma linha.
4. O fluxo de três jobs com Environments funcionou (a execução 2 mostra a espera entre `verificar` e `provisionar` compatível com a aprovação do Environment; a configuração dos Environments **não** foi consultada nesta consolidação).

**O que este resultado NÃO prova.** A validação OIDC **não autentica nenhuma conta Apple** e não usou credencial Apple. **Continuam não comprovados:** autenticação IMAP, autenticação SMTP, leitura de mensagens, sincronização, envio de e-mails, CPU por requisição no Workers Free, uso único do token (replay) e a substituição do Spark. **A POC da fase I0 não está concluída:** as provas P1 a P7 (seção 13.11) seguem pendentes.

**Estado das fases.** **I0:** em andamento. Feitos: P0 (conectividade TCP/TLS), a arquitetura de autenticação S3/Desenho B e a validação OIDC real. Pendentes: P1 a P7. **I1 (Fundação):** não iniciada; depende do resultado da I0 e de decisões do dono.

### 13.19 Proteção contra replay (Durable Object) e P1 IMAP: implementação (14/11/2026)

**Decisão do dono (14/11/2026).** Autorizou a implementação integrada da proteção contra replay com Durable Objects + SQLite e da P1 (autenticação IMAP somente leitura), a publicação do Worker e a execução da P1, incluindo a criação do Durable Object. **O merge de qualquer PR continua dependendo de autorização explícita.** A credencial Apple é cadastrada pelo dono, direto no GitHub, como secrets do Environment `icloud-auth-poc`; nunca pelo chat.

**1. Implementação concluída (código, local).**
- **Registro de uso único:** Durable Object com SQLite, objeto único e nomeado; chave `run_id:run_attempt:operacao`; `jti` gravado só para auditoria; consumo atômico e persistente **antes** da execução e antes de ler o corpo; retenção de 24 h com limpeza preguiçosa que só apaga o que já passou da retenção; repetição = HTTP 409; falha, indisponibilidade ou timeout = HTTP 503 sem executar a operação. Não usa KV nem cache em memória como exclusão mútua. Nada de senha, token ou e-mail é gravado.
- **Claims e idade:** `jti`, `run_id` e `run_attempt` obrigatórios com formato estrito; idade máxima de 60 s (sem somar a tolerância) nas operações com credencial; a validação OIDC existente ficou intacta.
- **P1:** `CAPABILITY`, `LOGIN`, `LIST` e `LOGOUT` sobre TLS na porta 993; uma única tentativa de login; resposta de esquema fechado (booleanos, contagens, estágio e código de erro); a pasta de teste `RAC-TESTE` vira só um booleano; nenhum nome de pasta, endereço ou texto do servidor sai.
- **Arquivos do Worker:** `consumo.mjs`, `imap.mjs`, `rotas.mjs` (lógica testável, antes em `index.mjs`), `index.mjs` (entrada), `politica.mjs`, `jwt.mjs` e `wrangler.jsonc` (Durable Object `CONSUMO` e migração `v1` com `new_sqlite_classes`).
- **Workflow (PR separada na `main`):** nova entrada `operacao` (`validar_oidc`, `validar_uso_unico`, `p1_imap`); configuração fixa e migração do Durable Object; inspeção do pacote com listas exatas (módulo `cloudflare:sockets`, host `imap.mail.me.com`, endereço interno do objeto, verbos IMAP proibidos, classe exportada); sem repetição automática na chamada protegida; credencial só por entrada padrão e só no passo da P1.

**2. Testes automatizados.** Rodados localmente (resultados na seção 6 do relatório da entrega e no histórico diário): lógica de consumo com SQLite real do Node, 20 chamadas simultâneas com a mesma chave (exatamente uma aceita), chaves distintas, expiração e limpeza, falha fechada (indisponibilidade, timeout, respostas inválidas), claims ausentes e inválidas, idade de 60 s, replay com `jti` diferente na mesma execução, esquemas de requisição e resposta, ausência de credencial em logs e respostas, ausência de comandos IMAP proibidos (servidor IMAP falso), e no workflow o passo de inspeção do pacote **executado** com bundles bons e ruins. **Evidência adicional, local e não oficial:** o pacote real passou no `wrangler deploy --dry-run` (Wrangler 4.161.0, 38 KB, binding do Durable Object aceito) e a classe rodou no **workerd local**: 20 chamadas simultâneas, 1 aceita e 19 recusadas; 40 requisições HTTP simultâneas, 1 aceita; o estado persistiu após reiniciar o runtime; entrada inválida virou falha fechada. **Nada disso substitui o runtime publicado.**

**3. Publicação: não executada.** *(situação superada: ver a seção 13.20)* Depende do merge da PR do workflow na `main` (decisão do dono), da atualização desta branch com a `main`, da aprovação do Environment `cloudflare-poc` e de o token Cloudflare permitir a migração do Durable Object (a confirmar: se `Workers Scripts → Edit` não bastar, a permissão adicional exata será documentada e a alteração é do dono).

**4. Prova sintética de uso único no runtime real: não executada.** *(situação superada: ver a seção 13.20)* `validar_uso_unico` dispara dez chamadas simultâneas da mesma execução e exige exatamente 1 aceita (200), 9 recusadas (409), e a recusa (409) do replay do mesmo token e de um token novo da mesma execução. Se falhar, **não** se prossegue para a autenticação Apple.

**5. Autenticação IMAP (P1): não executada.** *(situação superada: ver a seção 13.20)* Exige os secrets `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` no Environment `icloud-auth-poc`, cadastrados pelo dono. Uma falha encerra a prova e registra só o estágio e o código de erro; nada é repetido automaticamente.

**Situação.** I0 **não** concluída (P1 a P7 pendentes; só P0, a arquitetura S3 e a validação OIDC estão comprovadas). I1 **não** iniciada.

### 13.20 Publicação, prova sintética real e falha da P1 por formato do corpo (14/11/2026)

**Publicação e prova sintética de uso único: executadas e aprovadas (execução [43585089326](https://github.com/raynercarvalho1/rac/actions/runs/43585089326)).** `main` `4ff3ed9` (workflow da PR #21), 14/11/2026 das 10:23 às 10:25 UTC, operação `validar_uso_unico`. Os três jobs concluíram com sucesso e o passo da prova terminou com a mensagem "Uso único comprovado no runtime publicado: 1 aceita, 9 recusadas, replay recusado" (o workflow só a emite com exatamente 1 resposta 200, 9 respostas 409 e 409 para o replay do mesmo token e de um token novo da mesma execução). O log do `provisionar` mostra o binding `env.CONSUMO (ConsumoUnico)` como Durable Object e o Worker publicado (versão `e3ea4ab9-c9a2-4cf8-bef1-c71231f66c44`). **Comprovado, portanto:** o Durable Object foi criado com a migração SQLite no plano Free, com o token Cloudflare existente (sem permissão adicional); o uso único funciona no runtime real, com concorrência e replay. **Não lido nesta consolidação:** o corpo das respostas no resumo do job e o hash do pacote (constam no resumo do `verificar` e no log do `provisionar`).

**P1 IMAP: falhou antes de tocar na Apple (execução [43597133032](https://github.com/raynercarvalho1/rac/actions/runs/43597133032)).** `main` `4ff3ed9`, 14/11/2026 às 12:55 UTC, operação `p1_imap`. `verificar` e `provisionar` passaram; no `executar` a pré-checagem (`validar_oidc`) passou, os secrets `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` chegaram ao passo (mascarados no log) e o Worker respondeu **HTTP 400** com `erro: corpo_invalido` e `motivo: esquema_invalido`. **Nenhuma conexão ou autenticação Apple ocorreu**, e o uso único daquela execução foi consumido (o consumo vem antes de ler o corpo); a execução não se repete, uma nova tem outro `run_id`.

**Causa técnica.** O código `esquema_invalido` só é devolvido por `lerCorpo` (agora `examinarCorpo`) em `rotas.mjs`, quando o corpo não satisfaz o esquema. **O contrato de campos já estava correto nos dois lados:** o workflow monta exatamente `{operacao: "p1_imap", usuario, senha}` (com `jq`, a partir do ambiente) e o Worker exige exatamente esses três campos; um teste de ponta a ponta que executa o passo real do workflow contra o `tratar` do Worker confirma que valores no formato esperado são aceitos. Logo, a rejeição só pode vir do **formato de `usuario` (endereço de e-mail) ou de `senha` (senha específica de app, `xxxx-xxxx-xxxx-xxxx`, letras minúsculas)**, ou de espaço ou quebra de linha embutido no valor do secret. **Qual dos dois falhou não era distinguível**, porque a resposta 400 era genérica; e os secrets não são lidos por ninguém além do GitHub. A hipótese mais provável (não comprovada) é espaço ou quebra de linha nas pontas do secret, comum ao colar no GitHub. Também estava desatualizado o comentário de `rotas.mjs`, que ainda dizia que o corpo só podia ter `operacao`.

**Correção (na branch da PR #17; não publicada).**
- A resposta 400 do esquema passou a trazer `detalhe`, de **lista fechada** (10 códigos: `corpo_nao_json`, `corpo_nao_objeto`, `operacao_invalida`, `campos_inesperados`, `campo_ausente_usuario`, `campo_ausente_senha`, `usuario_tipo_invalido`, `usuario_formato_invalido`, `senha_tipo_invalida`, `senha_formato_invalida`), que diz qual regra falhou, **nunca o valor**. O resumo do job já mostra o campo `detalhe`.
- `usuario` e `senha` são **aparados nas pontas** antes da conferência (o valor aparado é o único usado depois). Justificativa técnica: segredos colados no GitHub costumam levar quebra de linha ou espaço nas pontas, que não carregam informação e nunca fazem parte do e-mail nem da senha de app. **O formato continua estrito:** espaço no meio, maiúsculas, falta de hífens, aspas e qualquer outro desvio seguem recusados; a validação da senha **não foi afrouxada**.
- `validar_oidc` e `validar_uso_unico` continuam aceitando exclusivamente `operacao`. A proteção contra replay e a retenção **não foram alteradas**.
- Comentários e documentação alinhados ao contrato.

**Testes.** `tests/icloud_auth_probe_contrato.test.mjs` (novo, 8 testes) executa de verdade os passos do `executar` do workflow (bash, curl e jq) contra um servidor HTTP local que roda o `tratar` real do Worker, com consumo em SQLite e IMAP simulado, para as três operações: corpo exato por operação; 10 chamadas simultâneas (1 aceita, 9 recusadas) mais replays; P1 com sentinelas (uma única chamada, `usuario` e `senha` entregues ao IMAP); segredos com quebra de linha ou espaço nas pontas; segredos em formato errado (400 com o `detalhe` do campo, IMAP não chamado); ausência dos secrets (o passo para antes de qualquer chamada); tabela de corpos inválidos por HTTP; e o programa `jq` do passo (exatamente três campos). Também conferem que a credencial não aparece em log, resumo, resposta, arquivo temporário nem no registro de uso único. Mutações (nomes de campo trocados no workflow; Worker sem aparar) são detectadas. Em `tests/icloud_auth_probe.test.mjs` a tabela de corpos inválidos da P1 passou a verificar o `detalhe` de cada caso (19 casos) e há um teste novo do contrato do corpo. Resultados da suíte completa: histórico diário de 14/11/2026.

**Situação.** Publicação da correção: **não feita**. P1: **não executada novamente** (nenhuma conexão ou autenticação Apple desde a falha). Próxima execução: nova execução do workflow com o SHA novo, depois de revisar o pacote. Antes, conferir os secrets no GitHub (sem enviar valores a ninguém): `ICLOUD_USER` = endereço de e-mail completo, sem espaços; `ICLOUD_APP_PASSWORD` = senha específica de app no formato `xxxx-xxxx-xxxx-xxxx` (minúsculas e hífens). Se falhar de novo, o resumo do job mostra o `detalhe`. **I0 não concluída; I1 não iniciada.**
