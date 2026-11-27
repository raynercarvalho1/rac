# RAC · 13 · Visão e arquitetura do novo RAC

Documento 2 do conjunto Novo RAC (Lote 0, 27/11/2026). Parte do [diagnóstico](12-diagnostico-do-rac-atual.md) e das decisões de produto já aprovadas pelo dono.
Tudo aqui é **[Recomendação] aprovada em conceito e ainda não implementada**; os números `N-xx` remetem ao [Registro de decisões](19-registro-de-decisoes.md).
O que existe hoje continua descrito nos Documentos 01 a 11.

## 1. Conceito

> **RAC — Seu espaço. Sua vida. Seu mundo.**

Três pilares, e cada tela do produto deve servir a pelo menos um:

| Pilar | Significado | Onde aparece |
|---|---|---|
| **Casa** | Um ambiente pessoal, confortável e organizado, que o usuário monta do jeito dele | Minha Casa (Workspace), espaços compartilhados |
| **Descoberta** | Novidades, interesses e referências chegando sem esforço | Descobrir, Biblioteca |
| **Utilidade** | Informações integradas resolvendo tarefas reais | Minha Vida, Projetos, Captura, Timeline, Intelligence |

## 2. Princípios (somam-se aos do [Documento 01](01-visao-e-mapa-mestre.md#princípios-permanentes))

1. **Um sistema, não cinco.** Os cinco ambientes são visões e portas sobre os mesmos módulos, dados, busca, Timeline, Captura e permissões (N-02).
2. **O usuário compõe, o módulo é dono do dado.** Mudar a tela nunca muda nem apaga dado de negócio (N-06).
3. **Ver não é copiar.** Timeline, Busca, widgets e Mapa consultam os registros originais; não criam cópias (N-07).
4. **Privado por padrão, compartilhado por escolha, e o banco decide.** A tela nunca é a barreira de segurança (N-09).
5. **Inteligência opcional.** O RAC funciona inteiro sem IA; a IA só interpreta o que as regras já encontraram (N-11).
6. **Evolução sem ruptura.** Cada lote entrega algo usável; a experiência da Fernanda e os dados existentes são preservados por padrão (N-13).
7. **Sem build, sem framework, ES5** (regras do `CLAUDE.md`): o motor de Workspace é código próprio.

## 3. Os cinco ambientes

| Ambiente | O que é | Pergunta que responde |
|---|---|---|
| **Minha Casa** | A página inicial personalizável do usuário e as páginas de Workspace que ele criar; o dia a dia da casa e da família | "O que importa agora, do meu jeito?" |
| **Minha Biblioteca** | Tudo o que o usuário guarda: links, notas, documentos, arquivos, referências e o que a Captura classificou como material de consulta | "Onde está aquilo que guardei?" |
| **Meus Projetos** | Objetivos com tarefas, documentos, notas, referências e histórico | "O que estou construindo?" |
| **Descobrir** | Curadoria na página inicial e exploração em área própria: notícias, esportes, vagas, ofertas, perfis | "O que há de novo que me interessa?" |
| **Minha Vida** | Os domínios da vida: saúde, finanças e compras, família, veículos, documentos, carreira e estudos, e-mail, agenda | "Como estão as minhas áreas?" |

**Fora dos cinco:** *Sistema* (Segurança, Monitor, Custos de IA, RAC Knowledge, backup) fica num acesso de configuração, porque é manutenção e não ambiente (N-03).

### 3.1 Mapa de todas as rotas atuais nos ambientes [Recomendação]

| Rota atual | Ambiente | Observação |
|---|---|---|
| `rachoje` (RAC Hoje), `inicio` | **Minha Casa** | O Hoje vira a primeira página de Workspace (Fase 2); `inicio` é absorvido |
| `workspace` (criada no Lote 1, 27/11/2026) | **Minha Casa** | O motor de páginas e widgets; hoje só do dono e com 4 widgets de referência; a Minha Casa configurável (Lote 2) é montada sobre ele |
| `agenda`, `aniversarios`, `lista` | **Minha Casa** | A lista da casa é o destino mais comum da Captura |
| `olivia`, `eddie`, `documentos`, `veiculos` | **Minha Vida** | Família e patrimônio; seguem liberados à casa |
| `saude` | **Minha Vida** | Fonte do Mapa e da Timeline |
| `mercado`, `fiscal`, `compras`, `alimentacao` | **Minha Vida** (Finanças e compras) | Liberados à casa; Radar fica dentro da Central de Compras |
| `inbox` | **Minha Vida** (Comunicação) | Só do dono |
| `mba`, `carreira`, `estudos`, `conexoes`, `rede` | **Minha Vida** (Carreira e estudos) | Cada trilha pode ser vinculada a um Projeto |
| `vagas` | **Descobrir** | Também alimenta Carreira |
| `newsletter`, `esportes`, `x` | **Descobrir** | Itens salvos vão para a Biblioteca |
| `resumo`, `painel` | **Minha Casa** (viram widgets de gráfico) | Mantêm a rota |
| `busca` | **Transversal** (barra de busca global) | Ver [Documento 15](15-arquitetura-de-integracao.md) |
| `sistema`, `monitor`, `seguranca`, `iacustos`, `conhecimento`, `componentes`, `em-breve` | **Sistema** | Fora dos cinco |
| (novas) Biblioteca, Projetos, Timeline, Captura (caixa), Mapa | ver abaixo | criadas nas fases 3, 4, 6 e 7 |

### 3.2 Como a navegação é implementada sem quebrar nada [Recomendação]

- `RAC_ROTAS` continua sendo o **registro único**; cada rota ganha um campo `ambiente` (casa, biblioteca, projetos, descobrir, vida, sistema), sem mexer em `area`, `casa`, `mods` nem nos endereços `#rota`.
  Links, notificações e favoritos antigos continuam abrindo (teste `tests/rotas.test.mjs` estende a comparação antes × depois).
