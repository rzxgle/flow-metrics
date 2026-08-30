'use strict';

/**
 * Teste de integração da transformação (raw -> enriquecido).
 *
 * Usa um fixture sintético que exercita TODAS as regras reconstruídas por
 * engenharia reversa (validadas contra 3.202 issues reais, com correspondência
 * de 100% nos campos usados pelo dashboard e 183/183 nas agregações de épico).
 *
 * Rode com:  npm run test:transform
 */
const assert = require('assert');
const Issue = require('../src/domain/entities/Issue');
const rules = require('../src/config/classification.rules');
const IssueClassifier = require('../src/domain/services/IssueClassifier');
const FlowMetricsCalculator = require('../src/domain/services/FlowMetricsCalculator');
const IssueEnricher = require('../src/domain/services/IssueEnricher');
const EpicSummaryBuilder = require('../src/domain/services/EpicSummaryBuilder');
const EpicHealthEvaluator = require('../src/domain/services/EpicHealthEvaluator');
const SprintHistoryResolver = require('../src/domain/services/SprintHistoryResolver');
const GetDashboardDataUseCase = require('../src/application/use-cases/GetDashboardDataUseCase');
const IssueRepository = require('../src/domain/repositories/IssueRepository');

// Data de referência fixa para tornar o Aging determinístico:
const REF = new Date('2026-07-15T12:01:00Z');

// --- Fixture sintético (entrada crua, como sairia do JiraIssueRepository) ---
const fixture = [
  {
    key: 'AONE-1', summary: 'Épico de teste', issueType: 'Epic',
    projectName: 'APRENDER', team: 'Squad Aprender - Preparatórios', status: 'Desenvolvimento',
    storyPoints: 0, createdAt: '2026-05-01T10:00:00Z', labels: ['PI3AfyaOne'], parentKey: null,
  },
  {
    key: 'AONE-2', summary: 'História concluída', issueType: 'História',
    projectName: 'APRENDER', team: 'Squad Aprender - Preparatórios', status: 'Concluído',
    storyPoints: 5, createdAt: '2026-06-01T10:00:00Z',
    actualStartDate: '2026-06-03T10:00:00Z', actualEndDate: '2026-06-05T16:00:00Z',
    labels: ['PI3AfyaOne'], parentKey: 'AONE-1',
  },
  {
    key: 'AONE-3', summary: 'Sub-task herda incremental da história', issueType: 'Sub-imp',
    projectName: 'APRENDER', team: 'Squad Aprender - Preparatórios', status: 'EM ANDAMENTO',
    storyPoints: 1, createdAt: '2026-06-10T09:00:00Z', actualStartDate: '2026-06-11T09:00:00Z',
    labels: ['PI3AfyaOne'], parentKey: 'AONE-2',
  },
  {
    // Spillover: entrou na S1 depois de criado e foi ACUMULADO na S2 (padrão do Jira).
    key: 'AONE-6', summary: 'História que arrastou de sprint', issueType: 'História',
    projectName: 'APRENDER', team: 'Squad Aprender - Preparatórios', status: 'EM ANDAMENTO',
    storyPoints: 8, createdAt: '2026-06-01T08:00:00Z',
    // sem épico de propósito: mantém a agregação de AONE-1 igual, isolando o
    // que este item existe para testar (a reconstrução de sprint).
    labels: ['PI3AfyaOne'], parentKey: null,
    sprints: ['S1', 'S2'],
    sprintMeta: [
      { name: 'S1', startDate: '2026-06-02T00:00:00Z', endDate: '2026-06-15T00:00:00Z', state: 'closed' },
      { name: 'S2', startDate: '2026-06-16T00:00:00Z', endDate: '2026-06-29T00:00:00Z', state: 'active' },
    ],
    sprintTransitions: [
      { at: '2026-06-03T10:00:00.000Z', from: [], to: ['S1'] },
      { at: '2026-06-16T09:00:00.000Z', from: ['S1'], to: ['S1', 'S2'] },
    ],
  },
  {
    key: 'AONE-4', summary: 'Bug (não incremental)', issueType: 'Bug hotfix',
    projectName: 'CORE EXPERIENCE', team: '', status: 'CANCELADO',
    storyPoints: 3, createdAt: '2026-06-02T10:00:00Z', labels: ['PI2AfyaOne'], parentKey: 'AONE-1',
  },
  {
    key: 'AONE-5', summary: 'Datas invertidas -> métricas nulas', issueType: 'Sub-test',
    projectName: 'CORE EXPERIENCE', team: 'Squad Core - Core Features', status: 'Concluído',
    storyPoints: 2, createdAt: '2026-06-06T10:00:00Z',
    actualStartDate: '2026-06-05T15:00:00Z', actualEndDate: '2026-06-05T10:00:00Z', // fim antes do início e da criação
    labels: ['PI4AfyaOne'], parentKey: 'AONE-1',
  },
  {
    key: 'BRG-1', summary: 'Épico do Afya Bridge', issueType: 'Enabler Epic',
    projectName: 'Value Streams Afya Bridge', projectKey: 'LEG', team: 'Squad Bridge', status: 'CANCELADO',
    storyPoints: 8, createdAt: '2026-04-01T10:00:00Z', labels: ['EpicoPI2Legado'], parentKey: null,
  },
  /* BOPS ("Operação e Bugs") é do Afya Bridge, não do Afya One — decisão do
     time. O projeto não está na JQL geral: ele só entra pela coleta da aba PI
     Tracking, que busca épicos por label de PI sem filtro de projeto. Antes da
     regra, este épico contava como Afya One. */
  {
    key: 'BOPS-2768', summary: 'Autenticação por JWT', issueType: 'Enabler Epic',
    projectName: 'Operação e Bugs', projectKey: 'BOPS', team: 'Squad Bridge', status: 'Done',
    storyPoints: 5, createdAt: '2026-02-10T10:00:00Z', labels: ['EpicoPI1Legado'], parentKey: null,
  },
  /* Mesmo projeto renomeado no Jira: a chave continua sendo BOPS, e é ela que
     tem de decidir. Classificar só por nome erraria em silêncio no dia do
     rename. */
  {
    key: 'BOPS-9999', summary: 'Projeto renomeado', issueType: 'Epic',
    projectName: 'Sustentação e Operações', projectKey: 'BOPS', team: 'Squad Bridge', status: 'Backlog',
    storyPoints: 0, createdAt: '2026-03-01T10:00:00Z', labels: ['EpicoPI2Legado'], parentKey: null,
  },
];

