'use strict';

/**
 * EpicResolver — resolve, para cada issue, a chave do Épico ancestral,
 * subindo a cadeia de `parentKey` até encontrar um item do tipo agrupado
 * "Épico". Responsabilidade única: navegação da hierarquia.
 *
 * Recebe um índice (Map chave -> issue enriquecida) e é resistente a ciclos.
 */
class EpicResolver {
  /**
   * @param {Map<string, object>} indexByKey mapa de chave -> issue enriquecida
   *        (cada objeto precisa ter `grupo`, `parentKey`).
   */
  constructor(indexByKey) {
    this.index = indexByKey;
  }

  /** Retorna a chave do épico ancestral, ou null se não houver. */
  resolveEpicKey(issue) {
    const seen = new Set();
    let current = issue;
    while (current) {
      if (current.grupo === 'Épico') return current.chave;
      const parentKey = current.parentKey;
      if (!parentKey || seen.has(parentKey)) return null;
      seen.add(parentKey);
      current = this.index.get(parentKey);
    }
    return null;
  }
}

module.exports = EpicResolver;
