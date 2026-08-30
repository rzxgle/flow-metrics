// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
'use strict';

/**
 * Testes dos DOIS cards agnósticos à medida da aba Lead & Cycle Time — a
 * "Tendência mensal do tempo (P85, em dias)" e o "Tempo P85 por Squad" —, com o
 * script real da página rodando dentro do jsdom.
 *
 * Os dois eram fixos em Lead Time e ganharam um seletor de medida, como o de
 * Tempo por Story Point. Cinco decisões, comuns aos dois, podem quebrar sem que
 * nada dê erro na tela — o gráfico simplesmente mostraria outro número —, e é
 * por isso que cada uma tem teste próprio:
 *
 *   1. AS RÉGUAS SÃO AS MESMAS DO RESTO DO PAINEL. Os cards reaproveitam
 *      SP_TIME_MEASURES em vez de declarar as suas: uma segunda definição de
 *      "Cycle Time" divergiria em silêncio no dia em que uma das duas mudasse.
 *      O teste trava a ORIGEM das medidas, não só o número que elas dão hoje.
 *
 *   2. O PADRÃO É O LEAD TIME — ao contrário do card de Estimativas, que abre
 *      no Cycle Time. É a medida que os dois sempre mostraram, e trocar o
 *      padrão mudaria o que o time lê hoje sem ninguém ter pedido. Os dois
 *      seletores são INDEPENDENTES de propósito: ver a tendência em Lead Time
 *      e o ranking de squads em Cycle Time é leitura legítima.
 *
 *   3. O NÚMERO É O P85, e na tendência o mês é o da CONCLUSÃO nas duas
 *      medidas. Trocar o P85 por média, ou posicionar o Cycle Time pelo mês de
 *      início, dá números plausíveis e errados — por isso os dois são fixados
 *      com uma base pequena e conferível à mão.
 *
 *   4. ITEM SEM A DATA QUE A MEDIDA EXIGE FICA DE FORA, NÃO ENTRA COMO ZERO.
 *      Zero dia puxaria o número para baixo como se a entrega tivesse sido
 *      instantânea, quando o que houve foi ausência de registro. Isso decide o
 *      que APARECE: um mês inteiro sem início real preenchido não vira ponto
 *      vazio no meio da linha, e no ranking o "top 12 por volume" conta itens
 *      MEDIDOS, então trocar de régua pode trocar as squads da tela.
 *
 *   5. O DRILL ABRE EXATAMENTE OS ITENS QUE FORMARAM O NÚMERO. Com Cycle Time,
 *      "concluídos" e "medidos" são conjuntos bem diferentes (na base, 4.663
 *      itens com Cycle Time contra 9.151 com Lead Time), e a lista precisa
 *      fechar com a barra ou o ponto.
 *
 * A legenda de cada card declara a cobertura pelo mesmo motivo: ao trocar de
 * régua a linha pode ENCURTAR e o ranking pode perder squads por falta de
 * preenchimento, o que sem aviso se lê como queda de entrega.
 *
 * No ranking há ainda uma decisão só dele: A COR DA BARRA SEGUE A MEDIDA (rosa
 * para Lead, âmbar para Cycle, a convenção já usada pelos histogramas do topo e
 * pelo card de Value Stream). Um ranking é lido de longe, e cor errada anuncia
 * régua errada — por isso ela sai de FLOW_MEASURE_COLOR, e não de um literal.
 *
 * jsdom porque o objeto do teste é o que a tela produz. Sem rede: DATA
 * sintética, Chart e canvas são stubs que capturam a configuração recebida.
 *
 * Rode com:  npm run test:flow-medidas
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rules = require('../src/config/classification.rules');

/* ---------- boot da página real dentro do jsdom ---------- */
const loadDashboardHtml = require('./support/dashboardHtml');
const html = loadDashboardHtml();
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

const erros = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => erros.push(e.message));

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole });
const { window } = dom;
const { document } = window;

