// @ts-nocheck -- monólito legado; módulos extraídos são checados em modo strict.
/* ===================== Setup ===================== */
// Os dados agora vêm da API do backend (que fala com o Jira), em vez de
// virem embutidos no HTML. DATA e EPICS são preenchidos no bootstrap().
let DATA: DashboardIssue[] = [];
// Dataset exclusivo do PI Tracking: inclui épicos de quarters criados antes do
// ano corrente e seus filhos, sem contaminar as métricas das demais abas.
let PI_DATA: DashboardIssue[] = [];
let EPICS: DashboardIssue[] = [];

const MESES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const COLORS = ['#CE0058','#0057B8','#E13D72','#333333','#E97899','#7F8084','#A30046','#050505','#EF9AB1','#D0D0CF'];
const TIPO_COLOR = {'Épico':'#333333','História':'#CE0058','Sub-task':'#9AA0A6','Bug':'#D64545','Débito Técnico':'#D98E3B','Enabler':'#0057B8'};

const TAB_HELP = {
  exec:'Consolida volume, esforço, tempos e distribuição do recorte. Métricas de entrega respeitam o período de conclusão; estados atuais, como pendentes e WIP, ignoram esse período.',
  throughput:'Conta itens com status classificado como concluído e usa a data de conclusão para posicioná-los no período. Os gráficos respondem aos filtros globais.',
  sp:'Compara Story Points planejados dos itens não cancelados com Story Points concluídos dentro do período selecionado. O card de tempo por Story Point cruza a estimativa com o Cycle Time real dos itens concluídos, em dias corridos, e segue o filtro de Tipo — sub-itens entram quando selecionados, e a legenda avisa quando o recorte mistura níveis.',
  flow:'Lead Time vai da criação à conclusão. Cycle Time vai do início real ao fim real. Datas ausentes ou invertidas ficam fora dessas métricas. O gráfico de tempo por status decompõe o Lead Time usando o changelog do Jira; nele o filtro de Status escolhe quais status aparecem, não quais itens entram. A tendência mensal e o P85 por squad seguem a medida escolhida no próprio card, com seletores independentes; a tendência posiciona cada item pelo mês de conclusão e traz a barra do mês com a média móvel de 3 meses por cima, e o top 12 do ranking conta itens que têm a medida.',
  wip:'Mostra entregas, trabalho ainda aberto e Aging. Os KPIs do topo ignoram o filtro de Tipo (cada card já recorta o seu tipo); os gráficos de entrega seguem o filtro. Aging conta do início real até hoje apenas para itens em WIP.',
  block:'Considera itens do tipo Sub-block. Bloqueios resolvidos usam Cycle Time; bloqueios abertos contam da criação até hoje.',
  sprint:'A associação usa o histórico de sprints do Jira. Completude é subitens concluídos dividido pelo total de subitens do item.',
  pi:'Agrupa épicos do PI por Value Stream e, dentro dela, por squad — os dois níveis nascem recolhidos. O progresso usa os filhos elegíveis, exclui cancelados do denominador e não duplica épicos ou subtarefas. Ao entrar nesta aba o filtro de Programa vem marcado em Afya One; ao sair, a marcação é desfeita.',
  dep:'Considera issues do tipo Dependência. O time DEPENDENTE vem do campo Team; o DEMANDANTE, do campo Time Demandante. A duração conta da abertura até a entrada em Done, lida do changelog — o workflow deste tipo não preenche resolução. Dependência cancelada deixou de ser necessária: conta como episódio, sem somar dias.',
  notas:'Documenta origem dos campos, regras de cálculo, limitações e decisões metodológicas do dashboard.'
};
const FILTER_HELP = {
  'dd-Programa':'Programa é derivado do projeto e do time. Vazio significa todos os programas.',
  'dd-VS':'Value Stream é mapeada a partir do projeto do Jira. Vazio significa todas.',
  'dd-Squad':'Squad vem do campo Team do Jira. Na aba Sprint, esse filtro também define quais sprints ficam disponíveis.',
  'dd-PI':'PI é identificado pelas labels configuradas. Quando há mais de uma label válida, prevalece o PI mais recente reconhecido.',
  'dd-Sprint':'Na aba Estimativas, planejado é o escopo standard da sprint e concluído usa a mesma atribuição do velocity.',
  'dd-AnoCriacao':'Filtra pelo ano de criação da issue, não pelo ano de conclusão.',
  'dd-Mes':'Filtra pelo mês de criação da issue, não pelo mês de conclusão.',
  'dd-Tipo_de_item':'Filtra pelo tipo bruto do Jira, como Story, Enabler, Bug ou Sub-task. Os atalhos no topo do painel marcam um grupo inteiro de uma vez (Nível história, Sub-itens, Bugs, Épicos) e se somam entre si; eles escrevem nesta mesma seleção, então os tipos continuam marcáveis um a um.',
  'dd-Status':'Filtra pelo status atual da issue. Na aba PI Tracking ele é ocultado para não alterar artificialmente o denominador.',
  'dd-sprintPick':'Seleciona uma sprint da squad escolhida. A associação considera o histórico de participação no Jira.',
  'dd-velocityRange':'Define quantas sprints anteriores entram na série de velocity.'
};
const SECTION_HELP = {
  'panel-exec':TAB_HELP.exec,'panel-throughput':TAB_HELP.throughput,'panel-sp':TAB_HELP.sp,
  'panel-flow':TAB_HELP.flow,'panel-wip':TAB_HELP.wip,'panel-block':TAB_HELP.block,
  'panel-sprint':TAB_HELP.sprint,'panel-pi':TAB_HELP.pi,'panel-dep':TAB_HELP.dep,'panel-notas':TAB_HELP.notas
};

