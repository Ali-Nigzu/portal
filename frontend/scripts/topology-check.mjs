import { chromium } from 'playwright';

const baseUrl = process.env.TOPOLOGY_BASE_URL ?? 'http://127.0.0.1:3000';
const targetUrl = `${baseUrl}/?topologyMock=1`;

const expectedDirections = {
  entrances: 'toNode',
  exits: 'toNode',
  occupancy: 'fromNode',
  traffic: 'fromNode',
  dwell: 'fromNode',
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runForViewport = async (page, width, height, screenshotPath) => {
  await page.setViewportSize({ width, height });
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-topology-mock="true"]');
  await page.waitForSelector('line[data-testid="topology-bus"]', { state: 'attached' });

  const geometry = await page.evaluate(() => {
    const bus = document.querySelector('line[data-testid="topology-bus"]');
    if (!bus) throw new Error('missing topology bus line');
    const connectors = Array.from(document.querySelectorAll('line[data-route-id]')).map((el) => ({
      routeId: el.getAttribute('data-route-id') ?? '',
      x1: Number(el.getAttribute('x1') ?? 0),
      y1: Number(el.getAttribute('y1') ?? 0),
      x2: Number(el.getAttribute('x2') ?? 0),
      y2: Number(el.getAttribute('y2') ?? 0),
    }));

    const routes = Array.from(document.querySelectorAll('path[data-route-id]')).map((el) => ({
      routeId: el.getAttribute('data-route-id') ?? '',
      direction: el.getAttribute('data-direction') ?? '',
    }));

    const busX1 = Number(bus.getAttribute('x1') ?? 0);
    const busX2 = Number(bus.getAttribute('x2') ?? 0);

    const edgeDistances = connectors
      .filter((c) => c.routeId === 'traffic' || c.routeId === 'dwell')
      .map((connector) => {
        const anchor = document.querySelector(`[data-anchor-id="bottom-${connector.routeId}"]`);
        if (!anchor) {
          return { routeId: connector.routeId, distancePx: Number.POSITIVE_INFINITY };
        }
        const lineY = connector.y1;
        const anchorRect = anchor.getBoundingClientRect();
        const canvasRect = anchor.closest('[data-topology-mock]')?.getBoundingClientRect();
        if (!canvasRect) {
          return { routeId: connector.routeId, distancePx: Number.POSITIVE_INFINITY };
        }
        const anchorCenterY = anchorRect.top - canvasRect.top + anchorRect.height / 2;
        return { routeId: connector.routeId, distancePx: Math.abs(lineY - anchorCenterY) };
      });

    return { busX1, busX2, connectors, routes, edgeDistances };
  });

  const tapXs = geometry.connectors.map((c) => c.x1);
  const minTap = Math.min(...tapXs);
  const maxTap = Math.max(...tapXs);
  assert(Math.abs(geometry.busX1 - minTap) < 0.5, `busX1 mismatch at ${width}px: ${geometry.busX1} vs ${minTap}`);
  assert(Math.abs(geometry.busX2 - maxTap) < 0.5, `busX2 mismatch at ${width}px: ${geometry.busX2} vs ${maxTap}`);

  for (const { routeId, distancePx } of geometry.edgeDistances) {
    assert(distancePx <= 6, `${routeId} connector is not terminating at card edge (distance ${distancePx.toFixed(2)}px)`);
  }

  for (const route of geometry.routes) {
    const expected = expectedDirections[route.routeId];
    assert(expected === route.direction, `direction mismatch for ${route.routeId}: expected ${expected}, got ${route.direction}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await runForViewport(page, 1440, 1100, 'artifacts/topology-1440.png');
  await runForViewport(page, 1024, 1000, 'artifacts/topology-1024.png');
  console.log('Topology verification passed at 1440 and 1024.');
} finally {
  await browser.close();
}
