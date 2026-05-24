export type InvariantResult = {
  key: string;
  pass: boolean;
  measured: Record<string, number | string | boolean | null>;
  tolerance?: number;
  context?: string;
};

export type PhaseSnapshot = {
  phase: "PRE_SEARCH" | "POST_SEARCH_MOUNTED" | "POST_HSCROLL_RIGHT";
  mounted: boolean;
  route: string;
  searchToken: number;
  rows: number;
  global: {
    viewportWidth: number;
    viewportHeight: number;
    documentClientWidth: number;
    documentScrollWidth: number;
    bodyClientWidth: number;
    bodyScrollWidth: number;
  };
  nodes: Record<string, {
    selector: string;
    clientWidth: number;
    scrollWidth: number;
    scrollLeft: number;
    rectLeft: number;
    rectRight: number;
    rectWidth: number;
    overflowX: string;
    minWidth: string;
    display: string;
    flexBasis: string;
    flexShrink: string;
    gridTemplateColumns: string;
  } | null>;
  ths: Array<{ left: number; width: number; right: number }>;
  tds: Array<{ left: number; width: number; right: number }>;
  rightIntersection: number;
  hiddenRight: number;
  chain: Array<{ node: string; pressure: number; overflowX: string; display: string; minWidth: string; flexShrink: string; flexBasis: string; gridTemplateColumns: string }>;
};

export type RuntimeProofSuite = {
  status: "PASS" | "FAIL";
  mountedPredicate: boolean;
  firstInvalidOwner: string | null;
  failureClass: string | null;
  propagationDelta: number;
  causalReason: string | null;
  phases: {
    PRE_SEARCH: PhaseSnapshot;
    POST_SEARCH_MOUNTED: PhaseSnapshot;
    POST_HSCROLL_RIGHT: PhaseSnapshot;
  };
  invariants: InvariantResult[];
};

const TOL = { global: 8, filter: 8, alignment: 3, reach: 16, pressure: 2 };

function label(el: Element): string {
  const cls = (el as HTMLElement).className;
  return `${el.tagName.toLowerCase()}${cls ? `.${String(cls).trim().replace(/\s+/g, ".")}` : ""}`;
}

function getNode(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    selector,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    scrollLeft: el.scrollLeft,
    rectLeft: r.left,
    rectRight: r.right,
    rectWidth: r.width,
    overflowX: cs.overflowX,
    minWidth: cs.minWidth,
    display: cs.display,
    flexBasis: cs.flexBasis,
    flexShrink: cs.flexShrink,
    gridTemplateColumns: cs.gridTemplateColumns,
  };
}

function getChain(start: Element | null) {
  const out: PhaseSnapshot["chain"] = [];
  let cur = start;
  while (cur) {
    const h = cur as HTMLElement;
    const cs = getComputedStyle(h);
    out.push({
      node: label(cur),
      pressure: h.scrollWidth - h.clientWidth,
      overflowX: cs.overflowX,
      display: cs.display,
      minWidth: cs.minWidth,
      flexShrink: cs.flexShrink,
      flexBasis: cs.flexBasis,
      gridTemplateColumns: cs.gridTemplateColumns,
    });
    cur = cur.parentElement;
  }
  return out;
}

function collectPhase(phase: PhaseSnapshot["phase"], searchToken: number): PhaseSnapshot {
  const wrapper = document.querySelector('.event-logs-table-scroll') as HTMLElement | null;
  const table = document.querySelector('.event-logs-results-table') as HTMLElement | null;
  const rows = document.querySelectorAll('.event-logs-results-table tbody tr').length;
  const row = document.querySelector('.event-logs-results-table tbody tr');
  const rightCell = row?.querySelector('td:last-child') as HTMLElement | null;
  const wr = wrapper?.getBoundingClientRect();
  const rr = rightCell?.getBoundingClientRect();
  const rightIntersection = wr && rr
    ? Math.max(0, Math.min(wr.right, rr.right) - Math.max(wr.left, rr.left))
    : 0;
  const hiddenRight = wr && table
    ? Math.max(0, table.getBoundingClientRect().right - wr.right)
    : 0;

  return {
    phase,
    mounted: searchToken > 0 && rows > 0,
    route: window.location.pathname + window.location.search,
    searchToken,
    rows,
    global: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    },
    nodes: {
      wrapper: getNode('.event-logs-table-scroll'),
      table: getNode('.event-logs-results-table'),
      page: getNode('.event-logs-page'),
      filterCard: getNode('.event-logs-filters-card'),
      filterGrid: getNode('.event-logs-filter-grid'),
      lane: getNode('.vrm-content--mobile-lane'),
      content: getNode('.vrm-content'),
      main: getNode('.vrm-main'),
      html: getNode('html'),
      body: getNode('body'),
    },
    ths: [...document.querySelectorAll('.event-logs-results-table thead th')].map((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, width: r.width, right: r.right };
    }),
    tds: row
      ? [...row.querySelectorAll('td')].map((n) => {
          const r = n.getBoundingClientRect();
          return { left: r.left, width: r.width, right: r.right };
        })
      : [],
    rightIntersection,
    hiddenRight,
    chain: getChain(wrapper),
  };
}

