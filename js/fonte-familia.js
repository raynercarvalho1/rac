/* Dia a Dia RAC — fonte da Família (Fase 2 · A4; contrato em js/fontes.js). Módulo leve, sem tela: a configuração dos integrantes da casa
   (pessoas, animais, veículos e o cofre de documentos), os tipos de registro e o ícone de cada um. Antes morava dentro da tela da Família
   (js/familia.js) e da Agenda (js/sistema.js), e o RAC Hoje lia essas variáveis por dentro; agora a tela da Família, a Agenda, o Painel e o
   RAC Hoje usam esta mesma configuração, e o RAC Hoje a lê pela fonte "familia" (fonteLer), sem carregar a tela.
   Os valores são os mesmos de antes. Na Fase 4 (Família e Casa) os integrantes passam a vir de uma tabela; quem lê pela fonte não muda. */
  function tipoInfo(k){return TIPOS.concat(TIPOS_VEIC).filter(function(t){return t[0]===k})[0]||TIPOS[TIPOS.length-1]}
  var FAM={eddie:{n:"Eddie",peso:true},olivia:{n:"Olivia",peso:true,bebe:true,
    /* compras do Mercado que também são gastos dela: lata de NAN, fraldas e lenços (entram sozinhas nos Gastos) */
    merc:{termos:["nan","fralda","pampers","huggies","umedec"],re:/(^|[^a-zà-ú])nan([^a-zà-ú]|$)|fralda|pampers|huggies|umedec/i}},
    /* veículos: mesma tabela de registros, outra lista de tipos e outro resumo; aparecem na página Veículos.
       Placa, ano e cor ficam num registro com dados.ficha, na conta, e não aqui no código (o repositório é público) */
    civic:{n:"Civic",veic:true,root:"veiculos-view",desc:"Honda Civic"},
    moto:{n:"Moto",veic:true,root:"veiculos-view",desc:"Yamaha NMax"},
    c3:{n:"C3 (antigo)",veic:true,root:"veiculos-view",desc:"Citroën C3"},
    /* cofre de documentos da casa: mesmo motor, com validade ("Vence em") que entra na Agenda */
    docs:{n:"Documentos",docs:true,root:"documentos-view"}};
  var TIPOS_DOCS=[["identidade","Documento pessoal","Ex.: CNH do Rayner","Número (opcional)"],["garantia","Garantia","Ex.: Geladeira Brastemp","Loja"],["nota","Nota fiscal","Ex.: Notebook","Loja"],
    ["contrato","Contrato","Ex.: Aluguel","Com quem"],["apolice","Apólice e plano","Ex.: Plano de saúde","Empresa"],["imposto","Impostos e taxas","Ex.: IPTU 2027",""],["outro","Outro","",""]];
  var TIPOS_VEIC=[["revisao","Revisão","Ex.: Revisão de 70.000 km","Oficina"],["oleo","Troca de óleo","Ex.: Troca de óleo e filtro","Oficina"],["manutencao","Manutenção","Ex.: Troca de pastilhas","Oficina"],
    ["abastecimento","Abastecimento","Ex.: Etanol","Posto"],["seguro","Seguro","Ex.: Seguro Allianz 2026","Seguradora"],["documento","Licenciamento e impostos","Ex.: Licenciamento 2026",""],
    ["bateria","Bateria","Ex.: Bateria Moura","Loja"],["pneu","Pneus","Ex.: 4 pneus novos","Loja"],["outro","Outro","",""]];
  var TIPOS=[["exame","Exame","Ex.: Hemograma completo","Resultado"],["consulta","Consulta","Ex.: Consulta de rotina","Profissional"],["tratamento","Receita / tratamento","Ex.: Receita da endocrinologista","Profissional"],
    ["sintoma","Sintomas","Ex.: Diarreia e vômito",""],["vacina","Vacina","Ex.: V10, Antirrábica, Hepatite B","Dose"],["preventivo","Antipulgas / vermífugo","Ex.: Bravecto","Produto"],
    ["peso","Peso","Ex.: Pesagem","Peso (kg)"],["alimentacao","Alimentação","Ex.: Troca de ração","Ração"],["pedido","Pedido de exames","Ex.: Exames de controle",""],["diario","Diário (mamadas e fraldas)","Ex.: Diário da semana",""],["produto","Fraldas e produtos","Ex.: Pacote de fraldas","Marca"],
    ["momento","Momento","Ex.: Primeiro passeio na praia","Onde"],["carta","Carta para o futuro","Ex.: Para você ler aos 18 anos","Abrir em"],["midia","Fotos e vídeos","Ex.: Fotos do aniversário",""],
    ["nascimento","Nascimento","Ex.: Nascimento","Onde"],["outro","Outro","",""]];
  /* a área de cada item aparece só como ícone (o título fica curto e cabe no celular); "pre" é a área por extenso, usada no briefing falado */
  var AGENDA_ICO={eddie:"🐶",olivia:"👶",civic:"🚗",moto:"🛵",c3:"🚙",docs:"📄"};
  /* a fonte: {v:{integrantes:[{k, n, tipo, antigo, ico}]}} (NUCLEO.famIntegrantes), vinda da configuração acima */
  fonteRegistrar("familia",function(){var l=NUCLEO.famIntegrantes(FAM,AGENDA_ICO);return {v:{integrantes:l},vazio:!l.length,origem:"configuração do site"}});
