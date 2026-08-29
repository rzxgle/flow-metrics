'use strict';

import path = require('path');

/**
 * Configuração central da aplicação, lida de variáveis de ambiente (.env).
 * Um único lugar para ler o ambiente — o resto do código recebe valores já
 * validados por injeção.
 */
function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const jql =
    env.JIRA_JQL ||
    // JQL original extraída da aba "About" da planilha:
    'project IN (LEG, COREX, APP, "DESC", CONV, APR, PLAT, MART) ' +
      'AND type IN (Epic, "Enabler Epic", "Bug hotfix", Bug, Sub-block, Sub-bug, Sub-imp, ' +
      'Sub-design, História, Story, Melhoria, Sub-script, Sub-task, Sub-test, ' +
      '"Technical Debt", "Correção Staging", Enabler, Dependência) AND created >= startOfYear() ORDER BY created DESC';

  return {
    port: Number(env.PORT) || 3000,
    jira: {
      baseUrl: env.JIRA_BASE_URL || 'https://medcel.atlassian.net',
      email: env.JIRA_EMAIL || '',
      apiToken: env.JIRA_API_TOKEN || '',
      searchPath: env.JIRA_SEARCH_PATH || '/rest/api/3/search/jql',
      pageSize: Number(env.JIRA_PAGE_SIZE) || 100,
      jql,
    },
    cacheTtlMs: Number(env.CACHE_TTL_MS) || 5 * 60 * 1000,
    cacheFilePath: env.CACHE_FILE_PATH || path.join(process.cwd(), 'cache', 'dataset.json'),
    refreshIntervalMs: Number(env.REFRESH_INTERVAL_MS) || 60 * 60 * 1000, // 1 hora
    env, // repassado ao JiraFieldMap para ler os IDs de custom fields
  };
}

export = { loadConfig };
