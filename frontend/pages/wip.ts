/* ===================== TAB: WIP / ENTREGAS / AGING ===================== */
/**
 * @param f          recorte geral com período (alimenta os GRÁFICOS de entrega)
 * @param atual      recorte geral sem período (WIP, Aging, cancelados)
 * @param baseSemTipo recorte SEM o filtro de Tipo e sem período (bloco de KPIs)
 *
 * O BLOCO DE KPIs IGNORA O FILTRO DE TIPO, e por isso recebe uma base própria.
 * Cada card já traz o seu recorte de tipo no nome (Épico / nível história /
 * Sub-task), então o filtro da barra só podia subtrair: o padrão dele são os
 * tipos crus `Enabler`, `Melhoria`, `Story` e `Technical Debt`, onde não existe
 * um único Epic nem um único subitem — "Épicos entregues" e "Sub-tasks
 * concluídas" vinham ZERO em todo recorte padrão, com 8.768 sub-tasks
 * concluídas na base. Mesma decisão já tomada na aba de Bloqueios, que também
 * usa SKIP_TIPO. Os outros filtros (Squad, VS, PI, Programa, Status) e a janela
 * de datas continuam valendo nos KPIs.
 *
 * Os gráficos abaixo dos KPIs seguem no recorte geral `f`, ou seja, ainda
 * obedecem ao filtro de Tipo — a legenda de cada um diz isso.
 */
type WipCountGroup = [string, number];
type WipAgingGroup = [string, number, number];

function groupWipCount(items: DashboardIssue[], key: string): WipCountGroup[] {
  return Array.from(
    groupBy(items, (issue) => String(issue[key] ?? '')),
    ([group, issues]): WipCountGroup => [group, issues.length],
  ).sort((a, b) => b[1] - a[1]);
}

