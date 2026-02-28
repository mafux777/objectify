import { Command } from "commander";
import path from "node:path";
import { analyzeDiagram } from "./analyze.js";
import { writeOutput } from "./output.js";
import { slugify } from "./slugify.js";

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
    "Claude model to use",
    "claude-sonnet-4-5-20250514"
  )
  .option(
    "-s, --spatial",
    "Extract spatial positions, fonts, and anchor points (v2.0 spec)"
  )
  .action(
    async (
      imagePath: string,
      options: { output?: string; model: string; spatial?: boolean }
    ) => {
      try {
        const spec = await analyzeDiagram(
          imagePath,
          options.model,
          options.spatial ?? false
        );

        let outputDir: string;
        if (options.output) {
          // User explicitly specified output directory — use as-is
          outputDir = options.output;
        } else {
          // Auto-generate: outputs/<slugified-input-name>/
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
