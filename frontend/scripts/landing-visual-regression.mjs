import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  for (const viewport of viewports) {
    const page = await context.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    const target = page.locator('.landing-system-surface');
    await access(path.join(rootDir, 'src', 'styles', 'LandingPage.css'), constants.F_OK);
    await target.screenshot({ path: path.join(screenshotsDir, `${viewport.name}-system-surface.png`) });
    await page.close();
  }

  await browser.close();
} finally {
  cleanup();
}
