'use strict';

/**
 * Testes do card "Burndown de subitens" e da marcação de TRANSBORDO na tabela
 * de itens standard da aba Sprint, com o script real da página rodando dentro
 * do jsdom.
 *
 * O cenário que originou os dois: na squad App - Aprender, sprint
 * `26_SQD_APP_Aprender_PI3_4` (24/08 a 04/09), a linha ideal começava em 116 e a
 * real em 83. Os 33 subitens de diferença já estavam CONCLUÍDOS na abertura,
 * vindos de dois itens que transbordaram da PI3_3 (APP-825 com 15/19 e APP-767
 * com 13/17). Duas consequências, uma por bloco de teste:
 *
 *   1. A IDEAL PARTE DO QUE ESTAVA ABERTO NO PRIMEIRO DIA, não do total de
 *      subitens. Partindo do total, o gráfico entregava ao time 33 subitens de
 *      vantagem grátis no dia 1 — a linha real nascia abaixo da ideal sem que
 *      nada tivesse sido feito na sprint, e o card lia como adiantado o
 *      trabalho do ciclo passado. Num burndown as duas linhas se encontram na
 *      abertura, e é isso que este teste trava.
 *
 *   2. TRANSBORDO É PERMANECER NA SPRINT ANTERIOR ATÉ O FECHAMENTO DELA, e não
 *      "ter estado em alguma sprint anterior". A diferença não é acadêmica: na
 *      base real a regra frouxa marcaria 6 dos 8 itens da sprint, porque
 *      APP-482/483/484/521 saíram da PI3_3 com ela ainda ABERTA (entre 03 e
 *      06/08) — replanejamento, não transbordo, e chegaram com 0 a 2 subitens
 *      prontos. Marcar seis de oito é quase o mesmo que não marcar nenhum.
 *
 * jsdom porque o objeto do teste é o que a tela produz: o badge tem de sair no
 * HTML da tabela, com a sprint de origem e a contagem no tooltip. Sem rede:
 * DATA e __SPRINTS sintéticos, Chart e canvas são stubs que capturam a config.
 *
 * Rode com:  npm run test:burndown
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rules = require('../dist/src/config/classification.rules');

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
  selections, normalizeData, renderSprint, renderBurndown, transbordoDeSprint,
  showHelpTooltip, hideHelpTooltip, installHelpEvents,
  set sprintSelection(v){ sprintSelection=v; },
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- cenário sintético ----------
   Espelha a fronteira real entre os dois ciclos da App - Aprender: a sprint
   anterior fecha e o Jira ACUMULA na seguinte os itens incompletos, com o
   `enteredAt` da nova caindo minutos ANTES do startDate dela. */
const ANT = {
  name: 'SQD_PI3_3', state: 'closed', id: 1,
  startDate: '2026-08-06T13:00:00.000Z', endDate: '2026-08-24T12:00:00.000Z', completeDate: null,
};
const ATUAL = {
  name: 'SQD_PI3_4', state: 'active', id: 2,
  startDate: '2026-08-24T13:32:59.705Z', endDate: '2026-09-04T03:00:00.000Z', completeDate: null,
};
window.__SPRINTS = [ANT, ATUAL];

const standard = (chave, over = {}) => ({
  Chave: chave, chave, Resumo: `item ${chave}`, 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
  Programa: 'Programa X', VS: 'VS X', Squad: 'App - Aprender', PI: 'PI3', Labels: [],
  Status: 'Desenvolvimento', Concluido: false, Cancelado: false, WIP: true,
  FaseFluxo: 'Em andamento', EntregueAmplo: false, Incremental: false,
  'Story Points': 5, Sprint: ATUAL.name, Sprints: [ATUAL.name], SprintPeriodos: [],
  SprintHistoricoOk: true, Criado: '2026-08-01', 'Data Conclusao': null,
  'Data Entrega Sprint': null, 'Data Inicio Real': '2026-08-02',
  AnoMesCriacao: '2026-08', AnoCriacao: 2026, AnoMesConclusao: null, AnoConclusao: null,
  parent: null, parentKey: null, EpicoChave: null,
  ...over,
});

/** Subitem de `pai`. `entrega` presente = entrou em Done naquela data. */
const sub = (chave, pai, entrega) => standard(chave, {
  'Tipo de item': 'Sub-task', 'Tipo Agrupado': 'Sub-task', 'Story Points': 0,
  parent: pai, parentKey: pai,
  Concluido: !!entrega, WIP: !entrega,
  Status: entrega ? 'Pronto p/ Deploy STG' : 'Desenvolvimento',
  FaseFluxo: entrega ? 'Concluído' : 'Em andamento',
  'Data Entrega Sprint': entrega || null, 'Data Conclusao': entrega || null,
});

/* TRANS-1: transbordo de verdade — nunca saiu da PI3_3 e foi acumulado na PI3_4
   no fechamento. Chega com 3 de 4 subitens prontos: é ele que faz a linha real
   nascer abaixo do total de subitens. */
