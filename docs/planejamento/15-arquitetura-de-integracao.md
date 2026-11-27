# RAC · 15 · Arquitetura de integração (Timeline, Captura, Biblioteca, Busca, Mapa, Projetos)

Documento 4 do conjunto Novo RAC (Lote 0, 27/11/2026). Define como os módulos se relacionam **sem virar cópia uns dos outros**. **[Recomendação]; nada implementado.**
Base existente: o contrato de fontes (`js/fontes.js`, `js/fonte-agenda.js`, `js/fonte-saude.js` e vizinhos), `NUCLEO.agendaItens`, a Captura rápida (`abrirCaptura` em `js/app.js`) e a busca (`js/sistema.js`).
Decisões `N-xx`: [Registro](19-registro-de-decisoes.md). Permissões e espaços: [Documento 16](16-arquitetura-de-identidade-e-compartilhamento.md).

## 1. Princípio de integração: provedores por módulo, consulta ao original (N-07)

Cada módulo continua **dono do próprio dado**. Quem agrega (Timeline, Busca, Mapa, widgets, Intelligence) pede ao módulo por um **provedor**, no mesmo molde do contrato de fontes:

```text
provedor registrado por módulo (arquivo leve js/prov-<dominio>.js, sem tela, carregado sob demanda)
  timeline:  lerJanela({de, ate, cursor, filtros, espacos})  → {eventos:[…], proximoCursor, parcial?, falhas?}
  busca:     buscar({texto, tipos, espacos, limite})           → {itens:[…]}
  lugares:   lerLugares({de, ate, espacos})                    → {lugares:[…]}
  sinais:    (servidor, Documento 17)
```

Todos devolvem **referências leves** (id, quando, título, categoria, link) e **nunca** gravam. Todos leem com a sessão de quem vê (RLS). O resultado carrega `origem` e `quando`, como as fontes atuais.

## 2. RAC Timeline

**Objetivo:** uma linha do tempo única do que aconteceu (e do que está marcado) em todos os módulos, para o usuário ver "o que houve na semana" e voltar ao registro.

### 2.1 Contrato do evento (conceitual)

| Campo | Regra |
|---|---|
| `id` | Identificação única e **estável**: `<provedor>:<tabela>:<chave>[:<parte>]`, ex.: `saude:garmin_ativ:123456`, `fiscal:notas:<uuid>`. Não muda quando o registro é editado |
| `quando` | Instante em ISO 8601 com fuso (`America/Sao_Paulo`); para eventos só de data, `data` + `diaInteiro:true` |
| `fim` | Opcional (treino, consulta) |
| `categoria` | De uma lista fechada: `saude`, `financas`, `familia`, `casa`, `comunicacao`, `estudos`, `carreira`, `descoberta`, `projetos`, `sistema` |
| `tipo` | `<dominio>.<evento>` ex.: `saude.treino`, `compras.nota`, `familia.vacina`, `inbox.mensagem` |
| `titulo`, `resumo` | Curtos; **o resumo nunca inclui dado sensível** quando o espaço é compartilhado (o provedor decide, por política do tipo) |
| `espaco` | Espaço dono (ou `pessoal`) |
| `ator` | Quem fez/registrou, quando existir (`criado_por`) |
| `relacionados` | Lista de `id` de outros eventos/entidades (ex.: nota ↔ compra no Mercado ↔ item da Lista), vindos de vínculos que **já existem** (`notas_fiscais_vinculos`, `compras_online`) |
| `link` | Rota do original (`#saude/treino/…`); abrir sempre leva ao módulo |
| `versaoFonte` | `atualizado_em`/`criado_em` do original, para saber se a prévia envelheceu |

### 2.2 Comportamento

