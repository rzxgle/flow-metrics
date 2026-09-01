/* ===================== Chart registry ===================== */
// Chart.js chega por CDN e, portanto, nao oferece tipos ao compilador deste
// bundle. O tipo dinamico fica confinado a esta fronteira de integracao.
type ChartDynamicObject = Record<string, any>;

interface ChartBarElement {
  x: number;
  y: number;
  base: number;
}

const chartsReg: Record<string, ChartDynamicObject> = {};

function chartHexRgb(hex: unknown): [number, number, number] | null {
  const value=String(hex||'').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];
}
function applyChartDesign(
  config: ChartDynamicObject,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): ChartDynamicObject {
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

  const scales = (options.scales || {}) as Record<string, ChartDynamicObject>;
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

  const datasets = (config.data?.datasets || []) as ChartDynamicObject[];
  datasets.forEach((dataset: ChartDynamicObject)=>{
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
function upsertChart(id: string, config: ChartDynamicObject): ChartDynamicObject | null {
  const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  if(!canvas) return null;
  if(chartsReg[id]){ chartsReg[id].destroy(); }
  const ctx=canvas.getContext('2d');
  if(!ctx) return null;
  chartsReg[id] = new Chart(ctx, applyChartDesign(config,ctx,canvas));
  return chartsReg[id];
}
const baseFont = {family:"'Inter',sans-serif", size:11};
Chart.defaults.font = baseFont;
Chart.defaults.color = '#71717A';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;

/* ===== Item 12: rótulos valor + % ===== */
function donutLegendPct(chart: ChartDynamicObject): ChartDynamicObject[] {
  const ds = chart.data.datasets[0];
  const total = (ds.data as unknown[]).reduce((sum: number,value: unknown)=>sum+(Number(value)||0),0) || 1;
  return (chart.data.labels as unknown[]).map((lab: unknown,i: number)=>{
    const v = +ds.data[i]||0;
    const pct = (v/total*100).toFixed(0);
    return { text:`${lab} — ${fmt0(v)} (${pct}%)`, fillStyle:ds.backgroundColor[i], strokeStyle:ds.backgroundColor[i], lineWidth:0, hidden:false, index:i };
  });
}
const tooltipPct = {
  callbacks:{
    label(ctx: ChartDynamicObject): string {
      const arr = ctx.dataset.data as unknown[];
      const total = arr.reduce((sum: number,value: unknown)=>sum+(Number(value)||0),0) || 1;
      let v = ctx.parsed;
      if(v && typeof v==='object') v = (v.x!=null? v.x : v.y);
      v = +v||0;
      const pct = (v/total*100).toFixed(0);
      return ` ${fmt0(v)} (${pct}%)`;
    }
  }
};
function donutPctOptions(extra?: ChartDynamicObject): ChartDynamicObject {
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
const BAR_PCT_IDS = new Set<string>(['chart-tp-squad','chart-tp-vs','chart-wip-entregas-squad','chart-wip-entregas-vs','chart-wip-status','chart-wip-squad','chart-flow-lead-hist','chart-flow-cycle-hist','chart-wip-aging-hist','chart-cancel-month','chart-cancel-squad']);
const barPctPlugin = {
  id:'barPct',
  afterDatasetsDraw(chart: ChartDynamicObject): void {
    const cid = chart.canvas && chart.canvas.id;
    if(!chart.options.barPct && !BAR_PCT_IDS.has(cid)) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data as unknown[];
    const total = data.reduce((sum: number,value: unknown)=>sum+(Number(value)||0),0) || 1;
    ctx.save();
    ctx.font = "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    (meta.data as ChartBarElement[]).forEach((bar: ChartBarElement,i: number)=>{
      let v = data[i];
      if(v && typeof v==='object'){
        const point = v as {x?: unknown; y?: unknown};
        v = point.x!=null ? point.x : point.y;
      }
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
  afterDatasetsDraw(chart: ChartDynamicObject): void {
    if(!chart.options.barLabels) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    // IMPORTANTE: não usar função em options (Chart.js trataria como "scriptable"
    // e a invocaria com um objeto de contexto). Usamos uma string de formato.
    const fmtKind = chart.options.barLabelFmt;
    // 'sp' = Story Points: mostra decimal só quando existe (40 · 8,5 · 0,5). Nem
    // fmt0 (arredondaria 0,5 para 1) nem fmt1 (poluiria com "40,0") servem aqui.
    const fmt = fmtKind === 'sp' ? ((v: number)=>(Math.round(v*10)/10).toLocaleString('pt-BR'))
      : fmtKind === 'd1' ? ((v: number)=>fmt1(v)) : ((v: number)=>fmt0(v));
    ctx.save();
    // Barras agrupadas ficam estreitas; deixar a fonte configurável evita rótulo
    // sobrepondo rótulo quando há três séries por sprint.
    ctx.font = chart.options.barLabelFont || "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    (chart.data.datasets as ChartDynamicObject[]).forEach((ds: ChartDynamicObject,di: number)=>{
      const meta = chart.getDatasetMeta(di);
      if(meta.hidden) return;
      // Só BARRA ganha rótulo. Num gráfico misto (barras + linha de tendência),
      // rotular também a linha põe dois números quase iguais um sobre o outro em
      // cada mês — e o de cima é a média móvel, que ninguém pediu para ler ponto
      // a ponto. Nenhum gráfico com barLabels tinha linha antes disto.
      if(meta.type === 'line') return;
      (meta.data as ChartBarElement[]).forEach((bar: ChartBarElement,i: number)=>{
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
  afterDatasetsDraw(chart: ChartDynamicObject): void {
    if(!chart.options.stackTotals) return;
    const ctx=chart.ctx;
    ctx.save();
    if(chart.options.stackSegmentLabels){
      (chart.data.datasets as ChartDynamicObject[]).forEach((ds: ChartDynamicObject,di: number)=>{
        if(!chart.isDatasetVisible(di)) return;
        const color=String(ds.backgroundColor||'');
        const hex=color.match(/^#([0-9a-f]{6})$/i)?.[1];
        const rgb=hex?[0,2,4].map(pos=>parseInt(hex.slice(pos,pos+2),16)):null;
        const luminance=rgb?(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114):0;
        ctx.fillStyle=luminance>165?'#27272A':'#FFFFFF';
        ctx.font="750 9.5px 'Inter',sans-serif";
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        (chart.getDatasetMeta(di).data as ChartBarElement[]).forEach((bar: ChartBarElement,i: number)=>{
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
    (chart.data.labels as unknown[]).forEach((_: unknown,i: number)=>{
      let total=0;
      let topBar: ChartBarElement | null = null;
      (chart.data.datasets as ChartDynamicObject[]).forEach((ds: ChartDynamicObject,di: number)=>{
        if(!chart.isDatasetVisible(di)) return;
        const value=Number(ds.data[i])||0;
        total+=value;
        if(value>0) topBar=chart.getDatasetMeta(di).data[i] as ChartBarElement;
      });
      if(topBar&&total){
        const bar = topBar as ChartBarElement;
        ctx.fillText(fmt0(total),bar.x,bar.y-7);
      }
    });
    ctx.restore();
  }
};
Chart.register(stackTotalsPlugin);
