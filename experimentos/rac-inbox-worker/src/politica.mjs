// RAC Inbox · Worker de PRODUTO (P7/I2): política fixa, não sensível. Nada aqui depende de variável, de secret ou do que o cliente disser.
// O Worker faz TRANSPORTE IMAP (leitura; e, desde a I3.2, só os poucos comandos de gerenciamento do seção "I3.2 · GERENCIAMENTO" do imap.mjs) para a função "rac-inbox" do Supabase (docs/inbox.md, seção "Canal assinado com o Worker").
// Quem chama é autenticado por ASSINATURA HMAC (canal.mjs), nunca por token do usuário; o navegador nunca fala com este Worker.

export const POLITICA = Object.freeze({
  // canal assinado: versão do protocolo, janela de tempo e retenção do registro de nonces (≥ 2 janelas: um nonce nunca volta dentro da validade)
  canal: Object.freeze({ versao: "rac-canal-v1", caminho: "/v1/op", janelaS: 60, nonceRetencaoS: 600, corpoMaxBytes: 4096, corpoMaxEnvioBytes: 262144, chavesAceitas: Object.freeze(["k1", "k2"]) }),
  // operações aceitas (lista fechada); todas só LEEM
  // "ping" prova o CANAL (assinatura + nonce) sem credencial e sem IMAP: o corpo é só { operacao }, e a resposta nunca toca na Apple
  operacoes: Object.freeze(["ping", "testar_conta", "listar_pastas", "estado_pasta", "listar_mensagens", "ler_mensagem", "baixar_anexo", "smtp_prova", "enviar", "capacidades", "verificar_mensagem", "marcar_lida", "mover_mensagem"]),
  // I3.2 · gerenciamento (seção "I3.2 · GERENCIAMENTO" do imap.mjs). "capacidades" e "verificar_mensagem" só LEEM; "marcar_lida" e "mover_mensagem" são as ÚNICAS operações IMAP que alteram a caixa (lista fechada de comandos no seção "I3.2 · GERENCIAMENTO" do imap.mjs)
  gestao: Object.freeze(["capacidades", "verificar_mensagem", "marcar_lida", "mover_mensagem"]),
  escrita: Object.freeze(["marcar_lida", "mover_mensagem"]),
  // operações de SAÍDA (SMTP): as únicas que escrevem no mundo; usam smtp, não imap
  saida: Object.freeze(["smtp_prova", "enviar"]),
  // carimbo do código publicado: aparece na resposta do ping, para provar QUAL versão está no ar (mudar a cada alteração publicável)
  versao: "rac-inbox-worker@p9.2",
  // IMAP: host e porta fixos no código (TLS implícito). Nunca vêm do cliente.
  imap: Object.freeze({
    host: "imap.mail.me.com", porta: 993, timeoutMs: 25000,
    maxBytesSessao: 6291456,      // total lido do servidor numa sessão (6 MiB: cobre um anexo de até ~3 MiB codificado + estrutura)
    maxLinhas: 2000,              // linhas soltas por comando (LIST de uma caixa grande)
    maxLinhaLogica: 65536,        // linha lógica com os literais já tirados (estrutura MIME)
    maxLiteralCabecalho: 16384, maxLiteralTexto: 131072, maxLiteralAnexo: 3145728,
    maxPastas: 300, maxMensagensPorChamada: 100, maxPartes: 40, maxProfundidade: 8, maxItensSexp: 6000,
    maxTextoCaracteres: 65536,    // texto devolvido ao navegador
    maxNomePasta: 200,
  }),
  // SMTP (I3): STARTTLS na porta 587; host e porta fixos no código. A senha só é enviada DEPOIS do STARTTLS concluído (nunca em texto aberto).
  smtp: Object.freeze({
    host: "smtp.mail.me.com", porta: 587, helo: "rac-inbox-worker", timeoutMs: 30000,
    maxBytesSessao: 262144, maxLinhasResposta: 50, maxLinhaResposta: 1024,
    maxDestinatarios: 20,           // por mensagem (To + Cc + Cco): sem envio em massa
    maxMensagemBytes: 196608,       // mensagem MIME completa (já codificada)
    maxAssunto: 300, maxTexto: 100000, maxReferencias: 10, maxEndereco: 254,
  }),
});
