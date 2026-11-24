---
titulo: Lugares: busca por CEP ou endereço via ViaCEP e Nominatim, só o texto digitado (24/11/2026, substitui o sem geocodificador)
tipo: decisao
categoria: saude
tags: saude, lugares, mapa, privacidade, geocodificacao
estado: ativo
origem: Pedido do dono, 24/11/2026
data: 2026-11-24
relacionados: decisao/lugares-marcacao-manual-em-pessoal-e-sugestao-pelo-gps-com-l
---

CEP de 8 dígitos vai ao ViaCEP (viacep.com.br) e o endereço resultante ao Nominatim (nominatim.openstreetmap.org, countrycodes=br); endereço digitado vai direto ao Nominatim. Nunca vai nome de mercado, compra, treino ou coordenada. O resultado vira marcador verde; só Usar este ponto grava em PESSOAL.saudeLugares.

## Motivo

O dono achou ruim dar zoom no mapa para achar cada estabelecimento e pediu um campo de CEP ou endereço. Isso substitui a decisão de 23/11 de não usar serviço externo de endereço; a privacidade se mantém: só o texto que ele digitar, só ao tocar em Buscar.

Atualização no mesmo dia (24/11/2026), pedido do dono: o RAC procura sozinho o endereço dos mercados sem local pelo CNPJ (BrasilAPI) e o localiza no Nominatim, com fallback nome + cidade/UF do nome, uma vez por mercado (cache em PESSOAL.saudeLugares.enderecos); o dono só confirma. Só o CNPJ (dado público da empresa) ou o nome do mercado sai do navegador; nunca compra, treino ou coordenada.
