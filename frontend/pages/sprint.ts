/* ===================== TAB: SPRINT (itens 10/11) ===================== */
type SprintFilterKey = 'Squad' | 'Tipo de item';
type SprintOutsideReason = 'tardia' | 'saiu';

interface CatalogSprint extends DashboardSprint {
  name: string;
  startDate: string;
}

interface SprintMembershipPeriod {
  sprint: string;
  enteredAt?: string | null;
  leftAt?: string | null;
}

interface SprintWindow {
  de: string;
  ate: string;
}

interface SprintOutsideDetail {
  item: DashboardIssue;
  sprint: string;
  atraso: number;
  motivo: SprintOutsideReason;
}

interface SprintAssignment {
  porSprint: Map<string, DashboardIssue[]>;
  foraDeSprint: DashboardIssue[];
  foraDetalhe: SprintOutsideDetail[];
}

interface SprintCompletionRow {
  p: DashboardIssue;
  subs: DashboardIssue[];
  X: number;
  Y: number;
  pct: number;
  entregue: boolean;
  transbordo: string | null;
  prontosNaAbertura: number;
}

interface VelocityItemGroups {
  comprometidos: DashboardIssue[];
  adicionados: DashboardIssue[];
  entregues: DashboardIssue[];
  removidos: DashboardIssue[];
}

interface VelocityPoint {
  sprint: CatalogSprint;
  fechada: boolean;
  comprometido: number;
  adicionado: number;
  entregue: number;
  removido: number;
  itens: VelocityItemGroups;
}

interface VelocityCalculation {
  serie: VelocityPoint[];
  foraDeSprint: DashboardIssue[];
  foraDetalhe: SprintOutsideDetail[];
}

interface VelocitySquadRow {
  squad: string;
  media: number;
  n: number;
  sayDo: number | null;
  issues: DashboardIssue[];
}

const SPRINT_TAB_FILTER_KEYS: SprintFilterKey[] = ['Squad','Tipo de item'];

function sprintPeriods(issue: DashboardIssue): SprintMembershipPeriod[] {
  return Array.isArray(issue.SprintPeriodos)
    ? issue.SprintPeriodos as SprintMembershipPeriod[]
    : [];
}

function matchesSprintTabFilters(d: DashboardIssue, skip?: Set<string>): boolean {
  for(const key of SPRINT_TAB_FILTER_KEYS){
    if(skip && skip.has(key)) continue;
    const sel = selections[key];
    if(!sel || sel.size===0) continue;
    let v = d[key];
    if(v===null || v===undefined || v==='') v='(Não informado)';
    if(!sel.has(String(v))) return false;
  }
  return true;
}

/* O catálogo interno só existe depois que ao menos uma Squad foi escolhida.
   Tipo não limita o catálogo: uma sprint pertence ao time mesmo que, no
   momento, não contenha itens do tipo selecionado. */
function sprintNamesFromData(): string[] {
  if(selections['Squad'].size===0) return [];
  const set = new Set<string>();
  DATA.filter(d=>!d.Cancelado && matchesSprintTabFilters(d, SKIP_TIPO))
    .forEach(d=> (d.Sprints||[]).forEach(s=> set.add(s)));
  return Array.from(set).sort((a,b)=> String(b).localeCompare(String(a),'pt',{numeric:true})); // mais recente primeiro
}
function sprintDates(name: string): {start: Date | null; end: Date | null} {
  const c = (window.__SPRINTS||[]).find(s=>s.name===name);
  return c ? {start: c.startDate? new Date(c.startDate): null, end: c.endDate? new Date(c.endDate): null} : {start:null, end:null};
}

/* ---------- Base do velocity ----------
   O catálogo de sprints vem do campo Sprint do Jira e traz name/state/datas.
   Ordem cronológica por startDate: o nome NÃO serve para ordenar (a base tem
   itens com [PI3_4, PI3_2], fora de ordem, e cada squad nomeia à sua maneira). */
function sprintCatalogoOrdenado(): CatalogSprint[] {
  return (window.__SPRINTS||[])
    .filter((s): s is CatalogSprint=>Boolean(s && s.name && s.startDate))
    .slice()
    .sort((a,b)=> Date.parse(a.startDate) - Date.parse(b.startDate));
}
/* Fim da sprint: o MAIOR entre endDate (planejado) e completeDate (fechamento
   real). 153 das 195 sprints fechadas da base foram encerradas DEPOIS do
   endDate — o time seguiu trabalhando até o fechamento, e usar só o endDate
   jogava essas entregas para fora de qualquer janela. */
function sprintFimMs(s: DashboardSprint): number | null {
  const planejado = s.endDate ? Date.parse(s.endDate) : null;
  const real = s.completeDate ? Date.parse(s.completeDate) : null;
  if(planejado==null && real==null) return null;
  return Math.max(planejado==null?-Infinity:planejado, real==null?-Infinity:real);
}
/* Fechada = o Jira diz 'closed'. Sem `state`, cai para "já passou do fim". */
function sprintFechada(s: DashboardSprint): boolean {
  if(s.state) return String(s.state).toLowerCase()==='closed';
  const fim = sprintFimMs(s);
  return fim!=null && fim < Date.now();
}
/* Sprint FUTURA fica fora do velocity: exibir "30 sp comprometidos, 0 entregues"
   de uma sprint que ainda não começou lê como fracasso, quando é só planejamento. */
function sprintComecou(s: DashboardSprint): boolean {
  if(s.state) return String(s.state).toLowerCase()!=='future';
  return Boolean(s.startDate) && Date.parse(s.startDate!) <= Date.now();
}
/* A issue era membro da sprint NESTE instante? Uma issue pode ter entrado,
   saído e voltado, então basta uma passagem cobrir o instante. */
function membroNoInstante(d: DashboardIssue, sprint: string, instanteMs: number): boolean {
  return sprintPeriods(d).some(p=> p.sprint===sprint
    && p.enteredAt && Date.parse(p.enteredAt) <= instanteMs
    && (!p.leftAt || Date.parse(p.leftAt) > instanteMs));
}
/* Entrou na sprint dentro da janela (start, end] -> escopo adicionado no meio. */
function entrouDuranteSprint(d: DashboardIssue, sprint: string, iniMs: number, fimMs: number | null): boolean {
  return sprintPeriods(d).some(p=>{
    if(p.sprint!==sprint || !p.enteredAt) return false;
    const t = Date.parse(p.enteredAt);
    return t > iniMs && (fimMs==null || t <= fimMs);
  });
}
/* Passou pela sprint em algum momento. Cai no campo Sprints quando o histórico
   não pôde ser reconstruído — aí sabemos o conjunto, não a cronologia. */
