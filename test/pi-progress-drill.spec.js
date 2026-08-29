'use strict';

/**
 * Testes do drill-down pela barra de progresso da aba PI Tracking.
 *
 * A decisão de produto fixada aqui: na LINHA DO ÉPICO, cada segmento da barra
 * (concluído | em andamento | pendente) é clicável e abre no drawer exatamente
 * os itens daquela fase — os mesmos que o tooltip de hover anuncia. Na barra do
 * CABEÇALHO DA SQUAD não é: ela consolida vários épicos, e aquele cabeçalho já
 * tem o clique de recolher/expandir.
 *
 * O que este teste protege, e que é fácil quebrar sem perceber:
 *  - o número do tooltip e a quantidade de linhas abertas serem a MESMA coisa
 *    (se um dia a barra e o drawer forem calculados em lugares diferentes, é
 *    aqui que a divergência aparece);
 *  - clicar no segmento não recolher a squad por tabela;
 *  - o teclado funcionar, já que o segmento é um <i> com role="button" e não um
 *    <button> de verdade.
 *
 * jsdom porque o que está sob teste é interação com o HTML real da página.
 * Sem rede: PI_DATA sintética; Chart, canvas e fetch são stubs.
 *
 * Rode com:  npm run test:pi-drill
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const quarterRules = require('../dist/src/config/quarter.rules');

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

const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub { constructor() {} destroy() {} update() {} resize() {} }
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

const epilogo = `
;window.__T = {
  set PI_DATA(v){ PI_DATA.length=0; PI_DATA.push(...v); },
  renderPiTracking, piExpandedSquads, piBuildTracking,
  get drawerTitle(){ return __drawerTitle; },
  get drawerIssues(){ return __drawerIssues; },
  closeDrawer,
};`;
window.eval(script + epilogo);
const T = window.__T;

window.__QUARTER_RULES = quarterRules;

/* ---------- cenário sintético ----------
   Um épico com as três fases povoadas, um só com pendentes, e um vazio. */
const issue = (over) => ({
  Chave: 'X-0', Resumo: '', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
  Programa: 'Afya One', VS: 'CORE EXPERIENCE', Squad: 'Squad A', PI: 'PI3 - Afya One',
  Labels: [], Status: 'Backlog', EpicoChave: null, parentKey: null, Sprints: [],
  Concluido: false, Cancelado: false, 'Story Points': 0, ...over,
});
const epico = (chave, over) => issue({
  Chave: chave, Resumo: `Épico ${chave}`, 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico',
  EpicoChave: chave, ...over,
});
const filho = (chave, epicKey, status) => issue({
  Chave: chave, Resumo: `Filho ${chave}`, EpicoChave: epicKey, parentKey: epicKey, Status: status,
});

/* E-1: 2 concluídos, 1 em andamento, 3 pendentes, 1 cancelado (fora da barra). */
const DADOS = [
  epico('E-1', { Status: 'Desenvolvimento' }),
  filho('D-1', 'E-1', 'Done'),
  filho('D-2', 'E-1', 'PRONTO PARA PROD'),
  filho('A-1', 'E-1', 'Desenvolvimento'),
  filho('P-1', 'E-1', 'Backlog'),
  filho('P-2', 'E-1', 'Refinamento técnico'),
  filho('P-3', 'E-1', 'PRIORIZADO'),
  filho('C-1', 'E-1', 'CANCELADO'),

  /* E-2: só pendentes — a barra tem um único segmento. */
  epico('E-2', { Status: 'Backlog' }),
  filho('P-4', 'E-2', 'Backlog'),

  /* E-3: sem filhos — barra vazia, nada clicável. */
  epico('E-3', { Status: 'Backlog' }),
];
T.PI_DATA = DADOS;
T.piExpandedSquads.add('Squad A');
T.renderPiTracking();

/* ---------- helpers de leitura da tela ---------- */
const linhaDoEpico = (chave) => Array.from(document.querySelectorAll('#pi-squads tbody tr'))
  .find((tr) => tr.querySelector('.pi-epic-key').textContent === chave);
const segmentos = (chave) => Array.from(linhaDoEpico(chave).querySelectorAll('.pi-meter i'));
const segmento = (chave, fase) => segmentos(chave).find((i) => i.getAttribute('data-pi-phase') === fase);
const barraDaSquad = () => document.querySelector('.pi-squad-head .pi-meter');
const clicar = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const teclar = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
// Array.from para trazer a lista do realm do jsdom para o do teste — sem isso o
// deepStrictEqual reprova por protótipo diferente, com o mesmo conteúdo.
const chavesNoDrawer = () => Array.from(T.drawerIssues, (d) => d.Chave).sort();
/** Quantidade que o tooltip do segmento anuncia ("Pendente: 3 itens · ..."). */
const itensNoTooltip = (el) => Number(el.dataset.help.match(/:\s*(\d+)\s*itens/)[1]);

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nPI Tracking — drill-down pela barra de progresso:');

