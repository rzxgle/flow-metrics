'use strict';

/**
 * Testes da VISÃO "tempo por status" (aba Lead & Cycle Time), com o script real
 * da página rodando dentro do jsdom.
 *
 * Três decisões desta visão divergem do resto do painel, e é por isso que ela
 * merece teste próprio. Cada uma pode quebrar sem que nada dê erro na tela —
 * o gráfico simplesmente mostraria outro número:
 *
 *   1. O FILTRO DE STATUS ESCOLHE BARRAS, NÃO ITENS. Em toda outra visão ele
 *      recorta pelo status ATUAL do item. Se esse recorte voltar a valer aqui,
 *      selecionar "Desenvolvimento" passaria a mostrar só quem está parado lá
 *      hoje — e o valor da barra mudaria. O teste central abaixo compara o valor
 *      COM e SEM seleção: eles têm de ser idênticos.
 *
 *   2. O DENOMINADOR DA MEDIDA. "Média por item concluído" divide por todos os
 *      itens da base (quem não passou pelo status entra com zero) e por isso as
 *      barras somam o Lead Time médio; "P85 de quem passou" divide só pelos
 *      visitantes. Trocar um pelo outro dá números plausíveis e errados, então os
 *      dois são fixados com uma base pequena e conferível à mão. Pela mesma razão
 *      o TOOLTIP TEM DE ESPELHAR A BARRA: com denominadores diferentes no mesmo
 *      gráfico, a barra mostrava 9,0 enquanto o tooltip abria com 18,2 e não
 *      havia como saber qual número era qual.
 *
 *   3. A COR SAI DA FASE DO STATUS, pelas listas de classification.rules.js que
 *      chegam em `meta` — nunca por pedaço do nome. É a mesma decisão travada em
 *      test/drawer-status.spec.js, aqui aplicada a barras.
 *
 * Também cobre o dropdown de Status, que passou a listar status vindos do
 * HISTÓRICO: sem isso, uma etapa por onde os itens só PASSAM (`Em teste` é o
 * caso real medido na base) não seria selecionável.
 *
 * jsdom porque o objeto do teste é o que a tela produz. Sem rede: DATA
 * sintética, Chart e canvas são stubs que capturam a configuração recebida.
 *
 * Rode com:  npm run test:status-time-view
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rules = require('../src/config/classification.rules');

/* ---------- boot da página real dentro do jsdom ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

const erros = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => erros.push(e.message));

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole });
const { window } = dom;
const { document } = window;

/* Chart e canvas são stubs; o stub GUARDA a configuração de cada gráfico, que é
   o que o teste inspeciona (rótulos, valores, cores, callbacks). */
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

// As listas de fase vêm do módulo REAL: se um status mudar de lista amanhã, o
// teste acompanha em vez de mentir (mesma escolha do drawer-status.spec).
window.__RULES_PENDING = rules.pendingStatuses;
window.__RULES_INPROG = rules.inProgressStatuses;
window.__RULES_DONE = rules.doneStatuses;
window.__RULES_CANCELLED = rules.cancelledStatuses;

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  get DATA(){ return DATA; },
  selections, buildFilterBar, uniqueVals, getFiltered, SKIP_STATUS,
  renderTempoPorStatus, agregarTempoPorStatus, faseDoStatus,
  STATUS_TIME_PHASE_COLOR, STATUS_TIME_PHASE_ORDER,
  set openDrawer(v){ openDrawer = v; },
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética ---------- */
let seq = 0;
/**
 * Item concluído com histórico de status. `tempo` é a lista de permanências no
 * formato do payload — `visitas` OMITIDO quando vale 1, como o servidor manda.
 */
