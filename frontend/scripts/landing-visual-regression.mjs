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
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

    await page.locator('.landing-hero').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-hero.png`),
    });

    await page.locator('.landing-system-surface').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-system-band.png`),
    });

    await page.locator('.landing-preview').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-seam-preview.png`),
    });

    const geometry = await page.evaluate(() => {
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
      const headerActionsText = Array.from(document.querySelectorAll('.landing-header-actions button')).map((btn) => btn.textContent?.trim() ?? '');
      const stepOneButton = document.querySelector('.landing-axis-right-action');
      const stepOneButtonRect = stepOneButton?.getBoundingClientRect() ?? null;
      const preview = document.querySelector('.landing-preview');
      const systemSurface = document.querySelector('.landing-system-surface');
      const assuranceMatrix = document.querySelector('.landing-assurance-matrix');
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

      const rows = Array.from(document.querySelectorAll('.landing-axis-roman')).map((roman) => roman.parentElement?.getBoundingClientRect()).filter(Boolean);
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
      const axisCenter = axisContainer ? axisContainer.left + (axisContainer.width / 2) : null;
      const axisHalf = 40;
      const axisRightEdge = axisCenter != null && axisHalf != null ? axisCenter + axisHalf : null;

      return {
        rowCount: rows.length,
        heroSubtextIsSeeMore: heroSubtext === 'See More.',
        titleToSubtextGap,
        subtextToCtaGap,
        ctaOffsetFromHeroTop,
        ctaToMetricsGap,
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
      };
    });

    alignmentResults.push({ viewport: viewport.name, browser: browserName, ...geometry });
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
    || desktopResult.titleToSubtextGap < 16
    || desktopResult.titleToSubtextGap > 24
    || desktopResult.subtextToCtaGap == null
    || desktopResult.subtextToCtaGap < 28
    || desktopResult.subtextToCtaGap > 40
    || desktopResult.subtextToCtaGap <= desktopResult.titleToSubtextGap
    || desktopResult.ctaOffsetFromHeroTop == null
    || desktopResult.ctaOffsetFromHeroTop < 130
    || desktopResult.headingToRow1 == null
    || desktopResult.subtextToCtaGap == null
    || desktopResult.ctaToMetricsGap == null
    || desktopResult.ctaToMetricsGap < 52
    || desktopResult.ctaToMetricsGap > 60
    || desktopResult.ctaToMetricsGap > Number((previousDesktopCtaToMetricsBaselinePx * 0.8).toFixed(2))
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
