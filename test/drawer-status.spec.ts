// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
'use strict';

/**
 * Testes da cor do badge de status no drawer de itens.
 *
 * A decisão de produto que este arquivo fixa: a cor do status NÃO se decide por
 * pedaço de texto do nome do status, e sim pela fase de fluxo — as mesmas listas
 * de `config/classification.rules.js` que alimentam todas as métricas.
 *
 *   doneStatuses       -> verde  (.ok)
 *   pendingStatuses    -> cinza  (.pending)
 *   inProgressStatuses -> azul   (.progress)
 *   cancelledStatuses  -> rosa   (.risk)
 *   fora de todas      -> azul   (.progress), igual ao backend, que joga status
 *                                 desconhecido em "Em andamento" para nunca
 *                                 ficar fora das contagens.
 *
 * A versão anterior adivinhava por substring e errava em três casos que estão
 * travados aqui: "Deploy em Staging" e "Homologação integrada" (concluídos)
 * saíam azuis por casar com "staging"/"homologa", e "PRONTO PARA PROD" e
 * "Pronto p/ Deploy STG" (concluídos) saíam cinza por não casar com nada.
 *
 * As listas vêm do módulo real e as fases do IssueClassifier real: se um status
 * mudar de lista amanhã, o teste acompanha em vez de mentir.
 *
 * jsdom porque o que está sob teste é o HTML que a tela produz. Sem rede.
 *
 * Rode com:  npm run test:drawer
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rules = require('../src/config/classification.rules');
const IssueClassifier = require('../src/domain/services/IssueClassifier');

const classifier = new IssueClassifier(rules);

/* ---------- boot da página real dentro do jsdom ---------- */
const loadDashboardHtml = require('./support/dashboardHtml');
const html = loadDashboardHtml();
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole });
const { window } = dom;
const { document } = window;