const item = (tempo, over = {}) => {
  seq += 1;
  return {
    Chave: `TESTE-${seq}`, Resumo: 'item', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Programa X', VS: 'VS X', Squad: 'Squad X', PI: 'PI3', Labels: [],
    Status: 'Concluído', Concluido: true, Cancelado: false, WIP: false,
    FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': 1, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-07-01', 'Data Conclusao': '2026-07-10', 'Data Entrega Sprint': '2026-07-10',
    'Data Inicio Real': '2026-07-02', AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: '07',
    AnoMesConclusao: '2026-07', AnoConclusao: 2026, CycleTimeDias: 8, LeadTimeDias: 10,
    parentKey: null, parent: null, EpicoChave: null,
    TempoPorStatus: tempo, StatusHistoricoOk: true,
    ...over,
  };
};

const desenhar = () => {
  T.renderTempoPorStatus(T.getFiltered(T.SKIP_STATUS));
  return charts['chart-flow-status-time'];
};
const barras = (cfg) => {
  const c = cfg || charts['chart-flow-status-time'];
  return Object.fromEntries(c.data.labels.map((l, i) => [l, c.data.datasets[0].data[i]]));
};
/* Array.from traz o array para o realm do teste: o que vem do jsdom tem outro
   Array.prototype e deepStrictEqual reprova por identidade de protótipo. */
const rotulos = (cfg) => Array.from((cfg || charts['chart-flow-status-time']).data.labels);
const cores = (cfg) => {
  const c = cfg || charts['chart-flow-status-time'];
  return Object.fromEntries(c.data.labels.map((l, i) => [l, c.data.datasets[0].backgroundColor[i]]));
};
const legenda = () => document.getElementById('status-time-caption').textContent;
const trocarMedida = (valor) => {
  const el = document.getElementById('statusTimeMetric');
  el.value = valor;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

T.selections.Squad.add('Squad X');
T.activeTab = 'flow';

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nO gráfico existe e lê o payload:');

check('o card, o canvas e o seletor de medida estão na aba Lead & Cycle Time', () => {
  const painel = document.getElementById('panel-flow');
  assert.ok(painel.querySelector('#chart-flow-status-time'), 'canvas');
  assert.ok(painel.querySelector('#statusTimeMetric'), 'seletor');
  assert.ok(painel.querySelector('#status-time-caption'), 'legenda');
});

check('o gráfico novo vem ANTES do Cycle Time P85 por Value Stream', () => {
  const canvases = Array.from(document.querySelectorAll('#panel-flow canvas')).map((c) => c.id);
  assert.ok(canvases.indexOf('chart-flow-status-time') < canvases.indexOf('chart-flow-cycle-vs'));
});

check('uma barra por status percorrido, com o tempo somado dos itens', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 6 }, { status: 'Desenvolvimento', dias: 4 }]),
    item([{ status: 'Backlog', dias: 2 }, { status: 'Desenvolvimento', dias: 8 }]),
  ];
  const cfg = desenhar();
  // média por item concluído: Backlog (6+2)/2 = 4 ; Desenvolvimento (4+8)/2 = 6
  assert.deepStrictEqual(barras(cfg), { Desenvolvimento: 6, Backlog: 4 });
});

check('com histórico completo, a soma das barras fecha com o Lead Time médio', () => {
  // Em dados reais a soma fica um pouco ACIMA do Lead Time: as barras vão até a
  // última transição de status, que costuma acontecer depois da Data de Fim Real.
  // Aqui o fixture é fechado de propósito, para testar a aritmética.
  const cfg = desenhar();
  const soma = cfg.data.datasets[0].data.reduce((a, b) => a + b, 0);
  assert.strictEqual(soma, 10); // LeadTimeDias = 10 nos dois itens
  assert.ok(legenda().includes('Soma das barras: 10,0 d')
    || legenda().includes('Soma das barras: 10.0 d'), legenda());
});

console.log('\nO denominador de cada medida (o erro que dá número plausível e errado):');

/* Base propositalmente mínima e conferível à mão: DOIS itens, só UM passou por
   CODE REVIEW, e ficou 4 dias lá. */
