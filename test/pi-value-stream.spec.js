'use strict';

/**
 * Testes do guarda-chuva de Value Stream da aba PI Tracking e do Programa que a
 * aba assume quando o filtro do topo está vazio.
 *
 * Decisões que este arquivo trava, com o porquê de cada uma:
 *
 * 1. **Dois níveis, agregando por SOMA de itens.** A Value Stream não é a média
 *    dos percentuais das suas squads: uma squad com 40 itens e outra com 2 não
 *    podem pesar igual. É o mesmo erro que o nível de squad já evita entre os
 *    seus épicos, um andar acima. Um teste de média daria número plausível e
 *    errado — daí ele existir.
 *
 * 2. **O agrupamento é pelo VS do ÉPICO, não da squad.** VS é o projeto Jira de
 *    cada issue, então uma squad pode ter épicos em dois projetos. Medido: entre
 *    os 166 épicos com PI reconhecido nenhuma das 23 squads aparece sob dois VS,
 *    mas na base inteira 21 das 45 squads têm itens em mais de um projeto — o
 *    caso não é impossível, e quando acontecer a squad tem de aparecer dentro de
 *    cada VS só com os épicos daquela, sem duplicar item em nenhum total.
 *
 * 3. **Os dois níveis nascem RECOLHIDOS.** A página abre no ranking das Value
 *    Streams e o detalhe vem por escolha, um nível de cada vez — decisão do
 *    usuário depois de ver a tela pronta. Os dois conjuntos guardam o que foi
 *    ABERTO, e não o que foi fechado, para que um conjunto vazio signifique
 *    "tudo como nasce" e a escolha do usuário sobreviva ao re-render (a lista é
 *    reconstruída a cada mudança de filtro).
 *
 * 4. **A aba escreve o PI do quarter corrente no filtro ao ser aberta e apaga ao
 *    ser deixada.** O PI é campo de preenchimento manual: 63,6% dos sub-itens e
 *    57% dos bloqueios da base não têm label, então pré-selecioná-lo na barra
 *    inteira deixaria 27% da base de pé. Aqui o mesmo recorte é de graça — a
 *    seleção é feita no ÉPICO, que tem a label, e os filhos entram pela cadeia
 *    de parent. A aba nunca sobrescreve nem apaga uma escolha do usuário, e não
 *    existe recorte de PI por dentro: desmarcar tem efeito de verdade.
 *    (O `Programa = Afya One` é outra coisa: padrão GLOBAL, verificado em
 *    `filtros.spec.js`.)
 *
 * Rode com:  npm run test:pi-vs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const quarterRules = require('../src/config/quarter.rules');

/* ---------- DOM mínimo (mesmo padrão de pi-tracking.spec.js) ---------- */
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

const epilogo = `
;globalThis.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); PI_DATA.length=0; PI_DATA.push(...v); },
  selections, piBuildTracking, renderPiTracking,
  piExpandedSquads, piExpandedVs, piSincronizarPiPadrao, piDoQuarterAtual,
  set piPadraoAtivo(v){ piPadraoAtivo = v; },
  set activeTab(v){ activeTab = v; },
  set isoToday(fn){ isoToday = fn; },
};`;
vm.createContext(sandbox);
vm.runInContext(`${script}${epilogo}`, sandbox, { filename: 'index.html:inline' });
const T = sandbox.__T;
sandbox.window.__QUARTER_RULES = quarterRules;
vm.runInContext('isoToday = () => "2026-08-15";', sandbox);

/* ---------- cenário sintético ----------
   Percentuais escolhidos para que a MÉDIA das squads e a SOMA dos itens deem
   números diferentes: em APRENDER as squads estão em 50%, 100% e 100% (média
   83,3%), mas a soma dos itens dá 66,7% (4 de 6). Se a agregação regredir para
   média de percentuais, o teste pega. */
function issue(over) {
  return {
    Chave: 'X-0', Resumo: '', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Afya One', VS: 'APRENDER', Squad: 'Squad A', PI: 'Não informado',
    Labels: [], Status: 'Backlog', EpicoChave: null, parentKey: null,
    Concluido: false, Cancelado: false, 'Story Points': 0,
    ...over,
  };
}
const epico = (chave, over) => issue({
  Chave: chave, Resumo: `Épico ${chave}`, 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico',
  EpicoChave: chave, PI: 'PI3 - Afya One', Status: 'Desenvolvimento', ...over,
});
const filho = (chave, epicKey, status, over) => issue({
  Chave: chave, EpicoChave: epicKey, parentKey: epicKey, Status: status, ...over,
});

