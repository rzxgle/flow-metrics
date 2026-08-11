'use strict';

const fs = require('fs');
const path = require('path');

/**
 * PersistentCache — guarda o dataset em memória E em um arquivo no disco.
 *
 * Objetivo (a "prateleira"): servir o usuário sempre a partir do que já está
 * pronto, de forma instantânea, sem esperar a busca no Jira. A atualização é
 * feita em segundo plano (ver refresh agendado no main.js).
 *
 * - Enquanto o serviço está de pé, o valor vive em memória (rápido).
 * - Também é gravado em arquivo; se o processo reiniciar e o arquivo tiver
 *   sobrevivido (disco persistente), ele é recarregado e o usuário nem sente.
 * - Se o disco for efêmero (o arquivo some no restart), simplesmente ficamos
 *   sem cache até o primeiro refresh — o código lida com isso sem quebrar.
 *
 * NÃO tem expiração no get(): servir sempre entrega o que existe. A "idade" do
 * dado é comunicada pelo campo savedAt (mostrado no painel como "ATUALIZADO EM").
 */
class PersistentCache {
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), 'cache', 'dataset.json');
    this.entry = null; // { savedAt: ISOString, value }
    this._loadFromDisk();
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.value) {
          this.entry = parsed;
          // eslint-disable-next-line no-console
          console.log(`[cache] carregado do disco (coleta de ${parsed.savedAt})`);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[cache] não foi possível ler o arquivo de cache:', err.message);
      this.entry = null;
    }
  }

  _writeToDisk() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entry), 'utf8');
    } catch (err) {
      // Disco efêmero/somente-leitura: seguimos só com o cache em memória.
      // eslint-disable-next-line no-console
      console.warn('[cache] não foi possível gravar o arquivo (seguindo em memória):', err.message);
    }
  }

  /** Retorna o valor cacheado (ou null se ainda não há coleta). */
  get() {
    return this.entry ? this.entry.value : null;
  }

  /** ISO da última coleta, ou null. */
  getSavedAt() {
    return this.entry ? this.entry.savedAt : null;
  }

  /** Existe algo na prateleira? */
  has() {
    return !!this.entry;
  }

  /** Guarda um novo valor (memória + disco) e carimba a hora da coleta. */
  set(value) {
    this.entry = { savedAt: new Date().toISOString(), value };
    this._writeToDisk();
  }

  clear() {
    this.entry = null;
  }
}

module.exports = PersistentCache;
