'use strict';

/**
 * Testes do SprintHistoryResolver e da normalização do changelog de Sprint.
 *
 * Cada caso abaixo corresponde a um padrão OBSERVADO na base real (medido via
 * API antes de escrever o código), não a um cenário hipotético:
 *   - 552 itens standard criados já dentro da sprint (nenhuma transição);
 *   - 915 que entraram depois da criação ("" -> A);
 *   - 202 com spillover registrado (A -> "A, B" — o Jira ACUMULA no campo);
 *   - 69 com 2+ sprints e nenhuma transição (cronologia desconhecida);
 *   - casos de saída e retorno à mesma sprint (PLAT-1393, PLAT-1286).
 *
 * Rode com:  npm run test:sprint
 */
const assert = require('assert');
const SprintHistoryResolver = require('../src/domain/services/SprintHistoryResolver');
const JiraIssueRepository = require('../src/infrastructure/jira/JiraIssueRepository');
const JiraFieldMap = require('../src/infrastructure/jira/JiraFieldMap');

const resolver = new SprintHistoryResolver();
const CRIADO = '2026-07-01T10:00:00.000Z';

interface SprintMembership {
  sprint: string;
  enteredAt: string;
  leftAt: string | null;
}

let passed = 0;
const check = (desc: string, fn: () => void) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nSprintHistoryResolver:');

check('sem sprint nenhuma -> membership vazio, reconstruído', () => {
  const r = resolver.resolve({ createdAt: CRIADO, sprints: [], transitions: [] });
  assert.deepStrictEqual(r.membership, []);
  assert.strictEqual(r.reconstructed, true);
});

check('criado já na sprint (sem transição) -> membro desde a criação', () => {
  const r = resolver.resolve({ createdAt: CRIADO, sprints: ['A'], transitions: [] });
  assert.deepStrictEqual(r.membership, [{ sprint: 'A', enteredAt: CRIADO, leftAt: null }]);
  assert.strictEqual(r.reconstructed, true);
});

check('2+ sprints e nenhuma transição -> NÃO reconstruído (cronologia desconhecida)', () => {
  const r = resolver.resolve({ createdAt: CRIADO, sprints: ['A', 'B'], transitions: [] });
  assert.strictEqual(r.reconstructed, false);
  assert.strictEqual(r.membership.length, 2);
  // o conjunto é conhecido; a data de entrada cai na criação por falta de melhor
  assert.ok(r.membership.every((m: SprintMembership) => m.enteredAt === CRIADO && m.leftAt === null));
});

check('entrou depois da criação ("" -> A)', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: ['A'],
    transitions: [{ at: '2026-07-05T09:00:00.000Z', from: [], to: ['A'] }],
  });
  assert.deepStrictEqual(r.membership, [{ sprint: 'A', enteredAt: '2026-07-05T09:00:00.000Z', leftAt: null }]);
  assert.strictEqual(r.reconstructed, true);
});

check('spillover acumulado (A -> "A, B") mantém A e abre B na data certa', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: ['A', 'B'],
    transitions: [
      { at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] },
      { at: '2026-07-20T15:00:00.000Z', from: ['A'], to: ['A', 'B'] },
    ],
  });
  const a = r.membership.find((m: SprintMembership) => m.sprint === 'A');
  const b = r.membership.find((m: SprintMembership) => m.sprint === 'B');
  assert.deepStrictEqual(a, { sprint: 'A', enteredAt: '2026-07-02T09:00:00.000Z', leftAt: null });
  assert.deepStrictEqual(b, { sprint: 'B', enteredAt: '2026-07-20T15:00:00.000Z', leftAt: null });
  assert.strictEqual(r.reconstructed, true);
});

check('removido da sprint -> registra a saída', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: [],
    transitions: [
      { at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] },
      { at: '2026-07-09T09:00:00.000Z', from: ['A'], to: [] },
    ],
  });
  assert.deepStrictEqual(r.membership, [
    { sprint: 'A', enteredAt: '2026-07-02T09:00:00.000Z', leftAt: '2026-07-09T09:00:00.000Z' },
  ]);
});

check('saiu e VOLTOU à mesma sprint -> duas passagens, a última aberta', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: ['A'],
    transitions: [
      { at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] },
      { at: '2026-07-03T09:00:00.000Z', from: ['A'], to: [] },
      { at: '2026-07-10T09:00:00.000Z', from: [], to: ['A'] },
    ],
  });
  const passagens = r.membership.filter((m: SprintMembership) => m.sprint === 'A');
  assert.strictEqual(passagens.length, 2, 'deve haver duas passagens pela sprint A');
  assert.strictEqual(passagens[0].leftAt, '2026-07-03T09:00:00.000Z');
  assert.strictEqual(passagens[1].enteredAt, '2026-07-10T09:00:00.000Z');
  assert.strictEqual(passagens[1].leftAt, null, 'a passagem atual fica aberta');
});

check('transições fora de ordem são ordenadas por data', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: ['A', 'B'],
    transitions: [
      { at: '2026-07-20T15:00:00.000Z', from: ['A'], to: ['A', 'B'] },
      { at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] },
    ],
  });
  assert.strictEqual(r.membership.find((m: SprintMembership) => m.sprint === 'A').enteredAt, '2026-07-02T09:00:00.000Z');
  assert.strictEqual(r.membership.find((m: SprintMembership) => m.sprint === 'B').enteredAt, '2026-07-20T15:00:00.000Z');
});

check('changelog que não fecha no campo atual -> consistent/reconstructed false', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: ['A', 'Z'], // Z nunca aparece nas transições
    transitions: [{ at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] }],
  });
  assert.strictEqual(r.consistent, false);
  assert.strictEqual(r.reconstructed, false);
});

