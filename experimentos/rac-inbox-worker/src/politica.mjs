// RAC Inbox · Worker de PRODUTO (P7/I2): política fixa, não sensível. Nada aqui depende de variável, de secret ou do que o cliente disser.
// O Worker só faz TRANSPORTE IMAP SOMENTE LEITURA para a função "rac-inbox" do Supabase (docs/inbox.md, seção "Canal assinado com o Worker").
// Quem chama é autenticado por ASSINATURA HMAC (canal.mjs), nunca por token do usuário; o navegador nunca fala com este Worker.

export const POLITICA = Object.freeze({
  // canal assinado: versão do protocolo, janela de tempo e retenção do registro de nonces (≥ 2 janelas: um nonce nunca volta dentro da validade)
  canal: Object.freeze({ versao: "rac-canal-v1", caminho: "/v1/op", janelaS: 60, nonceRetencaoS: 600, corpoMaxBytes: 4096, chavesAceitas: Object.freeze(["k1", "k2"]) }),
  // operações aceitas (lista fechada); todas só LEEM
  operacoes: Object.freeze(["testar_conta", "listar_pastas", "estado_pasta", "listar_mensagens", "ler_mensagem", "baixar_anexo"]),
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
});
