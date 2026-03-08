import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import {
  type ChatMessage,
  type LLMProgressCallback,
  callOpenAI,
  extractJsonFromResponse,
  formatZodErrors,
  buildRetryMessages,
} from "./llm-shared.js";

const GENERATE_SYSTEM_PROMPT = `You are a diagram specification generator. Given a user's text description, create a complete DiagramSpec JSON that represents the described architecture or system.

Return ONLY valid JSON — no markdown fences, no extra text. The JSON must match this schema:

{
  "version": "3.0",
  "description": "Brief description of the diagram",
  "palette": [
    { "id": "color-name", "hex": "#RRGGBB", "percentage": 25, "name": "Color Name" }
  ],
  "shapePalette": [
    { "id": "shape-name", "kind": "rectangle" | "rounded-rectangle" | "circle" | "diamond", "name": "Shape Name" }
  ],
  "sizePalette": [
    { "id": "size-name", "width": 0.15, "height": 0.06, "name": "Standard" }
  ],
  "diagrams": [{
    "id": "diagram-id",
    "title": "Diagram Title",
    "direction": "RIGHT",
    "layoutMode": "auto",
    "imageDimensions": { "width": 1200, "height": 800 },
    "guides": [
      { "id": "row-1", "direction": "horizontal", "position": 0.3 },
      { "id": "col-1", "direction": "vertical", "position": 0.2 }
    ],
    "nodes": [
      {
        "id": "node-id",
        "label": "Node Label",
        "type": "box",
        "style": { "backgroundColor": "#RRGGBB", "textColor": "#000000" },
        "shapeId": "shape-ref",
        "sizeId": "size-ref",
        "guideRow": "row-1",
        "guideColumn": "col-1"
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "node-a",
        "target": "node-b",
        "style": { "lineStyle": "solid", "color": "#666666", "routingType": "smoothstep" }
      }
    ]
  }]
}

Rules:
- Use version "3.0" with layoutMode "auto"
- Create a sensible color palette (3-8 colors) that looks professional
- Assign each node to a guide row and column for grid alignment
- Guides must have unique positions within the same direction
- Each (guideRow, guideColumn) pair must be unique across nodes
- Guide positions are normalized 0-1
- Use kebab-case IDs for everything
- Include edges to show relationships/data flow
- Temporal flow: if the diagram describes a process over time, choose one primary axis and keep progression monotonic on that axis.
  - Vertical timeline: earlier steps at smaller guideRow values (top), later steps at larger guideRow values (bottom).
  - Horizontal timeline: earlier steps at smaller guideColumn values (left), later steps at larger guideColumn values (right).
- Edge anchor semantics:
  - sourceAnchor means where the edge leaves the source node.
  - targetAnchor means where the edge enters the target node.
  - For vertical forward flow, prefer sourceAnchor "bottom" and targetAnchor "top".
  - For horizontal forward flow, prefer sourceAnchor "right" and targetAnchor "left".
  - Inputs/prerequisites should enter from upstream sides; outputs/consequences should leave from downstream sides.
  - Decision branches may exit sideways to improve readability (left/right for vertical timelines, top/bottom for horizontal timelines).
- Containment rule:
  - Do not use parentId by default for process steps.
  - Use parentId only for true visual containment (node is inside a container), not just for phase/category grouping.
- Group nodes (type "group") may be used as visual section headers/lanes even without parent-child containment.
- Node labels use clock-position notation. Valid positions: "center", "12:00", "3:00", "6:00", "9:00"
- Keep it clean and readable — 5-15 nodes is typical`;

const MAX_ATTEMPTS = 3;

/**
 * Generate a complete DiagramSpec from a text description via LLM.
 * Retries up to 3 times on schema validation failures, feeding errors back to the LLM.
 */
export async function generateDiagramFromPrompt(
  userPrompt: string,
  apiKey: string,
  model = "gpt-5.2-2025-12-11",
  onProgress?: LLMProgressCallback,
): Promise<DiagramSpec> {
  const messages: ChatMessage[] = [
    { role: "system", content: GENERATE_SYSTEM_PROMPT },
    { role: "user", content: `Create a diagram for: ${userPrompt}` },
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
      `Generation schema validation failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
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
