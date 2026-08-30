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

const TAB_HELP = {
  exec:'Consolida volume, esforço, tempos e distribuição do recorte. Métricas de entrega respeitam o período de conclusão; estados atuais, como pendentes e WIP, ignoram esse período.',
  throughput:'Conta itens com status classificado como concluído e usa a data de conclusão para posicioná-los no período. Os gráficos respondem aos filtros globais.',
  sp:'Compara Story Points planejados dos itens não cancelados com Story Points concluídos dentro do período selecionado. O card de tempo por Story Point cruza a estimativa com o Cycle Time real dos itens concluídos, em dias corridos, e segue o filtro de Tipo — sub-itens entram quando selecionados, e a legenda avisa quando o recorte mistura níveis.',
  flow:'Lead Time vai da criação à conclusão. Cycle Time vai do início real ao fim real. Datas ausentes ou invertidas ficam fora dessas métricas. O gráfico de tempo por status decompõe o Lead Time usando o changelog do Jira; nele o filtro de Status escolhe quais status aparecem, não quais itens entram. A tendência mensal e o P85 por squad seguem a medida escolhida no próprio card, com seletores independentes; a tendência posiciona cada item pelo mês de conclusão e traz a barra do mês com a média móvel de 3 meses por cima, e o top 12 do ranking conta itens que têm a medida.',
  wip:'Mostra entregas, trabalho ainda aberto e Aging. Os KPIs do topo ignoram o filtro de Tipo (cada card já recorta o seu tipo); os gráficos de entrega seguem o filtro. Aging conta do início real até hoje apenas para itens em WIP.',
  block:'Considera itens do tipo Sub-block. Bloqueios resolvidos usam Cycle Time; bloqueios abertos contam da criação até hoje.',
  sprint:'A associação usa o histórico de sprints do Jira. Completude é subitens concluídos dividido pelo total de subitens do item.',
  pi:'Agrupa épicos do PI por Value Stream e, dentro dela, por squad — os dois níveis nascem recolhidos. O progresso usa os filhos elegíveis, exclui cancelados do denominador e não duplica épicos ou subtarefas. Ao entrar nesta aba o filtro de Programa vem marcado em Afya One; ao sair, a marcação é desfeita.',
  dep:'Considera issues do tipo Dependência. O time DEPENDENTE vem do campo Team; o DEMANDANTE, do campo Time Demandante. A duração conta da abertura até a entrada em Done, lida do changelog — o workflow deste tipo não preenche resolução. Dependência cancelada deixou de ser necessária: conta como episódio, sem somar dias.',
  notas:'Documenta origem dos campos, regras de cálculo, limitações e decisões metodológicas do dashboard.'
};
const FILTER_HELP = {
  'dd-Programa':'Programa é derivado do projeto e do time. Vazio significa todos os programas.',
  'dd-VS':'Value Stream é mapeada a partir do projeto do Jira. Vazio significa todas.',
  'dd-Squad':'Squad vem do campo Team do Jira. Na aba Sprint, esse filtro também define quais sprints ficam disponíveis.',
  'dd-PI':'PI é identificado pelas labels configuradas. Quando há mais de uma label válida, prevalece o PI mais recente reconhecido.',
  'dd-Sprint':'Na aba Estimativas, planejado é o escopo standard da sprint e concluído usa a mesma atribuição do velocity.',
  'dd-AnoCriacao':'Filtra pelo ano de criação da issue, não pelo ano de conclusão.',
  'dd-Mes':'Filtra pelo mês de criação da issue, não pelo mês de conclusão.',
  'dd-Tipo_de_item':'Filtra pelo tipo bruto do Jira, como Story, Enabler, Bug ou Sub-task. Os atalhos no topo do painel marcam um grupo inteiro de uma vez (Nível história, Sub-itens, Bugs, Épicos) e se somam entre si; eles escrevem nesta mesma seleção, então os tipos continuam marcáveis um a um.',
  'dd-Status':'Filtra pelo status atual da issue. Na aba PI Tracking ele é ocultado para não alterar artificialmente o denominador.',
  'dd-sprintPick':'Seleciona uma sprint da squad escolhida. A associação considera o histórico de participação no Jira.',
  'dd-velocityRange':'Define quantas sprints anteriores entram na série de velocity.'
};
const SECTION_HELP = {
  'panel-exec':TAB_HELP.exec,'panel-throughput':TAB_HELP.throughput,'panel-sp':TAB_HELP.sp,
  'panel-flow':TAB_HELP.flow,'panel-wip':TAB_HELP.wip,'panel-block':TAB_HELP.block,
  'panel-sprint':TAB_HELP.sprint,'panel-pi':TAB_HELP.pi,'panel-dep':TAB_HELP.dep,'panel-notas':TAB_HELP.notas
};

function helpForKpi(label){
  const text=String(label||'').toLocaleLowerCase('pt-BR');
  if(text.includes('lead')) return 'Lead Time: dias corridos entre a criação e a conclusão. Só entram itens concluídos com datas válidas.';
  if(text.includes('cycle')) return 'Cycle Time: dias corridos entre o início real e o fim real. Itens sem as duas datas ficam fora.';
  if(text.includes('aging')) return 'Aging: dias desde o início real até hoje para itens ainda em WIP. Não usa a data de criação como substituta.';
  if(text.includes('velocity')) return 'Velocity: média de Story Points entregues por sprint fechada. Sprint ativa e itens cancelados não entram na média.';
  if(text.includes('comprometido')) return 'Story Points dos itens que já pertenciam à sprint quando ela começou.';
  if(text.includes('adicionado')) return 'Story Points dos itens que entraram na sprint depois da data de início.';
  if(text.includes('fora de sprint')) return 'Itens concluídos depois do fim de todas as sprints conhecidas não são atribuídos a uma sprint.';
  if(text.includes('bloque')) return 'Indicador calculado a partir de itens Sub-block e das regras de duração de bloqueio.';
  if(text.includes('cancel')) return 'Itens cujo status atual está classificado como cancelado. Eles não contam como entrega.';
  if(text.includes('quarter')||text.includes('gap plano')) return 'Compara o percentual concluído do PI com o percentual de tempo já transcorrido no quarter.';
  if(text.includes('épico')||text.includes('epico')) return 'Indicador de épicos dentro do PI e dos filtros atuais. Progresso dos filhos e status do épico são dimensões independentes.';
  if(text.includes('story point')||/^sp\b/.test(text)||text.includes(' sp')) return 'Story Points representam esforço. Planejado exclui cancelados; concluído considera itens entregues no recorte aplicável.';
  if(text.includes('wip')||text.includes('andamento')) return 'Itens em andamento no estado atual. O intervalo de conclusão não se aplica porque esses itens ainda não terminaram.';
  if(text.includes('pendente')) return 'Itens em status classificados como pendentes no estado atual. O filtro de período de conclusão não se aplica.';
  if(text.includes('conclu')||text.includes('throughput')||text.includes('entreg')) return 'Quantidade entregue conforme os status classificados como concluídos e o período de conclusão selecionado.';
  if(text.includes('progresso')) return 'Percentual concluído calculado sobre o denominador elegível da métrica, excluindo cancelados quando indicado.';
  return 'Indicador calculado sobre as issues do recorte atual, respeitando os filtros aplicáveis desta aba.';
}

function makeHelpButton(text,label){
  const button=document.createElement('button');
  button.type='button';button.className='help-icon';button.textContent='i';
  button.dataset.help=text;button.setAttribute('aria-label',`Ajuda sobre ${label||'esta informação'}`);
  return button;
}
function showHelpTooltip(anchor){
  if(!anchor?.dataset?.help) return;
  let tooltip=document.getElementById('__help-tooltip');
  if(!tooltip){tooltip=document.createElement('div');tooltip.id='__help-tooltip';tooltip.setAttribute('role','tooltip');document.body.appendChild(tooltip);}
  tooltip.innerHTML='';
  /* O cabeçalho é "Regra" por default porque a esmagadora maioria das âncoras
     explica um critério de cálculo. `data-help-title` cobre o caso em que o
     tooltip fala de UM item — o badge de transbordo, por exemplo, não enuncia
     regra nenhuma: informa de onde aquele item veio. */
  const title=document.createElement('div');title.className='help-tooltip-title';
  title.textContent=anchor.dataset.helpTitle||'Regra';
  const body=document.createElement('div');body.className='help-tooltip-body';body.textContent=anchor.dataset.help;
  tooltip.append(title,body);tooltip.style.display='block';tooltip.dataset.anchor='active';
  const rect=anchor.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  const gap=8,margin=10;
  const left=Math.max(margin,Math.min(window.innerWidth-box.width-margin,rect.left+rect.width/2-box.width/2));
  let top=rect.top-box.height-gap;
  if(top<margin) top=rect.bottom+gap;
  if(top+box.height>window.innerHeight-margin) top=Math.max(margin,window.innerHeight-box.height-margin);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(margin,top)}px`;
}
function hideHelpTooltip(){const tooltip=document.getElementById('__help-tooltip');if(tooltip)tooltip.style.display='none';}
function installHelpEvents(){
  if(document.body.dataset.helpEvents==='ready') return;
  document.body.dataset.helpEvents='ready';
  document.addEventListener('mouseover',e=>{const a=e.target.closest('[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('mouseout',e=>{const a=e.target.closest('[data-help]');if(a&&!a.contains(e.relatedTarget))hideHelpTooltip();});
  document.addEventListener('focusin',e=>{const a=e.target.closest('[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('focusout',e=>{if(e.target.closest('[data-help]'))hideHelpTooltip();});
  document.addEventListener('click',e=>{const a=e.target.closest('.help-icon[data-help]');if(a){e.preventDefault();e.stopPropagation();const t=document.getElementById('__help-tooltip');if(t&&t.style.display==='block')hideHelpTooltip();else showHelpTooltip(a);}else hideHelpTooltip();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHelpTooltip();});
  window.addEventListener('scroll',hideHelpTooltip,true);window.addEventListener('resize',hideHelpTooltip);
}
function enhanceHelpTooltips(){
  installHelpEvents();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(el=>{el.dataset.help=TAB_HELP[el.dataset.tab]||'';});
  Object.entries(FILTER_HELP).forEach(([id,text])=>{const btn=document.querySelector(`#${id} .dd-btn`);if(btn)btn.dataset.help=text;});
  document.querySelectorAll('.date-filter').forEach(el=>{el.dataset.help='Filtra pela data de conclusão. Métricas de estado atual, como WIP e pendentes, podem ignorar este intervalo.';});
  document.querySelectorAll('.clear-btn').forEach(el=>{el.dataset.help='Remove todas as seleções dos filtros globais e restaura o recorte padrão.';});
  document.querySelectorAll('.tabpanel').forEach(panel=>{
    const heading=panel.querySelector(':scope > .section-head h2');
    if(heading&&!heading.querySelector('.help-icon')) heading.appendChild(makeHelpButton(SECTION_HELP[panel.id]||'Explica as regras e o recorte desta seção.',heading.textContent));
  });
  document.querySelectorAll('.card h3').forEach(heading=>{
    if(heading.querySelector('.help-icon')) return;
    const card=heading.closest('.card');const cap=card?.querySelector('.cap');const hasChart=!!card?.querySelector('canvas');
    let text=cap?.textContent?.trim()||`Mostra ${heading.textContent.trim().toLocaleLowerCase('pt-BR')} para o recorte atual.`;
    text+=' Responde aos filtros aplicáveis desta aba.'+(hasChart?' Passe o mouse para ver valores e clique em uma barra, ponto ou fatia para abrir as issues quando o gráfico permitir.':'');
    heading.appendChild(makeHelpButton(text,heading.textContent));
  });
  document.querySelectorAll('.kpi').forEach(kpi=>{
    if(kpi.querySelector('.help-icon')) return;
    const label=kpi.querySelector('.eyebrow')?.textContent?.trim()||'indicador';
    const explicit=(kpi.dataset.kpiRule||'').trim();
    const help=explicit&&explicit.length<=170?explicit:helpForKpi(label);
    kpi.appendChild(makeHelpButton(help,label));
  });
}

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

/* ===================== Filter state ===================== */
const FILTER_DIMS = [
  {key:'Programa', label:'Programa'},
  {key:'VS', label:'Value Stream'},
  {key:'Squad', label:'Squad'},
  {key:'PI', label:'PI'},
  {key:'Sprint', label:'Sprint'},
  {key:'AnoCriacao', label:'Ano'},
  {key:'Mes', label:'Mês (criação)'},
  {key:'Tipo de item', label:'Tipo'},
  {key:'Status', label:'Status'}
];
const selections: Record<string, Set<any>> = {};
FILTER_DIMS.forEach(f=> selections[f.key] = new Set());
let filterDocumentHandlerBound = false;
// Filtro padrão de Tipo de item (recorte inicial): tipos crus de produção.
const DEFAULT_TIPO = ['Enabler','Melhoria','Story','Technical Debt'];
DEFAULT_TIPO.forEach(t=> selections['Tipo de item'].add(t));
/* Programa padrão: o painel é orientado ao Afya One. É seleção GLOBAL, como a de
   Tipo — a barra abre com o filtro marcado e ele vale em toda aba que usa
   Programa (a Sprint não usa; o PI Tracking usa). Afya Bridge continua a um
   clique de distância: isto é padrão, não trava.
   Medido: Afya Bridge são 3.416 dos 17.256 itens da base (19,8%). */
const DEFAULT_PROGRAMA = ['Afya One'];
DEFAULT_PROGRAMA.forEach(p=> selections['Programa'].add(p));
// Abas que NÃO devem sofrer o filtro de Tipo (dependem de Sub-block/Sub-task).
const SKIP_TIPO = new Set(['Tipo de item']);
/* Grupos que compõem o KPI "Histórias entregues" (aba Entregas, WIP & Aging).
   É o NÍVEL história: filho de épico que não é subitem. Por decisão do time,
   Bug fica FORA — correção de defeito não é entrega de escopo novo —, e
   Dependência também, pela regra geral de que ela é acordo entre times e não
   trabalho de entrega da squad. Antes o KPI olhava só o grupo 'História', então
   Enabler e Débito Técnico entravam no recorte, contavam no percentual e nos
   gráficos, e não apareciam em nenhum dos cards. */
const GRUPOS_NIVEL_HISTORIA = ['História', 'Enabler', 'Débito Técnico'];
/* Recorte que IGNORA o filtro de Status. Usado só pelo gráfico de tempo por
   status, onde a seleção de Status escolhe QUAIS BARRAS aparecer em vez de
   recortar itens: filtrar pelo status ATUAL ali responderia a outra pergunta
   ("quem está parado neste status hoje") e esvaziaria o gráfico. */
const SKIP_STATUS = new Set(['Status']);
/* Tipos que somem do filtro de Tipo na aba Sprint (só de lá: nas outras abas a
   lista segue inteira, e as seleções feitas fora continuam guardadas).
   A aba mede o nível PAI — subitem ali é unidade de medida, não linha: o
   'X de Y subitens' de cada linha vem dos filhos, que entram pelo pai e
   ignoram este filtro (SKIP_TIPO em renderSprint). Épico é outro nível: 2 dos
   257 épicos da base têm sprint preenchida, e os filhos de um épico são
   Histórias, não subitens. Marcar qualquer um destes aqui nunca alterou um
   número na tela — a lista é limpeza visual, não regra de cálculo.
   Subtarefa e 'Correção Staging' não aparecem na base atual, mas estão em
   classification.rules.js como Sub-task e cairiam no mesmo caso. */
const TIPOS_FORA_DA_ABA_SPRINT = new Set([
  'Epic', 'Enabler Epic', 'Dependência',
  'Sub-block', 'Sub-bug', 'Sub-design', 'Sub-imp', 'Sub-script', 'Sub-task',
  'Sub-test', 'Subtarefa', 'Correção Staging',
]);

/* ===================== Item 6 — Filtro de calendário (por data de conclusão) =====================
   Opção A: itens COM data de conclusão são filtrados pelo intervalo;
   itens em aberto (WIP, sem data de conclusão) permanecem sempre visíveis. */
const dateRange: { from: string | null; to: string | null } = { from: null, to: null }; // 'YYYY-MM-DD'

function isoLocalDate(date){
  const year = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2,'0');
  const day = String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function isoToday(){ return isoLocalDate(new Date()); }
/* Dias corridos (inteiros) de uma data 'YYYY-MM-DD' até hoje.
   null quando a data não vier preenchida; data futura conta como 0.
   As duas pontas são lidas como meia-noite UTC, então a subtração não sofre
   deslocamento de fuso — o resultado é a diferença entre datas de calendário. */
function diasCorridosAteHoje(isoDate){
  if(!isoDate) return null;
  const inicioMs = Date.parse(String(isoDate).slice(0,10)+'T00:00:00Z');
  const hojeMs = Date.parse(isoToday()+'T00:00:00Z');
  if(Number.isNaN(inicioMs)||Number.isNaN(hojeMs)) return null;
  return Math.max(0, Math.round((hojeMs-inicioMs)/86400000));
}
/* Default: hoje e os 30 dias corridos anteriores (D-30). */
function setDefaultDateRange(){
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);
  dateRange.from = isoLocalDate(thirtyDaysAgo);
  dateRange.to = isoLocalDate(today);
}

function uniqueVals(key){
  const set = new Set();
  if(key==='Sprint'){
    DATA.forEach(d=>(d.Sprints||[]).forEach(s=>set.add(s)));
  } else if(key==='Status'){
    /* Status entram pelo valor ATUAL **e** pelo histórico — mesma ideia da
       dimensão Sprint acima, que também não se limita à sprint corrente.
       Sem isso, status por onde os itens só PASSAM ficariam fora da lista:
       medido na base, `Em teste`, `PROD`, `Aprovação Comitê`,
       `PRONTO PARA PI PLANNING` e `Tarefas pendentes` não têm um único item
       parado hoje — e `Em teste` é justamente uma etapa de trabalho que o
       gráfico de tempo por status precisa poder selecionar. */
    DATA.forEach(d=>{
      const v = d.Status;
      set.add((v===null || v===undefined || v==='') ? '(Não informado)' : v);
      (d.TempoPorStatus||[]).forEach(perm=>{ if(perm && perm.status) set.add(perm.status); });
    });
  } else {
    DATA.forEach(d=>{
      let v = d[key];
      if(v===null || v===undefined || v==='') v='(Não informado)';
      set.add(v);
    });
  }
  let arr = Array.from(set);
  if(key==='Mes' || key==='MesConclusao'){
    arr = arr.filter(x=>x!=='(Não informado)').sort();
  } else if(key==='AnoCriacao'){
    arr = arr.sort((a,b)=>a-b);
  } else if(key==='PI'){
    arr = arr.sort();
  } else if(key==='Sprint'){
    arr = arr.sort((a,b)=>String(a).localeCompare(String(b),'pt',{numeric:true}));
  } else {
    arr = arr.sort((a,b)=>String(a).localeCompare(String(b),'pt'));
  }
  return arr;
}

/* ---------------------------------------------------------------------------
   ATALHOS DE GRUPO NO FILTRO DE TIPO

   A dor relatada pelos usuários: para trocar o recorte para sub-itens era
   preciso DESMARCAR os 4 tipos do padrão e MARCAR 7 (`Sub-imp`, `Sub-test`,
   `Sub-task`, `Sub-bug`, `Sub-block`, `Sub-script`, `Sub-design`) num dropdown
   de 16 opções — e ainda saber de cor quais são subs. São ~11 cliques para ir,
   e outros 11 para voltar.

   ISTO NÃO É A VOLTA DO FILTRO "TIPO AGRUPADO" que saiu da barra. Continua
   existindo UM filtro de Tipo, com UMA seleção, de tipos crus. O chip só
   escreve nessa seleção em bloco: marcar e desmarcar tipo a tipo continua
   valendo, inclusive depois de usar um chip, e é por isso que os checkboxes
   seguem à vista logo abaixo — a lista é a verdade, o chip é o atalho.

   Os grupos saem do DADO (`Tipo Agrupado`, que chega em cada item), não de uma
   lista mantida aqui: um subtipo novo no Jira entra sozinho em "Sub-itens", do
   mesmo jeito que já entra nos cálculos.

   O chip é TRI-ESTADO, e a regra de clique é assimétrica de propósito: cheio
   limpa o grupo; vazio OU PARCIAL completa. Se parcial também limpasse, quem
   marcou 3 subtipos à mão perderia a seleção ao tentar completá-la. */
const TIPO_ATALHOS = [
  {label:'Nível história', grupos:GRUPOS_NIVEL_HISTORIA},
  // Sub-block entra aqui por decisão do time: o balde é o nível de trabalho, e
  // um bloqueio é sub-item como qualquer outro para efeito de recorte. A aba de
  // Bloqueios continua tendo a leitura própria dele.
  {label:'Sub-itens', grupos:['Sub-task']},
  {label:'Bugs', grupos:['Bug']},
  {label:'Épicos', grupos:['Épico']},
  {label:'Dependências', grupos:['Dependência']},
];

/** Tipos crus PRESENTES na base, por grupo. Grupo sem item não vira chip. */
function tiposPorGrupo(){
  const m = new Map();
  DATA.forEach(d=>{
    const g = d['Tipo Agrupado'], t = d['Tipo de item'];
    if(!g || !t) return;
    if(!m.has(g)) m.set(g, new Set());
    m.get(g).add(t);
  });
  return m;
}

/**
 * Monta a linha de chips no slot reservado no topo do painel de Tipo.
 * @returns função que ressincroniza o estado visual dos chips — precisa ser
 *          chamada por QUEM MAIS mexe na seleção (checkbox, Todos, Limpar e o
 *          Limpar geral da barra), senão o chip fica anunciando um recorte que
 *          não é mais o vigente.
 */
function construirAtalhosDeTipo(slot, list, btn, key){
  const porGrupo = tiposPorGrupo();
  const defs = TIPO_ATALHOS
    .map(a=>({label:a.label, tipos:[...new Set(a.grupos.flatMap(g=>[...(porGrupo.get(g)||[])]))]}))
    .filter(a=>a.tipos.length);
  // Com menos de dois grupos não há o que atalhar, e a linha só tomaria espaço.
  if(defs.length < 2) return ()=>{};

  const row = document.createElement('div');
  row.className = 'dd-chips';
  const chips = defs.map(def=>{
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'dd-chip';
    c.textContent = def.label;
    c.title = `${def.tipos.length} ${def.tipos.length===1?'tipo':'tipos'}: ${def.tipos.join(', ')}`;
    if(def.tipos.every(t=>TIPOS_FORA_DA_ABA_SPRINT.has(t))) c.dataset.noSprint='';
    c.addEventListener('click', (e)=>{
      e.stopPropagation();
      const cheio = def.tipos.every(t=>selections[key].has(t));
      def.tipos.forEach(t=> cheio ? selections[key].delete(t) : selections[key].add(t));
      // A lista é a verdade: os checkboxes são reescritos a partir da seleção,
      // e não o contrário.
      list.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = selections[key].has(cb.value); });
      updateFilterBtn(key, btn);
      sincronizar();
      renderAll();
    });
    row.appendChild(c);
    return {c, def};
  });

  const dica = document.createElement('div');
  dica.className = 'dd-chips-hint';
  dica.textContent = 'Atalhos de grupo — os tipos seguem marcáveis um a um abaixo.';
  slot.appendChild(row);
  slot.appendChild(dica);

  function sincronizar(){
    chips.forEach(({c, def})=>{
      const n = def.tipos.filter(t=>selections[key].has(t)).length;
      c.classList.toggle('on', n === def.tipos.length);
      c.classList.toggle('partial', n > 0 && n < def.tipos.length);
    });
  }
  sincronizar();
  return sincronizar;
}

/* O 'Limpar' geral da barra vive fora do laço que monta cada dropdown, então
   precisa desta referência para ressincronizar os chips junto. */
let sincronizarChipsDeTipo = ()=>{};

/* ---- Correlação PI <-> Programa ----
   Cada PI pertence a um programa, e isso vive como DADO em `quarter.rules.js`
   (`piPeriods[pi].programa`), não num casamento por pedaço do nome: um
   `PI5 - AfyaOne` sem espaço, ou um rename de label, quebraria a regra em
   silêncio, enquanto uma entrada faltando na tabela aparece na hora — o PI some
   da lista.

   Devolve null para quem não pertence a programa nenhum: `Não informado` é o
   caso real e importante, com 9.978 dos 17.256 itens da base (57,8%). */
function piProgramaDaLabel(pi){
  const periods = piRules()?.piPeriods || {};
  return (periods[pi] && periods[pi].programa) || null;
}

/** Esconde do filtro de PI as opções de outro Programa. `Não informado` e
    qualquer PI sem correlação conhecida ficam SEMPRE à vista: eles existem nos
    dois programas, e sumir com eles tiraria a única forma de perguntar "o que
    está sem PI?". */
function sincronizarOpcoesDePi(){
  const wrap = document.getElementById('dd-PI');
  if(!wrap) return;
  const sel = selections['Programa'];
  wrap.querySelectorAll('.dd-item').forEach(item=>{
    const cb = item.querySelector('input[type=checkbox]');
    if(!cb) return;
    const prog = piProgramaDaLabel(cb.value);
    if(prog && sel && sel.size && !sel.has(prog)) item.setAttribute('data-pi-fora','');
    else item.removeAttribute('data-pi-fora');
  });
}

/** Ao trocar o Programa, o PI marcado que não pertence mais ao recorte sai da
    seleção. Sem isso a barra ficaria com um filtro INVISÍVEL recortando a tela:
    a opção some da lista mas continua valendo, e a aba abre vazia sem dizer por
    quê. Devolve true quando mexeu na seleção. */
function limparPisForaDoPrograma(){
  const sel = selections['Programa'];
  if(!sel || !sel.size) return false;
  let mudou = false;
  Array.from(selections['PI']).forEach(pi=>{
    const prog = piProgramaDaLabel(pi);
    if(prog && !sel.has(prog)){ selections['PI'].delete(pi); mudou = true; }
  });
  return mudou;
}

