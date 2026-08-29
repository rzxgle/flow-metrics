'use strict';

import { type DateInput, toDate } from '../../shared/date.utils';
import IssueClassifier = require('./IssueClassifier');

interface EpicHealthIssue {
  status: string;
  dueDate?: DateInput;
  actualEndDate?: DateInput;
  resolvedAt?: DateInput;
}

type EpicHealth = 'Cancelado' | 'Entregue no prazo' | 'Entregue com atraso'
  | 'Entregue' | 'Atrasado' | 'Em andamento';

/**
 * EpicHealthEvaluator — deriva o campo "SaudeEpico".
 *
 * NOTA DE TRANSPARÊNCIA: diferente das demais regras (validadas a 100% contra
 * o dataset original), a fórmula EXATA da saúde do épico não pôde ser
 * reconstruída com certeza absoluta — e, na prática, o dashboard atual NÃO usa
 * este campo em nenhum gráfico. Implementamos aqui uma estratégia coerente e
 * fácil de ajustar. Se você tiver a regra original, este é o único ponto a
 * editar (Single Responsibility): o resto do sistema não muda.
 *
 * Estratégia atual (baseada no status do épico e na data limite):
 *   - Cancelado                         -> 'Cancelado'
 *   - Concluído + dentro do prazo       -> 'Entregue no prazo'
 *   - Concluído + fora do prazo         -> 'Entregue com atraso'
 *   - Concluído sem data limite         -> 'Entregue'
 *   - Entregue amplo (não concluído)    -> 'Entregue'
 *   - Em andamento + prazo estourado    -> 'Atrasado'
 *   - Em andamento                      -> 'Em andamento'
 */
class EpicHealthEvaluator {
  private readonly classifier: IssueClassifier;
  private now: Date;

  constructor(classifier: IssueClassifier, referenceDate: DateInput = new Date()) {
    this.classifier = classifier;
    this.now = toDate(referenceDate) || new Date();
  }

  /** Atualiza o "hoje" de referência (usado pelo refresh periódico). */
  setReferenceDate(referenceDate: DateInput): void {
    this.now = toDate(referenceDate) || new Date();
  }

  evaluate(epicIssue: EpicHealthIssue): EpicHealth {
    const status = epicIssue.status;
    if (this.classifier.isCancelled(status)) return 'Cancelado';

    const due = toDate(epicIssue.dueDate);
    if (this.classifier.isDone(status)) {
      if (!due) return 'Entregue';
      const end = toDate(epicIssue.actualEndDate) || toDate(epicIssue.resolvedAt);
      if (end && end.getTime() > due.getTime()) return 'Entregue com atraso';
      return 'Entregue no prazo';
    }

    if (this.classifier.isBroadlyDelivered(status)) return 'Entregue';

    if (due && this.now.getTime() > due.getTime()) return 'Atrasado';
    return 'Em andamento';
  }
}

export = EpicHealthEvaluator;