const DATA = [
  /* APRENDER / Squad A: 4 itens, 2 concluídos = 50% */
  epico('E-A', { VS: 'APRENDER', Squad: 'Squad A' }),
  filho('A-1', 'E-A', 'Done'), filho('A-2', 'E-A', 'Done'),
  filho('A-3', 'E-A', 'Desenvolvimento'), filho('A-4', 'E-A', 'Backlog'),

  /* APRENDER / Squad B: 1 item concluído = 100% */
  epico('E-B', { VS: 'APRENDER', Squad: 'Squad B' }),
  filho('B-1', 'E-B', 'Done'),

  /* PLATAFORMA / Squad C: 2 itens, nenhum concluído = 0% — o pior VS, tem de
     vir primeiro na tela. */
  epico('E-C', { VS: 'PLATAFORMA', Squad: 'Squad C' }),
  filho('C-1', 'E-C', 'Backlog'), filho('C-2', 'E-C', 'Refinamento técnico'),

  /* Squad X com um épico em CADA VS: o caso que o agrupamento por VS do épico
     tem de tratar sem duplicar item. */
  epico('E-X1', { VS: 'APRENDER', Squad: 'Squad X' }),
  filho('X-1', 'E-X1', 'Done'),
  epico('E-X2', { VS: 'PLATAFORMA', Squad: 'Squad X' }),
  filho('X-2', 'E-X2', 'Backlog'),

  /* Épico de outro Programa: só aparece se o filtro de Programa pedir. */
  epico('E-BR', { VS: 'Value Streams Afya Bridge', Squad: 'Squad Bridge', Programa: 'Afya Bridge', PI: 'PI3 - Legado' }),
  filho('BR-1', 'E-BR', 'Done'),
];

T.DATA = DATA;
T.selections.PI.add('PI3 - Afya One');
const t = T.piBuildTracking();

/* ---------- o guarda-chuva existe e fecha com o nível de baixo ---------- */
const vs = new Map(t.vsGroups.map((v) => [v.vs, v]));
assert.deepEqual([...vs.keys()].sort(), ['APRENDER', 'PLATAFORMA'], 'os dois VS do recorte');

const aprender = vs.get('APRENDER');
assert.equal(aprender.total, 6, 'APRENDER soma 4 de Squad A + 1 de Squad B + 1 de Squad X');
assert.equal(aprender.done, 4);
assert.equal(Math.round(aprender.pct * 10) / 10, 66.7,
  'agregação por SOMA de itens: a média dos percentuais das squads daria 83,3%');
assert.equal(aprender.done + aprender.inProgress + aprender.todo, aprender.total,
  'as três fases têm de fechar o total do VS');

const plataforma = vs.get('PLATAFORMA');
assert.equal(plataforma.total, 3, '2 de Squad C + 1 de Squad X');
assert.equal(plataforma.done, 0);
assert.equal(plataforma.pct, 0, 'VS sem nenhum concluído é 0%, não NaN');

// O total do VS é a soma dos totais das suas squads — se um dia divergirem, o
// número de cima estará contando algo que não está listado embaixo.
t.vsGroups.forEach((v) => {
  const soma = v.squads.reduce((a, s) => a + s.total, 0);
  assert.equal(v.total, soma, `total do VS ${v.vs} tem de bater com a soma das squads`);
  const somaDone = v.squads.reduce((a, s) => a + s.done, 0);
  assert.equal(v.done, somaDone, `concluídos do VS ${v.vs} têm de bater com a soma das squads`);
});
assert.equal(t.vsGroups.reduce((a, v) => a + v.total, 0), t.kpis.totalItems,
  'a soma dos VS tem de ser o denominador do KPI de progresso');
assert.equal(t.kpis.totalVs, 2);

/* ---------- nenhum épico se perde nem se duplica ---------- */
const chavesNaArvore = t.vsGroups.flatMap((v) => v.squads.flatMap((s) => s.epics.map((e) => e.epic.Chave)));
assert.equal(chavesNaArvore.length, new Set(chavesNaArvore).size, 'nenhum épico pode aparecer duas vezes');
assert.deepEqual(chavesNaArvore.slice().sort(), t.epics.map((e) => e.epic.Chave).sort(),
  'a árvore de VS tem de conter exatamente os épicos do recorte');

/* ---------- squad com épicos em dois VS ----------
   Ela aparece dentro de cada VS, com apenas os épicos daquele VS. Somar os dois
   pedaços num só lugar contaria o trabalho onde ele não está. */
const xEmAprender = aprender.squads.find((s) => s.squad === 'Squad X');
const xEmPlataforma = plataforma.squads.find((s) => s.squad === 'Squad X');
assert.ok(xEmAprender && xEmPlataforma, 'a squad com épicos em dois VS aparece nos dois');
assert.deepEqual(xEmAprender.epics.map((e) => e.epic.Chave), ['E-X1']);
assert.deepEqual(xEmPlataforma.epics.map((e) => e.epic.Chave), ['E-X2']);
assert.equal(xEmAprender.total + xEmPlataforma.total, 2, 'os dois pedaços somam os itens da squad, sem duplicar');
assert.equal(xEmAprender.vs, 'APRENDER', 'cada pedaço sabe a que VS pertence');

