'use strict';

/**
 * Testes do TEMPO POR STATUS: o StatusTimeResolver, a ligação dele no
 * IssueEnricher e a normalização dos cinco status que estavam fora das listas
 * de classificação.
 *
 * O que estes testes protegem, em uma frase cada:
 *
 *   - o status INICIAL não gera entrada no changelog do Jira, então o tempo da
 *     primeira fila só existe se for reconstruído do `from` da primeira
 *     transição. Se isso quebrar, o `Backlog` (a maior fila do fluxo) desaparece
 *     do gráfico sem nenhum sinal de erro;
 *   - a permanência ABERTA (status atual) não entra na conta. Um item concluído
 *     não pode acumular "tempo em Concluído" que cresce sozinho;
 *   - reentradas SOMAM no mesmo status e contam `visitas`, senão retrabalho vira
 *     duas médias diluídas em vez de tempo acumulado;
 *   - `StatusHistoricoOk` precisa dizer a verdade: cronologia que não fecha é
 *     tempo parcial, e o painel conta esses itens em vez de escondê-los;
 *   - o campo só existe em itens CONCLUÍDOS — é o recorte da visão e é o que
 *     mantém o lote progressivo pequeno (o Amplify limita o tamanho da resposta).
 *
 * Sem rede: fixtures sintéticos.
 *
 * Rode com:  npm run test:status-time
 */
const assert = require('assert');
const StatusTimeResolver = require('../src/domain/services/StatusTimeResolver');
const IssueClassifier = require('../src/domain/services/IssueClassifier');
const IssueEnricher = require('../src/domain/services/IssueEnricher');
const FlowMetricsCalculator = require('../src/domain/services/FlowMetricsCalculator');
const SprintHistoryResolver = require('../src/domain/services/SprintHistoryResolver');
const SprintDeliveryResolver = require('../src/domain/services/SprintDeliveryResolver');
const rules = require('../src/config/classification.rules');

const resolver = new StatusTimeResolver();
const classifier = new IssueClassifier(rules);

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

/** Atalho: mapa status -> dias, para asserções legíveis. */
const dias = (r) => Object.fromEntries(r.permanencias.map((p) => [p.status, p.dias]));
const visitas = (r) => Object.fromEntries(r.permanencias.map((p) => [p.status, p.visitas]));

console.log('\nStatusTimeResolver — reconstrução das permanências:');

check('o status inicial vem do `from` da primeira transição, contado desde a criação', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Desenvolvimento',
    transitions: [
      { at: '2026-07-11T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
    ],
  });
  // 10 dias em Backlog (criação -> transição). Desenvolvimento está ABERTO.
  assert.deepStrictEqual(dias(r), { Backlog: 10 });
});

check('a permanência ABERTA (status atual) fica fora da conta', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Backlog: 2, Desenvolvimento: 5 });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dias(r), 'Concluído'), false);
});

check('cada status aparece UMA vez, com o tempo somado das passagens', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-02T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-05T00:00:00.000Z', from: 'Desenvolvimento', to: 'CODE REVIEW' },
      // devolvido: volta para Desenvolvimento e passa por CODE REVIEW de novo
      { at: '2026-07-06T00:00:00.000Z', from: 'CODE REVIEW', to: 'Desenvolvimento' },
      { at: '2026-07-09T00:00:00.000Z', from: 'Desenvolvimento', to: 'CODE REVIEW' },
      { at: '2026-07-10T00:00:00.000Z', from: 'CODE REVIEW', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Backlog: 1, Desenvolvimento: 6, 'CODE REVIEW': 2 });
  assert.deepStrictEqual(visitas(r), { Backlog: 1, Desenvolvimento: 2, 'CODE REVIEW': 2 });
  assert.strictEqual(r.permanencias.length, 3);
});

check('a soma das permanências fecha com o intervalo criação -> última transição', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-02T12:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-07T06:00:00.000Z', from: 'Desenvolvimento', to: 'Em teste' },
      { at: '2026-07-09T18:00:00.000Z', from: 'Em teste', to: 'Concluído' },
    ],
  });
  const total = r.permanencias.reduce((a, p) => a + p.dias, 0);
  assert.strictEqual(Number(total.toFixed(2)), 8.75); // 01T00:00 -> 09T18:00
});

check('transições fora de ordem são ordenadas antes de medir', () => {
  const foraDeOrdem = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
    ],
  });
  assert.deepStrictEqual(dias(foraDeOrdem), { Backlog: 2, Desenvolvimento: 5 });
});

check('fração de dia é preservada (arredonda em 2 casas)', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-01T06:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-01T14:30:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Backlog: 0.25, Desenvolvimento: 0.35 });
});

