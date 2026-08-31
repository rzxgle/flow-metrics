/* ===================== TAB: DEPENDÊNCIAS ===================== */
type DependencyRole = 'ambos' | 'demandante' | 'dependente';
type DependencyQueueStatus = 'abertas' | 'concluidas' | 'canceladas';

interface DependencyRoleOption {
  v: DependencyRole;
  label: string;
}

interface DependencyLink {
  k: string;
  t?: string;
  s?: string;
}

interface DependencyIssue extends DashboardIssue {
  EhDependencia?: boolean;
  DepDependente?: string;
  DepDemandante?: string;
  DepExterno?: boolean;
  DepLinks?: DependencyLink[];
  DepEscopo?: string;
  Cancelado?: boolean;
  Concluido?: boolean;
  LeadTimeDias?: number | null;
  Criado?: unknown;
  AnoMesCriacao?: string;
  AnoMesConclusao?: string;
}

interface DependencyQueueRow {
  id: string;
  label: string;
  abertas: number;
  concluidas: number;
  canceladas: number;
  todas: DependencyIssue[];
}

interface DependencyTimeRow {
  id: string;
  label: string;
  media: number;
  n: number;
  todas: DependencyIssue[];
}

interface DependencyImpactRow {
  chave: string;
  tipo?: string;
  status?: string;
  total: number;
  abertas: number;
  deps: DependencyIssue[];
}

function requireDependencyElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Elemento de Dependências não encontrado: ${selector}`);
  return element as T;
}

function dependencyById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento de Dependências não encontrado: #${id}`);
  return element as T;
}
/**
 * Recorte próprio da aba.
 *   - `Tipo de item` sai porque a aba É de um tipo só: mantê-lo esvaziaria tudo,
 *     já que o recorte padrão da barra (Enabler/Melhoria/Story/Technical Debt)
 *     não inclui Dependência.
 *   - `Squad` sai porque aqui uma squad tem DOIS papéis, quem pediu e de quem se
 *     depende. Quem resolve isso são os seletores da própria aba, e o valor
 *     comparado é o id canônico, não o nome cru do campo Team — a mesma squad
 *     aparece como "Squad Core - Core Features" no Team e "Core Features" no
 *     Time Demandante.
 */
const SKIP_DEP = new Set<string>(['Tipo de item','Squad']);
/* Ids canônicos das squads selecionadas. Vazio = todas, mesma convenção dos
   demais filtros da barra. É um Set, e não um valor único, porque a pergunta
   natural aqui é comparar duas ou três squads entre si.
   (Na tela o filtro se chama "Squad", como nas outras abas; o catálogo que
   traduz id -> rótulo chega do backend em `meta.dependencyTeams`.) */
const depSquads = new Set<string>();
let depRole: DependencyRole = 'ambos';
const DEP_ROLES: readonly DependencyRoleOption[] = [
  {v:'ambos', label:'Ambos'},
  {v:'demandante', label:'Demandante (quem pediu)'},
  {v:'dependente', label:'Dependente (de quem se depende)'},
];

/** id canônico -> rótulo. O catálogo vem uma vez no meta do payload. */
function depTeamLabel(id: unknown): string {
  const key = String(id || '');
  if(!key) return 'Não informado';
  return (window.__DEP_TEAMS && window.__DEP_TEAMS[key]) || key;
}

/**
 * Idade de uma dependência em dias, pela mesma régua de um bloqueio: da
 * ABERTURA até a conclusão, ou até hoje enquanto estiver aberta — uma
 * dependência nasce ativa, ninguém "começa a trabalhar" nela.
 *
 * Calculada aqui, e não no servidor, pelo mesmo motivo do AgingDias: o snapshot
 * em cache pode ser de dias atrás e congelaria o envelhecimento.
 *
 * Cancelada devolve null: o episódio conta nas contagens, os dias não, porque
 * cancelar significa que a dependência deixou de ser necessária — e não que ela
 * levou aquele tempo para ser resolvida.
 */
