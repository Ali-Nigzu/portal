# PR 253 Local-SQLite Timing: Debug + Fix Planning Brief (Business-Clock Model)

## Scope

This brief is **planning-only** (no runtime code changes). It documents the current timing model on the local SQLite demo path and plans a fix to enforce this contract:

> For local demo SQLite data, treat stored UTC-labelled timestamps as **fixed demo/business wall-clock time** (naive clock time), not true timezone-converted instants.

---

## Required target rule (explicit)

If demo data contains `2026-04-16 13:00:00 UTC`, the app should treat that as **13:00 business time** everywhere (KPI, Site Flow, Event Logs), not as a true UTC instant that gets shifted for BST/browser locale.

---

## Current timing model by surface

## 1) KPI row (dashboard)

### Storage/query path
- Dashboard widgets on demo path always load from `/api/snapshots/latest` via snapshot transport.
- Backend snapshot local query picks the latest SQLite row `<= as_of` (default `datetime.now(timezone.utc)`), using SQL normalization `datetime(replace(ts, ' UTC', ''))`.
- Backend returns `snapshot.ts` as raw string.

### Parse/display path
- Frontend snapshot parser treats naive `YYYY-MM-DD HH:MM:SS` as UTC by appending `Z`; otherwise uses `new Date(value)`.
- KPI chart metadata is hard-coded to `timezone: "UTC"`.
- KPI tile tooltip/value-time formatting uses `result.meta.timezone` (UTC for snapshot KPI results).

### What “now” means today (KPI)
- **Snapshot selection now**: backend UTC now (`datetime.now(timezone.utc)` in Python, formatted to second).
- **Rendered latest point**: based on selected snapshot timestamp and 24h synthetic series reconstruction.

### Net behavior
- KPI is effectively UTC-framed today, not fixed business-clock framed.

---

## 2) Site Flow (dashboard)

### Storage/query path
- Site Flow on demo snapshot path also uses the same `/api/snapshots/latest` row and in-payload rollups (not a separate live events aggregate query for demo snapshots).

### Parse/display path
- Snapshot timestamp parsing same as KPI (`naive -> append Z`, else `new Date`).
- Site Flow series are generated from rollup arrays with `buildSiteFlowBucketLabels` using local `Date` arithmetic (`startOfDay`, `getHours`, `addHours`).
- “Today” slice count uses `anchor.getHours() + 1`.
- Tick labels use `Date#getHours()` in browser local time, without explicit timezone override.
- Yet result metadata is still set to `timezone: "UTC"`.

### What “now” means today (Site Flow)
- **Data freshness now**: same snapshot-row selection now as KPI (backend UTC now).
- **Today-progress now**: anchored to parsed snapshot timestamp with local/browser hour math.

### Net behavior
- Site Flow is mixed: UTC-labelled payload/meta + local browser bucket/tick math. This is internally inconsistent and can produce a visible ~1h lag in BST contexts.

---

## 3) Event Logs (demo)

### Storage/query path
- Demo Event Logs route to `/api/search-events` local path.
- Backend resolves bounds with UTC-aware parser (`resolve_time_bounds`), then SQL-filters with:
  - `BETWEEN datetime(?) AND datetime(?)`
  - `<= datetime('now')`
  - ordering by normalized timestamp (`replace(..., ' UTC', '')`).
- Backend response returns raw timestamp string from SQLite row (`"timestamp": str(row[4])`).

### Parse/display path
- Frontend renders timestamp using `new Date(timestamp).toLocaleString()`.
- If parse fails, frontend shows raw string unchanged.
- Date filters are serialized as `toISOString().split('T')[0]`, which can shift calendar day semantics relative to wall-clock expectation.

### What “now” means today (Event Logs)
- **Query upper bound now**:
  1. Python-side `resolve_time_bounds` clamps default end to UTC now.
  2. SQL adds independent SQLite `datetime('now')` cap.
- **Visible timestamp now**: depends on browser parsing/formatting behavior of returned string.

### Net behavior
- Event Logs currently follow UTC-ish query cutoffs with format-dependent browser rendering, not fixed business-clock semantics.

---

## “Now” analysis (required consolidated section)

Current local-demo meaning of `now` is not unified:

1. **Snapshots/KPI/Site Flow fetch cutoff**: Python UTC now in backend snapshot lookup.
2. **Site Flow chart progress**: snapshot timestamp interpreted through local browser `Date` hour/day operations.
3. **Event Logs query window**: UTC now clamp in Python + SQLite `datetime('now')` clamp.
4. **Event Logs rendered clock**: browser locale/parsing behavior on raw timestamp strings.

So the app has multiple `now` definitions simultaneously.

---

## Exact source of the observed ~1 hour mismatch

