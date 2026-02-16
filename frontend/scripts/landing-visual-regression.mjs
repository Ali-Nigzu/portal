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

    await page.locator('.landing-system-surface').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-system-band.png`),
    });

    await page.locator('.landing-preview').screenshot({
      path: path.join(screenshotsDir, `${viewport.name}-seam-preview.png`),
    });

    const geometry = await page.evaluate(() => {
      const capabilityRows = Array.from(document.querySelectorAll('.landing-capability-row')).map((row) => row.getBoundingClientRect());
      const deploymentRows = {
        one: document.querySelector('.landing-deployment-row--one')?.getBoundingClientRect(),
        two: document.querySelector('.landing-deployment-row--two')?.getBoundingClientRect(),
        three: document.querySelector('.landing-deployment-row--three')?.getBoundingClientRect(),
      };
      const capabilitiesAnchor = document.querySelector('[data-align-anchor="capabilities"]')?.getBoundingClientRect();
      const capabilitiesColumn = document.querySelector('.landing-capabilities')?.getBoundingClientRect();
      const deploymentAnchor = document.querySelector('[data-align-anchor="deployment"]')?.getBoundingClientRect();

      const midpoint = (a, b) => Number((((a + b) / 2)).toFixed(2));
      const centerY = (rect) => (rect ? Number((rect.top + (rect.height / 2)).toFixed(2)) : null);

      const gap1Mid = capabilityRows.length >= 2 ? midpoint(capabilityRows[0].bottom, capabilityRows[1].top) : null;
      const gap2Mid = capabilityRows.length >= 3 ? midpoint(capabilityRows[1].bottom, capabilityRows[2].top) : null;
      const gap3Mid = capabilityRows.length >= 4 ? midpoint(capabilityRows[2].bottom, capabilityRows[3].top) : null;

      const step1CenterY = centerY(deploymentRows.one);
      const step2CenterY = centerY(deploymentRows.two);
      const step3CenterY = centerY(deploymentRows.three);

      const step1Button = document.querySelector('.landing-deployment-row--one .landing-deployment-step-button');
      const step2Button = document.querySelector('.landing-deployment-row--two .landing-deployment-step-button');
      const step3Button = document.querySelector('.landing-deployment-row--three .landing-deployment-step-button');

      return {
        capabilityBottom: capabilityRows.length ? Number(capabilityRows[capabilityRows.length - 1].bottom.toFixed(2)) : null,
        deploymentBottom: deploymentRows.three ? Number(deploymentRows.three.bottom.toFixed(2)) : null,
        rowToDeploymentDiffPx:
          capabilityRows.length && deploymentRows.three
            ? Number(Math.abs(capabilityRows[capabilityRows.length - 1].bottom - deploymentRows.three.bottom).toFixed(2))
            : null,
        panelBottomDiffPx:
          capabilitiesAnchor && deploymentAnchor
            ? Number(Math.abs(capabilitiesAnchor.bottom - deploymentAnchor.bottom).toFixed(2))
            : null,
        gap1Mid,
        gap2Mid,
        gap3Mid,
        step1CenterY,
        step2CenterY,
        step3CenterY,
        step1GapMidDiffPx: gap1Mid != null && step1CenterY != null ? Number(Math.abs(step1CenterY - gap1Mid).toFixed(2)) : null,
        step2GapMidDiffPx: gap2Mid != null && step2CenterY != null ? Number(Math.abs(step2CenterY - gap2Mid).toFixed(2)) : null,
        step3GapMidDiffPx: gap3Mid != null && step3CenterY != null ? Number(Math.abs(step3CenterY - gap3Mid).toFixed(2)) : null,
        step1IsButton: step1Button instanceof HTMLButtonElement,
        step2HasButton: Boolean(step2Button),
        step3HasButton: Boolean(step3Button),
        hasRailArtifacts: Boolean(document.querySelector('.landing-deployment-spine, .landing-deployment-rail, .landing-deployment-stem')),
        capabilitiesCenterOffsetPx:
          capabilitiesAnchor && capabilitiesColumn
            ? Number(Math.abs((capabilitiesAnchor.left + (capabilitiesAnchor.width / 2)) - (capabilitiesColumn.left + (capabilitiesColumn.width / 2))).toFixed(2))
            : null,
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
    || desktopResult.panelBottomDiffPx == null
    || desktopResult.step1GapMidDiffPx == null
    || desktopResult.step2GapMidDiffPx == null
    || desktopResult.step3GapMidDiffPx == null
    || desktopResult.panelBottomDiffPx > 2
    || desktopResult.step1GapMidDiffPx > 16
    || desktopResult.step2GapMidDiffPx > 16
    || desktopResult.step3GapMidDiffPx > 16
    || desktopResult.step1IsButton !== true
    || desktopResult.step2HasButton !== false
    || desktopResult.step3HasButton !== false
    || desktopResult.hasRailArtifacts !== false
    || desktopResult.capabilitiesCenterOffsetPx == null
    || desktopResult.capabilitiesCenterOffsetPx > 5
  ) {
    throw new Error(`Desktop alignment failed. Results: ${JSON.stringify(alignmentResults)}`);
  }

  await browser.close();
} finally {
  cleanup();
}
