'use strict';

import Issue = require('../entities/Issue');

/**
 * Porta (interface) do repositório de issues.
 *
 * O caso de uso depende DESTA abstração, não de uma implementação concreta
 * (Dependency Inversion Principle). Hoje a implementação concreta é o
 * `JiraIssueRepository`; amanhã poderia ser um `CsvIssueRepository`,
 * `PostgresIssueRepository` ou um mock em testes — sem alterar o caso de uso.
 *
 * Em JavaScript não há `interface` nativa, então usamos uma classe abstrata
 * que lança erro se um método não for implementado.
 */
class IssueRepository {
  /**
   * Busca todas as issues que satisfazem a consulta (JQL) configurada.
   * @returns {Promise<import('../entities/Issue')[]>}
   */
  async findAll(): Promise<Issue[]> {
    throw new Error('IssueRepository.findAll() não implementado');
  }
}

export = IssueRepository;
