import type { Node, Edge } from "@xyflow/react";
import type {
  DiagramSpec,
  SingleDiagram,
  DiagramNode,
  DiagramEdge,
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
  GuideLine,
  NodeLabel,
  EdgeLabel,
} from "@objectify/schema";

/**
 * Unified coordinate normalization.
 *
 * Computes the linear transform that maps guide positions back to [0, 1]
 * per direction, and returns scale factors so callers can apply the same
 * transform to size palette entries.
 *
 * Math (per direction):
 *   newPos = (oldPos - min) / range        where range = max - min
 *   newSize = oldSize / range              (sizes scale but don't shift)
 *
 * When all guides are already in [0, 1] the transform is the identity.
 */
function computeNormalization(guides: GuideLine[]): {
  guides: GuideLine[];
  hScale: number;  // multiply horizontal sizes by this
  vScale: number;  // multiply vertical sizes by this
} {
  if (guides.length === 0) return { guides, hScale: 1, vScale: 1 };

  const horizontal = guides.filter((g) => g.direction === "horizontal");
  const vertical = guides.filter((g) => g.direction === "vertical");

  function computeTransform(group: GuideLine[]): { mapped: GuideLine[]; scale: number } {
    if (group.length === 0) return { mapped: group, scale: 1 };

    const positions = group.map((g) => g.position);
    const min = Math.min(...positions);
    const max = Math.max(...positions);

    // Already within [0, 1] — identity
    if (min >= 0 && max <= 1) return { mapped: group, scale: 1 };

    // Degenerate: all same position
    if (max === min) return { mapped: group.map((g) => ({ ...g, position: 0.5 })), scale: 1 };

    const range = max - min;
    return {
      mapped: group.map((g) => ({ ...g, position: (g.position - min) / range })),
      scale: 1 / range,
    };
  }

  const h = computeTransform(horizontal);
  const v = computeTransform(vertical);

  return {
    guides: [...h.mapped, ...v.mapped],
    hScale: h.scale,   // horizontal guides → affects height sizes
    vScale: v.scale,    // vertical guides → affects width sizes
  };
}

/**
 * Apply normalization scale factors to a size palette.
 * Width scales with the vertical (column) guide transform.
 * Height scales with the horizontal (row) guide transform.
 */
export function normalizeSizePalette(
  palette: SizePaletteEntry[] | undefined,
  hScale: number,
  vScale: number,
): SizePaletteEntry[] | undefined {
  if (!palette || (hScale === 1 && vScale === 1)) return palette;
  return palette.map((e) => ({
    ...e,
    width: e.width * vScale,
    height: e.height * hScale,
  }));
}

/**
 * Convert React Flow nodes + edges back into a SingleDiagram object.
 * This is the core serialisation logic used by both auto-save and export.
 */