/** O que a troca de Programa dispara no filtro de PI, em ordem: tira da seleção
    o que saiu do recorte, esconde as opções do outro programa e, se a seleção
    esvaziou dentro da aba PI Tracking, entra o PI do quarter corrente do NOVO
    programa — é o comportamento pedido: marcar Afya Bridge traz PI3 - Legado. */
function aplicarCorrelacaoDePi(){
  const esvaziou = limparPisForaDoPrograma();
  sincronizarOpcoesDePi();
  if(esvaziou){
    // A seleção antiga era do usuário ou da aba; em ambos os casos ela deixou de
    // existir, então a aba pode voltar a propor o padrão dela.
    if(!selections['PI'].size) piPadraoAtivo = false;
    piSincronizarPiPadrao();
    sincronizarFiltroNaTela('PI');
  }
}

function buildFilterBar(){
  // Antes de desenhar os checkboxes: assim o PI padrão da aba PI Tracking já
  // nasce marcado na barra, em vez de aparecer só no render seguinte. A barra é
  // reconstruída a cada lote da carga progressiva, e a função é idempotente.
  piSincronizarPiPadrao();
  const bar = document.getElementById('filterBar');
  // A carga progressiva reconstrói as opções a cada lote. Limpar primeiro torna
  // esta função idempotente e impede a duplicação dos controles.
  bar.replaceChildren();
  const head = document.createElement('div');
  head.className = 'filterbar-head';
  head.innerHTML = '<span class="filterbar-symbol" aria-hidden="true">⌁</span>'
    + '<span><strong class="filterbar-title">Filtros</strong><small class="filterbar-summary" id="filterSummary">Nenhum ativo</small></span>';
  const controls = document.createElement('div');
  controls.className = 'filter-controls';
  bar.appendChild(head);
  bar.appendChild(controls);
  FILTER_DIMS.forEach(f=>{
    const wrap = document.createElement('div');
    wrap.className = 'dropdown';
    wrap.id = 'dd-'+f.key.replace(/\s/g,'_');
    const btn = document.createElement('button');
    btn.className = 'dd-btn';
    btn.innerHTML = `<span>${f.label}</span><span class="count" style="display:none">0</span>`;
    const panel = document.createElement('div');
    panel.className = 'dd-panel';

    /* Espaço dos atalhos de grupo, criado ANTES da busca para os chips ficarem
       no topo do painel usando só appendChild — o DOM falso de alguns specs
       (test/pi-tracking.spec.js) não implementa insertBefore. Só o filtro de
       Tipo ganha o slot; nas outras dimensões não haveria o que pendurar. */
    let chipsSlot = null;
    if(f.key==='Tipo de item'){
      chipsSlot = document.createElement('div');
      panel.appendChild(chipsSlot);
    }

    const search = document.createElement('input');
    search.className = 'dd-search';
    search.placeholder = 'Buscar...';
    panel.appendChild(search);

    const list = document.createElement('div');
    list.className = 'dd-list';
    const opts = uniqueVals(f.key);
    opts.forEach(val=>{
      const item = document.createElement('label');
      item.className = 'dd-item';
      if(f.key==='Tipo de item' && TIPOS_FORA_DA_ABA_SPRINT.has(String(val))) item.dataset.noSprint='';
      const displayVal = (f.key==='Mes') ? (MESES[parseInt(val,10)]||val) : val;
      item.innerHTML = `<input type="checkbox" value="${String(val).replace(/"/g,'&quot;')}" ${selections[f.key].has(String(val))?'checked':''}> <span>${displayVal}</span>`;
      list.appendChild(item);
    });
    panel.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'dd-actions';
    actions.innerHTML = `<button data-act="all">Todos</button><button data-act="none">Limpar</button>`;
    panel.appendChild(actions);

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    controls.appendChild(wrap);
    updateFilterBtn(f.key, btn);

    // Só o filtro de Tipo tem agrupamento no dado; as outras dimensões não têm
    // o que atalhar. `sincronizarChips` é no-op nelas.
    const sincronizarChips = chipsSlot
      ? construirAtalhosDeTipo(chipsSlot, list, btn, f.key) : ()=>{};
    if(chipsSlot) sincronizarChipsDeTipo = sincronizarChips;

    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      document.querySelectorAll('.dd-panel.open').forEach(p=>{ if(p!==panel) p.classList.remove('open'); });
      panel.classList.toggle('open');
    });
    search.addEventListener('click', e=>e.stopPropagation());
    search.addEventListener('input', ()=>{
      const q = search.value.toLowerCase();
      list.querySelectorAll('.dd-item').forEach(it=>{
        it.style.display = it.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });
    list.addEventListener('click', e=>e.stopPropagation());
    list.querySelectorAll('input[type=checkbox]').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        if(cb.checked) selections[f.key].add(cb.value);
        else selections[f.key].delete(cb.value);
        // A partir daqui a seleção é DELE: a aba não pode mais apagá-la ao sair,
        // nem reescrevê-la ao voltar.
        if(f.key==='PI') piPadraoAtivo = false;
        if(f.key==='Programa') aplicarCorrelacaoDePi();
        updateFilterBtn(f.key, btn);
        sincronizarChips();
        renderAll();
      });
    });
    actions.querySelector('[data-act="all"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      // 'Todos' age sobre o que está à vista: na aba Sprint os tipos ocultos
      // ficam fora da seleção, senão o contador do botão anunciaria 15 tipos
      // com 6 linhas na tela. O que foi marcado em outra aba fica intacto.
      const soVisiveis = f.key==='Tipo de item' && bar.classList.contains('sprint-only');
      // Mesma ideia no PI: "Todos" não pode marcar PIs de um Programa que nem
      // está na tela — o contador anunciaria uma seleção invisível.
      const alvo = soVisiveis ? '.dd-item:not([data-no-sprint]) input[type=checkbox]'
        : f.key==='PI' ? '.dd-item:not([data-pi-fora]) input[type=checkbox]'
          : 'input[type=checkbox]';
      list.querySelectorAll(alvo).forEach(cb=>{ cb.checked=true; selections[f.key].add(cb.value); });
      if(f.key==='PI') piPadraoAtivo = false;
      if(f.key==='Programa') aplicarCorrelacaoDePi();
      updateFilterBtn(f.key, btn); sincronizarChips(); renderAll();
    });
    actions.querySelector('[data-act="none"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      list.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=false; });
      selections[f.key].clear();
      if(f.key==='PI') piPadraoAtivo = false;
      if(f.key==='Programa') aplicarCorrelacaoDePi();
      updateFilterBtn(f.key, btn); sincronizarChips(); renderAll();
    });
  });

  // A lista de PI só pode ser recortada depois de existir.
  sincronizarOpcoesDePi();

  // Filtros próprios da aba de Dependências (Squad e Papel), mesmo padrão.
  buildDepFilters(controls);

  buildDateFilter(controls);

  const clearAll = document.createElement('button');
  clearAll.className = 'clear-btn';
  clearAll.textContent = '↺ Limpar';
  clearAll.addEventListener('click', ()=>{
    // "Limpar" limpa mesmo, inclusive os padrões (Tipo, Programa e o PI da aba
    // PI Tracking): reescrever qualquer um aqui faria o botão parecer quebrado.
    piPadraoAtivo = false;
    FILTER_DIMS.forEach(f=>{
      selections[f.key].clear();
      const wrap = document.getElementById('dd-'+f.key.replace(/\s/g,'_'));
      wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);
      updateFilterBtn(f.key, wrap.querySelector('.dd-btn'));
    });
    sincronizarChipsDeTipo();
    // e o filtro de Squad da aba de Dependências, que vive na mesma barra
    depSquads.clear();
    const ddSquad = document.getElementById('dd-depSquad');
    if(ddSquad){
      ddSquad.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);
      atualizarBotaoDepSquad(ddSquad.querySelector('.dd-btn'));
    }
    // limpa também o intervalo de datas
    dateRange.from = null; dateRange.to = null;
    const df = document.getElementById('dateFrom'); const dt = document.getElementById('dateTo');
    if(df) df.value=''; if(dt) dt.value='';
    updateFilterSummary();
    renderAll();
  });
  controls.appendChild(clearAll);

  bindDropdownOutsideClick();
  updateFilterSummary();
  syncFilterBarForTab();
}

/* Fecha qualquer .dd-panel aberto ao clicar fora. Compartilhado pela barra de
   filtros e pelo seletor de sprint (aba Sprint). */
function bindDropdownOutsideClick(){
  if(!filterDocumentHandlerBound){
    document.addEventListener('click', ()=>{
      document.querySelectorAll('.dd-panel.open').forEach(p=>p.classList.remove('open'));
    });
    filterDocumentHandlerBound = true;
  }
}

/* Controle de intervalo de datas (item 6) */
function buildDateFilter(bar){
  const wrap = document.createElement('div');
  wrap.className = 'date-filter';
  wrap.innerHTML = `
    <span class="date-filter-title">Conclusão</span>
    <label>de
      <input type="date" id="dateFrom">
    </label>
    <label>até
      <input type="date" id="dateTo">
    </label>
    <button class="date-clear" data-act="clear-date" data-help="Remove somente o intervalo de conclusão, mantendo os demais filtros." aria-label="Limpar período">×</button>`;
  bar.appendChild(wrap);

  const df = wrap.querySelector('#dateFrom');
  const dt = wrap.querySelector('#dateTo');
  df.value = dateRange.from || '';
  dt.value = dateRange.to || '';
  df.addEventListener('change', ()=>{ dateRange.from = df.value || null; updateFilterSummary(); renderAll(); });
  dt.addEventListener('change', ()=>{ dateRange.to = dt.value || null; updateFilterSummary(); renderAll(); });
  wrap.querySelector('[data-act="clear-date"]').addEventListener('click', ()=>{
    dateRange.from = null; dateRange.to = null; df.value=''; dt.value=''; updateFilterSummary(); renderAll();
  });
}
function updateFilterSummary(){
  const summary=document.getElementById('filterSummary');
  if(!summary) return;
  const selected=FILTER_DIMS.reduce((total,f)=>total+selections[f.key].size,0);
  const total=selected+depSquads.size+(dateRange.from||dateRange.to?1:0);
  summary.textContent=total?(total+' '+(total===1?'ativo':'ativos')):'Nenhum ativo';
  summary.classList.toggle('active',total>0);
}
function updateFilterBtn(key, btn){
  const n = selections[key].size;
  const countEl = btn.querySelector('.count');
  if(n>0){ countEl.style.display='inline-block'; countEl.textContent = n; }
  else { countEl.style.display='none'; }
  updateFilterSummary();
}

/** Aplica apenas os filtros da barra (Programa, Squad, PI, etc.), sem data. */
function matchesBarFilters(d, skip){
  for(const f of FILTER_DIMS){
    if(skip && skip.has(f.key)) continue;
    const sel = selections[f.key];
    if(sel.size===0) continue;
    // Sprint tem semântica própria na aba Estimativas e não é um filtro global.
    if(f.key==='Sprint') continue;
    let v = d[f.key];
    if(v===null||v===undefined||v==='') v='(Não informado)';
    if(!sel.has(String(v))) return false;
  }
  return true;
}

/**
 * Recorte de ESTADO ATUAL — só os filtros da barra, sem o intervalo de datas.
 * Base de tudo que é "foto de hoje" ou planejamento: backlog, WIP, aging,
 * bloqueios abertos, cancelados, SP planejado e distribuições por tipo/status.
 * Esses conceitos não têm data de conclusão, então nunca cabem numa janela de
 * conclusão — filtrá-los por período só os apagaria.
 */
function getFilteredNoDate(skip){
  return DATA.filter(d=>matchesBarFilters(d, skip));
}

/**
 * Recorte de ENTREGA NO PERÍODO — filtros da barra + intervalo de conclusão.
 *
 * Regra estrita: com um período selecionado, o item só entra se tiver
 * `Data Conclusao` (= "Fim real", ou "Conclusão" quando o Fim real está vazio)
 * DENTRO do intervalo. Item sem nenhuma das duas datas fica de fora — antes ele
 * passava sempre, o que fazia ~30% da base ignorar o período selecionado.
 * Para métricas de estado atual/planejamento use getFilteredNoDate().
 */
function getFiltered(skip){
  return DATA.filter(d=>{
    if(!matchesBarFilters(d, skip)) return false;
    if(dateRange.from || dateRange.to){
      const dc = d['Data Conclusao'];
      if(!dc) return false; // exige Fim real ou Conclusão preenchidos
      if(dateRange.from && dc < dateRange.from) return false;
      if(dateRange.to && dc > dateRange.to) return false;
    }
    return true;
  });
}

/* ---------- Recorte de ENTREGA da aba "Entregas, WIP & Aging" ----------

   Duas regras próprias, e as duas existem porque o recorte geral (`getFiltered`)
   apagava KPIs inteiros desta aba:

   1) DATA EFETIVA DE ENTREGA. `getFiltered` exige `Data Conclusao`
      (= "Data Fim Real" || "Conclusão"). Épico neste workflow não recebe nenhuma
      das duas: medido na base, só 5 dos 75 épicos concluídos têm
      `Data Conclusao`, e nenhum deles cai numa janela de 30 dias — o KPI
      "Épicos entregues" vinha ZERO mesmo com o filtro de Tipo aberto. Os 75 têm
      `Data Entrega Sprint`, a primeira transição para a categoria Done tirada do
      changelog (`OrigemEntregaSprint: 'changelog'` nos 75). O fallback vale só
      para Épico de propósito: estendê-lo a todos os tipos mudaria os números das
      outras abas, que compartilham o recorte `f`.

   2) SEM JANELA SELECIONADA, PASSA TUDO. Mesmo comportamento do `getFiltered`:
      o intervalo só recorta quando existe.
*/
function dataEntregaEfetiva(d){
  if(d['Data Conclusao']) return d['Data Conclusao'];
  if(d['Tipo Agrupado']==='Épico' && d['Data Entrega Sprint']) return d['Data Entrega Sprint'];
  return null;
}
/** true quando a data efetiva de entrega cai no intervalo selecionado. */
function dentroDoPeriodoDeEntrega(d){
  if(!dateRange.from && !dateRange.to) return true;
  const dc = dataEntregaEfetiva(d);
  if(!dc) return false;
  if(dateRange.from && dc < dateRange.from) return false;
  if(dateRange.to && dc > dateRange.to) return false;
  return true;
}

/* ===================== Chart registry ===================== */
const chartsReg = {};
function chartHexRgb(hex){
  const value=String(hex||'').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];
}
function applyChartDesign(config,ctx,canvas){
  config.options = config.options || {};
  const options = config.options;
  options.responsive = true;
  options.maintainAspectRatio = false;
  if(options.animation===undefined) options.animation = {duration:420,easing:'easeOutQuart'};
  if(options.interaction===undefined) options.interaction = {mode:'nearest',intersect:true};

  options.plugins = options.plugins || {};
  const legend = options.plugins.legend || (options.plugins.legend = {});
  legend.labels = Object.assign({usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:16,color:'#52525B'},legend.labels||{});
  if(legend.position===undefined) legend.position = 'bottom';

  const tooltip = options.plugins.tooltip || (options.plugins.tooltip = {});
  if(typeof tooltip==='object'){
    Object.assign(tooltip,{
      backgroundColor:'rgba(255,255,255,.98)',titleColor:'#18181B',bodyColor:'#52525B',
      borderColor:'#E4E4E7',borderWidth:1,cornerRadius:9,padding:12,
      displayColors:true,usePointStyle:true,boxPadding:5,titleMarginBottom:7,bodySpacing:4,caretSize:6
    });
  }

  const scales = options.scales || {};
  Object.entries(scales).forEach(([axis,scale])=>{
    scale.border = Object.assign({display:false},scale.border||{});
    scale.grid = Object.assign({color:'#EEEFF2',drawTicks:false,lineWidth:1,borderDash:[4,4]},scale.grid||{});
    scale.ticks = Object.assign({color:'#71717A',padding:8,font:{family:"'Inter',sans-serif",size:10.5}},scale.ticks||{});
    const numericAxis=(options.indexAxis==='y'?'x':'y');
    if(axis===numericAxis && scale.ticks.maxTicksLimit===undefined) scale.ticks.maxTicksLimit=6;
    if(scale.title){
      scale.title = Object.assign({color:'#71717A',font:{family:"'Inter',sans-serif",size:10.5,weight:'600'},padding:8},scale.title);
    }
  });

  (config.data?.datasets||[]).forEach(dataset=>{
    const type = dataset.type || config.type;
    if(type==='bar'){
      if(dataset.borderRadius===undefined) dataset.borderRadius=6;
      if(dataset.borderSkipped===undefined) dataset.borderSkipped=false;
      if(dataset.maxBarThickness===undefined) dataset.maxBarThickness=28;
      if(dataset.categoryPercentage===undefined) dataset.categoryPercentage=.64;
      if(dataset.barPercentage===undefined) dataset.barPercentage=.82;
    }
    if(type==='line'){
      if(dataset.borderWidth===undefined) dataset.borderWidth=2.5;
      if(dataset.tension===undefined) dataset.tension=.35;
      if(dataset.pointRadius===undefined) dataset.pointRadius=2.5;
      if(dataset.pointHoverRadius===undefined) dataset.pointHoverRadius=5;
      if(dataset.pointHitRadius===undefined) dataset.pointHitRadius=12;
      if(dataset.pointBorderWidth===undefined) dataset.pointBorderWidth=0;
      const rgb=chartHexRgb(dataset.borderColor);
      if(dataset.fill && rgb){
        const gradient=ctx.createLinearGradient(0,0,0,Math.max(canvas.clientHeight||0,260));
        gradient.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.24)`);
        gradient.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.015)`);
        dataset.backgroundColor=gradient;
      }
    }
    if(type==='doughnut' || type==='pie'){
      if(dataset.borderColor===undefined) dataset.borderColor='#FFFFFF';
      if(dataset.borderWidth===undefined) dataset.borderWidth=2;
      if(dataset.hoverOffset===undefined) dataset.hoverOffset=5;
    }
  });
  if(config.type==='doughnut') options.cutout='74%';
  return config;
}
function upsertChart(id, config){
  const canvas = document.getElementById(id);
  if(!canvas) return null;
  if(chartsReg[id]){ chartsReg[id].destroy(); }
  const ctx=canvas.getContext('2d');
  chartsReg[id] = new Chart(ctx, applyChartDesign(config,ctx,canvas));
  return chartsReg[id];
}
const baseFont = {family:"'Inter',sans-serif", size:11};
Chart.defaults.font = baseFont;
Chart.defaults.color = '#71717A';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;

/* ===== Item 12: rótulos valor + % ===== */
function donutLegendPct(chart){
  const ds = chart.data.datasets[0];
  const total = ds.data.reduce((a,b)=>a+(+b||0),0) || 1;
  return chart.data.labels.map((lab,i)=>{
    const v = +ds.data[i]||0;
    const pct = (v/total*100).toFixed(0);
    return { text:`${lab} — ${fmt0(v)} (${pct}%)`, fillStyle:ds.backgroundColor[i], strokeStyle:ds.backgroundColor[i], lineWidth:0, hidden:false, index:i };
  });
}
const tooltipPct = {
  callbacks:{
    label(ctx){
      const arr = ctx.dataset.data;
      const total = arr.reduce((a,b)=>a+(+b||0),0) || 1;
      let v = ctx.parsed;
      if(v && typeof v==='object') v = (v.x!=null? v.x : v.y);
      v = +v||0;
      const pct = (v/total*100).toFixed(0);
      return ` ${fmt0(v)} (${pct}%)`;
    }
  }
};
function donutPctOptions(extra){
  return Object.assign({
    responsive:true, maintainAspectRatio:false, cutout:'55%',
    plugins:{
      legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}},
      tooltip:tooltipPct
    }
  }, extra||{});
}
// Plugin inline: escreve "valor (pct%)" na ponta de barras horizontais (barPct:true).
// Barras de CONTAGEM que recebem rótulo "valor (%)" — por id de canvas.
const BAR_PCT_IDS = new Set(['chart-tp-squad','chart-tp-vs','chart-wip-entregas-squad','chart-wip-entregas-vs','chart-wip-status','chart-wip-squad','chart-flow-lead-hist','chart-flow-cycle-hist','chart-wip-aging-hist','chart-cancel-month','chart-cancel-squad']);
const barPctPlugin = {
  id:'barPct',
  afterDatasetsDraw(chart){
    const cid = chart.canvas && chart.canvas.id;
    if(!chart.options.barPct && !BAR_PCT_IDS.has(cid)) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;
    const total = data.reduce((a,b)=>a+(+b||0),0) || 1;
    ctx.save();
    ctx.font = "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    meta.data.forEach((bar,i)=>{
      let v = data[i];
      if(v && typeof v==='object') v = (v.x!=null? v.x : v.y);
      const num = Number(v);
      if(!isFinite(num) || num===0) return;
      const txt = `${fmt0(num)} (${(num/total*100).toFixed(0)}%)`;
      if(horiz){ ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt, bar.x + 5, bar.y); }
      else { ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(txt, bar.x, bar.y - 3); }
    });
    ctx.restore();
  }
};
Chart.register(barPctPlugin);

// Plugin: rótulos de valor em barras (vertical ou horizontal, múltiplos datasets).
// Ative com options.barLabels = true. Formata via options.barLabelFmt (opcional).
const barLabelsPlugin = {
  id:'barLabels',
  afterDatasetsDraw(chart){
    if(!chart.options.barLabels) return;
    const ctx = chart.ctx;
    const horiz = chart.options.indexAxis === 'y';
    // IMPORTANTE: não usar função em options (Chart.js trataria como "scriptable"
    // e a invocaria com um objeto de contexto). Usamos uma string de formato.
    const fmtKind = chart.options.barLabelFmt;
    // 'sp' = Story Points: mostra decimal só quando existe (40 · 8,5 · 0,5). Nem
    // fmt0 (arredondaria 0,5 para 1) nem fmt1 (poluiria com "40,0") servem aqui.
    const fmt = fmtKind === 'sp' ? (v=>(Math.round(v*10)/10).toLocaleString('pt-BR'))
      : fmtKind === 'd1' ? (v=>fmt1(v)) : (v=>fmt0(v));
    ctx.save();
    // Barras agrupadas ficam estreitas; deixar a fonte configurável evita rótulo
    // sobrepondo rótulo quando há três séries por sprint.
    ctx.font = chart.options.barLabelFont || "600 10.5px 'Inter',sans-serif";
    ctx.fillStyle = '#3D4C5B';
    chart.data.datasets.forEach((ds,di)=>{
      const meta = chart.getDatasetMeta(di);
      if(meta.hidden) return;
      // Só BARRA ganha rótulo. Num gráfico misto (barras + linha de tendência),
      // rotular também a linha põe dois números quase iguais um sobre o outro em
      // cada mês — e o de cima é a média móvel, que ninguém pediu para ler ponto
      // a ponto. Nenhum gráfico com barLabels tinha linha antes disto.
      if(meta.type === 'line') return;
      meta.data.forEach((bar,i)=>{
        let v = ds.data[i];
        if(v && typeof v==='object') v = (v.x!=null? v.x : v.y); // dado parseado {x,y}
        const num = Number(v);
        if(!isFinite(num) || num===0) return;
        const txt = fmt(num);
        if(horiz){ ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt, bar.x + 5, bar.y); }
        else {
          const stagger=chart.options.barLabelStagger?(di%2)*12:0;
          ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(txt,bar.x,bar.y-4-stagger);
        }
      });
    });
    ctx.restore();
  }
};
Chart.register(barLabelsPlugin);

