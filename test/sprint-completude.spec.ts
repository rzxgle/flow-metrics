// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
'use strict';

/**
 * Testes do card "Completude por item standard" (aba Sprint) quanto a COMO O
 * ITEM SE IDENTIFICA no tooltip e no drawer, com o script real da página
 * rodando dentro do jsdom.
 *
 * A decisão que estes testes travam: a barra é rotulada no eixo Y com a CHAVE
 * (APP-825), e era só isso que aparecia ao passar o mouse ou ao abrir o drawer.
 * Chave não diz de qual história se trata, e a pergunta seguinte na cerimônia
 * era sempre "essa é qual?". Então:
 *
 *   1. O TÍTULO DO TOOLTIP É O RESUMO, NÃO A CHAVE. A chave já está escrita ao
 *      lado da barra que o mouse aponta, então repeti-la gastava a única linha
 *      em destaque do tooltip com informação redundante. Item sem resumo
 *      preenchido cai de volta na chave — o tooltip nunca fica sem cabeçalho.
 *
 *   2. O TÍTULO DO DRAWER TRAZ CHAVE E RESUMO. Aqui a chave importa: o drawer
 *      lista os SUBITENS, cujas chaves são outras, e sem a do pai a lista perde
 *      a âncora. Por isso é `Chave · Resumo`, não um ou outro.
 *
 *   3. O resumo é quebrado em linhas antes de ir ao tooltip. O Chart.js
 *      renderiza array de strings como múltiplas linhas; sem a quebra, um
 *      resumo de ~60 caracteres vira uma tarja que atravessa o card.
 *
 * Nada disso mexe no payload: `Resumo` já viaja em cada issue e já era usado na
 * tabela de itens standard logo abaixo do gráfico. É o que dispensa recoleta de
 * dados e bump de DASHBOARD_SCHEMA_VERSION.
 *
 * jsdom porque o objeto do teste é o que a tela produz: a configuração que o
 * Chart.js recebeu e o texto que o drawer escreve. Sem rede: DATA e __SPRINTS
 * sintéticos, Chart e canvas são stubs que capturam a configuração.
 *
 * Rode com:  npm run test:completude
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

window.__RULES_PENDING = rules.pendingStatuses;
window.__RULES_INPROG = rules.inProgressStatuses;
window.__RULES_DONE = rules.doneStatuses;
window.__RULES_CANCELLED = rules.cancelledStatuses;

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  selections, normalizeData, renderSprint, quebraTextoTooltip,
  get cardDrills(){ return __cardDrills; },
  set sprintSelection(v){ sprintSelection=v; },
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- cenário sintético ---------- */
const SPRINT = {
  name: 'SQD_PI3_4', state: 'active', id: 2,
  startDate: '2026-08-24T13:32:59.705Z', endDate: '2026-09-04T03:00:00.000Z', completeDate: null,
};
window.__SPRINTS = [SPRINT];

const standard = (chave, over = {}) => ({
  Chave: chave, chave, Resumo: `item ${chave}`, 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
  Programa: 'Programa X', VS: 'VS X', Squad: 'App - Aprender', PI: 'PI3', Labels: [],
  Status: 'Desenvolvimento', Concluido: false, Cancelado: false, WIP: true,
  FaseFluxo: 'Em andamento', EntregueAmplo: false, Incremental: false,
  'Story Points': 5, Sprint: SPRINT.name, Sprints: [SPRINT.name],
  SprintPeriodos: [{ sprint: SPRINT.name, enteredAt: '2026-08-24T14:00:00.000Z', leftAt: null }],
  SprintHistoricoOk: true, Criado: '2026-08-01', 'Data Conclusao': null,
  'Data Entrega Sprint': null, 'Data Inicio Real': '2026-08-02',
  AnoMesCriacao: '2026-08', AnoCriacao: 2026, AnoMesConclusao: null, AnoConclusao: null,
  parent: null, parentKey: null, EpicoChave: null,
  ...over,
});

const sub = (chave, pai, entrega) => standard(chave, {
  'Tipo de item': 'Sub-task', 'Tipo Agrupado': 'Sub-task', 'Story Points': 0,
  parent: pai, parentKey: pai,
  Concluido: !!entrega, WIP: !entrega,
  Status: entrega ? 'Pronto p/ Deploy STG' : 'Desenvolvimento',
  FaseFluxo: entrega ? 'Concluído' : 'Em andamento',
  'Data Entrega Sprint': entrega || null, 'Data Conclusao': entrega || null,
});

/* Resumo longo de propósito: é o caso real (o do APP-825 tem 64 caracteres) e é
   o que exercita a quebra de linha. */
const RESUMO_LONGO = 'Visualizar novos objetos de estudo na estrutura do curso - Mobile';
const alto = standard('APP-825', { Resumo: RESUMO_LONGO });      // 2/2 -> 100%
const baixo = standard('APP-520', { Resumo: 'Ajustar filtro' }); // 1/4 ->  25%
const semResumo = standard('APP-999', { Resumo: '' });           // 0/2 ->   0%

const subitens = [
  sub('APP-825-1', 'APP-825', '2026-08-26'),
  sub('APP-825-2', 'APP-825', '2026-08-27'),
  sub('APP-520-1', 'APP-520', '2026-08-26'),
  sub('APP-520-2', 'APP-520', null),
  sub('APP-520-3', 'APP-520', null),
  sub('APP-520-4', 'APP-520', null),
  sub('APP-999-1', 'APP-999', null),
  sub('APP-999-2', 'APP-999', null),
];

