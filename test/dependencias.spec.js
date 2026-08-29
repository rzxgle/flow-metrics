'use strict';

/**
 * Testes da aba de Dependências — domínio (DependencyResolver) e visão (jsdom).
 *
 * Quatro decisões desta aba divergem do resto do painel e podem quebrar em
 * silêncio, mostrando um número plausível e errado. São elas que os testes
 * abaixo travam:
 *
 *   1. A DATA DE CONCLUSÃO VEM DO CHANGELOG. O workflow do issuetype Dependência
 *      não seta resolution: nas 62 dependências concluídas da base real,
 *      `resolutiondate` é nulo em 100% delas, e `Data de Fim Real` também está
 *      vazia. Se alguém "consertar" isso voltando ao caminho padrão
 *      (`actualEndDate || resolvedAt`), toda dependência passa a chegar sem data:
 *      lead time nulo e a aba inteira sumindo do filtro de período — sem erro
 *      nenhum na tela.
 *
 *   2. O RELÓGIO COMEÇA NA ABERTURA, como num bloqueio. Uma dependência nasce
 *      ativa; ninguém "começa a trabalhar" nela. Por isso a duração é lead time
 *      (criação -> conclusão), e a aberta conta da criação até HOJE — recalculado
 *      no navegador, senão o snapshot em cache congelaria o envelhecimento.
 *
 *   3. OS DOIS CAMPOS DE TIME USAM NOMES DIFERENTES PARA A MESMA SQUAD. O `Team`
 *      grava "Squad Core - Core Features" e o `Time Demandante`, "Core Features".
 *      Sem a canonização, a matriz demandante x dependente sai com dois nós para
 *      a mesma squad e nenhum cruzamento aparece na diagonal.
 *
 *   4. A MEDIDA CENTRAL É MÉDIA, NÃO MEDIANA — decisão do time, e vale para o card
 *      E para o gráfico ao lado. Medir o KPI por uma régua e o gráfico por outra
 *      faz a aba se contradizer sem que nada dê erro. Os casos abaixo usam bases
 *      em que média e mediana DIVERGEM, senão o teste passaria com as duas.
 *
 *   5. CLONE NÃO É DEPENDÊNCIA. `Blocks` e `Relates` valem como aproximação do
 *      item que ficou esperando (decisão do time, sobe a cobertura de 16% para
 *      41% na base real), mas `Cloners` é cópia da própria dependência e entraria
 *      como ruído em 42 links.
 *
 * jsdom na parte da visão porque o objeto do teste é o que a tela produz. Sem
 * rede: DATA sintética, Chart e canvas são stubs que guardam a configuração.
 *
 * Rode com:  npm run test:dependencias
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const classificationRules = require('../dist/src/config/classification.rules');
const dependencyRules = require('../dist/src/config/dependency.rules');
const IssueClassifier = require('../dist/src/domain/services/IssueClassifier');
const FlowMetricsCalculator = require('../dist/src/domain/services/FlowMetricsCalculator');
const IssueEnricher = require('../dist/src/domain/services/IssueEnricher');
const DependencyResolver = require('../dist/src/domain/services/DependencyResolver');
const Issue = require('../dist/src/domain/entities/Issue');

let passou = 0;
const teste = (nome, fn) => {
  try {
    fn();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    console.error(`  FALHOU  ${nome}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const classifier = new IssueClassifier(classificationRules);
const novoResolver = () => new DependencyResolver(classifier, dependencyRules);

/** Dependência crua, no formato que o repositório entrega ao domínio. */
const dependencia = (over = {}) => new Issue({
  id: '1', key: 'COREX-1', summary: 'dependência', issueType: 'Dependência',
  projectName: 'Value Streams Core', team: 'Squad Core - Core Features',
  status: 'To Do', createdAt: '2026-06-01T10:00:00.000Z',
  resolvedAt: null, actualStartDate: null, actualEndDate: null,
  labels: ['PI3AfyaOne'], statusTransitions: [], issueLinks: [],
  timeDemandante: 'Ativação do Curso', ...over,
});

const transicao = (at, from, to) => ({ at, from, to });

console.log('\n== domínio: data de conclusão vem do changelog ==');

