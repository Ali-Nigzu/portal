import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const artifactsDir = path.join(rootDir, 'artifacts', 'landing-layout');
const baseUrl = 'http://127.0.0.1:4173';

const scenarios = [
  { key: 'mock', url: '/?topologyMock=1' },
  { key: 'default', url: '/', initStorage: { landing_demo_bootstrap_done: '1' } },
  { key: 'live-equivalent', url: '/', initStorage: { camOS_demo_session: 'true' } },
  { key: 'degraded-unavailable', url: '/?previewDegraded=1', interceptUnavailable: true },
];

const startServer = () => spawn('npm', ['run', 'dev', '--', '--port', '4173'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const waitForServer = async (url, timeoutMs = 45000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const runScenario = async (browser, scenario) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  if (scenario.initStorage) {
    await page.addInitScript((data) => {
      Object.entries(data).forEach(([k, v]) => window.sessionStorage.setItem(k, v));
    }, scenario.initStorage);
  }

  if (scenario.interceptUnavailable) {
    await page.route('**/api/dashboard/**', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'forced unavailable' }) });
    });
    await page.route('**/api/widget/**', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'forced unavailable' }) });
    });
  }

  await page.goto(`${baseUrl}${scenario.url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="assurance-create-account-cta"]').scrollIntoViewIfNeeded();

  const metrics = await page.evaluate(() => {
    const rectObj = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const landingPreview = document.querySelector('.landing-preview');
    const previewRoot = document.querySelector('[class*="preview"]');
    const canvas = document.querySelector('[class*="canvas"]');
    const topCluster = document.querySelector('[class*="topCluster"]');
    const bottomCluster = document.querySelector('[class*="bottomCluster"]');
    const nodeLayer = document.querySelector('[class*="nodeLayer"]');
    const inlineNotices = Array.from(document.querySelectorAll('[class*="inlineNotice"], [class*="topNotice"], .errorNote'));
    const assurancesTitle = document.querySelector('.assurance-col-title');
    const assurancesWrap = document.querySelector('.landing-assurances');
    const cta = document.querySelector('[data-testid="assurance-create-account-cta"]');

    const meaningfulNodes = [
      ...Array.from(document.querySelectorAll('[class*="topCluster"] > *, [class*="bottomCluster"] > *, [data-testid="preview-enter-demo-cta"], [class*="node"], [data-testid="traffic-split-error"]')),
      ...inlineNotices,
    ].filter(visible);

    const meaningfulPreviewBottom = meaningfulNodes.length
      ? Math.max(...meaningfulNodes.map((el) => el.getBoundingClientRect().bottom))
      : (landingPreview?.getBoundingClientRect().bottom ?? 0);

    const containerPreviewBottom = previewRoot?.getBoundingClientRect().bottom ?? 0;
    const assurancesTop = assurancesTitle?.getBoundingClientRect().top ?? 0;

    const ctaRect = cta?.getBoundingClientRect();
    const points = ctaRect ? [
      { name: 'center', x: ctaRect.left + ctaRect.width / 2, y: ctaRect.top + ctaRect.height / 2 },
      { name: 'left-center', x: ctaRect.left + Math.min(20, ctaRect.width * 0.2), y: ctaRect.top + ctaRect.height / 2 },
      { name: 'right-center', x: ctaRect.right - Math.min(20, ctaRect.width * 0.2), y: ctaRect.top + ctaRect.height / 2 },
    ] : [];

    const occlusion = points.map((p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return {
        ...p,
        hitTag: hit?.tagName ?? null,
        hitClass: hit?.className ?? null,
        passes: !!(cta && hit && (hit === cta || cta.contains(hit))),
      };
    });

    const ruleDump = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        minHeight: s.minHeight,
        paddingBottom: s.paddingBottom,
        gridTemplateRows: s.gridTemplateRows,
        position: s.position,
        zIndex: s.zIndex,
        transform: s.transform,
        overflow: s.overflow,
      };
    };

    return {
      branchMarkers: {
        bootstrapBranch: document.querySelector('[data-preview-bootstrap-branch]')?.getAttribute('data-preview-bootstrap-branch') ?? null,
        topologyBranch: document.querySelector('[data-preview-topology-branch]')?.getAttribute('data-preview-topology-branch') ?? null,
        topologyMock: document.querySelector('[data-topology-mock]')?.getAttribute('data-topology-mock') ?? null,
      },
      boxes: {
        landingPreview: rectObj(landingPreview),
        previewRoot: rectObj(previewRoot),
        canvas: rectObj(canvas),
        topCluster: rectObj(topCluster),
        bottomCluster: rectObj(bottomCluster),
        nodeLayer: rectObj(nodeLayer),
        notices: inlineNotices.map((el) => ({ rect: rectObj(el), text: el.textContent?.trim() ?? '' })),
      },
      meaningfulPreviewBottom,
      containerPreviewBottom,
      assurancesTop,
      gapMeaningful: assurancesTop - meaningfulPreviewBottom,
      gapContainer: assurancesTop - containerPreviewBottom,
      styles: {
        previewRoot: ruleDump(previewRoot),
        canvas: ruleDump(canvas),
        assurancesWrap: ruleDump(assurancesWrap),
        cta: ruleDump(cta),
        topCluster: ruleDump(topCluster),
        bottomCluster: ruleDump(bottomCluster),
      },
      occlusion,
      overflowOk: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });

  const gapPass = metrics.gapMeaningful >= 8 && metrics.gapMeaningful <= 20;
  const occlusionPass = metrics.occlusion.every((p) => p.passes);

  if (gapPass && occlusionPass) {
    const preview = page.locator('.landing-preview');
    const assurances = page.locator('.landing-assurances');
    await preview.screenshot({ path: path.join(artifactsDir, `${scenario.key}-preview-assurances-boundary.png`) });
    await assurances.screenshot({ path: path.join(artifactsDir, `${scenario.key}-assurances-cta-footer.png`) });
  }

  await context.close();
  return { scenario: scenario.key, metrics, gapPass, occlusionPass };
};

const runTypographyCheck = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const widths = [1440, 1920];
  const rows = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    const row = await page.evaluate(() => {
      const el = document.querySelector('.assurance-col-title');
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        letterSpacing: s.letterSpacing,
        maxWidthContainer: getComputedStyle(document.querySelector('.landing-assurance-spec')).maxWidth,
      };
    });
    rows.push({ width, ...row });
  }
  await context.close();
  return rows;
};

const server = startServer();
try {
  await mkdir(artifactsDir, { recursive: true });
  await waitForServer(baseUrl);
  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(browser, scenario));
  }
  const typography = await runTypographyCheck(browser);

  console.log('=== Landing Layout Validation ===');
  for (const item of results) {
    console.log(`Scenario: ${item.scenario}`);
    console.table([{ 
      scenario: item.scenario,
      branchBootstrap: item.metrics.branchMarkers.bootstrapBranch,
      branchTopology: item.metrics.branchMarkers.topologyBranch,
      meaningfulPreviewBottom: Number(item.metrics.meaningfulPreviewBottom.toFixed(2)),
      assurancesTop: Number(item.metrics.assurancesTop.toFixed(2)),
      gapMeaningful: Number(item.metrics.gapMeaningful.toFixed(2)),
      gapContainer: Number(item.metrics.gapContainer.toFixed(2)),
      gapPass: item.gapPass,
      occlusionPass: item.occlusionPass,
      overflowOk: item.metrics.overflowOk,
    }]);
    console.log('Computed styles:', item.metrics.styles);
    console.log('Occlusion hits:', item.metrics.occlusion);
    console.log('Boxes:', item.metrics.boxes);
  }

  console.log('Typography check:', typography);

  const failed = results.filter((r) => !r.gapPass || !r.occlusionPass || !r.metrics.overflowOk);
  if (failed.length > 0) {
    throw new Error(`Validation failed in scenarios: ${failed.map((f) => f.scenario).join(', ')}`);
  }

  await browser.close();
} finally {
  if (!server.killed) server.kill('SIGTERM');
}
