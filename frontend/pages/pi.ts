/* ===================== TAB: PI TRACKING =====================
   Acompanhamento dos épicos de um PI/quarter, agrupados por squad.

   Esta aba NÃO usa as regras das outras abas. Ela replica, status por status e
   tipo por tipo, o painel de quarter que o time já usa nas cerimônias de PI
   (projeto afya-quarter). Se os dois números divergissem, a aba perderia a
   função: ninguém confia em dois números para a mesma pergunta.

   As regras chegam do backend em `meta.quarterRules` (config/quarter.rules.js).
   Não existe cópia delas aqui de propósito — uma segunda cópia sairia de
   sincronia com a primeira sem ninguém perceber.

   Três diferenças que explicam quase toda a divergência com a aba Visão Geral:
     - sub-tarefas e o próprio épico ficam FORA do denominador (senão o mesmo
       trabalho é contado duas vezes: a história e cada um dos seus subitens);
     - itens cancelados saem do denominador em vez de contarem como não feitos;
     - a comparação de status é normalizada e "Em Homologação"/"Staging" contam
       como concluído.

   Detalhe que faz ou quebra os números: os filhos NÃO herdam o PI do épico. No
   dataset real, 1.430 dos 3.465 filhos dos épicos de PI3 têm PI "Não informado"
   porque as labels ficam no épico. Por isso a seleção é feita nos ÉPICOS pelo PI
   e depois pega TODOS os filhos por EpicoChave — filtrar filhos por PI cortaria
   40% da base silenciosamente. */

type PiPhase = 'done' | 'inProgress' | 'todo';
type PiFilterKey = 'Programa' | 'VS' | 'Squad';

interface PiQuarterWindow {
  quarter: string;
  year: number;
  label: string;
  start: string;
  end: string;
}

interface PiProgramSelection {
  set: Set<string>;
}

interface PiEpicRow {
  epic: DashboardIssue;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  cancelled: number;
  pct: number;
  isEmpty: boolean;
  epicDone: boolean;
  transbordo: boolean;
  children: DashboardIssue[];
  validChildren: DashboardIssue[];
  byPhase: Record<PiPhase, DashboardIssue[]>;
}

interface PiSquadBucket {
  squad: string;
  vs: string;
  epics: PiEpicRow[];
  total: number;
  done: number;
  inProgress: number;
  todo: number;
}

interface PiSquadGroup extends PiSquadBucket {
  pct: number;
}

interface PiVsBucket {
  vs: string;
  squadMap: Map<string, PiSquadBucket>;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
}

interface PiVsGroup {
  vs: string;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  pct: number;
  squads: PiSquadGroup[];
}

interface PiTrackingResult {
  pis: string[];
  window: PiQuarterWindow | null;
  programa: PiProgramSelection | null;
  vsGroups: PiVsGroup[];
  squads: PiSquadGroup[];
  epics: PiEpicRow[];
  kpis: {
    clusterProgress: number;
    totalItems: number;
    doneItems: number;
    totalVs: number;
    timeProgress: number | null;
    gap: number | null;
    totalEpics: number;
    epicsDone: number;
    epicsDonePct: number;
    emptyEpics: number;
    totalSquads: number;
    squadsBehind: number | null;
  };
  drills: {
    items: DashboardIssue[];
    done: DashboardIssue[];
    epics: DashboardIssue[];
    epicsDone: DashboardIssue[];
    empty: DashboardIssue[];
  };
}

function isPiPhase(value: string | null): value is PiPhase {
  return value === 'done' || value === 'inProgress' || value === 'todo';
}

/* Squads que o usuário ABRIU. Todas nascem recolhidas: com 14 squads e ~60
   épicos, abrir tudo joga o leitor numa parede de linhas e esconde os KPIs
   acima. Recolhido, a página abre mostrando o ranking de squads — que é a
   leitura de entrada — e o detalhe vem por escolha.

   Guardar o que foi aberto (em vez do que foi fechado) preserva a escolha do
   usuário entre renders: a lista é reconstruída a cada mudança de filtro, e a
   squad que ele abriu tem de continuar aberta. */
const piExpandedSquads = new Set<string>();

/* Value Streams que o usuário ABRIU — mesma mecânica do conjunto acima, e pelo
   mesmo motivo: guardar o que foi aberto preserva a escolha entre renders (a
   lista é reconstruída a cada mudança de filtro) e faz o conjunto vazio
   significar "tudo como nasce".

   Os dois níveis nascem RECOLHIDOS. Decisão do usuário depois de ver a tela
   pronta: a página abre no ranking das Value Streams — 6 linhas — e o detalhe
   vem por escolha, um nível de cada vez. É a mesma leitura de entrada que as
   squads já tinham, um andar acima. */
const piExpandedVs = new Set<string>();

