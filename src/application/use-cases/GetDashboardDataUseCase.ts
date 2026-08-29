'use strict';

import IssueRepository = require('../../domain/repositories/IssueRepository');
import EpicHealthEvaluator = require('../../domain/services/EpicHealthEvaluator');
import EpicResolver = require('../../domain/services/EpicResolver');
import EpicSummaryBuilder = require('../../domain/services/EpicSummaryBuilder');
import IssueEnricher = require('../../domain/services/IssueEnricher');

type EnrichedIssue = ReturnType<IssueEnricher['enrich']>;
interface UseCaseOptions {
  issueRepository: IssueRepository;
  enricher: IssueEnricher;
  epicSummaryBuilder: EpicSummaryBuilder;
  epicHealthEvaluator: EpicHealthEvaluator;
  quarterRules?: unknown;
}
interface SprintCatalogEntry {
  name: string; startDate: string | null; endDate: string | null;
  completeDate: string | null; state: string | null; id: string | number | null;
}

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
  private readonly issueRepository: IssueRepository;
  private readonly enricher: IssueEnricher;
  private readonly epicSummaryBuilder: EpicSummaryBuilder;
  private readonly epicHealthEvaluator: EpicHealthEvaluator;
  private readonly quarterRules: unknown;

  constructor({ issueRepository, enricher, epicSummaryBuilder, epicHealthEvaluator, quarterRules }: UseCaseOptions) {
    this.issueRepository = issueRepository;
    this.enricher = enricher;
    this.epicSummaryBuilder = epicSummaryBuilder;
    this.epicHealthEvaluator = epicHealthEvaluator;
    this.quarterRules = quarterRules || null;
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
    const healthByEpic = new Map<string, ReturnType<EpicHealthEvaluator['evaluate']>>();
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

    // Catálogo de sprints (nome -> datas/estado), para o burndown e o velocity.
    // Dedup por nome; mantém os metadados mais completos encontrados.
    const sprintCatalog = new Map<string, SprintCatalogEntry>();
    for (const i of issues) {
      for (const sm of (i.sprintMeta || [])) {
        if (!sm || !sm.name) continue;
        const prev = sprintCatalog.get(sm.name)
          || { name: sm.name, startDate: null, endDate: null, completeDate: null, state: null, id: null };
        if (!prev.startDate && sm.startDate) prev.startDate = sm.startDate;
        if (!prev.endDate && sm.endDate) prev.endDate = sm.endDate;
        if (!prev.completeDate && sm.completeDate) prev.completeDate = sm.completeDate;
        if (!prev.state && sm.state) prev.state = sm.state;
        if (prev.id == null && sm.id != null) prev.id = sm.id;
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
        // Regras da aba de PI Tracking (ver config/quarter.rules.js).
        quarterRules: this.quarterRules,
        // id canônico -> rótulo dos times da aba de Dependências. Viaja UMA vez
        // aqui, em vez de repetir o nome do time em cada linha do payload.
        dependencyTeams: this.enricher.dependency ? this.enricher.dependency.teamCatalog() : {},
        sprints: Array.from(sprintCatalog.values()),
      },
    };
  }

  /** Sub-task herda "Incremental" do primeiro ancestral não sub-task. */
  private _resolveIncremental(issue: EnrichedIssue, indexByKey: Map<string, EnrichedIssue>): boolean {
    if (issue['Tipo Agrupado'] !== 'Sub-task') {
      return issue['Tipo Agrupado'] === 'História' || issue['Tipo Agrupado'] === 'Épico';
    }
    const seen = new Set<string>();
    let cur: EnrichedIssue | undefined = issue;
    while (cur && cur.parentKey && !seen.has(cur.parentKey)) {
      seen.add(cur.parentKey);
      cur = indexByKey.get(cur.parentKey);
      if (cur && cur['Tipo Agrupado'] !== 'Sub-task') {
        return cur['Tipo Agrupado'] === 'História' || cur['Tipo Agrupado'] === 'Épico';
      }
    }
    return true; // ancestral desconhecido -> assume incremental
  }

  private _stripInternal(e: EnrichedIssue): Omit<EnrichedIssue, 'grupo'> {
    const { grupo, ...clean } = e;
    return clean;
  }
}

export = GetDashboardDataUseCase;
