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
