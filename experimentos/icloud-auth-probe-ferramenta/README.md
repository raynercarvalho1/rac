# Ferramenta de publicação do Worker da POC autenticada iCloud

Esta pasta **não é código do site nem do Worker**. Só fixa o Wrangler usado pelo workflow `.github/workflows/icloud-auth-probe.yml`:

- `package.json`: uma única dependência, `wrangler` na versão exata `4.161.0`, sem scripts.
- `package-lock.json`: a árvore completa (todos os pacotes com integridade `sha512` e origem no registro oficial do npm).

O workflow instala com `npm ci --ignore-scripts` (nenhum script de instalação roda) e confere a integridade do Wrangler contra o valor escrito no próprio workflow. O job que tem os secrets da Cloudflare **só lê estes dois arquivos** da branch; nada mais do repositório é executado nele.

Para atualizar a versão: gerar o lockfile numa pasta temporária fora do repositório (`npm install --package-lock-only --ignore-scripts`), copiar os dois arquivos, atualizar a integridade nos dois jobs do workflow e revisar a mudança antes de aprovar qualquer execução.