function depIdadeDias(d: DependencyIssue): number | null {
  if(d.Cancelado) return null;
  if(d.Concluido) return d.LeadTimeDias!=null ? Math.round(d.LeadTimeDias) : null;
  return diasCorridosAteHoje(d.Criado);
}

/**
 * Aplica os filtros da aba (time + papel) a uma dependência.
 *
 * Com vários times marcados vale QUALQUER um deles, como nos demais filtros da
 * barra. O papel decide de que lado o time é procurado — e é por isso que este
 * filtro não podia ser o `Squad` global: lá a comparação é com o nome cru do
 * campo Team, que só cobre o lado dependente.
 */
function depMatchTeam(d: DependencyIssue): boolean {
  if(!depSquads.size) return true;
  const comoDependente = depSquads.has(d.DepDependente || '');
  const comoDemandante = depSquads.has(d.DepDemandante || '');
  if(depRole==='dependente') return comoDependente;
  if(depRole==='demandante') return comoDemandante;
  return comoDependente || comoDemandante;
}

/** Recorte de estado atual da aba — usado também pelo botão "Ver dependências". */
function depRecorte(): DependencyIssue[] {
  return getFilteredNoDate(SKIP_DEP)
    .filter((d): d is DependencyIssue => Boolean(d.EhDependencia) && depMatchTeam(d));
}

/**
 * Constrói os dois filtros da aba de Dependências dentro da barra global, com o
 * mesmo mecanismo dos demais (`.dropdown` / `.dd-btn` / `.dd-panel`).
 *
 * O primeiro se chama "Squad" na tela, como nas outras abas — é o mesmo conceito.
 * O que muda é a comparação: aqui ela é feita pelo id canônico e leva o papel em
 * conta, e não pelo nome cru do campo Team, que só cobre o lado dependente. Por
 * isso o filtro global `Squad` fica escondido nesta aba, e este entra no lugar.
 *
 * Eles ficam na barra, e não no cabeçalho do painel, porque é ali que se procura
 * filtro — e assim herdam de graça o clique-fora, o contador no botão e o resumo
 * de "filtros ativos". Nas outras abas o CSS os esconde.
 *
 * Time é de seleção MÚLTIPLA (checkbox, como Squad ou PI); Papel é de seleção
 * ÚNICA (`.dd-item.single`, como o seletor de sprint), porque os três valores se
 * excluem: marcar "demandante" e "dependente" ao mesmo tempo é o "ambos".
 */
