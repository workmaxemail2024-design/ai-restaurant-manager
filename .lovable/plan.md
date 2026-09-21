# iPad usability hardening

## Scope
- Fix the Inventory Item form by correcting the shared overlay sizing and scrolling pattern.
- Apply the same safe viewport, touch scrolling, and reachable-action behavior to shared dialogs and sheets.
- Inspect Manager/Owner operational screens at iPad portrait and landscape sizes, adding only narrow page-specific overflow fixes where shared changes are insufficient.
- Preserve all workflows, calculations, data access, permissions, and visual styling.

## Implementation
- Constrain overlays to the usable dynamic viewport and safe-area insets.
- Keep dialog/sheet headers and action areas visible while long content scrolls internally.
- Preserve safe horizontal scrolling for wide data rather than compressing it.
- Verify Inventory Items and representative long operational forms in 1024×768 and 768×1024 viewports.

## Validation
- Confirm long forms reach every field and primary action with touch-style scrolling.
- Check overlays and popovers remain inside the viewport and controls are not clipped.
- Run focused type/build diagnostics only; no database or business-logic changes.