const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub {
  constructor() {} destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

const epilogo = '\n;window.__T = { openDrawer, drawerStatusTone };';
window.eval(script + epilogo);
const T = window.__T;

/* ---------- fixture ----------
   Um item por status conhecido, com a FaseFluxo que o backend gravaria, mais um
   status inexistente e um item sem status nenhum. */
const STATUS_DESCONHECIDO = 'STATUS QUE NAO EXISTE NO JIRA';

const item = (status, comFase) => ({
  Chave: `X-${status || 'VAZIO'}`, Resumo: status || '(sem status)',
  'Tipo de item': 'História', 'Tipo Agrupado': 'História',
  Status: status, Squad: 'Squad X', Sprints: [], PI: 'PI3',
  ...(comFase ? { FaseFluxo: classifier.phaseOf(status) } : {}),
});

const TODOS_OS_STATUS = [
  ...rules.doneStatuses,
  ...rules.pendingStatuses,
  ...rules.inProgressStatuses,
  ...rules.cancelledStatuses,
  STATUS_DESCONHECIDO,
];

const esperado = (status) => {
  if (rules.cancelledStatuses.includes(status)) return 'risk';
  if (rules.doneStatuses.includes(status)) return 'ok';
  if (rules.pendingStatuses.includes(status)) return 'pending';
  return 'progress'; // inProgressStatuses e qualquer status fora das listas
};

/* ---------- helpers de leitura da tela ---------- */
/** Abre o drawer e devolve { status -> classe de tom do badge }. */
function tonsRenderizados(itens) {
  T.openDrawer('Teste', itens);
  const mapa = new Map();
  Array.from(document.querySelectorAll('#__drawer-body tbody tr')).forEach((tr) => {
    const badge = tr.querySelectorAll('td')[3].querySelector('.drawer-badge.status');
    const tom = Array.from(badge.classList).filter((c) => c !== 'drawer-badge' && c !== 'status');
    mapa.set(badge.textContent, tom.join(' '));
  });
  return mapa;
}

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nDrawer de itens — cor do badge de status:');

/* ---------- 1. caminho normal: item com FaseFluxo do backend ---------- */
const comFase = tonsRenderizados(TODOS_OS_STATUS.map((s) => item(s, true)));

check('todo status conhecido recebe a cor da sua lista', () => {
  const errados = TODOS_OS_STATUS
    .map((s) => ({ status: s, obtido: comFase.get(s), esperado: esperado(s) }))
    .filter((r) => r.obtido !== r.esperado);
  assert.deepStrictEqual(errados, [], `tons divergentes: ${JSON.stringify(errados)}`);
});

check('nenhum status fica sem cor (o cinza é decisão, não sobra)', () => {
  const semTom = TODOS_OS_STATUS.filter((s) => !comFase.get(s));
  assert.deepStrictEqual(semTom, [], 'todo badge sai com uma classe de tom explícita');
});

check('todos os doneStatuses saem no MESMO verde do PRONTO PARA ATIVAÇÃO DE VALOR', () => {
  const referencia = comFase.get('PRONTO PARA ATIVAÇÃO DE VALOR');
  assert.strictEqual(referencia, 'ok', 'o status de referência do print segue verde');
  rules.doneStatuses.forEach((s) => {
    assert.strictEqual(comFase.get(s), referencia, `${s} deveria usar o verde de concluído`);
  });
});

check('regressão: os quatro concluídos que saíam com a cor errada', () => {
  // Estes são exatamente os casos do print. Se a heurística de substring voltar,
  // é aqui que ela morre.
  ['Deploy em Staging', 'Homologação integrada'].forEach((s) => {
    assert.strictEqual(comFase.get(s), 'ok', `${s} é concluído, não "em andamento" azul`);
  });
  ['PRONTO PARA PROD', 'Pronto p/ Deploy STG'].forEach((s) => {
    assert.strictEqual(comFase.get(s), 'ok', `${s} é concluído, não cinza`);
  });
});

check('status fora de todas as listas vai para o azul de "em andamento"', () => {
  assert.strictEqual(comFase.get(STATUS_DESCONHECIDO), 'progress');
});

check('cancelado mantém a cor própria — não se disfarça de concluído', () => {
  rules.cancelledStatuses.forEach((s) => assert.strictEqual(comFase.get(s), 'risk'));
});

/* ---------- 2. fallback: item sem FaseFluxo (dataset antigo em cache) ---------- */
window.__RULES_DONE = rules.doneStatuses;
window.__RULES_PENDING = rules.pendingStatuses;
window.__RULES_INPROG = rules.inProgressStatuses;
window.__RULES_CANCELLED = rules.cancelledStatuses;

const semFase = tonsRenderizados(TODOS_OS_STATUS.map((s) => item(s, false)));

check('sem FaseFluxo, as listas do meta dão o mesmo resultado', () => {
  const errados = TODOS_OS_STATUS
    .map((s) => ({ status: s, obtido: semFase.get(s), esperado: esperado(s) }))
    .filter((r) => r.obtido !== r.esperado);
  assert.deepStrictEqual(errados, [], `tons divergentes no fallback: ${JSON.stringify(errados)}`);
});

check('a comparação do fallback ignora espaço e caixa, como no PI tracking', () => {
  assert.strictEqual(T.drawerStatusTone({}, '  pronto para prod  '), 'ok');
  assert.strictEqual(T.drawerStatusTone({}, 'backlog'), 'pending');
});

check('sem listas no meta, status desconhecido não quebra a renderização', () => {
  window.__RULES_DONE = undefined; window.__RULES_PENDING = undefined;
  window.__RULES_INPROG = undefined; window.__RULES_CANCELLED = undefined;
  assert.strictEqual(T.drawerStatusTone({}, 'PRONTO PARA PROD'), 'progress',
    'sem regra carregada, o item aberto continua azul em vez de estourar');
});

/* ---------- 3. item sem status ---------- */
check('item sem status fica neutro, sem herdar cor de fase', () => {
  const vazio = tonsRenderizados([item('', true), item(null, true)]);
  assert.strictEqual(vazio.get('Não informado'), '', 'badge "Não informado" sai sem tom');
});

console.log(`\n${passed} verificações OK\n`);
