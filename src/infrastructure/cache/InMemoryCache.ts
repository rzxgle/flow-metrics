'use strict';

/**
 * InMemoryCache — cache simples com TTL. Evita bater na API do Jira a cada
 * request do navegador (a busca completa é cara). Responsabilidade única:
 * guardar/servir um valor por um tempo.
 */
interface CacheEntry<T> { value: T; expiresAt: number }

class InMemoryCache<T = unknown> {
  private readonly ttlMs: number;
  private entry: CacheEntry<T> | null;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.entry = null; // { value, expiresAt }
  }

  get(): T | null {
    if (!this.entry) return null;
    if (Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  set(value: T): void {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  clear(): void {
    this.entry = null;
  }
}

export = InMemoryCache;
