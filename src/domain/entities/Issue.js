'use strict';

/**
 * Entidade de domínio: uma issue do Jira já NORMALIZADA (campos crus extraídos
 * da resposta da API, sem regras de negócio aplicadas ainda).
 *
 * O repositório (infrastructure) é responsável por traduzir o JSON da API do
 * Jira nesta forma estável. O restante do domínio nunca vê o formato bruto do
 * Jira — apenas esta entidade. Isso mantém o domínio independente da API.
 */
class Issue {
  constructor({
    key,
    summary,
    issueType,
    projectName,
    team,
    status,
    storyPoints,
    createdAt,
    resolvedAt,
    dueDate,
    startDate,
    actualStartDate,
    actualEndDate,
    labels,
    parentKey,
  }) {
    this.key = key;
    this.summary = summary;
    this.issueType = issueType;
    this.projectName = projectName;
    this.team = team;
    this.status = status;
    this.storyPoints = Number(storyPoints) || 0;
    this.createdAt = createdAt || null;
    this.resolvedAt = resolvedAt || null;
    this.dueDate = dueDate || null;
    this.startDate = startDate || null;
    this.actualStartDate = actualStartDate || null;
    this.actualEndDate = actualEndDate || null;
    this.labels = Array.isArray(labels) ? labels : [];
    this.parentKey = parentKey || null;
  }
}

module.exports = Issue;
