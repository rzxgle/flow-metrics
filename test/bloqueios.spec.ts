// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
'use strict';

/**
 * Testes da aba Bloqueios: o KPI de cancelados e a coluna "Bloqueio".
 *
 * Duas decisões de produto ficam fixadas aqui, porque as duas são fáceis de
 * desfazer sem perceber:
 *
 * 1. Bloqueio CANCELADO tem KPI próprio. Ele não é um bloqueio resolvido — o
 *    impedimento não foi tratado, o item que ele travava é que saiu do caminho —
 *    então não pode somar com os resolvidos nem entrar no tempo médio. Também
 *    não pode desaparecer: 43 dos 445 sub-blocks da base estão nesse estado.
 * 2. Um bloqueio ABERTO cujo item pai foi cancelado CONTINUA na tabela de
 *    abertos. Ele é um bloqueio de verdade, ainda aberto, e alguém precisa
 *    decidir o que fazer com ele. Foi por isso que a coluna passou a linkar o
 *    Sub-block, com o pai entre parênteses: antes o link era o pai, e um pai
 *    cancelado na primeira coluna fazia a linha parecer lixo de dado.
 *
 * jsdom porque o que está sob teste é o que a aba mostra: o conteúdo dos cards
 * de KPI e o HTML da tabela. Sem rede: DATA sintética; Chart, canvas e fetch
 * são stubs.
 *
 * Rode com:  npm run test:bloqueios
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

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
const charts = {};
class ChartStub {
  constructor(ctx, config) { charts[ctx.canvas && ctx.canvas.id] = config; }
  destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  renderBlock, getFiltered, getFilteredNoDate, SKIP_TIPO, dateRange,
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética ----------
   Um sub-block por situação, mais os dois pais que interessam. */
const base = (o) => ({
  Chave: o.chave, chave: o.chave, Resumo: o.chave, 'Tipo de item': o.tipo,
  'Tipo Agrupado': o.tipo === 'Sub-block' ? 'Sub-task' : 'Bug',
  Programa: 'Afya One', VS: 'VS X', Squad: 'Squad X', PI: 'PI3', Labels: [],
  Status: o.status, Concluido: !!o.concl, Cancelado: !!o.canc, WIP: !o.concl && !o.canc,
  FaseFluxo: o.concl ? 'Concluído' : (o.canc ? 'Cancelado' : 'Execução'),
  'Story Points': 0, Sprint: null, Sprints: [], SprintPeriodos: [], SprintHistoricoOk: true,
  MotivoBloqueio: o.motivo || null, Criado: o.criado, 'Data Conclusao': o.conclusao || null,
  'Data Entrega Sprint': o.conclusao || null, 'Data Inicio Real': o.inicio || null,
  'Data Fim Real': o.conclusao || null, AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: 7,
  AnoMesConclusao: o.conclusao ? o.conclusao.slice(0, 7) : null,
  // Os dois convivem de propósito na fixture: a aba precisa usar o LEAD
  // (criação → conclusão), então dar valores diferentes aos dois faz o teste
  // reprovar se alguém voltar a somar Cycle Time.
  CycleTimeDias: o.cycle != null ? o.cycle : null,
  LeadTimeDias: o.lead != null ? o.lead : null,
  parentKey: o.pai || null, parent: o.pai || null, EpicoChave: null,
});
const sub = (o) => base({ ...o, tipo: 'Sub-block' });
const pai = (o) => base({ ...o, tipo: 'Bug' });

