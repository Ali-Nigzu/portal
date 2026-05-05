# Mobile Secondary Expanded Tap Debug (Collapsed icons work better than expanded rows)

## Scope
Focused only on mobile secondary sidebar differential behavior:
- collapsed secondary icon tap path
- expanded secondary full-row tap path

## Key finding (root cause)

The unreliable expanded-row behavior is primarily a **hitbox ownership mismatch created by container-level switching metadata**:

1. The **entire secondary panel `<nav>` has `data-mobile-sidebar-switch="site"`**. Because `handleMobilePanelPointerDown` checks `closest("[data-mobile-sidebar-switch='site']")` before action rows, almost any pointerdown inside the expanded panel resolves to `switch-site` first. 
2. On mobile this means many taps inside expanded secondary rows are consumed by panel-level pointerdown (`preventDefault()` + `setMobileSidebarOpen("site")`) before click behavior proceeds.
3. Since the user is already in `mobileSidebarOpen === "site"`, this is a non-state-change swallow that still interferes with reliable click generation/navigation on touch devices.
4. Collapsed icon taps feel better because the visible target and actual narrow clickable icon/row area align more closely; expanded mode introduces larger visible row/label areas while panel-level pointerdown ownership remains broad.

In short: **expanded mode has a broader visual target but also broader panel-level pointerdown interception**, which hurts tap reliability.

## Evidence map

### Event ownership ordering
In `handleMobilePanelPointerDown`, zone resolution order is:
- switch-primary
- switch-site
- action
- disabled
- protected
- close

So if any ancestor has `data-mobile-sidebar-switch='site'`, zone resolves to switch before action. Secondary `<nav>` always has this attribute. Therefore pointerdown in expanded rows often resolves to `switch-site` regardless of row intent.

### Why this disproportionately affects expanded rows
- Expanded secondary displays row labels/right content, inviting taps across full row width.
- But pointerdown routing is still dominated by panel-level `switch-site` on the parent nav.
- Taps on whitespace/label regions that are visually associated with a row but land outside row element boundaries are especially likely to be intercepted as `switch-site` and not navigate.

## Differential: collapsed vs expanded

### Shared row mechanics
Site/page rows are rendered via `NavRow` (`<Link>` when `to` exists) with `onClick` calling `handleMobileActionRowClick`.

### Collapsed secondary icon tap path (works better)
- Visual target is mostly icon-centered and compact.
- User tends to tap directly on the icon element that is inside the actual `<Link>` row.
- Click more frequently reaches row `onClick` handler.

### Expanded secondary row tap path (unreliable)
- Visual target includes label and right-side whitespace.
- Pointerdown still bubbles to nav-level handler; due to switch-first resolution, many taps classify as `switch-site`.
- Result: pointerdown is handled as panel switch/no-op instead of row action, so navigation can fail to fire reliably.

## Task-by-task analysis

## 1) Expanded row DOM/hitbox map

### Site A/Site B rows
- Component: `NavRow` (Link)
- Action attribute: `data-mobile-sidebar-action="site"`
- Parent wrappers: `NavList.vrm-secondary-list` inside `[data-mobile-sidebar-protected="true"]` wrapper (display: contents)
- Visible bounds: full row visual stripe
- Clickable bounds: actual `<a.vrm-nav-row>` box (width:100%)
- Risk: taps near/around row within list container but not on anchor fall to nav switch handler

### Dashboard/Event Logs/Reports rows
- Same structure as above (Link + mobile action click)
- Same risk profile

### Label/right-side area
- `.vrm-nav-row__label` has `flex:1`; row width is 100%, so label/right within row are clickable *if tap lands inside anchor box*.
- Unreliable behavior indicates many taps are likely landing outside actionable anchor or being intercepted earlier by panel handler.

## 2) Pointerdown + click trace (expanded secondary)

### Expanded Site B (representative)
- pointerdown target: often nested span/text within row OR surrounding list area
- `closest('[data-mobile-sidebar-switch="site"]')`: **yes** (secondary nav parent)
- panel `handleMobilePanelPointerDown`: fires, `preventDefault`, `setMobileSidebarOpen("site")`
- because already open to site, state effectively unchanged
- click: may or may not fire row click reliably after preventDefault on pointerdown path
- when click misses/doesn’t dispatch to row -> no navigation

Same failure pattern applies to Dashboard/Event Logs/Reports/Site A-Site B rows.

## 3) All Sites vs Site A/Site B

Why All Sites can feel better:
- All Sites uses `SecondaryPinnedRow` (still NavRow) but is in header/pinned section with clearer visual isolation and less scroll-container ambiguity.
- Site A/Site B rows are in `.vrm-secondary-list` (scrollable region), where taps near row edges/gaps more frequently miss anchor and trigger panel-level switch-site interception.
- All Sites target often differs from current path (more likely to visibly navigate), while some site rows can resolve to equivalent current target and no-op.

## 4) CSS/overlay findings

- `.vrm-extended-panel__mobile-close-zone` is flex filler at bottom, not expected to overlap list rows directly.
- Backdrop z-index (120) is below expanded panels (130), so backdrop is likely not stealing inside-panel taps.
- **Important**: `[data-mobile-sidebar-protected="true"] { display: contents; }` means wrapper has no physical box. It can still appear in `closest()` checks, but does not create a tappable protected surface for gap regions.
- This amplifies gap/near-row taps falling through to panel-level switch handling instead of a real protected container behavior.

## 5) Failure classification

Predominant category: **B/F hybrid**
- **B** click never reliably reaches the action row for some expanded taps.
- **F** panel-level interception (`switch-site`) receives and handles pointerdown first for broad areas.

Not mainly route/data issue; mostly event target ownership/hitbox routing in expanded panel.

## 6) Proposed fix direction (no implementation here)

1. In `handleMobilePanelPointerDown`, resolve `action/disabled/protected/close` **before** `switch-*`.
2. Remove `data-mobile-sidebar-switch="site"` from the entire secondary `<nav>`; attach switch ownership only to explicit collapsed rail targets.
3. Replace `display: contents` protected wrappers with actual block containers in mobile sidebar, so near-row gaps are true protected no-op surfaces.
4. Ensure expanded secondary list rows are explicit full-width mobile action rows with deterministic hitboxes.
5. Keep close-zone explicit and physically separated from actionable list area.

## Proof required for next implementation

Must prove:
- visible expanded row bounds exactly match actionable bounds for Site A/Site B/Dashboard/Event Logs/Reports
- tapping expanded Site B row triggers:
  `handleMobileActionRowClick -> navigate(site-b target) -> setMobileSidebarOpen(null)`
- no panel-level switch handler or backdrop/close-zone receives that row tap first.
