'use strict';

/**
 * IssueClassifier — traduz atributos crus de uma issue em classificações de
 * negócio: tipo agrupado, programa, PI, e os flags de estado
 * (concluído / cancelado / WIP / entregue amplo).
 *
 * Responsabilidade única: classificar. Não calcula datas nem resolve épicos.
 *
 * As regras vêm injetadas (config/classification.rules.js), então este serviço
 * não precisa mudar quando as regras mudam (Open/Closed + Dependency Inversion).
 */
interface PiRule { label: string; pi: string }
interface ClassificationRules {
  issueTypeToGroup: Record<string, string>;
  defaultGroup: string;
  bridgeProjectKeys: string[];
  bridgeValueStreamNames: string[];
  piRulesInPriorityOrder: PiRule[];
  defaultPi: string;
  doneStatuses: string[];
  cancelledStatuses: string[];
  broadlyDeliveredStatuses: string[];
  pendingStatuses?: string[];
  inProgressStatuses?: string[];
}

type FlowPhase = 'Cancelado' | 'Concluído' | 'Pendente' | 'Em andamento';

class IssueClassifier {
  private readonly rules: ClassificationRules;

  constructor(rules: ClassificationRules) {
    this.rules = rules;
  }

  /** "Tipo de item" cru -> "Tipo Agrupado". */
  groupOf(issueType: string): string {
    return this.rules.issueTypeToGroup[issueType] || this.rules.defaultGroup;
  }

  /**
   * Projeto -> Programa (Afya Bridge | Afya One).
   *
   * A chave vem primeiro porque é o identificador estável do projeto no Jira; o
   * nome continua sendo aceito para o caso de a chave não ter chegado (issue
   * montada sem ela, como nas fixtures dos testes).
   */
  programOf(projectName: string, projectKey?: string | null): 'Afya Bridge' | 'Afya One' {
    const key = String(projectKey || '').trim().toUpperCase();
    if (key && this.rules.bridgeProjectKeys.includes(key)) return 'Afya Bridge';
    return this.rules.bridgeValueStreamNames.includes(projectName)
      ? 'Afya Bridge'
      : 'Afya One';
  }

  /** Labels -> PI, respeitando a ordem de prioridade das regras. */
  piOf(labels?: string[]): string {
    const set = new Set(labels || []);
    for (const rule of this.rules.piRulesInPriorityOrder) {
      if (set.has(rule.label)) return rule.pi;
    }
    return this.rules.defaultPi;
  }

  isDone(status: string): boolean {
    return this.rules.doneStatuses.includes(status);
  }

  isCancelled(status: string): boolean {
    return this.rules.cancelledStatuses.includes(status);
  }

  /** Em andamento = nem concluído, nem cancelado. */
  isWip(status: string): boolean {
    return !this.isDone(status) && !this.isCancelled(status);
  }

  isBroadlyDelivered(status: string): boolean {
    return this.rules.broadlyDeliveredStatuses.includes(status);
  }

  isPending(status: string): boolean {
    return (this.rules.pendingStatuses || []).includes(status);
  }

  isInProgress(status: string): boolean {
    return (this.rules.inProgressStatuses || []).includes(status);
  }

  /**
   * Fase do fluxo (mutuamente exclusiva): a ordem de precedência garante que
   * cada item caia em exatamente um balde.
   *   Cancelado > Concluído > Pendente > Em andamento (default).
   * Um status "em aberto" que não esteja em nenhuma lista cai em "Em andamento",
   * para nunca ficar de fora das contagens.
   */
  phaseOf(status: string): FlowPhase {
    if (this.isCancelled(status)) return 'Cancelado';
    if (this.isDone(status)) return 'Concluído';
    if (this.isPending(status)) return 'Pendente';
    return 'Em andamento';
  }
}

export = IssueClassifier;
