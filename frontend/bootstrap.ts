/* ===================== Init / Bootstrap ===================== */
type ProgressivePhase = 'recent' | 'history' | 'delta' | 'pi-epics' | 'pi-children';
type IssueLoadPhase = 'recent' | 'history';
type SnapshotPhase = IssueLoadPhase | 'delta' | 'pi' | null;

interface DashboardProgressiveMeta {
  pendingStatuses?: string[];
  inProgressStatuses?: string[];
  doneStatuses?: string[];
  cancelledStatuses?: string[];
  quarterRules?: DashboardQuarterRules | null;
  dependencyTeams?: Record<string, string>;
  sprints?: DashboardSprint[];
}

interface DashboardProgressivePayload {
  issues?: DashboardIssue[];
  piIssues?: DashboardIssue[];
  nextPageToken?: string | null;
  isLast?: boolean;
  generatedAt?: string;
  coletadoEm?: string;
  meta?: DashboardProgressiveMeta;
  detail?: string;
  error?: string;
}

interface DashboardSnapshotProgress {
  mode: 'full' | 'delta';
  phase: SnapshotPhase;
  nextPageToken?: string | null;
  since?: string;
}

interface DashboardSnapshot {
  schemaVersion: number;
  issues: DashboardIssue[];
  piIssues: DashboardIssue[];
  meta: DashboardProgressiveMeta;
  generatedAt: string;
  complete: boolean;
  syncStartedAt?: string | null;
  lastSyncAt?: string | null;
  progress: DashboardSnapshotProgress | null;
}

