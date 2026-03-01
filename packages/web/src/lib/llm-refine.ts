import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import {
  type ChatMessage,
  type LLMProgressCallback,
  type TokenUsage,
  callOpenRouter,
  extractJsonFromResponse,
  formatZodErrors,
  buildRetryMessages,
  addTokenUsage,
} from "./llm-shared.js";

const REFINE_SYSTEM_PROMPT = `You are a diagram specification editor. You receive a complete diagram spec in JSON format and a user instruction describing changes they want. Your job is to apply those changes and return the COMPLETE modified spec along with a brief summary of what you changed.

Return a JSON object with exactly two keys:
{
  "summary": "Brief 1-2 sentence description of what you changed",
  "spec": { ... the complete DiagramSpec ... }
}

Rules:
- Return ONLY the JSON object — no markdown fences, no extra text
- The "spec" value must be a valid DiagramSpec matching the exact same schema as the input
- The "summary" should describe what you actually changed in plain language — e.g. "Moved the 'Auth0' label inside its container and repositioned 'Org' label to center." If you made no changes, say why.
- Preserve ALL fields not affected by the user's request (palette, shapePalette, sizePalette, semanticTypes, description, version, etc.)
- When adding nodes, assign them to existing guides or create new ones if needed
- When removing nodes, also remove any edges that reference them
- When modifying node styles, use the nested style object: { backgroundColor, textColor, borderColor, borderStyle }
- When modifying edge styles, use the nested style object: { lineStyle, color, routingType, strokeWidth }
- Node labels use clock-position notation for placement. Valid positions: "center", "12:00", "1:30", "3:00", "4:30", "6:00", "7:30", "9:00", "10:30". Do NOT use "top-left", "bottom-right" etc.
- Guides of the same direction must have DISTINCT position values
- Each (guideRow, guideColumn) pair must be unique across nodes
- Node spatial coordinates are normalized 0-1 (x, y, width, height relative to image dimensions)
- Guide positions are normalized 0-1
- If the user asks something that doesn't make sense for the diagram, return the spec unchanged and explain why in the summary`;

export interface RefinementResult {
  spec: DiagramSpec;
  summary: string;
  usage: TokenUsage | null;
}

const MAX_ATTEMPTS = 3;

/**
 * Send the current diagram spec + a user message to an LLM via OpenRouter,
 * get back a modified spec with a summary of changes.
 * Retries up to 3 times on schema validation failures.
 */
export async function refineDiagramWithLLM(
  currentSpec: DiagramSpec,
  userMessage: string,
  apiKey: string,
  model = "anthropic/claude-sonnet-4.6",
  onProgress?: LLMProgressCallback,
): Promise<RefinementResult> {
  const specJson = JSON.stringify(currentSpec, null, 2);

  const messages: ChatMessage[] = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Here is the current diagram spec:\n\n${specJson}\n\nUser instruction: ${userMessage}`,
    },
  ];

  let lastError: Error | null = null;
  let cumulativeUsage: TokenUsage | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress?.({
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      phase: attempt === 1 ? "calling" : "retrying",
    });

    const { content, usage } = await callOpenRouter(messages, apiKey, model);
    cumulativeUsage = addTokenUsage(cumulativeUsage, usage);

    const parsed = extractJsonFromResponse(content) as Record<string, unknown>;

    // Extract summary and spec from the wrapper object
    const summary =
      typeof parsed.summary === "string" ? parsed.summary : "Changes applied.";
    const specData = parsed.spec ?? parsed; // Fallback: if LLM returned raw spec without wrapper

    const result = DiagramSpecSchema.safeParse(specData);
    if (result.success) {
      return { spec: result.data, summary, usage: cumulativeUsage };
    }

    console.error(
      `Refinement schema validation failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
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
