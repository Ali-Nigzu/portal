# Mobile Sidebar Runtime Verification — UI-System Re-Alignment (May 15, 2026)

This pass intentionally ignores demo business-data depth and tests only sidebar UI runtime behavior.

## Runtime setup
- Route used: `http://127.0.0.1:3000/demo/site-a/dashboard`
- Phone emulation: iPhone 12 portrait + iPhone 12 landscape
- Sidebar engagement path: tap `Sites` to activate secondary panel, then interact in primary rail (`Home`, `Documents`, `Settings`) and sidebar transitions.
- Overflow stress method (runtime-only, no code changes): duplicate existing `.vrm-secondary-list` row nodes in DevTools/Playwright evaluate context to force large content height.

---

## Issue 1 — Landscape secondary sidebar scroll regression

### Runtime reproduction result
**Confirmed at UI-system level** under forced overflow.

Evidence from runtime probes:
- Before forcing overflow: `.vrm-secondary-list` had `scrollHeight=164`, `clientHeight=164`.
- After forcing overflow nodes: `.vrm-secondary-list` became `scrollHeight=2164`, `clientHeight=2164` (no viewport clipping), with `overflow-y:auto` still set.
- Programmatic scroll attempt on list (`scrollTop=180`) remained `0`.
- Ancestor chain showed `.vrm-extended-panel` with `overflow-y:hidden` and fixed viewport-height box in landscape.

### Runtime ownership map
- **Intended scroll owner**: `.vrm-secondary-list`
- **Interfering owner**: `.vrm-extended-panel` (`overflow-y:hidden`) + unconstrained list height behavior in mobile-open state

### Runtime failure mechanism
The list is marked as scrollable but is not height-constrained to the panel viewport in this state; it expands to content height (`clientHeight == scrollHeight`), so it never enters a scrollable state. Parent panel clips overflow (`overflow-y:hidden`), so below-fold content is unreachable. This is a scroll-ownership failure: scroll intent is on child list, clipping is on parent.

### Deterministic fix plan (no implementation yet)
- Enforce a **single scroll owner model** for the secondary region:
  1) Secondary panel must allocate a bounded viewport-height content slot.
  2) `.vrm-secondary-list` must be constrained to that slot (`min-height:0`, bounded flex item) so `clientHeight < scrollHeight` when overflow exists.
  3) Parent panel must not become a vertical scroll/clipping owner that conflicts with list scrolling.

### Runtime invariants
- Exactly one vertical scroll owner exists in secondary rail: `.vrm-secondary-list`.
- If list content exceeds slot height, then `scrollHeight > clientHeight` must hold.
- For all mobile orientations, `list.scrollTop` must increase under wheel/touch/programmatic scroll.

### Guarantee argument
These constraints remove alternate failure paths (parent clipping + child non-scrollability). With one bounded scroll owner, landscape/portrait/state transitions cannot silently switch vertical ownership.

---

## Issue 2 — Portrait sidebar overlap into main content

### Runtime reproduction result
**Not reproduced** in current runtime, but validated through UI-system geometry checks during sidebar state changes.

Evidence:
- Portrait bounds with active sidebar: sidebar right edge = `105`, main left edge = `105`.
- Landscape bounds: sidebar right edge = `105`, main left edge = `105`.
- No overlap (`sidebar.right > main.left` was `false`) across tested transitions.

### Layout ownership map
- **Boundary owner**: `.vrm-layout--mobile` lane model (`.vrm-sidebar-shell` width + `.vrm-main` remaining lane)
- **Potential interferers**: absolute-positioned mobile-open rail states (`.vrm-primary-rail` / `.vrm-extended-panel`) if they are allowed to exceed reserved width without synchronized main-lane offset.

### Boundary failure mechanism (if overlap appears)
Overlap would occur when rendered sidebar width in an open state is greater than reserved lane width while main content still starts at fixed collapsed-lane x-offset. That creates coordinate-system mismatch (visual overlay creep).

### Deterministic fix plan (no implementation yet)
- Keep a single source of truth for reserved sidebar width per mobile state (collapsed / primary-open / site-open).
- Main lane start position must be derived from the same width variable used by visible sidebar geometry.
- Remove any unsynchronized absolute-open width path that can exceed reserved boundary without updating content offset.

### Runtime invariants
- `main.left >= sidebar.right` must hold at all times.
- `reserved_sidebar_width == rendered_sidebar_width` for each mobile state.
- State transitions cannot change rendered width without simultaneously changing reserved width.

### Guarantee argument
A unified boundary variable makes overlap mathematically impossible: content starts at/after sidebar right edge in every state, so no visual creep path remains.

---

## Issue 3 — Bottom primary-sidebar flicker artifact

### Runtime reproduction result
UI interaction path reproduced (rapid repeated taps on `Home` / `Documents` / `Settings`), with style ownership inspection completed.

Observed interaction-layer facts:
- Mobile row primitives are transparent by default and use state-driven background colors (`.mobile-expanded-row--active`, hover rules).
- Mobile rows explicitly set `-webkit-tap-highlight-color: transparent`.
- Lower rail is in a stateful class-switch environment where rapid route changes toggle active row styling while sibling rows remain transparent.

### Interaction/render ownership map
- **Interaction owner**: button rows (`.mobile-expanded-row` / `.vrm-nav-row`) with state classes.
- **Likely render artifact owner**: transient background-color transition path between active-row class reassignment and transparent sibling repaint in the lower primary rail.

### Flicker mechanism
During rapid tap-driven route switches in the lower cluster, the active background token moves across rows while surrounding transparent rows expose underlying rail/background in the same paint cycle. This creates a momentary flash perception in the bottom rail region.

### Deterministic fix plan (no implementation yet)
- Stabilize bottom-rail paint path so row-state transitions do not produce transient unpainted/overpainted strips:
  1) Ensure a stable painted backing layer under interactive rows.
  2) Limit active-state visual mutation to one predictable layer (row background only), without competing rail-level repaints.
  3) Avoid hover-style participation on coarse touch paths for these rows.

### Runtime invariants
- At most one row owns active-highlight paint at a time.
- Bottom rail region always has a stable backing paint during pointer down/up and route transition frames.
- No touch transition frame should expose a temporary transparent gap in the interactive rail area.

### Guarantee argument
By forcing a single, stable paint owner and removing competing transient layers, the flash path is eliminated instead of merely reduced.

---

## Regression-risk isolation (planning stage)
- Issue 1 fix scope is limited to secondary panel/list overflow ownership and sizing constraints.
- Issue 2 fix scope is limited to mobile sidebar reservation variables and main-lane offset coupling.
- Issue 3 fix scope is limited to bottom-rail interaction paint layering.
- No backend/auth/session/data behavior is involved.
