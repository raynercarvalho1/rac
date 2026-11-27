# RAC · 14 · Arquitetura do Workspace

Documento 3 do conjunto Novo RAC (Lote 0, 27/11/2026). Especifica o **motor de Workspace**: páginas, seções, widgets, catálogo, persistência, edição e responsividade,
suficiente para implementar as fases 1 e 2 do [roadmap](18-roadmap-tecnico.md). **[Recomendação] aprovada em conceito; nada foi implementado.**
Premissa central do dono: **o usuário personaliza sem alterar código nem pedir ao Claude**. Decisões `N-xx`: [Registro](19-registro-de-decisoes.md).

## 1. Problema e objetivo

Hoje a tela inicial (RAC Hoje, `js/hoje.js`) é uma composição **fixa em código**: mudar a ordem, esconder um bloco ou criar uma página para outro contexto exige uma alteração de código.
O Workspace transforma a composição em **dado do usuário**: páginas com seções e widgets que ele cria, move, redimensiona, configura, oculta e remove, em qualquer aparelho.

## 2. Modelo conceitual

```text
Espaço (pessoal ou compartilhado)            ← quem é dono e quem pode ver/editar (Documento 16)
 └─ Página              "Hoje", "Trabalho", "Viagem"…   (ordem, ícone, ambiente onde aparece)
     └─ Seção           grupo nomeado de widgets, recolhível
         └─ Instância de widget   tipo + versão + configuração + tamanho + estado
              └─ lê dados pelo CONTRATO DE FONTES (js/fontes.js), com as permissões de quem está vendo
```

- **Página:** unidade de composição. Pertence a um espaço (pessoal ou compartilhado). Tem `titulo`, `icone`, `ordem`, `ambiente` (em qual ambiente aparece como aba) e, opcionalmente, um
  `contexto` (ex.: "dia útil", "fim de semana", "viagem") usado pela inteligência contextual ([Documento 17](17-arquitetura-de-inteligencia.md)) para **sugerir** (nunca impor) a página.
- **Seção:** título + lista ordenada de instâncias; pode ser recolhida; é o "bloco" de arrastar em conjunto.
- **Instância de widget:** um uso concreto de um tipo do catálogo, com id próprio. Uma página pode ter várias instâncias do mesmo tipo com configurações diferentes
  (ex.: dois widgets "Gastos", um do mês e outro de Delivery).
- **Tipo de widget:** definição de código (catálogo, seção 4). O usuário **escolhe** tipos; não escreve widgets.

## 3. Decisão de arquitetura da grade (Brainstorm e Grill Me)

| Alternativa | Vantagens | Problemas | Decisão |
|---|---|---|---|
| **A. Posição absoluta (x, y) em grade livre**, como painéis de BI | Máxima liberdade | Colisões, buracos, layout diferente em cada largura, arrastar complexo no iPhone, difícil de manter em ES5 | Rejeitada |
| **B. Biblioteca de arrastar via CDN** (gridstack e similares) | Pronta | Dependência nova (a regra é "sem dependência nova" salvo CDN com versão exata), pouca acessibilidade por teclado, peso no `sw.js`, tema escuro e tokens próprios | Rejeitada para o MVP; reavaliar só se o motor próprio falhar |
| **C. Fluxo ordenado com larguras em colunas (grade de 12) e altura por conteúdo**, reordenação por arrastar | Mesmo documento serve a desktop, tablet e celular; sem colisões; teclado e toque simples | Menos "livre" que A | **Escolhida (N-05)** |

Na alternativa C cada instância tem **ordem** (posição no fluxo) e **tamanho** (`colunas` de 1 a 12 e `linhas` em unidades de altura: automática, 1, 2, 3…). O CSS Grid dispõe o resto.
"Arrastar e reposicionar" muda a ordem (e a seção); "redimensionar" muda colunas e linhas. Isso cumpre o pedido do dono sem sistema de colisão.

## 4. Catálogo e contrato de widget

### 4.1 Contrato (definição em código, uma por tipo)

