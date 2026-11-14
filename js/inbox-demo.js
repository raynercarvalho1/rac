/* Dia a Dia RAC — módulo carregado SÓ quando o dono pede "Ver exemplo da interface" (RAC Inbox · I1; docs/inbox.md).
   DEMONSTRAÇÃO: remetentes, endereços (domínio example.com, reservado para exemplo), assuntos, textos e anexos abaixo são FICTÍCIOS, escritos à mão para mostrar o desenho
   da lista e da leitura. Não vêm de nenhuma caixa, nunca são gravados (nada aqui toca o banco, o serviço ou o armazenamento do aparelho) e a tela os rotula como exemplo o tempo todo.
   Fica num arquivo à parte justamente para nunca se misturar com mensagem real: a lista real (etapa I2) não importa nada daqui. As datas são relativas a "agora". */
  var INBOX_DEMO_AGORA=Date.now();
  function inboxDemoQuando(minAtras){return new Date(INBOX_DEMO_AGORA-minAtras*60000).toISOString()}
  var INBOX_DEMO=[
    {id:"demo-1",conta_id:"demo",remetente:"Equipe Exemplo",endereco:"equipe@example.com",assunto:"Bem-vindo ao exemplo do RAC Inbox",previa:"Esta é uma mensagem de demonstração para mostrar como a lista e a leitura vão ficar.",recebida:inboxDemoQuando(25),lida:false,anexo:false,
      corpo:["Olá!","Esta é uma mensagem de demonstração, escrita à mão, para você avaliar o desenho da lista e do painel de leitura. Ela não veio de nenhuma caixa de e-mail.","Quando a leitura de mensagens existir (etapa I2), aqui aparecerá o texto real da mensagem selecionada, com remetente, horário e anexos."],anexos:[]},
    {id:"demo-2",conta_id:"demo",remetente:"Loja Exemplo",endereco:"pedidos@example.com",assunto:"Seu pedido de exemplo saiu para entrega",previa:"Pedido fictício nº 0000. A entrega de demonstração está prevista para hoje.",recebida:inboxDemoQuando(190),lida:false,anexo:true,
      corpo:["Seu pedido fictício saiu para entrega.","Nenhum pedido real existe: este texto serve só para mostrar uma mensagem com anexo."],anexos:["comprovante-exemplo.pdf"]},
    {id:"demo-3",conta_id:"demo",remetente:"Maria Exemplo",endereco:"maria@example.com",assunto:"Jantar de sexta (exemplo)",previa:"Combinado! Reservei a mesa de demonstração para as 20h. Me avise se mudar algo.",recebida:inboxDemoQuando(60*20),lida:true,anexo:false,
      corpo:["Combinado! Reservei a mesa de demonstração para as 20h.","Me avise se mudar algo."],anexos:[]},
    {id:"demo-4",conta_id:"demo",remetente:"Boletim Exemplo",endereco:"boletim@example.com",assunto:"Resumo da semana (newsletter de exemplo)",previa:"Cinco destaques inventados para ilustrar uma mensagem longa de newsletter.",recebida:inboxDemoQuando(60*50),lida:true,anexo:false,
      corpo:["Cinco destaques inventados para ilustrar uma newsletter.","Nada aqui é notícia real."],anexos:[]},
    {id:"demo-5",conta_id:"demo",remetente:"Banco Exemplo",endereco:"avisos@example.com",assunto:"Fatura de demonstração disponível",previa:"A fatura fictícia do mês já está disponível. Este é só um exemplo de aviso.",recebida:inboxDemoQuando(60*24*4),lida:true,anexo:true,
      corpo:["A fatura fictícia do mês já está disponível.","Este é só um exemplo de aviso financeiro, sem valores reais."],anexos:["fatura-exemplo.pdf","extrato-exemplo.pdf"]}];