/* O PI vem do filtro do topo — é a MESMA dimensão (label do Jira), então um
   seletor próprio aqui seria uma segunda fonte de verdade para a mesma pergunta.
   Vazio significa "todos", como em qualquer filtro da barra.

   Consequência: os KPIs temporais (quarter percorrido, gap, squads atrasadas)
   só existem com UM PI selecionado — "quanto do quarter já passou" não tem
   resposta para Q1 e Q3 somados. Eles mostram "—" e dizem o que falta, em vez
   de exibir um número que não significa nada. */
function piSelectedPis(): string[] {
  const escolhidos = Array.from(selections['PI'] || [], value=>String(value));
  return escolhidos.length ? escolhidos : piOptionsFromData();
}

/* Cores das fases. Validadas contra a superfície branca e para as três formas de
   daltonismo (pior par adjacente ΔE 16.1 em protanopia). O âmbar fica abaixo de
   3:1 de contraste, o que exige rótulos visíveis — que existem: a legenda no
   topo e as contagens por fase em cada linha. */
const PI_PHASE_COLORS = { done:'#CE0058', inprogress:'#0057B8', todo:'#D98E3B' };

function piRules(): DashboardQuarterRules | null { return window.__QUARTER_RULES || null; }

/** Comparação de status normalizada (trim + maiúsculas), como no afya-quarter. */
function piNorm(s: unknown): string { return String(s==null?'':s).trim().toUpperCase(); }
function piInList(status: unknown, list: readonly unknown[] | null | undefined): boolean {
  const n = piNorm(status);
  return (list||[]).some(s=>piNorm(s)===n);
}
function piIsDone(status: unknown): boolean { return piInList(status, piRules()?.doneStatuses); }
function piIsInProgress(status: unknown): boolean { return piInList(status, piRules()?.inProgressStatuses); }
function piIsIgnored(status: unknown): boolean { return piInList(status, piRules()?.ignoredStatuses); }

/** O item conta como "filho entregável" do épico? Exclui épicos e sub-tarefas. */
function piIsCountableChild(item: DashboardIssue): boolean {
  const r = piRules(); if(!r) return false;
  const tipo = String(item['Tipo de item']||'');
  if((r.excludedChildTypes||[]).includes(tipo)) return false;
  return !(r.subtaskTypePrefixes||[]).some(p=>tipo.startsWith(p));
}

function piIsTransbordo(item: DashboardIssue): boolean {
  const labels = Array.isArray(item.Labels) ? item.Labels.map(String) : [];
  return (piRules()?.transbordoLabels || []).some(l=>labels.includes(l));
}

/** Filtros do topo que se aplicam aqui. Tipo/Status/período ficam de fora
    porque mexeriam no denominador do progresso, não no recorte. */
const PI_TAB_FILTER_KEYS: readonly PiFilterKey[] = ['Programa','VS','Squad'];

/** O recorte de Programa em vigor. O padrão de Programa agora é GLOBAL
    (`DEFAULT_PROGRAMA`), então aqui basta ler a barra — ela é a única fonte de
    verdade do recorte. */
function piProgramaDoRecorte(): PiProgramSelection | null {
  const sel = selections['Programa'];
  return (sel && sel.size) ? {set:sel as Set<string>} : null;
}

function matchesPiTabFilters(d: DashboardIssue): boolean {
  for(const key of PI_TAB_FILTER_KEYS){
    const sel = selections[key];
    if(!sel || sel.size===0) continue;
    let v = d[key];
    if(v===null||v===undefined||v==='') v='(Não informado)';
    if(!sel.has(String(v))) return false;
  }
  return true;
}

/* ---- PI do quarter corrente, pré-selecionado só nesta aba ----

   Decisão do usuário, depois de ver a medição: pré-selecionar o PI na barra
   INTEIRA deixaria 27% da base de pé (Bloqueios cairia de 421 para 61 itens,
   Bugs de 420 para 78), porque o PI é um campo de preenchimento manual e 63,6%
   dos sub-itens e 57% dos bloqueios não têm label nenhuma. O recorte não diria
   "o trabalho do quarter", diria "o trabalho que alguém etiquetou".

   Nesta aba o mesmo recorte é de graça: a seleção é feita no ÉPICO, que tem a
   label, e os filhos entram pela cadeia de parent ignorando o PI deles. E ela
   liga os KPIs temporais (Quarter percorrido, Gap, Squads abaixo do esperado),
   que sem PI único abrem em "requer 1 PI selecionado".

   Daí o padrão entrar ao abrir a aba e sair ao deixá-la — a mesma mecânica que o
   Programa usava antes de virar padrão global. */
let piPadraoAtivo = false;

/** PI cujo quarter contém a data de hoje, dentro do Programa do recorte.
    Devolve null quando não há um — em 2027 sem `piPeriods` atualizado, por
    exemplo, ou no Q4 do Afya Bridge, que ainda não tem PI4 - Legado. */
