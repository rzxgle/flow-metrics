'use strict';

require('dotenv').config();
const path = require('path');

const { loadConfig } = require('./config');
const classificationRules = require('./config/classification.rules');

// Domain
const IssueClassifier = require('./domain/services/IssueClassifier');
const FlowMetricsCalculator = require('./domain/services/FlowMetricsCalculator');
const IssueEnricher = require('./domain/services/IssueEnricher');
const EpicSummaryBuilder = require('./domain/services/EpicSummaryBuilder');
const EpicHealthEvaluator = require('./domain/services/EpicHealthEvaluator');

// Application
const GetDashboardDataUseCase = require('./application/use-cases/GetDashboardDataUseCase');

// Infrastructure
const JiraFieldMap = require('./infrastructure/jira/JiraFieldMap');
const JiraHttpClient = require('./infrastructure/jira/JiraHttpClient');
const JiraIssueRepository = require('./infrastructure/jira/JiraIssueRepository');
const InMemoryCache = require('./infrastructure/cache/InMemoryCache');

// Interface
const DashboardController = require('./interfaces/http/controllers/DashboardController');
const { createServer } = require('./interfaces/http/server');

/**
 * COMPOSITION ROOT
 * Único lugar que conhece as implementações concretas e as "amarra".
 * Trocar Jira por outra fonte de dados = trocar apenas o repositório aqui.
 */
function bootstrap() {
  const config = loadConfig();

  if (!config.jira.email || !config.jira.apiToken) {
    // eslint-disable-next-line no-console
    console.warn(
      '\n⚠️  JIRA_EMAIL / JIRA_API_TOKEN não configurados. ' +
        'Copie .env.example para .env e preencha as credenciais.\n',
    );
  }

  const referenceDate = new Date();

  // --- Infrastructure ---
  const fieldMap = new JiraFieldMap(config.env);
  const httpClient = new JiraHttpClient({
    baseUrl: config.jira.baseUrl,
    email: config.jira.email,
    apiToken: config.jira.apiToken,
    searchPath: config.jira.searchPath,
    pageSize: config.jira.pageSize,
  });
  const issueRepository = new JiraIssueRepository({
    httpClient,
    fieldMap,
    jql: config.jira.jql,
  });
  const cache = new InMemoryCache(config.cacheTtlMs);

  // --- Domain services ---
  const classifier = new IssueClassifier(classificationRules);
  const metricsCalculator = new FlowMetricsCalculator(referenceDate);
  const enricher = new IssueEnricher(classifier, metricsCalculator);
  const epicSummaryBuilder = new EpicSummaryBuilder();
  const epicHealthEvaluator = new EpicHealthEvaluator(classifier, referenceDate);

  // --- Application ---
  const getDashboardDataUseCase = new GetDashboardDataUseCase({
    issueRepository,
    enricher,
    epicSummaryBuilder,
    epicHealthEvaluator,
  });

  // --- Interface ---
  const dashboardController = new DashboardController({ getDashboardDataUseCase, cache });
  const app = createServer({
    dashboardController,
    publicDir: path.join(__dirname, '..', 'public'),
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`\n🚀 Flow Metrics rodando em http://localhost:${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`   API:  http://localhost:${config.port}/api/dashboard\n`);
  });
}

bootstrap();