// Total discreto acima de cada barra empilhada.
const stackTotalsPlugin = {
  id:'stackTotals',
  afterDatasetsDraw(chart){
    if(!chart.options.stackTotals) return;
    const ctx=chart.ctx;
    ctx.save();
    if(chart.options.stackSegmentLabels){
      chart.data.datasets.forEach((ds,di)=>{
        if(!chart.isDatasetVisible(di)) return;
        const color=String(ds.backgroundColor||'');
        const hex=color.match(/^#([0-9a-f]{6})$/i)?.[1];
        const rgb=hex?[0,2,4].map(pos=>parseInt(hex.slice(pos,pos+2),16)):null;
        const luminance=rgb?(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114):0;
        ctx.fillStyle=luminance>165?'#27272A':'#FFFFFF';
        ctx.font="750 9.5px 'Inter',sans-serif";
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        chart.getDatasetMeta(di).data.forEach((bar,i)=>{
          const value=Number(ds.data[i])||0;
          if(!value) return;
          ctx.fillText(fmt0(value),bar.x,(bar.y+bar.base)/2);
        });
      });
    }
    ctx.font="700 10.5px 'Inter',sans-serif";
    ctx.fillStyle='#52525B';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    chart.data.labels.forEach((_,i)=>{
      let total=0,topBar=null;
      chart.data.datasets.forEach((ds,di)=>{
        if(!chart.isDatasetVisible(di)) return;
        const value=Number(ds.data[i])||0;
        total+=value;
        if(value>0) topBar=chart.getDatasetMeta(di).data[i];
      });
      if(topBar&&total) ctx.fillText(fmt0(total),topBar.x,topBar.y-7);
    });
    ctx.restore();
  }
};
Chart.register(stackTotalsPlugin);

/* ===================== Rastreabilidade: drawer de issues (Entrega 4) ===================== */
const JIRA_BROWSE = 'https://medcel.atlassian.net/browse/';
let __drawerIssues = [];   // issues atualmente exibidas (para o CSV)
let __drawerTitle = '';

/* Colunas da tabela do drawer */
const DRAWER_COLS = [
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
let __drawerCols = DRAWER_COLS;

function ensureDrawer(){
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
  document.getElementById('__drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('__drawer-csv').addEventListener('click', exportDrawerCsv);
  document.getElementById('__drawer-search').addEventListener('input', e=>renderDrawerTable(filterDrawerIssues(e.target.value)));
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
}

/* Cor do badge de status. A fase de fluxo já vem calculada do backend em cada
   item (`FaseFluxo`, de IssueClassifier.phaseOf), então o drawer só traduz fase
   -> cor: as listas de status vivem em config/classification.rules.js e não se
   repetem aqui. Antes esta função adivinhava por pedaço de texto do status, e
   errava — "Deploy em Staging" (concluído) saía azul por casar com "staging", e
   "PRONTO PARA PROD" saía cinza por não casar com nada. */
const DRAWER_TONE_BY_PHASE = {
  'Concluído': 'ok',
  'Pendente': 'pending',
  'Em andamento': 'progress',
  'Cancelado': 'risk',
};

/* Item sem FaseFluxo (dataset antigo em cache, por exemplo) cai nas mesmas
   listas, que chegam no `meta` do dataset. O default é "em andamento", igual ao
   backend: status fora de todas as listas nunca fica sem cor de aberto. */
function drawerStatusTone(item, status){
  if(!String(status??'').trim()) return '';
  const fase = item && item.FaseFluxo;
  if(fase) return DRAWER_TONE_BY_PHASE[fase] || 'progress';
  if(piInList(status, window.__RULES_CANCELLED)) return 'risk';
  if(piInList(status, window.__RULES_DONE)) return 'ok';
  if(piInList(status, window.__RULES_PENDING)) return 'pending';
  return 'progress';
}

function filterDrawerIssues(query){
  const term=String(query||'').trim().toLocaleLowerCase('pt-BR');
  if(!term) return __drawerIssues;
  return __drawerIssues.filter(issue=>__drawerCols.some(col=>{
    const value=issue[col.k];
    return String(Array.isArray(value)?value.join(' '):(value??'')).toLocaleLowerCase('pt-BR').includes(term);
  }));
}

function renderDrawerTable(issues){
  const body=document.getElementById('__drawer-body');
  const result=document.getElementById('__drawer-result');
  const visible=issues||[];
  result.textContent=`${visible.length.toLocaleString('pt-BR')} de ${__drawerIssues.length.toLocaleString('pt-BR')} issues`;
  if(!visible.length){
    const searching=!!document.getElementById('__drawer-search')?.value;
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

function openDrawer(title, issues, columns){
  ensureDrawer();
  __drawerCols = columns || DRAWER_COLS;
  __drawerIssues = issues || [];
  __drawerTitle = title || 'Issues';
  document.getElementById('__drawer-title').textContent = __drawerTitle;
  document.getElementById('__drawer-count').textContent = __drawerIssues.length.toLocaleString('pt-BR')+' issues';
  document.getElementById('__drawer-search').value='';
  renderDrawerTable(__drawerIssues);
  document.getElementById('__drawer-overlay').classList.add('open');
  document.getElementById('__drawer').classList.add('open');
  document.body.classList.add('drawer-open');
}

function closeDrawer(){
  const o=document.getElementById('__drawer-overlay'), d=document.getElementById('__drawer');
  if(o) o.classList.remove('open');
  if(d) d.classList.remove('open');
  document.body.classList.remove('drawer-open');
}

function escapeHtml(s){ return s.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function exportDrawerCsv(){
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
function drillClick(resolver){
  return (evt, elements, chart)=>{
    if(!elements || !elements.length) return;
    const el = elements[0];
    const r = resolver(el.index, el.datasetIndex, chart);
    if(r && r.issues) openDrawer(r.title, r.issues);
  };
}

/* KPIs clicáveis: registro preenchido pelo renderExec + listener delegado (uma vez) */
let __cardDrills = {};
document.addEventListener('click', (e)=>{
  const card = e.target.closest('[data-drill]');
  if(!card) return;
  const d = __cardDrills[card.getAttribute('data-drill')];
  if(d) openDrawer(d.title, d.issues, d.columns);
});

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
function kpiCard(eyebrow, value, unit, extraClass, delta, titleAttr, drillKey){
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

/* ===================== TAB: EXEC ===================== */
/* Status em que existe trabalho ativo/valor agregado. A comparação ignora
   caixa, acentos e espaços nas pontas para sobreviver às variações de cadastro
   do Jira (por exemplo, "Deploy em prod" x "Deploy em PROD"). */
const FLOW_VALUE_STATUSES = [
  'Revisão design', 'Refinamento de negócio', 'Refinamento técnico',
  'Desenvolvimento', 'EM ANDAMENTO', 'Deploy em staging',
  'Homologação integrada', 'Deploy em prod',
];
const flowStatusNorm = value=>String(value||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
const FLOW_VALUE_STATUS_SET = new Set(FLOW_VALUE_STATUSES.map(flowStatusNorm));
/* Backlog fica fora dos dois lados por decisão de negócio: o relógio desta
   eficiência começa quando o item deixa o estoque inicial do fluxo. */
const FLOW_EFFICIENCY_EXCLUDED_STATUS_SET = new Set(['Backlog'].map(flowStatusNorm));

function flowEfficiencyRows(base){
  return (base||[]).filter(d=>d.Concluido && (d.TempoPorStatus||[]).length).map(d=>{
    let valor=0, total=0;
    const partes=[];
    (d.TempoPorStatus||[]).forEach(p=>{
      const dias=Number(p&&p.dias);
      const status=p&&String(p.status||'').trim();
      if(!status || !(dias>0)) return;
      if(FLOW_EFFICIENCY_EXCLUDED_STATUS_SET.has(flowStatusNorm(status))) return;
      const agrega=FLOW_VALUE_STATUS_SET.has(flowStatusNorm(status));
      total+=dias;
      if(agrega) valor+=dias;
      partes.push(`${status}: ${fmt1(dias)} d (${agrega?'valor agregado':'espera'})`);
    });
    if(!(total>0)) return null;
    return Object.assign({},d,{
      _TempoValor:Number(valor.toFixed(2)),
      _TempoTotal:Number(total.toFixed(2)),
      _Eficiencia:Number((valor/total*100).toFixed(1)),
      _Historico:d.StatusHistoricoOk===false?'Parcial':'Completo',
      _Decomposicao:partes.join(' · '),
    });
  }).filter(Boolean);
}

const FLOW_EFFICIENCY_DRAWER_COLS = [
  {k:'Chave',label:'Chave',link:true}, {k:'Resumo',label:'Resumo'},
  {k:'Squad',label:'Team'}, {k:'PI',label:'PI'},
  {k:'_TempoValor',label:'Valor agregado (d)'}, {k:'_TempoTotal',label:'Tempo total (d)'},
  {k:'_Eficiencia',label:'Eficiência (%)'}, {k:'_Historico',label:'Histórico'},
  {k:'_Decomposicao',label:'Decomposição por status'},
];

function renderExec(f, atual){
  // f = concluídos no período; atual = recorte completo (estado atual/planejamento).
  const concl = f.filter(d=>d.Concluido);
  const total = atual.length;
  const cancel = atual.filter(d=>d.Cancelado).length;
  const ativos = total - cancel;
  const pct = ativos? (concl.length/ativos*100) : 0;
  // Ainda alimenta o gráfico planejado × concluído por PI; apenas os dois KPIs
  // de SP foram removidos da Visão Geral.
  const naoCancel = atual.filter(d=>!d.Cancelado);
  const leadVals = f.filter(d=>d.LeadTimeDias!=null).map(d=>d.LeadTimeDias);
  const cycleVals = f.filter(d=>d.CycleTimeDias!=null).map(d=>d.CycleTimeDias);
  const leadP85 = percentile(leadVals, 85);
  const cycleP85 = percentile(cycleVals, 85);
  // Razão de somas: todos os itens pesam pelos dias que efetivamente ocuparam o
  // fluxo. Numerador e denominador vêm da mesma cronologia de status.
  const eficRows=flowEfficiencyRows(f);
  const tempoValor=sum(eficRows,d=>d._TempoValor);
  const tempoTotal=sum(eficRows,d=>d._TempoTotal);
  const eficFluxo=tempoTotal>0 ? tempoValor/tempoTotal*100 : null;
  const eficEspera = eficFluxo!=null
    ? {cls:'flat', text:`${fmt1(100-eficFluxo)}% em espera`} : null;

  // Pendentes e Em andamento refletem o ESTADO ATUAL (ignoram o filtro de data,
  // respeitam os demais filtros). Concluídos respeita o período selecionado.
  const pendentes = atual.filter(d=>d.FaseFluxo==='Pendente').length;
  const andamento = atual.filter(d=>d.FaseFluxo==='Em andamento').length;
  const temPeriodo = !!(dateRange.from || dateRange.to);

  const statusPend = (window.__RULES_PENDING||[]).join(', ');
  const statusAnd  = (window.__RULES_INPROG||[]).join(', ');

  // Registro dos drills de cada KPI (issues por trás de cada número)
  const hojeFmt = (()=>{ const [a,m,d]=isoToday().split('-'); return `${d}/${m}/${a}`; })();
  Object.assign(__cardDrills, {
    pendentes: {title:`Backlog atual · posição em ${hojeFmt}`, issues: atual.filter(d=>d.FaseFluxo==='Pendente')},
    andamento: {title:`Itens em andamento · posição em ${hojeFmt}`, issues: atual.filter(d=>d.FaseFluxo==='Em andamento')},
    concluidos: {title: temPeriodo?'Concluídos no período':'Concluídos', issues: concl},
    lead: {title:'Itens com Lead Time (concluídos)', issues: f.filter(d=>d.LeadTimeDias!=null)},
    cycle: {title:'Itens com Cycle Time', issues: f.filter(d=>d.CycleTimeDias!=null)},
    eficiencia: {
      title:`Eficiência de Fluxo · ${fmt1(tempoValor)} d de valor / ${fmt1(tempoTotal)} d totais`,
      issues:eficRows, columns:FLOW_EFFICIENCY_DRAWER_COLS,
    },
  });

  document.getElementById('exec-kpis').innerHTML = [
    kpiCard('Backlog atual', fmt0(pendentes), 'itens', 'snapshot slate',
      {cls:'flat', text:`posição em ${hojeFmt}`}, 'Status considerados pendentes: '+statusPend, 'pendentes'),
    kpiCard('Itens em andamento', fmt0(andamento), 'itens', 'snapshot coral',
      {cls:'flat', text:`posição em ${hojeFmt}`}, 'Status em andamento: '+statusAnd, 'andamento'),
    kpiCard('Concluídos', fmt0(concl.length), 'itens', '',
      {cls:'up', text: temPeriodo ? 'no período filtrado' : pct.toFixed(0)+'% dos itens ativos'}, null, 'concluidos'),
    kpiCard('Lead Time (P85)', fmt1(leadP85), 'dias', 'amber', null, null, 'lead'),
    kpiCard('Cycle Time (P85)', fmt1(cycleP85), 'dias', 'amber', null, null, 'cycle'),
    kpiCard('Eficiência de Fluxo', fmt1(eficFluxo), '%', 'amber', eficEspera,
      'Tempo nos status de valor agregado dividido pelo tempo do changelog após o Backlog. Clique para auditar itens e status.', 'eficiencia'),
  ].join('');

  // Throughput mensal
  const months = sortedMonthKeys(concl, 'AnoMesConclusao');
  const monthCounts = months.map(m=> concl.filter(d=>d.AnoMesConclusao===m).length);
  upsertChart('chart-exec-throughput-month', {
    type:'line',
    data:{ labels:months.map(monthLabel), datasets:[{
      label:'Itens concluídos', data:monthCounts, borderColor:'#CE0058', backgroundColor:'rgba(27,143,134,.12)',
      fill:true, tension:.35, pointRadius:3, pointBackgroundColor:'#CE0058'
    }]},
    options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx)=>{
        const m = months[idx];
        return {title:`Concluídos em ${monthLabel(m)}`, issues: concl.filter(d=>d.AnoMesConclusao===m)};
      })}
  });
  // Planejado vem do recorte completo (não tem data de conclusão); concluído, do período.
  const pis = Array.from(new Set(atual.map(d=>d.PI))).sort();
  const spPlanByPi = pis.map(pi=> sum(naoCancel.filter(d=>d.PI===pi), d=>d['Story Points']));
  const spConclByPi = pis.map(pi=> sum(concl.filter(d=>d.PI===pi), d=>d['Story Points']));
  upsertChart('chart-exec-sp-pi', {
    type:'bar',
    data:{labels:pis, datasets:[
      {label:'Planejado', data:spPlanByPi, backgroundColor:'#F8CAD8', borderColor:'#FFFFFF', borderWidth:1, borderRadius:4},
      {label:'Concluído', data:spConclByPi, backgroundColor:'#CE0058', borderColor:'#FFFFFF', borderWidth:1, borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false, barLabels:true, barLabelStagger:true,
      barLabelFont:"700 9px 'Inter',sans-serif", layout:{padding:{top:32}},
      scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      plugins:{tooltip:{callbacks:{
        afterBody:(items)=>{ const i=items[0].dataIndex; const plan=spPlanByPi[i]||0, conc=spConclByPi[i]||0, falta=Math.max(0,plan-conc); const p=plan?(conc/plan*100):0;
          return `Entregue ${fmt0(conc)} de ${fmt0(plan)} planejados (${p.toFixed(0)}%)\nNão entregue: ${fmt0(falta)}`; }
      }}},
      onClick: drillClick((idx, ds)=>{
        const pi = pis[idx];
        if(ds===1){ // Concluído
          return {title:`SP concluído · ${pi}`, issues: concl.filter(d=>d.PI===pi)};
        }
        return {title:`SP planejado · ${pi}`, issues: naoCancel.filter(d=>d.PI===pi)};
      })}
  });
  // Distribuições descrevem o recorte inteiro, não só o que concluiu no período.
  const tiposArr = Array.from(groupBy(atual, d=>d['Tipo de item']), ([k,v])=>[k||'(sem tipo)', v.length]).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-exec-tipo-donut', {
    type:'bar',
    data:{labels:tiposArr.map(x=>x[0]), datasets:[{data:tiposArr.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{
        const t = tiposArr[idx][0];
        return {title:`Tipo: ${t}`, issues: atual.filter(d=>(d['Tipo de item']||'(sem tipo)')===t)};
      })}
  });
  const statusCounts = Array.from(groupBy(atual, d=>d.Status), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]);
  const top8 = statusCounts.slice(0,8);
  const outros = statusCounts.slice(8).reduce((a,c)=>a+c[1],0);
  const labels = top8.map(x=>x[0]).concat(outros>0?['Outros']:[]);
  const vals = top8.map(x=>x[1]).concat(outros>0?[outros]:[]);
  upsertChart('chart-exec-status-donut', {
    type:'bar',
    data:{labels, datasets:[{data:vals, backgroundColor:COLORS, borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true,
      layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx)=>{
        const lbl = labels[idx];
        if(lbl==='Outros'){
          const top8Set = new Set(top8.map(x=>x[0]));
          return {title:'Status: Outros (fora do top 8)', issues: atual.filter(d=>!top8Set.has(d.Status))};
        }
        return {title:`Status: ${lbl}`, issues: atual.filter(d=>d.Status===lbl)};
      })}
  });

  // Comparativos
  let comparisons = [];
  if(months.length>=2){
    const cur = months[months.length-1], prev = months[months.length-2];
    const curN = concl.filter(d=>d.AnoMesConclusao===cur).length;
    const prevN = concl.filter(d=>d.AnoMesConclusao===prev).length;
    comparisons.push(comparisonCard('Comparativo mensal',monthLabel(prev),monthLabel(cur),prevN,curN));
  }
  // O PI já é um período em si: aplicar por cima a janela de conclusão faria os
  // PIs anteriores aparecerem com ~0 entregas. Este bloco usa as conclusões do
  // recorte inteiro, sem o filtro de datas.
  const atualConcl = atual.filter(d=>d.Concluido);
  const pisConcl = Array.from(new Set(atualConcl.map(d=>d.PI))).sort();
  if(pisConcl.length>=2){
    const piSorted = pisConcl;
    const curPi = piSorted[piSorted.length-1], prevPi = piSorted[piSorted.length-2];
    const curN = atualConcl.filter(d=>d.PI===curPi).length;
    const prevN = atualConcl.filter(d=>d.PI===prevPi).length;
    comparisons.push(comparisonCard('Comparativo por PI',prevPi,curPi,prevN,curN));
  }
  document.getElementById('exec-compare-box').innerHTML = comparisons.length
    ? `<div class="comparison-grid">${comparisons.join('')}</div>`
    : '<div class="comparison-empty">Dados insuficientes para comparar os períodos do recorte atual.</div>';
}

/* ===================== TAB: THROUGHPUT ===================== */
function topNGroup(f, key, n, filterFn){
  const src = filterFn ? f.filter(filterFn) : f;
  const arr = Array.from(groupBy(src, d=>d[key]), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]);
  return n? arr.slice(0,n) : arr;
}
function renderThroughput(f){
  const concl = f.filter(d=>d.Concluido);

  const bySquad = topNGroup(concl,'Squad',null).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-tp-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx)=>{ const v=bySquad[idx][0]; return {title:`Concluídos · Squad: ${v}`, issues: concl.filter(d=>d.Squad===v)}; })}
  });

  const byVS = topNGroup(concl,'VS',null).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-tp-vs', {
    type:'bar',
    data:{labels:byVS.map(x=>x[0]), datasets:[{data:byVS.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx)=>{ const v=byVS[idx][0]; return {title:`Concluídos · Value Stream: ${v}`, issues: concl.filter(d=>d.VS===v)}; })}
  });

  const byProg = topNGroup(concl,'Programa',null);
  upsertChart('chart-tp-programa', {
    type:'doughnut',
    data:{labels:byProg.map(x=>x[0]), datasets:[{data:byProg.map(x=>x[1]), backgroundColor:['#CE0058','#0057B8','#333333'], borderWidth:2, borderColor:'#fff'}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}}, tooltip:tooltipPct}, cutout:'55%',
      onClick: drillClick((idx)=>{ const v=byProg[idx][0]; return {title:`Concluídos · Programa: ${v}`, issues: concl.filter(d=>d.Programa===v)}; })}
  });

  const byPi = topNGroup(concl,'PI',null).sort((a,b)=>a[0].localeCompare(b[0]));
  upsertChart('chart-tp-pi', {
    type:'bar',
    data:{labels:byPi.map(x=>x[0]), datasets:[{data:byPi.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}, ticks:{font:{size:9}}}},
      onClick: drillClick((idx)=>{ const v=byPi[idx][0]; return {title:`Concluídos · PI: ${v}`, issues: concl.filter(d=>d.PI===v)}; })}
  });

  const byTipo = Array.from(groupBy(concl, d=>d['Tipo de item']), ([k,v])=>[k||'(sem tipo)', v.length]).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-tp-tipo', {
    type:'bar',
    data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}},
      plugins:{legend:{display:false}, tooltip:tooltipPct},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const v=byTipo[idx][0]; return {title:`Concluídos · Tipo: ${v}`, issues: concl.filter(d=>(d['Tipo de item']||'(sem tipo)')===v)}; })}
  });

  // Empilhado mensal por tipo (desagrupado — todos os tipos crus)
  const months = sortedMonthKeys(concl,'AnoMesConclusao');
  const tipos = Array.from(groupBy(concl, d=>d['Tipo de item']), ([k,v])=>[k||'(sem tipo)', v.length]).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const typeColors={
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
      onClick: drillClick((idx, ds)=>{ const m=months[idx], t=tipos[ds];
        return {title:`Concluídos · ${monthLabel(m)} · ${t}`, issues: concl.filter(d=>d.AnoMesConclusao===m && (d['Tipo de item']||'(sem tipo)')===t)}; })}
  });

  // Compare table by squad: current vs previous month
  const tbody = document.querySelector('#tp-compare-table tbody');
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

/* ===================== TAB: ESTIMATIVAS ===================== */
function renderSP(f, atual){
  const sprintSelecionada = selections.Sprint.size>0;
  let concl;
  let naoCancel;
  if(sprintSelecionada){
    // Com Sprint, SP é capacidade de itens standard: subtarefas não carregam a
    // sprint de forma confiável e somá-las duplicaria o esforço do pai.
    const base = atual.filter(d=>!d.Cancelado && isStandard(d));
    // Planejado segue a mesma base do Progresso por Sprint: associação atual
    // no campo Sprints. `passouPelaSprint` incluiria itens retirados antes do
    // início do ciclo, inflando APP_Aprender_PI3_3 de 31 para 60 SP.
    naoCancel = base.filter(d=>Array.from(selections.Sprint)
      .some(s=>(d.Sprints||[]).includes(s)));
    const catalogo = sprintCatalogoOrdenado().filter(s=>sprintComecou(s));
    const {porSprint} = atribuirEntregas(base, catalogo);
    const entregues = new Map();
    selections.Sprint.forEach(nome=>(porSprint.get(nome)||[]).forEach(d=>entregues.set(d.Chave,d)));
    concl = Array.from(entregues.values());
  } else {
    // Sem Sprint, mantém a regra histórica da aba: planejamento no recorte
    // completo e conclusão dentro do período selecionado.
    concl = f.filter(d=>d.Concluido);
    naoCancel = atual.filter(d=>!d.Cancelado);
  }
  const spTotal = sum(naoCancel, d=>d['Story Points']);
  const spConcl = sum(concl, d=>d['Story Points']);
  const pct = spTotal? (spConcl/spTotal*100):0;

  Object.assign(__cardDrills, {
    sptab_plan: {title:'Itens com SP planejado (não cancelados)', issues: naoCancel.filter(d=>(d['Story Points']||0)>0)},
    sptab_concl: {title:'Itens com SP concluído', issues: concl.filter(d=>(d['Story Points']||0)>0)},
    sptab_pct: {title:'Base do % entregue (planejados com SP)', issues: naoCancel.filter(d=>(d['Story Points']||0)>0)},
    sptab_nosp: {title:'Itens sem Story Points (exceto cancelados)', issues: naoCancel.filter(d=>!d['Story Points'])},
  });
  document.getElementById('sp-kpis').innerHTML = [
    kpiCard('Story Points planejados', fmt0(spTotal), 'sp', '', null, null, 'sptab_plan'),
    kpiCard('Story Points concluídos', fmt0(spConcl), 'sp', '', null, null, 'sptab_concl'),
    kpiCard('% entregue', pct.toFixed(0), '%', pct>=70?'':'amber', null, null, 'sptab_pct'),
    kpiCard('Itens sem SP', fmt0(naoCancel.filter(d=>!d['Story Points']).length), 'itens', 'coral', null, null, 'sptab_nosp'),
  ].join('');

  function plannedVsCompleted(key){
    const keys = Array.from(new Set(naoCancel.map(d=>d[key]))).sort();
    const planned = keys.map(k=> sum(naoCancel.filter(d=>d[key]===k), d=>d['Story Points']));
    const completed = keys.map(k=> sum(concl.filter(d=>d[key]===k), d=>d['Story Points']));
    return {keys, planned, completed};
  }

  const bySquad = plannedVsCompleted('Squad');
  // sort by planned desc
  const orderSq = bySquad.keys.map((k,i)=>[k,bySquad.planned[i],bySquad.completed[i]]).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-sp-squad', {
    type:'bar',
    data:{labels:orderSq.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderSq.map(x=>x[1]), backgroundColor:'#F7C9DD', borderRadius:4},
      {label:'Concluído', data:orderSq.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}
    ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx, ds)=>{ const k=orderSq[idx][0];
        return ds===1 ? {title:`SP concluído · Squad: ${k}`, issues: concl.filter(d=>d.Squad===k)}
                      : {title:`SP planejado · Squad: ${k}`, issues: naoCancel.filter(d=>d.Squad===k)}; })}
  });

  const byVS = plannedVsCompleted('VS');
  const orderVs = byVS.keys.map((k,i)=>[k,byVS.planned[i],byVS.completed[i]]).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-sp-vs', {
    type:'bar',
    data:{labels:orderVs.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderVs.map(x=>x[1]), backgroundColor:'#CBD9F0', borderRadius:4},
      {label:'Concluído', data:orderVs.map(x=>x[2]), backgroundColor:'#0057B8', borderRadius:4}
    ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx, ds)=>{ const k=orderVs[idx][0];
        return ds===1 ? {title:`SP concluído · VS: ${k}`, issues: concl.filter(d=>d.VS===k)}
                      : {title:`SP planejado · VS: ${k}`, issues: naoCancel.filter(d=>d.VS===k)}; })}
  });

  const byPi = plannedVsCompleted('PI');
  const orderPi = byPi.keys.map((k,i)=>[k,byPi.planned[i],byPi.completed[i]]).sort((a,b)=>a[0].localeCompare(b[0]));
  upsertChart('chart-sp-pi', {
    type:'bar',
    data:{labels:orderPi.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderPi.map(x=>x[1]), backgroundColor:'#E2E2E2', borderRadius:4},
      {label:'Concluído', data:orderPi.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}
    ]},
    options:{responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx, ds)=>{ const k=orderPi[idx][0];
        return ds===1 ? {title:`SP concluído · PI: ${k}`, issues: concl.filter(d=>d.PI===k)}
                      : {title:`SP planejado · PI: ${k}`, issues: naoCancel.filter(d=>d.PI===k)}; })}
  });

  const months = sortedMonthKeys(concl,'AnoMesConclusao');
  const monthSP = months.map(m=> sum(concl.filter(d=>d.AnoMesConclusao===m), d=>d['Story Points']));
  const movAvg = monthSP.map((_,i)=>{
    const win = monthSP.slice(Math.max(0,i-2), i+1);
    return mean(win);
  });
  upsertChart('chart-sp-month', {
    type:'bar',
    data:{labels:months.map(monthLabel), datasets:[
      {type:'bar', label:'SP concluído', data:monthSP, backgroundColor:'#0057B8', borderRadius:4, order:2},
      {type:'line', label:'Tendência (méd. móvel 3m)', data:movAvg, borderColor:'#D64545', backgroundColor:'#D64545', tension:.3, pointRadius:2, order:1}
    ]},
    options:{responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx)=>{ const m=months[idx];
        return {title:`SP concluído · ${monthLabel(m)}`, issues: concl.filter(d=>d.AnoMesConclusao===m)}; })}
  });

  // A base do card de tempo por SP é a MESMA lista de concluídos da aba, com o
  // recorte de sprint já resolvido acima. Guardá-la em __spTimeBase é o que
  // permite trocar a medida no seletor sem refazer `atribuirEntregas`.
  __spTimeBase = concl;
  renderSpTempoPorSP(concl);
}

