export type RuntimeProof = {
  status: "PASS" | "FAIL";
  firstInvalidOwner: string | null;
  failureClass: string | null;
  propagationDelta: number;
  violatedInvariants: string[];
  causalReason: string | null;
  overflowLocality: boolean;
  scrollLocality: boolean;
  reachability: boolean;
  alignmentIntegrity: boolean;
  graph: Array<Record<string, unknown>>;
};

const TOL = 2;

function nodeLabel(el: Element): string {
  const cls = (el as HTMLElement).className;
  return `${el.tagName.toLowerCase()}${cls ? `.${String(cls).trim().replace(/\s+/g, ".")}` : ""}`;
}

function collectChain(start: Element | null) {
  const chain: Array<Record<string, unknown>> = [];
  let cur: Element | null = start;
  while (cur) {
    const h = cur as HTMLElement;
    const cs = window.getComputedStyle(h);
    chain.push({
      node: nodeLabel(cur),
      clientWidth: h.clientWidth,
      scrollWidth: h.scrollWidth,
      pressure: h.scrollWidth - h.clientWidth,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      width: cs.width,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      display: cs.display,
      flexBasis: cs.flexBasis,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      gridTemplateColumns: cs.gridTemplateColumns,
      contain: cs.contain,
      transform: cs.transform,
      position: cs.position,
    });
    cur = cur.parentElement;
  }
  return chain;
}

export function evaluateEventLogsRuntimeProof(): RuntimeProof {
  const wrapper = document.querySelector('.event-logs-table-scroll') as HTMLElement | null;
  const table = document.querySelector('.event-logs-results-table') as HTMLElement | null;
  const rows = document.querySelectorAll('.event-logs-results-table tbody tr').length;
  const graph = collectChain(table);
  const violatedInvariants: string[] = [];

  if (!wrapper || !table || rows <= 0) {
    return {
      status: 'FAIL', firstInvalidOwner: null, failureClass: 'mounted-state-missing', propagationDelta: 0,
      violatedInvariants: ['mounted-state-missing'], causalReason: 'M predicate false', overflowLocality: false,
      scrollLocality: false, reachability: false, alignmentIntegrity: false, graph,
    };
  }

  const wrapperPressure = wrapper.scrollWidth - wrapper.clientWidth;
  const ancestors = collectChain(wrapper).slice(1);
  let firstInvalidOwner: string | null = null;
  let propagationDelta = 0;
  for (const a of ancestors) {
    const p = Number(a.pressure ?? 0);
    if (p > TOL) {
      firstInvalidOwner = String(a.node);
      propagationDelta = p;
      break;
    }
  }

  const overflowLocality = wrapperPressure > TOL && !firstInvalidOwner;
  if (!overflowLocality) violatedInvariants.push('overflow-locality');

  const before = wrapper.scrollLeft;
  wrapper.scrollLeft = wrapper.scrollWidth;
  const after = wrapper.scrollLeft;
  const scrollLocality = after > before;
  if (!scrollLocality) violatedInvariants.push('scroll-locality');

  const rightCell = document.querySelector('.event-logs-results-table tbody tr td:last-child') as HTMLElement | null;
  const wr = wrapper.getBoundingClientRect();
  const rr = rightCell?.getBoundingClientRect();
  const intersection = rr ? Math.max(0, Math.min(rr.right, wr.right) - Math.max(rr.left, wr.left)) : 0;
  const reachability = intersection >= 16;
  if (!reachability) violatedInvariants.push('right-reachability');

  const ths = [...document.querySelectorAll('.event-logs-results-table thead th')].map((n) => n.getBoundingClientRect());
  const tds = [...document.querySelectorAll('.event-logs-results-table tbody tr:first-child td')].map((n) => n.getBoundingClientRect());
  let alignmentIntegrity = ths.length === tds.length && ths.length > 0;
  if (alignmentIntegrity) {
    for (let i = 0; i < ths.length; i += 1) {
      if (Math.abs(ths[i].left - tds[i].left) > 3 || Math.abs(ths[i].width - tds[i].width) > 3) {
        alignmentIntegrity = false;
        break;
      }
    }
  }
  if (!alignmentIntegrity) violatedInvariants.push('alignment-integrity');

  const failureClass = firstInvalidOwner
    ? 'intrinsic-width-propagation-leak'
    : violatedInvariants[0] ?? null;

  return {
    status: violatedInvariants.length ? 'FAIL' : 'PASS',
    firstInvalidOwner,
    failureClass,
    propagationDelta,
    violatedInvariants,
    causalReason: firstInvalidOwner ? 'pressure escaped wrapper boundary' : null,
    overflowLocality,
    scrollLocality,
    reachability,
    alignmentIntegrity,
    graph,
  };
}

export function installEventLogsRuntimeProof(): void {
  (window as Window & { __EVENTLOGS_RUNTIME_PROOF__?: unknown }).__EVENTLOGS_RUNTIME_PROOF__ = {
    evaluate: evaluateEventLogsRuntimeProof,
  };
}
