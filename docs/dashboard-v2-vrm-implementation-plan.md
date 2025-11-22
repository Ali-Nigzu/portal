# VRM-style KPI band plan for live Dashboard V2

## Live dashboard identification (no legacy)
- **Route and surface:** `/dashboard` renders inside `VRMLayout`; the default experience gate points to `DashboardV2Page`, falling back to the legacy page only if the gate flips. 【F:frontend/src/App.tsx†L205-L243】
- **Manifest-driven layout:** `DashboardV2Page` loads `dashboard-default` from `/api/dashboards/{id}` and renders KPI tiles from `manifest.layout.kpiBand` using `KpiTile` + `ChartRenderer`. 【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L168-L189】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L15-L22】
- **Time controls (current behaviour):** A dropdown in the header rewrites widget specs through `buildWidgetSpec`/`loadWidgetResult`; all widgets currently honor the selected manifest time range. 【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L260-L358】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L495】
- **Widgets currently shown:** Six `single_value` KPIs (`kpi-activity-today`, `kpi-entrances-today`, `kpi-exits-today`, `kpi-live-occupancy`, `kpi-avg-dwell`, `kpi-freshness`) declared in the manifest’s `kpiBand`. 【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L15-L22】【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L56-L337】

## Per-card analysis of the six live KPI tiles

### Activity Today (Activity Total)
| Field | Details |
| --- | --- |
| Display name | Activity Today (title), series label Activity Total. |
| Meaning | Count of all events (entrances + exits) in the window. |
| Time window | Inline: today’s start to now, bucket=HOUR, timezone UTC; currently overridden by the selected time range option. |
| Data source | `/api/analytics/run` with dataset `events`, measure `count` id `activity_total`, hourly timestamp dimension. |
| Computation | Backend counts all events; front-end takes the latest point for the headline, optional delta from summary, sparkline from the returned series. |
| Granularity / chart | Hourly buckets by default; sparkline uses the returned series values. |
| Timezone handling | Inline UTC; dropdown may change timezone via manifest time controls. |
| Update behaviour | Reloads on page mount, Refresh data, Reload manifest, or time-range change; tile shows loading/error states from `DashboardV2Page`. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L56-L101】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

### Entrances Today
| Field | Details |
| --- | --- |
| Display name | Entrances Today. |
| Meaning | Count of entrance events (`eventTypes: [1]`) in the window. |
| Time window | Inline today start → now, bucket=HOUR UTC; can be overridden by the header dropdown. |
| Data source | Same analytics run, measure `count` with `eventTypes` filter. |
| Computation | Backend counts entrances; tile shows latest point, delta from summary if present, sparkline from series. |
| Granularity / chart | Hourly buckets by default. |
| Timezone handling | Inline UTC; can shift if time controls override. |
| Update behaviour | Same lifecycle as Activity Today. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L102-L149】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

### Exits Today
| Field | Details |
| --- | --- |
| Display name | Exits Today. |
| Meaning | Count of exit events (`eventTypes: [0]`). |
| Time window | Inline today start → now, bucket=HOUR UTC; subject to dropdown override. |
| Data source | Analytics run with measure `count` filtered to exits. |
| Computation | Backend counts exits; tile uses latest point + sparkline. |
| Granularity / chart | Hourly by default. |
| Timezone handling | Inline UTC; overridable. |
| Update behaviour | Same as other KPIs. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L150-L197】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

### Live Occupancy
| Field | Details |
| --- | --- |
| Display name | Live Occupancy. |
| Meaning | Occupancy via `occupancy_recursion` (running entries minus exits). |
| Time window | Inline last 60 minutes, bucket=5_MIN UTC; can be replaced by selected time range. |
| Data source | Analytics run with measure `occupancy_recursion` on events dataset. |
| Computation | Backend returns occupancy per bucket; tile takes last bucket as headline, sparkline over series. |
| Granularity / chart | 5-minute buckets by default; sparkline shows series. |
| Timezone handling | Inline UTC; dropdown may override. |
| Update behaviour | Same lifecycle as other KPIs. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L198-L243】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