const charts = {};
const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub {
  constructor(ctx, config) {
    charts[ctx && ctx.canvas ? ctx.canvas.id : '?'] = config;
  }

  destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

window.__RULES_PENDING = rules.pendingStatuses;
window.__RULES_INPROG = rules.inProgressStatuses;
window.__RULES_DONE = rules.doneStatuses;
window.__RULES_CANCELLED = rules.cancelledStatuses;

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  get DATA(){ return DATA; },
  selections, SP_TIME_MEASURES, FLOW_MEASURE_COLOR, renderFlow, barLabelsPlugin,
  renderTendenciaMensalTempo, FLOW_TREND_DEFAULT, FLOW_TREND_JANELA,
  renderTempoP85PorSquad, FLOW_SQUAD_DEFAULT, FLOW_SQUAD_TOP,
  get flowTrendMetric(){ return flowTrendMetric; },
  get flowSquadMetric(){ return flowSquadMetric; },
  // A base do último render fica guardada para o seletor poder redesenhar sem
  // refazer o recorte da aba. O render a escreve; o teste lê para conferir que
  // trocar de medida não depende de um novo recorte.
  get flowTrendBase(){ return __flowTrendBase; },
  set openDrawer(v){ openDrawer = v; },
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética ---------- */
let seq = 0;
/**
 * Item concluído no mês `mes`. `lead` e `cycle` são os dois tempos em dias;
 * passar `null` em qualquer um simula a data manual não preenchida, que é o
 * caso real que separa a cobertura das duas medidas.
 */
const item = (mes, lead, cycle, over = {}) => {
  seq += 1;
  return {
    Chave: `TESTE-${seq}`, Resumo: 'item', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Programa X', VS: 'VS X', Squad: 'Squad X', PI: 'PI3', Labels: [],
    Status: 'Concluído', Concluido: true, Cancelado: false, WIP: false,
    FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': 3, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-01-01', 'Data Conclusao': `${mes}-15`, 'Data Entrega Sprint': `${mes}-15`,
    'Data Inicio Real': `${mes}-02`, AnoMesCriacao: '2026-01', AnoCriacao: 2026, Mes: '01',
    AnoMesConclusao: mes, AnoConclusao: 2026, CycleTimeDias: cycle, LeadTimeDias: lead,
    parentKey: null, parent: null, EpicoChave: null,
    ...over,
  };
};

const desenhar = (base) => {
  T.renderTendenciaMensalTempo(base);
  return charts['chart-flow-lead-trend'];
};
/* Array.from traz o array para o realm do teste: o que vem do jsdom tem outro
   Array.prototype e deepStrictEqual reprova por identidade de protótipo. */
const rotulos = (cfg) => Array.from((cfg || charts['chart-flow-lead-trend']).data.labels);
const serie = (cfg) => Array.from((cfg || charts['chart-flow-lead-trend']).data.datasets[0].data);
const rotuloSerie = (cfg) => (cfg || charts['chart-flow-lead-trend']).data.datasets[0].label;
/* Dataset 1 é a linha de média móvel; 0 é a barra do mês. */
const tendencia = (cfg) => Array.from((cfg || charts['chart-flow-lead-trend']).data.datasets[1].data);
/* Espaço normalizado: a legenda é um template HTML multi-linha, então as quebras
   são de código, não de conteúdo — sem isso "2 meses" reprova só porque o
   template reflowou. */
const legenda = () => document.getElementById('flow-trend-caption').textContent.replace(/\s+/g, ' ').trim();
const trocarMedida = (valor) => {
  const el = document.getElementById('flowTrendMetric');
  el.value = valor;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

/* ---------- o mesmo, para o card de Tempo P85 por Squad ---------- */
/** Item concluído numa squad. O mês não importa neste card, só a squad. */
const squadItem = (squad, lead, cycle, over = {}) => item('2026-07', lead, cycle, { Squad: squad, ...over });

const desenharSquad = (base) => {
  T.renderTempoP85PorSquad(base);
  return charts['chart-flow-lead-squad'];
};
const rotulosSquad = (cfg) => Array.from((cfg || charts['chart-flow-lead-squad']).data.labels);
// As barras vêm como string (toFixed(1)) — é o formato que o gráfico recebe.
const barras = (cfg) => Array.from((cfg || charts['chart-flow-lead-squad']).data.datasets[0].data);
const corDaBarra = (cfg) => (cfg || charts['chart-flow-lead-squad']).data.datasets[0].backgroundColor;
const legendaSquad = () => document.getElementById('flow-squad-caption').textContent.replace(/\s+/g, ' ').trim();
const trocarMedidaSquad = (valor) => {
  const el = document.getElementById('flowSquadMetric');
  el.value = valor;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
/** Título do card que contém um dado canvas — usado nos dois cards. */
const tituloDoCard = (canvasId) => document.getElementById(canvasId).closest('.card')
  .querySelector('h3').textContent;

T.activeTab = 'flow';

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\n===== TENDÊNCIA MENSAL DO TEMPO =====');
console.log('\nO card existe na aba Lead & Cycle Time:');

check('canvas, seletor de medida e legenda estão no painel de fluxo', () => {
  const painel = document.getElementById('panel-flow');
  assert.ok(painel.querySelector('#chart-flow-lead-trend'), 'canvas');
  assert.ok(painel.querySelector('#flowTrendMetric'), 'seletor');
  assert.ok(painel.querySelector('#flow-trend-caption'), 'legenda');
});

check('o título do card não cita mais uma medida específica', () => {
  const card = document.getElementById('chart-flow-lead-trend').closest('.card');
  const titulo = card.querySelector('h3').textContent;
  assert.ok(!/Lead Time|Cycle Time/.test(titulo), `título ainda cita a medida: ${titulo}`);
  assert.ok(titulo.includes('P85'), titulo);
});

check('o id do canvas segue sendo chart-flow-lead-trend, mesmo com o rótulo agnóstico', () => {
  // Identificador interno é estável quando o rótulo muda: renomear não mudaria
  // nada na tela e quebraria o registro de gráficos, o drill e estes testes.
  assert.ok(document.getElementById('chart-flow-lead-trend'));
});

check('o seletor fica no cabeçalho do card, com o mesmo layout do de Tempo por status', () => {
  const card = document.getElementById('chart-flow-lead-trend').closest('.card');
  const head = card.querySelector('.statustime-head');
  assert.ok(head, 'cabeçalho do card');
  assert.ok(head.querySelector('h3'), 'título no cabeçalho');
  assert.ok(head.querySelector('.statustime-metric #flowTrendMetric'), 'seletor no cabeçalho');
});

console.log('\nDecisão 1 — as réguas são as MESMAS do resto do painel:');

check('o seletor oferece exatamente Lead Time e Cycle Time', () => {
  const opcoes = Array.from(document.querySelectorAll('#flowTrendMetric option'));
  assert.deepStrictEqual(opcoes.map((o) => o.value), ['lead', 'cycle']);
  assert.ok(opcoes[0].textContent.includes('Lead Time'), opcoes[0].textContent);
  assert.ok(opcoes[1].textContent.includes('Cycle Time'), opcoes[1].textContent);
});

check('as medidas vêm de SP_TIME_MEASURES, não de uma segunda definição de tempo', () => {
  // Se alguém redeclarar as medidas aqui, os valores podem continuar iguais
  // hoje e divergir amanhã. O que se trava é a origem.
  assert.deepStrictEqual(Object.keys(T.SP_TIME_MEASURES).sort(), ['cycle', 'lead']);
  Array.from(document.querySelectorAll('#flowTrendMetric option')).forEach((o) => {
    assert.ok(T.SP_TIME_MEASURES[o.value], `medida ${o.value} não existe em SP_TIME_MEASURES`);
  });
});

console.log('\nDecisão 2 — o padrão é o LEAD TIME (o card de Estimativas abre no Cycle):');

check('o card abre em Lead Time, e o seletor mostra isso', () => {
  assert.strictEqual(T.FLOW_TREND_DEFAULT, 'lead');
  assert.strictEqual(T.flowTrendMetric, 'lead');
  assert.strictEqual(document.getElementById('flowTrendMetric').value, 'lead');
});

check('a medida padrão usa LeadTimeDias, não CycleTimeDias', () => {
  // Cycle vale 4 nos dois itens: se a régua trocasse, o ponto viria 4.
  const cfg = desenhar([item('2026-03', 20, 4), item('2026-03', 20, 4)]);
  assert.deepStrictEqual(rotulos(cfg), ['Mar/26']);
  assert.deepStrictEqual(serie(cfg), [20]);
  assert.ok(rotuloSerie(cfg).startsWith('Lead Time'), rotuloSerie(cfg));
});

check('o rótulo da série acompanha a medida escolhida', () => {
  trocarMedida('cycle');
  assert.ok(rotuloSerie().startsWith('Cycle Time'), rotuloSerie());
  trocarMedida('lead');
  assert.ok(rotuloSerie().startsWith('Lead Time'), rotuloSerie());
});

console.log('\nO formato é barra + linha de tendência, com rótulo visível:');

check('é gráfico de barras, com a linha de média móvel sobreposta', () => {
  // Era área com curva suavizada, e o feedback executivo foi que estava difícil
  // de ler: a curva inventa movimento entre os meses. Se voltar a ser 'line'
  // com um dataset só, o card regrediu sem dar erro.
  const cfg = desenhar([item('2026-03', 20, 4), item('2026-04', 10, 2)]);
  assert.strictEqual(cfg.type, 'bar');
  assert.strictEqual(cfg.data.datasets.length, 2);
  assert.strictEqual(cfg.data.datasets[0].type, 'bar');
  assert.strictEqual(cfg.data.datasets[1].type, 'line');
  assert.ok(/tend/i.test(cfg.data.datasets[1].label), cfg.data.datasets[1].label);
  // A linha desenha POR CIMA da barra: order menor vence no Chart.js.
  assert.ok(cfg.data.datasets[1].order < cfg.data.datasets[0].order);
});

check('os rótulos das barras estão ligados, com uma casa decimal', () => {
  const cfg = desenhar([item('2026-03', 20, 4)]);
  assert.strictEqual(cfg.options.barLabels, true);
  assert.strictEqual(cfg.options.barLabelFmt, 'd1');
  // Sem folga no topo o rótulo da barra mais alta sai cortado.
  assert.ok(cfg.options.layout.padding.top > 0, 'sem padding para o rótulo');
});

check('o plugin de rótulo NÃO escreve sobre a linha de tendência', () => {
  // Rotular a linha põe dois números quase iguais um sobre o outro em cada mês.
  // O guard vive no plugin; aqui se confere que ele reconhece o tipo 'line'.
  const desenhados = [];
  const chartFake = {
    ctx: { save() {}, restore() {}, fillText: (t) => desenhados.push(t), measureText: () => ({ width: 10 }) },
    options: { barLabels: true, barLabelFmt: 'd1' },
    data: { datasets: [{ data: [10] }, { data: [10] }] },
    getDatasetMeta: (i) => ({ hidden: false, type: i === 1 ? 'line' : 'bar', data: [{ x: 0, y: 0 }] }),
  };
  T.barLabelsPlugin.afterDatasetsDraw(chartFake);
  assert.strictEqual(desenhados.length, 1, `rótulos desenhados: ${desenhados.join(',')}`);
});

check('a cor da barra segue a medida, como no card de squad', () => {
  desenhar([item('2026-03', 20, 4)]);
  assert.strictEqual(charts['chart-flow-lead-trend'].data.datasets[0].backgroundColor,
    T.FLOW_MEASURE_COLOR.lead);
  trocarMedida('cycle');
  assert.strictEqual(charts['chart-flow-lead-trend'].data.datasets[0].backgroundColor,
    T.FLOW_MEASURE_COLOR.cycle);
  trocarMedida('lead');
});

console.log('\nA média móvel é traseira e parcial no começo:');

check('o primeiro mês é ele mesmo e o segundo é a média de dois', () => {
  // Janela que só começa no 3o mês deixaria a linha nascer no meio do gráfico —
  // e num recorte de 3 ou 4 meses, que é o padrão da tela, sobraria quase nada.
  const cfg = desenhar([item('2026-01', 10, 1), item('2026-02', 20, 2), item('2026-03', 30, 3)]);
  assert.deepStrictEqual(serie(cfg), [10, 20, 30]);
  assert.deepStrictEqual(tendencia(cfg), [10, 15, 20]);
});

check('a janela anda com os meses e nunca fica maior que FLOW_TREND_JANELA', () => {
  const cfg = desenhar([10, 20, 30, 40].map((v, i) => item(`2026-0${i + 1}`, v, v)));
  // 4o ponto = média de 20, 30 e 40 (os três últimos), não dos quatro.
  assert.strictEqual(T.FLOW_TREND_JANELA, 3);
  assert.deepStrictEqual(tendencia(cfg), [10, 15, 20, 30]);
});

check('clicar na LINHA abre a janela inteira, não só o mês', () => {
  // O ponto da média móvel não é aquele mês; abrir só o mês entregaria uma
  // lista que não explica o número que está na tela.
  const aberturas = [];
  T.openDrawer = (titulo, issues) => aberturas.push({ titulo, issues });
  const cfg = desenhar([10, 20, 30, 40].map((v, i) => item(`2026-0${i + 1}`, v, v)));
  cfg.options.onClick({}, [{ index: 3, datasetIndex: 1 }], cfg);
  assert.strictEqual(aberturas[0].issues.length, 3, aberturas[0].titulo);
  assert.ok(aberturas[0].titulo.includes('3 meses'), aberturas[0].titulo);
  // Na barra, o mesmo índice abre um mês só.
  cfg.options.onClick({}, [{ index: 3, datasetIndex: 0 }], cfg);
  assert.strictEqual(aberturas[1].issues.length, 1, aberturas[1].titulo);
});

console.log('\nDecisão 3 — a barra é o P85 do mês, e o mês é o da CONCLUSÃO:');

check('cada ponto é o P85 do mês, não a média', () => {
  // 1, 2, 3, 4, 100: média 22, P85 42,4 (interpolado entre 4 e 100). Se o
  // ponto virar média, ele cai para 22.
  const cfg = desenhar([1, 2, 3, 4, 100].map((v) => item('2026-04', v, v)));
  assert.deepStrictEqual(rotulos(cfg), ['Abr/26']);
  assert.deepStrictEqual(serie(cfg).map((v) => Number(v.toFixed(1))), [42.4]);
});

check('os meses saem em ordem cronológica, pelo mês de conclusão', () => {
  const cfg = desenhar([item('2026-05', 9, 3), item('2026-02', 5, 2), item('2026-11', 7, 1)]);
  assert.deepStrictEqual(rotulos(cfg), ['Fev/26', 'Mai/26', 'Nov/26']);
  assert.deepStrictEqual(serie(cfg), [5, 9, 7]);
});

check('no Cycle Time o item continua no mês de CONCLUSÃO, não no de início', () => {
  // Concluído em junho, iniciado em janeiro: posicionar pelo início jogaria o
  // item para um mês em que ele ainda não tinha número.
  desenhar([item('2026-06', 40, 6, { 'Data Inicio Real': '2026-01-10' })]);
  trocarMedida('cycle');
  assert.deepStrictEqual(rotulos(), ['Jun/26']);
  assert.deepStrictEqual(serie(), [6]);
  trocarMedida('lead');
  assert.deepStrictEqual(rotulos(), ['Jun/26']);
  assert.deepStrictEqual(serie(), [40]);
});

console.log('\nDecisão 4 — sem a data, o item fica de FORA (não entra como zero):');

check('item sem Cycle Time não entra no ponto do mês nem como zero', () => {
  // Dois itens no mês, um sem a medida. Com o ausente entrando como zero, o
  // P85 do mês cairia de 10 para 8,5.
  desenhar([item('2026-07', 30, 10), item('2026-07', 30, null)]);
  trocarMedida('cycle');
  assert.deepStrictEqual(serie(), [10]);
  trocarMedida('lead');
});

check('mês inteiro sem a medida não vira ponto vazio no meio da linha', () => {
  // Abril não tem nenhum início real preenchido: no Lead Time são três meses,
  // no Cycle Time dois — e nenhum null entre eles.
  desenhar([item('2026-03', 30, 5), item('2026-04', 30, null), item('2026-05', 30, 9)]);
  assert.deepStrictEqual(rotulos(), ['Mar/26', 'Abr/26', 'Mai/26']);
  trocarMedida('cycle');
  assert.deepStrictEqual(rotulos(), ['Mar/26', 'Mai/26']);
  assert.deepStrictEqual(serie(), [5, 9]);
  assert.ok(!serie().includes(null), 'ponto vazio no meio da linha');
  trocarMedida('lead');
});

check('a legenda declara a cobertura — a linha encurta por preenchimento, não por entrega', () => {
  desenhar([item('2026-03', 30, 5), item('2026-04', 30, null), item('2026-05', 30, 9)]);
  trocarMedida('cycle');
  assert.ok(legenda().includes('Cycle Time'), legenda());
  assert.ok(legenda().includes('67%'), legenda());
  assert.ok(legenda().includes('2 meses'), legenda());
  trocarMedida('lead');
  assert.ok(legenda().includes('Lead Time'), legenda());
  assert.ok(legenda().includes('100%'), legenda());
  assert.ok(legenda().includes('3 meses'), legenda());
});

check('item não concluído não entra na tendência', () => {
  const cfg = desenhar([
    item('2026-08', 12, 3),
    item('2026-08', 999, 999, { Concluido: false, WIP: true, Status: 'Desenvolvimento' }),
  ]);
  assert.deepStrictEqual(serie(cfg), [12]);
});

console.log('\nDecisão 5 — o drill abre os itens que formaram o ponto:');

check('clicar no ponto abre os MEDIDOS do mês, não todos os concluídos dele', () => {
  const aberturas = [];
  T.openDrawer = (titulo, issues) => aberturas.push({ titulo, issues });
  desenhar([item('2026-09', 30, 5), item('2026-09', 30, null), item('2026-10', 30, 7)]);
  trocarMedida('cycle');
  const atual = charts['chart-flow-lead-trend'];
  atual.options.onClick({}, [{ index: 0, datasetIndex: 0 }], atual);
  assert.strictEqual(aberturas.length, 1);
  assert.ok(aberturas[0].titulo.startsWith('Cycle Time'), aberturas[0].titulo);
  assert.ok(aberturas[0].titulo.includes('Set/26'), aberturas[0].titulo);
  assert.strictEqual(aberturas[0].issues.length, 1); // o item sem Cycle Time fica fora
  trocarMedida('lead');
});

console.log('\nTrocar de medida não refaz o recorte da aba:');

check('o seletor redesenha a partir da base guardada no último render', () => {
  desenhar([item('2026-12', 21, 6)]);
  assert.strictEqual(T.flowTrendBase.length, 1);
  // Nada é passado ao trocar a medida: o valor novo só pode vir da base guardada.
  trocarMedida('cycle');
  assert.deepStrictEqual(rotulos(), ['Dez/26']);
  assert.deepStrictEqual(serie(), [6]);
  trocarMedida('lead');
  assert.deepStrictEqual(serie(), [21]);
});

console.log('\nBordas da tendência:');

check('recorte sem itens concluídos avisa, em vez de ficar mudo', () => {
  desenhar([item('2026-02', 10, 2, { Concluido: false, WIP: true })]);
  assert.deepStrictEqual(rotulos(), []);
  assert.ok(legenda().includes('Sem itens concluídos'), legenda());
});

check('base vazia não quebra o render', () => {
  desenhar([]);
  assert.deepStrictEqual(rotulos(), []);
  assert.deepStrictEqual(serie(), []);
});

console.log('\n===== TEMPO P85 POR SQUAD =====');

console.log('\nO card existe e segue o mesmo padrão de cabeçalho:');

check('canvas, seletor de medida e legenda estão no painel de fluxo', () => {
  const painel = document.getElementById('panel-flow');
  assert.ok(painel.querySelector('#chart-flow-lead-squad'), 'canvas');
  assert.ok(painel.querySelector('#flowSquadMetric'), 'seletor');
  assert.ok(painel.querySelector('#flow-squad-caption'), 'legenda');
});

check('o título do card não cita mais uma medida específica', () => {
  const titulo = tituloDoCard('chart-flow-lead-squad');
  assert.ok(!/Lead Time|Cycle Time/.test(titulo), `título ainda cita a medida: ${titulo}`);
  assert.ok(titulo.includes('P85'), titulo);
  assert.ok(titulo.includes('Squad'), titulo);
});

check('o título NÃO carrega o recorte do ranking — ele vive na legenda', () => {
  // "(top 12 por volume)" saiu do título: no card de meia largura ele empurrava
  // o seletor para uma segunda linha. Se voltar, a quebra volta junto.
  const titulo = tituloDoCard('chart-flow-lead-squad');
  assert.ok(!/top\s*\d+/i.test(titulo), `recorte de volta no título: ${titulo}`);
});

check('o id do canvas segue sendo chart-flow-lead-squad, mesmo com o rótulo agnóstico', () => {
  // Identificador interno é estável quando o rótulo muda — mesma regra do card
  // ao lado, e o que mantém o registro de gráficos e o drill funcionando.
  assert.ok(document.getElementById('chart-flow-lead-squad'));
});

check('o seletor fica no cabeçalho do card, com o mesmo layout dos demais', () => {
  const card = document.getElementById('chart-flow-lead-squad').closest('.card');
  const head = card.querySelector('.statustime-head');
  assert.ok(head, 'cabeçalho do card');
  assert.ok(head.querySelector('h3'), 'título no cabeçalho');
  assert.ok(head.querySelector('.statustime-metric #flowSquadMetric'), 'seletor no cabeçalho');
});

check('o seletor oferece as mesmas duas medidas, vindas de SP_TIME_MEASURES', () => {
  const opcoes = Array.from(document.querySelectorAll('#flowSquadMetric option'));
  assert.deepStrictEqual(opcoes.map((o) => o.value), ['lead', 'cycle']);
  opcoes.forEach((o) => assert.ok(T.SP_TIME_MEASURES[o.value], `medida ${o.value} desconhecida`));
});

check('o card abre em Lead Time, como o da tendência', () => {
  assert.strictEqual(T.FLOW_SQUAD_DEFAULT, 'lead');
  assert.strictEqual(T.flowSquadMetric, 'lead');
  assert.strictEqual(document.getElementById('flowSquadMetric').value, 'lead');
});

console.log('\nOs dois seletores são independentes:');

check('trocar a medida do ranking não mexe na tendência, e vice-versa', () => {
  // Ver a tendência em Lead Time e o ranking em Cycle Time é leitura legítima:
  // "o tempo total piorou; a execução de quem?". Amarrar os dois tiraria isso.
  const base = [squadItem('Alfa', 40, 4), squadItem('Alfa', 40, 4)];
  desenhar(base);
  desenharSquad(base);
  trocarMedidaSquad('cycle');
  assert.deepStrictEqual(barras().map(Number), [4]);
  assert.strictEqual(T.flowTrendMetric, 'lead');
  assert.deepStrictEqual(serie(), [40]); // a tendência continua em Lead Time
  trocarMedidaSquad('lead');
});

console.log('\nO número é o P85 da squad, e a medida escolhida manda:');

check('a barra é o P85 dos itens da squad, não a média', () => {
  // 1, 2, 3, 4, 100: média 22, P85 42,4. Se virar média, a barra cai para 22.
  const cfg = desenharSquad([1, 2, 3, 4, 100].map((v) => squadItem('Alfa', v, v)));
  assert.deepStrictEqual(rotulosSquad(cfg), ['Alfa']);
  assert.deepStrictEqual(barras(cfg).map(Number), [42.4]);
});

check('a medida padrão usa LeadTimeDias; trocar para cycle troca o número', () => {
  desenharSquad([squadItem('Alfa', 30, 6), squadItem('Alfa', 30, 6)]);
  assert.deepStrictEqual(barras().map(Number), [30]);
  trocarMedidaSquad('cycle');
  assert.deepStrictEqual(barras().map(Number), [6]);
  trocarMedidaSquad('lead');
});

check('as squads saem ordenadas pelo tempo, da mais lenta para a mais rápida', () => {
  const cfg = desenharSquad([
    squadItem('Alfa', 10, 1), squadItem('Beta', 50, 2), squadItem('Gama', 30, 3),
  ]);
  assert.deepStrictEqual(rotulosSquad(cfg), ['Beta', 'Gama', 'Alfa']);
});

console.log('\nA cor da barra segue a medida (rosa = Lead, âmbar = Cycle):');

check('a cor sai de FLOW_MEASURE_COLOR, não de um literal fixo', () => {
  // Um ranking é lido de longe: barra rosa mostrando Cycle Time anunciaria a
  // régua errada. A cor tem de acompanhar o seletor.
  desenharSquad([squadItem('Alfa', 30, 6)]);
  assert.strictEqual(corDaBarra(), T.FLOW_MEASURE_COLOR.lead);
  trocarMedidaSquad('cycle');
  assert.strictEqual(corDaBarra(), T.FLOW_MEASURE_COLOR.cycle);
  trocarMedidaSquad('lead');
  assert.notStrictEqual(T.FLOW_MEASURE_COLOR.lead, T.FLOW_MEASURE_COLOR.cycle);
});

check('os histogramas do topo e o card de Value Stream usam a mesma convenção', () => {
  // Se alguém trocar a cor de uma medida em um lugar só, a aba passa a dizer
  // duas coisas diferentes sobre a mesma régua. Aqui a aba inteira é renderizada
  // — é o único teste que precisa dos outros gráficos dela na tela.
  const base = [squadItem('Alfa', 30, 5), squadItem('Beta', 20, 4)];
  T.renderFlow(base, base);
  assert.strictEqual(charts['chart-flow-lead-hist'].data.datasets[0].backgroundColor,
    T.FLOW_MEASURE_COLOR.lead);
  assert.strictEqual(charts['chart-flow-cycle-hist'].data.datasets[0].backgroundColor,
    T.FLOW_MEASURE_COLOR.cycle);
  assert.strictEqual(charts['chart-flow-cycle-vs'].data.datasets[0].backgroundColor,
    T.FLOW_MEASURE_COLOR.cycle);
});

console.log('\nSem a data, o item fica de FORA — e isso decide o RANKING:');

check('item sem Cycle Time não entra na barra da squad nem como zero', () => {
  // Se o ausente entrasse como zero, o P85 da squad cairia de 10 para 8,5.
  desenharSquad([squadItem('Alfa', 30, 10), squadItem('Alfa', 30, null)]);
  trocarMedidaSquad('cycle');
  assert.deepStrictEqual(barras().map(Number), [10]);
  trocarMedidaSquad('lead');
});

check('squad sem nenhum item medido some do ranking em vez de aparecer zerada', () => {
  const base = [squadItem('Alfa', 30, 5), squadItem('Beta', 30, null)];
  desenharSquad(base);
  assert.deepStrictEqual(rotulosSquad(), ['Alfa', 'Beta']);
  trocarMedidaSquad('cycle');
  assert.deepStrictEqual(rotulosSquad(), ['Alfa']);
  trocarMedidaSquad('lead');
});

check('o top 12 conta itens MEDIDOS, então trocar de régua pode trocar as squads', () => {
  // Beta tem muito mais volume no Lead Time e entra no top; no Cycle Time só
  // Alfa tem itens medidos. É o caso real da squad que preenche pouco a data.
  const base = [];
  for (let i = 0; i < T.FLOW_SQUAD_TOP; i += 1) base.push(squadItem(`Sq${i}`, 30, 5));
  for (let i = 0; i < 30; i += 1) base.push(squadItem('Preenche pouco', 30, null));
  desenharSquad(base);
  assert.ok(rotulosSquad().includes('Preenche pouco'), rotulosSquad().join(','));
  trocarMedidaSquad('cycle');
  assert.ok(!rotulosSquad().includes('Preenche pouco'), rotulosSquad().join(','));
  assert.strictEqual(rotulosSquad().length, T.FLOW_SQUAD_TOP);
  trocarMedidaSquad('lead');
});

check('o corte é pelo VOLUME e só depois a ordenação é pelo TEMPO', () => {
  // Uma squad lentíssima com 1 item não pode empurrar para fora do top 12 uma
  // squad com muitos itens medidos: inverter as duas ordens faria isso.
  const base = [];
  for (let i = 0; i < T.FLOW_SQUAD_TOP; i += 1) {
    for (let j = 0; j < 5; j += 1) base.push(squadItem(`Sq${i}`, 10, 2));
  }
  base.push(squadItem('Lenta e rara', 999, 999));
  desenharSquad(base);
  assert.strictEqual(rotulosSquad().length, T.FLOW_SQUAD_TOP);
  assert.ok(!rotulosSquad().includes('Lenta e rara'), rotulosSquad().join(','));
});

check('o ranking mostra no máximo FLOW_SQUAD_TOP squads, e a legenda diz isso', () => {
  const base = [];
  for (let i = 0; i < T.FLOW_SQUAD_TOP + 5; i += 1) base.push(squadItem(`Sq${i}`, 30, 5));
  desenharSquad(base);
  assert.strictEqual(rotulosSquad().length, T.FLOW_SQUAD_TOP);
  assert.ok(legendaSquad().includes(String(T.FLOW_SQUAD_TOP)), legendaSquad());
  assert.ok(legendaSquad().includes(String(T.FLOW_SQUAD_TOP + 5)), legendaSquad());
});

check('quando ninguém fica de fora, a legenda não anuncia um corte que não houve', () => {
  // Com o recorte fora do título, esta frase é a ÚNICA que diz quantas squads o
  // ranking mostra. Dizer "as 12 com mais itens medidos" tendo 3 no recorte
  // inventaria um corte, e quem lê procuraria as outras nove.
  desenharSquad(['Alfa', 'Beta', 'Gama'].map((s) => squadItem(s, 30, 5)));
  assert.strictEqual(rotulosSquad().length, 3);
  assert.ok(legendaSquad().includes('todas as 3 squads'), legendaSquad());
  assert.ok(!/as 12 squads com mais/.test(legendaSquad()), legendaSquad());
});

check('a legenda declara a cobertura da medida escolhida', () => {
  desenharSquad([squadItem('Alfa', 30, 5), squadItem('Alfa', 30, null)]);
  assert.ok(legendaSquad().includes('Lead Time'), legendaSquad());
  assert.ok(legendaSquad().includes('100%'), legendaSquad());
  trocarMedidaSquad('cycle');
  assert.ok(legendaSquad().includes('Cycle Time'), legendaSquad());
  assert.ok(legendaSquad().includes('50%'), legendaSquad());
  trocarMedidaSquad('lead');
});

check('item não concluído não entra no ranking', () => {
  const cfg = desenharSquad([
    squadItem('Alfa', 12, 3),
    squadItem('Alfa', 999, 999, { Concluido: false, WIP: true, Status: 'Desenvolvimento' }),
  ]);
  assert.deepStrictEqual(barras(cfg).map(Number), [12]);
});

console.log('\nO drill abre os itens que formaram a barra:');

check('clicar na barra abre os MEDIDOS da squad, não todos os concluídos dela', () => {
  const aberturas = [];
  T.openDrawer = (titulo, issues) => aberturas.push({ titulo, issues });
  desenharSquad([
    squadItem('Alfa', 30, 5), squadItem('Alfa', 30, null), squadItem('Beta', 30, 7),
  ]);
  trocarMedidaSquad('cycle');
  const atual = charts['chart-flow-lead-squad'];
  atual.options.onClick({}, [{ index: 0, datasetIndex: 0 }], atual);
  assert.strictEqual(aberturas.length, 1);
  assert.ok(aberturas[0].titulo.startsWith('Cycle Time'), aberturas[0].titulo);
  assert.ok(aberturas[0].titulo.includes('Squad:'), aberturas[0].titulo);
  assert.ok(aberturas[0].issues.every((d) => d.CycleTimeDias != null), 'item sem medida no drill');
  trocarMedidaSquad('lead');
});

console.log('\nBordas do ranking:');

check('o seletor redesenha a partir da base guardada no último render', () => {
  desenharSquad([squadItem('Alfa', 21, 6)]);
  // Nada é passado ao trocar a medida: o valor novo só pode vir da base guardada.
  trocarMedidaSquad('cycle');
  assert.deepStrictEqual(barras().map(Number), [6]);
  trocarMedidaSquad('lead');
  assert.deepStrictEqual(barras().map(Number), [21]);
});

check('recorte sem itens concluídos avisa, em vez de ficar mudo', () => {
  desenharSquad([squadItem('Alfa', 10, 2, { Concluido: false, WIP: true })]);
  assert.deepStrictEqual(rotulosSquad(), []);
  assert.ok(legendaSquad().includes('Sem itens concluídos'), legendaSquad());
});

check('base vazia não quebra o render', () => {
  desenharSquad([]);
  assert.deepStrictEqual(rotulosSquad(), []);
  assert.deepStrictEqual(barras(), []);
});

check('nenhum erro de jsdom durante a suíte', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n${passed} verificações OK — medidas da aba Lead & Cycle Time\n`);
