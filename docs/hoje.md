# RAC Hoje e monitor de custos da IA

O assistente do dia do dono: junta o que pede atenção em todos os módulos, explica o que mudou e recomenda, com a IA real
(ação `hoje.analise`, Sonnet 5.5). **Só da conta do dono.** A Fernanda (papel casa) continua exatamente como estava.

> **Tela recomposta em 13/11/2026 (Fase 3, piloto do Design System; branch do PR #9, ainda sem merge):** o RAC Hoje agora é um painel (abertura, indicadores, prioridades, gastos, contexto, saúde, análise, pergunta,
> histórico e fontes recolhidos), desenhado com `js/kit.js` e `js/graficos.js`. **Só a apresentação mudou**: as fontes, as regras `NUCLEO.hoje*`, a análise da IA, o cache, a cobrança e as chamadas sem resultado são os de
> antes. Detalhes e regras de uso em [`docs/design-system.md`](design-system.md). As seções abaixo descrevem a lógica, que continua valendo.

## Estado (06/11/2026)

| Parte | Estado |
|---|---|
| Coletor `hojeColetar()` (`js/hoje.js`) | Publicado e testado (local) |
| Regras do dia `NUCLEO.hoje*` (`nucleo.js`) | Publicadas e testadas |
| Ação `hoje.analise` na `rac-ia` | **v8 publicada** em 02/11/2026 (REAL; detalhe de custo no registro) |
| SQL `028_hoje.sql` (libera a ação) e `029_ia_monitor.sql` (monitor) | **Aplicados em produção** em 02/11/2026 |
| Monitor de custos `NUCLEO.iaMonitor` + view `ia_custos` | No ar, só do dono |
| Tela do RAC Hoje (`#rachoje`) e painel Custos de IA (`#iacustos`) | **Publicados** (site `2026-11-06.1`) |
| Chamadas reais à IA | **3 em 02/11/2026** (validação; 2 aceitas e 1 recusada pela validação), US$ 0,089226 estimados |
| **Confiabilidade (Etapa 2, 06/11/2026)**: bloqueio sem fonte útil, chamadas sem resultado, estado das fontes guardado com a análise, origem e último registro por fonte, fora da chave o que é ruído, limpeza no logout, confirmação com cache × cobrança | Feita **só na cópia local, ainda não publicada** (trocar `VERSAO` e `MOD_VERSAO` na publicação) |
| **Privacidade, concorrência e persistência (Etapa 4, 06/11/2026)**: limpeza por conta no momento da mudança, Web Locks entre abas, nada apagado para abrir espaço (bloqueia antes de enviar), evento `storage` sem redesenhar a tela | Feita **só na cópia local, ainda não publicada** (`VERSAO` e `MOD_VERSAO` não foram trocadas; sem SQL e sem Edge Function) |
| **Correções finais (Etapa 3, 06/11/2026)**: reenvio com a chave e o pedido originais, estado real da Agenda, registros incertos que não somem, mensagens por situação, dados antigos sem selo verde, Vagas fora das fontes pessoais, escopo por conta, Fato/Inferência/Recomendação neutros, trava entre abas | Feita **só na cópia local, ainda não publicada** (mesma troca de `VERSAO` e `MOD_VERSAO`; sem SQL e sem Edge Function) |
| **Concorrência e sessão (Etapa 5, 06/11/2026)**: Web Locks obrigatório (sem reserva por `localStorage`; sem Web Locks a chamada paga não sai) e logout/troca de conta em outra aba esvaziam o RAC Hoje na hora (evento `storage` da sessão do Supabase) | Feita **só na cópia local, ainda não publicada** (`VERSAO` e `MOD_VERSAO` não foram trocadas; sem SQL, sem Edge Function e sem mexer na autenticação) |
| Recuperar o texto de uma análise cobrada que se perdeu (P2) | **Não resolvido**: depende de servidor e banco (proposta abaixo) |

## Arquitetura (cada parte separada)

1. **Coleta** — `hojeColetar(forcar)` em `js/hoje.js`: 13 fontes em paralelo, cada uma `{ok, v, vazio, quando, ultimo, origem, nota}` ou
   `{ok:false, erro}` (uma falha nunca derruba as outras), 12 s por fonte, uma leitura por sessão (10 min; pedidos simultâneos dividem a
   mesma; o ↻ e `forcar` leem de novo). Só lê, e só o período que interessa ao dia. `quando` é a data que a PRÓPRIA fonte informa;
   `ultimo` é a data do registro mais recente (Mercado, Alimentação, Compras online e Saúde; não é "data de atualização"); `origem` diz de
   onde veio a leitura (banco, arquivo do site, memória do site, API pública). **O ↻ não busca de novo o que já está na memória do site**:
   Vagas (`VG`), MBA (`PESSOAL`), a Newsletter já aberta (`NLS.dados`) e o Tempo do Início (`TEMPO_HOJE`); a tela mostra a origem de cada fonte.
