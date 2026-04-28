# Mobile Demo Sidebar Behavior Plan (Planning Only)

## Scope

This plan is specific to **phone/mobile behavior in demo/site routes rendered by `VRMLayout`**. It does not include backend/data/chart changes and preserves existing desktop sidebar behavior.

## 1) Current architecture map

### Route/layout ownership
- `VRMLayout` is the shared shell used for authenticated, view-token, and demo app routes, including `/demo/:siteId/...` pages.
- Demo mode is selected through route/app mode logic and still renders through the same layout component.

### Sidebar columns and rendering
- **Primary sidebar column**: rendered as `<nav className="vrm-primary-rail">` with app-level items (Home, Sites, Documents, Collapse/Keep Expanded, Settings, Logout).
- **Secondary/site sidebar column**: rendered as `<nav className="vrm-extended-panel">` with search, site selector/back row, and site-level pages (Dashboard, Event Logs, Alarm Logs, Device List, Reports, etc.).
- Both are wrapped in `<div className="vrm-sidebar-shell vrm-sidebar-shell--sites ...">`, which receives expanded/collapsed modifier classes.

### State currently involved
- `keepMenuExpanded`: persisted to `localStorage`; desktop-oriented sticky expand mode.
- `isTouchMode`: set via media query `(hover: none), (pointer: coarse)`; currently forces `keepMenuExpanded = true`.
- Hover/focus/pointer model: `pointerZone`, `isPrimaryFocused`, `isSecondaryFocused`, `sitesIntentOpen`, `forcedSitesExpandOnceActive` drive collapsed/expanded classes.
- Derived booleans: `isPrimaryExpanded`, `isSecondaryExpanded`, `shouldForceCollapse`.

### Current CSS control points
- Width/visibility toggles are class-based in `VRMNavigation.css`:
  - `.vrm-sidebar-shell--primary-collapsed|expanded`
  - `.vrm-sidebar-shell--secondary-collapsed|expanded`
  - widths from `--vrm-primary-rail-width(_collapsed)` and `--vrm-extended-panel-width(_collapsed)`.
- Base shell styles are in `VRMTheme.css` (`.vrm-sidebar-shell`, `.vrm-primary-rail`, `.vrm-extended-panel`).
- There is no dedicated mobile overlay/backdrop/sidebar-open state class today.

## 2) Current mobile failure explanation

Why phone UI gets dominated now:
1. On coarse/touch devices, logic sets `isTouchMode = true` and immediately forces `keepMenuExpanded = true`.
2. `isPrimaryExpanded` and `isSecondaryExpanded` both include `keepMenuExpanded` as a direct expansion condition.
3. Result: both columns stay in expanded desktop widths on touch/mobile, so dashboard width is reduced heavily.
4. Existing pointer listeners for collapse-on-outside are disabled when `isTouchMode` is true, so touch devices do not get the intended transient collapse behavior.

Net effect: current mobile behavior is effectively “always expanded sidebars”, which matches the user-observed issue.

## 3) Proposed mobile state model

### Recommended state shape
Introduce a **mobile-only mutually exclusive state** in `VRMLayout`:

```ts
type MobileSidebarOpen = null | "primary" | "site";
```

Proposed additional derived flag:

```ts
const isMobileViewport = useMediaQuery("(max-width: 768px)");
```

### Ownership
- State owner: `VRMLayout` (already owns sidebar state and refs).
- Desktop and mobile state should be explicitly separated:
  - Desktop keeps existing `keepMenuExpanded` + hover/focus behavior.
  - Mobile uses `mobileSidebarOpen` and ignores desktop hover-expansion model.

### Open/close semantics on mobile
- Default on mobile route entry: `mobileSidebarOpen = null`.
- Tap primary rail/icon area -> `mobileSidebarOpen = "primary"`.
- Tap site rail/icon area -> `mobileSidebarOpen = "site"`.
- Opening one closes the other by construction (single-valued state).
- Tap outside open panel -> `mobileSidebarOpen = null`.
- Optional but recommended: selecting any nav link on mobile also sets `mobileSidebarOpen = null` after navigation intent.

### Why single enum (vs two booleans)
- Prevents impossible double-open states naturally.
- Encodes the invariant “at most one expanded sidebar on mobile” without extra guards.
- Makes outside-click logic and class mapping simpler and less error-prone.

## 4) Proposed CSS/responsive plan

### Breakpoint strategy
- Use same phone breakpoint as existing layout conventions (`max-width: 768px`) unless product requests a different threshold.
- Apply mobile overlay behavior **only when `isMobileViewport` is true**.

