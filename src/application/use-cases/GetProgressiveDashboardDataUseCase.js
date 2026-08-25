'use strict';

class GetProgressiveDashboardDataUseCase {
  constructor({ issueRepository, enricher, epicHealthEvaluator, quarterRules, piLabelRules, baseJql, maxPages = 5 }) {
    this.issueRepository = issueRepository;
    this.enricher = enricher;
    this.epicHealthEvaluator = epicHealthEvaluator;
    this.quarterRules = quarterRules || null;
    this.piLabelRules = piLabelRules || [];
    this.baseJql = baseJql;
    this.maxPages = Math.max(1, Math.min(Number(maxPages) || 5, 5));
  }

  _quoteJql(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  _piEpicJql() {
    const labels = Array.from(new Set(this.piLabelRules.map((rule) => rule.label).filter(Boolean)));
    if (!labels.length) throw new Error('Nenhuma label de PI configurada.');
    const ignored = (this.quarterRules?.ignoredStatuses || []).filter(Boolean);
    return `labels in (${labels.map((label) => this._quoteJql(label)).join(', ')}) `
      + 'AND issuetype in (Epic, "Enabler Epic") '
      + (ignored.length ? `AND status not in (${ignored.map((status) => this._quoteJql(status)).join(', ')}) ` : '')
      + 'ORDER BY created DESC';
  }

  _piChildrenJql(epicKeys) {
    const keys = Array.from(new Set(epicKeys || []));
    if (!keys.length) throw new Error('Lista de epicos do PI vazia.');
    if (keys.length > 50) throw new Error('Limite de 50 epicos por lote excedido.');
    if (keys.some((key) => !/^[A-Z][A-Z0-9_]*-\d+$/i.test(String(key)))) {
      throw new Error('Chave de epico invalida.');
    }
    return `parent in (${keys.join(', ')}) ORDER BY created DESC`;
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

  async execute({ phase, nextPageToken, since, epicKeys }) {
    if (!['recent', 'history', 'delta', 'pi-epics', 'pi-children'].includes(phase)) {
      throw new Error('Fase progressiva invalida.');
    }
    const piPhase = phase === 'pi-epics' || phase === 'pi-children';
    const jql = phase === 'pi-epics' ? this._piEpicJql()
      : phase === 'pi-children' ? this._piChildrenJql(epicKeys)
        : this._jqlFor(phase, since);
    const batch = await this.issueRepository.findBatch({
      jql, nextPageToken, maxPages: this.maxPages, includeSprintHistory: !piPhase,
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
      ...(piPhase ? { piIssues: issues } : { issues }),
      nextPageToken: batch.nextPageToken,
      isLast: batch.isLast,
      pages: batch.pages,
      generatedAt: new Date().toISOString(),
      meta: {
        pendingStatuses: this.enricher.classifier.rules.pendingStatuses || [],
        inProgressStatuses: this.enricher.classifier.rules.inProgressStatuses || [],
        doneStatuses: this.enricher.classifier.rules.doneStatuses || [],
        cancelledStatuses: this.enricher.classifier.rules.cancelledStatuses || [],
        // Regras da aba de PI Tracking. Viajam com o payload para que o front
        // nao mantenha uma segunda copia delas, que sairia de sincronia.
        quarterRules: this.quarterRules,
        // id canônico -> rótulo dos times da aba de Dependências. Viaja UMA vez
        // aqui, em vez de repetir o nome do time em cada linha do payload.
        dependencyTeams: this.enricher.dependency ? this.enricher.dependency.teamCatalog() : {},
        sprints: Array.from(sprintCatalog.values()),
      },
    };
  }
}

module.exports = GetProgressiveDashboardDataUseCase;
