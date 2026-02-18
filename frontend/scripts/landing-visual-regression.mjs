import { chromium, firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(process.cwd());
const screenshotsDir = path.join(rootDir, 'artifacts', 'landing-visual');

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
      const axisRows = Array.from(document.querySelectorAll('.landing-axis-row')).map((row) => row.getBoundingClientRect());
      const axisContainer = document.querySelector('.landing-axis-row-matrix')?.getBoundingClientRect();
      const landingContainer = document.querySelector('.landing-spec-sheet .landing-container')?.getBoundingClientRect();
      const firstRoman = document.querySelector('.landing-axis-row .landing-axis-roman')?.getBoundingClientRect();
      const firstLeftElement = document.querySelector('.landing-axis-row:nth-child(2) .landing-axis-left');
      const firstRightElement = document.querySelector('.landing-axis-row:nth-child(2) .landing-axis-right');
      const stepOneButton = document.querySelector('.landing-axis-row:nth-child(1) .landing-axis-right-action');
      const stepOneButtonRect = stepOneButton?.getBoundingClientRect() ?? null;
      const preview = document.querySelector('.landing-preview');
      const firstHeadingText = document.querySelector('#capabilities-title')?.textContent?.trim() ?? null;
      const secondHeadingText = document.querySelector('#deployment-title')?.textContent?.trim() ?? null;

      const stepTwoButton = document.querySelector('.landing-axis-row:nth-child(2) .landing-deployment-step-button');
      const stepThreeButton = document.querySelector('.landing-axis-row:nth-child(3) .landing-deployment-step-button');
      const stepTwoText = document.querySelector('.landing-axis-row:nth-child(2) .landing-axis-right');

      const stepOneStyles = stepOneButton ? getComputedStyle(stepOneButton) : null;
      const stepTwoStyles = stepTwoText ? getComputedStyle(stepTwoText) : null;

      const leftTexts = Array.from(document.querySelectorAll('.landing-axis-left')).map((el) => el.textContent?.trim() ?? '');
      const rightTexts = Array.from(document.querySelectorAll('.landing-axis-right')).map((el) => el.textContent?.trim() ?? '');

      const rowCenter = (row) => Number((row.top + (row.height / 2)).toFixed(2));
      const midpoint = (a, b) => Number((((a + b) / 2)).toFixed(2));

      const row1Center = axisRows[0] ? rowCenter(axisRows[0]) : null;
      const row2Center = axisRows[1] ? rowCenter(axisRows[1]) : null;
      const row3Center = axisRows[2] ? rowCenter(axisRows[2]) : null;

      const gap12Mid = row1Center != null && row2Center != null ? midpoint(row1Center, row2Center) : null;
      const gap23Mid = row2Center != null && row3Center != null ? midpoint(row2Center, row3Center) : null;
      const axisCenter = axisContainer ? axisContainer.left + (axisContainer.width / 2) : null;
      const axisHalf = 40;
      const axisRightEdge = axisCenter != null && axisHalf != null ? axisCenter + axisHalf : null;

      return {
        rowCount: axisRows.length,
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
        hasRailArtifacts: Boolean(document.querySelector('.landing-deployment-spine, .landing-deployment-rail, .landing-deployment-stem')),
        previewHasTopBorder: preview ? getComputedStyle(preview).borderTopWidth !== '0px' : null,
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
    || desktopResult.hasDwellTime !== false
    || desktopResult.hasRailArtifacts !== false
    || desktopResult.previewHasTopBorder !== false
  ) {
    throw new Error(`Desktop alignment failed. Results: ${JSON.stringify(alignmentResults)}`);
  }

  await browser.close();
} finally {
  cleanup();
}
