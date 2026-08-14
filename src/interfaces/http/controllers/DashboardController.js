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
  constructor({ refresh, cache, getProgressiveDashboardData }) {
    this.refresh = refresh; // async () => payload (executa o caso de uso e grava no cache)
    this.cache = cache;
    this.getProgressiveDashboardData = getProgressiveDashboardData;
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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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

  /** POST /api/dashboard/progressive -> um lote pequeno, continuado por token. */
  getProgressiveDashboard = async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      const phase = req.body?.phase || 'recent';
      const nextPageToken = req.body?.nextPageToken || undefined;
      const since = req.body?.since || undefined;
      if (typeof nextPageToken === 'string' && nextPageToken.length > 4096) {
        return res.status(400).json({ error: 'Token de paginacao invalido.' });
      }
      if (typeof since === 'string' && since.length > 64) {
        return res.status(400).json({ error: 'Data incremental invalida.' });
      }
      const payload = await this.getProgressiveDashboardData({ phase, nextPageToken, since });
      return res.json(payload);
    } catch (err) {
      console.error('[DashboardController] erro progressivo:', err.message);
      return res.status(502).json({ error: 'Falha ao carregar lote do Jira', detail: err.message });
    }
  };

  /** GET /api/refresh -> força nova coleta e devolve a hora. */
  postRefresh = async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      await this._runRefresh();
      res.json({ status: 'ok', coletadoEm: this.cache.getSavedAt() });
    } catch (err) {
      res.status(502).json({ error: 'Falha ao atualizar', detail: err.message });
    }
  };

  /** GET /api/health */
  getHealth = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString(), coletadoEm: this.cache.getSavedAt() });
  };
}

module.exports = DashboardController;
