import type { ZodError } from "zod";

// --- Types ---

/** Message format for OpenRouter chat completions API */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

/** Token usage from an OpenRouter API call */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Result from callOpenRouter including content and token usage */
export interface OpenRouterResult {
  content: string;
  usage: TokenUsage | null;
}

/** Progress callback for retry-aware LLM calls */
export type LLMProgressCallback = (status: {
  attempt: number;
  maxAttempts: number;
  phase: "calling" | "retrying";
}) => void;

// --- JSON extraction ---

/**
 * Extract a JSON object from LLM response text.
 * Handles: raw JSON, markdown-fenced JSON, and text-before-JSON (brace-slice fallback).
 * Throws if no valid JSON can be extracted.
 */
export function extractJsonFromResponse(content: string): unknown {
  let jsonStr = content.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    const braceIdx = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (braceIdx >= 0 && lastBrace > braceIdx) {
      try {
        return JSON.parse(jsonStr.slice(braceIdx, lastBrace + 1));
      } catch {
        throw new Error("LLM returned invalid JSON");
      }
    }
    throw new Error("LLM returned invalid JSON");
  }
}

// --- Zod error formatting ---

/**
 * Format Zod validation issues into a human/LLM-readable string with full paths.
 *
 * Example output:
 *   - diagrams[0].layoutMode: Invalid enum value. Expected 'auto' | 'spatial', received 'guide'
 *   - diagrams[0].nodes[2].style.backgroundColor: Required
 */
export function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path
        .map((segment) =>
          typeof segment === "number" ? `[${segment}]` : `.${segment}`,
        )
        .join("")
        .replace(/^\./, "");

      let detail = issue.message;
      if ("expected" in issue && "received" in issue) {
        detail = `Expected ${issue.expected}, received ${issue.received}`;
      }

      return `- ${path || "(root)"}: ${detail}`;
    })
    .join("\n");
}

// --- Token usage helpers ---

/** Add two token usage objects together (either may be null). */
export function addTokenUsage(
  a: TokenUsage | null,
  b: TokenUsage | null,
): TokenUsage | null {
  if (!a && !b) return null;
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}

// --- OpenRouter API call ---

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Call OpenRouter chat completions and return the assistant's content + token usage.
 * Throws on HTTP errors or empty responses.
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 16384,
): Promise<OpenRouterResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/objectify",
      "X-Title": "Objectify Diagram Editor",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenRouter response");
  }

  const rawUsage = data.usage;
  const usage: TokenUsage | null = rawUsage
    ? {
        promptTokens: rawUsage.prompt_tokens ?? 0,
        completionTokens: rawUsage.completion_tokens ?? 0,
        totalTokens: rawUsage.total_tokens ?? 0,
      }
    : null;

  return { content, usage };
}

// --- Retry feedback message builder ---

/**
 * Build retry messages: the assistant's previous response + a user message
 * asking it to fix the listed validation errors.
 */
export function buildRetryMessages(
  previousResponse: string,
  zodError: ZodError,
): [ChatMessage, ChatMessage] {
  const formattedErrors = formatZodErrors(zodError);

  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: previousResponse,
  };

  const userMsg: ChatMessage = {
    role: "user",
    content: `Your JSON response had validation errors. Please fix ONLY the listed errors and return the corrected COMPLETE JSON. Do not add explanatory text — return ONLY the JSON.

Errors:
${formattedErrors}`,
  };

  return [assistantMsg, userMsg];
}