function piDoQuarterAtual(): string | null {
  const periods = piRules()?.piPeriods || {};
  const programas = selections['Programa'];
  const hoje = isoToday();
  const candidatos = Object.keys(periods).filter(pi=>{
    if(programas && programas.size && !programas.has(periods[pi].programa)) return false;
    const win = piQuarterWindow(pi);
    return win && hoje >= win.start && hoje <= win.end;
  });
  if(!candidatos.length) return null;
  // Com mais de um Programa marcado pode haver dois PIs no mesmo quarter; o
  // painel é orientado ao Afya One, então ele desempata.
  return candidatos.find(pi=>periods[pi].programa==='Afya One') || candidatos[0];
}

/**
 * Escreve/apaga o PI do quarter conforme a aba ativa. Devolve true quando mexeu
 * na seleção — quem chama precisa saber, porque trocar de aba não re-renderiza
 * nada por conta própria (os painéis já estão no DOM) e o filtro de PI vale
 * também para as outras abas.
 */
function piSincronizarPiPadrao(): boolean {
  if(activeTab==='pi'){
    if(piPadraoAtivo || selections['PI'].size) return false;
    const pi = piDoQuarterAtual();
    if(!pi) return false;
    selections['PI'].add(pi);
    piPadraoAtivo = true;
    return true;
  }
  if(!piPadraoAtivo) return false;
  selections['PI'].clear();
  piPadraoAtivo = false;
  return true;
}

/** Reflete na barra uma seleção mudada por código (o padrão acima): os
    checkboxes só se atualizam sozinhos quando é o usuário quem clica. */
function sincronizarFiltroNaTela(key: string): void {
  const wrap = document.getElementById('dd-'+key.replace(/\s/g,'_'));
  if(!wrap) return;
  wrap.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{ cb.checked = selections[key].has(cb.value); });
  const btn = wrap.querySelector('.dd-btn');
  if(btn) updateFilterBtn(key, btn);
}

/** PIs presentes nos dados que têm janela de quarter conhecida, do mais recente
    para o mais antigo (o PI atual é quase sempre o que se quer ver). */
function piOptionsFromData(): string[] {
  const periods = piRules()?.piPeriods || {};
  const found = new Set<string>();
  PI_DATA.forEach(d=>{
    const pi = String(d.PI || '');
    if(d['Tipo Agrupado']==='Épico' && periods[pi]) found.add(pi);
  });
  return Array.from(found).sort((a,b)=>{
    const pa = periods[a], pb = periods[b];
    if(pa.year!==pb.year) return pb.year-pa.year;
    if(pa.quarter!==pb.quarter) return pb.quarter.localeCompare(pa.quarter);
    return String(a).localeCompare(String(b),'pt');
  });
}

/** Janela de datas do quarter do PI ('YYYY-MM-DD'), ou null se desconhecida. */
function piQuarterWindow(pi: string): PiQuarterWindow | null {
  const r = piRules(); if(!r) return null;
  const period = (r.piPeriods||{})[pi]; if(!period) return null;
  const bounds = (r.quarterBounds||{})[period.quarter]; if(!bounds) return null;
  const pad = (n: number): string=>String(n).padStart(2,'0');
  return {
    quarter: period.quarter, year: period.year,
    label: `${period.quarter}/${period.year}`,
    start: `${period.year}-${pad(bounds.startMonth)}-${pad(bounds.startDay)}`,
    end: `${period.year}-${pad(bounds.endMonth)}-${pad(bounds.endDay)}`,
  };
}

/** Quanto do quarter já passou, em %. Mesma regra (dias inclusivos nas duas
    pontas) de calculate_quarter_time_progress do afya-quarter. */
function piTimeProgress(win: PiQuarterWindow | null | undefined): number | null {
  if(!win) return null;
  const startMs = Date.parse(win.start+'T00:00:00Z');
  const endMs = Date.parse(win.end+'T00:00:00Z');
  const todayMs = Date.parse(isoToday()+'T00:00:00Z');
  if([startMs,endMs,todayMs].some(Number.isNaN)) return null;
  const totalDays = Math.round((endMs-startMs)/86400000) + 1;
  if(totalDays<=0) return 0;
  if(todayMs>=endMs) return 100;
  const elapsedDays = Math.round((todayMs-startMs)/86400000) + 1;
  if(elapsedDays<0) return 0;
  return elapsedDays/totalDays*100;
}

/**
 * Monta a árvore Value Stream -> squad -> épicos -> filhos do PI selecionado.
 * Agregação por SOMA de itens (não média de percentuais): uma squad com um
 * épico de 40 itens e outro de 2 não pode ter os dois pesando igual, e o mesmo
 * vale um nível acima — um VS com 5 squads não é a média dos 5 percentuais.
 */
