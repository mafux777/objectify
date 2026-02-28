import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

/**
 * Vite plugin that serves spec files from the CLI outputs directory.
 *
 * Routes:
 *   GET  /api/specs          — list all specs
 *   GET  /api/specs/:slug    — read a spec file
 *   PUT  /api/specs/:slug    — write back a spec file
 */
export function specsPlugin(): Plugin {
  // Resolve outputs/ relative to repo root (two levels up from packages/web/)
  const outputsDir = path.resolve(__dirname, "../../outputs");

  function ensureOutputsDir() {
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }
  }

  /** Scan outputs/ for subdirectories containing diagram-spec.json */
  function listSpecs(): { slug: string; title: string; description: string }[] {
    ensureOutputsDir();
    const entries = fs.readdirSync(outputsDir, { withFileTypes: true });
    const specs: { slug: string; title: string; description: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const specPath = path.join(outputsDir, entry.name, "diagram-spec.json");
      if (!fs.existsSync(specPath)) continue;

      try {
        const raw = fs.readFileSync(specPath, "utf-8");
        const json = JSON.parse(raw);
        specs.push({
          slug: entry.name,
          title: json.diagrams?.[0]?.title ?? entry.name,
          description: (json.description ?? "").slice(0, 120),
        });
      } catch {
        // Skip malformed files
      }
    }

    return specs;
  }

  return {
    name: "objectify-specs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/specs")) return next();

        // Strip query params
        const urlPath = req.url.split("?")[0];

        // GET /api/specs — list all specs
        if (req.method === "GET" && urlPath === "/api/specs") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(listSpecs()));
          return;
        }

        // Match /api/specs/:slug
        const slugMatch = urlPath.match(/^\/api\/specs\/([a-zA-Z0-9_-]+)$/);
        if (!slugMatch) return next();
        const slug = slugMatch[1];
        const specPath = path.join(outputsDir, slug, "diagram-spec.json");

        // GET /api/specs/:slug — read spec
        if (req.method === "GET") {
          if (!fs.existsSync(specPath)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Spec not found" }));
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(fs.readFileSync(specPath, "utf-8"));
          return;
        }

        // PUT /api/specs/:slug — write spec
        if (req.method === "PUT") {
          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            try {
              // Validate it's parseable JSON before writing
              JSON.parse(body);
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON" }));
              return;
            }

            // Ensure directory exists
            const dir = path.join(outputsDir, slug);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(specPath, body);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        next();
      });
    },
  };
}