const DADOS = [
  pai({ chave: 'P-VIVO', status: 'Execução', criado: '2026-07-01' }),
  pai({ chave: 'P-CANCELADO', status: 'CANCELADO', canc: true, criado: '2026-07-01', conclusao: '2026-07-04' }),
  // resolvido dentro do período: alimenta "resolvidos" e o tempo médio.
  // 10 dias de bloqueio (06/07 -> 16/07); o cycle de 2 existe só para provar
  // que a aba NÃO o usa.
  sub({ chave: 'SB-RESOLVIDO', status: 'Concluído', concl: true, criado: '2026-07-06',
    conclusao: '2026-07-16', inicio: '2026-07-14', cycle: 2, lead: 10, motivo: 'Acessos', pai: 'P-VIVO' }),
  // segundo resolvido do MESMO pai: com 10 e 4, a média é 7 — número que só sai
  // se o divisor for os 2 episódios mensuráveis. Somando daria 14; dividindo
  // pelos 5 episódios do item, 2,8.
  sub({ chave: 'SB-RESOLVIDO-2', status: 'Concluído', concl: true, criado: '2026-07-12',
    conclusao: '2026-07-16', inicio: '2026-07-15', cycle: 99, lead: 4, motivo: 'Infra', pai: 'P-VIVO' }),
  // aberto, pai vivo
  sub({ chave: 'SB-ABERTO', status: 'Execução', criado: '2026-07-05', motivo: 'Infra', pai: 'P-VIVO' }),
  // aberto, pai CANCELADO — o caso COREX-1760/COREX-1730; o mais antigo dos abertos
  sub({ chave: 'SB-PAI-CANCELADO', status: 'Execução', criado: '2026-07-02', motivo: 'Acessos', pai: 'P-CANCELADO' }),
  // aberto, sem pai
  sub({ chave: 'SB-SEM-PAI', status: 'Execução', criado: '2026-07-03', motivo: 'Infra' }),
  // cancelados: um dentro do período, um fora
  sub({ chave: 'SB-CANC-DENTRO', status: 'CANCELADO', canc: true, criado: '2026-07-08',
    conclusao: '2026-07-20', motivo: 'Acessos', pai: 'P-VIVO' }),
  sub({ chave: 'SB-CANC-FORA', status: 'CANCELADO', canc: true, criado: '2026-06-01',
    conclusao: '2026-06-05', motivo: 'Infra', pai: 'P-VIVO' }),
];
T.DATA = DADOS;

/* ---------- helpers de leitura da tela ---------- */
const desenhar = () => T.renderBlock(T.getFiltered(T.SKIP_TIPO), T.getFilteredNoDate(T.SKIP_TIPO));
const periodo = (de, ate) => { T.dateRange.from = de; T.dateRange.to = ate; desenhar(); };
const cards = () => Array.from(document.querySelectorAll('#block-kpis .kpi'));
const card = (rotulo) => cards().find((el) => el.querySelector('.eyebrow').textContent === rotulo);
const valor = (rotulo) => card(rotulo).querySelector('.val').firstChild.textContent;
// fmt1 é toFixed(1) (ponto decimal, independente de locale); parseFloat também
// devolve 4 se algum ambiente formatar "4,0", então a leitura serve para os dois.
const numero = (texto) => parseFloat(texto);
const linhas = () => Array.from(document.querySelectorAll('#block-open-table tbody tr'));
const primeiraColuna = (tr) => ({
  link: tr.querySelector('a.jira').textContent,
  href: tr.querySelector('a.jira').getAttribute('href'),
  entreParenteses: (tr.querySelector('span').textContent.match(/\(([^)]*)\)/) || [])[1],
});
const cabecalho = () => Array.from(document.querySelectorAll('#block-open-table thead th'))
  .map((th) => th.textContent);
const itensBloqueados = () => Array.from(document.querySelectorAll('#block-parent-table tbody tr'))
  .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim()));
const cardDe = (idTabela) => document.getElementById(idTabela).closest('.card');
const textos = (idTabela) => ({
  titulo: cardDe(idTabela).querySelector('h3').textContent,
  legenda: cardDe(idTabela).querySelector('.cap').textContent,
});

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nAba Bloqueios — KPI de cancelados e coluna "Bloqueio":');

periodo('2026-07-01', '2026-07-31');

check('o KPI "Bloqueios cancelados" existe, ao lado dos resolvidos', () => {
  const rotulos = cards().map((el) => el.querySelector('.eyebrow').textContent);
  assert.ok(rotulos.includes('Bloqueios cancelados'), 'o card foi renderizado');
  assert.strictEqual(rotulos[rotulos.indexOf('Bloqueios resolvidos') + 1], 'Bloqueios cancelados');
});

check('ele conta os cancelados do período — e só eles', () => {
  assert.strictEqual(valor('Bloqueios cancelados'), '1');
});

check('cancelado não vira resolvido nem mexe no tempo médio', () => {
  assert.strictEqual(valor('Bloqueios resolvidos'), '2');
  // Lido como número: o separador decimal depende do ICU do ambiente.
  // (10 + 4) / 2 = 7 dias de bloqueio; por Cycle Time daria (2 + 99) / 2.
  assert.strictEqual(numero(valor('Tempo médio bloqueado')), 7, 'só os resolvidos entram na média');
});

check('cancelado não aparece como bloqueio aberto', () => {
  assert.strictEqual(valor('Bloqueios abertos'), '3');
  const abertos = linhas().map((tr) => primeiraColuna(tr).link);
  assert.deepStrictEqual(abertos.slice().sort(), ['SB-ABERTO', 'SB-PAI-CANCELADO', 'SB-SEM-PAI']);
});

