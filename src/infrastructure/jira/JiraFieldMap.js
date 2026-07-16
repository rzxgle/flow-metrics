'use strict';

/**
 * JiraFieldMap — centraliza os IDs dos campos do Jira que alimentam o dashboard.
 *
 * IMPORTANTE: os campos padrão (summary, status, created, etc.) têm nomes fixos
 * na API, mas campos como Time, Story Points e as datas de início/fim reais são
 * CAMPOS CUSTOMIZADOS e seus IDs (`customfield_XXXXX`) mudam de instância para
 * instância. Os valores abaixo são apenas PADRÕES comuns do Jira Cloud.
 *
 * >>> Rode `npm run discover:fields` para descobrir os IDs corretos da SUA
 *     instância e ajuste-os no arquivo .env (ver .env.example). <<<
 */
class JiraFieldMap {
  constructor(env = {}) {
    // Campos padrão da API (nomes fixos)
    this.summary = 'summary';
    this.issuetype = 'issuetype';
    this.project = 'project';
    this.status = 'status';
    this.created = 'created';
    this.resolutiondate = 'resolutiondate';
    this.duedate = 'duedate';
    this.labels = 'labels';
    this.parent = 'parent';

    // Campos customizados (configuráveis via .env)
    this.team = env.JIRA_FIELD_TEAM || 'customfield_10001'; // "Team"
    this.storyPoints = env.JIRA_FIELD_STORY_POINTS || 'customfield_10016'; // "Story point estimate"
    this.startDate = env.JIRA_FIELD_START_DATE || 'customfield_10015'; // "Start date"
    this.actualStart = env.JIRA_FIELD_ACTUAL_START || 'customfield_10257'; // "Data de início real"
    this.actualEnd = env.JIRA_FIELD_ACTUAL_END || 'customfield_10258'; // "Data de fim real"
  }

  /** Lista de campos a solicitar na busca (reduz payload da API). */
  requestedFields() {
    return [
      this.summary, this.issuetype, this.project, this.status,
      this.created, this.resolutiondate, this.duedate, this.labels, this.parent,
      this.team, this.storyPoints, this.startDate, this.actualStart, this.actualEnd,
    ];
  }
}

module.exports = JiraFieldMap;
