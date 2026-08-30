'use strict';

const fs = require('fs');
const path = require('path');

function loadDashboardHtml(): string {
  const root = path.resolve(__dirname, '..', '..', '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'public', 'dashboard.js'), 'utf8');
  const sourceFiles = [
    path.join(root, 'frontend', 'core', 'calendar.ts'),
    path.join(root, 'frontend', 'core', 'statistics.ts'),
    path.join(root, 'frontend', 'pages', 'overview.ts'),
    path.join(root, 'frontend', 'pages', 'estimates.ts'),
    path.join(root, 'frontend', 'pages', 'flow.ts'),
    path.join(root, 'frontend', 'pages', 'sprint.ts'),
    path.join(root, 'frontend', 'pages', 'block.ts'),
    path.join(root, 'frontend', 'pages', 'throughput.ts'),
    path.join(root, 'frontend', 'pages', 'wip.ts'),
    path.join(root, 'frontend', 'dashboard.ts'),
  ];
  const source = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const externalScript = '<script src="/dashboard.js"></script>';

  if (!html.includes(externalScript)) {
    throw new Error('Referencia ao bundle do dashboard nao encontrada.');
  }
  const executableHtml = html.replace(externalScript, `<script>${dashboard}</script>`);
  return `${executableHtml}\n<!-- dashboard.ts source\n${source.replaceAll('-->', '-- >')}\n-->`;
}

export = loadDashboardHtml;
