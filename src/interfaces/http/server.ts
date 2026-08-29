'use strict';

import path = require('path');
import express = require('express');
import DashboardController = require('./controllers/DashboardController');

interface ServerOptions { dashboardController: DashboardController; publicDir: string }

/**
 * createServer — monta o app Express. Recebe o controller já pronto
 * (injeção de dependência) e apenas conecta rotas + serve o front estático.
 */
function createServer({ dashboardController, publicDir }: ServerOptions): express.Express {
  const app = express();

  app.use(express.json());

  // API
  app.get('/api/health', dashboardController.getHealth);
  app.get('/api/dashboard', dashboardController.getDashboard);
  app.post('/api/dashboard/progressive', dashboardController.getProgressiveDashboard);
  app.get('/api/refresh', dashboardController.postRefresh);
  app.post('/api/refresh', dashboardController.postRefresh);

  // Front-end estático (o dashboard)
  app.use(express.static(publicDir));

  // Fallback para a SPA/página única
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export = { createServer };
