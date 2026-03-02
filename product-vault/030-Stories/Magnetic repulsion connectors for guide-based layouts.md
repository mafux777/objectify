---
type: story
status: backlog
priority: high
epic: "[[Diagram Rendering and Connectors]]"
assignee:
sprint:
estimate:
created: 2026-03-01
due:
tags: [connectors, rendering, guide-layout, ux]
---

# Magnetic Repulsion Connectors for Guide-Based Layouts

## User Story
**As a** user viewing an Objectify spec diagram with guide-based layout
**I want** connectors to default to smooth-bend routing that magnetically repels away from guidelines
**So that** connector mid-segments route through the empty channels between guidelines, reducing visual clutter and preventing connectors from being hidden behind nodes sitting on those guides

## Problem

Today, connectors default to `straight` routing (`getStraightPath`). When many nodes sit on a shared guideline row or column, straight-line connectors pass directly along or near those guidelines — right through the area where other nodes live. This causes:

- Connectors obscured behind nodes they don't belong to
- Visual ambiguity about which nodes a connector actually links
- Diagram readability degrades as density increases

## Proposed Behavior

1. **Default routing switches from `straight` to a new `smooth-repelled` type** for guide-based diagrams (diagrams where `diagram.guides` is present)
2. The connector renders as a **smooth-bend (orthogonal with rounded corners)**, similar to today's `smoothstep`
3. The **long middle segment** of the connector is pushed toward the **midpoint of the channel between adjacent guidelines**, away from both the source guide and target guide
4. The result: connectors naturally flow through the whitespace between rows/columns of nodes

### Visual Example

```
Guide Row A  ──── [Node 1] ──────────────── [Node 3] ────
                      │                         ▲
                      │   ← long segment here   │
                      │      (midpoint of        │
                      │       channel A↔B)       │
                      │                         │
Guide Row B  ──── [Node 2] ──── [Node 4] ──────────────
```

Instead of the connector from Node 1→Node 3 cutting straight across Row A (where Node 3 and other nodes sit), the vertical jog drops down into the gap between Row A and Row B, then runs horizontally through that empty channel before turning back up.

## Technical Approach

### 1. New routing type: `smooth-repelled`

Add a fifth `routingType` option to the edge schema and `CustomEdge`:

```
"straight" | "bezier" | "step" | "smoothstep" | "smooth-repelled"
```

This keeps backward compatibility — existing diagrams with explicit routing types are unaffected. Only the **default** changes for guide-based layouts.

### 2. Custom path function

React Flow's built-in `getSmoothStepPath` has no concept of guidelines. We need a custom `getRepelledSmoothPath()` that:

- Takes the standard inputs (source/target position, source/target handle)
- **Additionally takes**: the guide positions relevant to this edge (the row/column guides the source and target nodes sit on, plus adjacent guides)
- Computes the "channel midpoint" — the midpoint between the source node's guide and the nearest adjacent guide on the connector's exit side
- Generates an SVG path with:
  - A short perpendicular stub from the source handle
  - A smooth bend into the channel
  - A long segment running through the channel midpoint
  - A smooth bend back toward the target
  - A short perpendicular stub into the target handle
- Corner radius should be configurable (default ~8px)

### 3. Guide context in edge rendering

Currently `CustomEdge` receives only source/target coordinates and `data.*` props. To compute repulsion, edges need guide positions. Options:

- **(A) React context** — expose the `guides[]` array from `FlowDiagram` via React context so `CustomEdge` can read it directly. Lightweight, no schema changes.
- **(B) Precompute in `spec-to-flow`** — when building edges, attach `data.sourceGuides` and `data.targetGuides` (the normalized guide positions for the source/target nodes). More explicit, but couples layout to edge data.
- **(C) Global store** — if we move to Zustand or similar, guides become globally accessible.

**Recommendation: (A)** — a simple `GuidesContext` is the least invasive and keeps the edge component self-contained.

