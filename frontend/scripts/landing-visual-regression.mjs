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
      const capabilitiesColumn = document.querySelector('.landing-capabilities')?.getBoundingClientRect();
      const deploymentAnchor = document.querySelector('[data-align-anchor="deployment"]')?.getBoundingClientRect();

      const stepOne = document.querySelector('.landing-deployment-step--one')?.getBoundingClientRect();
      const stepTwo = document.querySelector('.landing-deployment-step--two')?.getBoundingClientRect();
      const stepThree = document.querySelector('.landing-deployment-step--three')?.getBoundingClientRect();
      const deploymentStyle = document.querySelector('.landing-deployment-content')
        ? getComputedStyle(document.querySelector('.landing-deployment-content'))
        : null;
      const deployXStep = deploymentStyle ? Number.parseFloat(deploymentStyle.getPropertyValue('--deploy-x-step')) : null;

      return {
        capabilityBottom: lastRow ? Number(lastRow.bottom.toFixed(2)) : null,
        deploymentBottom: deploymentGroup ? Number(deploymentGroup.bottom.toFixed(2)) : null,
        rowToDeploymentDiffPx:
          lastRow && deploymentGroup ? Number(Math.abs(lastRow.bottom - deploymentGroup.bottom).toFixed(2)) : null,
        panelBottomDiffPx:
          capabilitiesAnchor && deploymentAnchor
            ? Number(Math.abs(capabilitiesAnchor.bottom - deploymentAnchor.bottom).toFixed(2))
            : null,
        stepOneLeft: stepOne ? Number(stepOne.left.toFixed(2)) : null,
        stepTwoLeft: stepTwo ? Number(stepTwo.left.toFixed(2)) : null,
        stepThreeLeft: stepThree ? Number(stepThree.left.toFixed(2)) : null,
        step1Step3DiffPx:
          stepOne && stepThree ? Number(Math.abs(stepOne.left - stepThree.left).toFixed(2)) : null,
        step2OffsetFromStep1Px:
          stepOne && stepTwo ? Number((stepTwo.left - stepOne.left).toFixed(2)) : null,
        deployXStep,
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
    || desktopResult.rowToDeploymentDiffPx == null
    || desktopResult.panelBottomDiffPx == null
    || desktopResult.step1Step3DiffPx == null
    || desktopResult.step2OffsetFromStep1Px == null
    || desktopResult.deployXStep == null
    || desktopResult.rowToDeploymentDiffPx > 2
    || desktopResult.panelBottomDiffPx > 2
    || desktopResult.step1Step3DiffPx > 2
    || desktopResult.step2OffsetFromStep1Px < 120
    || desktopResult.capabilitiesCenterOffsetPx == null
    || desktopResult.capabilitiesCenterOffsetPx > 5
  ) {
    throw new Error(`Desktop alignment failed. Results: ${JSON.stringify(alignmentResults)}`);
  }

  await browser.close();
} finally {
  cleanup();
}