2. **Regras** — `NUCLEO.hoje*`: estado das fontes (ok, vazia, falhou, desatualizada, ausente; **"ok" quer dizer só leitura concluída com
   registros**, e só Vagas, Newsletter, Notícias, Saúde e Tempo têm a idade conferida, com limites de 48, 14, 12, 24 e 3 horas; a Saúde usa
   24 h para ficar de acordo com o fato "dias de atraso do relógio"), `NUCLEO.hojeFontesUteis` (há fonte com os dados do dono?),
   `NUCLEO.hojeQualidadeFontes` (o retrato das fontes), prioridade (a régua da Próxima ação),
   itens sem repetição (o mesmo assunto em duas fontes vira um, com as duas), finanças do mês contra o mesmo trecho do mês anterior,
   projeção e orçamento, saúde (prontidão do núcleo, dias sem treino, atraso do relógio), vagas compatíveis e o que mudou desde ontem.
3. **Contexto** — `NUCLEO.hojeContexto`: o pacote de fatos `<fato id="fNN" fonte="…" periodo="…">`, até 12 mil caracteres, com as
   fontes que falharam como fatos (para a IA dizer o que não sabe). Minimização: sem links, e-mails, números longos (documentos,
   cartões, contas), sem nada que pareça senha, token ou chave; sem fotos.
4. **IA** — `hojeAnalisar({pergunta, nova, reenviar})` chama `racIA("hoje","hoje.analise", …)`. No servidor, a ação tem instruções fixas,
   formato JSON obrigatório e validação: todo trecho cita fatos do pacote, todo número tem de estar nos fatos citados, cada relação
   cruza pelo menos duas fontes, há pelo menos um item de atenção e uma recomendação, as incertezas não têm números, e com pergunta a
   resposta é obrigatória. A IA não calcula (as contas já vêm nos fatos), não grava, não compra, não envia e não sincroniza.
   **O servidor confere citações e números, não a classificação "fato" × "inferência"**: `natureza` só é validada contra a lista
   (`fato` ou `inferencia`). Por isso a tela diz "Fato (segundo a IA)" e avisa que a classificação é da IA.
   **Sem fonte útil não há chamada** (regra "Fonte útil", `NUCLEO.HOJE_PESSOAIS`): só conta fonte com os dados PESSOAIS do dono (Agenda, Tarefas,
   Mercado, Alimentação, Compras online, Orçamentos, Saúde, MBA) que respondeu com registros e em dia, ou com leitura parcial que trouxe
   dados válidos. **Vagas é fonte pública** (a lista do portal; o funil do dono só entra pela Agenda, nos follow-ups): lida e mostrada, mas não
   conta. A data de hoje, o estado das fontes, falhas, Vagas, tempo, notícias, esporte e Newsletter não contam, sozinhos ou juntos. Fonte sem
   data própria (Agenda, Tarefas, Orçamentos, MBA, Mercado sem registro de data) conta se a leitura e os dados são válidos; falha de uma fonte
   não bloqueia quando outra pessoal serve. A tela e `hojeAnalisar` bloqueiam antes de qualquer chamada, com o motivo.
5. **Validação e falhas** — só conta como análise a resposta REAL, concluída e no formato. DEMO, erro, resposta inválida, falta de
   conexão e tempo esgotado (120 s) voltam `ok:false` com o motivo, e o resultado determinístico vem junto, marcado
   "regras do RAC (sem IA)". **Sem demonstração**: em DEMO a `rac-ia` responde o erro `sem_real` (nada reservado nem cobrado).
   A análise guarda também o **estado das fontes de quando foi feita** (`estados`): a tela mostra, em selos separados, "Mesmos dados de
   agora" (o pacote de fatos bate com o de agora e tem menos de 6 h) e "Fontes com ressalva" (quais estavam sem dados, com falha ou
   desatualizadas). Uma análise recente não prova dados recentes; a hora mostrada é a da chamada.
6. **Cache** — por pacote de fatos + pergunta (`NUCLEO.hojeChave` sobre `NUCLEO.hojeTextoChave`, que tira da chave o **ruído**: tempo,
   notícias e Newsletter, com o estado dessas fontes, e o passar das horas de uma fonte desatualizada; a IA continua recebendo tudo). Dados
   pessoais, financeiros e de saúde NUNCA são ruído: qualquer mudança neles é outra análise. O mesmo dia com os mesmos dados não é pago
   de novo (guardado neste aparelho, as 8 últimas análises; a mesma chave também é a idempotência da `rac-ia`, que não cobra duas vezes).
   `nova:true` é a nova análise pedida pelo dono (outra chave; pedidos simultâneos de nova análise se juntam em uma). Pedidos
   simultâneos da mesma análise fazem uma chamada só. *Efeito único ao publicar a Etapa 2*: a chave de hoje muda (sai o ruído), então a
   análise de hoje feita antes aparece como desatualizada e um novo "Analisar" é uma nova cobrança.
