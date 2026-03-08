---
type: epic
status: backlog
priority: medium
owner:
created: 2026-03-08
target-quarter: Q1 2026
tags: [export, png, branding, sharing]
---

# Branded PNG Export

## Objective
Replace the current raw-screenshot PNG export with a polished, branded export that captures only the diagram content (no chrome, no toolbars, no background grid) and adds an Objectify tagline and website URL. The goal is to make every exported PNG a shareable marketing asset.

## Current Behavior
- `html-to-image` (`toPng`) screenshots the entire `.react-flow` canvas element
- Output includes: grid dots, minimap, toolbar panels, any UI overlays
- No branding, watermark, or attribution
- White background, 2x pixel ratio
- Entry points: toolbar "Export PNG" button + tab context menu "Download PNG"

## Desired Behavior

### Content
- Render **only** the diagram nodes and edges — no grid, no minimap, no toolbar, no panel chrome
- Auto-crop to the bounding box of all visible nodes with consistent padding (e.g. 40px)
- White or transparent background (user choice, default white)

### Branding Footer
- Below the diagram, add a branded strip (~40px tall) containing:
  - Left: Objectify logo (small) + "Made with Objectify"
  - Right: `objectify.wiki` (or whatever the production URL is)
- Footer background: subtle gray (`#f5f5f5`) or matches diagram background
- Font: system sans-serif, ~12px, muted gray text (`#888`)
- Footer should be visually distinct but not distracting

### Output Quality
- 2x pixel ratio (retina) — same as current
- PNG format
- Filename: `{document-title}-objectify.png` (slugified title, not UUID)

## Success Criteria
- [ ] Exported PNG contains only diagram elements (no grid, minimap, or toolbar)
- [ ] Bounding box is auto-cropped to content with uniform padding
- [ ] Branded footer with tagline and URL appears below the diagram
- [ ] Filename uses the document title, not a UUID
- [ ] Works from both export entry points (toolbar button + tab context menu)
- [ ] Existing JSON export is unaffected

## User Impact
Users get a clean, professional PNG they can paste into slides, docs, or share on social media. Every export subtly promotes Objectify — free viral marketing.

## Technical Approach (Suggested)

### Option A: Offscreen Canvas Rendering
1. Use React Flow's `getNodesBounds()` to compute the bounding box of all nodes
2. Use `toPng()` with `filter` option to exclude non-diagram elements (minimap, controls, panels)
3. Use the `width`, `height`, `style` options to crop to the bounding box + padding
4. Draw the resulting image onto a `<canvas>` element
5. Draw the branded footer below
6. Export the combined canvas as PNG

### Option B: SVG-based Rendering
1. Use React Flow's `toObject()` to get nodes/edges
2. Render into an offscreen SVG with proper layout
3. Append footer as SVG text elements
4. Convert SVG → PNG via canvas

**Option A is likely simpler** since it builds on the existing `html-to-image` approach.

### Key React Flow APIs
- `getNodesBounds(nodes)` — returns `{ x, y, width, height }` bounding box
- `getViewport()` — current zoom/pan state
- `toPng` filter option — `(node: HTMLElement) => boolean` to exclude UI elements

## Open Questions
- Should the branding footer be optional (toggle in settings)?
- Include the diagram title in the footer or above the diagram?
- Support transparent background for overlaying on slides?
- Should there be a "Copy to clipboard" option alongside download?

## Notes
- Current export code is in `FlowDiagram.tsx` lines 849-864
- Uses `html-to-image` library (already installed)
- Tab context menu triggers export via custom event `objectify:export-png`
