/* ===================== Rastreabilidade: drawer de issues (Entrega 4) ===================== */
interface DrawerColumn {
  k: string;
  label: string;
  link?: boolean;
}

interface DrawerDrill {
  title: string;
  issues: DashboardIssue[];
  columns?: readonly DrawerColumn[];
}

interface DrawerChartElement {
  index: number;
  datasetIndex: number;
}

type DrawerResolver = (
  index: number,
  datasetIndex: number,
  chart: unknown,
) => DrawerDrill | null | undefined;

type DrawerClickHandler = (
  event: unknown,
  elements: readonly DrawerChartElement[],
  chart: unknown,
) => void;

const JIRA_BROWSE = 'https://medcel.atlassian.net/browse/';
let __drawerIssues: DashboardIssue[] = [];   // issues atualmente exibidas (para o CSV)
let __drawerTitle = '';

/* Colunas da tabela do drawer */
const DRAWER_COLS: readonly DrawerColumn[] = [
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
let __drawerCols: readonly DrawerColumn[] = DRAWER_COLS;

function drawerElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if(!element) throw new Error(`Elemento #${id} do drawer nao encontrado`);
  return element as T;
}

function ensureDrawer(): void {
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
  drawerElement<HTMLButtonElement>('__drawer-close').addEventListener('click', closeDrawer);
  drawerElement<HTMLButtonElement>('__drawer-csv').addEventListener('click', exportDrawerCsv);
  const search = drawerElement<HTMLInputElement>('__drawer-search');
  search.addEventListener('input', ()=>renderDrawerTable(filterDrawerIssues(search.value)));
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
}

/* Cor do badge de status. A fase de fluxo já vem calculada do backend em cada
   item (`FaseFluxo`, de IssueClassifier.phaseOf), então o drawer só traduz fase
   -> cor: as listas de status vivem em config/classification.rules.js e não se
   repetem aqui. Antes esta função adivinhava por pedaço de texto do status, e
   errava — "Deploy em Staging" (concluído) saía azul por casar com "staging", e
   "PRONTO PARA PROD" saía cinza por não casar com nada. */
type DrawerStatusTone = '' | 'ok' | 'pending' | 'progress' | 'risk';

const DRAWER_TONE_BY_PHASE: Record<string, DrawerStatusTone> = {
  'Concluído': 'ok',
  'Pendente': 'pending',
  'Em andamento': 'progress',
  'Cancelado': 'risk',
};

/* Item sem FaseFluxo (dataset antigo em cache, por exemplo) cai nas mesmas
   listas, que chegam no `meta` do dataset. O default é "em andamento", igual ao
   backend: status fora de todas as listas nunca fica sem cor de aberto. */
function drawerStatusTone(item: DashboardIssue, status: unknown): DrawerStatusTone {
  if(!String(status??'').trim()) return '';
  const fase = item && item.FaseFluxo;
  if(fase) return DRAWER_TONE_BY_PHASE[fase] || 'progress';
  if(piInList(status, window.__RULES_CANCELLED)) return 'risk';
  if(piInList(status, window.__RULES_DONE)) return 'ok';
  if(piInList(status, window.__RULES_PENDING)) return 'pending';
  return 'progress';
}

function filterDrawerIssues(query: unknown): DashboardIssue[] {
  const term=String(query||'').trim().toLocaleLowerCase('pt-BR');
  if(!term) return __drawerIssues;
  return __drawerIssues.filter(issue=>__drawerCols.some(col=>{
    const value=issue[col.k];
    return String(Array.isArray(value)?value.join(' '):(value??'')).toLocaleLowerCase('pt-BR').includes(term);
  }));
}

function renderDrawerTable(issues?: readonly DashboardIssue[] | null): void {
  const body=drawerElement<HTMLElement>('__drawer-body');
  const result=drawerElement<HTMLElement>('__drawer-result');
  const visible=issues||[];
  result.textContent=`${visible.length.toLocaleString('pt-BR')} de ${__drawerIssues.length.toLocaleString('pt-BR')} issues`;
  if(!visible.length){
    const searching=!!drawerElement<HTMLInputElement>('__drawer-search').value;
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

function openDrawer(
  title: string,
  issues?: readonly DashboardIssue[] | null,
  columns?: readonly DrawerColumn[] | null,
): void {
  ensureDrawer();
  __drawerCols = columns || DRAWER_COLS;
  __drawerIssues = issues ? [...issues] : [];
  __drawerTitle = title || 'Issues';
  drawerElement<HTMLElement>('__drawer-title').textContent = __drawerTitle;
  drawerElement<HTMLElement>('__drawer-count').textContent = __drawerIssues.length.toLocaleString('pt-BR')+' issues';
  drawerElement<HTMLInputElement>('__drawer-search').value='';
  renderDrawerTable(__drawerIssues);
  drawerElement<HTMLElement>('__drawer-overlay').classList.add('open');
  drawerElement<HTMLElement>('__drawer').classList.add('open');
  document.body.classList.add('drawer-open');
}

function closeDrawer(): void {
  const o=document.getElementById('__drawer-overlay'), d=document.getElementById('__drawer');
  if(o) o.classList.remove('open');
  if(d) d.classList.remove('open');
  document.body.classList.remove('drawer-open');
}

function escapeHtml(s: string): string {
  const entities: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
  return s.replace(/[&<>"]/g, (char: string)=>entities[char] || char);
}

function exportDrawerCsv(): void {
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
function drillClick(resolver: DrawerResolver): DrawerClickHandler {
  return (_event: unknown, elements: readonly DrawerChartElement[], chart: unknown)=>{
    if(!elements || !elements.length) return;
    const el = elements[0];
    const r = resolver(el.index, el.datasetIndex, chart);
    if(r && r.issues) openDrawer(r.title, r.issues);
  };
}

/* KPIs clicáveis: registro preenchido pelo renderExec + listener delegado (uma vez) */
let __cardDrills: Record<string, DrawerDrill> = {};
document.addEventListener('click', (e)=>{
  if(!(e.target instanceof Element)) return;
  const card = e.target.closest('[data-drill]');
  if(!card) return;
  const drillId = card.getAttribute('data-drill');
  if(!drillId) return;
  const d = __cardDrills[drillId];
  if(d) openDrawer(d.title, d.issues, d.columns);
});