export function flowToDiagram(
  nodes: Node[],
  edges: Edge[],
  originalDiagram: SingleDiagram,
  guides?: GuideLine[]
): { diagram: SingleDiagram; normHScale: number; normVScale: number } {
  const specNodes: DiagramNode[] = nodes.map((n) => {
    const isGroup = n.type === "groupNode";
    const data = n.data as Record<string, unknown>;

    const node: DiagramNode = {
      id: n.id,
      label: (data.label as string) ?? n.id,
      type: isGroup ? "group" : "box",
      style: (data.style as DiagramNode["style"]) ?? {
        backgroundColor: "#FFFFFF",
        textColor: "#000000",
      },
    };

    if (n.parentId) {
      node.parentId = n.parentId;
    }

    if (data.font) {
      node.font = data.font as DiagramNode["font"];
    }

    // Preserve shape, size, and semantic type references
    if (data.shapeId) {
      node.shapeId = data.shapeId as string;
    }
    if (data.sizeId) {
      node.sizeId = data.sizeId as string;
    }
    if (data.semanticTypeId) {
      node.semanticTypeId = data.semanticTypeId as string;
    }
    if (data.guideRow) {
      node.guideRow = data.guideRow as string;
    }
    if (data.guideColumn) {
      node.guideColumn = data.guideColumn as string;
    }
    if (data.guideRowBottom) {
      node.guideRowBottom = data.guideRowBottom as string;
    }
    if (data.guideColumnRight) {
      node.guideColumnRight = data.guideColumnRight as string;
    }
    if (data.zLevel) {
      node.zLevel = data.zLevel as DiagramNode["zLevel"];
    }

    // Export multi-label array; also set legacy label from labels[0]
    if (data.labels) {
      const labels = data.labels as NodeLabel[];
      node.labels = labels;
      node.label = labels[0]?.text ?? node.label;
    }

    if (data.description) {
      node.description = data.description as string;
    }
    if (data.url) {
      node.url = data.url as string;
    }

    return node;
  });

  const specEdges: DiagramEdge[] = edges.map((e) => {
    const edge: DiagramEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
    };

    if (e.label) {
      edge.label = String(e.label);
    }

    // Reverse-map handle IDs back to anchor sides
    if (e.sourceHandle) {
      const side = handleToAnchor(e.sourceHandle);
      if (side) edge.sourceAnchor = side;
    }
    if (e.targetHandle) {
      const side = handleToAnchor(e.targetHandle);
      if (side) edge.targetAnchor = side;
    }

    // Reverse-map edge style
    const strokeDash = (e.style as Record<string, unknown>)?.strokeDasharray;
    const lineStyle: "solid" | "dashed" | "dotted" =
      strokeDash === "6,3"
        ? "dashed"
        : strokeDash === "2,2"
          ? "dotted"
          : "solid";

    const color =
      ((e.style as Record<string, unknown>)?.stroke as string) ?? "#333333";

    // Read routing type and strokeWidth from edge data (set by unified CustomEdge)
    const edgeData = ((e as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
    const routingType = (edgeData.routingType as string) ?? "straight";
    const strokeWidth = edgeData.strokeWidth as number | undefined;

    edge.style = {
      lineStyle,
      color,
      routingType: routingType as "straight" | "step" | "smoothstep" | "bezier" | "smooth-repelled",
      ...(strokeWidth && strokeWidth !== 1.5 ? { strokeWidth } : {}),
    };

    // Preserve edge label style, multi-labels, and markers if present in data
    if (edgeData) {
      if (edgeData.labelStyle) {
        edge.labelStyle = edgeData.labelStyle as DiagramEdge["labelStyle"];
      }
      if (edgeData.labels) {
        const labels = edgeData.labels as EdgeLabel[];
        edge.labels = labels;
        // Also set legacy label from first label text
        if (labels.length > 0) {
          edge.label = labels[0].text;
        }
      }
      if (edgeData.sourceMarker) {
        edge.sourceMarker = edgeData.sourceMarker as DiagramEdge["sourceMarker"];
      }
      if (edgeData.targetMarker) {
        edge.targetMarker = edgeData.targetMarker as DiagramEdge["targetMarker"];
      }
      if (edgeData.description) {
        edge.description = edgeData.description as string;
      }
    }

    return edge;
  });

  const diagram: SingleDiagram = {
    id: originalDiagram.id,
    title: originalDiagram.title,
    direction: originalDiagram.direction ?? "RIGHT",
    layoutMode: originalDiagram.layoutMode ?? "auto",
    nodes: specNodes,
    edges: specEdges,
  };

  if (originalDiagram.imageDimensions) {
    diagram.imageDimensions = originalDiagram.imageDimensions;
  }

  // Normalize guide positions to [0, 1] and compute scale factors
  // for applying the same transform to the size palette.
  let normHScale = 1, normVScale = 1;
  if (guides && guides.length > 0) {
    const norm = computeNormalization(guides);
    diagram.guides = norm.guides;
    normHScale = norm.hScale;
    normVScale = norm.vScale;
  }

  if (originalDiagram.legend) {
    diagram.legend = originalDiagram.legend;
  }

  return { diagram, normHScale, normVScale };
}

/**
 * Convert React Flow nodes + edges back into a full DiagramSpec JSON object.
 * Wraps flowToDiagram with palette/version metadata for export.
 */
export function flowToSpec(
  nodes: Node[],
  edges: Edge[],
  originalDiagram: SingleDiagram,
  palette?: ColorPaletteEntry[],
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[],
  semanticTypes?: SemanticTypeEntry[],
  guides?: GuideLine[],
  originalDescription?: string
): DiagramSpec {
  const { diagram, normHScale, normVScale } = flowToDiagram(nodes, edges, originalDiagram, guides);
  const normalizedSizePalette = normalizeSizePalette(sizePalette, normHScale, normVScale);

  const hasGuides = guides && guides.length > 0;
  const hasMultiLabels = diagram.nodes.some((n) => n.labels && n.labels.length > 0)
    || diagram.edges.some((e) => e.labels && e.labels.length > 0);
  const hasV5Features = diagram.edges.some(
    (e) => (e.sourceMarker && e.sourceMarker !== "none") || (e.targetMarker && e.targetMarker !== "arrow")
  );
  const hasV6Features = diagram.edges.some(
    (e) => e.style?.strokeWidth !== undefined || e.style?.routingType === "step"
  );
  const hasV7Features = diagram.edges.some(
    (e) => e.style?.routingType === "smooth-repelled"
  );
  const version = hasV7Features
    ? "7.0"
    : hasV6Features
      ? "6.0"
      : hasV5Features
        ? "5.0"
        : hasMultiLabels
          ? "4.0"
          : hasGuides
            ? "3.0"
            : "1.0";

  return {
    version: version as "1.0" | "2.0" | "3.0" | "4.0" | "5.0" | "6.0" | "7.0",
    ...(palette && palette.length > 0 ? { palette } : {}),
    ...(shapePalette && shapePalette.length > 0 ? { shapePalette } : {}),
    ...(normalizedSizePalette && normalizedSizePalette.length > 0 ? { sizePalette: normalizedSizePalette } : {}),
    ...(semanticTypes && semanticTypes.length > 0 ? { semanticTypes } : {}),
    description: originalDescription ?? "Exported from Objectify interactive editor.",
    diagrams: [diagram],
  };
}

/**
 * Remove guides that are no longer referenced by any node.
 * Should be called after node deletions and after LLM refinements.
 */
export function pruneOrphanedGuides(guides: GuideLine[], nodes: Node[]): GuideLine[] {
  const guideFields = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;
  const referencedIds = new Set<string>();
  for (const node of nodes) {
    const nd = node.data as Record<string, unknown>;
    for (const field of guideFields) {
      const val = nd?.[field] as string | undefined;
      if (val) referencedIds.add(val);
    }
  }
  return guides.filter((g) => referencedIds.has(g.id));
}

// --- helpers ---

const VALID_ANCHORS = new Set([
  "12:00", "12:30", "1:00", "1:30", "2:00", "2:30",
  "3:00", "3:30", "4:00", "4:30", "5:00", "5:30",
  "6:00", "6:30", "7:00", "7:30", "8:00", "8:30",
  "9:00", "9:30", "10:00", "10:30", "11:00", "11:30",
  "top", "right", "bottom", "left",
]);

type AnchorSide =
  | "12:00" | "12:30" | "1:00" | "1:30" | "2:00" | "2:30"
  | "3:00" | "3:30" | "4:00" | "4:30" | "5:00" | "5:30"
  | "6:00" | "6:30" | "7:00" | "7:30" | "8:00" | "8:30"
  | "9:00" | "9:30" | "10:00" | "10:30" | "11:00" | "11:30"
  | "top" | "right" | "bottom" | "left";

function handleToAnchor(handleId: string): AnchorSide | undefined {
  // Handle IDs: "source-12:00", "target-3:00", "source-top" (legacy), etc.
  const match = handleId.match(/^(?:source|target)-(.+)$/);
  if (!match) return undefined;
  const anchor = match[1];
  return VALID_ANCHORS.has(anchor) ? (anchor as AnchorSide) : undefined;
}

// normalizeGuidePositions replaced by computeNormalization (see above)
