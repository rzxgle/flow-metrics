'use strict';

import type { Request, Response } from 'express';
import GetDashboardDataUseCase = require('../../../application/use-cases/GetDashboardDataUseCase');
import GetProgressiveDashboardDataUseCase = require('../../../application/use-cases/GetProgressiveDashboardDataUseCase');
import PersistentCache = require('../../../infrastructure/cache/PersistentCache');

type DashboardPayload = Awaited<ReturnType<GetDashboardDataUseCase['execute']>>;
type ProgressiveInput = Parameters<GetProgressiveDashboardDataUseCase['execute']>[0];
type ProgressivePayload = Awaited<ReturnType<GetProgressiveDashboardDataUseCase['execute']>>;
interface ControllerOptions {
  refresh: () => Promise<DashboardPayload>;
  cache: PersistentCache<DashboardPayload>;
  getProgressiveDashboardData: (input: ProgressiveInput) => Promise<ProgressivePayload>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  private readonly refresh: ControllerOptions['refresh'];
  private readonly cache: ControllerOptions['cache'];
  private readonly getProgressiveDashboardData: ControllerOptions['getProgressiveDashboardData'];
  private _refreshing: Promise<DashboardPayload> | null;

  constructor({ refresh, cache, getProgressiveDashboardData }: ControllerOptions) {
    this.refresh = refresh; // async () => payload (executa o caso de uso e grava no cache)
    this.cache = cache;
    this.getProgressiveDashboardData = getProgressiveDashboardData;
    this._refreshing = null; // evita coletas simultâneas
  }

  private _runRefresh(): Promise<DashboardPayload> {
    if (!this._refreshing) {
      this._refreshing = Promise.resolve()
        .then(() => this.refresh())
        .finally(() => { this._refreshing = null; });
    }
    return this._refreshing;
  }

  /** GET /api/dashboard -> { issues, epics, generatedAt, coletadoEm, meta } */
  getDashboard = async (req: Request, res: Response) => {
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
    } catch (err: unknown) {
      const detail = errorMessage(err);
      console.error('[DashboardController] erro:', detail);
      const stale = this.cache.get();
      if (stale) {
        return res.json({ ...stale, coletadoEm: this.cache.getSavedAt(), avisoColeta: detail });
      }
      return res.status(502).json({ error: 'Falha ao obter dados do Jira', detail });
    }
  };

  /** POST /api/dashboard/progressive -> um lote pequeno, continuado por token. */
  getProgressiveDashboard = async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      const phase = req.body?.phase || 'recent';
      const nextPageToken = req.body?.nextPageToken || undefined;
      const since = req.body?.since || undefined;
      const epicKeys = req.body?.epicKeys || undefined;
      if (typeof nextPageToken === 'string' && nextPageToken.length > 4096) {
        return res.status(400).json({ error: 'Token de paginacao invalido.' });
      }
      if (typeof since === 'string' && since.length > 64) {
        return res.status(400).json({ error: 'Data incremental invalida.' });
      }
      if (epicKeys !== undefined && (!Array.isArray(epicKeys) || epicKeys.length > 50)) {
        return res.status(400).json({ error: 'Lista de epicos invalida.' });
      }
      const payload = await this.getProgressiveDashboardData({ phase, nextPageToken, since, epicKeys });
      return res.json(payload);
    } catch (err: unknown) {
      const detail = errorMessage(err);
      console.error('[DashboardController] erro progressivo:', detail);
      return res.status(502).json({ error: 'Falha ao carregar lote do Jira', detail });
    }
  };

  /** GET /api/refresh -> força nova coleta e devolve a hora. */
  postRefresh = async (_req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      await this._runRefresh();
      res.json({ status: 'ok', coletadoEm: this.cache.getSavedAt() });
    } catch (err: unknown) {
      res.status(502).json({ error: 'Falha ao atualizar', detail: errorMessage(err) });
    }
  };

  /** GET /api/health */
  getHealth = (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', time: new Date().toISOString(), coletadoEm: this.cache.getSavedAt() });
  };
}

export = DashboardController;
