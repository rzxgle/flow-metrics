'use strict';

/**
 * Testes da data de ENTREGA DA SPRINT: o SprintDeliveryResolver, a normalização
 * do changelog de Status e a ligação dos dois no IssueEnricher.
 *
 * A regra que estes testes protegem veio do processo dos times: a homologação
 * integrada acontece DEPOIS da sprint, então o compromisso da sprint é dado por
 * pronto quando o item entra no PRIMEIRO status da categoria Done — hoje
 * "Pronto p/ Deploy STG". Os status seguintes e o campo manual "Data de Fim
 * Real" descrevem o release, e usá-los jogava sistematicamente o trabalho da
 * sprint para fora da própria sprint (162 itens / 686 SP medidos na base).
 *
 * Rode com:  npm run test:delivery
 */
const assert = require('assert');
const SprintDeliveryResolver = require('../src/domain/services/SprintDeliveryResolver');
const IssueClassifier = require('../src/domain/services/IssueClassifier');
const IssueEnricher = require('../src/domain/services/IssueEnricher');
const FlowMetricsCalculator = require('../src/domain/services/FlowMetricsCalculator');
const SprintHistoryResolver = require('../src/domain/services/SprintHistoryResolver');
const JiraIssueRepository = require('../src/infrastructure/jira/JiraIssueRepository');
const JiraFieldMap = require('../src/infrastructure/jira/JiraFieldMap');
const rules = require('../src/config/classification.rules');

const classifier = new IssueClassifier(rules);
const resolver = new SprintDeliveryResolver(classifier);

let passed = 0;
const check = (desc: string, fn: () => void) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nSprintDeliveryResolver:');

check('item aberto não tem data de entrega', () => {
  const r = resolver.resolve({ status: 'Desenvolvimento', statusTransitions: [], fallback: '2026-07-01' });
  assert.strictEqual(r.at, null);
  assert.strictEqual(r.source, 'none');
});

check('vale a ENTRADA no Done, não o status final do release', () => {
  const r = resolver.resolve({
    status: 'Deploy em PROD',
    statusTransitions: [
      { at: '2026-07-20T10:00:00.000Z', from: 'Em teste', to: 'Pronto p/ Deploy STG' },
      { at: '2026-08-05T10:00:00.000Z', from: 'Pronto p/ Deploy STG', to: 'Homologação integrada' },
      { at: '2026-08-12T10:00:00.000Z', from: 'Homologação integrada', to: 'Deploy em PROD' },
    ],
    fallback: '2026-08-12',
  });
  assert.strictEqual(r.at, '2026-07-20T10:00:00.000Z');
  assert.strictEqual(r.source, 'changelog');
});

check('transições internas ao Done não deslocam a data', () => {
  const r = resolver.resolve({
    status: 'PRONTO PARA PROD',
    statusTransitions: [
      { at: '2026-07-20T10:00:00.000Z', from: 'CODE REVIEW', to: 'Pronto p/ Deploy STG' },
      { at: '2026-07-21T10:00:00.000Z', from: 'Pronto p/ Deploy STG', to: 'Deploy em Staging' },
      { at: '2026-07-22T10:00:00.000Z', from: 'Deploy em Staging', to: 'PRONTO PARA PROD' },
    ],
    fallback: null,
  });
  assert.strictEqual(r.at, '2026-07-20T10:00:00.000Z');
});