/* ===================== Tempo por Story Point (aba Estimativas) =====================
 * Responde "1 SP custa quantos dias?" — cruza a ESTIMATIVA (Story Points) com a
 * DURAÇÃO real dos itens já concluídos do recorte.
 *
 * Três decisões desta visão:
 *
 * 1. A MEDIDA PADRÃO É O CYCLE TIME, não o Lead Time. Um item de 1 SP leva ~6
 *    dias de início real a fim real; o Lead Time do mesmo item passa de 18,
 *    porque carrega a fila de backlog anterior ao início. Quem pergunta "quanto
 *    tempo custa um item de 3 pontos" está perguntando pelo tempo de mão na
 *    massa, e é o Cycle Time que responde isso. As duas réguas são as MESMAS já
 *    usadas na aba Lead & Cycle Time — de propósito: o painel não ganha uma
 *    terceira definição de tempo, e comparar uma com a outra aqui é justamente
 *    onde o tempo de espera aparece.
 *
 * 2. QUEM ENTRA É O FILTRO DE TIPO, NÃO UMA TRAVA DAQUI. Sub-itens têm
 *    estimativa PRÓPRIA: o time pontua cada um com 0,5 ou 1 SP de propósito, e
 *    a base confirma (92,3% dos 8.228 sub-itens concluídos com SP estão nesses
 *    dois valores). Então eles aparecem normalmente quando o filtro de Tipo os
 *    inclui. A única exclusão fixa é `Dependência`, e ela vem de uma regra do
 *    time — dependência é acordo entre squads, não trabalho de entrega —, não
 *    de um receio de leitura desta visão.
 *
 *    O RISCO fica declarado em vez de travado: sub-item e item de entrega são
 *    níveis diferentes e a mesma pontuação vale durações diferentes (1 SP roda
 *    em 2,1 dias no sub-item contra 5,2 no item de entrega, medido na base).
 *    Quando o recorte tem os dois, as barras somam os dois — e a legenda diz a
 *    composição, para quem lê saber o que tem na mão.
 *
 *    ATENÇÃO: com uma SPRINT selecionada, sub-itens não chegam aqui de jeito
 *    nenhum. A base de sprint é montada lá em cima no `renderSP` com
 *    `isStandard`, porque naquele modo SP é capacidade e somar filho com pai
 *    duplicaria o esforço. Isso é decisão da aba, não deste card — a legenda
 *    avisa para o gráfico vazio não parecer defeito.
 *
 * 3. TAMANHO COM AMOSTRA PEQUENA NÃO VIRA BARRA. Fora da escala usada pelos
 *    times (0,5 · 1 · 2 · 3 · 5 · 8 · 13) aparecem valores avulsos com um ou
 *    dois itens, cuja "média" é o próprio item. Eles não somem em silêncio: vão
 *    para a última linha da tabela e para a legenda, com a contagem.
 *
 * 4. A REFERÊNCIA DO COMITÊ SÓ VALE NO CYCLE TIME. Ela foi definida para tempo
 *    de execução; medida contra o Lead Time o descolamento chega a 18x na base,
 *    porque o Lead carrega a fila de backlog anterior ao início. Por isso a
 *    linha e as três colunas de referência somem ao trocar de régua — e a
 *    legenda diz que sumiram, para não parecer defeito.
 */

/**
 * Referência de duração por Story Point, definida em comitê pelo time de
 * agilidade. Chave = Story Points, valor = dias.
 *
 * DUAS COISAS PARA QUEM FOR MEXER AQUI:
 *
 * (a) A tabela é a fonte da verdade do que é um tamanho VÁLIDO. Story Points
 *     seguem Fibonacci, então 4, 6, 7, 9, 10, 12, 14 e 20 — que existem na base
 *     — são erro de cadastro, não estimativa. Por decisão do time eles recebem
 *     referência ZERO em vez de "sem referência": não deveriam existir, então
 *     não ganham prazo nenhum e aparecem sempre fora da referência. É `?? 0` em
 *     `referenciaDoComite`, e não um valor faltante. Se um tamanho Fibonacci
 *     novo entrar em uso (34, 55...), ACRESCENTE AQUI — senão ele também cai no
 *     zero e a leitura fica errada.
 *
 * (b) Os valores são de ESFORÇO, provavelmente em dias úteis, e o card mede
 *     dias CORRIDOS. O time optou por manter assim por ora e ajustar depois se
 *     precisar; medido na base, a média fica 5,7x acima da referência em 1 SP e
 *     1,1x em 13 SP — ou seja, a régua é bem calibrada para itens grandes e
 *     otimista para os pequenos. A tabela mostra a razão e o percentual dentro
 *     da referência justamente para essa conversa ser possível com número.
 */
const SP_REFERENCIA_COMITE = { 0.5: 1, 1: 1, 2: 2, 3: 3, 5: 5, 8: 8, 13: 15, 21: 20 };

/** Dias de referência de um tamanho. Fora da escala Fibonacci não há prazo — ver (a). */
function referenciaDoComite(sp){
  const dias = SP_REFERENCIA_COMITE[sp];
  return dias == null ? 0 : dias;
}

/**
 * Mínimo de itens medidos para um tamanho virar barra.
 *
 * O corte é BAIXO de propósito, e a razão está no recorte por squad — que é
 * como o card é usado de verdade. Na base inteira o limiar quase não importa
 * (subir de 3 para 5 tira uma única barra); filtrando por squad ele decide
 * muito: medido nas 18 squads com 20+ itens, o corte em 5 deixa 64 barras
 * contra 76 no corte em 3, e squads como Conversão - Experiência de Compra
 * caem para DUAS barras, o que não é um gráfico.
 *
 * O preço está aceito e é real: com 3 ou 4 itens a média oscila ~30% se um
 * único item entrar ou sair, e o P85 deixa de ser percentil — em n=3 ele cai no
 * índice 1,7 de 0..2, ou seja, é praticamente o maior valor da amostra. A
 * contagem de itens vai na tabela e no tooltip justamente para quem lê poder
 * pesar a barra; abaixo do corte, o tamanho ainda aparece na última linha da
 * tabela, com quantos itens tem.
 */
const SP_TIME_MIN_AMOSTRA = 3;

/* As medidas do seletor — as mesmas duas da aba Lead & Cycle Time, e nenhuma
   régua nova. O rótulo aparece no seletor, no eixo, na legenda e na primeira
   linha do tooltip: os quatro precisam dizer a MESMA coisa, porque é a troca
   silenciosa de régua que confunde a leitura.

   Ambas devolvem `null` (e não 0) quando a data que a métrica exige não está
   preenchida: zero dia entraria na média como se o item tivesse sido
   instantâneo, quando o que houve foi ausência de registro. É por isso que a
   legenda do card sempre declara em quantos itens a medida existe — no Cycle
   Time isso importa, porque ele depende de dois campos manuais. */
const SP_TIME_MEASURES = {
  cycle: {
    rotulo:'Cycle Time',
    eixo:'Cycle Time (dias)',
    regra:'da Data de Início Real à Data de Fim Real',
    valor:(d)=>(d.CycleTimeDias==null ? null : d.CycleTimeDias),
  },
  lead: {
    rotulo:'Lead Time',
    eixo:'Lead Time (dias)',
    regra:'da criação à conclusão, incluindo o tempo de fila antes do início',
    valor:(d)=>(d.LeadTimeDias==null ? null : d.LeadTimeDias),
  },
};

/* Medida escolhida no seletor, e a base do último render. Ambas vivem fora do
   render porque trocar de medida não deve refazer o recorte da aba — em modo
   Sprint isso significaria rodar `atribuirEntregas` de novo. */
let spTimeMetric = 'cycle';
let __spTimeBase = [];

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. */
(function ligarSeletorDeTempoPorSP(){
  const el = document.getElementById('spTimeMetric');
  if(!el) return;
  el.addEventListener('change', ()=>{
    spTimeMetric = el.value;
    renderSpTempoPorSP(__spTimeBase);
  });
})();

/**
 * Um balde por valor de Story Point. `medidos` são os itens que TÊM a medida —
 * é sobre eles que a média é calculada, e é essa lista que o drill abre, para
 * que o número da tabela e o do drawer sejam sempre o mesmo.
 */
function agregarTempoPorSP(base, valor){
  const porSp = new Map();
  base.forEach(d=>{
    const sp = d['Story Points'];
    if(!(sp>0)) return;
    const acc = porSp.get(sp) || {sp, dias:[], medidos:[], total:0};
    porSp.set(sp, acc);
    acc.total += 1;
    const v = valor(d);
    if(v==null) return;
    acc.dias.push(v);
    acc.medidos.push(d);
  });
  return Array.from(porSp.values()).sort((a,b)=>a.sp-b.sp);
}

/**
 * "0,5" · "0,75" · "3" · "13" — rótulo do tamanho.
 *
 * Duas casas decimais, e não uma: arredondar para uma casa COLAPSAVA baldes
 * distintos no mesmo rótulo. Com sub-itens no recorte aparecem 0,25 e 0,75 na
 * base, que viravam "0,3" e "0,8" — os mesmos rótulos de 0,3 e 0,8, que também
 * existem. Duas barras com o mesmo nome, e a legenda listando "0,8" duas vezes.
 */
function spLabel(sp){
  return Number(sp).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Nível de trabalho do item, para a legenda declarar a composição do recorte.
 * Não recorta nada — só nomeia, porque misturar níveis é permitido (ver
 * decisão 2) desde que quem lê saiba que aconteceu.
 */
function nivelDoItem(d){
  const grupo = d['Tipo Agrupado'];
  if(grupo === 'Sub-task') return 'sub-itens';
  if(grupo === 'Épico') return 'épicos';
  return 'itens de entrega';
}

function renderSpTempoPorSP(base){
  if(!document.getElementById('chart-sp-time')) return;
  const caption = document.getElementById('sp-time-caption');
  const tbody = document.querySelector('#sp-time-table tbody');
  const medida = SP_TIME_MEASURES[spTimeMetric] || SP_TIME_MEASURES.cycle;

  /* Quem entra é o filtro de Tipo — ver decisão (2). A única exclusão fixa é
     Dependência, por regra do time: é acordo entre squads, não entrega da
     squad, e o filtro de Tipo não a protege em todos os caminhos. */
  const elegiveis = (base||[]).filter(d=>d['Tipo Agrupado'] !== 'Dependência'
    && (d['Story Points']||0)>0);
  const grupos = agregarTempoPorSP(elegiveis, medida.valor);
  const comAmostra = grupos.filter(g=>g.medidos.length >= SP_TIME_MIN_AMOSTRA);
  const semAmostra = grupos.filter(g=>g.medidos.length > 0 && g.medidos.length < SP_TIME_MIN_AMOSTRA);

  /* A referência só entra no Cycle Time — ver decisão (4). `comRef` governa
     tanto a linha do gráfico quanto as três colunas da tabela, para os dois
     nunca discordarem sobre a régua vigente. */
  const comRef = spTimeMetric === 'cycle';

  const linhas = comAmostra.map(g=>{
    const ref = referenciaDoComite(g.sp);
    return {
      sp:g.sp, n:g.medidos.length, media:mean(g.dias), p85:percentile(g.dias,85),
      min:Math.min(...g.dias), max:Math.max(...g.dias), issues:g.medidos, ref,
      // Fatia dos itens que coube na referência. Com ref 0 (tamanho fora da
      // escala Fibonacci) nada cabe, e é essa a intenção: são erro de cadastro.
      dentro: 100*g.dias.filter(v=>v<=ref).length/g.dias.length,
    };
  });

  const medidos = grupos.reduce((a,g)=>a+g.medidos.length, 0);
  const cobertura = elegiveis.length ? (medidos/elegiveis.length*100) : 0;

  /* Composição por nível. Misturar é permitido, então a legenda declara o que
     entrou — é isso que substitui a trava que esta visão tinha antes. */
  const porNivel = new Map();
  elegiveis.forEach(d=>{ const n = nivelDoItem(d); porNivel.set(n, (porNivel.get(n)||0)+1); });
  const niveis = Array.from(porNivel.entries()).sort((a,b)=>b[1]-a[1]);

  /* Legenda: régua usada, cobertura e o que ficou de fora. Um recorte pode não
     ter nenhum item medido (filtro de Tipo só com Dependência, período sem
     conclusões), e nesse caso a legenda diz isso em vez de a tela ficar muda. */
  if(caption){
    if(!elegiveis.length){
      /* Com Sprint escolhida, a base já chegou aqui sem sub-itens (ver decisão
         2). Sem esta frase, filtrar um subtipo com sprint ativa devolve um
         gráfico vazio que parece defeito. */
      caption.innerHTML = selections.Sprint.size>0
        ? 'Nenhum item concluído com Story Points neste recorte. Com uma <b>sprint selecionada</b>, '
          + 'a aba mede capacidade e considera apenas itens de entrega — sub-itens não entram, '
          + 'porque o esforço deles já está no item pai. Limpe a sprint para analisar sub-itens.'
        : 'Nenhum item concluído com Story Points no recorte atual. Dependência não entra nesta visão.';
    } else {
      const partes = ['Régua: <b>'+medida.rotulo+'</b> — '+medida.regra+'.'];
      partes.push('Medida disponível em <b>'+fmt0(medidos)+'</b> de '+fmt0(elegiveis.length)
        +' itens concluídos com SP ('+cobertura.toFixed(0)+'%).');
      if(niveis.length>1){
        // Podem ser TRÊS níveis (sub-item + entrega + épico), então nem a lista
        // nem o texto podem assumir dois — "os dois" mentiria nesse caso.
        const lista = niveis.map(([n,q])=>fmt0(q)+' '+n);
        const composicao = lista.length===2 ? lista.join(' e ')
          : lista.slice(0,-1).join(', ')+' e '+lista[lista.length-1];
        partes.push('⚠️ <b>O recorte mistura níveis de trabalho</b> ('+composicao
          +'): as barras somam todos. A mesma pontuação vale durações diferentes — '
          +'na base, 1 SP roda em <b>2,1</b> dias no sub-item contra <b>5,2</b> no item de entrega. '
          +'Para comparar, filtre um nível por vez.');
      }
      if(semAmostra.length){
        const itens = semAmostra.reduce((a,g)=>a+g.medidos.length, 0);
        partes.push('Fora do gráfico por amostra menor que '+SP_TIME_MIN_AMOSTRA+' itens: '
          +'<b>'+semAmostra.map(g=>spLabel(g.sp)).join(', ')+'</b> SP — '
          +statusTimePlural(itens,'item','itens')+' no total, na última linha da tabela.');
      }
      /* A referência aparecendo ou sumindo precisa ser DITA: sem isso, trocar a
         régua faz uma linha e três colunas desaparecerem e parece defeito. */
      if(comRef){
        const foraDaEscala = linhas.filter(l=>l.ref===0);
        if(foraDaEscala.length){
          partes.push('Story Points fora da escala Fibonacci não têm prazo do comitê e entram com '
            +'referência <b>zero</b> — são erro de cadastro: '
            +'<b>'+foraDaEscala.map(l=>spLabel(l.sp)).join(', ')+'</b> SP.');
        }
      } else {
        partes.push('A <b>referência do comitê sai da tela nesta régua</b>: ela foi definida para '
          +'tempo de execução, e o Lead Time inclui a fila de backlog anterior ao início.');
      }
      caption.innerHTML = partes.join(' ');
    }
  }

  /* As colunas de referência existem no HTML estático e são ESCONDIDAS fora do
     Cycle Time, em vez de recriar o cabeçalho a cada render. */
  document.querySelectorAll('#sp-time-table .sp-time-ref-col')
    .forEach(th=>{ th.style.display = comRef ? '' : 'none'; });

  if(tbody){
    const colunas = comRef ? 7 : 4;
    const corpo = linhas.map(l=>{
      const celulas = [`<td><b>${spLabel(l.sp)}</b></td>`, `<td>${fmt0(l.n)}</td>`,
        `<td><b>${fmt1(l.media)}</b></td>`, `<td>${fmt1(l.p85)}</td>`];
      if(comRef){
        // Tamanho fora da escala não tem prazo a cumprir: mostrar "2,3x acima de
        // zero" seria dividir por zero e não diria nada. A célula diz o motivo.
        const razao = l.ref>0 ? (l.media/l.ref).toFixed(1)+'x' : '—';
        celulas.push(`<td class="sp-time-ref-col">${l.ref>0 ? fmt0(l.ref)+' d' : '<span style="color:var(--slate-soft);">fora da escala</span>'}</td>`);
        celulas.push(`<td class="sp-time-ref-col">${razao}</td>`);
        celulas.push(`<td class="sp-time-ref-col">${l.dentro.toFixed(0)}%</td>`);
      }
      return '<tr>'+celulas.join('')+'</tr>';
    });
    if(semAmostra.length){
      const itens = semAmostra.reduce((a,g)=>a+g.medidos.length, 0);
      corpo.push('<tr><td colspan="'+colunas+'" style="color:var(--slate-soft);">'
        +'Amostra insuficiente (&lt; '+SP_TIME_MIN_AMOSTRA+' itens): '
        +semAmostra.map(g=>spLabel(g.sp)+' SP').join(' · ')
        +' — '+statusTimePlural(itens,'item','itens')+', sem média confiável.</td></tr>');
    }
    tbody.innerHTML = corpo.length ? corpo.join('')
      : '<tr><td colspan="'+colunas+'" style="color:var(--slate-soft);">Nenhum tamanho com itens suficientes para uma média no recorte atual.</td></tr>';
  }

  const series = [
    {label:'Média', data:linhas.map(l=>l.media), backgroundColor:'#F7C9DD'},
    {label:'P85', data:linhas.map(l=>l.p85), backgroundColor:'#CE0058'}
  ];
  if(comRef){
    /* Tracejada e por cima das barras (order menor desenha depois no Chart.js):
       é uma meta, não uma medição, e precisa ser lida como outra coisa. */
    series.push({
      type:'line', label:'Referência (comitê de agilidade)',
      data:linhas.map(l=>l.ref), order:0,
      borderColor:'#333333', backgroundColor:'#333333', borderDash:[5,4],
      borderWidth:2, tension:0, pointRadius:3, pointHoverRadius:5, fill:false,
    });
  }

  upsertChart('chart-sp-time', {
    type:'bar',
    data:{labels:linhas.map(l=>spLabel(l.sp)+' SP'), datasets:series},
    options:{responsive:true, maintainAspectRatio:false,
      // O rótulo de valor fica só nas BARRAS: repeti-lo na linha de referência
      // encavalaria os números onde a meta passa perto da média.
      barLabels:true, barLabelFmt:'d1', barLabelStagger:true, layout:{padding:{top:24}},
      scales:{
        y:{beginAtZero:true, title:{display:true, text:medida.eixo}},
        x:{grid:{display:false}, title:{display:true, text:'Story Points estimados'}}
      },
      plugins:{tooltip:{callbacks:{
        title:(items)=>{ const l = items.length && linhas[items[0].dataIndex];
          return l ? spLabel(l.sp)+' Story Points · '+medida.rotulo : ''; },
        label:(item)=>{
          const l = linhas[item.dataIndex];
          if(!l) return '';
          // 1ª linha: EXATAMENTE o que a série desenha, com o rótulo dela.
          const serie = item.dataset.label;
          if(item.dataset.type==='line'){
            return l.ref>0 ? ' Referência: '+fmt0(l.ref)+' dias'
              : ' Referência: nenhuma (Story Point fora da escala Fibonacci)';
          }
          const valor = serie==='P85' ? l.p85 : l.media;
          return ' '+serie+': '+fmt1(valor)+' dias';
        },
        afterBody:(items)=>{
          const l = items.length && linhas[items[0].dataIndex];
          if(!l) return '';
          return [statusTimePlural(l.n,'item medido','itens medidos'),
            'Amplitude: '+fmt1(l.min)+' a '+fmt1(l.max)+' dias'];
        }
      }}},
      onClick: drillClick((idx)=>{ const l = linhas[idx];
        return l ? {title:`${medida.rotulo} · ${spLabel(l.sp)} SP`, issues:l.issues} : null; })}
  });
}

/* ===================== TAB: LEAD & CYCLE TIME ===================== */
function histogramBins(arr, nbins){
  if(!arr.length) return {labels:[],counts:[]};
  const max = Math.max(...arr);
  const binSize = Math.max(1, Math.ceil((max||1)/nbins));
  const bins = new Array(Math.ceil((max+1)/binSize)).fill(0);
  arr.forEach(v=>{ const idx = Math.min(bins.length-1, Math.floor(v/binSize)); bins[idx]++; });
  const labels = bins.map((_,i)=> `${i*binSize}-${(i+1)*binSize-1}d`);
  return {labels, counts:bins, binSize};
}
function statBlock(vals){
  return { n:vals.length, mean:mean(vals), median:median(vals), p85:percentile(vals,85), min:vals.length?Math.min(...vals):null, max:vals.length?Math.max(...vals):null };
}
/* ===================== Tempo por status (aba Lead & Cycle Time) =====================
 * Decompõe o Lead Time: onde os itens concluídos gastaram o tempo. Os dados vêm
 * do changelog de Status do Jira, reconstruídos no servidor
 * (domain/services/StatusTimeResolver.js) e entregues em `TempoPorStatus`.
 *
 * Três decisões que valem registro:
 *
 *   1. O FILTRO DE STATUS MUDA DE SENTIDO AQUI. Nas outras visões ele recorta
 *      itens pelo status ATUAL; aqui isso seria inútil (selecionar
 *      "Desenvolvimento" mostraria só quem está parado lá hoje, e não o tempo que
 *      os itens passaram lá). Então a base chega sem esse recorte (SKIP_STATUS) e
 *      a seleção escolhe QUAIS BARRAS aparecem.
 *
 *   2. O DENOMINADOR ESTÁ NO RÓTULO DA MEDIDA, porque muda o número. "Média por
 *      item concluído" divide por TODOS os itens da base (quem não passou pelo
 *      status entra com zero) e por isso as barras somam, APROXIMADAMENTE, o Lead
 *      Time médio — é uma decomposição. A aproximação tem causa conhecida: as
 *      barras vão de Criado até a ÚLTIMA transição de status, e o Lead Time vai
 *      de Criado até a Data de Fim Real; como o item segue transitando depois da
 *      entrega (homologação, PROD, ativação de valor), a soma tende a ficar um
 *      pouco maior. A legenda mostra os dois números lado a lado para a diferença
 *      não ficar escondida. "P85 de quem passou" divide só por quem visitou o
 *      status: responde "quando passa por aqui, quanto tempo fica" e NÃO soma.
 *
 *      Como os dois números convivem no mesmo gráfico, o TOOLTIP ESPELHA A
 *      BARRA: a primeira linha repete, com o mesmo rótulo do seletor, o valor
 *      exato que está desenhado. As leituras complementares vêm depois, sempre
 *      dizendo sobre quem foram calculadas. Sem isso a barra mostrava 9,0 e o
 *      tooltip abria com 18,2 (a média entre os que passaram), e não havia como
 *      saber qual era qual.
 *
 *   3. Só permanências ENCERRADAS. A visita ao status atual está aberta e ficaria
 *      crescendo sozinha entre um snapshot e outro.
 */
const STATUS_TIME_PHASE_ORDER = ['Pendente','Em andamento','Concluído','Cancelado'];
/* Mesma leitura de cor do badge do drawer (cinza = espera, azul = andamento,
   verde = concluído, rosa = cancelado), em tons cheios porque aqui é
   preenchimento de barra e não fundo de etiqueta. */
const STATUS_TIME_PHASE_COLOR = {
  'Pendente':'#A1A1AA', 'Em andamento':'#0057B8', 'Concluído':'#16A34A', 'Cancelado':'#BE123C',
};

/* Fase de fluxo de um STATUS. O drawer resolve a fase de um ITEM (que já vem
   calculada do backend em `FaseFluxo`); aqui a pergunta é sobre o status em si.
   Usa as listas que chegam em `meta` — nunca casamento por pedaço de nome, que é
   a decisão travada em test/drawer-status.spec.js. O default "Em andamento"
   repete o backend: status fora de todas as listas nunca fica sem fase. */
function faseDoStatus(status){
  if(piInList(status, window.__RULES_CANCELLED)) return 'Cancelado';
  if(piInList(status, window.__RULES_DONE)) return 'Concluído';
  if(piInList(status, window.__RULES_PENDING)) return 'Pendente';
  return 'Em andamento';
}

/* As medidas disponíveis, com o rótulo que aparece no seletor, no eixo e na
   primeira linha do tooltip — os três precisam dizer a MESMA coisa, porque é a
   troca silenciosa de denominador que confunde a leitura. */
const STATUS_TIME_MEASURES = {
  'media-todos': {
    rotulo: 'Média por item concluído',
    valor: (b)=>b.mediaTodos,
  },
  'p85-passou': {
    rotulo: 'P85 de quem passou',
    valor: (b)=>b.p85Passou,
  },
};

/* Medida escolhida no seletor do card. Vive fora do render porque trocar de
   medida não deve depender de um novo carregamento de dados. */
let statusTimeMetric = 'media-todos';

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeMedida(){
  const el = document.getElementById('statusTimeMetric');
  if(!el) return;
  el.addEventListener('change', ()=>{
    statusTimeMetric = el.value;
    renderTempoPorStatus(getFiltered(SKIP_STATUS));
  });
})();

/**
 * Junta as permanências de todos os itens da base num balde por status.
 *
 * Conta também quem está PARADO em cada status. São duas coisas diferentes, e
 * confundi-las foi o que tornou o tooltip ambíguo: um item pode não entrar na
 * média porque (a) nunca passou por aquele status, ou (b) está nele AGORA — e
 * nesse caso a permanência está aberta, sem duração, então fica de fora.
 *
 * O caso (b) não é raro: medido na base, `PRONTO PARA ATIVAÇÃO DE VALOR` tem 55
 * itens que passaram e 301 parados dentro dele. Sem separar os dois, a barra
 * baixa parecia um erro de conta.
 *
 * Um status onde NINGUÉM passou (só há gente parada) ganha balde sem dias, e o
 * `filter(valor>0)` do render o descarta — não vira barra fantasma.
 */