7. **Consumo** — tudo pela `rac-ia`: reserva no orçamento antes, uma chamada com tempo máximo, registro em `ia_uso` (modulo `hoje`).
8. **Chamadas sem resultado** — antes de cada chamada paga o site grava um registro neste aparelho (`rac-hoje-ia-pend`: chave, hora,
   estado). Ele some quando a análise chega e é guardada, ou quando se sabe que nada foi reservado no servidor. Estados: *em andamento*
   (saiu há menos de 3 min), *incerta* (tempo esgotado, falha de rede, página fechada: não se sabe se chegou nem se foi cobrada) e
   *consumida* (o servidor já usou a chave: erro com `id`, ou `repetida`). Regras: nada é repetido sozinho e nenhuma chave nova é criada
   sozinha; enquanto há registro a tela não oferece o botão normal. Saídas explícitas, cada uma com confirmação em duas etapas:
   **reenviar o mesmo pedido** (só se incerta; mesma chave, nunca cobra duas vezes; se o servidor responder `repetida` a chamada passa a
   consumida) e **pedir outra análise (nova cobrança)** (outra chave; avisa que a anterior pode ter sido cobrada). Se a resposta chegar
   depois do prazo com a página aberta, ela é guardada sozinha. **O que NÃO é possível hoje**: o servidor não guarda o texto da
   análise (`ia_uso` só tem estado, tokens e custo), então uma análise cobrada cuja resposta se perdeu não pode ser recuperada; ver
   "Proposta P2" no fim.
9. **Reenvio com a chave original (Etapa 3, R1)** — o registro guarda a **chave original**, o **pedido enviado** (`entrada`: texto e dia) e o retrato dos
   fatos e das fontes daquele momento. `hojeAnalisar({reenviar:true, chave})` usa exatamente isso: não monta o pacote de agora, não recalcula a chave,
   não conta tentativa (`rac-hoje-ia-tent` fica como está) e, se o servidor aceitar, a análise guardada é a do dia e do pacote originais. Dados, data ou
   contador que mudaram depois do tempo esgotado não alteram o reenvio, nem recarregar a página. Sem a chave ou sem o pedido guardado (registro
   antigo, conteúdo retirado por falta de espaço ou por troca de conta) a tela **não oferece** "Reenviar o mesmo pedido": diz que não é seguro e só
   resta a nova cobrança. As duas saídas têm confirmação em dois toques e o aviso de que a tentativa anterior pode já ter sido cobrada.
10. **Registros que não somem e análises pagas que ficam (R3, Etapa 4)** — um registro incerto só sai quando (a) a análise chegou e ficou gravada, (b) o servidor
   recusou **antes de reservar** (código do contrato em `HOJE_SEM_RESERVA`, **sem** id e **sem** estado: evidência), ou (c) o dono o dispensa. Não expira
   por tempo e nenhuma análise paga é descartada por quantidade (a poda das 8 últimas acabou). **Nada é apagado para abrir espaço.** Em vez disso, a
   chamada paga **não sai** (antes de enviar, sem custo) e o motivo é dito quando: o navegador não grava o registro de segurança (cheio ou bloqueado);
   há 40 chamadas sem resultado (`HOJE_PEND_LIMITE`); há 40 análises guardadas (`HOJE_CACHE_LIMITE`); ou o RAC Hoje já usa mais de 2,5 milhões de caracteres
   do armazenamento (`HOJE_LOCAL_MAX`, metade do que os navegadores costumam dar). Quem libera espaço é o dono, com confirmação: **"Excluir análise"**
   (apaga o texto guardado; o servidor não o guarda, então não há como recuperá-lo e uma nova análise é uma nova cobrança) e **"Dispensar registro"**
   (remove o aviso **e libera o bloqueio daquela tentativa**; não cancela nada no servidor nem desfaz cobrança; pedir a MESMA análise de novo faz o
   servidor responder "repetido", e pedir uma NOVA análise usa outra chave e pode ser cobrada de novo). O registro guarda o pedido enviado uma vez só
   (`entrada.texto`); os fatos são lidos dele quando preciso (`hojeFatosDoTexto`), então `snap` leva apenas estados, pacote e dia. **Persistente × memória ×
   indisponível**: com o aparelho gravando, o registro "enviada" é gravado antes do envio e sobrevive a fechar e reabrir; se a gravação de uma atualização
   falha depois do envio, a versão nova fica só na memória da página (marcada "atualização só na memória desta página") e o que já estava gravado continua
   e será tratado como incerto (fechar a página perde só o detalhe novo; o navegador não oferece garantia melhor que essa); se o aparelho não grava
   nada, a chamada paga não sai. Se a análise chega e não pode ser gravada, ela fica na memória e o registro da chamada continua ("consumida, não guardada").
11. **Privacidade e troca de conta (R7, Etapa 4)** — tudo que o RAC Hoje guarda no aparelho (`rac-hoje-ia`, `-tent`, `-pend`, `-trava`) fica numa chave **por
   conta** (`nome:id-do-usuário`). `hojeLimparLocal(manter)` (js/app.js) roda: ao **entrar** com uma conta (`hojeAoEntrar`, na hora, sem esperar a tela
   abrir, e zera a memória da página do RAC Hoje), quando **não há sessão**, ao **Sair** (botão e passo do código), ao entrar como **casa** e quando o RAC
   Hoje abre com outra conta. Ela remove análises, trava e chaves sem conta (legado) e, dos registros de chamada, **pergunta, rótulo, pedido enviado e
   retrato dos fatos**, que viram "Chamada anterior (conteúdo removido)". **Ficam só os metadados que impedem cobrança duplicada**: o contador de tentativas
   (`-tent`, só hash) e, de cada registro, chave, estado, hora, código, id e custo informados pelo servidor, intenção (hash) e o dia. Sem o pedido, o
   reenvio seguro deixa de existir, mas a mesma análise continua bloqueada e nenhuma chave nova nasce sozinha. Sem id de conta nada é lido nem gravado. A
   casa continua sem acesso. Sair ou trocar de conta em OUTRA aba também esvazia a página aberta (item 13).
