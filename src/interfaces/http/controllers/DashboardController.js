'use strict';

/**
 * DashboardController — adaptador de interface entre HTTP e o caso de uso.
 * Responsabilidade única: traduzir request/response HTTP <-> caso de uso.
 * Aplica cache para não sobrecarregar a API do Jira.
 */
class DashboardController {
  constructor({ getDashboardDataUseCase, cache }) {
    this.useCase = getDashboardDataUseCase;
    this.cache = cache;
  }

  /** GET /api/dashboard  -> { issues, epics, generatedAt } */
  getDashboard = async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      let payload = forceRefresh ? null : this.cache.get();

      if (!payload) {
        payload = await this.useCase.execute();
        this.cache.set(payload);
      }

      res.json(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DashboardController] erro:', err.message);
      res.status(502).json({
        error: 'Falha ao obter dados do Jira',
        detail: err.message,
      });
    }
  };

  /** GET /api/health -> checagem simples de saúde do serviço. */
  getHealth = (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  };
}

module.exports = DashboardController;