function agregarTempoPorStatus(base){
  const comHistorico = base.filter(d=>(d.TempoPorStatus||[]).length);
  const porStatus = new Map();
  const balde = (nome)=>{
    const acc = porStatus.get(nome) || {status:nome, dias:[], visitas:0, parados:0, issues:[]};
    porStatus.set(nome, acc);
    return acc;
  };
  comHistorico.forEach(d=>{
    const visitados = new Set();
    (d.TempoPorStatus||[]).forEach(p=>{
      const nome = p && p.status && String(p.status).trim();
      if(!nome || !(p.dias>0)) return;
      visitados.add(nome);
      const acc = balde(nome);
      acc.dias.push(p.dias);
      // `visitas` é omitido no payload quando vale 1 (ver IssueEnricher).
      acc.visitas += (p.visitas||1);
      acc.issues.push(d);
    });
    // Sem permanência encerrada no próprio status atual = a visita corrente
    // ainda está aberta. Como a base é só de concluídos, isto acontece nos
    // status finais do fluxo.
    const atual = d.Status && String(d.Status).trim();
    if(atual && !visitados.has(atual)) balde(atual).parados += 1;
  });
  return {comHistorico, porStatus};
}

/** "1 item" / "2 itens" — o tooltip mostra grupos que podem ter um só item. */
function statusTimePlural(n, singular, plural){
  return fmt0(n)+' '+(n===1 ? singular : plural);
}

function renderTempoPorStatus(base){
  if(!document.getElementById('chart-flow-status-time')) return;
  const caption = document.getElementById('status-time-caption');

  const medida = STATUS_TIME_MEASURES[statusTimeMetric] || STATUS_TIME_MEASURES['media-todos'];
  const concluidos = base.filter(d=>d.Concluido);
  const agregado = agregarTempoPorStatus(concluidos);
  const comHistorico = agregado.comHistorico;

  // Sem status selecionado, mostra todos os percorridos; com seleção, ela é a
  // lista de barras. Comparação normalizada, igual ao resto do painel.
  const selecionados = selections['Status'];
  const querStatus = (nome)=> selecionados.size===0
    || Array.from(selecionados).some(sel=>piNorm(sel)===piNorm(nome));

  const barras = Array.from(agregado.porStatus.values())
    .filter(x=>querStatus(x.status))
    .map(x=>{
      const fase = faseDoStatus(x.status);
      return {
        status:x.status, fase, issues:x.issues,
        n:x.dias.length,
        parados:x.parados,
        // Os três grupos somam a base: quem saiu, quem ainda está lá, quem
        // nunca passou. É o que permite conferir a conta no próprio tooltip.
        nunca: Math.max(0, comHistorico.length - x.dias.length - x.parados),
        visitasMedias: x.dias.length ? x.visitas/x.dias.length : 0,
        // Média com denominador = TODA a base (quem não passou entra com zero):
        // é a única que soma o Lead Time médio.
        mediaTodos: comHistorico.length ? sum(x.dias,v=>v)/comHistorico.length : 0,
        mediaPassou: mean(x.dias),
        p85Passou: percentile(x.dias,85),
      };
    })
    .map(b=>Object.assign({}, b, {valor: medida.valor(b)}))
    .filter(b=>b.valor>0)
    .sort((a,b)=> STATUS_TIME_PHASE_ORDER.indexOf(a.fase)-STATUS_TIME_PHASE_ORDER.indexOf(b.fase)
      || b.valor-a.valor);

  const semCronologia = comHistorico.filter(d=>d.StatusHistoricoOk===false).length;
  const semHistorico = concluidos.length - comHistorico.length;

  if(caption){
    const partes = [];
    partes.push('<b>Base:</b> '+fmt0(comHistorico.length)+' de '+fmt0(concluidos.length)
      +' itens concluídos do recorte têm histórico de status recuperável'
      +(semHistorico>0 ? ' ('+fmt0(semHistorico)+' sem changelog ficam fora)' : '')+'.');
    if(statusTimeMetric==='media-todos'){
      const somaBarras = sum(barras, b=>b.valor);
      const leadMedio = mean(comHistorico.filter(d=>d.LeadTimeDias!=null).map(d=>d.LeadTimeDias));
      partes.push('<b>Soma das barras:</b> '+fmt1(somaBarras)+' d'
        +' · <b>Lead Time médio dos mesmos itens:</b> '+fmt1(leadMedio)+' d'
        +(selecionados.size ? ' (a soma cobre só os status selecionados).' : '.'));
    } else {
      partes.push('Cada barra usa <b>apenas os itens que passaram pelo status</b>,'
        +' então as barras não somam o Lead Time.');
    }
    partes.push('A barra mostra <b>'+medida.rotulo.toLocaleLowerCase('pt-BR')+'</b>;'
      +' o tooltip repete esse número e mostra a outra leitura ao lado.');
    if(semCronologia>0){
      partes.push('⚠️ '+fmt0(semCronologia)+' itens têm cronologia <b>parcial</b>'
        +' (o changelog não fecha no status atual): o tempo deles entra pelo trecho conhecido.');
    }
    caption.innerHTML = partes.join(' ');
  }

  /* Altura proporcional ao número de barras: numa caixa fixa as barras
     horizontais viram fatias de poucos pixels e os rótulos colidem.
     O teto é generoso de propósito — medido na base, o recorte sem filtro de
     Tipo chega a 58 status distintos, e com 900px cada barra ficava com 15px.
     A 1200px o pior caso dá ~21px por barra, ainda legível, e o recorte padrão
     (26 status) nem encosta no teto. */
  const wrap = document.getElementById('status-time-wrap');
  if(wrap) wrap.style.height = Math.min(1200, Math.max(200, barras.length*30 + 56))+'px';

  upsertChart('chart-flow-status-time', {
    type:'bar',
    data:{labels:barras.map(b=>b.status), datasets:[{
      label:'Dias', data:barras.map(b=>b.valor),
      backgroundColor:barras.map(b=>STATUS_TIME_PHASE_COLOR[b.fase]||'#0057B8'),
    }]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      barLabels:true, barLabelFmt:'d1', layout:{padding:{right:44}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{
        title:(items)=>{ const b = items.length && barras[items[0].dataIndex];
          return b ? b.status+' · '+b.fase : ''; },
        label:(item)=>{
          const b = barras[item.dataIndex];
          if(!b) return '';
          // 1ª linha: EXATAMENTE o que a barra desenha, com o rótulo do seletor.
          const linhas = [medida.rotulo+': '+fmt1(b.valor)+' d'];
          // 2ª: a outra leitura, dizendo sobre quem foi calculada. É ela que
          // explica a diferença — mediaTodos = mediaPassou × n / base.
          linhas.push(statusTimeMetric==='media-todos'
            ? 'Entre os '+fmt0(b.n)+' que passaram: '+fmt1(b.mediaPassou)+' d de média'
            : 'Média por item concluído: '+fmt1(b.mediaTodos)+' d');
          // 3ª: a composição da base. Os grupos zerados somem, para não poluir
          // com "0 ainda estão nele" no caso comum.
          const grupos = [];
          if(!b.parados && !b.nunca){
            grupos.push('todos os '+statusTimePlural(b.n,'item','itens')+' já passaram por aqui');
          } else {
            grupos.push(statusTimePlural(b.n,'já saiu','já saíram')+' deste status');
            if(b.parados) grupos.push(statusTimePlural(b.parados,'ainda está nele','ainda estão nele'));
            if(b.nunca) grupos.push(statusTimePlural(b.nunca,'nunca passou','nunca passaram'));
          }
          linhas.push(grupos.join(' · '));
          linhas.push(b.visitasMedias.toFixed(2)+' visitas por item');
          // 4ª, só quando existe: explica POR QUE quem está no status não conta.
          // Sem repetir o número da linha acima — aqui o que falta é o motivo.
          if(b.parados){
            linhas.push('Quem ainda está no status tem permanência aberta e fica fora da média.');
          }
          return linhas;
        },
      }}},
      // O eixo nomeia a medida: sem isso o número da barra fica sem denominador
      // para quem não abriu o tooltip nem olhou o seletor.
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'},
          title:{display:true, text:medida.rotulo+' (dias)'}},
        y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx)=>{ const b=barras[idx]; if(!b) return null;
        return {title:'Tempo em "'+b.status+'" · '+fmt0(b.n)+' itens que passaram', issues:b.issues}; })}
  });
}

/* A COR DA MEDIDA nesta aba. Não é decoração: os dois histogramas do topo e o
   card de Value Stream já usavam rosa para Lead Time e âmbar para Cycle Time, e
   era uma convenção repetida à mão em quatro lugares. Agora que os cards de
   tendência e de squad TROCAM de medida, a cor precisa trocar junto — barra
   rosa mostrando Cycle Time anunciaria a régua errada para quem lê de longe.
   Os literais são os mesmos de antes; o que mudou é haver um lugar só. */
const FLOW_MEASURE_COLOR = { lead:'#CE0058', cycle:'#D98E3B' };

/* ---------------------------------------------------------------------------
   TENDÊNCIA MENSAL DO TEMPO (P85)

   BARRA POR MÊS + LINHA DE MÉDIA MÓVEL, com o valor escrito em cima da barra.
   Era uma área com curva suavizada, e o feedback veio de uma reunião executiva:
   estava difícil de ler. Três problemas concretos, e o formato novo responde aos
   três. (a) A curva com `tension` INVENTA movimento entre os meses — sobe e
   desce onde não há dado —, enquanto barra é uma medida por mês, discreta, que é
   o que o número é. (b) Sem rótulo, ler a altura contra a grade é trabalho, e em
   sala ninguém faz. (c) Mês a mês o P85 balança demais para responder "estamos
   melhorando?"; quem responde isso é a média móvel, e agora ela está desenhada
   em vez de ficar por conta do olho de quem vê. O formato é o mesmo já usado na
   evolução mensal de SP — barra com tendência sobreposta —, então não é padrão
   novo no painel.

   O card era fixo em Lead Time. Virou agnóstico à medida pelo mesmo motivo do
   card de Tempo por Story Point: "o tempo está piorando?" tem duas respostas
   legítimas, e só o Lead Time esconde o caso em que a execução ficou estável e
   o que cresceu foi a espera. As medidas são as MESMAS de SP_TIME_MEASURES —
   mesma régua, mesmos acessores —, reaproveitadas em vez de redeclaradas: uma
   segunda definição de tempo divergiria em silêncio no dia em que uma das duas
   mudasse, e o painel passaria a ter dois "Cycle Time".

   Abre em LEAD TIME, e não em Cycle Time como o card de Estimativas: é a medida
   que este card já mostrava, e trocar o padrão mudaria, sem ninguém ter pedido,
   a curva que o time lê hoje.

   O mês de um item é sempre o da CONCLUSÃO nas duas medidas — é quando a
   entrega aconteceu, e é o eixo que o card sempre teve. Posicionar o Cycle Time
   pelo mês de início jogaria o item num mês em que ele ainda não tinha número.

   Os meses saem dos itens que TÊM a medida escolhida, não da base inteira.
   Cycle Time depende de dois campos manuais e cobre bem menos itens que o Lead
   Time (medido na base: 4.663 contra 9.151), então um mês sem nenhum início
   real preenchido não vira ponto vazio no meio da linha: ele não existe naquela
   medida. Em compensação a curva pode ficar mais curta ao trocar de régua, e é
   por isso que a legenda declara a cobertura — sem ela, a linha mais curta
   pareceria queda de volume de entrega, que é outra coisa. */
const FLOW_TREND_DEFAULT = 'lead';
/* Janela da média móvel, em meses. Três é o mesmo da evolução mensal de SP —
   o painel não deve ter duas ideias diferentes de "tendência". */
const FLOW_TREND_JANELA = 3;
let flowTrendMetric = FLOW_TREND_DEFAULT;

/* Base do último render. Vive fora dele porque trocar de medida não deve
   refazer o recorte da aba — mesma decisão do seletor de Tempo por Story Point. */
let __flowTrendBase = [];

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeTendencia(){
  const el = document.getElementById('flowTrendMetric');
  if(!el) return;
  el.addEventListener('change', ()=>{
    flowTrendMetric = el.value;
    renderTendenciaMensalTempo(__flowTrendBase);
  });
})();

function renderTendenciaMensalTempo(base){
  if(!document.getElementById('chart-flow-lead-trend')) return;
  __flowTrendBase = base || [];
  const medida = SP_TIME_MEASURES[flowTrendMetric] || SP_TIME_MEASURES[FLOW_TREND_DEFAULT];

  const concl = __flowTrendBase.filter(d=>d.Concluido);
  // Item sem a data que a medida exige fica de FORA, e não entra como zero dia:
  // zero puxaria o P85 do mês para baixo como se a entrega tivesse sido
  // instantânea, quando o que houve foi ausência de registro.
  const medidos = concl.filter(d=>medida.valor(d)!=null);
  const months = sortedMonthKeys(medidos, 'AnoMesConclusao');
  const doMes = (m)=> medidos.filter(d=>d.AnoMesConclusao===m);
  const serie = months.map(m=> percentile(doMes(m).map(d=>medida.valor(d)), 85));

  /* Média móvel dos P85, com janela TRASEIRA e PARCIAL no começo — o primeiro
     mês é ele mesmo, o segundo é a média de dois. É a mesma conta do gráfico de
     SP mensal, e a escolha importa: uma janela que só começa no terceiro mês
     deixaria a linha nascer no meio do gráfico, e num recorte de 3 ou 4 meses
     (o padrão da tela) sobraria quase nada dela. */
  const tendencia = serie.map((_,i)=> mean(serie.slice(Math.max(0,i-(FLOW_TREND_JANELA-1)), i+1)));

  upsertChart('chart-flow-lead-trend', {
    type:'bar',
    data:{labels:months.map(monthLabel), datasets:[
      {type:'bar', label:medida.rotulo+' P85 (dias)', data:serie, backgroundColor:FLOW_MEASURE_COLOR[flowTrendMetric], borderRadius:4, order:2},
      {type:'line', label:`Tendência (méd. móvel ${FLOW_TREND_JANELA}m)`, data:tendencia, borderColor:'#333333', backgroundColor:'#333333', tension:.3, pointRadius:2, order:1},
    ]},
    options:{responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1',
      layout:{padding:{top:22}}, plugins:{legend:{display:true},
        tooltip:{callbacks:{afterLabel:(ctx)=>(ctx.datasetIndex===0
          // Quantos itens sustentam a barra. Mês com poucos itens balança muito,
          // e o P85 sozinho não deixa isso ver — em três valores ele é
          // praticamente "o pior dos três" com nome de estatística.
          ? `${fmt0(doMes(months[ctx.dataIndex]).length)} itens medidos`
          : `média dos últimos ${FLOW_TREND_JANELA} meses`)}}},
      scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, x:{grid:{display:false}}},
      // O drill abre exatamente os itens que formaram o número — os medidos do
      // mês, não todos os concluídos dele. Com Cycle Time os dois conjuntos são
      // bem diferentes, e a lista precisa fechar com a barra. Clicar na LINHA
      // abre a janela inteira da média móvel: o ponto dela não é aquele mês, e
      // abrir só o mês entregaria uma lista que não explica o número.
      onClick: drillClick((idx, ds)=>{
        if(ds === 1){
          const janela = months.slice(Math.max(0, idx-(FLOW_TREND_JANELA-1)), idx+1);
          return {title:`${medida.rotulo} · tendência até ${monthLabel(months[idx])} (${janela.length} ${janela.length===1?'mês':'meses'})`,
            issues: medidos.filter(d=>janela.includes(d.AnoMesConclusao))};
        }
        const m=months[idx];
        return {title:`${medida.rotulo} · concluídos em ${monthLabel(m)}`, issues: doMes(m)};
      })}
  });

  const cap = document.getElementById('flow-trend-caption');
  if(!cap) return;
  if(!concl.length){ cap.textContent = 'Sem itens concluídos no recorte.'; return; }
  const cobertura = medidos.length/concl.length*100;
  // Menor mês do recorte: é ele que diz o quanto pesar a barra mais alta.
  const menor = months.reduce((a,m)=>Math.min(a, doMes(m).length), Infinity);
  cap.innerHTML = `Cada barra é o P85 do <b>${medida.rotulo}</b> (${medida.regra}) dos itens
    concluídos naquele mês, em <b>dias corridos</b>; a linha é a <b>média móvel de
    ${FLOW_TREND_JANELA} meses</b>, que é onde se lê a tendência — mês a mês o número balança
    demais para isso. A medida existe em <b>${fmt0(medidos.length)}</b> dos ${fmt0(concl.length)}
    itens concluídos do recorte (${fmt0(cobertura)}%), distribuídos em ${fmt0(months.length)}
    ${months.length===1?'mês':'meses'} — trocar de medida pode encurtar a série por cobertura, não
    por queda de entrega. O mês com menos amostra tem <b>${fmt0(menor)}</b>
    ${menor===1?'item medido':'itens medidos'}: passe o mouse para ver a contagem de cada um, e
    clique para abrir os itens.`;
}

/* ---------------------------------------------------------------------------
   TEMPO P85 POR SQUAD

   Mesma decisão do card ao lado, pelo mesmo motivo: comparar squads só pelo
   Lead Time mistura duas causas diferentes de lentidão — quem executa devagar e
   quem espera muito na fila —, e a diferença entre as duas curvas é justamente
   o que aponta onde agir. As medidas são as MESMAS de SP_TIME_MEASURES.

   O seletor é INDEPENDENTE do card ao lado, de propósito: ver a tendência
   mensal em Lead Time e o ranking de squads em Cycle Time é uma leitura
   legítima ("o tempo total piorou; a execução de quem?"). Amarrar os dois num
   seletor só tiraria isso sem ganhar nada.

   Duas coisas mudam além do número, e as duas são visíveis:

   (1) A COR DA BARRA SEGUE A MEDIDA. Nesta aba rosa é Lead Time e âmbar é Cycle
       Time — é assim nos dois histogramas do topo e no card de Value Stream.
       Barra rosa mostrando Cycle Time anunciaria a régua errada para quem lê de
       longe, que é como um ranking costuma ser lido.

   (2) O "TOP 12 POR VOLUME" CONTA ITENS MEDIDOS, então a LISTA DE SQUADS pode
       mudar ao trocar de régua: uma squad que preenche pouco a Data de Início
       Real cai do ranking no Cycle Time sem ter entregado menos. É por isso que
       a legenda declara a cobertura — sem o aviso, uma squad some do gráfico e
       parece que ela parou de entregar. */
const FLOW_SQUAD_DEFAULT = 'lead';
let flowSquadMetric = FLOW_SQUAD_DEFAULT;
let __flowSquadBase = [];

/* Quantas squads o ranking mostra. Vive nomeado porque o número aparece também
   na legenda, e os dois têm de dizer a mesma coisa. */
const FLOW_SQUAD_TOP = 12;

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeSquad(){
  const el = document.getElementById('flowSquadMetric');
  if(!el) return;
  el.addEventListener('change', ()=>{
    flowSquadMetric = el.value;
    renderTempoP85PorSquad(__flowSquadBase);
  });
})();

function renderTempoP85PorSquad(base){
  if(!document.getElementById('chart-flow-lead-squad')) return;
  __flowSquadBase = base || [];
  const medida = SP_TIME_MEASURES[flowSquadMetric] || SP_TIME_MEASURES[FLOW_SQUAD_DEFAULT];

  const concl = __flowSquadBase.filter(d=>d.Concluido);
  // Item sem a data que a medida exige fica de FORA, não entra como zero dia —
  // mesma regra do card ao lado, e aqui ela também decide o RANKING.
  const medidos = concl.filter(d=>medida.valor(d)!=null);
  const porSquad = Array.from(groupBy(medidos, d=>d.Squad),
    ([k,v])=>[k, percentile(v.map(d=>medida.valor(d)),85), v.length]);
  // Corta pelo VOLUME (quem tem amostra) e só depois ordena pelo TEMPO: inverter
  // isso deixaria o top 12 ser das squads mais lentas, não das mais medidas.
  const ranking = porSquad.slice().sort((a,b)=>b[2]-a[2]).slice(0,FLOW_SQUAD_TOP)
    .sort((a,b)=>b[1]-a[1]);

  upsertChart('chart-flow-lead-squad', {
    type:'bar',
    data:{labels:ranking.map(x=>x[0]), datasets:[{label:medida.rotulo+' P85 (dias)', data:ranking.map(x=>x[1].toFixed(1)), backgroundColor:FLOW_MEASURE_COLOR[flowSquadMetric], borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1', layout:{padding:{right:36}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      // O drill abre os MEDIDOS da squad — os itens que formaram a barra, e não
      // todos os concluídos dela. Com Cycle Time os dois conjuntos divergem.
      onClick: drillClick((idx)=>{ const k=ranking[idx][0];
        return {title:`${medida.rotulo} · Squad: ${k}`, issues: medidos.filter(d=>d.Squad===k)}; })}
  });

  const cap = document.getElementById('flow-squad-caption');
  if(!cap) return;
  if(!concl.length){ cap.textContent = 'Sem itens concluídos no recorte.'; return; }
  /* O recorte do ranking é declarado AQUI porque saiu do título — e as duas
     redações não são intercambiáveis: dizer "as 12 squads com mais itens
     medidos" quando só existem 5 no recorte anunciaria um corte que não houve. */
  const fora = porSquad.length - ranking.length;
  let recorte;
  if(fora > 0){
    recorte = `O ranking mostra as <b>${FLOW_SQUAD_TOP} squads com mais itens medidos</b>, de ${fmt0(porSquad.length)} com itens no recorte`;
  } else if(ranking.length === 1){
    recorte = 'O ranking mostra <b>a única squad</b> com itens medidos no recorte';
  } else {
    recorte = `O ranking mostra <b>todas as ${fmt0(ranking.length)} squads</b> com itens medidos no recorte (o corte é nas ${FLOW_SQUAD_TOP} de maior volume)`;
  }
  cap.innerHTML = `P85 do <b>${medida.rotulo}</b> (${medida.regra}) por squad, em <b>dias corridos</b>.
    A medida existe em <b>${fmt0(medidos.length)}</b> dos ${fmt0(concl.length)} itens concluídos do
    recorte (${fmt0(medidos.length/concl.length*100)}%). ${recorte} —
    trocar de medida pode mudar <b>quais squads aparecem</b>, porque quem preenche pouco a Data de
    Início Real sai do ranking no Cycle Time sem ter entregado menos. Clique numa barra para ver os itens.`;
}

function renderFlow(f, semRecorteDeStatus){
  const concl = f.filter(d=>d.Concluido);
  const leadItems = concl.filter(d=>d.LeadTimeDias!=null);
  const cycleItems = concl.filter(d=>d.CycleTimeDias!=null);
  const leadVals = leadItems.map(d=>d.LeadTimeDias);
  const cycleVals = cycleItems.map(d=>d.CycleTimeDias);
  const lead = statBlock(leadVals), cycle = statBlock(cycleVals);

  document.getElementById('flow-coverage-callout').querySelector('div').innerHTML =
    `<b>Cobertura de dados no recorte atual:</b> Lead Time calculável para ${lead.n} de ${concl.length} itens concluídos
    (${concl.length? (lead.n/concl.length*100).toFixed(0):0}%). Cycle Time calculável para ${cycle.n} de ${concl.length}
    (${concl.length? (cycle.n/concl.length*100).toFixed(0):0}%) — cobertura menor pois depende de "Data de início real" e "Data de fim real" preenchidas.`;

  Object.assign(__cardDrills, {
    flow_lead: {title:'Itens com Lead Time (concluídos)', issues: leadItems},
    flow_cycle: {title:'Itens com Cycle Time', issues: cycleItems},
  });
  document.getElementById('lead-kpis').innerHTML = [
    kpiCard('Lead Time (P85)', fmt1(lead.p85), 'dias', 'amber', null, null, 'flow_lead'),
    kpiCard('Itens considerados', fmt0(lead.n), '', '', null, null, 'flow_lead'),
  ].join('');
  document.getElementById('cycle-kpis').innerHTML = [
    kpiCard('Cycle Time (P85)', fmt1(cycle.p85), 'dias', 'amber', null, null, 'flow_cycle'),
    kpiCard('Itens considerados', fmt0(cycle.n), '', '', null, null, 'flow_cycle'),
  ].join('');

  const leadHist = histogramBins(leadVals, 12);
  upsertChart('chart-flow-lead-hist', {
    type:'bar',
    data:{labels:leadHist.labels, datasets:[{data:leadHist.counts, backgroundColor:FLOW_MEASURE_COLOR.lead, borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, x:{grid:{display:false}, ticks:{font:{size:9}}, title:{display:true, text:'Faixas de dias'}}},
      onClick: drillClick((idx)=>{ const bs=leadHist.binSize, lo=idx*bs, hi=(idx+1)*bs, last=idx===leadHist.counts.length-1;
        return {title:`Lead Time ${leadHist.labels[idx]}`, issues: leadItems.filter(d=> d.LeadTimeDias>=lo && (last || d.LeadTimeDias<hi))}; })}
  });
  const cycleHist = histogramBins(cycleVals, 12);
  upsertChart('chart-flow-cycle-hist', {
    type:'bar',
    data:{labels:cycleHist.labels, datasets:[{data:cycleHist.counts, backgroundColor:FLOW_MEASURE_COLOR.cycle, borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, x:{grid:{display:false}, ticks:{font:{size:9}}, title:{display:true, text:'Faixas de dias'}}},
      onClick: drillClick((idx)=>{ const bs=cycleHist.binSize, lo=idx*bs, hi=(idx+1)*bs, last=idx===cycleHist.counts.length-1;
        return {title:`Cycle Time ${cycleHist.labels[idx]}`, issues: cycleItems.filter(d=> d.CycleTimeDias>=lo && (last || d.CycleTimeDias<hi))}; })}
  });

  renderTendenciaMensalTempo(f);

  renderTempoP85PorSquad(f);

  const vsCycle = Array.from(groupBy(concl.filter(d=>d.CycleTimeDias!=null), d=>d.VS), ([k,v])=>[k, percentile(v.map(d=>d.CycleTimeDias),85), v.length])
    .sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-flow-cycle-vs', {
    type:'bar',
    data:{labels:vsCycle.map(x=>x[0]), datasets:[{label:'Cycle Time P85 (dias)', data:vsCycle.map(x=>x[1].toFixed(1)), backgroundColor:FLOW_MEASURE_COLOR.cycle, borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1', layout:{padding:{top:18}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx)=>{ const k=vsCycle[idx][0];
        return {title:`Cycle Time · VS: ${k}`, issues: cycleItems.filter(d=>d.VS===k)}; })}
  });

  // Recebe a base SEM o recorte de Status: ali o filtro escolhe barras, não itens.
  renderTempoPorStatus(semRecorteDeStatus || f);
}

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
function renderWip(f, atual, baseSemTipo){
  // Entregas seguem o período (f); WIP e Aging são foto de hoje e usam `atual`
  // — item em aberto não tem data de conclusão e sumiria do recorte por período.
  const concl = f.filter(d=>d.Concluido);
  const wipItems = atual.filter(d=>d.WIP);

  /* Base dos KPIs: sem filtro de Tipo, com a janela aplicada sobre a data
     EFETIVA de entrega (ver dataEntregaEfetiva — é o que resgata o épico). */
  const kpiBase = (baseSemTipo || f).filter(dentroDoPeriodoDeEntrega);
  const entregues = kpiBase.filter(d=>d.Concluido);
  const doGrupo = (arr, g) => arr.filter(d=>d['Tipo Agrupado']===g);
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
    .map(g=>[g, doGrupo(historiasEntregues, g).length])
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
  document.getElementById('wip-kpis').innerHTML = [
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

  function entregasPor(key){
    const arr = Array.from(groupBy(concl, d=>d[key]), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]);
    return arr;
  }
  const eqSquad = entregasPor('Squad').slice(0,14).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-entregas-squad', {
    type:'bar',
    data:{labels:eqSquad.map(x=>x[0]), datasets:[{data:eqSquad.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=eqSquad[idx][0]; return {title:`Concluídos · Squad: ${k}`, issues: concl.filter(d=>d.Squad===k)}; })}
  });
  const eqVs = entregasPor('VS').sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-entregas-vs', {
    type:'bar',
    data:{labels:eqVs.map(x=>x[0]), datasets:[{data:eqVs.map(x=>x[1]), backgroundColor:'#D98E3B', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx)=>{ const k=eqVs[idx][0]; return {title:`Concluídos · VS: ${k}`, issues: concl.filter(d=>d.VS===k)}; })}
  });
  const eqProg = entregasPor('Programa');
  upsertChart('chart-wip-entregas-programa', {
    type:'doughnut',
    data:{labels:eqProg.map(x=>x[0]), datasets:[{data:eqProg.map(x=>x[1]), backgroundColor:['#CE0058','#333333'], borderWidth:2, borderColor:'#fff'}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{font:{size:10}, usePointStyle:true, boxWidth:8, generateLabels:donutLegendPct}}, tooltip:tooltipPct}, cutout:'55%',
      onClick: drillClick((idx)=>{ const k=eqProg[idx][0]; return {title:`Concluídos · Programa: ${k}`, issues: concl.filter(d=>d.Programa===k)}; })}
  });

  const wipStatus = Array.from(groupBy(wipItems.filter(d=>String(d.Status).toLowerCase()!=='backlog'), d=>d.Status), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  upsertChart('chart-wip-status', {
    type:'bar',
    data:{labels:wipStatus.map(x=>x[0]), datasets:[{data:wipStatus.map(x=>x[1]), backgroundColor:'#8AA0B0', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=wipStatus[idx][0]; return {title:`WIP · Status: ${k}`, issues: wipItems.filter(d=>d.Status===k)}; })}
  });
  const wipSquad = Array.from(groupBy(wipItems, d=>d.Squad), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  upsertChart('chart-wip-squad', {
    type:'bar',
    data:{labels:wipSquad.map(x=>x[0]), datasets:[{data:wipSquad.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=wipSquad[idx][0]; return {title:`WIP · Squad: ${k}`, issues: wipItems.filter(d=>d.Squad===k)}; })}
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
  const agingVals = agingWip.map(d=>d.AgingDias);
  const agingHist = histogramBins(agingVals, 12);
  upsertChart('chart-wip-aging-hist', {
    type:'bar',
    data:{labels:agingHist.labels, datasets:[{data:agingHist.counts, backgroundColor:'#D98E3B', borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}, ticks:{font:{size:9}}}},
      onClick: drillClick((idx)=>{ const bs=agingHist.binSize, lo=idx*bs, hi=(idx+1)*bs, last=idx===agingHist.counts.length-1;
        return {title:`WIP · Aging ${agingHist.labels[idx]}`, issues: agingWip.filter(d=> d.AgingDias>=lo && (last || d.AgingDias<hi))}; })}
  });

  const agingSquad = Array.from(groupBy(wipItems.filter(d=>d.AgingDias!=null && d.AgingDias>=0), d=>d.Squad), ([k,v])=>[k, mean(v.map(d=>d.AgingDias)), v.length])
    .filter(x=>x[2]>=2).sort((a,b)=>b[1]-a[1]).slice(0,10).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-wip-aging-squad', {
    type:'bar',
    data:{labels:agingSquad.map(x=>x[0]), datasets:[{data:agingSquad.map(x=>x[1].toFixed(1)), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx)=>{ const k=agingSquad[idx][0]; return {title:`WIP em aberto · Squad: ${k}`, issues: agingWip.filter(d=>d.Squad===k)}; })}
  });

  // Cancelados são estado atual: o cancelamento não gera data de conclusão.
  renderCancelados(atual);
}

