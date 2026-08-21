'use strict';

const { toDate } = require('../../shared/date.utils');

/**
 * SprintHistoryResolver — reconstrói QUANDO cada issue entrou e saiu de cada
 * sprint, a partir do changelog do campo Sprint.
 *
 * Por que isso existe: o campo Sprint guarda apenas o conjunto ATUAL de sprints
 * pelas quais a issue passou, sem dizer quando cada uma entrou. Sem essa
 * reconstrução é impossível separar "estava na sprint quando ela começou"
 * (compromisso) de "entrou no meio" (scope creep) — e "planejado" viraria um
 * rótulo falso.
 *
 * Formato das transições (já normalizadas pelo repositório):
 *   [{ at: ISO, from: ['A'], to: ['A','B'] }, ...]
 *
 * Duas particularidades do Jira que moldam o algoritmo:
 *
 *   1. `from`/`to` são SNAPSHOTS COMPLETOS do conjunto, não deltas. Mover um
 *      item da sprint A para a B aparece como `['A'] -> ['A','B']` (o Jira
 *      ACUMULA sprints no campo). Logo não é preciso "rebobinar" a partir do
 *      valor atual: o estado após a transição i É o `to` dela, e o estado antes
 *      da primeira É o `from` dela.
 *
 *   2. Campo preenchido NA CRIAÇÃO não gera entrada de changelog. Item criado
 *      já dentro da sprint, portanto, não tem transição alguma — e é membro
 *      desde `createdAt`. (Medido na base: 552 dos 1.738 itens standard com
 *      sprint estão nesse caso.)
 *
 * O caso que NÃO tem solução: issue com 2+ sprints no campo e nenhuma transição
 * registrada (subtarefa herdando a sprint do pai, ou movimentação em massa que
 * o Jira não registrou). Aí sabemos o CONJUNTO mas não a cronologia. Esses são
 * marcados com `reconstructed: false` para que o dashboard possa contá-los e
 * exibir a ressalva, em vez de embutir um palpite invisível no indicador.
 */
class SprintHistoryResolver {
  /**
   * @param {object} input
   * @param {string} input.createdAt data de criação da issue (ISO)
   * @param {string[]} input.sprints conjunto atual de sprints (campo Sprint)
   * @param {Array<{at:string, from:string[], to:string[]}>} input.transitions
   * @returns {{membership: Array<{sprint:string, enteredAt:string|null, leftAt:string|null}>,
   *            reconstructed: boolean, consistent: boolean}}
   *          `membership` traz UMA entrada por passagem — a mesma sprint pode
   *          aparecer duas vezes se a issue saiu e voltou.
   */
  resolve({ createdAt, sprints = [], transitions = [] } = {}) {
    const atuais = this._uniq(sprints);
    const ordered = this._sortByTime(transitions);

    if (!ordered.length) {
      // Sem transições: membro desde a criação. Só é confiável quando há no
      // máximo uma sprint — com duas ou mais, a cronologia é desconhecida.
      return {
        membership: atuais.map((s) => ({ sprint: s, enteredAt: createdAt || null, leftAt: null })),
        reconstructed: atuais.length <= 1,
        consistent: true,
      };
    }

    // Linha do tempo: [createdAt, t1) = from(t1); [ti, ti+1) = to(ti).
    const intervals = [{ at: createdAt || null, sprints: this._uniq(ordered[0].from) }];
    for (const t of ordered) intervals.push({ at: t.at, sprints: this._uniq(t.to) });

    // Uma issue pode entrar, sair e VOLTAR para a mesma sprint (visto na base:
    // PLAT-1393 entra na PI3_2, sai minutos depois e retorna no dia seguinte).
    // Por isso cada passagem é registrada separadamente — colapsar em um único
    // par entrada/saída marcaria como "fora" um item que ainda é membro.
    const nomes = this._uniq([...atuais, ...intervals.flatMap((i) => i.sprints)]);
    const membership = [];
    for (const sprint of nomes) {
      let aberta = null;
      for (const intervalo of intervals) {
        const dentro = intervalo.sprints.includes(sprint);
        if (dentro && !aberta) {
          aberta = { sprint, enteredAt: intervalo.at, leftAt: null };
          membership.push(aberta);
        } else if (!dentro && aberta) {
          aberta.leftAt = intervalo.at;
          aberta = null;
        }
      }
    }

    // O último `to` deveria bater com o campo Sprint atual. Quando não bate, o
    // changelog está incompleto (truncado ou herdado) — vale saber.
    const fim = intervals[intervals.length - 1].sprints.slice().sort().join('|');
    const agora = atuais.slice().sort().join('|');
    const consistent = fim === agora;

    return { membership, reconstructed: consistent, consistent };
  }

  /** Ordena as transições cronologicamente; entradas sem data vão para o fim. */
  _sortByTime(transitions) {
    return (transitions || [])
      .filter((t) => t && Array.isArray(t.from) && Array.isArray(t.to))
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

  _uniq(arr) {
    return Array.from(new Set((arr || [])
      .map((s) => this._canonicalSprintName(s))
      .filter(Boolean)));
  }

  /**
   * Alias explícito para um erro de digitação histórico já corrigido no Jira.
   * O prefixo é deliberadamente exato: não fazemos comparação aproximada, e o
   * sufixo (PI3_3, PI3_4, PI3_5...) permanece intacto para não unir sprints.
   */
  _canonicalSprintName(value) {
    return String(value || '').trim()
      .replace(/^26_SQD_APP_Aprenderr_/, '26_SQD_APP_Aprender_');
  }
}

module.exports = SprintHistoryResolver;
