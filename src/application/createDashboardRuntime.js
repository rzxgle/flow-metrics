'use strict';

const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config');
const classificationRules = require('../config/classification.rules');
const quarterRules = require('../config/quarter.rules');
const dependencyRules = require('../config/dependency.rules');
const IssueClassifier = require('../domain/services/IssueClassifier');
const FlowMetricsCalculator = require('../domain/services/FlowMetricsCalculator');
const IssueEnricher = require('../domain/services/IssueEnricher');
const EpicSummaryBuilder = require('../domain/services/EpicSummaryBuilder');
const EpicHealthEvaluator = require('../domain/services/EpicHealthEvaluator');
const SprintHistoryResolver = require('../domain/services/SprintHistoryResolver');
const SprintDeliveryResolver = require('../domain/services/SprintDeliveryResolver');
const StatusTimeResolver = require('../domain/services/StatusTimeResolver');
const DependencyResolver = require('../domain/services/DependencyResolver');
const GetDashboardDataUseCase = require('./use-cases/GetDashboardDataUseCase');
const GetProgressiveDashboardDataUseCase = require('./use-cases/GetProgressiveDashboardDataUseCase');
const JiraFieldMap = require('../infrastructure/jira/JiraFieldMap');
const JiraHttpClient = require('../infrastructure/jira/JiraHttpClient');
const JiraIssueRepository = require('../infrastructure/jira/JiraIssueRepository');
const PersistentCache = require('../infrastructure/cache/PersistentCache');

function createDashboardRuntime(env = process.env) {
  const config = loadConfig(env);
  const referenceDate = new Date();
  const fieldMap = new JiraFieldMap(config.env);
  const httpClient = new JiraHttpClient({
    baseUrl: config.jira.baseUrl, email: config.jira.email,
    apiToken: config.jira.apiToken, searchPath: config.jira.searchPath,
    pageSize: config.jira.pageSize,
  });
  const issueRepository = new JiraIssueRepository({ httpClient, fieldMap, jql: config.jira.jql });
  const cache = new PersistentCache(config.cacheFilePath);
  const classifier = new IssueClassifier(classificationRules);
  const metricsCalculator = new FlowMetricsCalculator(referenceDate);
  const dependencyResolver = new DependencyResolver(classifier, dependencyRules);
  const enricher = new IssueEnricher(
    classifier, metricsCalculator,
    new SprintHistoryResolver(), new SprintDeliveryResolver(classifier),
    new StatusTimeResolver(), dependencyResolver,
  );
  const epicSummaryBuilder = new EpicSummaryBuilder();
  const epicHealthEvaluator = new EpicHealthEvaluator(classifier, referenceDate);
  const getDashboardDataUseCase = new GetDashboardDataUseCase({
    issueRepository, enricher, epicSummaryBuilder, epicHealthEvaluator, quarterRules,
  });
  const getProgressiveDashboardDataUseCase = new GetProgressiveDashboardDataUseCase({
    issueRepository,
    enricher,
    epicHealthEvaluator,
    quarterRules,
    piLabelRules: classificationRules.piRulesInPriorityOrder,
    baseJql: config.jira.jql,
    maxPages: env.PROGRESSIVE_PAGES_PER_REQUEST || 5,
  });

  async function refresh() {
    const t0 = Date.now();
    console.log('[refresh] iniciando coleta no Jira...');
    metricsCalculator.setReferenceDate(new Date());
    epicHealthEvaluator.setReferenceDate(new Date());
    const payload = await getDashboardDataUseCase.execute();
    cache.set(payload);
    console.log(`[refresh] coleta concluida em ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
      `(${payload.issues ? payload.issues.length : 0} issues).`);
    return payload;
  }

  const bundledPublicDir = path.join(__dirname, '..', '..', 'public');
  // No bundle do Amplify, `public` fica ao lado de `src`. Em desenvolvimento,
  // o backend roda de `dist/src`, mas deve servir o frontend-fonte para que
  // alterações no HTML apareçam sem uma etapa de cópia a cada edição.
  const publicDir = fs.existsSync(bundledPublicDir)
    ? bundledPublicDir
    : path.join(process.cwd(), 'public');

  return {
    config,
    cache,
    refresh,
    getProgressiveDashboardData: (input) => getProgressiveDashboardDataUseCase.execute(input),
    publicDir,
  };
}

module.exports = { createDashboardRuntime };
