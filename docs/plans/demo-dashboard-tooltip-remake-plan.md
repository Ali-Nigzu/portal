# Demo dashboard donut hover/tooltip remake plan (Traffic, Capacity, Site Flow demographics)

## 1) Current architecture (repo-proven)

### Route/page containment
- Demo dashboard route (`/demo/:siteId/dashboard`) and authenticated route (`/sites/:siteId/dashboard`) both render the same `DashboardPage` component.
- `DashboardPage` defaults to `dataMode="demo"`, but the chart component tree is shared between demo and authenticated modes.

### Rendering path by target chart
- **Traffic card**
  - Container/card: `ChartGrid -> ChartCard`
  - Chart dispatcher: `ChartRenderer`
  - Primitive: `TrafficDistribution` when chart style/subtype resolves to `traffic_distribution`.
- **Capacity card**
  - Container/card: `ChartGrid -> ChartCard`
  - Chart dispatcher: `ChartRenderer`
  - Primitive: `CapacityDonut` when style/subtype resolves to `capacity_usage` and presentation is `vrm`.
- **Site Flow demographics cards (Age/Gender/Race)**
  - Container/card: `ChartGrid -> SiteFlowCard -> SiteFlowDemographicsView`
  - Primitive: each demographic donut is rendered directly with `TrafficDistribution`.

### Shared vs separate interaction implementation
- Shared donut interaction logic exists in `TrafficDistribution` (used by Traffic + Age/Gender/Race).
- Capacity has a separate but structurally parallel donut implementation in `CapacityDonut`.
- The shared `ChartTooltip` component is **not** used by these donut charts; it is used by bar/time-series/kpi primitives.

## 2) Proven current behavior and sticky/stale mechanism

### Traffic + demographics (`TrafficDistribution`)
- Hover state is local React state: `hoverLabel` (`{text,x,y}` or `null`).
- Hover state is written from `onMouseEnter` and `onMouseMove` on `<Pie>` via `placeHoverLabel(index, shape)`.
- Hover clear is only `onMouseLeave={() => setHoverLabel(null)}` on `<Pie>`.
- Tooltip rendering is gated by `hoverLabelText` derived from `hoverLabel`.
- Tooltip position is derived from pie geometry (`cx/cy/outerRadius/midAngle`), not pointer coordinates.
- No click handler exists (so click clearing also does not exist).

### Capacity (`CapacityDonut`)
- Same state model: local `hoverLabel` with `{text,x,y}`.
- Same event model: `onMouseEnter` and `onMouseMove` set label; `onMouseLeave` clears.
- Same positioning model: anchored from sector geometry (not pointer coordinates).
- No click handler exists.

### Why behavior can feel sticky/stale (root mechanism)
1. **Visibility is tied to last hover write, not strict active-pointer truth.**
   - Tooltip remains rendered until a leave callback fires.
2. **Clear path is only Pie-level mouse leave.**
   - If pointer transitions in ways that do not produce a reliable leave callback, the last label can persist.
3. **Coordinates are not pointer-driven.**
   - Because positions are geometry-anchored, the popup does not feel cursor-near/following and appears pinned to wedge geometry.
4. **No explicit click neutralization.**
   - Click does not pin state directly, but click also cannot clear or suppress stale hover state when leave does not fire.

## 3) Primary cause vs secondary causes

### Primary cause
- Donut tooltip state is modeled as a retained snapshot (`hoverLabel`) that can outlive true hover, and render depends on that retained snapshot.

### Secondary contributors
- Positioning from arc geometry (not pointer coordinates) amplifies “stuck/pinned” perception.
- Leave reset is attached only to Pie callbacks; there is no container-level hard reset fallback (pointer leave / blur / pointer cancel).
- Capacity and Traffic/Demographics duplicated logic means bug parity across cards.

## 4) Recommended fix boundary (smallest safe surface)

### Preferred boundary
- Introduce/centralize a **shared donut hover controller** used by both `TrafficDistribution` and `CapacityDonut`.

