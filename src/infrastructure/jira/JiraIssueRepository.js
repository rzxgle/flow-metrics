'use strict';

const IssueRepository = require('../../domain/repositories/IssueRepository');
const Issue = require('../../domain/entities/Issue');

/**
 * JiraIssueRepository — implementação concreta da porta IssueRepository.
 * Responsabilidade única: obter issues do Jira e TRADUZIR o JSON cru da API
 * na entidade de domínio `Issue`.
 *
 * É o único lugar que conhece o formato de resposta do Jira. Se a API mudar,
 * só este arquivo muda (o domínio e os casos de uso permanecem intactos).
 */
class JiraIssueRepository extends IssueRepository {
  constructor({ httpClient, fieldMap, jql }) {
    super();
    this.httpClient = httpClient;
    this.fieldMap = fieldMap;
    this.jql = jql;
  }

  async findAll() {
    const raw = await this.httpClient.searchAll(this.jql, this.fieldMap.requestedFields());
    return raw.map((r) => this._toIssue(r));
  }

  _toIssue(raw) {
    const f = raw.fields || {};
    const fm = this.fieldMap;
    return new Issue({
      key: raw.key,
      summary: f[fm.summary] || '',
      issueType: f[fm.issuetype] ? f[fm.issuetype].name : null,
      projectName: f[fm.project] ? f[fm.project].name : null,
      team: this._readTeam(f[fm.team]),
      status: f[fm.status] ? f[fm.status].name : null,
      storyPoints: f[fm.storyPoints],
      createdAt: f[fm.created] || null,
      resolvedAt: f[fm.resolutiondate] || null,
      dueDate: f[fm.duedate] || null,
      startDate: f[fm.startDate] || null,
      actualStartDate: f[fm.actualStart] || null,
      actualEndDate: f[fm.actualEnd] || null,
      labels: f[fm.labels] || [],
      parentKey: f[fm.parent] ? f[fm.parent].key : null,
      sprint: this._readSprint(f[fm.sprint]),
      bcp: f[fm.bcp],
      blockReason: this._readSelect(f[fm.blockReason]),
    });
  }

  /**
   * O campo "Team" pode vir como string, objeto {name/value/title} ou nulo,
   * dependendo do tipo do campo na instância. Normalizamos para string.
   */
  _readTeam(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.name || value.value || value.title || null;
  }

  /**
   * O campo "Sprint" vem como array de objetos (uma issue pode ter passado por
   * várias sprints). Regra de negócio: usar a ÚLTIMA sprint ATIVA; se não houver
   * ativa, cai para a última do array. Retorna o `name`.
   */
  _readSprint(value) {
    if (!value) return null;
    const arr = Array.isArray(value) ? value : [value];
    if (!arr.length) return null;
    const actives = arr.filter((s) => s && String(s.state).toLowerCase() === 'active');
    const chosen = actives.length ? actives[actives.length - 1] : arr[arr.length - 1];
    if (!chosen) return null;
    return typeof chosen === 'string' ? chosen : (chosen.name || null);
  }

  /**
   * Campos de seleção única (ex.: "Motivo de Bloqueio") vêm como {value}/{name}.
   * Também aceita string simples.
   */
  _readSelect(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.value || value.name || null;
  }
}

module.exports = JiraIssueRepository;