- O menu do dono passa de 6 áreas para os 5 ambientes + Sistema. A Fernanda continua sem agrupamento, vendo só o que `casa` libera (N-13); quando os espaços chegarem (Fase 8), o que ela vê vem do que o espaço libera.
- **Celular:** barra inferior com 4 ambientes e o **botão central de Captura** (Casa, Vida, **＋**, Projetos, Descobrir); Biblioteca fica no menu e na busca. [Recomendação a validar num protótipo no Lote 2; a barra atual
  — Hoje, MBA, Saúde, Compras, Inbox — é preferência do dono e só muda com a aprovação dele.]
- **Desktop e tablet:** menu lateral por ambiente; em tablet (861–1180 px) o menu pode recolher para ícones.
- **Busca e Captura** estão sempre à mão (barra superior no desktop; botão ＋ e ícone de busca no celular).

## 4. Experiência por ambiente (estados e comportamento)

Todas as páginas dos ambientes seguem o mesmo contrato de estados: **carregando** (esqueleto), **vazio** (explica o que falta e oferece a ação), **parcial** (parte das fontes falhou: aviso + resto utilizável,
como o contrato de fontes já faz), **erro** (mensagem + tentar de novo; nunca página branca) e **sem permissão** (nunca revela o que existe).

- **Minha Casa.** Abre na página padrão (migrada do RAC Hoje). Botão **Personalizar** entra em modo de edição ([Documento 14](14-arquitetura-do-workspace.md)). Páginas extras ("Trabalho", "Fim de semana", "Viagem") aparecem como abas.
  Desktop: grade de 12 colunas. Tablet: 8. Celular: 1 coluna em ordem.
- **Minha Biblioteca.** Lista e grade de itens (link, nota, documento, arquivo, referência) com filtros por tipo, etiqueta, origem e espaço; busca interna; ação "enviar para Projeto". Item guardado aponta para o original quando existir.
- **Meus Projetos.** Lista de projetos (ativo, pausado, concluído) e página de projeto com objetivo, tarefas, notas, documentos, referências e linha do tempo do projeto. Hoje só existem ideias em `pessoal.projetos`; elas são migradas (Fase 7).
- **Descobrir.** Na Casa, widgets de curadoria; na área própria, exploração por tema/fonte com "salvar na Biblioteca" e "silenciar". Curadoria por regras (interesses do usuário), IA opcional.
- **Minha Vida.** Painel por domínio com os módulos atuais como páginas internas; cada domínio expõe o resumo como widget.

## 5. Camadas transversais

| Camada | Papel | Documento |
|---|---|---|
| **Workspace** (páginas e widgets) | Composição da tela pelo usuário | [14](14-arquitetura-do-workspace.md) |
| **Timeline** | Linha do tempo única, sobre os registros originais | [15](15-arquitetura-de-integracao.md) |
| **Captura** | Entrada universal, com caixa de pendentes | [15](15-arquitetura-de-integracao.md) |
| **Busca** | Uma busca que respeita espaço e permissão | [15](15-arquitetura-de-integracao.md) |
| **Espaços e permissões** | Quem vê e edita o quê | [16](16-arquitetura-de-identidade-e-compartilhamento.md) |
| **Intelligence** | Organização, percepção e interpretação | [17](17-arquitetura-de-inteligencia.md) |
| **Mapa** | Onde as coisas aconteceram | [15](15-arquitetura-de-integracao.md#6-rac-mapa) |

## 6. Mapa de dependências entre as camadas

```text
Espaços e permissões (16)  ──►  Workspace (14)  ──►  Minha Casa configurável
        │                           │
        ├──►  Timeline  ◄── provedores por módulo (contrato de fontes)
        ├──►  Captura   ──► módulos (lista, agenda, projetos, biblioteca)
        ├──►  Busca     ──► mesmos provedores
        └──►  Intelligence (sinais por espaço) ──► widgets "Sugerido agora", avisos, IA opcional
Mapa  ◄── Lugares (novo) ◄── treinos, notas, compras, registros
```

A seta mais importante: **sem o modelo de espaços, Workspace, Captura e Projetos nasceriam presos ao "dono e casa"**. Por isso a fundação de espaços entra no Lote 1 (decisão N-10),
antes do que a sequência de fases sugeria.

## 7. O que não muda

Nenhuma rota é removida; nenhum dado é movido no Lote 0; o `PAPEL` continua valendo até a consolidação familiar; as regras de IA (só `rac-ia`, nunca grava), de segurança (RLS, `mfa`, backup) e de código (ES5, global com prefixo, testes)
seguem integralmente.

## Estado de implementação da navegação (Lote 2, 27/11/2026)

`RAC_ROTAS` ganhou o campo `ambiente` em **todas** as rotas (mapa da seção 3.1, testado em `tests/workspace_casa_tela.test.mjs`), e `js/rotas.js` traz `RAC_AMBIENTES` (os cinco nomes aprovados mais o Sistema), `ambienteDe(id)` e `rotasAmbientes()`. Só a **Minha Casa** está pronta e aparece; os demais entram com `pronto:true` e uma `rota` quando existirem. A Minha Casa (`#workspace`) é a rota inicial do dono e o primeiro atalho da barra do celular, que ganhou a Casa na frente e **manteve** Hoje, MBA, Saúde, Compras e Inbox (7 itens com o Menu, medidos em 390 px). O menu lateral segue agrupado pelas seis áreas de antes (nenhum item saiu). Pendente de validação do dono no iPhone; a barra com 4 ambientes e o botão central de Captura é do Lote 4.
