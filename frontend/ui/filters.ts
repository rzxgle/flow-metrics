/* ===================== Filter state ===================== */
type FilterKey = 'Programa' | 'VS' | 'Squad' | 'PI' | 'Sprint'
  | 'AnoCriacao' | 'Mes' | 'Tipo de item' | 'Status';
type FilterValueKey = FilterKey | 'MesConclusao';
type FilterValue = string | number;

interface FilterDimension {
  key: FilterKey;
  label: string;
}

interface TypeShortcut {
  label: string;
  grupos: readonly string[];
}

interface ResolvedTypeShortcut {
  label: string;
  tipos: string[];
}

const FILTER_DIMS: readonly FilterDimension[] = [
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
const selections: Record<string, Set<string>> = {};
FILTER_DIMS.forEach(f=> selections[f.key] = new Set());
let filterDocumentHandlerBound = false;
// Filtro padrão de Tipo de item (recorte inicial): tipos crus de produção.
const DEFAULT_TIPO: readonly string[] = ['Enabler','Melhoria','Story','Technical Debt'];
DEFAULT_TIPO.forEach(t=> selections['Tipo de item'].add(t));
/* Programa padrão: o painel é orientado ao Afya One. É seleção GLOBAL, como a de
   Tipo — a barra abre com o filtro marcado e ele vale em toda aba que usa
   Programa (a Sprint não usa; o PI Tracking usa). Afya Bridge continua a um
   clique de distância: isto é padrão, não trava.
   Medido: Afya Bridge são 3.416 dos 17.256 itens da base (19,8%). */
const DEFAULT_PROGRAMA: readonly string[] = ['Afya One'];
DEFAULT_PROGRAMA.forEach(p=> selections['Programa'].add(p));
// Abas que NÃO devem sofrer o filtro de Tipo (dependem de Sub-block/Sub-task).
const SKIP_TIPO = new Set<string>(['Tipo de item']);
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
const SKIP_STATUS = new Set<string>(['Status']);
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
const TIPOS_FORA_DA_ABA_SPRINT = new Set<string>([
  'Epic', 'Enabler Epic', 'Dependência',
  'Sub-block', 'Sub-bug', 'Sub-design', 'Sub-imp', 'Sub-script', 'Sub-task',
  'Sub-test', 'Subtarefa', 'Correção Staging',
]);

/* ===================== Item 6 — Filtro de calendário (por data de conclusão) =====================
   Opção A: itens COM data de conclusão são filtrados pelo intervalo;
   itens em aberto (WIP, sem data de conclusão) permanecem sempre visíveis. */
const dateRange: { from: string | null; to: string | null } = { from: null, to: null }; // 'YYYY-MM-DD'

function uniqueVals(key: FilterValueKey): FilterValue[] {
  const set = new Set<FilterValue>();
  if(key==='Sprint'){
    DATA.forEach(d=>(d.Sprints||[]).forEach(s=>set.add(String(s))));
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
    arr = arr.sort((a,b)=>Number(a)-Number(b));
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
const TIPO_ATALHOS: readonly TypeShortcut[] = [
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
function tiposPorGrupo(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  DATA.forEach(d=>{
    const g = String(d['Tipo Agrupado'] || ''), t = String(d['Tipo de item'] || '');
    if(!g || !t) return;
    if(!m.has(g)) m.set(g, new Set<string>());
    m.get(g)?.add(t);
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
function construirAtalhosDeTipo(
  slot: HTMLElement,
  list: HTMLElement,
  btn: HTMLButtonElement,
  key: FilterKey,
): () => void {
  const porGrupo = tiposPorGrupo();
  const defs: ResolvedTypeShortcut[] = TIPO_ATALHOS
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
      list.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{ cb.checked = selections[key].has(cb.value); });
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
let sincronizarChipsDeTipo: () => void = ()=>{};

/* ---- Correlação PI <-> Programa ----
   Cada PI pertence a um programa, e isso vive como DADO em `quarter.rules.js`
   (`piPeriods[pi].programa`), não num casamento por pedaço do nome: um
   `PI5 - AfyaOne` sem espaço, ou um rename de label, quebraria a regra em
   silêncio, enquanto uma entrada faltando na tabela aparece na hora — o PI some
   da lista.

   Devolve null para quem não pertence a programa nenhum: `Não informado` é o
   caso real e importante, com 9.978 dos 17.256 itens da base (57,8%). */
function piProgramaDaLabel(pi: string): string | null {
  const periods = piRules()?.piPeriods || {};
  return (periods[pi] && periods[pi].programa) || null;
}

/** Esconde do filtro de PI as opções de outro Programa. `Não informado` e
    qualquer PI sem correlação conhecida ficam SEMPRE à vista: eles existem nos
    dois programas, e sumir com eles tiraria a única forma de perguntar "o que
    está sem PI?". */
function sincronizarOpcoesDePi(): void {
  const wrap = document.getElementById('dd-PI');
  if(!wrap) return;
  const sel = selections['Programa'];
  wrap.querySelectorAll<HTMLElement>('.dd-item').forEach(item=>{
    const cb = item.querySelector<HTMLInputElement>('input[type=checkbox]');
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
function limparPisForaDoPrograma(): boolean {
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
function aplicarCorrelacaoDePi(): void {
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

function buildFilterBar(): void {
  // Antes de desenhar os checkboxes: assim o PI padrão da aba PI Tracking já
  // nasce marcado na barra, em vez de aparecer só no render seguinte. A barra é
  // reconstruída a cada lote da carga progressiva, e a função é idempotente.
  piSincronizarPiPadrao();
  const bar = document.getElementById('filterBar');
  if(!bar) throw new Error('Elemento #filterBar nao encontrado');
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
    let chipsSlot: HTMLDivElement | null = null;
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
      const displayVal = (f.key==='Mes') ? (MESES[parseInt(String(val),10)]||val) : val;
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
      list.querySelectorAll<HTMLElement>('.dd-item').forEach(it=>{
        it.style.display = (it.textContent || '').toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });
    list.addEventListener('click', e=>e.stopPropagation());
    list.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{
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
    actions.querySelector<HTMLButtonElement>('[data-act="all"]')?.addEventListener('click', (e)=>{
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
      list.querySelectorAll<HTMLInputElement>(alvo).forEach(cb=>{ cb.checked=true; selections[f.key].add(cb.value); });
      if(f.key==='PI') piPadraoAtivo = false;
      if(f.key==='Programa') aplicarCorrelacaoDePi();
      updateFilterBtn(f.key, btn); sincronizarChips(); renderAll();
    });
    actions.querySelector<HTMLButtonElement>('[data-act="none"]')?.addEventListener('click', (e)=>{
      e.stopPropagation();
      list.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>{ cb.checked=false; });
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
      if(!wrap) return;
      wrap.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>cb.checked=false);
      updateFilterBtn(f.key, wrap.querySelector('.dd-btn'));
    });
    sincronizarChipsDeTipo();
    // e o filtro de Squad da aba de Dependências, que vive na mesma barra
    depSquads.clear();
    const ddSquad = document.getElementById('dd-depSquad');
    if(ddSquad){
      ddSquad.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb=>cb.checked=false);
      atualizarBotaoDepSquad(ddSquad.querySelector('.dd-btn'));
    }
    // limpa também o intervalo de datas
    dateRange.from = null; dateRange.to = null;
    const df = document.getElementById('dateFrom') as HTMLInputElement | null;
    const dt = document.getElementById('dateTo') as HTMLInputElement | null;
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
function bindDropdownOutsideClick(): void {
  if(!filterDocumentHandlerBound){
    document.addEventListener('click', ()=>{
      document.querySelectorAll('.dd-panel.open').forEach(p=>p.classList.remove('open'));
    });
    filterDocumentHandlerBound = true;
  }
}

/* Controle de intervalo de datas (item 6) */
function buildDateFilter(bar: HTMLElement): void {
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

  const df = wrap.querySelector<HTMLInputElement>('#dateFrom');
  const dt = wrap.querySelector<HTMLInputElement>('#dateTo');
  if(!df || !dt) throw new Error('Campos do filtro de data nao encontrados');
  df.value = dateRange.from || '';
  dt.value = dateRange.to || '';
  df.addEventListener('change', ()=>{ dateRange.from = df.value || null; updateFilterSummary(); renderAll(); });
  dt.addEventListener('change', ()=>{ dateRange.to = dt.value || null; updateFilterSummary(); renderAll(); });
  wrap.querySelector<HTMLButtonElement>('[data-act="clear-date"]')?.addEventListener('click', ()=>{
    dateRange.from = null; dateRange.to = null; df.value=''; dt.value=''; updateFilterSummary(); renderAll();
  });
}
function updateFilterSummary(): void {
  const summary=document.getElementById('filterSummary');
  if(!summary) return;
  const selected=FILTER_DIMS.reduce((total,f)=>total+selections[f.key].size,0);
  const total=selected+depSquads.size+(dateRange.from||dateRange.to?1:0);
  summary.textContent=total?(total+' '+(total===1?'ativo':'ativos')):'Nenhum ativo';
  summary.classList.toggle('active',total>0);
}
function updateFilterBtn(key: string, btn: Element | null): void {
  if(!btn) return;
  const n = selections[key].size;
  const countEl = btn.querySelector<HTMLElement>('.count');
  if(!countEl) return;
  if(n>0){ countEl.style.display='inline-block'; countEl.textContent = String(n); }
  else { countEl.style.display='none'; }
  updateFilterSummary();
}

/** Aplica apenas os filtros da barra (Programa, Squad, PI, etc.), sem data. */
function matchesBarFilters(d: DashboardIssue, skip?: ReadonlySet<string> | null): boolean {
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
function getFilteredNoDate(skip?: ReadonlySet<string> | null): DashboardIssue[] {
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
function getFiltered(skip?: ReadonlySet<string> | null): DashboardIssue[] {
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