function buildDepFilters(controls: HTMLElement): void {
  const cat = window.__DEP_TEAMS || {};
  const usados = new Set<string>();
  DATA.forEach(d=>{
    if(!d.EhDependencia) return;
    if(d.DepDependente) usados.add(String(d.DepDependente));
    if(d.DepDemandante) usados.add(String(d.DepDemandante));
  });
  // Squad que sumiu da base (mudou de recorte, mudou de PI) não pode continuar
  // filtrando por baixo dos panos: o dropdown não a mostraria mais.
  Array.from(depSquads).forEach(id=>{ if(!usados.has(id)) depSquads.delete(id); });
  const opcoes = Array.from(usados).map((id): [string, string]=>[id, cat[id]||id])
    .sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));

  /* ---- Squad (múltipla) ---- */
  const wrapSquad = document.createElement('div');
  wrapSquad.className = 'dropdown';
  wrapSquad.id = 'dd-depSquad';
  const btnSquad = document.createElement('button');
  btnSquad.className = 'dd-btn';
  btnSquad.innerHTML = '<span>Squad</span><span class="count" style="display:none">0</span>';
  const panelSquad = document.createElement('div');
  panelSquad.className = 'dd-panel';
  const buscaSquad = document.createElement('input');
  buscaSquad.className = 'dd-search';
  buscaSquad.placeholder = 'Buscar...';
  panelSquad.appendChild(buscaSquad);
  const listaSquad = document.createElement('div');
  listaSquad.className = 'dd-list';
  if(opcoes.length){
    opcoes.forEach(([id,label])=>{
      const item = document.createElement('label');
      item.className = 'dd-item';
      item.innerHTML = `<input type="checkbox" value="${escapeHtml(id)}" ${depSquads.has(id)?'checked':''}> <span>${escapeHtml(label)}</span>`;
      listaSquad.appendChild(item);
    });
  } else {
    listaSquad.innerHTML = '<div class="dd-empty">Nenhuma dependência na base.</div>';
  }
  panelSquad.appendChild(listaSquad);
  const acoesSquad = document.createElement('div');
  acoesSquad.className = 'dd-actions';
  acoesSquad.innerHTML = '<button data-act="all">Todos</button><button data-act="none">Limpar</button>';
  panelSquad.appendChild(acoesSquad);
  wrapSquad.appendChild(btnSquad);
  wrapSquad.appendChild(panelSquad);
  controls.appendChild(wrapSquad);
  atualizarBotaoDepSquad(btnSquad);

  btnSquad.addEventListener('click', (e)=>{
    e.stopPropagation();
    document.querySelectorAll('.dd-panel.open').forEach(p=>{ if(p!==panelSquad) p.classList.remove('open'); });
    panelSquad.classList.toggle('open');
  });
  buscaSquad.addEventListener('click', e=>e.stopPropagation());
  buscaSquad.addEventListener('input', ()=>{
    const q = buscaSquad.value.toLowerCase();
    listaSquad.querySelectorAll<HTMLElement>('.dd-item').forEach(it=>{
      it.style.display = (it.textContent || '').toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
  listaSquad.addEventListener('click', e=>e.stopPropagation());
  listaSquad.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) depSquads.add(cb.value); else depSquads.delete(cb.value);
      atualizarBotaoDepSquad(btnSquad);
      renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
    });
  });
  requireDependencyElement<HTMLButtonElement>(acoesSquad, '[data-act="all"]').addEventListener('click', (e)=>{
    e.stopPropagation();
    listaSquad.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{ cb.checked=true; depSquads.add(cb.value); });
    atualizarBotaoDepSquad(btnSquad);
    renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
  });
  requireDependencyElement<HTMLButtonElement>(acoesSquad, '[data-act="none"]').addEventListener('click', (e)=>{
    e.stopPropagation();
    listaSquad.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{ cb.checked=false; });
    depSquads.clear();
    atualizarBotaoDepSquad(btnSquad);
    renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
  });

  /* ---- Papel (única) ---- */
  const wrapPapel = document.createElement('div');
  wrapPapel.className = 'dropdown';
  wrapPapel.id = 'dd-depPapel';
  const btnPapel = document.createElement('button');
  btnPapel.className = 'dd-btn';
  const valPapel = document.createElement('span');
  valPapel.className = 'dd-val';
  valPapel.textContent = 'Papel: ' + (DEP_ROLES.find(r=>r.v===depRole) || DEP_ROLES[0]).label;
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.cssText = 'margin-left:auto;color:var(--slate-soft);font-size:11px;';
  btnPapel.appendChild(valPapel);
  btnPapel.appendChild(caret);
  const panelPapel = document.createElement('div');
  panelPapel.className = 'dd-panel';
  const listaPapel = document.createElement('div');
  listaPapel.className = 'dd-list';
  DEP_ROLES.forEach(r=>{
    const item = document.createElement('div');
    item.className = 'dd-item single' + (r.v===depRole ? ' selected' : '');
    item.textContent = r.label;
    item.addEventListener('click', (e)=>{
      e.stopPropagation();
      depRole = r.v;
      listaPapel.querySelectorAll('.dd-item').forEach(x=>x.classList.remove('selected'));
      item.classList.add('selected');
      valPapel.textContent = 'Papel: ' + r.label;
      panelPapel.classList.remove('open');
      renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
    });
    listaPapel.appendChild(item);
  });
  panelPapel.appendChild(listaPapel);
  wrapPapel.appendChild(btnPapel);
  wrapPapel.appendChild(panelPapel);
  controls.appendChild(wrapPapel);
  btnPapel.addEventListener('click', (e)=>{
    e.stopPropagation();
    document.querySelectorAll('.dd-panel.open').forEach(p=>{ if(p!==panelPapel) p.classList.remove('open'); });
    panelPapel.classList.toggle('open');
  });
  listaPapel.addEventListener('click', e=>e.stopPropagation());
}