### Avg Dwell
| Field | Details |
| --- | --- |
| Display name | Avg Dwell. |
| Meaning | Average dwell duration (minutes) via `dwell_mean`. |
| Time window | Inline today start → now, bucket=HOUR UTC; subject to time-range override. |
| Data source | Analytics run with measure `dwell_mean`. |
| Computation | Backend computes dwell; tile shows latest value and sparkline. |
| Granularity / chart | Hourly buckets by default. |
| Timezone handling | Inline UTC; dropdown may override. |
| Update behaviour | Same lifecycle as other KPIs. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L244-L288】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

### Freshness Status
| Field | Details |
| --- | --- |
| Display name | Freshness Status. |
| Meaning | Minutes since last event, using `count` with `options.metric: freshness`. |
| Time window | Inline last 120 minutes, bucket=5_MIN UTC; may be replaced by dropdown. |
| Data source | Analytics run with freshness metric; expected to return freshness values per bucket. |
| Computation | Tile displays latest freshness value, coverage/delta if provided, sparkline from series. |
| Granularity / chart | 5-minute buckets by default. |
| Timezone handling | Inline UTC; overridable. |
| Update behaviour | Same lifecycle as other KPIs. |
【F:frontend/src/dashboard/v2/examples/dashboard_manifest_default.json†L289-L337】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L308-L362】【F:frontend/src/dashboard/v2/pages/DashboardV2Page.tsx†L461-L520】

## VRM card behaviour and mapping
- Each VRM tile maps to a camOS metric with fixed windows: headline = last 15 minutes (use final bucket of a 24h series), sparkline = last 24h with 15-minute buckets (96 points). Time controls must not alter these. Tooltip on hover should show bucket time and value.

| VRM card (camOS metric) | Target behaviour |
| --- | --- |
| Grid → Entrances | 24h/15m series of entrances (`eventTypes: [1]`); headline uses final bucket as “entrances in last 15 minutes”; sparkline uses full series. |
| AC Load → Occupancy | 24h/15m occupancy series; headline = last bucket (current occupancy); sub-label = delta vs prior bucket (~15m ago); sparkline over series. |
| Essential Load → Exits | 24h/15m exits series (`eventTypes: [0]`); headline = last bucket; sparkline over 24h. |
| Total Consumption → Footfall | Derive entrances + exits per 15m bucket over 24h; headline = last bucket total events; mini KPI = sum of all 24h buckets; sparkline shows summed series. |
| Temperature → Avg Dwell | `dwell_mean` over last 24h in 15m buckets (if backend supports); headline = last bucket; sparkline = series; format minutes into human-readable duration. |
| PV Inverter → Traffic Distribution | Count events per camera over last 24h; compute share per camera = camera_total / site_total; headline = top camera label + share%; chart = horizontal bars with shares (single 100% bar today because one camera). |
| Battery SOC → Capacity Usage | Use 24h/15m occupancy series + static capacity (client1=100, client2=1000). Headline = (last occupancy / capacity)*100; sub-label = “Peak today: X%” from max occupancy since midnight; expose occupancy delta vs 15m ago for central state logic. |

## Mapping table: live camOS cards/data → VRM cards
| VRM card | Target camOS metric | Existing live data to reuse | Front-end calculations | Backend gaps |
| --- | --- | --- | --- | --- |
| Grid | Entrances | Entrances Today widget spec (`eventTypes:[1]` count). | Fix per-widget timeWindow to 24h/15m; use last bucket as headline. | None. |
| AC Load | Occupancy | Live Occupancy widget (`occupancy_recursion`). | Fix window to 24h/15m; compute delta vs previous bucket for ± label. | None. |
| Essential Load | Exits | Exits Today widget (`eventTypes:[0]`). | Fix window to 24h/15m; headline = last bucket. | None. |
| Total Consumption | Footfall (entrances + exits) | Entrances + Exits series from existing measures; or Activity Today (all events). | Build derived series summing entrances + exits per bucket; compute 24h total. | None. |
| Temperature | Avg Dwell | Avg Dwell widget (`dwell_mean`). | Set window to 24h/15m; headline last bucket; format duration. | Assumes backend supports 15m buckets for dwell_mean. |
| PV Inverter | Traffic Distribution | Events dataset with camera dimension (if supported). | Aggregate counts per camera over 24h; compute shares; fallback to single 100% bar if camera dimension unavailable. | Camera dimension availability uncertain (no backend change). |
| Battery SOC | Capacity Usage | Occupancy series; client/org identifier for capacity lookup. | Compute % = occupancy/capacity; derive peak today from buckets midnight→now; surface delta vs 15m for central state. | Need static capacity map in frontend (client1=100, client2=1000). |

