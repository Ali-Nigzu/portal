import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

import { execSync } from 'child_process';

function killLingeringRuntime() {
  for (const pattern of ['vite --host 0.0.0.0 --port 3000', 'backend.fastapi_app']) {
    try { execSync(`pkill -f "${pattern}"`); } catch {}
  }
}


const OUT_DIR = '/tmp/eventlogs-proof';
const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8080';
fs.mkdirSync(OUT_DIR, { recursive: true });

const FIXTURE = {
  events: Array.from({ length: 12 }).map((_, i) => ({
    index: i + 1,
    event: i % 2 === 0 ? 'entry' : 'exit',
    track_number: `TRACK-EXTREMELY-LONG-ID-${i}-ABCDEFGHIJKLMNOPQRSTUVWXYZ`,
    cam_id: i % 3,
    timestamp: `2026-05-20T12:${String((10 + i) % 60).padStart(2, '0')}:00.123456Z`,
    sex: i % 2 === 0 ? 'male' : 'female',
    age_bucket: '3',
    race: '1',
  })),
  total_pages: 1,
  total: 12,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnProcess(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[${name}] exited with code ${code}\n`);
    }
  });
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
  throw new Error(`${label} not healthy at ${url} within ${timeoutMs}ms`);
}

async function startRuntime() {
  killLingeringRuntime();
  const root = path.resolve(process.cwd(), '..');
  const backend = spawnProcess('backend', 'python3', ['-m', 'backend.fastapi_app'], root, {
    PORT: '8080',
    ANALYTICS_OFFLINE_MODE: '1',
  });
  const frontend = spawnProcess('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'));

  await waitForHttp(`${BACKEND_URL}/docs`, 'backend');
  await waitForHttp(`${FRONTEND_URL}/`, 'frontend');

  return {
    stop: () => {
      backend.kill('SIGTERM');
      frontend.kill('SIGTERM');
    },
  };
}

async function executeProof(device) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(device);
  await context.addInitScript(() => {
    window.sessionStorage.setItem('camOS_demo_session', 'true');
  });
  await context.route('**/api/events/search*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) });
  });

  const page = await context.newPage();
  await page.goto(`${FRONTEND_URL}/demo/site-b/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.vrm-layout', { timeout: 20000 });

  const nav = page.getByRole('link', { name: /Event Logs/i });
  if (await nav.count()) {
    await nav.first().click();
  } else {
    await page.goto(`${FRONTEND_URL}/demo/site-b/event-logs`, { waitUntil: 'networkidle' });
  }

  await page.waitForURL('**/demo/site-b/event-logs', { timeout: 20000 });
  await page.waitForSelector('.event-logs-page', { timeout: 20000 });
  await page.waitForSelector('button:has-text("Search")', { timeout: 20000 });

  const search = page.locator('button:has-text("Search")').first();
  await search.click();
  await page.waitForFunction(() => document.querySelectorAll('.event-logs-results-table tbody tr').length > 0, { timeout: 15000 });

  const gateState = await page.evaluate(() => {
    const rows = document.querySelectorAll('.event-logs-results-table tbody tr').length;
    const proof = (window).__EVENTLOGS_RUNTIME_PROOF__;
    const searchToken = Number(document.querySelector('.event-logs-page')?.getAttribute('data-search-token') ?? 1);
    return {
      route: window.location.pathname,
      rows,
      hasProof: Boolean(proof),
      searchToken,
    };
  });

  if (gateState.route !== '/demo/site-b/event-logs' || !gateState.hasProof || gateState.rows <= 0 || gateState.searchToken <= 0) {
    throw new Error(`runtime gate failed ${JSON.stringify(gateState)}`);
  }

  const suite = await page.evaluate(() => {
    return (window).__EVENTLOGS_RUNTIME_PROOF__.run(1);
  });

  fs.writeFileSync(`${OUT_DIR}/runtime-suite.json`, JSON.stringify(suite, null, 2));
  await page.screenshot({ path: `${OUT_DIR}/eventlogs-proof.png`, fullPage: true });
  await browser.close();

  if (suite.mountedPredicate !== true) {
    throw new Error('mountedPredicate false');
  }

  return suite;
}

async function main() {
  const runtime = await startRuntime();
  try {
    const suite = await executeProof(devices['iPhone 12']);
    console.log(JSON.stringify({ status: suite.status, firstInvalidOwner: suite.firstInvalidOwner, failureClass: suite.failureClass }, null, 2));
    if (suite.status !== 'PASS') process.exitCode = 2;
  } finally {
    runtime.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
