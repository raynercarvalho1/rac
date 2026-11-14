# Ferramenta de publicação do Worker da POC autenticada iCloud

Esta pasta **não é código do site nem do Worker**. Só fixa o Wrangler usado pelo workflow `.github/workflows/icloud-auth-probe.yml`:

- `package.json`: uma única dependência, `wrangler` na versão exata `4.161.0`, sem scripts.
- `aprovados.json`: os **pins** do Worker (P1 e P2): SHA-256 por arquivo e por manifesto, e a tabela que diz qual operação aceita qual pin. O workflow só empacota um commit cujo conteúdo seja igual ao do pin da operação (portão no job sem secrets). Mudar este arquivo é aprovar outro código para publicação: só por PR revisada (`docs/icloud-poc-deploy.md`, seção "Portão do pin").
- `package-lock.json`: a árvore completa (todos os pacotes com integridade `sha512` e origem no registro oficial do npm).

O workflow instala com `npm ci --ignore-scripts` (nenhum script de instalação roda) e confere a integridade do Wrangler contra o valor escrito no próprio workflow. O job que tem os secrets da Cloudflare **só lê os dados de `package.json` e `package-lock.json`**, sempre da `main` (o workflow privilegiado existe só na `main`); nada vindo da branch da POC é baixado nem executado nele.

Para atualizar a versão: gerar o lockfile numa pasta temporária fora do repositório (`npm install --package-lock-only --ignore-scripts`), copiar os dois arquivos, atualizar a integridade nos dois jobs do workflow e revisar a mudança antes de aprovar qualquer execução.
