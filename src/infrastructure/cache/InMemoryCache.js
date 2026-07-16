'use strict';

/**
 * InMemoryCache — cache simples com TTL. Evita bater na API do Jira a cada
 * request do navegador (a busca completa é cara). Responsabilidade única:
 * guardar/servir um valor por um tempo.
 */
class InMemoryCache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.entry = null; // { value, expiresAt }
  }

  get() {
    if (!this.entry) return null;
    if (Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  set(value) {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  clear() {
    this.entry = null;
  }
}

module.exports = InMemoryCache;
