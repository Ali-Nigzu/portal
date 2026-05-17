# Mobile Sidebar Geometry + Spacing Alignment Investigation (Planning Only) — May 17, 2026

## Runtime reproduction confirmation
- Runtime validated on `http://127.0.0.1:3000/demo/site-a/dashboard` with phone emulation in both portrait (`390x844`) and landscape (`844x390`) using Playwright iPhone 12.
- Measurements were captured from rendered DOM geometry (`getBoundingClientRect`) and computed CSS variables.

## Geometry ownership map
- Mobile geometry system is driven by these tokens in `VRMNavigation.css`:
  - `W_primary = --vrm-rail-primary = 52px`
  - `W_divider = --vrm-rail-divider = 1px`
  - `W_secondary = --vrm-rail-secondary = 52px`
  - `W_sidebar_total = --vrm-mobile-rails-width = W_primary + W_divider + W_secondary`
- In runtime, `.vrm-sidebar-shell` resolves to ~`105px` total in both portrait and landscape, matching `52 + 1 + 52`.
- Secondary panel visually renders at `64px` wide in collapsed mobile state because the element width (`52px`) includes additional effective space from panel-internal padding rules (`.vrm-secondary-header` and `.vrm-secondary-list` receive symmetric horizontal padding in non-site-open mobile states).
- Icon row buttons inside collapsed rails are constrained to `44px` width and centered inside each 52px lane.

## Spacing/gutter ownership map
- Content/sidebar separation currently comes from lane reservation alignment, not an external gap:
  - `content_start_x == sidebar_end_x` (measured 105 vs 105 in both orientations).
- The perceived breathing room is currently owned by content internal padding only:
  - `.vrm-content--mobile-lane { padding-inline: var(--vrm-mobile-lane-gutter) }`
  - `--vrm-mobile-lane-gutter = 12px`
- Therefore the sidebar/content boundary has **zero inter-lane gap** and all breathing begins *inside* content.

## Invariant evaluation

### Invariant 1 — Visual icon centering
- Mathematical centering passes:
  - `X_icon_center == X_lane_center` for sampled primary rows (`delta = 0.00px`) in portrait and landscape.
- Visual compression still exists because centered icons sit in a narrow 44px hit lane inside a 52px rail with only ~11px side gap to row bounds and a nearby divider/secondary lane.
- Conclusion: centering math is correct, but lane allocation is visually tight.

### Invariant 2 — Sidebar/content rhythm consistency
- Formal target: `content_start_x >= sidebar_end_x + gutter` with stable intentional gutter.
- Current runtime: `content_start_x == sidebar_end_x`, i.e. effective external gutter `0px`.
- Conclusion: invariant violated (gutter is internal-only, not boundary-level).

### Invariant 3 — Shared geometry ownership
- Shared ownership mostly exists via `--vrm-mobile-sidebar-reserved-width` and lane token chain.
- However, secondary visual lane density is influenced by additional element-level padding/centering rules that are not represented in top-level lane-width tokens.
- Conclusion: partially satisfied; core width reservation is shared, but visual lane mass is split between token widths and local padding/row-width constraints.

## Deterministic implementation plan (no implementation yet)
1. **Unify rail visual-width ownership**
   - Introduce explicit mobile tokens for rendered icon lanes (primary + secondary) and collapsed row content width.
   - Ensure lane token and row-content token intentionally match perceived icon breathing targets.
2. **Promote boundary gutter to first-class geometry token**
   - Add explicit `W_boundary_gutter` between sidebar end and content start (outside content padding).
   - Keep content internal gutter as separate `W_content_inner_gutter`.
3. **Derive content start from sidebar geometry + boundary gutter**
   - Enforce `content_start_x = sidebar_end_x + W_boundary_gutter` across portrait/landscape and mobile-open/collapsed states.
4. **Keep single-source geometry chain**
   - All rendered sidebar widths and reserved offsets must resolve from the same token family to avoid unsynchronized calcs.

## Mathematical/logical guarantee argument
If future implementation enforces:
1. `W_sidebar_total = f(W_primary, W_divider, W_secondary)` from one tokenized chain,
2. icon lane visual width derived from those same lane tokens with explicit row-content-width target,
3. `content_start_x = sidebar_end_x + W_boundary_gutter`, where `W_boundary_gutter > 0` and orientation-stable,

then:
- icon lanes remain centered **and** gain deterministic breathing room,
- sidebar-to-content separation becomes explicit and consistent,
- portrait and landscape render from identical ownership equations, eliminating current rhythm ambiguity from mixed boundary/internal spacing ownership.