## Front-end implementation plan (live view only)
- **Manifest updates:** Edit the dashboard manifest (default `dashboard-default` via API/fixture) so the six KPI widgets have fixed per-widget `timeWindow` {from: NOW-24h, to: NOW, bucket: 15m} and ignore `selectedTimeRange`. Add comments noting the override. Keep other widgets using the dropdown.
- **DashboardV2Page adjustments:**
  - Prevent the time-range dropdown from altering KPI-band widgets (e.g., bypass `timeRange` when invoking `widgetResultLoader` for KPI IDs, or clone manifest with fixed windows before load).
  - Keep dropdown for non-KPI widgets.
  - Update header copy to VRM spec: left = “Site name – Site ID” (reuse org/site info); right chips = “Last updated: Realtime” (static), “Status: OK” (static), “Local time: <current>” (existing clock).
- **KpiTile / ChartRenderer enhancements:**
  - Ensure sparkline supports hover tooltips (time label + metric/value). If missing, refactor to reuse shared tooltip primitives used in other charts.
  - Accept metadata (metric label/unit) for tooltip labelling.
- **VRM card-specific wiring:**
  - Grid/Entrances: reuse entrances count measure; fix window; show final bucket; sparkline from series.
  - AC Load/Occupancy: reuse occupancy series; compute delta = last – previous bucket; show ± in subtitle.
  - Essential Load/Exits: reuse exits series; final bucket headline.
  - Total Consumption/Footfall: request entrances + exits measures; sum per bucket client-side; derive 24h total for mini KPI.
  - Temperature/Dwell: request `dwell_mean` with 15m bucket; headline = last bucket formatted; sparkline from series (or flat if backend returns single value).
  - PV Inverter/Traffic Distribution: request counts dimensioned by camera; compute shares and top camera text; render horizontal bar chart. If dimension unavailable, fall back to single 100% bar but keep code structured for future dimension use.
  - Battery SOC/Capacity Usage: load occupancy series; look up capacity (client1→100, client2→1000) from org/client context; compute current % (last bucket) and peak today % (max bucket from midnight); expose occupancy delta vs 15m ago for central node state logic.
- **Central node state (camos logo area):** Use capacity_usage_now and Δoccupancy_15m from Capacity Usage wiring to derive state: ≥90% → Near capacity; Δ≥+10 → Getting busier; Δ≤−10 → Quietening down; else Stable.
- **Layout/styling:** Re-skin KPI band to VRM dark look via Dashboard V2 CSS and KpiTile styles; ensure six tiles remain in band. No changes to legacy dashboard.

## Open questions / assumptions
- Camera-dimension support for analytics is assumed; if unavailable, Traffic Distribution will temporarily show a single 100% bar using site totals until backend/spec change.
- `dwell_mean` is assumed to support 15-minute buckets; if not, display constant headline from available aggregation and document limitation.
- Capacity lookup relies on a client/org identifier already available in dashboard context (e.g., orgId from credentials); confirm IDs beyond `client1`/`client2` before extending mapping.
- The fixed 24h/15m window for KPI band intentionally ignores the manifest time-range dropdown; other widgets continue to respect it.

## Test approach (after implementation)
- Load `/dashboard` with dashboard V2 enabled; verify the six KPI tiles always show 15m headline/24h sparkline regardless of time-range dropdown changes.
- Hover each sparkline to see tooltip with time + metric value.
- Confirm Traffic Distribution shows top camera share (currently one camera → 100% bar) and Capacity Usage shows current % plus peak today subtitle.
- Validate header shows “Site name – Site ID”, “Last updated: Realtime”, “Status: OK”, and current local time using existing clock logic.
