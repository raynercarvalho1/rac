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
| **I0 · Provas e decisão de runtime (iCloud)** | Sequência de provas P1 a P7 da seção 13.11, com conta de teste e mensagens de teste; medição de CPU, latência e confiabilidade; decisão do runtime do conector | P1 a P7 executadas e registradas com evidência; operações que alteram a caixa ou enviam e-mail só com autorização específica; runtime decidido por medição (Workers Free, Workers Paid ou serviço convencional) e custo aprovado pelo dono |
| **I1 · Fundação** | Contas e credenciais (Vault), Edge Function como fronteira, contrato do conector com assinatura HMAC, esquema do índice com RLS, sincronização de pastas e metadados, lista mínima na interface | Conta de teste conectada pelo fluxo definitivo; teste automatizado de isolamento (um usuário nunca lê dados do outro, nem pelo banco nem pela função); nenhum segredo em log, resposta ou navegador (testes); remover a conta apaga o segredo |
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
| IMAP iCloud | **Conectividade TCP/TLS 993 comprovada no Cloudflare Workers Free (13/11/2026); autenticação pendente** | Com conta de teste e autorização, autenticar com senha específica de app, ler só metadados mínimos de uma pasta e medir CPU/latência/confiabilidade (proposta na seção 12.14); depois, sincronizar uma pasta |
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

> **Superada pela seção 13.11.** Esta proposta terminava em autenticação e leitura mínima de metadados, o que subdimensiona o produto. Permanecem válidos seus cuidados com a credencial, a conta de teste e a medição; o alcance das provas foi ampliado.

**Escopo.** Provar apenas: (1) login IMAP com senha específica de app; (2) leitura mínima de metadados de uma pasta, sem corpos nem anexos; (3) login SMTP sem enviar mensagem; (4) falha de credencial; (5) efeito da revogação; (6) custo de CPU, latência e confiabilidade no runtime Cloudflare. Fora de escopo: sincronização, IDLE, envio real, Cron, conta pessoal de produção.

**Pré-requisitos da conta (decisão do dono).** Conta Apple **de teste, dedicada e descartável** (não a pessoal): autenticação de dois fatores ativa, iCloud Mail habilitado e uma senha específica de app com rótulo próprio, gerada no painel da Apple. Nunca a senha principal. O endereço da conta de teste não é escrito no repositório (o teste de estrutura bloqueia endereços iCloud).

**Entrega da credencial sem exposição.**
- *Prova 2A (recomendada primeiro, a mais simples):* o dono cadastra usuário e senha de app como secrets de um Environment novo do GitHub (aprovador obrigatório, branches restritas), digitando diretamente no formulário do GitHub — nunca no chat, no código ou em arquivo. O workflow manual lê o secret em variável de ambiente (mascarada), monta o corpo da requisição em memória e o envia por HTTPS, **no corpo do POST**, ao Worker de teste, junto de um token por execução (padrão atual). O Worker usa a credencial só durante a requisição: não grava, não registra em log, não devolve na resposta e fecha a sessão. Assim **nada da Apple fica armazenado no Cloudflare**.
- *Prova 2B (arquitetura-alvo, depois):* a credencial vive no Vault do Supabase; uma Edge Function autentica o dono, lê o Vault, assina a tarefa (HMAC com validade curta, nonce, conta, operação) e chama o Worker; o Worker verifica a assinatura e usa a credencial só naquela operação, sem `service_role`. **Nada disso existe hoje**: exigiria migration/tabela de contas, Edge Function nova, verificação HMAC no Worker e proteção contra replay, cada um com autorização própria (SQL em produção e publicação de função).
- Ressalva da 2A: o GitHub passa a guardar uma senha de app de uma conta descartável. É um risco aceitável porque a credencial é revogável e a conta é de teste, mas **não** é o desenho final.

