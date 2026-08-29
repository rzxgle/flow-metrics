'use strict';

import { type DateInput, diffDays, startOfDayUtc, toDate } from '../../shared/date.utils';

interface FlowMetricIssue {
  actualEndDate?: DateInput;
  resolvedAt?: DateInput;
  createdAt?: DateInput;
  actualStartDate?: DateInput;
}

/**
 * FlowMetricsCalculator — calcula as métricas de fluxo de uma issue.
 * Responsabilidade única: contas de tempo.
 *
 * Fórmulas (validadas contra o dataset original, 100% de correspondência):
 *   - Lead Time  = (data de fim real | resolução) - data de criação   [só p/ concluídos]
 *   - Cycle Time = (data de fim real) - (data de início real)          [só p/ concluídos c/ início real]
 *   - Aging      = (meia-noite do dia de referência) - (início real)   [só p/ itens com início real]
 *
 * O "dia de referência" (referenceDate) é injetado — por padrão a data de
 * geração do relatório —, tornando o cálculo determinístico e testável.
 */
class FlowMetricsCalculator {
  private now: Date;

  constructor(referenceDate: DateInput = new Date()) {
    this.now = startOfDayUtc(referenceDate);
  }

  /** Atualiza o "dia de referência" (usado pelo refresh periódico). */
  setReferenceDate(referenceDate: DateInput): void {
    this.now = startOfDayUtc(referenceDate);
  }

  leadTimeDays(issue: FlowMetricIssue, isDone: boolean): number | null {
    if (!isDone) return null;
    const end = issue.actualEndDate || issue.resolvedAt;
    return this._nonNegativeDiff(issue.createdAt, end, 2);
  }

  cycleTimeDays(issue: FlowMetricIssue, isDone: boolean): number | null {
    if (!isDone) return null;
    if (!issue.actualStartDate || !issue.actualEndDate) return null;
    return this._nonNegativeDiff(issue.actualStartDate, issue.actualEndDate, 2);
  }

  /**
   * Aging só existe para itens com Data de início real preenchida — sem fallback
   * para a criação: contar tempo de fila como "envelhecimento em execução"
   * distorcia a leitura do WIP.
   *
   * ATENÇÃO: o dashboard RECALCULA este valor no navegador, a cada abertura
   * (`normalizeData` em public/index.html), porque o snapshot em cache pode ser
   * de dias atrás e congelaria o envelhecimento. O valor daqui serve aos
   * consumidores da API. Se mudar a regra, mude nos dois lugares.
   */
  agingDays(issue: FlowMetricIssue): number | null {
    if (!issue.actualStartDate) return null;
    return diffDays(issue.actualStartDate, this.now, 1);
  }

  /**
   * Diferença em dias que NULIFICA resultados negativos (datas inconsistentes,
   * ex.: fim antes do início). Espelha o comportamento do ETL original.
   */
  private _nonNegativeDiff(a: DateInput, b: DateInput, decimals: number): number | null {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) return null;
    if (db.getTime() < da.getTime()) return null;
    return diffDays(a, b, decimals);
  }
}

export = FlowMetricsCalculator;
