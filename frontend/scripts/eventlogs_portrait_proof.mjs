import { chromium, devices } from 'playwright';
import fs from 'fs';

const OUT_DIR = '/tmp/eventlogs-proof';
fs.mkdirSync(OUT_DIR, { recursive: true });

const FIXTURES = {
  nominal: {
    events: Array.from({ length: 12 }).map((_, i) => ({
      index: i + 1,
      event: i % 2 === 0 ? 'entry' : 'exit',
      track_number: `T-${1000 + i}`,
      cam_id: i % 3,
      timestamp: `2026-05-20T12:${String((10 + i) % 60).padStart(2, '0')}:00Z`,
      sex: i % 2 === 0 ? 'male' : 'female',
      age_bucket: '3',
      race: '1',
    })),
    total_pages: 1,
    total: 12,
  },
  stress: {
    events: Array.from({ length: 12 }).map((_, i) => ({
      index: i + 1,
      event: i % 2 === 0 ? 'entry' : 'exit',
      track_number: `TRACK-EXTREMELY-LONG-ID-${i}-ABCDEFGHIJKLMNOPQRSTUVWXYZ`,
      cam_id: i % 3,
      timestamp: `2026-05-20T12:${String((10 + i) % 60).padStart(2, '0')}:00.123456Z`,
      sex: i % 2 === 0 ? 'male' : 'female',
      age_bucket: '3',
      race: '1',
    })),
    total_pages: 1,
    total: 12,
  },
  edge: {
    events: Array.from({ length: 12 }).map((_, i) => ({
      index: i + 1,
      event: i % 2 === 0 ? 'entry' : 'exit',
      track_number: i % 2 === 0 ? null : `${900 + i}`,
      track_id: i % 2 === 0 ? `${700 + i}` : undefined,
      camera_id: i % 3,
      timestamp: `2026-05-20T12:${String((10 + i) % 60).padStart(2, '0')}:00Z`,
      sex: i % 3 === 0 ? null : i % 2 === 0 ? 'm' : 'f',
      age_estimate: i % 4,
      race: i % 3,
    })),
    total_pages: 1,
    total: 12,
  },
};

const TOL = { global: 8, filter: 8, align: 2, reach: 24 };

function pick(node, extra = {}) {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  const s = getComputedStyle(node);
  return {
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    box: {
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      offsetWidth: node.offsetWidth,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    },
    style: {
      display: s.display,
      position: s.position,
      overflowX: s.overflowX,
      overflowY: s.overflowY,
      width: s.width,
      minWidth: s.minWidth,
      maxWidth: s.maxWidth,
      flexBasis: s.flexBasis,
      flexGrow: s.flexGrow,
      flexShrink: s.flexShrink,
      gridTemplateColumns: s.gridTemplateColumns,
      contain: s.contain,
      transform: s.transform,
      tableLayout: s.tableLayout,
      borderCollapse: s.borderCollapse,
    },
    ...extra,
  };
}

async function collect(page, phase) {
  return page.evaluate((phase) => {
    const q = (sel) => document.querySelector(sel);
    const chain = (sel) => {
      const start = q(sel);
      const out = [];
      let el = start;
      while (el && out.length < 20) {
        out.push({
          tag: el.tagName,
          className: el.className,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          overflowX: getComputedStyle(el).overflowX,
          minWidth: getComputedStyle(el).minWidth,
          display: getComputedStyle(el).display,
          flexShrink: getComputedStyle(el).flexShrink,
          flexBasis: getComputedStyle(el).flexBasis,
          gridTemplateColumns: getComputedStyle(el).gridTemplateColumns,
          contain: getComputedStyle(el).contain,
          transform: getComputedStyle(el).transform,
        });
        el = el.parentElement;
      }
      return out;
    };

    const pickNode = (sel) => {
      const node = q(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return {
        selector: sel,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
        box: { clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, offsetWidth: node.offsetWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight },
        style: {
          display: s.display, position: s.position, overflowX: s.overflowX, overflowY: s.overflowY,
          width: s.width, minWidth: s.minWidth, maxWidth: s.maxWidth,
          flexBasis: s.flexBasis, flexGrow: s.flexGrow, flexShrink: s.flexShrink,
          gridTemplateColumns: s.gridTemplateColumns, contain: s.contain, transform: s.transform,
          tableLayout: s.tableLayout, borderCollapse: s.borderCollapse,
        },
      };
    };

    const ths = [...document.querySelectorAll('.event-logs-results-table thead th')].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width, right: r.right };
    });
    const row = document.querySelector('.event-logs-results-table tbody tr');
    const tds = row ? [...row.querySelectorAll('td')].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width, right: r.right };
    }) : [];

    const tableScroll = document.querySelector('.event-logs-table-scroll');
    const rightCell = row ? row.querySelector('td:last-child') : null;
    const rightCellRect = rightCell ? rightCell.getBoundingClientRect() : null;
    const tsRect = tableScroll ? tableScroll.getBoundingClientRect() : null;
    const intersect = rightCellRect && tsRect
      ? Math.max(0, Math.min(rightCellRect.right, tsRect.right) - Math.max(rightCellRect.left, tsRect.left))
      : 0;

    return {
      phase,
      mounted: document.querySelectorAll('.event-logs-results-table tbody tr').length > 0,
      rows: document.querySelectorAll('.event-logs-results-table tbody tr').length,
      global: {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
          scale: window.visualViewport.scale,
        } : null,
        doc: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
        body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth },
      },
      nodes: {
        vrmMain: pickNode('.vrm-main'),
        vrmMainLane: pickNode('.vrm-main--mobile-lane'),
        vrmContent: pickNode('.vrm-content'),
        vrmContentLane: pickNode('.vrm-content--mobile-lane'),
        eventLogsPage: pickNode('.event-logs-page'),
        filterCard: pickNode('.event-logs-filters-card'),
        filterGrid: pickNode('.event-logs-filter-grid'),
        tableCardBody: pickNode('.event-logs-page .vrm-card-body--flush'),
        tableScroll: pickNode('.event-logs-table-scroll'),
        table: pickNode('.event-logs-results-table'),
      },
      table: { ths, tds, rightIntersection: intersect },
      chains: {
        filterGrid: chain('.event-logs-filter-grid'),
        tableScroll: chain('.event-logs-table-scroll'),
        table: chain('.event-logs-results-table'),
      },
    };
  }, phase);
}