- **Sem cópia:** a Timeline **monta a lista na hora** pelos provedores (merge por `quando`, ordenação estável por `id`). Não existe tabela de eventos nesta fase (N-07).
- **Paginação e desempenho:** janela de datas (padrão: últimos 7 dias) + **cursor por provedor** (keyset em `(quando, id)`), carregamento incremental ao rolar. Cada provedor tem limite por chamada e tempo-limite; um provedor lento
  não trava os outros (resultado `parcial`). Índices necessários já existem na maioria (`registros_quem_data`, datas em `notas`); lacunas serão listadas pelo Lote 3 por `get_advisors`.
  Se a composição no navegador se mostrar lenta, a evolução é uma **view/RPC `security_invoker`** de eventos (união das mesmas tabelas), ainda sem tabela própria (decisão de reavaliação, não de partida).
- **Filtros:** categoria, tipo, espaço, pessoa (quem), período, "só com anexo", "só pendentes". **Pesquisa:** pelo mesmo provedor de busca (seção 5). **Agrupamentos:** por dia, semana, mês, categoria ou pessoa.
- **Eventos atualizados:** como a leitura é ao vivo, a edição aparece na próxima abertura; `versaoFonte` evita mostrar prévia velha em caches.
- **Eventos removidos:** simplesmente deixam de aparecer. Referências guardadas (um favorito, um sinal, uma nota da Captura) que apontam para um `id` ausente exibem **"Registro removido ou sem acesso"**, sem erro.
- **Futuro:** a Timeline inclui o que está **agendado** (reaproveita `agendaItens`) com marcador visual, de modo que a Agenda é um filtro da Timeline ("próximos"), não um segundo sistema.
- **Privacidade:** cada provedor devolve só o que o usuário pode ler; em espaço compartilhado, só tipos marcados como compartilháveis. Nunca eventos de e-mail ou saúde de uma pessoa em Timeline de espaço de outra.

## 3. RAC Captura

**Objetivo:** uma entrada universal, **a um toque em qualquer ambiente**, para tudo o que o usuário quer guardar antes de decidir onde fica.

### 3.1 Tipos de conteúdo

`texto`, `ideia`, `link`, `foto`, `arquivo`, `tarefa`, `referencia`, `observacao`. Um item pode ter mais de um anexo (foto + nota).

### 3.2 Fluxo

```text
[botão ＋ / atalho / compartilhar do iPhone / widget "Captura rápida"]
        │  (um campo + tipo opcional; foto e arquivo pelo seletor ou câmera)
        ▼
Gravação IMEDIATA como item "pendente" (offline: fila local, mesmo padrão de bancoOuFila)
        ▼
Classificação DETERMINÍSTICA (sem IA): URL → link; "comprar…" / "2 leite" → lista de compras; data/hora → lembrete;
   "#projeto" → projeto; foto com texto de nota fiscal → Central Fiscal (sugestão); resto → nota/observação
        ▼
Caixa de entrada da Captura (widget e página): sugestão com 1 toque ("Enviar para Lista ✓", "Para Projeto…", "Biblioteca", "Descartar")
        ▼
CONFIRMAÇÃO do usuário → o item vira registro no módulo destino (usando a gravação que o módulo já tem);
   o item da Captura guarda destino (módulo + id) e fica "classificado" (não "apagado"); desfazer devolve a pendente
```

- **Atalho rápido preservado:** quem já sabe o destino continua usando os formulários atuais (`compra`, `lembrete`, `link`, `peso`, `gasto`, `km`), que gravam direto no módulo (`acoes` em `js/rotas.js`). A Captura universal **acrescenta** a caixa de pendentes; não tira o caminho curto (N-08).
- **Armazenamento:** tabela `captura_itens` (id, espaço, criado_por, tipo, conteúdo, anexos, estado `pendente|classificado|arquivado|descartado`, destino, sugestão, origem `app|compartilhar|widget|atalho`, criado_em, classificado_em) e **bucket privado** próprio para fotos e arquivos,
  com a mesma política de pasta por espaço do cofre `familia` (`storage.foldername`). Imagens passam por `encolher()` (já existe). Limite de tamanho do arquivo: 50 MB (limite do plano).
