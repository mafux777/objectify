export type ValidationClassification = "valid" | "complaint" | "invalid";

export interface ValidationResult {
  classification: ValidationClassification;
  reason: string;
}

const VALIDATION_SYSTEM_PROMPT = `You are a request classifier for a diagram editing application. Users type messages into a command bar to modify architecture diagrams (add/remove/move nodes, change colors, add edges, restyle elements, etc.).

Classify the user's message into exactly one category:

1. "valid" — The message is a legitimate diagram editing instruction or question about the diagram. Examples: "Add a new database node", "Change the color of Auth0 to blue", "Move the API gateway to the left", "Make the boxes bigger", "Connect A to B"

2. "complaint" — The message is feedback, frustration, or a complaint about the tool itself. Examples: "This is terrible", "Let me talk to your manager", "Why is this so slow", "I hate this UI", "Great tool!"

3. "invalid" — The message is unrelated to diagrams or the tool. Examples: "What's the weather?", "Tell me a joke", "Write me a poem", "How do I cook pasta?"

When in doubt, classify as "valid" — it's better to let a borderline request through than to block a legitimate one.

Respond with ONLY a JSON object:
{"classification": "valid" | "complaint" | "invalid", "reason": "brief explanation"}`;

/**
 * Validate user input with a cheap/fast model before routing to the expensive one.
 */
export async function validateChatInput(
  userMessage: string,
  apiKey: string,
  model = "anthropic/claude-3.5-haiku",
): Promise<ValidationResult> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/objectify",
        "X-Title": "Objectify Diagram Editor",
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [
          { role: "system", content: VALIDATION_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    },
  );

  if (!response.ok) {
    // On validation failure, let the request through rather than blocking
    console.warn("Validation API error, allowing request through:", response.status);
    return { classification: "valid", reason: "Validation skipped due to API error" };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { classification: "valid", reason: "Validation skipped — no response" };
  }

  // Parse JSON response
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const classification = parsed.classification;
    if (classification === "valid" || classification === "complaint" || classification === "invalid") {
      return {
        classification,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    }
  } catch {
    // Fall through
  }

  // If we can't parse the response, let the request through
  console.warn("Could not parse validation response, allowing request through:", content);
  return { classification: "valid", reason: "Validation response unparseable" };
}