/** Mesmo contador dos demais filtros da barra. */
function atualizarBotaoDepSquad(btn?: Element | null): void {
  const el = btn || document.querySelector<HTMLElement>('#dd-depSquad .dd-btn');
  if(!el) return;
  const conta = requireDependencyElement<HTMLElement>(el, '.count');
  if(depSquads.size){ conta.style.display='inline-block'; conta.textContent = String(depSquads.size); }
  else { conta.style.display='none'; }
  updateFilterSummary();
}

function renderDep(f: DashboardIssue[], atual: DashboardIssue[]): void {
  const deps = atual.filter((d): d is DependencyIssue => Boolean(d.EhDependencia) && depMatchTeam(d));
  // `f` já exige Data Conclusao dentro do período — para dependência ela vem da
  // entrada em Done (changelog), então "resolvida no período" é exato aqui.
  const noPeriodo = f.filter((d): d is DependencyIssue => Boolean(d.EhDependencia) && depMatchTeam(d));
  const abertas = deps.filter(d=>!d.Concluido && !d.Cancelado);
  const resolvidas = noPeriodo.filter(d=>d.Concluido);
  const canceladas = noPeriodo.filter(d=>d.Cancelado);
  const externas = deps.filter(d=>d.DepExterno);
  const idadeAbertas = abertas.map(depIdadeDias).filter((v): v is number=>v!=null);
  const temposResolucao = resolvidas.map(d=>d.LeadTimeDias).filter((v): v is number=>v!=null);
  const p85 = percentile(temposResolucao, 85);

  Object.assign(__cardDrills, {
    dep_abertas:{title:'Dependências em aberto', issues:abertas},
    dep_resolvidas:{title:'Dependências resolvidas no período', issues:resolvidas},
    dep_canceladas:{title:'Dependências canceladas no período', issues:canceladas},
    dep_externas:{title:'Dependências de times externos', issues:externas},
  });

  dependencyById('dep-kpis').innerHTML = [
    kpiCard('Dependências abertas', fmt0(abertas.length), 'itens', 'coral', {cls:'flat', text:'posição atual'}, null, 'dep_abertas'),
    kpiCard('Idade média das abertas', idadeAbertas.length?fmt0(mean(idadeAbertas)):'—', 'dias', 'amber',
      {cls:'flat', text:'da abertura até hoje'}),
    kpiCard('Resolvidas no período', fmt0(resolvidas.length), 'itens', '', null, null, 'dep_resolvidas'),
    // O p85 fica ao lado da média de propósito: a média sozinha esconde a cauda
    // (há dependência de 101 dias na base), e o percentil mostra até onde ela vai.
    kpiCard('Tempo médio de resolução', temposResolucao.length?fmt1(mean(temposResolucao)):'—', 'dias', '',
      p85!=null?{cls:'flat', text:`p85: ${fmt1(p85)} dias`}:null),
    kpiCard('Canceladas no período', fmt0(canceladas.length), 'itens', '',
      {cls:'flat', text:'deixaram de ser necessárias'}, null, 'dep_canceladas'),
    kpiCard('De times externos', fmt0(externas.length), 'itens', '',
      {cls:'flat', text: deps.length?`${Math.round(externas.length/deps.length*100)}% do recorte`:'—'}, null, 'dep_externas'),
  ].join('');

  renderDepMatriz(deps);
  renderDepFila(deps);
  renderDepMensal(deps);
  renderDepTempo(deps);
  renderDepAbertas(abertas);
  renderDepImpacto(deps);
  renderDepQualidade(deps);
}

