import { z } from "zod";

// --- Shared enums ---

const AnchorSideSchema = z
  .enum(["top", "right", "bottom", "left"])
  .describe("Side of a node: top (12 o'clock), right (3), bottom (6), left (9)");

// --- Node schemas ---

const NodeStyleSchema = z.object({
  backgroundColor: z
    .string()
    .describe("CSS hex color for the box background, e.g. '#FF9800'"),
  textColor: z
    .string()
    .default("#000000")
    .describe("CSS hex color for the label text"),
  borderColor: z
    .string()
    .optional()
    .describe("CSS hex color for the border; omit for default gray"),
  borderStyle: z
    .enum(["solid", "dashed", "dotted"])
    .default("solid")
    .describe("Border line style"),
});

const NodeSpatialSchema = z.object({
  x: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized X of top-left corner (0 = left edge, 1 = right edge)"),
  y: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized Y of top-left corner (0 = top edge, 1 = bottom edge)"),
  width: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized width as fraction of image width"),
  height: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized height as fraction of image height"),
});

const NodeFontSchema = z.object({
  fontSize: z
    .number()
    .optional()
    .describe("Estimated font size in pixels at original image resolution"),
  fontFamily: z
    .enum(["sans-serif", "serif", "monospace"])
    .default("sans-serif")
    .describe("Detected font family category"),
  fontWeight: z
    .enum(["normal", "bold"])
    .default("normal")
    .describe("Detected font weight"),
});

const NodeSchema = z.object({
  id: z
    .string()
    .describe("Unique kebab-case identifier, e.g. 'payment-service', 'api-gateway'"),
  label: z.string().describe("Display text shown inside the box"),
  type: z
    .enum(["box", "group"])
    .describe("'box' for leaf nodes, 'group' for containers that hold other nodes"),
  parentId: z
    .string()
    .optional()
    .describe("ID of the parent group node if this node is nested inside one"),
  style: NodeStyleSchema,
  orderHint: z
    .number()
    .optional()
    .describe(
      "Relative position hint: lower numbers appear further left/top in layout"
    ),
  spatial: NodeSpatialSchema.optional().describe(
    "Bounding box in normalized 0-1 coordinates relative to image dimensions. Present in v2.0 spatial specs."
  ),
  font: NodeFontSchema.optional().describe(
    "Estimated font properties. Present in v2.0 spatial specs."
  ),
  shapeId: z
    .string()
    .optional()
    .describe(
      "References a shape palette entry by id. Determines the geometric shape for rendering."
    ),
  sizeId: z
    .string()
    .optional()
    .describe(
      "References a size palette entry by id. All nodes sharing a sizeId render at identical dimensions."
    ),
  semanticTypeId: z
    .string()
    .optional()
    .describe(
      "References a semantic type entry by id. Indicates the conceptual archetype of this node, " +
        "e.g. LP #1 and LP #2 might both have semanticTypeId 'liquidity-provider'."
    ),
  labelPosition: z
    .enum(["center", "top-left", "top-center", "bottom-center", "above", "below"])
    .default("center")
    .optional()
    .describe(
      "Where the label sits relative to the node. 'center' = inside centered, " +
        "'top-left' = inside top-left (typical for groups), 'above'/'below' = outside the node."
    ),
  guideRow: z
    .string()
    .optional()
    .describe("ID of the horizontal guide line this node snaps to"),
  guideColumn: z
    .string()
    .optional()
    .describe("ID of the vertical guide line this node snaps to"),
});

// --- Edge schemas ---

const EdgeStyleSchema = z.object({
  lineStyle: z
    .enum(["solid", "dashed", "dotted"])
    .default("solid")
    .describe("Line style for the arrow"),
  color: z
    .string()
    .default("#333333")
    .describe("CSS hex color for the arrow line"),
});

const EdgeLabelStyleSchema = z.object({
  fontSize: z
    .number()
    .optional()
    .describe("Font size in pixels for the edge label"),
  fontFamily: z
    .enum(["sans-serif", "serif", "monospace"])
    .default("sans-serif")
    .describe("Font family for the edge label"),
  fontWeight: z
    .enum(["normal", "bold"])
    .default("normal")
    .describe("Font weight for the edge label"),
  color: z
    .string()
    .optional()
    .describe("CSS hex color for the edge label text"),
  backgroundColor: z
    .string()
    .optional()
    .describe("CSS hex color for the edge label background"),
  position: z
    .enum(["center", "source", "target"])
    .default("center")
    .describe("Where along the edge path the label is placed"),
});

