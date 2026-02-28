# Objectify

Convert diagram images into interactive, editable flowcharts using AI vision.

Objectify uses Claude's vision capabilities to analyze PNG/JPEG diagrams and extract structured data—nodes, edges, colors, and spatial positions—then renders them as interactive React Flow diagrams.

## Features

- **AI-powered extraction** — Uses Claude to parse diagrams from images
- **Spatial mode** — Preserves original layout positions and bounding boxes
- **Interactive viewer** — Pan, zoom, and explore diagrams in the browser
- **Auto-layout** — ELK.js-based automatic layout when spatial data isn't needed
- **Nested groups** — Supports container nodes with children
- **Color palette extraction** — Captures colors from the source image

## Packages

| Package | Description |
|---------|-------------|
| `@objectify/cli` | Command-line tool for extracting diagrams from images |
| `@objectify/schema` | Zod schemas and TypeScript types for diagram specs |
| `@objectify/web` | React-based interactive diagram viewer |

## Quick Start

### Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable

### Installation

```bash
npm install
```

### CLI Usage

```bash
# Basic extraction (semantic mode)
npx objectify diagram.png

# Spatial mode (preserves positions from image)
npx objectify diagram.png --spatial

# Custom output directory
npx objectify diagram.png -o ./my-output

# Use a different Claude model
npx objectify diagram.png --model claude-sonnet-4-5-20250514
```

Output is written to `outputs/<image-name>/` by default, containing:
- `diagram-spec.json` — The extracted specification
- A copy of the source image

### Web Viewer

```bash
cd packages/web
npm run dev
```

Open http://localhost:5173, then:
- Click **Load JSON** to open a `diagram-spec.json` file
- Or drag and drop a spec file onto the page
- Use the sample buttons to explore demo diagrams

## Diagram Spec Format

The schema supports both semantic (v1.0) and spatial (v2.0) specifications:

```json
{
  "version": "2.0",
  "description": "Architecture overview showing...",
  "palette": [
    { "id": "blue", "hex": "#2196F3", "percentage": 25 }
  ],
  "diagrams": [
    {
      "id": "main",
      "title": "System Architecture",
      "direction": "RIGHT",
      "layoutMode": "spatial",
      "imageDimensions": { "width": 1200, "height": 800 },
      "nodes": [
        {
          "id": "api-gateway",
          "label": "API Gateway",
          "type": "box",
          "style": { "backgroundColor": "#2196F3", "textColor": "#FFFFFF" },
          "spatial": { "x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1 }
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "source": "api-gateway",
          "target": "backend",
          "label": "REST"
        }
      ]
    }
  ]
}
```

## Development

```bash
# Install all dependencies
npm install

# Run web viewer in dev mode
npm run dev -w @objectify/web

# Build all packages
npm run build -w @objectify/schema
npm run build -w @objectify/web
```

## Tech Stack

- **CLI**: Commander, Anthropic SDK, tsx
- **Schema**: Zod
- **Web**: React 19, React Flow, ELK.js, Vite

## License

MIT

