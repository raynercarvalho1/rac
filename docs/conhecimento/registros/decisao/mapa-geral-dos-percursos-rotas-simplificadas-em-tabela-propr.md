---
titulo: Mapa geral dos percursos: rotas simplificadas em tabela própria garmin_rotas (23/11/2026)
tipo: decisao
categoria: garmin
tags: garmin, mapa, rotas, privacidade
estado: ativo
origem: Lote 3
data: 2026-11-23
---

Tabela garmin_rotas (user_id, id do treino, pontos até 150 [lat,lon] com 5 casas, qtd), RLS só do dono com mfa, sem anon, no backup. A função garmin (tipo rotas e rotina diária) grava; o site só lê. Treino sem GPS grava pontos vazios. Ordem: SQL 065, função, site.

## Motivo

Nenhum treino guardava coordenadas. Guardar a rota dentro de garmin_ativ.dados inflaria toda leitura da Saúde (a fonte lê todos os treinos); tabela própria mantém a Saúde leve. Privacidade decidida pelo dono em 23/11/2026: só o dono vê, sem ajuste extra (o 'esconder o local' que já existe nos Ajustes continua valendo).