- **Pendentes:** badge de contagem no botão; lembrete suave **na própria página** (sem push) quando há itens com mais de 3 dias; "Arquivar tudo" com confirmação. Nada expira sozinho.
- **Compartilhar de outro app:** o `share_target` do PWA (já declarado em `manifest.webmanifest`) e `capturaCompartilhada()` passam a criar item pendente em vez de abrir só o formulário.
- **Dispositivos:** desktop (atalho de teclado + barra), tablet (folha lateral), celular (folha inferior, botão central da barra). Foto por câmera no celular.
- **Espaço:** o item nasce no espaço **ativo** (pessoal por padrão) e pode ser movido; só vira compartilhado por ação explícita.
- **Segurança:** conteúdo da Captura é privado do autor até ser enviado a um módulo/espaço; entra no backup; sem leitura por IA exceto pelas regras do Documento 17.

## 4. Biblioteca

**Objetivo:** onde o que o usuário guarda para consultar mora, **sem virar mais um depósito paralelo**.

- **Modelo:** um **item guardado** é uma referência com metadados (tipo: `link`, `nota`, `documento`, `arquivo`, `referencia`; título; etiquetas; origem; espaço; projeto opcional) que **aponta** para o conteúdo:
  um link externo, um arquivo no cofre, um documento já existente (`documentos` da Família, `notas_fiscais_docs`) ou um texto próprio.
- **Migração do que já existe:** `pessoal.salvos` (links) e `pessoal.projetos` (ideias) viram itens/projetos por script de migração com prévia (Fases 4 e 7); até lá, continuam funcionando.
- **Origens:** Captura (referência), Descobrir ("salvar"), Newsletter (matéria), Inbox (anexo ou mensagem guardada), Projetos (referência do projeto).
- **Tabela:** `biblioteca_itens` (Fase 4/7). Tabela única, filtros por tipo, etiqueta, espaço, projeto.

## 5. Busca

- **Hoje:** `renderBusca` e `buscar` (`js/sistema.js`) leem fontes e a memória do site, só do dono.
- **Alvo (N-14):** uma **Busca global** (barra no desktop, ícone no celular) que consulta os **provedores de busca** de cada módulo com o contrato da seção 1, agrupa por tipo, mostra de que espaço vem e **respeita o RLS** porque cada
  provedor consulta com a sessão do usuário. Sem índice duplicado dos dados privados; um índice texto do próprio banco (`tsvector`) só por módulo, no Lote 3 em diante, se o desempenho exigir.
- **Escopo por espaço:** filtro "Tudo / só pessoal / espaço X". Resultados de e-mail e saúde **só do dono** (hoje as telas já são só do dono).

## 6. RAC Mapa

- **Objetivo:** ver **onde** as coisas aconteceram: treinos, compras em estabelecimentos, viagens e qualquer registro com localização.
- **O que já existe [Fato]:** rotas dos treinos (`garmin_rotas`, 996 linhas com até 150 pontos), coordenadas e endereços de mercados em `pessoal.saudeLugares` (marcação manual e busca de endereço), mapa Leaflet com OpenStreetMap ou Google Maps opcional (`js/saude.js`, `js/saude-hub.js`).
- **O que falta [Fato]:** **compras e notas não têm coordenadas** (só nome do mercado, cidade textual e UF do emitente); **viagens** não existem como entidade; registros da Família não têm local.
- **Modelo proposto:** tabela `lugares` (id, espaço, nome, tipo `estabelecimento|casa|trabalho|viagem|outro`, lat, lon, precisão, endereço de referência, origem `manual|geocodificado|importado`) e um **vínculo opcional**
  `lugar_id` nas entidades que fazem sentido (mercados, notas, registros, futuramente viagens). Migração de `saudeLugares` com prévia. Treinos continuam usando `garmin_rotas` (início/fim derivam da rota).
