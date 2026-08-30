/* ===================== TAB: BLOQUEIOS ===================== */
type BlockSquadRow = [string, number, number];
type BlockReasonRow = [string, number];
interface BlockParentAggregate {
  key: string;
  squad: string | undefined;
  soma: number;
  n: number;
  nMedidos: number;
  media: number | null;
}

function renderBlock(f: DashboardIssue[], atual: DashboardIssue[]): void {
  // Bloqueio em aberto não tem data de conclusão: sai de `atual`. Resolvidos e
  // tempo médio de bloqueio são entregas e seguem o período (f).
  const blocks = atual.filter(d=>d['Tipo de item']==='Sub-block');
  const abertos = blocks.filter(d=>!d.Concluido && !d.Cancelado);
  const resolvidos = f.filter(d=>d['Tipo de item']==='Sub-block' && d.Concluido);
  // Bloqueio cancelado não é bloqueio resolvido: o impedimento não foi tratado,
  // o item que ele travava é que saiu do caminho. Por isso fica num KPI próprio
  // em vez de somar com os resolvidos (o que leria como entrega) ou de ficar
  // invisível. Mesmo recorte de período dos resolvidos: os dois são desfechos.
  const cancelados = f.filter(d=>d['Tipo de item']==='Sub-block' && d.Cancelado);
  // Duração de um episódio de bloqueio = LEAD TIME do Sub-block: da criação até
  // a conclusão. Não é o Cycle Time (início real → fim real): ninguém "começa a
  // trabalhar" num bloqueio, ele nasce ativo, e 247 dos 445 Sub-blocks da base
  // não têm início real preenchido — por Cycle Time somavam 0 dia e deixavam 207
  // dos 290 itens zerados na tabela. É a mesma régua da tabela de abertos, que
  // conta da Criação. LeadTimeDias é null para quem não concluiu, então bloqueio
  // aberto ou cancelado conta como episódio sem somar dias.
  const dur = (issue: DashboardIssue): number => issue.LeadTimeDias != null ? Number(issue.LeadTimeDias) : 0;
  // Tempo em aberto de um bloqueio — regra PRÓPRIA, não é o Aging.
  // Um Sub-block nasce bloqueado no instante em que é criado e precisa ser tratado
  // de imediato, então a contagem parte da Criação. O Aging exige início real porque
  // lá o planejamento cria itens em lote no começo do quarter sem que sejam puxados —
  // premissa que não vale para bloqueio.
  const abertoHaDias = (issue: DashboardIssue): number | null => diasCorridosAteHoje(issue.Criado);
  // Média pela MESMA régua das somas acima (criação -> conclusão); medir a média
  // por Cycle Time e as somas por Lead Time faria a aba se contradizer.
  const tempoMedio = (()=>{ const v=resolvidos.filter(d=>d.LeadTimeDias!=null).map(d=>Number(d.LeadTimeDias)); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; })();
  const paisImpactados = new Set(blocks.map(d=>d.parentKey).filter(Boolean)).size;

  Object.assign(__cardDrills, {
    block_abertos: {title:'Bloqueios em aberto', issues: abertos},
    block_resolvidos: {title:'Bloqueios resolvidos', issues: resolvidos},
    block_cancelados: {title:'Bloqueios cancelados', issues: cancelados},
    block_todos: {title:'Todos os bloqueios (sub-blocks)', issues: blocks},
  });
  const kpis = document.getElementById('block-kpis');
  if (!kpis) throw new Error('KPIs de bloqueios não encontrados.');
  kpis.innerHTML = [
    kpiCard('Bloqueios abertos', fmt0(abertos.length), 'itens', 'coral', {cls:'flat', text:'posição atual'}, null, 'block_abertos'),
    kpiCard('Bloqueios resolvidos', fmt0(resolvidos.length), 'itens', '', null, null, 'block_resolvidos'),
    kpiCard('Bloqueios cancelados', fmt0(cancelados.length), 'itens', '',
      {cls:'flat', text:'não entram nos resolvidos'}, null, 'block_cancelados'),
    kpiCard('Tempo médio bloqueado', tempoMedio==null?'—':fmt1(tempoMedio), 'dias', 'amber', {cls:'flat', text:'dos resolvidos'}, null, null),
    kpiCard('Itens impactados', fmt0(paisImpactados), 'itens', '', {cls:'flat', text:'com ≥1 bloqueio'}, null, 'block_todos'),
  ].join('');

  // Tempo total bloqueado por Squad (resolvidos) — soma de dias; contagem no tooltip
  const bySquadMap = groupBy(resolvidos, (issue) => String(issue.Squad ?? ''));
  const bySquad: BlockSquadRow[] = Array.from(
    bySquadMap,
    ([squad, issues]): BlockSquadRow => [squad, issues.reduce((total, issue) => total + dur(issue), 0), issues.length],
  ).filter((row) => row[1] > 0).sort((a, b) => b[1] - a[1]);
  upsertChart('chart-block-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>+x[1].toFixed(1)), _counts:bySquad.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1', layout:{padding:{right:40}}, plugins:{legend:{display:false},
      tooltip:{callbacks:{label:(ctx: any)=>` ${fmt1(ctx.parsed.x)} dias · ${ctx.dataset._counts[ctx.dataIndex]} bloqueio(s)`}}},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=bySquad[idx][0]; return {title:`Bloqueios resolvidos · Squad: ${k}`, issues: resolvidos.filter(d=>d.Squad===k)}; })}
  });

  // Por Motivo de Bloqueio (resolvidos + abertos, todos os que têm motivo)
  const comMotivo = blocks.filter(d=>d.MotivoBloqueio);
  const byMotivoMap = groupBy(comMotivo, (issue) => String(issue.MotivoBloqueio));
  const byMotivo: BlockReasonRow[] = Array.from(
    byMotivoMap,
    ([reason, issues]): BlockReasonRow => [reason, issues.length],
  ).sort((a, b) => b[1] - a[1]);
  if(byMotivo.length){
    upsertChart('chart-block-motivo', {
      type:'bar',
      data:{labels:byMotivo.map(x=>x[0]), datasets:[{data:byMotivo.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, layout:{padding:{right:36}}, plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(ctx: any)=>` ${fmt0(ctx.parsed.x)} item(ns)`}}},
        scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
        onClick: drillClick((idx: number)=>{ const k=byMotivo[idx][0]; return {title:`Bloqueios · Motivo: ${k}`, issues: comMotivo.filter(d=>d.MotivoBloqueio===k)}; })}
    });
  } else {
    upsertChart('chart-block-motivo', {type:'bar', data:{labels:['(sem motivo preenchido)'], datasets:[{data:[0], backgroundColor:'#C4C4C4'}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{grid:{display:false}}}}});
  }

  // Tabela: bloqueios em aberto (mais tempo em aberto primeiro, contado da Criação)
  const abertosOrd = abertos.map(d=>({d, dias: abertoHaDias(d)}))
    .sort((a,b)=>(b.dias!=null?b.dias:-1)-(a.dias!=null?a.dias:-1));
  const openTable = document.querySelector<HTMLTableSectionElement>('#block-open-table tbody');
  if (!openTable) throw new Error('Tabela de bloqueios abertos não encontrada.');
  openTable.innerHTML = abertosOrd.length ? abertosOrd.map(({d, dias})=>`
    <tr>
      <td><a class="jira" href="${JIRA_BROWSE}${d.chave}" target="_blank" rel="noopener">${d.chave}</a>
          <span style="color:var(--slate-soft);font-size:11px;"> (${d.parentKey||'—'})</span></td>
      <td style="font-size:11.5px;">${d.Squad||'—'}</td>
      <td style="font-size:11.5px;">${d.MotivoBloqueio||'—'}</td>
      <td><b>${dias!=null?fmt0(dias):'—'}</b></td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhum bloqueio em aberto no recorte atual.</td></tr>';

  // Tabela: itens-pai por tempo MÉDIO de bloqueio, clicável.
  // Média e não soma porque os bloqueios de um mesmo item se sobrepõem no tempo:
  // somar contava o mesmo dia de calendário várias vezes e o DESC-143 aparecia
  // com 194 dias bloqueado tendo vivido 100 (17 episódios, 31 dias distintos).
  // O divisor é só o dos episódios MENSURÁVEIS: dividir pelo total faria um item
  // com um bloqueio resolvido e três abertos exibir um quarto da duração real.
  // `Nº bloqueios` continua contando todos, para casar com a lista do clique.
  const porPai = new Map<string, BlockParentAggregate>();
  blocks.forEach(d=>{
    const key = String(d.parentKey || d.chave);
    if(!porPai.has(key)) porPai.set(key, {key, squad:d.Squad, soma:0, n:0, nMedidos:0, media:null});
    const o = porPai.get(key)!; o.n += 1;
    if(d.LeadTimeDias!=null){ o.soma += d.LeadTimeDias; o.nMedidos += 1; }
  });
  porPai.forEach(o=>{ o.media = o.nMedidos ? o.soma/o.nMedidos : null; });
  const paisArr = Array.from(porPai.values())
    .sort((a,b)=>(b.media==null?-1:b.media)-(a.media==null?-1:a.media)).slice(0,20);
  paisArr.forEach(p=>{ __cardDrills['blockpai_'+p.key] = {title:`Bloqueios do item ${p.key}`, issues: blocks.filter(d=>(d.parentKey||d.chave)===p.key)}; });
  const parentTable = document.querySelector<HTMLTableSectionElement>('#block-parent-table tbody');
  if (!parentTable) throw new Error('Tabela de itens bloqueados não encontrada.');
  parentTable.innerHTML = paisArr.length ? paisArr.map(p=>`
    <tr data-drill="blockpai_${p.key}" style="cursor:pointer;" data-help="Clique para abrir os bloqueios vinculados a este item.">
      <td><a class="jira" href="${JIRA_BROWSE}${p.key}" target="_blank" rel="noopener">${p.key}</a></td>
      <td style="font-size:11.5px;">${p.squad||'—'}</td>
      <td>${p.n}</td>
      <td><b>${p.media==null?'—':fmt1(p.media)}</b></td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhum bloqueio no recorte atual.</td></tr>';
}

