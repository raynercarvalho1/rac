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
| `js/inbox.js` | Interface, navegação, lista, leitura, composição e ações |
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
