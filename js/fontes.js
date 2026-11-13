/* Dia a Dia RAC — contrato de fontes (Fase 2 · A4; docs/planejamento/02-auditoria-arquitetural.md, seção 8). Módulo leve, carregado sob
   demanda (MOD_DEPS). Os agregadores (o RAC Hoje e, depois, Agenda, Painel e Monitor) leem os dados de outros domínios por aqui, nunca
   pelas variáveis internas das telas. Cada domínio registra a sua fonte num arquivo leve, sem tela: js/fonte-<domínio>.js (consulta +
   normalização). Hoje: newsletter, familia, mba e agenda.
     fonteRegistrar(nome, ler)  ler(contexto) devolve (ou promete) {v, vazio, quando, ultimo, origem, nota?, parcial?, falhas?}, ou lança o erro
     fonteLer(nome, contexto)   promete SEMPRE o contrato: {ok:true, v, vazio, quando, ultimo, origem, nota, parcial, falhas} ou {ok:false, erro}
     fonteOuErro(nome, ...)     o mesmo contrato, mas a falha vira promessa rejeitada (para quem já trata erro assim, como o RAC Hoje)
   Significado (o mesmo de docs/hoje.md): quando = a data que a própria fonte informa; ultimo = a data do registro mais recente (não é "data
   de atualização"); origem = de onde veio a leitura ("banco", "memória do site", "arquivo do site", "configuração do site"…); vazio = leu
   tudo e não há dado (ausência não é falha); parcial = parte da leitura falhou e o resto continua utilizável (falhas diz o quê). */
  var FONTES={};
  function fonteRegistrar(nome,ler){FONTES[nome]=ler}
  function fonteLer(nome,contexto){
    return Promise.resolve().then(function(){var ler=FONTES[nome];if(!ler)throw new Error("fonte desconhecida: "+nome);return ler(contexto||{})})
      .then(NUCLEO.fonteContrato,function(e){return {ok:false,erro:e&&e.message||String(e)}})}
  function fonteOuErro(nome,contexto){return fonteLer(nome,contexto).then(function(c){if(!c.ok)throw new Error(c.erro);return c})}
