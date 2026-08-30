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
let __cardDrills: Record<string, { title: string; issues: DashboardIssue[] }> = {};
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

