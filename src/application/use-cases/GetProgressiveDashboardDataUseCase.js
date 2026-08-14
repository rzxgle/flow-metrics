'use strict';

class GetProgressiveDashboardDataUseCase {
  constructor({ issueRepository, enricher, epicHealthEvaluator, baseJql, maxPages = 5 }) {
    this.issueRepository = issueRepository;
    this.enricher = enricher;
    this.epicHealthEvaluator = epicHealthEvaluator;
    this.baseJql = baseJql;
    this.maxPages = Math.max(1, Math.min(Number(maxPages) || 5, 5));
  }

  _jqlFor(phase, since) {
    const withoutOrder = this.baseJql.replace(/\s+ORDER\s+BY[\s\S]*$/i, '').trim();
    let dateClause;
    if (phase === 'recent') dateClause = 'created >= -60d';
    else if (phase === 'history') dateClause = 'created < -60d';
    else {
      const parsed = Date.parse(since || '');
      if (!Number.isFinite(parsed)) throw new Error('Data incremental invalida.');
      const elapsedDays = Math.ceil(Math.max(0, Date.now() - parsed) / 86400000) + 1;
      const days = Math.max(1, Math.min(elapsedDays, 366));
      dateClause = `updated >= -${days}d`;
    }
    return `(${withoutOrder}) AND ${dateClause} ORDER BY created DESC`;
  }

  async execute({ phase, nextPageToken, since }) {
    if (!['recent', 'history', 'delta'].includes(phase)) throw new Error('Fase progressiva invalida.');
    const batch = await this.issueRepository.findBatch({
      jql: this._jqlFor(phase, since), nextPageToken, maxPages: this.maxPages,
    });
    const issues = batch.issues.map((issue) => {
      const item = this.enricher.enrich(issue);
      if (item['Tipo Agrupado'] === 'Épico') {
        item.EpicoChave = item.Chave;
        item.SaudeEpico = this.epicHealthEvaluator.evaluate(issue);
      }
      return item;
    });
    const sprintCatalog = new Map();
    for (const issue of batch.issues) {
      for (const sprint of issue.sprintMeta || []) {
        if (sprint?.name) sprintCatalog.set(sprint.name, sprint);
      }
    }
    return {
      phase,
      since: since || null,
      issues,
      nextPageToken: batch.nextPageToken,
      isLast: batch.isLast,
      pages: batch.pages,
      generatedAt: new Date().toISOString(),
      meta: {
        pendingStatuses: this.enricher.classifier.rules.pendingStatuses || [],
        inProgressStatuses: this.enricher.classifier.rules.inProgressStatuses || [],
        doneStatuses: this.enricher.classifier.rules.doneStatuses || [],
        cancelledStatuses: this.enricher.classifier.rules.cancelledStatuses || [],
        sprints: Array.from(sprintCatalog.values()),
      },
    };
  }
}

module.exports = GetProgressiveDashboardDataUseCase;