function renderWip(f: DashboardIssue[], atual: DashboardIssue[], baseSemTipo?: DashboardIssue[]): void {
  // Entregas seguem o período (f); WIP e Aging são foto de hoje e usam `atual`
  // — item em aberto não tem data de conclusão e sumiria do recorte por período.
  const concl = f.filter(d=>d.Concluido);
  const wipItems = atual.filter(d=>d.WIP);

  /* Base dos KPIs: sem filtro de Tipo, com a janela aplicada sobre a data
     EFETIVA de entrega (ver dataEntregaEfetiva — é o que resgata o épico). */
  const kpiBase = (baseSemTipo || f).filter(dentroDoPeriodoDeEntrega);
  const entregues = kpiBase.filter(d=>d.Concluido);
  const doGrupo = (arr: DashboardIssue[], group: string): DashboardIssue[] =>
    arr.filter((issue) => issue['Tipo Agrupado'] === group);
  const epicosEntregues = doGrupo(entregues, 'Épico');
  const historiasEntregues = entregues.filter(d=>GRUPOS_NIVEL_HISTORIA.includes(d['Tipo Agrupado']));
  const subtasksEntregues = doGrupo(entregues, 'Sub-task');

  /* Quantos épicos só entraram por causa do fallback de changelog. Vira o
     subtítulo do card: é a informação que explica o número, no lugar do antigo
     'N c/ status "Concluído"' — que sempre repetia o próprio KPI, porque
     EntregueAmplo e Concluido são o MESMO predicado
     (broadlyDeliveredStatuses === doneStatuses, 0 divergências na base). */
  const epicosPorChangelog = epicosEntregues.filter(d=>!d['Data Conclusao']).length;
  /* Composição do card de histórias, só os grupos com item no recorte. */
  const composicaoHistorias = GRUPOS_NIVEL_HISTORIA
    .map((group): [string, number] => [group, doGrupo(historiasEntregues, group).length])
    .filter(par=>par[1]>0)
    .map(par=>`${fmt0(par[1])} ${par[0]}`)
    .join(' · ');

  /* % conclusão geral. Duas regras, e as duas foram correções de leitura:

     1) SÓ O NÍVEL HISTÓRIA (o mesmo recorte do card de Histórias entregues, por
        isso o numerador é literalmente `historiasEntregues`). Antes o
        indicador somava TODOS os grupos, e subitem é 4x o volume de tudo o
        resto: medido na base, Sub-task fechava 2.654 dos 3.434 itens da janela
        com 82% de conclusão, contra 67% de História — o agregado ia a 77%
        falando quase só de subitem. Restrito ao nível história dá 69%, que é o
        nível em que o time planeja e se compromete.

     2) MESMA BASE NOS DOIS LADOS: dos itens que FECHARAM no período, quantos
        fecharam como concluídos. Os cancelados entram no denominador de
        propósito — são o contraponto do indicador. Antes o numerador tinha a
        janela de datas e o denominador NÃO tinha, então o percentual caía só
        por estreitar o período (medido: 16%). Sem janela selecionada, o recorte
        é a base inteira e o indicador vira "quanto do nível história já foi
        concluído". */
  const pctBase = kpiBase.filter(d=>GRUPOS_NIVEL_HISTORIA.includes(d['Tipo Agrupado']));
  const canceladosNoPeriodo = pctBase.filter(d=>d.Cancelado).length;
  const pctGeral = pctBase.length ? (historiasEntregues.length/pctBase.length*100) : 0;

  Object.assign(__cardDrills, {
    wip_epicos: {title:'Épicos entregues no período', issues: epicosEntregues},
    wip_historias: {title:`Nível história entregue no período (${GRUPOS_NIVEL_HISTORIA.join(', ')})`, issues: historiasEntregues},
    wip_subtasks: {title:'Sub-tasks concluídas no período', issues: subtasksEntregues},
    wip_concl: {title:'Nível história fechado no período (base do % de conclusão)', issues: pctBase},
    wip_total: {title:'WIP total (em aberto)', issues: wipItems},
  });
  const kpis = document.getElementById('wip-kpis');
  if (!kpis) throw new Error('KPIs de WIP não encontrados.');
  kpis.innerHTML = [
    kpiCard('Épicos entregues', fmt0(epicosEntregues.length), null, '',
      epicosPorChangelog?{cls:'flat', text:`${fmt0(epicosPorChangelog)} pela data de changelog`}:null,
      'Épicos concluídos com entrega no período. Sem Data de Fim Real, usa a 1a transição para a categoria Done (changelog). Ignora o filtro de Tipo.',
      'wip_epicos'),
    kpiCard('Histórias entregues', fmt0(historiasEntregues.length), null, '',
      composicaoHistorias?{cls:'flat', text:composicaoHistorias}:null,
      'Nível história: História, Enabler e Débito Técnico. Bug e Dependência ficam fora. Ignora o filtro de Tipo.',
      'wip_historias'),
    kpiCard('Sub-tasks concluídas', fmt0(subtasksEntregues.length), '', '', null,
      'Subitens concluídos com data de entrega no período. Ignora o filtro de Tipo.',
      'wip_subtasks'),
    kpiCard('% conclusão geral', pctGeral.toFixed(0), '%', '',
      {cls:'flat', text:`${fmt0(historiasEntregues.length)} de ${fmt0(pctBase.length)} do nível história${canceladosNoPeriodo?` · ${fmt0(canceladosNoPeriodo)} cancelados`:''}`},
      'Só o nível história (o recorte do card ao lado): dos que fecharam no período, quantos fecharam como concluídos. Subitem fica fora, e cancelado entra no denominador.',
      'wip_concl'),
    kpiCard('WIP total', fmt0(wipItems.length), 'itens', 'coral', null, null, 'wip_total'),
  ].join('');

  function entregasPor(key: string): WipCountGroup[] {
    return groupWipCount(concl, key);
  }
  const eqSquad = entregasPor('Squad').slice(0,14).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-entregas-squad', {
    type:'bar',
    data:{labels:eqSquad.map(x=>x[0]), datasets:[{data:eqSquad.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=eqSquad[idx][0]; return {title:`Concluídos · Squad: ${k}`, issues: concl.filter(d=>d.Squad===k)}; })}
  });
  const eqVs = entregasPor('VS').sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-entregas-vs', {
    type:'bar',
    data:{labels:eqVs.map(x=>x[0]), datasets:[{data:eqVs.map(x=>x[1]), backgroundColor:'#D98E3B', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx: number)=>{ const k=eqVs[idx][0]; return {title:`Concluídos · VS: ${k}`, issues: concl.filter(d=>d.VS===k)}; })}
  });
  const eqProg = entregasPor('Programa');
  upsertChart('chart-wip-entregas-programa', {
    type:'doughnut',
    data:{labels:eqProg.map(x=>x[0]), datasets:[{data:eqProg.map(x=>x[1]), backgroundColor:['#CE0058','#333333'], borderWidth:2, borderColor:'#fff'}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}}, tooltip:tooltipPct}, cutout:'55%',
      onClick: drillClick((idx: number)=>{ const k=eqProg[idx][0]; return {title:`Concluídos · Programa: ${k}`, issues: concl.filter(d=>d.Programa===k)}; })}
  });

  const wipStatus = groupWipCount(
    wipItems.filter((issue) => String(issue.Status).toLowerCase() !== 'backlog'),
    'Status',
  ).slice(0, 15);
  upsertChart('chart-wip-status', {
    type:'bar',
    data:{labels:wipStatus.map(x=>x[0]), datasets:[{data:wipStatus.map(x=>x[1]), backgroundColor:'#8AA0B0', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=wipStatus[idx][0]; return {title:`WIP · Status: ${k}`, issues: wipItems.filter(d=>d.Status===k)}; })}
  });
  const wipSquad = groupWipCount(wipItems, 'Squad').slice(0, 15);
  upsertChart('chart-wip-squad', {
    type:'bar',
    data:{labels:wipSquad.map(x=>x[0]), datasets:[{data:wipSquad.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=wipSquad[idx][0]; return {title:`WIP · Squad: ${k}`, issues: wipItems.filter(d=>d.Squad===k)}; })}
  });

  // Aging exige Data de início real (AgingDias vem null quando ela não existe).
  const agingWip = wipItems.filter(d=>d.AgingDias!=null && d.AgingDias>=0);
  const semInicioReal = wipItems.filter(d=>!d['Data Inicio Real']);
  const capAging = document.getElementById('cap-aging-hist');
  if(capAging){
    capAging.innerHTML = `Dias desde a Data de início real até hoje. Considera ${fmt0(agingWip.length)} de ${fmt0(wipItems.length)} itens em WIP`
      + (semInicioReal.length ? ` — <span class="drill-inline" data-drill="wip_sem_inicio" style="cursor:pointer;text-decoration:underline;">${fmt0(semInicioReal.length)} sem início real</span> ficam fora.` : '.');
  }
  __cardDrills.wip_sem_inicio = {title:'WIP sem Data de início real (fora do Aging)', issues: semInicioReal};
  const agingVals = agingWip.map((issue) => Number(issue.AgingDias));
  const agingHist = histogramBins(agingVals, 12);
  upsertChart('chart-wip-aging-hist', {
    type:'bar',
    data:{labels:agingHist.labels, datasets:[{data:agingHist.counts, backgroundColor:'#D98E3B', borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}, ticks:{font:{size:9}}}},
      onClick: drillClick((idx: number)=>{ const bs=agingHist.binSize ?? 1, lo=idx*bs, hi=(idx+1)*bs, last=idx===agingHist.counts.length-1;
        return {title:`WIP · Aging ${agingHist.labels[idx]}`, issues: agingWip.filter(d=> d.AgingDias>=lo && (last || d.AgingDias<hi))}; })}
  });

  const agingSquad: WipAgingGroup[] = Array.from(
    groupBy(wipItems.filter(d=>d.AgingDias!=null && d.AgingDias>=0), d=>String(d.Squad ?? '')),
    ([squad, issues]): WipAgingGroup => [squad, mean(issues.map(d=>Number(d.AgingDias))) ?? 0, issues.length],
  )
    .filter(x=>x[2]>=2).sort((a,b)=>b[1]-a[1]).slice(0,10).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-aging-squad', {
    type:'bar',
    data:{labels:agingSquad.map(x=>x[0]), datasets:[{data:agingSquad.map(x=>x[1].toFixed(1)), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx: number)=>{ const k=agingSquad[idx][0]; return {title:`WIP em aberto · Squad: ${k}`, issues: agingWip.filter(d=>d.Squad===k)}; })}
  });

  // Cancelados são estado atual: o cancelamento não gera data de conclusão.
  renderCancelados(atual);
}

