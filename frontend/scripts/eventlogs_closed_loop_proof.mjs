import fs from 'fs';
import path from 'path';
import { spawn, execSync, spawnSync } from 'child_process';
import net from 'net';

const OUT_DIR = '/tmp/eventlogs-closed-loop-proof';
const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = process.argv.includes('--profile') ? (process.argv[process.argv.indexOf('--profile') + 1] || 'width-stress') : 'width-stress';

function runChecked(cmd, cwd) {
  const parts = cmd.trim().split(/\s+/);
  const result = spawnSync(parts[0], parts.slice(1), { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`command failed: ${cmd}`);
  }
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
  try { runChecked('npx playwright install-deps chromium', path.join(root, 'frontend')); } catch {}
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



function resolveExistingPath(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function verifyRequiredDemoDbs(root) {
  return;
  const required = ['dcombined_logs.db','dcombined_snapshots.db','duser0_logs.db','duser0_snapshots.db','duser1_logs.db','duser1_snapshots.db'];
  const report = required.map((name) => {
    const found = resolveExistingPath([
      path.join(root, name),
      path.join(root, 'backend', name),
      path.join(root, 'backend', 'data', name),
      path.join(root, name.replace(/^d/, '')),
      path.join(root, 'backend', name.replace(/^d/, '')),
      path.join(root, 'backend', 'data', name.replace(/^d/, '')),
    ]);
    return { name, found };
  });
  const missing = report.filter((x) => !x.found).map((x) => x.name);
  if (missing.length) {
    throw new Error(`missing required demo DB files: ${missing.join(', ')}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'db-check.json'), JSON.stringify(report, null, 2));
}

async function startRuntime() {
  killLingeringRuntime();
  const root = path.resolve(process.cwd(), '..');
  await installRuntimeDependencies(root);
  verifyRequiredDemoDbs(root);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const backendLogs = [];
    const backend = spawnProcess('backend', 'python3', ['-m', 'backend.fastapi_app'], root, { PORT: '8000', ANALYTICS_OFFLINE_MODE: 'true' });
    backend.stderr.on('data', (d) => backendLogs.push(String(d)));
    backend.stdout.on('data', (d) => backendLogs.push(String(d)));
    const frontend = spawnProcess('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'), { VITE_EVENTLOGS_SYNTHETIC_MODE: 'true', VITE_EVENTLOGS_SYNTHETIC_PROFILE: PROFILE });
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
    sidebarState: {
      primaryVisible: !!document.querySelector('.vrm-sidebar, .vrm-sidebar-shell'),
      secondaryVisible: !!document.querySelector('.vrm-secondary-sidebar, .vrm-secondary-list'),
      collapsed: !!document.querySelector('.vrm-sidebar--collapsed, .vrm-layout--mobile'),
      drawerOpen: !!document.querySelector('[aria-expanded="true"][aria-controls*="nav" i], .vrm-sidebar--open'),
    },
    navCandidates: [...document.querySelectorAll('a,button,[role="link"],[role="menuitem"],[title],[aria-label]')].map((n)=>{
      const r=n.getBoundingClientRect();
      const cs=getComputedStyle(n);
      return {text:(n.textContent||'').trim(), ariaLabel:n.getAttribute('aria-label'), title:n.getAttribute('title'), href:n.getAttribute('href'), visible:r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none', boundingBox:{x:r.x,y:r.y,width:r.width,height:r.height}, clickable: !n.hasAttribute('disabled')};
    }).slice(0,200),
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

    let navigated = false;
    for (let attempt = 0; attempt < 8 && !navigated; attempt += 1) {
      const menuButtons = page.locator('button[aria-label*="menu" i], button[aria-label*="nav" i], button[title*="menu" i], button[title*="nav" i], .vrm-mobile-menu-toggle, .vrm-sidebar-toggle');
      if (await menuButtons.count()) await menuButtons.first().click().catch(() => {});
      await page.waitForTimeout(250);

      const candidates = [
        page.getByRole('link', { name: /Event Logs/i }),
        page.getByRole('button', { name: /Event Logs/i }),
        page.locator('a[href*="event-logs"], button[aria-label*="Event Logs" i], [title*="Event Logs" i]'),
      ];
      for (const c of candidates) {
        if (await c.count()) {
          await c.first().scrollIntoViewIfNeeded().catch(() => {});
          await c.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
          if (page.url().includes('event-logs')) { navigated = true; break; }
        }
      }
      if (!navigated) {
        await page.mouse.move(40, 250).catch(() => {});
        await page.mouse.wheel(0, 600).catch(() => {});
      }
    }
    if (!navigated) throw new Error('Event Logs not reachable after nav state correction attempts');
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
  const summary = { startedAt: new Date().toISOString(), outDir: OUT_DIR, profile: PROFILE, syntheticMode: true, views: [] };
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
