'use strict';

import { type DateInput, diffDays, toDate, toIsoDate } from '../../shared/date.utils';
import Issue = require('../entities/Issue');
import IssueClassifier = require('./IssueClassifier');

interface DependencyRules {
  dependencyIssueType: string;
  officialLinkTypes: Record<string, string>;
  fallbackLinkTypes: string[];
  unknownScopeLabel: string;
  squadPrefixPattern: RegExp;
  teamAliases: Record<string, string>;
  teamLabels: Record<string, string>;
  unknownTeamLabel: string;
}
interface CanonicalTeam { id: string | null; label: string }
type IssueLink = Issue['issueLinks'][number];
type ResolvedLink = IssueLink & { escopo: string | null };
interface DependencyBlock {
  EhDependencia: true;
  DepDemandante: string | null;
  DepDependente: string | null;
  DepEscopo: string;
  DepInicio: string | null;
  DepExterno?: string;
  DepLinks?: Array<{ k?: string; t?: string; s?: string }>;
  DepDescricao?: string;
  DepAprovada?: true;
  'Data Conclusao'?: string;
  AnoMesConclusao?: string;
  AnoConclusao?: number;
  LeadTimeDias?: number | null;
}

/**
 * DependencyResolver — transforma uma issue do tipo "Dependência" nos campos
 * que a aba de Dependências consome.
 *
 * Responsabilidade única: ler os campos e o changelog de UMA dependência e
 * devolver o bloco de dados dela. Não agrega, não conta, não ordena — isso é
 * do front, que já tem os filtros.
 *
 * Duas decisões de medição valem registro, porque não são óbvias:
 *
 * 1. A DATA DE CONCLUSÃO VEM DO CHANGELOG, não de `resolutiondate`. O workflow
 *    de Dependência não seta resolution: nas 62 dependências concluídas da base,
 *    `resolutiondate` é nulo em 100% delas, e `Data de Fim Real` também não é
 *    preenchida. Sem isto, toda dependência chegaria ao painel sem data — lead
 *    time nulo e sumindo do filtro global de período. A régua é a mesma do
 *    SprintDeliveryResolver: a ENTRADA na categoria Done.
 *
 * 2. O RELÓGIO COMEÇA NA ABERTURA. Assim como um bloqueio (Sub-block), uma
 *    dependência já nasce ativa: ninguém "começa a trabalhar" nela, ela existe
 *    a partir do instante em que é aberta. Por isso a duração é lead time
 *    (criação -> conclusão) e não cycle time, e a dependência ainda aberta
 *    conta da criação até HOJE — por isso a idade das abertas é calculada no
 *    navegador, a cada abertura, e não aqui: o snapshot em cache pode ser de
 *    dias atrás e congelaria o envelhecimento (mesma razão do `AgingDias`).
 *
 * Cancelamento não fecha o relógio — uma dependência cancelada deixou de ser
 * necessária, então ela é um episódio contado, mas sem dias medidos.
 */
class DependencyResolver {
  private readonly classifier: IssueClassifier;
  private readonly rules: DependencyRules;
  private readonly teamLabels: Map<string, string>;

  /**
   * @param {import('./IssueClassifier')} classifier
   * @param {object} rules ver config/dependency.rules.js
   */
  constructor(classifier: IssueClassifier, rules: DependencyRules) {
    this.classifier = classifier;
    this.rules = rules;
    /** id canônico -> rótulo de exibição, preenchido conforme os times aparecem. */
    this.teamLabels = new Map();
  }

  /** True quando a issue é uma dependência (e portanto `resolve` se aplica). */
  isDependency(issueType: string): boolean {
    return issueType === this.rules.dependencyIssueType;
  }

  /**
   * @param {import('../entities/Issue')} issue
   * @returns {object} bloco de campos `Dep*` + as sobrescritas de data/lead time
   */
  resolve(issue: Issue): DependencyBlock {
    const done = this.classifier.isDone(issue.status);
    const conclusao = done ? this._entradaEmDone(issue.statusTransitions) : null;
    const links = this._links(issue.issueLinks);

    const dependente = this._time(issue.team);
    const demandante = this._time(issue.timeDemandante);
    const externo = this._time(issue.timeExterno);

    // Só o ID canônico viaja em cada linha; os rótulos vão UMA vez no `meta`
    // (ver teamCatalog). Repetir "Martech CDP & Tracking [Educon]" duas vezes
    // por dependência custaria mais que o catálogo inteiro, e o payload atravessa
    // a rede em lotes com limite de tamanho no Amplify.
    const bloco: DependencyBlock = {
      EhDependencia: true,
      // Quem ABRIU (demandante) e de quem se depende (dependente, = campo Team).
      DepDemandante: demandante.id,
      DepDependente: dependente.id,
      DepEscopo: this._escopo(links),
      // Data em que o time dependente pegou a demanda. A espera até aqui é o
      // tempo de fila, e o front a calcula contra `Criado`.
      DepInicio: toIsoDate(this._primeiroEmAndamento(issue.statusTransitions)),
    };

    // As chaves abaixo só existem quando têm o que dizer — ausência já é a
    // informação, e omiti-las encolhe o lote.
    if (externo.id) bloco.DepExterno = externo.id;
    if (links.length) bloco.DepLinks = links.map((l) => ({ k: l.key, t: l.issueType, s: l.status }));
    if (issue.depDescription) bloco.DepDescricao = issue.depDescription;
    // Coletado, mas ainda SEM indicador na aba: hoje o campo é marcado no mesmo
    // dia da conclusão em 59 de 60 casos, então mediria "% concluída" e não
    // "% aceita". Fica aqui para quando o processo se definir.
    if (issue.depApproved) bloco.DepAprovada = true;

    // Sobrescreve os campos gerais do dashboard com a data tirada do changelog.
    // Mesma semântica de sempre (criação -> conclusão), só que com a única fonte
    // que existe para este issuetype.
    if (conclusao) {
      const iso = toIsoDate(conclusao);
      if (iso) {
        bloco['Data Conclusao'] = iso;
        bloco.AnoMesConclusao = iso.slice(0, 7);
        bloco.AnoConclusao = Number(iso.slice(0, 4));
        bloco.LeadTimeDias = this._dias(issue.createdAt, conclusao);
      }
    }

    return bloco;
  }