const baseDenominador = () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 1 }, { status: 'CODE REVIEW', dias: 4 }]),
    item([{ status: 'Backlog', dias: 1 }]),
  ];
};

check('"média por item concluído" divide por TODA a base (quem não passou entra com zero)', () => {
  baseDenominador();
  trocarMedida('media-todos');
  assert.strictEqual(barras()['CODE REVIEW'], 2); // 4 / 2 itens
});

check('"P85 de quem passou" divide só pelos visitantes', () => {
  baseDenominador();
  trocarMedida('p85-passou');
  assert.strictEqual(barras()['CODE REVIEW'], 4);
});

check('a mediana saiu do seletor (não é usada pelo time)', () => {
  const opcoes = Array.from(document.querySelectorAll('#statusTimeMetric option'))
    .map((o) => o.value);
  assert.deepStrictEqual(opcoes, ['media-todos', 'p85-passou']);
});

check('a legenda avisa quando a medida NÃO soma o Lead Time', () => {
  assert.ok(legenda().includes('apenas os itens que passaram'), legenda());
  assert.ok(!legenda().includes('Soma das barras'), legenda());
});

check('trocar a medida redesenha sem recarregar dados', () => {
  trocarMedida('media-todos');
  assert.strictEqual(barras()['CODE REVIEW'], 2);
  assert.ok(legenda().includes('Soma das barras'), legenda());
});

console.log('\nO filtro de Status escolhe BARRAS, não itens:');

check('com um status selecionado, só ele vira barra', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 6 }, { status: 'Desenvolvimento', dias: 4 }]),
    item([{ status: 'Backlog', dias: 2 }, { status: 'Desenvolvimento', dias: 8 }]),
  ];
  T.selections.Status.add('Desenvolvimento');
  assert.deepStrictEqual(rotulos(desenhar()), ['Desenvolvimento']);
});

check('o VALOR da barra não muda com a seleção — a amostra não foi recortada', () => {
  // Este é o teste que pega a regressão: se o filtro voltar a recortar ITENS
  // pelo status atual (todos "Concluído"), a base zeraria e a barra sumiria.
  assert.strictEqual(barras()['Desenvolvimento'], 6);
  T.selections.Status.clear();
  const semSelecao = desenhar();
  assert.strictEqual(barras(semSelecao)['Desenvolvimento'], 6);
});

check('selecionar um status por onde ninguém está PARADO ainda mostra a barra', () => {
  // Todos os itens estão em "Concluído"; ninguém está em Desenvolvimento hoje.
  T.selections.Status.add('Desenvolvimento');
  const cfg = desenhar();
  assert.deepStrictEqual(rotulos(cfg), ['Desenvolvimento']);
  assert.strictEqual(barras(cfg)['Desenvolvimento'], 6);
  T.selections.Status.clear();
});

check('a comparação do status selecionado ignora caixa e espaços', () => {
  T.selections.Status.add(' desenvolvimento ');
  assert.deepStrictEqual(rotulos(desenhar()), ['Desenvolvimento']);
  T.selections.Status.clear();
});

check('vários status selecionados viram várias barras', () => {
  T.selections.Status.add('Backlog');
  T.selections.Status.add('Desenvolvimento');
  assert.deepStrictEqual(rotulos(desenhar()).slice().sort(), ['Backlog', 'Desenvolvimento']);
  T.selections.Status.clear();
});

console.log('\nO dropdown de Status inclui o que só existe no histórico:');

check('"Em teste" é selecionável mesmo sem nenhum item parado nele', () => {
  T.DATA = [item([{ status: 'Backlog', dias: 1 }, { status: 'Em teste', dias: 3 }])];
  const opcoes = Array.from(T.uniqueVals('Status'));
  assert.ok(opcoes.includes('Em teste'), `esperava "Em teste" em ${JSON.stringify(opcoes)}`);
  assert.ok(opcoes.includes('Concluído'), 'o status atual continua na lista');
});