/* Matriz demandante x dependente. Os dois eixos vêm ordenados por volume, e não
   alfabeticamente: quem lê a matriz procura o gargalo, e ele fica na primeira
   coluna. */
function renderDepMatriz(deps: DependencyIssue[]): void {
  const alvo = document.getElementById('dep-matrix');
  if(!alvo) return;
  if(!deps.length){ alvo.innerHTML = '<div class="empty">Nenhuma dependência no recorte atual.</div>'; return; }
  const celulas = new Map<string, number>();
  const totLinha = new Map<string, number>(), totCol = new Map<string, number>();
  deps.forEach(d=>{
    const l = d.DepDemandante||'', c = d.DepDependente||'';
    const k = l+'||'+c;
    celulas.set(k, (celulas.get(k)||0)+1);
    totLinha.set(l,(totLinha.get(l)||0)+1);
    totCol.set(c,(totCol.get(c)||0)+1);
  });
  const linhas = Array.from(totLinha).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const cols = Array.from(totCol).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const max = Math.max(...celulas.values());

  const head = '<tr><th>Demandante &rarr; Dependente</th>' +
    cols.map(c=>`<th title="${escapeHtml(depTeamLabel(c))}">${escapeHtml(depTeamLabel(c))}</th>`).join('')
    + '<th class="tot">Total</th></tr>';

  const body = linhas.map(l=>{
    const tds = cols.map(c=>{
      const v = celulas.get(l+'||'+c)||0;
      if(!v) return '<td class="empty">·</td>';
      // Opacidade proporcional ao volume, com piso para o valor 1 não sumir.
      const alpha = 0.14 + 0.72*(v/max);
      return `<td class="has-val" style="background:rgba(206,0,88,${alpha.toFixed(2)});color:${alpha>0.5?'#fff':'var(--ink)'}"`
        + ` title="${escapeHtml(depTeamLabel(l))} → ${escapeHtml(depTeamLabel(c))}: ${v}"`
        + ` data-dep-l="${escapeHtml(l)}" data-dep-c="${escapeHtml(c)}">${v}</td>`;
    }).join('');
    return `<tr><th title="${escapeHtml(depTeamLabel(l))}">${escapeHtml(depTeamLabel(l))}</th>${tds}`
      + `<td class="tot" data-dep-l="${escapeHtml(l)}" title="Tudo que ${escapeHtml(depTeamLabel(l))} demandou">${totLinha.get(l)}</td></tr>`;
  }).join('');

  /* Rodapé com o total de cada DEPENDENTE. O total por linha já respondia
     "quanto o time X pediu"; a pergunta simétrica — "quanto pediram PARA o time
     X" — exigia somar a coluna a olho, e é justamente ela que aponta o gargalo.
     Fica preso na base da área rolável, como o cabeçalho no topo. */
  const foot = '<tr><th class="tot">Total do dependente</th>'
    + cols.map(c=>`<td class="tot" data-dep-c="${escapeHtml(c)}" title="Tudo que pediram para ${escapeHtml(depTeamLabel(c))}">${totCol.get(c)}</td>`).join('')
    + `<td class="tot geral">${deps.length}</td></tr>`;

  alvo.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;

  // Célula, total de linha e total de coluna abrem o mesmo drawer, cada um com
  // o seu recorte — o número na tela e a lista que abre são sempre o mesmo dado.
  alvo.querySelectorAll<HTMLElement>('[data-dep-l],[data-dep-c]').forEach(cel=>{
    const l = cel.dataset.depL, c = cel.dataset.depC;
    if(l===undefined && c===undefined) return;
    cel.addEventListener('click', ()=>{
      if(l!==undefined && c!==undefined){
        openDrawer(`${depTeamLabel(l)} → ${depTeamLabel(c)}`,
          deps.filter(d=>(d.DepDemandante||'')===l && (d.DepDependente||'')===c), undefined);
      } else if(l!==undefined){
        openDrawer(`Demandadas por ${depTeamLabel(l)}`, deps.filter(d=>(d.DepDemandante||'')===l), undefined);
      } else {
        openDrawer(`Pedidas para ${depTeamLabel(c)}`, deps.filter(d=>(d.DepDependente||'')===c), undefined);
      }
    });
  });
}