function piBuildTracking(): PiTrackingResult {
  const pis = piSelectedPis();
  const piSet = new Set(pis);
  const programa = piProgramaDoRecorte();
  const epics = PI_DATA.filter(d=>
    d['Tipo Agrupado']==='Épico'
    && piSet.has(String(d.PI || ''))
    && !piIsIgnored(d.Status)      // afya-quarter exclui épico cancelado na própria JQL
    && matchesPiTabFilters(d));

  // Índice de filhos por épico, montado uma vez (não por épico, que seria O(n²)).
  const childrenByEpic = new Map<string, DashboardIssue[]>();
  PI_DATA.forEach(d=>{
    const key = String(d.EpicoChave || '');
    if(!key || d.Chave===key) return;   // o próprio épico não é filho de si mesmo
    if(!childrenByEpic.has(key)) childrenByEpic.set(key, []);
    childrenByEpic.get(key)!.push(d);
  });

  /* VS -> squad -> épicos. O agrupamento é feito pelo VS do ÉPICO, não da
     squad: o VS é o projeto Jira de cada issue, então uma squad pode, em tese,
     ter épicos em dois projetos. Nesse caso ela aparece dentro de cada VS com
     apenas os épicos daquele VS, e os totais continuam certos porque tudo é
     somado a partir do épico. Medido: entre os 166 épicos com PI reconhecido,
     nenhuma das 23 squads aparece sob dois VS — mas na base inteira 21 das 45
     squads têm itens em mais de um projeto, então o caso não é impossível. */
  const byVs = new Map<string, PiVsBucket>();
  epics.forEach(epic=>{
    const countable = (childrenByEpic.get(String(epic.Chave || ''))||[]).filter(piIsCountableChild);
    const cancelled = countable.filter(c=>piIsIgnored(c.Status));
    const valid = countable.filter(c=>!piIsIgnored(c.Status));
    const done = valid.filter(c=>piIsDone(c.Status));
    const inProgress = valid.filter(c=>!piIsDone(c.Status) && piIsInProgress(c.Status));
    const todo = valid.filter(c=>!piIsDone(c.Status) && !piIsInProgress(c.Status));

    const row: PiEpicRow = {
      epic,
      total: valid.length,
      done: done.length,
      inProgress: inProgress.length,
      todo: todo.length,
      cancelled: cancelled.length,
      pct: valid.length ? done.length/valid.length*100 : 0,
      isEmpty: valid.length===0,
      epicDone: piIsDone(epic.Status),
      transbordo: piIsTransbordo(epic),
      // ordenados para o drill-down: concluídos por último, pendências primeiro
      children: [...todo, ...inProgress, ...done, ...cancelled],
      validChildren: valid,
      // As três listas por trás dos números da barra. Guardadas porque cada
      // segmento do medidor é clicável e abre exatamente estes itens — o mesmo
      // recorte que o tooltip anuncia, sem recalcular no clique.
      byPhase: { done, inProgress, todo },
    };

    const vs = String(epic.VS || 'Não informado');
    const squad = String(epic.Squad || 'Não informado');
    if(!byVs.has(vs)) byVs.set(vs, {vs, squadMap:new Map(), total:0, done:0, inProgress:0, todo:0});
    const vsBucket = byVs.get(vs)!;
    if(!vsBucket.squadMap.has(squad)) vsBucket.squadMap.set(squad, {squad, vs, epics:[], total:0, done:0, inProgress:0, todo:0});
    const bucket = vsBucket.squadMap.get(squad)!;
    [bucket, vsBucket].forEach(b=>{
      b.total += row.total;
      b.done += row.done;
      b.inProgress += row.inProgress;
      b.todo += row.todo;
    });
    bucket.epics.push(row);
  });

  // pior primeiro nos dois níveis: quem precisa de atenção não deveria exigir
  // rolagem. Desempate por nome para a ordem não depender da ordem de chegada.
  const piorPrimeiro = <T extends {pct: number}>(label: (item: T) => string) =>
    (a: T, b: T): number => a.pct-b.pct || label(a).localeCompare(label(b),'pt');

  const vsGroups: PiVsGroup[] = Array.from(byVs.values()).map((v): PiVsGroup=>({
    vs: v.vs, total:v.total, done:v.done, inProgress:v.inProgress, todo:v.todo,
    pct: v.total ? v.done/v.total*100 : 0,
    squads: Array.from(v.squadMap.values()).map((s): PiSquadGroup=>({
      ...s,
      pct: s.total ? s.done/s.total*100 : 0,
      epics: s.epics.sort((a,b)=> a.pct-b.pct || String(a.epic.Chave).localeCompare(String(b.epic.Chave))),
    })).sort(piorPrimeiro(s=>s.squad)),
  })).sort(piorPrimeiro(v=>v.vs));

  /* Lista plana das FAIXAS desenhadas (uma por squad dentro de cada VS), na
     ordem da tela: VS pior primeiro, squad pior primeiro dentro dele. É o que
     os drills percorrem. */
  const squads = vsGroups.flatMap(v=>v.squads);

  /* Squads DISTINTAS, somando os pedaços de quem tiver épicos em dois VS. Os
     KPIs contam squad como time, não como faixa na tela: com a lista plana, uma
     squad partida entre dois VS seria contada duas vezes e "abaixo do esperado"
     poderia marcá-la e não marcá-la ao mesmo tempo. Fazer a conta por nome
     mantém o KPI com o mesmo significado que tinha antes do agrupamento. */
  const porNome = new Map<string, {squad: string; total: number; done: number}>();
  squads.forEach(s=>{
    if(!porNome.has(s.squad)) porNome.set(s.squad, {squad:s.squad, total:0, done:0});
    const b = porNome.get(s.squad)!;
    b.total += s.total; b.done += s.done;
  });
  const squadsDistintas = Array.from(porNome.values())
    .map(s=>({...s, pct: s.total ? s.done/s.total*100 : 0}));

  const totalItems = squads.reduce((sum,s)=>sum+s.total,0);
  const doneItems = squads.reduce((sum,s)=>sum+s.done,0);
  const allEpics = squads.flatMap(s=>s.epics);
  // Janela do quarter só com um PI: a régua temporal não é somável.
  const win = pis.length===1 ? piQuarterWindow(pis[0]) : null;
  const timeProgress = piTimeProgress(win);
  const clusterProgress = totalItems ? doneItems/totalItems*100 : 0;
  const epicsDone = allEpics.filter(e=>e.epicDone);

  return {
    pis,
    window: win,
    programa,
    vsGroups,
    squads,
    epics: allEpics,
    kpis: {
      clusterProgress, totalItems, doneItems,
      totalVs: vsGroups.length,
      timeProgress,
      gap: timeProgress===null ? null : clusterProgress-timeProgress,
      totalEpics: allEpics.length,
      epicsDone: epicsDone.length,
      epicsDonePct: allEpics.length ? epicsDone.length/allEpics.length*100 : 0,
      emptyEpics: allEpics.filter(e=>e.isEmpty).length,
      totalSquads: squadsDistintas.length,
      squadsBehind: timeProgress===null ? null : squadsDistintas.filter(s=>s.pct<timeProgress).length,
    },
    drills: {
      items: squads.flatMap(s=>s.epics.flatMap(e=>e.validChildren)),
      done: squads.flatMap(s=>s.epics.flatMap(e=>e.validChildren.filter(c=>piIsDone(c.Status)))),
      epics: allEpics.map(e=>e.epic),
      epicsDone: epicsDone.map(e=>e.epic),
      empty: allEpics.filter(e=>e.isEmpty).map(e=>e.epic),
    },
  };
}