function helpForKpi(label){
  const text=String(label||'').toLocaleLowerCase('pt-BR');
  if(text.includes('lead')) return 'Lead Time: dias corridos entre a criação e a conclusão. Só entram itens concluídos com datas válidas.';
  if(text.includes('cycle')) return 'Cycle Time: dias corridos entre o início real e o fim real. Itens sem as duas datas ficam fora.';
  if(text.includes('aging')) return 'Aging: dias desde o início real até hoje para itens ainda em WIP. Não usa a data de criação como substituta.';
  if(text.includes('velocity')) return 'Velocity: média de Story Points entregues por sprint fechada. Sprint ativa e itens cancelados não entram na média.';
  if(text.includes('comprometido')) return 'Story Points dos itens que já pertenciam à sprint quando ela começou.';
  if(text.includes('adicionado')) return 'Story Points dos itens que entraram na sprint depois da data de início.';
  if(text.includes('fora de sprint')) return 'Itens concluídos depois do fim de todas as sprints conhecidas não são atribuídos a uma sprint.';
  if(text.includes('bloque')) return 'Indicador calculado a partir de itens Sub-block e das regras de duração de bloqueio.';
  if(text.includes('cancel')) return 'Itens cujo status atual está classificado como cancelado. Eles não contam como entrega.';
  if(text.includes('quarter')||text.includes('gap plano')) return 'Compara o percentual concluído do PI com o percentual de tempo já transcorrido no quarter.';
  if(text.includes('épico')||text.includes('epico')) return 'Indicador de épicos dentro do PI e dos filtros atuais. Progresso dos filhos e status do épico são dimensões independentes.';
  if(text.includes('story point')||/^sp\b/.test(text)||text.includes(' sp')) return 'Story Points representam esforço. Planejado exclui cancelados; concluído considera itens entregues no recorte aplicável.';
  if(text.includes('wip')||text.includes('andamento')) return 'Itens em andamento no estado atual. O intervalo de conclusão não se aplica porque esses itens ainda não terminaram.';
  if(text.includes('pendente')) return 'Itens em status classificados como pendentes no estado atual. O filtro de período de conclusão não se aplica.';
  if(text.includes('conclu')||text.includes('throughput')||text.includes('entreg')) return 'Quantidade entregue conforme os status classificados como concluídos e o período de conclusão selecionado.';
  if(text.includes('progresso')) return 'Percentual concluído calculado sobre o denominador elegível da métrica, excluindo cancelados quando indicado.';
  return 'Indicador calculado sobre as issues do recorte atual, respeitando os filtros aplicáveis desta aba.';
}

function makeHelpButton(text,label){
  const button=document.createElement('button');
  button.type='button';button.className='help-icon';button.textContent='i';
  button.dataset.help=text;button.setAttribute('aria-label',`Ajuda sobre ${label||'esta informação'}`);
  return button;
}
function showHelpTooltip(anchor){
  if(!anchor?.dataset?.help) return;
  let tooltip=document.getElementById('__help-tooltip');
  if(!tooltip){tooltip=document.createElement('div');tooltip.id='__help-tooltip';tooltip.setAttribute('role','tooltip');document.body.appendChild(tooltip);}
  tooltip.innerHTML='';
  /* O cabeçalho é "Regra" por default porque a esmagadora maioria das âncoras
     explica um critério de cálculo. `data-help-title` cobre o caso em que o
     tooltip fala de UM item — o badge de transbordo, por exemplo, não enuncia
     regra nenhuma: informa de onde aquele item veio. */
  const title=document.createElement('div');title.className='help-tooltip-title';
  title.textContent=anchor.dataset.helpTitle||'Regra';
  const body=document.createElement('div');body.className='help-tooltip-body';body.textContent=anchor.dataset.help;
  tooltip.append(title,body);tooltip.style.display='block';tooltip.dataset.anchor='active';
  const rect=anchor.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  const gap=8,margin=10;
  const left=Math.max(margin,Math.min(window.innerWidth-box.width-margin,rect.left+rect.width/2-box.width/2));
  let top=rect.top-box.height-gap;
  if(top<margin) top=rect.bottom+gap;
  if(top+box.height>window.innerHeight-margin) top=Math.max(margin,window.innerHeight-box.height-margin);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(margin,top)}px`;
}
function hideHelpTooltip(){const tooltip=document.getElementById('__help-tooltip');if(tooltip)tooltip.style.display='none';}
function installHelpEvents(){
  if(document.body.dataset.helpEvents==='ready') return;
  document.body.dataset.helpEvents='ready';
  document.addEventListener('mouseover',e=>{const a=e.target.closest('[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('mouseout',e=>{const a=e.target.closest('[data-help]');if(a&&!a.contains(e.relatedTarget))hideHelpTooltip();});
  document.addEventListener('focusin',e=>{const a=e.target.closest('[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('focusout',e=>{if(e.target.closest('[data-help]'))hideHelpTooltip();});
  document.addEventListener('click',e=>{const a=e.target.closest('.help-icon[data-help]');if(a){e.preventDefault();e.stopPropagation();const t=document.getElementById('__help-tooltip');if(t&&t.style.display==='block')hideHelpTooltip();else showHelpTooltip(a);}else hideHelpTooltip();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHelpTooltip();});
  window.addEventListener('scroll',hideHelpTooltip,true);window.addEventListener('resize',hideHelpTooltip);
}
function enhanceHelpTooltips(){
  installHelpEvents();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(el=>{el.dataset.help=TAB_HELP[el.dataset.tab]||'';});
  Object.entries(FILTER_HELP).forEach(([id,text])=>{const btn=document.querySelector(`#${id} .dd-btn`);if(btn)btn.dataset.help=text;});
  document.querySelectorAll('.date-filter').forEach(el=>{el.dataset.help='Filtra pela data de conclusão. Métricas de estado atual, como WIP e pendentes, podem ignorar este intervalo.';});
  document.querySelectorAll('.clear-btn').forEach(el=>{el.dataset.help='Remove todas as seleções dos filtros globais e restaura o recorte padrão.';});
  document.querySelectorAll('.tabpanel').forEach(panel=>{
    const heading=panel.querySelector(':scope > .section-head h2');
    if(heading&&!heading.querySelector('.help-icon')) heading.appendChild(makeHelpButton(SECTION_HELP[panel.id]||'Explica as regras e o recorte desta seção.',heading.textContent));
  });
  document.querySelectorAll('.card h3').forEach(heading=>{
    if(heading.querySelector('.help-icon')) return;
    const card=heading.closest('.card');const cap=card?.querySelector('.cap');const hasChart=!!card?.querySelector('canvas');
    let text=cap?.textContent?.trim()||`Mostra ${heading.textContent.trim().toLocaleLowerCase('pt-BR')} para o recorte atual.`;
    text+=' Responde aos filtros aplicáveis desta aba.'+(hasChart?' Passe o mouse para ver valores e clique em uma barra, ponto ou fatia para abrir as issues quando o gráfico permitir.':'');
    heading.appendChild(makeHelpButton(text,heading.textContent));
  });
  document.querySelectorAll('.kpi').forEach(kpi=>{
    if(kpi.querySelector('.help-icon')) return;
    const label=kpi.querySelector('.eyebrow')?.textContent?.trim()||'indicador';
    const explicit=(kpi.dataset.kpiRule||'').trim();
    const help=explicit&&explicit.length<=170?explicit:helpForKpi(label);
    kpi.appendChild(makeHelpButton(help,label));
  });
}