/* Fila de entrada por time dependente, empilhada por desfecho. Sem recorte de
   período: a pergunta é quanto cada time tem/teve na fila, não o que fechou nos
   últimos 30 dias. */
function renderDepFila(deps: DependencyIssue[]): void {
  const byTeam = groupBy(deps, d=>d.DepDependente||'');
  const linhas: DependencyQueueRow[] = Array.from(byTeam, ([id,v]): DependencyQueueRow=>({
    id, label: depTeamLabel(id),
    abertas: v.filter(d=>!d.Concluido && !d.Cancelado).length,
    concluidas: v.filter(d=>d.Concluido).length,
    canceladas: v.filter(d=>d.Cancelado).length,
    todas: v,
  })).sort((a,b)=>(b.abertas+b.concluidas+b.canceladas)-(a.abertas+a.concluidas+a.canceladas));
  const drill = (idx: number, campo: DependencyQueueStatus)=>{
    const r = linhas[idx];
    const filtro = campo==='abertas' ? ((d: DependencyIssue)=>!d.Concluido&&!d.Cancelado)
      : campo==='concluidas' ? ((d: DependencyIssue)=>Boolean(d.Concluido)) : ((d: DependencyIssue)=>Boolean(d.Cancelado));
    return {title:`${r.label} · ${campo}`, issues:r.todas.filter(filtro)};
  };
  upsertChart('chart-dep-fila', {
    type:'bar',
    data:{labels:linhas.map(r=>r.label), datasets:[
      {label:'Abertas', data:linhas.map(r=>r.abertas), backgroundColor:'#CE0058', stack:'s'},
      {label:'Concluídas', data:linhas.map(r=>r.concluidas), backgroundColor:'#0057B8', stack:'s'},
      {label:'Canceladas', data:linhas.map(r=>r.canceladas), backgroundColor:'#C4C4C4', stack:'s'},
    ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{tooltip:{callbacks:{label:(ctx: any)=>` ${ctx.dataset.label}: ${fmt0(ctx.parsed.x)}`}}},
      scales:{x:{stacked:true, beginAtZero:true, title:{display:true, text:'Nº de dependências'}},
              y:{stacked:true, grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number, ds: number)=>drill(idx, (['abertas','concluidas','canceladas'] as const)[ds] || 'abertas'))}
  });
}

/* Abertas (por criação) contra resolvidas (por entrada em Done), mês a mês. */
function renderDepMensal(deps: DependencyIssue[]): void {
  const meses = Array.from(new Set<string>([
    ...deps.map(d=>d.AnoMesCriacao).filter((m): m is string=>Boolean(m)),
    ...deps.filter(d=>d.Concluido).map(d=>d.AnoMesConclusao).filter((m): m is string=>Boolean(m)),
  ])).sort();
  const abertasPorMes = meses.map(m=>deps.filter(d=>d.AnoMesCriacao===m).length);
  const resolvPorMes = meses.map(m=>deps.filter(d=>d.Concluido && d.AnoMesConclusao===m).length);
  upsertChart('chart-dep-mensal', {
    type:'bar',
    data:{labels:meses, datasets:[
      {label:'Abertas', data:abertasPorMes, backgroundColor:'#CE0058'},
      {type:'line', label:'Resolvidas', data:resolvPorMes, borderColor:'#0057B8', backgroundColor:'#0057B8', fill:false},
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      scales:{y:{beginAtZero:true, title:{display:true, text:'Nº de dependências'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx: number, ds: number)=>{
        const m = meses[idx];
        return ds===1
          ? {title:`Dependências resolvidas em ${m}`, issues:deps.filter(d=>d.Concluido&&d.AnoMesConclusao===m)}
          : {title:`Dependências abertas em ${m}`, issues:deps.filter(d=>d.AnoMesCriacao===m)};
      })}
  });
}

/* Média de dias até resolver, por time dependente.
   MÉDIA, e pela mesma régua do KPI de tempo de resolução no topo da aba: medir o
   card por uma medida central e o gráfico ao lado por outra faria a aba se
   contradizer. A cauda longa que a média carrega (há dependência de 101 dias na
   base) aparece no p85 do card, não numa segunda régua aqui. */
function renderDepTempo(deps: DependencyIssue[]): void {
  const resolvidas = deps.filter(d=>d.Concluido && d.LeadTimeDias!=null);
  const linhas: DependencyTimeRow[] = Array.from(groupBy(resolvidas, d=>d.DepDependente||''))
    .filter(([,v])=>v.length>=2)
    .map(([id,v]): DependencyTimeRow=>({id, label:depTeamLabel(id), media:mean(v.map(d=>Number(d.LeadTimeDias)))!, n:v.length, todas:v}))
    .sort((a,b)=>b.media-a.media);
  if(!linhas.length){
    upsertChart('chart-dep-tempo', {type:'bar',
      data:{labels:['(sem time com 2+ dependências resolvidas)'], datasets:[{data:[0], backgroundColor:'#C4C4C4'}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{x:{display:false}, y:{grid:{display:false}}}}});
    return;
  }
  upsertChart('chart-dep-tempo', {
    type:'bar',
    data:{labels:linhas.map(r=>r.label), datasets:[{data:linhas.map(r=>+r.media.toFixed(1)), backgroundColor:'#0057B8', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1',
      layout:{padding:{right:40}}, plugins:{legend:{display:false},
      tooltip:{callbacks:{label:(ctx: any)=>` ${fmt1(ctx.parsed.x)} dias (média) · ${linhas[ctx.dataIndex].n} resolvida(s)`}}},
      scales:{x:{beginAtZero:true, title:{display:true, text:'Dias'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>({title:`Resolvidas · ${linhas[idx].label}`, issues:linhas[idx].todas}))}
  });
}

function renderDepAbertas(abertas: DependencyIssue[]): void {
  const ord = abertas.map(d=>({d, dias:depIdadeDias(d)}))
    .sort((a,b)=>(b.dias!=null?b.dias:-1)-(a.dias!=null?a.dias:-1)).slice(0,25);
  requireDependencyElement<HTMLTableSectionElement>(document, '#dep-open-table tbody').innerHTML = ord.length ? ord.map(({d,dias})=>`
    <tr>
      <td><a class="jira" href="${JIRA_BROWSE}${d.Chave}" target="_blank" rel="noopener">${d.Chave}</a></td>
      <td style="font-size:11.5px;">${escapeHtml(depTeamLabel(d.DepDemandante))} → <b>${escapeHtml(depTeamLabel(d.DepDependente))}</b></td>
      <td style="font-size:11.5px;">${escapeHtml(d.Status||'—')}</td>
      <td><b>${dias!=null?fmt0(dias):'—'}</b></td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhuma dependência em aberto no recorte atual.</td></tr>';
}

/* Itens que as dependências apontam como impactados. A cobertura vai escrita
   embaixo da tabela de propósito: só parte das dependências tem link, e ler
   esta tabela como se fosse o universo dos itens travados seria errado. */
function renderDepImpacto(deps: DependencyIssue[]): void {
  const porItem = new Map<string, DependencyImpactRow>();
  deps.forEach(d=>{
    (d.DepLinks||[]).forEach(l=>{
      const cur: DependencyImpactRow = porItem.get(l.k) || {chave:l.k, tipo:l.t, status:l.s, total:0, abertas:0, deps:[]};
      cur.total += 1;
      if(!d.Concluido && !d.Cancelado) cur.abertas += 1;
      cur.deps.push(d);
      porItem.set(l.k, cur);
    });
  });
  const linhas = Array.from(porItem.values())
    .sort((a,b)=>(b.abertas-a.abertas)||(b.total-a.total)).slice(0,25);
  requireDependencyElement<HTMLTableSectionElement>(document, '#dep-impacto-table tbody').innerHTML = linhas.length ? linhas.map(r=>`
    <tr>
      <td><a class="jira" href="${JIRA_BROWSE}${r.chave}" target="_blank" rel="noopener">${r.chave}</a></td>
      <td style="font-size:11.5px;">${escapeHtml(r.tipo||'—')}</td>
      <td style="font-size:11.5px;">${escapeHtml(r.status||'—')}</td>
      <td><b>${r.total}</b>${r.abertas?` <span style="color:#CE0058;">(${r.abertas} aberta${r.abertas>1?'s':''})</span>`:''}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhuma dependência do recorte tem item linkado.</td></tr>';
  const comLink = deps.filter(d=>(d.DepLinks||[]).length).length;
  const pct = deps.length ? Math.round(comLink/deps.length*100) : 0;
  dependencyById('dep-impacto-cobertura').innerHTML =
    `Cobertura: <b>${fmt0(comLink)}</b> de ${fmt0(deps.length)} dependências do recorte (${pct}%) têm item linkado. `
    + 'Valem os links <i>Dependo de / Depende de mim</i>, <i>Blocks</i> e <i>Relates</i>; clones ficam de fora, '
    + 'porque um clone é cópia da própria dependência e não o item que ficou esperando.';
}

function renderDepQualidade(deps: DependencyIssue[]): void {
  const semDemandante = deps.filter(d=>!d.DepDemandante);
  const semLink = deps.filter(d=>!(d.DepLinks||[]).length);
  const semPi = deps.filter(d=>!d.PI || d.PI==='Não informado');
  const semEscopo = deps.filter(d=>d.DepEscopo==='Não informado');
  const pct = (n: number): number => deps.length ? Math.round((deps.length-n)/deps.length*100) : 0;
  Object.assign(__cardDrills, {
    dep_sem_demandante:{title:'Dependências sem Time Demandante', issues:semDemandante},
    dep_sem_link:{title:'Dependências sem item linkado', issues:semLink},
    dep_sem_pi:{title:'Dependências sem label de PI', issues:semPi},
    dep_sem_escopo:{title:'Dependências sem link oficial (escopo desconhecido)', issues:semEscopo},
  });
  const q = (valor: number, rotulo: string, faltando: number, drill: string): string => `
    <div class="q${valor<80?' warn':''}" data-drill="${drill}" style="cursor:pointer;">
      <div class="qv">${valor}%</div>
      <div class="ql">${rotulo}<br><span style="color:#A1A1AA;">${fmt0(faltando)} sem preencher</span></div>
    </div>`;
  dependencyById('dep-quality').innerHTML = [
    q(pct(semDemandante.length), 'com <b>Time Demandante</b>', semDemandante.length, 'dep_sem_demandante'),
    q(pct(semLink.length), 'com <b>item linkado</b>', semLink.length, 'dep_sem_link'),
    q(pct(semEscopo.length), 'com <b>link oficial</b> (in/out VS)', semEscopo.length, 'dep_sem_escopo'),
    q(pct(semPi.length), 'com <b>label de PI</b>', semPi.length, 'dep_sem_pi'),
  ].join('');
}