check('item reaberto: vale a ÚLTIMA entrada no Done', () => {
  const r = resolver.resolve({
    status: 'Concluído',
    statusTransitions: [
      { at: '2026-07-10T10:00:00.000Z', from: 'Em teste', to: 'Pronto p/ Deploy STG' },
      { at: '2026-07-12T10:00:00.000Z', from: 'Pronto p/ Deploy STG', to: 'Desenvolvimento' },
      { at: '2026-07-28T10:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
    ],
    fallback: null,
  });
  assert.strictEqual(r.at, '2026-07-28T10:00:00.000Z',
    'creditar a primeira entrada daria a entrega a uma sprint em que o trabalho ainda seria refeito');
});

check('sub-tarefa que vai direto para Concluído também é datada', () => {
  const r = resolver.resolve({
    status: 'Concluído',
    statusTransitions: [{ at: '2026-07-15T09:00:00.000Z', from: 'Tarefas pendentes', to: 'Concluído' }],
    fallback: null,
  });
  assert.strictEqual(r.at, '2026-07-15T09:00:00.000Z');
});

check('transições fora de ordem são ordenadas antes de escolher', () => {
  const r = resolver.resolve({
    status: 'Concluído',
    statusTransitions: [
      { at: '2026-07-28T10:00:00.000Z', from: 'Desenvolvimento', to: 'Concluído' },
      { at: '2026-07-10T10:00:00.000Z', from: 'Em teste', to: 'Pronto p/ Deploy STG' },
      { at: '2026-07-12T10:00:00.000Z', from: 'Pronto p/ Deploy STG', to: 'Desenvolvimento' },
    ],
    fallback: null,
  });
  assert.strictEqual(r.at, '2026-07-28T10:00:00.000Z');
});

check('sem changelog, cai no fallback e marca a origem', () => {
  const r = resolver.resolve({ status: 'Concluído', statusTransitions: [], fallback: '2026-07-30' });
  assert.strictEqual(r.at, '2026-07-30');
  assert.strictEqual(r.source, 'fallback');
});

check('sem changelog e sem fallback, não inventa data', () => {
  const r = resolver.resolve({ status: 'Concluído', statusTransitions: [], fallback: null });
  assert.strictEqual(r.at, null);
  assert.strictEqual(r.source, 'none');
});

console.log('\nNormalização do changelog de Status:');

const fieldMap = new JiraFieldMap({});
const repo = new JiraIssueRepository({ httpClient: {}, fieldMap, jql: '' });

check('lê os NOMES dos status e ignora os outros campos', () => {
  const tr = repo._toStatusTransitions([
    { created: '2026-07-02T09:00:00.000Z', items: [{ field: 'status', fromString: 'To Do', toString: 'Em teste' }] },
    { created: '2026-07-03T09:00:00.000Z', items: [{ field: 'Sprint', fromString: 'A', toString: 'A, B' }] },
  ]);
  assert.strictEqual(tr.length, 1);
  assert.deepStrictEqual(tr[0], { at: '2026-07-02T09:00:00.000Z', from: 'To Do', to: 'Em teste' });
});

check('created em epoch (ms) vira ISO, como no changelog de Sprint', () => {
  const tr = repo._toStatusTransitions([
    { created: 1787168877846, items: [{ field: 'status', fromString: 'A', toString: 'B' }] },
  ]);
  assert.strictEqual(tr[0].at, new Date(1787168877846).toISOString());
});

console.log('\nIssueEnricher:');

const enricher = new IssueEnricher(
  classifier, new FlowMetricsCalculator(new Date('2026-08-20T00:00:00.000Z')),
  new SprintHistoryResolver(), resolver,
);
const baseIssue = {
  key: 'CONV-462', summary: '', issueType: 'Story', projectName: 'CONVERSÃO', team: 'Squad X',
  status: 'PRONTO PARA PROD', storyPoints: 5, createdAt: '2026-05-08T10:00:00.000Z',
  resolvedAt: null, dueDate: null, actualStartDate: '2026-06-02', actualEndDate: '2026-07-28',
  labels: [], parentKey: null, sprint: null, sprints: [], sprintTransitions: [],
  statusTransitions: [], bcp: null, blockReason: null,
};

check('a entrega de sprint sai separada da data de conclusão', () => {
  const e = enricher.enrich({
    ...baseIssue,
    statusTransitions: [
      { at: '2026-07-24T18:00:00.000Z', from: 'Em teste', to: 'Pronto p/ Deploy STG' },
      { at: '2026-08-01T18:00:00.000Z', from: 'Pronto p/ Deploy STG', to: 'PRONTO PARA PROD' },
    ],
  });
  assert.strictEqual(e['Data Entrega Sprint'], '2026-07-24', 'entrada no Done');
  assert.strictEqual(e['Data Conclusao'], '2026-07-28', 'campo manual, inalterado');
  assert.strictEqual(e.OrigemEntregaSprint, 'changelog');
});

check('sem changelog, a entrega repete a conclusão e a origem é "fallback"', () => {
  const e = enricher.enrich({ ...baseIssue });
  assert.strictEqual(e['Data Entrega Sprint'], '2026-07-28');
  assert.strictEqual(e.OrigemEntregaSprint, 'fallback');
});

check('sem resolver injetado o enricher mantém o comportamento antigo', () => {
  const semResolver = new IssueEnricher(
    classifier, new FlowMetricsCalculator(new Date('2026-08-20T00:00:00.000Z')),
    new SprintHistoryResolver(),
  );
  const e = semResolver.enrich({ ...baseIssue });
  assert.strictEqual(e['Data Entrega Sprint'], '2026-07-28');
});

(async () => {
  const chamadas: string[][] = [];
  const ok = new JiraIssueRepository({
    httpClient: {
      fetchFieldChangelogs: async (ids: string[], fields: string[]) => {
        chamadas.push(fields);
        return [{
          issueId: ids[0],
          changeHistories: [
            { created: '2026-07-02T09:00:00.000Z', items: [{ field: 'Sprint', fromString: '', toString: 'A' }] },
            { created: '2026-07-24T18:00:00.000Z', items: [{ field: 'status', fromString: 'Em teste', toString: 'Pronto p/ Deploy STG' }] },
          ],
        }];
      },
    },
    fieldMap,
    jql: '',
  });
  const out = await ok.attachChangelogs([{ id: '77', key: 'X-2', sprintTransitions: [], statusTransitions: [] }]);

  check('Sprint e Status vêm na MESMA chamada em lote (sem requisição extra)', () => {
    assert.strictEqual(chamadas.length, 1);
    assert.deepStrictEqual(chamadas[0], [fieldMap.sprint, fieldMap.status]);
  });

  check('os dois changelogs são anexados à issue', () => {
    assert.deepStrictEqual(out[0].sprintTransitions, [{ at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] }]);
    assert.deepStrictEqual(out[0].statusTransitions,
      [{ at: '2026-07-24T18:00:00.000Z', from: 'Em teste', to: 'Pronto p/ Deploy STG' }]);
  });

  const quebrado = new JiraIssueRepository({
    httpClient: { fetchFieldChangelogs: async () => { throw new Error('boom'); } },
    fieldMap,
    jql: '',
  });
  const degradado = await quebrado.attachChangelogs([{ id: '1', key: 'X-1', sprintTransitions: [], statusTransitions: [] }]);

  check('falha no changelog degrada sem derrubar a coleta', () => {
    assert.deepStrictEqual(degradado[0].statusTransitions, []);
  });

  console.log(`\n✅ ${passed} verificações passaram.\n`);
})().catch((e) => { console.error('\n❌ Teste falhou:', e.message, '\n'); process.exit(1); });
