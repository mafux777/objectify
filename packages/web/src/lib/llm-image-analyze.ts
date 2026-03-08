import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import {
  type ChatMessage,
  type LLMProgressCallback,
  callOpenAI,
  extractJsonFromResponse,
  formatZodErrors,
  buildRetryMessages,
} from "./llm-shared.js";

// Adapted from packages/cli/src/prompt.ts SPATIAL_SYSTEM_PROMPT
const IMAGE_ANALYSIS_PROMPT = `You are a diagram analysis expert performing PIXEL-LEVEL reverse engineering. Your task is to completely dissect a diagram image — extracting every visual element with its precise position, size, color, and font properties.

## Spatial Extraction Instructions

For EVERY node (box/rectangle), estimate its bounding box in NORMALIZED coordinates (0 to 1), where (0,0) is the top-left corner of the image and (1,1) is the bottom-right.

Provide a "spatial" object on each node:
- x: left edge of the box (0 = image left edge, 1 = image right edge)
- y: top edge of the box (0 = image top edge, 1 = image bottom edge)
- width: box width as fraction of image width
- height: box height as fraction of image height

**Technique for accuracy:**
- Mentally divide the image into a 10x10 grid (each cell = 0.1)
- Estimate which grid cell each corner of each box falls in
- Convert to decimal (e.g., a box starting at column 2, row 3 = x:0.2, y:0.3)
- Verify: a box at the right edge should have x + width close to 1.0
- Verify: boxes that appear side-by-side should have similar y values and non-overlapping x ranges
- Verify: group/container bounds MUST fully contain all their children's bounds

## Arrow Anchor Points

For each edge (arrow), determine WHERE on the source box the arrow departs and WHERE on the target box it arrives:
- "top" = arrow leaves/enters the top edge (12 o'clock)
- "right" = arrow leaves/enters the right edge (3 o'clock)
- "bottom" = arrow leaves/enters the bottom edge (6 o'clock)
- "left" = arrow leaves/enters the left edge (9 o'clock)

Provide "sourceAnchor" and "targetAnchor" on each edge. Choose the side that the arrow actually touches or is closest to.

## Font Estimation

For each node, provide a "font" object:
- fontSize: approximate pixel size of the label text at original image resolution
- fontFamily: "sans-serif", "serif", or "monospace" (most diagrams use sans-serif)
- fontWeight: "normal" or "bold"

## Node Identification

Apply all the same rules as standard analysis:
1. Assign unique kebab-case IDs
2. Record exact label text
3. Determine "box" vs "group" type
4. Set parentId for nested nodes
5. Record background color, text color, border style as CSS hex colors
6. Use orderHint for relative position (0 = leftmost/topmost)
7. Group nodes MUST appear before their children in the nodes array

## Freestanding Text

Any text in the image that is NOT inside a box or on an arrow MUST still be captured as one or more nodes. Treat each freestanding text block as a rectangle with a transparent/invisible border (borderColor matching the background or using borderStyle "solid" with the background color). The label is the text content. This includes titles, annotations, notes, captions, legends, and any other readable text.

## Edge Identification

For each arrow/line:
- Unique ID
- Source and target node IDs
- Label text if present
- Line style (solid/dashed/dotted)
- sourceAnchor and targetAnchor (which side of the box, using clock notation: "12:00", "1:30", "3:00", "4:30", "6:00", "7:30", "9:00", "10:30", or legacy "top", "right", "bottom", "left")
- routingType based on the visual shape of the connector:
  - "straight" = direct line, no bends (A to B in a single segment)
  - "step" = path with sharp 90° right-angle bends (orthogonal segments, crisp corners)
  - "smoothstep" = path with rounded 90° bends (orthogonal segments, soft curved corners)
  - "bezier" = smooth S-curve or C-curve, no right angles
  - For guide-based layouts, omit routingType to get the automatic "smooth-repelled" default (routes through channels between guide lines)
- strokeWidth: estimate relative thickness: 1 (thin/secondary), 1.5 (normal/default), 2.5 (thick/emphasized), 4 (heavy/primary flow)
- sourceMarker / targetMarker: "arrow" (arrowhead), "ball" (filled circle), "socket" (half-circle arc), "none" (plain line end)

## Color Palette Extraction

Before assigning any colors, perform a systematic color analysis:
1. Scan the entire image for all distinct colors used in backgrounds, text, borders, and arrows.
2. Cluster similar colors (colors within ~15 distance in RGB space) into a single representative color.
3. Build a palette of at most 20 distinct colors. For each, estimate percentage of total image area it covers (percentages should sum to approximately 100).
4. Give each entry: "id" (kebab-case, e.g. "light-blue"), "hex" value (6-digit CSS hex like "#FF9800"), "percentage" (0-100), and optional "name" (human-readable).
5. ALL node backgroundColor, textColor, borderColor, and ALL edge color values MUST use ONLY hex values from the palette. Snap observed colors to the nearest palette entry.
6. Use the style.opacity field (0–1) for transparency when elements appear semi-transparent. No gradients. Use the node-level zLevel field ('background', 'base', 'raised', 'foreground', 'overlay') to control stacking order when nodes visually overlap; default is 'base'.

## Shape Palette Extraction

Identify the distinct geometric shapes used for nodes:
1. Classify each node into one of these shape kinds: "rectangle", "rounded-rectangle", "circle", "ellipse", "diamond", "parallelogram", "hexagon", "arrow-shape". Default to "rectangle" when uncertain.
2. Build a palette of at most 15 shape entries. For each: "id" (kebab-case), "kind" (from above), "aspectRatio" (width/height ratio, optional), "name" (optional).
3. Set "shapeId" on each node to reference the matching shape palette entry.
4. Include in the top-level "shapePalette" field.

## Size Normalization

Identify distinct size classes for nodes:
1. Estimate each non-group node's relative width and height as normalized 0-1 fractions of the image dimensions.
2. Cluster nodes with similar dimensions into the SAME size class.
3. When merging similar sizes, ALWAYS favor the LARGER dimensions to ensure the longest label fits.
4. Build a palette of at most 20 size classes. For each: "id" (kebab-case), "width" (0-1), "height" (0-1), "name" (optional).
5. Set "sizeId" on each non-group node. Group nodes do NOT need a sizeId.
6. IMPORTANT for spatial mode: The size class width/height values should match the actual spatial bounding box dimensions.
7. Include in the top-level "sizePalette" field.

## Semantic Type Inference

Infer a conceptual archetype for each node:
1. Analyze labels, roles, and context to determine each node's semantic category.
2. Nodes with the same functional role MUST share a semantic type.
3. Build a list of types. For each: "id" (kebab-case), "name" (human-readable), "description" (optional).
4. Set "semanticTypeId" on each node.
5. Include in the top-level "semanticTypes" field.

## Flow Direction

Determine the primary flow direction for each diagram:
- "RIGHT" for left-to-right flows
- "DOWN" for top-to-bottom flows

## Description

Write a clear, detailed description of the entire diagram image.

## Guide Line Extraction

Identify the implicit alignment grid in the diagram:
1. Look for rows of nodes that share the same vertical center (y coordinate). Each such row becomes a horizontal guide.
2. Look for columns of nodes that share the same horizontal center (x coordinate). Each such column becomes a vertical guide.
3. For each guide, record:
   - "id": kebab-case, e.g. "row-0", "row-1", "col-0", "col-3"
   - "index": sequential number (0-based), rows numbered top-to-bottom, columns left-to-right
   - "direction": "horizontal" for rows, "vertical" for columns
   - "position": normalized 0-1 position (y for horizontal, x for vertical) — use the center of the row/column of nodes
   - "label": a SHORT descriptive label — maximum 1-2 words (e.g., "Inputs", "Processing", "Output")
4. On each node, set "guideRow" to the ID of the horizontal guide it aligns with, and "guideColumn" to the ID of the vertical guide it aligns with.
5. Include guides in each diagram's "guides" array.
6. IMPORTANT: Each (guideRow, guideColumn) pair must be unique — no two nodes may share the same grid cell.
7. IMPORTANT: Every guide of the same direction must have a DISTINCT position value.

## Label Positioning

For each node, determine where its label sits relative to the node bounding box:
- "center" — text is centered inside the node (most common for regular boxes)
- "top-left" — text is in the top-left corner (common for group/container labels)
- "top-center" — text is centered at the top of the node
- "bottom-center" — text is centered at the bottom of the node
- "above" — label appears above the node shape (outside the bounding box)
- "below" — label appears below the node shape (outside the bounding box)
Set the "labelPosition" field on each node accordingly. Default to "center" if label is inside and centered.

## Edge Label Styling

For each edge with a visible label, estimate the label's visual properties and provide a "labelStyle" object:
- "fontSize": approximate pixel size
- "fontFamily": "sans-serif", "serif", or "monospace"
- "fontWeight": "normal" or "bold"
- "color": CSS hex color of the label text (from the palette)
- "position": "center" if label is at the midpoint of the arrow, "source" if near the source node, "target" if near the target node

## Output Format

The output MUST be a single JSON object with this exact top-level structure:
\`\`\`
{
  "version": "3.0",
  "description": "<detailed text description of the entire diagram image>",
  "palette": [...],
  "shapePalette": [...],
  "sizePalette": [...],
  "semanticTypes": [...],
  "diagrams": [...]
}
\`\`\`

Each diagram object MUST have this structure:
\`\`\`
{
  "id": "...",
  "title": "<human-readable title for this diagram>",
  "direction": "RIGHT" or "DOWN",
  "layoutMode": "spatial",
  "imageDimensions": { "width": ..., "height": ... },
  "nodes": [...],
  "edges": [...],
  "guides": [...]
}
\`\`\`

Each node MUST have a nested "style" object (NOT flat color fields):
\`\`\`
{
  "id": "...",
  "label": "...",
  "type": "box" or "group",
  "style": {
    "backgroundColor": "#HEX",
    "textColor": "#HEX",
    "borderColor": "#HEX",
    "borderStyle": "solid" or "dashed" or "dotted"
  },
  "spatial": { "x": ..., "y": ..., "width": ..., "height": ... },
  "font": { ... },
  "shapeId": "...",
  "sizeId": "...",
  "semanticTypeId": "...",
  "labelPosition": "...",
  "guideRow": "...",
  "guideColumn": "...",
  "orderHint": ...
}
\`\`\`

Each edge MUST have a nested "style" object (NOT flat style fields):
\`\`\`
{
  "id": "...",
  "source": "...",
  "target": "...",
  "label": "...",
  "style": {
    "lineStyle": "solid" or "dashed" or "dotted",
    "color": "#HEX",
    "routingType": "straight" or "step" or "smoothstep" or "bezier" or "smooth-repelled",
    "strokeWidth": 1.5
  },
  "sourceAnchor": "...",
  "targetAnchor": "...",
  "sourceMarker": "none",
  "targetMarker": "arrow"
}
\`\`\`

## Critical Rules
- All spatial coordinates MUST be between 0 and 1
- x + width MUST be <= 1.0 for every node
- y + height MUST be <= 1.0 for every node
- Group nodes' spatial bounds MUST fully contain all their children
- Every node that visually contains other nodes MUST have type "group"
- Every node inside a container MUST set parentId to the container's ID
- Group nodes must appear BEFORE their children in the nodes array
- Edge source and target must reference valid node IDs
- Do not invent nodes or edges that are not visible in the image
- If a node appears in multiple diagrams, give it a DIFFERENT id in each diagram`;

