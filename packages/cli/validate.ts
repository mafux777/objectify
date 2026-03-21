import { DiagramSpecSchema } from "@objectify/schema";
import fs from "fs";

const specPath = process.argv[2];
if (!specPath) {
  console.error("Usage: npx tsx packages/cli/validate.ts <spec.json>");
  process.exit(1);
}

const content = fs.readFileSync(specPath, "utf-8");
const parsed = JSON.parse(content);

const result = DiagramSpecSchema.safeParse(parsed);
if (result.success) {
  console.log("✅ Schema validation PASSED");
  console.log(`   Version: ${result.data.version}`);
  console.log(`   Diagrams: ${result.data.diagrams.length}`);
  console.log(`   Nodes: ${result.data.diagrams[0]?.nodes?.length || 0}`);
  console.log(`   Edges: ${result.data.diagrams[0]?.edges?.length || 0}`);
  console.log(`   Palette colors: ${result.data.palette?.length || 0}`);
  console.log(`   Shape palette: ${result.data.shapePalette?.length || 0}`);
  console.log(`   Size palette: ${result.data.sizePalette?.length || 0}`);
  console.log(`   Semantic types: ${result.data.semanticTypes?.length || 0}`);
  console.log(`   Guides: ${result.data.diagrams[0]?.guides?.length || 0}`);
} else {
  console.log("❌ Schema validation FAILED");
  console.log(JSON.stringify(result.error.issues, null, 2));
}
