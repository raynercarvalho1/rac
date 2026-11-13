/* Dia a Dia RAC — fonte do MBA (Fase 2 · A4; contrato em js/fontes.js). Módulo leve, sem tela: aulas (com o link), avaliações e parcelas,
   lidas de PESSOAL.mba, PESSOAL.mbaLinks e PESSOAL.mbaFeito (a conta do dono) e normalizadas no núcleo (NUCLEO.mbaAulasDe, mbaAvalsDe e
   mbaFinDe, as mesmas regras que a tela do MBA usa). O RAC Hoje e a Agenda leem por aqui, sem carregar a tela do MBA (js/mba.js). */
  function fonteMbaDados(){var f=PESSOAL.mbaFeito||{},hoje=hojeISO();
    return {aulas:NUCLEO.mbaAulasDe(PESSOAL.mba,PESSOAL.mbaLinks),avals:NUCLEO.mbaAvalsDe(PESSOAL.mba,f,hoje),fin:NUCLEO.mbaFinDe(PESSOAL.mba,f,hoje)}}
  /* a fonte: {v:{aulas, avals, fin}} (todas as aulas e avaliações; fin = parcelas ou nada); vazio = sem aula, sem avaliação e sem financeiro */
  fonteRegistrar("mba",function(){var d=fonteMbaDados();return {v:d,vazio:!d.aulas.length&&!d.avals.length&&!d.fin,origem:"memória do site"}});
