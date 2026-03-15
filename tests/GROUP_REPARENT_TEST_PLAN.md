# Group Reparenting Test Plan

## Scenario

A multi-layered system diagram with an outer container and 3 inner layers (groups).
Each layer has 3-4 components. One component is in the "wrong" layer and needs to
be moved to another layer via drag.

## Test Fixture: "System Layers"

```
┌─────────────────────────────────────────────────┐
│ System Architecture                              │
│                                                  │
│ ┌─────────────────┐  ┌──────────────────┐       │
│ │ Presentation    │  │ Business Logic    │       │
│ │                 │  │                   │       │
│ │  [Web UI]       │  │  [Auth Service]   │       │
│ │  [Mobile App]   │  │  [Order Engine]   │       │
│ │  [API Gateway]  │  │  [Payment Svc] ← wrong!  │
│ │                 │  │                   │       │
│ └─────────────────┘  └──────────────────┘       │
│                                                  │
│ ┌────────────────────────────────────────┐       │
│ │ Data Layer                              │       │
│ │                                        │       │
│ │  [User DB]  [Order DB]  [Cache]        │       │
│ │                                        │       │
│ └────────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

"Payment Svc" belongs in the Data Layer (it handles payment processing closer to data).

## Test Scenarios

### R1. Node is trapped in its parent group (default behavior)

| Step | Action | Expected |
|------|--------|----------|
| R1.1 | Drag "Payment Svc" toward Data Layer | Node stays within "Business Logic" bounds |
| R1.2 | Release mouse | Node snaps back inside its parent group |

### R2. Alt+drag liberates node from group

| Step | Action | Expected |
|------|--------|----------|
| R2.1 | Alt+drag "Payment Svc" out of Business Logic | Node becomes top-level (no parent) |
| R2.2 | Continue dragging into Data Layer bounds | Node visually enters Data Layer |
| R2.3 | Release mouse inside Data Layer | Node joins Data Layer group |
| R2.4 | Toast appears | "Payment Svc is now part of Data Layer" |
| R2.5 | Verify parentId | Node's parentId = data-layer group ID |

### R3. Alt+drag to empty space (no group)

| Step | Action | Expected |
|------|--------|----------|
| R3.1 | Alt+drag a node out of its group | Node becomes top-level |
| R3.2 | Drop in empty space (outside all groups) | Node stays top-level, no toast |

### R4. Toast auto-dismisses

| Step | Action | Expected |
|------|--------|----------|
| R4.1 | Complete a reparent (R2) | Toast visible |
| R4.2 | Wait 4 seconds | Toast disappears |

### R5. Undo restores original parent

| Step | Action | Expected |
|------|--------|----------|
| R5.1 | Alt+drag to reparent | Node moves to new group |
| R5.2 | Press Ctrl+Z | Node returns to original group |

## Implementation Notes

### Alt+drag on grouped nodes (`onNodeDragStop`)

When `event.altKey` and the dragged node has a `parentId`:

1. **Liberate**: Remove `parentId`, convert position from parent-relative to absolute
2. **Find target group**: Check if node center is within any group's bounding box (excluding the old parent)
3. **Reparent**: If target found, set `parentId` to target group, convert position to target-relative
4. **Toast**: Show summary message using existing `chatSummary` state or a new `dragSummary` state
5. **Guide reassignment**: If target group has guides, snap node to nearest guide intersection within the group

### Position Conversion

- **Parent→Absolute**: `absoluteX = parentX + relativeX`
- **Absolute→NewParent**: `relativeX = absoluteX - newParentX`

### Target Group Detection

```typescript
// Find the smallest group that contains the drop point
const targetGroup = nodes
  .filter(n => n.type === "groupNode" && n.id !== oldParentId)
  .filter(n => {
    const gx = n.position.x, gy = n.position.y;
    const gw = n.width ?? 300, gh = n.height ?? 200;
    return centerX >= gx && centerX <= gx + gw
        && centerY >= gy && centerY <= gy + gh;
  })
  .sort((a, b) => {
    // Prefer the smallest (most nested) group
    const areaA = (a.width ?? 300) * (a.height ?? 200);
    const areaB = (b.width ?? 300) * (b.height ?? 200);
    return areaA - areaB;
  })[0];
```

### Toast UI

Reuse the `.command-bar__summary` style but as a separate element:

```tsx
{dragMessage && (
  <div className="command-bar__summary" style={{ position: "absolute", bottom: 60 }}>
    {dragMessage}
  </div>
)}
```

Auto-dismiss after 4 seconds via `setTimeout`.
