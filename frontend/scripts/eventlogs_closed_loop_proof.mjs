import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';

const OUT_DIR = '/tmp/eventlogs-closed-loop-proof';
const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const backend = spawnProcess('backend', 'python3', ['-m', 'backend.fastapi_app'], root, { PORT: '8080', ANALYTICS_OFFLINE_MODE: '1' });
  const frontend = spawnProcess('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'));
  await waitForHttp(`${BACKEND_URL}/docs`, 'backend');
  await waitForHttp(`${FRONTEND_URL}/`, 'frontend');
  return { stop: () => { backend.kill('SIGTERM'); frontend.kill('SIGTERM'); } };
}

async function collectGateState(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.event-logs-results-table tbody tr').length;
    const proofApi = window.__EVENTLOGS_RUNTIME_PROOF__;
    const pageRoot = document.querySelector('.event-logs-page');
    return {
      route: window.location.pathname,
      hasLayout: !!document.querySelector('.vrm-layout'),
      hasEventLogsRoot: !!pageRoot,
      hasSearchButton: !!document.querySelector('button.vrm-btn-primary'),
      rows,
      searchToken: Number(pageRoot?.getAttribute('data-search-token') ?? 0),
      hasProofApi: !!proofApi,
    };
  });
}

async function executeViewport(name, contextOptions) {
  const viewDir = path.join(OUT_DIR, name);
  fs.mkdirSync(viewDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => window.sessionStorage.setItem('camOS_demo_session', 'true'));
  await context.route('**/api/events/search*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) });
  });

  const page = await context.newPage();
  const phase = { name, steps: [] };

  try {
    await page.goto(`${FRONTEND_URL}/demo/site-b/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.vrm-layout', { timeout: 30000 });
    phase.steps.push({ phase: 'dashboard_loaded', pass: true });

    const nav = page.getByRole('link', { name: /Event Logs/i });
    if (await nav.count()) await nav.first().click();
    await page.waitForURL('**/demo/site-b/event-logs', { timeout: 30000 });
    await page.waitForSelector('.event-logs-page', { timeout: 30000 });
    phase.steps.push({ phase: 'route_event_logs', pass: true, route: page.url() });

    await page.screenshot({ path: path.join(viewDir, 'PRE_SEARCH.png'), fullPage: true });

    const search = page.locator('button:has-text("Search")').first();
    await search.click();
    await page.waitForFunction(() => document.querySelectorAll('.event-logs-results-table tbody tr').length > 0, { timeout: 20000 });
    await page.screenshot({ path: path.join(viewDir, 'POST_SEARCH_MOUNTED.png'), fullPage: true });

    const gate = await collectGateState(page);
    const mounted = gate.route === '/demo/site-b/event-logs' && gate.hasProofApi && gate.searchToken > 0 && gate.rows > 0;
    phase.steps.push({ phase: 'mounted_gate', pass: mounted, gate });
    if (!mounted) throw new Error(`mounted gate failed ${JSON.stringify(gate)}`);

    const suite = await page.evaluate(() => window.__EVENTLOGS_RUNTIME_PROOF__.run(Number(document.querySelector('.event-logs-page')?.getAttribute('data-search-token') ?? 1)));
    await page.evaluate(() => {
      const el = document.querySelector('.event-logs-table-scroll');
      if (el) el.scrollLeft = el.scrollWidth;
    });
    await page.screenshot({ path: path.join(viewDir, 'POST_HSCROLL_RIGHT.png'), fullPage: true });

    fs.writeFileSync(path.join(viewDir, 'runtime-suite.json'), JSON.stringify(suite, null, 2));
    phase.steps.push({ phase: 'suite_executed', pass: true, suiteStatus: suite.status, firstInvalidOwner: suite.firstInvalidOwner, failureClass: suite.failureClass });
    await browser.close();
    return phase;
  } catch (err) {
    phase.steps.push({ phase: 'failure', pass: false, error: String(err) });
    await browser.close();
    return phase;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const runtime = await startRuntime();
  const summary = { startedAt: new Date().toISOString(), outDir: OUT_DIR, views: [] };
  try {
    summary.views.push(await executeViewport('portrait', devices['iPhone 12']));
    summary.views.push(await executeViewport('landscape', devices['iPhone 12 landscape']));
    summary.views.push(await executeViewport('desktop', { viewport: { width: 1440, height: 900 } }));
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

    const failed = summary.views.some((v) => v.steps.some((s) => s.pass === false));
    if (failed) process.exitCode = 2;
  } finally {
    runtime.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