### 4. Repulsion algorithm (the interesting part)

The core idea borrows from PCB channel routing:

```
Given:
  sourceGuide = the guide (row or column) the source node is on
  targetGuide = the guide the target node is on
  adjacentGuides = sorted list of all guides on the relevant axis

For the perpendicular axis (the "jog"):
  1. Identify the exit direction from the source handle
  2. Find the nearest guide on that side of sourceGuide
  3. channelMid = (sourceGuide.position + nearestAdjacentGuide.position) / 2
  4. Route the long segment at channelMid

For the parallel axis (same-guide connections):
  1. If source and target are on the same guide, pick the side
     with more room (look at the nearest guide above vs below)
  2. Route through that channel
```

**Edge cases to handle:**
- **Same-guide connections**: source and target on the same row. Connector must still jog away — pick the wider adjacent channel
- **Edge guides (outermost)**: no adjacent guide on one side. Use a fixed margin (e.g., 40px beyond the outermost guide)
- **Multi-guide crossings**: when source and target are separated by several guide rows/columns, route through the channel closest to the midpoint between them, or do a staircase through each channel
- **Diagonal connections**: source and target differ on both row and column — need two jogs (one per axis), each through respective channels
- **Overlapping channels**: if multiple connectors route through the same channel, apply a small spread offset (e.g., ±4px per connector) to prevent them from stacking on the same pixel line
- **Manual override**: if a user explicitly sets `routingType: "straight"` or `"bezier"` in the spec, respect that — repulsion only applies to the default/`smooth-repelled` type

### 5. Files affected

| File | Change |
|------|--------|
| `packages/schema/src/diagram-spec.ts` | Add `"smooth-repelled"` to `routingType` enum |
| `packages/web/src/components/edges/CustomEdge.tsx` | Add `smooth-repelled` case calling new path function |
| `packages/web/src/components/edges/getRepelledPath.ts` | **New file** — the repulsion path computation |
| `packages/web/src/components/FlowDiagram.tsx` | Provide `GuidesContext` wrapping `<ReactFlow>` |
| `packages/web/src/lib/spec-to-flow.ts` | Default `routingType` to `"smooth-repelled"` when `diagram.guides` exists |
| `packages/web/src/lib/guide-layout.ts` | Export guide positions in a format edges can consume |

## Acceptance Criteria
- [ ] Guide-based diagrams default to `smooth-repelled` routing
- [ ] Connector mid-segments visibly route through the channel between guidelines, not along them
- [ ] Smooth rounded bends at each turn (no sharp right angles)
- [ ] Connectors between nodes on the same guideline still route cleanly (jog into nearest channel)
- [ ] Existing diagrams with explicit `routingType` set are unaffected
- [ ] Non-guide diagrams (ELK, spatial) are unaffected — they keep current defaults
- [ ] Multiple connectors sharing a channel don't perfectly overlap (spread offset)
- [ ] Performance: no visible lag on diagrams with 50+ edges

## Design
<!-- Link mockups, wireframes, or describe UI changes -->
No new UI controls needed. This is a rendering behavior change that activates automatically for guide-based layouts. A future follow-up could add a toggle or context menu option to switch between routing types per-edge.

## Out of Scope
- Interactive drag-to-reroute connectors (future)
- Obstacle avoidance around arbitrary nodes (only guides are considered, not node bounding boxes)
- Changes to ELK or spatial layout connector routing
- New connector visual styles (arrowheads, colors, etc.)

## Open Questions
- Should the channel spread offset (for parallel connectors) be deterministic (based on edge index) or optimized to minimize crossings?
- When a connector crosses multiple guide channels in a staircase, should each segment center in its respective channel, or should we pick a single "best" channel?
- Should there be a per-edge override in the spec to opt out of repulsion (e.g., `routingType: "smoothstep"` to get vanilla smooth bends without repulsion)?
