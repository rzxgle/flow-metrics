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
type JiraFieldEnvironment = Partial<Record<
  | 'JIRA_FIELD_TEAM' | 'JIRA_FIELD_STORY_POINTS' | 'JIRA_FIELD_START_DATE'
  | 'JIRA_FIELD_ACTUAL_START' | 'JIRA_FIELD_ACTUAL_END' | 'JIRA_FIELD_SPRINT'
  | 'JIRA_FIELD_BCP' | 'JIRA_FIELD_BLOCK_REASON' | 'JIRA_FIELD_TIME_DEMANDANTE'
  | 'JIRA_FIELD_TIME_EXTERNO' | 'JIRA_FIELD_DEP_APROVADA' | 'JIRA_FIELD_DEP_DESCRICAO',
  string
>>;

class JiraFieldMap {
  readonly summary = 'summary';
  readonly issuetype = 'issuetype';
  readonly project = 'project';
  readonly status = 'status';
  readonly created = 'created';
  readonly resolutiondate = 'resolutiondate';
  readonly duedate = 'duedate';
  readonly labels = 'labels';
  readonly parent = 'parent';
  readonly team: string;
  readonly storyPoints: string;
  readonly startDate: string;
  readonly actualStart: string;
  readonly actualEnd: string;
  readonly sprint: string;
  readonly bcp: string;
  readonly blockReason: string;
  readonly timeDemandante: string;
  readonly timeExterno: string;
  readonly depApproved: string;
  readonly depDescription: string;
  readonly issueLinks = 'issuelinks';

  constructor(env: JiraFieldEnvironment | NodeJS.ProcessEnv = {}) {
    // Campos padrão da API (nomes fixos)

    // Campos customizados (configuráveis via .env)
    this.team = env.JIRA_FIELD_TEAM || 'customfield_10001'; // "Team"
    this.storyPoints = env.JIRA_FIELD_STORY_POINTS || 'customfield_10016'; // "Story point estimate"
    this.startDate = env.JIRA_FIELD_START_DATE || 'customfield_10015'; // "Start date"
    this.actualStart = env.JIRA_FIELD_ACTUAL_START || 'customfield_10257'; // "Data de início real"
    this.actualEnd = env.JIRA_FIELD_ACTUAL_END || 'customfield_10258'; // "Data de fim real"
    this.sprint = env.JIRA_FIELD_SPRINT || 'customfield_10113'; // "Sprint" (array de objetos)
    this.bcp = env.JIRA_FIELD_BCP || 'customfield_12377'; // "BCP" (numérico)
    this.blockReason = env.JIRA_FIELD_BLOCK_REASON || 'customfield_11638'; // "Motivo de Bloqueio"

    // Campos do issuetype "Dependência" (ver domain/services/DependencyResolver).
    this.timeDemandante = env.JIRA_FIELD_TIME_DEMANDANTE || 'customfield_12487'; // "Time Demandante"
    this.timeExterno = env.JIRA_FIELD_TIME_EXTERNO || 'customfield_12486'; // "Time Externo"
    this.depApproved = env.JIRA_FIELD_DEP_APROVADA || 'customfield_12045'; // "Dependência Aprovada"
    this.depDescription = env.JIRA_FIELD_DEP_DESCRICAO || 'customfield_12078'; // "Descrição Dependência"

    // Links entre issues. É por eles que uma dependência aponta o item que ficou
    // parado esperando o outro time.
  }

  /** Lista de campos a solicitar na busca (reduz payload da API). */
  requestedFields(): string[] {
    return [
      this.summary, this.issuetype, this.project, this.status,
      this.created, this.resolutiondate, this.duedate, this.labels, this.parent,
      this.team, this.storyPoints, this.startDate, this.actualStart, this.actualEnd,
      this.sprint, this.bcp, this.blockReason,
      this.timeDemandante, this.timeExterno, this.depApproved, this.depDescription,
      this.issueLinks,
    ];
  }
}

export = JiraFieldMap;
