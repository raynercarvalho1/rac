// Política de confiança do Worker da POC autenticada iCloud (arquitetura S3, OIDC do GitHub Actions).
// Tudo aqui é fixo no código e NÃO sensível: nada depende de variável, secret ou do que o token disser sobre si mesmo.
// Qualquer mudança (branch, workflow, operação) é uma decisão explícita, revisada e testada.

export const POLITICA = Object.freeze({
  // emissor e descoberta: fixos; o JWKS é lido do documento de descoberta DESTE emissor, nunca de URL indicada pelo JWT
  issuer: "https://token.actions.githubusercontent.com",
  descobertaUrl: "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
  algoritmo: "RS256",

  // audiência personalizada, uma por operação autorizada (o token só serve para a operação que pediu)
  audienciaPrefixo: "rac-inbox-icloud-poc:",
  operacoes: Object.freeze(["validar_oidc"]),

  // identidade do repositório (dados públicos)
  repository: "raynercarvalho1/rac",
  repositoryId: "1431652822",
  repositoryOwner: "raynercarvalho1",
  repositoryOwnerId: "321901681",

  // contexto do job: Environment, branch, evento e workflow autorizados
  environment: "icloud-auth-poc",
  // o repositório foi criado depois de 15/07/2026, então o esperado é o formato imutável do sub;
  // o formato clássico também é aceito por ser o outro formato documentado. Os dois são exatos (sem curinga).
  subsPermitidos: Object.freeze([
    "repo:raynercarvalho1@321901681/rac@1431652822:environment:icloud-auth-poc",
    "repo:raynercarvalho1/rac:environment:icloud-auth-poc",
  ]),
  // Desenho B: o workflow privilegiado existe só na main e os Environments aceitam só a main. Um token de qualquer outra ref (inclusive a
  // branch da POC, PRs e tags) é recusado, e o workflow_ref esperado é o arquivo na main.
  refsPermitidos: Object.freeze(["refs/heads/main"]),
  eventosPermitidos: Object.freeze(["workflow_dispatch"]),
  arquivoWorkflow: ".github/workflows/icloud-auth-probe.yml",
  runnerEnvironment: "github-hosted",

  // tempo: tolerância de relógio pequena e idade máxima própria (o exemplo oficial do GitHub tem 300 s entre iat e exp)
  toleranciaRelogioS: 60,
  idadeMaximaS: 600,

  // limites de tamanho
  jwtMaxBytes: 8192,
  corpoMaxBytes: 2048,

  // JWKS: cache em memória do isolate (a Cache API não é confiável em workers.dev).
  // jwksReaproveitarVelhoS é a idade TOTAL máxima (desde a última carga bem-sucedida) até a qual um conjunto vencido ainda é reaproveitado
  // quando o emissor não responde. Valor 0: o cache venceu e o emissor não respondeu, a validação FALHA FECHADA na hora (nunca se usa chave velha).
  // Para este ensaio, sem efeitos, isso é mais simples e seguro do que priorizar disponibilidade (a janela anterior era de 1 h e foi
  // retirada). Reavaliar antes de qualquer operação real sobre a caixa de e-mail; nunca ampliar sem decisão do dono.
  // Mesmo com a janela zerada, uma chave revogada ainda vale até o fim do cache fresco (jwksTtlS).
  jwksTtlS: 600,
  jwksReaproveitarVelhoS: 0,
  jwksRecargaMinimaS: 60,
  jwksTimeoutMs: 5000,
  jwksMaxBytes: 65536,
  rsaMinimoBytes: 256,
});

export function audienciasPermitidas(politica = POLITICA) {
  return politica.operacoes.map((op) => politica.audienciaPrefixo + op);
}

export function workflowRefEsperado(ref, politica = POLITICA) {
  return politica.repository + "/" + politica.arquivoWorkflow + "@" + ref;
}

// Motivos específicos e SEGUROS das falhas na obtenção das chaves (lista fechada, só constantes: nunca texto de erro, URL, JWT, claim ou
// corpo recebido). Aparecem na resposta como "detalhe" quando o motivo é jwks_indisponivel, para saber QUAL etapa falhou.
export const DETALHES_JWKS = Object.freeze([
  "discovery_timeout", "discovery_fetch_erro", "discovery_redirect", "discovery_http_erro", "discovery_grande_demais",
  "discovery_json_invalido", "discovery_emissor_invalido", "discovery_jwks_uri_invalido",
  "jwks_timeout", "jwks_fetch_erro", "jwks_redirect", "jwks_http_erro", "jwks_grande_demais",
  "jwks_json_invalido", "jwks_sem_chave_valida",
]);
