/* ===================== TAB: THROUGHPUT ===================== */
type ThroughputGroup = [string, number];

function topNGroup(
  f: DashboardIssue[],
  key: string,
  n: number | null,
  filterFn?: (issue: DashboardIssue) => boolean,
): ThroughputGroup[] {
  const src = filterFn ? f.filter(filterFn) : f;
  const arr: ThroughputGroup[] = Array.from(
    groupBy(src, (issue) => String(issue[key] ?? '')),
    ([group, issues]): ThroughputGroup => [group, issues.length],
  ).sort((a, b) => b[1] - a[1]);
  return n? arr.slice(0,n) : arr;
}
function renderThroughput(f: DashboardIssue[]): void {
  const concl = f.filter(d=>d.Concluido);

  const bySquad = topNGroup(concl,'Squad',null).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-tp-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx: number)=>{ const v=bySquad[idx][0]; return {title:`Concluídos · Squad: ${v}`, issues: concl.filter(d=>d.Squad===v)}; })}
  });

  const byVS = topNGroup(concl,'VS',null).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-tp-vs', {
    type:'bar',
    data:{labels:byVS.map(x=>x[0]), datasets:[{data:byVS.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx: number)=>{ const v=byVS[idx][0]; return {title:`Concluídos · Value Stream: ${v}`, issues: concl.filter(d=>d.VS===v)}; })}
  });

  const byProg = topNGroup(concl,'Programa',null);
  upsertChart('chart-tp-programa', {
    type:'doughnut',
    data:{labels:byProg.map(x=>x[0]), datasets:[{data:byProg.map(x=>x[1]), backgroundColor:['#CE0058','#0057B8','#333333'], borderWidth:2, borderColor:'#fff'}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}}, tooltip:tooltipPct}, cutout:'55%',
      onClick: drillClick((idx: number)=>{ const v=byProg[idx][0]; return {title:`Concluídos · Programa: ${v}`, issues: concl.filter(d=>d.Programa===v)}; })}
  });

  const byPi = topNGroup(concl,'PI',null).sort((a,b)=>a[0].localeCompare(b[0]));
  upsertChart('chart-tp-pi', {
    type:'bar',
    data:{labels:byPi.map(x=>x[0]), datasets:[{data:byPi.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}, ticks:{font:{size:9}}}},
      onClick: drillClick((idx: number)=>{ const v=byPi[idx][0]; return {title:`Concluídos · PI: ${v}`, issues: concl.filter(d=>d.PI===v)}; })}
  });

  const byTipo: ThroughputGroup[] = Array.from(
    groupBy(concl, (issue) => String(issue['Tipo de item'] || '(sem tipo)')),
    ([group, issues]): ThroughputGroup => [group, issues.length],
  ).sort((a, b) => b[1] - a[1]);
  upsertChart('chart-tp-tipo', {
    type:'bar',
    data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const v=byTipo[idx][0]; return {title:`Concluídos · Tipo: ${v}`, issues: concl.filter(d=>(d['Tipo de item']||'(sem tipo)')===v)}; })}
  });

  // Empilhado mensal por tipo (desagrupado — todos os tipos crus)
  const months = sortedMonthKeys(concl,'AnoMesConclusao');
  const tipos = Array.from(
    groupBy(concl, (issue) => String(issue['Tipo de item'] || '(sem tipo)')),
    ([group, issues]): ThroughputGroup => [group, issues.length],
  ).sort((a, b) => b[1] - a[1]).map((group) => group[0]);
  const typeColors: Record<string, string> = {
    'Story':'#CE0058','História':'#CE0058','Enabler':'#0057B8','Melhoria':'#E13D72',
    'Technical Debt':'#7F8084','Bug':'#93004A','Bug hotfix':'#050505',
    'Sub-task':'#E97899','Sub-imp':'#EF9AB1','Sub-test':'#F8CAD8','Sub-bug':'#A30046',
    'Sub-block':'#333333','Sub-design':'#D0D0CF','Sub-script':'#003D82'
  };
  const datasets = tipos.map((t,i)=>({
    label:t, backgroundColor:typeColors[t]||COLORS[i % COLORS.length],
    borderColor:'#FFFFFF',borderWidth:1.5,borderRadius:4,borderSkipped:false,
    maxBarThickness:64, categoryPercentage:.84, barPercentage:.94,
    data: months.map(m=> concl.filter(d=>d.AnoMesConclusao===m && (d['Tipo de item']||'(sem tipo)')===t).length)
  }));
  upsertChart('chart-tp-month-stacked', {
    type:'bar',
    data:{labels:months.map(monthLabel), datasets},
    options:{responsive:true, maintainAspectRatio:false, stackTotals:true, stackSegmentLabels:true, layout:{padding:{top:18}}, interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom', labels:{font:{size:9.5}, usePointStyle:true, pointStyle:'rectRounded', boxWidth:8, padding:16}}},
      scales:{x:{stacked:true, grid:{display:false}, border:{display:false}}, y:{stacked:true, beginAtZero:true, grid:{color:'#E8EAED',drawTicks:false}, border:{display:false}, ticks:{padding:10}}},
      onClick: drillClick((idx: number, ds: number)=>{ const m=months[idx], t=tipos[ds];
        return {title:`Concluídos · ${monthLabel(m)} · ${t}`, issues: concl.filter(d=>d.AnoMesConclusao===m && (d['Tipo de item']||'(sem tipo)')===t)}; })}
  });

  // Compare table by squad: current vs previous month
  const tbody = document.querySelector<HTMLTableSectionElement>('#tp-compare-table tbody');
  if (!tbody) throw new Error('Tabela comparativa de throughput não encontrada.');
  if(months.length>=2){
    const cur = months[months.length-1], prev = months[months.length-2];
    const squads = Array.from(new Set(concl.map(d=>d.Squad))).sort();
    const rows = squads.map(sq=>{
      const curN = concl.filter(d=>d.Squad===sq && d.AnoMesConclusao===cur).length;
      const prevN = concl.filter(d=>d.Squad===sq && d.AnoMesConclusao===prev).length;
      return {sq, curN, prevN, diff:curN-prevN};
    }).filter(r=>r.curN>0||r.prevN>0).sort((a,b)=>b.curN-a.curN);
    tbody.innerHTML = rows.map(r=>`<tr><td>${r.sq}</td><td>${r.prevN}</td><td><b>${r.curN}</b></td>
      <td style="color:${r.diff>=0?'#A30046':'#D64545'};font-weight:600;">${r.diff>=0?'▲':'▼'} ${Math.abs(r.diff)}</td></tr>`).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--slate-soft);">Dados insuficientes (é necessário ao menos 2 meses com conclusões no recorte atual).</td></tr>';
  }
}

