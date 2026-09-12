# Compact UI validation — 2026-09-12

The existing video, two-track mixer and playback layout is retained. Settings prose,
routine success notices, tap-analysis diagnostics and playback clock/decode logs
were removed. Short errors, progress, recording sound choices, history deletion
scope and selection prerequisites remain visible. “1” is named “1拍目” in controls
and accessible labels; analysis draft and saved video origin have distinct labels.

Changes affecting layout:

- Speed settings fit in both 390 × 700 portrait and 844 × 390 landscape without
  scrolling. Landscape uses two columns.
- Gamma and contrast share a row. Sliders, skeleton visibility, background mode and
  mirror switches remain available.
- The portrait first-beat settings panel is 46 px shorter; its preview stage grows
  from 282 to 328 px at 390 × 700. All first-beat controls fit in the panel.
- Source pickers remain separate; tracks remain visible; full-screen video layout
  and tap controls are unchanged, with the fallback explanatory paragraph removed.

Verification:

- `npm test`: 228 tests pass.
- `npm run check`, `npm run build`: pass.
- `built-compact-ui.mjs`: portrait/landscape, empty pickers, comparison, overlay,
  speed panel without scrolling, every settings tab, persisted precise speed and
  origin, and a forced storage failure that remains visible and keeps settings open.
- `built-rhythm-history.mjs`: real audio analysis, beat/midpoint fit, saved/draft
  separation, cross-tab origin editing, separate-audio tempo and history reload.
- `built-camera.mjs`: camera selection, fallback, recording with speed changes.
- `built-motion.mjs`: tracking confirmation, cancel, undo/reapply and tempo invalidation.
- `built-viewer.mjs`: native/fallback full screen, tap controls, precomputed bones
  and display settings.
- `static-output.mjs`: project-relative assets and static hosting output.

Screenshots and before/after layout measurements stay outside the public repository.
Checks used desktop Chrome with phone-sized viewports; actual iPhone Safari hardware
was not available for this run. The same checks gate GitHub Pages deployment.
