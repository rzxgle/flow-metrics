/* ===================== TAB: LEAD & CYCLE TIME ===================== */
type FlowPhase = 'Pendente' | 'Em andamento' | 'Concluído' | 'Cancelado';
type StatusTimeMetric = 'media-todos' | 'p85-passou';
type FlowCountRow = [string, number];
type FlowSquadRow = [string, number, number];

interface HistogramResult {
  labels: string[];
  counts: number[];
  binSize: number;
}

interface FlowStatistics {
  n: number;
  mean: number | null;
  median: number | null;
  p85: number | null;
  min: number | null;
  max: number | null;
}

interface StatusTimeBucket {
  status: string;
  dias: number[];
  visitas: number;
  parados: number;
  issues: DashboardIssue[];
}

interface StatusTimeBar {
  status: string;
  fase: FlowPhase;
  issues: DashboardIssue[];
  n: number;
  parados: number;
  nunca: number;
  visitasMedias: number;
  mediaTodos: number;
  mediaPassou: number;
  p85Passou: number;
  valor: number;
}

interface StatusTimeMeasure {
  rotulo: string;
  valor: (bar: Omit<StatusTimeBar, 'valor'>) => number;
}

function histogramBins(arr: number[], nbins: number): HistogramResult {
  if(!arr.length) return {labels:[],counts:[],binSize:1};
  const max = Math.max(...arr);
  const binSize = Math.max(1, Math.ceil((max||1)/nbins));
  const bins = new Array(Math.ceil((max+1)/binSize)).fill(0);
  arr.forEach(v=>{ const idx = Math.min(bins.length-1, Math.floor(v/binSize)); bins[idx]++; });
  const labels = bins.map((_,i)=> `${i*binSize}-${(i+1)*binSize-1}d`);
  return {labels, counts:bins, binSize};
}
function statBlock(vals: number[]): FlowStatistics {
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
const STATUS_TIME_PHASE_ORDER: FlowPhase[] = ['Pendente','Em andamento','Concluído','Cancelado'];
/* Mesma leitura de cor do badge do drawer (cinza = espera, azul = andamento,
   verde = concluído, rosa = cancelado), em tons cheios porque aqui é
   preenchimento de barra e não fundo de etiqueta. */
const STATUS_TIME_PHASE_COLOR: Record<FlowPhase, string> = {
  'Pendente':'#A1A1AA', 'Em andamento':'#0057B8', 'Concluído':'#16A34A', 'Cancelado':'#BE123C',
};

/* Fase de fluxo de um STATUS. O drawer resolve a fase de um ITEM (que já vem
   calculada do backend em `FaseFluxo`); aqui a pergunta é sobre o status em si.
   Usa as listas que chegam em `meta` — nunca casamento por pedaço de nome, que é
   a decisão travada em test/drawer-status.spec.js. O default "Em andamento"
   repete o backend: status fora de todas as listas nunca fica sem fase. */
function faseDoStatus(status: unknown): FlowPhase {
  if(piInList(status, window.__RULES_CANCELLED)) return 'Cancelado';
  if(piInList(status, window.__RULES_DONE)) return 'Concluído';
  if(piInList(status, window.__RULES_PENDING)) return 'Pendente';
  return 'Em andamento';
}

/* As medidas disponíveis, com o rótulo que aparece no seletor, no eixo e na
   primeira linha do tooltip — os três precisam dizer a MESMA coisa, porque é a
   troca silenciosa de denominador que confunde a leitura. */
const STATUS_TIME_MEASURES: Record<StatusTimeMetric, StatusTimeMeasure> = {
  'media-todos': {
    rotulo: 'Média por item concluído',
    valor: (b: Omit<StatusTimeBar, 'valor'>)=>b.mediaTodos,
  },
  'p85-passou': {
    rotulo: 'P85 de quem passou',
    valor: (b: Omit<StatusTimeBar, 'valor'>)=>b.p85Passou,
  },
};

/* Medida escolhida no seletor do card. Vive fora do render porque trocar de
   medida não deve depender de um novo carregamento de dados. */
let statusTimeMetric: StatusTimeMetric = 'media-todos';

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeMedida(){
  const el = document.getElementById('statusTimeMetric') as HTMLSelectElement | null;
  if(!el) return;
  el.addEventListener('change', ()=>{
    if (el.value === 'media-todos' || el.value === 'p85-passou') statusTimeMetric = el.value;
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
function agregarTempoPorStatus(base: DashboardIssue[]): {
  comHistorico: DashboardIssue[];
  porStatus: Map<string, StatusTimeBucket>;
} {
  const comHistorico = base.filter(d=>(d.TempoPorStatus||[]).length);
  const porStatus = new Map<string, StatusTimeBucket>();
  const balde = (nome: string): StatusTimeBucket=>{
    const acc = porStatus.get(nome) || {status:nome, dias:[], visitas:0, parados:0, issues:[]};
    porStatus.set(nome, acc);
    return acc;
  };
  comHistorico.forEach(d=>{
    const visitados = new Set<string>();
    (d.TempoPorStatus||[]).forEach(p=>{
      const nome = p && p.status && String(p.status).trim();
      if(!nome || !(p.dias>0)) return;
      visitados.add(nome);
      const acc = balde(nome);
      acc.dias.push(Number(p.dias));
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
function statusTimePlural(n: number, singular: string, plural: string): string {
  return fmt0(n)+' '+(n===1 ? singular : plural);
}

function renderTempoPorStatus(base: DashboardIssue[]): void {
  if(!document.getElementById('chart-flow-status-time')) return;
  const caption = document.getElementById('status-time-caption');

  const medida = STATUS_TIME_MEASURES[statusTimeMetric];
  const concluidos = base.filter(d=>d.Concluido);
  const agregado = agregarTempoPorStatus(concluidos);
  const comHistorico = agregado.comHistorico;

  // Sem status selecionado, mostra todos os percorridos; com seleção, ela é a
  // lista de barras. Comparação normalizada, igual ao resto do painel.
  const selecionados = selections['Status'];
  const querStatus = (nome: string): boolean=> selecionados.size===0
    || Array.from(selecionados).some(sel=>piNorm(sel)===piNorm(nome));

  const barras: StatusTimeBar[] = Array.from(agregado.porStatus.values())
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
        mediaPassou: mean(x.dias) ?? 0,
        p85Passou: percentile(x.dias,85) ?? 0,
      };
    })
    .map((b): StatusTimeBar=>Object.assign({}, b, {valor: medida.valor(b)}))
    .filter(b=>b.valor>0)
    .sort((a,b)=> STATUS_TIME_PHASE_ORDER.indexOf(a.fase)-STATUS_TIME_PHASE_ORDER.indexOf(b.fase)
      || b.valor-a.valor);

  const semCronologia = comHistorico.filter(d=>d.StatusHistoricoOk===false).length;
  const semHistorico = concluidos.length - comHistorico.length;

  if(caption){
    const partes: string[] = [];
    partes.push('<b>Base:</b> '+fmt0(comHistorico.length)+' de '+fmt0(concluidos.length)
      +' itens concluídos do recorte têm histórico de status recuperável'
      +(semHistorico>0 ? ' ('+fmt0(semHistorico)+' sem changelog ficam fora)' : '')+'.');
    if(statusTimeMetric==='media-todos'){
      const somaBarras = sum(barras, b=>b.valor);
      const leadMedio = mean(comHistorico.filter(d=>d.LeadTimeDias!=null).map(d=>Number(d.LeadTimeDias)));
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
        title:(items: any[])=>{ const b = items.length && barras[items[0].dataIndex];
          return b ? b.status+' · '+b.fase : ''; },
        label:(item: any)=>{
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
          const grupos: string[] = [];
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
      onClick: drillClick((idx: number)=>{ const b=barras[idx]; if(!b) return null;
        return {title:'Tempo em "'+b.status+'" · '+fmt0(b.n)+' itens que passaram', issues:b.issues}; })}
  });
}

/* A COR DA MEDIDA nesta aba. Não é decoração: os dois histogramas do topo e o
   card de Value Stream já usavam rosa para Lead Time e âmbar para Cycle Time, e
   era uma convenção repetida à mão em quatro lugares. Agora que os cards de
   tendência e de squad TROCAM de medida, a cor precisa trocar junto — barra
   rosa mostrando Cycle Time anunciaria a régua errada para quem lê de longe.
   Os literais são os mesmos de antes; o que mudou é haver um lugar só. */
const FLOW_MEASURE_COLOR: Record<SpTimeMetric, string> = { lead:'#CE0058', cycle:'#D98E3B' };

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
const FLOW_TREND_DEFAULT: SpTimeMetric = 'lead';
/* Janela da média móvel, em meses. Três é o mesmo da evolução mensal de SP —
   o painel não deve ter duas ideias diferentes de "tendência". */
const FLOW_TREND_JANELA = 3;
let flowTrendMetric: SpTimeMetric = FLOW_TREND_DEFAULT;

/* Base do último render. Vive fora dele porque trocar de medida não deve
   refazer o recorte da aba — mesma decisão do seletor de Tempo por Story Point. */
let __flowTrendBase: DashboardIssue[] = [];

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeTendencia(){
  const el = document.getElementById('flowTrendMetric') as HTMLSelectElement | null;
  if(!el) return;
  el.addEventListener('change', ()=>{
    if (el.value === 'lead' || el.value === 'cycle') flowTrendMetric = el.value;
    renderTendenciaMensalTempo(__flowTrendBase);
  });
})();

function renderTendenciaMensalTempo(base: DashboardIssue[]): void {
  if(!document.getElementById('chart-flow-lead-trend')) return;
  __flowTrendBase = base || [];
  const medida = SP_TIME_MEASURES[flowTrendMetric];

  const concl = __flowTrendBase.filter(d=>d.Concluido);
  // Item sem a data que a medida exige fica de FORA, e não entra como zero dia:
  // zero puxaria o P85 do mês para baixo como se a entrega tivesse sido
  // instantânea, quando o que houve foi ausência de registro.
  const medidos = concl.filter(d=>medida.valor(d)!=null);
  const months = sortedMonthKeys(medidos, 'AnoMesConclusao');
  const doMes = (month: string): DashboardIssue[]=> medidos.filter(d=>d.AnoMesConclusao===month);
  const serie = months.map(month=> percentile(
    doMes(month).map(d=>medida.valor(d) ?? 0),
    85,
  ) ?? 0);

  /* Média móvel dos P85, com janela TRASEIRA e PARCIAL no começo — o primeiro
     mês é ele mesmo, o segundo é a média de dois. É a mesma conta do gráfico de
     SP mensal, e a escolha importa: uma janela que só começa no terceiro mês
     deixaria a linha nascer no meio do gráfico, e num recorte de 3 ou 4 meses
     (o padrão da tela) sobraria quase nada dela. */
  const tendencia = serie.map((_,i)=> mean(serie.slice(Math.max(0,i-(FLOW_TREND_JANELA-1)), i+1)) ?? 0);

  upsertChart('chart-flow-lead-trend', {
    type:'bar',
    data:{labels:months.map(monthLabel), datasets:[
      {type:'bar', label:medida.rotulo+' P85 (dias)', data:serie, backgroundColor:FLOW_MEASURE_COLOR[flowTrendMetric], borderRadius:4, order:2},
      {type:'line', label:`Tendência (méd. móvel ${FLOW_TREND_JANELA}m)`, data:tendencia, borderColor:'#333333', backgroundColor:'#333333', tension:.3, pointRadius:2, order:1},
    ]},
    options:{responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1',
      layout:{padding:{top:22}}, plugins:{legend:{display:true},
        tooltip:{callbacks:{afterLabel:(ctx: any)=>(ctx.datasetIndex===0
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
      onClick: drillClick((idx: number, ds: number)=>{
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
const FLOW_SQUAD_DEFAULT: SpTimeMetric = 'lead';
let flowSquadMetric: SpTimeMetric = FLOW_SQUAD_DEFAULT;
let __flowSquadBase: DashboardIssue[] = [];

/* Quantas squads o ranking mostra. Vive nomeado porque o número aparece também
   na legenda, e os dois têm de dizer a mesma coisa. */
const FLOW_SQUAD_TOP = 12;

/* O <select> está no HTML estático, então é ligado uma vez só, aqui. Trocar a
   medida redesenha apenas este gráfico — nada é buscado de novo. */
(function ligarSeletorDeSquad(){
  const el = document.getElementById('flowSquadMetric') as HTMLSelectElement | null;
  if(!el) return;
  el.addEventListener('change', ()=>{
    if (el.value === 'lead' || el.value === 'cycle') flowSquadMetric = el.value;
    renderTempoP85PorSquad(__flowSquadBase);
  });
})();

function renderTempoP85PorSquad(base: DashboardIssue[]): void {
  if(!document.getElementById('chart-flow-lead-squad')) return;
  __flowSquadBase = base || [];
  const medida = SP_TIME_MEASURES[flowSquadMetric];

  const concl = __flowSquadBase.filter(d=>d.Concluido);
  // Item sem a data que a medida exige fica de FORA, não entra como zero dia —
  // mesma regra do card ao lado, e aqui ela também decide o RANKING.
  const medidos = concl.filter(d=>medida.valor(d)!=null);
  const porSquad: FlowSquadRow[] = Array.from(
    groupBy(medidos, d=>String(d.Squad ?? '')),
    ([squad, issues]): FlowSquadRow=>[
      squad,
      percentile(issues.map(d=>medida.valor(d) ?? 0),85) ?? 0,
      issues.length,
    ],
  );
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
      onClick: drillClick((idx: number)=>{ const k=ranking[idx][0];
        return {title:`${medida.rotulo} · Squad: ${k}`, issues: medidos.filter(d=>String(d.Squad ?? '')===k)}; })}
  });

  const cap = document.getElementById('flow-squad-caption');
  if(!cap) return;
  if(!concl.length){ cap.textContent = 'Sem itens concluídos no recorte.'; return; }
  /* O recorte do ranking é declarado AQUI porque saiu do título — e as duas
     redações não são intercambiáveis: dizer "as 12 squads com mais itens
     medidos" quando só existem 5 no recorte anunciaria um corte que não houve. */
  const fora = porSquad.length - ranking.length;
  let recorte: string;
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

function renderFlow(f: DashboardIssue[], semRecorteDeStatus?: DashboardIssue[]): void {
  const concl = f.filter(d=>d.Concluido);
  const leadItems = concl.filter(d=>d.LeadTimeDias!=null);
  const cycleItems = concl.filter(d=>d.CycleTimeDias!=null);
  const leadVals = leadItems.map(d=>Number(d.LeadTimeDias));
  const cycleVals = cycleItems.map(d=>Number(d.CycleTimeDias));
  const lead = statBlock(leadVals), cycle = statBlock(cycleVals);

  const coverage = document.querySelector<HTMLElement>('#flow-coverage-callout div');
  if (!coverage) throw new Error('Cobertura de Lead & Cycle Time não encontrada.');
  coverage.innerHTML =
    `<b>Cobertura de dados no recorte atual:</b> Lead Time calculável para ${lead.n} de ${concl.length} itens concluídos
    (${concl.length? (lead.n/concl.length*100).toFixed(0):0}%). Cycle Time calculável para ${cycle.n} de ${concl.length}
    (${concl.length? (cycle.n/concl.length*100).toFixed(0):0}%) — cobertura menor pois depende de "Data de início real" e "Data de fim real" preenchidas.`;

  Object.assign(__cardDrills, {
    flow_lead: {title:'Itens com Lead Time (concluídos)', issues: leadItems},
    flow_cycle: {title:'Itens com Cycle Time', issues: cycleItems},
  });
  const leadKpis = document.getElementById('lead-kpis');
  if (!leadKpis) throw new Error('KPIs de Lead Time não encontrados.');
  leadKpis.innerHTML = [
    kpiCard('Lead Time (P85)', fmt1(lead.p85), 'dias', 'amber', null, null, 'flow_lead'),
    kpiCard('Itens considerados', fmt0(lead.n), '', '', null, null, 'flow_lead'),
  ].join('');
  const cycleKpis = document.getElementById('cycle-kpis');
  if (!cycleKpis) throw new Error('KPIs de Cycle Time não encontrados.');
  cycleKpis.innerHTML = [
    kpiCard('Cycle Time (P85)', fmt1(cycle.p85), 'dias', 'amber', null, null, 'flow_cycle'),
    kpiCard('Itens considerados', fmt0(cycle.n), '', '', null, null, 'flow_cycle'),
  ].join('');

  const leadHist = histogramBins(leadVals, 12);
  upsertChart('chart-flow-lead-hist', {
    type:'bar',
    data:{labels:leadHist.labels, datasets:[{data:leadHist.counts, backgroundColor:FLOW_MEASURE_COLOR.lead, borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, x:{grid:{display:false}, ticks:{font:{size:9}}, title:{display:true, text:'Faixas de dias'}}},
      onClick: drillClick((idx: number)=>{ const bs=leadHist.binSize, lo=idx*bs, hi=(idx+1)*bs, last=idx===leadHist.counts.length-1;
        return {title:`Lead Time ${leadHist.labels[idx]}`, issues: leadItems.filter(d=> Number(d.LeadTimeDias)>=lo && (last || Number(d.LeadTimeDias)<hi))}; })}
  });
  const cycleHist = histogramBins(cycleVals, 12);
  upsertChart('chart-flow-cycle-hist', {
    type:'bar',
    data:{labels:cycleHist.labels, datasets:[{data:cycleHist.counts, backgroundColor:FLOW_MEASURE_COLOR.cycle, borderRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, layout:{padding:{top:20}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Nº de itens'}}, x:{grid:{display:false}, ticks:{font:{size:9}}, title:{display:true, text:'Faixas de dias'}}},
      onClick: drillClick((idx: number)=>{ const bs=cycleHist.binSize, lo=idx*bs, hi=(idx+1)*bs, last=idx===cycleHist.counts.length-1;
        return {title:`Cycle Time ${cycleHist.labels[idx]}`, issues: cycleItems.filter(d=> Number(d.CycleTimeDias)>=lo && (last || Number(d.CycleTimeDias)<hi))}; })}
  });

  renderTendenciaMensalTempo(f);

  renderTempoP85PorSquad(f);

  const vsCycle: FlowSquadRow[] = Array.from(
    groupBy(concl.filter(d=>d.CycleTimeDias!=null), d=>String(d.VS ?? '')),
    ([vs, issues]): FlowSquadRow=>[vs, percentile(issues.map(d=>Number(d.CycleTimeDias)),85) ?? 0, issues.length],
  )
    .sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-flow-cycle-vs', {
    type:'bar',
    data:{labels:vsCycle.map(x=>x[0]), datasets:[{label:'Cycle Time P85 (dias)', data:vsCycle.map(x=>x[1].toFixed(1)), backgroundColor:FLOW_MEASURE_COLOR.cycle, borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, barLabels:true, barLabelFmt:'d1', layout:{padding:{top:18}}, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#ECECEC'}, title:{display:true, text:'Dias'}}, x:{grid:{display:false}}},
      onClick: drillClick((idx: number)=>{ const k=vsCycle[idx][0];
        return {title:`Cycle Time · VS: ${k}`, issues: cycleItems.filter(d=>String(d.VS ?? '')===k)}; })}
  });

  // Recebe a base SEM o recorte de Status: ali o filtro escolhe barras, não itens.
  renderTempoPorStatus(semRecorteDeStatus || f);
}

/* ===================== Bloco: Itens cancelados ===================== */
/* Recebe o recorte de estado atual (sem filtro de data): cancelamento não gera
   data de conclusão, então numerador e denominador vêm da mesma base. */
function renderCancelados(atual: DashboardIssue[]): void {
  const canc = atual.filter(d=>d.Cancelado);
  const totalItens = atual.length || 1;
  const pct = (canc.length/totalItens*100);

  Object.assign(__cardDrills, {
    cancel_total: {title:'Itens cancelados do recorte', issues: canc},
  });
  const cancelKpis = document.getElementById('cancel-kpis');
  if (!cancelKpis) throw new Error('KPIs de cancelados não encontrados.');
  cancelKpis.innerHTML = [
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
      onClick: drillClick((idx: number)=> __cardDrills['cancel_m_'+idx])}
  });

  // Por squad
  const bySquad: FlowCountRow[] = Array.from(
    groupBy(canc, d=>String(d.Squad ?? '')),
    ([squad, issues]): FlowCountRow=>[squad,issues.length],
  ).sort((a,b)=>b[1]-a[1]);
  upsertChart('chart-cancel-squad', {
    type:'bar',
    data:{labels:bySquad.map(x=>x[0]), datasets:[{data:bySquad.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, layout:{padding:{right:70}}, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=bySquad[idx][0]; return {title:`Cancelados · Squad: ${k}`, issues: canc.filter(d=>String(d.Squad ?? '')===k)}; })}
  });

  // Por tipo desagrupado (regra dos 5: donut se <=5, senão barra)
  const byTipo: FlowCountRow[] = Array.from(
    groupBy(canc, d=>String(d['Tipo de item'] || '(sem tipo)')),
    ([type, issues]): FlowCountRow=>[type,issues.length],
  ).sort((a,b)=>b[1]-a[1]);
  if(byTipo.length<=5){
    upsertChart('chart-cancel-tipo', {
      type:'doughnut',
      data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:byTipo.map((x,i)=>COLORS[i%COLORS.length]), borderWidth:2, borderColor:'#fff'}]},
      options:Object.assign(donutPctOptions({cutout:'55%'}), {
        onClick: drillClick((idx: number)=>{ const k=byTipo[idx][0]; return {title:`Cancelados · Tipo: ${k}`, issues: canc.filter(d=>(d['Tipo de item']||'(sem tipo)')===k)}; })
      })
    });
  } else {
    upsertChart('chart-cancel-tipo', {
      type:'bar',
      data:{labels:byTipo.map(x=>x[0]), datasets:[{data:byTipo.map(x=>x[1]), backgroundColor:'#D64545', borderRadius:4}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, barPct:true, layout:{padding:{right:56}}, plugins:{legend:{display:false}, tooltip:tooltipPct}, scales:{x:{beginAtZero:true, grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:10}}}},
        onClick: drillClick((idx: number)=>{ const k=byTipo[idx][0]; return {title:`Cancelados · Tipo: ${k}`, issues: canc.filter(d=>(d['Tipo de item']||'(sem tipo)')===k)}; })}
    });
  }
}
function heatColor(v: number, max: number): string {
  if(max<=0 || v<=0) return '#F5F5F5';
  const t = Math.min(1, v/max);
  // interpola do rosa claro (#FBE0EC) ao rosa Afya (#CE0058)
  const r1=251,g1=224,b1=236, r2=206,g2=0,b2=88;
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}
function renderRank(f: DashboardIssue[]): void {
  const concl = f.filter(d=>d.Concluido);

  const squadRank: FlowCountRow[] = Array.from(
    groupBy(concl, d=>String(d.Squad ?? '')),
    ([squad, issues]): FlowCountRow=>[squad,issues.length],
  ).sort((a,b)=>a[1]-b[1]);
  upsertChart('chart-rank-squad', {
    type:'bar',
    data:{labels:squadRank.map(x=>x[0]), datasets:[{data:squadRank.map(x=>x[1]), backgroundColor:'#CE0058', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}, ticks:{font:{size:9.5}}}},
      onClick: drillClick((idx: number)=>{ const k=squadRank[idx][0]; return {title:`Concluídos · Squad: ${k}`, issues: concl.filter(d=>String(d.Squad ?? '')===k)}; })}
  });
  const vsRank: FlowCountRow[] = Array.from(
    groupBy(concl, d=>String(d.VS ?? '')),
    ([vs, issues]): FlowCountRow=>[vs,issues.length],
  ).sort((a,b)=>a[1]-b[1]);
  upsertChart('chart-rank-vs', {
    type:'bar',
    data:{labels:vsRank.map(x=>x[0]), datasets:[{data:vsRank.map(x=>x[1]), backgroundColor:'#D98E3B', borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#ECECEC'}}, y:{grid:{display:false}}},
      onClick: drillClick((idx: number)=>{ const k=vsRank[idx][0]; return {title:`Concluídos · VS: ${k}`, issues: concl.filter(d=>String(d.VS ?? '')===k)}; })}
  });

  // Heatmap Squad x Mês — ordenado por quem entrega MAIS (item 14)
  const months = sortedMonthKeys(concl, 'AnoMesConclusao');
  const totalBySquad: FlowCountRow[] = Array.from(
    groupBy(concl, d=>String(d.Squad ?? '')),
    ([squad, issues]): FlowCountRow=>[squad,issues.length],
  );
  const squads = totalBySquad.sort((a,b)=>b[1]-a[1]).map(x=>x[0]); // desc: mais entregas no topo
  const matrix = squads.map(sq=> months.map(m=> concl.filter(d=>String(d.Squad ?? '')===sq && d.AnoMesConclusao===m).length));
  const maxVal = Math.max(1, ...matrix.flat());

  // registra cada célula (squad+mês) como drill
  squads.forEach((sq,i)=> months.forEach((m,j)=>{
    __cardDrills[`heat_${i}_${j}`] = {title:`Concluídos · ${sq} · ${monthLabel(m)}`, issues: concl.filter(d=>String(d.Squad ?? '')===sq && d.AnoMesConclusao===m)};
  }));

  let html = '<table class="heat-table"><thead><tr><th>Squad</th>' + months.map(m=>`<th>${monthLabel(m)}</th>`).join('') + '</tr></thead><tbody>';
  squads.forEach((sq,i)=>{
    html += `<tr><td data-help="Squad: ${escapeHtml(String(sq))}">${sq}</td>` + matrix[i].map((v,j)=>`<td><div class="heat-cell" ${v?`data-drill="heat_${i}_${j}"`:''} style="background:${heatColor(v,maxVal)};color:${v/maxVal>0.55?'#fff':'#333333'};">${v||''}</div></td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  const heatmap = document.getElementById('heatmap-container');
  if (!heatmap) throw new Error('Heatmap de squads não encontrado.');
  heatmap.innerHTML = months.length && squads.length ? html : '<div class="cap">Sem dados suficientes para montar o heatmap no recorte atual.</div>';

  // Tabela consolidada (ordenada por throughput desc) — linhas clicáveis
  const allSquads = Array.from(new Set(f.map(d=>String(d.Squad ?? '')))).sort();
  const rows = allSquads.map(sq=>{
    const items = f.filter(d=>String(d.Squad ?? '')===sq);
    const conclItems = items.filter(d=>d.Concluido);
    const vs = items[0] ? items[0].VS : '';
    const spConcl = sum(conclItems, d=>d['Story Points']);
    const wipN = items.filter(d=>d.WIP).length;
    const leadArr = conclItems.filter(d=>d.LeadTimeDias!=null).map(d=>Number(d.LeadTimeDias));
    const ativosN = items.filter(d=>!d.Cancelado).length;
    const pct = ativosN? (conclItems.length/ativosN*100):0;
    return {sq, vs, throughput:conclItems.length, spConcl, wipN, leadMean:mean(leadArr), pct};
  }).sort((a,b)=>b.throughput-a.throughput);

  rows.forEach(r=>{ __cardDrills['ranksq_'+r.sq] = {title:`Squad: ${r.sq} — todos os itens`, issues: f.filter(d=>String(d.Squad ?? '')===r.sq)}; });
  const rankTable = document.querySelector<HTMLTableSectionElement>('#rank-table tbody');
  if (!rankTable) throw new Error('Tabela consolidada de squads não encontrada.');
  rankTable.innerHTML = rows.map(r=>`
    <tr data-drill="ranksq_${r.sq}" style="cursor:pointer;" data-help="Clique para abrir as issues desta squad."><td>${r.sq}</td><td style="font-size:11.5px;color:var(--slate-soft);">${r.vs}</td>
    <td><b>${r.throughput}</b></td><td>${fmt0(r.spConcl)}</td><td>${r.wipN}</td>
    <td>${fmt1(r.leadMean)}</td>
    <td><span class="badge ${r.pct>=70?'ok':r.pct>=40?'warn':'risk'}">${r.pct.toFixed(0)}%</span></td></tr>`).join('');
}