**Limitar a leitura ao mínimo.** O Worker só executa uma lista fixa de comandos, escrita no código, sem aceitar comando do cliente: `CAPABILITY`, `LOGIN`, `EXAMINE INBOX` (somente leitura), `STATUS`/contagens (`EXISTS`, `UIDVALIDITY`, `UIDNEXT`), opcionalmente `FETCH` de `UID FLAGS RFC822.SIZE` de poucas mensagens, e `LOGOUT`. Sem `BODY[]`, sem `ENVELOPE`, sem anexos, sem remetente ou assunto. A resposta devolve só números e booleanos por etapa, sem texto bruto do servidor nem nome de pasta ou usuário.

**SMTP autenticado, separado.** `EHLO` → `STARTTLS` → `EHLO` → `AUTH` (sucesso `235`) → `QUIT`, **sem** `MAIL FROM`, `RCPT TO` ou `DATA`. Nenhuma mensagem é criada. Uma tentativa por prova, sem repetição automática, para não bloquear a conta por tentativas de login.

**Encerramento e persistência.** `LOGOUT`/`QUIT` e fechamento dos sockets em `finally`; credencial só em memória durante a requisição; token por execução descartado; ao final, o dono **revoga a senha de app** no painel Apple.

**Comprovar autenticação, falha e revogação.** Três execuções registradas: (a) credencial válida → login aceito e metadados lidos; (b) credencial deliberadamente inválida → falha de autenticação classificada, sem eco de credencial; (c) depois da revogação pelo dono → nova tentativa com a mesma senha falha. A (c) prova que a revogação corta o acesso.

**Medir limites, CPU, latência e confiabilidade.** Latência por etapa (TCP/TLS, saudação, login, seleção, logout) devolvida na resposta; confiabilidade em N execuções (por exemplo 20, espaçadas) com taxa de sucesso e classificação dos erros. O tempo de CPU **não** aparece na resposta; precisa vir das métricas do Cloudflare (painel/observabilidade) — hipótese a confirmar, e o dono teria de ler ou colar os números, porque esta sessão não acessa a Cloudflare. O relógio dentro do Worker só avança com I/O, então o tempo medido na resposta não equivale a CPU.

**Custos e limites, Free versus Paid (a verificar na documentação vigente antes da decisão).** Free: sem custo; limite de 10 ms de CPU por requisição HTTP, e a prova atual passou sem erro de CPU, mas a CPU não foi medida e o login adiciona trabalho de TLS e *parsing*. Paid: cobrança mínima de US$ 5/mês, limite maior de CPU e 30 s de CPU por invocação de Cron abaixo de 1 hora (seção 12.8). A decisão de pagar só entra com evidência de que o Free não basta e com aprovação do dono.

**O que precisa ser criado e validado (nada existe ainda).** Módulo de autenticação IMAP/SMTP no Worker de teste (preferencialmente Worker separado, para não alterar a POC de conectividade), com lista fixa de comandos e saneamento de erros; testes com sockets simulados cobrindo sucesso, falha de login e ausência de vazamento; workflow manual com Environment próprio; e, só na 2B, Vault, Edge Function e HMAC.

**Decisões do dono antes de executar:** (1) criar a conta Apple de teste e a senha de app (exige um aparelho Apple para o 2FA); (2) escolher 2A (simples) ou ir direto à 2B; (3) autorizar novo Environment e novo Worker de teste; (4) confirmar que a prova fica no Free; (5) definir quem lê as métricas de CPU no painel Cloudflare.

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
| Credencial por corpo de requisição vindo do GitHub (rota 2A da 12.14) | **Manter só para as provas P1 a P4** com conta de teste | O fluxo definitivo é Vault, Edge Function e HMAC |

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