/* ---------- ordenação: pior primeiro nos dois níveis ---------- */
assert.deepEqual(t.vsGroups.map((v) => v.vs), ['PLATAFORMA', 'APRENDER'],
  'VS pior primeiro: quem precisa de atenção não deve exigir rolagem');
assert.deepEqual(aprender.squads.map((s) => s.squad), ['Squad A', 'Squad B', 'Squad X'],
  'dentro do VS, squad pior primeiro (50%, 100%, 100% com desempate por nome)');
// A lista plana continua existindo para os KPIs, na ordem da tela.
assert.deepEqual(t.squads.map((s) => s.squad), ['Squad C', 'Squad X', 'Squad A', 'Squad B', 'Squad X'],
  'a lista plana tem uma faixa por squad DENTRO de cada VS — Squad X aparece duas vezes');

/* ---------- os KPIs contam squad como time, não como faixa na tela ----------
   Squad X é uma squad partida entre dois VS. Se o KPI contasse faixas, ela
   viraria duas squads e "abaixo do esperado" a marcaria pelo pedaço de 0% e a
   pouparia pelo de 100% ao mesmo tempo. Contando por nome, o KPI mantém o
   significado que tinha antes do agrupamento. */
assert.equal(t.kpis.totalSquads, 4, 'são 4 squads distintas, ainda que sejam 5 faixas na tela');
// Squad X somada: 2 itens, 1 concluído = 50%, que não está ABAIXO dos 50% do
// quarter. Sobra Squad C, com 0%.
assert.equal(t.kpis.squadsBehind, 1,
  'só Squad C (0%) está abaixo dos 50% do quarter; Squad X somada dá exatamente 50%');

/* ---------- o PI do quarter que a aba escreve na barra ---------- */
// Hoje é 15/08/2026 no cenário, dentro do Q3/2026.
T.selections.PI.clear();
assert.equal(T.piDoQuarterAtual(), 'PI3 - Afya One',
  'sem Programa marcado, o desempate é pelo Afya One — o painel é orientado a ele');

// Fora da aba PI nada é escrito: é o que impede o recorte de PI de vazar para as
// outras abas, onde ele derrubaria a base de quem não tem label.
T.activeTab = 'exec';
assert.equal(T.piSincronizarPiPadrao(), false, 'fora da aba PI o padrão não escreve nada');
assert.equal(T.selections.PI.size, 0);

// Entrar na aba marca o PI do quarter. O retorno true avisa quem chamou que
// precisa re-renderizar: trocar de aba, sozinho, não redesenha nada.
T.activeTab = 'pi';
assert.equal(T.piSincronizarPiPadrao(), true, 'entrar na aba muda o recorte e avisa');
assert.deepEqual(Array.from(T.selections.PI), ['PI3 - Afya One']);
assert.equal(T.piSincronizarPiPadrao(), false, 'aplicar de novo não faz nada');

// Sair apaga o que a aba escreveu.
T.activeTab = 'wip';
assert.equal(T.piSincronizarPiPadrao(), true, 'sair da aba também muda o recorte');
assert.equal(T.selections.PI.size, 0, 'nenhuma outra aba herda o recorte de PI');

/* O PI do quarter acompanha o Programa marcado: é o caso que o usuário deu como
   exemplo — marcar Afya Bridge tem de trazer PI3 - Legado. */
T.selections.Programa.clear();
T.selections.Programa.add('Afya Bridge');
assert.equal(T.piDoQuarterAtual(), 'PI3 - Legado');
T.activeTab = 'pi';
assert.equal(T.piSincronizarPiPadrao(), true);
assert.deepEqual(Array.from(T.selections.PI), ['PI3 - Legado']);
const bridge = T.piBuildTracking();
assert.deepEqual(bridge.epics.map((e) => e.epic.Chave), ['E-BR'],
  'com Afya Bridge e o PI dele, a aba mostra o épico do Legado');

/* Escolha do usuário vence o padrão nas duas pontas. Na barra real, mexer no
   filtro de PI desliga o padrão pelo handler do checkbox (coberto em
   filtros.spec.js, com DOM de verdade); aqui o vm não tem DOM, então a troca é
   simulada. */
T.selections.PI.clear();
T.selections.PI.add('PI2 - Afya One');
T.piPadraoAtivo = false;
T.activeTab = 'exec';
assert.equal(T.piSincronizarPiPadrao(), false, 'a aba não apaga uma escolha do usuário ao sair');
T.activeTab = 'pi';
assert.equal(T.piSincronizarPiPadrao(), false, 'nem a sobrescreve ao voltar');
assert.deepEqual(Array.from(T.selections.PI), ['PI2 - Afya One']);

