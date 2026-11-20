/* Dia a Dia RAC — módulo carregado quando a seção abre. RAC Knowledge (#conhecimento, docs/conhecimento.md): a memória técnica do projeto (regras, decisões, erros e soluções,
   procedimentos, estado e diário), só do dono. Lê e grava as tabelas conhecimento e conhecimento_historico (supabase/062) pelo cliente do site (RLS + MFA); nenhuma chave
   de servidor, nenhuma IA, nenhum endereço externo. As regras (validar, buscar, comparar com o repositório) ficam no núcleo (NUCLEO.kn*). Rotas: #conhecimento (lista),
   #conhecimento/novo, #conhecimento/erro-rapido, #conhecimento/sincronizar, #conhecimento/<id>, #conhecimento/<id>/editar, #conhecimento/<id>/historico.
   O que o agente escreve chega aqui pelo repositório (docs/conhecimento/indice.json) e só entra no banco com o toque do dono em "Sincronizar". */
  var KC={D:null,H:null,quando:0,filtro:{q:"",tipo:"",categoria:"",tag:"",estado:"vigentes"},raiz:null,seq:0};
  var KC_COLUNAS="id,tipo,titulo,conteudo,motivo,causa,solucao,prevencao,categoria,tags,estado,origem,relacionados,data_ref,ref_externa,origem_hash,editado_no_site,versao,criado_em,atualizado_em";
  var KC_COR={regra:"var(--c-esportes)",decisao:"var(--c-inicio)",erro:"var(--bad)",procedimento:"var(--c-mercado)",estado:"var(--warn)",diario:"var(--c-embreve)"};
  function kcData(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—"}
  function kcQuando(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}
  function kcNome(tipo){var t=NUCLEO.knTipo(tipo);return t?t.um:tipo}
  function kcRotuloEstado(e){var x=NUCLEO.knEstado(e);return x?x.nome:e}
  function kcSelo(txt,cor){return h("span",{class:"hjtag",style:cor?"border-color:"+cor+";color:"+cor:null,text:txt})}
  function kcPorId(id){var r=null;(KC.D||[]).forEach(function(x){if(x.id===id)r=x});return r}
  function kcUuid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
    var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var s=[].map.call(b,function(x){return ("0"+x.toString(16)).slice(-2)}).join("");
    return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20)}
  /* copiar para a área de transferência (iPhone: precisa de um toque do usuário, que é o caso); sem permissão, mostra o texto numa caixa para copiar à mão */
  function kcCopiar(texto,aviso){
    function caixa(){var ta=h("textarea",{class:"kn-copia",readonly:"readonly",rows:"8"});ta.value=texto;aviso.innerHTML="";aviso.appendChild(h("span",{text:"Não consegui copiar sozinho: selecione o texto abaixo e copie."}));aviso.appendChild(ta);ta.focus();ta.select()}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(texto).then(function(){aviso.textContent="Copiado ✓ Cole na conversa com o agente."},caixa);else caixa()}
  function kcLer(){return RACdados.paginar(function(de){return SB.from("conhecimento").select(KC_COLUNAS).order("atualizado_em",{ascending:false}).order("id",{ascending:true}).range(de,de+RACdados.PAGINA-1)})}
  function kcCarregar(forcar){
    if(KC.D&&!forcar&&Date.now()-KC.quando<60000)return Promise.resolve(KC.D);
    return kcLer().then(function(l){KC.D=l;KC.quando=Date.now();return l})}

  function renderConhecimento(a,b){var root=$("#conhecimento-view");KC.raiz=root;root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O RAC Knowledge é só da conta do dono."})));return}
    var seq=++KC.seq,corpo=h("div",{class:"stack"});root.appendChild(corpo);corpo.appendChild(h("div",{class:"panel"},loading()));
    kcCarregar(false).then(function(){if(seq!==KC.seq)return;corpo.innerHTML="";
      if(a==="novo")kcForm(corpo,null,"novo");else if(a==="erro-rapido")kcForm(corpo,null,"erro");else if(a==="sincronizar")kcSincronizar(corpo);
      else if(a){var r=kcPorId(a);if(!r){corpo.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Não achei este registro (pode ter sido arquivado em outra tela)."}),h("a",{class:"ghostbtn",href:"#conhecimento",text:"Voltar à lista"})));return}
        if(b==="editar")kcForm(corpo,r,"editar");else if(b==="historico")kcHistorico(corpo,r);else kcDetalhe(corpo,r)}
      else kcLista(corpo)})
    .catch(function(e){if(seq!==KC.seq)return;corpo.innerHTML="";var f=failed(function(){renderConhecimento(a,b)},e);corpo.appendChild(h("div",{class:"panel"},f,
      /42P01|PGRST205|does not exist|schema cache|could not find the table/i.test(String(e&&e.message))?h("p",{class:"sub",text:"A tabela ainda não existe: falta aplicar a migration supabase/062_conhecimento.sql (o dono roda no SQL Editor)."}):null));logErro("conhecimento",e)})}

  /* ---------- lista ---------- */
  function kcLista(corpo){var F=KC.filtro,D=KC.D,lista;
    var topo=panel("RAC Knowledge","Memória técnica do projeto: o que vale sempre, o que foi decidido, o que deu errado e como fazer certo.");
    var busca=h("input",{type:"search",class:"kn-busca",placeholder:"Buscar (título, texto, tag…)","aria-label":"Buscar no RAC Knowledge",autocomplete:"off",autocapitalize:"off"});busca.value=F.q;
    var acoes=h("div",{class:"kn-acoes"},h("a",{class:"ghostbtn kn-primario",href:"#conhecimento/novo",text:"+ Novo registro"}),h("a",{class:"ghostbtn",href:"#conhecimento/erro-rapido",text:"⚡ Erro e solução"}),
      h("a",{class:"ghostbtn",href:"#conhecimento/sincronizar",text:"⇄ Repositório"}));
    var aviso=h("p",{class:"sub",role:"status"});
    var res=h("button",{type:"button",class:"ghostbtn",text:"Copiar resumo para o agente"});res.onclick=function(){kcCopiar(NUCLEO.knResumoAgente(D),aviso)};
    var rel=h("button",{type:"button",class:"ghostbtn",text:"↻"});rel.setAttribute("aria-label","Atualizar");rel.onclick=function(){KC.quando=0;renderConhecimento()};
    var pills=h("div",{class:"kn-pills",role:"group","aria-label":"Tipo"}),filtros=h("div",{class:"kn-filtros"}),listaEl=h("div",{class:"kn-lista"});
    topo.appendChild(busca);topo.appendChild(acoes);topo.appendChild(h("div",{class:"kn-acoes"},res,rel));topo.appendChild(aviso);corpo.appendChild(topo);
    var pn=h("div",{class:"panel"});pn.appendChild(pills);pn.appendChild(filtros);pn.appendChild(listaEl);corpo.appendChild(pn);
    function desenhar(){
      lista=NUCLEO.knBusca(D,{q:F.q,tipo:F.tipo,categoria:F.categoria,tag:F.tag,estado:F.estado});
      var base=NUCLEO.knBusca(D,{q:F.q,categoria:F.categoria,tag:F.tag,estado:F.estado});
      pills.innerHTML="";
      function pill(k,rot){var n=k?base.filter(function(x){return x.tipo===k}).length:base.length,bt=h("button",{type:"button",class:"kn-pill"+(F.tipo===k?" on":""),text:rot+" ("+n+")"});bt.setAttribute("aria-pressed",F.tipo===k?"true":"false");bt.onclick=function(){F.tipo=k;desenhar()};pills.appendChild(bt)}
      pill("","Todos");NUCLEO.KN_TIPOS.forEach(function(t){pill(t.k,t.nome)});
      var fa=NUCLEO.knFacetas(D);filtros.innerHTML="";
      function sel(rot,val,ops,set){var s=h("select",{"aria-label":rot},h("option",{value:"",text:rot}),ops.map(function(o){return h("option",{value:o.k,text:o.rot||o.k})}));s.value=val;s.onchange=function(){set(s.value);desenhar()};filtros.appendChild(s)}
      sel("Categoria",F.categoria,fa.categorias.map(function(x){return {k:x.k,rot:x.k+" ("+x.n+")"}}),function(v){F.categoria=v});
      sel("Tag",F.tag,fa.tags.map(function(x){return {k:x.k,rot:x.k+" ("+x.n+")"}}),function(v){F.tag=v});
      var se=h("select",{"aria-label":"Estado"},h("option",{value:"vigentes",text:"Vigentes"}),h("option",{value:"",text:"Todos os estados"}),NUCLEO.KN_ESTADOS.map(function(e){return h("option",{value:e.k,text:e.nome})}));se.value=F.estado;se.onchange=function(){F.estado=se.value;desenhar()};filtros.appendChild(se);
      listaEl.innerHTML="";
      if(!D.length){listaEl.appendChild(h("p",{class:"empty",text:"Ainda não há registros. Toque em “⇄ Repositório” para importar os que o agente deixou em docs/conhecimento, ou em “+ Novo registro”."}));return}
      if(!lista.length){listaEl.appendChild(h("p",{class:"empty",text:"Nada encontrado com estes filtros."}));return}
      lista.forEach(function(r){listaEl.appendChild(kcCartao(r))})}
    busca.oninput=function(){F.q=busca.value;desenhar()};desenhar()}
  function kcResumoTexto(r){var t=r.conteudo||r.solucao||r.motivo||r.causa||"";t=String(t).replace(/\s+/g," ").trim();return t.length>150?t.slice(0,147)+"…":t}
  function kcCartao(r){
    var a=h("a",{class:"kn-item",href:"#conhecimento/"+r.id,style:"border-left-color:"+(KC_COR[r.tipo]||"var(--line)")},
      h("div",{class:"hjmeta"},kcSelo(kcNome(r.tipo),KC_COR[r.tipo]),r.estado!=="ativo"?kcSelo(kcRotuloEstado(r.estado)):null,r.categoria?h("span",{class:"sub",text:r.categoria}):null,h("span",{class:"sub",text:kcData(r.data_ref||r.atualizado_em)})),
      h("b",{class:"kn-tit",text:r.titulo}),kcResumoTexto(r)?h("span",{class:"sub kn-res",text:kcResumoTexto(r)}):null,
      (r.tags||[]).length?h("div",{class:"hjmeta"},r.tags.slice(0,5).map(function(g){return h("span",{class:"hjtag",text:g})})):null);
    return a}

  /* ---------- detalhe ---------- */
  /* appendChild só com nó de verdade (no navegador, appendChild(null) dá erro) */
  function kcPor(pai,no){if(no)pai.appendChild(no)}
  function kcBloco(rot,txt){return txt?h("div",{class:"kn-bloco"},h("h3",{text:rot}),h("p",{class:"kn-texto",text:txt})):null}
  function kcDetalhe(corpo,r){
    var p=panel(r.titulo),aviso=h("p",{class:"sub",role:"status"});
    p.appendChild(h("div",{class:"hjmeta"},kcSelo(kcNome(r.tipo),KC_COR[r.tipo]),kcSelo(kcRotuloEstado(r.estado)),r.categoria?h("span",{class:"sub",text:"Categoria: "+r.categoria}):null));
    p.appendChild(h("p",{class:"sub",text:"Criado em "+kcData(r.criado_em)+" · atualizado em "+kcQuando(r.atualizado_em)+" · versão "+r.versao+(r.data_ref?" · data de referência "+kcData(r.data_ref):"")}));
    kcPor(p,kcBloco("Conteúdo",r.conteudo));kcPor(p,kcBloco("Motivo",r.motivo));kcPor(p,kcBloco("Causa",r.causa));kcPor(p,kcBloco("Solução",r.solucao));kcPor(p,kcBloco("Prevenção",r.prevencao));
    if(r.origem)kcPor(p,kcBloco("Origem / referência técnica",r.origem));
    if((r.tags||[]).length){var tg=h("div",{class:"hjmeta"});r.tags.forEach(function(g){var a=h("a",{class:"hjtag",href:"#conhecimento",text:g});a.onclick=function(){KC.filtro={q:"",tipo:"",categoria:"",tag:g,estado:"vigentes"}};tg.appendChild(a)});p.appendChild(h("div",{class:"kn-bloco"},h("h3",{text:"Tags"}),tg))}
    var rels=(r.relacionados||[]).map(kcPorId).filter(Boolean),inv=(KC.D||[]).filter(function(x){return (x.relacionados||[]).indexOf(r.id)>=0});
    if(rels.length)p.appendChild(h("div",{class:"kn-bloco"},h("h3",{text:"Relacionados"}),rels.map(function(x){return h("a",{class:"kn-rel",href:"#conhecimento/"+x.id,text:kcNome(x.tipo)+" · "+x.titulo})})));
    if(inv.length)p.appendChild(h("div",{class:"kn-bloco"},h("h3",{text:"Citado por"}),inv.map(function(x){return h("a",{class:"kn-rel",href:"#conhecimento/"+x.id,text:kcNome(x.tipo)+" · "+x.titulo})})));
    p.appendChild(h("p",{class:"sub",text:r.ref_externa?(r.editado_no_site?"No repositório como "+r.ref_externa+", com alterações feitas aqui que o arquivo ainda não tem (use ⇄ Repositório → copiar para o agente).":"Espelha o arquivo docs/conhecimento/registros/"+r.ref_externa+".md."):"Só existe aqui, ainda não está no repositório (⇄ Repositório → copiar para o agente)."}));
    var ed=h("a",{class:"ghostbtn kn-primario",href:"#conhecimento/"+r.id+"/editar",text:"Editar"}),hist=h("a",{class:"ghostbtn",href:"#conhecimento/"+r.id+"/historico",text:"Histórico ("+(r.versao-1)+")"}),
      cp=h("button",{type:"button",class:"ghostbtn",text:"Copiar para o agente"}),
      ar=h("button",{type:"button",class:"ghostbtn",text:r.estado==="arquivado"?"Reativar":"Arquivar"});
    cp.onclick=function(){kcCopiar(NUCLEO.knParaArquivo(NUCLEO.knDoBanco(r,KC.D)),aviso)};
    ar.onclick=function(){ar.disabled=true;kcGravar(r.id,{estado:r.estado==="arquivado"?"ativo":"arquivado"}).then(function(){location.hash="#conhecimento/"+r.id;renderConhecimento(r.id)},function(e){ar.disabled=false;aviso.textContent="Não gravei: "+kcErro(e)})};
    p.appendChild(h("div",{class:"kn-acoes"},ed,hist,cp,ar));p.appendChild(aviso);
    p.appendChild(h("div",{class:"kn-acoes"},h("a",{class:"ghostbtn",href:"#conhecimento",text:"← Voltar à lista"})));corpo.appendChild(p)}
  function kcErro(e){var m=String((e&&e.message)||e||"");return /conhecimento_sem_segredos/.test(m)?"o texto parece conter chave, token ou CPF; registre só o fato, nunca o segredo.":m}
  function kcGravar(id,patch){return Promise.resolve().then(function(){return SB.from("conhecimento").update(patch).eq("id",id).select(KC_COLUNAS)}).then(sbOk).then(function(l){KC.quando=0;return l[0]})}

  /* ---------- novo / editar / erro rápido ---------- */
  function kcCampo(rot,el,dica){return h("label",{class:"kn-campo"},h("span",{class:"kn-rot",text:rot}),el,dica?h("span",{class:"sub",text:dica}):null)}
  function kcForm(corpo,r,modo){
    var rapido=modo==="erro",novo=modo!=="editar",R=r||{tipo:rapido?"erro":"regra",estado:rapido?"resolvido":"ativo",tags:[],relacionados:[]};
    var p=panel(rapido?"Erro e solução":novo?"Novo registro":"Editar registro",rapido?"Registro rápido: o que aconteceu, a causa e a correção. O resto é opcional.":"Só o essencial: o que for útil para não repetir o erro ou a decisão."),
      msg=h("p",{class:"qrwarn",role:"alert"}),campos={};
    function txt(k,rot,linhas,dica){var t=h("textarea",{rows:String(linhas),maxlength:k==="conteudo"?"20000":"4000"});t.value=R[k]||"";campos[k]=t;return kcCampo(rot,t,dica)}
    function inp(k,rot,dica,ph){var i=h("input",{type:"text",placeholder:ph||null,autocomplete:"off"});i.value=Array.isArray(R[k])?R[k].join(", "):(R[k]||"");campos[k]=i;return kcCampo(rot,i,dica)}
    var tipoSel=h("select",{"aria-label":"Tipo"},NUCLEO.KN_TIPOS.map(function(t){return h("option",{value:t.k,text:t.um+" — "+t.dica})}));tipoSel.value=R.tipo;campos.tipo=tipoSel;
    var estSel=h("select",{"aria-label":"Estado"},NUCLEO.KN_ESTADOS.map(function(e){return h("option",{value:e.k,text:e.nome})}));estSel.value=R.estado||"ativo";campos.estado=estSel;
    var dl=h("datalist",{id:"kn-cats"},NUCLEO.knFacetas(KC.D).categorias.map(function(c){return h("option",{value:c.k})}));
    var extra=h("div");
    function montarExtra(){extra.innerHTML="";var t=tipoSel.value;
      if(t==="decisao")extra.appendChild(txt("motivo","Por quê (motivo)",3));
      if(t==="erro"){extra.appendChild(txt("causa","Causa-raiz",3));extra.appendChild(txt("solucao","Solução aplicada",3));extra.appendChild(txt("prevencao","Como evitar de novo",2))}}
    p.appendChild(h("div",{class:"kn-form"},
      rapido?null:kcCampo("Tipo",tipoSel),
      inp("titulo","Título",null,rapido?"Ex.: Teste de banco falha sem PGlite":"Frase curta e pesquisável"),
      txt("conteudo",rapido?"O que aconteceu":"Conteúdo",rapido?4:6),extra,
      rapido?null:inp("categoria","Categoria",null,"ex.: banco, ia, codigo"),dl,inp("tags","Tags","Separe por vírgula",rapido?"ex.: teste, pglite":"ex.: migration, rls"),
      rapido?null:kcCampo("Estado",estSel),
      rapido?null:inp("origem","Origem ou referência técnica","Arquivo, PR, commit, migration ou lote","ex.: PR #54, supabase/062_conhecimento.sql")));
    tipoSel.onchange=function(){montarExtra()};montarExtra();
    /* relações: busca por título; toque adiciona; chip remove */
    var rel=(R.relacionados||[]).slice(),relCx=h("div",{class:"hjmeta"}),relBusca=h("input",{type:"search",placeholder:"Buscar registro para relacionar",autocomplete:"off"}),relRes=h("div",{class:"kn-lista"});
    function desRel(){relCx.innerHTML="";rel.forEach(function(id){var x=kcPorId(id);if(!x)return;var bt=h("button",{type:"button",class:"hjtag kn-chip",text:x.titulo.slice(0,40)+" ✕"});bt.setAttribute("aria-label","Remover relação com "+x.titulo);bt.onclick=function(){rel=rel.filter(function(y){return y!==id});desRel()};relCx.appendChild(bt)})}
    relBusca.oninput=function(){relRes.innerHTML="";if(norm(relBusca.value).length<2)return;
      NUCLEO.knBusca(KC.D,{q:relBusca.value}).filter(function(x){return x.id!==R.id&&rel.indexOf(x.id)<0}).slice(0,5).forEach(function(x){var bt=h("button",{type:"button",class:"ghostbtn kn-opcao",text:kcNome(x.tipo)+" · "+x.titulo});bt.onclick=function(){if(rel.length<30)rel.push(x.id);relBusca.value="";relRes.innerHTML="";desRel()};relRes.appendChild(bt)})};
    if(!rapido){p.appendChild(h("div",{class:"kn-campo"},h("label",{text:"Relacionados"}),relCx,relBusca,relRes));desRel()}
    var salvar=h("button",{type:"submit",text:novo?"Salvar":"Salvar alterações"}),cancelar=h("a",{class:"ghostbtn",href:novo?"#conhecimento":"#conhecimento/"+R.id,text:"Cancelar"});
    function ler(){var v={};["tipo","titulo","conteudo","motivo","causa","solucao","prevencao","categoria","tags","estado","origem"].forEach(function(k){if(campos[k])v[k]=campos[k].value});
      if(rapido)v.tipo="erro";v.titulo=String(v.titulo||"").trim();v.tags=NUCLEO.knTags(v.tags);v.categoria=String(v.categoria||"").trim().slice(0,60);
      if(rapido){v.estado=String(v.solucao||"").trim()?"resolvido":"ativo";v.categoria=""}
      if(v.tipo!=="decisao")v.motivo="";if(v.tipo!=="erro"){v.causa="";v.solucao="";v.prevencao=""}
      v.relacionados=rel.slice();return v}
    var f=h("form",{class:"kn-acoes",novalidate:"novalidate"},salvar,cancelar);
    f.onsubmit=function(ev){ev.preventDefault();msg.textContent="";var v=ler(),pr=NUCLEO.knValidar(v);if(pr.length){msg.textContent="⚠ "+pr.join("; ");return}
      salvar.disabled=true;salvar.textContent="Salvando…";
      var linha={tipo:v.tipo,titulo:v.titulo,conteudo:v.conteudo||"",motivo:v.motivo||null,causa:v.causa||null,solucao:v.solucao||null,prevencao:v.prevencao||null,categoria:v.categoria||null,tags:v.tags,estado:v.estado,origem:String(v.origem||"").trim()||null,relacionados:v.relacionados};
      var op=novo?Promise.resolve().then(function(){linha.id=kcUuid();return SB.from("conhecimento").insert(linha).select(KC_COLUNAS)}).then(sbOk).then(function(l){KC.quando=0;return l[0]}):kcGravar(R.id,linha);
      op.then(function(x){location.hash="#conhecimento/"+x.id},function(e){salvar.disabled=false;salvar.textContent=novo?"Salvar":"Salvar alterações";msg.textContent="⚠ Não gravei: "+kcErro(e)})};
    p.appendChild(msg);p.appendChild(f);corpo.appendChild(p)}

  /* ---------- histórico ---------- */
  var KC_CAMPOS=[["titulo","Título"],["conteudo","Conteúdo"],["motivo","Motivo"],["causa","Causa"],["solucao","Solução"],["prevencao","Prevenção"],["categoria","Categoria"],["estado","Estado"],["origem","Origem"]];
  function kcMudou(a,b){var m=[];KC_CAMPOS.forEach(function(c){if(String(a[c[0]]||"")!==String(b[c[0]]||""))m.push(c[1])});if(String((a.tags||[]).join(","))!==String((b.tags||[]).join(",")))m.push("Tags");return m}
  function kcHistorico(corpo,r){var p=panel("Histórico: "+r.titulo,"Cada versão anterior é guardada pelo banco a cada alteração. Restaurar cria uma versão nova; nada se perde."),lista=h("div",{class:"kn-lista"});
    p.appendChild(h("div",{class:"kn-acoes"},h("a",{class:"ghostbtn",href:"#conhecimento/"+r.id,text:"← Voltar ao registro"})));p.appendChild(lista);lista.appendChild(loading());corpo.appendChild(p);
    Promise.resolve().then(function(){return SB.from("conhecimento_historico").select("id,versao,operacao,snapshot,criado_em").eq("conhecimento_id",r.id).order("versao",{ascending:false})}).then(sbOk).then(function(hs){lista.innerHTML="";
      lista.appendChild(h("div",{class:"kn-item kn-atual"},h("b",{text:"Versão "+r.versao+" (atual)"}),h("span",{class:"sub",text:kcQuando(r.atualizado_em)})));
      if(!hs.length){lista.appendChild(h("p",{class:"empty",text:"Sem versões anteriores: o registro nunca foi alterado."}));return}
      var seguinte=r;hs.forEach(function(v){var s=v.snapshot||{},mud=kcMudou(s,seguinte),det=h("details",{class:"kn-item"}),
          rest=h("button",{type:"button",class:"ghostbtn",text:"Restaurar esta versão"}),aviso=h("p",{class:"sub",role:"status"});
        det.appendChild(h("summary",null,h("b",{text:"Versão "+v.versao}),h("span",{class:"sub",text:" · "+kcQuando(s.atualizado_em||v.criado_em)+(mud.length?" · depois mudou: "+mud.join(", "):"")})));
        det.appendChild(h("div",{class:"kn-bloco"},h("h3",{text:s.titulo||"—"}),h("p",{class:"kn-texto",text:[s.conteudo,s.motivo&&"Motivo: "+s.motivo,s.causa&&"Causa: "+s.causa,s.solucao&&"Solução: "+s.solucao,s.prevencao&&"Prevenção: "+s.prevencao].filter(Boolean).join("\n\n")||"(sem texto)"})));
        rest.onclick=function(){if(!window.confirm("Restaurar a versão "+v.versao+"? O texto atual vira uma versão do histórico."))return;rest.disabled=true;
          kcGravar(r.id,{titulo:s.titulo,conteudo:s.conteudo||"",motivo:s.motivo||null,causa:s.causa||null,solucao:s.solucao||null,prevencao:s.prevencao||null,categoria:s.categoria||null,tags:s.tags||[],estado:s.estado||"ativo",origem:s.origem||null}).then(function(){location.hash="#conhecimento/"+r.id;renderConhecimento(r.id)},function(e){rest.disabled=false;aviso.textContent="Não restaurei: "+kcErro(e)})};
        det.appendChild(rest);det.appendChild(aviso);lista.appendChild(det);seguinte=s})})
    .catch(function(e){lista.innerHTML="";lista.appendChild(failed(function(){renderConhecimento(r.id,"historico")},e));logErro("conhecimento",e)})}

  /* ---------- ponte com o repositório ---------- */
  function kcSincronizar(corpo){
    var p=panel("Repositório ⇄ RAC Knowledge","Os agentes escrevem em docs/conhecimento (pelo Git, com revisão). Aqui você importa o que chegou. Nada é importado sem o seu toque, e o que você editou aqui nunca é sobrescrito sozinho."),
      res=h("div",{class:"kn-lista"});p.appendChild(h("div",{class:"kn-acoes"},h("a",{class:"ghostbtn",href:"#conhecimento",text:"← Voltar à lista"})));p.appendChild(res);res.appendChild(loading());corpo.appendChild(p);
    fetch("docs/conhecimento/indice.json?atualizar=1",{cache:"no-cache"}).then(function(r){if(!r.ok)throw new Error("o índice do repositório respondeu "+r.status+" (a branch com ele já foi publicada?)");return r.json()}).then(function(ix){
      var reg=ix&&ix.registros;if(!Array.isArray(reg))throw new Error("índice do repositório inválido");
      reg=reg.filter(function(i){return !NUCLEO.knValidar({tipo:i.tipo,titulo:i.titulo,conteudo:i.conteudo,motivo:i.motivo,causa:i.causa,solucao:i.solucao,prevencao:i.prevencao,categoria:i.categoria,origem:i.origem,tags:i.tags,estado:i.estado,ref:i.ref}).length&&/^[0-9a-f]{64}$/.test(i.hash||"")});
      var pl=NUCLEO.knPlano(reg,KC.D),aviso=h("p",{class:"sub",role:"status"});res.innerHTML="";
      function lst(tit,itens,fn){if(!itens.length)return;res.appendChild(h("h3",{text:tit+" ("+itens.length+")"}));itens.slice(0,30).forEach(function(x){res.appendChild(h("div",{class:"kn-item"},fn(x)))});if(itens.length>30)res.appendChild(h("p",{class:"sub",text:"…e mais "+(itens.length-30)}))}
      res.appendChild(h("p",{class:"kn-texto",text:"No repositório: "+reg.length+" registros · já iguais aqui: "+pl.iguais+" · novos: "+pl.novos.length+" · atualizações: "+pl.atualizar.length+" · a vincular: "+pl.vincular.length+" · em conflito: "+pl.conflitos.length+" · só no site: "+pl.soSite.length}));
      lst("Novos",pl.novos,function(i){return [h("b",{text:i.titulo}),h("span",{class:"sub",text:" · "+kcNome(i.tipo)})]});
      lst("Atualizações do repositório",pl.atualizar,function(x){return [h("b",{text:x.item.titulo}),h("span",{class:"sub",text:" · o arquivo mudou"})]});
      lst("A vincular (já existem aqui sem ligação com um arquivo)",pl.vincular,function(x){return [h("b",{text:x.item.titulo}),h("span",{class:"sub",text:" · passa a espelhar "+x.item.ref})]});
      var total=pl.novos.length+pl.atualizar.length+pl.vincular.length;
      if(pl.conflitos.length){res.appendChild(h("h3",{text:"Em conflito ("+pl.conflitos.length+")"}));res.appendChild(h("p",{class:"sub",text:"Você alterou estes registros aqui depois da última importação e o arquivo também mudou. Nada é sobrescrito: escolha por registro."}));
        pl.conflitos.forEach(function(c){var bt=h("button",{type:"button",class:"ghostbtn",text:"Usar o arquivo do repositório"}),msg=h("span",{class:"sub"});
          bt.onclick=function(){if(!window.confirm("Trocar o texto daqui pelo do arquivo? O texto atual fica no histórico."))return;bt.disabled=true;kcAplicar([],[{item:c.item,banco:c.banco}],[]).then(function(){kcCarregar(true).then(function(){kcSincronizar((corpo.innerHTML="",corpo))})},function(e){bt.disabled=false;msg.textContent=" Não gravei: "+kcErro(e)})};
          res.appendChild(h("div",{class:"kn-item"},h("b",{text:c.item.titulo}),h("div",{class:"kn-acoes"},bt,h("a",{class:"ghostbtn",href:"#conhecimento/"+c.banco.id,text:"Ver o daqui"}),msg)))})}
      if(total){var im=h("button",{type:"button",class:"kn-primario",text:"Importar "+total+(total===1?" registro":" registros")});
        im.onclick=function(){im.disabled=true;im.textContent="Importando…";kcAplicar(pl.novos,pl.atualizar,pl.vincular).then(function(){return kcCarregar(true)}).then(function(){corpo.innerHTML="";kcSincronizar(corpo)},function(e){im.disabled=false;im.textContent="Importar "+total;aviso.textContent="Não importei tudo: "+kcErro(e)+" (o que já entrou continua; toque de novo para completar)."})};
        res.appendChild(im)}
      else res.appendChild(h("p",{class:"empty",text:"Nada a importar: o site já está igual ao repositório."}));
      if(pl.soSite.length){res.appendChild(h("h3",{text:"Só no site ou alterados aqui ("+pl.soSite.length+")"}));res.appendChild(h("p",{class:"sub",text:"O agente ainda não os conhece. Copie e cole na conversa com ele: ele salva em docs/conhecimento, faz o commit e, depois do merge, eles passam a constar como iguais."}));
        var cp=h("button",{type:"button",class:"ghostbtn",text:"Copiar "+pl.soSite.length+" para o agente"});cp.onclick=function(){kcCopiar(kcPacote(pl.soSite,reg),aviso)};res.appendChild(cp)}
      res.appendChild(aviso)})
    .catch(function(e){res.innerHTML="";res.appendChild(failed(function(){corpo.innerHTML="";kcSincronizar(corpo)},e));logErro("conhecimento",e)})}
  /* o texto que o dono cola para o agente: um bloco por registro, com o caminho do arquivo */
  function kcPacote(regs,indice){var usados={};(indice||[]).forEach(function(i){usados[i.ref]=1});(KC.D||[]).forEach(function(x){if(x.ref_externa)usados[x.ref_externa]=1});
    var blocos=regs.map(function(b){var o=NUCLEO.knDoBanco(b,KC.D),ref=b.ref_externa;
      if(!ref){var base=o.tipo+"/"+NUCLEO.knSlug(o.titulo),n=1;ref=base;while(usados[ref]){n++;ref=base+"-"+n}usados[ref]=1;o.ref=ref}
      return "### docs/conhecimento/registros/"+ref+".md\n```markdown\n"+NUCLEO.knParaArquivo(o)+"```"});
    return "Agente: salve cada bloco abaixo no arquivo indicado (substitua se já existir), rode `node scripts/conhecimento.mjs indice` e inclua no commit do lote. Origem: RAC Knowledge (site).\n\n"+blocos.join("\n\n")+"\n"}
  /* grava a importação: novos (insert com id gerado aqui, para já ligar as relações), atualizações e vínculos (update). As relações viram ids pelo mapa ref → id. */
  function kcAplicar(novos,atualizar,vincular){
    var mapa={};(KC.D||[]).forEach(function(x){if(x.ref_externa)mapa[x.ref_externa]=x.id});
    novos.forEach(function(i){i._id=kcUuid();mapa[i.ref]=i._id});vincular.forEach(function(x){mapa[x.item.ref]=x.banco.id});
    function rels(i){var r=[];(i.relacionados||[]).forEach(function(ref){if(mapa[ref])r.push(mapa[ref])});return r}
    var linhas=novos.map(function(i){var l=NUCLEO.knLinha(i);l.id=i._id;l.relacionados=rels(i);return l});
    var p=Promise.resolve();
    for(var k=0;k<linhas.length;k+=50)(function(lote){p=p.then(function(){return SB.from("conhecimento").insert(lote)}).then(sbOk)})(linhas.slice(k,k+50));
    atualizar.concat(vincular).forEach(function(x){p=p.then(function(){var l=NUCLEO.knLinha(x.item);l.relacionados=rels(x.item);return SB.from("conhecimento").update(l).eq("id",x.banco.id)}).then(sbOk)});
    return p.then(function(){KC.quando=0})}
