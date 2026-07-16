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
  constructor({ baseUrl, email, apiToken, searchPath = '/rest/api/3/search/jql', pageSize = 100 }) {
    if (!baseUrl) throw new Error('JiraHttpClient: baseUrl é obrigatório');
    if (!email || !apiToken) throw new Error('JiraHttpClient: email e apiToken são obrigatórios');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.searchPath = searchPath;
    this.pageSize = pageSize;
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
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
      const body = {
        jql,
        fields,
        maxResults: this.pageSize,
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const res = await fetch(`${this.baseUrl}${this.searchPath}`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Jira API ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
      }

      const data = await res.json();
      const issues = data.issues || [];
      all.push(...issues);

      nextPageToken = data.nextPageToken;
      isLast = data.isLast === true || !nextPageToken;
    }

    return all;
  }
}

module.exports = JiraHttpClient;
