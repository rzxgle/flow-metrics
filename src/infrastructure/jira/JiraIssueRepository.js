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
    const issues = raw.map((r) => this._toIssue(r));
    await this.attachChangelogs(issues);
    return issues;
  }

  async findBatch({ jql = this.jql, nextPageToken, maxPages, includeSprintHistory = true }) {
    const result = await this.httpClient.searchBatch(jql, this.fieldMap.requestedFields(), {
      nextPageToken,
      maxPages,
    });
    const issues = result.issues.map((raw) => this._toIssue(raw));
    if (includeSprintHistory) await this.attachChangelogs(issues);
    return { ...result, issues };
  }

  /**
   * Preenche `issue.sprintTransitions` (campo Sprint) e `issue.statusTransitions`
   * (campo Status) a partir do changelog.
   *
   * Os dois campos vêm na MESMA chamada em lote — o endpoint aceita uma lista de
   * fieldIds, então acrescentar o status não custa requisição extra.
   *
   * O status é o que permite datar a entrega pela entrada na categoria Done
   * (ver SprintDeliveryResolver), em vez de depender do campo manual
   * `Data de Fim Real`, preenchido só após a homologação integrada.
   *
   * Falha aqui NÃO derruba o dashboard: sem o histórico, o resolver de sprint
   * apenas marca os itens como não reconstruídos, a entrega cai no fallback do
   * campo manual e a interface exibe a ressalva — degradar é melhor do que não
   * abrir.
   */
  async attachChangelogs(issues) {
    if (!this.httpClient.fetchFieldChangelogs) return issues;
    const comId = issues.filter((i) => i.id);
    if (!comId.length) return issues;
    try {
      const logs = await this.httpClient.fetchFieldChangelogs(
        comId.map((i) => i.id),
        [this.fieldMap.sprint, this.fieldMap.status],
      );
      const porId = new Map(logs.map((l) => [String(l.issueId), l]));
      for (const issue of comId) {
        const log = porId.get(issue.id);
        if (!log) continue;
        issue.sprintTransitions = this._toSprintTransitions(log.changeHistories);
        issue.statusTransitions = this._toStatusTransitions(log.changeHistories);
      }
    } catch (error) {
      console.warn('[jira] changelog de sprint/status indisponivel:', error.message);
    }
    return issues;
  }

  /** Nome anterior, mantido para não quebrar chamadas externas. */
  async attachSprintTransitions(issues) {
    return this.attachChangelogs(issues);
  }

  /**
   * Normaliza o changelog cru em [{at, from:[nomes], to:[nomes]}].
   *
   * Dois detalhes do formato, confirmados contra a API:
   *   - `created` vem ora em ISO, ora em epoch em milissegundos;
   *   - com múltiplas sprints, `fromString`/`toString` vêm como lista separada
   *     por vírgula ("A, B") — são snapshots do conjunto, não deltas.
   */
  _toSprintTransitions(changeHistories) {
    const sprintFieldId = this.fieldMap.sprint;
    const out = [];
    for (const h of changeHistories || []) {
      for (const item of h.items || []) {
        const ehSprint = String(item.field).toLowerCase() === 'sprint'
          || (item.fieldId && item.fieldId === sprintFieldId);
        if (!ehSprint) continue;
        out.push({
          at: this._toIsoInstant(h.created),
          from: this._splitSprintNames(item.fromString),
          to: this._splitSprintNames(item.toString),
        });
      }
    }
    return out;
  }

  /**
   * Normaliza o changelog de Status em [{at, from, to}] com os NOMES dos status
   * (`fromString`/`toString`); os ids (`from`/`to`) não servem, porque as regras
   * de classificação são escritas por nome.
   */
  _toStatusTransitions(changeHistories) {
    const out = [];
    for (const h of changeHistories || []) {
      for (const item of h.items || []) {
        if (String(item.field).toLowerCase() !== 'status') continue;
        out.push({
          at: this._toIsoInstant(h.created),
          from: item.fromString || null,
          to: item.toString || null,
        });
      }
    }
    return out;
  }

  _toIsoInstant(value) {
    if (value == null) return null;
    if (/^\d+$/.test(String(value))) return new Date(Number(value)).toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  _splitSprintNames(value) {
    if (!value) return [];
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }

  _toIssue(raw) {
    const f = raw.fields || {};
    const fm = this.fieldMap;
    return new Issue({
      id: raw.id,
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
      sprints: this._readSprintList(f[fm.sprint]),
      sprintMeta: this._readSprintMeta(f[fm.sprint]),
      bcp: f[fm.bcp],
      blockReason: this._readSelect(f[fm.blockReason]),
    });
  }

  /**
   * Lista com TODOS os nomes de sprint pelas quais a issue passou (histórico
   * simples do array do Jira). Usada para "comprometido/planejado na sprint X"
   * (Nível A: item cujo array de sprints contém X).
   */
  _readSprintList(value) {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    const names = arr
      .map((s) => (typeof s === 'string' ? s : s && s.name))
      .filter(Boolean);
    return Array.from(new Set(names)); // remove duplicatas preservando ordem
  }

  /**
   * Metadados das sprints, para o burndown e para o velocity.
   * O objeto Sprint do Jira traz id/state/startDate/endDate/completeDate;
   * strings puras não têm nada disso.
   *
   * `state` ('closed' | 'active' | 'future') é o que permite ao velocity não
   * misturar sprint em andamento — que está sempre "sub-entregue" — com sprint
   * fechada no cálculo da média.
   */
  _readSprintMeta(value) {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .filter((s) => s && typeof s === 'object' && s.name)
      .map((s) => ({
        name: s.name,
        startDate: s.startDate || null,
        endDate: s.endDate || null,
        completeDate: s.completeDate || null,
        state: s.state || null,
        id: s.id != null ? s.id : null,
      }));
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
