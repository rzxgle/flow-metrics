// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
'use strict';

/**
 * Testes do BLOCO DE KPIs da aba "Entregas, WIP & Aging", com o script real da
 * página rodando dentro do jsdom.
 *
 * Quatro regras desta aba divergem do resto do painel. Nenhuma delas dá erro na
 * tela quando quebra — o card simplesmente mostra outro número, e foi assim que
 * dois KPIs ficaram zerados em produção sem ninguém notar:
 *
 *   1. OS KPIs IGNORAM O FILTRO DE TIPO. Cada card já declara o seu recorte de
 *      tipo no nome (Épico / nível história / Sub-task), então o filtro da barra
 *      só podia subtrair. O padrão dele são os tipos crus `Enabler`, `Melhoria`,
 *      `Story` e `Technical Debt`, onde não existe um único Epic nem um único
 *      subitem: "Épicos entregues" e "Sub-tasks concluídas" vinham ZERO em todo
 *      recorte padrão, com 8.768 sub-tasks concluídas na base real. Os OUTROS
 *      filtros (Squad, VS, PI...) continuam valendo — o teste fixa as duas
 *      metades dessa regra.
 *
 *   2. ÉPICO TEM DATA DE ENTREGA PRÓPRIA. A janela de datas geral exige
 *      `Data Conclusao` (= Fim real || Conclusão), que épico não recebe neste
 *      workflow: 5 dos 75 épicos concluídos da base têm a data, e nenhum deles
 *      numa janela de 30 dias. Para Épico a janela cai em `Data Entrega Sprint`
 *      (primeira transição para a categoria Done, do changelog). O fallback é
 *      SÓ para Épico de propósito: aplicá-lo aos outros tipos moveria os
 *      números das abas que compartilham o recorte geral.
 *
 *   3. "HISTÓRIAS ENTREGUES" É O NÍVEL HISTÓRIA INTEIRO: História, Enabler e
 *      Débito Técnico. Bug fica fora por decisão do time, e Dependência pela
 *      regra geral de que ela não é trabalho de entrega da squad. Antes o card
 *      olhava só o grupo 'História' e deixava Enabler e Débito Técnico sem
 *      aparecer em nenhum KPI, embora entrassem no percentual e nos gráficos.
 *
 *   4. "% CONCLUSÃO GERAL" LÊ SÓ O NÍVEL HISTÓRIA, E COM A MESMA BASE NOS DOIS
 *      LADOS. Duas correções de leitura no mesmo indicador. (a) Somar todos os
 *      grupos fazia dele um retrato de SUBITEM: na base real Sub-task fecha
 *      2.654 dos 3.434 itens da janela, com 82% de conclusão contra 67% de
 *      História, e o agregado marcava 77% — restrito ao nível história dá 69%.
 *      O numerador é o próprio card de Histórias entregues. (b) Antes só o
 *      numerador respeitava a janela de datas e o denominador não, então o
 *      percentual caía só por estreitar o período. Cancelados entram no
 *      denominador de propósito: são o contraponto do indicador.
 *
 * jsdom porque o objeto do teste é o que a tela produz. Sem rede: DATA
 * sintética, Chart e canvas são stubs.
 *
 * Rode com:  npm run test:wip
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

const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub {
  constructor() {}

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
  selections, getFiltered, getFilteredNoDate, SKIP_TIPO, DEFAULT_TIPO,
  GRUPOS_NIVEL_HISTORIA, dataEntregaEfetiva, dentroDoPeriodoDeEntrega,
  dateRange, renderWip, __cardDrills,
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética ---------- */
let seq = 0;
/** Item concluído. `over` sobrescreve tipo, grupo, datas e flags. */
const item = (over = {}) => {
  seq += 1;
  return {
    Chave: `TESTE-${seq}`, Resumo: 'item', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Afya One', VS: 'VS X', Squad: 'Squad X', PI: 'PI3', Labels: [],
    Status: 'Pronto p/ Deploy STG', Concluido: true, Cancelado: false, WIP: false,
    FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': 1, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-07-01', 'Data Conclusao': '2026-07-10', 'Data Entrega Sprint': '2026-07-10',
    'Data Inicio Real': '2026-07-02', AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: '07',
    AnoMesConclusao: '2026-07', AnoConclusao: 2026, CycleTimeDias: 8, LeadTimeDias: 10,
    AgingDias: null, parentKey: null, parent: null, EpicoChave: null,
    ...over,
  };
};
/** Épico como o Jira realmente entrega: sem Data Conclusao, só com changelog. */
const epico = (entregaSprint, over = {}) => item({
  'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico',
  'Data Conclusao': null, 'Data Fim Real': null,
  'Data Entrega Sprint': entregaSprint, OrigemEntregaSprint: 'changelog',
  ...over,
});
const subtask = (over = {}) => item({
  'Tipo de item': 'Sub-imp', 'Tipo Agrupado': 'Sub-task', Status: 'Concluído', ...over,
});