/* Sem recorte por dentro: filtro de PI vazio mostra tudo o que o Programa
   permite. É o que garante que desmarcar tenha efeito. */
T.selections.PI.clear();
T.selections.Programa.clear();
T.selections.Programa.add('Afya One');
const semPi = T.piBuildTracking();
assert.ok(!semPi.epics.some((e) => e.epic.Chave === 'E-BR'),
  'com Afya One marcado, o épico do Legado fica fora pelo Programa, não pelo PI');
assert.ok(semPi.epics.length > 0, 'e os épicos de Afya One de todos os PIs aparecem');

// Volta ao estado da aba para o bloco de renderização abaixo.
T.selections.PI.clear();
T.piSincronizarPiPadrao();

/* ---------- renderização ---------- */
T.renderPiTracking();
const squadsHtml = getEl('pi-squads').innerHTML;
const recorte = getEl('pi-recorte').innerHTML;

// O padrão precisa estar DECLARADO: a barra de filtros continua mostrando
// "Programa: nenhum", então esta linha é o único lugar onde o leitor descobre
// que o recorte foi feito.
assert.ok(recorte.includes('PI3 - Afya One') && recorte.includes('PI do quarter corrente'),
  `o PI marcado pela aba tem de ser declarado na linha de recorte: ${recorte}`);
assert.ok(recorte.includes('Programa') && recorte.includes('Afya One'),
  'e o Programa do recorte continua aparecendo');

const VS_RX = /class="pi-vs( collapsed)?" data-pi-vs="([^"]*)"/g;
const blocos = squadsHtml.match(VS_RX) || [];
assert.equal(blocos.length, 2, 'um bloco por Value Stream');
assert.ok(blocos.every((b) => b.includes('collapsed')),
  `os VS nascem recolhidos: a página abre no ranking de Value Streams: ${blocos}`);
assert.ok(blocos[0].includes('PLATAFORMA'), 'o pior VS vem primeiro na tela');

// As squads seguem sendo renderizadas dentro do VS (escondidas pelo CSS até ele
// ser aberto) e continuam nascendo recolhidas.
const CARD_RX = /class="pi-squad( collapsed)?" data-pi-squad="([^"]*)"/g;
const cards = squadsHtml.match(CARD_RX) || [];
assert.equal(cards.length, 5, 'Squad X é renderizada uma vez em cada VS');
assert.ok(cards.every((c) => c.includes('collapsed')), 'toda squad continua nascendo recolhida');

assert.ok(!/undefined|NaN/.test(squadsHtml), 'a árvore de VS não pode conter undefined/NaN');
assert.ok(getEl('pi-kpis').innerHTML.includes('2 VS · 4 squad(s)'),
  'o rodapé de Total de épicos declara a composição dos dois níveis, com squads distintas');

// A escolha de abrir um VS sobrevive ao re-render — a lista é reconstruída a
// cada mudança de filtro, e o conjunto guardado é o dos ABERTOS.
T.piExpandedVs.add('APRENDER');
T.renderPiTracking();
const depois = getEl('pi-squads').innerHTML.match(VS_RX) || [];
const abertos = depois.filter((b) => !b.includes('collapsed'));
assert.equal(abertos.length, 1, 'só o VS aberto pelo usuário fica expandido');
assert.ok(abertos[0].includes('APRENDER'));
T.piExpandedVs.clear();
T.renderPiTracking();
assert.ok((getEl('pi-squads').innerHTML.match(VS_RX) || []).every((b) => b.includes('collapsed')),
  'limpar a escolha volta todos os VS a recolhidos');

/* ---------- o CSS dos dois níveis existe ----------
   O alinhamento vertical entre o medidor do VS e o da squad é o que permite ler
   "o VS está em 66% e esta squad dentro dele em 50%" de relance. Ele depende de
   as duas grades terem as MESMAS colunas; um ajuste em só uma desalinharia a
   tela sem quebrar nenhum número. */
const gradeDe = (classe) => {
  const m = html.match(new RegExp(`\\.${classe}\\{[^}]*grid-template-columns:([^;]+);`));
  return m && m[1].trim();
};
assert.ok(gradeDe('pi-vs-head'), 'o cabeçalho de VS precisa existir no CSS');
assert.equal(gradeDe('pi-vs-head'), gradeDe('pi-squad-head'),
  'VS e squad têm de usar a mesma grade, senão os medidores desalinham');
assert.ok(/\.pi-vs\.collapsed\s*>\s*\.pi-vs-body\{display:none;\}/.test(html),
  'fechar o VS tem de esconder só o corpo dele');

console.log('pi-value-stream.spec.js OK');
