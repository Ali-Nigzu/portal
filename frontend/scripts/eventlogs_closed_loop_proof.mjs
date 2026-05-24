import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import net from 'net';

const OUT_DIR = '/tmp/eventlogs-closed-loop-proof';
const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runChecked(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: '/bin/bash' });
}

function parseMissingPythonPackage(logText) {
  const m1 = logText.match(/No module named ['"]([^'"]+)['"]/);
  if (m1) return m1[1];
  const m2 = logText.match(/requires "([^"]+)" to be installed/);
  if (m2) return m2[1];
  return null;
}

async function installRuntimeDependencies(root) {
  runChecked('npm i', path.join(root, 'frontend'));
  runChecked('python3 -m pip install -r backend/requirements.txt', root);
  runChecked('npx playwright install-deps chromium || true', path.join(root, 'frontend'));
  runChecked('npx playwright install chromium', path.join(root, 'frontend'));
}

const FIXTURE = {
  events: Array.from({ length: 16 }).map((_, i) => ({
    index: i + 1,
    event: i % 2 === 0 ? 'entry' : 'exit',
    track_number: `TRACK-EXTREME-${i}-ABCDEFGHIJKLMNOPQRSTUVWXYZ`,
    cam_id: i % 3,
    timestamp: `2026-05-20T12:${String((10 + i) % 60).padStart(2, '0')}:00.123456Z`,
    sex: i % 2 === 0 ? 'male' : 'female',
    age_bucket: '3',
    race: '1',
  })),
  total_pages: 1,
  total: 16,
};

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

async function waitForTcp(host, port, label, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const sock = net.createConnection({ host, port });
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error', () => resolve(false));
      sock.setTimeout(1200, () => { sock.destroy(); resolve(false); });
    });
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`${label} tcp readiness failed @ ${host}:${port}`);
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
  throw new Error(`${label} readiness failed @ ${url}`);
}

async function startRuntime() {
  killLingeringRuntime();
  const root = path.resolve(process.cwd(), '..');
  await installRuntimeDependencies(root);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const backendLogs = [];
    const backend = spawnProcess('backend', 'python3', ['-m', 'backend.fastapi_app'], root, { PORT: '8000', ANALYTICS_OFFLINE_MODE: '1' });
    backend.stderr.on('data', (d) => backendLogs.push(String(d)));
    backend.stdout.on('data', (d) => backendLogs.push(String(d)));
    const frontend = spawnProcess('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'));
    try {
      await waitForTcp('127.0.0.1', 8000, 'backend', 60000);
      await waitForHttp(`${FRONTEND_URL}/`, 'frontend', 60000);
      return { stop: () => { backend.kill('SIGTERM'); frontend.kill('SIGTERM'); } };
    } catch (error) {
      lastError = error;
      backend.kill('SIGTERM');
      frontend.kill('SIGTERM');
      const miss = parseMissingPythonPackage(backendLogs.join('\n'));
      if (miss) {
        runChecked(`python3 -m pip install ${miss}`, root);
        continue;
      }
    }
  }
  throw lastError ?? new Error('runtime bootstrap failed');
}