check('nomes com espaços sobrando são normalizados', () => {
  const r = resolver.resolve({
    createdAt: CRIADO, sprints: [' A '],
    transitions: [{ at: '2026-07-02T09:00:00.000Z', from: [], to: [' A '] }],
  });
  assert.strictEqual(r.membership[0].sprint, 'A');
  assert.strictEqual(r.consistent, true);
});

check('alias histórico APP_Aprenderr é normalizado sem alterar o sufixo da sprint', () => {
  const r = resolver.resolve({
    createdAt: '2026-06-18T10:00:00.000Z',
    sprints: ['26_SQD_APP_Aprender_PI3_3'],
    transitions: [{
      at: '2026-07-20T17:40:02.226Z',
      from: [],
      to: ['26_SQD_APP_Aprenderr_PI3_3'],
    }],
  });
  assert.deepStrictEqual(r.membership, [{
    sprint: '26_SQD_APP_Aprender_PI3_3',
    enteredAt: '2026-07-20T17:40:02.226Z',
    leftAt: null,
  }]);
  assert.strictEqual(r.consistent, true);
  assert.strictEqual(r.reconstructed, true);
});

check('alias APP_Aprenderr mantém PI3_3, PI3_4 e PI3_5 separados', () => {
  const r = resolver.resolve({
    createdAt: CRIADO,
    sprints: [
      '26_SQD_APP_Aprender_PI3_3',
      '26_SQD_APP_Aprender_PI3_4',
      '26_SQD_APP_Aprender_PI3_5',
    ],
    transitions: [{
      at: '2026-07-20T17:40:02.226Z',
      from: [],
      to: [
        '26_SQD_APP_Aprenderr_PI3_3',
        '26_SQD_APP_Aprenderr_PI3_4',
        '26_SQD_APP_Aprenderr_PI3_5',
      ],
    }],
  });
  assert.deepStrictEqual(r.membership.map((m: SprintMembership) => m.sprint), [
    '26_SQD_APP_Aprender_PI3_3',
    '26_SQD_APP_Aprender_PI3_4',
    '26_SQD_APP_Aprender_PI3_5',
  ]);
  assert.strictEqual(r.consistent, true);
});

check('nomes parecidos fora do alias explícito não são modificados', () => {
  const r = resolver.resolve({
    createdAt: CRIADO,
    sprints: ['26_SQD_APP_Aprender_PI3_3'],
    transitions: [{
      at: '2026-07-20T17:40:02.226Z',
      from: [],
      to: ['26_SQD_APP_Aprendeer_PI3_3'],
    }],
  });
  assert.strictEqual(r.consistent, false);
  assert.ok(r.membership.some((m: SprintMembership) => m.sprint === '26_SQD_APP_Aprendeer_PI3_3'));
});

console.log('\nNormalização do changelog cru (JiraIssueRepository):');

const fieldMap = new JiraFieldMap({ JIRA_FIELD_SPRINT: 'customfield_10113' });
const repo = new JiraIssueRepository({ httpClient: {}, fieldMap, jql: '' });

check('created em epoch millis vira ISO; lista separada por vírgula vira array', () => {
  const tr = repo._toSprintTransitions([
    { created: '1787168877846', items: [{ field: 'Sprint', fieldId: 'customfield_10113', fromString: 'A', toString: 'A, B' }] },
  ]);
  assert.strictEqual(tr.length, 1);
  assert.strictEqual(tr[0].at, new Date(1787168877846).toISOString());
  assert.deepStrictEqual(tr[0].from, ['A']);
  assert.deepStrictEqual(tr[0].to, ['A', 'B']);
});

check('created em ISO é preservado e campos de outro tipo são ignorados', () => {
  const tr = repo._toSprintTransitions([
    { created: '2026-08-10T12:19:23.116Z', items: [{ field: 'Sprint', fromString: '', toString: 'A' }] },
    { created: '2026-08-11T10:00:00.000Z', items: [{ field: 'status', fromString: 'To Do', toString: 'Done' }] },
  ]);
  assert.strictEqual(tr.length, 1, 'só a entrada de Sprint entra');
  assert.strictEqual(tr[0].at, '2026-08-10T12:19:23.116Z');
  assert.deepStrictEqual(tr[0].from, []);
});

(async () => {
  const quebrado = new JiraIssueRepository({
    httpClient: { fetchFieldChangelogs: async () => { throw new Error('boom'); } },
    fieldMap, jql: '',
  });
  const issues = [{ id: '1', key: 'X-1', sprintTransitions: [] }];
  const out = await quebrado.attachSprintTransitions(issues);
  check('falha no changelog não derruba a coleta (degrada sem histórico)', () => {
    assert.deepStrictEqual(out[0].sprintTransitions, []);
  });

  const ok = new JiraIssueRepository({
    httpClient: {
      fetchFieldChangelogs: async (ids: string[]) => [{
        issueId: ids[0],
        changeHistories: [{ created: '2026-07-02T09:00:00.000Z', items: [{ field: 'Sprint', fromString: '', toString: 'A' }] }],
      }],
    },
    fieldMap, jql: '',
  });
  const comLog = await ok.attachSprintTransitions([{ id: '77', key: 'X-2', sprintTransitions: [] }]);
  check('changelog em lote é casado por issueId', () => {
    assert.deepStrictEqual(comLog[0].sprintTransitions, [{ at: '2026-07-02T09:00:00.000Z', from: [], to: ['A'] }]);
  });

  console.log(`\n✅ ${passed} verificações passaram.\n`);
})().catch((e) => { console.error('\n❌ Teste falhou:', e.message, '\n'); process.exit(1); });