12. **Coordenação entre abas (R9, Etapa 4; Etapa 5)** — as novas análises, os reenvios e os "pedir outra análise" passam por `hojeCoordenar`. **Web Locks é obrigatório**
   (`navigator.locks`, Chrome 69+, Firefox 96+, Safari 15.4+) para iniciar qualquer chamada paga: um bloqueio por conta (`rac-hoje-ia:<id>`), pedido com `ifAvailable`.
   Quem não o consegue **não espera, não tenta de novo e não gera chave**: só informa "Outra aba deste aparelho está processando uma análise". O bloqueio cobre a decisão
   (conferir registros da mesma intenção, contar a tentativa, gravar o registro "enviada") e a chamada em voo desta aba, até a resposta, a falha ou o tempo esgotado
   (aí é solto); o navegador o solta se a aba fechar. **Sem Web Locks** (sem `navigator.locks`, ou o navegador recusa o pedido antes de entregar o bloqueio) **a chamada
   não sai**: nada é enviado, cobrado, registrado nem contado, nenhuma chave nova nasce, e a tela diz que o navegador não oferece a proteção necessária para iniciar uma
   análise com segurança (código `sem_web_locks`). **A reserva por `localStorage` com batimento foi removida** (não era atômica: entre ler e gravar, duas abas passavam) e não
   existe mais nenhum caminho alternativo; a chave antiga `rac-hoje-ia-trava` só é ignorada/apagada como legado. Um erro DEPOIS de o bloqueio ser entregue é da própria análise
   e segue como antes. **Liberar o bloqueio não resolve uma tentativa**: depois de um **tempo esgotado** ou falha de rede o bloqueio sai, mas quem segura a mesma análise é o
   **registro persistido** (incerto). Diferenças: **nova análise** (outra chave, contada uma vez, só por escolha explícita), **reenvio da mesma tentativa** (chave e pedido
   originais, sem contar tentativa), **chamada em andamento** (outra aba ou esta: bloqueada) e **resultado incerto após timeout** (a mesma análise fica bloqueada; reenviar ou
   pedir outra, com aviso de cobrança). Dois toques iguais seguidos na mesma aba viram uma chamada. **Limites reais**: o servidor continua sendo a garantia final contra
   cobrança dupla da MESMA chave (`unique (user_id, idempotencia)` e trava por dono em `ia_reservar`); chaves DIFERENTES simultâneas só são impedidas pelo bloqueio do
   navegador (o servidor aceita até 2 chamadas em `reservado/enviando` por usuário). Um bloqueio do servidor por usuário exigiria mudança de SQL/função: **não feito, fica
   documentado**. Navegador sem Web Locks perde a análise nova (não há fallback): é o preço de não autorizar gasto com uma exclusão que não é garantida. **Interface entre abas**:
   o evento `storage` (um listener só, só chaves do RAC Hoje desta conta, nunca a trava) repinta apenas o histórico, as chamadas sem resultado e um aviso, depois de 150 ms
   (rajadas viram um repinte); não toca na pergunta digitada, no foco nem numa confirmação aberta, só lê e nunca chama a IA.
13. **Sessão em outra aba (Etapa 5)** — o app não escuta `onAuthStateChange` e a autenticação não foi alterada. O Supabase (`mercado.js`: `persistSession: true`, `storageKey:
   "rac-mercado-auth"`) guarda a sessão no `localStorage`; quando **outra** aba entra, sai ou troca de conta o navegador dispara o evento `storage` **nesta** aba (nunca na que
   gravou). O mesmo listener único (`hojeOuvir`, registrado quando o módulo carrega e reaproveitado pela tela) olha essa chave: **valor apagado** (ou `storage.clear()`) = saiu;
   **outro `user.id`** = outra conta; **valor ilegível ou sem `user.id`** = tratado como troca; **o mesmo `user.id`** = só renovação do token, ignorada (não apaga a pergunta
   digitada). Ao detectar (**só na conta do dono**; a casa não passa por aqui e não muda em nada), a página fica **suspensa** (`HOJE.suspenso`): na hora a memória do RAC Hoje
   (coleta, análises em memória, chamadas em voo registradas, fila), o estado da tela, a pergunta digitada, o histórico e os botões somem e ficam só um aviso; o conteúdo guardado
   no aparelho é reduzido aos metadados de segurança (`hojeLimparLocal`: no logout, de todas as contas; na troca, de todas menos a nova, para não apagar o que a aba nova gravou; com
   valor ilegível o armazenamento não é mexido). Suspensa, **nada é lido, gravado ou chamado**: `hojeUid()` devolve vazio, `hojeDono()` recusa, o RAC Hoje não abre (o aviso aparece no
   lugar), e uma chamada que estava em voo termina como "a conta mudou" sem voltar para a memória nem para a tela (o registro dela continua, sem o pedido, e vale como incerto).
   **A conta nova não é adotada por esta página**: o resto do app continua com a identidade antiga, então a identidade só é confirmada quando a página entra de novo
   (recarregar ou `entrar()` → `hojeAoEntrar` → `RAChoje.confirmar`); até lá a conta nova também não recebe nada. O tratamento do evento só esvazia: não grava a chave de sessão, não
   chama a IA e não cria listener (eventos repetidos não limpam duas vezes). **Limitações**: (a) depende de o Supabase gravar a sessão em `localStorage` nessa chave e de o navegador
   entregar o evento `storage`; não foi exercitado em navegadores reais, só com o evento entregue à mão em testes; (b) não vê expiração nem revogação da sessão no servidor, nem a
   mudança feita **nesta** aba, nem navegador sem `localStorage`; (c) o resto do app (outros módulos, o e-mail na barra lateral) **não** foi mexido e continua mostrando a conta antiga
   até recarregar: tratar isso exigiria mexer na autenticação, fora desta etapa; (d) se a mesma conta sair e entrar de novo em outra aba, esta página continua suspensa até recarregar
   (escolha conservadora).