const trans = standard('TRANS-1', {
  Sprints: [ANT.name, ATUAL.name],
  SprintPeriodos: [
    { sprint: ANT.name, enteredAt: '2026-08-06T18:52:06.969Z', leftAt: null },
    { sprint: ATUAL.name, enteredAt: '2026-08-24T12:20:36.668Z', leftAt: null },
  ],
});
/* REPLAN-1: passou pela PI3_3 e SAIU dela em 10/08, com a sprint ainda aberta.
   Replanejamento, não transbordo — não deve receber badge. */
const replan = standard('REPLAN-1', {
  Sprints: [ATUAL.name],
  SprintPeriodos: [
    { sprint: ANT.name, enteredAt: '2026-08-06T13:10:00.000Z', leftAt: '2026-08-10T15:00:00.000Z' },
    { sprint: ATUAL.name, enteredAt: '2026-08-10T15:00:00.000Z', leftAt: null },
  ],
});
/* NOVO-1: nasceu nesta sprint. */
const novo = standard('NOVO-1', {
  SprintPeriodos: [{ sprint: ATUAL.name, enteredAt: '2026-08-24T14:00:00.000Z', leftAt: null }],
});
/* SEMHIST-1: duas sprints no campo e cronologia desconhecida (SprintPeriodos
   vazio). Na base real são 69 itens assim. Não deve ser marcado: preferimos
   deixar de marcar a marcar errado. */
const semHist = standard('SEMHIST-1', {
  Sprints: [ANT.name, ATUAL.name], SprintPeriodos: [], SprintHistoricoOk: false,
});

const subitens = [
  // 3 dos 4 subitens de TRANS-1 entraram em Done ANTES da abertura da PI3_4.
  sub('TRANS-1-1', 'TRANS-1', '2026-08-18'),
  sub('TRANS-1-2', 'TRANS-1', '2026-08-20'),
  sub('TRANS-1-3', 'TRANS-1', '2026-08-21'),
  sub('TRANS-1-4', 'TRANS-1', null),
  sub('REPLAN-1-1', 'REPLAN-1', '2026-08-26'),
  sub('REPLAN-1-2', 'REPLAN-1', null),
  sub('REPLAN-1-3', 'REPLAN-1', null),
  sub('REPLAN-1-4', 'REPLAN-1', null),
  sub('NOVO-1-1', 'NOVO-1', null),
  sub('NOVO-1-2', 'NOVO-1', null),
  sub('SEMHIST-1-1', 'SEMHIST-1', null),
  sub('SEMHIST-1-2', 'SEMHIST-1', null),
];
const TOTAL_SUBS = subitens.length;            // 12
const PRONTOS_NA_ABERTURA = 3;                 // os três de TRANS-1

T.DATA = [trans, replan, novo, semHist, ...subitens];
T.normalizeData();
T.selections.Squad.add('App - Aprender');
T.activeTab = 'sprint';
T.sprintSelection = ATUAL.name;
T.renderSprint();

const burndown = () => charts['chart-sprint-burndown'];
const serie = (label) => Array.from(burndown().data.datasets.find((d) => d.label === label).data);
const linhaDoItem = (chave) => Array.from(document.querySelectorAll('#sprint-table tbody tr'))
  .find((tr) => tr.textContent.includes(chave));

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nBurndown de subitens — a ideal parte do que estava aberto:');

check('a página carregou e o gráfico foi renderizado sem erro de script', () => {
  assert.deepStrictEqual(erros, []);
  assert.ok(burndown(), 'o gráfico de burndown existe');
});

check('o primeiro ponto da ideal é o RESTANTE do dia 1, não o total de subitens', () => {
  const ideal = serie('Ideal');
  const real = serie('Restante (real)');
  assert.strictEqual(real[0], TOTAL_SUBS - PRONTOS_NA_ABERTURA, 'restante no dia 1');
  assert.strictEqual(ideal[0], real[0], 'as duas linhas se encontram na abertura');
  assert.notStrictEqual(ideal[0], TOTAL_SUBS,
    'partir do total daria de graça ao time os subitens fechados no ciclo anterior');
});

check('a ideal continua chegando a zero no último dia', () => {
  const ideal = serie('Ideal');
  assert.strictEqual(ideal[ideal.length - 1], 0);
});

check('a ideal é monotonicamente decrescente ao longo da sprint', () => {
  const ideal = serie('Ideal');
  for (let i = 1; i < ideal.length; i += 1) assert.ok(ideal[i] <= ideal[i - 1], `dia ${i}`);
});

check('sem datas da sprint o card cai no estado vazio em vez de quebrar', () => {
  assert.doesNotThrow(() => T.renderBurndown('SPRINT-INEXISTENTE', subitens));
  assert.deepStrictEqual(Array.from(burndown().data.labels), ['sem datas da sprint']);
  T.renderSprint(); // restaura o cenário para os testes seguintes
});

