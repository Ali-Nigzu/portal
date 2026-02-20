import { chromium } from 'playwright';

const baseUrl = process.env.TOPOLOGY_BASE_URL ?? 'http://127.0.0.1:3000';
const targetUrl = `${baseUrl}/`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const within = (value, target, tolerance) => Math.abs(value - target) <= tolerance;

const captureTrafficGeometry = async (page) => {
  await page.waitForSelector('line[data-route-id="traffic"]', { timeout: 30000 });
  await page.waitForSelector('[data-traffic-donut-center]', { timeout: 30000 });
  await page.waitForSelector('[data-traffic-donut-north]', { timeout: 30000 });

  return page.evaluate(() => {
    const connector = document.querySelector('line[data-route-id="traffic"]');
    const center = document.querySelector('[data-traffic-donut-center]');
    const north = document.querySelector('[data-traffic-donut-north]');
    if (!connector || !center || !north) {
      throw new Error('missing connector or donut anchors');
    }
    const centerRect = center.getBoundingClientRect();
    const northRect = north.getBoundingClientRect();
    const cx = centerRect.left + centerRect.width / 2;
    const cy = centerRect.top + centerRect.height / 2;
    const nx = northRect.left + northRect.width / 2;
    const ny = northRect.top + northRect.height / 2;
    const r = Math.hypot(nx - cx, ny - cy);

    const sectors = Array.from(document.querySelectorAll('.traffic-distribution .recharts-sector'));
    const fills = sectors.map((el) => (el.getAttribute('fill') ?? '').trim()).filter(Boolean);
    const distinctFills = new Set(fills);

    return {
      connector: {
        x1: Number(connector.getAttribute('x1') ?? 0),
        y1: Number(connector.getAttribute('y1') ?? 0),
        x2: Number(connector.getAttribute('x2') ?? 0),
        y2: Number(connector.getAttribute('y2') ?? 0),
      },
      donut: { cx, cy, r, nx, ny },
      segmentCount: sectors.length,
      distinctFillCount: distinctFills.size,
      unavailableText: document.body.textContent?.includes('Traffic Split data unavailable.') ?? false,
    };
  });
};

const verifyGeometry = (geometry) => {
  const xEnd = geometry.connector.x1;
  const yEnd = geometry.connector.y1;
  assert(within(geometry.connector.x1, geometry.connector.x2, 0.5), 'traffic connector is not vertical');
  assert(within(xEnd, geometry.donut.cx, 2), `traffic endpoint x mismatch: ${xEnd} vs ${geometry.donut.cx}`);
  const radialDistance = Math.hypot(xEnd - geometry.donut.cx, yEnd - geometry.donut.cy);
  assert(within(radialDistance, geometry.donut.r, 2), `traffic endpoint not on ring: ${radialDistance} vs ${geometry.donut.r}`);
  assert(yEnd < geometry.donut.cy, 'traffic endpoint is not above center (true north contact failed)');
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  const demoGeometry = await captureTrafficGeometry(page);
  verifyGeometry(demoGeometry);
  assert(demoGeometry.segmentCount >= 2, `expected >=2 traffic segments, got ${demoGeometry.segmentCount}`);
  assert(demoGeometry.distinctFillCount >= 2, `expected >=2 distinct segment fills, got ${demoGeometry.distinctFillCount}`);
  assert(!demoGeometry.unavailableText, 'demo mode rendered unavailable state');
  await page.screenshot({ path: 'artifacts/landing-traffic-demo.png', fullPage: true });

  const contextMissing = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await contextMissing.route('**/api/snapshots/latest**', async (route) => {
    const payload = {
      ts: new Date().toISOString(),
      payload: [
        [120, 122], [88, 89], [101, 97], [220, 225], [16, 17], [66, 83], [], [[]],
      ],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const pageMissing = await contextMissing.newPage();
  await pageMissing.goto(targetUrl, { waitUntil: 'networkidle' });
  await pageMissing.waitForSelector('text=Traffic Split data unavailable.', { timeout: 30000 });
  await pageMissing.screenshot({ path: 'artifacts/landing-traffic-missing.png', fullPage: true });

  console.log('Topology verification passed.', JSON.stringify({ demoGeometry }));
  await contextMissing.close();
  await context.close();
  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
