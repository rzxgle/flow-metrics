'use strict';

const EpicResolver = require('../../domain/services/EpicResolver');

/**
 * GetDashboardDataUseCase — orquestra a produção do payload do dashboard.
 *
 * Depende de ABSTRAÇÕES (o repositório e os serviços de domínio são injetados),
 * nunca de implementações concretas do Jira — Dependency Inversion Principle.
 *
 * Passos:
 *   1. buscar issues cruas no repositório;
 *   2. enriquecer cada issue (classificação + métricas);
 *   3. indexar por chave e resolver o épico ancestral (EpicoChave);
 *   4. resolver "Incremental" e "SaudeEpico";
 *   5. agregar o resumo por épico;
 *   6. devolver { issues, epics, generatedAt }.
 */
class GetDashboardDataUseCase {
  constructor({ issueRepository, enricher, epicSummaryBuilder, epicHealthEvaluator }) {
    this.issueRepository = issueRepository;
    this.enricher = enricher;
    this.epicSummaryBuilder = epicSummaryBuilder;
    this.epicHealthEvaluator = epicHealthEvaluator;
  }

  async execute() {
    const issues = await this.issueRepository.findAll();

    // 2. enriquecer
    const enriched = issues.map((i) => this.enricher.enrich(i));

    // 3. indexar e resolver épico
    const indexByKey = new Map(enriched.map((e) => [e.chave, e]));
    const epicResolver = new EpicResolver(indexByKey);
    for (const e of enriched) {
      e.EpicoChave = epicResolver.resolveEpicKey(e);
    }

    // 4a. Incremental: sub-tasks herdam do tipo do ancestral não-subtarefa
    for (const e of enriched) {
      e.Incremental = this._resolveIncremental(e, indexByKey);
    }

    // 4b. SaudeEpico: avalia no épico e propaga para os membros
    const rawEpicIndex = new Map(
      issues.filter((i) => this.enricher.classifier.groupOf(i.issueType) === 'Épico')
        .map((i) => [i.key, i]),
    );
    const healthByEpic = new Map();
    for (const [key, rawEpic] of rawEpicIndex.entries()) {
      healthByEpic.set(key, this.epicHealthEvaluator.evaluate(rawEpic));
    }
    for (const e of enriched) {
      e.SaudeEpico = e.EpicoChave ? healthByEpic.get(e.EpicoChave) || null : null;
    }

    // 5. resumo por épico (índice de épicos enriquecidos)
    const enrichedEpicIndex = new Map(
      enriched.filter((e) => e['Tipo Agrupado'] === 'Épico').map((e) => [e.Chave, e]),
    );
    const epics = this.epicSummaryBuilder.build(enriched, enrichedEpicIndex);

    // 6. limpar campos internos antes de expor
    const cleanIssues = enriched.map((e) => this._stripInternal(e));

    // Catálogo de sprints (nome -> datas), para o burndown. Dedup por nome;
    // mantém as datas mais completas encontradas.
    const sprintCatalog = new Map();
    for (const i of issues) {
      for (const sm of (i.sprintMeta || [])) {
        if (!sm || !sm.name) continue;
        const prev = sprintCatalog.get(sm.name) || { name: sm.name, startDate: null, endDate: null };
        if (!prev.startDate && sm.startDate) prev.startDate = sm.startDate;
        if (!prev.endDate && sm.endDate) prev.endDate = sm.endDate;
        sprintCatalog.set(sm.name, prev);
      }
    }

    return {
      issues: cleanIssues,
      epics,
      generatedAt: new Date().toISOString(),
      meta: {
        pendingStatuses: this.enricher.classifier.rules.pendingStatuses || [],
        inProgressStatuses: this.enricher.classifier.rules.inProgressStatuses || [],
        doneStatuses: this.enricher.classifier.rules.doneStatuses || [],
        cancelledStatuses: this.enricher.classifier.rules.cancelledStatuses || [],
        sprints: Array.from(sprintCatalog.values()),
      },
    };
  }

  /** Sub-task herda "Incremental" do primeiro ancestral não sub-task. */
  _resolveIncremental(issue, indexByKey) {
    if (issue['Tipo Agrupado'] !== 'Sub-task') {
      return issue['Tipo Agrupado'] === 'História' || issue['Tipo Agrupado'] === 'Épico';
    }
    const seen = new Set();
    let cur = issue;
    while (cur && cur.parentKey && !seen.has(cur.parentKey)) {
      seen.add(cur.parentKey);
      cur = indexByKey.get(cur.parentKey);
      if (cur && cur['Tipo Agrupado'] !== 'Sub-task') {
        return cur['Tipo Agrupado'] === 'História' || cur['Tipo Agrupado'] === 'Épico';
      }
    }
    return true; // ancestral desconhecido -> assume incremental
  }

  _stripInternal(e) {
    const { grupo, ...clean } = e;
    return clean;
  }
}

module.exports = GetDashboardDataUseCase;
