/* ===================== TAB: EXEC ===================== */
type OverviewCountGroup = [string, number];

interface FlowEfficiencyIssue extends DashboardIssue {
  _TempoValor: number;
  _TempoTotal: number;
  _Eficiencia: number;
  _Historico: 'Parcial' | 'Completo';
  _Decomposicao: string;
}

/* Status em que existe trabalho ativo/valor agregado. A comparação ignora
   caixa, acentos e espaços nas pontas para sobreviver às variações de cadastro
   do Jira (por exemplo, "Deploy em prod" x "Deploy em PROD"). */
const FLOW_VALUE_STATUSES = [
  'Revisão design', 'Refinamento de negócio', 'Refinamento técnico',
  'Desenvolvimento', 'EM ANDAMENTO', 'Deploy em staging',
  'Homologação integrada', 'Deploy em prod',
];
const flowStatusNorm = (value: unknown): string => String(value||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
const FLOW_VALUE_STATUS_SET = new Set(FLOW_VALUE_STATUSES.map(flowStatusNorm));
/* Backlog fica fora dos dois lados por decisão de negócio: o relógio desta
   eficiência começa quando o item deixa o estoque inicial do fluxo. */
const FLOW_EFFICIENCY_EXCLUDED_STATUS_SET = new Set(['Backlog'].map(flowStatusNorm));

function flowEfficiencyRows(base: DashboardIssue[]): FlowEfficiencyIssue[] {
  return (base||[]).filter(d=>d.Concluido && (d.TempoPorStatus||[]).length).map((d): FlowEfficiencyIssue | null=>{
    let valor=0, total=0;
    const partes: string[]=[];
    (d.TempoPorStatus||[]).forEach(p=>{
      const dias=Number(p&&p.dias);
      const status=p&&String(p.status||'').trim();
      if(!status || !(dias>0)) return;
      if(FLOW_EFFICIENCY_EXCLUDED_STATUS_SET.has(flowStatusNorm(status))) return;
      const agrega=FLOW_VALUE_STATUS_SET.has(flowStatusNorm(status));
      total+=dias;
      if(agrega) valor+=dias;
      partes.push(`${status}: ${fmt1(dias)} d (${agrega?'valor agregado':'espera'})`);
    });
    if(!(total>0)) return null;
    const historico: FlowEfficiencyIssue['_Historico'] = d.StatusHistoricoOk===false?'Parcial':'Completo';
    return Object.assign({}, d, {
      _TempoValor:Number(valor.toFixed(2)),
      _TempoTotal:Number(total.toFixed(2)),
      _Eficiencia:Number((valor/total*100).toFixed(1)),
      _Historico:historico,
      _Decomposicao:partes.join(' · '),
    });
  }).filter((row): row is FlowEfficiencyIssue => row !== null);
}

const FLOW_EFFICIENCY_DRAWER_COLS = [
  {k:'Chave',label:'Chave',link:true}, {k:'Resumo',label:'Resumo'},
  {k:'Squad',label:'Team'}, {k:'PI',label:'PI'},
  {k:'_TempoValor',label:'Valor agregado (d)'}, {k:'_TempoTotal',label:'Tempo total (d)'},
  {k:'_Eficiencia',label:'Eficiência (%)'}, {k:'_Historico',label:'Histórico'},
  {k:'_Decomposicao',label:'Decomposição por status'},
];

function renderExec(f: DashboardIssue[], atual: DashboardIssue[]): void {
  // f = concluídos no período; atual = recorte completo (estado atual/planejamento).
  const concl = f.filter(d=>d.Concluido);
  const total = atual.length;
  const cancel = atual.filter(d=>d.Cancelado).length;
  const ativos = total - cancel;
  const pct = ativos? (concl.length/ativos*100) : 0;
  // Ainda alimenta o gráfico planejado × concluído por PI; apenas os dois KPIs
  // de SP foram removidos da Visão Geral.
  const naoCancel = atual.filter(d=>!d.Cancelado);
  const leadVals = f.filter(d=>d.LeadTimeDias!=null).map(d=>Number(d.LeadTimeDias));
  const cycleVals = f.filter(d=>d.CycleTimeDias!=null).map(d=>Number(d.CycleTimeDias));
  const leadP85 = percentile(leadVals, 85);
  const cycleP85 = percentile(cycleVals, 85);
  // Razão de somas: todos os itens pesam pelos dias que efetivamente ocuparam o
  // fluxo. Numerador e denominador vêm da mesma cronologia de status.
  const eficRows=flowEfficiencyRows(f);
  const tempoValor=sum(eficRows,d=>d._TempoValor);
  const tempoTotal=sum(eficRows,d=>d._TempoTotal);
  const eficFluxo=tempoTotal>0 ? tempoValor/tempoTotal*100 : null;
  const eficEspera = eficFluxo!=null
    ? {cls:'flat', text:`${fmt1(100-eficFluxo)}% em espera`} : null;

  // Pendentes e Em andamento refletem o ESTADO ATUAL (ignoram o filtro de data,
  // respeitam os demais filtros). Concluídos respeita o período selecionado.
  const pendentes = atual.filter(d=>d.FaseFluxo==='Pendente').length;
  const andamento = atual.filter(d=>d.FaseFluxo==='Em andamento').length;
  const temPeriodo = !!(dateRange.from || dateRange.to);

  const statusPend = (window.__RULES_PENDING||[]).join(', ');
  const statusAnd  = (window.__RULES_INPROG||[]).join(', ');

  // Registro dos drills de cada KPI (issues por trás de cada número)
  const hojeFmt = (()=>{ const [a,m,d]=isoToday().split('-'); return `${d}/${m}/${a}`; })();
  Object.assign(__cardDrills, {
    pendentes: {title:`Backlog atual · posição em ${hojeFmt}`, issues: atual.filter(d=>d.FaseFluxo==='Pendente')},
    andamento: {title:`Itens em andamento · posição em ${hojeFmt}`, issues: atual.filter(d=>d.FaseFluxo==='Em andamento')},
    concluidos: {title: temPeriodo?'Concluídos no período':'Concluídos', issues: concl},
    lead: {title:'Itens com Lead Time (concluídos)', issues: f.filter(d=>d.LeadTimeDias!=null)},
    cycle: {title:'Itens com Cycle Time', issues: f.filter(d=>d.CycleTimeDias!=null)},
    eficiencia: {
      title:`Eficiência de Fluxo · ${fmt1(tempoValor)} d de valor / ${fmt1(tempoTotal)} d totais`,
      issues:eficRows, columns:FLOW_EFFICIENCY_DRAWER_COLS,
    },
  });

  const kpis = document.getElementById('exec-kpis');
  if (!kpis) throw new Error('KPIs da Visão Geral não encontrados.');
  kpis.innerHTML = [
    kpiCard('Backlog atual', fmt0(pendentes), 'itens', 'snapshot slate',
      {cls:'flat', text:`posição em ${hojeFmt}`}, 'Status considerados pendentes: '+statusPend, 'pendentes'),
    kpiCard('Itens em andamento', fmt0(andamento), 'itens', 'snapshot coral',
      {cls:'flat', text:`posição em ${hojeFmt}`}, 'Status em andamento: '+statusAnd, 'andamento'),
    kpiCard('Concluídos', fmt0(concl.length), 'itens', '',
      {cls:'up', text: temPeriodo ? 'no período filtrado' : pct.toFixed(0)+'% dos itens ativos'}, null, 'concluidos'),
    kpiCard('Lead Time (P85)', fmt1(leadP85), 'dias', 'amber', null, null, 'lead'),
    kpiCard('Cycle Time (P85)', fmt1(cycleP85), 'dias', 'amber', null, null, 'cycle'),
    kpiCard('Eficiência de Fluxo', fmt1(eficFluxo), '%', 'amber', eficEspera,
      'Tempo nos status de valor agregado dividido pelo tempo do changelog após o Backlog. Clique para auditar itens e status.', 'eficiencia'),
  ].join('');

  // Throughput mensal
  const months = sortedMonthKeys(concl, 'AnoMesConclusao');
  const monthCounts = months.map(m=> concl.filter(d=>d.AnoMesConclusao===m).length);
  upsertChart('chart-exec-throughput-month', {
    type:'line',
    data:{ labels:months.map(monthLabel), datasets:[{
      label:'Itens concluídos', data:monthCounts, borderColor:'#CE0058', backgroundColor:'rgba(27,143,134,.12)',
      fill:true, tension:.35, pointRadius:3, pointBackgroundColor:'#CE0058'
    }]},
    options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx: number)=>{
        const m = months[idx];
        return {title:`Concluídos em ${monthLabel(m)}`, issues: concl.filter(d=>d.AnoMesConclusao===m)};
      })}
  });
  // Planejado vem do recorte completo (não tem data de conclusão); concluído, do período.
  const pis = Array.from(new Set(atual.map(d=>d.PI))).sort();
  const spPlanByPi = pis.map(pi=> sum(naoCancel.filter(d=>d.PI===pi), d=>d['Story Points']));
  const spConclByPi = pis.map(pi=> sum(concl.filter(d=>d.PI===pi), d=>d['Story Points']));
  upsertChart('chart-exec-sp-pi', {
    type:'bar',
    data:{labels:pis, datasets:[
      {label:'Planejado', data:spPlanByPi, backgroundColor:'#F8CAD8', borderColor:'#FFFFFF', borderWidth:1, borderRadius:4},
      {label:'Concluído', data:spConclByPi, backgroundColor:'#CE0058', borderColor:'#FFFFFF', borderWidth:1, borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false, barLabels:true, barLabelStagger:true,
      barLabelFont:"700 9px 'Inter',sans-serif", layout:{padding:{top:32}},
      scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      plugins:{tooltip:{callbacks:{
        afterBody:(items: any[])=>{ const i=items[0].dataIndex; const plan=spPlanByPi[i]||0, conc=spConclByPi[i]||0, falta=Math.max(0,plan-conc); const p=plan?(conc/plan*100):0;
          return `Entregue ${fmt0(conc)} de ${fmt0(plan)} planejados (${p.toFixed(0)}%)\nNão entregue: ${fmt0(falta)}`; }
      }}},
      onClick: drillClick((idx: number, ds: number)=>{
        const pi = pis[idx];
        if(ds===1){ // Concluído
          return {title:`SP concluído · ${pi}`, issues: concl.filter(d=>d.PI===pi)};
        }
        return {title:`SP planejado · ${pi}`, issues: naoCancel.filter(d=>d.PI===pi)};
      })}
  });
  // Distribuições descrevem o recorte inteiro, não só o que concluiu no período.
  const tiposArr: OverviewCountGroup[] = Array.from(
    groupBy(atual, d=>String(d['Tipo de item'] || '(sem tipo)')),
    ([type, issues]): OverviewCountGroup => [type, issues.length],
  ).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-exec-tipo-donut', {
    type:'bar',
    data:{labels:tiposArr.map(x=>x[0]), datasets:[{data:tiposArr.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{
        const t = tiposArr[idx][0];
        return {title:`Tipo: ${t}`, issues: atual.filter(d=>(d['Tipo de item']||'(sem tipo)')===t)};
      })}
  });
  const statusCounts: OverviewCountGroup[] = Array.from(
    groupBy(atual, d=>String(d.Status ?? '')),
    ([status, issues]): OverviewCountGroup => [status, issues.length],
  ).sort((a,b)=>b[1]-a[1]);
  const top8 = statusCounts.slice(0,8);
  const outros = statusCounts.slice(8).reduce((a,c)=>a+c[1],0);
  const labels = top8.map(x=>x[0]).concat(outros>0?['Outros']:[]);
  const vals = top8.map(x=>x[1]).concat(outros>0?[outros]:[]);
  upsertChart('chart-exec-status-donut', {
    type:'bar',
    data:{labels, datasets:[{data:vals, backgroundColor:COLORS, borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true,
      layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx: number)=>{
        const lbl = labels[idx];
        if(lbl==='Outros'){
          const top8Set = new Set(top8.map(x=>x[0]));
          return {title:'Status: Outros (fora do top 8)', issues: atual.filter(d=>!top8Set.has(String(d.Status ?? '')))};
        }
        return {title:`Status: ${lbl}`, issues: atual.filter(d=>d.Status===lbl)};
      })}
  });

  // Comparativos
  const comparisons: string[] = [];
  if(months.length>=2){
    const cur = months[months.length-1], prev = months[months.length-2];
    const curN = concl.filter(d=>d.AnoMesConclusao===cur).length;
    const prevN = concl.filter(d=>d.AnoMesConclusao===prev).length;
    comparisons.push(comparisonCard('Comparativo mensal',monthLabel(prev),monthLabel(cur),prevN,curN));
  }
  // O PI já é um período em si: aplicar por cima a janela de conclusão faria os
  // PIs anteriores aparecerem com ~0 entregas. Este bloco usa as conclusões do
  // recorte inteiro, sem o filtro de datas.
  const atualConcl = atual.filter(d=>d.Concluido);
  const pisConcl = Array.from(new Set(atualConcl.map(d=>d.PI))).sort();
  if(pisConcl.length>=2){
    const piSorted = pisConcl;
    const curPi = piSorted[piSorted.length-1], prevPi = piSorted[piSorted.length-2];
    const curN = atualConcl.filter(d=>d.PI===curPi).length;
    const prevN = atualConcl.filter(d=>d.PI===prevPi).length;
    comparisons.push(comparisonCard('Comparativo por PI',prevPi,curPi,prevN,curN));
  }
  const comparisonBox = document.getElementById('exec-compare-box');
  if (!comparisonBox) throw new Error('Comparativos da Visão Geral não encontrados.');
  comparisonBox.innerHTML = comparisons.length
    ? `<div class="comparison-grid">${comparisons.join('')}</div>`
    : '<div class="comparison-empty">Dados insuficientes para comparar os períodos do recorte atual.</div>';
}
