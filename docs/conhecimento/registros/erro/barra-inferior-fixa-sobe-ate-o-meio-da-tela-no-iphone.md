---
titulo: Barra inferior fixa sobe até o meio da tela no iPhone (Segurança)
tipo: erro
categoria: interface
tags: iphone, barra, position-fixed, safari, rolagem
estado: ativo
origem: js/app.js
data: 2026-11-25
---

No iPhone, a barra inferior e os botões flutuantes (←, ↑, +) ficavam no meio da tela e só voltavam ao rolar a página (visto na Segurança, 25/11/2026). Já houve um caso parecido no Inbox (versão 2026-11-24.9), tratado com camada própria (`translate3d`) em `css/rac.css`; sozinha ela não bastou.

## Causa (hipótese, não confirmada no aparelho)

O Safari do iPhone deixa a janela "encolhida" depois do teclado (código do MFA, nome da passkey), do Face ID ou de uma rolagem suave programática (`scrollIntoView` com `smooth`); os elementos `position:fixed` ficam deslocados até a próxima rolagem.

## Solução

Em `js/app.js`, um vai-e-volta de 1px na rolagem depois de `focusout`, `pageshow` e `resize` do `visualViewport` (sem foco em campo); em `js/seguranca.js`, `scrollIntoView` com `behavior:"auto"`. Versão 2026-11-25.1.

## Prevenção

Evitar rolagem suave programática e manter a camada própria da barra; se voltar, o dono deve dizer o que fez antes (teclado, Face ID, toque em Prévia) para localizar a causa real.
