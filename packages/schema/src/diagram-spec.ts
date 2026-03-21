import { z } from "zod";

// --- Shared enums ---

const AnchorSideSchema = z
  .enum(["top", "right", "bottom", "left"])
  .describe("Side of a node: top (12 o'clock), right (3), bottom (6), left (9)");

const ClockAnchorSchema = z
  .enum([
    "12:00", "12:30", "1:00", "1:30", "2:00", "2:30",
    "3:00", "3:30", "4:00", "4:30", "5:00", "5:30",
    "6:00", "6:30", "7:00", "7:30", "8:00", "8:30",
    "9:00", "9:30", "10:00", "10:30", "11:00", "11:30",
    // Legacy aliases for backward compatibility:
    "top", "right", "bottom", "left",
  ])
  .describe(
    "Anchor position on a node using clock notation (24 positions at 15° intervals). " +
      "Full hours: 12:00=top, 3:00=right, 6:00=bottom, 9:00=left. " +
      "Half hours fill in between (e.g. 1:30=top-right, 4:30=bottom-right). " +
      "Legacy values 'top','right','bottom','left' are accepted as aliases."
  );

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
  opacity: z
    .number()
    .min(0)
    .max(1)
    .default(1)
    .describe("Element opacity from 0 (fully transparent) to 1 (fully opaque)"),
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

// --- Label schemas ---

const ClockPositionSchema = z
  .enum([
    "center",   // inside, centered (default for primary label)
    "12:00",    // above, horizontally centered
    "1:30",     // above-right
    "3:00",     // right, vertically centered
    "4:30",     // below-right
    "6:00",     // below, horizontally centered
    "7:30",     // below-left
    "9:00",     // left, vertically centered
    "10:30",    // above-left
  ])
  .describe("Clock-face position relative to the node");

const NodeLabelSchema = z.object({
  text: z.string().describe("Label text content"),
  position: ClockPositionSchema.default("center")
    .describe("Clock-face position relative to the node"),
  font: NodeFontSchema.optional()
    .describe("Per-label font override. Falls back to node-level font."),
});

