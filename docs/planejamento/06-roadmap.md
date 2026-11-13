# RAC · 06 · Roadmap

Visão integrada de evolução, proposta em 13/11/2026 a partir da auditoria. É uma **proposta**: a ordem final e cada início de
fase dependem do dono. Nenhum item abaixo foi implementado, exceto a Fase 0 (esta documentação), que só conta como concluída
depois do merge. Convenções: ver o [Documento 1](01-visao-e-mapa-mestre.md#como-ler-este-conjunto).

## 1. Por que esta ordem

A orientação inicial do dono era: fundação (arquitetura e documentação) → Design System → Família e Casa → inteligência
proativa → monitoramento → Garmin → notícias → estudos → RAC Hoje → Compras. A auditoria sugere quatro ajustes:

1. **Monitor e o "requisito anterior" (notificação das 6h e atualizar ao voltar) sobem para o começo.** São prioridade alta, de
   baixo risco, sem migration, e dão confiança para o resto (saber quando algo parou antes de criar mais coisas que rodam sozinhas).
2. **Uma fundação técnica mínima vem antes da Central da Casa.** A Casa cria cerca de 7 tabelas e um módulo novo; sem a camada
   de dados, o contrato de fontes e a auditoria sem lista fixa (passos A1, A4 e A6 do [Documento 02](02-auditoria-arquitetural.md#9-plano-gradual-de-melhoria)),
   ela repetiria os problemas P-04, P-06 e P-11.
3. **Os tokens e componentes do Design System entram em paralelo com a fundação**, sem mudar o que se vê, para que as telas da
   Casa já nasçam no padrão novo (em vez de serem refeitas depois).
4. **O RAC Hoje como painel central vem antes da inteligência proativa**, porque é onde os sinais aparecem; a IA (camada 2) só
   entra quando já houver sinais determinísticos (camada 1) para interpretar.

Atalho possível: se o dono quiser **medicamentos** antes, eles podem entrar logo depois de A1 e A6, com as outras partes da
fundação em seguida.

```mermaid
graph LR
  F0[F0 Documentação] --> F1[F1 Confiabilidade]
  F0 --> F2[F2 Fundação técnica]
  F0 --> F3[F3 Design System base]
  F2 --> F4[F4 Família e Casa]
  F3 --> F4
  F4 --> F5[F5 RAC Hoje central + sinais]
  F1 --> F5
  F5 --> F6[F6 IA proativa + Garmin sinais + alertas]
  F5 --> F7[F7 Acontecimentos + Estudos + DS por área]
  F6 --> F8[F8 Garmin trajetos + Compras + telas da casa]
```

## 2. Fases

| Fase | Conteúdo | Por que agora | Pronto quando |
|---|---|---|---|
| **F0 · Documentação** | Documento 1 (`docs/planejamento/`), mapa, regra do histórico diário | Base de todas as sessões | PR mesclado pelo dono |
| **F1 · Confiabilidade** | Monitor M1 e M2; o clique na notificação abre o destino que ela traz (qual destino é a questão D-05, em aberto); atualizar ao voltar; correção da busca (P-19); comprovar os robôs de Notícias e Vagas depois da proteção da `main`; reconciliar o estado dos documentos (conferência só leitura com o dono) | Prioridade alta, risco baixo, sem migration | Ver critérios na seção 3 |
| **F2 · Fundação técnica** | A1 camada de dados · A2 kit de UI e gráficos · A3 registro de rotas e menu · A4 contrato de fontes · A5 regras das telas para o núcleo · A6 auditoria sem lista fixa | Evita multiplicar o acoplamento com as frentes novas | Telas iguais; testes de contrato; `js/hoje.js` sem variáveis de outros módulos |
| **F3 · Design System base** | DS-0 tokens e catraca de cores · DS-1 componentes `rac-` e página interna de componentes | Telas novas nascem no padrão | Página de componentes aprovada pelo dono no celular |
| **F4 · Família e Casa** | Integrantes → medicamentos → encomendas → contas (Naturgy e outras) → condomínio. O que a casa vê é a questão D-02 e o que se guarda do condomínio é a D-13, ambas em aberto | Nova frente oficial; pedido explícito (medicamentos) | Cada parte com SQL aplicado pelo dono, backup, trava "mfa", testes e uso real |
| **F5 · RAC Hoje central** | Painel central do dono (substituir ou não o Início é a questão D-12); sinais determinísticos (etapa A, no navegador); DS-2 (menu agrupado; o tema é a questão D-01) e DS-3 (piloto no RAC Hoje e no Monitor) | Consome as fontes da Casa e do Monitor | Painel lendo só fontes; sinais com "por que estou vendo isto"; dono aprova |
| **F6 · Inteligência proativa** | Sinais no servidor (etapa B, views e pg_cron; o canal de push é a questão D-06); resumo diário; `sinais.explicar` a pedido (automático só com autorização expressa, regra vigente); Monitor M3 e M4; Garmin G1–G3 | Já há sinais para interpretar | Sinal sem repetição, com histórico e preferências; custo dentro do orçamento |
| **F7 · Contexto e progresso** | Acontecimentos; Trilhas de estudo; DS-4 (migração por área) | Evolução contextual sobre a base pronta | Acontecimento com linha do tempo e "o que mudou"; trilhas com sessões e evidências |
| **F8 · Etapas próprias** | Garmin G4–G5 (D-08 e autorização); Central de Compras (kits, patrimônio, garantias; propostas 041 e 044 na questão D-04); DS-5 (telas da casa, com autorização); divisão do núcleo (A8) | Dependem de decisões do dono | Cada uma com critério próprio, definido quando começar |

## 3. Iniciativas: classificação, benefício, risco e critério

Classificação pedida: **Funciona** (já existe e funciona) · **Parcial** (existe parcialmente) · **Corrigir** · **Refatorar** ·
**Novo** · **Agora não** (não vale a pena implementar agora).

| Iniciativa | Classificação | Benefício | Complexidade | Risco | Depende de | Prioridade | Critério objetivo de conclusão |
|---|---|---|---|---|---|---|---|
| Documentação oficial (Documento 1) | Parcial → feito nesta etapa | Alto | Baixa | Baixo | — | Alta | Documentos mesclados; teste `tests/planejamento.test.mjs` passando |
| Reconciliar estado dos documentos | Corrigir | Médio | Baixa | Baixo | Conferência só leitura pelo dono | Alta | Nenhuma divergência da lista do [Documento 07](07-decisoes-e-pendencias.md#inconsistências-de-estado-encontradas) |
| Monitor de integrações M1–M2 | Parcial | Alto | Média | Baixo | — | **Alta** | Todo processo agendado aparece com estado, última execução, sucesso, falhas e próxima prevista; teste de divergência de horários |
| Monitor M3–M4 (view e alerta) | Novo | Alto | Média | Médio (SQL) | M1, sinais | Média | Processo parado vira sinal e aparece uma vez no resumo diário |
| Clique na notificação das 6h abre o destino que ela traz | Corrigir | Alto | Baixa | Baixo | Teste no iPhone | **Alta** | Tocar no push abre a página indicada pelo aviso (hoje Agenda, Resumo ou Lista) com o app aberto, fechado e recém-atualizado (3 cenários no aparelho). Trocar o destino é a questão D-05 |
| Comprovar os robôs depois da proteção da `main` | Funciona (a comprovar) | Alto | Baixa | Baixo | Próximas execuções dos robôs | **Alta** | Um push bem-sucedido de cada robô (Notícias e Vagas) na `main` depois da criação da ruleset, registrado no histórico diário |
| Atualizar ao voltar à aba | Novo | Alto | Baixa | Baixo | — | **Alta** | Volta depois de 5 min atualiza; com campo alterado ou foco em campo, nada muda; testes do núcleo |
| Busca chama Esportes sem carregar (P-19) | Corrigir | Baixo | Baixa | Baixo | — | Média | Focar a busca sem Esportes carregado não gera erro e inclui os times |
| Camada de dados (A1) | Refatorar | Médio | Média | Médio | — | Alta | Cliente fora de `mercado.js`; login, Mercado e Lista iguais |
| Kit de UI e gráficos (A2) | Refatorar | Médio | Baixa | Baixo | — | Média | Compras não carrega Resumo, Saúde, MBA e Família |
| Registro de rotas e menu (A3) | Refatorar | Médio | Média | Médio | — | Média | Menu e rotas gerados de uma tabela; iguais para dono e casa |
| Contrato de fontes (A4) | Refatorar | Alto | Média | Médio | A1 | **Alta** | RAC Hoje sem `NLS`, `FAM`, `mbaFin`, `AGENDA_ICO`; teste de contrato por fonte |
| Regras das telas para o núcleo (A5) | Refatorar | Médio | Baixa | Baixo | — | Média | `saudeInsights` e `famMeds` no núcleo, com testes |
| Auditoria sem lista fixa (A6) | Refatorar | Alto (para F4) | Média | Médio (SQL) | — | **Alta antes de F4** | Tabela nova aparece na auditoria sem recriar `seguranca_estado()` |
| Design System DS-0/DS-1 | Parcial | Alto | Média | Baixo | — | Alta | Tokens com apelidos; catraca de cores; página de componentes |
| Tema e menu agrupado (DS-2) | Refatorar | Alto | Média | Médio | A3; tema na questão D-01 (em aberto) | Média | Dono aprova no celular |
| Integrantes (pessoas e animais) | Refatorar (`FAM` fixo) | Médio | Média | Médio | A6 | Alta (base da Casa) | Família montada pela tabela, com reserva; nada muda para a casa |
| Medicamentos | Novo | Alto | Média | Baixo | Integrantes, A6; acesso da casa na questão D-02 | **Alta** | Cadastro com foto e validade; histórico; alerta de vencimento; backup e "mfa" |
| Encomendas | Novo | Médio | Baixa | Baixo | A6 | Média | Registro, situação, retirada e histórico; bloco no RAC Hoje |
| Contas domésticas | Novo | Alto | Média | Baixo | A6 | Alta | Conta recorrente, fatura, pagamento, anexo, vencimento na Agenda, sinal de atraso |
| Condomínio (ocorrências) | Novo | Baixo | Baixa | Baixo | A6 | Baixa | Ocorrências com situação e anexos |
| RAC Hoje como painel central | Parcial | Alto | Alta | Médio | A4, F4; papel do Início na questão D-12 | Alta | Painel do dono lendo só fontes |
| Sinais etapa A (navegador) | Novo (sobre regras que já existem) | Alto | Média | Baixo | A4 | Alta | Sinais com chave, estado e "por quê"; dono adia e descarta |
| Sinais etapa B (servidor) | Novo | Alto | Alta | Médio | etapa A; canal de push na questão D-06 | Média | Sinal criado sem a tela aberta, sem repetição |
| Interpretação `sinais.explicar` | Novo | Médio | Média | Médio (custo) | Sinais; automático só com autorização expressa | Média | Explicação válida (números só dos fatos), guardada no servidor, dentro do orçamento |
| Garmin G1–G3 | Refatorar + Novo | Alto | Média | Baixo | A5 | Média | Sinais de saúde e "Recuperação da semana" sem tocar na `garmin` |
| Garmin G4–G5 (dados extras, trajetos) | Novo | Médio | Alta | Alto (privacidade) | Questão D-08 e autorização para a `garmin` | Baixa | Ativação voluntária, zonas de privacidade, retenção e "apagar tudo" funcionando |
| Acontecimentos | Parcial | Médio | Média | Baixo | — | Média | Id estável entre edições; linha do tempo; "o que mudou" |
| Trilhas de estudo | Parcial | Médio | Baixa | Baixo | — | Baixa | Trilhas, sessões e competências com evidência; bloco no RAC Hoje |
| Central de Compras (kits, patrimônio, garantias) | Funciona (base) · Agora não (evolução) | Médio | Alta | Médio | Etapa própria; questão D-04 | Baixa agora | Definido no início da etapa |
| Dividir `nucleo.js` (A8) | Refatorar | Médio | Média | Médio | A1–A4 | Baixa | Carga inicial menor, medida antes × depois |
| n8n | Agora não | — | — | — | — | — | Reavaliar nos gatilhos do [Documento 05](05-integracoes-e-automacoes.md#6-n8n-avaliar-depois-não-agora) |
| Framework, TypeScript, bundler, reescrita | Agora não | — | — | — | — | — | — |

**Fora do roadmap** (decisão do dono, 13/11/2026): a **Central Fiscal**. OCR, SEFAZ, emissão e acompanhamento fiscal não serão
desenvolvidos; o código existente continua no ar, congelado, sem evolução; a migration `040` não é pendência e não será
implementada. Registro completo no [Documento 07](07-decisoes-e-pendencias.md#decisões-tomadas).

**Proteção da `main`**: a ruleset já está ativa (13/11/2026) e não é item do roadmap; só a comprovação dos robôs está na F1.

## 4. Como cada fase é entregue

- Um **lote funcional** por vez: planejar, implementar, rodar o teste do módulo, rodar a suíte inteira, relatório objetivo.
- Ordem de publicação de sempre: **SQL → função → site**, cada passo só com a autorização do dono.
- Cada lote termina com o registro no [histórico diário](historico-diario.md) (o que fizemos, o que estamos fazendo, o que
  vamos fazer) e, se mudar decisão ou estado, no [Documento 07](07-decisoes-e-pendencias.md).
- Telas da casa (Fernanda) e a função `garmin` só com autorização expressa.
