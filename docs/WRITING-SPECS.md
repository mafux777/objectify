# Writing DiagramSpec Files

This guide explains how to write a DiagramSpec JSON file by hand (or with AI assistance) to describe a system architecture, workflow, or any visual diagram. You can use this to give an AI agent in another repository the ability to describe that repo's structure visually.

## What is a DiagramSpec?

A DiagramSpec is a JSON format that describes diagrams with:
- **Nodes** — boxes representing components, services, or concepts
- **Edges** — arrows showing relationships and data flow
- **Guides** — alignment grid for consistent layout
- **Palettes** — reusable colors, shapes, sizes, and semantic types

## Quick Start: Minimal Example

```json
{
  "version": "8.0",
  "description": "A simple two-node diagram showing data flow from A to B.",
  "diagrams": [{
    "id": "main",
    "title": "Simple Flow",
    "direction": "RIGHT",
    "layoutMode": "auto",
    "nodes": [
      {
        "id": "node-a",
        "label": "Source",
        "type": "box",
        "style": { "backgroundColor": "#C8E6C9", "textColor": "#000000" }
      },
      {
        "id": "node-b",
        "label": "Destination",
        "type": "box",
        "style": { "backgroundColor": "#BBDEFB", "textColor": "#000000" }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "node-a",
        "target": "node-b",
        "label": "sends data"
      }
    ]
  }]
}
```

## Top-Level Structure

```json
{
  "version": "8.0",
  "description": "Detailed text description of what the diagram shows...",
  "palette": [...],          // Optional: color definitions
  "shapePalette": [...],     // Optional: shape definitions
  "sizePalette": [...],      // Optional: size classes
  "semanticTypes": [...],    // Optional: node archetypes
  "diagrams": [...]          // Required: array of diagrams
}
```

### Version History
- `1.0` — Basic semantic structure
- `2.0` — (Deprecated, spatial positioning removed)
- `3.0` — Adds guide lines and label positioning
- `4.0` — Adds multi-label support
- `5.0` — Adds container shapes (cloud, cylinder) and ball-socket markers
- `6.0` — Adds step routing and strokeWidth
- `7.0` — Adds smooth-repelled routing for guide-based layouts
- `8.0` — Adds per-object description fields

## Nodes

Each node represents a box or container in the diagram.

```json
{
  "id": "api-gateway",              // Unique kebab-case ID
  "label": "API Gateway",           // Display text
  "description": "Routes requests", // Optional: tooltip text
  "type": "box",                    // "box" or "group"
  "parentId": "cloud-container",    // Optional: for nested nodes
  "style": {
    "backgroundColor": "#2196F3",
    "textColor": "#FFFFFF",
    "borderColor": "#1976D2",
    "borderStyle": "solid"          // "solid", "dashed", "dotted"
  },
  "shapeId": "rounded-rect",        // References shapePalette entry
  "sizeId": "standard",             // References sizePalette entry
  "semanticTypeId": "service",      // References semanticTypes entry
  "guideRow": "row-1",              // Horizontal alignment
  "guideColumn": "col-2",           // Vertical alignment
  "orderHint": 0                    // Layout ordering (lower = left/top)
}
```

### Node Types
- `"box"` — Regular leaf node
- `"group"` — Container that holds other nodes (children set `parentId`)

### Label Positioning
Use clock notation: `"center"`, `"12:00"`, `"3:00"`, `"6:00"`, `"9:00"`, `"1:30"`, `"4:30"`, `"7:30"`, `"10:30"`

## Edges

Each edge represents an arrow/connection between nodes.

```json
{
  "id": "edge-1",
  "source": "api-gateway",
  "target": "backend-service",
  "label": "REST API",
  "description": "JSON over HTTPS",   // Optional: tooltip text
  "sourceAnchor": "3:00",              // Clock notation for exit point
  "targetAnchor": "9:00",              // Clock notation for entry point
  "style": {
    "lineStyle": "solid",              // "solid", "dashed", "dotted"
    "color": "#333333",
    "routingType": "smoothstep",       // See routing types below
    "strokeWidth": 1.5                 // 1 (thin) to 4 (heavy)
  },
  "sourceMarker": "none",              // "none", "arrow", "ball", "socket"
  "targetMarker": "arrow"
}
```