teste('conclusão é a entrada em Done, mesmo com resolutiondate nulo', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'Done',
    statusTransitions: [
      transicao('2026-06-10T09:00:00.000Z', 'To Do', 'EM ANDAMENTO'),
      transicao('2026-06-21T09:00:00.000Z', 'EM ANDAMENTO', 'Done'),
    ],
  }));
  assert.strictEqual(bloco['Data Conclusao'], '2026-06-21');
  assert.strictEqual(bloco.AnoMesConclusao, '2026-06');
  assert.strictEqual(bloco.AnoConclusao, 2026);
  assert.strictEqual(bloco.LeadTimeDias, 20);
});

teste('reabertura: vale a ÚLTIMA entrada em Done, não a primeira', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'Done',
    statusTransitions: [
      transicao('2026-06-05T10:00:00.000Z', 'To Do', 'Done'),
      transicao('2026-06-08T10:00:00.000Z', 'Done', 'EM ANDAMENTO'),
      transicao('2026-06-20T10:00:00.000Z', 'EM ANDAMENTO', 'Done'),
    ],
  }));
  assert.strictEqual(bloco['Data Conclusao'], '2026-06-20');
});

teste('transição interna ao Done não redata a conclusão', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'Concluído',
    statusTransitions: [
      transicao('2026-06-11T10:00:00.000Z', 'EM ANDAMENTO', 'Done'),
      transicao('2026-06-19T10:00:00.000Z', 'Done', 'Concluído'),
    ],
  }));
  assert.strictEqual(bloco['Data Conclusao'], '2026-06-11');
});

teste('dependência aberta não recebe data de conclusão nem lead time', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'EM ANDAMENTO',
    statusTransitions: [transicao('2026-06-09T10:00:00.000Z', 'To Do', 'EM ANDAMENTO')],
  }));
  assert.ok(!('Data Conclusao' in bloco));
  assert.ok(!('LeadTimeDias' in bloco));
  assert.strictEqual(bloco.DepInicio, '2026-06-09');
});

teste('cancelada não vira conclusão: o episódio conta, os dias não', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'CANCELADO',
    statusTransitions: [transicao('2026-06-15T10:00:00.000Z', 'To Do', 'CANCELADO')],
  }));
  assert.ok(!('Data Conclusao' in bloco));
  assert.ok(!('LeadTimeDias' in bloco));
});

teste('DepInicio é a PRIMEIRA entrada em andamento (tempo de fila)', () => {
  const bloco = novoResolver().resolve(dependencia({
    status: 'Done',
    statusTransitions: [
      transicao('2026-06-04T10:00:00.000Z', 'To Do', 'EM ANDAMENTO'),
      transicao('2026-06-06T10:00:00.000Z', 'EM ANDAMENTO', 'To Do'),
      transicao('2026-06-12T10:00:00.000Z', 'To Do', 'EM ANDAMENTO'),
      transicao('2026-06-18T10:00:00.000Z', 'EM ANDAMENTO', 'Done'),
    ],
  }));
  assert.strictEqual(bloco.DepInicio, '2026-06-04');
});

console.log('\n== domínio: canonização de times ==');

teste('Team longo e Time Demandante curto viram o mesmo id', () => {
  const r = novoResolver();
  const bloco = r.resolve(dependencia({
    team: 'Squad Core - Core Features', timeDemandante: 'Core Features',
  }));
  assert.strictEqual(bloco.DepDependente, bloco.DepDemandante);
  assert.strictEqual(bloco.DepDemandante, 'core features');
});

teste('acento, "&" e o hífen sem espaço não separam a mesma squad', () => {
  const r = novoResolver();
  const pares = [
    ['Squad Conversão- Encontrar e Considerar', 'Encontrar e Considerar'],
    ['Squad Conversão - Experiência de Compra', 'Experiencia de Compra'],
    ['Squad Core - Busca & Recomendação', 'Busca e Recomendação'],
    ['Squad Aprender - Ativação do curso', 'Ativação do Curso'],
  ];
  for (const [longo, curto] of pares) {
    const b = r.resolve(dependencia({ team: longo, timeDemandante: curto }));
    assert.strictEqual(b.DepDependente, b.DepDemandante, `${longo} != ${curto}`);
  }
});

teste('apelidos cobrem o que a normalização sozinha não resolve', () => {
  const r = novoResolver();
  const b1 = r.resolve(dependencia({ team: 'Squad Aprender - Rotina de Estudos', timeDemandante: 'Rotina de Estudo' }));
  assert.strictEqual(b1.DepDependente, b1.DepDemandante);
  const b2 = r.resolve(dependencia({ team: 'Foundation (SSO)', timeExterno: 'SSO' }));
  assert.strictEqual(b2.DepExterno, b2.DepDependente);
});