/** Rótulo de cada fase da barra, usado no título do drawer. */
const PI_PHASE_LABELS: Record<PiPhase, string> = { done:'Concluído', inProgress:'Em andamento', todo:'Pendente' };

/** Barra segmentada. Só emite segmentos com valor, para os cantos externos
    arredondados caírem sempre sobre uma fase que existe.

    Com `epicKey`, cada segmento vira um alvo clicável que abre no drawer os
    itens daquela fase — o mesmo recorte que o tooltip de hover já anuncia. Só a
    linha do épico passa a chave: na barra da squad o segmento consolida vários
    épicos e o cabeçalho já tem o clique de recolher/expandir. */
function piMeter(done: number, inProgress: number, todo: number, epicKey?: string): string {
  const total = done+inProgress+todo;
  if(!total) return '<div class="pi-meter empty" data-help="Este épico não possui itens elegíveis para o cálculo de progresso." aria-label="Épico sem itens elegíveis"></div>';
  const clicavel = !!epicKey;
  const seg = (n: number, color: string, phase: PiPhase): string=>{
    if(!(n>0)) return '';
    const label = PI_PHASE_LABELS[phase];
    const texto = `${label}: ${n} itens${clicavel?' · clique para ver a lista':''}`;
    const extra = clicavel
      ? ` role="button" tabindex="0" data-pi-phase="${phase}" data-pi-epic="${escapeHtml(String(epicKey))}"`
      : '';
    return `<i style="flex:${n};background:${color};" data-help="${texto}" aria-label="${texto}"${extra}></i>`;
  };
  return `<div class="pi-meter">
    ${seg(done, PI_PHASE_COLORS.done, 'done')}
    ${seg(inProgress, PI_PHASE_COLORS.inprogress, 'inProgress')}
    ${seg(todo, PI_PHASE_COLORS.todo, 'todo')}
  </div>`;
}