- **Geocodificação:** só **sob demanda do usuário**, com cache e no ritmo permitido pelo serviço (Nominatim: 1 requisição por segundo, sem uso em massa); nunca automática em lote.
- **Privacidade:** coordenadas exatas são sensíveis. A casa e o trabalho do usuário podem ser "borrados" (área) nos widgets compartilhados; precisão e visibilidade por lugar; nenhuma coordenada no repositório (regra do `CLAUDE.md`).
- **Camadas do mapa:** percursos (treinos), estabelecimentos (compras, filtrando por área de consumo), viagens e lugares salvos; filtro por período e espaço. Widget `mapa.percursos` e página própria.

## 7. Projetos

- **Modelo:** `projetos` (espaço, título, objetivo, estado, datas) com **tarefas** (`projeto_tarefas`), **notas**, **referências** (itens da Biblioteca) e **histórico** (eventos na Timeline). Documentos são itens da Biblioteca ligados ao projeto.
- **Reuso:** ideias atuais (`pessoal.projetos`), candidaturas e MBA podem ser **vinculados** a projetos sem mudar de módulo. Tarefas sobem à Agenda quando têm data (provedor de timeline/agenda).
- **Captura → Projeto:** destino de primeira classe da Captura (`#projeto`).

## 8. Descobrir

- **Curadoria na página inicial:** widgets que consomem Newsletter, Esportes, Sorocaba, Vagas e Radar; a ordem e os temas vêm das **preferências do usuário** (interesses, fontes silenciadas), por regra. IA só para resumo (como a Newsletter já faz) ou para explicar
  por que algo foi sugerido ([Documento 17](17-arquitetura-de-inteligencia.md)).
- **Área própria:** exploração por tema/fonte e filtros; **salvar na Biblioteca**; **silenciar fonte**; marcar como lido. O que o usuário faz com o conteúdo alimenta as preferências, nunca mensagens automáticas.
- **Dependências externas** (robôs do GitHub, ESPN não oficial) são sinalizadas na própria tela quando atrasam (já existe o Monitor).

## 9. Relação entre os módulos (resumo)

| De → Para | Como | Cópia? |
|---|---|---|
| Qualquer módulo → Timeline | provedor `lerJanela` | não |
| Qualquer módulo → Busca | provedor `buscar` | não |
| Captura → módulos | cria o registro **no módulo** na confirmação; guarda só o destino | o conteúdo vira registro do módulo (movimento, não cópia) |
| Descobrir/Newsletter → Biblioteca | item com link e metadados | referência |
| Biblioteca ↔ Projetos | vínculo `projeto_id` no item | não |
| Treinos/compras/registros → Mapa | `lugar_id` e `garmin_rotas` | não |
| Todos → Intelligence | sinais calculados por regras sobre os dados originais ([Documento 17](17-arquitetura-de-inteligencia.md)) | só o sinal (derivado e recriável) |

## 10. Riscos e casos extremos (Grill Me)

- **Provedor lento** derruba a Timeline? → tempo-limite e resultado parcial por provedor.
- **Mesmo fato em dois módulos** (nota fiscal e compra no Mercado) aparece duplicado? → `relacionados` e deduplicação por vínculo existente (`notas_fiscais_vinculos`).
- **Evento sem fuso** (data vinda como texto)? → regra única `quando` com fuso de Brasília; testes de datas na virada de dia (a base já tem esses casos na Agenda).
- **Item da Captura enviado duas vezes** (offline + reenvio)? → id gerado no cliente e `upsert` idempotente; destino guarda `captura_id` para impedir segunda criação.
- **Foto com dado sensível** na Captura? → privada ao autor; cofre com `mfa`; nunca enviada a IA sem ação explícita do usuário.
- **Anexo grande no celular?** → compressão antes de subir e limite claro, com mensagem.
- **Busca revelando existência de algo privado** a outro membro? → provedor filtra por permissão; resultado "sem acesso" não é listado.