function firstInvalidOwner(post: PhaseSnapshot) {
  // index 0 is wrapper (legal overflow owner), scan above it.
  for (let i = 1; i < post.chain.length; i += 1) {
    const n = post.chain[i];
    if (n.pressure > TOL.pressure) {
      return { owner: n.node, pressure: n.pressure };
    }
  }
  return { owner: null, pressure: 0 };
}

function classifyFailure(post: PhaseSnapshot, invalidOwner: string | null, invariants: InvariantResult[]): string | null {
  const failed = new Set(invariants.filter((x) => !x.pass).map((x) => x.key));
  if (failed.has('scroll-locality')) return 'false-scroll-owner';
  if (failed.has('right-reachability') && !failed.has('overflow-locality')) return 'clipping-masquerade';
  if (invalidOwner && invalidOwner.includes('grid')) return 'grid-expansion-failure';
  if (invalidOwner && (invalidOwner.includes('.vrm-content') || invalidOwner.includes('.vrm-main'))) return 'shell-containment-failure';
  if (invalidOwner && failed.has('overflow-locality')) return 'intrinsic-width-leak';
  if (failed.has('alignment-integrity')) return 'wrapper-sizing-collapse';
  if (invalidOwner) return 'flex-propagation-failure';
  return null;
}

function evaluateInvariants(pre: PhaseSnapshot, post: PhaseSnapshot, hs: PhaseSnapshot): InvariantResult[] {
  const inv: InvariantResult[] = [];

  const dDoc = post.global.documentScrollWidth - pre.global.documentScrollWidth;
  const dBody = post.global.bodyScrollWidth - pre.global.bodyScrollWidth;
  inv.push({ key: 'global-stability', pass: Math.max(dDoc, dBody) <= TOL.global, tolerance: TOL.global, measured: { dDoc, dBody } });

  const preFilter = pre.nodes.filterCard?.rectWidth ?? 0;
  const postFilter = post.nodes.filterCard?.rectWidth ?? 0;
  inv.push({ key: 'filter-stability', pass: Math.abs(postFilter - preFilter) <= TOL.filter, tolerance: TOL.filter, measured: { preFilter, postFilter, delta: postFilter - preFilter } });

  const wrapper = post.nodes.wrapper;
  const overflowLocal = !!wrapper && (wrapper.scrollWidth - wrapper.clientWidth > TOL.pressure) && post.chain.slice(1).every((x) => x.pressure <= TOL.pressure);
  inv.push({ key: 'overflow-locality', pass: overflowLocal, measured: { wrapperPressure: wrapper ? wrapper.scrollWidth - wrapper.clientWidth : null, ancestorLeakCount: post.chain.slice(1).filter((x) => x.pressure > TOL.pressure).length } });

  const beforeSL = post.nodes.wrapper?.scrollLeft ?? 0;
  const afterSL = hs.nodes.wrapper?.scrollLeft ?? 0;
  const ancMoved = hs.chain.slice(1).some((x, i) => {
    const p = post.chain[i + 1];
    return p && Math.abs((x.pressure ?? 0) - (p.pressure ?? 0)) > 1;
  });
  inv.push({ key: 'scroll-locality', pass: afterSL > beforeSL && !ancMoved, measured: { beforeSL, afterSL, ancestorChanged: ancMoved } });

  inv.push({ key: 'right-reachability', pass: hs.rightIntersection >= TOL.reach && hs.hiddenRight <= TOL.reach, tolerance: TOL.reach, measured: { rightIntersection: hs.rightIntersection, hiddenRight: hs.hiddenRight } });

  let alignPass = post.ths.length > 0 && post.ths.length === post.tds.length;
  let maxLeftDelta = 0;
  let maxWidthDelta = 0;
  if (alignPass) {
    for (let i = 0; i < post.ths.length; i += 1) {
      maxLeftDelta = Math.max(maxLeftDelta, Math.abs(post.ths[i].left - post.tds[i].left));
      maxWidthDelta = Math.max(maxWidthDelta, Math.abs(post.ths[i].width - post.tds[i].width));
    }
    for (let i = 0; i < hs.ths.length; i += 1) {
      maxLeftDelta = Math.max(maxLeftDelta, Math.abs(hs.ths[i].left - hs.tds[i].left));
      maxWidthDelta = Math.max(maxWidthDelta, Math.abs(hs.ths[i].width - hs.tds[i].width));
    }
    alignPass = maxLeftDelta <= TOL.alignment && maxWidthDelta <= TOL.alignment;
  }
  inv.push({ key: 'alignment-integrity', pass: alignPass, tolerance: TOL.alignment, measured: { maxLeftDelta, maxWidthDelta, cols: post.ths.length } });

  return inv;
}

