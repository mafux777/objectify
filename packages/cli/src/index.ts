import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { analyzeDiagram } from "./analyze.js";
import { writeOutput } from "./output.js";
import { slugify } from "./slugify.js";

// Load .env from project root
const envPath = path.resolve(import.meta.dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const program = new Command()
  .name("objectify")
  .description("Convert PNG diagram images to interactive React Flow specs")
  .argument("<image>", "Path to PNG/JPEG image file")
  .option(
    "-o, --output <dir>",
    "Output directory (overrides default outputs/<slug> structure)"
  )
  .option(
    "-m, --model <model>",
    "OpenRouter model to use",
    "anthropic/claude-sonnet-4.6"
  )
  .action(
    async (
      imagePath: string,
      options: { output?: string; model: string }
    ) => {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        console.error(
          "OPENROUTER_API_KEY not found. Set it in .env or as an environment variable.\n" +
            "Get your key at https://openrouter.ai/keys"
        );
        process.exit(1);
      }

      try {
        const spec = await analyzeDiagram(
          imagePath,
          apiKey,
          options.model
        );

        let outputDir: string;
        if (options.output) {
          outputDir = options.output;
        } else {
          const baseName = path.basename(imagePath, path.extname(imagePath));
          const slug = slugify(baseName);
          outputDir = path.join(".", "outputs", slug || "untitled");
        }

        await writeOutput(spec, outputDir, imagePath);
        console.log("Done!");
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }
  );

program.parse();
