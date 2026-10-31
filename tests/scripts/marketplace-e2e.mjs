import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const testsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(testsDir, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}`);
}

async function configuredInternalHosts() {
  try {
    const raw = await readFile(path.join(root, '.env'), 'utf8');
    const line = raw.split(/\r?\n/).find((item) => item.startsWith('MARKETPLACE_INTERNAL_HOSTS='));
    return line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') ?? '';
  } catch {
    return '';
  }
}

async function waitFor(url, label, timeoutMs = 180_000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
      lastError = new Error(`${label}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
  }
  throw new Error(`${label} no quedó listo: ${lastError}`);
}

const baseline = await configuredInternalHosts();
let testPassed = false;
try {
  run('docker', ['compose', '--profile', 'e2e', 'up', '-d', '--build', '--force-recreate', 'api', 'brain', 'marketplace-fixture'], {
    env: { ...process.env, MARKETPLACE_INTERNAL_HOSTS: 'marketplace-fixture' },
  });
  await Promise.all([
    waitFor('http://localhost:8080/api/health', 'API NomikOS'),
    waitFor('http://localhost:8322/v1/health', 'Brain NomikOS'),
    waitFor('http://localhost:4177/__fixture/state', 'fixture MCP'),
  ]);
  const isWindows = process.platform === 'win32';
  const npm = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const testArgs = isWindows
    ? ['/d', '/s', '/c', 'npm run test:e2e -- tests/22.marketplace.mcp.x402.e2e.ts tests/23.marketplace.reputation.e2e.ts tests/24.compose.local.mcp.e2e.ts']
    : ['run', 'test:e2e', '--', 'tests/22.marketplace.mcp.x402.e2e.ts', 'tests/23.marketplace.reputation.e2e.ts', 'tests/24.compose.local.mcp.e2e.ts'];
  run(npm, testArgs, { cwd: testsDir });
  testPassed = true;
} finally {
  const cleanupErrors = [];
  for (const args of [
    ['compose', '--profile', 'e2e', 'stop', 'marketplace-fixture'],
    ['compose', '--profile', 'e2e', 'rm', '-sf', 'marketplace-fixture'],
  ]) {
    try {
      run('docker', args);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    run('docker', ['compose', 'up', '-d', '--force-recreate', 'api'], {
      env: { ...process.env, MARKETPLACE_INTERNAL_HOSTS: baseline },
    });
    await waitFor('http://localhost:8080/api/health', 'API NomikOS restaurada');
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length) {
    console.error(`Falló parte del cleanup del marketplace E2E: ${cleanupErrors.join('; ')}`);
    if (testPassed) throw new AggregateError(cleanupErrors, 'No se pudo restaurar completamente el entorno E2E');
  }
}