function passouPelaSprint(d: DashboardIssue, sprint: string): boolean {
  return sprintPeriods(d).some(p=>p.sprint===sprint) || (d.Sprints||[]).includes(sprint);
}
/**
 * O item TRANSBORDOU do ciclo anterior para esta sprint? Devolve o nome da
 * sprint de origem, ou null.
 *
 * Critério: o item permaneceu numa sprint que começou ANTES desta até o
 * fechamento dela. É a mesma leitura da regra 3 de `atribuirEntregas` — ao
 * fechar uma sprint o Jira move para a próxima os itens INCOMPLETOS, então
 * continuar membro até o fechamento é o sinal de que a sprint anterior era a
 * dona do item.
 *
 * A regra é estrita de propósito. A versão frouxa ("esteve em alguma sprint
 * anterior") marcaria, na App - Aprender / PI3_4, 6 dos 8 itens: APP-482/483/
 * 484/521 SAÍRAM da PI3_3 entre 03 e 06/08, com ela ainda aberta — foram
 * replanejamento, não transbordo, e chegaram com 0 a 2 subitens prontos. A
 * estrita marca os 2 que de fato vieram acumulados no fechamento (APP-825 e
 * APP-767, em 24/08 12:20) e que respondem por 28 dos 33 subitens já
 * concluídos na abertura.
 *
 * Não confundir com `piIsTransbordo`: lá o transbordo é de PI e vem de label
 * (labels de transbordo do PI); aqui é de sprint e vem do histórico de sprint.
 * Unidades diferentes, mesma palavra — o vocabulário é o do time.
 *
 * Item cujo histórico não pôde ser reconstruído não é marcado: preferimos
 * deixar de marcar a marcar errado.
 */
function transbordoDeSprint(d: DashboardIssue, sprint: string): string | null {
  const cat = sprintCatalogoOrdenado();
  const atual = cat.find(s=>s.name===sprint);
  if(!atual) return null;
  const iniAtual = Date.parse(atual.startDate);
  for(const per of sprintPeriods(d)){
    if(per.sprint===sprint) continue;
    const s = cat.find(x=>x.name===per.sprint);
    if(!s || !(Date.parse(s.startDate) < iniAtual)) continue;
    const fim = sprintFimMs(s);
    if(!per.leftAt || (fim!=null && Date.parse(per.leftAt) >= fim)) return per.sprint;
  }
  return null;
}
/* Texto do tooltip do badge de transbordo. Duas frases, na ordem em que a
   pergunta aparece: de onde o item veio, e o que ele já trazia pronto. A
   segunda é a que explica o burndown — é ela que diz por que a linha real
   nasce abaixo do total de subitens. */
function textoTransbordo(r: SprintCompletionRow): string {
  return `Veio de ${r.transbordo}, onde permaneceu até o fechamento.`
    + ` Chegou aqui com ${r.prontosNaAbertura} de ${r.Y} subitens já concluídos.`;
}
/* Janela da sprint em DATAS locais ('YYYY-MM-DD'), inclusive nas duas pontas.
   A data de entrega é uma data sem hora; comparar com o timestamp da sprint (que
   costuma terminar às 03:00 UTC = meia-noite no Brasil) descartava as entregas
   do próprio último dia da sprint. */
function sprintJanelaDatas(s: CatalogSprint): SprintWindow {
  const fim = sprintFimMs(s);
  return {
    de: isoLocalDate(new Date(s.startDate)),
    ate: isoLocalDate(new Date(fim==null ? Date.parse(s.startDate) : fim)),
  };
}
/* Diferença em dias de calendário entre duas datas 'YYYY-MM-DD'. As duas pontas
   são lidas como meia-noite UTC, então não há deslocamento de fuso. */
function diasEntreDatas(de: string, ate: string): number {
  return Math.round((Date.parse(ate+'T00:00:00Z') - Date.parse(de+'T00:00:00Z')) / 86400000);
}
/* A issue era membro da sprint nesta DATA de calendário? A entrega não possui
   horário, por isso a comparação é inclusiva nas duas pontas do dia. */
function membroNaData(d: DashboardIssue, sprint: string, data: string): boolean {
  return sprintPeriods(d).some(p=>p.sprint===sprint && p.enteredAt
    && isoLocalDate(new Date(p.enteredAt)) <= data
    && (!p.leftAt || isoLocalDate(new Date(p.leftAt)) >= data));
}
/**
 * Data que fecha o COMPROMISSO DA SPRINT.
 *
 * `Data Entrega Sprint` é a entrada na categoria Done (o primeiro status de
 * Done, hoje "Pronto p/ Deploy STG"), lida do changelog de status. É ela que
 * marca o fim do trabalho do time: neste processo a homologação integrada roda
 * DEPOIS da sprint, então `Data Conclusao` — o campo manual "Data de Fim Real"
 * ou, na falta dele, a resolução do item — reflete o release, não a sprint.
 *
 * Fallback para `Data Conclusao` quando o changelog não veio: o gráfico segue
 * funcionando com a precisão antiga, em vez de perder o item.
 */
function dataEntregaSprint(d: DashboardIssue): string | null {
  const value = d['Data Entrega Sprint'] || d['Data Conclusao'];
  return value ? String(value) : null;
}
/* Tolerância, em dias, da regra 3 de atribuição (ver abaixo). 7 dias cobrem o
   ruído de fronteira — o item que o Jira fechou junto com a sprint e cuja
   entrada em Done caiu poucos dias depois — sem creditar entrega a uma sprint
   encerrada há semanas. Medido na base: 7d recupera 49 itens/242 SP; 30d
   recuperaria 64, ao custo de inflar retroativamente sprints antigas. */
const TOLERANCIA_FECHAMENTO_DIAS = 7;

/**
 * Atribui a entrega de cada item concluído a UMA sprint — atribuição única, para
 * a mesma entrega nunca contar duas vezes.
 *
 * A data usada é a de `dataEntregaSprint` (entrada no Done), não a conclusão do
 * release.
 *
 * Ordem de prioridade:
 *   1) a sprint cuja janela CONTÉM a data de entrega;
 *   2) senão, a primeira sprint (cronológica) que termina em/depois dela.
 *      Cobre o item que já estava PRONTO quando a sprint abriu — acontece quando
 *      o time puxa o trabalho antes do início (ex.: LEG-2049, concluído em 16/07
 *      numa sprint que só começou em 20/07). Sem esta regra o item contava em
 *      "comprometido" e em entregue nenhum, abrindo um buraco permanente no say-do;
 *   3) senão, a ÚLTIMA sprint do item — desde que ela estivesse fechada, o item
 *      ainda fosse membro dela no instante do fechamento e a entrega tenha vindo
 *      em até TOLERANCIA_FECHAMENTO_DIAS dias. Ao fechar uma sprint o Jira move
 *      para a próxima os itens INCOMPLETOS; quem fica é quem o board já dava por
 *      pronto. Permanecer na sprint até o fechamento é, portanto, o sinal de que
 *      a entrega foi daquela sprint — mesma semântica do Sprint Report nativo.
 *      Sem esta regra, um item concluído um dia depois do fim (ex.: CONV-462)
 *      ficava comprometido numa sprint e entregue em nenhuma;
 *   4) senão, nenhuma: vai para o contador "entregue fora de sprint", com o
 *      motivo registrado, visível na tela em vez de desaparecer.
 *
 * @returns {{porSprint: Map, foraDeSprint: object[], foraDetalhe: object[]}}
 *          `foraDetalhe` traz {item, motivo, sprint, atraso} para o detalhamento
 *          por motivo; `foraDeSprint` é a mesma lista, só com os itens.
 */