check('a linha do épico tem um segmento clicável por fase com valor', () => {
  const fases = segmentos('E-1').map((i) => i.getAttribute('data-pi-phase'));
  assert.deepStrictEqual(fases, ['done', 'inProgress', 'todo'], 'na ordem da barra');
  segmentos('E-1').forEach((i) => {
    assert.strictEqual(i.getAttribute('role'), 'button');
    assert.strictEqual(i.getAttribute('tabindex'), '0');
    assert.strictEqual(i.getAttribute('data-pi-epic'), 'E-1');
  });
});

check('fase sem itens não gera segmento (não há alvo clicável vazio)', () => {
  const fases = segmentos('E-2').map((i) => i.getAttribute('data-pi-phase'));
  assert.deepStrictEqual(fases, ['todo'], 'E-2 só tem pendentes');
});

check('épico sem itens elegíveis segue com a barra vazia e inerte', () => {
  const meter = linhaDoEpico('E-3').querySelector('.pi-meter');
  assert.ok(meter.classList.contains('empty'));
  assert.strictEqual(meter.querySelector('[data-pi-phase]'), null);
});

check('a barra do cabeçalho da squad NÃO é clicável', () => {
  // Decisão de produto: ela consolida vários épicos e o cabeçalho já tem o
  // clique de recolher/expandir. Se um dia isso mudar, é aqui que aparece.
  assert.strictEqual(barraDaSquad().querySelector('[data-pi-phase]'), null);
  Array.from(barraDaSquad().querySelectorAll('i')).forEach((i) => {
    assert.strictEqual(i.getAttribute('role'), null);
    assert.ok(!i.dataset.help.includes('clique'), 'e não promete clique que não existe');
  });
});

check('clicar em "pendente" abre no drawer só os pendentes do épico', () => {
  clicar(segmento('E-1', 'todo'));
  assert.deepStrictEqual(chavesNoDrawer(), ['P-1', 'P-2', 'P-3']);
  assert.ok(T.drawerTitle.startsWith('Pendente · E-1'), `título: ${T.drawerTitle}`);
  T.closeDrawer();
});

check('clicar em "em andamento" abre só os itens em andamento', () => {
  clicar(segmento('E-1', 'inProgress'));
  assert.deepStrictEqual(chavesNoDrawer(), ['A-1']);
  assert.ok(T.drawerTitle.startsWith('Em andamento · E-1'), `título: ${T.drawerTitle}`);
  T.closeDrawer();
});

check('clicar em "concluído" abre só os concluídos — cancelado fica fora', () => {
  clicar(segmento('E-1', 'done'));
  assert.deepStrictEqual(chavesNoDrawer(), ['D-1', 'D-2']);
  assert.ok(!chavesNoDrawer().includes('C-1'), 'cancelado não conta como entrega');
  assert.ok(T.drawerTitle.startsWith('Concluído · E-1'), `título: ${T.drawerTitle}`);
  T.closeDrawer();
});

check('o número do tooltip é o número de linhas que o clique abre', () => {
  // O ponto do drill-down: o que o hover promete é o que o clique entrega.
  ['done', 'inProgress', 'todo'].forEach((fase) => {
    const seg = segmento('E-1', fase);
    clicar(seg);
    assert.strictEqual(T.drawerIssues.length, itensNoTooltip(seg), `divergência na fase ${fase}`);
    T.closeDrawer();
  });
});

check('o tooltip do segmento clicável avisa que é clicável', () => {
  assert.ok(segmento('E-1', 'todo').dataset.help.includes('clique para ver a lista'));
  assert.strictEqual(segmento('E-1', 'todo').getAttribute('aria-label'),
    segmento('E-1', 'todo').dataset.help, 'o leitor de tela recebe o mesmo texto');
});

check('Enter e Espaço abrem o drawer, como num botão', () => {
  ['Enter', ' '].forEach((key) => {
    teclar(segmento('E-1', 'todo'), key);
    assert.deepStrictEqual(chavesNoDrawer(), ['P-1', 'P-2', 'P-3'], `tecla ${key}`);
    T.closeDrawer();
  });
});

check('clicar no segmento não recolhe a squad', () => {
  const card = document.querySelector('.pi-squad');
  assert.ok(!card.classList.contains('collapsed'), 'a squad começa expandida');
  clicar(segmento('E-1', 'todo'));
  assert.ok(!card.classList.contains('collapsed'), 'e continua expandida depois do clique');
  assert.ok(T.piExpandedSquads.has('Squad A'));
  T.closeDrawer();
});

check('o botão "N filhos" continua abrindo todos os filhos', () => {
  // O drill-down antigo não pode ter sido substituído pelo novo.
  clicar(linhaDoEpico('E-1').querySelector('[data-pi-kids]'));
  assert.deepStrictEqual(chavesNoDrawer(), ['A-1', 'C-1', 'D-1', 'D-2', 'P-1', 'P-2', 'P-3']);
  T.closeDrawer();
});

check('a página não registrou erro em nenhuma dessas interações', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n${passed} verificações OK\n`);