check('o dropdown renderizado traz a opção vinda do histórico', () => {
  T.buildFilterBar();
  const valores = Array.from(document.querySelectorAll('#dd-Status .dd-item input'))
    .map((el) => el.value);
  assert.ok(valores.includes('Em teste'), JSON.stringify(valores));
});

check('as outras dimensões não foram contaminadas pelo histórico de status', () => {
  const tipos = Array.from(T.uniqueVals('Tipo de item'));
  assert.deepStrictEqual(tipos, ['Story']);
});

console.log('\nOrdem e cor saem da FASE do status (nunca de pedaço do nome):');

check('as barras seguem a ordem do fluxo: Pendente → Em andamento → Concluído', () => {
  T.DATA = [item([
    { status: 'Desenvolvimento', dias: 3 },
    { status: 'Backlog', dias: 1 },
    { status: 'Deploy em Staging', dias: 2 },
  ], { Status: 'Concluído' })];
  assert.deepStrictEqual(rotulos(desenhar()), ['Backlog', 'Desenvolvimento', 'Deploy em Staging']);
});

check('dentro da mesma fase, a barra maior vem primeiro', () => {
  T.DATA = [item([
    { status: 'Backlog', dias: 1 },
    { status: 'PRIORIZADO', dias: 9 },
  ])];
  assert.deepStrictEqual(rotulos(desenhar()), ['PRIORIZADO', 'Backlog']);
});

check('"Deploy em Staging" é verde (concluído) — não azul por casar com "staging"', () => {
  T.DATA = [item([
    { status: 'Backlog', dias: 1 },
    { status: 'Desenvolvimento', dias: 2 },
    { status: 'Deploy em Staging', dias: 3 },
  ])];
  const c = cores(desenhar());
  assert.strictEqual(c['Deploy em Staging'], T.STATUS_TIME_PHASE_COLOR['Concluído']);
  assert.strictEqual(c.Backlog, T.STATUS_TIME_PHASE_COLOR.Pendente);
  assert.strictEqual(c.Desenvolvimento, T.STATUS_TIME_PHASE_COLOR['Em andamento']);
});

check('a fase de cada status vem das listas reais de classification.rules.js', () => {
  rules.pendingStatuses.forEach((s) => assert.strictEqual(T.faseDoStatus(s), 'Pendente', s));
  rules.inProgressStatuses.forEach((s) => assert.strictEqual(T.faseDoStatus(s), 'Em andamento', s));
  rules.doneStatuses.forEach((s) => assert.strictEqual(T.faseDoStatus(s), 'Concluído', s));
  rules.cancelledStatuses.forEach((s) => assert.strictEqual(T.faseDoStatus(s), 'Cancelado', s));
});

check('status fora de todas as listas cai em "Em andamento", como no backend', () => {
  assert.strictEqual(T.faseDoStatus('Status Que Nao Existe'), 'Em andamento');
});

console.log('\nQuem entra na conta:');

check('item EM ABERTO não entra, mesmo que traga permanências', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 4 }]),
    item([{ status: 'Backlog', dias: 100 }],
      { Status: 'Desenvolvimento', Concluido: false, 'Data Conclusao': null }),
  ];
  assert.strictEqual(barras(desenhar()).Backlog, 4);
});

check('item CANCELADO não entra na conta', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 4 }]),
    item([{ status: 'Backlog', dias: 100 }],
      { Status: 'CANCELADO', Concluido: false, Cancelado: true, FaseFluxo: 'Cancelado' }),
  ];
  assert.strictEqual(barras(desenhar()).Backlog, 4);
});

check('a legenda conta quantos concluídos têm histórico recuperável', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 4 }]),
    item(undefined, { TempoPorStatus: undefined, StatusHistoricoOk: undefined }),
  ];
  desenhar();
  assert.ok(/Base:\s*1 de 2/.test(legenda()), legenda());
  assert.ok(legenda().includes('1 sem changelog ficam fora'), legenda());
});