const EdgeSchema = z.object({
  id: z.string().describe("Unique identifier, e.g. 'edge-1'"),
  source: z.string().describe("ID of the source node where the arrow starts"),
  target: z.string().describe("ID of the target node where the arrow ends"),
  label: z
    .string()
    .optional()
    .describe("Text label displayed on or near the arrow"),
  style: EdgeStyleSchema.optional(),
  sourceAnchor: AnchorSideSchema.optional().describe(
    "Side of the source node where the arrow originates"
  ),
  targetAnchor: AnchorSideSchema.optional().describe(
    "Side of the target node where the arrow terminates"
  ),
  labelStyle: EdgeLabelStyleSchema.optional().describe(
    "Styling for the edge label text. If omitted, renderer defaults apply."
  ),
});

// --- Color palette schemas ---

const ColorPaletteEntrySchema = z.object({
  id: z
    .string()
    .describe("Unique kebab-case identifier for this palette color, e.g. 'warm-orange', 'light-blue'"),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((s) => s.toUpperCase())
    .describe("CSS 6-digit hex color value, e.g. '#FF9800'. Normalized to uppercase."),
  percentage: z
    .number()
    .min(0)
    .max(100)
    .describe("Estimated percentage of total image area using this color (0-100)"),
  name: z
    .string()
    .optional()
    .describe("Human-readable color name, e.g. 'Warm Orange', 'Light Blue'"),
});

const ColorPaletteSchema = z
  .array(ColorPaletteEntrySchema)
  .max(20)
  .describe(
    "Color palette extracted from the source image. Max 20 distinct colors. " +
      "All node and edge colors in this spec MUST use hex values from this palette."
  );

// --- Shape palette schemas ---

const ShapeKindSchema = z
  .enum([
    "rectangle",
    "rounded-rectangle",
    "circle",
    "ellipse",
    "diamond",
    "parallelogram",
    "hexagon",
    "arrow-shape",
  ])
  .describe("Geometric shape kind for a node");

const ShapePaletteEntrySchema = z.object({
  id: z
    .string()
    .describe(
      "Unique kebab-case identifier for this shape, e.g. 'service-rect', 'decision-diamond'"
    ),
  kind: ShapeKindSchema,
  aspectRatio: z
    .number()
    .positive()
    .optional()
    .describe(
      "Preferred width/height ratio. E.g., 2.0 means width is twice the height. " +
        "Omit for shapes where aspect ratio is fixed (circle = 1.0) or unconstrained."
    ),
  name: z
    .string()
    .optional()
    .describe("Human-readable name, e.g. 'Decision Diamond', 'Service Box'"),
});

const ShapePaletteSchema = z
  .array(ShapePaletteEntrySchema)
  .max(15)
  .describe(
    "Shape palette extracted from the source image. Max 15 distinct shapes. " +
      "Every node's shapeId MUST reference an id from this palette."
  );

// --- Size palette schemas ---

const SizePaletteEntrySchema = z.object({
  id: z
    .string()
    .describe(
      "Unique kebab-case identifier for this size class, e.g. 'small-service', 'large-container'"
    ),
  width: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized width (0-1 fraction of image width)"),
  height: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized height (0-1 fraction of image height)"),
  name: z
    .string()
    .optional()
    .describe("Human-readable name, e.g. 'Small Service Box', 'Large Container'"),
});

const SizePaletteSchema = z
  .array(SizePaletteEntrySchema)
  .max(20)
  .describe(
    "Size palette: distinct size classes found in the diagram. Max 20. " +
      "Similar-sized objects MUST share the same size class. " +
      "When merging similar sizes, favor the LARGER dimensions to accommodate the longest label."
  );

// --- Semantic type schemas ---

const SemanticTypeEntrySchema = z.object({
  id: z
    .string()
    .describe(
      "Unique kebab-case identifier for this semantic type, e.g. 'liquidity-provider', 'api-gateway'"
    ),
  name: z
    .string()
    .describe("Human-readable class name, e.g. 'Liquidity Provider', 'API Gateway'"),
  description: z
    .string()
    .optional()
    .describe("Brief description of what this archetype represents in the diagram"),
});

const SemanticTypesSchema = z
  .array(SemanticTypeEntrySchema)
  .max(30)
  .describe(
    "Distinct semantic types / archetypes identified in the diagram. " +
      "Nodes with the same semanticTypeId share a conceptual role."
  );

// --- Guide line schemas ---

