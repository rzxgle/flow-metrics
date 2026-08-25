'use strict';

const { toDate, diffDays, roundHalfEven } = require('../../shared/date.utils');

/**
 * StatusTimeResolver — reconstrói QUANTO TEMPO uma issue permaneceu em cada
 * status, a partir do changelog do campo Status.
 *
 * Por que isso existe: Lead Time e Cycle Time dizem quanto tempo o item levou,
 * mas não ONDE o tempo foi gasto. Sem decompor por status não se distingue
 * trabalho de fila — um Lead Time de 40 dias pode ser 35 dias parado em
 * `Backlog` ou 35 dias em `CODE REVIEW`, e a ação corretiva é oposta nos dois
 * casos.
 *
 * O changelog já era coletado (a mesma chamada em lote que traz o campo Sprint,
 * ver JiraIssueRepository.attachChangelogs) mas tinha um único consumidor: o
 * SprintDeliveryResolver, que dele extrai apenas a data de entrada em Done.
 *
 * Formato das transições (já normalizadas pelo repositório):
 *   [{ at: ISO, from: 'Backlog', to: 'Desenvolvimento' }, ...]
 *
 * Duas particularidades do Jira que moldam o algoritmo — as MESMAS que o
 * SprintHistoryResolver enfrenta no campo Sprint:
 *
 *   1. O VALOR DE CRIAÇÃO NÃO GERA ENTRADA NO CHANGELOG. O status inicial só é
 *      conhecido pelo `from` da PRIMEIRA transição, e a permanência nele vai de
 *      `createdAt` até essa transição. Sem isso, todo o tempo do primeiro status
 *      (tipicamente `Backlog` — justamente a maior fila) desapareceria.
 *
 *   2. O item pode SAIR E VOLTAR para o mesmo status (devolução de code review,
 *      reprovação em teste). As passagens são SOMADAS num único balde por
 *      status, com a contagem em `visitas` — é assim que retrabalho aparece como
 *      tempo acumulado em vez de virar duas médias diluídas.
 *
 * ESCOPO DELIBERADO: só permanências ENCERRADAS. A visita corrente (o status
 * atual) está aberta e não tem duração; contá-la exigiria recalcular no
 * navegador a cada abertura, porque o snapshot em cache pode ser de dias atrás
 * (é o que o Aging obriga em FlowMetricsCalculator). A visão de "tempo por
 * status" mede itens concluídos, cujas permanências relevantes estão todas
 * fechadas, então a visita aberta é sempre o status final — nada se perde.
 */
class StatusTimeResolver {
  /**
   * @param {object} input
   * @param {string} input.createdAt data de criação da issue (ISO)
   * @param {string} input.status status ATUAL da issue
   * @param {Array<{at:string, from:string, to:string}>} input.transitions
   * @returns {{permanencias: Array<{status:string, dias:number, visitas:number}>,
   *            reconstructed: boolean}}
   *          `permanencias` traz UM item por status, com o tempo somado de todas
   *          as passagens. `reconstructed: false` significa que a cronologia não
   *          fecha (changelog ausente, truncado ou herdado) — o dashboard conta
   *          esses itens e exibe a ressalva em vez de embutir um palpite.
   */
  resolve({ createdAt, status = null, transitions = [] } = {}) {
    const ordered = this._sortByTime(transitions);
    if (!ordered.length) {
      // Sem transição alguma: ou o changelog não veio, ou a issue foi criada já
      // no status atual (o Jira não registra o valor inicial). Nos dois casos
      // não há permanência ENCERRADA para medir, e não há como confirmar a
      // cronologia — então isto não conta como reconstruído.
      return { permanencias: [], reconstructed: false };
    }

    // Linha do tempo como pontos (status, instante de ENTRADA):
    //   [createdAt, from(t1)], [t1.at, to(t1)], [t2.at, to(t2)], ...
    // O último ponto é a visita ABERTA (status atual) e por isso não fecha.
    const pontos = [{ status: this._canonical(ordered[0].from), at: createdAt || null }];
    for (const t of ordered) pontos.push({ status: this._canonical(t.to), at: t.at });

    const porStatus = new Map();
    for (let i = 0; i < pontos.length - 1; i += 1) {
      const atual = pontos[i];
      const proximo = pontos[i + 1];
      if (!atual.status) continue; // `from` nulo: não há a quem atribuir o tempo
      const dias = this._nonNegativeDiff(atual.at, proximo.at);
      if (dias == null) continue; // data ausente ou fim antes do início
      const acc = porStatus.get(atual.status) || { status: atual.status, dias: 0, visitas: 0 };
      acc.dias += dias;
      acc.visitas += 1;
      porStatus.set(atual.status, acc);
    }

    // Arredonda só no fim: somar valores já arredondados acumularia o erro em
    // itens com muitas passagens.
    const permanencias = Array.from(porStatus.values())
      .map((p) => ({ status: p.status, dias: this._round2(p.dias), visitas: p.visitas }))
      .filter((p) => p.dias > 0);

    return { permanencias, reconstructed: this._isConsistent(ordered, status) };
  }

  /**
   * A cronologia "fecha" quando (a) o destino da última transição é o status
   * ATUAL da issue e (b) cada transição parte de onde a anterior chegou.
   *
   * (a) pega changelog truncado ou herdado; (b) pega buraco no meio da série —
   * uma transição que parte de um status onde a issue nunca esteve, segundo o
   * próprio changelog. Nos dois casos os tempos reconstruídos são parciais, e é
   * melhor dizer isso do que somá-los como se fossem completos.
   */
  _isConsistent(ordered, status) {
    const atual = this._canonical(status);
    const ultimo = this._canonical(ordered[ordered.length - 1].to);
    if (!atual || !ultimo || atual !== ultimo) return false;
    for (let i = 1; i < ordered.length; i += 1) {
      const veioDe = this._canonical(ordered[i].from);
      const chegouEm = this._canonical(ordered[i - 1].to);
      // Só acusa quando os dois lados são conhecidos: `from`/`to` nulos são
      // lacuna de dado, não prova de inconsistência.
      if (veioDe && chegouEm && veioDe !== chegouEm) return false;
    }
    return true;
  }

  /** Ordena as transições cronologicamente; entradas sem data vão para o fim. */
  _sortByTime(transitions) {
    return (transitions || [])
      .filter((t) => t && t.at && toDate(t.at))
      .slice()
      .sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime());
  }

  /**
   * Diferença em dias que descarta resultados negativos (fim antes do início —
   * acontece com relógio de servidor e importações em lote). Espelha o
   * `_nonNegativeDiff` do FlowMetricsCalculator: não inventar número é melhor do
   * que somar tempo negativo.
   *
   * Usa precisão alta aqui porque o arredondamento acontece só no total.
   */
  _nonNegativeDiff(a, b) {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) return null;
    if (db.getTime() < da.getTime()) return null;
    return diffDays(a, b, 6);
  }

  _round2(value) {
    return roundHalfEven(value, 2);
  }

  /** Nome de status normalizado: só espaços nas pontas, sem casamento aproximado. */
  _canonical(value) {
    const s = String(value == null ? '' : value).trim();
    return s || null;
  }
}

module.exports = StatusTimeResolver;
