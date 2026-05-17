# Mobile Secondary Sidebar Misalignment — Runtime Debug Discovery (May 17, 2026)

## 1) Runtime issue visibility confirmation
- Runtime inspected on phone emulation in both portrait and landscape at `/demo/site-a/dashboard`.
- I can reproduce the **perceived** issue: secondary rail feels visually tighter/misaligned relative to adjacent divider/primary lane even though icons appear mathematically centered.
- This means the problem is not simple icon-center math; it is a perceived-centering/geometry mismatch.

## 2) DOM + computed style findings (secondary rail)
Measured from runtime `getBoundingClientRect` + computed styles:

### Portrait
- Secondary rail box: `left=57`, `right=121`, `width=64`.
- CSS token: `--vrm-rail-secondary=56px`.
- Row boxes (`.mobile-expanded-row` in collapsed secondary): `width=48`, centered in rail (`rowLeft=65`, `rowRight=113`).
- Icon boxes: `width=22`, centered in row (`delta icon-center vs row-center = 0`).
- Row style: `justify-content:center`, `align-items:center`, `padding-left/right=0`.

### Landscape
- Same geometry values as portrait for the collapsed rail subsystem:
  - rail width `64`, row width `48`, icon-center delta `0`.

### Key computed observation
- Runtime rendered rail width (`64`) does **not** match rail token (`56`).
- Effective left/right inset from rail edge to row edge is ~`8px` each side (`65-57`, `121-113`).

## 3) Classification of root cause
Primary classification: **F) compound effect (geometry + alignment mismatch)**

Contributing factors:
- **A-like geometry effect**: perceived lane density comes from actual rendered rail box being wider than the nominal token chain (56 token vs 64 rendered box) while interactive row remains fixed to 48.
- **D-like perceptual shift**: adjacent divider/neighbor lane context plus this extra inset changes perceived center rhythm.
- **Not B/C**: flex alignment is functioning; icon centers are mathematically centered, no asymmetric icon wrapper padding/margin found.
- **Not E** (from sampled rows): no min-width/intrinsic overflow forcing icon offset in this secondary collapsed state.

## 4) Runtime explanation
- The icon is centered within the row, and the row is centered within the rendered rail.
- But the rendered secondary rail has an effective width/inset profile that diverges from the intended tokenized lane width, creating a visual rhythm mismatch against divider/neighbor lanes.
- User-visible result: icons look “off”/rail feels narrow or oddly balanced despite perfect local center math.

## 5) Evidence artifacts
- Screenshots:
  - `/tmp/secondary_portrait_full.png`
  - `/tmp/secondary_landscape_full.png`
- Structured runtime measurement dump:
  - `/tmp/secondary_diag.json`

## 6) Ready for next phase
- Debug discovery is complete.
- Ready to move to fix-planning/implementation phase with root cause anchored in runtime geometry ownership mismatch (not icon-centering math failure).
