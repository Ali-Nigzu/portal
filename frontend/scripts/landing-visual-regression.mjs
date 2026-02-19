import { chromium, firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(process.cwd());
const screenshotsDir = path.join(rootDir, 'artifacts', 'landing-visual');

const previousDesktopCtaToMetricsBaselinePx = 74;

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const waitForServer = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const launchFallbackBrowser = async () => {
  const launchers = [
    ['chromium', chromium],
    ['firefox', firefox],
  ];

  const launchErrors = [];
  for (const [name, launcher] of launchers) {
    try {
      const browser = await launcher.launch({ headless: true });
      return { browser, browserName: name };
    } catch (error) {
      launchErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not launch Playwright browsers. ${launchErrors.join(' | ')}`);
};

const server = spawn('npm', ['run', 'dev', '--', '--port', '4173'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const cleanup = () => {
  if (!server.killed) {
    server.kill('SIGTERM');
  }
};

try {
  await mkdir(screenshotsDir, { recursive: true });
  await waitForServer('http://127.0.0.1:4173');

  const { browser, browserName } = await launchFallbackBrowser();
  const context = await browser.newContext();
  const alignmentResults = [];

  for (const viewport of viewports) {
    const page = await context.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const liveUrl = 'http://127.0.0.1:4173/';
    const mockUrl = 'http://127.0.0.1:4173/?topologyMock=1';
    await page.goto(liveUrl, { waitUntil: 'networkidle' });

    await page.locator('.landing-hero').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-hero.png`),
    });

    await page.locator('.landing-system-surface').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-system-band.png`),
    });

    await page.locator('.landing-preview').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-seam-preview.png`),
    });

    const readGeometry = async () => page.evaluate(() => {
      const axisContainer = document.querySelector('.landing-axis-matrix')?.getBoundingClientRect();
      const landingContainer = document.querySelector('.landing-spec-sheet .landing-container')?.getBoundingClientRect();
      const firstRoman = document.querySelector('.landing-axis-roman')?.getBoundingClientRect();
      const firstLeftElement = document.querySelector('.landing-axis-cell-left:not(.landing-axis-cell-heading)');
      const firstRightElement = document.querySelector('.landing-axis-cell-right:not(.landing-axis-cell-heading)');
      const heroTitleRect = document.querySelector('.landing-hero h1')?.getBoundingClientRect() ?? null;
      const heroSubtextEl = document.querySelector('.landing-hero p');
      const heroSubtext = heroSubtextEl?.textContent?.trim() ?? null;
      const heroSubtextRect = heroSubtextEl?.getBoundingClientRect() ?? null;
      const heroCtasRect = document.querySelector('.landing-hero-actions')?.getBoundingClientRect() ?? null;
      const heroRect = document.querySelector('.landing-hero')?.getBoundingClientRect() ?? null;

      const heroTitleStyles = document.querySelector('.landing-hero h1') ? getComputedStyle(document.querySelector('.landing-hero h1')) : null;
      const heroStatementStyles = document.querySelector('.landing-hero p') ? getComputedStyle(document.querySelector('.landing-hero p')) : null;
      const headerActionsText = Array.from(document.querySelectorAll('.landing-header-actions button')).map((btn) => btn.textContent?.trim() ?? '');
      const stepOneButton = document.querySelector('.landing-axis-right-action');
      const stepOneButtonRect = stepOneButton?.getBoundingClientRect() ?? null;
      const preview = document.querySelector('.landing-preview');
      const topologyCanvasRect = document.querySelector('[class*="canvas"]')?.getBoundingClientRect() ?? null;
      const topClusterRect = document.querySelector('[class*="topCluster"]')?.getBoundingClientRect() ?? null;
      const systemSurface = document.querySelector('.landing-system-surface');
      const assuranceMatrix = document.querySelector('.landing-assurance-matrix');
      const previewNodeCta = document.querySelector('[data-testid="preview-enter-demo-cta"]');
      const previewNodeCtaRect = previewNodeCta?.getBoundingClientRect() ?? null;
      const trafficNodeConnector = document.querySelector('[data-testid="traffic-node-drop-connector"]');
      const trafficTileRect = document.querySelector('[class*="trafficTile"]')?.getBoundingClientRect() ?? null;
      const wireSvgRect = document.querySelector('[class*="wireSvg"]')?.getBoundingClientRect() ?? null;
      const footfallRect = document.querySelector('[data-testid="footfall-module"]')?.getBoundingClientRect() ?? null;
      const capacityRect = document.querySelector('[data-testid="capacity-module"]')?.getBoundingClientRect() ?? null;
      const row1Assurances = document.querySelectorAll('[data-testid="assurance-row-1"] .landing-assurance-row');
      const row2Assurances = document.querySelectorAll('[data-testid="assurance-row-2"] .landing-assurance-row');
      const row3Group = document.querySelector('[data-testid="assurance-row-3"]');
      const assuranceCta = document.querySelector('[data-testid="assurance-create-account-cta"]');
      const firstHeadingText = document.querySelector('#capabilities-title')?.textContent?.trim() ?? null;
      const secondHeadingText = document.querySelector('#deployment-title')?.textContent?.trim() ?? null;

      const stepTwoButton = document.querySelectorAll('.landing-axis-right-action')[1];
      const stepThreeButton = document.querySelectorAll('.landing-axis-right-action')[2];
      const stepTwoText = document.querySelectorAll('.landing-axis-cell-right:not(.landing-axis-cell-heading)')[1];

      const stepOneStyles = stepOneButton ? getComputedStyle(stepOneButton) : null;
      const stepTwoStyles = stepTwoText ? getComputedStyle(stepTwoText) : null;

      const leftTexts = Array.from(document.querySelectorAll('.landing-axis-cell-left:not(.landing-axis-cell-heading)')).map((el) => el.textContent?.trim() ?? '');
      const rightTexts = Array.from(document.querySelectorAll('.landing-axis-cell-right:not(.landing-axis-cell-heading)')).map((el) => el.textContent?.trim() ?? '');

      const rowCenter = (row) => Number((row.top + (row.height / 2)).toFixed(2));
      const midpoint = (a, b) => Number((((a + b) / 2)).toFixed(2));

      const rows = Array.from(document.querySelectorAll('.landing-axis-roman')).map((roman) => roman.getBoundingClientRect());
      const headingRect = document.querySelector('.landing-axis-cell-heading')?.getBoundingClientRect() ?? null;
      const row1Center = rows[0] ? rowCenter(rows[0]) : null;
      const row2Center = rows[1] ? rowCenter(rows[1]) : null;
      const row3Center = rows[2] ? rowCenter(rows[2]) : null;

      const gap12Mid = row1Center != null && row2Center != null ? midpoint(row1Center, row2Center) : null;
      const gap23Mid = row2Center != null && row3Center != null ? midpoint(row2Center, row3Center) : null;
      const rowGap12 = row1Center != null && row2Center != null ? Number(Math.abs(row2Center - row1Center).toFixed(2)) : null;
      const rowGap23 = row2Center != null && row3Center != null ? Number(Math.abs(row3Center - row2Center).toFixed(2)) : null;
      const headingToRow1 = headingRect && rows[0] ? Number(Math.abs(row1Center - headingRect.bottom).toFixed(2)) : null;

      const titleToSubtextGap = heroTitleRect && heroSubtextRect
        ? Number(Math.max(0, heroSubtextRect.top - heroTitleRect.bottom).toFixed(2))
        : null;
      const subtextToCtaGap = heroSubtextRect && heroCtasRect
        ? Number(Math.max(0, heroCtasRect.top - heroSubtextRect.bottom).toFixed(2))
        : null;
      const ctaOffsetFromHeroTop = heroRect && heroCtasRect
        ? Number(Math.max(0, heroCtasRect.top - heroRect.top).toFixed(2))
        : null;
      const ctaToMetricsGap = heroCtasRect && headingRect
        ? Number(Math.max(0, headingRect.top - heroCtasRect.bottom).toFixed(2))
        : null;
      const metricsBottomToPreviewTopGap = rows[2] && preview
        ? Number(Math.max(0, preview.getBoundingClientRect().top - rows[2].bottom).toFixed(2))
        : null;
      const axisCenter = axisContainer ? axisContainer.left + (axisContainer.width / 2) : null;
      const axisHalf = 40;
      const axisRightEdge = axisCenter != null && axisHalf != null ? axisCenter + axisHalf : null;

      const connectorY2 = trafficNodeConnector ? Number(trafficNodeConnector.getAttribute('y2')) : null;
      const connectorX1 = trafficNodeConnector ? Number(trafficNodeConnector.getAttribute('x1')) : null;
      const connectorX2 = trafficNodeConnector ? Number(trafficNodeConnector.getAttribute('x2')) : null;
      const connectorScreenY2 = connectorY2 != null && wireSvgRect ? wireSvgRect.top + connectorY2 : null;
      const connectorScreenX2 = connectorX2 != null && wireSvgRect ? wireSvgRect.left + connectorX2 : null;
      const connectorDepthIntoTrafficPx = trafficTileRect && connectorScreenY2 != null
        ? Number((connectorScreenY2 - trafficTileRect.top).toFixed(2))
        : null;
      const donutSectors = Array.from(document.querySelectorAll('[data-testid="traffic-split-module"] svg .recharts-sector')).map((sector) => sector.getBoundingClientRect());
      const donutOuterTop = donutSectors.length > 0 ? Math.min(...donutSectors.map((rect) => rect.top)) : null;
      const donutOuterBottom = donutSectors.length > 0 ? Math.max(...donutSectors.map((rect) => rect.bottom)) : null;
      const donutOuterLeft = donutSectors.length > 0 ? Math.min(...donutSectors.map((rect) => rect.left)) : null;
      const donutOuterRight = donutSectors.length > 0 ? Math.max(...donutSectors.map((rect) => rect.right)) : null;
      const donutDiameterPx = donutOuterTop != null && donutOuterBottom != null && donutOuterLeft != null && donutOuterRight != null
        ? Number(Math.min(donutOuterRight - donutOuterLeft, donutOuterBottom - donutOuterTop).toFixed(2))
        : null;
      const donutInnerBounds = donutOuterTop != null && donutOuterBottom != null && donutOuterLeft != null && donutOuterRight != null
        ? {
          cx: (donutOuterLeft + donutOuterRight) / 2,
          cy: (donutOuterTop + donutOuterBottom) / 2,
          innerRadius: Math.min(donutOuterRight - donutOuterLeft, donutOuterBottom - donutOuterTop) * 0.22,
        }
        : null;
      const connectorInDonutInnerBounds = connectorScreenX2 != null && connectorScreenY2 != null && donutInnerBounds
        ? Math.hypot(connectorScreenX2 - donutInnerBounds.cx, connectorScreenY2 - donutInnerBounds.cy) < donutInnerBounds.innerRadius
        : null;
      const connectorToDonutOuterTopDiff = connectorScreenY2 != null && donutOuterTop != null
        ? Number(Math.abs(connectorScreenY2 - donutOuterTop).toFixed(2))
        : null;
      const connectorToDonutRadiusDiff = connectorScreenX2 != null && connectorScreenY2 != null && donutInnerBounds
        ? Number(Math.abs(Math.hypot(connectorScreenX2 - donutInnerBounds.cx, connectorScreenY2 - donutInnerBounds.cy) - (donutDiameterPx / 2)).toFixed(2))
        : null;
      const topClusterLiftPx = topologyCanvasRect && topClusterRect
        ? Number((topologyCanvasRect.top - topClusterRect.top).toFixed(2))
        : null;
      const footfallToCapacityGap = footfallRect && capacityRect
        ? Number(Math.max(0, capacityRect.top - footfallRect.bottom).toFixed(2))
        : null;
      const assuranceRow3ToCtaGap = row3Group && assuranceCta
        ? Number(Math.max(0, assuranceCta.getBoundingClientRect().top - row3Group.getBoundingClientRect().bottom).toFixed(2))
        : null;

      return {
        rowCount: rows.length,
        heroSubtextIsSeeMore: heroSubtext === 'See More.',
        titleToSubtextGap,
        subtextToCtaGap,
        ctaOffsetFromHeroTop,
        ctaToMetricsGap,
        heroTitleFontSizePx: heroTitleStyles ? Number.parseFloat(heroTitleStyles.fontSize) : null,
        heroStatementFontSizePx: heroStatementStyles ? Number.parseFloat(heroStatementStyles.fontSize) : null,
        metricsBottomToPreviewTopGap,
        topNavHasDemoCta: headerActionsText.includes('Access Demo'),
        topNavHasCreateAccountCta: headerActionsText.includes('Create Account'),
        containerToAxisCenterDiffPx:
          landingContainer && axisCenter != null
            ? Number(Math.abs((landingContainer.left + (landingContainer.width / 2)) - axisCenter).toFixed(2))
            : null,
        axisCenterDiffPx:
          axisContainer && firstRoman
            ? Number(Math.abs((axisContainer.left + (axisContainer.width / 2)) - (firstRoman.left + (firstRoman.width / 2))).toFixed(2))
            : null,
        leftGapToAxisPx: firstLeftElement
          ? Number(parseFloat(getComputedStyle(firstLeftElement).paddingRight).toFixed(2))
          : null,
        rightGapToAxisPx: firstRightElement
          ? Number(parseFloat(getComputedStyle(firstRightElement).paddingLeft).toFixed(2))
          : null,
        bubbleOverlapsAxis: stepOneButtonRect && axisRightEdge != null
          ? stepOneButtonRect.left < axisRightEdge
          : null,
        headingsCorrect: firstHeadingText === 'Metrics' && secondHeadingText === 'Access',
        step1LooksLikeText: stepOneStyles && stepTwoStyles
          ? stepOneStyles.backgroundColor === stepTwoStyles.backgroundColor
            && stepOneStyles.borderTopWidth === '0px'
            && stepOneStyles.paddingTop === '0px'
            && stepOneStyles.color === stepTwoStyles.color
          : null,
        step1IsButton: stepOneButton instanceof HTMLButtonElement,
        step2HasButton: Boolean(stepTwoButton),
        step3HasButton: Boolean(stepThreeButton),
        hasDwellTime: leftTexts.includes('Dwell time'),
        leftTexts,
        rightTexts,
        row2InterleaveDiffPx: gap12Mid != null && row2Center != null ? Number(Math.abs(row2Center - gap12Mid).toFixed(2)) : null,
        row3InterleaveDiffPx: gap23Mid != null && row3Center != null ? Number(Math.abs(row3Center - gap23Mid).toFixed(2)) : null,
        headingToRow1,
        rowGap12,
        rowGap23,
        hasRailArtifacts: Boolean(document.querySelector('.landing-deployment-spine, .landing-deployment-rail, .landing-deployment-stem')),
        previewHasTopBorder: preview ? getComputedStyle(preview).borderTopWidth !== '0px' : null,
        systemSurfaceHasTopBorder: systemSurface ? getComputedStyle(systemSurface).borderTopWidth !== '0px' : null,
        assuranceHasTopBorder: assuranceMatrix ? getComputedStyle(assuranceMatrix).borderTopWidth !== '0px' : null,
        previewNodeCtaExists: Boolean(previewNodeCta),
        previewNodeCtaText: previewNodeCta?.textContent?.trim() ?? null,
        connectorExists: Boolean(trafficNodeConnector),
        connectorVertical: connectorX1 != null && connectorX2 != null ? Math.abs(connectorX1 - connectorX2) <= 0.5 : null,
        connectorDepthIntoTrafficPx,
        donutSectorPresent: donutSectors.length > 0,
        donutDiameterPx,
        topClusterLiftPx,
        connectorToDonutOuterTopDiff,
        connectorToDonutRadiusDiff,
        connectorInDonutInnerBounds,
        footfallToCapacityGap,
        assuranceRow1Count: row1Assurances.length,
        assuranceRow2Count: row2Assurances.length,
        assuranceRow3HasCta: Boolean(assuranceCta),
        assuranceRow3ToCtaGap,
      };
    });

    let geometrySource = 'live';
    let geometry = await readGeometry();
    if (!geometry.connectorExists || !geometry.donutSectorPresent || geometry.previewNodeCtaExists !== true) {
      await page.goto(mockUrl, { waitUntil: 'networkidle' });
      geometry = await readGeometry();
      geometrySource = 'mock-fallback';
    }

    alignmentResults.push({ viewport: viewport.name, browser: browserName, geometrySource, ...geometry });
    await page.close();
  }

  await writeFile(
    path.join(screenshotsDir, 'alignment-results.json'),
    `${JSON.stringify(alignmentResults, null, 2)}\n`,
    'utf8',
  );

  const desktopResult = alignmentResults.find((result) => result.viewport === 'desktop');
  if (
    !desktopResult
    || desktopResult.rowCount !== 3
    || desktopResult.heroSubtextIsSeeMore !== true
    || desktopResult.topNavHasDemoCta !== false
    || desktopResult.topNavHasCreateAccountCta !== false
    || desktopResult.titleToSubtextGap == null
    || desktopResult.titleToSubtextGap < 10
    || desktopResult.titleToSubtextGap > 16
    || desktopResult.subtextToCtaGap == null
    || desktopResult.subtextToCtaGap < 40
    || desktopResult.subtextToCtaGap > 48
    || desktopResult.subtextToCtaGap <= desktopResult.titleToSubtextGap
    || desktopResult.ctaOffsetFromHeroTop == null
    || desktopResult.ctaOffsetFromHeroTop < 130
    || desktopResult.heroTitleFontSizePx == null
    || desktopResult.heroTitleFontSizePx < 60
    || desktopResult.heroStatementFontSizePx == null
    || desktopResult.heroStatementFontSizePx < 38
    || desktopResult.heroStatementFontSizePx >= desktopResult.heroTitleFontSizePx
    || desktopResult.headingToRow1 == null
    || desktopResult.subtextToCtaGap == null
    || desktopResult.ctaToMetricsGap == null
    || desktopResult.ctaToMetricsGap < 88
    || desktopResult.ctaToMetricsGap > 96
    || desktopResult.ctaToMetricsGap <= desktopResult.subtextToCtaGap
    || desktopResult.ctaToMetricsGap < Number((previousDesktopCtaToMetricsBaselinePx * 1.2).toFixed(2))
    || desktopResult.subtextToCtaGap <= desktopResult.titleToSubtextGap
    || desktopResult.metricsBottomToPreviewTopGap == null
    || desktopResult.metricsBottomToPreviewTopGap < 34
    || desktopResult.metricsBottomToPreviewTopGap > 58
    || desktopResult.containerToAxisCenterDiffPx == null
    || desktopResult.containerToAxisCenterDiffPx > 1
    || desktopResult.axisCenterDiffPx == null
    || desktopResult.axisCenterDiffPx > 1
    || desktopResult.leftGapToAxisPx == null
    || desktopResult.rightGapToAxisPx == null
    || Math.abs(desktopResult.leftGapToAxisPx - desktopResult.rightGapToAxisPx) > 2
    || desktopResult.bubbleOverlapsAxis !== false
    || desktopResult.headingsCorrect !== true
    || desktopResult.step1LooksLikeText !== true
    || desktopResult.step1IsButton !== true
    || desktopResult.step2HasButton !== false
    || desktopResult.step3HasButton !== false
    || desktopResult.headingToRow1 == null
    || desktopResult.rowGap12 == null
    || desktopResult.rowGap23 == null
    || desktopResult.headingToRow1 < desktopResult.rowGap12 + 6
    || Math.abs(desktopResult.rowGap12 - desktopResult.rowGap23) > 2
    || desktopResult.previewNodeCtaExists !== true
    || desktopResult.previewNodeCtaText !== "Access Demo"
    || desktopResult.connectorExists !== true
    || desktopResult.connectorVertical !== true
    || desktopResult.connectorDepthIntoTrafficPx == null
    || desktopResult.connectorDepthIntoTrafficPx < 0
    || desktopResult.connectorDepthIntoTrafficPx > 20
    || desktopResult.topClusterLiftPx == null
    || desktopResult.topClusterLiftPx < 16
    || (desktopResult.donutSectorPresent === true
      && (desktopResult.connectorToDonutOuterTopDiff == null || desktopResult.connectorToDonutOuterTopDiff > 2
        || desktopResult.connectorToDonutRadiusDiff == null || desktopResult.connectorToDonutRadiusDiff > 2
        || desktopResult.donutDiameterPx == null || desktopResult.donutDiameterPx > 95))
    || desktopResult.connectorInDonutInnerBounds === true
    || desktopResult.footfallToCapacityGap == null
    || desktopResult.footfallToCapacityGap < 4
    || desktopResult.footfallToCapacityGap > 12
    || desktopResult.assuranceRow1Count !== 3
    || desktopResult.assuranceRow2Count !== 2
    || desktopResult.assuranceRow3HasCta !== true
    || desktopResult.assuranceRow3ToCtaGap == null
    || desktopResult.assuranceRow3ToCtaGap > 12
    || desktopResult.hasDwellTime !== false
    || desktopResult.hasRailArtifacts !== false
    || desktopResult.previewHasTopBorder !== false
    || desktopResult.systemSurfaceHasTopBorder !== false
    || desktopResult.assuranceHasTopBorder !== false
  ) {
    throw new Error(`Desktop alignment failed. Results: ${JSON.stringify(alignmentResults)}`);
  }

  await browser.close();
} finally {
  cleanup();
}