function check(report) {
  const pre = report.PRE_SEARCH;
  const post = report.POST_SEARCH_MOUNTED;
  const hs = report.POST_HSCROLL_RIGHT;
  const fail = [];

  if (!post.mounted || post.rows <= 0) fail.push('mounted-state-missing');
  const dDoc = post.global.doc.scrollWidth - pre.global.doc.scrollWidth;
  const dBody = post.global.body.scrollWidth - pre.global.body.scrollWidth;
  if (Math.max(dDoc, dBody) > TOL.global) fail.push(`global-width-drift:${dDoc}/${dBody}`);

  const preF = pre.nodes.filterCard?.rect.width ?? 0;
  const postF = post.nodes.filterCard?.rect.width ?? 0;
  if (Math.abs(postF - preF) > TOL.filter) fail.push(`filter-width-drift:${postF - preF}`);

  const ts = post.nodes.tableScroll;
  if (!ts || ts.box.scrollWidth - ts.box.clientWidth <= 0) fail.push('no-local-overflow-on-wrapper');

  const hsTs = hs.nodes.tableScroll;
  if (!hsTs || hsTs.box.scrollWidth - hsTs.box.clientWidth <= 0) fail.push('no-hscroll-range-post-hscroll');

  if ((hs.table.rightIntersection ?? 0) < TOL.reach) fail.push(`right-side-unreachable:${hs.table.rightIntersection}`);

  const ths = hs.table.ths || [];
  const tds = hs.table.tds || [];
  if (ths.length && tds.length && ths.length === tds.length) {
    for (let i = 0; i < ths.length; i += 1) {
      if (Math.abs(ths[i].left - tds[i].left) > TOL.align || Math.abs(ths[i].width - tds[i].width) > TOL.align) {
        fail.push(`align-col-${i}`);
      }
    }
  }

  // first invalid owner: first ancestor above wrapper with horizontal overflow
  const chain = post.chains.tableScroll || [];
  let firstInvalidOwner = null;
  for (let i = 1; i < chain.length; i += 1) {
    const c = chain[i];
    if ((c.scrollWidth - c.clientWidth) > 2) { firstInvalidOwner = c; break; }
  }

  return { pass: fail.length === 0, fail, firstInvalidOwner, deltas: { dDoc, dBody, dFilter: postF - preF } };
}

async function runViewport(name, contextOptions, fixtureName) {
  const fixture = FIXTURES[fixtureName];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);

  await context.addInitScript(() => {
    window.sessionStorage.setItem('camOS_demo_session', 'true');
  });

  await context.route('**/api/events/search*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/demo/site-b/dashboard', { waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('link', { name: /Event Logs/i });
  if (await nav.count()) await nav.first().click();
  await page.waitForTimeout(1200);
  if (!page.url().includes('/event-logs')) {
    await page.goto('http://127.0.0.1:3000/demo/site-b/event-logs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
  }

  const PRE = await collect(page, 'PRE_SEARCH');
  const searchBtn = page.locator('button.vrm-btn-primary:has-text("Search")');
  await searchBtn.first().click();
  await page.waitForFunction(() => document.querySelectorAll('.event-logs-results-table tbody tr').length > 0, { timeout: 10000 });
  const POST = await collect(page, 'POST_SEARCH_MOUNTED');

  await page.evaluate(() => {
    const el = document.querySelector('.event-logs-table-scroll');
    if (el) el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(100);
  const HSC = await collect(page, 'POST_HSCROLL_RIGHT');

  await page.screenshot({ path: `${OUT_DIR}/${name}-${fixtureName}-post.png`, fullPage: true });
  const report = { PRE_SEARCH: PRE, POST_SEARCH_MOUNTED: POST, POST_HSCROLL_RIGHT: HSC };
  const verdict = check(report);
  fs.writeFileSync(`${OUT_DIR}/${name}-${fixtureName}.json`, JSON.stringify({ report, verdict }, null, 2));

  await browser.close();
  return verdict;
}

async function main() {
  const results = [];
  results.push(['portrait', 'nominal', await runViewport('portrait', devices['iPhone 12'], 'nominal')]);
  results.push(['portrait', 'stress', await runViewport('portrait', devices['iPhone 12'], 'stress')]);
  results.push(['portrait', 'edge', await runViewport('portrait', devices['iPhone 12'], 'edge')]);
  results.push(['landscape', 'nominal', await runViewport('landscape', devices['iPhone 12 landscape'], 'nominal')]);
  results.push(['desktop', 'nominal', await runViewport('desktop', { viewport: { width: 1440, height: 900 } }, 'nominal')]);
  fs.writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(results, null, 2));

  const anyFail = results.some(([, , v]) => !v.pass);
  if (anyFail) process.exitCode = 2;
}

main();
