import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000/';

const states = [
  {
    name: 'state-mock',
    url: `${BASE}?topologyMock=1`,
    session: { landing_demo_bootstrap_done: null },
  },
  {
    name: 'state-default',
    url: BASE,
    session: { landing_demo_bootstrap_done: null },
  },
  {
    name: 'state-live-sim',
    url: BASE,
    session: { landing_demo_bootstrap_done: '1' },
  },
  {
    name: 'state-degraded',
    url: `${BASE}?landingPreviewDiagnostics=1`,
    session: { landing_demo_bootstrap_done: null },
    forceDegraded: true,
  },
];

async function runState(browser, state) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto(state.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  await page.evaluate(({ session, forceDegraded }) => {
    for (const [k, v] of Object.entries(session)) {
      if (v === null) window.sessionStorage.removeItem(k);
      else window.sessionStorage.setItem(k, String(v));
    }
    if (forceDegraded) {
      const originalWarn = console.warn;
      console.warn = (...args) => {
        if (String(args[0] ?? '').includes('Landing demo bootstrap failed')) {
          return;
        }
        originalWarn(...args);
      };
      window.__forceLandingBootstrapDegraded = true;
    }
  }, { session: state.session, forceDegraded: state.forceDegraded ?? false });

  if (state.forceDegraded) {
    await page.route('**/api/**', (route) => route.abort());
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const data = await page.evaluate((stateName) => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };

    const rectObj = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };

    const preview = document.querySelector('.landing-preview');
    const previewModule = document.querySelector('[class*="_preview_"]');
    const canvas = document.querySelector('[class*="_canvas_"]');
    const topCluster = document.querySelector('[class*="_topCluster_"]');
    const bottomCluster = document.querySelector('[class*="_bottomCluster_"]');
    const nodeLayer = document.querySelector('[class*="_nodeLayer_"]');
    const topNotice = document.querySelector('[class*="_topNotice_"]');
    const inlineNotices = [...document.querySelectorAll('[class*="_inlineNotice_"]')].filter(visible);
    const assurancesTitle = document.querySelector('[data-testid="assurance-col-privacy"] .assurance-col-title');
    const assurances = document.querySelector('.landing-assurances');
    const specInner = document.querySelector('.landing-spec-sheet-inner');
    const systemSurface = document.querySelector('.landing-system-surface');

    if (!preview || !assurancesTitle || !assurances) {
      return {
        stateName,
        fatal: 'Missing preview/assurances selectors',
        pass: false,
      };
    }

    const meaningfulCandidates = [topCluster, bottomCluster, nodeLayer, topNotice, ...inlineNotices].filter(visible);
    const meaningfulPreviewBottom = meaningfulCandidates.length
      ? Math.max(...meaningfulCandidates.map((node) => node.getBoundingClientRect().bottom))
      : preview.getBoundingClientRect().bottom;

    const assurancesTop = assurancesTitle.getBoundingClientRect().top;
    const gapMeaningful = assurancesTop - meaningfulPreviewBottom;

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

    let spacerElements = [];
    if (specInner && systemSurface) {
      const kids = [...specInner.children];
      const iPreview = kids.indexOf(systemSurface);
      const iAssurances = kids.indexOf(assurances);
      if (iPreview >= 0 && iAssurances > iPreview) {
        spacerElements = kids.slice(iPreview + 1, iAssurances).map((el) => ({
          className: el.className,
          height: el.getBoundingClientRect().height,
        }));
      }
    }

    const bodyText = document.body.textContent || '';
    const branchMarkers = {
      topologyMockParam: new URLSearchParams(location.search).get('topologyMock') === '1',
      diagnosticsParam: new URLSearchParams(location.search).get('landingPreviewDiagnostics') === '1',
      viewTokenParam: new URLSearchParams(location.search).has('view_token'),
      hasBootstrapDone: window.sessionStorage.getItem('landing_demo_bootstrap_done') === '1',
      previewUnavailableCount: (bodyText.match(/Preview unavailable\./g) || []).length,
      degradedMessageVisible: bodyText.includes('Demo bootstrap unavailable; preview is using direct live data flow.'),
      hasTopCluster: visible(topCluster),
      hasBottomCluster: visible(bottomCluster),
      hasNodeLayer: visible(nodeLayer),
      inlineNoticeCount: inlineNotices.length,
    };

    const overflowPx = document.documentElement.scrollWidth - window.innerWidth;
    const badSpacer = spacerElements.some((x) => x.height > 8);
    const pass = gapMeaningful >= 8 && gapMeaningful <= 20 && overflowPx <= 1 && !badSpacer;

    return {
      stateName,
      url: location.href,
      branchMarkers,
      meaningfulPreviewBottom,
      assurancesTop,
      gapMeaningful,
      overflowPx,
      spacerElements,
      rects: {
        preview: rectObj(preview),
        previewModule: rectObj(previewModule),
        canvas: rectObj(canvas),
        topCluster: rectObj(topCluster),
        bottomCluster: rectObj(bottomCluster),
        nodeLayer: rectObj(nodeLayer),
        topNotice: rectObj(topNotice),
        inlineNotice: inlineNotices[0] ? rectObj(inlineNotices[0]) : null,
      },
      styles: {
        landingPreview: stylePick(preview),
        previewModule: stylePick(previewModule),
        canvas: stylePick(canvas),
        landingAssurances: stylePick(assurances),
        topNotice: stylePick(topNotice),
        inlineNotice: stylePick(inlineNotices[0] || null),
      },
      pass,
    };
  }, state.name);

  await page.locator('.landing-spec-sheet').screenshot({ path: `artifacts/${state.name}-wide.png` });
  await page.locator('.landing-spec-sheet-inner').screenshot({ path: `artifacts/${state.name}-tight.png` });

  await context.close();
  return data;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const state of states) {
  results.push(await runState(browser, state));
}
await browser.close();

const allPass = results.every((entry) => entry.pass);
console.log(JSON.stringify({ allPass, results }, null, 2));

if (!allPass) {
  process.exit(1);
}
