'use strict';

import fs = require('fs');
import path = require('path');
import configModule = require('../config');
import classificationRules = require('../config/classification.rules');
import dependencyRules = require('../config/dependency.rules');
import quarterRules = require('../config/quarter.rules');
import DependencyResolver = require('../domain/services/DependencyResolver');
import EpicHealthEvaluator = require('../domain/services/EpicHealthEvaluator');
import EpicSummaryBuilder = require('../domain/services/EpicSummaryBuilder');
import FlowMetricsCalculator = require('../domain/services/FlowMetricsCalculator');
import IssueClassifier = require('../domain/services/IssueClassifier');
import IssueEnricher = require('../domain/services/IssueEnricher');
import SprintDeliveryResolver = require('../domain/services/SprintDeliveryResolver');
import SprintHistoryResolver = require('../domain/services/SprintHistoryResolver');
import StatusTimeResolver = require('../domain/services/StatusTimeResolver');
import PersistentCache = require('../infrastructure/cache/PersistentCache');
import JiraFieldMap = require('../infrastructure/jira/JiraFieldMap');
import JiraHttpClient = require('../infrastructure/jira/JiraHttpClient');
import JiraIssueRepository = require('../infrastructure/jira/JiraIssueRepository');
import GetDashboardDataUseCase = require('./use-cases/GetDashboardDataUseCase');
import GetProgressiveDashboardDataUseCase = require('./use-cases/GetProgressiveDashboardDataUseCase');

const { loadConfig } = configModule;
type DashboardPayload = Awaited<ReturnType<GetDashboardDataUseCase['execute']>>;
type ProgressiveInput = Parameters<GetProgressiveDashboardDataUseCase['execute']>[0];

function createDashboardRuntime(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const referenceDate = new Date();
  const fieldMap = new JiraFieldMap(config.env);
  const httpClient = new JiraHttpClient({
    baseUrl: config.jira.baseUrl, email: config.jira.email,
    apiToken: config.jira.apiToken, searchPath: config.jira.searchPath,
    pageSize: config.jira.pageSize,
  });
  const issueRepository = new JiraIssueRepository({ httpClient, fieldMap, jql: config.jira.jql });
  const cache = new PersistentCache<DashboardPayload>(config.cacheFilePath);
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
    getProgressiveDashboardData: (input: ProgressiveInput) => getProgressiveDashboardDataUseCase.execute(input),
    publicDir,
  };
}

export = { createDashboardRuntime };