## Fontes

**Fase 2 · A4 (13/11/2026, contrato de fontes)**: Agenda, Newsletter, MBA e Família chegam ao RAC Hoje pelo contrato de fontes
(`js/fontes.js`: `fonteLer`/`fonteOuErro`, formato `{ok, v, vazio, quando, ultimo, origem}`), em arquivos leves sem tela
(`js/fonte-agenda.js`, `js/fonte-newsletter.js`, `js/fonte-mba.js`, `js/fonte-familia.js`). O RAC Hoje não lê mais `NLS`, `FAM`,
`mbaFin` nem `AGENDA_ICO` e não carrega as telas do Sistema e do MBA. O que cada fonte entrega, a origem e o que a IA recebe são os
mesmos de antes (`tests/fontes.test.mjs` compara com os leitores de antes); a tabela abaixo continua valendo, lida assim: a Newsletter
"memória do site" é a edição que a tela da Newsletter guardou na memória da fonte; MBA = `NUCLEO.mbaAulasDe`, `mbaAvalsDe`, `mbaFinDe`.

| Fonte | De onde | Período | Origem da leitura | Data que a tela mostra |
|---|---|---|---|---|
| Agenda e aniversários | `agendaColetarLeitura()` (Família, Veículos, Documentos, IPVA, MBA, aniversários, lembretes, Carreira, backup) | o que a agenda já junta | banco e dados do site | nenhuma. Estado da leitura: **completa**, **vazia** (tudo lido, nada a mostrar), **parcial** (a leitura de `registros` ou do backup falhou; sobra o que veio da memória do site, e a falha fica dita) ou **falha** (falhou e não sobrou nada: vira falha da fonte, nunca "sem dados") |
| Tarefas da casa | `lista` (tarefas abertas) | até 50 | banco | nenhuma |
| Vagas e carreira | `vagas.json` já carregado (`VG`), perfil e funil (`PESSOAL`) | vagas até 7 dias | **memória do site** | `coletado` do arquivo; desatualizada após 48 h. **Fonte pública: não conta como dado pessoal** |
| Newsletter | `newsletter.json` + `NUCLEO.nlEdicao` **em memória** (a aba Hoje não é aberta: nada gravado no histórico) | edição atual | memória do site (se já aberta) ou arquivo | `coletado`; após 14 h |
| Notícias de Sorocaba | `noticias.json` | as 6 primeiras | arquivo do site | `coletado`; após 12 h |
| Esportes | jogo dos Dodgers hoje (API pública da MLB, a mesma do resumo falado) | hoje | API pública | nenhuma ("sem jogo hoje" é dito à parte de "sem dados") |
| Mercado | `compras` (data e valor) | do 1º dia do mês passado | banco | último registro (data da compra mais recente) |
| Alimentação | `pedidos` (data e total) | do 1º dia do mês passado | banco | último registro |
| Compras online | `compras_online` (+ recorrências a confirmar) | do 1º dia do mês passado | banco | último registro |
| Orçamentos | `orcamentos` | — | banco | nenhuma |
| Saúde e relógio | `garmin_dia` e `garmin_ativ` **do banco** (nunca a função garmin) | 60 e 14 dias | banco | último dia com dados; desatualizada após 24 h do fim desse dia |
| MBA | `mbaAulas`, `mbaAvals`, `mbaFin` (PESSOAL) | próximas | **memória do site** | nenhuma |
| Tempo | Open-Meteo (o mesmo do Início) | hoje | API pública ou memória (`TEMPO_HOJE`) | hora da leitura; após 3 h |

"Último registro" é a data do registro mais recente que veio na leitura, não a data em que o dado foi atualizado: uma casa que não compra
por dias tem Mercado "Ok" com o último registro antigo, sem que isso seja erro. O RAC Hoje não sincroniza nada para obter datas.

**Leitura realizada × dados recentes (Etapa 3, R5).** O selo verde "Dados recentes" só aparece quando o RAC conferiu a data (a fonte tem `quando` e
passou no limite que já existia: Vagas, Newsletter, Notícias, Saúde, Tempo) ou o último registro é de hoje. Todo o resto que foi lido com registros
mostra "Leitura realizada", neutro, com "último registro em DD/MM/AAAA (há N dias)" (só a data e a idade, sem limite novo) ou "data não disponível: a
leitura foi concluída, mas não se sabe a idade dos dados"; fonte sem origem diz "origem não informada". "Leitura parcial" e "Desatualizada" têm estilo próprio.

