import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

type CompilerName = 'backend' | 'frontend';

// Evita que o primeiro acesso coincida com a emissão inicial dos watchers,
// que antes fazia o node --watch reiniciar e resetar as requisições em curso.
const workspace = process.cwd();
const tscCli = require.resolve('typescript/bin/tsc');
const children = new Set<ChildProcess>();
let backendReady = false;
let frontendReady = false;
let startupComplete = false;
let shuttingDown = false;
let restartRequested = false;
let server: ChildProcess | null = null;

function relayLines(child: ChildProcess, label: string, onLine?: (line: string) => void): void {
  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) => {
      console.log(`[${label}] ${line}`);
      onLine?.(line);
    });
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', (line) => {
      console.error(`[${label}] ${line}`);
      onLine?.(line);
    });
  }
}

function stopAll(exitCode: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) child.kill();
  });
  setTimeout(() => process.exit(exitCode), 100);
}

function startServer(): void {
  if (shuttingDown || server) return;
  server = spawn(process.execPath, ['--enable-source-maps', 'dist/src/main.js'], {
    cwd: workspace,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.add(server);
  relayLines(server, 'server');
  server.once('exit', (code, signal) => {
    const exitedServer = server;
    if (exitedServer) children.delete(exitedServer);
    server = null;
    const shouldRestart = restartRequested && !shuttingDown;
    restartRequested = false;
    if (shouldRestart) {
      console.log('[dev] backend recompilado; reiniciando servidor.');
      startServer();
      return;
    }
    if (!shuttingDown) {
      console.error(`[dev] servidor encerrado inesperadamente (${signal || code || 'sem código'}).`);
      stopAll(code || 1);
    }
  });
}

function startWhenReady(): void {
  if (startupComplete || !backendReady || !frontendReady) return;
  startupComplete = true;
  console.log('[dev] compilações iniciais concluídas; iniciando servidor.');
  startServer();
}

function restartServer(): void {
  if (!startupComplete || shuttingDown) return;
  if (!server) {
    startServer();
    return;
  }
  restartRequested = true;
  server.kill();
}

function compilerSucceeded(name: CompilerName): void {
  if (name === 'backend') {
    const wasReady = backendReady;
    backendReady = true;
    if (startupComplete && wasReady) restartServer();
  } else {
    frontendReady = true;
  }
  startWhenReady();
}

function startCompiler(name: CompilerName, project: string): ChildProcess {
  const child = spawn(process.execPath, [
    tscCli,
    '-p', project,
    '--watch',
    '--preserveWatchOutput',
  ], {
    cwd: workspace,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.add(child);
  relayLines(child, name, (line) => {
    if (/Found 0 errors?\./.test(line)) compilerSucceeded(name);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[dev] compilador ${name} encerrado (${signal || code || 'sem código'}).`);
      stopAll(code || 1);
    }
  });
  return child;
}

process.once('SIGINT', () => stopAll(0));
process.once('SIGTERM', () => stopAll(0));

startCompiler('backend', 'tsconfig.json');
startCompiler('frontend', 'tsconfig.frontend.json');
