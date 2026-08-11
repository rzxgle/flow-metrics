'use strict';

/**
 * DashboardController — adaptador HTTP <-> aplicação.
 *
 * Estratégia de cache persistente (Opção A):
 * - /api/dashboard SEMPRE serve o que está na "prateleira" (cache) → instantâneo.
 * - Se a prateleira ainda estiver vazia (primeiríssimo acesso após subir e sem
 *   arquivo em disco), faz uma coleta na hora, só dessa vez.
 * - A atualização periódica (de hora em hora) é agendada fora daqui (main.js).
 * - /api/refresh força uma nova coleta (o botão "Atualizar agora").
 */
class DashboardController {
  constructor({ refresh, cache }) {
    this.refresh = refresh; // async () => payload (executa o caso de uso e grava no cache)
    this.cache = cache;
    this._refreshing = null; // evita coletas simultâneas
  }

  _runRefresh() {
    if (!this._refreshing) {
      this._refreshing = Promise.resolve()
        .then(() => this.refresh())
        .finally(() => { this._refreshing = null; });
    }
    return this._refreshing;
  }

  /** GET /api/dashboard -> { issues, epics, generatedAt, coletadoEm, meta } */
  getDashboard = async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      if (forceRefresh || !this.cache.has()) {
        await this._runRefresh();
      }
      const payload = this.cache.get();
      if (!payload) {
        return res.status(503).json({ error: 'Dados ainda não disponíveis. Tente novamente em instantes.' });
      }
      return res.json({ ...payload, coletadoEm: this.cache.getSavedAt() });
    } catch (err) {
      console.error('[DashboardController] erro:', err.message);
      const stale = this.cache.get();
      if (stale) {
        return res.json({ ...stale, coletadoEm: this.cache.getSavedAt(), avisoColeta: err.message });
      }
      return res.status(502).json({ error: 'Falha ao obter dados do Jira', detail: err.message });
    }
  };

  /** GET /api/refresh -> força nova coleta e devolve a hora. */
  postRefresh = async (_req, res) => {
    try {
      await this._runRefresh();
      res.json({ status: 'ok', coletadoEm: this.cache.getSavedAt() });
    } catch (err) {
      res.status(502).json({ error: 'Falha ao atualizar', detail: err.message });
    }
  };

  /** GET /api/health */
  getHealth = (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), coletadoEm: this.cache.getSavedAt() });
  };
}

module.exports = DashboardController;