### Why this boundary is safest
- Covers all five target charts with one interaction contract.
- Avoids touching unrelated primitives (`BarChart`, `TimeSeriesChart`, shared `ChartTooltip`).
- Keeps visual/data logic local to donuts while standardizing event/state lifecycle.

### Containment strategy for demo-only requirement
- Because primitives are shared between demo and authenticated dashboards, containment requires one of:
  1. Add a `hoverMode`/`interactionMode` prop from demo dashboard path only and enable new behavior only there.
  2. Wrap donut primitives in demo-only wrapper that applies new controller.
- Recommend option (1) if maintainers want lowest code duplication; option (2) if strict no-risk to authenticated UX is mandatory.

## 5) Desired interaction contract (code-level)

State model (transient):
- `hoveredSegmentId: string | null`
- `pointer: {x:number,y:number} | null`

Event transitions:
- `onSegmentPointerEnter/Move(segment, event)`:
  - set `hoveredSegmentId = segment.id`
  - set `pointer = localPointerFromEvent(event)`
- `onSegmentPointerLeave` OR chart-container `onPointerLeave` OR `onBlur` OR `onPointerCancel`:
  - set `hoveredSegmentId = null`
  - set `pointer = null`
- `onClick`:
  - must not mutate `hoveredSegmentId` or `pointer`

Render guard:
- Render tooltip iff `hoveredSegmentId !== null && pointer !== null`.
- Tooltip content comes from `hoveredSegmentId` only.
- Tooltip position comes from `pointer` with small offset and clamping.

## 6) Logical proof against required invariants

1. **Hover-gated existence**: tooltip requires both segment + pointer; when either is null, render condition fails. Stale visibility cannot persist.
2. **Live-pointer-gated position**: coordinates only exist while pointer state exists; leave clears pointer, so no ghost position can render.
3. **Click has no persistence authority**: click writes no tooltip state, so click cannot create pinned state.
4. **Singular hover target**: `hoveredSegmentId` is scalar; entering B overwrites A immediately, so content switches instantly.
5. **Unified leave clear**: all leave/cancel/blur paths set both fields to null in one reset function, eliminating residual state.

Therefore the UX must become: hover popup near cursor, slight follow on move, instant segment switching, full clear on leave, no post-click residue.

## 7) Risk assessment

- **Shared component risk**: `TrafficDistribution` is reused by Traffic and demographics (intended), potentially elsewhere. Changes here can spill over if not gated.
- **Non-demo spillover**: same dashboard component tree serves demo + authenticated routes; without prop gating behavior changes globally.
- **Recharts edge cases**: event payload variability (`index`, `payload`, pointer fields) requires defensive extraction.
- **Overlay pointer events**: tooltip overlay must remain `pointer-events: none` to avoid blocking leave/move events.

## 8) Implementation plan (future, not executed in this brief)

1. Add shared donut hover hook/controller (state + event handlers + reset + clamped positioning).
2. Wire `TrafficDistribution` to controller; remove direct retained `hoverLabel` writes.
3. Wire `CapacityDonut` to same controller.
4. Add container-level pointer leave/cancel/blur reset fallback in both donuts.
5. Ensure click handlers (if any) do not mutate hover state.
6. Add optional demo-only interaction gating prop if strict containment is required.
7. Verify no regressions in non-target chart types.

## 9) Validation plan after implementation

### Per-card manual checks (all five cards)
For Traffic, Capacity, Age, Gender, Race:
1. Hover segment => tooltip appears near cursor.
2. Move within segment => tooltip updates position smoothly.
3. Move to adjacent segment => content switches immediately.
4. Leave chart hit area => tooltip disappears completely.
5. Click segment => no pinned tooltip.
6. Click then move away => no ghost tooltip/cursor residue.

### Cross-card consistency
- Confirm Traffic, Capacity, and all three demographics follow identical hover lifecycle semantics.

### Scope containment
- If demo-only gating is implemented, validate authenticated dashboard keeps prior behavior.
- If global donut fix is chosen intentionally, confirm both demo and authenticated routes behave correctly and document decision.