T.DATA = [alto, baixo, semResumo, ...subitens];
T.normalizeData();
T.selections.Squad.add('App - Aprender');
T.activeTab = 'sprint';
T.sprintSelection = SPRINT.name;
T.renderSprint();

const chart = () => charts['chart-sprint-completude'];
const cb = () => chart().options.plugins.tooltip.callbacks;
/* O Chart.js entrega ao callback de título os itens da fatia apontada; só o
   dataIndex importa aqui. */
/* Array.from porque o array volta do realm do jsdom: sem isso o
   deepStrictEqual reprova por protótipo, com os mesmos valores. */
const tooltipTitle = (idx) => Array.from(cb().title([{ dataIndex: idx }]));
const indiceDe = (chave) => Array.from(chart().data.labels).indexOf(chave);

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nCompletude por item standard — identificação do item:');

check('a página carregou e o gráfico foi renderizado sem erro de script', () => {
  assert.deepStrictEqual(erros, []);
  assert.ok(chart(), 'o gráfico de completude existe');
});

check('o eixo Y continua rotulado com a CHAVE (é o que cabe ao lado da barra)', () => {
  assert.deepStrictEqual(Array.from(chart().data.labels), ['APP-825', 'APP-520', 'APP-999']);
});

check('o título do tooltip é o RESUMO da história, não a chave', () => {
  const linhas = tooltipTitle(indiceDe('APP-825'));
  assert.strictEqual(linhas.join(' '), RESUMO_LONGO);
  assert.ok(!linhas.join(' ').includes('APP-825'), 'a chave não se repete no tooltip');
});

check('resumo longo sai quebrado em várias linhas, não numa tarja só', () => {
  const linhas = tooltipTitle(indiceDe('APP-825'));
  assert.ok(linhas.length > 1, `esperava mais de uma linha, veio ${linhas.length}`);
  linhas.forEach((l) => assert.ok(l.length <= 44, `linha longa demais: "${l}"`));
});

check('resumo curto continua em uma linha só', () => {
  assert.deepStrictEqual(tooltipTitle(indiceDe('APP-520')), ['Ajustar filtro']);
});

check('item sem resumo cai de volta na chave (tooltip nunca fica sem cabeçalho)', () => {
  assert.deepStrictEqual(tooltipTitle(indiceDe('APP-999')), ['APP-999']);
});

check('o corpo do tooltip continua trazendo a contagem de subitens e o percentual', () => {
  const idx = indiceDe('APP-520');
  assert.strictEqual(cb().label({ dataIndex: idx, parsed: { x: 25 } }), ' 1/4 subitens (25%)');
});

check('o tooltip acompanha a barra certa apesar da ordenação por percentual', () => {
  // As barras vêm ordenadas do maior para o menor; indexar errado trocaria o
  // resumo de um item pelo de outro sem nenhum erro visível.
  assert.strictEqual(tooltipTitle(indiceDe('APP-520')).join(' '), 'Ajustar filtro');
  assert.strictEqual(tooltipTitle(indiceDe('APP-999')).join(' '), 'APP-999');
});

console.log('\nDrawer de subitens — chave E resumo:');

check('o título do drawer traz a chave do pai e o resumo', () => {
  const drill = T.cardDrills[`sprintitem_${indiceDe('APP-825')}`];
  assert.strictEqual(drill.title, `Subitens de APP-825 · ${RESUMO_LONGO}`);
});

check('o drawer abre os subitens do item clicado, não o próprio item', () => {
  const drill = T.cardDrills[`sprintitem_${indiceDe('APP-825')}`];
  assert.deepStrictEqual(Array.from(drill.issues.map((d) => d.Chave)), ['APP-825-1', 'APP-825-2']);
});

check('item sem resumo mantém só a chave no título, sem separador solto', () => {
  const drill = T.cardDrills[`sprintitem_${indiceDe('APP-999')}`];
  assert.strictEqual(drill.title, 'Subitens de APP-999');
});

check('a tabela de itens standard continua abrindo o mesmo drill do gráfico', () => {
  const linha = Array.from(document.querySelectorAll('#sprint-table tbody tr'))
    .find((tr) => tr.textContent.includes('APP-825'));
  assert.strictEqual(linha.dataset.drill, `sprintitem_${indiceDe('APP-825')}`);
});

console.log('\nQuebra de texto do tooltip:');

check('quebra por palavra, sem cortar palavra no meio', () => {
  assert.deepStrictEqual(Array.from(T.quebraTextoTooltip('um dois tres quatro cinco', 10)),
    ['um dois', 'tres', 'quatro', 'cinco']);
});

check('palavra maior que o limite fica inteira em vez de ser cortada', () => {
  assert.deepStrictEqual(Array.from(T.quebraTextoTooltip('supercalifragilisticexpialidocious', 10)),
    ['supercalifragilisticexpialidocious']);
});

check('texto vazio devolve lista vazia (sem linha em branco no tooltip)', () => {
  assert.deepStrictEqual(Array.from(T.quebraTextoTooltip('', 20)), []);
  assert.deepStrictEqual(Array.from(T.quebraTextoTooltip(null, 20)), []);
  assert.deepStrictEqual(Array.from(T.quebraTextoTooltip('   ', 20)), []);
});

console.log(`\n${passed} verificações OK\n`);