### Routing Types
- `"straight"` — Direct line
- `"step"` — Sharp 90° right-angle bends
- `"smoothstep"` — Rounded 90° corners
- `"bezier"` — Smooth S-curve
- `"smooth-repelled"` — Auto for guide-based layouts (don't set explicitly)

## Edge Anchors (Where Connectors Attach)

Every edge has a `sourceAnchor` (where it exits the source node) and `targetAnchor` (where it enters the target node). These use **clock notation** to specify the exact attachment point on the node's boundary.

### Clock Position Reference

```
              10:30    12:00    1:30
                 ╲       │       ╱
                  ┌──────┴──────┐
                  │             │
             9:00 ┤    NODE     ├ 3:00
                  │             │
                  └──────┬──────┘
                 ╱       │       ╲
               7:30    6:00     4:30
```

| Position | Location | Common Use |
|----------|----------|------------|
| `"12:00"` | Top center | Vertical flows, inputs from above |
| `"3:00"` | Right center | Horizontal left-to-right flows |
| `"6:00"` | Bottom center | Vertical flows, outputs downward |
| `"9:00"` | Left center | Horizontal flows, inputs from left |
| `"1:30"` | Top-right corner | Diagonal connections |
| `"4:30"` | Bottom-right corner | Diagonal or feedback loops |
| `"7:30"` | Bottom-left corner | Diagonal connections |
| `"10:30"` | Top-left corner | Diagonal or back-references |

Legacy values `"top"`, `"right"`, `"bottom"`, `"left"` are accepted as aliases for `"12:00"`, `"3:00"`, `"6:00"`, `"9:00"`.

### Choosing Anchors

**Horizontal flow (direction: "RIGHT"):**
```
┌─────────┐           ┌─────────┐
│ Source  ├──3:00→9:00┤  Target │
└─────────┘           └─────────┘
```
```json
{ "sourceAnchor": "3:00", "targetAnchor": "9:00" }
```

**Vertical flow (direction: "DOWN"):**
```
┌─────────┐
│ Source  │
└────┬────┘
     │ 6:00
     ↓ 12:00
┌────┴────┐
│ Target  │
└─────────┘
```
```json
{ "sourceAnchor": "6:00", "targetAnchor": "12:00" }
```

**Feedback loop (back to an earlier node):**
```
┌─────────┐           ┌─────────┐
│  Start  ├───────────┤   End   │
└─────────┘           └────┬────┘
     ↑ 12:00               │ 12:00
     └─────────────────────┘
```
```json
{ "source": "end", "target": "start", "sourceAnchor": "12:00", "targetAnchor": "12:00" }
```

**Diagonal connection:**
```
┌─────────┐
│ Source  │
└────────╲┘ 4:30
          ╲
           ↘ 10:30
        ┌───╲─────┐
        │  Target │
        └─────────┘
```
```json
{ "sourceAnchor": "4:30", "targetAnchor": "10:30" }
```

**Multiple edges from one node:**
```
                    ┌──────────┐
              ┌─────┤ Target A │
              │     └──────────┘
┌─────────┐ 1:30
│ Source  ├─3:00────┬──────────┐
└─────────┘ 4:30    │ Target B │
              │     └──────────┘
              │     ┌──────────┐
              └─────┤ Target C │
                    └──────────┘
```
Use different anchors when multiple edges leave the same node to avoid overlapping lines.

### Anchor Selection Tips

1. **Match the flow direction** — For `direction: "RIGHT"`, most edges should exit at `3:00` and enter at `9:00`
2. **Avoid crossing** — Choose anchors that minimize edge crossings
3. **Use corners for diagonals** — `1:30`, `4:30`, `7:30`, `10:30` work well for non-orthogonal connections
4. **Feedback loops** — Use `12:00`→`12:00` (over the top) or `6:00`→`6:00` (under) to loop back
5. **Fan out** — When one node connects to many, use adjacent anchors (e.g., `1:30`, `3:00`, `4:30`)
6. **Omit if unsure** — If you don't specify anchors, the renderer picks sensible defaults

## Edge Markers (Arrowheads and Endpoints)

Each edge can have markers at both ends: `sourceMarker` (where the edge starts) and `targetMarker` (where it ends).

### Marker Types

| Marker | Appearance | Meaning |
|--------|------------|---------|
| `"none"` | Plain line end | No special endpoint |
| `"arrow"` | ▶ Arrowhead | Direction of flow (default for target) |
| `"ball"` | ● Filled circle | "Provides" interface (UML lollipop) |
| `"socket"` | ◠ Half-circle arc | "Requires" interface (UML socket) |

### Common Patterns

**Standard directed edge (default):**
```json
{ "sourceMarker": "none", "targetMarker": "arrow" }
```
```
┌────────┐              ┌────────┐
│   A    │─────────────▶│   B    │
└────────┘              └────────┘
```

**Bidirectional relationship:**
```json
{ "sourceMarker": "arrow", "targetMarker": "arrow" }
```
```
┌────────┐              ┌────────┐
│   A    │◀────────────▶│   B    │
└────────┘              └────────┘
```

**UML-style "provides" interface:**
```json
{ "sourceMarker": "ball", "targetMarker": "none" }
```
```
┌────────┐              ┌────────┐
│   A    │●─────────────│   B    │
└────────┘              └────────┘
```

**UML-style "requires" interface:**
```json
{ "sourceMarker": "none", "targetMarker": "socket" }
```
```
┌────────┐              ┌────────┐
│   A    │─────────────◠│   B    │
└────────┘              └────────┘
```

**Component connection (ball-socket):**
```json
{ "sourceMarker": "ball", "targetMarker": "socket" }
```
```
┌────────┐              ┌────────┐
│Provider│●────────────◠│Consumer│
└────────┘              └────────┘
```

Use ball-socket notation to show that one component provides an interface that another component consumes.

## Guide Lines

Guides create an alignment grid. Nodes snap to guide intersections.

```json
"guides": [
  { "id": "row-0", "index": 0, "direction": "horizontal", "position": 0.2, "label": "Inputs" },
  { "id": "row-1", "index": 1, "direction": "horizontal", "position": 0.5, "label": "Processing" },
  { "id": "col-0", "index": 0, "direction": "vertical", "position": 0.15 },
  { "id": "col-1", "index": 1, "direction": "vertical", "position": 0.45 }
]
```

- **position** — Normalized 0-1 coordinate (y for horizontal, x for vertical)
- Each node references guides via `guideRow` and `guideColumn`
- Each (guideRow, guideColumn) pair must be unique across nodes

## Palettes

### Color Palette
```json
"palette": [
  { "id": "light-blue", "hex": "#BBDEFB", "percentage": 20, "name": "Light Blue" },
  { "id": "light-green", "hex": "#C8E6C9", "percentage": 15, "name": "Light Green" }
]
```

### Shape Palette
```json
"shapePalette": [
  { "id": "rectangle", "kind": "rectangle", "name": "Rectangle" },
  { "id": "rounded-rect", "kind": "rounded-rectangle", "name": "Rounded" },
  { "id": "cylinder", "kind": "cylinder", "name": "Database" }
]
```

Available shapes: `rectangle`, `rounded-rectangle`, `circle`, `ellipse`, `diamond`, `parallelogram`, `hexagon`, `arrow-shape`, `cloud`, `cylinder`

### Size Palette
```json
"sizePalette": [
  { "id": "standard", "width": 0.12, "height": 0.08, "name": "Standard" },
  { "id": "small", "width": 0.08, "height": 0.05, "name": "Small" }
]
```

Dimensions are normalized 0-1 fractions of the canvas.

### Semantic Types
```json
"semanticTypes": [
  { "id": "service", "name": "Backend Service", "description": "API endpoint" },
  { "id": "database", "name": "Database", "description": "Data storage" }
]
```

Nodes with the same functional role should share a semantic type.

## Container Groups

To create nested structures (e.g., services inside a cloud):

```json
{
  "id": "aws-cloud",
  "label": "AWS",
  "type": "group",
  "style": { "backgroundColor": "#FFF3E0", "textColor": "#000000", "borderStyle": "dashed" },
  "shapeId": "cloud",
  "guideRow": "row-0",
  "guideColumn": "col-0",
  "guideRowBottom": "row-2",
  "guideColumnRight": "col-3"
},
{
  "id": "ec2-instance",
  "label": "EC2",
  "type": "box",
  "parentId": "aws-cloud",
  "style": { "backgroundColor": "#FFE0B2", "textColor": "#000000" },
  "guideRow": "row-1",
  "guideColumn": "col-1"
}
```

**Rules:**
- Group nodes must appear BEFORE their children in the nodes array
- Children set `parentId` to reference the container
- Groups can use `guideRowBottom` and `guideColumnRight` for explicit bounds

## Legend

Optional legend panel showing what colors and edge types mean:

```json
"legend": {
  "title": "Legend",
  "nodeEntries": [
    { "semanticTypeId": "service", "label": "Service", "color": "#BBDEFB" }
  ],
  "edgeEntries": [
    { "label": "data flow", "lineStyle": "solid", "targetMarker": "arrow" }
  ]
}
```

## Validation

After writing a spec, validate it using the CLI:

```bash
npx tsx packages/cli/validate.ts path/to/your-spec.json
```

Successful output:
```
✅ Schema validation PASSED
   Version: 8.0
   Diagrams: 1
   Nodes: 5
   Edges: 4
```

Failed output shows specific Zod validation errors to fix.

## Viewing Your Diagram

1. Start the web viewer: `cd packages/web && npm run dev`
2. Open http://localhost:5173
3. Click **Import JSON** and select your spec file
4. Use the command bar to iterate with AI assistance

## Tips for AI Agents

When writing specs for another repository:

1. **Start with the description** — Write a clear text description of what the diagram shows
2. **Identify components** — List all services, modules, or concepts as nodes
3. **Map relationships** — Create edges for data flow, dependencies, or communication
4. **Use guides** — Organize nodes into logical rows and columns
5. **Apply semantic types** — Group similar nodes (all databases, all APIs, etc.)
6. **Validate often** — Run validation after each major change

### Common Patterns

**Microservices Architecture:**
- Row 0: External clients/gateways
- Row 1: API services
- Row 2: Core business logic
- Row 3: Data stores

**Pipeline/Workflow:**
- Single row with columns for each stage
- Edges flow left-to-right with `direction: "RIGHT"`

**Hierarchy/Org Chart:**
- Multiple rows with parent-child relationships
- Use `direction: "DOWN"` for top-to-bottom flow