  /**
   * Catálogo `{ id: rótulo }` dos times vistos até agora — vai UMA vez no `meta`
   * do payload, em vez de repetir o nome em cada linha.
   *
   * É preenchido durante o `resolve`, e não numa tabela fixa, porque squad nova
   * aparece sem aviso: fixar a lista faria a matriz perder o time novo em
   * silêncio, que é pior do que o rótulo chegar por aqui.
   */
  teamCatalog(): Record<string, string> {
    return Object.fromEntries(this.teamLabels);
  }

  private _dias(de: DateInput, ate: DateInput): number | null {
    const a = toDate(de);
    const b = toDate(ate);
    if (!a || !b || b.getTime() < a.getTime()) return null;
    return diffDays(a, b, 1);
  }

  /**
   * Entrada na categoria Done — a transição cujo destino é Done e cuja origem
   * não é. Havendo reabertura, vale a ÚLTIMA entrada, que é o início da
   * sequência final: creditar a primeira dataria a resolução num momento em que
   * o trabalho ainda seria refeito.
   */
  private _entradaEmDone(transitions: Issue['statusTransitions']): string | null {
    const ordered = this._ordenar(transitions);
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const t = ordered[i];
      if (this.classifier.isDone(t.to) && !this.classifier.isDone(t.from)) return t.at;
    }
    return null;
  }

  /**
   * PRIMEIRA vez que a dependência entrou em um status de andamento. Aqui é a
   * primeira, e não a última: a pergunta é quanto tempo o time dependente levou
   * para pegar a demanda, e isso acontece uma vez só.
   */
  private _primeiroEmAndamento(transitions: Issue['statusTransitions']): string | null {
    for (const t of this._ordenar(transitions)) {
      if (this.classifier.isInProgress(t.to)) return t.at;
    }
    return null;
  }

  private _ordenar(transitions: Issue['statusTransitions']): Issue['statusTransitions'] {
    return (transitions || [])
      .filter((t) => t && t.at)
      .slice()
      .sort((a, b) => {
        const da = toDate(a.at);
        const db = toDate(b.at);
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });
  }

  /**
   * Links que valem como dependência. O tipo oficial entra sempre; `Blocks` e
   * `Relates` entram como aproximação (ver fallbackLinkTypes). `Cloners` fica
   * de fora: clone é cópia da própria dependência, não o item impactado.
   */
  private _links(issueLinks: Issue['issueLinks']): ResolvedLink[] {
    const out: ResolvedLink[] = [];
    for (const link of issueLinks || []) {
      if (!link || !link.key) continue;
      const type = link.type || '';
      const oficial = Object.prototype.hasOwnProperty.call(this.rules.officialLinkTypes, type);
      if (!oficial && !this.rules.fallbackLinkTypes.includes(type)) continue;
      out.push({ ...link, escopo: oficial ? this.rules.officialLinkTypes[type] : null });
    }
    return out;
  }

  /**
   * Escopo da dependência (mesma VS / outras VS), lido do tipo de link oficial.
   * Sem link oficial não há como saber — e dizer "mesma VS" por omissão seria
   * inventar o dado.
   */
  private _escopo(links: ResolvedLink[]): string {
    const oficial = links.find((l) => l.escopo);
    return oficial?.escopo || this.rules.unknownScopeLabel;
  }

  /**
   * Canoniza o nome de um time: devolve `{id, label}`, em que `id` é a chave de
   * comparação (sem acento, minúscula, sem o prefixo "Squad X - ") e `label` é
   * o nome curto para exibir.
   *
   * É isso que permite cruzar `Time Demandante` ("Core Features") com `Team`
   * ("Squad Core - Core Features") na matriz demandante x dependente.
   */
  private _time(nome: string | null): CanonicalTeam {
    if (!nome) return { id: null, label: this.rules.unknownTeamLabel };
    const curto = String(nome).replace(this.rules.squadPrefixPattern, '').trim();
    const base = curto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // tira os acentos separados pelo NFD
      .replace(/&/g, 'e')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const id = this.rules.teamAliases[base] || base;
    const label = this.rules.teamLabels[id] || curto;
    // Primeiro rótulo vence: as grafias divergentes conhecidas já estão fixadas
    // em teamLabels, então o que sobra aqui são times de uma grafia só.
    if (!this.teamLabels.has(id)) this.teamLabels.set(id, label);
    return { id, label };
  }
}

export = DependencyResolver;