check('cronologia parcial é avisada em vez de escondida', () => {
  T.DATA = [
    item([{ status: 'Backlog', dias: 4 }]),
    item([{ status: 'Backlog', dias: 6 }], { StatusHistoricoOk: false }),
  ];
  desenhar();
  assert.ok(legenda().includes('cronologia'), legenda());
  assert.ok(legenda().includes('parcial'), legenda());
  // e o tempo conhecido dele CONTINUA na conta: (4+6)/2 = 5
  assert.strictEqual(barras().Backlog, 5);
});

check('`visitas` ausente no payload conta como 1 visita', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 2 }]),
    item([{ status: 'CODE REVIEW', dias: 2, visitas: 3 }]),
  ];
  const agregado = T.agregarTempoPorStatus(T.DATA);
  assert.strictEqual(agregado.porStatus.get('CODE REVIEW').visitas, 4);
});

check('a altura do gráfico acompanha o número de barras', () => {
  // O fluxo real tem 33 status; numa caixa fixa as barras horizontais viram
  // fatias de poucos pixels e os rótulos do eixo colidem.
  const altura = () => parseInt(document.getElementById('status-time-wrap').style.height, 10);
  T.DATA = [item([{ status: 'Backlog', dias: 3 }])];
  desenhar();
  const comUma = altura();
  T.DATA = [item(Array.from({ length: 12 },
    (_, i) => ({ status: `Status ${i}`, dias: i + 1 })))];
  desenhar();
  assert.ok(altura() > comUma, `12 barras (${altura()}px) deveria ser mais alto que 1 (${comUma}px)`);
  assert.ok(altura() <= 1200, 'com teto, para não virar uma página de rolagem');
});

check('permanência de zero dia não cria barra', () => {
  T.DATA = [item([{ status: 'Backlog', dias: 0 }, { status: 'Desenvolvimento', dias: 3 }])];
  assert.deepStrictEqual(rotulos(desenhar()), ['Desenvolvimento']);
});

check('snapshot antigo (sem o campo) não derruba a tela', () => {
  T.DATA = [item(undefined, { TempoPorStatus: undefined, StatusHistoricoOk: undefined })];
  const cfg = desenhar();
  assert.deepStrictEqual(rotulos(cfg), []);
  assert.ok(/Base:\s*0 de 1/.test(legenda()), legenda());
});

check('recorte sem nenhum item concluído desenha vazio, sem erro', () => {
  T.DATA = [item([{ status: 'Backlog', dias: 4 }],
    { Status: 'Desenvolvimento', Concluido: false, 'Data Conclusao': null })];
  assert.deepStrictEqual(rotulos(desenhar()), []);
});

console.log('\nDrill-down e tooltip:');

check('clicar na barra abre as issues que PASSARAM pelo status', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 2 }]),
    item([{ status: 'Backlog', dias: 5 }]),
  ];
  const cfg = desenhar();
  const idx = cfg.data.labels.indexOf('CODE REVIEW');
  let aberto = null;
  T.openDrawer = (titulo, issues) => { aberto = { titulo, issues }; };
  cfg.options.onClick({}, [{ index: idx, datasetIndex: 0 }], {});
  assert.ok(aberto, 'o drawer deveria abrir');
  assert.ok(aberto.titulo.includes('CODE REVIEW'), aberto.titulo);
  assert.strictEqual(aberto.issues.length, 1);
  assert.strictEqual(aberto.issues[0].Chave, T.DATA[0].Chave);
});

/* O caso que motivou o ajuste: metade dos itens passa pelo status, então a média
   por item concluído é METADE da média entre quem passou. Os dois números são
   corretos e diferentes — a barra precisa dizer qual deles está mostrando. */
const baseMetadePassa = () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 18.2 }]),
    item([{ status: 'Backlog', dias: 1 }]),
  ];
};

