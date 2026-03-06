---
type: bug
status: backlog
priority: high
severity: medium
epic: "[[Diagram Rendering and Connectors]]"
assignee:
sprint:
created: 2026-03-02
due:
environment: web (all browsers)
tags: [guides, ux, layout, canvas]
---

# Guide drag clamped to 0-1 range prevents canvas expansion

## Description

Guide positions are normalized to the `[0, 1]` range and hard-clamped during drag. This means the rightmost vertical guide (or bottommost horizontal guide) cannot be dragged beyond the current canvas bounding box. In an infinite-canvas model, users should be able to expand the diagram area by dragging any guide outward — the coordinate system should dynamically re-normalize to accommodate the new extent.

## Steps to Reproduce

1. Open any guide-based diagram (e.g., Trading Pipeline)
2. Show guides (toggle "Show Guides")
3. Attempt to drag the rightmost vertical guide further to the right, past the current canvas edge
4. The guide stops at position 1.0 and cannot be moved further

Same behavior applies to:
- Leftmost vertical guide (cannot go below 0.0)
- Topmost horizontal guide (cannot go above 0.0)
- Bottommost horizontal guide (cannot go below 1.0)

## Expected Behavior

Dragging a guide beyond the current `[0, 1]` range should:
1. Allow the guide to move to positions like 1.2, 1.5, etc.
2. Dynamically re-normalize **all** guide and node coordinates so the new extent maps back to `[0, 1]` (or the range expands to accommodate)
3. The canvas viewport expands accordingly — all existing content scales/repositions to maintain relative layout
4. The experience should feel like an infinite canvas where the grid can always grow

## Actual Behavior

Guide positions are hard-clamped to `[0, 1]` with `Math.max(0, Math.min(1, ...))`. The guide hits an invisible wall at the canvas edge and cannot be dragged further.

## Root Cause

Hard clamping in four locations:

1. **`GuideLines.tsx` line ~65** (primary drag handler):
   ```ts
   const newPosition = Math.max(0, Math.min(1, ds.startPosition + normalizedDelta));
   ```

2. **`FlowDiagram.tsx` line ~557, ~568** (Alt+drag detach creating new guides):
   ```ts
   position: Math.max(0, Math.min(1, centerY / canvasHeight)),
   position: Math.max(0, Math.min(1, centerX / canvasWidth)),
   ```

3. **`FlowDiagram.tsx` line ~618, ~621** (normal drag updating guide positions):
   ```ts
   return { ...g, position: Math.max(0, Math.min(1, centerY / canvasHeight)) };
   return { ...g, position: Math.max(0, Math.min(1, centerX / canvasWidth)) };
   ```

The `canvasWidth` (1200) and `canvasHeight` (calculated from image ratio) are treated as fixed bounds. The normalized coordinate system assumes `[0, 1]` is the entire world.

## Fix

### Approach: Dynamic re-normalization on overflow

When a guide is dragged beyond `[0, 1]`, recalibrate all coordinates:

1. **Remove the clamp** — allow `newPosition` to go negative or exceed 1.0
2. **After the drag completes** (on pointer-up), compute the new global extent:
   ```
   minPos = min(all guide positions)
   maxPos = max(all guide positions)
   ```
3. If `minPos < 0` or `maxPos > 1`, **re-normalize everything**:
   - Map all guide positions from `[minPos, maxPos]` to `[margin, 1 - margin]` (e.g., margin = 0.05 to leave breathing room)
   - Adjust all node spatial coordinates by the same transform
   - Update `canvasWidth` / `canvasHeight` or `imageDimensions` if needed
4. **During the drag** (on pointer-move), allow temporary out-of-range values. The canvas render should extend dynamically (e.g., render guides at their actual pixel positions even if beyond the original canvas rect). Re-normalization only happens when the drag ends, to avoid jitter.

### Files affected

| File | Change |
|------|--------|
| `packages/web/src/components/GuideLines.tsx` | Remove clamp on line ~65; add re-normalization on pointer-up |
| `packages/web/src/components/FlowDiagram.tsx` | Remove clamp in Alt+drag and normal-drag guide updates (~lines 557, 568, 618, 621) |
| `packages/web/src/lib/guide-layout.ts` | Ensure layout handles positions outside `[0, 1]` gracefully |

### Edge cases

- **Dragging inward past other guides**: Re-normalization should maintain relative ordering. If a user drags the rightmost guide left past a middle guide, the guides swap order — but the position values stay correct.
- **All guides at same position**: Degenerate case — skip normalization.
- **Undo/redo**: The re-normalization is captured by the existing snapshot system (snapshot on drag-start, new positions committed on drag-end).
- **Auto-save**: The re-normalized positions should round-trip correctly through `flowToSpec` since spatial coordinates are already `[0, 1]` normalized.
