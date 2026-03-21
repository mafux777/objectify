import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_ATTEMPTS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Missing authorization header", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonError("Unauthorized", 401);
    }

    // 2. Parse body
    const { storagePath } = await req.json();
    if (!storagePath || typeof storagePath !== "string") {
      return jsonError("Missing storagePath in request body", 400);
    }

    // 3. Rate limit check
    const { data: withinLimit } = await supabase.rpc("check_rate_limit", {
      uid: user.id,
    });
    if (!withinLimit) {
      return jsonError("Rate limit exceeded. Try again in a minute.", 429);
    }

    // 4. Check credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits < 1) {
      return jsonError("No credits remaining", 402);
    }

    // 5. Download image from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from("diagram-images")
      .download(storagePath);

    if (dlError || !fileData) {
      return jsonError("Failed to download image from storage", 500);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        "",
      ),
    );
    const mediaType = fileData.type || "image/png";

    // 5b. Triage: quick check if image is a suitable diagram
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) {
      return jsonError("Server configuration error", 500);
    }

    const triageResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/objectify",
        "X-Title": "Objectify Diagram Editor",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-6",
        max_tokens: 256,
        messages: [
          { role: "system", content: TRIAGE_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
              { type: "text", text: "Classify this image." },
            ],
          },
        ],
      }),
    });

    if (triageResponse.ok) {
      const triageData = await triageResponse.json();
      const triageContent = triageData.choices?.[0]?.message?.content;
      if (triageContent) {
        try {
          const triageJson = JSON.parse(triageContent.replace(/```json?\s*|```/g, "").trim());
          if (typeof triageJson.confidence === "number" && triageJson.confidence < 5) {
            return jsonError(
              `This image doesn't appear to be a diagram: ${triageJson.warning || triageJson.description || "Low confidence score"}. No credit was charged.`,
              422,
            );
          }
        } catch {
          // Triage parse failed — proceed anyway, don't block the user
        }
      }
    }

    // 6. Create conversion record
    const { data: conversion, error: convError } = await supabase
      .from("conversions")
      .insert({ user_id: user.id, image_url: storagePath, status: "processing" })
      .select("id")
      .single();

    if (convError || !conversion) {
      return jsonError("Failed to create conversion record", 500);
    }

    // 7. Call OpenRouter with retry logic

    const messages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: IMAGE_ANALYSIS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${base64}` },
          },
          {
            type: "text",
            text: "Analyze this diagram image and produce the structured JSON specification with guide-based layout. Be thorough — capture every box, container, arrow, and label visible in the image.",
          },
        ],
      },
    ];

    let spec: unknown = null;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/objectify",
          "X-Title": "Objectify Diagram Editor",
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4-6",
          max_tokens: 16384,
          messages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        lastError = `OpenRouter API error ${response.status}: ${text}`;
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = "No content in OpenRouter response";
        continue;
      }

      try {
        spec = extractJson(content);
        // Basic validation: must have diagrams array
        if (
          spec &&
          typeof spec === "object" &&
          Array.isArray((spec as Record<string, unknown>).diagrams)
        ) {
          break;
        }
        lastError = "Response missing diagrams array";
        // Add retry context
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content:
              "Your response was missing the required 'diagrams' array. Return the corrected COMPLETE JSON only.",
          },
        );
        spec = null;
      } catch {
        lastError = "Failed to parse JSON from response";
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content:
              "Your response was not valid JSON. Return ONLY the JSON object, no explanation.",
          },
        );
      }
    }

    if (!spec) {
      // Mark conversion as failed, don't charge
      await supabase
        .from("conversions")
        .update({ status: "failed" })
        .eq("id", conversion.id);

      return jsonError(`Conversion failed: ${lastError}`, 500);
    }

    // 8. Deduct credit
    const { data: creditOk } = await supabase.rpc("deduct_credit", {
      uid: user.id,
      conversion_id: conversion.id,
    });

    if (!creditOk) {
      await supabase
        .from("conversions")
        .update({ status: "failed" })
        .eq("id", conversion.id);
      return jsonError("Failed to deduct credit", 500);
    }

    // 9. Save spec and mark completed
    await supabase
      .from("conversions")
      .update({ spec, status: "completed" })
      .eq("id", conversion.id);

    return new Response(JSON.stringify({ spec, conversionId: conversion.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonError(
      `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(content: string): unknown {
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    const braceIdx = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (braceIdx >= 0 && lastBrace > braceIdx) {
      return JSON.parse(jsonStr.slice(braceIdx, lastBrace + 1));
    }
    throw new Error("Invalid JSON");
  }
}

const TRIAGE_PROMPT = `You are an image classifier for a diagram-to-code tool called Objectify. Your job is to quickly assess whether an uploaded image is a suitable diagram for conversion.

Objectify is designed to convert architecture diagrams, flowcharts, system diagrams, network topologies, ER diagrams, sequence diagrams, org charts, mind maps, and similar structured visual diagrams into editable interactive diagrams.

It is NOT designed for: screenshots of apps/games/websites, photos of people/objects/scenes, charts/graphs with data (bar charts, pie charts, line graphs), plain text/documents, memes, or abstract art.

Analyze the image and respond with ONLY a JSON object (no explanation):
{
  "isDiagram": true/false,
  "confidence": 1-10,
  "diagramType": "architecture|flowchart|sequence|er|network|org-chart|mind-map|state|class|other-diagram|not-a-diagram",
  "description": "One sentence describing what the image shows",
  "warning": null or "A short user-facing warning if this isn't a good fit"
}

Scoring guide:
- 9-10: Clear architecture/flow diagram with boxes, arrows, labels
- 7-8: Diagram-like but informal (hand-drawn whiteboard, rough sketch)
- 5-6: Borderline — has some structure but not a typical diagram
- 3-4: Probably not a diagram but has some box/arrow elements
- 1-2: Clearly not a diagram (photo, screenshot, chart, text)`;

// Inlined from llm-image-analyze.ts — the full system prompt
const IMAGE_ANALYSIS_PROMPT = `You are a diagram analysis expert performing PIXEL-LEVEL reverse engineering. Your task is to completely dissect a diagram image — extracting every visual element with its color, and font properties, and position it using a guide-based layout grid.

## Arrow Anchor Points

For each edge (arrow), determine WHERE on the source box the arrow departs and WHERE on the target box it arrives:
- "top" = arrow leaves/enters the top edge (12 o'clock)
- "right" = arrow leaves/enters the right edge (3 o'clock)
- "bottom" = arrow leaves/enters the bottom edge (6 o'clock)
- "left" = arrow leaves/enters the left edge (9 o'clock)

Provide "sourceAnchor" and "targetAnchor" on each edge.

## Output Format

The output MUST be a single JSON object with this structure:
\`\`\`
{
  "version": "3.0",
  "description": "<detailed text description>",
  "palette": [...],
  "shapePalette": [...],
  "sizePalette": [...],
  "semanticTypes": [...],
  "diagrams": [...]
}
\`\`\`

Each diagram object MUST have "nodes", "edges", and "guides" arrays.
Each node MUST have a nested "style" object with backgroundColor, textColor, borderColor, borderStyle.
Each node MUST have "guideRow" and "guideColumn" referencing guide IDs for positioning.
Each edge MUST have a nested "style" object with lineStyle, color, routingType, strokeWidth.

## Critical Rules
- All guide positions MUST be between 0 and 1
- Edge source and target must reference valid node IDs
- Do not invent nodes or edges that are not visible in the image`;