const piFmtPct = (v: number | null | undefined): string => (v===null||v===undefined) ? '—' : v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const piFmtBr = (iso: string | null | undefined): string => { if(!iso) return ''; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; };

function renderPiTracking(): void {
  const kpiEl = document.getElementById('pi-kpis');
  const squadsEl = document.getElementById('pi-squads');
  const recorteEl = document.getElementById('pi-recorte');
  if(!kpiEl || !squadsEl) return;

  if(!piRules()){
    kpiEl.replaceChildren();
    squadsEl.innerHTML = `<div class="card pi-empty-state">
      <div style="font-size:30px;line-height:1;margin-bottom:10px;">🔄</div>
      <h3 style="margin-bottom:6px;">Regras de PI ainda não carregadas</h3>
      <div class="cap" style="max-width:560px;margin:0 auto;">Os dados em cache são anteriores a esta aba.
        Clique em <b>Atualizar dados</b> no topo para buscar as regras de acompanhamento de PI no servidor.</div></div>`;
    return;
  }

  const t = piBuildTracking();
  const k = t.kpis;
  const win = t.window;
  const umPi = t.pis.length===1;
  const rotulo = umPi ? t.pis[0] : `${t.pis.length} PIs`;

  // Diz de onde vem o recorte: sem isto, "3 PIs" some e o número dos KPIs fica
  // sem contexto quando o filtro do topo está aberto.
  if(recorteEl){
    // O PI já aparece marcado na barra, mas quem não viu a marcação acontecer
    // não sabe de onde ela veio — nem que ela some ao sair da aba. Esta linha é
    // o que explica a marcação.
    const doQuarter = umPi && piPadraoAtivo
      ? ` <span class="pi-sub">(PI do quarter corrente, marcado ao abrir esta aba)</span>`
      : '';
    const programa = t.programa
      ? ` · Programa <b>${Array.from(t.programa.set).map(escapeHtml).join(', ')}</b>`
      : '';
    recorteEl.innerHTML = (t.pis.length
      ? (umPi
          ? `<b>${escapeHtml(t.pis[0])}</b>${doQuarter} · quarter ${win ? `${win.label}, ${piFmtBr(win.start)} a ${piFmtBr(win.end)}` : 'desconhecido'}`
          : `${t.pis.length} PIs no recorte — selecione um só no filtro <b>PI</b> para ver o progresso no tempo`)
      : 'Nenhum PI reconhecido nos dados') + programa;
  }

  __cardDrills['pi-items'] = {title:`Itens de ${rotulo} (denominador do progresso)`, issues:t.drills.items};
  __cardDrills['pi-done'] = {title:`Itens concluídos de ${rotulo}`, issues:t.drills.done};
  __cardDrills['pi-epics'] = {title:`Épicos de ${rotulo}`, issues:t.drills.epics};
  __cardDrills['pi-epics-done'] = {title:`Épicos entregues de ${rotulo}`, issues:t.drills.epicsDone};
  __cardDrills['pi-empty'] = {title:`Épicos sem nenhum item em ${rotulo}`, issues:t.drills.empty};

  const gapCls = k.gap===null ? 'flat' : (k.gap>=0 ? 'up' : 'down');
  // Um KPI temporal sem PI único não tem resposta. Dizer o que falta é melhor
  // que um "—" mudo, e muito melhor que um número somado de dois quarters.
  const semPi = {cls:'flat', text:'requer 1 PI selecionado'};
  const gapTxt = k.gap===null ? 'requer 1 PI selecionado'
    : `${k.gap>=0?'+':'−'}${piFmtPct(Math.abs(k.gap))} pp vs. tempo decorrido`;

  kpiEl.innerHTML =
    kpiCard('Progresso do PI', piFmtPct(k.clusterProgress), '%', '',
      {cls:'flat', text:`${k.doneItems.toLocaleString('pt-BR')} de ${k.totalItems.toLocaleString('pt-BR')} itens`},
      'Itens concluídos ÷ itens válidos (sem sub-tarefas, sem cancelados)', 'pi-done')
    + kpiCard('Épicos entregues', piFmtPct(k.epicsDonePct), '%', 'slate',
      {cls:'flat', text:`${k.epicsDone} de ${k.totalEpics} épicos`},
      'Pelo status do próprio épico no Jira, não pelo progresso dos filhos', 'pi-epics-done')
    + kpiCard('Quarter percorrido', piFmtPct(k.timeProgress), k.timeProgress===null?'':'%', 'slate',
      win ? {cls:'flat', text:`${piFmtBr(win.start)} → ${piFmtBr(win.end)}`} : semPi,
      'Dias decorridos do quarter — a régua contra a qual o progresso é lido')
    + kpiCard('Gap plano × tempo', k.gap===null?'—':piFmtPct(Math.abs(k.gap)),
      k.gap===null?'':'pp', k.gap!==null && k.gap<0 ? 'coral' : '',
      {cls:gapCls, text:gapTxt},
      'Progresso de entrega menos progresso no tempo. Negativo = entregando mais devagar que o calendário')
    + kpiCard('Total de épicos', k.totalEpics.toLocaleString('pt-BR'), '', 'slate',
      {cls:'flat', text:`${k.totalVs} VS · ${k.totalSquads} squad(s)`},
      'Épicos não cancelados no recorte', 'pi-epics')
    + kpiCard('Épicos vazios', k.emptyEpics.toLocaleString('pt-BR'), '',
      k.emptyEpics>0?'amber':'slate',
      {cls:'flat', text:'sem nenhum item'},
      'Épico cadastrado no PI sem nenhum filho entregável — planejamento incompleto', 'pi-empty')
    + kpiCard('Squads abaixo do esperado', k.squadsBehind===null?'—':String(k.squadsBehind), '',
      k.squadsBehind!==null && k.squadsBehind>0?'amber':'slate',
      k.squadsBehind===null ? semPi : {cls:'flat', text:`de ${k.totalSquads} squad(s)`},
      'Squads cujo progresso está abaixo do percentual do quarter já decorrido');

  if(!t.squads.length){
    const comoPrograma = t.programa
      ? `<b>${Array.from(t.programa.set).map(escapeHtml).join(', ')}</b>`
      : 'todos os programas';
    squadsEl.innerHTML = `<div class="card pi-empty-state">
      <div style="font-size:30px;line-height:1;margin-bottom:10px;">🎯</div>
      <h3 style="margin-bottom:6px;">Nenhum épico neste recorte</h3>
      <div class="cap" style="max-width:560px;margin:0 auto;">
        ${t.pis.length
          ? `Não há épicos de <b>${escapeHtml(rotulo)}</b> em ${comoPrograma}, nos filtros atuais de Value Stream e Squad.`
          : 'Nenhum épico com label de PI reconhecida nos dados carregados.'}</div></div>`;
    return;
  }

  const squadCard = (s: PiSquadGroup): string=>{
    const collapsed = piExpandedSquads.has(s.squad) ? '' : ' collapsed';
    const rows = s.epics.map(e=>{
      const badges = [
        e.epicDone ? '<span class="badge ok">entregue</span>' : '',
        e.transbordo ? '<span class="badge warn">transbordo</span>' : '',
        e.isEmpty ? '<span class="badge risk">sem itens</span>' : '',
        e.cancelled ? `<span class="pi-sub">${e.cancelled} canc.</span>` : '',
      ].filter(Boolean).join(' ');
      return `<tr>
        <td class="pi-epic-key"><a href="${JIRA_BROWSE}${e.epic.Chave}" target="_blank" rel="noopener">${e.epic.Chave}</a></td>
        <td class="pi-resumo" data-help="${escapeHtml(String(e.epic.Resumo||''))}">${escapeHtml(String(e.epic.Resumo||''))}</td>
        <td style="width:190px;">${piMeter(e.done, e.inProgress, e.todo, e.epic.Chave)}</td>
        <td class="pi-sub" style="white-space:nowrap;">${piFmtPct(e.pct)}% · ${e.done}/${e.total}</td>
        <td class="pi-sub" style="white-space:nowrap;">${e.todo} pend · ${e.inProgress} and · ${e.done} concl</td>
        <td>${escapeHtml(String(e.epic.Status||''))}</td>
        <td>${badges}</td>
        <td>${e.children.length
          ? `<button class="pi-kids" data-pi-kids="${e.epic.Chave}">${e.children.length} filhos</button>`
          : ''}</td>
      </tr>`;
    }).join('');

    return `<div class="pi-squad${collapsed}" data-pi-squad="${escapeHtml(s.squad)}">
      <div class="pi-squad-head">
        <div class="pi-squad-name">
          <span class="pi-caret">▾</span>
          <span>${escapeHtml(s.squad)}</span>
          <span class="pi-sub">${s.epics.length} épico(s)</span>
        </div>
        <div>${piMeter(s.done, s.inProgress, s.todo)}
          <div class="pi-sub" style="margin-top:4px;">${s.done}/${s.total} itens · ${s.todo} pendentes</div>
        </div>
        <div class="pi-pct">${piFmtPct(s.pct)}%</div>
      </div>
      <div class="pi-squad-body">
        <div style="overflow-x:auto;"><table class="datatable">
          <thead><tr>
            <th>Épico</th><th>Resumo</th><th>Progresso</th><th>%</th>
            <th>Fases</th><th>Status do épico</th><th>Sinais</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>`;
  };

  /* Guarda-chuva de Value Stream por cima das squads. O cabeçalho usa as MESMAS
     três colunas do cabeçalho de squad (1fr 230px 118px), então o medidor e o
     percentual dos dois níveis caem alinhados na vertical — é isso que deixa
     ler "o VS está em 61% e esta squad dentro dele está em 38%" de relance.

     Como na squad, o cabeçalho inteiro é o alvo de recolher/expandir e o
     medidor do VS não é clicável: só a barra da linha do épico abre lista, para
     o clique no medidor significar sempre a mesma coisa. */
  squadsEl.innerHTML = t.vsGroups.map(v=>{
    const collapsed = piExpandedVs.has(v.vs) ? '' : ' collapsed';
    const squads = v.squads.length;
    const epicos = v.squads.reduce((n,s)=>n+s.epics.length,0);
    return `<div class="pi-vs${collapsed}" data-pi-vs="${escapeHtml(v.vs)}">
      <div class="pi-vs-head">
        <div class="pi-vs-name">
          <span class="pi-caret">▾</span>
          <span>${escapeHtml(v.vs)}</span>
          <span class="pi-sub">${squads} squad(s) · ${epicos} épico(s)</span>
        </div>
        <div>${piMeter(v.done, v.inProgress, v.todo)}
          <div class="pi-sub" style="margin-top:4px;">${v.done}/${v.total} itens · ${v.todo} pendentes</div>
        </div>
        <div class="pi-pct">${piFmtPct(v.pct)}%</div>
      </div>
      <div class="pi-vs-body">${v.squads.map(squadCard).join('')}</div>
    </div>`;
  }).join('');

  // Guarda os filhos por épico para o drill-down (fora do HTML, sem serializar).
  __piChildrenByEpic = new Map(t.epics.map(e=>[String(e.epic.Chave || ''), e]));
}

