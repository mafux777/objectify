# Creating Objectify Diagrams Compliant with Spec

## What Is Objectify?

Objectify is a diagram editor that renders interactive, editable diagrams from a structured JSON specification. Instead of drag-and-drop drawing, diagrams are defined as data: nodes (boxes), edges (arrows), guides (alignment grid), and palettes (colors, shapes, sizes). The editor renders this spec into a live canvas where users can move nodes, edit labels, and refine the layout.

## Why This Document Exists

This document enables any AI agent to produce a valid Objectify spec from a text description — no UI, no API, no image upload. Just generate JSON that conforms to this spec and it will render as an interactive diagram.

## Spec Version

Use **version `"8.0"`** (the latest). It supports all features: guides, multi-labels, container shapes, ball-socket markers, stroke width, smooth-repelled routing, and per-object descriptions.

---

## Top-Level Structure

```json
{
  "version": "8.0",
  "description": "A text description of the entire diagram.",
  "palette": [...],
  "shapePalette": [...],
  "sizePalette": [...],
  "semanticTypes": [...],
  "diagrams": [...]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Always `"8.0"` |
| `description` | Yes | Human-readable summary of what the diagram depicts |
| `palette` | Yes | Array of color definitions (max 20) |
| `shapePalette` | Yes | Array of shape definitions (max 15) |
| `sizePalette` | Yes | Array of size class definitions (max 20) |
| `semanticTypes` | No | Array of conceptual archetypes (max 30) |
| `diagrams` | Yes | Array of diagram objects (usually 1) |

---

## Palettes

Palettes define reusable design tokens. Nodes and edges reference palette entries by ID.

### Color Palette

Every color used anywhere in the spec must appear in the palette. All hex values must be 6-digit uppercase hex (e.g. `#FF9800`).

```json
"palette": [
  { "id": "white", "hex": "#FFFFFF", "percentage": 40, "name": "White" },
  { "id": "light-blue", "hex": "#BBDEFB", "percentage": 20, "name": "Light Blue" },
  { "id": "dark-text", "hex": "#333333", "percentage": 5, "name": "Dark Text" }
]
```

- `id`: Unique kebab-case identifier
- `hex`: 6-digit hex color (`#RRGGBB`), uppercase
- `percentage`: Estimated visual area percentage (0–100), used for ordering
- `name`: Human-readable name

### Shape Palette

```json
"shapePalette": [
  { "id": "service-box", "kind": "rounded-rectangle", "name": "Service Box" },
  { "id": "database", "kind": "cylinder", "name": "Database" },
  { "id": "decision", "kind": "diamond", "name": "Decision" }
]
```

Available `kind` values:
- `rectangle` — sharp corners (default for groups/containers)
- `rounded-rectangle` — rounded corners (most common for services/components)
- `circle` — equal width and height
- `ellipse` — oval shape
- `diamond` — rotated square (decisions in flowcharts)
- `parallelogram` — slanted rectangle (I/O in flowcharts)
- `hexagon` — six-sided shape
- `arrow-shape` — arrow-shaped node
- `cloud` — cloud outline (cloud providers, logical groupings)
- `cylinder` — database icon (top ellipse + body)

### Size Palette

Defines size classes so nodes of the same type render at identical dimensions. Values are normalized 0–1 fractions (relative to an abstract canvas, not pixels).

```json
"sizePalette": [
  { "id": "standard", "width": 0.12, "height": 0.06, "name": "Standard Node" },
  { "id": "wide", "width": 0.18, "height": 0.06, "name": "Wide Node" },
  { "id": "small", "width": 0.08, "height": 0.05, "name": "Small Node" }
]
```

Typical values:
- Standard node: `width: 0.10–0.15`, `height: 0.05–0.08`
- Wide node: `width: 0.16–0.22`, `height: 0.05–0.08`
- Small node: `width: 0.06–0.09`, `height: 0.04–0.06`

### Semantic Types (Optional)

Group nodes by conceptual role. Multiple nodes can share the same semantic type.

```json
"semanticTypes": [
  { "id": "api-service", "name": "API Service", "description": "HTTP API endpoint" },
  { "id": "database", "name": "Database", "description": "Data storage layer" }
]
```

---

## Diagrams

The `diagrams` array contains one or more diagram objects. Most specs have exactly one.