console.log('\nTransbordo — permanecer na sprint anterior até o fechamento dela:');

check('marca quem nunca saiu da sprint anterior, devolvendo a sprint de origem', () => {
  assert.strictEqual(T.transbordoDeSprint(trans, ATUAL.name), ANT.name);
});

check('NÃO marca quem saiu da sprint anterior antes do fechamento (replanejamento)', () => {
  assert.strictEqual(T.transbordoDeSprint(replan, ATUAL.name), null);
});

check('NÃO marca item que nasceu na sprint', () => {
  assert.strictEqual(T.transbordoDeSprint(novo, ATUAL.name), null);
});

check('NÃO marca item sem histórico reconstruído, mesmo com 2 sprints no campo', () => {
  assert.strictEqual(T.transbordoDeSprint(semHist, ATUAL.name), null);
});

check('sprint fora do catálogo não marca ninguém em vez de estourar', () => {
  assert.strictEqual(T.transbordoDeSprint(trans, 'SPRINT-INEXISTENTE'), null);
});

console.log('\nO badge chega à tabela de itens standard:');

check('a linha do item transbordado tem o badge', () => {
  const tr = linhaDoItem('TRANS-1');
  assert.ok(tr, 'a linha de TRANS-1 existe na tabela');
  const badge = tr.querySelector('.badge');
  assert.ok(badge, 'o badge existe');
  assert.strictEqual(badge.textContent.trim(), 'transbordo');
});

check('o badge NÃO usa o title nativo do navegador', () => {
  // O title nativo é ilegível numa frase desse tamanho — fonte do sistema, sem
  // largura máxima, sem cabeçalho. O painel tem tooltip próprio, e é ele que
  // vale aqui. Travado para o title não voltar por hábito.
  assert.strictEqual(linhaDoItem('TRANS-1').querySelector('.badge').getAttribute('title'), null);
});

check('o badge é âncora do tooltip do painel, com cabeçalho próprio', () => {
  const badge = linhaDoItem('TRANS-1').querySelector('.badge');
  assert.strictEqual(badge.dataset.helpTitle, 'Transbordo',
    'não é "Regra": o tooltip fala deste item, não de um critério de cálculo');
  assert.ok(badge.dataset.help, 'tem texto de ajuda');
});

check('o tooltip renderizado diz de qual sprint veio e quantos subitens prontos', () => {
  const badge = linhaDoItem('TRANS-1').querySelector('.badge');
  T.showHelpTooltip(badge);
  const tooltip = document.getElementById('__help-tooltip');
  assert.strictEqual(tooltip.style.display, 'block', 'o tooltip abriu');
  assert.strictEqual(tooltip.querySelector('.help-tooltip-title').textContent, 'Transbordo');
  const corpo = tooltip.querySelector('.help-tooltip-body').textContent;
  assert.match(corpo, new RegExp(ANT.name), 'nomeia a sprint de origem');
  assert.match(corpo, /3 de 4 subitens/, 'conta o que chegou pronto');
  T.hideHelpTooltip();
});

check('as demais âncoras seguem com o cabeçalho "Regra"', () => {
  // A linha da tabela tem data-help próprio (abrir os subitens). O default não
  // pode ter sido trocado junto com a introdução do título opcional.
  const tr = linhaDoItem('NOVO-1');
  assert.ok(tr.dataset.help, 'a linha tem data-help');
  T.showHelpTooltip(tr);
  const tooltip = document.getElementById('__help-tooltip');
  assert.strictEqual(tooltip.querySelector('.help-tooltip-title').textContent, 'Regra');
  T.hideHelpTooltip();
});

check('hover no badge abre o tooltip DELE, não o da linha', () => {
  // As duas âncoras são aninhadas: o badge vive dentro de um <tr data-help>.
  // A delegação usa closest(), então a de dentro tem de ganhar — senão o badge
  // mostraria "Clique para abrir os subitens" e a informação some.
  T.installHelpEvents();
  const badge = linhaDoItem('TRANS-1').querySelector('.badge');
  badge.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  const tooltip = document.getElementById('__help-tooltip');
  assert.strictEqual(tooltip.querySelector('.help-tooltip-title').textContent, 'Transbordo');
  assert.match(tooltip.querySelector('.help-tooltip-body').textContent, /3 de 4 subitens/);
  T.hideHelpTooltip();
});

check('as demais linhas não têm badge', () => {
  ['REPLAN-1', 'NOVO-1', 'SEMHIST-1'].forEach((chave) => {
    const tr = linhaDoItem(chave);
    assert.ok(tr, `a linha de ${chave} existe`);
    assert.strictEqual(tr.querySelector('.badge'), null, `${chave} não deve ter badge`);
  });
});

console.log(`\n${passed} testes passaram.\n`);