function showLoading(msg?: string): void {
  let el = document.getElementById('__loading');
  if(!el){
    el = document.createElement('div');
    el.id = '__loading';
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(250,249,246,.48);backdrop-filter:blur(2px);z-index:9999;font-family:Inter,system-ui,sans-serif;'
      + 'color:#333333;font-size:15px;flex-direction:column;gap:14px;text-align:center;padding:24px;';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="loading-card" role="status" aria-live="polite">'
    + '<div style="width:34px;height:34px;border:3px solid #E2E2E2;border-top-color:#CE0058;'
    + 'border-radius:50%;animation:__spin .8s linear infinite;"></div>'
    + '<div class="loading-title">CARREGANDO DADOS</div>'
    + '<div id="__loading_count" class="loading-count">0 issues buscadas</div>'
    + '<div id="__loading_detail" class="loading-detail"></div></div>'
    + '<style>@keyframes __spin{to{transform:rotate(360deg)}}</style>';
  document.body.classList.add('dashboard-loading');
  const detail = document.getElementById('__loading_detail');
  if(detail) detail.textContent = msg || 'Consultando o Jira...';
  el.style.display = 'flex';
}
function updateLoadingProgress(count: number, detail?: string, label='issues buscadas'): void {
  const countEl=document.getElementById('__loading_count');
  const detailEl=document.getElementById('__loading_detail');
  if(countEl) countEl.textContent=`${Number(count||0).toLocaleString('pt-BR')} ${label}`;
  if(detailEl&&detail) detailEl.textContent=detail;
}
function hideLoading(): void {
  const el = document.getElementById('__loading');
  if(el) el.style.display = 'none';
  document.body.classList.remove('dashboard-loading');
}
function showError(detail: unknown): void {
  let el = document.getElementById('__loading') || document.body.appendChild(document.createElement('div'));
  el.id = '__loading';
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(250,249,246,.96);z-index:9999;font-family:Inter,system-ui,sans-serif;'
    + 'color:#D64545;flex-direction:column;gap:12px;text-align:center;padding:32px;';
  el.innerHTML = '<div style="font-size:17px;font-weight:600;">Não foi possível carregar os dados do Jira</div>'
    + '<div style="color:#333333;font-size:13.5px;max-width:520px;">' + String(detail) + '</div>'
    + '<button onclick="bootstrap(true)" style="margin-top:6px;padding:9px 18px;border:none;border-radius:6px;'
    + 'background:#CE0058;color:#fff;font-size:13.5px;cursor:pointer;">Tentar novamente</button>';
  document.body.classList.add('dashboard-loading');
  el.style.display = 'flex';
}

function formatExportDate(iso: string): string {
  try{
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
    const g = (type: string): string => p.find(part=>part.type===type)?.value || '';
    const mesesAbbr = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${g('day')} ${mesesAbbr[parseInt(g('month'),10)]} ${g('year')}, ${g('hour')}:${g('minute')}`;
  }catch(e){ return iso; }
}

const DASHBOARD_DB = 'afya-metrics-dashboard';
const DASHBOARD_STORE = 'snapshots';
// Suba a versão sempre que uma regra de cálculo mudar: snapshots gravados com
// versão anterior são descartados (senão o cache serviria métricas pela regra antiga).
// 3 = Aging só para itens com Data de início real (sem fallback para a Criação).
// 4 = payload passa a trazer SprintPeriodos/SprintHistoricoOk (velocity).
// 9 = reconstrói períodos após normalizar o alias histórico APP_Aprenderr.
// 10 = payload traz TempoPorStatus/StatusHistoricoOk (tempo por status) E cinco
//      status saem do default "Em andamento" para pendingStatuses, mudando o
//      FaseFluxo gravado no snapshot.
// 11 = aba de Dependências. A JQL passou a trazer o issuetype Dependência e o
//      projeto MART, e o payload ganhou o bloco Dep* e meta.dependencyTeams.
//      Precisa de recoleta COMPLETA, e não da sincronização incremental: o
//      snapshot antigo foi montado quando a JQL nem pedia esses itens, e a fase
//      `delta` só busca `updated >= -Nd`. Sem o bump, quem já tinha o painel
//      aberto veria a aba com um subconjunto arbitrário das dependências — as
//      que por acaso foram mexidas no período —, o que é pior do que vazia,
//      porque parece um número plausível. `Tipo Agrupado` também mudou para os
//      itens desse tipo, então o campo gravado no snapshot estaria errado.
// 12 = `meta.quarterRules.piPeriods` ganhou o campo `programa`, que é a
//      correlação PI -> Programa usada pelo filtro de PI e pela pré-seleção do
//      PI do quarter na aba PI Tracking. Sem o bump nada disso funciona em
//      produção e FALHA CALADO: o navegador que já tinha snapshot renderiza
//      direto dele e nem chama o servidor (`cacheComplete && !forceRefresh`
//      retorna antes), então `piPeriods[pi].programa` vem `undefined` — nenhum
//      PI casa com o Programa marcado, `piDoQuarterAtual()` não acha candidato
//      e a lista de PI não esconde nada. O padrão de Programa, que é puro
//      front-end, continua aparecendo, e é isso que faz o ajuste parecer
//      "metade aplicado" em vez de quebrado.
//      Aqui só o `meta` mudou, não os itens; como o snapshot não sabe recarregar
//      só o meta, o descarte custa uma coleta completa, uma vez por navegador.
const DASHBOARD_SCHEMA_VERSION = 12;
let dashboardInitialized = false;
let progressiveGeneration = 0;

function openDashboardDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB indisponivel'));
    const req = indexedDB.open(DASHBOARD_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DASHBOARD_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function readDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const db = await openDashboardDb();
  return new Promise<DashboardSnapshot | null>((resolve,reject)=>{
    const req = db.transaction(DASHBOARD_STORE,'readonly').objectStore(DASHBOARD_STORE).get('current');
    req.onsuccess=()=>{db.close();
      const snap=(req.result as DashboardSnapshot | undefined)||null;
      resolve(snap&&snap.schemaVersion===DASHBOARD_SCHEMA_VERSION?snap:null);};
    req.onerror=()=>{db.close();reject(req.error);};
  });
}
async function writeDashboardSnapshot(value: DashboardSnapshot): Promise<void> {
  const db = await openDashboardDb();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(DASHBOARD_STORE,'readwrite');
    tx.objectStore(DASHBOARD_STORE).put(value,'current');
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
function setProgressiveStatus(text: string, loading: boolean): void {
  const el=document.getElementById('progressive-status');
  if(!el) return;
  el.textContent=text||'';
  el.classList.toggle('loading',!!loading);
}
function mergeProgressiveMeta(
  target?: DashboardProgressiveMeta | null,
  incoming?: DashboardProgressiveMeta | null,
): DashboardProgressiveMeta {
  const result: DashboardProgressiveMeta={...(target||{})};
  ['pendingStatuses','inProgressStatuses','doneStatuses','cancelledStatuses','quarterRules'].forEach(k=>{
    if(incoming&&incoming[k as keyof DashboardProgressiveMeta]) {
      Object.assign(result, {[k]: incoming[k as keyof DashboardProgressiveMeta]});
    }
  });
  // O catálogo de times chega PARCIAL em cada lote (só os times daquele
  // lote), então ele acumula em vez de substituir.
  result.dependencyTeams={...(result.dependencyTeams||{}), ...(incoming?.dependencyTeams||{})};
  const sprints=new Map<string, DashboardSprint>(
    (result.sprints||[]).filter(s=>Boolean(s.name)).map(s=>[String(s.name),s]),
  );
  (incoming?.sprints||[]).forEach(s=>{
    if(s&&s.name) sprints.set(s.name,{...(sprints.get(s.name)||{}),...s});
  });
  result.sprints=Array.from(sprints.values());
  return result;
}
function reconcileProgressiveIssues(items: DashboardIssue[]): DashboardIssue[] {
  const index=new Map<string, DashboardIssue>(
    items.filter(item=>Boolean(item.Chave)).map(item=>[String(item.Chave),item]),
  );
  const healthByEpic=new Map<string, unknown>();
  items.forEach(item=>{
    if(item['Tipo Agrupado']==='Épico'){
      item.EpicoChave=item.Chave;
      if(item.SaudeEpico && item.Chave) healthByEpic.set(item.Chave,item.SaudeEpico);
    }
  });
  items.forEach(item=>{
    if(item['Tipo Agrupado']!=='Épico'){
      const seen=new Set<string>(); let current: DashboardIssue | undefined=item; let epic: string | null=null;
      while(current&&current.parentKey&&!seen.has(current.parentKey)){
        const parentKey=String(current.parentKey);
        seen.add(parentKey); current=index.get(parentKey);
        if(current&&current['Tipo Agrupado']==='Épico'){epic=String(current.Chave || '');break;}
      }
      item.EpicoChave=epic;
    }
    if(item['Tipo Agrupado']==='Sub-task'){
      const seen=new Set<string>(); let current: DashboardIssue | undefined=item; let incremental=true;
      while(current&&current.parentKey&&!seen.has(current.parentKey)){
        const parentKey=String(current.parentKey);
        seen.add(parentKey); current=index.get(parentKey);
        if(current&&current['Tipo Agrupado']!=='Sub-task'){
          incremental=current['Tipo Agrupado']==='História'||current['Tipo Agrupado']==='Épico'; break;
        }
      }
      item.Incremental=incremental;
    }else item.Incremental=item['Tipo Agrupado']==='História'||item['Tipo Agrupado']==='Épico';
  });
  items.forEach(item=>{if(item.EpicoChave)item.SaudeEpico=healthByEpic.get(item.EpicoChave)||null;});
  return items;
}
function buildProgressiveEpicSummaries(items: DashboardIssue[]): DashboardIssue[] {
  const roundHalfEven=(value: number): number=>{
    const scaled=value*10, floor=Math.floor(scaled), fraction=scaled-floor;
    if(Math.abs(fraction-.5)<1e-9) return (floor%2===0?floor:floor+1)/10;
    return Math.round(scaled)/10;
  };
  const epics=new Map<string, DashboardIssue>(
    items.filter(i=>i['Tipo Agrupado']==='Épico' && i.Chave).map(i=>[String(i.Chave),i]),
  );
  const members=new Map<string, DashboardIssue[]>();
  // Dependência fica FORA do rollup: 76 das 189 da base têm pai, e contá-las
  // inflaria TotalItens e o % de conclusão do épico com trabalho que é de outro
  // time. Mesma exclusão que quarter.rules.js já faz na aba de PI Tracking.
  items.forEach(i=>{
    const epicKey=String(i.EpicoChave || '');
    if(epicKey && i['Tipo Agrupado']!=='Dependência'){
      if(!members.has(epicKey)) members.set(epicKey,[]);
      members.get(epicKey)!.push(i);
    }
  });
  return Array.from(members.entries()).flatMap(([key,list])=>{
    const epic=epics.get(key); if(!epic)return [];
    const done=list.filter(i=>i.Concluido), cancelled=list.filter(i=>i.Cancelado).length;
    const denominator=list.length-cancelled;
    return [{Chave:key,Resumo:epic.Resumo,Squad:epic.Squad,VS:epic.VS,Programa:epic.Programa,PI:epic.PI,
      Status:epic.Status,TotalItens:list.length,Concluidos:done.length,Cancelados:cancelled,
      PctConclusao:denominator?roundHalfEven(done.length/denominator*100):0,
      SPTotal:roundHalfEven(list.reduce((sum,i)=>sum+Number(i['Story Points']||0),0)),
      SPConcluido:roundHalfEven(done.reduce((sum,i)=>sum+Number(i['Story Points']||0),0))}];
  });
}
function renderProgressiveDataset(
  items: DashboardIssue[],
  piItems: DashboardIssue[],
  meta: DashboardProgressiveMeta,
  generatedAt: string,
): void {
  DATA=reconcileProgressiveIssues(items);
  PI_DATA=reconcileProgressiveIssues(piItems||[]);
  EPICS=buildProgressiveEpicSummaries(DATA);
  window.__RULES_PENDING=meta.pendingStatuses||[];
  window.__RULES_INPROG=meta.inProgressStatuses||[];
  window.__RULES_DONE=meta.doneStatuses||[];
  window.__RULES_CANCELLED=meta.cancelledStatuses||[];
  window.__SPRINTS=meta.sprints||[];
  window.__QUARTER_RULES=meta.quarterRules||null;
  // id canônico -> rótulo dos times da aba de Dependências (ver DependencyResolver).
  window.__DEP_TEAMS=meta.dependencyTeams||{};
  const exportDate=document.getElementById('exportDate');
  if(exportDate) exportDate.textContent=formatExportDate(generatedAt);
  normalizeData();
  if(!dashboardInitialized){setDefaultDateRange();dashboardInitialized=true;}
  buildFilterBar(); renderAll(); hideLoading();
}

async function requestProgressiveBatch(
  phase: ProgressivePhase,
  nextPageToken: string | null = null,
  since: string | null = null,
  epicKeys: string[] | null = null,
): Promise<DashboardProgressivePayload> {
  const res=await fetch('/api/dashboard/progressive',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({phase,nextPageToken,since,epicKeys})});
  if(!res.ok){
    let detail=`${res.status} ${res.statusText}`;
    try{
      const errorPayload=await res.json() as Pick<DashboardProgressivePayload, 'detail' | 'error'>;
      detail=errorPayload.detail||errorPayload.error||detail;
    }catch(_error){}
    throw new Error(detail);
  }
  return res.json() as Promise<DashboardProgressivePayload>;
}
/* Coleta isolada do PI Tracking. Primeiro busca todos os épicos pelas labels
   configuradas no servidor, sem corte por ano; depois consulta os filhos em
   grupos de 50 chaves para manter a JQL curta e previsível. */
async function loadPiTrackingDataset(generation: number): Promise<DashboardIssue[] | null> {
  const piMap=new Map<string, DashboardIssue>();
  updateLoadingProgress(0,'Buscando épicos associados aos PIs...','itens do PI buscados');
  let nextPageToken=null, isLast=false;
  while(!isLast){
    if(generation!==progressiveGeneration)return null;
    setProgressiveStatus(`PI Tracking: buscando épicos (${piMap.size.toLocaleString('pt-BR')})`,true);
    const payload=await requestProgressiveBatch('pi-epics',nextPageToken);
    (payload.piIssues||[]).forEach(item=>{if(item.Chave)piMap.set(item.Chave,item);});
    updateLoadingProgress(piMap.size,'Buscando épicos associados aos PIs...','itens do PI buscados');
    nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
  }
  const epicKeys=Array.from(piMap.values())
    .filter(item=>item['Tipo Agrupado']==='Épico' && item.Chave).map(item=>String(item.Chave));
  for(let offset=0;offset<epicKeys.length;offset+=50){
    const chunk=epicKeys.slice(offset,offset+50);
    nextPageToken=null; isLast=false;
    while(!isLast){
      if(generation!==progressiveGeneration)return null;
      setProgressiveStatus(`PI Tracking: buscando filhos (${Math.min(offset+chunk.length,epicKeys.length)}/${epicKeys.length} épicos)`,true);
      const payload=await requestProgressiveBatch('pi-children',nextPageToken,null,chunk);
      (payload.piIssues||[]).forEach(item=>{if(item.Chave)piMap.set(item.Chave,item);});
      updateLoadingProgress(piMap.size,
        `Buscando filhos dos épicos (${Math.min(offset+chunk.length,epicKeys.length)}/${epicKeys.length})...`,
        'itens do PI buscados');
      nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
    }
  }
  return Array.from(piMap.values());
}

function isLocalDashboardRuntime(): boolean {
  return ['localhost','127.0.0.1','::1'].includes(window.location.hostname);
}
async function loadLocalDashboard(forceRefresh: boolean, generation: number): Promise<DashboardIssue[] | null> {
  setProgressiveStatus(forceRefresh?'Atualizando dataset completo no Jira...':'Carregando dataset completo local...',true);
  updateLoadingProgress(0,forceRefresh?'Atualizando o cache local pelo Jira...':'Carregando todas as issues do cache local...');
  const res=await fetch(`/api/dashboard${forceRefresh?'?refresh=1':''}`,{cache:'no-store'});
  if(!res.ok){
    let detail=`${res.status} ${res.statusText}`;
    try{
      const errorPayload=await res.json() as Pick<DashboardProgressivePayload, 'detail' | 'error'>;
      detail=errorPayload.detail||errorPayload.error||detail;
    }catch(_error){}
    throw new Error(detail);
  }
  const payload=await res.json() as DashboardProgressivePayload;
  const issues=Array.isArray(payload.issues)?payload.issues:[];
  if(!issues.length) throw new Error('O cache local não retornou issues.');
  updateLoadingProgress(issues.length,'Dataset geral carregado; buscando dados do PI Tracking...');
  const generatedAt=payload.generatedAt||payload.coletadoEm||new Date().toISOString();
  const meta=payload.meta||{};
  // O endpoint local completo mantém o corte created >= startOfYear(). O PI
  // Tracking precisa da mesma coleta dedicada usada no Amplify para incluir
  // épicos antigos associados ao quarter e seus filhos.
  const piIssues=await loadPiTrackingDataset(generation);
  if(!piIssues)return null;
  renderProgressiveDataset(issues,piIssues,meta,generatedAt);
  await persistDashboardSnapshot({
    schemaVersion:DASHBOARD_SCHEMA_VERSION,issues,piIssues,meta,generatedAt,complete:true,
    syncStartedAt:generatedAt,lastSyncAt:payload.coletadoEm||generatedAt,progress:null
  });
  setProgressiveStatus(`${issues.length.toLocaleString('pt-BR')} issues completas`,false);
  return issues;
}
async function persistDashboardSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  try{await writeDashboardSnapshot(snapshot);}catch(e){console.warn('falha ao salvar IndexedDB',e);}
}
/* Rótulo da etapa na carga completa.
   A mensagem antiga ("Buscando os dados dos últimos dois meses") era lida como o
   LIMITE do que seria carregado, quando é só a primeira das duas etapas — nada é
   renderizado antes de as duas terminarem. Dizer "etapa 1 de 2" evita a leitura
   de que o dashboard só tem 60 dias de dados. */
function rotuloEtapaCarga(phase: IssueLoadPhase): string {
  return phase==='recent'
    ? 'Etapa 1 de 2: buscando os últimos 60 dias...'
    : 'Etapa 2 de 2: buscando o histórico anterior a 60 dias...';
}
async function loadFullProgressively(
  cached: DashboardSnapshot | null,
  generation: number,
): Promise<DashboardIssue[] | null> {
  const phases: IssueLoadPhase[]=['recent','history'];
  const resume=cached?.complete===false&&cached?.progress?.mode==='full';
  const progress=resume ? cached.progress : null;
  const freshMap=new Map<string, DashboardIssue>(
    (resume&&Array.isArray(cached.issues)?cached.issues:[])
      .filter(i=>Boolean(i.Chave)).map(i=>[String(i.Chave),i]),
  );
  let meta=resume?(cached.meta||{}):{}, generatedAt=cached?.generatedAt||new Date().toISOString();
  const syncStartedAt=resume&&cached.syncStartedAt?cached.syncStartedAt:new Date().toISOString();
  // Se a carga geral terminou e apenas a coleta dedicada do PI falhou, retoma
  // diretamente no PI. Repetir recent/history buscaria milhares de issues sem
  // necessidade e aumentaria a chance de novo timeout.
  let phaseIndex=resume
    ? (progress?.phase==='pi' ? phases.length : Math.max(0,phases.indexOf(progress?.phase as IssueLoadPhase)))
    : 0;
  let firstToken=resume?progress?.nextPageToken||null:null;
  let allowPersistedTokenRestart=!!firstToken;
  if(freshMap.size) updateLoadingProgress(freshMap.size,'Retomando a carga salva...');

  for(let index=phaseIndex;index<phases.length;index+=1){
    const phase=phases[index]; let nextPageToken=index===phaseIndex?firstToken:null, isLast=false;
    while(!isLast){
      if(generation!==progressiveGeneration)return null;
      setProgressiveStatus(`${phase==='recent'?'Etapa 1 de 2 (últimos 60 dias)':'Etapa 2 de 2 (histórico)'}`
        + `: ${freshMap.size.toLocaleString('pt-BR')} issues salvas`,true);
      updateLoadingProgress(freshMap.size,rotuloEtapaCarga(phase));
      let payload: DashboardProgressivePayload;
      try{payload=await requestProgressiveBatch(phase,nextPageToken);}
      catch(error){
        if(allowPersistedTokenRestart&&nextPageToken){nextPageToken=null;allowPersistedTokenRestart=false;continue;}
        throw error;
      }
      allowPersistedTokenRestart=false;
      (payload.issues||[]).forEach(item=>{if(item.Chave)freshMap.set(item.Chave,item);});
      // Atualiza antes de serializar o snapshot no IndexedDB: em bases grandes,
      // essa gravação pode levar tempo e não deve congelar o número anterior.
      updateLoadingProgress(freshMap.size,rotuloEtapaCarga(phase));
      meta=mergeProgressiveMeta(meta,payload.meta||{}); generatedAt=payload.generatedAt||generatedAt;
      nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
      const nextPhase=isLast?phases[index+1]||null:phase;
      const issues=Array.from(freshMap.values());
      const terminouIssues=isLast&&index===phases.length-1;
      await persistDashboardSnapshot({schemaVersion:DASHBOARD_SCHEMA_VERSION,issues,piIssues:[],meta,generatedAt,complete:false,
        syncStartedAt,lastSyncAt:cached?.lastSyncAt||null,
        progress:{mode:'full',phase:terminouIssues?'pi':nextPhase,nextPageToken:isLast?null:nextPageToken}});
      updateLoadingProgress(freshMap.size,terminouIssues?'Buscando dados do PI Tracking...':rotuloEtapaCarga(nextPhase||phase));
    }
  }
  const finalIssues=Array.from(freshMap.values());
  const piIssues=await loadPiTrackingDataset(generation);
  if(!piIssues)return null;
  await persistDashboardSnapshot({schemaVersion:DASHBOARD_SCHEMA_VERSION,issues:finalIssues,piIssues,meta,generatedAt,
    complete:true,syncStartedAt,lastSyncAt:syncStartedAt,progress:null});
  renderProgressiveDataset(finalIssues,piIssues,meta,generatedAt);
  setProgressiveStatus(`${finalIssues.length.toLocaleString('pt-BR')} issues salvas`,false);
  return finalIssues;
}
async function loadIncremental(
  cached: DashboardSnapshot,
  generation: number,
): Promise<DashboardIssue[] | null> {
  const resume=cached?.complete===false&&cached?.progress?.mode==='delta';
  const progress=resume ? cached.progress : null;
  const issueMap=new Map<string, DashboardIssue>(
    (cached?.issues||[]).filter(i=>Boolean(i.Chave)).map(i=>[String(i.Chave),i]),
  );
  let meta=cached?.meta||{}, generatedAt=cached?.generatedAt||new Date().toISOString();
  const since=resume?(progress?.since || cached.generatedAt):(cached.lastSyncAt||cached.generatedAt||new Date(Date.now()-86400000).toISOString());
  const syncStartedAt=resume&&cached.syncStartedAt?cached.syncStartedAt:new Date().toISOString();
  let nextPageToken=resume?progress?.nextPageToken||null:null, isLast=false;
  let allowPersistedTokenRestart=!!nextPageToken; const changedKeys=new Set<string>();
  if(resume&&issueMap.size) updateLoadingProgress(issueMap.size,'Retomando atualização salva...','issues em cache');
  while(!isLast){
    if(generation!==progressiveGeneration)return null;
    setProgressiveStatus(`Buscando novas alterações — ${issueMap.size.toLocaleString('pt-BR')} issues em cache`,true);
    updateLoadingProgress(changedKeys.size,'Buscando novas alterações no Jira...');
    let payload: DashboardProgressivePayload;
    try{payload=await requestProgressiveBatch('delta',nextPageToken,since);}
    catch(error){
      if(allowPersistedTokenRestart&&nextPageToken){nextPageToken=null;allowPersistedTokenRestart=false;continue;}
      throw error;
    }
    allowPersistedTokenRestart=false;
    (payload.issues||[]).forEach(item=>{
      if(item.Chave){issueMap.set(item.Chave,item);changedKeys.add(item.Chave);}
    });
    updateLoadingProgress(changedKeys.size,'Buscando novas alterações no Jira...','issues atualizadas');
    meta=mergeProgressiveMeta(meta,payload.meta||{}); generatedAt=payload.generatedAt||generatedAt;
    nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
    const issues=Array.from(issueMap.values());
    await persistDashboardSnapshot({schemaVersion:DASHBOARD_SCHEMA_VERSION,issues,piIssues:cached.piIssues||[],meta,generatedAt,complete:false,
      syncStartedAt,lastSyncAt:cached.lastSyncAt||null,
      progress:{mode:'delta',phase:isLast?'pi':'delta',since,nextPageToken:isLast?null:nextPageToken}});
    updateLoadingProgress(changedKeys.size,isLast?'Atualizando PI Tracking...':'Buscando novas alterações no Jira...');
  }
  const finalIssues=Array.from(issueMap.values());
  const piIssues=await loadPiTrackingDataset(generation);
  if(!piIssues)return null;
  await persistDashboardSnapshot({schemaVersion:DASHBOARD_SCHEMA_VERSION,issues:finalIssues,piIssues,meta,generatedAt,
    complete:true,syncStartedAt,lastSyncAt:syncStartedAt,progress:null});
  renderProgressiveDataset(finalIssues,piIssues,meta,generatedAt);
  setProgressiveStatus(`${issueMap.size.toLocaleString('pt-BR')} issues · ${changedKeys.size.toLocaleString('pt-BR')} atualizadas`,false);
  return Array.from(issueMap.values());
}
async function bootstrap(forceRefresh = false): Promise<void> {
  const generation=++progressiveGeneration;
  const refreshButton=document.querySelector<HTMLButtonElement>('#btn-refresh');
  if(refreshButton)refreshButton.disabled=true;
  showLoading('Carregando dados do dashboard...');
  try{
    if(isLocalDashboardRuntime()){
      try{
        await loadLocalDashboard(forceRefresh,generation);
        return;
      }catch(localError){
        console.warn('dataset completo local indisponível; usando carga progressiva',localError);
      }
    }
    let cached: DashboardSnapshot | null=null;
    try{cached=await readDashboardSnapshot();}catch(e){console.warn('cache IndexedDB indisponivel',e);}
    const pendingMode=cached?.complete===false?cached?.progress?.mode:null;
    const cacheComplete=!!cached&&cached.complete!==false&&!pendingMode;
    if(cached&&cacheComplete&&!forceRefresh){
      renderProgressiveDataset(cached.issues,cached.piIssues||[],cached.meta||{},cached.generatedAt||new Date().toISOString());
      setProgressiveStatus(`${cached.issues.length.toLocaleString('pt-BR')} issues em cache`,false);
      return;
    }
    if(cached&&cacheComplete&&forceRefresh){
      renderProgressiveDataset(cached.issues,cached.piIssues||[],cached.meta||{},cached.generatedAt||new Date().toISOString());
      showLoading('Buscando novas alterações no Jira...');
    }
    if(cached&&(pendingMode==='delta'||(cacheComplete&&forceRefresh))){
      await loadIncremental(cached,generation);
    }else{
      await loadFullProgressively(cached,generation);
    }
  }catch(err: unknown){
    console.error('bootstrap error:',err);
    setProgressiveStatus('Carga parcial salva — tente novamente',false);
    const detail=err instanceof Error ? err.message : String(err);
    if(DATA.length)hideLoading();else showError(detail);
  }finally{
    if(generation===progressiveGeneration&&refreshButton)refreshButton.disabled=false;
  }
}

document.addEventListener('DOMContentLoaded', () => bootstrap(false));