class FakeRepo extends IssueRepository {
  async findAll() { return fixture.map((r) => new Issue(r)); }
}

function build() {
  const classifier = new IssueClassifier(rules);
  const metrics = new FlowMetricsCalculator(REF);
  return new GetDashboardDataUseCase({
    issueRepository: new FakeRepo(),
    enricher: new IssueEnricher(classifier, metrics, new SprintHistoryResolver()),
    epicSummaryBuilder: new EpicSummaryBuilder(),
    epicHealthEvaluator: new EpicHealthEvaluator(classifier, REF),
  });
}

(async () => {
  const { issues, epics } = await build().execute();
  const byKey: Record<string, any> = Object.fromEntries(issues.map((i: any) => [i.Chave, i]));
  let passed = 0;
  const check = (desc: string, fn: () => void) => { fn(); passed++; console.log('  ✓', desc); };

  console.log('\nTransformação raw -> enriquecido:');

  check('Tipo Agrupado: Epic -> Épico', () =>
    assert.strictEqual(byKey['AONE-1']['Tipo Agrupado'], 'Épico'));
  check('Tipo Agrupado: Bug hotfix -> Bug', () =>
    assert.strictEqual(byKey['AONE-4']['Tipo Agrupado'], 'Bug'));
  check('Tipo Agrupado: Sub-imp -> Sub-task', () =>
    assert.strictEqual(byKey['AONE-3']['Tipo Agrupado'], 'Sub-task'));

  check('Programa: projeto normal -> Afya One', () =>
    assert.strictEqual(byKey['AONE-2'].Programa, 'Afya One'));
  check('Programa: Value Streams Afya Bridge -> Afya Bridge', () =>
    assert.strictEqual(byKey['BRG-1'].Programa, 'Afya Bridge'));
  check('Programa: BOPS ("Operação e Bugs") -> Afya Bridge', () =>
    assert.strictEqual(byKey['BOPS-2768'].Programa, 'Afya Bridge'));
  check('Programa: a CHAVE decide, mesmo se o projeto for renomeado', () =>
    assert.strictEqual(byKey['BOPS-9999'].Programa, 'Afya Bridge'));
  check('Programa: a Value Stream continua sendo o nome do projeto, não o programa', () =>
    assert.strictEqual(byKey['BOPS-2768'].VS, 'Operação e Bugs'));

  check('PI: PI3AfyaOne -> "PI3 - Afya One"', () =>
    assert.strictEqual(byKey['AONE-1'].PI, 'PI3 - Afya One'));
  check('PI: PI4AfyaOne -> "PI4 - Afya One"', () =>
    assert.strictEqual(byKey['AONE-5'].PI, 'PI4 - Afya One'));
  check('PI: EpicoPI2Legado -> "PI2 - Legado"', () =>
    assert.strictEqual(byKey['BRG-1'].PI, 'PI2 - Legado'));
  check('PI: label despriorizada não entra mais no PI3', () =>
    assert.strictEqual(new IssueClassifier(rules).piOf(['DESPRIORIZADOPI3AfyaOne']), 'Não informado'));

  check('Flags de status: Concluído', () => {
    assert.strictEqual(byKey['AONE-2'].Concluido, true);
    assert.strictEqual(byKey['AONE-2'].WIP, false);
  });
  check('Flags de status: CANCELADO', () => {
    assert.strictEqual(byKey['AONE-4'].Cancelado, true);
    assert.strictEqual(byKey['AONE-4'].WIP, false);
  });
  check('Flags de status: em andamento -> WIP', () =>
    assert.strictEqual(byKey['AONE-3'].WIP, true));

  check('Squad vazio -> "Não informado"', () =>
    assert.strictEqual(byKey['AONE-4'].Squad, 'Não informado'));

  check('Lead Time (fim - criação) só p/ concluído', () => {
    // 2026-06-01 10:00 -> 2026-06-05 16:00 = 4.25 dias
    assert.strictEqual(byKey['AONE-2'].LeadTimeDias, 4.25);
    assert.strictEqual(byKey['AONE-3'].LeadTimeDias, null); // não concluído
  });
  check('Cycle Time (fim - início real)', () => {
    // 2026-06-03 10:00 -> 2026-06-05 16:00 = 2.25 dias
    assert.strictEqual(byKey['AONE-2'].CycleTimeDias, 2.25);
  });
  check('Datas invertidas -> Lead/Cycle nulos', () => {
    assert.strictEqual(byKey['AONE-5'].CycleTimeDias, null);
    assert.strictEqual(byKey['AONE-5'].LeadTimeDias, null);
  });
  check('Aging (meia-noite ref - início real)', () => {
    // AONE-3: início 2026-06-11 09:00 -> ref meia-noite 2026-07-15 = 33.6 dias
    assert.strictEqual(byKey['AONE-3'].AgingDias, 33.6);
  });
  check('Aging nulo sem Data de início real (sem fallback p/ criação)', () => {
    // AONE-1: em WIP, criado em 2026-05-01, mas nunca iniciado de fato
    assert.strictEqual(byKey['AONE-1']['Data Inicio Real'], null);
    assert.strictEqual(byKey['AONE-1'].AgingDias, null);
  });

  check('SprintPeriodos: entrada por sprint reconstruída do changelog', () => {
    const p = byKey['AONE-6'].SprintPeriodos;
    assert.strictEqual(byKey['AONE-6'].SprintHistoricoOk, true);
    assert.deepStrictEqual(p.find((x: any) => x.sprint === 'S1'),
      { sprint: 'S1', enteredAt: '2026-06-03T10:00:00.000Z', leftAt: null });
    // entrou na S2 só no dia 16 -> na S1 era compromisso, na S2 é escopo adicionado
    assert.deepStrictEqual(p.find((x: any) => x.sprint === 'S2'),
      { sprint: 'S2', enteredAt: '2026-06-16T09:00:00.000Z', leftAt: null });
  });
  check('item sem sprint não inventa histórico', () => {
    assert.deepStrictEqual(byKey['AONE-2'].SprintPeriodos, []);
    assert.strictEqual(byKey['AONE-2'].SprintHistoricoOk, true);
  });

  check('EpicoChave resolvido via cadeia de parents', () => {
    assert.strictEqual(byKey['AONE-3'].EpicoChave, 'AONE-1'); // sub -> história -> épico
    assert.strictEqual(byKey['AONE-2'].EpicoChave, 'AONE-1');
    assert.strictEqual(byKey['AONE-1'].EpicoChave, 'AONE-1'); // épico aponta p/ si
  });

  check('Incremental: história=true, bug=false, sub herda da história=true', () => {
    assert.strictEqual(byKey['AONE-2'].Incremental, true);
    assert.strictEqual(byKey['AONE-4'].Incremental, false);
    assert.strictEqual(byKey['AONE-3'].Incremental, true);
  });

  check('Agregação de épico (AONE-1)', () => {
    const e = epics.find((x: any) => x.Chave === 'AONE-1');
    // membros: AONE-1..5 (todos apontam p/ AONE-1). Total=5, Concluídos=2, Cancelados=1
    assert.strictEqual(e.TotalItens, 5);
    assert.strictEqual(e.Concluidos, 2);
    assert.strictEqual(e.Cancelados, 1);
    // Pct = 2 / (5-1) * 100 = 50.0
    assert.strictEqual(e.PctConclusao, 50);
    assert.strictEqual(e.SPTotal, 11); // 0+5+1+3+2
    assert.strictEqual(e.SPConcluido, 7); // 5 (AONE-2) + 2 (AONE-5)
  });

  console.log(`\n✅ ${passed} verificações passaram.\n`);
})().catch((e) => {
  console.error('\n❌ Teste falhou:', e.message, '\n');
  process.exit(1);
});
