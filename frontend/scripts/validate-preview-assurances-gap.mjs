import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000/';
const ARTIFACT_DIR = path.resolve('frontend/artifacts');

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x900', width: 1280, height: 900 },
  { name: '1100x900', width: 1100, height: 900 },
];

const states = [
  { name: 'mock', url: `${BASE}?topologyMock=1`, session: { landing_demo_bootstrap_done: null } },
  { name: 'default', url: BASE, session: { landing_demo_bootstrap_done: null } },
  { name: 'live-sim', url: BASE, session: { landing_demo_bootstrap_done: '1', camOS_credentials: null } },
  {
    name: 'degraded',
    url: `${BASE}?landingPreviewDiagnostics=1`,
    session: { landing_demo_bootstrap_done: null },
    blockApi: true,
  },
];

function ensureArtifactsDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runScenario(browser, state, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  if (state.blockApi) {
    await page.route('**/api/**', (route) => route.abort());
  }

  await page.goto(state.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.evaluate((session) => {
    Object.entries(session).forEach(([key, value]) => {
      if (value === null) {
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, String(value));
      }
    });
  }, state.session);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);

  const metrics = await page.evaluate(({ stateName, viewportName }) => {
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const rectObj = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };

    const previewRoot = document.querySelector('.landing-preview');
    const previewModule = document.querySelector('[class*="_preview_"]');
    const canvas = document.querySelector('[class*="_canvas_"]');
    const topCluster = document.querySelector('[class*="_topCluster_"]');
    const bottomCluster = document.querySelector('[class*="_bottomCluster_"]');
    const nodeLayer = document.querySelector('[class*="_nodeLayer_"]');
    const nodeCard = nodeLayer?.querySelector('[class*="_node_"]') ?? null;
    const topNotice = document.querySelector('[class*="_topNotice_"]');
    const inlineNotices = [...document.querySelectorAll('[class*="_inlineNotice_"]')].filter(visible);
    const assurancesSection = document.querySelector('.landing-assurances');
    const assurancesTitle = document.querySelector('[data-testid="assurance-col-privacy"] .assurance-col-title');
    const specInner = document.querySelector('.landing-spec-sheet-inner');
    const systemSurface = document.querySelector('.landing-system-surface');

    if (!previewRoot || !assurancesTitle || !assurancesSection) {
      return {
        stateName,
        viewportName,
        pass: false,
        fatal: 'Required preview/assurance selectors missing',
      };
    }

    const topRenderableChildren = topCluster
      ? [...topCluster.querySelectorAll('[class*="dashboard-v2__kpi-renderer"], [class*="_mockTile_"]')].filter(visible)
      : [];
    const bottomRenderableChildren = bottomCluster
      ? [...bottomCluster.querySelectorAll('[class*="dashboard-v2__kpi-renderer"], [class*="_capacityTile_"], [class*="_mockTile_"]')].filter(visible)
      : [];

    const meaningfulCandidates = [
      ...topRenderableChildren,
      ...bottomRenderableChildren,
      nodeCard,
      ...(topRenderableChildren.length === 0 ? [topCluster] : []),
      ...(bottomRenderableChildren.length === 0 ? [bottomCluster] : []),
    ].filter(visible);

    const meaningfulPreviewBottom = meaningfulCandidates.length > 0
      ? Math.max(...meaningfulCandidates.map((el) => el.getBoundingClientRect().bottom))
      : previewRoot.getBoundingClientRect().bottom;

    const assurancesTop = assurancesTitle.getBoundingClientRect().top;
    const gapMeaningful = assurancesTop - meaningfulPreviewBottom;

    let spacerElements = [];
    if (specInner && systemSurface) {
      const children = [...specInner.children];
      const iPreview = children.indexOf(systemSurface);
      const iAssurances = children.indexOf(assurancesSection);
      if (iPreview >= 0 && iAssurances > iPreview) {
        spacerElements = children.slice(iPreview + 1, iAssurances).map((el) => ({
          className: el.className,
          height: el.getBoundingClientRect().height,
        }));
      }
    }

    const stylePick = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
        minHeight: cs.minHeight,
        gridTemplateRows: cs.gridTemplateRows,
      };
    };

    const bodyText = document.body.textContent ?? '';
    const branchMarkers = {
      topologyMockParam: new URLSearchParams(location.search).get('topologyMock') === '1',
      diagnosticsParam: new URLSearchParams(location.search).get('landingPreviewDiagnostics') === '1',
      viewTokenParam: new URLSearchParams(location.search).has('view_token'),
      hasBootstrapDone: window.sessionStorage.getItem('landing_demo_bootstrap_done') === '1',
      runtimeStateAttr: previewModule?.getAttribute('data-preview-runtime-state') ?? null,
      runtimeDegradedAttr: previewModule?.getAttribute('data-preview-bootstrap-degraded') ?? null,
      runtimeForceMockAttr: previewModule?.getAttribute('data-preview-force-mock') ?? null,
      previewUnavailableCount: (bodyText.match(/Preview unavailable\./g) || []).length,
      degradedMessageVisible: bodyText.includes('Demo bootstrap unavailable; preview is using direct live data flow.'),
      hasTopCluster: visible(topCluster),
      hasBottomCluster: visible(bottomCluster),
      hasNodeLayer: visible(nodeLayer),
      topRenderableCount: topRenderableChildren.length,
      bottomRenderableCount: bottomRenderableChildren.length,
      inlineNoticeCount: inlineNotices.length,
      topNoticeVisible: visible(topNotice),
    };

    const overflowPx = document.documentElement.scrollWidth - window.innerWidth;
    const hasSpacerViolation = spacerElements.some((entry) => entry.height > 8);

    const branchPass = (
      (stateName === 'mock' && branchMarkers.topologyMockParam)
      || (stateName === 'live-sim' && branchMarkers.hasBootstrapDone && branchMarkers.runtimeDegradedAttr === 'false')
      || (stateName === 'degraded' && branchMarkers.diagnosticsParam)
      || stateName === 'default'
    );

    const gatePass = gapMeaningful >= 8 && gapMeaningful <= 20 && overflowPx <= 1 && !hasSpacerViolation && branchPass;

    return {
      stateName,
      viewportName,
      url: location.href,
      branchMarkers,
      meaningfulCandidateRects: meaningfulCandidates.map((el) => ({
        className: el.className,
        rect: rectObj(el),
      })),
      meaningfulPreviewBottom,
      assurancesTop,
      gapMeaningful,
      overflowPx,
      spacerElements,
      rects: {
        previewRoot: rectObj(previewRoot),
        previewModule: rectObj(previewModule),
        canvas: rectObj(canvas),
        topCluster: rectObj(topCluster),
        bottomCluster: rectObj(bottomCluster),
        nodeLayer: rectObj(nodeLayer),
        nodeCard: rectObj(nodeCard),
        topNotice: rectObj(topNotice),
        inlineNotice: inlineNotices[0] ? rectObj(inlineNotices[0]) : null,
        assurancesTitle: rectObj(assurancesTitle),
      },
      styles: {
        previewRoot: stylePick(previewRoot),
        previewModule: stylePick(previewModule),
        canvas: stylePick(canvas),
        assurances: stylePick(assurancesSection),
        topNotice: stylePick(topNotice),
        inlineNotice: stylePick(inlineNotices[0] ?? null),
      },
      pass: gatePass,
    };
  }, { stateName: state.name, viewportName: viewport.name });

  const slug = `${state.name}-${viewport.name}`;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}-fullpage.png`), fullPage: true });
  const specSheet = page.locator('.landing-spec-sheet');
  if ((await specSheet.count()) > 0) {
    await specSheet.first().screenshot({ path: path.join(ARTIFACT_DIR, `${slug}-wide.png`) });
  }

  const previewLoc = page.locator('.landing-preview');
  const assurancesTitleLoc = page.locator('[data-testid="assurance-col-privacy"] .assurance-col-title');
  const previewBox = (await previewLoc.count()) > 0 ? await previewLoc.first().boundingBox() : null;
  const assurancesTitleBox = (await assurancesTitleLoc.count()) > 0 ? await assurancesTitleLoc.first().boundingBox() : null;
  if (previewBox && assurancesTitleBox) {
    const top = Math.max(0, Math.floor(Math.min(previewBox.y + previewBox.height - 140, assurancesTitleBox.y - 120)));
    const bottom = Math.ceil(Math.max(previewBox.y + previewBox.height + 120, assurancesTitleBox.y + 180));
    const clipHeight = Math.max(80, Math.min(viewport.height - top, bottom - top));
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${slug}-tight.png`),
      clip: { x: 0, y: top, width: viewport.width, height: clipHeight },
    });
  }

  await context.close();
  return metrics;
}

ensureArtifactsDir();
const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of viewports) {
  for (const state of states) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runScenario(browser, state, viewport));
  }
}
await browser.close();

const allPass = results.every((result) => result.pass);
const output = { allPass, total: results.length, results };
console.log(JSON.stringify(output, null, 2));

if (!allPass) {
  process.exit(1);
}
