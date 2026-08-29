'use strict';

/**
 * Entidade de domínio: uma issue do Jira já NORMALIZADA (campos crus extraídos
 * da resposta da API, sem regras de negócio aplicadas ainda).
 *
 * O repositório (infrastructure) é responsável por traduzir o JSON da API do
 * Jira nesta forma estável. O restante do domínio nunca vê o formato bruto do
 * Jira — apenas esta entidade. Isso mantém o domínio independente da API.
 */
interface SprintMeta {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  state?: string;
  completeDate?: string | null;
}

interface SprintTransition { at: string; from: string[]; to: string[] }
interface StatusTransition { at: string; from: string; to: string }
interface IssueLink {
  key?: string;
  type?: string;
  direction?: 'in' | 'out';
  issueType?: string;
  status?: string;
}

interface IssueInput {
  id?: string | number | null;
  key?: string;
  summary?: string;
  issueType?: string;
  projectName?: string;
  projectKey?: string | null;
  team?: string;
  status?: string;
  storyPoints?: string | number | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  labels?: string[];
  parentKey?: string | null;
  sprint?: string | null;
  sprints?: string[];
  sprintMeta?: SprintMeta[];
  sprintTransitions?: SprintTransition[];
  statusTransitions?: StatusTransition[];
  bcp?: string | number | null;
  blockReason?: string | null;
  timeDemandante?: string | null;
  timeExterno?: string | null;
  depApproved?: unknown;
  depDescription?: string | null;
  issueLinks?: IssueLink[];
}

class Issue {
  readonly id: string | null;
  readonly key: string;
  readonly summary: string;
  readonly issueType: string;
  readonly projectName: string;
  readonly projectKey: string | null;
  readonly team: string;
  readonly status: string;
  readonly storyPoints: number;
  readonly createdAt: string | null;
  readonly resolvedAt: string | null;
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly actualStartDate: string | null;
  readonly actualEndDate: string | null;
  readonly labels: string[];
  readonly parentKey: string | null;
  readonly sprint: string | null;
  readonly sprints: string[];
  readonly sprintMeta: SprintMeta[];
  readonly sprintTransitions: SprintTransition[];
  readonly statusTransitions: StatusTransition[];
  readonly bcp: number | null;
  readonly blockReason: string | null;
  readonly timeDemandante: string | null;
  readonly timeExterno: string | null;
  readonly depApproved: boolean;
  readonly depDescription: string | null;
  readonly issueLinks: IssueLink[];

  constructor({
    id,
    key,
    summary,
    issueType,
    projectName,
    projectKey,
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
    sprint,
    sprints,
    sprintMeta,
    sprintTransitions,
    statusTransitions,
    bcp,
    blockReason,
    timeDemandante,
    timeExterno,
    depApproved,
    depDescription,
    issueLinks,
  }: IssueInput) {
    // id numérico do Jira: é a chave pela qual o changelog em lote identifica a
    // issue (o bulkfetch responde por issueId, não por key).
    this.id = id != null ? String(id) : null;
    this.key = key || '';
    this.summary = summary || '';
    this.issueType = issueType || '';
    this.projectName = projectName || '';
    // Chave do projeto (APR, LEG, BOPS...). É o identificador estável: o nome do
    // projeto pode ser renomeado no Jira, e a classificação de Programa depende
    // de saber a que projeto a issue pertence.
    this.projectKey = projectKey || null;
    this.team = team || '';
    this.status = status || '';
    this.storyPoints = Number(storyPoints) || 0;
    this.createdAt = createdAt || null;
    this.resolvedAt = resolvedAt || null;
    this.dueDate = dueDate || null;
    this.startDate = startDate || null;
    this.actualStartDate = actualStartDate || null;
    this.actualEndDate = actualEndDate || null;
    this.labels = Array.isArray(labels) ? labels : [];
    this.parentKey = parentKey || null;
    this.sprint = sprint || null; // nome da última sprint ativa
    this.sprints = Array.isArray(sprints) ? sprints : []; // histórico de sprints
    // [{name,startDate,endDate,state,completeDate}]
    this.sprintMeta = Array.isArray(sprintMeta) ? sprintMeta : [];
    // Changelog do campo Sprint, normalizado: [{at, from:[nomes], to:[nomes]}].
    // Preenchido pelo repositório em passo separado (uma chamada em lote).
    this.sprintTransitions = Array.isArray(sprintTransitions) ? sprintTransitions : [];
    // Changelog do campo Status, normalizado: [{at, from, to}] com os nomes dos
    // status. Base da data de entrega de sprint (ver SprintDeliveryResolver).
    this.statusTransitions = Array.isArray(statusTransitions) ? statusTransitions : [];
    this.bcp = (bcp === 0 || bcp) ? Number(bcp) : null; // complexidade normalizada (numérico)
    this.blockReason = blockReason || null; // motivo de bloqueio
    // --- Campos do issuetype "Dependência" ---
    // Squad que ABRIU a dependência (o campo Team acima é o time DEPENDENTE,
    // aquele de quem se depende e que vai executar).
    this.timeDemandante = timeDemandante || null;
    // Preenchido quando o time DEPENDENTE está fora das nossas Value Streams
    // (SSO, Ecommerce Engine, CaaS...). Na prática espelha o Team nesses casos.
    this.timeExterno = timeExterno || null;
    this.depApproved = !!depApproved;
    this.depDescription = depDescription || null;
    // Links normalizados: [{key, type, direction, issueType, status}].
    // `direction` é 'out' (esta issue aponta para a outra) ou 'in'.
    this.issueLinks = Array.isArray(issueLinks) ? issueLinks : [];
  }
}

export = Issue;