function atribuirEntregas(itens: DashboardIssue[], sprints: CatalogSprint[]): SprintAssignment {
  const janelas = new Map<string, SprintWindow>(sprints.map(s=>[s.name, sprintJanelaDatas(s)]));
  const porSprint = new Map<string, DashboardIssue[]>();
  const foraDetalhe: SprintOutsideDetail[] = [];
  itens.forEach(d=>{
    const dc = String(dataEntregaSprint(d) || '').slice(0,10);
    if(!d.Concluido || !dc) return;
    const suas = sprints.filter(s=>passouPelaSprint(d, s.name)); // já cronológicas
    if(!suas.length) return; // não participou de nenhuma sprint do recorte
    // (1) entrega dentro da janela: a issue precisa ainda pertencer à sprint na
    // data. (2) entrega anterior ao início: precisa abrir a sprint como membro.
    // Sem essa validação, uma passagem antiga por uma sprint futura sequestrava
    // a entrega mesmo após a issue ter saído dela (caso CONV-1121).
    let alvo = suas.find(s=>{
       const janela = janelas.get(s.name)!;
      if(dc > janela.ate) return false;
      const semCronologia = !sprintPeriods(d).some(p=>p.sprint===s.name)
        && (d.Sprints||[]).includes(s.name);
      if(semCronologia) return true;
      return dc < janela.de
        ? membroNoInstante(d, s.name, Date.parse(s.startDate))
        : membroNaData(d, s.name, dc);
    });
    if(!alvo){
      // (3) procura, da mais recente para a mais antiga, a sprint que realmente
      // fechou com o item dentro. A última passagem cronológica pode ter acabado
      // antes mesmo do início da sprint, como ocorreu com a CONV-1121.
      const fechamento = suas.slice().reverse().find(s=>{
        const fimMs = sprintFimMs(s);
        const semCronologia = !sprintPeriods(d).some(p=>p.sprint===s.name)
          && (d.Sprints||[]).includes(s.name);
        const ficouAteOFim = semCronologia || (fimMs!=null && membroNoInstante(d, s.name, fimMs));
        const atraso = diasEntreDatas(janelas.get(s.name)!.ate, dc);
        return sprintFechada(s) && ficouAteOFim && atraso>=0
          && atraso<=TOLERANCIA_FECHAMENTO_DIAS;
      });
      if(fechamento){
        alvo = fechamento;
      } else {
        const ultima = suas[suas.length-1];
        const fimMs = sprintFimMs(ultima);
        const semCronologia = !sprintPeriods(d).some(p=>p.sprint===ultima.name)
          && (d.Sprints||[]).includes(ultima.name);
        const ficouAteOFim = semCronologia || (fimMs!=null && membroNoInstante(d, ultima.name, fimMs));
        const atraso = diasEntreDatas(janelas.get(ultima.name)!.ate, dc);
        foraDetalhe.push({
          item: d, sprint: ultima.name, atraso,
          motivo: ficouAteOFim ? 'tardia' : 'saiu',
        });
        return;
      }
    }
    if(!porSprint.has(alvo.name)) porSprint.set(alvo.name, []);
    porSprint.get(alvo.name)!.push(d);
  });
  return {porSprint, foraDeSprint: foraDetalhe.map(x=>x.item), foraDetalhe};
}

const spDe = (d: DashboardIssue): number => Number(d['Story Points']) || 0;
/* Sprint selecionada na aba Sprint (seleção única). */
let sprintSelection: string | null = null;

/* Dropdown de sprint no mesmo padrão da barra de filtros (.dd-*), com busca
   interna. Seleção única: clicar em um item troca a sprint e fecha o painel.
   Idempotente — a carga progressiva chama esta função a cada lote. */