async function trace(page, viewDir, tag) {
  const snap = await page.evaluate(() => ({
    url: window.location.href,
    pathname: window.location.pathname,
    localStorage: Object.fromEntries(Object.entries(window.localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(window.sessionStorage)),
    sidebarVisible: !!document.querySelector('.vrm-sidebar-shell, .vrm-sidebar'),
    visibleNavItems: [...document.querySelectorAll('a,button')]
      .map((n) => (n.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 80),
  }));
  fs.writeFileSync(path.join(viewDir, `${tag}.trace.json`), JSON.stringify(snap, null, 2));
}

async function executeViewport(playwright, name, contextOptions) {
  const { chromium } = playwright;
  const viewDir = path.join(OUT_DIR, name);
  fs.mkdirSync(viewDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  await context.route('**/api/events/search*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) });
  });

  const page = await context.newPage();
  const phase = { name, steps: [] };

  try {
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(viewDir, '01_landing.png'), fullPage: true });
    await trace(page, viewDir, '01_landing');

    const viewDemo = page.getByRole('link', { name: /View Demo/i }).or(page.getByRole('button', { name: /View Demo/i }));
    await viewDemo.first().click();
    await page.waitForURL(/\/demo\/.+\/dashboard/, { timeout: 40000 });
    await page.waitForSelector('.vrm-layout', { timeout: 30000 });
    await page.screenshot({ path: path.join(viewDir, '02_dashboard.png'), fullPage: true });
    await trace(page, viewDir, '02_dashboard');
    phase.steps.push({ phase: 'dashboard_loaded', pass: true, url: page.url() });

    const menuButton = page.getByRole('button', { name: /menu|navigation|sidebar/i });
    if (await menuButton.count()) {
      await menuButton.first().click().catch(() => {});
    }

    const eventLogsNav = page.getByRole('link', { name: /Event Logs/i });
    await eventLogsNav.first().click();
    await page.waitForURL(/event-logs/, { timeout: 30000 });
    await page.waitForSelector('.event-logs-page', { timeout: 30000 });
    await page.screenshot({ path: path.join(viewDir, '03_event_logs.png'), fullPage: true });
    await trace(page, viewDir, '03_event_logs');

    const search = page.getByRole('button', { name: /Search/i }).first();
    await search.click();
    await page.waitForFunction(() => document.querySelectorAll('.event-logs-results-table tbody tr').length > 0, { timeout: 20000 });
    await page.screenshot({ path: path.join(viewDir, '04_post_search_mounted.png'), fullPage: true });

    const gate = await page.evaluate(() => {
      const rows = document.querySelectorAll('.event-logs-results-table tbody tr').length;
      const pageRoot = document.querySelector('.event-logs-page');
      return {
        route: window.location.pathname,
        hasPage: !!pageRoot,
        hasSearch: !!document.querySelector('button.vrm-btn-primary'),
        rows,
        searchToken: Number(pageRoot?.getAttribute('data-search-token') ?? 0),
        hasProofApi: !!window.__EVENTLOGS_RUNTIME_PROOF__,
        hasMountedResults: !!document.querySelector('.event-logs-results-table tbody'),
      };
    });

    const mounted = gate.route.includes('event-logs') && gate.hasPage && gate.hasSearch && gate.searchToken > 0 && gate.rows > 0 && gate.hasProofApi && gate.hasMountedResults;
    phase.steps.push({ phase: 'mounted_gate', pass: mounted, gate });
    if (!mounted) throw new Error(`mounted gate failed ${JSON.stringify(gate)}`);

    const suite = await page.evaluate(() => window.__EVENTLOGS_RUNTIME_PROOF__.run(Number(document.querySelector('.event-logs-page')?.getAttribute('data-search-token') ?? 1)));
    fs.writeFileSync(path.join(viewDir, 'runtime-suite.json'), JSON.stringify(suite, null, 2));
    await trace(page, viewDir, '04_post_search');
    phase.steps.push({ phase: 'suite_executed', pass: true, suiteStatus: suite.status, firstInvalidOwner: suite.firstInvalidOwner, failureClass: suite.failureClass });

    await browser.close();
    return phase;
  } catch (err) {
    phase.steps.push({ phase: 'failure', pass: false, error: String(err), url: page.url() });
    await page.screenshot({ path: path.join(viewDir, 'failure.png'), fullPage: true }).catch(() => {});
    await trace(page, viewDir, 'failure').catch(() => {});
    await browser.close();
    return phase;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const runtime = await startRuntime();
  const summary = { startedAt: new Date().toISOString(), outDir: OUT_DIR, views: [] };
  try {
    const playwright = await import('playwright');
    const { devices } = playwright;
    summary.views.push(await executeViewport(playwright, 'portrait', devices['iPhone 12']));
    summary.views.push(await executeViewport(playwright, 'landscape', devices['iPhone 12 landscape']));
    summary.views.push(await executeViewport(playwright, 'desktop', { viewport: { width: 1440, height: 900 } }));
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    if (summary.views.some((v) => v.steps.some((s) => s.pass === false))) process.exitCode = 2;
  } finally {
    runtime.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
