# Mobile Sidebar Rebuild Plan (PR #258 follow-up)

## Conclusion up front

Yes — the major fault is that phone behavior is still being implemented as patches on top of desktop interaction architecture rather than through a dedicated phone-first interaction contract.

## 1) Why PR #258 remained brittle

### A. Too many owners for one phone tap
- `onPointerDown` at panel level (`handleMobilePanelPointerDown`) resolves zones and can open/close/switch sidebars.
- `onClick` at row level (`handleMobileActionRowClick`, `handleSitesClick`, `handleSecondaryNavClick`, and direct row handlers) can also navigate and close.
- `Link` default navigation is still present for many rows (`NavRow` renders `<Link>` whenever `to` exists).
- Backdrop pointer handler closes mobile (`closeMobileSidebar`).
- Desktop pointer/focus systems still run in the same component tree.

### B. Desktop and mobile logic are tightly co-located
`VRMLayout` contains both desktop hover/focus/pointer-zone state machines and mobile open/close/navigation behavior in one component.

### C. Primary vs secondary asymmetry
Secondary row handling is comparatively action-first on many rows, but primary still includes desktop-centric entries (e.g., Keep Expanded/Collapse Sidebar) and mixed navigation semantics.

### D. Desktop-only concept still rendered on phone
Keep Expanded / Collapse Sidebar remains rendered in primary list, but it is not a phone-native concept and introduces extra no-op/toggle semantics in touch contexts.

## 2) Tap ownership map (current)

### Panel-level mobile handler
- Function: `handleMobilePanelPointerDown`
- File: `frontend/src/components/VRMLayout.tsx`
- Event type: `pointerdown` (bubble React handler)
- Attached to: primary rail `<nav>` and secondary panel `<nav>`
- Mobile gated: yes (`if (!isMobileViewport) return`)
- Desktop shared: handler attached always, behavior gated
- Calls `preventDefault`: only when opening opposite panel from close-zone branch
- Calls `stopPropagation`: no
- Calls `navigate`: no
- Calls `setMobileSidebarOpen`: yes (switch/open/close)
- Relies on Link default: indirectly (lets action rows proceed)

### Row-level mobile action handler
- Function: `handleMobileActionRowClick`
- Event type: `click`
- Attached to: many `NavRow` rows on both primary and secondary
- Mobile gated: yes early return
- Desktop shared: attached on desktop too, but no-op branch there
- Calls `preventDefault`: yes in mobile path
- Calls `stopPropagation`: yes in mobile path
- Calls `navigate`: yes in mobile path
- Calls `setMobileSidebarOpen`: yes (close after navigate)
- Relies on Link default: no in mobile path; yes in desktop path when `to` exists

### Primary “Sites” row handler
- Function: `handleSitesClick`
- Event type: `click`
- Mobile gated: branch-based
- Behavior: on mobile, opens site panel if not already open; otherwise falls into selector flow.

### Secondary generic closer
- Function: `handleSecondaryNavClick`
- Event type: `click`
- Note: present but not wired broadly in current render tree; indicates iterative patches and ownership drift.

### Backdrop close
- Function: `closeMobileSidebar`
- Event type: `pointerdown`
- Attached to: backdrop button
- Mobile gated: yes
- Calls `setMobileSidebarOpen(null)`.

### Escape close
- Effect keydown handler closes on Escape when mobile panel open.

## 3) Desktop behavior leaking into phone

- Pointer-zone hover model (`pointerZone`, `pointerInsideSidebarRef`, `handlePointerMove`) still runs in component with mobile code.
- Focus collapse/blur effects run from shared effects.
- Keep-expanded state persists and influences classes/rows even in mobile rendering.
- Shared class composition (`vrm-sidebar-shell--*expanded/*collapsed`) is reused for both modes.
- Shared nav primitives (`NavRow` with `Link`) keep mixed semantics unless each row manually overrides with action-first click.

Recommendation: phone should bypass all desktop hover/focus/keep-expanded mechanics rather than coexist with them.

## 4) Collapse path inventory (current)

1. `setMobileSidebarOpen(null)` in `closeMobileSidebar` (backdrop pointerdown) — safe and deliberate.
2. `setMobileSidebarOpen(null)` in `handleSecondaryNavClick` after non-blocked mobile click — unsafe if ever attached broadly because it can close without guaranteed action.
3. `setMobileSidebarOpen(null)` in `handleMobilePanelPointerDown` close-zone branch — conditionally safe only if close-zone never overlaps content.
4. `setMobileSidebarOpen(null)` in `handleMobileActionRowClick` after imperative navigate — safe for action rows.
5. `setMobileSidebarOpen(null)` in Escape key handler — safe/system close.
6. `setMobileSidebarOpen(null)` in viewport-change effect — safe lifecycle reset.