check('a primeira linha do tooltip repete EXATAMENTE o valor da barra', () => {
  baseMetadePassa();
  trocarMedida('media-todos');
  const cfg = charts['chart-flow-status-time'];
  const idx = cfg.data.labels.indexOf('CODE REVIEW');
  const valorDaBarra = cfg.data.datasets[0].data[idx];
  const linhas = cfg.options.plugins.tooltip.callbacks.label({ dataIndex: idx });
  assert.strictEqual(valorDaBarra, 9.1); // 18,2 diluído em 2 itens
  assert.ok(linhas[0].startsWith('Média por item concluído: 9.1 d'), linhas[0]);
});

check('a segunda linha dá a outra leitura, dizendo sobre quem foi calculada', () => {
  const cfg = charts['chart-flow-status-time'];
  const idx = cfg.data.labels.indexOf('CODE REVIEW');
  const linhas = cfg.options.plugins.tooltip.callbacks.label({ dataIndex: idx });
  assert.ok(linhas[1].includes('Entre os 1 que passaram'), linhas[1]);
  assert.ok(linhas[1].includes('18.2 d'), linhas[1]);
});

/* A terceira linha decompõe a base em três grupos que somam o total. O que ela
   resolve: "1 de 2 itens passaram por aqui" não dizia POR QUE o outro não
   passou, e há duas razões diferentes — nunca entrou no status, ou está nele
   agora (permanência aberta, sem duração). Medido na base real, o segundo caso
   domina os status finais: `PRONTO PARA ATIVAÇÃO DE VALOR` tem 55 itens que
   passaram e 301 parados dentro dele. */
const tooltipDe = (status) => {
  const cfg = charts['chart-flow-status-time'];
  return cfg.options.plugins.tooltip.callbacks.label({ dataIndex: cfg.data.labels.indexOf(status) });
};

check('os três grupos aparecem e somam a base', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),                       // passou e saiu
    item([{ status: 'Backlog', dias: 2 }], { Status: 'CODE REVIEW' }), // está nele agora
    item([{ status: 'Backlog', dias: 3 }]),                            // nunca passou
  ];
  desenhar();
  const l = tooltipDe('CODE REVIEW');
  assert.ok(l[2].includes('1 já saiu deste status'), l[2]);
  assert.ok(l[2].includes('1 ainda está nele'), l[2]);
  assert.ok(l[2].includes('1 nunca passou'), l[2]);
});

check('o item PARADO no status é contado como tal, não como "nunca passou"', () => {
  // O caso exato que gerou a dúvida: o segundo item não entra na média porque
  // está no status, e isso agora está escrito.
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),
    item([{ status: 'Backlog', dias: 2 }], { Status: 'CODE REVIEW' }),
  ];
  desenhar();
  const l = tooltipDe('CODE REVIEW');
  assert.ok(l[2].includes('1 já saiu deste status · 1 ainda está nele'), l[2]);
  assert.ok(!l[2].includes('nunca'), l[2]);
});

check('a ressalva explica o mecanismo, sem repetir o número', () => {
  const l = tooltipDe('CODE REVIEW');
  assert.strictEqual(l[l.length - 1],
    'Quem ainda está no status tem permanência aberta e fica fora da média.');
});

check('sem ninguém parado, a ressalva NÃO aparece e o grupo some da linha', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),
    item([{ status: 'Backlog', dias: 3 }]),
  ];
  desenhar();
  const l = tooltipDe('CODE REVIEW');
  assert.ok(l[2].includes('1 já saiu deste status · 1 nunca passou'), l[2]);
  assert.ok(!l[2].includes('ainda está'), l[2]);
  assert.ok(!l.some((x) => x.includes('permanência aberta')), JSON.stringify(l));
});

check('quando todos passaram, a linha diz isso em vez de listar zeros', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),
    item([{ status: 'CODE REVIEW', dias: 6 }]),
  ];
  desenhar();
  assert.ok(tooltipDe('CODE REVIEW')[2].includes('todos os 2 itens já passaram por aqui'),
    tooltipDe('CODE REVIEW')[2]);
});

