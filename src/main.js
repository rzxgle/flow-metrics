'use strict';

require('dotenv').config();

const { createDashboardRuntime } = require('./application/createDashboardRuntime');
const DashboardController = require('./interfaces/http/controllers/DashboardController');
const { createServer } = require('./interfaces/http/server');

async function start() {
  const runtime = createDashboardRuntime(process.env);

  if (!runtime.config.jira.email || !runtime.config.jira.apiToken) {
    console.warn('\nJIRA_EMAIL / JIRA_API_TOKEN nao configurados. Configure .env ou o Amplify.\n');
  }

  const dashboardController = new DashboardController({
    refresh: runtime.refresh,
    cache: runtime.cache,
  });
  const app = createServer({ dashboardController, publicDir: runtime.publicDir });
  const server = app.listen(runtime.config.port, () => {
    console.log(`\nFlow Metrics rodando em http://localhost:${runtime.config.port}`);
    console.log(`API: http://localhost:${runtime.config.port}/api/dashboard\n`);

    if (process.env.AMPLIFY_COMPUTE === '1') {
      console.log('[cache] modo Amplify Compute: atualizacao sob demanda habilitada.');
      return;
    }

    runtime.refresh().catch((error) => console.error('[cache] falha na carga inicial:', error.message));
    setInterval(() => {
      runtime.refresh().catch((error) => console.error('[refresh] falha no ciclo:', error.message));
    }, runtime.config.refreshIntervalMs).unref();
    console.log(`[cache] atualizacao automatica a cada ` +
      `${(runtime.config.refreshIntervalMs / 60000).toFixed(0)} min.`);
  });

  return { app, server, runtime };
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[startup] falha ao iniciar:', error);
    process.exitCode = 1;
  });
}

module.exports = { start };