```text
tipo            "saude.prontidao"                 // id estável, "<dominio>.<nome>", nunca reutilizado
versao          1                                 // sobe quando a configuração muda de formato
titulo, icone, descricao, categoria
dominio         "saude"                           // a fonte (js/fontes.js) ou o módulo que fornece os dados
tamanhos        { min:[col,lin], padrao:[col,lin], max:[col,lin] }   // em colunas (12) e linhas
config          campos: [{chave, rotulo, tipo:"periodo|selecao|numero|texto-curto|booleano|fonte", opcoes, padrao}]
migrarConfig    function(configAntiga, versaoAntiga) → configNova           // obrigatório ao subir a versão
exige           { modulo:"saude", papeis:[…], espacos:["pessoal","compartilhado"] }  // onde pode existir
renderizar      function(contexto) → elemento     // contexto: {config, tamanho, edicao, ler(fonte), abrir(rota)}
estados         carregando | vazio | parcial | erro | indisponivel | sem-permissao   // todos tratados pelo contêiner
acoes           [{id, rotulo, rota}]              // "Ver mais" abre o módulo original (#rota)
```

- **Contêiner único** (`ws` + `rkCard`): desenha cabeçalho (título, menu ⋯), moldura, estados e o rodapé de origem ("de onde vem"). O widget só desenha o corpo.
- **Dados só pelo contrato de fontes** (`fonteLer`, resultado `{ok, v, vazio, quando, ultimo, origem, parcial, falhas}`), na sessão de quem vê (RLS). Um widget novo para um domínio sem fonte exige criar a fonte antes (Documento 15, seção 2).
- **Registro** por `widgetRegistrar(def)`, no mesmo molde de `fonteRegistrar`; módulos leves `js/widgets-<dominio>.js` carregados sob demanda por `MOD_DEPS`.
  Nomes globais com prefixo `ws*`, `widget*` (o teste de estrutura proíbe repetição).

### 4.2 Catálogo inicial (Fase 2; todos sobre dados e telas que já existem)

| Categoria | Widgets (tipo) | Fonte atual |
|---|---|---|
| Dia | Prioridades do dia (`hoje.prioridades`), O que mudou (`hoje.mudou`), Agenda dos próximos dias (`agenda.proximos`), Aniversários (`agenda.aniversarios`), Tempo e chuva (`tempo.agora`) | `agenda`, `hoje`, Open-Meteo |
| Finanças | Gastos do mês (`compras.mes`), Últimas compras (`compras.ultimas`), Por área de consumo (`compras.areas`), Oportunidades do Radar (`radar.oportunidades`) | `mercado.js`, `radar` |
| Saúde | Prontidão (`saude.prontidao`), Último treino (`saude.treino`), Semana (`saude.semana`) | `saude` |
| Família e casa | Lista de compras (`lista.itens`), Olivia e Eddie (`familia.resumo`), Remédios (`familia.remedios`), Veículos (`veiculos.resumo`), Documentos a vencer (`documentos.vencimentos`) | `familia`, `lista` |
| Comunicação | E-mails recentes (`inbox.recentes`) | Inbox |
| Estudos | MBA: aula e avaliações (`mba.proximos`) | `mba` |
| Descobrir | Newsletter do dia (`newsletter.destaques`), Esportes (`esportes.jogos`), Sorocaba (`noticias.sorocaba`), Vagas (`vagas.novas`) | `newsletter`, JSON dos robôs |
| Utilidade | Captura rápida (`captura.rapida`), Caixa de entrada da Captura (`captura.caixa`), Linha do tempo (`timeline.recente`), Sinais (`sinais.abertos`), Atalhos (`atalhos.rotas`), Nota fixa (`nota.fixa`) | Fases 3, 4 e 5 |
| Mapa | Mapa de percursos (`mapa.percursos`) | Fase 6 |

Widgets das fases 3 a 7 entram no catálogo quando o módulo existir; o motor não precisa mudar (extensibilidade por registro).

### 4.3 Configuração e contrato de filtros

- A configuração de uma instância é um **objeto JSON pequeno** (limite 4 KB), validado pelo `config` do tipo; chaves desconhecidas são preservadas, não descartadas.
- Tipos de campo: `periodo` (hoje, 7 dias, mês, 12 meses, intervalo), `selecao` (uma ou várias de opções fixas, ex.: área de consumo), `numero`, `texto-curto`, `booleano`, `fonte` (qual domínio, quando o tipo é genérico).
- **A configuração nunca guarda conteúdo privado** (nomes de pessoas de saúde, valores, texto de e-mail): só **referências e critérios** (id de área, período, quantidade). Isto impede que a página, que um espaço compartilhado
  enxerga inteira, vaze informação (regra de segurança S-1, seção 9).

