---
type: story
status: done
priority: high
epic: "Diagram Rendering and Connectors"
assignee:
sprint:
estimate:
created: 2026-03-08
due:
tags: [editor, state-management, spec-fidelity]
---

# Semantic resize — edit the class, not the instance

## User Story
**As a** diagram author
**I want** resizing a node to update the size category it belongs to (and all siblings in that category)
**So that** the diagram spec remains the single source of truth and my edits are fully captured in a way an LLM can reason about

## Context

Objectify diagrams are not pixel art — they are programmatic, LLM-editable specifications. Every user action in the editor should map to a semantic spec change, not a pixel-level override.

This principle is already implemented for **node positioning**:
- **Normal drag** = move the guideline → all siblings move (editing the layout class)
- **Alt+drag** = detach from guideline → deliberate structural break (creating a new instance)

Resize should follow the **same pattern**:
- **Normal resize** = resize the size category → all nodes with the same `sizeId` change
- **Alt+resize** = this node needs its own size → create a new `sizePalette` entry, assign only to this node

Currently, NodeResizer updates pixel dimensions that get serialized via auto-save, but:
1. The `sizePalette` entry is not updated — so re-layout overwrites the resize
2. Sibling nodes with the same `sizeId` are not affected
3. The resize is effectively lost on LLM edit or tab switch

## Acceptance Criteria

- [x] Normal resize: dragging a node's resize handle updates the `sizePalette` entry for that node's `sizeId`, causing all nodes sharing that `sizeId` to resize
- [x] Alt+resize: holding Alt while resizing creates a new `sizePalette` entry (auto-named, e.g. `"custom-size-<timestamp>-1"`) and assigns it only to the resized node
- [x] Size changes survive tab switch, LLM edit, and page reload
- [x] The spec's `sizePalette` reflects the actual rendered sizes at all times
- [x] Visual feedback: brief highlight or indicator on sibling nodes when a normal resize propagates to them

## Technical Notes

### Current flow (broken):
```
User resizes → NodeResizer updates n.width/n.height → auto-save reads pixel dims
→ flowToDiagram() writes to spec → BUT sizePalette entry unchanged
→ Re-layout reads sizePalette → original size restored → user's resize lost
```

### Target flow:
```
User resizes → onResizeEnd callback captures new dims
→ Normalize to 0-1 (divide by REFERENCE_CANVAS_WIDTH/HEIGHT)
→ IF normal resize: update sizePalette[sizeId].width/height
  → All nodes with same sizeId re-render at new size
→ IF alt+resize: create new sizePalette entry, assign to this node only
→ Save snapshot for undo
→ Auto-save persists updated spec
```

### Key files:
- `FlowDiagram.tsx` — add `onResizeEnd` handler, modifier key detection
- `flow-to-spec.ts` — ensure sizePalette updates are serialized correctly
- `guide-layout.ts` — reads sizePalette for layout; should use updated entries
- Node components (`ColorBoxNode.tsx`, `ShapeNode.tsx`, `GroupNode.tsx`) — NodeResizer already present, may need event forwarding

### Design decisions:
- Tolerance threshold: if user resizes within ~5px of an existing sizePalette entry, snap to it rather than creating a new one
- Naming: auto-generated IDs like `"main-node-1"` or `"custom-size-1"`
- The modifier key (Alt) is consistent with alt+drag for detaching from guides

## Out of Scope
- Edge anchor movement (reconnecting edges to different handle positions) — separate story
- Shape changes (changing rectangle to rounded-rect) — already handled via context menu
- Multi-select resize (resizing several selected nodes at once)