### Mobile collapsed defaults
- Keep compact rail width (~64px) for both columns by default (`mobileSidebarOpen = null`).
- Ensure main content uses full remaining width and stays dominant.

### Expanded behavior on mobile
- Expanded panel should be temporary and layered:
  - Use `position: fixed`/`absolute` + high z-index for active panel.
  - Add backdrop element (`.vrm-sidebar-mobile-backdrop`) while open.
  - Keep non-open rail compact/visible enough for toggling.
- Prefer CSS classes from layout root, e.g.:
  - `.vrm-layout--mobile`
  - `.vrm-layout--mobile-primary-open`
  - `.vrm-layout--mobile-site-open`

### Desktop preservation
- Existing width/collapse classes remain the desktop mechanism.
- Mobile-only classes should be wrapped by media query and/or root state class to avoid desktop regression.
- Keep current desktop toggle row behavior untouched.

## 5) Interaction plan

### Tap/click targets
- Primary open target: primary rail tap target (brand/icon/active row zone).
- Site open target: sites row or secondary compact rail icon zone.
- Codex implementation should prefer explicit button semantics where possible for accessibility.

### Click/tap outside behavior
- Preferred approach: backdrop layer that captures pointerdown and closes (`mobileSidebarOpen = null`).
- Fallback/support: document `pointerdown` with ref boundary checks for shell and active panel.
- Must ignore events that originate inside the active sidebar.

### Keyboard/accessibility
- `Escape` closes open mobile panel.
- Add `aria-expanded` on open triggers.
- Add `aria-hidden` and focus handling for non-active overlay panel as practical.
- If backdrop is used, it should be keyboard reachable only if intended; otherwise mark inert and close on pointer only.

### Navigation click behavior
- On mobile, selecting a nav destination should close panel after route transition starts.
- On desktop, keep existing behavior.

### Viewport resize behavior
- Desktop -> mobile: force `mobileSidebarOpen = null` on breakpoint entry.
- Mobile -> desktop: clear mobile-open classes/backdrop and return to existing desktop logic/state.
- Prevent stale open overlay after resize by listening to breakpoint transitions.

## 6) Desktop protection plan

Explicit safeguards:
1. Gate mobile logic with `isMobileViewport`.
2. Do not modify current desktop `keepMenuExpanded` persistence semantics.
3. Do not remove/override desktop pointer hover expansion model for non-mobile.
4. Keep existing “Collapse Sidebar / Keep Expanded” row functional on desktop only.

Required invariant preserved:
- `!isMobileViewport` => existing desktop sidebar behavior applies unchanged.

## 7) Short proof model

Let:
- `M = isMobileViewport`
- `O = mobileSidebarOpen`
- `C = content usable / not dominated by expanded nav`

Then:
- `M && O = null -> both sidebars collapsed -> C = true`
- `M && tap(primary) -> O = "primary"`
- `M && tap(site) -> O = "site"`
- `M && tap(outside) -> O = null`
- `O` is single-valued (`null | "primary" | "site"`) -> cannot be both open
- `!M -> desktop logic (existing keep/hover/focus model) applies`

Therefore mobile behavior is constrained to temporary sidebar expansion without changing desktop semantics.

## 8) Implementation order

1. Inspect/confirm final trigger targets in `VRMLayout` (primary and site areas).
2. Add `isMobileViewport` and `mobileSidebarOpen` state (default `null` on mobile).
3. Wire mobile open intents (`primary` / `site`) and mutual exclusion.
4. Add outside-click close (backdrop first, ref-check listener second as needed).
5. Add mobile-only classes and CSS for collapsed/expanded overlay behavior.
6. Add Escape handling and minimal ARIA state attributes.
7. Add resize transition guards (mobile <-> desktop).
8. Validate mobile and desktop regression checklist.

## 9) Validation plan

### Mobile checks
- Demo route opens with both sidebars collapsed.
- Dashboard content is immediately visible/usable.
- Tap primary target expands primary sidebar.
- Tap site target expands site sidebar.
- Opening one collapses the other.
- Tap outside collapses currently open sidebar.
- Nav item selection behaves correctly and closes panel when appropriate.
- Rotating/resizing viewport does not leave stuck open overlay.

### Desktop checks
- Existing desktop sidebar behavior unchanged.
- Existing desktop dashboard layout unchanged.
- Existing “Collapse Sidebar / Keep Expanded” still works.

