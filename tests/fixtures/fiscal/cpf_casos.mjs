// Dados FICTÍCIOS de CPF para os testes da Central Fiscal, GERADOS EM MEMÓRIA a cada execução: nenhum CPF (formatado ou não) fica escrito no repositório.
// Só existem aqui as BASES de 9 dígitos (inventadas); os dois dígitos verificadores são calculados na hora, com uma implementação própria deste arquivo
// (independente da do nucleo.js e da do SQL, para a paridade entre as três ter valor).
export const BASES = { A: "529982247", B: "111444777", C: "123456789", IGUAIS: "111111111", ZEROS: "000000000" };

/* CPF válido a partir da base de 9 dígitos */
export function cpfDe(base9) {
  const d = String(base9).split("").map(Number);
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(9)); d.push(dv(10));
  return d.join("");
}
/* pontuado = AAA.BBB.CCC-DD · espacos = AAA BBB CCC DD · puro = 11 dígitos */
export function formatar(cpf, formato = "puro") {
  if (formato === "pontuado") return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  if (formato === "espacos") return `${cpf.slice(0, 3)} ${cpf.slice(3, 6)} ${cpf.slice(6, 9)} ${cpf.slice(9)}`;
  return cpf;
}
/* estraga o 1º ("dv1") ou o 2º ("dv2") dígito verificador */
export function corromper(cpf, qual) { const i = qual === "dv1" ? 9 : 10; return cpf.slice(0, i) + ((+cpf[i] + 1) % 10) + cpf.slice(i + 1); }
const c = (base, formato = "puro", estrago) => formatar(estrago ? corromper(cpfDe(base), estrago) : cpfDe(base), formato);
const { A, B, C, IGUAIS, ZEROS } = BASES;

/* a mesma bateria de 25 casos rodada em produção (só leitura) antes da migration 034, em JavaScript e no SQL */
export const CASOS = [
  { id: 1, descricao: "válido pontuado", t: c(A, "pontuado"), esperado: true, qtd_validos: 1 },
  { id: 2, descricao: "válido sem pontuação", t: c(A), esperado: true, qtd_validos: 1 },
  { id: 3, descricao: "válido com espaços", t: c(A, "espacos"), esperado: true, qtd_validos: 1 },
  { id: 4, descricao: "válido dentro de frase", t: `CPF do consumidor: ${c(A, "pontuado")}.`, esperado: true, qtd_validos: 1 },
  { id: 5, descricao: "válido, 1º dígito = 0 (resto 1)", t: c(C, "pontuado"), esperado: true, qtd_validos: 1 },
  { id: 6, descricao: "válido (outro)", t: c(B, "pontuado"), esperado: true, qtd_validos: 1 },
  { id: 7, descricao: "1º dígito verificador errado", t: c(A, "pontuado", "dv1"), esperado: false, qtd_validos: 0 },
  { id: 8, descricao: "2º dígito verificador errado", t: c(A, "pontuado", "dv2"), esperado: false, qtd_validos: 0 },
  { id: 9, descricao: "dígitos verificadores inválidos, sem pontos", t: c(A, "puro", "dv2"), esperado: false, qtd_validos: 0 },
  { id: 10, descricao: "11 dígitos iguais, pontuado", t: c(IGUAIS, "pontuado"), esperado: false, qtd_validos: 0 },
  { id: 11, descricao: "11 zeros", t: c(ZEROS), esperado: false, qtd_validos: 0 },
  { id: 12, descricao: "EAN-13", t: "7891000457368", esperado: false, qtd_validos: 0 },
  { id: 13, descricao: "CPF válido dentro de 13 dígitos", t: c(A) + "12", esperado: false, qtd_validos: 0 },
  { id: 14, descricao: "código de 14 dígitos", t: "03000011399244", esperado: false, qtd_validos: 0 },
  { id: 15, descricao: "CNPJ formatado", t: "11.222.333/0001-81", esperado: false, qtd_validos: 0 },
  { id: 16, descricao: "CNPJ sem pontuação", t: "11222333000181", esperado: false, qtd_validos: 0 },
  { id: 17, descricao: "chave de acesso de 44 dígitos", t: "35261011222333000181550010000123451876543218", esperado: false, qtd_validos: 0 },
  { id: 18, descricao: "chave de acesso em grupos de 4", t: "3526 1011 2223 3300 0181 5500 1000 0123 4518 7654 3218", esperado: false, qtd_validos: 0 },
  { id: 19, descricao: "dois CPFs válidos separados por espaço, pontuados", t: `${c(A, "pontuado")} ${c(B, "pontuado")}`, esperado: true, qtd_validos: 2 },
  { id: 20, descricao: "dois CPFs válidos separados por espaço, sem pontos", t: `${c(A)} ${c(B)}`, esperado: true, qtd_validos: 2 },
  { id: 21, descricao: "um válido e um inválido separados por espaço", t: `${c(A)} ${c(A, "puro", "dv2")}`, esperado: true, qtd_validos: 1 },
  { id: 22, descricao: "CPF colado em letras", t: `CPF${c(A)}X`, esperado: true, qtd_validos: 1 },
  { id: 23, descricao: "decimal parecido com CPF (DV não fecha)", t: "123456789.01", esperado: false, qtd_validos: 0 },
  { id: 24, descricao: "texto vazio", t: "", esperado: false, qtd_validos: 0 },
  { id: 25, descricao: "nulo", t: null, esperado: false, qtd_validos: 0 },
];