/**
 * Get image dimensions from a data URL using the browser's Image object.
 */
function getImageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

const MAX_ATTEMPTS = 3;

/**
 * Analyze a diagram image via LLM vision and return a DiagramSpec.
 * Retries up to 3 times on schema validation failures, feeding errors back to the LLM.
 */
export async function analyzeDiagramImage(
  base64: string,
  mediaType: string,
  width: number,
  height: number,
  apiKey: string,
  model = "gpt-5.2-2025-12-11",
  onProgress?: LLMProgressCallback,
): Promise<DiagramSpec> {
  const userText = `Analyze this diagram image and produce the structured JSON specification with full spatial data. The image dimensions are ${width}x${height} pixels. Set imageDimensions to {"width": ${width}, "height": ${height}} on each diagram. Be thorough — capture every box, container, arrow, and label visible in the image with precise bounding boxes.`;

  const messages: ChatMessage[] = [
    { role: "system", content: IMAGE_ANALYSIS_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${base64}`,
          },
        },
        {
          type: "text",
          text: userText,
        },
      ],
    },
  ];

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress?.({
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      phase: attempt === 1 ? "calling" : "retrying",
    });

    const { content } = await callOpenAI(messages, apiKey, model);
    const parsed = extractJsonFromResponse(content);
    const result = DiagramSpecSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    console.error(
      `Image analysis schema validation failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
      result.error.issues,
    );

    lastError = new Error(
      `Schema validation failed:\n${formatZodErrors(result.error)}`,
    );

    if (attempt < MAX_ATTEMPTS) {
      const [assistantMsg, userMsg] = buildRetryMessages(content, result.error);
      messages.push(assistantMsg, userMsg);
    }
  }

  throw lastError!;
}

export { getImageDimensions };