const NodeSchema = z.object({
  id: z
    .string()
    .describe("Unique kebab-case identifier, e.g. 'payment-service', 'api-gateway'"),
  label: z.string().describe("Display text shown inside the box"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of what this node represents. Shown as a tooltip on hover."),
  type: z
    .enum(["box", "group"])
    .describe(
      "'box' for leaf nodes, 'group' for containers that hold other nodes. " +
        "Groups visually enclose their children and can have any shape (rectangle, cloud, etc.) via shapeId. " +
        "Groups can nest arbitrarily deep: a group inside a group creates a hierarchy. " +
        "Children reference their parent group via parentId. " +
        "Use solid borders for physical containers (servers, machines) and dashed borders for logical groupings (clouds, zones)."
    ),
  parentId: z
    .string()
    .optional()
    .describe(
      "ID of the parent group node if this node is nested inside one. " +
        "Creates a containment hierarchy: moving a node out of its parent group changes the semantic relationship. " +
        "Nesting can be arbitrarily deep (e.g., a pod inside a node inside a cluster)."
    ),
  style: NodeStyleSchema,
  orderHint: z
    .number()
    .optional()
    .describe(
      "Relative position hint: lower numbers appear further left/top in layout"
    ),
  zLevel: z
    .enum(["background", "base", "raised", "foreground", "overlay"])
    .default("base")
    .optional()
    .describe(
      "Stacking level for the node. Five levels from back to front: " +
        "'background' (decorative backdrops), 'base' (default), 'raised' (slight emphasis), " +
        "'foreground' (prominent), 'overlay' (annotations/callouts)."
    ),

  font: NodeFontSchema.optional().describe(
    "Estimated font properties."
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
      "References a size palette entry by id. All nodes sharing a sizeId render at identical dimensions. " +
        "For groups: provides explicit container dimensions. Groups without sizeId auto-size from children. " +
        "Containers sharing the same height value will have aligned bottom edges when their tops align via guides."
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
    .describe(
      "ID of the horizontal guide line this node's center snaps to. " +
        "Nodes sharing the same guideRow are horizontally aligned. " +
        "For nodes inside groups: when the top-most children across different groups share " +
        "the same row guide, the containers automatically get aligned top edges. " +
        "Similarly, bottom-most children on the same row guide align container bottom edges."
    ),
  guideColumn: z
    .string()
    .optional()
    .describe(
      "ID of the vertical guide line this node's center snaps to. " +
        "Nodes sharing the same guideColumn are vertically aligned. " +
        "Each (guideRow, guideColumn) pair must be unique across all leaf nodes."
    ),
  guideRowBottom: z
    .string()
    .optional()
    .describe(
      "ID of the horizontal guide at this group's bottom edge. " +
        "Only applies to group nodes. Groups sharing the same guideRowBottom " +
        "have aligned bottom edges. Used with guideRow to derive container height from guides."
    ),
  guideColumnRight: z
    .string()
    .optional()
    .describe(
      "ID of the vertical guide at this group's right edge. " +
        "Only applies to group nodes. Groups sharing the same guideColumnRight " +
        "have aligned right edges. Used with guideColumn to derive container width from guides."
    ),
  labels: z
    .array(NodeLabelSchema)
    .optional()
    .describe(
      "Multi-label array. labels[0] is the primary label (default: center). " +
        "Additional labels are positioned at clock positions around the node. " +
        "When present, supersedes the legacy 'label' + 'labelPosition' fields."
    ),
  url: z
    .string()
    .optional()
    .describe(
      "Optional URL associated with this node. When set, a globe icon appears on the node " +
        "that the user can click to open the URL in a new tab."
    ),
});

// --- Edge marker schemas ---

const MarkerKindSchema = z
  .enum(["arrow", "ball", "socket", "none"])
  .describe(
    "Endpoint marker for an edge. " +
      "'ball' = small filled circle representing a provided interface (UML lollipop). " +
      "'socket' = half-circle arc representing a required interface (UML socket). " +
      "'arrow' = standard arrowhead. 'none' = plain line end."
  );

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
  routingType: z
    .enum(["straight", "step", "smoothstep", "bezier", "smooth-repelled"])
    .default("straight")
    .optional()
    .describe(
      "Edge routing algorithm. Choose based on the visual appearance of the connector: " +
        "'straight' = direct line between anchors (no bends). " +
        "'step' = orthogonal path with sharp 90° corners (right-angle bends, crisp corners). " +
        "'smoothstep' = orthogonal path with rounded 90° corners (right-angle bends with soft curves at turns). " +
        "'bezier' = smooth S-curve or C-curve between anchors (no sharp corners, no right angles). " +
        "'smooth-repelled' = orthogonal path with rounded bends that routes through channels between guide lines (auto-default for guide-based layouts — do not set explicitly unless overriding). " +
        "Defaults to 'straight'. Most flowcharts and architecture diagrams use 'straight' or 'smoothstep'."
    ),
  strokeWidth: z
    .number()
    .min(0.5)
    .max(8)
    .default(1.5)
    .optional()
    .describe(
      "Line thickness in pixels. Common values: 1 (thin/secondary), 1.5 (normal/default), " +
        "2.5 (thick/emphasized), 4 (heavy/primary flow). " +
        "Use thicker values for prominent main-flow arrows and thinner values for secondary or annotation arrows."
    ),
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

const EdgeLabelSchema = z.object({
  text: z.string().describe("Label text content"),
  position: z
    .enum(["center", "source", "target"])
    .default("center")
    .describe("Where along the edge path the label is placed"),
  font: EdgeLabelStyleSchema.optional()
    .describe("Per-label font/style override"),
  ownerNodeId: z
    .string()
    .optional()
    .describe(
      "If set, this label semantically belongs to the referenced node rather than the edge. " +
        "It still renders near the edge, but moves with the node and is styled accordingly in 'Show Labels' mode."
    ),
});

const EdgeSchema = z.object({
  id: z.string().describe("Unique identifier, e.g. 'edge-1'"),
  source: z.string().describe("ID of the source node where the arrow starts"),
  target: z.string().describe("ID of the target node where the arrow ends"),
  label: z
    .string()
    .optional()
    .describe("Text label displayed on or near the arrow"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of what this relationship represents. Shown as a tooltip on hover."),
  style: EdgeStyleSchema.optional(),
  sourceAnchor: ClockAnchorSchema.optional().describe(
    "Anchor position on the source node where the edge originates. " +
      "Uses clock notation (e.g. '3:00' for right center, '1:30' for top-right corner)."
  ),
  targetAnchor: ClockAnchorSchema.optional().describe(
    "Anchor position on the target node where the edge terminates. " +
      "Uses clock notation (e.g. '9:00' for left center, '7:30' for bottom-left corner)."
  ),
  labelStyle: EdgeLabelStyleSchema.optional().describe(
    "Styling for the edge label text. If omitted, renderer defaults apply."
  ),
  labels: z
    .array(EdgeLabelSchema)
    .optional()
    .describe(
      "Multi-label array. When present, supersedes the legacy 'label' + 'labelStyle' fields."
    ),
  sourceMarker: MarkerKindSchema.default("none")
    .optional()
    .describe(
      "Marker at the source end of the edge. Defaults to 'none' (plain line). " +
        "Use 'ball'/'socket' for UML component-style connectors."
    ),
  targetMarker: MarkerKindSchema.default("arrow")
    .optional()
    .describe(
      "Marker at the target end of the edge. Defaults to 'arrow'. " +
        "Use 'ball' for a provided interface endpoint, 'socket' for a required interface endpoint."
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
    "cloud",
    "cylinder",
  ])
  .describe(
    "Geometric shape kind for a node or group container. " +
      "'cloud' renders a cloud/blob outline, typically for logical groupings (e.g., cloud providers). " +
      "'cylinder' renders a database cylinder icon (top ellipse + body). " +
      "Groups can use any shape via shapeId — 'rectangle' is the default for groups."
  );

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
  visible: z
    .boolean()
    .default(true)
    .optional()
    .describe("Whether to render this guide line visually. Set to false for layout-only boundary guides that should not clutter the diagram."),
  pinned: z
    .boolean()
    .default(false)
    .optional()
    .describe("When true, this guide's position is a user override. Automatic layout adjustments will not shift pinned guides."),
});

// --- Legend schemas ---

const LegendNodeEntrySchema = z.object({
  semanticTypeId: z
    .string()
    .optional()
    .describe("References a semantic type. The legend entry represents this category of nodes."),
  label: z
    .string()
    .describe("Display text for this legend entry, e.g. 'Kubernetes components'"),
  color: z
    .string()
    .optional()
    .describe("CSS hex color for the legend swatch. If semanticTypeId is set, can be auto-derived."),
  shapeId: z
    .string()
    .optional()
    .describe("Shape palette reference for the legend swatch icon."),
});

const LegendEdgeEntrySchema = z.object({
  label: z
    .string()
    .describe("Display text for this edge legend entry, e.g. 'provides'"),
  sourceMarker: MarkerKindSchema.default("none")
    .optional()
    .describe("Marker at the source end of the example edge"),
  targetMarker: MarkerKindSchema.default("none")
    .optional()
    .describe("Marker at the target end of the example edge"),
  lineStyle: z
    .enum(["solid", "dashed", "dotted"])
    .default("solid"),
  color: z
    .string()
    .default("#000000"),
});

const LegendSchema = z.object({
  title: z
    .string()
    .default("Legend")
    .describe("Title displayed at the top of the legend box"),
  nodeEntries: z
    .array(LegendNodeEntrySchema)
    .optional()
    .describe("Node category entries shown in the legend"),
  edgeEntries: z
    .array(LegendEdgeEntrySchema)
    .optional()
    .describe("Edge type entries shown in the legend"),
});

// --- Diagram schemas ---

const ImageDimensionsSchema = z.object({
  width: z.number().describe("Image width in pixels"),
  height: z.number().describe("Image height in pixels"),
});

const SingleDiagramSchema = z.object({
  id: z.string().describe("Unique identifier for this diagram"),
  title: z.string().describe("Title displayed above the diagram"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of what this diagram depicts. Shown as a subtitle below the diagram title."),
  direction: z
    .enum(["RIGHT", "DOWN", "LEFT", "UP"])
    .default("RIGHT")
    .describe(
      "Primary flow direction of the diagram. Use RIGHT for horizontal flows, DOWN for vertical/hierarchical flows."
    ),
  layoutMode: z
    .enum(["auto"])
    .default("auto")
    .describe(
      "'auto' uses guide-based layout when guides are present, otherwise ELK.js auto-layout"
    ),
  imageDimensions: ImageDimensionsSchema.optional().describe(
    "Original image dimensions in pixels. Used to set the canvas aspect ratio for " +
      "guide-based layout mode, ensuring faithful proportions."
  ),
  nodes: z.array(NodeSchema).describe("All boxes and container groups in this diagram"),
  edges: z.array(EdgeSchema).describe("All arrows connecting nodes in this diagram"),
  guides: z
    .array(GuideLineSchema)
    .optional()
    .describe(
      "Guide lines representing the alignment grid. " +
        "Horizontal guides define row positions (y-axis), vertical guides define column positions (x-axis). " +
        "Leaf nodes snap their centers to guide intersections via guideRow/guideColumn. " +
        "Container groups can reference four edge guides (guideRow, guideColumn, guideRowBottom, guideColumnRight) " +
        "to derive their exact position and size. Groups sharing the same edge guides have aligned edges."
    ),
  legend: LegendSchema.optional().describe(
    "Legend configuration. If present, renders a legend panel showing " +
      "node categories (with color swatches) and edge types (with marker examples)."
  ),
}).superRefine((diagram, ctx) => {
  // Every diagram MUST have guides — at minimum one horizontal and one vertical.
  // Guides are the structural grid that determines node placement and connector routing.
  const guides = diagram.guides ?? [];
  const horizontalGuides = guides.filter((g) => g.direction === "horizontal");
  const verticalGuides = guides.filter((g) => g.direction === "vertical");

  if (horizontalGuides.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["guides"],
      message:
        "Diagram is missing horizontal guides. Every diagram must have at least one horizontal guide (row) " +
        "and one vertical guide (column). Even a single-node diagram needs one row guide and one column guide " +
        "so the node can be placed at their intersection via guideRow and guideColumn.",
    });
  }
  if (verticalGuides.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["guides"],
      message:
        "Diagram is missing vertical guides. Every diagram must have at least one vertical guide (column) " +
        "and one horizontal guide (row). Even a single-node diagram needs one row guide and one column guide " +
        "so the node can be placed at their intersection via guideRow and guideColumn.",
    });
  }

  // Every edge MUST have explicit sourceAnchor and targetAnchor.
  // Without anchors, connectors attach at arbitrary points on the node bounding box
  // instead of at the correct clock positions along the guide grid.
  for (let i = 0; i < diagram.edges.length; i++) {
    const edge = diagram.edges[i];
    if (!edge.sourceAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", i, "sourceAnchor"],
        message:
          `Edge "${edge.id}" (${edge.source} → ${edge.target}) is missing sourceAnchor. ` +
          `When guides are present, every edge must have explicit sourceAnchor and targetAnchor ` +
          `using clock notation (e.g. "3:00" for right, "9:00" for left, "6:00" for bottom, "12:00" for top). ` +
          `For nodes on the same row flowing left-to-right, use sourceAnchor "3:00". ` +
          `For nodes on the same row flowing right-to-left, use sourceAnchor "9:00". ` +
          `For wrap-around edges going down to the next row, use sourceAnchor "6:00".`,
      });
    }
    if (!edge.targetAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", i, "targetAnchor"],
        message:
          `Edge "${edge.id}" (${edge.source} → ${edge.target}) is missing targetAnchor. ` +
          `When guides are present, every edge must have explicit sourceAnchor and targetAnchor ` +
          `using clock notation (e.g. "3:00" for right, "9:00" for left, "6:00" for bottom, "12:00" for top). ` +
          `For nodes on the same row receiving from the left, use targetAnchor "9:00". ` +
          `For nodes on the same row receiving from the right, use targetAnchor "3:00". ` +
          `For wrap-around edges arriving from the row above, use targetAnchor "12:00".`,
      });
    }
  }
});

export const DiagramSpecSchema = z.object({
  version: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0"]).describe("Schema version. 3.0 adds guide lines and label positioning. 4.0 adds multi-label support. 5.0 adds container group shapes (cloud, cylinder) and ball-socket edge endpoint markers. 6.0 adds step routing type and strokeWidth. 7.0 adds smooth-repelled routing type for guide-based layouts. 8.0 adds per-object description fields on nodes, edges, and diagrams."),
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
export type ClockPosition = z.infer<typeof ClockPositionSchema>;
export type NodeLabel = z.infer<typeof NodeLabelSchema>;
export type EdgeLabel = z.infer<typeof EdgeLabelSchema>;
export type MarkerKind = z.infer<typeof MarkerKindSchema>;
export type ClockAnchor = z.infer<typeof ClockAnchorSchema>;
export type LegendConfig = z.infer<typeof LegendSchema>;
export type LegendNodeEntry = z.infer<typeof LegendNodeEntrySchema>;
export type LegendEdgeEntry = z.infer<typeof LegendEdgeEntrySchema>;
