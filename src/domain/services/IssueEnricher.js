'use strict';

const { toIsoDate, toYearMonth, toYear } = require('../../shared/date.utils');

/**
 * IssueEnricher — transforma uma `Issue` (dados crus normalizados) no registro
 * ENRIQUECIDO que o dashboard consome (o mesmo formato que antes vinha embutido
 * no HTML). Compõe o IssueClassifier e o FlowMetricsCalculator.
 *
 * O campo EpicoChave NÃO é resolvido aqui (depende do conjunto inteiro de
 * issues) — fica a cargo do caso de uso, após montar o índice.
 */
class IssueEnricher {
  constructor(classifier, metricsCalculator, sprintHistoryResolver = null) {
    this.classifier = classifier;
    this.metrics = metricsCalculator;
    this.sprintHistory = sprintHistoryResolver;
  }

  /** @param {import('../entities/Issue')} issue */
  enrich(issue) {
    const grupo = this.classifier.groupOf(issue.issueType);
    const sprintHist = this._resolveSprintHistory(issue);
    const done = this.classifier.isDone(issue.status);
    const cancelled = this.classifier.isCancelled(issue.status);
    const conclusao = issue.actualEndDate || issue.resolvedAt || null;

    return {
      Chave: issue.key,
      Resumo: issue.summary,
      'Tipo de item': issue.issueType,
      'Tipo Agrupado': grupo,
      Programa: this.classifier.programOf(issue.projectName),
      VS: issue.projectName,
      Squad: issue.team || 'Não informado',
      PI: this.classifier.piOf(issue.labels),
      Status: issue.status,
      Concluido: done,
      Cancelado: cancelled,
      WIP: this.classifier.isWip(issue.status),
      FaseFluxo: this.classifier.phaseOf(issue.status),
      EntregueAmplo: this.classifier.isBroadlyDelivered(issue.status),
      // Incremental é resolvido depois (depende do tipo do épico/pai). Placeholder:
      Incremental: grupo === 'História' || grupo === 'Épico',
      'Story Points': issue.storyPoints,
      BCP: issue.bcp,
      Sprint: issue.sprint,
      Sprints: issue.sprints,
      // Quando a issue entrou/saiu de cada sprint (do changelog). Base do
      // velocity: separa compromisso de início de escopo adicionado no meio.
      SprintPeriodos: sprintHist.membership,
      // false = conjunto de sprints conhecido, cronologia não. O dashboard
      // conta esses itens e mostra a ressalva em vez de fingir precisão.
      SprintHistoricoOk: sprintHist.reconstructed,
      MotivoBloqueio: issue.blockReason,
      Criado: toIsoDate(issue.createdAt),
      'Data Conclusao': toIsoDate(conclusao),
      'Data Inicio Real': toIsoDate(issue.actualStartDate),
      'Data Fim Real': toIsoDate(issue.actualEndDate),
      AnoMesCriacao: toYearMonth(issue.createdAt),
      AnoCriacao: toYear(issue.createdAt),
      AnoMesConclusao: toYearMonth(conclusao),
      AnoConclusao: toYear(conclusao),
      CycleTimeDias: this.metrics.cycleTimeDays(issue, done),
      LeadTimeDias: this.metrics.leadTimeDays(issue, done),
      AgingDias: this.metrics.agingDays(issue),
      parent: issue.parentKey,
      // Campos resolvidos posteriormente pelo caso de uso:
      EpicoChave: null,
      SaudeEpico: null,
      // guardado internamente para resolução de épico/incremental:
      parentKey: issue.parentKey,
      grupo,
      chave: issue.key,
    };
  }

  /**
   * Sem resolver injetado (ou sem sprint na issue), devolve o equivalente a
   * "não sei a cronologia": membership vazio e histórico não reconstruído,
   * nunca um palpite.
   */
  _resolveSprintHistory(issue) {
    if (!this.sprintHistory || !(issue.sprints || []).length) {
      return { membership: [], reconstructed: !(issue.sprints || []).length };
    }
    return this.sprintHistory.resolve({
      createdAt: issue.createdAt,
      sprints: issue.sprints,
      transitions: issue.sprintTransitions,
    });
  }
}

module.exports = IssueEnricher;
