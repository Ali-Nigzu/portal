# Mobile Sidebar PR #261 Debug/Plan Handover

## 1) Current broken runtime model

On mobile, the implementation currently uses a fixed two-rail shell where the secondary panel is expanded to nearly viewport width (`calc(100vw - 52px)`) when `vrm-layout--mobile-site-open` is active. That yields a visually oversized secondary surface while still relying on mixed event ownership (`panel onPointerDown` + row handlers) and mixed row components (`NavRow` and `MobileSidebarRow`), which can produce row-looking surfaces whose active button does not fully own the perceived row rectangle in all states.

## 2) Current DOM/CSS structure (from static code inspection)

- Primary sidebar: `nav#vrm-primary-rail.vrm-primary-rail`.
- Secondary sidebar: `nav#vrm-secondary-panel.vrm-extended-panel`.
- Mobile state classes are applied on root layout (`vrm-layout--mobile`, `vrm-layout--mobile-primary-open`, `vrm-layout--mobile-site-open`).
- A backdrop button exists (`.vrm-sidebar-mobile-backdrop`) and closes sidebars when pointer down occurs outside rails.
- Row rendering is hybrid:
  - Mobile branches use `MobileSidebarRow` in many places.
  - Desktop branches use `NavRow`/`SecondaryPinnedRow`, but some mobile-adjacent paths still reuse desktop row styling and wrappers.

## 3) Why widening the panel did not fix row clickability

Because width of the panel (`.vrm-extended-panel`) is not equivalent to ownership of row hit areas. Clickability is determined by which element receives pointer/click events in the final stacking/event path. A wider panel can still have row-like visual space painted by container/padding/wrappers while interactive ownership remains on a smaller descendant/button or icon-centric area.

## 4) Pointerdown preventDefault suppression status

Current `MobileSidebarRow` code **does not** call `preventDefault()` in `onPointerDown`; it only calls `stopPropagation()`. `preventDefault()` is used in `onClick`. So the specific historical suspicion about row-level pointerdown preventDefault suppressing click appears **not present in current head**.

## 5) Secondary panel width status

Yes, on mobile site-open state the secondary panel is effectively near-full page width:

- `.vrm-layout--mobile.vrm-layout--mobile-site-open .vrm-extended-panel { width: calc(100vw - 52px); position: absolute; left: 52px; ... }`

This is the rule that makes it visually almost full-page.

## 6) Whether visible row rectangle equals button rectangle today

Not guaranteed. `MobileSidebarRow` is `width: 100%`, but there are still layered wrappers (`[data-mobile-sidebar-protected]`, list containers with independent padding/width rules, and legacy `.vrm-nav-row` paths) that can paint or reserve row-like space separate from the exact button border box in some branches/states.

## 7) Why icon taps can still differ from label/background taps

Top causes from static reasoning:

1. Mixed row systems (`.vrm-nav-row` and `.mobile-expanded-row`) coexist under mobile media rules. Depending on branch/state, labels may be hidden/shown by different selectors, causing perceived row geometry to diverge from actual interactive element bounds.
2. Panel-level `onPointerDown` on `nav` containers can claim non-row areas and trigger open/switch behavior before row click pathways, especially where visual row area includes wrapper padding not inside `[data-mobile-sidebar-row='true']`.

## 8) Root cause candidates (top 2)

1. **Geometry mismatch root cause:** mobile-expanded secondary width is viewport-driven (`calc(100vw - 52px)`) rather than sidebar-design width, combined with list/padding wrappers that can visually extend row areas outside the button.
2. **Event-ownership root cause:** panel-level pointerdown switching/open logic plus hybrid row rendering allows taps in visually row-adjacent spaces to be interpreted as panel gestures instead of row action.

## 9) Fix plan (smallest correction preserving two-sidebar model)

1. **Constrain mobile expanded widths to design vars, not viewport math.**
   - Keep two sidebars only.
   - Use explicit mobile vars for expanded widths (primary/secondary), preserving visible page lane.
2. **Unify row ownership for mobile-expanded rows.**
   - Ensure every visible row background/padding is on the clickable `button`/`a` itself.
   - Remove row-like background from parent wrappers in mobile-expanded contexts.
3. **Harden event boundaries.**
   - Keep row `onPointerDown` as stopPropagation-only.
   - Keep row `onClick` action handling.
   - Panel `onPointerDown` should only act for blank area / switch zones; never row-painted space.
4. **Retain desktop path untouched.**
   - Gate all behavior with `isMobileViewport` / `.vrm-layout--mobile` selectors.

## 10) Mathematical proof sketch for planned fix

Let `R` be a row’s visible rectangle in expanded mobile secondary panel.

Planned constraints:
- `R == B` where `B` is button border-box (`display:flex; width:100%`) and all row paint (bg, padding, active) is on `B`.
- Child icon/label/right have `pointer-events:none`; thus pointer target resolves to `B` for any point inside `R`.
- `onPointerDown(B)` only stops propagation; does not prevent click.
- `onClick(B)` performs action.
- Panel handler early-returns for `target.closest([data-mobile-sidebar-row='true'])`.

Therefore for any point `p ∈ R`:
- target chain includes `B`, panel/backdrop do not own `p`.
- click fires on `B` uniformly.
- icon tap == label tap == background tap.

For any point `p ∉ R`:
- if inside sidebar blank area: panel handler may keep/switch open per rule.
- if outside rails/backdrop region: backdrop handler closes.

## 11) Desktop isolation proof

Planned edits are mobile-scoped only:
- CSS under `@media (max-width: 768px)` with `.vrm-layout--mobile...`
- Event changes remain under existing `isMobileViewport` guards in `VRMLayout`.

No changes to desktop `NavRow`, `SecondaryPinnedRow`, hover/focus expansion logic should be required.

## 12) Commands run

- `pwd; rg --files -g 'AGENTS.md'`
- `sed -n '1,260p' frontend/src/components/VRMLayout.tsx`
- `sed -n '1,260p' frontend/src/components/MobileSidebarRow.tsx`
- `sed -n '1,320p' frontend/src/styles/VRMNavigation.css`
- `sed -n '1,260p' frontend/src/common/components/navigation/NavRow.tsx`
- `rg -n "..." frontend/src/components/VRMLayout.tsx frontend/src/styles/VRMNavigation.css frontend/src/components/MobileSidebarRow.tsx`
- `sed -n '720,840p' frontend/src/components/VRMLayout.tsx`
- `sed -n '860,980p' frontend/src/components/VRMLayout.tsx`
- `sed -n '1120,1320p' frontend/src/components/VRMLayout.tsx`
- `sed -n '460,730p' frontend/src/styles/VRMNavigation.css`