/** Desenha a aba do jeito que renderAll desenha e devolve os KPIs por rótulo. */
const desenhar = () => {
  T.renderWip(T.getFiltered(), T.getFilteredNoDate(), T.getFilteredNoDate(T.SKIP_TIPO));
  const out = {};
  document.querySelectorAll('#wip-kpis .kpi').forEach((kpi) => {
    out[kpi.querySelector('.eyebrow').textContent.trim()] = {
      valor: Number(kpi.querySelector('.val').textContent.replace(/[^\d]/g, '')),
      sub: (kpi.querySelector('.delta')?.textContent || '').trim(),
      regra: kpi.dataset.kpiRule || '',
    };
  });
  return out;
};
const periodo = (from, to) => { T.dateRange.from = from; T.dateRange.to = to; };
/** Aplica o filtro de Tipo PADRÃO da barra, que é o estado real de abertura. */
const filtroTipoPadrao = () => {
  T.selections['Tipo de item'].clear();
  T.DEFAULT_TIPO.forEach((t) => T.selections['Tipo de item'].add(t));
};

T.activeTab = 'wip';

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nA aba carrega e o bloco de KPIs existe:');

check('o container de KPIs está na aba e ganha os cinco cards', () => {
  T.DATA = [item()];
  periodo(null, null);
  const k = desenhar();
  assert.deepStrictEqual(Object.keys(k), [
    'Épicos entregues', 'Histórias entregues', 'Sub-tasks concluídas',
    '% conclusão geral', 'WIP total',
  ]);
});

check('nenhum erro de execução no jsdom', () => {
  assert.deepStrictEqual(erros, []);
});

console.log('\n1. Os KPIs ignoram o filtro de Tipo (e só ele):');

check('com o filtro de Tipo PADRÃO, Épico e Sub-task ainda contam', () => {
  // Nenhum destes tipos crus está em DEFAULT_TIPO: era exatamente o caso que
  // zerava os dois cards em produção.
  T.DATA = [epico('2026-07-10'), epico('2026-07-11'), subtask(), subtask(), subtask()];
  periodo(null, null);
  filtroTipoPadrao();
  const k = desenhar();
  assert.strictEqual(k['Épicos entregues'].valor, 2, 'épicos');
  assert.strictEqual(k['Sub-tasks concluídas'].valor, 3, 'sub-tasks');
});

check('selecionar UM tipo na barra não muda os KPIs', () => {
  T.DATA = [epico('2026-07-10'), subtask(), item()];
  periodo(null, null);
  T.selections['Tipo de item'].clear();
  T.selections['Tipo de item'].add('Story');
  const comFiltro = desenhar();
  T.selections['Tipo de item'].clear();
  const semFiltro = desenhar();
  assert.deepStrictEqual(comFiltro, semFiltro);
});

check('os OUTROS filtros continuam valendo nos KPIs', () => {
  T.DATA = [subtask(), subtask({ Squad: 'Squad Y' })];
  periodo(null, null);
  filtroTipoPadrao();
  T.selections.Squad.add('Squad X');
  assert.strictEqual(desenhar()['Sub-tasks concluídas'].valor, 1, 'só a Squad X');
  T.selections.Squad.clear();
  assert.strictEqual(desenhar()['Sub-tasks concluídas'].valor, 2, 'sem recorte de squad');
});

console.log('\n2. Épico tem data de entrega própria (fallback de changelog):');

check('sem Data Conclusao, a janela usa a Data Entrega Sprint do épico', () => {
  T.DATA = [epico('2026-07-10'), epico('2026-06-01')];
  periodo('2026-07-01', '2026-07-31');
  filtroTipoPadrao();
  const k = desenhar();
  assert.strictEqual(k['Épicos entregues'].valor, 1, 'só o épico entregue em julho');
});