check('o arredondamento acontece no TOTAL, não em cada passagem', () => {
  // Três passagens de 8h (0.333...d cada). Somando arredondado daria 0.99;
  // somando antes de arredondar dá 1.
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-01T08:00:00.000Z', from: 'Fila', to: 'X' },
      { at: '2026-07-01T09:00:00.000Z', from: 'X', to: 'Fila' },
      { at: '2026-07-01T17:00:00.000Z', from: 'Fila', to: 'X' },
      { at: '2026-07-01T18:00:00.000Z', from: 'X', to: 'Fila' },
      { at: '2026-07-02T02:00:00.000Z', from: 'Fila', to: 'Concluído' },
    ],
  });
  assert.strictEqual(dias(r).Fila, 1);
  assert.strictEqual(visitas(r).Fila, 3);
});

console.log('\nStatusTimeResolver — dados ruins não viram número inventado:');

check('sem transição alguma: nada medido e histórico NÃO reconstruído', () => {
  const r = resolver.resolve({ createdAt: '2026-07-01T00:00:00.000Z', status: 'Concluído', transitions: [] });
  assert.deepStrictEqual(r.permanencias, []);
  assert.strictEqual(r.reconstructed, false);
});

check('sem data de criação, a primeira permanência é descartada (não estimada)', () => {
  const r = resolver.resolve({
    createdAt: null,
    status: 'Concluído',
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Desenvolvimento: 5 });
});

check('transição anterior à criação não gera tempo negativo', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-10T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-05T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-12T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.strictEqual(dias(r).Backlog, undefined);
  assert.deepStrictEqual(dias(r), { Desenvolvimento: 7 });
});

check('transição sem data é ignorada', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: null, from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-04T00:00:00.000Z', from: 'Backlog', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Backlog: 3 });
  assert.strictEqual(r.reconstructed, true);
});

check('`from` nulo não inventa um status para receber o tempo', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: null, to: 'Desenvolvimento' },
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Desenvolvimento: 5 });
});

check('permanência de zero dia não entra na lista', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-01T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-05T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Desenvolvimento: 4 });
});

check('espaços nas pontas do nome do status não criam dois baldes', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-02T00:00:00.000Z', from: 'Backlog ', to: ' Desenvolvimento' },
      { at: '2026-07-04T00:00:00.000Z', from: 'Desenvolvimento', to: 'Backlog' },
      { at: '2026-07-05T00:00:00.000Z', from: 'Backlog', to: 'Concluído' },
    ],
  });
  assert.deepStrictEqual(dias(r), { Backlog: 2, Desenvolvimento: 2 });
  assert.strictEqual(visitas(r).Backlog, 2);
});

console.log('\nStatusHistoricoOk — a cronologia fecha ou não fecha:');

check('cronologia que termina no status atual é reconstruída', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  });
  assert.strictEqual(r.reconstructed, true);
});

check('último destino diferente do status atual = changelog truncado', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Deploy em PROD', // o item avançou, mas o changelog para antes
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
    ],
  });
  assert.strictEqual(r.reconstructed, false);
  // ainda assim mede o que deu para medir — é tempo parcial, não tempo falso
  assert.deepStrictEqual(dias(r), { Backlog: 2 });
});

check('buraco no meio da série (from != to anterior) também não fecha', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'Concluído',
    transitions: [
      { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      // saiu de "Em teste" sem nunca ter entrado nele, pelo changelog
      { at: '2026-07-09T00:00:00.000Z', from: 'Em teste', to: 'Concluído' },
    ],
  });
  assert.strictEqual(r.reconstructed, false);
});