const GuideLineSchema = z.object({
  id: z
    .string()
    .describe("Unique identifier, e.g. 'row-1', 'col-3'. Used for user commands like 'move row-1 down'."),
  index: z
    .number()
    .int()
    .min(0)
    .describe("Numeric label displayed alongside the guide. Rows numbered top-to-bottom, columns left-to-right."),
  direction: z
    .enum(["horizontal", "vertical"])
    .describe("'horizontal' for row guides (y-axis position), 'vertical' for column guides (x-axis position)"),
  position: z
    .number()
    .min(0)
    .max(1)
    .describe("Normalized 0-1 position. For horizontal guides, this is the y coordinate. For vertical, the x coordinate."),
  label: z
    .string()
    .optional()
    .describe("Optional human-readable label for the guide line"),
});

// --- Diagram schemas ---

const ImageDimensionsSchema = z.object({
  width: z.number().describe("Image width in pixels"),
  height: z.number().describe("Image height in pixels"),
});

const SingleDiagramSchema = z.object({
  id: z.string().describe("Unique identifier for this diagram"),
  title: z.string().describe("Title displayed above the diagram"),
  direction: z
    .enum(["RIGHT", "DOWN", "LEFT", "UP"])
    .default("RIGHT")
    .describe(
      "Primary flow direction of the diagram. Use RIGHT for horizontal flows, DOWN for vertical/hierarchical flows."
    ),
  layoutMode: z
    .enum(["auto", "spatial"])
    .default("auto")
    .describe(
      "'spatial' uses extracted positions from the image; 'auto' uses ELK.js auto-layout"
    ),
  imageDimensions: ImageDimensionsSchema.optional().describe(
    "Original image dimensions in pixels. Required for spatial layout mode."
  ),
  nodes: z.array(NodeSchema).describe("All boxes and container groups in this diagram"),
  edges: z.array(EdgeSchema).describe("All arrows connecting nodes in this diagram"),
  guides: z
    .array(GuideLineSchema)
    .optional()
    .describe(
      "Guide lines representing the implicit alignment grid. " +
        "Horizontal guides define row positions, vertical guides define column positions."
    ),
});

export const DiagramSpecSchema = z.object({
  version: z.enum(["1.0", "2.0", "3.0"]).describe("Schema version. 2.0 includes spatial data. 3.0 adds guide lines and label positioning."),
  palette: ColorPaletteSchema.optional().describe(
    "Color palette sampled from the source image. All node/edge colors should reference " +
      "hex values from this palette. Optional for backward compatibility with older specs."
  ),
  shapePalette: ShapePaletteSchema.optional().describe(
    "Shape palette extracted from the source image. All node shapeId values should reference " +
      "entries from this palette. Optional for backward compatibility."
  ),
  sizePalette: SizePaletteSchema.optional().describe(
    "Size palette: distinct size classes found in the diagram. All node sizeId values should " +
      "reference entries from this palette. Optional for backward compatibility."
  ),
  semanticTypes: SemanticTypesSchema.optional().describe(
    "Semantic type definitions identified in the diagram. Nodes reference these via semanticTypeId. " +
      "Optional for backward compatibility."
  ),
  description: z
    .string()
    .describe(
      "A detailed text description of the entire diagram image. Explain what each " +
        "diagram depicts, the relationships between components, and the flow of data or control."
    ),
  diagrams: z
    .array(SingleDiagramSchema)
    .describe("Each distinct diagram/flow in the image gets its own entry"),
});

export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
export type SingleDiagram = z.infer<typeof SingleDiagramSchema>;
export type DiagramNode = z.infer<typeof NodeSchema>;
export type DiagramEdge = z.infer<typeof EdgeSchema>;
export type NodeStyle = z.infer<typeof NodeStyleSchema>;
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>;
export type NodeSpatial = z.infer<typeof NodeSpatialSchema>;
export type NodeFont = z.infer<typeof NodeFontSchema>;
export type AnchorSide = z.infer<typeof AnchorSideSchema>;
export type ImageDimensions = z.infer<typeof ImageDimensionsSchema>;
export type ColorPaletteEntry = z.infer<typeof ColorPaletteEntrySchema>;
export type ColorPalette = z.infer<typeof ColorPaletteSchema>;
export type ShapeKind = z.infer<typeof ShapeKindSchema>;
export type ShapePaletteEntry = z.infer<typeof ShapePaletteEntrySchema>;
export type SizePaletteEntry = z.infer<typeof SizePaletteEntrySchema>;
export type SemanticTypeEntry = z.infer<typeof SemanticTypeEntrySchema>;
export type GuideLine = z.infer<typeof GuideLineSchema>;
export type EdgeLabelStyle = z.infer<typeof EdgeLabelStyleSchema>;
