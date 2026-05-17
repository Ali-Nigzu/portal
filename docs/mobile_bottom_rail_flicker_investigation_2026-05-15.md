# Mobile Bottom-Rail Flicker Forensic Isolation (May 15, 2026)

## 1) Exact visual manifestation
- The flash is localized to the **primary rail row paint region** in the lower cluster (the same vertical band occupied by the `Home` / `Documents` / `Settings` rows), not the main content area and not a full-layout overlap.
- The visible artifact is a **single-frame (or near-single-frame) color snap** where the row highlight momentarily drops to the rail base tone before the next active row highlight appears.
- It is observed during **tap-driven route/active reassignment** (not persistent idle state), and is most noticeable where adjacent rows are transparent-by-default and only the active row carries filled background.
- The affected pixels are inside the row rectangles (including row padding box), i.e. the band where `.mobile-expanded-row` paints; it does **not** require desktop behavior, backend state, or unrelated sidebar geometry to reproduce.

## 2) Exact frame/layer sequence
Frame ordering for a lower-rail tap A -> B is:
1. **Frame N (pre-tap steady):** row A has `mobile-expanded-row--active`; row B is transparent; base rail/nav background is continuously painted.
2. **Input->state handoff:** `handleMobileActionRowClick(...)` performs route navigation path handling; render state recomputes `primaryActivePath` from location.
3. **Frame N+1 (class handoff boundary):** class ownership flips away from A before B reaches its settled active-filled visual state in the same interaction window.
4. **Frame N+2..N+k (140ms transition window):** B is transitioning its `background-color` while all non-active rows remain transparent; the rail base is visible as an intermediate result.
5. **Frame terminal:** B reaches stable active fill, artifact disappears until next reassignment.

This sequence is mechanically enabled by:
- active class ownership being route-derived per render (`primaryActivePath === item.path`),
- rows defaulting to `background: transparent`, and
- row-level `background-color` transition (`140ms ease`) on primary-rail rows.

## 3) Exact exposed layer
- The flash reveals **`P_base`** (the base painted rail/nav background), not an uninitialized black frame, not a browser tap overlay, and not cross-layout overlap.
- Paint owners involved:
  - Rail base owner: `.vrm-layout--mobile .vrm-primary-rail` + `.vrm-layout--mobile .vrm-primary-nav` (`background: var(--vrm-bg-secondary)`).
  - Active owner: `.mobile-expanded-row--active` on individual rows.
- Because row backgrounds are transparent when not active, the momentary loss/transition of active ownership exposes the base rail paint through the same row region.

## 4) Refined invariant model (with `P_gap`)
Let:
- `P_base(t)`: continuously painted base rail layer at frame `t`.
- `P_active(A,t)`: active-row highlight for prior row A at frame `t`.
- `P_active(B,t)`: active-row highlight for next row B at frame `t`.
- `P_gap(t)`: visible region in the lower-rail interaction band that is not covered by the intended active transition ownership during A->B handoff.

Required invariant:
- `P_gap(t) = ∅` for all interaction frames `t`.

Observed violation path:
- Current model allows a handoff interval where `P_active(A,t)` is removed/decaying and `P_active(B,t)` is not yet stably established as the intended visual owner, so the user sees base paint through the active band. That interval is the effective `P_gap` event in UX terms (ownership discontinuity in the highlight domain).

## 5) Deterministic implementation strategy (no implementation yet)
1. Keep `P_base` continuously painted (already true) and make it the guaranteed containment domain for all active-row visuals.
2. Move active-indicator ownership to a **single stable highlight owner** that is not destroyed/recreated during A->B reassignment (i.e., no two independent row-owned fills racing through transparent defaults).
3. Ensure A->B visual transfer is atomic from the user-visible perspective: at every frame either old highlight still covers or new highlight already covers the interaction band, with no exposure interval in the highlight domain.
4. Preserve strict scope: mobile primary rail only; no desktop, no auth/backend/demo systems, no landscape-scroll or portrait-overlap work.

## 6) Mathematical/logical guarantee argument
If future implementation enforces:
1. continuous `P_base(t)`,
2. a single continuous active-highlight ownership function `H(t)` entirely inside `P_base`, and
3. no frame where both previous and next highlight ownership are absent from the intended active band,

then by construction:
- `P_gap(t) = ∅` for every frame,
- there exists no frame path that can visually manifest a highlight-domain flash,
- therefore the mobile bottom-rail flicker is eliminated (not masked), because the exposure path itself is removed from the state-transition graph.