/* ===================== Bloco: Itens cancelados ===================== */
/* Recebe o recorte de estado atual (sem filtro de data): cancelamento não gera
   data de conclusão, então numerador e denominador vêm da mesma base. */
function renderCancelados(atual){
  const canc = atual.filter(d=>d.Cancelado);
  const totalItens = atual.length || 1;
  const pct = (canc.length/totalItens*100);

  Object.assign(__cardDrills, {
    cancel_total: {title:'Itens cancelados do recorte', issues: canc},
  });
  document.getElementById('cancel-kpis').innerHTML = [
    kpiCard('Cancelados', fmt0(canc.length), 'itens', 'coral',
      {cls:'flat', text:`${pct.toFixed(1)}% do recorte`}, null, 'cancel_total'),
  ].join('');

  // Por mês (data de criação)
  const months = sortedMonthKeys(canc, 'AnoMesCriacao');
  const monthCounts = months.map(m=> canc.filter(d=>d.AnoMesCriacao===m).length);
  months.forEach((m,i)=>{ __cardDrills['cancel_m_'+i] = {title:`Cancelados criados em ${monthLabel(m)}`, issues: canc.filter(d=>d.AnoMesCriacao===m)}; });
  upsertChart('chart-cancel-month', {
    type:'bar',
    data:{labels:months.map(monthLabel), datasets:[{data:monthCounts, backgroundColor:'#D64545', borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx)=> __cardDrills['cancel_m_'+idx])}
  });

  // Por squad
  const bySquad = Array.from(groupBy(canc, d=>d.Squad), ([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-cancel-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=bySquad[idx][0]; return {title:`Cancelados · Squad: ${k}`, issues: canc.filter(d=>d.Squad===k)}; })}
  });

  // Por tipo desagrupado (regra dos 5: donut se <=5, senão barra)
  const byTipo = Array.from(groupBy(canc, d=>d['Tipo de item']), ([k,v])=>[k||'(sem tipo)',v.length]).sort((a,b)=>b[1]-a[1]);
  if(byTipo.length<=5){
    upsertChart('chart-cancel-tipo', {
      type:'doughnut',
      data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:byTipo.map((x,i)=>COLORS[i%COLORS.length]), borderWidth:2, borderColor:'#fff'}]},
      options:Object.assign(donutPctOptions({cutout:'55%'}), {
        onClick: drillClick((idx)=>{ const k=byTipo[idx][0]; return {title:`Cancelados · Tipo: ${k}`, issues: canc.filter(d=>(d['Tipo de item']||'(sem tipo)')===k)}; })
      })
    });
  } else {
    upsertChart('chart-cancel-tipo', {
      type:'bar',
      data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}}, plugins:{legend:{display:false}, tooltip:tooltipPct}, scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
        onClick: drillClick((idx)=>{ const k=byTipo[idx][0]; return {title:`Cancelados · Tipo: ${k}`, issues: canc.filter(d=>(d['Tipo de item']||'(sem tipo)')===k)}; })}
    });
  }
}
function heatColor(v, max){
  if(max<=0 || v<=0) return '#F5F5F5';
  const t = Math.min(1, v/max);
  // interpola do rosa claro (#FBE0EC) ao rosa Afya (#CE0058)
  const r1=251,g1=224,b1=236, r2=206,g2=0,b2=88;
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}
function renderRank(f){
  const concl = f.filter(d=>d.Concluido);

  const squadRank = Array.from(groupBy(concl, d=>d.Squad), ([k,v])=>[k,v.length]).sort((a,b)=>a[1]-b[1]);
  upsertChart('chart-rank-squad', {
    type:'bar',
    data:{labels:squadRank.map(x=>x[0]), datasets:[{data:squadRank.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=squadRank[idx][0]; return {title:`Concluídos · Squad: ${k}`, issues: concl.filter(d=>d.Squad===k)}; })}
  });
  const vsRank = Array.from(groupBy(concl, d=>d.VS), ([k,v])=>[k,v.length]).sort((a,b)=>a[1]-b[1]);
  upsertChart('chart-rank-vs', {
    type:'bar',
    data:{labels:vsRank.map(x=>x[0]), datasets:[{data:vsRank.map(x=>x[1]), backgroundColor:'#D98E3B', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx)=>{ const k=vsRank[idx][0]; return {title:`Concluídos · VS: ${k}`, issues: concl.filter(d=>d.VS===k)}; })}
  });

  // Heatmap Squad x Mês — ordenado por quem entrega MAIS (item 14)
  const months = sortedMonthKeys(concl, 'AnoMesConclusao');
  const totalBySquad = Array.from(groupBy(concl, d=>d.Squad), ([k,v])=>[k,v.length]);
  const squads = totalBySquad.sort((a,b)=>b[1]-a[1]).map(x=>x[0]); // desc: mais entregas no topo
  const matrix = squads.map(sq=> months.map(m=> concl.filter(d=>d.Squad===sq && d.AnoMesConclusao===m).length));
  const maxVal = Math.max(1, ...matrix.flat());

  // registra cada célula (squad+mês) como drill
  squads.forEach((sq,i)=> months.forEach((m,j)=>{
    __cardDrills[`heat_${i}_${j}`] = {title:`Concluídos · ${sq} · ${monthLabel(m)}`, issues: concl.filter(d=>d.Squad===sq && d.AnoMesConclusao===m)};
  }));

  let html = '<table class="heat-table"><thead><tr><th>Squad</th>' + months.map(m=>`<th>${monthLabel(m)}</th>`).join('') + '</tr></thead><tbody>';
  squads.forEach((sq,i)=>{
    html += `<tr><td data-help="Squad: ${escapeHtml(String(sq))}">${sq}</td>` + matrix[i].map((v,j)=>`<td><div class="heat-cell" ${v?`data-drill="heat_${i}_${j}"`:''} style="background:${heatColor(v,maxVal)};color:${v/maxVal>0.55?'#fff':'#333333'};">${v||''}</div></td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('heatmap-container').innerHTML = months.length && squads.length ? html : '<div class="cap">Sem dados suficientes para montar o heatmap no recorte atual.</div>';

  // Tabela consolidada (ordenada por throughput desc) — linhas clicáveis
  const allSquads = Array.from(new Set(f.map(d=>d.Squad))).sort();
  const rows = allSquads.map(sq=>{
    const items = f.filter(d=>d.Squad===sq);
    const conclItems = items.filter(d=>d.Concluido);
    const vs = items[0] ? items[0].VS : '';
    const spConcl = sum(conclItems, d=>d['Story Points']);
    const wipN = items.filter(d=>d.WIP).length;
    const leadArr = conclItems.filter(d=>d.LeadTimeDias!=null).map(d=>d.LeadTimeDias);
    const ativosN = items.filter(d=>!d.Cancelado).length;
    const pct = ativosN? (conclItems.length/ativosN*100):0;
    return {sq, vs, throughput:conclItems.length, spConcl, wipN, leadMean:mean(leadArr), pct};
  }).sort((a,b)=>b.throughput-a.throughput);

  rows.forEach(r=>{ __cardDrills['ranksq_'+r.sq] = {title:`Squad: ${r.sq} — todos os itens`, issues: f.filter(d=>d.Squad===r.sq)}; });
  document.querySelector('#rank-table tbody').innerHTML = rows.map(r=>`
    <tr data-drill="ranksq_${r.sq}" style="cursor:pointer;" data-help="Clique para abrir as issues desta squad."><td>${r.sq}</td><td style="font-size:11.5px;color:var(--slate-soft);">${r.vs}</td>
    <td><b>${r.throughput}</b></td><td>${fmt0(r.spConcl)}</td><td>${r.wipN}</td>
    <td>${fmt1(r.leadMean)}</td>
    <td><span class="badge ${r.pct>=70?'ok':r.pct>=40?'warn':'risk'}">${r.pct.toFixed(0)}%</span></td></tr>`).join('');
}

/* ===================== TAB: BLOQUEIOS ===================== */
function renderBlock(f, atual){
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
  const dur = d => (d.LeadTimeDias!=null ? d.LeadTimeDias : 0);
  // Tempo em aberto de um bloqueio — regra PRÓPRIA, não é o Aging.
  // Um Sub-block nasce bloqueado no instante em que é criado e precisa ser tratado
  // de imediato, então a contagem parte da Criação. O Aging exige início real porque
  // lá o planejamento cria itens em lote no começo do quarter sem que sejam puxados —
  // premissa que não vale para bloqueio.
  const abertoHaDias = d => diasCorridosAteHoje(d.Criado);
  // Média pela MESMA régua das somas acima (criação -> conclusão); medir a média
  // por Cycle Time e as somas por Lead Time faria a aba se contradizer.
  const tempoMedio = (()=>{ const v=resolvidos.filter(d=>d.LeadTimeDias!=null).map(d=>d.LeadTimeDias); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; })();
  const paisImpactados = new Set(blocks.map(d=>d.parentKey).filter(Boolean)).size;

  Object.assign(__cardDrills, {
    block_abertos: {title:'Bloqueios em aberto', issues: abertos},
    block_resolvidos: {title:'Bloqueios resolvidos', issues: resolvidos},
    block_cancelados: {title:'Bloqueios cancelados', issues: cancelados},
    block_todos: {title:'Todos os bloqueios (sub-blocks)', issues: blocks},
  });
  document.getElementById('block-kpis').innerHTML = [
    kpiCard('Bloqueios abertos', fmt0(abertos.length), 'itens', 'coral', {cls:'flat', text:'posição atual'}, null, 'block_abertos'),
    kpiCard('Bloqueios resolvidos', fmt0(resolvidos.length), 'itens', '', null, null, 'block_resolvidos'),
    kpiCard('Bloqueios cancelados', fmt0(cancelados.length), 'itens', '',
      {cls:'flat', text:'não entram nos resolvidos'}, null, 'block_cancelados'),
    kpiCard('Tempo médio bloqueado', tempoMedio==null?'—':fmt1(tempoMedio), 'dias', 'amber', {cls:'flat', text:'dos resolvidos'}),
    kpiCard('Itens impactados', fmt0(paisImpactados), 'itens', '', {cls:'flat', text:'com ≥1 bloqueio'}, null, 'block_todos'),
  ].join('');

  // Tempo total bloqueado por Squad (resolvidos) — soma de dias; contagem no tooltip
  const bySquadMap = groupBy(resolvidos, d=>d.Squad);
  const bySquad = Array.from(bySquadMap, ([k,v])=>[k, v.reduce((a,d)=>a+dur(d),0), v.length]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-block-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>+x[1].toFixed(1)), _counts:bySquad.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1', layout:{padding:{right:40}}, plugins:{legend:{display:false},
      tooltip:{callbacks:{label:(ctx)=>` ${fmt1(ctx.parsed.x)} dias · ${ctx.dataset._counts[ctx.dataIndex]} bloqueio(s)`}}},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>{ const k=bySquad[idx][0]; return {title:`Bloqueios resolvidos · Squad: ${k}`, issues: resolvidos.filter(d=>d.Squad===k)}; })}
  });

  // Por Motivo de Bloqueio (resolvidos + abertos, todos os que têm motivo)
  const comMotivo = blocks.filter(d=>d.MotivoBloqueio);
  const byMotivoMap = groupBy(comMotivo, d=>d.MotivoBloqueio);
  const byMotivo = Array.from(byMotivoMap, ([k,v])=>[k, v.length]).sort((a,b)=>b[1]-a[1]);
  if(byMotivo.length){
    upsertChart('chart-block-motivo', {
      type:'bar',
      data:{labels:byMotivo.map(x=>x[0]), datasets:[{data:byMotivo.map(x=>x[1]), backgroundColor:'#0057B8', borderRadius:4}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barLabels:true, layout:{padding:{right:36}}, plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=>` ${fmt0(ctx.parsed.x)} item(ns)`}}},
        scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
        onClick: drillClick((idx)=>{ const k=byMotivo[idx][0]; return {title:`Bloqueios · Motivo: ${k}`, issues: comMotivo.filter(d=>d.MotivoBloqueio===k)}; })}
    });
  } else {
    upsertChart('chart-block-motivo', {type:'bar', data:{labels:['(sem motivo preenchido)'], datasets:[{data:[0], backgroundColor:'#C4C4C4'}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{grid:{display:false}}}}});
  }

  // Tabela: bloqueios em aberto (mais tempo em aberto primeiro, contado da Criação)
  const abertosOrd = abertos.map(d=>({d, dias: abertoHaDias(d)}))
    .sort((a,b)=>(b.dias!=null?b.dias:-1)-(a.dias!=null?a.dias:-1));
  document.querySelector('#block-open-table tbody').innerHTML = abertosOrd.length ? abertosOrd.map(({d, dias})=>`
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
  const porPai = new Map();
  blocks.forEach(d=>{
    const key = d.parentKey || d.chave;
    if(!porPai.has(key)) porPai.set(key, {key, squad:d.Squad, soma:0, n:0, nMedidos:0});
    const o = porPai.get(key); o.n += 1;
    if(d.LeadTimeDias!=null){ o.soma += d.LeadTimeDias; o.nMedidos += 1; }
  });
  porPai.forEach(o=>{ o.media = o.nMedidos ? o.soma/o.nMedidos : null; });
  const paisArr = Array.from(porPai.values())
    .sort((a,b)=>(b.media==null?-1:b.media)-(a.media==null?-1:a.media)).slice(0,20);
  paisArr.forEach(p=>{ __cardDrills['blockpai_'+p.key] = {title:`Bloqueios do item ${p.key}`, issues: blocks.filter(d=>(d.parentKey||d.chave)===p.key)}; });
  document.querySelector('#block-parent-table tbody').innerHTML = paisArr.length ? paisArr.map(p=>`
    <tr data-drill="blockpai_${p.key}" style="cursor:pointer;" data-help="Clique para abrir os bloqueios vinculados a este item.">
      <td><a class="jira" href="${JIRA_BROWSE}${p.key}" target="_blank" rel="noopener">${p.key}</a></td>
      <td style="font-size:11.5px;">${p.squad||'—'}</td>
      <td>${p.n}</td>
      <td><b>${p.media==null?'—':fmt1(p.media)}</b></td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhum bloqueio no recorte atual.</td></tr>';
}

/* ===================== TAB: SPRINT (itens 10/11) ===================== */
const SPRINT_TAB_FILTER_KEYS = ['Squad','Tipo de item'];

function matchesSprintTabFilters(d, skip){
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
function sprintNamesFromData(){
  if(selections['Squad'].size===0) return [];
  const set = new Set();
  DATA.filter(d=>!d.Cancelado && matchesSprintTabFilters(d, SKIP_TIPO))
    .forEach(d=> (d.Sprints||[]).forEach(s=> set.add(s)));
  return Array.from(set).sort((a,b)=> String(b).localeCompare(String(a),'pt',{numeric:true})); // mais recente primeiro
}
function sprintDates(name){
  const c = (window.__SPRINTS||[]).find(s=>s.name===name);
  return c ? {start: c.startDate? new Date(c.startDate): null, end: c.endDate? new Date(c.endDate): null} : {start:null, end:null};
}

/* ---------- Base do velocity ----------
   O catálogo de sprints vem do campo Sprint do Jira e traz name/state/datas.
   Ordem cronológica por startDate: o nome NÃO serve para ordenar (a base tem
   itens com [PI3_4, PI3_2], fora de ordem, e cada squad nomeia à sua maneira). */
function sprintCatalogoOrdenado(){
  return (window.__SPRINTS||[])
    .filter(s=>s && s.name && s.startDate)
    .slice()
    .sort((a,b)=> Date.parse(a.startDate) - Date.parse(b.startDate));
}
/* Fim da sprint: o MAIOR entre endDate (planejado) e completeDate (fechamento
   real). 153 das 195 sprints fechadas da base foram encerradas DEPOIS do
   endDate — o time seguiu trabalhando até o fechamento, e usar só o endDate
   jogava essas entregas para fora de qualquer janela. */
function sprintFimMs(s){
  const planejado = s.endDate ? Date.parse(s.endDate) : null;
  const real = s.completeDate ? Date.parse(s.completeDate) : null;
  if(planejado==null && real==null) return null;
  return Math.max(planejado==null?-Infinity:planejado, real==null?-Infinity:real);
}
/* Fechada = o Jira diz 'closed'. Sem `state`, cai para "já passou do fim". */
function sprintFechada(s){
  if(s.state) return String(s.state).toLowerCase()==='closed';
  const fim = sprintFimMs(s);
  return fim!=null && fim < Date.now();
}
/* Sprint FUTURA fica fora do velocity: exibir "30 sp comprometidos, 0 entregues"
   de uma sprint que ainda não começou lê como fracasso, quando é só planejamento. */
function sprintComecou(s){
  if(s.state) return String(s.state).toLowerCase()!=='future';
  return Date.parse(s.startDate) <= Date.now();
}
/* A issue era membro da sprint NESTE instante? Uma issue pode ter entrado,
   saído e voltado, então basta uma passagem cobrir o instante. */
function membroNoInstante(d, sprint, instanteMs){
  return (d.SprintPeriodos||[]).some(p=> p.sprint===sprint
    && p.enteredAt && Date.parse(p.enteredAt) <= instanteMs
    && (!p.leftAt || Date.parse(p.leftAt) > instanteMs));
}
/* Entrou na sprint dentro da janela (start, end] -> escopo adicionado no meio. */
function entrouDuranteSprint(d, sprint, iniMs, fimMs){
  return (d.SprintPeriodos||[]).some(p=>{
    if(p.sprint!==sprint || !p.enteredAt) return false;
    const t = Date.parse(p.enteredAt);
    return t > iniMs && (fimMs==null || t <= fimMs);
  });
}
/* Passou pela sprint em algum momento. Cai no campo Sprints quando o histórico
   não pôde ser reconstruído — aí sabemos o conjunto, não a cronologia. */
function passouPelaSprint(d, sprint){
  return (d.SprintPeriodos||[]).some(p=>p.sprint===sprint) || (d.Sprints||[]).includes(sprint);
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
 * (`TransbordoPI2AfyaOne` etc.); aqui é de sprint e vem do histórico de sprint.
 * Unidades diferentes, mesma palavra — o vocabulário é o do time.
 *
 * Item cujo histórico não pôde ser reconstruído não é marcado: preferimos
 * deixar de marcar a marcar errado.
 */
function transbordoDeSprint(d, sprint){
  const cat = sprintCatalogoOrdenado();
  const atual = cat.find(s=>s.name===sprint);
  if(!atual) return null;
  const iniAtual = Date.parse(atual.startDate);
  for(const per of (d.SprintPeriodos||[])){
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
function textoTransbordo(r){
  return `Veio de ${r.transbordo}, onde permaneceu até o fechamento.`
    + ` Chegou aqui com ${r.prontosNaAbertura} de ${r.Y} subitens já concluídos.`;
}
/* Janela da sprint em DATAS locais ('YYYY-MM-DD'), inclusive nas duas pontas.
   A data de entrega é uma data sem hora; comparar com o timestamp da sprint (que
   costuma terminar às 03:00 UTC = meia-noite no Brasil) descartava as entregas
   do próprio último dia da sprint. */
function sprintJanelaDatas(s){
  const fim = sprintFimMs(s);
  return {
    de: isoLocalDate(new Date(s.startDate)),
    ate: isoLocalDate(new Date(fim==null ? Date.parse(s.startDate) : fim)),
  };
}
/* Diferença em dias de calendário entre duas datas 'YYYY-MM-DD'. As duas pontas
   são lidas como meia-noite UTC, então não há deslocamento de fuso. */
function diasEntreDatas(de, ate){
  return Math.round((Date.parse(ate+'T00:00:00Z') - Date.parse(de+'T00:00:00Z')) / 86400000);
}
/* A issue era membro da sprint nesta DATA de calendário? A entrega não possui
   horário, por isso a comparação é inclusiva nas duas pontas do dia. */
function membroNaData(d, sprint, data){
  return (d.SprintPeriodos||[]).some(p=>p.sprint===sprint && p.enteredAt
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
function dataEntregaSprint(d){
  return d['Data Entrega Sprint'] || d['Data Conclusao'] || null;
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
function atribuirEntregas(itens, sprints){
  const janelas = new Map(sprints.map(s=>[s.name, sprintJanelaDatas(s)]));
  const porSprint = new Map();
  const foraDetalhe = [];
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
      const janela = janelas.get(s.name);
      if(dc > janela.ate) return false;
      const semCronologia = !(d.SprintPeriodos||[]).some(p=>p.sprint===s.name)
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
        const semCronologia = !(d.SprintPeriodos||[]).some(p=>p.sprint===s.name)
          && (d.Sprints||[]).includes(s.name);
        const ficouAteOFim = semCronologia || (fimMs!=null && membroNoInstante(d, s.name, fimMs));
        const atraso = diasEntreDatas(janelas.get(s.name).ate, dc);
        return sprintFechada(s) && ficouAteOFim && atraso>=0
          && atraso<=TOLERANCIA_FECHAMENTO_DIAS;
      });
      if(fechamento){
        alvo = fechamento;
      } else {
        const ultima = suas[suas.length-1];
        const fimMs = sprintFimMs(ultima);
        const semCronologia = !(d.SprintPeriodos||[]).some(p=>p.sprint===ultima.name)
          && (d.Sprints||[]).includes(ultima.name);
        const ficouAteOFim = semCronologia || (fimMs!=null && membroNoInstante(d, ultima.name, fimMs));
        const atraso = diasEntreDatas(janelas.get(ultima.name).ate, dc);
        foraDetalhe.push({
          item: d, sprint: ultima.name, atraso,
          motivo: ficouAteOFim ? 'tardia' : 'saiu',
        });
        return;
      }
    }
    if(!porSprint.has(alvo.name)) porSprint.set(alvo.name, []);
    porSprint.get(alvo.name).push(d);
  });
  return {porSprint, foraDeSprint: foraDetalhe.map(x=>x.item), foraDetalhe};
}

const spDe = d => Number(d['Story Points']) || 0;
/* Sprint selecionada na aba Sprint (seleção única). */
let sprintSelection = null;

/* Dropdown de sprint no mesmo padrão da barra de filtros (.dd-*), com busca
   interna. Seleção única: clicar em um item troca a sprint e fecha o painel.
   Idempotente — a carga progressiva chama esta função a cada lote. */
function initSprintSelector(){
  const wrap = document.getElementById('dd-sprintPick');
  if(!wrap) return;
  const names = sprintNamesFromData();
  if(!names.includes(sprintSelection)) sprintSelection = names[0] || null;

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
    names.forEach(n=>{
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
      list.querySelectorAll('.dd-item').forEach(it=>{ it.style.display='flex'; });
      search.focus();
    }
  });
  search.addEventListener('click', e=>e.stopPropagation());
  search.addEventListener('input', ()=>{
    const q = search.value.toLowerCase();
    list.querySelectorAll('.dd-item').forEach(it=>{
      it.style.display = it.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
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
const isStandard = d => !!d['Tipo Agrupado'] && !TIPOS_NAO_STANDARD.has(d['Tipo Agrupado']);
const isSubitem  = d => d['Tipo Agrupado']==='Sub-task';

/* ===================== TAB: DEPENDÊNCIAS ===================== */
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
const SKIP_DEP = new Set(['Tipo de item','Squad']);
/* Ids canônicos das squads selecionadas. Vazio = todas, mesma convenção dos
   demais filtros da barra. É um Set, e não um valor único, porque a pergunta
   natural aqui é comparar duas ou três squads entre si.
   (Na tela o filtro se chama "Squad", como nas outras abas; o catálogo que
   traduz id -> rótulo chega do backend em `meta.dependencyTeams`.) */
const depSquads = new Set();
let depRole = 'ambos';    // 'ambos' | 'demandante' | 'dependente'
const DEP_ROLES = [
  {v:'ambos', label:'Ambos'},
  {v:'demandante', label:'Demandante (quem pediu)'},
  {v:'dependente', label:'Dependente (de quem se depende)'},
];

/** id canônico -> rótulo. O catálogo vem uma vez no meta do payload. */
function depTeamLabel(id){
  if(!id) return 'Não informado';
  return (window.__DEP_TEAMS && window.__DEP_TEAMS[id]) || id;
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
function depIdadeDias(d){
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
function depMatchTeam(d){
  if(!depSquads.size) return true;
  const comoDependente = depSquads.has(d.DepDependente);
  const comoDemandante = depSquads.has(d.DepDemandante);
  if(depRole==='dependente') return comoDependente;
  if(depRole==='demandante') return comoDemandante;
  return comoDependente || comoDemandante;
}

/** Recorte de estado atual da aba — usado também pelo botão "Ver dependências". */
function depRecorte(){
  return getFilteredNoDate(SKIP_DEP).filter(d=>d.EhDependencia && depMatchTeam(d));
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
function buildDepFilters(controls){
  const cat = window.__DEP_TEAMS || {};
  const usados = new Set();
  DATA.forEach(d=>{
    if(!d.EhDependencia) return;
    if(d.DepDependente) usados.add(d.DepDependente);
    if(d.DepDemandante) usados.add(d.DepDemandante);
  });
  // Squad que sumiu da base (mudou de recorte, mudou de PI) não pode continuar
  // filtrando por baixo dos panos: o dropdown não a mostraria mais.
  Array.from(depSquads).forEach(id=>{ if(!usados.has(id)) depSquads.delete(id); });
  const opcoes = Array.from(usados).map(id=>[id, cat[id]||id])
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
    listaSquad.querySelectorAll('.dd-item').forEach(it=>{
      it.style.display = it.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
  listaSquad.addEventListener('click', e=>e.stopPropagation());
  listaSquad.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) depSquads.add(cb.value); else depSquads.delete(cb.value);
      atualizarBotaoDepSquad(btnSquad);
      renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
    });
  });
  acoesSquad.querySelector('[data-act="all"]').addEventListener('click', (e)=>{
    e.stopPropagation();
    listaSquad.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=true; depSquads.add(cb.value); });
    atualizarBotaoDepSquad(btnSquad);
    renderDep(getFiltered(SKIP_DEP), getFilteredNoDate(SKIP_DEP));
  });
  acoesSquad.querySelector('[data-act="none"]').addEventListener('click', (e)=>{
    e.stopPropagation();
    listaSquad.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=false; });
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
function atualizarBotaoDepSquad(btn){
  const el = btn || document.querySelector('#dd-depSquad .dd-btn');
  if(!el) return;
  const conta = el.querySelector('.count');
  if(depSquads.size){ conta.style.display='inline-block'; conta.textContent = depSquads.size; }
  else { conta.style.display='none'; }
  updateFilterSummary();
}

function renderDep(f, atual){
  const deps = atual.filter(d=>d.EhDependencia && depMatchTeam(d));
  // `f` já exige Data Conclusao dentro do período — para dependência ela vem da
  // entrada em Done (changelog), então "resolvida no período" é exato aqui.
  const noPeriodo = f.filter(d=>d.EhDependencia && depMatchTeam(d));
  const abertas = deps.filter(d=>!d.Concluido && !d.Cancelado);
  const resolvidas = noPeriodo.filter(d=>d.Concluido);
  const canceladas = noPeriodo.filter(d=>d.Cancelado);
  const externas = deps.filter(d=>d.DepExterno);
  const idadeAbertas = abertas.map(depIdadeDias).filter(v=>v!=null);
  const temposResolucao = resolvidas.map(d=>d.LeadTimeDias).filter(v=>v!=null);
  const p85 = percentile(temposResolucao, 85);

  Object.assign(__cardDrills, {
    dep_abertas:{title:'Dependências em aberto', issues:abertas},
    dep_resolvidas:{title:'Dependências resolvidas no período', issues:resolvidas},
    dep_canceladas:{title:'Dependências canceladas no período', issues:canceladas},
    dep_externas:{title:'Dependências de times externos', issues:externas},
  });

  document.getElementById('dep-kpis').innerHTML = [
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
function renderDepMatriz(deps){
  const alvo = document.getElementById('dep-matrix');
  if(!alvo) return;
  if(!deps.length){ alvo.innerHTML = '<div class="empty">Nenhuma dependência no recorte atual.</div>'; return; }
  const celulas = new Map();
  const totLinha = new Map(), totCol = new Map();
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
  alvo.querySelectorAll('[data-dep-l],[data-dep-c]').forEach(cel=>{
    const l = cel.dataset.depL, c = cel.dataset.depC;
    if(l===undefined && c===undefined) return;
    cel.addEventListener('click', ()=>{
      if(l!==undefined && c!==undefined){
        openDrawer(`${depTeamLabel(l)} → ${depTeamLabel(c)}`,
          deps.filter(d=>(d.DepDemandante||'')===l && (d.DepDependente||'')===c));
      } else if(l!==undefined){
        openDrawer(`Demandadas por ${depTeamLabel(l)}`, deps.filter(d=>(d.DepDemandante||'')===l));
      } else {
        openDrawer(`Pedidas para ${depTeamLabel(c)}`, deps.filter(d=>(d.DepDependente||'')===c));
      }
    });
  });
}

/* Fila de entrada por time dependente, empilhada por desfecho. Sem recorte de
   período: a pergunta é quanto cada time tem/teve na fila, não o que fechou nos
   últimos 30 dias. */
function renderDepFila(deps){
  const byTeam = groupBy(deps, d=>d.DepDependente||'');
  const linhas = Array.from(byTeam, ([id,v])=>({
    id, label: depTeamLabel(id),
    abertas: v.filter(d=>!d.Concluido && !d.Cancelado).length,
    concluidas: v.filter(d=>d.Concluido).length,
    canceladas: v.filter(d=>d.Cancelado).length,
    todas: v,
  })).sort((a,b)=>(b.abertas+b.concluidas+b.canceladas)-(a.abertas+a.concluidas+a.canceladas));
  const drill = (idx, campo)=>{
    const r = linhas[idx];
    const filtro = campo==='abertas' ? (d=>!d.Concluido&&!d.Cancelado)
      : campo==='concluidas' ? (d=>d.Concluido) : (d=>d.Cancelado);
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
      plugins:{tooltip:{callbacks:{label:(ctx)=>` ${ctx.dataset.label}: ${fmt0(ctx.parsed.x)}`}}},
      scales:{x:{stacked:true, beginAtZero:true, title:{display:true, text:'Nº de dependências'}},
              y:{stacked:true, grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx, ds)=>drill(idx, ['abertas','concluidas','canceladas'][ds]))}
  });
}

/* Abertas (por criação) contra resolvidas (por entrada em Done), mês a mês. */
function renderDepMensal(deps){
  const meses = Array.from(new Set([
    ...deps.map(d=>d.AnoMesCriacao).filter(Boolean),
    ...deps.filter(d=>d.Concluido).map(d=>d.AnoMesConclusao).filter(Boolean),
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
      onClick: drillClick((idx, ds)=>{
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
function renderDepTempo(deps){
  const resolvidas = deps.filter(d=>d.Concluido && d.LeadTimeDias!=null);
  const linhas = Array.from(groupBy(resolvidas, d=>d.DepDependente||''))
    .filter(([,v])=>v.length>=2)
    .map(([id,v])=>({id, label:depTeamLabel(id), media:mean(v.map(d=>d.LeadTimeDias)), n:v.length, todas:v}))
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
      tooltip:{callbacks:{label:(ctx)=>` ${fmt1(ctx.parsed.x)} dias (média) · ${linhas[ctx.dataIndex].n} resolvida(s)`}}},
      scales:{x:{beginAtZero:true, title:{display:true, text:'Dias'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=>({title:`Resolvidas · ${linhas[idx].label}`, issues:linhas[idx].todas}))}
  });
}

function renderDepAbertas(abertas){
  const ord = abertas.map(d=>({d, dias:depIdadeDias(d)}))
    .sort((a,b)=>(b.dias!=null?b.dias:-1)-(a.dias!=null?a.dias:-1)).slice(0,25);
  document.querySelector('#dep-open-table tbody').innerHTML = ord.length ? ord.map(({d,dias})=>`
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
function renderDepImpacto(deps){
  const porItem = new Map();
  deps.forEach(d=>{
    (d.DepLinks||[]).forEach(l=>{
      const cur = porItem.get(l.k) || {chave:l.k, tipo:l.t, status:l.s, total:0, abertas:0, deps:[]};
      cur.total += 1;
      if(!d.Concluido && !d.Cancelado) cur.abertas += 1;
      cur.deps.push(d);
      porItem.set(l.k, cur);
    });
  });
  const linhas = Array.from(porItem.values())
    .sort((a,b)=>(b.abertas-a.abertas)||(b.total-a.total)).slice(0,25);
  document.querySelector('#dep-impacto-table tbody').innerHTML = linhas.length ? linhas.map(r=>`
    <tr>
      <td><a class="jira" href="${JIRA_BROWSE}${r.chave}" target="_blank" rel="noopener">${r.chave}</a></td>
      <td style="font-size:11.5px;">${escapeHtml(r.tipo||'—')}</td>
      <td style="font-size:11.5px;">${escapeHtml(r.status||'—')}</td>
      <td><b>${r.total}</b>${r.abertas?` <span style="color:#CE0058;">(${r.abertas} aberta${r.abertas>1?'s':''})</span>`:''}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--slate-soft);">Nenhuma dependência do recorte tem item linkado.</td></tr>';
  const comLink = deps.filter(d=>(d.DepLinks||[]).length).length;
  const pct = deps.length ? Math.round(comLink/deps.length*100) : 0;
  document.getElementById('dep-impacto-cobertura').innerHTML =
    `Cobertura: <b>${fmt0(comLink)}</b> de ${fmt0(deps.length)} dependências do recorte (${pct}%) têm item linkado. `
    + 'Valem os links <i>Dependo de / Depende de mim</i>, <i>Blocks</i> e <i>Relates</i>; clones ficam de fora, '
    + 'porque um clone é cópia da própria dependência e não o item que ficou esperando.';
}

function renderDepQualidade(deps){
  const semDemandante = deps.filter(d=>!d.DepDemandante);
  const semLink = deps.filter(d=>!(d.DepLinks||[]).length);
  const semPi = deps.filter(d=>!d.PI || d.PI==='Não informado');
  const semEscopo = deps.filter(d=>d.DepEscopo==='Não informado');
  const pct = n => deps.length ? Math.round((deps.length-n)/deps.length*100) : 0;
  Object.assign(__cardDrills, {
    dep_sem_demandante:{title:'Dependências sem Time Demandante', issues:semDemandante},
    dep_sem_link:{title:'Dependências sem item linkado', issues:semLink},
    dep_sem_pi:{title:'Dependências sem label de PI', issues:semPi},
    dep_sem_escopo:{title:'Dependências sem link oficial (escopo desconhecido)', issues:semEscopo},
  });
  const q = (valor, rotulo, faltando, drill) => `
    <div class="q${valor<80?' warn':''}" data-drill="${drill}" style="cursor:pointer;">
      <div class="qv">${valor}%</div>
      <div class="ql">${rotulo}<br><span style="color:#A1A1AA;">${fmt0(faltando)} sem preencher</span></div>
    </div>`;
  document.getElementById('dep-quality').innerHTML = [
    q(pct(semDemandante.length), 'com <b>Time Demandante</b>', semDemandante.length, 'dep_sem_demandante'),
    q(pct(semLink.length), 'com <b>item linkado</b>', semLink.length, 'dep_sem_link'),
    q(pct(semEscopo.length), 'com <b>link oficial</b> (in/out VS)', semEscopo.length, 'dep_sem_escopo'),
    q(pct(semPi.length), 'com <b>label de PI</b>', semPi.length, 'dep_sem_pi'),
  ].join('');
}

function renderSprint(){
  // '' quando não há sprints nos dados — mantém o render com estado vazio.
  const sprint = sprintSelection || '';
  // Squad limita toda a base. Tipo é aplicado aos itens principais; subtarefas
  // continuam disponíveis para calcular a completude dos pais selecionados.
  const squadBase = DATA.filter(d=>!d.Cancelado && matchesSprintTabFilters(d, SKIP_TIPO));
  const subsByParent = groupBy(squadBase.filter(isSubitem), d=>d.parentKey);
  const subsOf = p => subsByParent.get(p.Chave) || [];

  // itens standard que pertencem à sprint (array Sprints contém)
  const standardNaSprint = squadBase.filter(d=> isStandard(d)
    && matchesSprintTabFilters(d) && (d.Sprints||[]).includes(sprint));

  // A entrega do bloco de progresso deve ser a MESMA do velocity. Calcular pelo
  // estado atual dos subitens fazia um pai com 100% dos filhos aparecer como
  // entregue nesta sprint mesmo quando sua entrega foi atribuída a outra.
  const baseVelocity = DATA.filter(d=>!d.Cancelado && isStandard(d) && matchesSprintTabFilters(d));
  const nomesNaBase = new Set();
  baseVelocity.forEach(d=>{
    (d.SprintPeriodos||[]).forEach(p=>nomesNaBase.add(p.sprint));
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
  const rows = standardNaSprint.map(p=>{
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
  document.getElementById('sprint-kpis').innerHTML = [
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
        title:(items)=>{ const r = topRows[items[0].dataIndex]; return r.p.Resumo ? quebraTextoTooltip(r.p.Resumo, 44) : [r.p.Chave]; },
        label:(ctx)=>` ${topRows[ctx.dataIndex].X}/${topRows[ctx.dataIndex].Y} subitens (${ctx.parsed.x}%)`}}},
      scales:{x:{beginAtZero:true, max:100, grid:{color:'#ECECEC'}, title:{display:true, text:'% concluído'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=> __cardDrills['sprintitem_'+idx])}
  });

  // Tabela hierárquica
  document.querySelector('#sprint-table tbody').innerHTML = rows.length ? rows.map((r,i)=>`
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

function initVelocityRange(){
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
function serieVelocity(itens, sprints){
  // A atribuição de entregas é feita UMA vez, olhando todas as sprints juntas —
  // é o que garante que a mesma entrega não caia em duas sprints.
  const {porSprint, foraDeSprint, foraDetalhe} = atribuirEntregas(itens, sprints);
  const serie = sprints.map(s=>{
    const ini = Date.parse(s.startDate);
    const fim = sprintFimMs(s);
    const doSprint = itens.filter(d=>passouPelaSprint(d, s.name));
    const comprometidos = doSprint.filter(d=>membroNoInstante(d, s.name, ini));
    const adicionados = doSprint.filter(d=>!membroNoInstante(d, s.name, ini) && entrouDuranteSprint(d, s.name, ini, fim));
    const entregues = porSprint.get(s.name) || [];
    // Removido = saiu dentro da janela E não voltou até o fim (item que saiu e
    // retornou no meio da sprint não é escopo perdido).
    const removidos = doSprint.filter(d=>{
      const saiu = (d.SprintPeriodos||[]).some(p=> p.sprint===s.name && p.leftAt
        && Date.parse(p.leftAt) <= (fim==null?Infinity:fim));
      return saiu && !(fim!=null && membroNoInstante(d, s.name, fim));
    });
    const soma = arr => arr.reduce((a,d)=>a+spDe(d), 0);
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
function sprintTeveParticipacao(r){
  return (r.itens.comprometidos.length + r.itens.adicionados.length + r.itens.entregues.length) > 0;
}

function renderVelocity(){
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
  const nomesNaBase = new Set();
  base.forEach(d=>{
    (d.SprintPeriodos||[]).forEach(p=>nomesNaBase.add(p.sprint));
    (d.Sprints||[]).forEach(s=>nomesNaBase.add(s));
  });
  // Candidatas: sprints que a base tocou e que já começaram. O recorte para as
  // "últimas N" acontece DEPOIS de descartar as sem participação — senão sprints
  // alheias zeradas ocupariam as vagas do gráfico.
  const candidatas = sprintCatalogoOrdenado().filter(s=>nomesNaBase.has(s.name) && sprintComecou(s));

  if(temSquad) renderVelocityPorSprint(base, candidatas);
  renderVelocityPorSquad(base);
}

function renderVelocityPorSprint(base, candidatas){
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
  document.getElementById('velocity-kpis').innerHTML = [
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
    const linha = (n, sp, texto, drill) => n
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
        afterBody:(ctx)=>{
          const r = serie[ctx[0].dataIndex];
          const linhas = [];
          if(!r.fechada) linhas.push('⚠ sprint ainda não fechada');
          if(r.removido) linhas.push(`saiu da sprint antes do fim: ${fmt1(r.removido)} sp`);
          const escopo = r.comprometido + r.adicionado;
          if(escopo) linhas.push(`entregue ÷ escopo: ${(r.entregue/escopo*100).toFixed(0)}%`);
          return linhas;
        }}}},
      scales:{y:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'Story Points'}},
        x:{grid:{display:false}, ticks:{font:{size:9.5}, maxRotation:60, minRotation:0}}},
      onClick: drillClick((idx, ds)=>{
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
      + ` a ${String(sprintFimMs(ate)? new Date(sprintFimMs(ate)).toISOString().slice(0,10):'').split('-').reverse().join('/')}.`;
  }
}

/* Rótulo curto: os nomes de sprint são longos ("26_SQD_PREPARATORIOS_PI3_5") e
   repetem o prefixo da squad, que já está no filtro. */
function rotuloSprint(nome){
  return String(nome).replace(/^\d+_SQD_/i, '').replace(/_/g, ' ');
}

function renderVelocityPorSquad(base){
  // Sem squad selecionada, mostra todas — é o panorama que ajuda a escolher uma.
  // Com filtro aplicado, `base` já vem restrita às selecionadas.
  const porSquad = Array.from(groupBy(base, d=>d.Squad));
  const linhas = porSquad.map(([squad, itens])=>{
    const nomes = new Set();
    itens.forEach(d=>{
      (d.SprintPeriodos||[]).forEach(p=>nomes.add(p.sprint));
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
  }).filter(Boolean).sort((a,b)=>b.media-a.media);

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
        tooltip:{callbacks:{label:(ctx)=>{
          const l = linhas[ctx.dataIndex];
          return ` ${fmt1(l.media)} sp/sprint · ${l.n} sprint(s)`
            + (l.sayDo!=null ? ` · say-do ${l.sayDo.toFixed(0)}%` : '');
        }}}},
      scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}, title:{display:true, text:'SP entregues por sprint'}},
        y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx)=> __cardDrills['velsq_'+idx])}
  });
}

function renderBurndown(sprint, subs){
  const {start, end} = sprintDates(sprint);
  const total = subs.length;
  if(!start || !end || end < start){
    upsertChart('chart-sprint-burndown', {type:'line', data:{labels:['sem datas da sprint'], datasets:[{data:[total], borderColor:'#C4C4C4'}]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{enabled:false}}, scales:{y:{display:false}, x:{grid:{display:false}}}}});
    return;
  }
  // dias da sprint (inclusive)
  const days=[]; const d0=new Date(start); d0.setHours(0,0,0,0);
  const dEnd=new Date(end); dEnd.setHours(0,0,0,0);
  for(let d=new Date(d0); d<=dEnd; d.setDate(d.getDate()+1)) days.push(new Date(d));
  const iso = dt => dt.toISOString().slice(0,10);
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
  const fmtDay = dt => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
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

/* Squads que o usuário ABRIU. Todas nascem recolhidas: com 14 squads e ~60
   épicos, abrir tudo joga o leitor numa parede de linhas e esconde os KPIs
   acima. Recolhido, a página abre mostrando o ranking de squads — que é a
   leitura de entrada — e o detalhe vem por escolha.

   Guardar o que foi aberto (em vez do que foi fechado) preserva a escolha do
   usuário entre renders: a lista é reconstruída a cada mudança de filtro, e a
   squad que ele abriu tem de continuar aberta. */
const piExpandedSquads = new Set();

/* Value Streams que o usuário ABRIU — mesma mecânica do conjunto acima, e pelo
   mesmo motivo: guardar o que foi aberto preserva a escolha entre renders (a
   lista é reconstruída a cada mudança de filtro) e faz o conjunto vazio
   significar "tudo como nasce".

   Os dois níveis nascem RECOLHIDOS. Decisão do usuário depois de ver a tela
   pronta: a página abre no ranking das Value Streams — 6 linhas — e o detalhe
   vem por escolha, um nível de cada vez. É a mesma leitura de entrada que as
   squads já tinham, um andar acima. */
const piExpandedVs = new Set();

/* O PI vem do filtro do topo — é a MESMA dimensão (label do Jira), então um
   seletor próprio aqui seria uma segunda fonte de verdade para a mesma pergunta.
   Vazio significa "todos", como em qualquer filtro da barra.

   Consequência: os KPIs temporais (quarter percorrido, gap, squads atrasadas)
   só existem com UM PI selecionado — "quanto do quarter já passou" não tem
   resposta para Q1 e Q3 somados. Eles mostram "—" e dizem o que falta, em vez
   de exibir um número que não significa nada. */
function piSelectedPis(){
  const escolhidos = Array.from(selections['PI'] || []);
  return escolhidos.length ? escolhidos : piOptionsFromData();
}

/* Cores das fases. Validadas contra a superfície branca e para as três formas de
   daltonismo (pior par adjacente ΔE 16.1 em protanopia). O âmbar fica abaixo de
   3:1 de contraste, o que exige rótulos visíveis — que existem: a legenda no
   topo e as contagens por fase em cada linha. */
const PI_PHASE_COLORS = { done:'#CE0058', inprogress:'#0057B8', todo:'#D98E3B' };

function piRules(){ return window.__QUARTER_RULES || null; }

/** Comparação de status normalizada (trim + maiúsculas), como no afya-quarter. */
function piNorm(s){ return String(s==null?'':s).trim().toUpperCase(); }
function piInList(status, list){
  const n = piNorm(status);
  return (list||[]).some(s=>piNorm(s)===n);
}
function piIsDone(status){ return piInList(status, piRules()?.doneStatuses); }
function piIsInProgress(status){ return piInList(status, piRules()?.inProgressStatuses); }
function piIsIgnored(status){ return piInList(status, piRules()?.ignoredStatuses); }

/** O item conta como "filho entregável" do épico? Exclui épicos e sub-tarefas. */
function piIsCountableChild(item){
  const r = piRules(); if(!r) return false;
  const tipo = String(item['Tipo de item']||'');
  if((r.excludedChildTypes||[]).includes(tipo)) return false;
  return !(r.subtaskTypePrefixes||[]).some(p=>tipo.startsWith(p));
}

function piIsTransbordo(item){
  const labels = item.Labels || [];
  return (piRules()?.transbordoLabels || []).some(l=>labels.includes(l));
}

/** Filtros do topo que se aplicam aqui. Tipo/Status/período ficam de fora
    porque mexeriam no denominador do progresso, não no recorte. */
const PI_TAB_FILTER_KEYS = ['Programa','VS','Squad'];

/** O recorte de Programa em vigor. O padrão de Programa agora é GLOBAL
    (`DEFAULT_PROGRAMA`), então aqui basta ler a barra — ela é a única fonte de
    verdade do recorte. */
function piProgramaDoRecorte(){
  const sel = selections['Programa'];
  return (sel && sel.size) ? {set:sel} : null;
}

function matchesPiTabFilters(d){
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
function piDoQuarterAtual(){
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
function piSincronizarPiPadrao(){
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
function sincronizarFiltroNaTela(key){
  const wrap = document.getElementById('dd-'+key.replace(/\s/g,'_'));
  if(!wrap) return;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = selections[key].has(cb.value); });
  const btn = wrap.querySelector('.dd-btn');
  if(btn) updateFilterBtn(key, btn);
}

/** PIs presentes nos dados que têm janela de quarter conhecida, do mais recente
    para o mais antigo (o PI atual é quase sempre o que se quer ver). */
function piOptionsFromData(){
  const periods = piRules()?.piPeriods || {};
  const found = new Set();
  PI_DATA.forEach(d=>{ if(d['Tipo Agrupado']==='Épico' && periods[d.PI]) found.add(d.PI); });
  return Array.from(found).sort((a,b)=>{
    const pa = periods[a], pb = periods[b];
    if(pa.year!==pb.year) return pb.year-pa.year;
    if(pa.quarter!==pb.quarter) return pb.quarter.localeCompare(pa.quarter);
    return String(a).localeCompare(String(b),'pt');
  });
}

/** Janela de datas do quarter do PI ('YYYY-MM-DD'), ou null se desconhecida. */
function piQuarterWindow(pi){
  const r = piRules(); if(!r) return null;
  const period = (r.piPeriods||{})[pi]; if(!period) return null;
  const bounds = (r.quarterBounds||{})[period.quarter]; if(!bounds) return null;
  const pad = n=>String(n).padStart(2,'0');
  return {
    quarter: period.quarter, year: period.year,
    label: `${period.quarter}/${period.year}`,
    start: `${period.year}-${pad(bounds.startMonth)}-${pad(bounds.startDay)}`,
    end: `${period.year}-${pad(bounds.endMonth)}-${pad(bounds.endDay)}`,
  };
}

/** Quanto do quarter já passou, em %. Mesma regra (dias inclusivos nas duas
    pontas) de calculate_quarter_time_progress do afya-quarter. */
function piTimeProgress(win){
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
function piBuildTracking(){
  const pis = piSelectedPis();
  const piSet = new Set(pis);
  const programa = piProgramaDoRecorte();
  const epics = PI_DATA.filter(d=>
    d['Tipo Agrupado']==='Épico'
    && piSet.has(d.PI)
    && !piIsIgnored(d.Status)      // afya-quarter exclui épico cancelado na própria JQL
    && matchesPiTabFilters(d));

  // Índice de filhos por épico, montado uma vez (não por épico, que seria O(n²)).
  const childrenByEpic = new Map();
  PI_DATA.forEach(d=>{
    const key = d.EpicoChave;
    if(!key || d.Chave===key) return;   // o próprio épico não é filho de si mesmo
    if(!childrenByEpic.has(key)) childrenByEpic.set(key, []);
    childrenByEpic.get(key).push(d);
  });

  /* VS -> squad -> épicos. O agrupamento é feito pelo VS do ÉPICO, não da
     squad: o VS é o projeto Jira de cada issue, então uma squad pode, em tese,
     ter épicos em dois projetos. Nesse caso ela aparece dentro de cada VS com
     apenas os épicos daquele VS, e os totais continuam certos porque tudo é
     somado a partir do épico. Medido: entre os 166 épicos com PI reconhecido,
     nenhuma das 23 squads aparece sob dois VS — mas na base inteira 21 das 45
     squads têm itens em mais de um projeto, então o caso não é impossível. */
  const byVs = new Map();
  epics.forEach(epic=>{
    const countable = (childrenByEpic.get(epic.Chave)||[]).filter(piIsCountableChild);
    const cancelled = countable.filter(c=>piIsIgnored(c.Status));
    const valid = countable.filter(c=>!piIsIgnored(c.Status));
    const done = valid.filter(c=>piIsDone(c.Status));
    const inProgress = valid.filter(c=>!piIsDone(c.Status) && piIsInProgress(c.Status));
    const todo = valid.filter(c=>!piIsDone(c.Status) && !piIsInProgress(c.Status));

    const row = {
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

    const vs = epic.VS || 'Não informado';
    const squad = epic.Squad || 'Não informado';
    if(!byVs.has(vs)) byVs.set(vs, {vs, squadMap:new Map(), total:0, done:0, inProgress:0, todo:0});
    const vsBucket = byVs.get(vs);
    if(!vsBucket.squadMap.has(squad)) vsBucket.squadMap.set(squad, {squad, vs, epics:[], total:0, done:0, inProgress:0, todo:0});
    const bucket = vsBucket.squadMap.get(squad);
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
  const piorPrimeiro = (campo)=>(a,b)=> a.pct-b.pct || String(a[campo]).localeCompare(String(b[campo]),'pt');

  const vsGroups = Array.from(byVs.values()).map(v=>({
    vs: v.vs, total:v.total, done:v.done, inProgress:v.inProgress, todo:v.todo,
    pct: v.total ? v.done/v.total*100 : 0,
    squads: Array.from(v.squadMap.values()).map(s=>({
      ...s,
      pct: s.total ? s.done/s.total*100 : 0,
      epics: s.epics.sort((a,b)=> a.pct-b.pct || String(a.epic.Chave).localeCompare(String(b.epic.Chave))),
    })).sort(piorPrimeiro('squad')),
  })).sort(piorPrimeiro('vs'));

  /* Lista plana das FAIXAS desenhadas (uma por squad dentro de cada VS), na
     ordem da tela: VS pior primeiro, squad pior primeiro dentro dele. É o que
     os drills percorrem. */
  const squads = vsGroups.flatMap(v=>v.squads);

  /* Squads DISTINTAS, somando os pedaços de quem tiver épicos em dois VS. Os
     KPIs contam squad como time, não como faixa na tela: com a lista plana, uma
     squad partida entre dois VS seria contada duas vezes e "abaixo do esperado"
     poderia marcá-la e não marcá-la ao mesmo tempo. Fazer a conta por nome
     mantém o KPI com o mesmo significado que tinha antes do agrupamento. */
  const porNome = new Map();
  squads.forEach(s=>{
    if(!porNome.has(s.squad)) porNome.set(s.squad, {squad:s.squad, total:0, done:0});
    const b = porNome.get(s.squad);
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
const PI_PHASE_LABELS = { done:'Concluído', inProgress:'Em andamento', todo:'Pendente' };

/** Barra segmentada. Só emite segmentos com valor, para os cantos externos
    arredondados caírem sempre sobre uma fase que existe.

    Com `epicKey`, cada segmento vira um alvo clicável que abre no drawer os
    itens daquela fase — o mesmo recorte que o tooltip de hover já anuncia. Só a
    linha do épico passa a chave: na barra da squad o segmento consolida vários
    épicos e o cabeçalho já tem o clique de recolher/expandir. */
function piMeter(done, inProgress, todo, epicKey){
  const total = done+inProgress+todo;
  if(!total) return '<div class="pi-meter empty" data-help="Este épico não possui itens elegíveis para o cálculo de progresso." aria-label="Épico sem itens elegíveis"></div>';
  const clicavel = !!epicKey;
  const seg = (n,color,phase)=>{
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

const piFmtPct = v => (v===null||v===undefined) ? '—' : v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const piFmtBr = iso => { if(!iso) return ''; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; };

function renderPiTracking(){
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
      k.squadsBehind>0?'amber':'slate',
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

  const squadCard = s=>{
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
  __piChildrenByEpic = new Map(t.epics.map(e=>[e.epic.Chave, e]));
}

let __piChildrenByEpic = new Map();

/* Recolher/expandir squad, abrir os filhos de um épico e abrir uma fase da
   barra de progresso. Um handler só, no documento, porque o conteúdo é
   reconstruído a cada render. */
document.addEventListener('click', (e)=>{
  const kids = e.target.closest('[data-pi-kids]');
  if(kids){
    const row = __piChildrenByEpic.get(kids.getAttribute('data-pi-kids'));
    if(row) openDrawer(`Filhos de ${row.epic.Chave} — ${row.epic.Resumo||''}`, row.children);
    return;
  }
  const seg = e.target.closest('[data-pi-phase]');
  if(seg){
    const row = __piChildrenByEpic.get(seg.getAttribute('data-pi-epic'));
    const phase = seg.getAttribute('data-pi-phase');
    const itens = row && row.byPhase && row.byPhase[phase];
    // Segmento sem itens não é renderizado, então a lista vazia só apareceria se
    // o dado tivesse sido recarregado sob o clique. Nesse caso, nada acontece.
    if(itens && itens.length){
      openDrawer(`${PI_PHASE_LABELS[phase]} · ${row.epic.Chave} — ${row.epic.Resumo||''}`, itens);
    }
    return;
  }
  const head = e.target.closest('.pi-squad-head');
  if(head){
    const card = head.closest('.pi-squad');
    const squad = card.getAttribute('data-pi-squad');
    card.classList.toggle('collapsed');
    if(card.classList.contains('collapsed')) piExpandedSquads.delete(squad);
    else piExpandedSquads.add(squad);
    return;
  }
  /* O cabeçalho do VS não é alcançado pelo bloco acima: a barra da squad vive
     em .pi-vs-body, que é IRMÃO de .pi-vs-head, então nenhum closest de dentro
     de uma squad chega aqui. */
  const vsHead = e.target.closest('.pi-vs-head');
  if(vsHead){
    const card = vsHead.closest('.pi-vs');
    const vs = card.getAttribute('data-pi-vs');
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
  const seg = e.target.closest && e.target.closest('[data-pi-phase]');
  if(!seg) return;
  e.preventDefault();
  seg.click();
});

/* ===================== Init / Bootstrap ===================== */
function showLoading(msg){
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
function updateLoadingProgress(count, detail, label='issues buscadas'){
  const countEl=document.getElementById('__loading_count');
  const detailEl=document.getElementById('__loading_detail');
  if(countEl) countEl.textContent=`${Number(count||0).toLocaleString('pt-BR')} ${label}`;
  if(detailEl&&detail) detailEl.textContent=detail;
}
function hideLoading(){
  const el = document.getElementById('__loading');
  if(el) el.style.display = 'none';
  document.body.classList.remove('dashboard-loading');
}
function showError(detail){
  let el = document.getElementById('__loading') || document.body.appendChild(document.createElement('div'));
  el.id = '__loading';
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(250,249,246,.96);z-index:9999;font-family:Inter,system-ui,sans-serif;'
    + 'color:#D64545;flex-direction:column;gap:12px;text-align:center;padding:32px;';
  el.innerHTML = '<div style="font-size:17px;font-weight:600;">Não foi possível carregar os dados do Jira</div>'
    + '<div style="color:#333333;font-size:13.5px;max-width:520px;">' + detail + '</div>'
    + '<button onclick="bootstrap(true)" style="margin-top:6px;padding:9px 18px;border:none;border-radius:6px;'
    + 'background:#CE0058;color:#fff;font-size:13.5px;cursor:pointer;">Tentar novamente</button>';
  document.body.classList.add('dashboard-loading');
  el.style.display = 'flex';
}

function formatExportDate(iso){
  try{
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
    const g = t => p.find(x=>x.type===t).value;
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

function openDashboardDb(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB indisponivel'));
    const req = indexedDB.open(DASHBOARD_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DASHBOARD_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function readDashboardSnapshot(){
  const db = await openDashboardDb();
  return new Promise((resolve,reject)=>{
    const req = db.transaction(DASHBOARD_STORE,'readonly').objectStore(DASHBOARD_STORE).get('current');
    req.onsuccess=()=>{db.close();
      const snap=req.result||null;
      resolve(snap&&snap.schemaVersion===DASHBOARD_SCHEMA_VERSION?snap:null);};
    req.onerror=()=>{db.close();reject(req.error);};
  });
}
async function writeDashboardSnapshot(value){
  const db = await openDashboardDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DASHBOARD_STORE,'readwrite');
    tx.objectStore(DASHBOARD_STORE).put(value,'current');
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
function setProgressiveStatus(text, loading){
  const el=document.getElementById('progressive-status');
  if(!el) return;
  el.textContent=text||'';
  el.classList.toggle('loading',!!loading);
}
function mergeProgressiveMeta(target, incoming){
  const result={...(target||{})};
  ['pendingStatuses','inProgressStatuses','doneStatuses','cancelledStatuses','quarterRules'].forEach(k=>{
    if(incoming&&incoming[k]) result[k]=incoming[k];
  });
  // O catálogo de times chega PARCIAL em cada lote (só os times daquele
  // lote), então ele acumula em vez de substituir.
  result.dependencyTeams={...(result.dependencyTeams||{}), ...(incoming?.dependencyTeams||{})};
  const sprints=new Map((result.sprints||[]).map(s=>[s.name,s]));
  (incoming?.sprints||[]).forEach(s=>{if(s&&s.name)sprints.set(s.name,{...(sprints.get(s.name)||{}),...s});});
  result.sprints=Array.from(sprints.values());
  return result;
}
function reconcileProgressiveIssues(items){
  const index=new Map(items.map(item=>[item.Chave,item]));
  const healthByEpic=new Map();
  items.forEach(item=>{
    if(item['Tipo Agrupado']==='Épico'){
      item.EpicoChave=item.Chave;
      if(item.SaudeEpico) healthByEpic.set(item.Chave,item.SaudeEpico);
    }
  });
  items.forEach(item=>{
    if(item['Tipo Agrupado']!=='Épico'){
      const seen=new Set(); let current=item; let epic=null;
      while(current&&current.parentKey&&!seen.has(current.parentKey)){
        seen.add(current.parentKey); current=index.get(current.parentKey);
        if(current&&current['Tipo Agrupado']==='Épico'){epic=current.Chave;break;}
      }
      item.EpicoChave=epic;
    }
    if(item['Tipo Agrupado']==='Sub-task'){
      const seen=new Set(); let current=item; let incremental=true;
      while(current&&current.parentKey&&!seen.has(current.parentKey)){
        seen.add(current.parentKey); current=index.get(current.parentKey);
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
function buildProgressiveEpicSummaries(items){
  const roundHalfEven=(value)=>{
    const scaled=value*10, floor=Math.floor(scaled), fraction=scaled-floor;
    if(Math.abs(fraction-.5)<1e-9) return (floor%2===0?floor:floor+1)/10;
    return Math.round(scaled)/10;
  };
  const epics=new Map(items.filter(i=>i['Tipo Agrupado']==='Épico').map(i=>[i.Chave,i]));
  const members=new Map();
  // Dependência fica FORA do rollup: 76 das 189 da base têm pai, e contá-las
  // inflaria TotalItens e o % de conclusão do épico com trabalho que é de outro
  // time. Mesma exclusão que quarter.rules.js já faz na aba de PI Tracking.
  items.forEach(i=>{if(i.EpicoChave && i['Tipo Agrupado']!=='Dependência'){if(!members.has(i.EpicoChave))members.set(i.EpicoChave,[]);members.get(i.EpicoChave).push(i);}});
  return Array.from(members.entries()).flatMap(([key,list])=>{
    const epic=epics.get(key); if(!epic)return [];
    const done=list.filter(i=>i.Concluido), cancelled=list.filter(i=>i.Cancelado).length;
    const denominator=list.length-cancelled;
    return [{Chave:key,Resumo:epic.Resumo,Squad:epic.Squad,VS:epic.VS,Programa:epic.Programa,PI:epic.PI,
      Status:epic.Status,TotalItens:list.length,Concluidos:done.length,Cancelados:cancelled,
      PctConclusao:denominator?roundHalfEven(done.length/denominator*100):0,
      SPTotal:roundHalfEven(list.reduce((s,i)=>s+(i['Story Points']||0),0)),
      SPConcluido:roundHalfEven(done.reduce((s,i)=>s+(i['Story Points']||0),0))}];
  });
}
function renderProgressiveDataset(items, piItems, meta, generatedAt){
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
  document.getElementById('exportDate').textContent=formatExportDate(generatedAt);
  normalizeData();
  if(!dashboardInitialized){setDefaultDateRange();dashboardInitialized=true;}
  buildFilterBar(); renderAll(); hideLoading();
}

async function requestProgressiveBatch(phase,nextPageToken,since,epicKeys){
  const res=await fetch('/api/dashboard/progressive',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({phase,nextPageToken,since,epicKeys})});
  if(!res.ok){let detail=`${res.status} ${res.statusText}`;try{const j=await res.json();detail=j.detail||j.error||detail;}catch(e){}throw new Error(detail);}
  return res.json();
}
/* Coleta isolada do PI Tracking. Primeiro busca todos os épicos pelas labels
   configuradas no servidor, sem corte por ano; depois consulta os filhos em
   grupos de 50 chaves para manter a JQL curta e previsível. */
async function loadPiTrackingDataset(generation){
  const piMap=new Map();
  updateLoadingProgress(0,'Buscando épicos associados aos PIs...','itens do PI buscados');
  let nextPageToken=null, isLast=false;
  while(!isLast){
    if(generation!==progressiveGeneration)return null;
    setProgressiveStatus(`PI Tracking: buscando épicos (${piMap.size.toLocaleString('pt-BR')})`,true);
    const payload=await requestProgressiveBatch('pi-epics',nextPageToken);
    (payload.piIssues||[]).forEach(item=>piMap.set(item.Chave,item));
    updateLoadingProgress(piMap.size,'Buscando épicos associados aos PIs...','itens do PI buscados');
    nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
  }
  const epicKeys=Array.from(piMap.values())
    .filter(item=>item['Tipo Agrupado']==='Épico').map(item=>item.Chave);
  for(let offset=0;offset<epicKeys.length;offset+=50){
    const chunk=epicKeys.slice(offset,offset+50);
    nextPageToken=null; isLast=false;
    while(!isLast){
      if(generation!==progressiveGeneration)return null;
      setProgressiveStatus(`PI Tracking: buscando filhos (${Math.min(offset+chunk.length,epicKeys.length)}/${epicKeys.length} épicos)`,true);
      const payload=await requestProgressiveBatch('pi-children',nextPageToken,null,chunk);
      (payload.piIssues||[]).forEach(item=>piMap.set(item.Chave,item));
      updateLoadingProgress(piMap.size,
        `Buscando filhos dos épicos (${Math.min(offset+chunk.length,epicKeys.length)}/${epicKeys.length})...`,
        'itens do PI buscados');
      nextPageToken=payload.nextPageToken||null; isLast=payload.isLast===true;
    }
  }
  return Array.from(piMap.values());
}

function isLocalDashboardRuntime(){
  return ['localhost','127.0.0.1','::1'].includes(window.location.hostname);
}
async function loadLocalDashboard(forceRefresh,generation){
  setProgressiveStatus(forceRefresh?'Atualizando dataset completo no Jira...':'Carregando dataset completo local...',true);
  updateLoadingProgress(0,forceRefresh?'Atualizando o cache local pelo Jira...':'Carregando todas as issues do cache local...');
  const res=await fetch(`/api/dashboard${forceRefresh?'?refresh=1':''}`,{cache:'no-store'});
  if(!res.ok){let detail=`${res.status} ${res.statusText}`;try{const j=await res.json();detail=j.detail||j.error||detail;}catch(e){}throw new Error(detail);}
  const payload=await res.json();
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
async function persistDashboardSnapshot(snapshot){
  try{await writeDashboardSnapshot(snapshot);}catch(e){console.warn('falha ao salvar IndexedDB',e);}
}
/* Rótulo da etapa na carga completa.
   A mensagem antiga ("Buscando os dados dos últimos dois meses") era lida como o
   LIMITE do que seria carregado, quando é só a primeira das duas etapas — nada é
   renderizado antes de as duas terminarem. Dizer "etapa 1 de 2" evita a leitura
   de que o dashboard só tem 60 dias de dados. */
function rotuloEtapaCarga(phase){
  return phase==='recent'
    ? 'Etapa 1 de 2: buscando os últimos 60 dias...'
    : 'Etapa 2 de 2: buscando o histórico anterior a 60 dias...';
}
async function loadFullProgressively(cached,generation){
  const phases=['recent','history'];
  const resume=cached?.complete===false&&cached?.progress?.mode==='full';
  const freshMap=new Map((resume&&Array.isArray(cached.issues)?cached.issues:[]).map(i=>[i.Chave,i]));
  let meta=resume?(cached.meta||{}):{}, generatedAt=cached?.generatedAt||new Date().toISOString();
  const syncStartedAt=resume&&cached.syncStartedAt?cached.syncStartedAt:new Date().toISOString();
  // Se a carga geral terminou e apenas a coleta dedicada do PI falhou, retoma
  // diretamente no PI. Repetir recent/history buscaria milhares de issues sem
  // necessidade e aumentaria a chance de novo timeout.
  let phaseIndex=resume
    ? (cached.progress.phase==='pi' ? phases.length : Math.max(0,phases.indexOf(cached.progress.phase)))
    : 0;
  let firstToken=resume?cached.progress.nextPageToken||null:null;
  let allowPersistedTokenRestart=!!firstToken;
  if(freshMap.size) updateLoadingProgress(freshMap.size,'Retomando a carga salva...');

  for(let index=phaseIndex;index<phases.length;index+=1){
    const phase=phases[index]; let nextPageToken=index===phaseIndex?firstToken:null, isLast=false;
    while(!isLast){
      if(generation!==progressiveGeneration)return null;
      setProgressiveStatus(`${phase==='recent'?'Etapa 1 de 2 (últimos 60 dias)':'Etapa 2 de 2 (histórico)'}`
        + `: ${freshMap.size.toLocaleString('pt-BR')} issues salvas`,true);
      updateLoadingProgress(freshMap.size,rotuloEtapaCarga(phase));
      let payload;
      try{payload=await requestProgressiveBatch(phase,nextPageToken);}
      catch(error){
        if(allowPersistedTokenRestart&&nextPageToken){nextPageToken=null;allowPersistedTokenRestart=false;continue;}
        throw error;
      }
      allowPersistedTokenRestart=false;
      (payload.issues||[]).forEach(item=>freshMap.set(item.Chave,item));
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
async function loadIncremental(cached,generation){
  const resume=cached?.complete===false&&cached?.progress?.mode==='delta';
  const issueMap=new Map((cached?.issues||[]).map(i=>[i.Chave,i]));
  let meta=cached?.meta||{}, generatedAt=cached?.generatedAt||new Date().toISOString();
  const since=resume?cached.progress.since:(cached.lastSyncAt||cached.generatedAt||new Date(Date.now()-86400000).toISOString());
  const syncStartedAt=resume&&cached.syncStartedAt?cached.syncStartedAt:new Date().toISOString();
  let nextPageToken=resume?cached.progress.nextPageToken||null:null, isLast=false;
  let allowPersistedTokenRestart=!!nextPageToken; const changedKeys=new Set();
  if(resume&&issueMap.size) updateLoadingProgress(issueMap.size,'Retomando atualização salva...','issues em cache');
  while(!isLast){
    if(generation!==progressiveGeneration)return null;
    setProgressiveStatus(`Buscando novas alterações — ${issueMap.size.toLocaleString('pt-BR')} issues em cache`,true);
    updateLoadingProgress(changedKeys.size,'Buscando novas alterações no Jira...');
    let payload;
    try{payload=await requestProgressiveBatch('delta',nextPageToken,since);}
    catch(error){
      if(allowPersistedTokenRestart&&nextPageToken){nextPageToken=null;allowPersistedTokenRestart=false;continue;}
      throw error;
    }
    allowPersistedTokenRestart=false;
    (payload.issues||[]).forEach(item=>{issueMap.set(item.Chave,item);changedKeys.add(item.Chave);});
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
async function bootstrap(forceRefresh){
  const generation=++progressiveGeneration;
  const refreshButton=document.getElementById('btn-refresh');
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
    let cached=null;
    try{cached=await readDashboardSnapshot();}catch(e){console.warn('cache IndexedDB indisponivel',e);}
    const pendingMode=cached?.complete===false?cached?.progress?.mode:null;
    const cacheComplete=!!cached&&cached.complete!==false&&!pendingMode;
    if(cacheComplete&&!forceRefresh){
      renderProgressiveDataset(cached.issues,cached.piIssues||[],cached.meta||{},cached.generatedAt||new Date().toISOString());
      setProgressiveStatus(`${cached.issues.length.toLocaleString('pt-BR')} issues em cache`,false);
      return;
    }
    if(cacheComplete&&forceRefresh){
      renderProgressiveDataset(cached.issues,cached.piIssues||[],cached.meta||{},cached.generatedAt||new Date().toISOString());
      showLoading('Buscando novas alterações no Jira...');
    }
    if(cached&&(pendingMode==='delta'||(cacheComplete&&forceRefresh))){
      await loadIncremental(cached,generation);
    }else{
      await loadFullProgressively(cached,generation);
    }
  }catch(err){
    console.error('bootstrap error:',err);
    setProgressiveStatus('Carga parcial salva — tente novamente',false);
    if(DATA.length)hideLoading();else showError(err.message||String(err));
  }finally{
    if(generation===progressiveGeneration&&refreshButton)refreshButton.disabled=false;
  }
}

document.addEventListener('DOMContentLoaded', () => bootstrap(false));

