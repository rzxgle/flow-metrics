'use strict';

import { roundHalfEven } from '../../shared/date.utils';

interface EnrichedIssue {
  EpicoChave?: string | null;
  'Tipo Agrupado'?: string;
  Concluido?: boolean;
  Cancelado?: boolean;
  'Story Points'?: number;
  Chave: string;
  Resumo: string;
  Squad: string;
  VS: string;
  Programa: string;
  PI: string;
  Status: string;
}

/**
 * EpicSummaryBuilder — agrega as issues enriquecidas por épico, gerando o
 * resumo consumido pela aba de épicos do dashboard.
 * Responsabilidade única: agregação.
 *
 * Regras (validadas 100% contra o dataset original):
 *   - membros do épico = todas as issues cujo EpicoChave == chave do épico
 *     (inclui o próprio épico; exclui Dependência — ver comentário no laço);
 *   - TotalItens     = quantidade de membros;
 *   - Concluidos     = membros concluídos;
 *   - Cancelados     = membros cancelados;
 *   - PctConclusao   = round(Concluidos / (TotalItens - Cancelados) * 100, 1);
 *   - SPTotal        = soma de Story Points dos membros;
 *   - SPConcluido    = soma de Story Points dos membros concluídos.
 */
class EpicSummaryBuilder {
  /**
   * @param {object[]} enrichedIssues issues já enriquecidas (formato do dashboard)
   * @param {Map<string, object>} epicIndexByKey mapa chave -> issue-épico enriquecida
   */
  build(enrichedIssues: EnrichedIssue[], epicIndexByKey: Map<string, EnrichedIssue>) {
    const membersByEpic = new Map<string, EnrichedIssue[]>();
    for (const issue of enrichedIssues) {
      const epicKey = issue.EpicoChave;
      if (!epicKey) continue;
      // Dependência fica FORA do rollup mesmo tendo pai (76 das 189 da base
      // têm): ela é um acordo entre times, não entrega do épico, e contá-la
      // inflaria TotalItens e derrubaria o % de conclusão com trabalho de
      // outra squad. É a mesma exclusão que `quarter.rules.js` aplica na aba
      // de PI Tracking (`excludedChildTypes`).
      if (issue['Tipo Agrupado'] === 'Dependência') continue;
      if (!membersByEpic.has(epicKey)) membersByEpic.set(epicKey, []);
      membersByEpic.get(epicKey)?.push(issue);
    }

    const summaries = [];
    for (const [epicKey, members] of membersByEpic.entries()) {
      const epic = epicIndexByKey.get(epicKey);
      if (!epic) continue; // épico fora do recorte da consulta

      const total = members.length;
      const done = members.filter((m) => m.Concluido).length;
      const cancelled = members.filter((m) => m.Cancelado).length;
      const denominator = total - cancelled;
      const pct = denominator > 0 ? roundHalfEven((done / denominator) * 100, 1) as number : 0;
      const spTotal = roundHalfEven(members.reduce((s, m) => s + (m['Story Points'] || 0), 0), 1) as number;
      const spDone = roundHalfEven(
        members.filter((m) => m.Concluido).reduce((s, m) => s + (m['Story Points'] || 0), 0),
        1,
      ) as number;

      summaries.push({
        Chave: epic.Chave,
        Resumo: epic.Resumo,
        Squad: epic.Squad,
        VS: epic.VS,
        Programa: epic.Programa,
        PI: epic.PI,
        Status: epic.Status,
        TotalItens: total,
        Concluidos: done,
        Cancelados: cancelled,
        PctConclusao: pct,
        SPTotal: spTotal,
        SPConcluido: spDone,
      });
    }

    return summaries;
  }
}

export = EpicSummaryBuilder;
