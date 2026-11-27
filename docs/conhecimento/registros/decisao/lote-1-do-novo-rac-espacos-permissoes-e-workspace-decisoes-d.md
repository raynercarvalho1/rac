---
titulo: Lote 1 do novo RAC: espaços, permissões e Workspace (decisões de implementação, N-25 a N-35)
tipo: decisao
categoria: arquitetura
tags: novo-rac, espacos, workspace, seguranca
estado: ativo
origem: Lote 1, 27/11/2026
data: 2026-11-27
relacionados: decisao/novo-rac-arquitetura-aprovada-no-lote-0-espacos-workspace-em
---

Papéis: proprietário (o dono do espaço, nunca em espaco_membros), administrador, editor, leitor. A Casa legada é derivada de public.membros AO VIVO (espacos.casa_de): a Fernanda é editora enquanto tiver a linha, sem cópia nem sincronismo. Espaços e participações só mudam por funções rac_* (login + MFA; ninguém altera o próprio papel, administrador não mexe em administrador, proprietário intocável); o site não tem DML direto nessas tabelas. Páginas: um documento JSON por página (workspace_paginas), validado igual no banco (ws_layout_valido) e no navegador (NUCLEO.wsValidar), versão otimista (versao), histórico das 30 últimas (gatilho), preferências por pessoa em workspace_pessoal. Nada se apaga por função de espaço: arquivar antes de excluir. Tabelas concessoes, espaco_modulos e usuario_prefs ficam adiadas até haver consumidor. Backup: só exporta. Rota #workspace só do dono; a Fernanda não muda. Cadastro público do Supabase desativado (confirmado pelo dono).

## Motivo

Pedido do dono no Lote 1 (27/11/2026): fundação de identidade, espaços e Workspace funcionais e seguros. Detalhes, Brainstorm e Grill Me em docs/planejamento/19-registro-de-decisoes.md seção 5.