Main risk pattern: panel-level pointerdown + row-level click + potential default Link interplay makes behavior dependent on DOM targeting and propagation rather than a single mobile contract.

## 5) Navigation path map (high-level)

### Primary
- Home: Link + mobile action click override.
- Sites: button/link row with `handleSitesClick` special behavior.
- Documents: Link + mobile action click override when authenticated.
- Keep Expanded/Collapse Sidebar: button toggle (`handleKeepExpandedToggle`), desktop concept.
- Settings: Link + mobile action click override when authenticated.
- Logout: button (`handleLogoutClick`) and async logout flow.

### Secondary
- All Sites/site rows: Link + mobile action click override.
- Dashboard/Event Logs/Alarm Logs/Device List/Reports: Link + mobile action click override.
- Analytics/Forecasts disabled: disabled rows.
- Add site inert: inert div row.
- Admin row(s): Link + mobile action click override.

## 6) Architecture decision

Recommend **Option B (mobile-specific layer), B-lite implementation**:
- Introduce a phone-only sidebar shell/component that owns all phone interactions.
- Reuse route/nav data factories and icons from shared sources.
- Keep existing desktop sidebar render path untouched.
- Do not mount desktop pointer/hover/focus handlers in mobile path.

Rationale: repeated failures indicate local patches inside `VRMLayout` are too coupled to desktop mechanics.

## 7) Phone interaction contract (target)

State: `mobileSidebarOpen: null | "primary" | "site"`.

Rules:
- Collapsed: tap primary rail area opens primary; tap site rail area opens site; no navigation.
- Expanded panel: default inside tap is no-op (keep open).
- Action row: `preventDefault + stopPropagation + navigate/action + close`.
- Disabled/inert/no-op/current row: consume tap and keep open.
- Outside/backdrop: close.
- Explicit close control: close.
- Opposite rail tap: switch panel.

## 8) Desktop protection strategy

- Desktop sidebar remains in existing `VRMLayoutDesktopSidebar` path (extract current desktop JSX/handlers with minimal edits).
- Mobile renders a separate `VRMLayoutMobileSidebar` only when `isMobileViewport` is true.
- No shared pointer/hover/focus listeners in mobile component.
- Keep desktop CSS classes and behavior unchanged.

## 9) High-level implementation plan (no code yet)

1. Extract shared nav data builders (primary items, secondary site/page items) into a pure helper module.
2. Split sidebar rendering:
   - `DesktopSidebarShell` (existing behavior, unchanged logic).
   - `MobileSidebarShell` (new interaction owner).
3. In `MobileSidebarShell`, render two panel components:
   - `MobilePrimaryMenu`
   - `MobileSiteMenu`
4. Replace phone `NavRow` click semantics with explicit mobile row component that never relies on Link default timing.
5. Remove/hide Keep Expanded row from mobile primary panel.
6. Ensure disabled/inert rows are rendered as tappable blockers that consume events and do nothing.
7. Keep backdrop/close button explicit and physically separated from row content zones.
8. Add deterministic switching controls between primary and site rails.

Likely files:
- `frontend/src/components/VRMLayout.tsx` (routing between desktop/mobile components)
- `frontend/src/components/navigation/mobile/*` (new mobile components)
- `frontend/src/components/navigation/shared/*` or `frontend/src/lib/navigation/*` (shared nav data)
- `frontend/src/styles/VRMNavigation.css` (phone-only layout/zone geometry)

## 10) Six-proof model acceptance criteria

1. Desktop isolation proof: mobile component only renders on mobile viewport; desktop component untouched.
2. Inside-tap no-close proof: mobile panel root has no generic close on inside taps.
3. Action-before-close proof: action handler executes navigate/action first, then closes.
4. Disabled/inert stability proof: disabled/inert handlers consume taps and never close.
5. Deliberate-close proof: close-only paths limited to backdrop, explicit close, Escape/lifecycle cleanup.
6. Single-open proof: union state allows only one open panel.

## 11) Validation plan

Phone checks:
- Open primary from collapsed.
- Open site from collapsed.
- Switch primary<->site while expanded.
- Tap each action row and verify navigation occurs and then menu closes.
- Tap disabled/inert/current rows and verify menu stays open.
- Tap gaps/header/protected regions and verify menu stays open.
- Tap explicit close control and verify close.
- Tap outside/backdrop and verify close.
- Verify site switching rows (All Sites, Site A/B).
- Verify page rows (Dashboard/Event Logs/Reports/etc.).
- Verify no collapse-only behavior on actionable rows.

Desktop checks:
- Visual regression spot check for collapsed/expanded desktop behavior.
- Hover/focus/keep-expanded behavior unchanged.