check('status atual vazio não é tratado como cronologia fechada', () => {
  const r = resolver.resolve({
    createdAt: '2026-07-01T00:00:00.000Z',
    status: null,
    transitions: [{ at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' }],
  });
  assert.strictEqual(r.reconstructed, false);
});

console.log('\nIssueEnricher — o campo só existe onde é medido:');

const enricher = new IssueEnricher(
  classifier,
  new FlowMetricsCalculator(new Date('2026-08-24T00:00:00.000Z')),
  new SprintHistoryResolver(),
  new SprintDeliveryResolver(classifier),
  new StatusTimeResolver(),
);

/** Issue mínima no formato da entidade de domínio. */
const issue = (over = {}) => ({
  key: 'X-1',
  summary: 's',
  issueType: 'Story',
  projectName: 'VS A',
  team: 'Squad A',
  status: 'Concluído',
  storyPoints: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  resolvedAt: '2026-07-08T00:00:00.000Z',
  labels: [],
  sprints: [],
  sprintTransitions: [],
  statusTransitions: [
    { at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
    { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
  ],
  ...over,
});

check('item concluído recebe TempoPorStatus e StatusHistoricoOk', () => {
  const e = enricher.enrich(issue());
  assert.deepStrictEqual(e.TempoPorStatus, [
    { status: 'Backlog', dias: 2 },
    { status: 'Desenvolvimento', dias: 5 },
  ]);
  assert.strictEqual(e.StatusHistoricoOk, true);
});

check('item EM ABERTO não recebe nenhuma das duas chaves', () => {
  const e = enricher.enrich(issue({ status: 'Desenvolvimento', resolvedAt: null }));
  assert.strictEqual('TempoPorStatus' in e, false);
  assert.strictEqual('StatusHistoricoOk' in e, false);
});

check('item CANCELADO não recebe as chaves (não é entrega)', () => {
  const e = enricher.enrich(issue({ status: 'CANCELADO', resolvedAt: null }));
  assert.strictEqual('TempoPorStatus' in e, false);
});

check('concluído sem changelog não recebe as chaves (nada a dizer)', () => {
  const e = enricher.enrich(issue({ statusTransitions: [] }));
  assert.strictEqual('TempoPorStatus' in e, false);
  assert.strictEqual('StatusHistoricoOk' in e, false);
});

check('`visitas` é omitido quando vale 1 e presente quando há reentrada', () => {
  const e = enricher.enrich(issue({
    statusTransitions: [
      { at: '2026-07-02T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' },
      { at: '2026-07-04T00:00:00.000Z', from: 'Desenvolvimento', to: 'CODE REVIEW' },
      { at: '2026-07-05T00:00:00.000Z', from: 'CODE REVIEW', to: 'Desenvolvimento' },
      { at: '2026-07-08T00:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
  }));
  const porStatus = Object.fromEntries(e.TempoPorStatus.map((p) => [p.status, p]));
  assert.strictEqual('visitas' in porStatus.Backlog, false);
  assert.strictEqual(porStatus.Desenvolvimento.visitas, 2);
});

check('sem resolver injetado, o enricher segue funcionando (degrada sem o campo)', () => {
  const semResolver = new IssueEnricher(
    classifier,
    new FlowMetricsCalculator(new Date('2026-08-24T00:00:00.000Z')),
    new SprintHistoryResolver(),
    new SprintDeliveryResolver(classifier),
  );
  const e = semResolver.enrich(issue());
  assert.strictEqual('TempoPorStatus' in e, false);
  assert.strictEqual(e.LeadTimeDias, 7); // o resto do registro continua íntegro
});

check('StatusHistoricoOk false chega ao payload (o painel precisa contar)', () => {
  const e = enricher.enrich(issue({
    status: 'Done',
    statusTransitions: [{ at: '2026-07-03T00:00:00.000Z', from: 'Backlog', to: 'Desenvolvimento' }],
  }));
  assert.strictEqual(e.StatusHistoricoOk, false);
  assert.deepStrictEqual(e.TempoPorStatus, [{ status: 'Backlog', dias: 2 }]);
});

console.log('\nNormalização dos status que estavam fora das listas:');

const NORMALIZADOS = ['To Do', 'Aprofundamento', 'PI Planning',
  'PRONTO P/ PREPARAR PI PLANNING', 'Design detalhado'];

NORMALIZADOS.forEach((status) => {
  check(`"${status}" é Pendente (antes caía no default "Em andamento")`, () => {
    assert.strictEqual(classifier.phaseOf(status), 'Pendente');
    assert.strictEqual(classifier.isPending(status), true);
  });
});

check('a normalização NÃO mexe no WIP (isWip não consulta pendingStatuses)', () => {
  NORMALIZADOS.forEach((status) => assert.strictEqual(classifier.isWip(status), true));
});

check('nenhum status aparece em duas listas de fase', () => {
  const todas = [...rules.doneStatuses, ...rules.pendingStatuses,
    ...rules.inProgressStatuses, ...rules.cancelledStatuses];
  assert.strictEqual(todas.length, new Set(todas).size);
});

check('phaseOf é exaustivo: todo status das listas cai em exatamente uma fase', () => {
  const esperado = new Map([
    ...rules.pendingStatuses.map((s) => [s, 'Pendente']),
    ...rules.inProgressStatuses.map((s) => [s, 'Em andamento']),
    ...rules.doneStatuses.map((s) => [s, 'Concluído']),
    ...rules.cancelledStatuses.map((s) => [s, 'Cancelado']),
  ]);
  for (const [status, fase] of esperado) {
    assert.strictEqual(classifier.phaseOf(status), fase, `${status} deveria ser ${fase}`);
  }
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