teste('o catálogo de rótulos sai por fora, não repetido em cada linha', () => {
  const r = novoResolver();
  const bloco = r.resolve(dependencia({ team: 'Squad Core - Core Features' }));
  // A linha carrega o id; o nome legível vive só no catálogo.
  assert.strictEqual(bloco.DepDependente, 'core features');
  assert.strictEqual(r.teamCatalog()['core features'], 'Core Features');
});

teste('time não preenchido vira id nulo, e não um time chamado "vazio"', () => {
  const bloco = novoResolver().resolve(dependencia({ timeDemandante: null }));
  assert.strictEqual(bloco.DepDemandante, null);
});

console.log('\n== domínio: links e escopo ==');

const link = (key, type, over = {}) => ({
  key, type, direction: 'out', issueType: 'Story', status: 'To Do', ...over,
});

teste('Blocks e Relates contam; Cloners fica de fora', () => {
  const bloco = novoResolver().resolve(dependencia({
    issueLinks: [
      link('APR-1', 'Blocks'),
      link('APR-2', 'Relates'),
      link('APR-3', 'Cloners'),
    ],
  }));
  assert.deepStrictEqual(bloco.DepLinks.map((l) => l.k), ['APR-1', 'APR-2']);
});

teste('escopo vem do tipo de link oficial', () => {
  const dentro = novoResolver().resolve(dependencia({
    issueLinks: [link('APR-1', 'Dependência entre times (mesma VS)')],
  }));
  assert.strictEqual(dentro.DepEscopo, 'Mesma VS');
  const fora = novoResolver().resolve(dependencia({
    issueLinks: [link('APR-2', 'Dependência externa (Outras VS ou áreas)')],
  }));
  assert.strictEqual(fora.DepEscopo, 'Outras VS');
});

teste('sem link oficial o escopo é "Não informado" — não se chuta "mesma VS"', () => {
  const so = novoResolver().resolve(dependencia({ issueLinks: [link('APR-1', 'Blocks')] }));
  assert.strictEqual(so.DepEscopo, 'Não informado');
  const nenhum = novoResolver().resolve(dependencia({ issueLinks: [] }));
  assert.strictEqual(nenhum.DepEscopo, 'Não informado');
});

teste('link guarda tipo e status do item impactado, em chaves curtas', () => {
  const bloco = novoResolver().resolve(dependencia({
    issueLinks: [link('APR-9', 'Blocks', { issueType: 'Enabler', status: 'EM ANDAMENTO' })],
  }));
  assert.deepStrictEqual(bloco.DepLinks, [{ k: 'APR-9', t: 'Enabler', s: 'EM ANDAMENTO' }]);
});

console.log('\n== domínio: peso do payload ==');

teste('chaves sem conteúdo não são emitidas', () => {
  const bloco = novoResolver().resolve(dependencia({ issueLinks: [], timeExterno: null }));
  for (const k of ['DepLinks', 'DepExterno', 'DepDescricao', 'DepAprovada']) {
    assert.ok(!(k in bloco), `${k} não deveria estar no payload`);
  }
});

console.log('\n== enricher: só dependência carrega o bloco Dep* ==');

const enricher = new IssueEnricher(
  classifier, new FlowMetricsCalculator(new Date('2026-08-25T00:00:00Z')),
  null, null, null, novoResolver(),
);

teste('dependência ganha grupo próprio, e não o default Sub-task', () => {
  const r = enricher.enrich(dependencia());
  assert.strictEqual(r['Tipo Agrupado'], 'Dependência');
  assert.strictEqual(r.EhDependencia, true);
});

teste('issue comum não ganha nenhuma chave Dep*', () => {
  const r = enricher.enrich(new Issue({
    id: '2', key: 'COREX-2', issueType: 'Story', status: 'To Do',
    team: 'Squad Core - Core Features', createdAt: '2026-06-01T10:00:00.000Z', labels: [],
  }));
  assert.ok(!('EhDependencia' in r));
  assert.strictEqual(Object.keys(r).filter((k) => k.startsWith('Dep')).length, 0);
});