**Pendentes** (ficam para depois, com motivo): Gmail (nunca automático; só com o toque do dono); Família/Olivia/Eddie/Veículos em
detalhe (a agenda já traz vacinas, retornos, revisões, IPVA e garantias; ler os registros inteiros e as fotos seria pesado para o dia);
Segurança (estado do código de verificação; precisa do módulo da Central); Resumo e Painel (retrospectivas, não o dia); Conexões, X e
Rede (a Rede já entra pela agenda e sai do site no roteiro).

**Consultas repetidas eliminadas**: a Agenda e a Próxima ação do Início (e o resumo falado) liam a tabela `registros` inteira cada uma;
agora quem pede enquanto uma leitura está em curso usa a mesma (`agendaColetar`, que estava em `js/sistema.js` e desde a Fase 2 · A4 mora
na fonte da Agenda, `js/fonte-agenda.js`; nada fica guardado depois).
O RAC Hoje não chama a Próxima ação (usa a mesma régua do núcleo, `NUCLEO.pri*`), então não repete a leitura da agenda nem a do relógio.

## Régua de prioridades (Próxima melhor ação, Agenda, resumo falado e RAC Hoje)

Uma régua só, em `nucleo.js` (`NUCLEO.pri*`, funções puras que recebem a data de referência). Quem usa: o cartão **Próxima melhor ação** do Início
(`proximasSelecao` em `js/sistema.js`), a Agenda do Início e a página Agenda, o resumo falado (`briefingTexto`, `js/app.js`) e o RAC Hoje
(`hojePrioridade`/`hojeItem`/`hojeItens` chamam a mesma `priPontos`).

| Prazo | O que é | Pontos | Validade |
|---|---|---|---|
| **real** | vencimento definido em registro ou compromisso (revisão, boleto, avaliação, lembrete, IPVA...) | atrasado 100+atraso (teto 20), hoje 90, amanhã 70, até 3 dias 50, até 7 dias 30, mais 10; mais o peso da área | nenhuma: um prazo real vencido continua à vista |
| **calculado** | derivado de uma data: follow-up = candidatura + 5 dias (ou a data de "Fazer follow-up em"), avisos de backup e de posts da Rede | no máximo 46: sempre abaixo de real vencido, de hoje e dos próximos 3 dias | 10 dias corridos depois de vencer |
| **informativo** | oportunidade ou sugestão: vaga compatível (≥70%), recuperação ou treino da Saúde | 25 + desempate | só com dado de ontem ou de hoje (Saúde) |

Nível: **urgente** = real vencido ou de hoje; **importante** = real em até 3 dias, ou calculado vencido ainda dentro da validade; **informativo** = o resto.
No RAC Hoje os mesmos níveis aparecem como alta, média e baixa.

**Follow-up da candidatura** (`NUCLEO.priFollowup`): só a coluna "Candidatei" gera. Qualquer **resultado** preenchido (aprovado, recusado, sem retorno,
vaga cancelada, desisti) ou o follow-up marcado como feito encerra. Vencido há mais de 10 dias, vira **sem retorno**: é só a apresentação (a Agenda mostra
no grupo "Candidaturas sem retorno", sem alerta; o funil mostra "Sem retorno"); nada é gravado, o resultado e o histórico continuam como estão.
Os cartões criados pelos e-mails usam a data do e-mail, então uma confirmação antiga já nasce "sem retorno" em vez de ficar pendente para sempre.

**O cartão**: no máximo 1 destaque (só se for urgente ou importante) e 3 secundárias, com até 2 informativas; cada linha tem o nível e o motivo curto.
Compromissos de 4 a 7 dias ficam só na Agenda. Sem nada urgente ou importante: "Tudo em dia. Nenhuma ação urgente agora." (uma vaga informativa
pode aparecer abaixo, sem tom de urgência). Recolher usa a preferência de sempre. O que o cartão mostra não se repete nas primeiras linhas da Agenda do Início
(com o cartão recolhido, a Agenda mostra tudo); a página Agenda continua completa.

**Ações rápidas** (só do dono, pelos caminhos que já existem, `pessoalGravar`): *Feito* (follow-up feito, como o campo do editor; ou lembrete feito), *Adiar 3 dias*
(muda "fazer follow-up em", como o botão do editor) e *Sem retorno / Encerrar* (marca o resultado "sem retorno", opção que já existe, e acrescenta uma linha ao histórico;
nunca troca um resultado já marcado). Não há estado novo.

**Limite conhecido**: a rotina das 6h (`garmin`, push) tem a sua própria lista de follow-ups e não foi alterada; ela ainda ignora o resultado da candidatura.

## Monitor de custos

