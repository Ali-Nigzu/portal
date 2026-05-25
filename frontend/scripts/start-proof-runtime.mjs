import { spawn, execSync } from 'child_process';
import path from 'path';

const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killLingeringRuntime() {
  for (const pattern of ['vite --host 0.0.0.0 --port 3000', 'backend.fastapi_app']) {
    try { execSync(`pkill -f "${pattern}"`); } catch {}
  }
}

function spawnProcess(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  return child;
}

async function waitForHttp(url, label, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`${label} health check failed: ${url}`);
}

async function main() {
  killLingeringRuntime();
  const root = path.resolve(process.cwd(), '..');
  const backend = spawnProcess('backend', 'python3', ['-m', 'backend.fastapi_app'], root, { PORT: '8000', ANALYTICS_OFFLINE_MODE: '1' });
  const frontend = spawnProcess('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'));

  try {
    await waitForHttp(`${BACKEND_URL}/docs`, 'backend');
    await waitForHttp(`${FRONTEND_URL}/`, 'frontend');
    console.log('[runtime] backend/frontend healthy');

    const cmd = process.argv.slice(2);
    if (cmd.length === 0) {
      await new Promise(() => {});
    }

    const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: true });
    const exitCode = await new Promise((resolve) => child.on('exit', resolve));
    process.exit(typeof exitCode === 'number' ? exitCode : 1);
  } finally {
    backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
