'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GetProgressiveDashboardDataUseCase = require('../src/application/use-cases/GetProgressiveDashboardDataUseCase');

function rawIssue(key: string, type: string, parentKey: string | null = null) {
  return {
    key,
    issueType: type,
    sprintMeta: [],
  };
}

(async () => {
  let receivedJql = '';
  let receivedInput: any = null;
  const issueRepository = {
    async findBatch(input: any) {
      receivedInput = input;
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
    enrich(issue: any) {
      const group = issue.issueType === 'Epic' ? 'Épico' : 'História';
      return { Chave: issue.key, 'Tipo Agrupado': group, parentKey: issue.parentKey,
        EpicoChave: null, SaudeEpico: null };
    },
  };
  const useCase = new GetProgressiveDashboardDataUseCase({
    issueRepository, enricher, epicHealthEvaluator: { evaluate: () => 'Saudável' },
    baseJql: 'project = TEST ORDER BY created DESC', maxPages: 9,
    quarterRules: { ignoredStatuses: ['Cancelado', 'Inválido'] },
    piLabelRules: [{ label: 'PI3One', pi: 'PI3' }, { label: 'NOVOPI3One', pi: 'PI3' }],
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

  const piEpics = await useCase.execute({ phase: 'pi-epics' });
  assert.match(receivedJql, /labels in \("PI3One", "NOVOPI3One"\)/);
  assert.match(receivedJql, /issuetype in \(Epic, "Enabler Epic"\)/);
  assert.match(receivedJql, /status not in \("Cancelado", "Inválido"\)/);
  assert.doesNotMatch(receivedJql, /startOfYear|created\s*[<>]=?/i);
  assert.equal(receivedInput.includeSprintHistory, false);
  assert.equal(piEpics.issues, undefined);
  assert.equal(piEpics.piIssues.length, 2);

  await useCase.execute({ phase: 'pi-children', epicKeys: ['EP-1', 'EP-2'] });
  assert.match(receivedJql, /parent in \(EP-1, EP-2\)/);
  assert.equal(receivedInput.includeSprintHistory, false);
  await assert.rejects(() => useCase.execute({ phase: 'pi-children', epicKeys: ['chave inválida'] }), /Chave de epico invalida/);

const loadDashboardHtml = require('./support/dashboardHtml');
const html = loadDashboardHtml();
  const inlineScripts = Array.from(
    html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi) as Iterable<RegExpMatchArray>,
  ).map((match) => match[1]).filter(Boolean);
  for (const script of inlineScripts) new Function(script);
  assert.match(html, /\/api\/dashboard\/progressive/);
  assert.match(html, /indexedDB\.open/);
  assert.match(html, /reconcileProgressiveIssues/);
  assert.match(html, /bar\.replaceChildren\(\)/);
  assert.match(html, /filterDocumentHandlerBound/);
  assert.match(html, /if\(!filterDocumentHandlerBound\)/);
  assert.match(html, /loadPiTrackingDataset/);
  assert.match(html, /piIssues/);
  assert.match(html, /loadLocalDashboard\(forceRefresh,generation\)/);
  assert.match(html, /const piIssues=await loadPiTrackingDataset\(generation\)/);
  assert.doesNotMatch(html, /renderProgressiveDataset\(issues,issues,/);
  assert.match(html, /(?:cached\.progress\.phase|progress\?\.phase)==='pi'\s*\?\s*phases\.length/);
  assert.match(html, /lastSyncAt/);
  assert.match(html, /mode:'delta'/);
  assert.match(html, /cacheComplete&&!forceRefresh/);
  assert.match(html, /loadIncremental\(cached,generation\)/);
  assert.match(html, /dashboard-loading/);
  assert.match(html, /CARREGANDO DADOS/);
  assert.match(html, /updateLoadingProgress/);
  assert.match(html, /label='issues buscadas'/);
  assert.match(html, /'itens do PI buscados'/);
  assert.match(html, /updateLoadingProgress\(freshMap\.size,rotuloEtapaCarga\(phase\)\)/);
  assert.match(html, /updateLoadingProgress\(changedKeys\.size,'Buscando novas alterações no Jira\.\.\.','issues atualizadas'\)/);
  assert.match(html, /matchesSprintTabFilters\(d, SKIP_TIPO\)/);
  assert.match(html, /initSprintSelector\(\);\s*renderSprint\(\)/);
  assert.doesNotMatch(html, /batchNumber%2===0/);

  console.log('Carga progressiva: 29 verificacoes passaram.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
