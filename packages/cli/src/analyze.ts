import fs from "node:fs";
import path from "node:path";
import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import { SYSTEM_PROMPT, SPATIAL_SYSTEM_PROMPT } from "./prompt.js";

function getImageDimensions(buffer: Buffer): { width: number; height: number } {
  // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  // JPEG: scan for SOF0 marker (0xFF 0xC0)
  for (let i = 0; i < buffer.length - 9; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xc0) {
      return {
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7),
      };
    }
  }
  return { width: 1200, height: 800 };
}

function getMediaType(ext: string): string {
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: return "image/png";
  }
}

export async function analyzeDiagram(
  imagePath: string,
  apiKey: string,
  model: string,
  spatial: boolean
): Promise<DiagramSpec> {
  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Image file not found: ${resolved}`);
  }

  const imageBuffer = fs.readFileSync(resolved);
  const base64 = imageBuffer.toString("base64");
  const dimensions = getImageDimensions(imageBuffer);
  const ext = path.extname(imagePath).toLowerCase();
  const mediaType = getMediaType(ext);

  const mode = spatial ? "spatial" : "semantic";
  console.log(
    `Analyzing ${path.basename(imagePath)} (${dimensions.width}x${dimensions.height}) in ${mode} mode with ${model}...`
  );

  const systemPrompt = spatial ? SPATIAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userText = spatial
    ? `Analyze this diagram image and produce the structured JSON specification with full spatial data. The image dimensions are ${dimensions.width}x${dimensions.height} pixels. Set imageDimensions to {"width": ${dimensions.width}, "height": ${dimensions.height}} on each diagram. Be thorough — capture every box, container, arrow, and label visible in the image with precise bounding boxes.`
    : "Analyze this diagram image and produce the structured JSON specification. Be thorough — capture every box, container, arrow, and label visible in the image.";

  const startTime = Date.now();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/mafux777/objectify",
      "X-Title": "Objectify Diagram Analyzer",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
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
      ],
    }),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenRouter response");
  }

  console.log(`Response received in ${elapsed}s`);
  if (data.usage) {
    console.log(`Tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
  }
  if (data.model) {
    console.log(`Model used: ${data.model}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim());
    } else {
      throw new Error(
        "Could not parse JSON from response. Raw response:\n" +
          content.slice(0, 500)
      );
    }
  }

  const result = DiagramSpecSchema.parse(parsed);

  const nodesWithSpatial = result.diagrams.reduce(
    (s, d) => s + d.nodes.filter((n) => n.spatial).length,
    0
  );
  console.log(
    `Extracted ${result.diagrams.length} diagram(s), ` +
      `${result.diagrams.reduce((s, d) => s + d.nodes.length, 0)} nodes` +
      (spatial ? ` (${nodesWithSpatial} with spatial data)` : "") +
      `, ${result.diagrams.reduce((s, d) => s + d.edges.length, 0)} edges`
  );

  return result;
}