function normalizeData(){
  DATA.forEach(d=>{
    d.Mes = d.AnoMesCriacao ? d.AnoMesCriacao.split('-')[1] : null;
    d.MesConclusao = d.AnoMesConclusao ? d.AnoMesConclusao.split('-')[1] : null;
    // Aging é RECALCULADO aqui, sobrescrevendo o valor que veio do servidor: o
    // snapshot em cache pode ser de dias atrás e congelaria o envelhecimento.
    // Mesma regra do FlowMetricsCalculator.agingDays — exige Data de início real,
    // sem fallback para a Criação —, só que em dias inteiros.
    d.AgingDias = diasCorridosAteHoje(d['Data Inicio Real']);
  });
}

/* ===================== Chart registry ===================== */
const chartsReg = {};
function chartHexRgb(hex){
  const value=String(hex||'').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];
}
function applyChartDesign(config,ctx,canvas){
  config.options = config.options || {};
  const options = config.options;
  options.responsive = true;
  options.maintainAspectRatio = false;
  if(options.animation===undefined) options.animation = {duration:420,easing:'easeOutQuart'};
  if(options.interaction===undefined) options.interaction = {mode:'nearest',intersect:true};

  options.plugins = options.plugins || {};
  const legend = options.plugins.legend || (options.plugins.legend = {});
  legend.labels = Object.assign({usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:16,color:'#52525B'},legend.labels||{});
  if(legend.position===undefined) legend.position = 'bottom';

  const tooltip = options.plugins.tooltip || (options.plugins.tooltip = {});
  if(typeof tooltip==='object'){
    Object.assign(tooltip,{
      backgroundColor:'rgba(255,255,255,.98)',titleColor:'#18181B',bodyColor:'#52525B',
      borderColor:'#E4E4E7',borderWidth:1,cornerRadius:9,padding:12,
      displayColors:true,usePointStyle:true,boxPadding:5,titleMarginBottom:7,bodySpacing:4,caretSize:6
    });
  }

  const scales = options.scales || {};
  Object.entries(scales).forEach(([axis,scale])=>{
    scale.border = Object.assign({display:false},scale.border||{});
    scale.grid = Object.assign({color:'#EEEFF2',drawTicks:false,lineWidth:1,borderDash:[4,4]},scale.grid||{});
    scale.ticks = Object.assign({color:'#71717A',padding:8,font:{family:"'Inter',sans-serif",size:10.5}},scale.ticks||{});
    const numericAxis=(options.indexAxis==='y'?'x':'y');
    if(axis===numericAxis && scale.ticks.maxTicksLimit===undefined) scale.ticks.maxTicksLimit=6;
    if(scale.title){
      scale.title = Object.assign({color:'#71717A',font:{family:"'Inter',sans-serif",size:10.5,weight:'600'},padding:8},scale.title);
    }
  });

  (config.data?.datasets||[]).forEach(dataset=>{
    const type = dataset.type || config.type;
    if(type==='bar'){
      if(dataset.borderRadius===undefined) dataset.borderRadius=6;
      if(dataset.borderSkipped===undefined) dataset.borderSkipped=false;
      if(dataset.maxBarThickness===undefined) dataset.maxBarThickness=28;
      if(dataset.categoryPercentage===undefined) dataset.categoryPercentage=.64;
      if(dataset.barPercentage===undefined) dataset.barPercentage=.82;
    }
    if(type==='line'){
      if(dataset.borderWidth===undefined) dataset.borderWidth=2.5;
      if(dataset.tension===undefined) dataset.tension=.35;
      if(dataset.pointRadius===undefined) dataset.pointRadius=2.5;
      if(dataset.pointHoverRadius===undefined) dataset.pointHoverRadius=5;
      if(dataset.pointHitRadius===undefined) dataset.pointHitRadius=12;
      if(dataset.pointBorderWidth===undefined) dataset.pointBorderWidth=0;
      const rgb=chartHexRgb(dataset.borderColor);
      if(dataset.fill && rgb){
        const gradient=ctx.createLinearGradient(0,0,0,Math.max(canvas.clientHeight||0,260));
        gradient.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.24)`);
        gradient.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.015)`);
        dataset.backgroundColor=gradient;
      }
    }
    if(type==='doughnut' || type==='pie'){
      if(dataset.borderColor===undefined) dataset.borderColor='#FFFFFF';
      if(dataset.borderWidth===undefined) dataset.borderWidth=2;
      if(dataset.hoverOffset===undefined) dataset.hoverOffset=5;
    }
  });
  if(config.type==='doughnut') options.cutout='74%';
  return config;
}
function upsertChart(id, config){
  const canvas = document.getElementById(id);
  if(!canvas) return null;
  if(chartsReg[id]){ chartsReg[id].destroy(); }
  const ctx=canvas.getContext('2d');
  chartsReg[id] = new Chart(ctx, applyChartDesign(config,ctx,canvas));
  return chartsReg[id];
}
const baseFont = {family:"'Inter',sans-serif", size:11};
Chart.defaults.font = baseFont;
Chart.defaults.color = '#71717A';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;

