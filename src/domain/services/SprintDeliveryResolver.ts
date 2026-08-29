'use strict';

import { toDate } from '../../shared/date.utils';
import IssueClassifier = require('./IssueClassifier');

interface StatusTransition { at: string; from: string; to: string }
interface SprintDeliveryInput {
  statusTransitions?: StatusTransition[];
  status?: string | null;
  fallback?: string | null;
}
interface SprintDelivery {
  at: string | null;
  source: 'changelog' | 'fallback' | 'none';
}

/**
 * SprintDeliveryResolver — determina QUANDO o trabalho de sprint de uma issue
 * foi concluído, a partir do changelog do campo Status.
 *
 * Por que isso existe: até então a data de entrega vinha de `Data de Fim Real`
 * (campo manual) ou, na falta dela, de `resolutiondate`. Nenhuma das duas
 * representa o fim do trabalho DA SPRINT neste processo:
 *
 *   - a **homologação integrada acontece depois da sprint**, então os status
 *     finais (`Homologação integrada`, `PRONTO PARA PROD`, `Deploy em PROD`,
 *     `Ativação de valor`, `Measure & Learn`) e a resolução do item caem, por
 *     construção, fora da janela em que o time trabalhou;
 *   - `Data de Fim Real` é preenchida à mão, muitas vezes dias depois.
 *
 * A regra acordada com os times é: **o compromisso da sprint está entregue
 * quando o item entra no primeiro status da categoria Done** — hoje
 * `Pronto p/ Deploy STG`. É essa data que o velocity, o say-do e o burndown por
 * sprint devem usar.
 *
 * Implementação: em vez de fixar o nome de um status (fluxos diferentes entram
 * no Done por portas diferentes — sub-tarefas vão direto para `Concluído`,
 * bugs para `Done`), procuramos a **entrada** na categoria Done, isto é, a
 * transição cujo destino é Done e cuja origem não é. Transições internas ao
 * Done (`Pronto p/ Deploy STG` -> `Deploy em Staging` -> `PRONTO PARA PROD`)
 * são ignoradas — é exatamente isso que faz a data recair sobre a primeira
 * porta de entrada.
 *
 * Reabertura: se o item saiu do Done e voltou, vale a **última** entrada — o
 * início da sequência final em Done. Creditar a primeira entrada daria a
 * entrega a uma sprint em que o trabalho ainda seria refeito.
 */
class SprintDeliveryResolver {
  private readonly classifier: IssueClassifier;

  /** @param {import('./IssueClassifier')} classifier */
  constructor(classifier: IssueClassifier) {
    this.classifier = classifier;
  }

  /**
   * @param {object} input
   * @param {Array<{at:string, from:string, to:string}>} input.statusTransitions
   * @param {string} input.status status atual
   * @param {string|null} input.fallback data usada quando não há changelog
   * @returns {{at: string|null, source: 'changelog'|'fallback'|'none'}}
   *          `source` chega ao dashboard para que a ressalva de transparência
   *          possa contar quantos itens ainda dependem do campo manual.
   */
  resolve({ statusTransitions = [], status = null, fallback = null }: SprintDeliveryInput = {}): SprintDelivery {
    if (!this.classifier.isDone(status || '')) return { at: null, source: 'none' };

    const ordered = this._sortByTime(statusTransitions);
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const t = ordered[i];
      if (this.classifier.isDone(t.to) && !this.classifier.isDone(t.from)) {
        return { at: t.at, source: 'changelog' };
      }
    }

    // Sem entrada registrada: ou o changelog não veio, ou a issue foi criada já
    // em um status Done (o Jira não gera entrada para o valor inicial).
    return { at: fallback || null, source: fallback ? 'fallback' : 'none' };
  }

  private _sortByTime(transitions: StatusTransition[]): StatusTransition[] {
    return (transitions || [])
      .filter((t) => t && t.at)
      .slice()
      .sort((a, b) => {
        const da = toDate(a.at);
        const db = toDate(b.at);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
  }
}

export = SprintDeliveryResolver;