O registro de cada chamada paga já existia em `ia_uso` (015): id, data, ação, módulo (a funcionalidade), modelo, tokens de entrada e
saída, custo estimado, estado, tempo, e a conferência com o Console (`reconciliado_usd` = o valor cobrado de verdade). A mesma chamada
não é contada duas vezes (chave de idempotência única e estados que só avançam). O `029_ia_monitor.sql` acrescenta, sem reescrever o
histórico: provedor, id da requisição (`msg_…`), tokens de cache, custo de entrada e de saída, os preços e a data da tabela usados, o
câmbio e o custo em reais; o preço do cache em `ia_precos` (vazio até o dono conferir na página oficial: vazio = o cache conta como
entrada cheia, por excesso, e o registro diz isso); avisos e fator de consumo atípico em `ia_config` (vazios: nenhum limite é
configurado); e a view `ia_custos`, só do dono (a Fernanda não vê nada), com o custo **conhecido** (cobrado), o **estimado** (uso ×
tabela da hora) e o **recalculado** com o preço de hoje, sem gravar nada.

`NUCLEO.iaMonitor(linhas, hoje, config, filtro)` faz as contas do painel futuro: hoje, 7 dias, mês e total; chamadas, tokens (com cache)
e custo médio; por funcionalidade e por modelo; evolução diária (30 dias) e mensal; % do limite mensal em reais com os avisos (50, 75 e
90% por padrão); consumo atípico (hoje acima de 3× a mediana dos dias com gasto nas duas semanas anteriores, com pelo menos 5 dias de
base); e funcionalidades com mais da metade do gasto do mês. Sem informação de custo, nada é inventado (tipo `sem_dado`).

## Telas (só do dono; a Fernanda não vê nenhuma)

**RAC Hoje (`#rachoje`, em `js/hoje.js`).** Abrir a tela só lê: coletor, regras do núcleo, cache deste aparelho e as últimas chamadas em
`ia_custos`. Mostra saudação e data, o estado de cada fonte (ok, sem dados, falhou, desatualizada, não lida), as prioridades do dia e o
que mudou desde ontem (regras do RAC, sem IA), a análise da IA, a pergunta contextualizada e o histórico recente. Na análise: o selo
**Atual** ou **Desatualizada** (`NUCLEO.hojeDefasagem`: outro dia, dados mudaram desde então, mais de 6 h ou sem base para comparar), data
e hora, modelo, custo estimado e tokens, **Fato (segundo a IA)** × **Inferência** em cada item de atenção, relações e recomendações
marcadas como inferência/sugestão, incertezas (limites que a IA apontou, não tudo o que existe) e os fatos utilizados (guardados na
própria análise, `NUCLEO.hojeCitados`, com a fonte de cada fato citado). Resumo e Resposta são rotulados como interpretação da IA. Os selos
da análise são dois: **"Mesmos dados de agora"** (ou "Desatualizada") e **"Fontes com ressalva (N)"** (ou "Fontes lidas com dados"), com o
retrato das 13 fontes de quando a análise foi feita; análises antigas, sem esse retrato, dizem que não dá para saber. O painel de fontes
mostra a hora e a idade da coleta, a origem de cada leitura e a data conferida (ou "sem data de atualização própria"). A IA só é chamada por
"Analisar o dia" ou "Perguntar": o primeiro toque pede a confirmação, só "Confirmar e chamar a IA" chama, um
pedido por vez (`HJ.ocupado`), e a chave de idempotência e o cache de `hojeAnalisar` continuam valendo. O aviso da confirmação diz o que
vai acontecer: **do cache, sem cobrança** (botão "Mostrar do cache (sem cobrança)") ou **chamada paga** ("NOVA cobrança" quando já existe
análise com os mesmos dados), com a estimativa de custo só quando há base (as análises guardadas neste aparelho; sem histórico a tela diz
que não há base). A estimativa nunca é valor garantido: a fatura é a do Console. "Analisar de novo (nova cobrança)" é dito no botão. DEMO, erro, resposta inválida e tempo esgotado aparecem como erro real
(com código, estado, id e o que pode ter sido cobrado), nunca como análise.

**Custos de IA (`#iacustos`, em `js/iacustos.js`).** Só leitura de `ia_custos` (em páginas de 1.000), `ia_config` e `ia_precos`: não
chama a IA, não grava, não cria limite nem muda orçamento (isso segue em Sistema → RAC Intelligence). Indicadores (hoje, 7 dias, mês,
total, em US$ e ≈ R$), limite mensal e consumo atípico quando configurados, **classes de custo** (reconciliado = valor conferido no
Console; estimado = tokens × tabela da hora; reserva = chamada incerta; sem dado; sem custo; a API informa tokens, não custo, então não
há "custo informado pelo provedor": a tela mostra quantas chamadas têm uso e id da requisição informados), tokens (entrada, saída e
cache, ou "sem dado"), gráficos (por dia nos últimos 30, por mês, por funcionalidade, por provedor e modelo; todos com `racDica` e valor
fixo em cada barra), preços e câmbio usados e o histórico (filtros por período, funcionalidade, modelo, classe e estado; ordenação;
10, 15, 25 ou 50 por página; toque na linha mostra preço, câmbio, custo recalculado e id da requisição). As contas são
`NUCLEO.iaMonitor` e `NUCLEO.iaHistorico`. Em telas estreitas (até 1180 px o histórico, 760 px as demais tabelas) as linhas viram cartões.

## Como foi ligado em produção (feito)