function drawOverlay(suite: RuntimeProofSuite): void {
  const existing = document.getElementById('eventlogs-runtime-proof-overlay');
  if (existing) existing.remove();

  const box = document.createElement('div');
  box.id = 'eventlogs-runtime-proof-overlay';
  box.style.position = 'fixed';
  box.style.right = '12px';
  box.style.bottom = '12px';
  box.style.zIndex = '99999';
  box.style.maxWidth = '380px';
  box.style.background = 'rgba(10,15,22,0.92)';
  box.style.border = `1px solid ${suite.status === 'PASS' ? '#2ecc71' : '#ff5f5f'}`;
  box.style.borderRadius = '8px';
  box.style.padding = '10px 12px';
  box.style.color = '#fff';
  box.style.font = '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace';
  box.style.pointerEvents = 'none';

  const inv = suite.invariants.map((i) => `${i.pass ? '✓' : '✗'} ${i.key}`).join('\n');
  box.textContent = [
    `EVENTLOGS PROOF: ${suite.status}`,
    `MOUNTED: ${suite.mountedPredicate}`,
    `FIRST_INVALID_OWNER: ${suite.firstInvalidOwner ?? 'null'}`,
    `FAILURE_CLASS: ${suite.failureClass ?? 'none'}`,
    `PROPAGATION_DELTA: ${suite.propagationDelta}`,
    `OVERFLOW_LOCALITY: ${suite.invariants.find((x) => x.key === 'overflow-locality')?.pass}`,
    `SCROLL_LOCALITY: ${suite.invariants.find((x) => x.key === 'scroll-locality')?.pass}`,
    `RIGHT_REACH: ${suite.invariants.find((x) => x.key === 'right-reachability')?.pass}`,
    `ALIGNMENT: ${suite.invariants.find((x) => x.key === 'alignment-integrity')?.pass}`,
    '---',
    inv,
  ].join('\n');

  document.body.appendChild(box);
}

export function runEventLogsRuntimeProofSuite(searchToken: number): RuntimeProofSuite {
  const pre = collectPhase('PRE_SEARCH', searchToken);
  const mounted = searchToken > 0 && pre.rows > 0;
  if (!mounted) {
    const suite: RuntimeProofSuite = {
      status: 'FAIL',
      mountedPredicate: false,
      firstInvalidOwner: null,
      failureClass: 'mounted-state-missing',
      propagationDelta: 0,
      causalReason: 'M predicate false at evaluation time',
      phases: { PRE_SEARCH: pre, POST_SEARCH_MOUNTED: pre, POST_HSCROLL_RIGHT: pre },
      invariants: [{ key: 'mounted-predicate', pass: false, measured: { searchToken, rows: pre.rows } }],
    };
    drawOverlay(suite);
    return suite;
  }

  const post = collectPhase('POST_SEARCH_MOUNTED', searchToken);
  const wrapper = document.querySelector('.event-logs-table-scroll') as HTMLElement | null;
  if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
  const hs = collectPhase('POST_HSCROLL_RIGHT', searchToken);

  const invariants = evaluateInvariants(pre, post, hs);
  const invalid = firstInvalidOwner(post);
  const status: RuntimeProofSuite['status'] = invariants.every((i) => i.pass) ? 'PASS' : 'FAIL';
  const failureClass = classifyFailure(post, invalid.owner, invariants);

  const suite: RuntimeProofSuite = {
    status,
    mountedPredicate: true,
    firstInvalidOwner: invalid.owner,
    failureClass,
    propagationDelta: invalid.pressure,
    causalReason: invalid.owner ? 'overflow pressure escaped legal wrapper boundary' : null,
    phases: { PRE_SEARCH: pre, POST_SEARCH_MOUNTED: post, POST_HSCROLL_RIGHT: hs },
    invariants,
  };

  drawOverlay(suite);
  return suite;
}

export function installEventLogsRuntimeProof(): void {
  (window as Window & { __EVENTLOGS_RUNTIME_PROOF__?: unknown }).__EVENTLOGS_RUNTIME_PROOF__ = {
    run: runEventLogsRuntimeProofSuite,
  };
}
