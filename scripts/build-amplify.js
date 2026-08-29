'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.amplify-hosting');
const compute = path.join(output, 'compute', 'default');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(compute, { recursive: true });
fs.cpSync(path.join(root, 'dist', 'src'), path.join(compute, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(compute, 'public'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(output, 'static'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules'), path.join(compute, 'node_modules'), { recursive: true });

const jiraEnvironmentKeys = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_JQL',
  'JIRA_SEARCH_PATH',
  'JIRA_PAGE_SIZE',
  'JIRA_FIELD_TEAM',
  'JIRA_FIELD_STORY_POINTS',
  'JIRA_FIELD_START_DATE',
  'JIRA_FIELD_ACTUAL_START',
  'JIRA_FIELD_ACTUAL_END',
  'JIRA_FIELD_SPRINT',
  'JIRA_FIELD_BCP',
  'JIRA_FIELD_BLOCK_REASON',
  'JIRA_FIELD_TIME_DEMANDANTE',
  'JIRA_FIELD_TIME_EXTERNO',
  'JIRA_FIELD_DEP_APROVADA',
  'JIRA_FIELD_DEP_DESCRICAO',
];
const runtimeConfig = {
  AMPLIFY_COMPUTE: '1', PORT: '3000',
  CACHE_FILE_PATH: '/tmp/jira-flow-metrics/dataset.json',
  PROGRESSIVE_PAGES_PER_REQUEST: process.env.PROGRESSIVE_PAGES_PER_REQUEST || '5',
};
for (const key of jiraEnvironmentKeys) {
  if (process.env[key]) runtimeConfig[key] = process.env[key];
}
if (process.env.AWS_BRANCH && (!runtimeConfig.JIRA_EMAIL || !runtimeConfig.JIRA_API_TOKEN)) {
  throw new Error('Configure JIRA_EMAIL e JIRA_API_TOKEN nas variaveis de ambiente do Amplify.');
}
fs.writeFileSync(path.join(compute, 'runtime-config.json'), JSON.stringify(runtimeConfig, null, 2));
fs.writeFileSync(path.join(compute, 'server.js'), `'use strict';
const config = require('./runtime-config.json');
for (const [key, value] of Object.entries(config)) if (!process.env[key]) process.env[key] = value;
require('./src/main').start().catch((error) => {
  console.error('[amplify] startup failure:', error);
  process.exitCode = 1;
});
`);

const manifest = {
  version: 1,
  framework: { name: 'express', version: require('../node_modules/express/package.json').version },
  routes: [
    { path: '/*.*', target: { kind: 'Static', cacheControl: 'public, max-age=300' },
      fallback: { kind: 'Compute', src: 'default' } },
    { path: '/*', target: { kind: 'Compute', src: 'default' } },
  ],
  computeResources: [{ name: 'default', runtime: 'nodejs22.x', entrypoint: 'server.js' }],
};
fs.writeFileSync(path.join(output, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[amplify] bundle criado em ${output}`);