check('o card de cancelados é clicável e abre a lista', () => {
  assert.strictEqual(card('Bloqueios cancelados').dataset.drill, 'block_cancelados');
  assert.ok(card('Bloqueios cancelados').classList.contains('kpi-clickable'));
});

check('o KPI segue o período, como os resolvidos', () => {
  periodo(null, null);
  assert.strictEqual(valor('Bloqueios cancelados'), '2', 'sem período, entra o cancelado de junho');
  periodo('2026-07-01', '2026-07-31');
  assert.strictEqual(valor('Bloqueios cancelados'), '1', 'com período, ele sai');
});

check('a coluna se chama "Bloqueio"', () => {
  assert.deepStrictEqual(cabecalho(), ['Bloqueio', 'Squad', 'Motivo', 'Aberto há (dias)']);
});

check('o link é o Sub-block; o item pai fica entre parênteses', () => {
  // O mais antigo em aberto vem primeiro — aqui, o de pai cancelado.
  const primeira = primeiraColuna(linhas()[0]);
  assert.strictEqual(primeira.link, 'SB-PAI-CANCELADO', 'o texto do link é o bloqueio');
  assert.ok(primeira.href.endsWith('SB-PAI-CANCELADO'), 'e o href aponta para o bloqueio, não para o pai');
  assert.strictEqual(primeira.entreParenteses, 'P-CANCELADO', 'o pai vai para os parênteses');
});

check('bloqueio aberto de pai cancelado PERMANECE na tabela', () => {
  // Decisão de produto: o bloqueio está aberto e precisa de ação de alguém.
  // Se algum dia isso for filtrado, é aqui que a mudança aparece.
  const chaves = linhas().map((tr) => primeiraColuna(tr).link);
  assert.ok(chaves.includes('SB-PAI-CANCELADO'));
});

check('bloqueio sem pai mostra "—" nos parênteses', () => {
  const semPai = linhas().map(primeiraColuna).find((c) => c.link === 'SB-SEM-PAI');
  assert.strictEqual(semPai.entreParenteses, '—');
});

check('o card de itens bloqueados tem o título e a legenda acordados', () => {
  const { titulo, legenda } = textos('block-parent-table');
  assert.strictEqual(titulo, 'Itens-pai por tempo médio de bloqueio');
  assert.strictEqual(legenda, 'Duração média de cada bloqueio do item, da abertura até a'
    + ' resolução. A coluna Nº bloqueios mostra quantos episódios o item teve; os que ainda'
    + ' estão abertos ou foram cancelados não entram na média. Top 20 — clique para ver os'
    + ' bloqueios.');
  assert.deepStrictEqual(
    Array.from(document.querySelectorAll('#block-parent-table thead th')).map((th) => th.textContent),
    ['Item pai', 'Squad', 'Nº bloqueios', 'Média por bloqueio (dias)'],
  );
});

check('a coluna é a MÉDIA por bloqueio, não a soma', () => {
  const [primeira] = itensBloqueados();
  assert.strictEqual(primeira[0], 'P-VIVO', 'quem tem a maior média vem primeiro');
  // (10 + 4) / 2 = 7. Soma daria 14; Cycle Time, (2 + 99) / 2.
  assert.strictEqual(numero(primeira[3]), 7);
});

check('o divisor são os episódios mensuráveis, não todos', () => {
  const pVivo = itensBloqueados().find((c) => c[0] === 'P-VIVO');
  // 2 resolvidos + 1 aberto + 2 cancelados = 5 episódios, 2 mensuráveis.
  assert.strictEqual(pVivo[2], '5', 'Nº bloqueios conta todos os episódios');
  assert.notStrictEqual(numero(pVivo[3]), 14 / 5, 'não divide pelos 5');
  assert.strictEqual(numero(pVivo[3]), 7, 'divide pelos 2 que têm duração');
});

check('sem episódio mensurável a média é "—", não 0,0', () => {
  // Zero dia de bloqueio e nenhuma medição possível são coisas diferentes.
  const soAberto = itensBloqueados().find((c) => c[0] === 'P-CANCELADO');
  assert.strictEqual(soAberto[2], '1');
  assert.strictEqual(soAberto[3], '—');
});

check('o card por Squad ficou intocado — segue somando', () => {
  // Array.from: o array nasce no realm do jsdom e não é reference-equal ao daqui.
  // 10 + 4 = 14: lá a soma é proposital (itens diferentes bloqueados em paralelo).
  assert.deepStrictEqual(Array.from(charts['chart-block-squad'].data.datasets[0].data), [14]);
});

check('a página não registrou erro em nenhuma dessas renderizações', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
