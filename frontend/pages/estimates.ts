/* ===================== TAB: ESTIMATIVAS ===================== */
type EstimateDimension = 'Squad' | 'VS' | 'PI';
type EstimateGroupKey = string | undefined;
type EstimateComparisonRow = [EstimateGroupKey, number, number];
type SpTimeMetric = 'cycle' | 'lead';

interface PlannedVsCompleted {
  keys: EstimateGroupKey[];
  planned: number[];
  completed: number[];
}

interface SpTimeMeasure {
  rotulo: string;
  eixo: string;
  regra: string;
  valor: (issue: DashboardIssue) => number | null;
}

interface SpTimeGroup {
  sp: number;
  dias: number[];
  medidos: DashboardIssue[];
  total: number;
}

function renderSP(f: DashboardIssue[], atual: DashboardIssue[]): void {
  const sprintSelecionada = selections.Sprint.size>0;
  let concl: DashboardIssue[];
  let naoCancel: DashboardIssue[];
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
    const {porSprint} = atribuirEntregas(base, catalogo) as {porSprint: Map<string, DashboardIssue[]>};
    const entregues = new Map<string | undefined, DashboardIssue>();
    selections.Sprint.forEach((nome: string)=>(porSprint.get(nome)||[])
      .forEach((issue: DashboardIssue)=>entregues.set(issue.Chave, issue)));
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
  const kpis = document.getElementById('sp-kpis');
  if (!kpis) throw new Error('KPIs de Estimativas não encontrados.');
  kpis.innerHTML = [
    kpiCard('Story Points planejados', fmt0(spTotal), 'sp', '', null, null, 'sptab_plan'),
    kpiCard('Story Points concluídos', fmt0(spConcl), 'sp', '', null, null, 'sptab_concl'),
    kpiCard('% entregue', pct.toFixed(0), '%', pct>=70?'':'amber', null, null, 'sptab_pct'),
    kpiCard('Itens sem SP', fmt0(naoCancel.filter(d=>!d['Story Points']).length), 'itens', 'coral', null, null, 'sptab_nosp'),
  ].join('');

  function plannedVsCompleted(key: EstimateDimension): PlannedVsCompleted {
    const keys: EstimateGroupKey[] = Array.from(
      new Set<EstimateGroupKey>(naoCancel.map(d=>d[key] as EstimateGroupKey)),
    ).sort();
    const planned = keys.map(k=> sum(naoCancel.filter(d=>d[key]===k), d=>d['Story Points']));
    const completed = keys.map(k=> sum(concl.filter(d=>d[key]===k), d=>d['Story Points']));
    return {keys, planned, completed};
  }

  const bySquad = plannedVsCompleted('Squad');
  // sort by planned desc
  const orderSq: EstimateComparisonRow[] = bySquad.keys
    .map((k,i): EstimateComparisonRow=>[k,bySquad.planned[i],bySquad.completed[i]])
    .sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-sp-squad', {
    type:'bar',
    data:{labels:orderSq.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderSq.map(x=>x[1]), backgroundColor:'#F7C9DD', borderRadius:4},
      {label:'Concluído', data:orderSq.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}
    ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
      onClick: drillClick((idx: number, ds: number)=>{ const k=orderSq[idx][0];
        return ds===1 ? {title:`SP concluído · Squad: ${k}`, issues: concl.filter(d=>d.Squad===k)}
                      : {title:`SP planejado · Squad: ${k}`, issues: naoCancel.filter(d=>d.Squad===k)}; })}
  });

  const byVS = plannedVsCompleted('VS');
  const orderVs: EstimateComparisonRow[] = byVS.keys
    .map((k,i): EstimateComparisonRow=>[k,byVS.planned[i],byVS.completed[i]])
    .sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-sp-vs', {
    type:'bar',
    data:{labels:orderVs.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderVs.map(x=>x[1]), backgroundColor:'#CBD9F0', borderRadius:4},
      {label:'Concluído', data:orderVs.map(x=>x[2]), backgroundColor:'#0057B8', borderRadius:4}
    ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx: number, ds: number)=>{ const k=orderVs[idx][0];
        return ds===1 ? {title:`SP concluído · VS: ${k}`, issues: concl.filter(d=>d.VS===k)}
                      : {title:`SP planejado · VS: ${k}`, issues: naoCancel.filter(d=>d.VS===k)}; })}
  });

  const byPi = plannedVsCompleted('PI');
  const orderPi: EstimateComparisonRow[] = byPi.keys
    .map((k,i): EstimateComparisonRow=>[k,byPi.planned[i],byPi.completed[i]])
    .sort((a,b)=>String(a[0] ?? '').localeCompare(String(b[0] ?? '')));
  upsertChart('chart-sp-pi', {
    type:'bar',
    data:{labels:orderPi.map(x=>x[0]), datasets:[
      {label:'Planejado', data:orderPi.map(x=>x[1]), backgroundColor:'#E2E2E2', borderRadius:4},
      {label:'Concluído', data:orderPi.map(x=>x[2]), backgroundColor:'#CE0058', borderRadius:4}
    ]},
    options:{responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx: number, ds: number)=>{ const k=orderPi[idx][0];
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
      onClick: drillClick((idx: number)=>{ const m=months[idx];
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
const SP_REFERENCIA_COMITE: Record<number, number> = { 0.5: 1, 1: 1, 2: 2, 3: 3, 5: 5, 8: 8, 13: 15, 21: 20 };

/** Dias de referência de um tamanho. Fora da escala Fibonacci não há prazo — ver (a). */
function referenciaDoComite(sp: number): number {
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
const SP_TIME_MEASURES: Record<SpTimeMetric, SpTimeMeasure> = {
  cycle: {
    rotulo:'Cycle Time',
    eixo:'Cycle Time (dias)',
    regra:'da Data de Início Real à Data de Fim Real',
    valor:(d: DashboardIssue)=>(d.CycleTimeDias==null ? null : Number(d.CycleTimeDias)),
  },
  lead: {
    rotulo:'Lead Time',
    eixo:'Lead Time (dias)',
    regra:'da criação à conclusão, incluindo o tempo de fila antes do início',
    valor:(d: DashboardIssue)=>(d.LeadTimeDias==null ? null : Number(d.LeadTimeDias)),
  },
};

/* Medida escolhida no seletor, e a base do último render. Ambas vivem fora do
   render porque trocar de medida não deve refazer o recorte da aba — em modo
   Sprint isso significaria rodar `atribuirEntregas` de novo. */
let spTimeMetric: SpTimeMetric = 'cycle';
let __spTimeBase: DashboardIssue[] = [];

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. */
(function ligarSeletorDeTempoPorSP(){
  const el = document.getElementById('spTimeMetric') as HTMLSelectElement | null;
  if(!el) return;
  el.addEventListener('change', ()=>{
    if (el.value === 'cycle' || el.value === 'lead') spTimeMetric = el.value;
    renderSpTempoPorSP(__spTimeBase);
  });
})();

/**
 * Um balde por valor de Story Point. `medidos` são os itens que TÊM a medida —
 * é sobre eles que a média é calculada, e é essa lista que o drill abre, para
 * que o número da tabela e o do drawer sejam sempre o mesmo.
 */
function agregarTempoPorSP(
  base: DashboardIssue[],
  valor: (issue: DashboardIssue) => number | null,
): SpTimeGroup[] {
  const porSp = new Map<number, SpTimeGroup>();
  base.forEach(d=>{
    const sp = Number(d['Story Points']);
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
function spLabel(sp: number): string {
  return Number(sp).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Nível de trabalho do item, para a legenda declarar a composição do recorte.
 * Não recorta nada — só nomeia, porque misturar níveis é permitido (ver
 * decisão 2) desde que quem lê saiba que aconteceu.
 */
function nivelDoItem(d: DashboardIssue): string {
  const grupo = d['Tipo Agrupado'];
  if(grupo === 'Sub-task') return 'sub-itens';
  if(grupo === 'Épico') return 'épicos';
  return 'itens de entrega';
}

function renderSpTempoPorSP(base: DashboardIssue[]): void {
  if(!document.getElementById('chart-sp-time')) return;
  const caption = document.getElementById('sp-time-caption');
  const tbody = document.querySelector<HTMLTableSectionElement>('#sp-time-table tbody');
  const medida = SP_TIME_MEASURES[spTimeMetric];

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
      sp:g.sp, n:g.medidos.length, media:mean(g.dias) ?? 0, p85:percentile(g.dias,85) ?? 0,
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
  const porNivel = new Map<string, number>();
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
  document.querySelectorAll<HTMLElement>('#sp-time-table .sp-time-ref-col')
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

  const series: Array<Record<string, any>> = [
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
        title:(items: any[])=>{ const l = items.length && linhas[items[0].dataIndex];
          return l ? spLabel(l.sp)+' Story Points · '+medida.rotulo : ''; },
        label:(item: any)=>{
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
        afterBody:(items: any[])=>{
          const l = items.length && linhas[items[0].dataIndex];
          if(!l) return '';
          return [statusTimePlural(l.n,'item medido','itens medidos'),
            'Amplitude: '+fmt1(l.min)+' a '+fmt1(l.max)+' dias'];
        }
      }}},
      onClick: drillClick((idx: number)=>{ const l = linhas[idx];
        return l ? {title:`${medida.rotulo} · ${spLabel(l.sp)} SP`, issues:l.issues} : null; })}
  });
}
