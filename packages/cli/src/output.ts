import fs from "node:fs";
import path from "node:path";
import type { DiagramSpec } from "@objectify/schema";

export async function writeOutput(
  spec: DiagramSpec,
  outputDir: string,
  sourceImagePath?: string
): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });

  const specPath = path.join(outputDir, "diagram-spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  console.log(`Wrote diagram spec to ${specPath}`);

  const descPath = path.join(outputDir, "description.md");
  fs.writeFileSync(descPath, `# Diagram Description\n\n${spec.description}\n`);
  console.log(`Wrote description to ${descPath}`);

  // Copy original image into output dir for reference
  if (sourceImagePath) {
    const imageName = path.basename(sourceImagePath);
    const destPath = path.join(outputDir, imageName);
    fs.copyFileSync(path.resolve(sourceImagePath), destPath);
    console.log(`Copied source image to ${destPath}`);
  }
}
