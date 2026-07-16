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
class IssueClassifier {
  constructor(rules) {
    this.rules = rules;
  }

  /** "Tipo de item" cru -> "Tipo Agrupado". */
  groupOf(issueType) {
    return this.rules.issueTypeToGroup[issueType] || this.rules.defaultGroup;
  }

  /** Nome do projeto -> Programa (Afya Bridge | Afya One). */
  programOf(projectName) {
    return projectName === this.rules.bridgeValueStreamName
      ? 'Afya Bridge'
      : 'Afya One';
  }

  /** Labels -> PI, respeitando a ordem de prioridade das regras. */
  piOf(labels) {
    const set = new Set(labels || []);
    for (const rule of this.rules.piRulesInPriorityOrder) {
      if (set.has(rule.label)) return rule.pi;
    }
    return this.rules.defaultPi;
  }

  isDone(status) {
    return this.rules.doneStatuses.includes(status);
  }

  isCancelled(status) {
    return this.rules.cancelledStatuses.includes(status);
  }

  /** Em andamento = nem concluído, nem cancelado. */
  isWip(status) {
    return !this.isDone(status) && !this.isCancelled(status);
  }

  isBroadlyDelivered(status) {
    return this.rules.broadlyDeliveredStatuses.includes(status);
  }
}

module.exports = IssueClassifier;