check('singular e plural corretos em cada grupo', () => {
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),
    item([{ status: 'CODE REVIEW', dias: 5 }]),
    item([{ status: 'Backlog', dias: 2 }], { Status: 'CODE REVIEW' }),
    item([{ status: 'Backlog', dias: 2 }], { Status: 'CODE REVIEW' }),
    item([{ status: 'Backlog', dias: 3 }]),
  ];
  desenhar();
  const l = tooltipDe('CODE REVIEW');
  assert.ok(l[2].includes('2 já saíram deste status'), l[2]);
  assert.ok(l[2].includes('2 ainda estão nele'), l[2]);
  assert.ok(l[2].includes('1 nunca passou'), l[2]);
});

check('as visitas por item ganharam linha própria', () => {
  const l = tooltipDe('CODE REVIEW');
  assert.ok(l[3].startsWith('1.00 visitas por item'), l[3]);
});

check('status onde SÓ há gente parada não vira barra fantasma', () => {
  // Ninguém saiu de "Em teste", então não há duração a mostrar.
  T.DATA = [item([{ status: 'Backlog', dias: 2 }], { Status: 'Em teste' })];
  assert.deepStrictEqual(rotulos(desenhar()), ['Backlog']);
});

check('a linha dos grupos usa a base COM histórico, não o total de concluídos', () => {
  // Item concluído sem changelog não entra em nenhum dos três grupos: ele já é
  // reportado à parte, na legenda do card, como "sem changelog ficam fora".
  T.DATA = [
    item([{ status: 'CODE REVIEW', dias: 4 }]),
    item(undefined, { TempoPorStatus: undefined, StatusHistoricoOk: undefined }),
  ];
  desenhar();
  assert.ok(tooltipDe('CODE REVIEW')[2].includes('todos os 1 item já passaram por aqui'),
    tooltipDe('CODE REVIEW')[2]);
  assert.ok(/Base:\s*1 de 2/.test(legenda()), legenda());
});

check('trocando para P85, a primeira linha acompanha a barra', () => {
  baseMetadePassa();
  trocarMedida('p85-passou');
  const cfg = charts['chart-flow-status-time'];
  const idx = cfg.data.labels.indexOf('CODE REVIEW');
  const linhas = cfg.options.plugins.tooltip.callbacks.label({ dataIndex: idx });
  assert.strictEqual(cfg.data.datasets[0].data[idx], 18.2);
  assert.ok(linhas[0].startsWith('P85 de quem passou: 18.2 d'), linhas[0]);
  assert.ok(linhas[1].includes('Média por item concluído'), linhas[1]);
  trocarMedida('media-todos');
});

check('o eixo nomeia a medida, para a barra não ficar sem denominador', () => {
  baseMetadePassa();
  trocarMedida('media-todos');
  assert.strictEqual(charts['chart-flow-status-time'].options.scales.x.title.text,
    'Média por item concluído (dias)');
  trocarMedida('p85-passou');
  assert.strictEqual(charts['chart-flow-status-time'].options.scales.x.title.text,
    'P85 de quem passou (dias)');
  trocarMedida('media-todos');
});

check('a legenda do card também diz qual medida está na barra', () => {
  assert.ok(legenda().includes('A barra mostra'), legenda());
  assert.ok(legenda().toLowerCase().includes('média por item concluído'), legenda());
});

check('o título do tooltip traz o status e a fase', () => {
  const cfg = charts['chart-flow-status-time'];
  const idx = cfg.data.labels.indexOf('CODE REVIEW');
  const titulo = cfg.options.plugins.tooltip.callbacks.title([{ dataIndex: idx }]);
  assert.ok(titulo.includes('CODE REVIEW') && titulo.includes('Em andamento'), titulo);
});

check('nenhum erro de script foi disparado durante o teste', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
