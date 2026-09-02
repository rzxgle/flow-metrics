/* ===================== Tabs ===================== */
type DashboardTab = 'exec' | 'throughput' | 'sp' | 'flow' | 'wip'
  | 'block' | 'sprint' | 'pi' | 'dep' | 'notas';

const DASHBOARD_TABS = new Set<DashboardTab>([
  'exec', 'throughput', 'sp', 'flow', 'wip',
  'block', 'sprint', 'pi', 'dep', 'notas',
]);

let activeTab: DashboardTab = 'pi';

function navigationElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if(!element) throw new Error(`Elemento #${id} da navegacao nao encontrado`);
  return element as T;
}

function isDashboardTab(value: string | undefined): value is DashboardTab {
  return value !== undefined && DASHBOARD_TABS.has(value as DashboardTab);
}

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
function syncFilterBarForTab(): void {
  const bar = document.getElementById('filterBar');
  if(!bar) return;
  bar.classList.toggle('pi-only', activeTab==='pi');
  bar.classList.toggle('dep-only', activeTab==='dep');
  bar.classList.toggle('sprint-only', activeTab==='sprint');
  bar.classList.toggle('sp-sprint-filter', activeTab==='sp');
  bar.classList.toggle('sp-sprint-selected', activeTab==='sp' && selections.Sprint.size>0);
}

const sidebarCollapse = navigationElement<HTMLElement>('sidebarCollapse');
const sidebarMobileToggle = navigationElement<HTMLElement>('sidebarMobileToggle');
const sidebarOverlay = navigationElement<HTMLElement>('sidebarOverlay');
const topbarAfyaLogo = navigationElement<HTMLImageElement>('topbarAfyaLogo');
topbarAfyaLogo.src = navigationElement<HTMLImageElement>('afyaLogo').src;

function syncSidebarState(): void {
  const open = document.body.classList.contains('sidebar-open');
  sidebarCollapse.setAttribute('aria-expanded', String(open));
  sidebarCollapse.setAttribute('aria-label','Fechar menu lateral');
  sidebarMobileToggle.setAttribute('aria-expanded', String(open));
  sidebarMobileToggle.setAttribute('aria-label', open?'Fechar menu lateral':'Abrir menu lateral');
}

function closeMobileSidebar(): void {
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

navigationElement<HTMLElement>('tabNav').addEventListener('click', (e)=>{
  if(!(e.target instanceof Element)) return;
  const btn = e.target.closest<HTMLElement>('.tab-btn');
  if(!btn) return;
  const tab = btn.dataset.tab;
  if(!isDashboardTab(tab)) return;
  document.querySelectorAll<HTMLElement>('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach(p=>p.classList.remove('active'));
  navigationElement<HTMLElement>('panel-'+tab).classList.add('active');
  activeTab = tab;
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