let __piChildrenByEpic = new Map<string, PiEpicRow>();

/* Recolher/expandir squad, abrir os filhos de um épico e abrir uma fase da
   barra de progresso. Um handler só, no documento, porque o conteúdo é
   reconstruído a cada render. */
document.addEventListener('click', (e)=>{
  if(!(e.target instanceof Element)) return;
  const kids = e.target.closest<HTMLElement>('[data-pi-kids]');
  if(kids){
    const row = __piChildrenByEpic.get(kids.dataset.piKids || '');
    if(row) openDrawer(`Filhos de ${row.epic.Chave} — ${row.epic.Resumo||''}`, row.children, undefined);
    return;
  }
  const seg = e.target.closest<HTMLElement>('[data-pi-phase]');
  if(seg){
    const row = __piChildrenByEpic.get(seg.dataset.piEpic || '');
    const phase = seg.getAttribute('data-pi-phase');
    const itens = row && isPiPhase(phase) ? row.byPhase[phase] : null;
    // Segmento sem itens não é renderizado, então a lista vazia só apareceria se
    // o dado tivesse sido recarregado sob o clique. Nesse caso, nada acontece.
    if(row && isPiPhase(phase) && itens && itens.length){
      openDrawer(`${PI_PHASE_LABELS[phase]} · ${row.epic.Chave} — ${row.epic.Resumo||''}`, itens, undefined);
    }
    return;
  }
  const head = e.target.closest<HTMLElement>('.pi-squad-head');
  if(head){
    const card = head.closest<HTMLElement>('.pi-squad');
    const squad = card?.dataset.piSquad;
    if(!card || !squad) return;
    card.classList.toggle('collapsed');
    if(card.classList.contains('collapsed')) piExpandedSquads.delete(squad);
    else piExpandedSquads.add(squad);
    return;
  }
  /* O cabeçalho do VS não é alcançado pelo bloco acima: a barra da squad vive
     em .pi-vs-body, que é IRMÃO de .pi-vs-head, então nenhum closest de dentro
     de uma squad chega aqui. */
  const vsHead = e.target.closest<HTMLElement>('.pi-vs-head');
  if(vsHead){
    const card = vsHead.closest<HTMLElement>('.pi-vs');
    const vs = card?.dataset.piVs;
    if(!card || !vs) return;
    card.classList.toggle('collapsed');
    if(card.classList.contains('collapsed')) piExpandedVs.delete(vs);
    else piExpandedVs.add(vs);
  }
});

/* O segmento é um <i> com role="button", não um <button> — o medidor é um flex
   de larguras proporcionais e um botão traria estilo próprio para desfazer.
   Por isso o teclado precisa ser ligado à mão: Enter e Espaço, como um botão. */
document.addEventListener('keydown', (e)=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  if(!(e.target instanceof Element)) return;
  const seg = e.target.closest<HTMLElement>('[data-pi-phase]');
  if(!seg) return;
  e.preventDefault();
  seg.click();
});