The mismatch is introduced by combining incompatible models:

1. **UTC-based selection/cutoffs** in backend snapshot/log lookup.
2. **Local/browser clock math** for Site Flow bucket progression/labels.
3. **Raw-string timestamp pass-through + browser parse/display dependence** for Event Logs.
4. **UTC metadata in KPI/Site Flow results** while some rendering helpers use local `Date` getters.

This mixed model explains reports like:
- local UK wall clock around 13:23,
- Site Flow appearing to stop around 12:00,
- Event Logs latest visible around 12:12.

---

## Proposed target timing contract (for local demo SQLite path)

Use one explicit demo-only contract:

## Contract: “Naive business clock time”
- Treat stored timestamp text as wall-clock values in a fixed demo clock.
- Ignore true timezone conversion semantics on demo local-SQLite path.
- Keep same visible hour semantics across KPI, Site Flow, Event Logs.

Operationally:
- `2026-04-16 13:00:00 UTC` is interpreted as **13:00 business time**.
- No browser/BST shift should move it to 14:00 or 12:00.

---

## Surface-by-surface implementation strategy (plan only)

## A) KPI row
1. Introduce a demo timestamp normalization utility that strips/ignores timezone meaning and outputs a stable "business-clock" datetime object.
2. Use that utility for snapshot `ts` parsing before KPI sparkline timeline generation.
3. Ensure KPI tooltip/header formatting uses business-clock labels (no UTC/local conversion).
4. Keep this behavior gated to local demo SQLite mode (do not alter authenticated/real-time paths).

## B) Site Flow
1. Treat Site Flow rollup indexing and axis labels in the same business-clock basis as KPI.
2. Remove mixed UTC-meta vs local-hour generation conflict for demo path.
3. Define “today progress” from business-clock `now` and business-clock day start.
4. Ensure `today` always advances to expected wall-clock hour (e.g., 13:00 at real UK 13:00 for demo expectation).

## C) Event Logs
1. Normalize backend query bounds to business-clock semantics for demo path (including `now` upper bound).
2. Avoid dual `now` caps that may drift (Python UTC clamp + SQLite `datetime('now')`).
3. Return timestamps in an unambiguous demo-business format (or include explicit demo-clock metadata).
4. Render Event Logs timestamps with business-clock formatter, not generic locale conversion of potentially ambiguous strings.
5. Revisit date-filter serialization to avoid `toISOString().split('T')[0]` day drift under DST/local offsets.

## D) Shared layer
1. Add one centralized `demoTime` abstraction used by all three surfaces.
2. Gate by data mode (`demo`) and/or local SQLite source.
3. Keep existing UTC behavior for non-demo/authenticated flows.

---

## Risks and compatibility notes

Potential impacts of moving to business-clock semantics:

1. **Snapshot latest semantics**: "latest" may no longer align with true UTC instant ordering assumptions in old logic.
2. **Site Flow today bucket count**: may change at boundary hours and DST transitions.
3. **Event filter windows**: date-only filters may return different rows after business-clock normalization.
4. **Tests/fixtures**: current fixtures with `... UTC` strings and expectations may need updates.
5. **Mixed-mode regressions**: must avoid leaking demo business-clock semantics into authenticated/BQ paths.

---

## Verification plan (prove fix works)

Run these checks in demo/local SQLite mode:

1. **Wall-clock alignment check**
   - At real UK 13:00 BST, dashboard latest KPI state corresponds to 13:00 business clock.
2. **Site Flow progression check**
   - “Today” extends through 13:00 bucket (not capped at 12:00).
3. **Event Logs recency check**
   - Latest visible rows are around 13:xx expected business clock, not 12:xx.
4. **Cross-surface consistency check**
   - Same timestamp interpreted identically in KPI hover labels, Site Flow axis/tooltip, Event Logs table.
5. **Boundary checks**
   - Midnight/day rollover for “today”.
   - DST dates to confirm no unintended shifting on demo path.
6. **Non-demo regression check**
   - Authenticated/BQ behavior unchanged.

---

## Hypotheses outcome (from current code)

- H1 (UTC now vs wall-clock expectation): **supported**.
- H2 (Site Flow mixed local arithmetic vs UTC-labelled payload): **supported**.
- H3 (Event Logs pass-through/parse behavior preserves UTC-ish ambiguity): **supported**.
- H4 (surface inconsistency): **supported**.
- H5 (best fix is shared naive business-time layer): **supported as planning direction**.

---

## Conclusion

Current PR 253 local-SQLite timing is mixed and inconsistent across KPI, Site Flow, and Event Logs. The fix plan should **not** be “convert UTC to browser local.” It should implement a demo-only unified contract where UTC-labelled stored timestamps are interpreted as fixed business wall-clock time across all three surfaces.