/* ===== Item 12: rótulos valor + % ===== */
function donutLegendPct(chart){
  const ds = chart.data.datasets[0];
  const total = ds.data.reduce((a,b)=>a+(+b||0),0) || 1;
  return chart.data.labels.map((lab,i)=>{
    const v = +ds.data[i]||0;
    const pct = (v/total*100).toFixed(0);
    return { text:`${lab} — ${fmt0(v)} (${pct}%)`, fillStyle:ds.backgroundColor[i], strokeStyle:ds.backgroundColor[i], lineWidth:0, hidden:false, index:i };
  });
}
const tooltipPct = {
  callbacks:{
    label(ctx){
      const arr = ctx.dataset.data;
      const total = arr.reduce((a,b)=>a+(+b||0),0) || 1;
      let v = ctx.parsed;
      if(v && typeof v==='object') v = (v.x!=null? v.x : v.y);
      v = +v||0;
      const pct = (v/total*100).toFixed(0);
      return ` ${fmt0(v)} (${pct}%)`;
    }
  }
};
function donutPctOptions(extra){
  return Object.assign({
    responsive:true, maintainAspectRatio:false, cutout:'55%',
    plugins:{
      legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}},
      tooltip:tooltipPct
    }
  }, extra||{});
}
// Plugin inline: escreve "valor (pct%)" na ponta de barras horizontais (barPct:true).
// Barras de CONTAGEM que recebem rótulo "valor (%)" — por id de canvas.
const BAR_PCT_IDS = new Set(['chart-tp-squad','chart-tp-vs','chart-wip-entregas-squad','chart-wip-entregas-vs','chart-wip-status','chart-wip-squad','chart-flow-lead-hist','chart-flow-cycle-hist','chart-wip-aging-hist','chart-cancel-month','chart-cancel-squad']);
const barPctPlugin = {
  id:'barPct',
  afterDatasetsDraw(chart){
    const cid = chart.canvas && chart.canvas.id;
    if(!chart.options.barPct && !BAR_PCT_IDS.has(cid)) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;
    const total = data.reduce((a,b)=>a+(+b||0),0) || 1;
    ctx.save();
    ctx.font = "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    meta.data.forEach((bar,i)=>{
      let v = data[i];
      if(v && typeof v==='object') v = (v.x!=null? v.x : v.y);
      const num = Number(v);
      if(!isFinite(num) || num===0) return;
      const txt = `${fmt0(num)} (${(num/total*100).toFixed(0)}%)`;
      if(horiz){ ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt, bar.x + 5, bar.y); }
      else { ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(txt, bar.x, bar.y - 3); }
    });
    ctx.restore();
  }
};
Chart.register(barPctPlugin);

// Plugin: rótulos de valor em barras (vertical ou horizontal, múltiplos datasets).
// Ative com options.barLabels = true. Formata via options.barLabelFmt (opcional).
const barLabelsPlugin = {
  id:'barLabels',
  afterDatasetsDraw(chart){
    if(!chart.options.barLabels) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    // IMPORTANTE: não usar função em options (Chart.js trataria como "scriptable"
    // e a invocaria com um objeto de contexto). Usamos uma string de formato.
    const fmtKind = chart.options.barLabelFmt;
    // 'sp' = Story Points: mostra decimal só quando existe (40 · 8,5 · 0,5). Nem
    // fmt0 (arredondaria 0,5 para 1) nem fmt1 (poluiria com "40,0") servem aqui.
    const fmt = fmtKind === 'sp' ? (v=>(Math.round(v*10)/10).toLocaleString('pt-BR'))
      : fmtKind === 'd1' ? (v=>fmt1(v)) : (v=>fmt0(v));
    ctx.save();
    // Barras agrupadas ficam estreitas; deixar a fonte configurável evita rótulo
    // sobrepondo rótulo quando há três séries por sprint.
    ctx.font = chart.options.barLabelFont || "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    chart.data.datasets.forEach((ds,di)=>{
      const meta = chart.getDatasetMeta(di);
      if(meta.hidden) return;
      // Só BARRA ganha rótulo. Num gráfico misto (barras + linha de tendência),
      // rotular também a linha põe dois números quase iguais um sobre o outro em
      // cada mês — e o de cima é a média móvel, que ninguém pediu para ler ponto
      // a ponto. Nenhum gráfico com barLabels tinha linha antes disto.
      if(meta.type === 'line') return;
      meta.data.forEach((bar,i)=>{
        let v = ds.data[i];
        if(v && typeof v==='object') v = (v.x!=null? v.x : v.y); // dado parseado {x,y}
        const num = Number(v);
        if(!isFinite(num) || num===0) return;
        const txt = fmt(num);
        if(horiz){ ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt, bar.x + 5, bar.y); }
        else {
          const stagger=chart.options.barLabelStagger?(di%2)*12:0;
          ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(txt,bar.x,bar.y-4-stagger);
        }
      });
    });
    ctx.restore();
  }
};
Chart.register(barLabelsPlugin);