## 5. Persistência [Recomendação]

Decisão (N-04): **um documento por página**, guardado em tabela própria e versionado, **não** na tabela `pessoal`.

| Opção | Análise | Decisão |
|---|---|---|
| `pessoal` (chave JSON) | Já existe, tem cópia local e conflito. Mas só o dono lê; a casa só vê 7 chaves; não há conceito de espaço nem de compartilhamento; mistura layout e dados | Rejeitada para páginas; **mantida** para preferências individuais pequenas |
| Tabela normalizada por widget | Permite RLS por widget | Muitas gravações pequenas, ordem difícil de manter atômica, sem ganho real (a permissão é da página) | Rejeitada |
| **Tabela `workspace_paginas` com `layout` JSON** + `workspace_versoes` | Atômico (um salvamento = uma versão), RLS por espaço, histórico, uma leitura por página | Documento maior (limite 64 KB) | **Escolhida** |

Esboço de modelo (**ainda sem migration**; a criação é do Lote 1, que segue as regras de SQL do `CLAUDE.md`: RLS, `mfa`, sem `anon`, backup e catálogo):

```text
workspace_paginas    id uuid, espaco_id uuid → espacos, criado_por uuid, titulo, icone, ambiente, contexto, ordem int,
                     schema_versao int, versao int (concorrência otimista), layout jsonb, arquivada_em timestamptz, criado_em, atualizado_em
workspace_versoes    id, pagina_id, versao, layout jsonb, autor uuid, quando, motivo ("edição", "restaurar padrão", "migração")   // últimas 30 por página
workspace_pessoal    user_id, pagina_id, ocultos jsonb (ids de instâncias que EU ocultei numa página compartilhada), preferencias jsonb
```

`layout` (documento versionado):

```text
{ schema:1,
  secoes:[ { id, titulo, recolhida:false,
             itens:[ { id:"w_8f3a…", tipo:"saude.prontidao", v:1, col:4, lin:2,        // col/lin = tamanho
                       estado:"ativo",                                                    // ativo | oculto | desativado
                       config:{ periodo:"7d" } } ] } ] }
```

- **Identificação:** `id` de instância é um uuid gerado no cliente, **estável para sempre** (mover, redimensionar e reconfigurar não mudam o id). `tipo` é o id do catálogo; `v` é a versão do tipo com que a configuração foi escrita.
- **Versionamento duplo:** `schema` (formato do documento; migrado por `workspaceMigrar` em código) e `v` por instância (formato da configuração; migrado pelo `migrarConfig` do tipo).
- **Concorrência:** gravação com `versao` esperada (otimista). Se outra pessoa/aparelho salvou antes, o cliente **refaz as operações do usuário sobre a versão nova** (operações por instância: mover, redimensionar, configurar, ocultar, remover);
  se houver conflito na mesma instância, o usuário escolhe. Mesmo padrão de conflito já usado em `pessoal` (Sistema).
