'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GetProgressiveDashboardDataUseCase = require('../src/application/use-cases/GetProgressiveDashboardDataUseCase');

function rawIssue(key, type, parentKey = null) {
  return {
    key,
    issueType: type,
    sprintMeta: [],
  };
}

(async () => {
  let receivedJql = '';
  const issueRepository = {
    async findBatch(input) {
      receivedJql = input.jql;
      return {
        issues: [rawIssue('EP-1', 'Epic'), rawIssue('ST-1', 'Story', 'EP-1')],
        nextPageToken: 'next-token', isLast: false, pages: 5,
      };
    },
  };
  const rules = { pendingStatuses: ['Backlog'], inProgressStatuses: ['Doing'] };
  const classifier = { rules };
  const enricher = {
    classifier,
    enrich(issue) {
      const group = issue.issueType === 'Epic' ? 'Épico' : 'História';
      return { Chave: issue.key, 'Tipo Agrupado': group, parentKey: issue.parentKey,
        EpicoChave: null, SaudeEpico: null };
    },
  };
  const useCase = new GetProgressiveDashboardDataUseCase({
    issueRepository, enricher, epicHealthEvaluator: { evaluate: () => 'Saudável' },
    baseJql: 'project = TEST ORDER BY created DESC', maxPages: 9,
  });
  const recent = await useCase.execute({ phase: 'recent' });
  assert.match(receivedJql, /created >= -60d/);
  assert.equal(recent.issues.length, 2);
  assert.equal(recent.issues[0].EpicoChave, 'EP-1');
  assert.equal(recent.issues[0].SaudeEpico, 'Saudável');
  assert.equal(recent.nextPageToken, 'next-token');
  assert.equal(recent.pages, 5);

  await useCase.execute({ phase: 'history', nextPageToken: 'abc' });
  assert.match(receivedJql, /created < -60d/);
  await useCase.execute({ phase: 'delta', since: new Date().toISOString() });
  assert.match(receivedJql, /updated >= -[12]d/);
  await assert.rejects(() => useCase.execute({ phase: 'delta', since: 'invalida' }), /Data incremental invalida/);
  await assert.rejects(() => useCase.execute({ phase: 'invalid' }), /Fase progressiva invalida/);

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const inlineScripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1]).filter(Boolean);
  for (const script of inlineScripts) new Function(script);
  assert.match(html, /\/api\/dashboard\/progressive/);
  assert.match(html, /indexedDB\.open/);
  assert.match(html, /reconcileProgressiveIssues/);
  assert.match(html, /bar\.replaceChildren\(\)/);
  assert.match(html, /filterDocumentHandlerBound/);
  assert.match(html, /if\(!filterDocumentHandlerBound\)/);
  assert.match(html, /complete:isLast/);
  assert.match(html, /lastSyncAt/);
  assert.match(html, /mode:'delta'/);
  assert.match(html, /cacheComplete&&!forceRefresh/);
  assert.match(html, /loadIncremental\(cached,generation\)/);

  console.log('Carga progressiva: 23 verificacoes passaram.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