function initSprintSelector(): void {
  const wrap = document.getElementById('dd-sprintPick');
  if(!wrap) return;
  const names = sprintNamesFromData();
  if(!sprintSelection || !names.includes(sprintSelection)) sprintSelection = names[0] || null;

  wrap.replaceChildren();

  const btn = document.createElement('button');
  btn.className = 'dd-btn';
  btn.style.minWidth = '260px';
  const val = document.createElement('span');
  val.className = 'dd-val';
  const semSquad = selections['Squad'].size===0;
  val.textContent = sprintSelection || (semSquad
    ? 'Selecione uma Squad'
    : 'Nenhuma sprint encontrada para a Squad');
  btn.appendChild(val);
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.cssText = 'margin-left:auto;color:var(--slate-soft);font-size:11px;';
  btn.appendChild(caret);
  btn.disabled = !names.length;

  const panel = document.createElement('div');
  panel.className = 'dd-panel';
  panel.style.minWidth = '260px';   // acompanha a largura do botão

  const search = document.createElement('input');
  search.className = 'dd-search';
  search.placeholder = 'Buscar sprint...';
  panel.appendChild(search);

  const list = document.createElement('div');
  list.className = 'dd-list';
  if(names.length){
    names.forEach((n: string)=>{
      const item = document.createElement('div');
      item.className = 'dd-item single' + (n===sprintSelection ? ' selected' : '');
      item.textContent = n;
      item.addEventListener('click', e=>{
        e.stopPropagation();
        sprintSelection = n;
        val.textContent = n;
        list.querySelectorAll('.dd-item').forEach(it=> it.classList.toggle('selected', it===item));
        panel.classList.remove('open');
        renderSprint();
      });
      list.appendChild(item);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'dd-empty';
    empty.textContent = 'Nenhuma sprint encontrada nos dados.';
    list.appendChild(empty);
  }
  panel.appendChild(list);

  wrap.appendChild(btn);
  wrap.appendChild(panel);

  btn.addEventListener('click', e=>{
    e.stopPropagation();
    document.querySelectorAll('.dd-panel.open').forEach(p=>{ if(p!==panel) p.classList.remove('open'); });
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open');
    if(opening){
      search.value = '';
      list.querySelectorAll<HTMLElement>('.dd-item').forEach(it=>{ it.style.display='flex'; });
      search.focus();
    }
  });
  search.addEventListener('click', e=>e.stopPropagation());
  search.addEventListener('input', ()=>{
    const q = search.value.toLowerCase();
    list.querySelectorAll<HTMLElement>('.dd-item').forEach(it=>{
      it.style.display = (it.textContent || '').toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
  list.addEventListener('click', e=>e.stopPropagation());
  panel.addEventListener('click', e=>e.stopPropagation());

  bindDropdownOutsideClick();
}
/* Item "standard" = unidade de entrega do time, a que carrega Story Points sem
   duplicar o pai. Fora ficam Épico (SP agregado), Sub-task (somaria o SP do pai
   de novo) e Dependência.
   Dependência precisa estar aqui, e não só fora do filtro padrão de Tipo: a aba
   Sprint e o velocity usam SKIP_TIPO, então o filtro de Tipo não as protege.
   141 das 189 dependências da base TÊM sprint preenchida e 28 têm Story Points —
   sem esta linha elas entrariam como capacidade e como itens da sprint, sendo
   que uma dependência é acordo entre times, não trabalho de entrega da squad. */
const TIPOS_NAO_STANDARD = new Set(['Épico', 'Sub-task', 'Dependência']);
const isStandard = (d: DashboardIssue): boolean => !!d['Tipo Agrupado'] && !TIPOS_NAO_STANDARD.has(d['Tipo Agrupado']);
const isSubitem  = (d: DashboardIssue): boolean => d['Tipo Agrupado']==='Sub-task';

function renderSprint(): void {
  // '' quando não há sprints nos dados — mantém o render com estado vazio.
  const sprint = sprintSelection || '';
  // Squad limita toda a base. Tipo é aplicado aos itens principais; subtarefas
  // continuam disponíveis para calcular a completude dos pais selecionados.
  const squadBase = DATA.filter(d=>!d.Cancelado && matchesSprintTabFilters(d, SKIP_TIPO));
  const subsByParent = groupBy(squadBase.filter(isSubitem), d=>d.parentKey);
  const subsOf = (parent: DashboardIssue): DashboardIssue[] => subsByParent.get(parent.Chave) || [];

  // itens standard que pertencem à sprint (array Sprints contém)
  const standardNaSprint = squadBase.filter(d=> isStandard(d)
    && matchesSprintTabFilters(d) && (d.Sprints||[]).includes(sprint));

  // A entrega do bloco de progresso deve ser a MESMA do velocity. Calcular pelo
  // estado atual dos subitens fazia um pai com 100% dos filhos aparecer como
  // entregue nesta sprint mesmo quando sua entrega foi atribuída a outra.
  const baseVelocity = DATA.filter(d=>!d.Cancelado && isStandard(d) && matchesSprintTabFilters(d));
  const nomesNaBase = new Set<string>();
  baseVelocity.forEach(d=>{
    sprintPeriods(d).forEach(p=>nomesNaBase.add(p.sprint));
    (d.Sprints||[]).forEach(s=>nomesNaBase.add(s));
  });
  const candidatasVelocity = sprintCatalogoOrdenado()
    .filter(s=>nomesNaBase.has(s.name) && sprintComecou(s));
  const entreguesNaSprint = atribuirEntregas(baseVelocity, candidatasVelocity)
    .porSprint.get(sprint) || [];
  const chavesEntregues = new Set(entreguesNaSprint.map(d=>d.Chave));

  /* Primeiro dia da sprint, para medir o que cada item já trazia pronto ao
     chegar. É o mesmo dia em que o burndown ancora a linha ideal, e é o que
     explica um item aparecer com completude alta sem trabalho nesta sprint. */
  const catSprint = sprintCatalogoOrdenado().find(s=>s.name===sprint);
  const inicioSprint = catSprint ? isoLocalDate(new Date(catSprint.startDate)) : null;

  // por item: X de Y subitens; se Y=0 usa o próprio status
  const rows: SprintCompletionRow[] = standardNaSprint.map((p): SprintCompletionRow=>{
    const subs = subsOf(p);
    const Y = subs.length;
    const X = subs.filter(s=>s.Concluido).length;
    const pct = Y>0 ? (X/Y*100) : (p.Concluido?100:0);
    const prontosNaAbertura = inicioSprint ? subs.filter(s=>{
      const dt = dataEntregaSprint(s);
      return s.Concluido && dt && String(dt).slice(0,10) <= inicioSprint;
    }).length : 0;
    return {p, subs, X, Y, pct, entregue: chavesEntregues.has(p.Chave),
      transbordo: transbordoDeSprint(p, sprint), prontosNaAbertura};
  }).sort((a,b)=> b.pct - a.pct);

  // KPIs
  const totalStd = rows.length;
  const stdEntregues = rows.filter(r=>r.entregue).map(r=>r.p);
  const spPlanejadosSprint = sum(standardNaSprint, d=>d['Story Points']);
  const spConcluidosSprint = sum(stdEntregues, d=>d['Story Points']);
  const totSub = rows.reduce((a,r)=>a+r.Y,0);
  const subConcl = rows.reduce((a,r)=>a+r.X,0);
  const compMedia = rows.length ? rows.reduce((a,r)=>a+r.pct,0)/rows.length : 0;
  const allSubs = rows.flatMap(r=>r.subs);

  Object.assign(__cardDrills, {
    sprint_std: {title:`Itens standard · ${sprint}`, issues: standardNaSprint},
    sprint_stdentregues: {title:`Itens standard entregues · ${sprint}`, issues: stdEntregues},
    sprint_spplan: {title:`Story Points planejados · ${sprint}`, issues: standardNaSprint.filter(d=>spDe(d)>0)},
    sprint_spconcl: {title:`Story Points concluídos · ${sprint}`, issues: stdEntregues.filter(d=>spDe(d)>0)},
    sprint_sub: {title:`Subitens dos standard · ${sprint}`, issues: allSubs},
    sprint_subconcl: {title:`Subitens concluídos · ${sprint}`, issues: allSubs.filter(s=>s.Concluido)},
  });
  const sprintKpis = document.getElementById('sprint-kpis');
  if (!sprintKpis) throw new Error('KPIs de Sprint não encontrados.');
  sprintKpis.innerHTML = [
    kpiCard('Itens standard', fmt0(totalStd), 'itens', '', null, null, 'sprint_std'),
    kpiCard('Completude média', compMedia.toFixed(0), '%', compMedia>=70?'':'amber'),
    kpiCard('Subitens concluídos', `${fmt0(subConcl)}/${fmt0(totSub)}`, '', '', null, null, 'sprint_sub'),
    kpiCard('Standard entregues', `${fmt0(stdEntregues.length)}/${fmt0(totalStd)}`, '', '',
      {cls:'flat', text:'mesma atribuição do velocity'}, null, 'sprint_stdentregues'),
    kpiCard('Story Points planejados', fmt0(spPlanejadosSprint), 'sp', '', null, null, 'sprint_spplan'),
    kpiCard('Story Points concluídos', fmt0(spConcluidosSprint), 'sp', '', null, null, 'sprint_spconcl'),
  ].join('');

  // registro de drill por item (completude chart + tabela)
  rows.forEach((r,i)=>{ __cardDrills['sprintitem_'+i] = {
    // Chave + resumo: quem chega pelo gráfico clicou numa barra rotulada só com
    // a chave e precisa confirmar de qual história é a lista aberta.
    title:`Subitens de ${r.p.Chave}${r.p.Resumo ? ' · '+r.p.Resumo : ''}`,
    issues: r.subs.length?r.subs:[r.p]}; });

  // Gráfico de completude por item (barra horizontal, maior no topo)
  const topRows = rows.slice(0, 20);
  upsertChart('chart-sprint-completude', {
    type:'bar',
    data:{labels:topRows.map(r=>r.p.Chave), datasets:[{data:topRows.map(r=>+r.pct.toFixed(0)), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},
      /* O título do tooltip é o resumo da história, não a chave: a chave já está
         escrita no eixo Y, ao lado da barra que o mouse está apontando, então
         repeti-la gastava a única linha em destaque do tooltip com informação
         redundante. Sem resumo preenchido, cai de volta na chave. */
      tooltip:{callbacks:{
        title:(items: any[])=>{ const r = topRows[items[0].dataIndex]; return r.p.Resumo ? quebraTextoTooltip(r.p.Resumo, 44) : [r.p.Chave]; },
        label:(ctx: any)=>` ${topRows[ctx.dataIndex].X}/${topRows[ctx.dataIndex].Y} subitens (${ctx.parsed.x}%)`}}},
      scales:{x:{beginAtZero:true, max:100, grid:{color:'#ECECEC'}, title:{display:true, text:'% concluído'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=> __cardDrills['sprintitem_'+idx])}
  });

  // Tabela hierárquica
  const sprintTable = document.querySelector<HTMLTableSectionElement>('#sprint-table tbody');
  if (!sprintTable) throw new Error('Tabela de itens da Sprint não encontrada.');
  sprintTable.innerHTML = rows.length ? rows.map((r,i)=>`
    <tr data-drill="sprintitem_${i}" style="cursor:pointer;" data-help="Clique para abrir os subitens usados no cálculo de completude.">
      <td><a class="jira" href="${JIRA_BROWSE}${r.p.Chave}" target="_blank" rel="noopener">${r.p.Chave}</a>
          ${r.transbordo ? `<span class="badge warn" data-help-title="Transbordo" data-help="${escapeHtml(textoTransbordo(r))}" aria-label="${escapeHtml(textoTransbordo(r))}">transbordo</span>` : ''}
          <span style="color:var(--slate-soft);font-size:11px;"> ${escapeHtml((r.p.Resumo||'').slice(0,60))}</span></td>
      <td style="font-size:11.5px;">${r.p.Squad||'—'}</td>
      <td>${r.Y>0 ? `${r.X}/${r.Y}` : '<span style="color:var(--slate-soft);">sem subitens</span>'}</td>
      <td><div class="progressbar"><i style="width:${r.pct}%;"></i><span>${r.pct.toFixed(0)}%</span></div></td>
      <td style="font-size:11.5px;">${r.p.Status||'—'}</td>
    </tr>`).join('') : '<tr><td colspan="5" style="color:var(--slate-soft);">Nenhum item standard nesta sprint (ou sprint não preenchida no Jira).</td></tr>';

  // Burndown de subitens
  renderBurndown(sprint, allSubs);

  // Bloco de velocity: escopo próprio (várias sprints, sem o seletor acima).
  initVelocityRange();
  renderVelocity();
}

/* ===================== VELOCITY (entre sprints) ===================== */
/* Quantas sprints FECHADAS o gráfico mostra; a(s) em andamento entram sempre.
   O número conta só sprint fechada de propósito: contar as duas juntas não
   garantiria a presença do ciclo corrente (uma squad pode ter duas sprints
   ativas ao mesmo tempo, ou nenhuma no intervalo entre elas). 0 = todas. */
let velocityRange = 3;
const VELOCITY_RANGES = [
  {n:3, label:'3 fechadas + atual'},
  {n:6, label:'6 fechadas + atual'},
  {n:12, label:'12 fechadas + atual'},
  {n:0, label:'todas'},
];

function initVelocityRange(): void {
  const wrap = document.getElementById('dd-velocityRange');
  if(!wrap) return;
  wrap.replaceChildren();
  const btn = document.createElement('button');
  btn.className = 'dd-btn';
  btn.style.minWidth = '150px';
  const val = document.createElement('span');
  val.className = 'dd-val';
  val.textContent = (VELOCITY_RANGES.find(r=>r.n===velocityRange)||VELOCITY_RANGES[0]).label;
  btn.appendChild(val);
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.cssText = 'margin-left:auto;color:var(--slate-soft);font-size:11px;';
  btn.appendChild(caret);
  const panel = document.createElement('div');
  panel.className = 'dd-panel';
  panel.style.minWidth = '150px';
  const list = document.createElement('div');
  list.className = 'dd-list';
  VELOCITY_RANGES.forEach(r=>{
    const item = document.createElement('div');
    item.className = 'dd-item single' + (r.n===velocityRange ? ' selected' : '');
    item.textContent = r.label;
    item.addEventListener('click', e=>{
      e.stopPropagation();
      velocityRange = r.n;
      val.textContent = r.label;
      list.querySelectorAll('.dd-item').forEach(it=> it.classList.toggle('selected', it===item));
      panel.classList.remove('open');
      renderVelocity();
    });
    list.appendChild(item);
  });
  panel.appendChild(list);
  wrap.appendChild(btn); wrap.appendChild(panel);
  btn.addEventListener('click', e=>{
    e.stopPropagation();
    document.querySelectorAll('.dd-panel.open').forEach(p=>{ if(p!==panel) p.classList.remove('open'); });
    panel.classList.toggle('open');
  });
  panel.addEventListener('click', e=>e.stopPropagation());
  bindDropdownOutsideClick();
}

/**
 * Série por sprint de uma base de itens: comprometido no início, adicionado
 * depois, entregue na janela e removido antes do fim.
 */
function serieVelocity(itens: DashboardIssue[], sprints: CatalogSprint[]): VelocityCalculation {
  // A atribuição de entregas é feita UMA vez, olhando todas as sprints juntas —
  // é o que garante que a mesma entrega não caia em duas sprints.
  const {porSprint, foraDeSprint, foraDetalhe} = atribuirEntregas(itens, sprints);
  const serie: VelocityPoint[] = sprints.map((s): VelocityPoint=>{
    const ini = Date.parse(s.startDate);
    const fim = sprintFimMs(s);
    const doSprint = itens.filter(d=>passouPelaSprint(d, s.name));
    const comprometidos = doSprint.filter(d=>membroNoInstante(d, s.name, ini));
    const adicionados = doSprint.filter(d=>!membroNoInstante(d, s.name, ini) && entrouDuranteSprint(d, s.name, ini, fim));
    const entregues = porSprint.get(s.name) || [];
    // Removido = saiu dentro da janela E não voltou até o fim (item que saiu e
    // retornou no meio da sprint não é escopo perdido).
    const removidos = doSprint.filter(d=>{
      const saiu = sprintPeriods(d).some(p=> p.sprint===s.name && p.leftAt
        && Date.parse(p.leftAt) <= (fim==null?Infinity:fim));
      return saiu && !(fim!=null && membroNoInstante(d, s.name, fim));
    });
    const soma = (arr: DashboardIssue[]): number => arr.reduce((total, issue)=>total+spDe(issue), 0);
    return {
      sprint: s, fechada: sprintFechada(s),
      comprometido: soma(comprometidos), adicionado: soma(adicionados),
      entregue: soma(entregues), removido: soma(removidos),
      itens: {comprometidos, adicionados, entregues, removidos},
    };
  });
  return {serie, foraDeSprint, foraDetalhe};
}

/**
 * A sprint teve participação real desta base?
 *
 * Um item pode listar a sprint de OUTRA squad no histórico (item emprestado,
 * movimentação entre boards). Sem este corte, a squad selecionada ganha no eixo
 * sprints alheias zeradas — e, pior, elas entrariam na média por squad puxando-a
 * para baixo como se o time tivesse entregado nada num ciclo que não era dele.
 */
function sprintTeveParticipacao(r: VelocityPoint): boolean {
  return (r.itens.comprometidos.length + r.itens.adicionados.length + r.itens.entregues.length) > 0;
}

function renderVelocity(): void {
  const temSquad = selections['Squad'].size > 0;
  const vazio = document.getElementById('velocity-vazio');
  const conteudo = document.getElementById('velocity-conteudo');
  if(vazio) vazio.style.display = temSquad ? 'none' : 'block';
  if(conteudo) conteudo.style.display = temSquad ? 'block' : 'none';

  // Base própria da aba: somente Squad + Tipo. A janela da sprint substitui o
  // período de conclusão e os demais filtros do topo não participam daqui.
  const base = DATA.filter(d=>!d.Cancelado && isStandard(d) && matchesSprintTabFilters(d));

  // Ressalva de transparência: itens cuja cronologia de sprint não pôde ser
  // reconstruída (conjunto conhecido, datas não) — ver SprintHistoryResolver.
  const semHistorico = base.filter(d=>(d.Sprints||[]).length && d.SprintHistoricoOk===false);
  const ressalva = document.getElementById('velocity-ressalva');
  if(ressalva){
    const um = semHistorico.length === 1;
    ressalva.innerHTML = semHistorico.length
      ? ` <b>${fmt0(semHistorico.length)} ${um?'item':'itens'}</b> do recorte ${um?'não tem':'não têm'}`
        + ` histórico de sprint no Jira — o conjunto de sprints é conhecido, a data de entrada não,`
        + ` então ${um?'entra':'entram'} como se ${um?'estivesse':'estivessem'} na sprint desde a criação`
        + ` (<span data-drill="velocity_sem_hist" style="cursor:pointer;text-decoration:underline;">ver itens</span>).`
      : '';
  }
  __cardDrills.velocity_sem_hist = {title:'Itens sem histórico de sprint reconstruível', issues: semHistorico};

  // Só sprints por onde a base efetivamente passou — senão apareceriam as 254
  // sprints de todas as squads.
  const nomesNaBase = new Set<string>();
  base.forEach(d=>{
    sprintPeriods(d).forEach(p=>nomesNaBase.add(p.sprint));
    (d.Sprints||[]).forEach(s=>nomesNaBase.add(s));
  });
  // Candidatas: sprints que a base tocou e que já começaram. O recorte para as
  // "últimas N" acontece DEPOIS de descartar as sem participação — senão sprints
  // alheias zeradas ocupariam as vagas do gráfico.
  const candidatas = sprintCatalogoOrdenado().filter(s=>nomesNaBase.has(s.name) && sprintComecou(s));

  if(temSquad) renderVelocityPorSprint(base, candidatas);
  renderVelocityPorSquad(base);
}

function renderVelocityPorSprint(base: DashboardIssue[], candidatas: CatalogSprint[]): void {
  const calc = serieVelocity(base, candidatas);
  let serie = calc.serie.filter(sprintTeveParticipacao);
  if(velocityRange>0){
    // O recorte limita as FECHADAS; a(s) em andamento entram sempre, para o time
    // não perder de vista o ciclo corrente ao reduzir a janela.
    const emAndamento = serie.filter(r=>!r.fechada);
    serie = serie.filter(r=>r.fechada).slice(-velocityRange).concat(emAndamento)
      .sort((a,b)=> Date.parse(a.sprint.startDate) - Date.parse(b.sprint.startDate));
  }
  const sprints = serie.map(r=>r.sprint);
  const fechadas = serie.filter(r=>r.fechada);

  // Média e say-do só de sprint FECHADA: sprint em andamento está sempre
  // sub-entregue e afundaria os dois indicadores.
  const mediaEntregue = fechadas.length ? fechadas.reduce((a,r)=>a+r.entregue,0)/fechadas.length : null;
  const totalEscopo = fechadas.reduce((a,r)=>a+r.comprometido+r.adicionado,0);
  const totalEntregue = fechadas.reduce((a,r)=>a+r.entregue,0);
  const sayDo = totalEscopo ? (totalEntregue/totalEscopo*100) : null;
  const mediaAdicionado = fechadas.length ? fechadas.reduce((a,r)=>a+r.adicionado,0)/fechadas.length : null;

  Object.assign(__cardDrills, {
    velocity_entregue: {title:'Itens entregues nas sprints fechadas do recorte',
      issues: Array.from(new Set(fechadas.flatMap(r=>r.itens.entregues)))},
    velocity_escopo: {title:'Itens no escopo das sprints fechadas',
      issues: Array.from(new Set(fechadas.flatMap(r=>[...r.itens.comprometidos, ...r.itens.adicionados])))},
    velocity_adicionado: {title:'Itens adicionados depois do início da sprint',
      issues: Array.from(new Set(fechadas.flatMap(r=>r.itens.adicionados)))},
    velocity_fora: {title:'Entregues fora da janela de todas as suas sprints (fora do velocity)',
      issues: calc.foraDeSprint},
  });
  // Entregas que não pertencem a sprint alguma. Não entram em velocity nenhuma —
  // mas ficam à vista, senão o say-do parece quebrado sem explicação. Separadas
  // por motivo, porque as duas causas pedem ações diferentes:
  //   'tardia' — ficou na sprint até o fechamento, mas só entrou em Done mais de
  //              TOLERANCIA_FECHAMENTO_DIAS depois: sinal de status atualizado
  //              tarde, não de trabalho fora de sprint;
  //   'saiu'   — foi retirado da sprint e concluído depois: item que atravessou o
  //              backlog, sinal de higiene de planejamento.
  const foraTardia = calc.foraDetalhe.filter(x=>x.motivo==='tardia');
  const foraSaiu = calc.foraDetalhe.filter(x=>x.motivo==='saiu');
  Object.assign(__cardDrills, {
    velocity_fora_tardia: {
      title:`Ficaram na sprint até o fechamento, mas entraram em Done +${TOLERANCIA_FECHAMENTO_DIAS}d depois`,
      issues: foraTardia.map(x=>x.item)},
    velocity_fora_saiu: {title:'Saíram da sprint e foram concluídos depois',
      issues: foraSaiu.map(x=>x.item)},
  });
  const spFora = calc.foraDeSprint.reduce((a,d)=>a+spDe(d), 0);
  const spTardia = foraTardia.reduce((a,x)=>a+spDe(x.item), 0);
  const spSaiu = foraSaiu.reduce((a,x)=>a+spDe(x.item), 0);
  const velocityKpis = document.getElementById('velocity-kpis');
  if (!velocityKpis) throw new Error('KPIs de Velocity não encontrados.');
  velocityKpis.innerHTML = [
    kpiCard('Velocity média', mediaEntregue==null?'—':fmt1(mediaEntregue), 'sp',
      '', {cls:'flat', text:`${fmt0(fechadas.length)} sprint(s) fechada(s)`}, null, 'velocity_entregue'),
    kpiCard('Say-do ratio', sayDo==null?'—':sayDo.toFixed(0), '%',
      sayDo!=null && sayDo>=70?'':'amber', {cls:'flat', text:'entregue ÷ escopo'}, null, 'velocity_escopo'),
    kpiCard('Escopo adicionado', mediaAdicionado==null?'—':fmt1(mediaAdicionado), 'sp/sprint',
      'coral', {cls:'flat', text:'entrou após o início'}, null, 'velocity_adicionado'),
    kpiCard('Sprints no gráfico', fmt0(serie.length), '', '', {cls:'flat',
      text: serie.length>fechadas.length ? `${serie.length-fechadas.length} em aberto` : 'todas fechadas'}),
    kpiCard('Entregue fora de sprint', spFora ? fmt1(spFora) : '0', 'sp',
      spFora?'amber':'', {cls:'flat', text:`${fmt0(calc.foraDeSprint.length)} item(ns) fora de qualquer janela`},
      null, 'velocity_fora'),
  ].join('');

  // Detalhamento do resíduo: sem ele o KPI acima é um número sem ação possível.
  const detFora = document.getElementById('velocity-fora-detalhe');
  if(detFora){
    const linha = (n: number, sp: number, texto: string, drill: string): string => n
      ? `<span data-drill="${drill}" style="cursor:pointer;text-decoration:underline;">`
        + `<b>${fmt0(n)}</b> ${n===1?'item':'itens'} (${fmt1(sp)} sp) ${texto}</span>`
      : '';
    const partes = [
      linha(foraTardia.length, spTardia,
        `ficaram na sprint até o fechamento, mas só entraram em Done mais de ${TOLERANCIA_FECHAMENTO_DIAS} dias depois`,
        'velocity_fora_tardia'),
      linha(foraSaiu.length, spSaiu, 'saíram da sprint e foram concluídos depois', 'velocity_fora_saiu'),
    ].filter(Boolean);
    detFora.innerHTML = partes.length
      ? `Fora de sprint, por motivo: ${partes.join(' · ')}.`
      : '';
  }

  // A sprint escolhida no seletor do topo ganha borda — amarra as duas metades.
  const destaque = serie.map(r=> r.sprint.name===sprintSelection ? '#333333' : 'transparent');
  const larguraBorda = serie.map(r=> r.sprint.name===sprintSelection ? 2 : 0);
  // Sprint em andamento: entregue em tom claro, para não ler como resultado final.
  const corEntregue = serie.map(r=> r.fechada ? '#CE0058' : '#F7C9DD');

  upsertChart('chart-velocity', {
    type:'bar',
    data:{labels:serie.map(r=>rotuloSprint(r.sprint.name)), datasets:[
      {label:'Comprometido no início', data:serie.map(r=>r.comprometido), backgroundColor:'#8AA0B0',
        borderRadius:3, borderColor:destaque, borderWidth:larguraBorda},
      {label:'Adicionado depois', data:serie.map(r=>r.adicionado), backgroundColor:'#D98E3B',
        borderRadius:3, borderColor:destaque, borderWidth:larguraBorda},
      {label:'Entregue', data:serie.map(r=>r.entregue), backgroundColor:corEntregue,
        borderRadius:3, borderColor:destaque, borderWidth:larguraBorda},
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      // Rótulo de SP em cada barra das três séries. Zeros não recebem rótulo
      // (o plugin os ignora), o que evita poluir sprints sem escopo adicionado.
      barLabels:true, barLabelFmt:'sp', barLabelFont:"600 9px 'Inter',sans-serif",
      layout:{padding:{top:20}},
      plugins:{
      legend:{position:'bottom'},
      tooltip:{callbacks:{
        afterBody:(ctx: any[])=>{
          const r = serie[ctx[0].dataIndex];
          const linhas: string[] = [];
          if(!r.fechada) linhas.push('⚠ sprint ainda não fechada');
          if(r.removido) linhas.push(`saiu da sprint antes do fim: ${fmt1(r.removido)} sp`);
          const escopo = r.comprometido + r.adicionado;
          if(escopo) linhas.push(`entregue ÷ escopo: ${(r.entregue/escopo*100).toFixed(0)}%`);
          return linhas;
        }}}},
      scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Story Points'}},
        x:{grid:{display:false}, ticks:{font:{size:9.5}, maxRotation:60, minRotation:0}}},
      onClick: drillClick((idx: number, ds: number)=>{
        const r = serie[idx];
        const nome = rotuloSprint(r.sprint.name);
        if(ds===0) return {title:`Comprometido no início · ${nome}`, issues:r.itens.comprometidos};
        if(ds===1) return {title:`Adicionado depois do início · ${nome}`, issues:r.itens.adicionados};
        return {title:`Entregue na janela · ${nome}`, issues:r.itens.entregues};
      })}
  });

  const cap = document.getElementById('cap-velocity');
  if(cap && sprints.length){
    const de = sprints[0], ate = sprints[sprints.length-1];
    // Texto curto: os rótulos nas barras já dão os números, e as definições de
    // comprometido/adicionado/entregue estão na aba "Notas sobre os Dados".
    cap.innerHTML = 'Story Points por sprint. Sprint em andamento em tom claro e fora das médias.'
      + ` Período: ${String(de.startDate).slice(0,10).split('-').reverse().join('/')}`
      + ` a ${String(sprintFimMs(ate)!=null ? new Date(sprintFimMs(ate)!).toISOString().slice(0,10):'').split('-').reverse().join('/')}.`;
  }
}

/* Rótulo curto: os nomes de sprint são longos ("26_SQD_PREPARATORIOS_PI3_5") e
   repetem o prefixo da squad, que já está no filtro. */
function rotuloSprint(nome: unknown): string {
  return String(nome).replace(/^\d+_SQD_/i, '').replace(/_/g, ' ');
}

function renderVelocityPorSquad(base: DashboardIssue[]): void {
  // Sem squad selecionada, mostra todas — é o panorama que ajuda a escolher uma.
  // Com filtro aplicado, `base` já vem restrita às selecionadas.
  const porSquad = Array.from(groupBy(base, d=>String(d.Squad ?? '')));
  const linhas: VelocitySquadRow[] = porSquad.map(([squad, itens]): VelocitySquadRow | null=>{
    const nomes = new Set<string>();
    itens.forEach(d=>{
      sprintPeriods(d).forEach(p=>nomes.add(p.sprint));
      (d.Sprints||[]).forEach(s=>nomes.add(s));
    });
    const candidatas = sprintCatalogoOrdenado().filter(s=>nomes.has(s.name) && sprintFechada(s));
    // Mesma regra do gráfico por sprint: sprint sem participação da squad não é
    // sprint dela e não pode entrar na média.
    let serie = serieVelocity(itens, candidatas).serie.filter(sprintTeveParticipacao);
    if(velocityRange>0) serie = serie.slice(-velocityRange);
    if(!serie.length) return null;
    const sprints = serie.map(r=>r.sprint);
    const media = serie.reduce((a,r)=>a+r.entregue,0)/serie.length;
    const escopo = serie.reduce((a,r)=>a+r.comprometido+r.adicionado,0);
    const entregue = serie.reduce((a,r)=>a+r.entregue,0);
    return {squad, media, n:sprints.length, sayDo: escopo? entregue/escopo*100 : null,
      issues: Array.from(new Set(serie.flatMap(r=>r.itens.entregues)))};
  }).filter((row): row is VelocitySquadRow=>row !== null).sort((a,b)=>b.media-a.media);

  const cap = document.getElementById('cap-velocity-squad');
  if(cap){
    cap.innerHTML = 'Média de Story Points entregues por sprint fechada'
      + (velocityRange>0 ? ` (até ${velocityRange} sprints fechadas por squad)` : '')
      + '. Só itens standard, não cancelados.'
      + (selections['Squad'].size ? ' Mostrando apenas as squads filtradas no topo.' : ' Todas as squads do recorte.');
  }
  linhas.forEach((l,i)=>{ __cardDrills['velsq_'+i] = {title:`Entregas nas sprints fechadas · ${l.squad}`, issues:l.issues}; });
  upsertChart('chart-velocity-squad', {
    type:'bar',
    data:{labels:linhas.map(l=>l.squad), datasets:[{data:linhas.map(l=>+l.media.toFixed(1)),
      backgroundColor:'#0057B8', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'sp',
      layout:{padding:{right:56}}, plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(ctx: any)=>{
          const l = linhas[ctx.dataIndex];
          return ` ${fmt1(l.media)} sp/sprint · ${l.n} sprint(s)`
            + (l.sayDo!=null ? ` · say-do ${l.sayDo.toFixed(0)}%` : '');
        }}}},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'SP entregues por sprint'}},
        y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=> __cardDrills['velsq_'+idx])}
  });
}

function renderBurndown(sprint: string, subs: DashboardIssue[]): void {
  const {start, end} = sprintDates(sprint);
  const total = subs.length;
  if(!start || !end || end < start){
    upsertChart('chart-sprint-burndown', {type:'line', data:{labels:['sem datas da sprint'], datasets:[{data:[total], borderColor:'#C4C4C4'}]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{enabled:false}}, scales:{y:{display:false}, x:{grid:{display:false}}}}});
    return;
  }
  // dias da sprint (inclusive)
  const days: Date[]=[]; const d0=new Date(start); d0.setHours(0,0,0,0);
  const dEnd=new Date(end); dEnd.setHours(0,0,0,0);
  for(let d=new Date(d0); d<=dEnd; d.setDate(d.getDate()+1)) days.push(new Date(d));
  const iso = (date: Date): string => date.toISOString().slice(0,10);
  // restante por dia = total - subitens que entraram em Done até aquele dia.
  // Mesma definição de entrega do velocity (ver dataEntregaSprint): usar a data
  // de conclusão do release deixaria o burndown plano até depois da sprint.
  const remaining = days.map(day=>{
    const done = subs.filter(s=>{
      const dt = dataEntregaSprint(s);
      return s.Concluido && dt && String(dt).slice(0,10) <= iso(day);
    }).length;
    return total - done;
  });
  /* Ideal: linear até 0, partindo do que estava ABERTO no primeiro dia — e não
     do total de subitens. Um item que transborda do ciclo anterior chega com
     subitens já concluídos: na App - Aprender / PI3_4 são 33 dos 116 subitens
     já prontos na abertura (APP-825 com 15/19 e APP-767 com 13/17). Partir do
     total dava ao time esses 33 subitens de vantagem GRÁTIS no dia 1 — a linha
     real nascia abaixo da ideal sem que nada tivesse sido feito na sprint, e o
     gráfico lia como adiantado o que era só trabalho do ciclo passado. Com o
     restante do dia 1 as duas linhas se encontram na abertura, que é a leitura
     canônica de um burndown.
     O que esta correção NÃO resolve: `total` é a contagem de HOJE, então
     subitem criado depois do início é retroagido ao dia 1 (aqui, 11 subitens
     criados em 25 e 26/08). Para isso seria preciso contar por `Criado` e
     desenhar a linha de escopo — decisão adiada de propósito. */
  const aberto0 = remaining[0];
  const ideal = days.map((_,i)=> +(aberto0 * (1 - i/(days.length-1||1))).toFixed(1));
  const fmtDay = (date: Date): string => `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
  upsertChart('chart-sprint-burndown', {
    type:'line',
    data:{labels:days.map(fmtDay), datasets:[
      {label:'Restante (real)', data:remaining, borderColor:'#CE0058', backgroundColor:'rgba(206,0,88,.10)', fill:true, tension:.2, pointRadius:2},
      {label:'Ideal', data:ideal, borderColor:'#8AA0B0', borderDash:[6,4], pointRadius:0, tension:0}
    ]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}},
      scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Subitens restantes'}}, x:{grid:{display:false}}}}
  });
}
