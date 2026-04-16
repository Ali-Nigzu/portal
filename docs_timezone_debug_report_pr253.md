# UTC/BST Timing Debug Report (PR 253 local-SQLite path)

## Scope and method

This report traces timestamp handling end-to-end for:

- Dashboard KPI row
- Dashboard Site Flow
- Event Logs

It is based on static code-path analysis of the current branch (no runtime patch in this report).

---

## 1) End-to-end timing map

### A. Snapshot path (KPI + Site Flow)

1. Frontend always calls `GET /api/snapshots/latest` for dashboard widgets in demo/snapshot mode. It does **not** pass a time range or timezone to the backend for this request. The only query params are org/view token and site view.  
2. Backend local mode selects the latest row from SQLite by ordering parsed timestamp descending, with an `as_of` cutoff in UTC string format (`%Y-%m-%d %H:%M:%S`).  
3. Backend returns the timestamp string as-is (`snapshot.ts`) and the payload array untouched.  
4. Frontend parses `snapshot.ts` into a `Date` (`naive -> append Z`, otherwise `new Date(value)`), then builds KPI and Site Flow series from payload arrays.

### B. Event Logs path

1. Frontend builds `/api/search-events` query params from filter state.
2. Backend local mode resolves bounds via UTC-aware `resolve_time_bounds`, then runs SQLite query using timestamp comparisons and ordering on `datetime(replace(timestamp, ' UTC', ''))` and enforces `<= datetime('now')`.
3. Backend returns event `timestamp` as raw string from SQLite row (`str(row[4])`).
4. Frontend displays via `new Date(timestamp).toLocaleString()`, or raw string if parse fails.

---

## 2) Storage/parsing/display chain by surface

### KPI row

- **Storage**: snapshot rows are expected as text timestamps (tests use `"YYYY-MM-DD HH:MM:SS UTC"`).
- **Backend parse/query**: latest snapshot selected by SQLite datetime ordering after removing optional `" UTC"` suffix.
- **Frontend parse**: `parseSnapshotTimestamp` treats naive `YYYY-MM-DD HH:MM:SS` as UTC by appending `Z`; other strings go through `new Date(value)`.
- **Display basis**: KPI result metadata hard-codes timezone to `UTC`; KPI tooltip/footer formatting uses that timezone.
- **Effect**: KPI timeline/headline are effectively UTC-framed.

### Site Flow

- **Storage**: Site Flow is not queried as raw events on demo snapshot path; it is derived from rollup arrays inside the snapshot payload.
- **Frontend generation**: `buildSiteFlowResult` maps rollup arrays to hourly points anchored from `snapshotTs` using local-day helpers (`startOfDay`, `getHours`) from `siteFlowBuckets`/`timeWindows`.
- **Display formatting**: tick formatter uses `getHours()` on `Date` (browser-local), with no explicit timezone override.
- **Metadata conflict**: chart metadata still says `timezone: "UTC"`.
- **Effect**: Site Flow point indexing and labeling are generated with local-day arithmetic while the payload semantics are UTC-oriented; in BST this can present as a one-hour lag/shift around "today" cutoffs.

### Event Logs

- **Storage**: logs timestamps are text (tests show `"... UTC"`; production data may vary).
- **Backend query basis**: UTC bound normalization + SQLite `datetime('now')` clamp.
- **Serialization**: raw timestamp string passed through.
- **Frontend display**:
  - if timestamp includes timezone and parses, rendered in browser local time.
  - if timestamp is naive, it is interpreted as local time and will look one hour behind BST if source was intended UTC.
- **Effect**: latest rows around `12:12` at UK local `13:23` are consistent with raw/UTC-leaning ingestion + pass-through display behavior.

---

## 3) Exact source(s) of the ~1 hour mismatch

There is **not one single timezone model**; there are multiple overlapping ones:

1. **Manifest + KPI metadata declare UTC**.
2. **Site Flow “today” bucket slicing/labels use local `Date` operations** on top of snapshot rollup arrays that are effectively UTC-positioned.
3. **Event Logs backend clamps/query-order in UTC-ish SQLite functions**, but frontend display depends on whether timestamp strings are timezone-qualified.

The visible "~1 hour behind UK" symptom is introduced by this mixed model:

- UTC-basis data (snapshot/logs) + local-day rendering logic (Site Flow), and
- raw-string timestamp display behavior (Event Logs) when timezone suffix consistency is imperfect.

---

## 4) Consistency table

| Surface | Query/selection basis | Parse basis | Display basis | Consistent? |
|---|---|---|---|---|
| KPI row | latest snapshot row by SQLite datetime <= UTC `as_of` | snapshot ts parsed as UTC for naive format | explicitly UTC in metadata/formatting | Mostly yes (UTC) |
| Site Flow | snapshot payload rollup arrays (not live query window on demo snapshot path) | snapshot ts parsed then local-day bucket construction | local tick formatting (`getHours`) but meta says UTC | **No** (mixed UTC + local) |
| Event Logs | UTC-normalized bounds + SQLite datetime comparisons + `<= now` | none (raw string pass-through) | browser `new Date(...).toLocaleString()` or raw | **No** (depends on string format) |

---

## 5) Decision-ready recommendation (no patch yet)

Pick one canonical timezone contract and apply it to **all three** surfaces.

Most robust option for this demo path:

- **Canonical internal time = UTC** (already true for datasets).
- **Explicit display policy** (choose one):
  - A) Display UTC everywhere (labels clearly marked UTC), or
  - B) Display browser-local everywhere (convert from UTC at render layer consistently).

Given user expectation in UK local wall-clock, option **B** is likely better UX, but either is valid if applied uniformly.

Minimum contract requirements regardless of A/B:

1. Standardize snapshot/log timestamp serialization to ISO 8601 with explicit offset (e.g. `...Z`).
2. Remove mixed local-vs-UTC bucket math in Site Flow "today" path.
3. Make Event Logs parse/format deterministic (do not depend on browser parsing ambiguous timestamp strings).
4. Align filter date serialization with chosen timezone model.

---

## 6) Risk notes for future fix

Changing timezone interpretation can affect:

- KPI sparkline alignment and "latest point" semantics.
- Site Flow "today" slice count and apparent final bucket.
- Event Logs day-filter windows (especially date-only filters during DST).
- Existing fixtures/tests that currently expect `"... UTC"` text timestamps.
- Any downstream assumptions in `vrmDecorators`/chart tooltip formatting tied to current `meta.timezone` values.

---

## 7) High-confidence findings vs open verification

### High-confidence (from code)

- Snapshot and logs local SQLite access are timestamp-text based, with optional `' UTC'` stripping for SQL comparisons.
- Snapshot API and Event Logs API in demo mode both route through local SQLite helpers.
- KPI metadata is pinned to UTC.
- Site Flow uses local date helpers for bucket timestamps while carrying UTC metadata.

### Open verification still useful in runtime

- Confirm whether deployed `.db` rows always include `' UTC'` suffix or sometimes naive strings.
- Inspect one real snapshot row + one real log row to confirm exact string format and validate the final one-hour manifestation path.
