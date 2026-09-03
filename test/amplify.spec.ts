// @ts-nocheck -- valida artefatos dinâmicos produzidos pelo bundle.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const fakeEmail = 'amplify-test@example.invalid';
const fakeToken = 'amplify-test-token-not-a-secret';
execFileSync(process.execPath, [path.join(root, 'dist', 'scripts', 'build-amplify.js')], {
  cwd: root,
  env: { ...process.env, AWS_BRANCH: 'main', JIRA_EMAIL: fakeEmail,
    JIRA_API_TOKEN: fakeToken },
});

const output = path.join(root, '.amplify-hosting');
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'deploy-manifest.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(
  path.join(output, 'compute', 'default', 'runtime-config.json'), 'utf8',
));

assert.equal(manifest.version, 1);
assert.equal(manifest.computeResources[0].runtime, 'nodejs22.x');
assert.equal(manifest.computeResources[0].entrypoint, 'server.js');
assert.ok(manifest.routes.some((route) => route.target.kind === 'Compute'));
assert.equal(runtime.AMPLIFY_COMPUTE, '1');
assert.equal(runtime.JIRA_API_TOKEN, fakeToken);
assert.equal(runtime.JIRA_EMAIL, fakeEmail);
assert.ok(!fs.readFileSync(path.join(output, 'static', 'index.html'), 'utf8').includes(fakeToken));
assert.ok(fs.existsSync(path.join(output, 'static', 'index.html')));
assert.ok(fs.existsSync(path.join(output, 'compute', 'default', 'src', 'main.js')));

console.log('Amplify bundle: 10 verificacoes passaram.');
