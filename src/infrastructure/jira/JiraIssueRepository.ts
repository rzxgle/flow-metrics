'use strict';

import IssueRepository = require('../../domain/repositories/IssueRepository');
import Issue = require('../../domain/entities/Issue');
import JiraFieldMap = require('./JiraFieldMap');
import JiraHttpClient = require('./JiraHttpClient');

interface RepositoryOptions { httpClient: JiraHttpClient; fieldMap: JiraFieldMap; jql: string }
interface FindBatchInput {
  jql?: string;
  nextPageToken?: string | null;
  maxPages?: number;
  includeSprintHistory?: boolean;
}
interface RawIssue { id?: unknown; key?: unknown; fields?: Record<string, unknown> }
interface ChangeItem {
  field?: unknown;
  fieldId?: unknown;
  fromString?: unknown;
  toString?: unknown;
}
interface ChangeHistory { created?: unknown; items?: ChangeItem[] }
interface SprintTransition { at: string; from: string[]; to: string[] }
interface StatusTransition { at: string; from: string; to: string }
interface AdfNode { text?: unknown; content?: unknown }

/**
 * JiraIssueRepository — implementação concreta da porta IssueRepository.
 * Responsabilidade única: obter issues do Jira e TRADUZIR o JSON cru da API
 * na entidade de domínio `Issue`.
 *
 * É o único lugar que conhece o formato de resposta do Jira. Se a API mudar,
 * só este arquivo muda (o domínio e os casos de uso permanecem intactos).
 */
class JiraIssueRepository extends IssueRepository {
  private readonly httpClient: JiraHttpClient;
  private readonly fieldMap: JiraFieldMap;
  private readonly jql: string;

  constructor({ httpClient, fieldMap, jql }: RepositoryOptions) {
    super();
    this.httpClient = httpClient;
    this.fieldMap = fieldMap;
    this.jql = jql;
  }

  async findAll(): Promise<Issue[]> {
    const raw = await this.httpClient.searchAll(this.jql, this.fieldMap.requestedFields());
    const issues = raw.map((r) => this._toIssue(r));
    await this.attachChangelogs(issues);
    return issues;
  }

