#!/usr/bin/env npx tsx
/**
 * Deploy a diagram-spec.json as a template.
 *
 * 1. Validates the JSON against DiagramSpecSchema
 * 2. Copies it to packages/web/src/data/<slug>.json
 * 3. Appends import + entry to bundled-templates.ts
 * 4. Appends entry to generate-template-seed.mjs
 * 5. Regenerates supabase/seed.sql
 * 6. Optionally upserts into remote Supabase (--remote)
 *
 * Usage:
 *   npx tsx scripts/deploy-template.ts <spec.json> --name "Template Name" [options]
 *
 * Options:
 *   --name <name>           Template display name (required)
 *   --description <desc>    Description (default: spec.description)
 *   --featured              Mark as featured template
 *   --order <n>             Sort order (default: next available)
 *   --remote                Also upsert into remote Supabase
 *   --dry-run               Show what would happen without writing
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { DiagramSpecSchema } from "../packages/schema/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Inline .env loader (same pattern as check-deposits.ts)
// ---------------------------------------------------------------------------
try {
  const envFile = readFileSync(resolve(ROOT, ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function getOption(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const val = args[idx + 1];
  args.splice(idx, 2);
  return val;
}

const dryRun = getFlag("dry-run");
const featured = getFlag("featured");
const remote = getFlag("remote");
const name = getOption("name");
const description = getOption("description");
const orderStr = getOption("order");

const specPath = args[0];

if (!specPath || !name) {
  console.error("Usage: npx tsx scripts/deploy-template.ts <spec.json> --name \"Template Name\" [--description ...] [--featured] [--order N] [--remote] [--dry-run]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Main (async for remote Supabase upsert)
// ---------------------------------------------------------------------------
async function main() {

// ---------------------------------------------------------------------------
// Step 1: Validate
// ---------------------------------------------------------------------------
console.log("1. Validating spec...");
const rawJson = readFileSync(resolve(specPath), "utf-8");
const parsed = JSON.parse(rawJson);
const result = DiagramSpecSchema.safeParse(parsed);

if (!result.success) {
  console.error("   INVALID spec:");
  for (const issue of result.error.issues) {
    console.error(`   [${issue.path.join(".")}] ${issue.message}`);
  }
  process.exit(1);
}

const spec = result.data;
const templateDescription = description ?? spec.description ?? "";
const slug = slugify(name);
const dataFileName = `${slug}.json`;

console.log(`   Valid! "${spec.diagrams[0]?.title}" — ${spec.diagrams[0]?.nodes.length} nodes, ${spec.diagrams[0]?.edges.length} edges`);

// ---------------------------------------------------------------------------
// Step 2: Compute order
// ---------------------------------------------------------------------------
const bundledPath = resolve(ROOT, "packages/web/src/lib/db/bundled-templates.ts");
const bundledContent = readFileSync(bundledPath, "utf-8");

// Find the highest existing order number
const orderMatches = [...bundledContent.matchAll(/order:\s*(\d+)/g)];
const maxOrder = orderMatches.reduce((max, m) => Math.max(max, parseInt(m[1])), -1);
const order = orderStr != null ? parseInt(orderStr) : maxOrder + 1;

console.log(`   Name: "${name}"`);
console.log(`   Slug: ${slug}`);
console.log(`   Order: ${order}`);
console.log(`   Featured: ${featured}`);

// ---------------------------------------------------------------------------
// Step 3: Copy JSON to data dir
// ---------------------------------------------------------------------------
const dataDir = resolve(ROOT, "packages/web/src/data");
const destJsonPath = resolve(dataDir, dataFileName);

console.log(`\n2. Copy JSON → packages/web/src/data/${dataFileName}`);
if (existsSync(destJsonPath)) {
  console.log("   File already exists — will overwrite.");
}

if (!dryRun) {
  copyFileSync(resolve(specPath), destJsonPath);
  console.log("   Done.");
} else {
  console.log("   [dry-run] Skipped.");
}

// ---------------------------------------------------------------------------
// Step 4: Update bundled-templates.ts
// ---------------------------------------------------------------------------
console.log("\n3. Update bundled-templates.ts");

// Derive a camelCase variable name from the slug
const camelVar = slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Data";

// Check if already imported
if (bundledContent.includes(`from "../../data/${dataFileName}"`)) {
  console.log("   Already has import — skipping.");
} else {
  // Insert import before the `import type { DiagramSpec }` line
  const importLine = `import ${camelVar} from "../../data/${dataFileName}";`;
  const entryLine = `  { name: "${name}", description: "${templateDescription.replace(/"/g, '\\"')}", data: ${camelVar}, featured: ${featured}, order: ${order} },`;

  console.log(`   Adding import: ${importLine}`);
  console.log(`   Adding entry: order=${order}`);

  if (!dryRun) {
    let updated = bundledContent;

    // Add import line before the `import type { DiagramSpec }` line
    updated = updated.replace(
      'import type { DiagramSpec } from "@objectify/schema";',
      `${importLine}\nimport type { DiagramSpec } from "@objectify/schema";`,
    );

    // Add entry at the end of the ENTRIES array (before the closing ];)
    updated = updated.replace(
      /(\];\n\nexport const BUNDLED_TEMPLATES)/,
      `${entryLine}\n$1`,
    );

    writeFileSync(bundledPath, updated);
    console.log("   Done.");
  } else {
    console.log("   [dry-run] Skipped.");
  }
}

// ---------------------------------------------------------------------------
// Step 5: Update generate-template-seed.mjs
// ---------------------------------------------------------------------------
console.log("\n4. Update generate-template-seed.mjs");

const seedGenPath = resolve(ROOT, "scripts/generate-template-seed.mjs");
const seedGenContent = readFileSync(seedGenPath, "utf-8");

if (seedGenContent.includes(`file: "${dataFileName}"`)) {
  console.log("   Already has entry — skipping.");
} else {
  const seedEntry = `  { file: "${dataFileName}", name: "${name}", description: "${templateDescription.replace(/"/g, '\\"')}", featured: ${featured}, order: ${order} },`;
  console.log(`   Adding entry: ${dataFileName}`);

  if (!dryRun) {
    // Add entry before the closing ];
    const updated = seedGenContent.replace(
      /^(\];)$/m,
      `${seedEntry}\n$1`,
    );
    writeFileSync(seedGenPath, updated);
    console.log("   Done.");
  } else {
    console.log("   [dry-run] Skipped.");
  }
}

// ---------------------------------------------------------------------------
// Step 6: Regenerate seed.sql
// ---------------------------------------------------------------------------
console.log("\n5. Regenerate supabase/seed.sql");

if (!dryRun) {
  const seedSql = execSync("node scripts/generate-template-seed.mjs", { cwd: ROOT, encoding: "utf-8" });
  writeFileSync(resolve(ROOT, "supabase/seed.sql"), seedSql);
  console.log(`   Done. (${seedSql.split("\n").length} lines)`);
} else {
  console.log("   [dry-run] Skipped.");
}

// ---------------------------------------------------------------------------
// Step 7: Remote Supabase upsert
// ---------------------------------------------------------------------------
if (remote) {
  console.log("\n6. Upsert into remote Supabase");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("   Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  if (!dryRun) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if template with same name exists
    const { data: existing } = await supabase
      .from("templates")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("templates")
        .update({
          description: templateDescription,
          spec: spec,
          sort_order: order,
          featured,
        })
        .eq("id", existing.id);

      if (error) {
        console.error(`   Update failed: ${error.message}`);
        process.exit(1);
      }
      console.log(`   Updated existing template (id: ${existing.id})`);
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("templates")
        .insert({
          name,
          description: templateDescription,
          spec: spec,
          sort_order: order,
          featured,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`   Insert failed: ${error.message}`);
        process.exit(1);
      }
      console.log(`   Inserted new template (id: ${data.id})`);
    }
  } else {
    console.log("   [dry-run] Would upsert template by name.");
  }
}

console.log("\nDone!");
} // end main

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