SQL `028_hoje.sql` e `029_ia_monitor.sql` aplicados em 02/11/2026, `rac-ia` v8 publicada (CLI, como em docs/rac-intelligence.md), primeiras
chamadas reais conferidas em `ia_custos` e no Console, e o site com o RAC Hoje publicado na versão `2026-11-06.1` (o `js/hoje.js` entra
no service worker). A Etapa 2 de confiabilidade não mexe em SQL nem na `rac-ia`: publicar só o site (trocar `VERSAO` e `MOD_VERSAO`).

Custo por chamada, com a tabela de `ia_precos` (Sonnet 5.5: US$ 2 por milhão de tokens de entrada e US$ 10 de saída, conferida em
30/10/2026; é a conta de 02/11/2026, a tela estima pelo histórico do aparelho) e o câmbio da configuração (6,00 + 12%): típica (5,3 mil tokens de entrada, 1,5 mil de saída) ≈ US$ 0,026 (R$ 0,17);
máxima (9,8 mil de entrada, 4 mil de saída) ≈ US$ 0,060 (R$ 0,40). Os tokens de entrada são uma medida por excesso (2 caracteres por
token); o valor certo vem do uso informado pela API em cada chamada.

## Proposta P2: recuperar o resultado de uma chamada já cobrada (NÃO implementada; depende de SQL e de Edge Function)

**O problema, confirmado no código.** `ia_reservar` (015) responde `repetida` ou `em_andamento` quando a chave de idempotência já existe e
a `rac-ia` não guarda o texto da resposta (`ia_uso`/`ia_custos` só têm estado, tokens e custo). Se o navegador perde a resposta (prazo de
120 s, rede, página fechada, `localStorage` apagado, outro aparelho), a análise foi cobrada e o conteúdo some. Repetir a mesma chave nunca
cobra duas vezes, mas também não devolve nada. O cliente sozinho **não** resolve isso: o texto só existe no servidor no instante em que a
resposta é gerada.

**O que o cliente já faz sem servidor (Etapa 2):** registro da chamada antes de sair, bloqueio da repetição silenciosa, resposta tardia
guardada quando a página continua aberta, mensagens que dizem "incerta" ou "não recuperável", e as duas saídas explícitas.

**Proposta de ponta a ponta (para uma etapa própria, cada passo com autorização do dono, na ordem SQL → função → site):**

1. **Banco** — nova migration numerada (`030_ia_resultado.sql`, idempotente): tabela `ia_resultados` (`uso_id` pk → `ia_uso(id)`, `user_id`,
   `dono`, `resultado jsonb` já validado, `fatos jsonb` só dos fatos citados, `consumo jsonb`, `avisos`, `criado_em`, `expira_em` padrão
   +72 h). RLS ligado, `revoke all ... from anon`, política de leitura só do próprio usuário/dono, gravação só pela `rac-ia` (service role),
   trava restritiva "mfa" do 022, inclusa em `tests/seguranca.test.mjs`. Limpeza por prazo (`expira_em`). É conteúdo pessoal (finanças e
   saúde resumidos): por isso prazo curto, nada do pedido original (os fatos completos) e decisão do dono sobre entrar ou não no backup
   (`SEG_TABELAS`; a regra de tabela pessoal do CLAUDE.md precisa ser aplicada ou explicitamente dispensada). Opcional: coluna
   `tem_resultado` na view `ia_custos`.
2. **Edge Function `rac-ia`** (`servico.ts`, `index.ts`, `contrato.ts`): (a) gravar o resultado validado em `ia_resultados` logo após
   `concluir`, antes de responder (se a gravação falhar, responder normalmente com `recuperavel:false`); (b) em chave repetida do mesmo
   usuário com estado concluído, **devolver o resultado guardado sem chamar o provedor e sem nova reserva** (`ok:true, recuperada:true`);
   estado reservado/enviando segue `em_andamento` (o cliente espera e consulta); incerto/falhou segue como hoje; (c) um modo `consultar`
   só de leitura (sem reserva, sem provedor) para o cliente perguntar pela chave ao abrir a tela. Testes de contrato, de "uma chamada só", de
   dono × casa e de expiração.
3. **Site** (`js/hoje.js`): para cada registro de chamada sem resultado, consultar pela mesma chave ao abrir a tela e quando o usuário pedir;
   se vier o resultado, guardar no cache e limpar o registro; se estiver em andamento, esperar e consultar de novo (limite de tentativas);
   só se o servidor disser que nunca recebeu o pedido oferecer o reenvio. O botão "Reenviar o mesmo pedido" vira "Recuperar resultado".
4. **Ordem e risco**: 030 antes da função, função antes do site; o site novo funciona com a função antiga (cai no comportamento da Etapa 2).
   Sem a etapa 2 do servidor, nada muda para quem usa o site de hoje.
5. **Alternativas descartadas**: guardar a resposta só no navegador (ela nunca chega quando a conexão cai); repetir com chave nova
   automaticamente (cobra duas vezes). Uma API assíncrona do provedor não foi avaliada nesta etapa.

## Dependências de servidor para outras limitações (documentadas, não alteradas)

- **P5**: a `rac-ia` valida citações e números, não a classificação fato × inferência. Para validar de verdade, a função precisaria
  tratar como "fato" só trechos cujo conteúdo conste literalmente nos fatos citados e que não citem apenas fatos "rac" (data, estado de fonte),
  ou deixar de pedir a classificação à IA e derivá-la das citações. Até lá a tela rotula "(segundo a IA)".
