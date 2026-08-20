'use strict';

/**
 * Testes das regras da aba PI Tracking, que vivem no script do dashboard.
 *
 * Por que rodar o script da página dentro de um vm em vez de duplicar a lógica:
 * o valor desta aba é bater com o painel de quarter que o time já usa. Testar
 * uma cópia das regras não prova nada sobre o que o navegador calcula — e é
 * exatamente a divergência silenciosa entre duas cópias que este teste existe
 * para pegar.
 *
 * O cenário sintético abaixo é pequeno de propósito, mas cobre cada decisão de
 * regra que separa esta aba das demais: sub-tarefa fora do denominador, o épico
 * fora do denominador, cancelado fora do denominador, status comparado sem
 * diferenciar maiúsculas, "Em Homologação" contando como concluído, filho sem
 * label de PI ainda contando para o épico, e épico cancelado fora de tudo.
 *
 * Rode com:  npm run test:pi
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const quarterRules = require('../src/config/quarter.rules');
const classificationRules = require('../src/config/classification.rules');

/* ---------- DOM mínimo ---------- */
function fakeEl(id) {
  return {
    id, style: {}, className: '', dataset: {}, children: [], innerHTML: '', textContent: '', value: '',
    appendChild(c) { this.children.push(c); return c; }, replaceChildren() { this.children = []; },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => fakeEl('q'), querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, closest: () => null,
  };
}
const registry = new Map();
const getEl = (id) => { if (!registry.has(id)) registry.set(id, fakeEl(id)); return registry.get(id); };

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

class ChartStub { constructor() {} destroy() {} update() {} }
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};

