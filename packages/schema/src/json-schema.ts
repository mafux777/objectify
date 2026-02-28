import { zodToJsonSchema } from "zod-to-json-schema";
import { DiagramSpecSchema } from "./diagram-spec.js";

export const diagramJsonSchema = zodToJsonSchema(DiagramSpecSchema, {
  $refStrategy: "none",
});
