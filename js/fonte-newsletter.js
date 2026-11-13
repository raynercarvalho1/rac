/* Dia a Dia RAC — fonte da Newsletter (Fase 2 · A4; contrato em js/fontes.js). Módulo leve, sem tela: a edição do dia montada em memória
   (NUCLEO.nlEdicao) a partir do newsletter.json. Só lê: não abre a aba Hoje da Newsletter (ela grava a edição no histórico) nem chama a IA.
   Memória compartilhada: quando a tela da Newsletter (js/newsletter.js) já leu o arquivo, ela guarda aqui (fonteNewsletterGuardar) e quem lê
   pela fonte reaproveita ("memória do site"); senão, lê o arquivo, que o service worker entrega na hora ("arquivo do site"). */
  var NL_FONTE={dados:null};
  function fonteNewsletterGuardar(d){NL_FONTE.dados=d||null}
  /* a fonte: {v: a edição (NUCLEO.nlEdicao: destaques…)}, quando = a coleta do robô; vazio = nenhum destaque */
  fonteRegistrar("newsletter",function(){var mem=NL_FONTE.dados,d0=mem?Promise.resolve(mem):getJson("newsletter.json?v="+Math.floor(Date.now()/6e5));
    return d0.then(function(d){var c=NUCLEO.nlEdicao(d,PESSOAL.newsletter,Date.now());
      return {v:c,vazio:!(c.destaques||[]).length,quando:d.coletado||null,origem:mem?"memória do site":"arquivo do site"}})});
