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
      const lastRow = document.querySelector('.landing-capability-row:last-child')?.getBoundingClientRect();
      const deploymentGroup = document.querySelector('.landing-deployment-zigzag')?.getBoundingClientRect();
      const capabilitiesAnchor = document.querySelector('[data-align-anchor="capabilities"]')?.getBoundingClientRect();
      const deploymentAnchor = document.querySelector('[data-align-anchor="deployment"]')?.getBoundingClientRect();

      return {
        capabilityBottom: lastRow ? Number(lastRow.bottom.toFixed(2)) : null,
        deploymentBottom: deploymentGroup ? Number(deploymentGroup.bottom.toFixed(2)) : null,
        rowToDeploymentDiffPx:
          lastRow && deploymentGroup ? Number(Math.abs(lastRow.bottom - deploymentGroup.bottom).toFixed(2)) : null,
        panelBottomDiffPx:
          capabilitiesAnchor && deploymentAnchor
            ? Number(Math.abs(capabilitiesAnchor.bottom - deploymentAnchor.bottom).toFixed(2))
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
    || desktopResult.rowToDeploymentDiffPx == null
    || desktopResult.panelBottomDiffPx == null
    || desktopResult.rowToDeploymentDiffPx > 2
    || desktopResult.panelBottomDiffPx > 2
  ) {
    throw new Error(`Desktop alignment failed. Results: ${JSON.stringify(alignmentResults)}`);
  }

  await browser.close();
} finally {
  cleanup();
}