- **Offline:** o rascunho fica no aparelho (como `copiaGravar`); sobe quando a conexão volta.
- **Backup e restauração:** `workspace_paginas`, `workspace_versoes` e `workspace_pessoal` entram em `NUCLEO.SEG_TABELAS` e no catálogo de segurança (050, ainda pendente em produção: ver [Documento 12](12-diagnostico-do-rac-atual.md#5-dados-e-backend-fato-conferido-em-produção-por-leitura)).
- **Página padrão:** se o usuário não tem página, o app **gera na hora** a "Minha Casa" padrão por código (migrada do RAC Hoje) e só grava quando ele personaliza. Nada para o usuário configurar do zero.

## 6. Ocultar, remover, desativar e excluir (distinção obrigatória, N-06)

| Ação | O que faz | O que NÃO faz | Reversível | Quem pode |
|---|---|---|---|---|
| **Ocultar** | Esconde a instância da **visualização** (marca `estado:"oculto"`; em página compartilhada, é **por usuário** em `workspace_pessoal`, não afeta os outros) | Não apaga config, posição nem dados; a instância continua no layout, mas **não renderiza nem consulta a fonte** enquanto oculta | Sim, a qualquer momento ("Mostrar ocultos" no modo de edição) | Qualquer membro com acesso à página |
| **Remover da página** | Tira a instância do layout (a configuração vai para `workspace_versoes`) | Não toca em dado de negócio; não apaga o módulo | Sim, **Desfazer** na hora e "Restaurar" pelo histórico (30 versões) | Editor ou administrador do espaço (dono, em página pessoal) |
| **Desativar** | **Pausa o comportamento**: a instância fica no layout com posição e config, **mas não consulta fontes, não gera sinais nem avisos**; aparece cinza só no modo de edição. No nível do espaço, o administrador pode desativar um **tipo** (ex.: Inbox) para todas as páginas | Não apaga nada | Sim | Editor (instância) / administrador (tipo no espaço) |
| **Excluir o registro original** | Existe **somente dentro do módulo dono do dado**, com a confirmação e o histórico daquele módulo (ex.: apagar uma nota, um registro de saúde) | **Nunca** é oferecido pelo Workspace, por widget ou pelo modo de edição | Conforme o módulo | Conforme o módulo e o RLS |

Regras: (1) o menu ⋯ do widget **não tem "excluir dado"**; o link "Abrir no módulo" leva ao lugar onde isso é possível. (2) Remover a **página** inteira a arquiva (`arquivada_em`) e a lista em "Arquivadas" por 30 dias antes de poder ser excluída
de vez; o layout continua só layout. (3) Teste obrigatório do Lote 1: nenhuma operação do motor emite `delete`/`update` em tabela de negócio (varredura por teste, no molde dos testes de segurança).

## 7. Modo de edição

- **Entrada:** botão **Personalizar** na página (só para quem tem papel de editor ou dono). Sai por **Concluir** (salva) ou **Cancelar** (descarta o rascunho).
- **Rascunho:** todas as mudanças vivem num rascunho em memória (e no aparelho, para sobreviver a fechar o app). **Desfazer/refazer** (pilha de operações). Salvar grava uma versão.
- **Operações:** adicionar (abre o **catálogo** com busca e categorias, pré-visualização e tamanho padrão), mover (arrastar pela alça ⠿; **alternativa por teclado e por menu**: "mover para cima/baixo/outra seção"),
  redimensionar (alças e menu: pequeno, médio, grande, largura total), configurar (painel lateral no desktop, folha inferior no celular), criar/renomear/recolher/reordenar seções, ocultar, desativar, remover, duplicar.
- **Arrastar:** Pointer Events (mouse, toque e caneta), pressão longa para iniciar no celular (não conflita com rolagem), auto-rolagem nas bordas, indicador de destino. Sem biblioteca (N-05).
- **Acessibilidade:** todo gesto tem alternativa por teclado/menu; foco visível; anúncios `aria-live` ("movido para a posição 3"); alvos de toque ≥ 44 px (`--rac-alvo`); respeito a `prefers-reduced-motion`.
- **Travas:** em modo de edição os widgets não navegam (clique abre o painel de configuração); botões de ação do módulo ficam desligados para evitar gravar dado sem querer.
- **Restaurar padrão:** volta ao layout de fábrica da página (com confirmação e como nova versão; a anterior fica no histórico).
- **Modelos prontos** ("Dia a dia", "Finanças", "Treino", "Casa e família") como ponto de partida; o usuário parte de um e ajusta.

## 8. Responsividade

| Largura | Colunas | Regra |
|---|---|---|
| ≥ 1181 px (desktop) | 12 | layout como salvo (`col` 1 a 12) |
| 861–1180 px (tablet / janela estreita) | 8 | `col` é escalado proporcionalmente (arredondado, mínimo do tipo); ordem preservada |
| ≤ 860 px (celular) | 1 | uma coluna, **na ordem do fluxo**; `col` ignorado (largura total); `lin` vira altura mínima |

- **Um único documento serve aos três tamanhos** (consequência da decisão N-05). O usuário pode definir, por instância, "mostrar no celular: sim/não" (oculta só nessa largura) e a ordem do celular é a do fluxo.
- Seções recolhidas por padrão no celular podem ser configuradas.
- Os widgets definem comportamento por tamanho: `tamanhos.min` evita layout ilegível; abaixo do mínimo o widget mostra a versão compacta (KPI único).
- O motor usa as mesmas quebras do `css/rac.css` (860, 1100/1180 px) e os tokens `--rac-*`, inclusive tema escuro. Contraste e `safe-area-inset` do iPhone seguem o que o app já faz.

## 9. Tratamento de widgets indisponíveis

| Situação | Comportamento |
|---|---|
| **Tipo removido ou renomeado no código** | A instância **não é descartada**: aparece um cartão "Widget indisponível" (tipo, versão, motivo) com **Remover** e, se houver `substituidoPor`, **Trocar**. A configuração fica intacta no layout. |
| **Versão da configuração mais nova que o código** (aparelho com app antigo) | Cartão "Atualize o app"; não grava por cima |
| **Fonte falhou** | Estado `erro` do contêiner, com tentar de novo; os outros widgets seguem (falha isolada: um widget por vez, `try/catch` no contêiner) |
| **Fonte parcial** | Corpo com o que veio + selo "parcial" e as falhas |
| **Módulo desligado/desativado ou integração sem credencial** (ex.: Garmin sem chave) | `indisponivel` com instrução de como ativar (link para Sistema) |
| **Sem permissão** (membro do espaço sem acesso ao dado) | `sem-permissao`: **sem título de dado, sem contagem, sem prévia**; só "Você não tem acesso a este conteúdo" |
| **Lentidão** | Esqueleto e carregamento preguiçoso (só o que está na tela); fontes em paralelo com tempo-limite por widget |

## 10. Segurança e permissões (regras S)

- **S-1.** A página é um documento visível a todos os membros do espaço; por isso **configuração só guarda referências**, e títulos de widget são os do catálogo (ou texto livre do usuário **avisado** de que é visível ao espaço).
- **S-2.** **O layout nunca concede acesso a dado.** Todo widget lê com a sessão de quem vê e o RLS decide; o motor não usa `service_role` nem cache compartilhado entre usuários.
- **S-3.** Papéis do espaço: **visualizador** (vê, oculta para si), **editor** (adiciona, move, configura, remove), **administrador** (tudo, inclusive desativar tipos, convidar e arquivar páginas). Página pessoal: só o dono.
- **S-4.** Tabelas novas: RLS ligado, `revoke all ... from anon`, trava `mfa`, backup, catálogo de segurança e teste em `tests/seguranca.test.mjs`.
- **S-5.** Validação no servidor: `layout` com `jsonb_typeof`, limite de tamanho e de itens (ex.: 60 instâncias por página), `tipo` com padrão `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`, `col` de 1 a 12 (restrições `check`, no molde de `sinais`).
- **S-6.** A Fernanda mantém **exatamente** a navegação e as telas de hoje até a Fase 8 (a página dela é gerada por código a partir de `casa: true`); personalizar para ela entra na Fase 8, por decisão posterior do dono (N-13).

## 11. Integração com o que existe

- O **RAC Hoje** vira a página padrão: os blocos atuais (`js/hoje.js`) são **extraídos como tipos de widget** sem mudar regra nem dado; a rota `#rachoje` continua abrindo a página padrão de Minha Casa.
- A **análise de IA** do Hoje vira o widget `hoje.analise` (mesmas regras: só real, só dono, 2 por dia com o interruptor ligado).
- **Captura** e **Timeline** entram como widgets (fases 3 e 4). **Sinais** (Documento 17) também.
- O **botão +** do dono (`acoes` em `js/rotas.js`) é preservado como atalho contextual até a Captura universal substituí-lo (Fase 4).

## 12. Critérios de aceite do motor (resumo; detalhados no [roadmap](18-roadmap-tecnico.md))

Criar página, adicionar widget do catálogo, configurar, mover, redimensionar, ocultar, remover, desativar, desfazer, salvar e reabrir em outro aparelho com o mesmo resultado; layout correto em desktop, tablet e celular;
widget com fonte falha ou tipo desconhecido não derruba a página; nenhuma operação altera dado de negócio; a Fernanda não vê mudança; testes (motor puro em `nucleo.js` + RLS em PGlite + tela).