teste('a sobrescrita do enricher vence a data padrão (que viria vazia)', () => {
  const r = enricher.enrich(dependencia({
    status: 'Done',
    statusTransitions: [transicao('2026-06-21T09:00:00.000Z', 'EM ANDAMENTO', 'Done')],
  }));
  assert.strictEqual(r['Data Conclusao'], '2026-06-21');
  assert.strictEqual(r.LeadTimeDias, 20);
});

/* ==================================================================== */
/* ==================== VISÃO (jsdom) ================================= */
/* ==================================================================== */

console.log('\n== visão: a aba dentro do jsdom ==');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});
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
  constructor(ctx, config) { charts[ctx && ctx.canvas ? ctx.canvas.id : '?'] = config; }

  destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];
window.__RULES_PENDING = classificationRules.pendingStatuses;
window.__RULES_INPROG = classificationRules.inProgressStatuses;
window.__RULES_DONE = classificationRules.doneStatuses;
window.__RULES_CANCELLED = classificationRules.cancelledStatuses;
window.__DEP_TEAMS = {
  'core features': 'Core Features',
  'ativacao do curso': 'Ativação do Curso',
  'martech cdp e tracking [educon]': 'Martech CDP & Tracking [Educon]',
};

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  get DATA(){ return DATA; },
  selections, buildFilterBar, getFiltered, getFilteredNoDate, SKIP_DEP,
  renderDep, depIdadeDias, depRecorte, depSquads, updateFilterSummary,
  isStandard, isSubitem, TIPOS_FORA_DA_ABA_SPRINT, buildProgressiveEpicSummaries,
  set depRole(v){ depRole = v; },
  set dateRange(v){ dateRange.from = v.from; dateRange.to = v.to; },
  set openDrawer(v){ openDrawer = v; },
};`;
window.eval(script + epilogo);
const T = window.__T;
T.dateRange = { from: null, to: null }; // sem janela: o teste controla o recorte

/** Data ISO a N dias corridos atrás de hoje. */
const diasAtras = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
/** Dependência já enriquecida, no formato que chega ao navegador. */
const dep = (over = {}) => {
  seq += 1;
  return {
    Chave: `COREX-${seq}`, Resumo: 'dependência', 'Tipo de item': 'Dependência',
    'Tipo Agrupado': 'Dependência', Programa: 'Afya One', VS: 'VS X',
    Squad: 'Squad Core - Core Features', PI: 'PI3 - Afya One', Labels: ['PI3AfyaOne'],
    Status: 'To Do', Concluido: false, Cancelado: false, WIP: true,
    FaseFluxo: 'Pendente', EntregueAmplo: false, Incremental: false,
    'Story Points': 0, Sprints: [], SprintPeriodos: [],
    Criado: diasAtras(40), 'Data Conclusao': null,
    AnoMesCriacao: diasAtras(40).slice(0, 7), AnoCriacao: 2026, Mes: diasAtras(40).slice(5, 7),
    AnoMesConclusao: null, AnoConclusao: null, LeadTimeDias: null, AgingDias: null,
    parentKey: null, parent: null, EpicoChave: null,
    EhDependencia: true, DepDemandante: 'ativacao do curso', DepDependente: 'core features',
    DepEscopo: 'Não informado', DepInicio: null,
    ...over,
  };
};

const desenhar = () => {
  T.renderDep(T.getFiltered(T.SKIP_DEP), T.getFilteredNoDate(T.SKIP_DEP));
};
const kpi = (rotulo) => {
  const cards = Array.from(document.querySelectorAll('#dep-kpis .kpi'));
  const alvo = cards.find((c) => c.querySelector('.eyebrow').textContent.includes(rotulo));
  assert.ok(alvo, `KPI "${rotulo}" não existe`);
  return alvo.querySelector('.val').textContent.replace(/\D+$/, '').trim();
};

teste('a aba existe no menu e tem painel próprio', () => {
  assert.ok(document.querySelector('.tab-btn[data-tab="dep"]'), 'botão da aba');
  assert.ok(document.getElementById('panel-dep'), 'painel da aba');
});

teste('KPIs separam abertas, resolvidas e canceladas', () => {
  T.DATA = [
    dep(), dep(),
    dep({ Status: 'Done', Concluido: true, 'Data Conclusao': diasAtras(5), LeadTimeDias: 30, AnoMesConclusao: diasAtras(5).slice(0, 7) }),
    dep({ Status: 'CANCELADO', Cancelado: true, WIP: false, 'Data Conclusao': diasAtras(3) }),
  ];
  desenhar();
  assert.strictEqual(kpi('abertas'), '2');
  assert.strictEqual(kpi('Resolvidas'), '1');
  assert.strictEqual(kpi('Canceladas'), '1');
});

teste('idade da aberta conta da abertura até hoje — não congela no snapshot', () => {
  const aberta = dep({ Criado: diasAtras(40) });
  assert.strictEqual(T.depIdadeDias(aberta), 40);
});

teste('cancelada não soma dias: episódio contado, duração não medida', () => {
  const cancelada = dep({ Status: 'CANCELADO', Cancelado: true, Criado: diasAtras(40) });
  assert.strictEqual(T.depIdadeDias(cancelada), null);
});

teste('idade da concluída é o lead time, não o tempo até hoje', () => {
  const feita = dep({ Status: 'Done', Concluido: true, Criado: diasAtras(90), LeadTimeDias: 12 });
  assert.strictEqual(T.depIdadeDias(feita), 12);
});

/* Base com cauda longa de propósito: 10, 10, 10 e 70 dias.
   média = 25 | mediana = 10. Só a média passa nos dois casos abaixo. */
const comCaudaLonga = (over = {}) => [10, 10, 10, 70].map((dias) => dep({
  Status: 'Done', Concluido: true, LeadTimeDias: dias,
  'Data Conclusao': diasAtras(2), AnoMesConclusao: diasAtras(2).slice(0, 7), ...over,
}));

teste('tempo de resolução é MÉDIA, não mediana', () => {
  T.DATA = comCaudaLonga();
  desenhar();
  // fmt1 formata com ponto decimal, como em todas as outras abas.
  assert.strictEqual(kpi('Tempo médio de resolução'), '25.0');
});

teste('o p85 continua ao lado da média, mostrando a cauda', () => {
  T.DATA = comCaudaLonga();
  desenhar();
  const card = Array.from(document.querySelectorAll('#dep-kpis .kpi'))
    .find((c) => c.querySelector('.eyebrow').textContent.includes('Tempo médio'));
  assert.strictEqual(card.querySelector('.delta').textContent.trim(), 'p85: 43.0 dias');
});

teste('o gráfico por time usa a MESMA régua do card — senão a aba se contradiz', () => {
  T.DATA = comCaudaLonga({ DepDependente: 'core features' });
  desenhar();
  const cfg = charts['chart-dep-tempo'];
  const i = cfg.data.labels.indexOf('Core Features');
  assert.ok(i >= 0, `rótulos: ${cfg.data.labels.join(', ')}`);
  assert.strictEqual(cfg.data.datasets[0].data[i], 25);
});

teste('idade das abertas é MÉDIA', () => {
  // 10, 10, 10 e 70 dias de aberta: média 25, mediana 10.
  T.DATA = [10, 10, 10, 70].map((d) => dep({ Criado: diasAtras(d) }));
  desenhar();
  assert.strictEqual(kpi('Idade média das abertas'), '25');
});

teste('a matriz cruza demandante x dependente e é clicável', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
  ];
  desenhar();
  const celulas = Array.from(document.querySelectorAll('#dep-matrix td.has-val'));
  const par = celulas.find((c) => c.dataset.depL === 'ativacao do curso' && c.dataset.depC === 'core features');
  assert.ok(par, 'célula do par não foi desenhada');
  assert.strictEqual(par.textContent, '2');
  // O eixo mostra o rótulo do catálogo, nunca o id cru em minúsculas.
  const cabecalhos = Array.from(document.querySelectorAll('#dep-matrix tbody th')).map((t) => t.textContent);
  assert.ok(cabecalhos.includes('Ativação do Curso'), `rótulos: ${cabecalhos.join(', ')}`);
});

teste('a matriz totaliza as duas pontas: linha à direita, dependente no rodapé', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
  ];
  desenhar();
  // "quanto o time X pediu" — total da linha
  const linhaAtivacao = Array.from(document.querySelectorAll('#dep-matrix tbody tr'))
    .find((tr) => tr.querySelector('th').textContent === 'Ativação do Curso');
  assert.strictEqual(linhaAtivacao.querySelector('td.tot').textContent, '2');
  // "quanto pediram PARA o time X" — total da coluna, no rodapé
  const cols = Array.from(document.querySelectorAll('#dep-matrix thead th')).map((t) => t.textContent);
  const rodape = Array.from(document.querySelectorAll('#dep-matrix tfoot td'));
  const iCore = cols.indexOf('Core Features') - 1; // o rodapé começa depois do th
  assert.strictEqual(rodape[iCore].textContent, '3');
  // e o total geral fecha com o recorte
  assert.strictEqual(rodape[rodape.length - 1].textContent, '4');
});

teste('os totais abrem a lista da ponta correspondente', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'core features' }),
  ];
  desenhar();
  const aberto = [];
  T.openDrawer = (titulo, issues) => aberto.push({ titulo, n: issues.length });

  document.querySelector('#dep-matrix tbody td.tot').dispatchEvent(new window.Event('click'));
  assert.deepStrictEqual(aberto.pop(), { titulo: 'Demandadas por Ativação do Curso', n: 1 });

  document.querySelector('#dep-matrix tfoot td.tot:not(.geral)').dispatchEvent(new window.Event('click'));
  assert.deepStrictEqual(aberto.pop(), { titulo: 'Pedidas para Core Features', n: 2 });

  // O total geral não é um recorte — não abre nada.
  const geral = document.querySelector('#dep-matrix tfoot td.geral');
  geral.dispatchEvent(new window.Event('click'));
  assert.strictEqual(aberto.length, 0);
});

teste('o papel decide se o time filtra como demandante ou como dependente', () => {
  T.DATA = [
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
  ];
  T.depSquads.clear(); T.depSquads.add('core features');

  T.depRole = 'demandante';
  desenhar();
  assert.strictEqual(kpi('abertas'), '1');
  assert.strictEqual(T.depRecorte()[0].DepDependente, 'martech cdp e tracking [educon]');

  T.depRole = 'dependente';
  desenhar();
  assert.strictEqual(kpi('abertas'), '1');
  assert.strictEqual(T.depRecorte()[0].DepDemandante, 'ativacao do curso');

  T.depRole = 'ambos';
  desenhar();
  assert.strictEqual(kpi('abertas'), '2');

  T.depSquads.clear();
});

teste('"Time mais demandado" separa os três desfechos por time dependente', () => {
  T.DATA = [
    dep({ DepDependente: 'core features' }),
    dep({ DepDependente: 'core features', Status: 'Done', Concluido: true, LeadTimeDias: 10, 'Data Conclusao': diasAtras(2) }),
    dep({ DepDependente: 'core features', Status: 'CANCELADO', Cancelado: true }),
  ];
  desenhar();
  const cfg = charts['chart-dep-fila'];
  const linha = cfg.data.labels.indexOf('Core Features');
  assert.ok(linha >= 0, `rótulos: ${cfg.data.labels.join(', ')}`);
  // Array.from traz o array para o realm do teste: o que vem do jsdom tem outro
  // Array.prototype e deepStrictEqual reprova por identidade de protótipo.
  assert.deepStrictEqual(Array.from(cfg.data.datasets, (d) => d.data[linha]), [1, 1, 1]);
});

teste('itens impactados agregam por item e marcam quantas dependências seguem abertas', () => {
  T.DATA = [
    dep({ DepLinks: [{ k: 'APR-100', t: 'Enabler', s: 'To Do' }] }),
    dep({ DepLinks: [{ k: 'APR-100', t: 'Enabler', s: 'To Do' }], Status: 'Done', Concluido: true, LeadTimeDias: 5, 'Data Conclusao': diasAtras(1) }),
    dep({}),
  ];
  desenhar();
  const linhas = Array.from(document.querySelectorAll('#dep-impacto-table tbody tr'));
  assert.strictEqual(linhas.length, 1);
  assert.ok(linhas[0].textContent.includes('APR-100'));
  assert.ok(linhas[0].textContent.includes('(1 aberta)'), linhas[0].textContent);
  // A cobertura fica escrita: ler a tabela como o universo dos itens travados
  // seria errado quando só parte das dependências tem link.
  const cobertura = document.getElementById('dep-impacto-cobertura').textContent;
  assert.ok(/2 de 3/.test(cobertura), cobertura);
  assert.ok(/67%/.test(cobertura), cobertura);
});

teste('a qualidade do preenchimento conta o que falta em cada campo', () => {
  T.DATA = [
    dep({ DepDemandante: null }),
    dep({ DepLinks: [{ k: 'APR-1', t: 'Story', s: 'To Do' }], DepEscopo: 'Mesma VS' }),
    dep({ PI: 'Não informado' }),
    dep({}),
  ];
  desenhar();
  const quadros = Array.from(document.querySelectorAll('#dep-quality .q'));
  const porRotulo = Object.fromEntries(quadros.map((q) => [q.querySelector('.ql').textContent, q.querySelector('.qv').textContent]));
  const acha = (parte) => Object.entries(porRotulo).find(([k]) => k.includes(parte));
  assert.strictEqual(acha('Time Demandante')[1], '75%');
  assert.strictEqual(acha('item linkado')[1], '25%');
  assert.strictEqual(acha('link oficial')[1], '25%');
  assert.strictEqual(acha('label de PI')[1], '75%');
});

teste('Squad e Papel ficam na barra de filtros, no mesmo padrão dos demais', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
  ];
  T.buildFilterBar();
  const time = document.getElementById('dd-depSquad');
  const papel = document.getElementById('dd-depPapel');
  assert.ok(time && papel, 'os dois dropdowns deveriam existir na barra');
  // Mesma estrutura dos filtros globais — é o que garante o mesmo visual.
  ['dd-btn', 'dd-panel', 'dd-list'].forEach((c) => {
    assert.ok(time.querySelector(`.${c}`), `Squad sem .${c}`);
    assert.ok(papel.querySelector(`.${c}`), `Papel sem .${c}`);
  });
  assert.ok(time.querySelector('.dd-search'), 'Squad deveria ter busca, como PI e Status');
  assert.ok(time.querySelector('.dd-actions'), 'Squad deveria ter Todos/Limpar');
  // Papel é seleção única: itens .single, sem checkbox.
  assert.strictEqual(papel.querySelectorAll('input[type=checkbox]').length, 0);
  assert.strictEqual(papel.querySelectorAll('.dd-item.single').length, 3);
  assert.strictEqual(papel.querySelectorAll('.dd-item.single.selected').length, 1);
  // A barra é a mesma: os dois entram junto dos filtros globais.
  const irmaos = Array.from(document.querySelectorAll('#filterBar .filter-controls > .dropdown')).map((d) => d.id);
  assert.ok(irmaos.includes('dd-depSquad') && irmaos.includes('dd-Squad'), irmaos.join(', '));
  // Na tela ele se chama "Squad", como nas outras abas — o global fica escondido.
  assert.strictEqual(time.querySelector('.dd-btn span').textContent, 'Squad');
});

teste('o filtro de Squad aceita MAIS DE UMA squad ao mesmo tempo', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
    dep({ DepDemandante: 'preparatorios', DepDependente: 'dados' }),
  ];
  T.buildFilterBar();
  const caixas = Array.from(document.querySelectorAll('#dd-depSquad input[type=checkbox]'));
  assert.deepStrictEqual(Array.from(caixas, (c) => c.value).sort(),
    ['ativacao do curso', 'core features', 'dados', 'martech cdp e tracking [educon]', 'preparatorios']);

  const marcar = (valor) => {
    const cb = caixas.find((c) => c.value === valor);
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change'));
  };
  marcar('core features');
  assert.strictEqual(kpi('abertas'), '2');
  marcar('dados');
  assert.strictEqual(kpi('abertas'), '3');
  assert.strictEqual(document.querySelector('#dd-depSquad .count').textContent, '2');

  T.depSquads.clear();
});

teste('a lista de squads sai do catálogo, ordenada e sem id cru', () => {
  T.DATA = [
    dep({ DepDemandante: 'ativacao do curso', DepDependente: 'core features' }),
    dep({ DepDemandante: 'core features', DepDependente: 'martech cdp e tracking [educon]' }),
  ];
  T.buildFilterBar();
  const rotulos = Array.from(document.querySelectorAll('#dd-depSquad .dd-item span'), (e) => e.textContent);
  assert.deepStrictEqual(rotulos, ['Ativação do Curso', 'Core Features', 'Martech CDP & Tracking [Educon]']);
});

teste('squad que sumiu da base para de filtrar em silêncio', () => {
  T.DATA = [dep({ DepDemandante: 'core features', DepDependente: 'dados' })];
  T.depSquads.clear(); T.depSquads.add('preparatorios'); // não existe mais na base
  T.buildFilterBar();
  assert.strictEqual(T.depSquads.size, 0);
  desenhar();
  assert.strictEqual(kpi('abertas'), '1');
});

/* ---- Regressão: a Dependência não pode vazar para as outras abas ----
   Ela entra na base pela JQL, mas não é trabalho de entrega da squad. O filtro
   padrão de Tipo já a deixa de fora do painel comum; o que NÃO protege são as
   abas que usam SKIP_TIPO (Sprint, velocity), e é por isso que estes casos
   existem. 141 das 189 dependências reais têm sprint preenchida e 28 têm Story
   Points: sem as exclusões abaixo, elas apareceriam como capacidade do time. */
teste('dependência NÃO é item standard — fica fora de sprint e velocity', () => {
  assert.strictEqual(T.isStandard(dep({ Sprints: ['S1'], 'Story Points': 8 })), false);
  // e os demais tipos seguem exatamente como antes
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'História' }), true);
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'Enabler' }), true);
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'Bug' }), true);
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'Débito Técnico' }), true);
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'Épico' }), false);
  assert.strictEqual(T.isStandard({ 'Tipo Agrupado': 'Sub-task' }), false);
  // não virou subitem por tabela: continua sendo o seu próprio tipo
  assert.strictEqual(T.isSubitem(dep()), false);
});

teste('dependência some da lista de tipos da aba Sprint', () => {
  const fora = Array.from(T.TIPOS_FORA_DA_ABA_SPRINT);
  assert.ok(fora.includes('Dependência'), fora.join(', '));
});

teste('dependência não entra no rollup do épico, mesmo tendo pai', () => {
  const construir = T.buildProgressiveEpicSummaries;
  const epico = {
    Chave: 'COREX-1', Resumo: 'épico', 'Tipo Agrupado': 'Épico', EpicoChave: 'COREX-1',
    Concluido: false, Cancelado: false, 'Story Points': 0, Squad: 'S', VS: 'V', Programa: 'P', PI: 'PI3', Status: 'EM ANDAMENTO',
  };
  const filho = {
    Chave: 'COREX-2', 'Tipo Agrupado': 'História', EpicoChave: 'COREX-1',
    Concluido: true, Cancelado: false, 'Story Points': 5,
  };
  const dependencia = {
    Chave: 'COREX-3', 'Tipo Agrupado': 'Dependência', EpicoChave: 'COREX-1',
    Concluido: false, Cancelado: false, 'Story Points': 8, EhDependencia: true,
  };
  const [semDep] = construir([epico, filho]);
  const [comDep] = construir([epico, filho, dependencia]);
  // A dependência não muda nada no épico: nem o total, nem o %, nem os SP.
  assert.strictEqual(comDep.TotalItens, semDep.TotalItens);
  assert.strictEqual(comDep.PctConclusao, semDep.PctConclusao);
  assert.strictEqual(comDep.SPTotal, semDep.SPTotal);
  assert.strictEqual(comDep.TotalItens, 2);
});

teste('o snapshot do navegador é invalidado — senão a aba nasce parcial', () => {
  // O painel guarda o dataset em IndexedDB e, ao reabrir, só busca no Jira o que
  // mudou (`delta`, updated >= -Nd). O snapshot antigo foi montado quando a JQL
  // nem pedia Dependência, então sem subir a versão a aba mostraria apenas as
  // dependências mexidas no período — um número plausível e errado, que é pior
  // do que a aba vazia. Este caso trava o par (versão, campos do payload).
  const versao = Number(/const DASHBOARD_SCHEMA_VERSION = (\d+);/.exec(html)[1]);
  assert.ok(versao >= 11, `a aba de Dependências exige recoleta completa (versão ${versao})`);
  // E o guardião continua descartando snapshot de versão anterior.
  assert.ok(/snap\.schemaVersion===DASHBOARD_SCHEMA_VERSION\?snap:null/.test(html),
    'o snapshot de versão diferente precisa ser descartado');
});

teste('a barra troca o Squad global e o Tipo pelos filtros da aba', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.ok(/#filterBar\.dep-only #dd-Tipo_de_item/.test(css), 'Tipo deveria sumir na aba');
  assert.ok(/#filterBar\.dep-only #dd-Squad/.test(css), 'Squad deveria sumir na aba');
  // E o contrário: Time e Papel só existem aqui.
  assert.ok(/#dd-depSquad,#dd-depPapel\{display:none;\}/.test(css), 'Squad/Papel da aba deveriam ficar ocultos por padrão');
  assert.ok(/#filterBar\.dep-only #dd-depSquad/.test(css), 'o Squad da aba deveria aparecer aqui');
});

console.log(`\n${passou} verificações passaram.`);