  async findBatch({ jql = this.jql, nextPageToken, maxPages, includeSprintHistory = true }: FindBatchInput = {}) {
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
  async attachChangelogs(issues: Issue[]): Promise<Issue[]> {
    if (!this.httpClient.fetchFieldChangelogs) return issues;
    const comId = issues.filter((i) => i.id);
    if (!comId.length) return issues;
    try {
      const logs = await this.httpClient.fetchFieldChangelogs(
        comId.map((i) => i.id).filter((id): id is string => id !== null),
        [this.fieldMap.sprint, this.fieldMap.status],
      );
      const porId = new Map(logs.map((l) => [String(l.issueId), l]));
      for (const issue of comId) {
        const log = issue.id ? porId.get(issue.id) : undefined;
        if (!log) continue;
        issue.sprintTransitions = this._toSprintTransitions(log.changeHistories);
        issue.statusTransitions = this._toStatusTransitions(log.changeHistories);
      }
    } catch (error: unknown) {
      console.warn('[jira] changelog de sprint/status indisponivel:', errorMessage(error));
    }
    return issues;
  }

  /** Nome anterior, mantido para não quebrar chamadas externas. */
  async attachSprintTransitions(issues: Issue[]): Promise<Issue[]> {
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
  private _toSprintTransitions(changeHistories: object[]): SprintTransition[] {
    const sprintFieldId = this.fieldMap.sprint;
    const out: SprintTransition[] = [];
    for (const rawHistory of changeHistories || []) {
      const h = rawHistory as ChangeHistory;
      for (const item of h.items || []) {
        const ehSprint = String(item.field).toLowerCase() === 'sprint'
          || (item.fieldId && item.fieldId === sprintFieldId);
        if (!ehSprint) continue;
        out.push({
          at: this._toIsoInstant(h.created) || '',
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
  private _toStatusTransitions(changeHistories: object[]): StatusTransition[] {
    const out: StatusTransition[] = [];
    for (const rawHistory of changeHistories || []) {
      const h = rawHistory as ChangeHistory;
      for (const item of h.items || []) {
        if (String(item.field).toLowerCase() !== 'status') continue;
        out.push({
          at: this._toIsoInstant(h.created) || '',
          from: this._readString(item.fromString) || '',
          to: this._readString(item.toString) || '',
        });
      }
    }
    return out;
  }

  private _toIsoInstant(value: unknown): string | null {
    if (value == null) return null;
    if (/^\d+$/.test(String(value))) return new Date(Number(value)).toISOString();
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  private _splitSprintNames(value: unknown): string[] {
    if (!value) return [];
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }

  private _toIssue(raw: RawIssue): Issue {
    const f = raw.fields || {};
    const fm = this.fieldMap;
    return new Issue({
      id: this._readStringOrNumber(raw.id),
      key: this._readString(raw.key) || '',
      summary: this._readString(f[fm.summary]) || '',
      issueType: this._readObjectString(f[fm.issuetype], 'name') || '',
      projectName: this._readObjectString(f[fm.project], 'name') || '',
      projectKey: this._readObjectString(f[fm.project], 'key'),
      team: this._readTeam(f[fm.team]) || '',
      status: this._readObjectString(f[fm.status], 'name') || '',
      storyPoints: this._readStringOrNumber(f[fm.storyPoints]),
      createdAt: this._readString(f[fm.created]),
      resolvedAt: this._readString(f[fm.resolutiondate]),
      dueDate: this._readString(f[fm.duedate]),
      startDate: this._readString(f[fm.startDate]),
      actualStartDate: this._readString(f[fm.actualStart]),
      actualEndDate: this._readString(f[fm.actualEnd]),
      labels: this._readStringList(f[fm.labels]),
      parentKey: this._readObjectString(f[fm.parent], 'key'),
      sprint: this._readSprint(f[fm.sprint]),
      sprints: this._readSprintList(f[fm.sprint]),
      sprintMeta: this._readSprintMeta(f[fm.sprint]),
      bcp: this._readStringOrNumber(f[fm.bcp]),
      blockReason: this._readSelect(f[fm.blockReason]),
      timeDemandante: this._readSelect(f[fm.timeDemandante]),
      timeExterno: this._readSelect(f[fm.timeExterno]),
      depApproved: this._readChecked(f[fm.depApproved]),
      depDescription: this._readRichText(f[fm.depDescription]),
      issueLinks: this._readIssueLinks(f[fm.issueLinks]),
    });
  }

  /**
   * Links entre issues, achatados para [{key, type, direction, issueType, status}].
   *
   * `direction` guarda de que lado a issue está: 'out' quando ELA aponta para a
   * outra (`Dependo de`, `blocks`) e 'in' quando é apontada (`Depende de mim`).
   * O sentido importa — é o que separa "o que me trava" de "o que eu travo" —
   * e não dá para recuperá-lo depois, porque o nome do tipo é o mesmo nos dois.
   */
  private _readIssueLinks(value: unknown) {
    if (!Array.isArray(value)) return [];
    const out: Array<{
      key: string; type: string | undefined; direction: 'in' | 'out';
      issueType: string | undefined; status: string | undefined;
    }> = [];
    for (const rawLink of value) {
      const link = asRecord(rawLink);
      const type = asRecord(link?.type);
      if (!link || !type) continue;
      const outward = asRecord(link.outwardIssue);
      const inward = asRecord(link.inwardIssue);
      const other = outward || inward;
      const key = this._readString(other?.key);
      if (!other || !key) continue;
      const fields = asRecord(other.fields);
      out.push({
        key,
        type: this._readString(type.name) || undefined,
        direction: outward ? 'out' : 'in',
        issueType: this._readObjectString(fields?.issuetype, 'name') || undefined,
        status: this._readObjectString(fields?.status, 'name') || undefined,
      });
    }
    return out;
  }

  /**
   * Campo de múltipla escolha (checkbox) — vem como array de opções. Aqui só
   * interessa se há ALGUMA opção marcada.
   */
  private _readChecked(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  }

  /**
   * Campo de texto longo. Na API v3 ele vem em ADF (documento estruturado), não
   * em string — extraímos apenas os nós de texto.
   */
  private _readRichText(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.trim() || null;
    const parts: string[] = [];
    const walk = (node: unknown): void => {
      const record = asRecord(node) as AdfNode | null;
      if (!record) return;
      if (typeof record.text === 'string') parts.push(record.text);
      if (Array.isArray(record.content)) for (const child of record.content) walk(child);
    };
    walk(value);
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text || null;
  }

  /**
   * Lista com TODOS os nomes de sprint pelas quais a issue passou (histórico
   * simples do array do Jira). Usada para "comprometido/planejado na sprint X"
   * (Nível A: item cujo array de sprints contém X).
   */
  private _readSprintList(value: unknown): string[] {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    const names = arr
      .map((s) => (typeof s === 'string' ? s : this._readObjectString(s, 'name')))
      .filter((name): name is string => Boolean(name));
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
  private _readSprintMeta(value: unknown) {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .map((s) => asRecord(s))
      .filter((s): s is Record<string, unknown> => Boolean(s && this._readString(s.name)))
      .map((s) => ({
        name: this._readString(s.name) || '',
        startDate: this._readString(s.startDate),
        endDate: this._readString(s.endDate),
        completeDate: this._readString(s.completeDate),
        state: this._readString(s.state),
        id: this._readStringOrNumber(s.id),
      }));
  }

  /**
   * O campo "Team" pode vir como string, objeto {name/value/title} ou nulo,
   * dependendo do tipo do campo na instância. Normalizamos para string.
   */
  private _readTeam(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return this._readObjectString(value, 'name')
      || this._readObjectString(value, 'value')
      || this._readObjectString(value, 'title');
  }

  /**
   * O campo "Sprint" vem como array de objetos (uma issue pode ter passado por
   * várias sprints). Regra de negócio: usar a ÚLTIMA sprint ATIVA; se não houver
   * ativa, cai para a última do array. Retorna o `name`.
   */
  private _readSprint(value: unknown): string | null {
    if (!value) return null;
    const arr = Array.isArray(value) ? value : [value];
    if (!arr.length) return null;
    const actives = arr.filter((s) => String(asRecord(s)?.state || '').toLowerCase() === 'active');
    const chosen = actives.length ? actives[actives.length - 1] : arr[arr.length - 1];
    if (!chosen) return null;
    return typeof chosen === 'string' ? chosen : this._readObjectString(chosen, 'name');
  }

  /**
   * Campos de seleção única (ex.: "Motivo de Bloqueio") vêm como {value}/{name}.
   * Também aceita string simples.
   */
  private _readSelect(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return this._readObjectString(value, 'value') || this._readObjectString(value, 'name');
  }

  private _readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private _readStringOrNumber(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  }

  private _readObjectString(value: unknown, key: string): string | null {
    return this._readString(asRecord(value)?.[key]);
  }

  private _readStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export = JiraIssueRepository;