check('o subtítulo conta quantos épicos entraram pelo changelog', () => {
  T.DATA = [epico('2026-07-10'), item({ 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico' })];
  periodo('2026-07-01', '2026-07-31');
  const k = desenhar();
  assert.strictEqual(k['Épicos entregues'].valor, 2);
  assert.match(k['Épicos entregues'].sub, /^1 pela data de changelog$/);
});

check('o fallback NÃO vale para os outros tipos', () => {
  // Uma história sem Data Conclusao, com Data Entrega Sprint dentro da janela,
  // tem de ficar FORA: estender o fallback moveria as outras abas.
  T.DATA = [
    item({ 'Data Conclusao': null, 'Data Entrega Sprint': '2026-07-10' }),
    subtask({ 'Data Conclusao': null, 'Data Entrega Sprint': '2026-07-10' }),
  ];
  periodo('2026-07-01', '2026-07-31');
  const k = desenhar();
  assert.strictEqual(k['Histórias entregues'].valor, 0, 'história sem data fica fora');
  assert.strictEqual(k['Sub-tasks concluídas'].valor, 0, 'sub-task sem data fica fora');
  assert.strictEqual(T.dataEntregaEfetiva(T.DATA[0]), null);
});

check('sem período selecionado, item sem data alguma entra', () => {
  T.DATA = [item({ 'Data Conclusao': null, 'Data Entrega Sprint': null })];
  periodo(null, null);
  assert.strictEqual(desenhar()['Histórias entregues'].valor, 1);
});

console.log('\n3. "Histórias entregues" é o nível história inteiro:');

check('conta História, Enabler e Débito Técnico', () => {
  assert.deepStrictEqual(Array.from(T.GRUPOS_NIVEL_HISTORIA), ['História', 'Enabler', 'Débito Técnico']);
  T.DATA = [
    item(),
    item({ 'Tipo de item': 'Melhoria' }),
    item({ 'Tipo de item': 'Enabler', 'Tipo Agrupado': 'Enabler' }),
    item({ 'Tipo de item': 'Technical Debt', 'Tipo Agrupado': 'Débito Técnico' }),
  ];
  periodo(null, null);
  filtroTipoPadrao();
  assert.strictEqual(desenhar()['Histórias entregues'].valor, 4);
});

check('Bug, Dependência, Épico e Sub-task ficam fora do card de histórias', () => {
  T.DATA = [
    item({ 'Tipo de item': 'Bug', 'Tipo Agrupado': 'Bug', Status: 'Concluído' }),
    item({ 'Tipo de item': 'Dependência', 'Tipo Agrupado': 'Dependência' }),
    epico('2026-07-10'),
    subtask(),
  ];
  periodo(null, null);
  assert.strictEqual(desenhar()['Histórias entregues'].valor, 0);
});

check('o subtítulo mostra a composição, só com os grupos presentes', () => {
  T.DATA = [
    item(), item(),
    item({ 'Tipo de item': 'Enabler', 'Tipo Agrupado': 'Enabler' }),
  ];
  periodo(null, null);
  const sub = desenhar()['Histórias entregues'].sub;
  assert.strictEqual(sub, '2 História · 1 Enabler', sub);
});

console.log('\n4. "% conclusão geral" lê só o nível história, com base única:');

const cancelado = (over = {}) => item({
  Status: 'CANCELADO', Concluido: false, Cancelado: true, EntregueAmplo: false,
  FaseFluxo: 'Cancelado', ...over,
});

check('é concluídos / fechados no período, cancelados no denominador', () => {
  T.DATA = [
    item({ 'Data Conclusao': '2026-07-10' }),
    item({ 'Data Conclusao': '2026-07-11' }),
    cancelado({ 'Data Conclusao': '2026-07-12' }),
  ];
  periodo('2026-07-01', '2026-07-31');
  const k = desenhar();
  assert.strictEqual(k['% conclusão geral'].valor, 67, '2 de 3');
  assert.strictEqual(k['% conclusão geral'].sub, '2 de 3 do nível história · 1 cancelados');
});

check('subitem NÃO entra no percentual, nem em cima nem embaixo', () => {
  // O caso que motivou a regra: subitem é 4x o volume do nível história e tem
  // taxa de conclusão mais alta, então dominava o agregado. Aqui as 8 sub-tasks
  // concluídas não podem mover o 50% do nível história.
  const historias = [item(), cancelado()];
  const subs = Array.from({ length: 8 }, () => subtask());
  T.DATA = historias.concat(subs);
  periodo(null, null);
  const k = desenhar();
  assert.strictEqual(k['% conclusão geral'].valor, 50, '1 de 2 histórias');
  assert.strictEqual(k['% conclusão geral'].sub, '1 de 2 do nível história · 1 cancelados');
  assert.strictEqual(k['Sub-tasks concluídas'].valor, 8, 'mas o card de subitem conta');
});

check('Épico, Bug e Dependência também ficam fora do percentual', () => {
  T.DATA = [
    item(), cancelado(),
    epico('2026-07-10'), epico('2026-07-11'),
    item({ 'Tipo de item': 'Bug', 'Tipo Agrupado': 'Bug', Status: 'Concluído' }),
    item({ 'Tipo de item': 'Dependência', 'Tipo Agrupado': 'Dependência' }),
  ];
  periodo(null, null);
  assert.strictEqual(desenhar()['% conclusão geral'].valor, 50, '1 de 2 histórias');
});

check('o numerador do percentual é o próprio card de Histórias entregues', () => {
  T.DATA = [
    item(),
    item({ 'Tipo de item': 'Enabler', 'Tipo Agrupado': 'Enabler' }),
    item({ 'Tipo de item': 'Technical Debt', 'Tipo Agrupado': 'Débito Técnico' }),
    cancelado(), subtask(), epico('2026-07-10'),
  ];
  periodo(null, null);
  const k = desenhar();
  assert.strictEqual(k['Histórias entregues'].valor, 3);
  assert.strictEqual(k['% conclusão geral'].valor, 75, '3 de 4 (3 entregues + 1 cancelado)');
});

check('estreitar o período NÃO derruba o percentual sozinho', () => {
  // O bug antigo: numerador com janela, denominador sem. Aqui os dois itens de
  // junho saem juntos do numerador e do denominador, e o % fica igual.
  T.DATA = [
    item({ 'Data Conclusao': '2026-07-10' }),
    item({ 'Data Conclusao': '2026-06-10' }),
    item({ 'Data Conclusao': '2026-06-11' }),
  ];
  periodo(null, null);
  const amplo = desenhar()['% conclusão geral'].valor;
  periodo('2026-07-01', '2026-07-31');
  const estreito = desenhar()['% conclusão geral'].valor;
  assert.strictEqual(amplo, 100);
  assert.strictEqual(estreito, 100, 'o % não pode cair por recorte de período');
});

check('itens em aberto não entram no denominador do %', () => {
  T.DATA = [
    item({ 'Data Conclusao': '2026-07-10' }),
    item({
      Status: 'Desenvolvimento', Concluido: false, WIP: true, EntregueAmplo: false,
      FaseFluxo: 'Em andamento', 'Data Conclusao': null, 'Data Entrega Sprint': null,
      AgingDias: 20, 'Data Inicio Real': '2026-07-05',
    }),
  ];
  periodo('2026-07-01', '2026-07-31');
  const k = desenhar();
  assert.strictEqual(k['% conclusão geral'].valor, 100, 'WIP não é um "não entregue"');
  assert.strictEqual(k['WIP total'].valor, 1, 'mas continua contado no WIP total');
});

check('base vazia não gera NaN', () => {
  T.DATA = [item({ 'Data Conclusao': '2026-01-05', 'Data Entrega Sprint': '2026-01-05' })];
  periodo('2026-07-01', '2026-07-31');
  const k = desenhar();
  assert.strictEqual(k['% conclusão geral'].valor, 0);
});

check('recorte só com subitem não gera NaN nem 100%', () => {
  T.DATA = [subtask(), subtask()];
  periodo(null, null);
  const k = desenhar();
  assert.strictEqual(k['% conclusão geral'].valor, 0, 'sem nível história, sem percentual');
  assert.strictEqual(k['Sub-tasks concluídas'].valor, 2);
});

console.log('\nDrills e tooltips acompanham as regras:');

check('cada card abre o drill com os itens que ele contou', () => {
  T.DATA = [epico('2026-07-10'), item(), subtask(), subtask()];
  periodo(null, null);
  filtroTipoPadrao();
  desenhar();
  const d = T.__cardDrills;
  assert.strictEqual(d.wip_epicos.issues.length, 1);
  assert.strictEqual(d.wip_historias.issues.length, 1);
  assert.strictEqual(d.wip_subtasks.issues.length, 2);
  assert.strictEqual(d.wip_concl.issues.length, 1, 'base do %: só o nível história');
});

check('as regras dos cards cabem no limite de 170 caracteres do tooltip', () => {
  // Acima disso enhanceHelpTooltips descarta o texto e cai no genérico.
  T.DATA = [item()];
  periodo(null, null);
  const k = desenhar();
  ['Épicos entregues', 'Histórias entregues', 'Sub-tasks concluídas', '% conclusão geral']
    .forEach((label) => {
      const regra = k[label].regra;
      assert.ok(regra.length > 0, `${label} sem data-kpi-rule`);
      assert.ok(regra.length <= 170, `${label}: ${regra.length} caracteres`);
    });
});

console.log(`\n${passed} verificações OK\n`);