```json
"diagrams": [{
  "id": "main",
  "title": "My Architecture",
  "description": "Overview of the system components and their interactions.",
  "direction": "RIGHT",
  "nodes": [...],
  "edges": [...],
  "guides": [...]
}]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `title` | Yes | Display title |
| `description` | No | Subtitle / explanation |
| `direction` | No | Primary flow: `RIGHT` (default), `DOWN`, `LEFT`, `UP` |
| `nodes` | Yes | Array of node objects |
| `edges` | Yes | Array of edge objects |
| `guides` | Yes | Array of guide line objects (MUST have ≥1 horizontal + ≥1 vertical) |
| `legend` | No | Legend configuration |

---

## Guides (Critical)

**Guides are mandatory.** Every diagram must have at least one horizontal guide and one vertical guide. Guides define a 2D alignment grid. Leaf nodes snap to guide intersections via `guideRow` and `guideColumn`.

Think of guides as invisible rows and columns. Horizontal guides define rows (y-axis positions), vertical guides define columns (x-axis positions). Positions are normalized 0–1.

```json
"guides": [
  { "id": "row-0", "index": 0, "direction": "horizontal", "position": 0.3, "label": "Top Row" },
  { "id": "row-1", "index": 1, "direction": "horizontal", "position": 0.7, "label": "Bottom Row" },
  { "id": "col-0", "index": 0, "direction": "vertical",   "position": 0.2, "label": "Left" },
  { "id": "col-1", "index": 1, "direction": "vertical",   "position": 0.5, "label": "Center" },
  { "id": "col-2", "index": 2, "direction": "vertical",   "position": 0.8, "label": "Right" }
]
```

### Guide Rules

1. **Minimum**: At least 1 horizontal + 1 vertical guide per diagram
2. **Position range**: 0.0 (top/left edge) to 1.0 (bottom/right edge). Keep values between 0.05 and 0.95 to leave margin
3. **Even spacing**: For N columns, space them evenly. E.g., 3 columns → positions 0.2, 0.5, 0.8
4. **Unique intersections**: Each `(guideRow, guideColumn)` pair must be unique across all leaf nodes — no two leaf nodes at the same grid cell
5. **Index numbering**: Rows numbered top-to-bottom starting at 0, columns left-to-right starting at 0

### Spacing Guidelines

For good visual results:
- **2 columns**: 0.35, 0.65
- **3 columns**: 0.2, 0.5, 0.8
- **4 columns**: 0.15, 0.38, 0.62, 0.85
- **2 rows**: 0.35, 0.65
- **3 rows**: 0.2, 0.5, 0.8

Leave enough space between guides so nodes don't overlap. Minimum spacing: 0.15 between adjacent guides.

---

## Nodes

Nodes are the boxes, shapes, and containers in the diagram.

### Leaf Node (Box)

```json
{
  "id": "api-gateway",
  "label": "API Gateway",
  "description": "Routes incoming HTTP requests to backend services.",
  "type": "box",
  "style": {
    "backgroundColor": "#BBDEFB",
    "textColor": "#333333",
    "borderColor": "#1E88E5",
    "borderStyle": "solid"
  },
  "shapeId": "service-box",
  "sizeId": "standard",
  "semanticTypeId": "api-service",
  "guideRow": "row-0",
  "guideColumn": "col-1"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique kebab-case identifier |
| `label` | Yes | Display text inside the node |
| `description` | No | Tooltip text on hover |
| `type` | Yes | `"box"` for leaf nodes, `"group"` for containers |
| `style` | Yes | Visual styling (see below) |
| `shapeId` | Yes* | References shape palette entry |
| `sizeId` | Yes* | References size palette entry |
| `semanticTypeId` | No | References semantic type entry |
| `guideRow` | Yes* | ID of horizontal guide for vertical position |
| `guideColumn` | Yes* | ID of vertical guide for horizontal position |
| `parentId` | No | ID of parent group if nested inside a container |

*Required for leaf nodes in guide-based layouts.

### Group Node (Container)

Groups visually enclose child nodes. Children reference their parent via `parentId`.

```json
{
  "id": "backend-services",
  "label": "Backend Services",
  "type": "group",
  "style": {
    "backgroundColor": "#F5F5F5",
    "textColor": "#333333",
    "borderColor": "#999999",
    "borderStyle": "dashed"
  },
  "shapeId": "service-box",
  "guideRow": "row-0",
  "guideColumn": "col-1",
  "guideRowBottom": "row-2",
  "guideColumnRight": "col-3"
}
```

Groups use four guide references to define their bounds:
- `guideRow` + `guideColumn` → top-left corner
- `guideRowBottom` + `guideColumnRight` → bottom-right corner

If these are omitted, the group auto-sizes to fit its children.

**Convention**: Use `dashed` borders for logical groupings, `solid` borders for physical containers.

### Node Style

```json
"style": {
  "backgroundColor": "#BBDEFB",
  "textColor": "#333333",
  "borderColor": "#1E88E5",
  "borderStyle": "solid",
  "opacity": 1
}
```

- `backgroundColor`: Hex color from palette (required)
- `textColor`: Hex color, defaults to `#000000`
- `borderColor`: Hex color, defaults to gray if omitted
- `borderStyle`: `solid` | `dashed` | `dotted`, defaults to `solid`
- `opacity`: 0–1, defaults to 1

### Multi-Labels (Optional)

For nodes that need labels at multiple positions:

```json
"labels": [
  { "text": "Backend Services", "position": "12:00" },
  { "text": "v2.1", "position": "4:30", "font": { "fontSize": 10 } }
]
```

Clock positions: `center`, `12:00` (above), `1:30` (top-right), `3:00` (right), `4:30` (bottom-right), `6:00` (below), `7:30` (bottom-left), `9:00` (left), `10:30` (top-left).

When `labels` is present, it supersedes the `label` and `labelPosition` fields. The primary label is `labels[0]`.

---

## Edges

Edges are arrows connecting nodes.

```json
{
  "id": "edge-1",
  "source": "api-gateway",
  "target": "user-service",
  "label": "REST API",
  "description": "Forwards authenticated user requests.",
  "sourceAnchor": "3:00",
  "targetAnchor": "9:00",
  "style": {
    "lineStyle": "solid",
    "color": "#333333",
    "strokeWidth": 1.5
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g. `edge-1`, `edge-2`) |
| `source` | Yes | ID of the source node |
| `target` | Yes | ID of the target node |
| `label` | No | Text displayed on the arrow |
| `description` | No | Tooltip text on hover |
| `sourceAnchor` | **Yes** | Clock position where the edge leaves the source node |
| `targetAnchor` | **Yes** | Clock position where the edge arrives at the target node |
| `style` | No | Line styling |
| `sourceMarker` | No | Marker at source end: `arrow` | `ball` | `socket` | `none` (default: `none`) |
| `targetMarker` | No | Marker at target end: `arrow` | `ball` | `socket` | `none` (default: `arrow`) |

### Anchor Assignment Rules

**Anchors are mandatory.** Every edge must have `sourceAnchor` and `targetAnchor`. Use clock notation:

| Position | Clock | Use When |
|----------|-------|----------|
| Top center | `12:00` | Edge goes upward |
| Top-right corner | `1:30` | Diagonal to upper-right |
| Right center | `3:00` | Edge goes rightward |
| Bottom-right corner | `4:30` | Diagonal to lower-right |
| Bottom center | `6:00` | Edge goes downward |
| Bottom-left corner | `7:30` | Diagonal to lower-left |
| Left center | `9:00` | Edge goes leftward |
| Top-left corner | `10:30` | Diagonal to upper-left |

**Common patterns:**

- **Same row, left → right**: source `3:00`, target `9:00`
- **Same row, right → left**: source `9:00`, target `3:00`
- **Same column, top → bottom**: source `6:00`, target `12:00`
- **Same column, bottom → top**: source `12:00`, target `6:00`
- **Diagonal down-right**: source `4:30` or `3:00`, target `10:30` or `9:00`
- **Diagonal down-left**: source `7:30` or `9:00`, target `1:30` or `3:00`

### Edge Style

```json
"style": {
  "lineStyle": "solid",
  "color": "#333333",
  "routingType": "smoothstep",
  "strokeWidth": 1.5
}
```

- `lineStyle`: `solid` | `dashed` | `dotted`
- `color`: Hex color from palette
- `routingType`: `straight` | `step` | `smoothstep` | `bezier` (do NOT set `smooth-repelled` — it is auto-applied for guide layouts)
- `strokeWidth`: 0.5–8.0 (default 1.5). Use 2.5+ for emphasized flows

### Edge Markers

For UML-style connectors:

```json
{
  "id": "edge-provides",
  "source": "auth-service",
  "target": "api-gateway",
  "sourceMarker": "ball",
  "targetMarker": "socket",
  "sourceAnchor": "3:00",
  "targetAnchor": "9:00"
}
```

- `ball` = filled circle (provided interface / lollipop)
- `socket` = half-circle arc (required interface)
- `arrow` = standard arrowhead
- `none` = plain line end

### Multi-Labels on Edges

```json
"labels": [
  { "text": "HTTP/2", "position": "center" },
  { "text": "async", "position": "source" }
]
```

Positions: `center` (midpoint), `source` (near source), `target` (near target).

---

## Legend (Optional)

```json
"legend": {
  "title": "Legend",
  "nodeEntries": [
    { "label": "API Service", "color": "#BBDEFB", "shapeId": "service-box" },
    { "label": "Database", "color": "#C8E6C9", "shapeId": "database" }
  ],
  "edgeEntries": [
    { "label": "Data flow", "lineStyle": "solid", "color": "#333333" },
    { "label": "Optional", "lineStyle": "dashed", "color": "#999999" }
  ]
}
```

---

## Validation Rules (Must Pass)

These rules are enforced by the schema validator. Violating any of them will cause the spec to be rejected.

1. **Guides required**: Every diagram must have ≥1 horizontal guide AND ≥1 vertical guide
2. **Anchors required**: Every edge must have both `sourceAnchor` and `targetAnchor`
3. **Valid references**: All `source`/`target` on edges must reference valid node IDs
4. **Valid palette refs**: All `shapeId`, `sizeId`, `semanticTypeId` must reference existing palette entries
5. **Unique grid cells**: No two leaf nodes may share the same `(guideRow, guideColumn)` pair
6. **Hex format**: All colors must be 6-digit hex (`#RRGGBB`), uppercase
7. **Normalized values**: All spatial/guide positions must be between 0 and 1
8. **Group containment**: Nodes with `parentId` must reference a valid group node
9. **Valid IDs**: All IDs should be kebab-case strings

---

## Example A: Horizontal Microservices Architecture

Demonstrates: horizontal flow, `cylinder` shape, diagonal edges, dashed edges, mixed stroke widths, semantic types.

```json
{
  "version": "8.0",
  "description": "A web application architecture with an API gateway routing to two backend services and a shared database.",
  "palette": [
    { "id": "blue", "hex": "#BBDEFB", "percentage": 25, "name": "Blue" },
    { "id": "green", "hex": "#C8E6C9", "percentage": 25, "name": "Green" },
    { "id": "orange", "hex": "#FFE0B2", "percentage": 15, "name": "Orange" },
    { "id": "gray", "hex": "#F5F5F5", "percentage": 20, "name": "Gray" },
    { "id": "white", "hex": "#FFFFFF", "percentage": 10, "name": "White" },
    { "id": "dark", "hex": "#333333", "percentage": 5, "name": "Dark" }
  ],
  "shapePalette": [
    { "id": "rounded", "kind": "rounded-rectangle", "name": "Rounded Rectangle" },
    { "id": "db", "kind": "cylinder", "name": "Database" }
  ],
  "sizePalette": [
    { "id": "standard", "width": 0.13, "height": 0.07, "name": "Standard" },
    { "id": "db-size", "width": 0.10, "height": 0.09, "name": "Database" }
  ],
  "semanticTypes": [
    { "id": "gateway", "name": "Gateway", "description": "Entry point for external traffic" },
    { "id": "service", "name": "Service", "description": "Backend microservice" },
    { "id": "datastore", "name": "Datastore", "description": "Persistent data storage" }
  ],
  "diagrams": [
    {
      "id": "main",
      "title": "Web App Architecture",
      "description": "Request flow from API gateway through backend services to database.",
      "direction": "RIGHT",
      "nodes": [
        {
          "id": "api-gateway",
          "label": "API Gateway",
          "description": "Routes incoming HTTP requests to the appropriate backend service.",
          "type": "box",
          "style": { "backgroundColor": "#FFE0B2", "textColor": "#333333", "borderStyle": "solid" },
          "shapeId": "rounded",
          "sizeId": "standard",
          "semanticTypeId": "gateway",
          "guideRow": "row-0",
          "guideColumn": "col-0"
        },
        {
          "id": "user-service",
          "label": "User Service",
          "description": "Handles user authentication and profile management.",
          "type": "box",
          "style": { "backgroundColor": "#BBDEFB", "textColor": "#333333", "borderStyle": "solid" },
          "shapeId": "rounded",
          "sizeId": "standard",
          "semanticTypeId": "service",
          "guideRow": "row-0",
          "guideColumn": "col-1"
        },
        {
          "id": "order-service",
          "label": "Order Service",
          "description": "Processes and manages customer orders.",
          "type": "box",
          "style": { "backgroundColor": "#BBDEFB", "textColor": "#333333", "borderStyle": "solid" },
          "shapeId": "rounded",
          "sizeId": "standard",
          "semanticTypeId": "service",
          "guideRow": "row-1",
          "guideColumn": "col-1"
        },
        {
          "id": "database",
          "label": "PostgreSQL",
          "description": "Shared relational database for all services.",
          "type": "box",
          "style": { "backgroundColor": "#C8E6C9", "textColor": "#333333", "borderStyle": "solid" },
          "shapeId": "db",
          "sizeId": "db-size",
          "semanticTypeId": "datastore",
          "guideRow": "row-0",
          "guideColumn": "col-2"
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "source": "api-gateway",
          "target": "user-service",
          "label": "Auth requests",
          "sourceAnchor": "3:00",
          "targetAnchor": "9:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2.5 }
        },
        {
          "id": "edge-2",
          "source": "api-gateway",
          "target": "order-service",
          "label": "Order requests",
          "sourceAnchor": "4:30",
          "targetAnchor": "9:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2.5 }
        },
        {
          "id": "edge-3",
          "source": "user-service",
          "target": "database",
          "label": "Queries",
          "sourceAnchor": "3:00",
          "targetAnchor": "9:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-4",
          "source": "order-service",
          "target": "database",
          "label": "Queries",
          "sourceAnchor": "3:00",
          "targetAnchor": "6:00",
          "style": { "lineStyle": "dashed", "color": "#333333", "strokeWidth": 1 }
        }
      ],
      "guides": [
        { "id": "row-0", "index": 0, "direction": "horizontal", "position": 0.35 },
        { "id": "row-1", "index": 1, "direction": "horizontal", "position": 0.65 },
        { "id": "col-0", "index": 0, "direction": "vertical",   "position": 0.2 },
        { "id": "col-1", "index": 1, "direction": "vertical",   "position": 0.5 },
        { "id": "col-2", "index": 2, "direction": "vertical",   "position": 0.8 }
      ]
    }
  ]
}
```

**Layout**: Row 0 has API Gateway → User Service → PostgreSQL. Row 1 has Order Service below User Service. Diagonal edge from gateway (`4:30`) to order service (`9:00`).

---

## Example B: Vertical Flowchart with Decisions and Groups

Demonstrates: top-down flow (`direction: "DOWN"`), `diamond` shape for decisions, group containers with explicit guide bounds, dotted edges, multi-labels, legend, feedback loops (upward edges).

```json
{
  "version": "8.0",
  "description": "A CI/CD pipeline flowchart showing code commit through build, test, deploy decision, and deployment to staging or rollback.",
  "palette": [
    { "id": "white", "hex": "#FFFFFF", "percentage": 40, "name": "White" },
    { "id": "blue", "hex": "#BBDEFB", "percentage": 15, "name": "Blue" },
    { "id": "green", "hex": "#C8E6C9", "percentage": 10, "name": "Green" },
    { "id": "red", "hex": "#FFCDD2", "percentage": 10, "name": "Red" },
    { "id": "yellow", "hex": "#FFF9C4", "percentage": 10, "name": "Yellow" },
    { "id": "gray-bg", "hex": "#F5F5F5", "percentage": 10, "name": "Gray Background" },
    { "id": "dark", "hex": "#333333", "percentage": 3, "name": "Dark Text" },
    { "id": "red-border", "hex": "#D32F2F", "percentage": 2, "name": "Red Border" }
  ],
  "shapePalette": [
    { "id": "rounded", "kind": "rounded-rectangle", "name": "Process Step" },
    { "id": "decision", "kind": "diamond", "name": "Decision" },
    { "id": "rect", "kind": "rectangle", "name": "Container" }
  ],
  "sizePalette": [
    { "id": "step", "width": 0.14, "height": 0.06, "name": "Step" },
    { "id": "diamond-size", "width": 0.12, "height": 0.08, "name": "Decision" }
  ],
  "diagrams": [
    {
      "id": "pipeline",
      "title": "CI/CD Pipeline",
      "description": "Automated build, test, and deployment pipeline with rollback on failure.",
      "direction": "DOWN",
      "nodes": [
        {
          "id": "build-group",
          "label": "Build & Test",
          "type": "group",
          "style": { "backgroundColor": "#F5F5F5", "textColor": "#333333", "borderStyle": "dashed" },
          "shapeId": "rect",
          "guideRow": "row-0",
          "guideColumn": "col-0",
          "guideRowBottom": "row-2",
          "guideColumnRight": "col-2"
        },
        {
          "id": "commit",
          "label": "Code Commit",
          "type": "box",
          "parentId": "build-group",
          "style": { "backgroundColor": "#BBDEFB", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "step",
          "guideRow": "row-0",
          "guideColumn": "col-1"
        },
        {
          "id": "build",
          "label": "Build",
          "type": "box",
          "parentId": "build-group",
          "style": { "backgroundColor": "#BBDEFB", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "step",
          "guideRow": "row-1",
          "guideColumn": "col-0"
        },
        {
          "id": "test",
          "label": "Run Tests",
          "type": "box",
          "parentId": "build-group",
          "style": { "backgroundColor": "#BBDEFB", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "step",
          "guideRow": "row-1",
          "guideColumn": "col-2"
        },
        {
          "id": "deploy-decision",
          "label": "Tests pass?",
          "type": "box",
          "style": { "backgroundColor": "#FFF9C4", "textColor": "#333333" },
          "shapeId": "decision",
          "sizeId": "diamond-size",
          "guideRow": "row-2",
          "guideColumn": "col-1"
        },
        {
          "id": "staging",
          "label": "Deploy to Staging",
          "description": "Automated deployment to the staging environment for QA review.",
          "type": "box",
          "style": { "backgroundColor": "#C8E6C9", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "step",
          "guideRow": "row-3",
          "guideColumn": "col-0",
          "labels": [
            { "text": "Deploy to Staging", "position": "center" },
            { "text": "auto", "position": "6:00", "font": { "fontSize": 10 } }
          ]
        },
        {
          "id": "rollback",
          "label": "Rollback",
          "type": "box",
          "style": { "backgroundColor": "#FFCDD2", "textColor": "#333333", "borderColor": "#D32F2F" },
          "shapeId": "rounded",
          "sizeId": "step",
          "guideRow": "row-3",
          "guideColumn": "col-2"
        }
      ],
      "edges": [
        {
          "id": "edge-commit-build",
          "source": "commit",
          "target": "build",
          "sourceAnchor": "7:30",
          "targetAnchor": "12:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2 }
        },
        {
          "id": "edge-commit-test",
          "source": "commit",
          "target": "test",
          "sourceAnchor": "4:30",
          "targetAnchor": "12:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2 }
        },
        {
          "id": "edge-build-decision",
          "source": "build",
          "target": "deploy-decision",
          "sourceAnchor": "6:00",
          "targetAnchor": "10:30",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-test-decision",
          "source": "test",
          "target": "deploy-decision",
          "sourceAnchor": "6:00",
          "targetAnchor": "1:30",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-decision-staging",
          "source": "deploy-decision",
          "target": "staging",
          "label": "Yes",
          "sourceAnchor": "7:30",
          "targetAnchor": "12:00",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2.5 }
        },
        {
          "id": "edge-decision-rollback",
          "source": "deploy-decision",
          "target": "rollback",
          "label": "No",
          "sourceAnchor": "4:30",
          "targetAnchor": "12:00",
          "style": { "lineStyle": "dotted", "color": "#D32F2F", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-rollback-commit",
          "source": "rollback",
          "target": "commit",
          "label": "retry",
          "sourceAnchor": "12:00",
          "targetAnchor": "3:00",
          "style": { "lineStyle": "dotted", "color": "#D32F2F", "strokeWidth": 1 }
        }
      ],
      "guides": [
        { "id": "row-0", "index": 0, "direction": "horizontal", "position": 0.12 },
        { "id": "row-1", "index": 1, "direction": "horizontal", "position": 0.35 },
        { "id": "row-2", "index": 2, "direction": "horizontal", "position": 0.58 },
        { "id": "row-3", "index": 3, "direction": "horizontal", "position": 0.82 },
        { "id": "col-0", "index": 0, "direction": "vertical",   "position": 0.2 },
        { "id": "col-1", "index": 1, "direction": "vertical",   "position": 0.5 },
        { "id": "col-2", "index": 2, "direction": "vertical",   "position": 0.8 }
      ],
      "legend": {
        "title": "Legend",
        "nodeEntries": [
          { "label": "Process step", "color": "#BBDEFB", "shapeId": "rounded" },
          { "label": "Decision gate", "color": "#FFF9C4", "shapeId": "decision" },
          { "label": "Success outcome", "color": "#C8E6C9", "shapeId": "rounded" },
          { "label": "Failure outcome", "color": "#FFCDD2", "shapeId": "rounded" }
        ],
        "edgeEntries": [
          { "label": "Main flow", "lineStyle": "solid", "color": "#333333" },
          { "label": "Failure path", "lineStyle": "dotted", "color": "#D32F2F" }
        ]
      }
    }
  ]
}
```

**Key patterns shown**:
- `direction: "DOWN"` for vertical flowcharts
- Diamond decision node with Yes/No branching via diagonal anchors (`7:30`/`4:30`)
- Group container with `guideRow`/`guideColumn`/`guideRowBottom`/`guideColumnRight`
- Children with `parentId` referencing the group
- Feedback loop: rollback → commit (upward edge using `12:00` → `3:00`)
- Dotted red edges for failure paths, thick solid edges for happy path
- Multi-label on staging node (name + "auto" annotation at `6:00`)
- Legend with both node and edge entries

---

## Example C: UML Component Diagram with Ball-Socket Markers

Demonstrates: ball/socket markers, `cloud` shape, bidirectional edges, ellipse shapes, varied colors, `opacity`, edges between groups and their children.

```json
{
  "version": "8.0",
  "description": "A cloud-hosted e-commerce platform showing component interfaces using UML ball-socket notation. The cloud container holds internal services that expose and consume interfaces.",
  "palette": [
    { "id": "white", "hex": "#FFFFFF", "percentage": 35, "name": "White" },
    { "id": "cloud-bg", "hex": "#E3F2FD", "percentage": 20, "name": "Cloud Background" },
    { "id": "purple", "hex": "#E1BEE7", "percentage": 12, "name": "Purple" },
    { "id": "teal", "hex": "#B2DFDB", "percentage": 12, "name": "Teal" },
    { "id": "amber", "hex": "#FFE082", "percentage": 8, "name": "Amber" },
    { "id": "pink", "hex": "#F8BBD0", "percentage": 5, "name": "Pink" },
    { "id": "dark", "hex": "#333333", "percentage": 5, "name": "Dark" },
    { "id": "gray-line", "hex": "#999999", "percentage": 3, "name": "Gray Line" }
  ],
  "shapePalette": [
    { "id": "rounded", "kind": "rounded-rectangle", "name": "Service Component" },
    { "id": "cloud", "kind": "cloud", "name": "Cloud Environment" },
    { "id": "ellipse", "kind": "ellipse", "name": "External Actor" },
    { "id": "hex", "kind": "hexagon", "name": "Gateway" }
  ],
  "sizePalette": [
    { "id": "component", "width": 0.13, "height": 0.07, "name": "Component" },
    { "id": "actor", "width": 0.10, "height": 0.06, "name": "Actor" },
    { "id": "gateway-size", "width": 0.11, "height": 0.08, "name": "Gateway" }
  ],
  "semanticTypes": [
    { "id": "service", "name": "Internal Service" },
    { "id": "external", "name": "External System" },
    { "id": "gateway", "name": "API Gateway" }
  ],
  "diagrams": [
    {
      "id": "components",
      "title": "E-Commerce Platform Components",
      "description": "Internal services communicate via provided/required interfaces. External actors connect through the API gateway.",
      "direction": "RIGHT",
      "nodes": [
        {
          "id": "cloud-env",
          "label": "AWS Cloud",
          "type": "group",
          "style": { "backgroundColor": "#E3F2FD", "textColor": "#333333", "borderStyle": "dashed", "opacity": 0.8 },
          "shapeId": "cloud",
          "guideRow": "row-0",
          "guideColumn": "col-1",
          "guideRowBottom": "row-2",
          "guideColumnRight": "col-3"
        },
        {
          "id": "api-gw",
          "label": "API Gateway",
          "type": "box",
          "parentId": "cloud-env",
          "style": { "backgroundColor": "#FFE082", "textColor": "#333333" },
          "shapeId": "hex",
          "sizeId": "gateway-size",
          "semanticTypeId": "gateway",
          "guideRow": "row-1",
          "guideColumn": "col-1"
        },
        {
          "id": "catalog-svc",
          "label": "Catalog Service",
          "type": "box",
          "parentId": "cloud-env",
          "style": { "backgroundColor": "#E1BEE7", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "component",
          "semanticTypeId": "service",
          "guideRow": "row-0",
          "guideColumn": "col-2"
        },
        {
          "id": "order-svc",
          "label": "Order Service",
          "type": "box",
          "parentId": "cloud-env",
          "style": { "backgroundColor": "#B2DFDB", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "component",
          "semanticTypeId": "service",
          "guideRow": "row-2",
          "guideColumn": "col-2"
        },
        {
          "id": "payment-svc",
          "label": "Payment Service",
          "type": "box",
          "parentId": "cloud-env",
          "style": { "backgroundColor": "#F8BBD0", "textColor": "#333333" },
          "shapeId": "rounded",
          "sizeId": "component",
          "semanticTypeId": "service",
          "guideRow": "row-1",
          "guideColumn": "col-3"
        },
        {
          "id": "mobile-app",
          "label": "Mobile App",
          "type": "box",
          "style": { "backgroundColor": "#FFFFFF", "textColor": "#333333", "borderColor": "#999999" },
          "shapeId": "ellipse",
          "sizeId": "actor",
          "semanticTypeId": "external",
          "guideRow": "row-0",
          "guideColumn": "col-0"
        },
        {
          "id": "web-browser",
          "label": "Web Browser",
          "type": "box",
          "style": { "backgroundColor": "#FFFFFF", "textColor": "#333333", "borderColor": "#999999" },
          "shapeId": "ellipse",
          "sizeId": "actor",
          "semanticTypeId": "external",
          "guideRow": "row-2",
          "guideColumn": "col-0"
        }
      ],
      "edges": [
        {
          "id": "edge-mobile-gw",
          "source": "mobile-app",
          "target": "api-gw",
          "label": "HTTPS",
          "sourceAnchor": "4:30",
          "targetAnchor": "10:30",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2 }
        },
        {
          "id": "edge-web-gw",
          "source": "web-browser",
          "target": "api-gw",
          "label": "HTTPS",
          "sourceAnchor": "1:30",
          "targetAnchor": "7:30",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 2 }
        },
        {
          "id": "edge-gw-catalog",
          "source": "api-gw",
          "target": "catalog-svc",
          "sourceAnchor": "1:30",
          "targetAnchor": "9:00",
          "sourceMarker": "none",
          "targetMarker": "arrow",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-gw-order",
          "source": "api-gw",
          "target": "order-svc",
          "sourceAnchor": "4:30",
          "targetAnchor": "9:00",
          "sourceMarker": "none",
          "targetMarker": "arrow",
          "style": { "lineStyle": "solid", "color": "#333333", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-order-payment",
          "source": "order-svc",
          "target": "payment-svc",
          "label": "charge",
          "sourceAnchor": "3:00",
          "targetAnchor": "6:00",
          "sourceMarker": "socket",
          "targetMarker": "ball",
          "style": { "lineStyle": "solid", "color": "#999999", "strokeWidth": 1.5 }
        },
        {
          "id": "edge-catalog-order",
          "source": "catalog-svc",
          "target": "order-svc",
          "label": "inventory check",
          "sourceAnchor": "6:00",
          "targetAnchor": "12:00",
          "sourceMarker": "ball",
          "targetMarker": "socket",
          "style": { "lineStyle": "dashed", "color": "#999999", "strokeWidth": 1 }
        }
      ],
      "guides": [
        { "id": "row-0", "index": 0, "direction": "horizontal", "position": 0.2 },
        { "id": "row-1", "index": 1, "direction": "horizontal", "position": 0.5 },
        { "id": "row-2", "index": 2, "direction": "horizontal", "position": 0.8 },
        { "id": "col-0", "index": 0, "direction": "vertical",   "position": 0.1 },
        { "id": "col-1", "index": 1, "direction": "vertical",   "position": 0.3 },
        { "id": "col-2", "index": 2, "direction": "vertical",   "position": 0.55 },
        { "id": "col-3", "index": 3, "direction": "vertical",   "position": 0.8 }
      ],
      "legend": {
        "title": "Legend",
        "nodeEntries": [
          { "label": "Internal service", "color": "#E1BEE7", "shapeId": "rounded" },
          { "label": "External actor", "color": "#FFFFFF", "shapeId": "ellipse" },
          { "label": "API Gateway", "color": "#FFE082", "shapeId": "hex" }
        ],
        "edgeEntries": [
          { "label": "Provides (ball)", "sourceMarker": "ball", "targetMarker": "none", "lineStyle": "solid", "color": "#999999" },
          { "label": "Requires (socket)", "sourceMarker": "socket", "targetMarker": "none", "lineStyle": "solid", "color": "#999999" }
        ]
      }
    }
  ]
}
```

**Key patterns shown**:
- `cloud` shape for group container with `opacity: 0.8`
- `hexagon` for the API gateway, `ellipse` for external actors
- Ball-socket markers: `sourceMarker: "ball"` / `targetMarker: "socket"` for UML interfaces
- External nodes (mobile, browser) outside the cloud group, no `parentId`
- Internal nodes with `parentId: "cloud-env"`
- 4 columns with uneven spacing (more room for the cloud interior)
- Legend with marker explanations

---

## Checklist Before Submitting a Spec

- [ ] `version` is `"8.0"`
- [ ] `description` is present and descriptive
- [ ] `palette` contains all colors used in node styles and edge styles
- [ ] `shapePalette` contains all shapes referenced by `shapeId`
- [ ] `sizePalette` contains all sizes referenced by `sizeId`
- [ ] Every diagram has ≥1 horizontal guide and ≥1 vertical guide
- [ ] Every leaf node has `guideRow` and `guideColumn`
- [ ] No two leaf nodes share the same `(guideRow, guideColumn)` pair
- [ ] Every edge has `sourceAnchor` and `targetAnchor`
- [ ] All `source`/`target` values on edges reference existing node IDs
- [ ] All hex colors are uppercase 6-digit format (`#RRGGBB`)
- [ ] Group nodes have `type: "group"`, children have `parentId` referencing the group
- [ ] Node IDs are unique kebab-case strings
- [ ] Edge IDs are unique strings
