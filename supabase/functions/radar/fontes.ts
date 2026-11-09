// Radar de Preços: inventário das fontes de preço (docs/radar-fontes.md), conferido em 09/11/2026 com o próprio código do Radar (robots.txt + leitura permitida, um pedido por endereço).
// É DADO, não promessa: cada linha diz o que foi testado, o que funcionou, o que depende de credencial e o que está bloqueado. O coletor genérico só lê lojas que o dono cadastrou e liberou,
// e nunca lê uma fonte classificada como "bloqueada". Testado em tests/radar_lote3.test.mjs (e a tela repete a lista dos domínios bloqueados, com teste de igualdade).

export type Classe = "dados_estruturados" | "api_oficial_credencial" | "sem_evidencia" | "bloqueada" | "nao_permitida";
export type Fonte = {
  id: string; nome: string; dominios: string[]; classe: Classe;
  metodo: string; credencial: boolean; frequenciaHoras: number | null; limites: string;
  status: "funciona" | "pronto_nao_validado" | "depende_de_credencial" | "bloqueada" | "sem_teste_de_produto";
  testadoEm: string; evidencia: string; motivo?: string;
};

const DATA = "2026-11-09";
export const FONTES: Fonte[] = [
  { id: "kabum", nome: "KaBuM", dominios: ["kabum.com.br"], classe: "dados_estruturados", metodo: "Página de produto: JSON-LD (schema.org Product/Offer)", credencial: false, frequenciaHoras: 12,
    limites: "robots.txt barra carrinho, conta, busca com parâmetros e ordenações; páginas /produto/ liberadas. Sem limite publicado: 1 pedido por vez, 5 s de intervalo.", status: "funciona", testadoEm: DATA,
    evidencia: "2 páginas de produto lidas com o código do Radar (robots permitido): nome, marca, preço em BRL e disponibilidade em json-ld. Sem GTIN, modelo ou vendedor na página." },
  { id: "fastshop", nome: "Fast Shop", dominios: ["fastshop.com.br"], classe: "dados_estruturados", metodo: "Página de produto (site.fastshop.com.br/.../p): JSON-LD", credencial: false, frequenciaHoras: 12,
    limites: "robots.txt só barra checkout; a home chegou a responder 503 do anti-robô numa tentativa anterior (09/11/2026) e abriu normalmente na seguinte: tratar 503 como 'parar', nunca insistir.", status: "funciona", testadoEm: DATA,
    evidencia: "2 páginas de produto lidas: nome, marca, GTIN válido, preço em BRL e disponibilidade em json-ld. O preço do json-ld pode diferir do preço Pix da vitrine: modalidade fica sempre para o dono confirmar." },
  { id: "americanas", nome: "Americanas", dominios: ["americanas.com.br"], classe: "sem_evidencia", metodo: "Página de produto: JSON-LD (esperado)", credencial: false, frequenciaHoras: 12,
    limites: "robots.txt permite o site com restrições de conta, carrinho e busca.", status: "sem_teste_de_produto", testadoEm: DATA,
    evidencia: "Home e páginas de categoria abrem, mas não trazem preço de produto nos dados estruturados. Nenhuma URL de produto foi encontrada para testar: sem evidência de que a coleta funcione.", motivo: "falta uma URL de produto real para validar" },
  { id: "pichau", nome: "Pichau", dominios: ["pichau.com.br"], classe: "bloqueada", metodo: "—", credencial: false, frequenciaHoras: null, limites: "—", status: "bloqueada", testadoEm: DATA,
    evidencia: "A home respondeu 403 ao leitor identificado do Radar.", motivo: "a loja recusa leitura automática; não se contorna" },
  { id: "magalu", nome: "Magazine Luiza", dominios: ["magazineluiza.com.br"], classe: "bloqueada", metodo: "—", credencial: false, frequenciaHoras: null, limites: "—", status: "bloqueada", testadoEm: DATA,
    evidencia: "O robots.txt respondeu 403: sem conseguir conferir as regras, a página não é lida.", motivo: "robots.txt inacessível (403)" },
  { id: "casasbahia", nome: "Casas Bahia", dominios: ["casasbahia.com.br"], classe: "bloqueada", metodo: "—", credencial: false, frequenciaHoras: null, limites: "—", status: "bloqueada", testadoEm: DATA,
    evidencia: "O robots.txt respondeu 403.", motivo: "robots.txt inacessível (403)" },
  { id: "terabyte", nome: "Terabyte", dominios: ["terabyteshop.com.br"], classe: "bloqueada", metodo: "—", credencial: false, frequenciaHoras: null, limites: "—", status: "bloqueada", testadoEm: DATA,
    evidencia: "O robots.txt respondeu 403.", motivo: "robots.txt inacessível (403)" },
  { id: "mercadolivre", nome: "Mercado Livre", dominios: ["mercadolivre.com.br", "mercadolibre.com", "produto.mercadolivre.com.br"], classe: "api_oficial_credencial", metodo: "API oficial GET /items/{id} com Authorization: Bearer", credencial: true, frequenciaHoras: 12,
    limites: "Token de 6 h; refresh token de uso único e rotativo; limite por aplicativo (ex.: 18.000 requisições/hora na documentação). O robots.txt do site barra agentes de IA: nada de ler páginas.", status: "depende_de_credencial", testadoEm: DATA,
    evidencia: "Sem token, /items, /sites/MLB/search e /products/search respondem 403 (PolicyAgent). A documentação oficial confirma o token. O mapeamento da resposta está pronto e testado só com dados fictícios no formato da documentação.",
    motivo: "o dono precisa criar um aplicativo no portal de desenvolvedores e autorizar; o ciclo OAuth (authorization_code + refresh rotativo) ainda não existe" },
  { id: "amazon", nome: "Amazon", dominios: ["amazon.com.br", "a.co"], classe: "nao_permitida", metodo: "—", credencial: false, frequenciaHoras: null, limites: "—", status: "bloqueada", testadoEm: "não testada",
    evidencia: "Não foi testada nesta auditoria. Os termos e o robots.txt da Amazon restringem coleta automática (auditoria anterior); a alternativa legítima é a API de afiliados (credencial).", motivo: "coleta automática não permitida; só API oficial com credencial" },
];

const norm = (h: string) => h.toLowerCase().replace(/^www\./, "");
export function fonteDoDominio(host: string): Fonte | null {
  const h = norm(host || "");
  return FONTES.find((f) => f.dominios.some((d) => h === d || h.endsWith("." + d))) ?? null;
}
/* a coleta automática genérica nunca roda para estas classes */
export const coletaGenericaBarrada = (host: string): boolean => { const f = fonteDoDominio(host); return !!f && ["bloqueada", "nao_permitida", "api_oficial_credencial"].includes(f.classe); };
export const DOMINIOS_BARRADOS: string[] = FONTES.filter((f) => ["bloqueada", "nao_permitida", "api_oficial_credencial"].includes(f.classe)).flatMap((f) => f.dominios).sort();
