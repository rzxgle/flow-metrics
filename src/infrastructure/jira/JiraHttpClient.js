'use strict';

/**
 * JiraHttpClient — cliente HTTP de baixo nível para a API REST do Jira Cloud.
 * Responsabilidade única: falar HTTP com o Jira (autenticação, paginação,
 * tratamento de erro). Não conhece nada de "issue enriquecida" nem do dashboard.
 *
 * Usa o endpoint moderno de busca por JQL:  POST /rest/api/3/search/jql
 * (paginação por `nextPageToken`). Caso sua instância ainda use o endpoint
 * clássico, ajuste JIRA_SEARCH_PATH no .env.
 *
 * Autenticação: Basic auth com e-mail + API token (Jira Cloud).
 * Gere um token em: https://id.atlassian.com/manage-profile/security/api-tokens
 */
class JiraHttpClient {
  constructor({
    baseUrl, email, apiToken, searchPath = '/rest/api/3/search/jql', pageSize = 100,
    changelogPath = '/rest/api/3/changelog/bulkfetch', changelogBatchSize = 1000,
  }) {
    if (!baseUrl) throw new Error('JiraHttpClient: baseUrl é obrigatório');
    if (!email || !apiToken) throw new Error('JiraHttpClient: email e apiToken são obrigatórios');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.searchPath = searchPath;
    this.pageSize = pageSize;
    this.changelogPath = changelogPath;
    this.changelogBatchSize = changelogBatchSize;
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  /** POST autenticado que devolve JSON, com erro legível quando a API recusa. */
  async _post(path, body, { timeoutMs = 25000 } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira API ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  /**
   * Changelog de campos ESPECÍFICOS, em lote.
   *
   * O `fieldIds` é o que torna isto viável: pedindo só o campo Sprint, a base
   * inteira (~16 mil issues) sai em ~16 requisições de menos de 1s, porque o
   * histórico de status/descrição/rank — que é a maior parte — não vem.
   *
   * A resposta só inclui issues que TENHAM alguma entrada para os campos
   * pedidos, então costuma ser bem menor que a lista enviada.
   *
   * @param {Array<string|number>} issueIds ids numéricos das issues
   * @param {string[]} fieldIds ex.: ['customfield_10113']
   * @returns {Promise<Array<{issueId:string, changeHistories:object[]}>>}
   */
  async fetchFieldChangelogs(issueIds, fieldIds) {
    const ids = Array.from(new Set((issueIds || []).map((id) => String(id)).filter(Boolean)));
    if (!ids.length || !fieldIds || !fieldIds.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += this.changelogBatchSize) {
      const chunk = ids.slice(i, i + this.changelogBatchSize);
      let nextPageToken;
      do {
        const data = await this._post(this.changelogPath, {
          issueIdsOrKeys: chunk,
          fieldIds,
          maxResults: 1000,
          ...(nextPageToken ? { nextPageToken } : {}),
        // Timeout curto de propósito: em Amplify Compute a requisição inteira tem
        // orçamento de ~30s. Um timeout de 40s aqui estouraria o orçamento antes de
        // o catch em attachSprintTransitions poder degradar para "sem histórico" —
        // a página tomaria 504 em vez de abrir sem o velocity. Medido: <1s por lote.
        }, { timeoutMs: 15000 });
        out.push(...(data.issueChangeLogs || []));
        nextPageToken = data.nextPageToken || null;
      } while (nextPageToken);
    }
    return out;
  }

  /**
   * Busca TODAS as issues de uma JQL, paginando automaticamente.
   * @param {string} jql
   * @param {string[]} fields campos a retornar
   * @returns {Promise<object[]>} issues cruas da API do Jira
   */
  async searchAll(jql, fields) {
    const all = [];
    let nextPageToken = undefined;
    let isLast = false;

    while (!isLast) {
      const page = await this.searchPage(jql, fields, nextPageToken);
      all.push(...page.issues);
      nextPageToken = page.nextPageToken;
      isLast = page.isLast;
    }

    return all;
  }

  async searchPage(jql, fields, nextPageToken) {
    const data = await this._post(this.searchPath, {
      jql,
      fields,
      maxResults: this.pageSize,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    return {
      issues: data.issues || [],
      nextPageToken: data.nextPageToken || null,
      isLast: data.isLast === true || !data.nextPageToken,
    };
  }

  /** Busca poucas paginas para manter cada resposta abaixo dos limites do hosting. */
  async searchBatch(jql, fields, { nextPageToken, maxPages = 5 } = {}) {
    const issues = [];
    let token = nextPageToken;
    let isLast = false;
    let pages = 0;
    while (!isLast && pages < maxPages) {
      const page = await this.searchPage(jql, fields, token);
      issues.push(...page.issues);
      token = page.nextPageToken;
      isLast = page.isLast;
      pages += 1;
    }
    return { issues, nextPageToken: token || null, isLast, pages };
  }
}

module.exports = JiraHttpClient;