const sandbox = {
  document: {
    getElementById: getEl,
    querySelector: () => fakeEl('q'),
    querySelectorAll: () => [],
    createElement: (t) => fakeEl(t),
    addEventListener() {}, body: fakeEl('body'), head: fakeEl('head'), documentElement: fakeEl('html'),
  },
  Chart: ChartStub, console, setTimeout, clearTimeout,
  requestAnimationFrame: (f) => f(),
  fetch: async () => { throw new Error('sem rede no teste'); },
  location: { href: '', search: '' }, navigator: { userAgent: 'node' }, indexedDB: undefined,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// `let`/`const` do script não viram propriedades do global num vm; o epílogo roda
// no mesmo escopo lexical e expõe só o que o teste precisa.
const epilogo = `
;globalThis.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  set activeTab(v){ activeTab = v; },
  selections, piBuildTracking, piOptionsFromData, piQuarterWindow, piTimeProgress, renderPiTracking,
  piSelectedPis, syncFilterBarForTab, buildFilterBar,
  piIsDone, piIsInProgress, piIsIgnored, piIsCountableChild, piIsTransbordo,
  set isoToday(fn){ isoToday = fn; },
};`;
vm.createContext(sandbox);
vm.runInContext(`${script}${epilogo}`, sandbox, { filename: 'index.html:inline' });
const T = sandbox.__T;

sandbox.window.__QUARTER_RULES = quarterRules;

/* ---------- cenário sintético ----------
   Hoje é fixado em 15/08/2026 (dentro do Q3/2026: 01/07 a 30/09).
   46 de 92 dias decorridos => 50% do quarter percorrido. */
const HOJE = '2026-08-15';
vm.runInContext('isoToday = () => "2026-08-15";', sandbox);

function issue(over) {
  return {
    Chave: 'X-0', Resumo: '', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Afya One', VS: 'CORE EXPERIENCE', Squad: 'Squad A', PI: 'Não informado',
    Labels: [], Status: 'Backlog', EpicoChave: null, parentKey: null,
    Concluido: false, Cancelado: false, 'Story Points': 0,
    ...over,
  };
}
function epic(chave, over) {
  return issue({
    Chave: chave, 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico',
    EpicoChave: chave, PI: 'PI3 - Afya One', ...over,
  });
}
function child(chave, epicKey, status, over) {
  return issue({ Chave: chave, EpicoChave: epicKey, parentKey: epicKey, Status: status, ...over });
}

const DATA = [
  /* --- E-1 (Squad A): mede as exclusões do denominador ---------------------
     Contam:      S-1 Done, S-2 Desenvolvimento, S-3 Backlog, S-4 Em Homologação
     Não contam:  SUB-1 (sub-tarefa), C-1 (cancelado), o próprio E-1
     => válidos 4, concluídos 2 (Done + Em Homologação) = 50% */
  epic('E-1', { Squad: 'Squad A', Status: 'Desenvolvimento' }),
  child('S-1', 'E-1', 'Done'),
  child('S-2', 'E-1', 'Desenvolvimento'),
  child('S-3', 'E-1', 'Backlog'),
  child('S-4', 'E-1', 'Em Homologação'),
  child('SUB-1', 'E-1', 'Backlog', { 'Tipo de item': 'Sub-test', 'Tipo Agrupado': 'Sub-task' }),
  child('C-1', 'E-1', 'CANCELADO'),

  /* --- E-2 (Squad A): status em caixa diferente + filho sem label de PI ----
     "pronto para prod" minúsculo tem de contar como concluído.
     F-2 não tem nenhuma label de PI e ainda assim conta para o épico.
     => válidos 2, concluídos 1 = 50% */
  epic('E-2', { Squad: 'Squad A', Status: 'PRONTO PARA ATIVAÇÃO DE VALOR' }),
  child('F-1', 'E-2', 'pronto para prod', { PI: 'PI3 - Afya One' }),
  child('F-2', 'E-2', 'Refinamento técnico', { PI: 'Não informado' }),

  /* --- E-3 (Squad B): épico vazio ----------------------------------------- */
  epic('E-3', { Squad: 'Squad B', Status: 'Backlog' }),

  /* --- E-4: épico cancelado, sai de tudo (nem ele nem o filho contam) ----- */
  epic('E-4', { Squad: 'Squad B', Status: 'Cancelado' }),
  child('F-4', 'E-4', 'Done'),

  /* --- E-5: outro PI, não pode aparecer no recorte de PI3 ---------------- */
  epic('E-5', { Squad: 'Squad A', PI: 'PI2 - Afya One', Status: 'Done' }),
  child('F-5', 'E-5', 'Backlog'),

  /* --- E-6: transbordo, marcado pela label -------------------------------- */
  epic('E-6', { Squad: 'Squad B', Status: 'Desenvolvimento', Labels: ['PI2AfyaOne', 'TransbordoPI2AfyaOne'] }),
  child('F-6', 'E-6', 'Done'),
];

T.DATA = DATA;
// O PI vem do filtro do topo, não de um seletor próprio da aba.
T.selections.PI.add('PI3 - Afya One');
const t = T.piBuildTracking();

/* ---------- classificação de status ---------- */
assert.equal(T.piIsDone('Done'), true);
assert.equal(T.piIsDone('pronto para prod'), true, 'comparação de status deve ignorar caixa');
assert.equal(T.piIsDone('Em Homologação'), true, 'homologação conta como concluído nesta aba');
assert.equal(T.piIsDone('Staging'), true);
assert.equal(T.piIsDone('Backlog'), false);
assert.equal(T.piIsInProgress('Desenvolvimento'), true);
assert.equal(T.piIsIgnored('CANCELADO'), true, 'cancelado normalizado deve ser ignorado');
assert.equal(T.piIsIgnored('Inválido'), true, '"Inválido" também sai do cálculo');
assert.equal(T.piIsIgnored('Done'), false);

/* ---------- tipos que contam como filho ---------- */
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Story' }), true);
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Enabler' }), true);
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Bug' }), true);
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Technical Debt' }), true);
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Sub-test' }), false, 'sub-tarefa fica fora');
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Sub-block' }), false);
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Epic' }), false, 'épico não é filho');
assert.equal(T.piIsCountableChild({ 'Tipo de item': 'Enabler Epic' }), false);

/* ---------- recorte de épicos ---------- */
const chaves = t.epics.map((e) => e.epic.Chave).sort();
assert.deepEqual(chaves, ['E-1', 'E-2', 'E-3', 'E-6'],
  'só épicos de PI3 e não cancelados; E-4 (cancelado) e E-5 (outro PI) ficam fora');

/* ---------- agregação por épico ---------- */
const byKey = new Map(t.epics.map((e) => [e.epic.Chave, e]));
const e1 = byKey.get('E-1');
assert.equal(e1.total, 4, 'sub-tarefa, cancelado e o próprio épico saem do denominador');
assert.equal(e1.done, 2);
assert.equal(e1.inProgress, 1);
assert.equal(e1.todo, 1);
assert.equal(e1.cancelled, 1, 'cancelado é contado à parte, para aparecer sem entrar na conta');
assert.equal(e1.pct, 50);
assert.equal(e1.isEmpty, false);
assert.equal(e1.done + e1.inProgress + e1.todo, e1.total, 'as três fases têm de fechar o total');

const e2 = byKey.get('E-2');
assert.equal(e2.total, 2, 'filho sem label de PI ainda conta para o épico');
assert.equal(e2.done, 1);
assert.equal(e2.epicDone, true, 'PRONTO PARA ATIVAÇÃO DE VALOR entrega o épico');

const e3 = byKey.get('E-3');
assert.equal(e3.total, 0);
assert.equal(e3.isEmpty, true);
assert.equal(e3.pct, 0, 'épico vazio é 0%, não NaN');

assert.equal(byKey.get('E-6').transbordo, true, 'label de transbordo deve marcar o épico');
assert.equal(e1.transbordo, false);

/* ---------- agregação por squad (soma de itens, não média de percentuais) ---------- */
const squads = new Map(t.squads.map((s) => [s.squad, s]));
const a = squads.get('Squad A');
assert.equal(a.epics.length, 2);
assert.equal(a.total, 6, 'Squad A soma os 4 de E-1 com os 2 de E-2');
assert.equal(a.done, 3);
assert.equal(a.pct, 50);
const b = squads.get('Squad B');
assert.equal(b.total, 1, 'E-3 é vazio; só o filho de E-6 entra');
assert.equal(b.done, 1);
assert.equal(b.pct, 100);

// Pior primeiro: quem precisa de atenção não deve exigir rolagem.
assert.deepEqual(t.squads.map((s) => s.squad), ['Squad A', 'Squad B']);
assert.deepEqual(a.epics.map((e) => e.epic.Chave), ['E-1', 'E-2'], 'épicos ordenados por progresso');

/* ---------- KPIs ---------- */
const k = t.kpis;
assert.equal(k.totalEpics, 4);
assert.equal(k.totalItems, 7, '6 da Squad A + 1 da Squad B');
assert.equal(k.doneItems, 4);
assert.equal(Math.round(k.clusterProgress * 10) / 10, 57.1);
assert.equal(k.emptyEpics, 1);
assert.equal(k.epicsDone, 1, 'só E-2 está em status de conclusão');
assert.equal(k.epicsDonePct, 25);

/* ---------- janela e progresso do quarter ---------- */
const win = T.piQuarterWindow('PI3 - Afya One');
assert.deepEqual({ q: win.quarter, y: win.year, s: win.start, e: win.end },
  { q: 'Q3', y: 2026, s: '2026-07-01', e: '2026-09-30' });
// 01/07 a 30/09 = 92 dias; 15/08 é o 46º dia => 50%.
assert.equal(T.piTimeProgress(win), 50);
assert.equal(k.timeProgress, 50);
assert.equal(Math.round(k.gap * 10) / 10, 7.1, 'gap = progresso de entrega menos o tempo decorrido');
// Comparação estrita, como no afya-quarter: estar exatamente no ritmo do
// calendário não conta como atrasado.
assert.equal(k.squadsBehind, 0, 'Squad A com 50% não está abaixo de 50%; Squad B com 100% também não');

// Quarter que ainda não começou não pode reportar tempo negativo.
assert.equal(T.piTimeProgress({ start: '2026-10-01', end: '2026-12-31' }), 0);
// Quarter encerrado satura em 100.
assert.equal(T.piTimeProgress({ start: '2026-01-01', end: '2026-03-31' }), 100);

/* ---------- filtros do topo que se aplicam ---------- */
T.selections.Squad.add('Squad B');
const filtrado = T.piBuildTracking();
assert.equal(filtrado.squads.length, 1);
assert.equal(filtrado.kpis.totalEpics, 2, 'E-3 e E-6 são da Squad B');
assert.equal(filtrado.kpis.totalItems, 1);
T.selections.Squad.clear();

// Tipo, Status, Ano, Mês e o intervalo de datas NÃO podem afetar esta aba:
// mudariam o denominador do progresso, não o recorte. Na tela eles ficam
// escondidos; aqui garantimos que, mesmo preenchidos, não têm efeito.
T.selections['Tipo de item'].add('Story');
T.selections.Status.add('Done');
T.selections.AnoCriacao.add('2026');
T.selections.Mes.add('08');
const comRuido = T.piBuildTracking();
assert.equal(comRuido.kpis.totalItems, k.totalItems, 'Tipo/Status/Ano/Mês não se aplicam ao PI Tracking');
assert.equal(comRuido.kpis.totalEpics, k.totalEpics);
T.selections['Tipo de item'].clear();
T.selections.Status.clear();
T.selections.AnoCriacao.clear();
T.selections.Mes.clear();

/* ---------- seletor de PI ---------- */
const opcoes = T.piOptionsFromData();
assert.deepEqual(opcoes, ['PI3 - Afya One', 'PI2 - Afya One'], 'mais recente primeiro; sem PI sem quarter');
assert.equal(opcoes.includes('Não informado'), false);

/* ---------- PI desconhecido não quebra a aba ---------- */
T.selections.PI.clear();
T.selections.PI.add('PI9 - Inexistente');
const vazio = T.piBuildTracking();
assert.equal(vazio.squads.length, 0);
assert.equal(vazio.kpis.totalEpics, 0);
assert.equal(vazio.kpis.clusterProgress, 0);
assert.equal(vazio.kpis.timeProgress, null, 'sem quarter conhecido, o KPI de tempo é nulo, não 0');
assert.equal(vazio.kpis.gap, null);
T.selections.PI.clear();
T.selections.PI.add('PI3 - Afya One');

/* ---------- o PI vem do filtro do topo ----------
   Vazio = todos, como em qualquer filtro da barra. E com mais de um PI os KPIs
   temporais têm de sumir, não somar dois quarters. */
T.selections.PI.clear();
assert.deepEqual(T.piSelectedPis(), ['PI3 - Afya One', 'PI2 - Afya One'],
  'filtro vazio significa todos os PIs reconhecidos');
const todos = T.piBuildTracking();
assert.equal(todos.kpis.totalEpics, 5, 'E-5 (PI2) entra quando nenhum PI está filtrado');
assert.equal(todos.window, null, 'sem PI único não há janela de quarter');
assert.equal(todos.kpis.timeProgress, null);
assert.equal(todos.kpis.gap, null);
assert.equal(todos.kpis.squadsBehind, null, 'squads atrasadas depende da régua temporal');
assert.ok(todos.kpis.clusterProgress > 0, 'o progresso de entrega continua valendo com vários PIs');

T.selections.PI.add('PI3 - Afya One');
T.selections.PI.add('PI2 - Afya One');
const dois = T.piBuildTracking();
assert.equal(dois.pis.length, 2);
assert.equal(dois.window, null, 'dois PIs selecionados: nenhuma janela');
assert.equal(dois.kpis.totalEpics, 5);

T.selections.PI.clear();
T.selections.PI.add('PI3 - Afya One');
const umSo = T.piBuildTracking();
assert.deepEqual(umSo.pis, ['PI3 - Afya One']);
assert.ok(umSo.window, 'um PI só volta a ter janela de quarter');
assert.equal(umSo.kpis.timeProgress, 50);

/* ---------- coerência entre os dois arquivos de regras ----------
   As labels de transbordo têm de existir nas regras de PI (senão a aba nunca
   marca transbordo) E no mapa de PI (senão os itens caem em "Não informado"). */
const labelsDePi = new Set(classificationRules.piRulesInPriorityOrder.map((r) => r.label));
for (const label of quarterRules.transbordoLabels) {
  assert.ok(labelsDePi.has(label), `label de transbordo "${label}" precisa estar em piRulesInPriorityOrder`);
}
// Todo PI reconhecido pelas labels deve ter uma janela de quarter, ou o KPI de
// tempo aparece vazio para ele sem explicação.
const pisConhecidos = new Set(classificationRules.piRulesInPriorityOrder.map((r) => r.pi));
for (const pi of pisConhecidos) {
  assert.ok(quarterRules.piPeriods[pi], `PI "${pi}" não tem janela de quarter em piPeriods`);
  const periodo = quarterRules.piPeriods[pi];
  assert.ok(quarterRules.quarterBounds[periodo.quarter], `quarter "${periodo.quarter}" sem limites`);
}
// Um transbordo tem de cair no PI de DESTINO, nunca no de origem.
const piDe = (label) => classificationRules.piRulesInPriorityOrder.find((r) => r.label === label).pi;
assert.equal(piDe('TransbordoPI2AfyaOne'), 'PI3 - Afya One');
assert.equal(piDe('LegadoTransbordoP126'), 'PI2 - Legado');
assert.equal(piDe('LegadoTransbordoP226'), 'PI3 - Legado');
// E a ordem tem de fazer o transbordo vencer o label do PI de origem.
const ordem = classificationRules.piRulesInPriorityOrder.map((r) => r.label);
assert.ok(ordem.indexOf('TransbordoPI2AfyaOne') < ordem.indexOf('PI2AfyaOne'),
  'transbordo precisa ser avaliado antes do PI de origem');
assert.ok(ordem.indexOf('LegadoTransbordoP226') < ordem.indexOf('EpicoPI2Legado'));

/* ---------- renderização ----------
   piBuildTracking pode estar certo e a tela ainda quebrar num nome de variável
   errado dentro do template. Este bloco exercita o caminho que o usuário vê. */
T.renderPiTracking();
const kpisHtml = getEl('pi-kpis').innerHTML;
const squadsHtml = getEl('pi-squads').innerHTML;

assert.ok(kpisHtml.includes('Progresso do PI'), 'KPI de progresso do PI deve ser renderizado');
assert.ok(kpisHtml.includes('Épicos entregues'));
assert.ok(kpisHtml.includes('Quarter percorrido'));
assert.ok(kpisHtml.includes('Gap plano × tempo'));
assert.ok(kpisHtml.includes('Épicos vazios'));
assert.ok(kpisHtml.includes('Squads abaixo do esperado'));
assert.ok(kpisHtml.includes('57,1'), 'o progresso calculado deve aparecer formatado em pt-BR');
assert.ok(!/undefined|NaN/.test(kpisHtml), `KPIs não podem conter undefined/NaN: ${kpisHtml.slice(0, 400)}`);

assert.ok(squadsHtml.includes('Squad A') && squadsHtml.includes('Squad B'));
assert.ok(squadsHtml.includes('E-1') && squadsHtml.includes('E-6'));
assert.ok(!squadsHtml.includes('E-4'), 'épico cancelado não deve ser renderizado');
assert.ok(!squadsHtml.includes('E-5'), 'épico de outro PI não deve ser renderizado');
assert.ok(squadsHtml.includes('sem itens'), 'épico vazio deve receber o selo "sem itens"');
assert.ok(squadsHtml.includes('transbordo'), 'épico de transbordo deve receber o selo');
assert.ok(!/undefined|NaN/.test(squadsHtml), 'a lista de squads não pode conter undefined/NaN');

// As três cores das fases têm de estar presentes — a barra segmentada só
// comunica se os três segmentos existirem.
assert.ok(squadsHtml.includes('#CE0058') && squadsHtml.includes('#0057B8') && squadsHtml.includes('#D98E3B'),
  'a barra deve pintar concluído, em andamento e pendente');
// Cada segmento leva o rótulo no title: cor sozinha não pode ser o único canal.
assert.ok(squadsHtml.includes('title="Concluído:'), 'segmentos precisam de rótulo, não só cor');

// Os drills dos KPIs precisam apontar para issues de verdade.
const drills = vm.runInContext('__cardDrills', sandbox);
assert.equal(drills['pi-done'].issues.length, t.kpis.doneItems);
assert.equal(drills['pi-items'].issues.length, t.kpis.totalItems);
assert.equal(drills['pi-empty'].issues.length, t.kpis.emptyEpics);
assert.equal(drills['pi-epics-done'].issues.length, t.kpis.epicsDone);
assert.equal(drills['pi-epics'].issues.length, t.kpis.totalEpics, 'Total de épicos deve abrir a lista de épicos');
assert.ok(kpisHtml.includes('data-drill="pi-epics"'), 'o cartão de Total de épicos tem de ser clicável');
assert.deepEqual(drills['pi-epics'].issues.map((i) => i.Chave).sort(), ['E-1', 'E-2', 'E-3', 'E-6']);

// O recorte tem de aparecer no cabeçalho: com o filtro do topo aberto, o "3 PIs"
// é a única coisa que dá contexto aos números.
assert.ok(getEl('pi-recorte').innerHTML.includes('PI3 - Afya One'));
assert.ok(getEl('pi-recorte').innerHTML.includes('Q3/2026'));

// Com mais de um PI, os KPIs temporais dizem o que falta em vez de somar quarters.
T.selections.PI.add('PI2 - Afya One');
T.renderPiTracking();
assert.ok(getEl('pi-recorte').innerHTML.includes('2 PIs'));
assert.ok(getEl('pi-kpis').innerHTML.includes('requer 1 PI selecionado'),
  'sem PI único o KPI deve explicar o que falta');
T.selections.PI.delete('PI2 - Afya One');
T.renderPiTracking();

// Sem as regras do servidor a aba avisa em vez de calcular errado.
sandbox.window.__QUARTER_RULES = null;
T.renderPiTracking();
assert.ok(getEl('pi-squads').innerHTML.includes('Atualizar dados'),
  'sem quarterRules a aba deve pedir uma atualização, não mostrar números');
sandbox.window.__QUARTER_RULES = quarterRules;

/* ---------- filtros escondidos na aba PI ----------
   O que congela os filtros é uma classe na barra; se o nome mudar sem o CSS
   acompanhar, os controles voltam a aparecer sem ninguém notar. */
T.buildFilterBar();
const bar = getEl('filterBar');
let piOnly = false;
bar.classList = { add() {}, remove() {}, contains: () => false, toggle(cls, on) { if (cls === 'pi-only') piOnly = on; } };
T.activeTab = 'pi';
T.syncFilterBarForTab();
assert.equal(piOnly, true, 'na aba PI a barra recebe a classe pi-only');
T.activeTab = 'exec';
T.syncFilterBarForTab();
assert.equal(piOnly, false, 'fora da aba PI a barra volta ao normal');

// O CSS precisa esconder exatamente os filtros sem efeito nesta aba — e o id de
// cada um sai de buildFilterBar como 'dd-' + chave com espaços virando '_'.
// O seletor tem de terminar ali: um `#dd-StatusX` contém `#dd-Status` como
// substring e passaria numa checagem ingênua, escondendo nada na prática.
const escondeNaAbaPi = (seletor) => {
  const literal = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`#filterBar\\.pi-only\\s+${literal}\\s*[,{]`).test(html);
};
for (const key of ['AnoCriacao', 'Mes', 'Tipo de item', 'Status']) {
  const id = `#dd-${key.replace(/\s/g, '_')}`;
  assert.ok(escondeNaAbaPi(id), `o CSS deve esconder ${id} na aba PI`);
}
assert.ok(escondeNaAbaPi('.date-filter'), 'o intervalo de conclusão deve sair da tela');
// E não pode esconder os que a aba usa.
for (const id of ['#dd-PI', '#dd-Squad', '#dd-Programa', '#dd-VS']) {
  assert.ok(!escondeNaAbaPi(id), `${id} é usado pela aba e não pode ser escondido`);
}

/* ---------- as regras não podem ter listas sobrepostas ---------- */
const norm = (s) => String(s).trim().toUpperCase();
const done = new Set(quarterRules.doneStatuses.map(norm));
const prog = new Set(quarterRules.inProgressStatuses.map(norm));
const ign = new Set(quarterRules.ignoredStatuses.map(norm));
for (const s of prog) assert.ok(!done.has(s), `status "${s}" está em concluído e em andamento`);
for (const s of ign) assert.ok(!done.has(s) && !prog.has(s), `status "${s}" ignorado aparece em outra lista`);

console.log('pi-tracking.spec.js OK');
