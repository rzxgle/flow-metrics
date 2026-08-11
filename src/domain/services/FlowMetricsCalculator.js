'use strict';

const { diffDays, startOfDayUtc, toDate } = require('../../shared/date.utils');

/**
 * FlowMetricsCalculator — calcula as métricas de fluxo de uma issue.
 * Responsabilidade única: contas de tempo.
 *
 * Fórmulas (validadas contra o dataset original, 100% de correspondência):
 *   - Lead Time  = (data de fim real | resolução) - data de criação   [só p/ concluídos]
 *   - Cycle Time = (data de fim real) - (data de início real)          [só p/ concluídos c/ início real]
 *   - Aging      = (meia-noite do dia de referência) - (início real | criação)   [todos os itens]
 *
 * O "dia de referência" (referenceDate) é injetado — por padrão a data de
 * geração do relatório —, tornando o cálculo determinístico e testável.
 */
class FlowMetricsCalculator {
  constructor(referenceDate = new Date()) {
    this.now = startOfDayUtc(referenceDate);
  }

  /** Atualiza o "dia de referência" (usado pelo refresh periódico). */
  setReferenceDate(referenceDate) {
    this.now = startOfDayUtc(referenceDate);
  }

  leadTimeDays(issue, isDone) {
    if (!isDone) return null;
    const end = issue.actualEndDate || issue.resolvedAt;
    return this._nonNegativeDiff(issue.createdAt, end, 2);
  }

  cycleTimeDays(issue, isDone) {
    if (!isDone) return null;
    if (!issue.actualStartDate || !issue.actualEndDate) return null;
    return this._nonNegativeDiff(issue.actualStartDate, issue.actualEndDate, 2);
  }

  agingDays(issue) {
    const base = issue.actualStartDate || issue.createdAt;
    return diffDays(base, this.now, 1);
  }

  /**
   * Diferença em dias que NULIFICA resultados negativos (datas inconsistentes,
   * ex.: fim antes do início). Espelha o comportamento do ETL original.
   */
  _nonNegativeDiff(a, b, decimals) {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) return null;
    if (db.getTime() < da.getTime()) return null;
    return diffDays(a, b, decimals);
  }
}

module.exports = FlowMetricsCalculator;