**Não verificado (cada item vira critério de uma prova):** CPU real por operação no Workers Free; compatibilidade de bibliotecas IMAP e MIME com `connect()` e `nodejs_compat`; suporte do iCloud a IDLE, MOVE, CONDSTORE, QRESYNC, UIDPLUS, SPECIAL-USE, SORT e THREAD; limite de sessões simultâneas por conta e política antiabuso para logins frequentes (risco de bloqueio da conta de teste); se o SMTP da Apple grava em Enviados; tamanho máximo de requisição na Edge Function; IMAP 993 a partir de Edge Functions; custo de CPU do TLS em polling frequente; tamanho prático de anexo que o Worker Free consegue transportar.

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
| Bloqueio da conta Apple por logins frequentes ou falhas | Perda temporária de acesso | Conta de teste na I0; reutilizar sessão quando possível; sem retentativa automática de login; intervalo de polling conservador |
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

Todas com **conta Apple de teste** (2FA ativo e senha específica de app, nunca a senha principal nem a conta pessoal de produção) e **mensagens identificadas como teste**. Mensagens de teste com anexo são enviadas pelo dono, de outro endereço, para a conta de teste. Provas que alteram a caixa ou enviam e-mail exigem avaliação de segurança e **autorização específica antes de cada execução**. A credencial entra por Environment protegido do GitHub (provas P1 a P4) e nunca no chat, no código ou em log.

| Prova | O que demonstra | Natureza |
|---|---|---|
| **P0** · Conectividade TCP/TLS (feita) | IMAP 993 e SMTP 587 alcançáveis no Workers Free | Somente leitura, sem credencial |
| **P1** · Autenticação e estrutura | Login IMAP; capacidades do servidor; lista de pastas e atributos de uso especial; contagens por pasta | Somente leitura |
| **P2** · Leitura | Listar mensagens de teste; ler cabeçalhos e corpo de uma mensagem de teste; baixar um anexo de teste, com limite de tamanho | Somente leitura; mede CPU e latência |
| **P3** · Alterações reversíveis | Marcar lida/não lida e sinalizar; criar pasta de teste; mover mensagem de teste entre pastas | Altera a caixa de teste |
| **P4** · Exclusão controlada | Semântica da lixeira (mover para a lixeira, restaurar, expurgar) numa mensagem de teste | Destrutivo, só em mensagem de teste |
| **P5** · SMTP | Login SMTP sem enviar; depois envio de uma mensagem de teste com anexo a endereço autorizado; cópia em Enviados | Envia e-mail (autorização específica) |
| **P6** · Sincronização e notificação | Sincronização incremental (UIDNEXT, CONDSTORE se houver), mudança de UIDVALIDITY simulada, polling por 24 a 48 h com taxa de falha, Web Push de teste | Mede confiabilidade e bloqueios |
| **P7** · Fronteira definitiva | Vault, Edge Function e HMAC: credencial lida só na Edge Function, tarefa assinada, conector sem segredo, teste de isolamento entre dois usuários de teste | Exige migration e função publicada (autorizações próprias) |

**Cada prova** registra: o que passou, o que falhou, CPU/latência/taxa de erro, limitações e se a conclusão é "comprovado" ou "não comprovado". Uma prova só encerra o que ela de fato demonstrou. As provas P1 a P6 usam código de experimento descartável; **o produto é construído nos lotes I1 a I5**, com os testes automatizados do projeto, e reaproveita das provas apenas o que for medido e aprovado.

### 13.12 Decisões pendentes do dono

1. Confirmar a redefinição de escopo desta seção como definitiva (dois usuários, iCloud primeiro, cliente completo).
2. Criar a conta Apple de teste (2FA, senha específica de app) e quais mensagens de teste enviar.
3. Autorizar, prova a prova, as que alteram a caixa ou enviam e-mail (P3 a P5).
4. Aprovar o custo se a medição mostrar que o Workers Free não basta (Paid ou serviço convencional).
5. Definir quando a segunda usuária recebe o Inbox e quem lê as métricas de CPU no painel da Cloudflare.
6. Remover o Worker de conectividade (`rac-icloud-connectivity-poc`) só em atividade futura com autorização específica; mantê-lo agora.