// Total discreto acima de cada barra empilhada.
const stackTotalsPlugin = {
  id:'stackTotals',
  afterDatasetsDraw(chart){
    if(!chart.options.stackTotals) return;
    const ctx=chart.ctx;
    ctx.save();
    if(chart.options.stackSegmentLabels){
      chart.data.datasets.forEach((ds,di)=>{
        if(!chart.isDatasetVisible(di)) return;
        const color=String(ds.backgroundColor||'');
        const hex=color.match(/^#([0-9a-f]{6})$/i)?.[1];
        const rgb=hex?[0,2,4].map(pos=>parseInt(hex.slice(pos,pos+2),16)):null;
        const luminance=rgb?(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114):0;
        ctx.fillStyle=luminance>165?'#27272A':'#FFFFFF';
        ctx.font="750 9.5px 'Inter',sans-serif";
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        chart.getDatasetMeta(di).data.forEach((bar,i)=>{
          const value=Number(ds.data[i])||0;
          if(!value) return;
          ctx.fillText(fmt0(value),bar.x,(bar.y+bar.base)/2);
        });
      });
    }
    ctx.font="700 10.5px 'Inter',sans-serif";
    ctx.fillStyle='#52525B';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    chart.data.labels.forEach((_,i)=>{
      let total=0,topBar=null;
      chart.data.datasets.forEach((ds,di)=>{
        if(!chart.isDatasetVisible(di)) return;
        const value=Number(ds.data[i])||0;
        total+=value;
        if(value>0) topBar=chart.getDatasetMeta(di).data[i];
      });
      if(topBar&&total) ctx.fillText(fmt0(total),topBar.x,topBar.y-7);
    });
    ctx.restore();
  }
};
Chart.register(stackTotalsPlugin);

/* ===================== Rastreabilidade: drawer de issues (Entrega 4) ===================== */
const JIRA_BROWSE = 'https://medcel.atlassian.net/browse/';
let __drawerIssues = [];   // issues atualmente exibidas (para o CSV)
let __drawerTitle = '';

/* Colunas da tabela do drawer */
const DRAWER_COLS = [
  {k:'Chave', label:'Chave', link:true},
  {k:'Resumo', label:'Resumo'},
  {k:'Tipo de item', label:'Tipo'},
  {k:'Status', label:'Status'},
  {k:'Squad', label:'Team'},
  {k:'Sprints', label:'Sprints'},
  {k:'PI', label:'PI'},
  {k:'Story Points', label:'SP'},
  {k:'LeadTimeDias', label:'Lead (d)'},
  {k:'CycleTimeDias', label:'Cycle (d)'},
  {k:'AgingDias', label:'Aging (d)'},
  {k:'Data Inicio Real', label:'Início real'},
  {k:'Data Fim Real', label:'Fim real'},
  {k:'Data Conclusao', label:'Conclusão'},
];
let __drawerCols = DRAWER_COLS;

function ensureDrawer(){
  if(document.getElementById('__drawer')) return;
  const style = document.createElement('style');
  style.textContent = `
    body.drawer-open{overflow:hidden;}
    #__drawer-overlay{position:fixed;inset:0;background:rgba(24,24,27,.5);backdrop-filter:blur(3px);z-index:9998;opacity:0;pointer-events:none;transition:opacity .2s;}
    #__drawer-overlay.open{opacity:1;pointer-events:auto;}
    #__drawer{position:fixed;top:12px;right:12px;height:calc(100vh - 24px);width:min(1180px,calc(100vw - 32px));background:#F8F8FA;z-index:9999;
      border:1px solid #E4E4E7;border-radius:14px;box-shadow:-24px 0 70px rgba(24,24,27,.2);transform:translateX(calc(100% + 24px));transition:transform .24s ease;
      display:flex;flex-direction:column;overflow:hidden;font-family:'Inter',sans-serif;}
    #__drawer.open{transform:translateX(0);}
    #__drawer .dh{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 14px;background:#FFF;}
    #__drawer .dh-title{min-width:0;}
    #__drawer .dh h3{margin:0;font-size:17px;color:#18181B;font-weight:750;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    #__drawer .dh .cnt{display:inline-flex;align-items:center;margin-top:6px;padding:3px 8px;border-radius:999px;background:#F4F4F5;font-size:10.5px;color:#52525B;font-weight:650;}
    #__drawer .dh-actions{display:flex;gap:8px;align-items:center;}
    #__drawer .dbtn{min-height:36px;border:1px solid #D4D4D8;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:650;color:#3F3F46;box-shadow:0 1px 2px rgba(24,24,27,.04);}
    #__drawer .dbtn:hover{border-color:#F0A6C6;background:#FFF0F6;color:#A30046;}
    #__drawer .dbtn.close{width:36px;padding:0;border-color:transparent;background:transparent;box-shadow:none;font-size:22px;line-height:1;color:#71717A;}
    #__drawer .dtoolbar{display:flex;align-items:center;gap:12px;padding:0 20px 16px;border-bottom:1px solid #E4E4E7;background:#FFF;}
    #__drawer .dsearch{position:relative;flex:1;max-width:560px;}
    #__drawer .dsearch-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:16px;color:#A1A1AA;pointer-events:none;}
    #__drawer .dsearch input{width:100%;height:38px;padding:8px 12px 8px 34px;border:1px solid #D4D4D8;border-radius:9px;background:#FFF;color:#27272A;font-size:12.5px;outline:none;}
    #__drawer .dsearch input:focus{border-color:#CE0058;box-shadow:0 0 0 3px rgba(206,0,88,.12);}
    #__drawer .dresult{margin-left:auto;font-size:11px;color:#71717A;white-space:nowrap;}
    #__drawer .dbody{overflow:auto;flex:1;margin:12px;background:#FFF;border:1px solid #E4E4E7;border-radius:10px;}
    #__drawer table{border-collapse:separate;border-spacing:0;width:100%;min-width:1420px;font-size:12px;}
    #__drawer thead th{position:sticky;top:0;z-index:2;background:#F4F4F5;color:#71717A;text-align:left;padding:11px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.065em;font-weight:750;
      border-bottom:1px solid #D4D4D8;white-space:nowrap;}
    #__drawer tbody td{padding:11px 12px;border-bottom:1px solid #EEEEF0;color:#3F3F46;vertical-align:middle;background:#FFF;line-height:1.35;}
    #__drawer tbody tr:last-child td{border-bottom:0;}
    #__drawer tbody tr:hover td{background:#FFF7FA;}
    #__drawer th:first-child,#__drawer td:first-child{position:sticky;left:0;z-index:1;background:#FFF;box-shadow:1px 0 0 #EEEEF0;}
    #__drawer thead th:first-child{z-index:3;background:#F4F4F5;}
    #__drawer tbody tr:hover td:first-child{background:#FFF7FA;}
    #__drawer td.resumo{min-width:300px;max-width:380px;color:#27272A;font-weight:500;}
    #__drawer td.team{min-width:180px;max-width:220px;}
    #__drawer td.sprints{min-width:180px;max-width:240px;}
    #__drawer a.jira{color:#A30046;font-weight:700;text-decoration:none;white-space:nowrap;}
    #__drawer a.jira:hover{text-decoration:underline;}
    #__drawer .drawer-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:9.5px;font-weight:750;line-height:1.2;white-space:nowrap;}
    #__drawer .drawer-badge.type{background:#F4F4F5;color:#52525B;}
    #__drawer .drawer-badge.status{background:#F4F4F5;color:#52525B;}
    #__drawer .drawer-badge.status.ok{background:#DCFCE7;color:#166534;}
    #__drawer .drawer-badge.status.pending{background:#F4F4F5;color:#52525B;}
    #__drawer .drawer-badge.status.progress{background:#DBEAFE;color:#1D4ED8;}
    #__drawer .drawer-badge.status.risk{background:#FFE4E6;color:#BE123C;}
    #__drawer .empty{padding:64px 24px;text-align:center;color:#71717A;font-size:13px;}
    @media(max-width:700px){
      #__drawer{inset:0;width:100vw;height:100vh;border:0;border-radius:0;}
      #__drawer .dh{padding:15px 14px 12px;}
      #__drawer .dtoolbar{padding:0 14px 12px;flex-wrap:wrap;}
      #__drawer .dsearch{order:2;flex-basis:100%;max-width:none;}
      #__drawer .dresult{display:none;}
      #__drawer .dbody{margin:8px;border-radius:8px;}
      #__drawer .dbtn{font-size:0;width:38px;padding:0;}
      #__drawer .dbtn.export::after{content:'↓';font-size:18px;}
    }`;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = '__drawer-overlay';
  overlay.addEventListener('click', closeDrawer);
  const drawer = document.createElement('div');
  drawer.id = '__drawer';
  drawer.setAttribute('role','dialog');
  drawer.setAttribute('aria-modal','true');
  drawer.setAttribute('aria-labelledby','__drawer-title');
  drawer.innerHTML = `
    <div class="dh">
      <div class="dh-title"><h3 id="__drawer-title"></h3><span class="cnt" id="__drawer-count"></span></div>
      <div class="dh-actions">
        <button class="dbtn close" id="__drawer-close" aria-label="Fechar">×</button>
      </div>
    </div>
    <div class="dtoolbar">
      <div class="dsearch"><span class="dsearch-icon" aria-hidden="true">⌕</span><input id="__drawer-search" type="search" placeholder="Buscar por chave, resumo, status, squad ou sprint" autocomplete="off" aria-label="Buscar issues"></div>
      <span class="dresult" id="__drawer-result"></span>
      <button class="dbtn export" id="__drawer-csv">↓ Exportar CSV</button>
    </div>
    <div class="dbody" id="__drawer-body"></div>`;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  document.getElementById('__drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('__drawer-csv').addEventListener('click', exportDrawerCsv);
  document.getElementById('__drawer-search').addEventListener('input', e=>renderDrawerTable(filterDrawerIssues(e.target.value)));
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
}

/* Cor do badge de status. A fase de fluxo já vem calculada do backend em cada
   item (`FaseFluxo`, de IssueClassifier.phaseOf), então o drawer só traduz fase
   -> cor: as listas de status vivem em config/classification.rules.js e não se
   repetem aqui. Antes esta função adivinhava por pedaço de texto do status, e
   errava — "Deploy em Staging" (concluído) saía azul por casar com "staging", e
   "PRONTO PARA PROD" saía cinza por não casar com nada. */
const DRAWER_TONE_BY_PHASE = {
  'Concluído': 'ok',
  'Pendente': 'pending',
  'Em andamento': 'progress',
  'Cancelado': 'risk',
};

/* Item sem FaseFluxo (dataset antigo em cache, por exemplo) cai nas mesmas
   listas, que chegam no `meta` do dataset. O default é "em andamento", igual ao
   backend: status fora de todas as listas nunca fica sem cor de aberto. */
function drawerStatusTone(item, status){
  if(!String(status??'').trim()) return '';
  const fase = item && item.FaseFluxo;
  if(fase) return DRAWER_TONE_BY_PHASE[fase] || 'progress';
  if(piInList(status, window.__RULES_CANCELLED)) return 'risk';
  if(piInList(status, window.__RULES_DONE)) return 'ok';
  if(piInList(status, window.__RULES_PENDING)) return 'pending';
  return 'progress';
}

function filterDrawerIssues(query){
  const term=String(query||'').trim().toLocaleLowerCase('pt-BR');
  if(!term) return __drawerIssues;
  return __drawerIssues.filter(issue=>__drawerCols.some(col=>{
    const value=issue[col.k];
    return String(Array.isArray(value)?value.join(' '):(value??'')).toLocaleLowerCase('pt-BR').includes(term);
  }));
}

function renderDrawerTable(issues){
  const body=document.getElementById('__drawer-body');
  const result=document.getElementById('__drawer-result');
  const visible=issues||[];
  result.textContent=`${visible.length.toLocaleString('pt-BR')} de ${__drawerIssues.length.toLocaleString('pt-BR')} issues`;
  if(!visible.length){
    const searching=!!document.getElementById('__drawer-search')?.value;
    body.innerHTML=`<div class="empty">${searching?'Nenhuma issue encontrada para esta busca.':'Nenhuma issue neste recorte.'}</div>`;
    return;
  }
  const head=__drawerCols.map(c=>`<th scope="col">${c.label}</th>`).join('');
  const rows=visible.map(d=>{
    const tds=__drawerCols.map(c=>{
      let v=d[c.k];
      if(v===null||v===undefined) v='';
      if(Array.isArray(v)) v=v.join(', ');
      const safe=escapeHtml(String(typeof v==='number'?(Math.round(v*100)/100).toLocaleString('pt-BR'):v));
      if(c.link) return `<td><a class="jira" href="${JIRA_BROWSE}${safe}" target="_blank" rel="noopener">${safe}</a></td>`;
      if(c.k==='Resumo') return `<td class="resumo">${safe}</td>`;
      if(c.k==='Tipo de item') return `<td><span class="drawer-badge type">${safe||'Não informado'}</span></td>`;
      if(c.k==='Status') return `<td><span class="drawer-badge status ${drawerStatusTone(d,v)}">${safe||'Não informado'}</span></td>`;
      if(c.k==='Squad') return `<td class="team">${safe||'—'}</td>`;
      if(c.k==='Sprints') return `<td class="sprints">${safe||'—'}</td>`;
      return `<td>${safe||'—'}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  body.innerHTML=`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function openDrawer(title, issues, columns){
  ensureDrawer();
  __drawerCols = columns || DRAWER_COLS;
  __drawerIssues = issues || [];
  __drawerTitle = title || 'Issues';
  document.getElementById('__drawer-title').textContent = __drawerTitle;
  document.getElementById('__drawer-count').textContent = __drawerIssues.length.toLocaleString('pt-BR')+' issues';
  document.getElementById('__drawer-search').value='';
  renderDrawerTable(__drawerIssues);
  document.getElementById('__drawer-overlay').classList.add('open');
  document.getElementById('__drawer').classList.add('open');
  document.body.classList.add('drawer-open');
}

function closeDrawer(){
  const o=document.getElementById('__drawer-overlay'), d=document.getElementById('__drawer');
  if(o) o.classList.remove('open');
  if(d) d.classList.remove('open');
  document.body.classList.remove('drawer-open');
}

function escapeHtml(s){ return s.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function exportDrawerCsv(){
  if(!__drawerIssues.length) return;
  const sep=';';
  const header = __drawerCols.map(c=>c.label).join(sep);
  const lines = __drawerIssues.map(d=> __drawerCols.map(c=>{
    let v = d[c.k]; if(v===null||v===undefined) v='';
    if(Array.isArray(v)) v = v.join(', ');
    v = String(v).replace(/"/g,'""');
    return /[";\n]/.test(v) ? `"${v}"` : v;
  }).join(sep));
  const csv = '\uFEFF'+header+'\n'+lines.join('\n'); // BOM p/ acentos no Excel
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = __drawerTitle.replace(/[^\w\u00C0-\u017F]+/g,'_').slice(0,60);
  a.href=url; a.download=`issues_${safe}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* Helper: gera um onClick de gráfico que abre o drawer com o subconjunto certo.
   resolver(index, datasetIndex, chart) deve retornar {title, issues}. */
function drillClick(resolver){
  return (evt, elements, chart)=>{
    if(!elements || !elements.length) return;
    const el = elements[0];
    const r = resolver(el.index, el.datasetIndex, chart);
    if(r && r.issues) openDrawer(r.title, r.issues);
  };
}

/* KPIs clicáveis: registro preenchido pelo renderExec + listener delegado (uma vez) */
let __cardDrills: Record<string, { title: string; issues: DashboardIssue[] }> = {};
document.addEventListener('click', (e)=>{
  const card = e.target.closest('[data-drill]');
  if(!card) return;
  const d = __cardDrills[card.getAttribute('data-drill')];
  if(d) openDrawer(d.title, d.issues, d.columns);
});

/* ===================== Tabs ===================== */
let activeTab = 'pi';

/**
 * Ajusta os filtros visíveis para as abas com recorte próprio (PI Tracking e
 * Sprint). As seleções ocultas continuam guardadas para as demais abas.
 *
 * No PI, o recorte usa Programa, VS, Squad e PI. Na Sprint, usa Squad e Tipo.
 * Mostrar os demais controles sugeriria um efeito que eles não têm; suas
 * seleções reaparecem intactas quando o usuário retorna às outras abas.
 *
 * A barra é reconstruída a cada lote da carga progressiva, então esta função é
 * chamada também no fim de buildFilterBar() — senão o modo se perderia no meio
 * do carregamento.
 */
function syncFilterBarForTab(){
  const bar = document.getElementById('filterBar');
  if(!bar) return;
  bar.classList.toggle('pi-only', activeTab==='pi');
  bar.classList.toggle('dep-only', activeTab==='dep');
  bar.classList.toggle('sprint-only', activeTab==='sprint');
  bar.classList.toggle('sp-sprint-filter', activeTab==='sp');
  bar.classList.toggle('sp-sprint-selected', activeTab==='sp' && selections.Sprint.size>0);
}

const sidebarCollapse = document.getElementById('sidebarCollapse');
const sidebarMobileToggle = document.getElementById('sidebarMobileToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const topbarAfyaLogo = document.getElementById('topbarAfyaLogo');
topbarAfyaLogo.src = document.getElementById('afyaLogo').src;

function syncSidebarState(){
  const open = document.body.classList.contains('sidebar-open');
  sidebarCollapse.setAttribute('aria-expanded', String(open));
  sidebarCollapse.setAttribute('aria-label','Fechar menu lateral');
  sidebarMobileToggle.setAttribute('aria-expanded', String(open));
  sidebarMobileToggle.setAttribute('aria-label', open?'Fechar menu lateral':'Abrir menu lateral');
}

function closeMobileSidebar(){
  document.body.classList.remove('sidebar-open');
  syncSidebarState();
}

document.body.classList.remove('sidebar-collapsed');
try{localStorage.removeItem('afya-sidebar-collapsed');}catch(_){}
syncSidebarState();

sidebarCollapse.addEventListener('click', closeMobileSidebar);
sidebarMobileToggle.addEventListener('click', ()=>{
  document.body.classList.toggle('sidebar-open');
  syncSidebarState();
});
sidebarOverlay.addEventListener('click', closeMobileSidebar);
document.addEventListener('keydown', e=>{if(e.key==='Escape') closeMobileSidebar();});

document.getElementById('tabNav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
  activeTab = btn.dataset.tab;
  // Entrar na aba PI escreve o PI do quarter corrente na barra; sair apaga.
  // Quando isso acontece o recorte muda para TODAS as abas, e trocar de aba não
  // re-renderiza nada por conta própria — os painéis já estão no DOM.
  if(piSincronizarPiPadrao()){
    sincronizarFiltroNaTela('PI');
    renderAll();
  }
  syncFilterBarForTab();
  closeMobileSidebar();
  // Gráficos criados enquanto o painel estava oculto (display:none) nascem com
  // tamanho 0; ao ficar visível, forçamos um resize para eles se redesenharem.
  requestAnimationFrame(()=>{
    Object.values(chartsReg).forEach(c=>{ try{ c.resize(); }catch(_){} });
  });
});

/* ===================== Render orchestrator ===================== */
/**
 * Dois recortes percorrem todo o dashboard:
 *   f     — entrega no período (exige data de conclusão dentro do intervalo)
 *   atual — estado atual/planejamento (ignora o intervalo de datas)
 * Cada render recebe os dois e escolhe a base correta por métrica.
 */
function renderAll(){
  syncFilterBarForTab();
  const f = getFiltered();
  const atual = getFilteredNoDate();
  // Base sem o filtro de Tipo: usada pela aba de Bloqueios e pelo bloco de KPIs
  // de Entregas/WIP. Calculada uma vez — são ~17 mil itens por passada.
  const semTipo = getFilteredNoDate(SKIP_TIPO);
  renderPeriodo(f, atual);
  renderExec(f, atual);
  renderThroughput(f);
  renderSP(f, atual);
  // O segundo recorte serve só ao gráfico de tempo por status (ver SKIP_STATUS).
  renderFlow(f, getFiltered(SKIP_STATUS));
  // 3o argumento: base do bloco de KPIs, que ignora o filtro de Tipo.
  renderWip(f, atual, semTipo);
  renderBlock(getFiltered(SKIP_TIPO), semTipo);
  initSprintSelector();
  renderSprint();
  renderPiTracking();
  renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
  enhanceHelpTooltips();
}

/* Item 2 — mostra o intervalo de datas presente no recorte filtrado */
function renderPeriodo(f, atual){
  const el = document.getElementById('periodoDados');
  if(!el) return;
  const fmt = iso => { const [a,m,dd]=iso.split('-'); return `${dd}/${m}/${a}`; };
  const temPeriodo = !!(dateRange.from || dateRange.to);
  let prefixo = '';
  if(temPeriodo){
    const de = dateRange.from ? fmt(dateRange.from) : 'início';
    const ate = dateRange.to ? fmt(dateRange.to) : 'hoje';
    prefixo = `Filtro de conclusão: ${de} → ${ate} · `;
  }
  const concl = f.map(d=>d['Data Conclusao']).filter(Boolean).sort();
  if(!atual.length){ el.textContent = prefixo + 'sem dados no recorte atual'; return; }
  // Com período ativo, f contém só quem concluiu dentro dele; `atual` é o recorte
  // completo dos filtros da barra. Mostrar os dois evita leitura ambígua.
  let txt = prefixo + (temPeriodo
    ? `${f.length.toLocaleString('pt-BR')} concluídos no período · ${atual.length.toLocaleString('pt-BR')} itens no recorte`
    : `${atual.length.toLocaleString('pt-BR')} itens no recorte`);
  if(concl.length) txt += ` · conclusões de ${fmt(concl[0])} a ${fmt(concl[concl.length-1])}`;
  el.textContent = txt;
}

/* ===================== KPI card helper ===================== */
function kpiCard(
  eyebrow: unknown,
  value: unknown,
  unit: string | null = '',
  extraClass = '',
  delta: {cls: string; text: string} | null = null,
  titleAttr: unknown = null,
  drillKey: string | null = null,
): string {
  const clickable = drillKey ? ` kpi-clickable" data-drill="${drillKey}` : '';
  return `<div class="kpi ${extraClass||''}${clickable}"${titleAttr?` data-kpi-rule="${escapeHtml(String(titleAttr))}"`:''}>
    <span class="eyebrow">${eyebrow}</span>
    <div class="val">${value}${unit?`<span class="unit">${unit}</span>`:''}</div>
    ${delta?`<div class="delta ${delta.cls}">${delta.text}</div>`:''}
  </div>`;
}

function comparisonCard(kind, previousLabel, currentLabel, previousValue, currentValue){
  const diff=currentValue-previousValue;
  const pct=previousValue?Math.round(diff/previousValue*100):null;
  const max=Math.max(previousValue,currentValue,1);
  const previousWidth=Math.max(previousValue/max*100,previousValue?4:0);
  const currentWidth=Math.max(currentValue/max*100,currentValue?4:0);
  const trendClass=diff>=0?'up':'down';
  const trendIcon=diff>=0?'↑':'↓';
  const trendText=pct===null?`${trendIcon} ${Math.abs(diff)}`:`${trendIcon} ${Math.abs(pct)}%`;
  return `<article class="comparison-item">
    <div class="comparison-head"><span class="comparison-kind">${kind}</span><span class="comparison-trend ${trendClass}">${trendText}</span></div>
    <div class="comparison-period">${previousLabel}<span>→</span>${currentLabel}</div>
    <div class="comparison-value">${fmt0(currentValue)}<small>itens concluídos</small></div>
    <div class="comparison-bars">
      <div class="comparison-bar-row"><span>Anterior</span><span class="comparison-track"><i style="width:${previousWidth}%"></i></span><strong>${fmt0(previousValue)}</strong></div>
      <div class="comparison-bar-row current"><span>Atual</span><span class="comparison-track"><i style="width:${currentWidth}%"></i></span><strong>${fmt0(currentValue)}</strong></div>
    </div>
  </article>`;
}
