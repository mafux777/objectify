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
 * Convert React Flow nodes + edges back into a SingleDiagram object.
 * This is the core serialisation logic used by both auto-save and export.
 */
export function flowToDiagram(
  nodes: Node[],
  edges: Edge[],
  originalDiagram: SingleDiagram,
  guides?: GuideLine[]
): SingleDiagram {
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

    // Preserve spatial data: convert absolute pixel positions back to
    // normalised 0-1 coordinates if the original diagram was spatial.
    if (originalDiagram.layoutMode === "spatial" && originalDiagram.imageDimensions) {
      const imgW = originalDiagram.imageDimensions.width;
      const imgH = originalDiagram.imageDimensions.height;

      // We used canvasWidth = 1200 in spatial-layout.ts
      const canvasWidth = 1200;
      const aspectRatio = imgH / imgW;
      const canvasHeight = canvasWidth * aspectRatio;

      // If node has a parent, its position is relative to parent.
      // We need absolute position for normalisation.
      let absX = n.position.x;
      let absY = n.position.y;

      if (n.parentId) {
        const parent = nodes.find((p) => p.id === n.parentId);
        if (parent) {
          absX += parent.position.x;
          absY += parent.position.y;
        }
      }

      const w = (n.width ?? n.measured?.width ?? 160);
      const h = (n.height ?? n.measured?.height ?? 50);

      node.spatial = {
        x: clamp01(absX / canvasWidth),
        y: clamp01(absY / canvasHeight),
        width: clamp01(w / canvasWidth),
        height: clamp01(h / canvasHeight),
      };
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

  if (guides && guides.length > 0) {
    diagram.guides = normalizeGuidePositions(guides);
  }

  if (originalDiagram.legend) {
    diagram.legend = originalDiagram.legend;
  }

  return diagram;
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
  guides?: GuideLine[]
): DiagramSpec {
  const diagram = flowToDiagram(nodes, edges, originalDiagram, guides);

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
            : originalDiagram.layoutMode === "spatial"
              ? "2.0"
              : "1.0";

  return {
    version: version as "1.0" | "2.0" | "3.0" | "4.0" | "5.0" | "6.0" | "7.0",
    ...(palette && palette.length > 0 ? { palette } : {}),
    ...(shapePalette && shapePalette.length > 0 ? { shapePalette } : {}),
    ...(sizePalette && sizePalette.length > 0 ? { sizePalette } : {}),
    ...(semanticTypes && semanticTypes.length > 0 ? { semanticTypes } : {}),
    description: "Exported from Objectify interactive editor.",
    diagrams: [diagram],
  };
}

// --- helpers ---

const VALID_ANCHORS = new Set([
  "12:00", "1:30", "3:00", "4:30", "6:00", "7:30", "9:00", "10:30",
  "top", "right", "bottom", "left",
]);

type AnchorSide =
  | "12:00" | "1:30" | "3:00" | "4:30" | "6:00" | "7:30" | "9:00" | "10:30"
  | "top" | "right" | "bottom" | "left";

function handleToAnchor(handleId: string): AnchorSide | undefined {
  // Handle IDs: "source-12:00", "target-3:00", "source-top" (legacy), etc.
  const match = handleId.match(/^(?:source|target)-(.+)$/);
  if (!match) return undefined;
  const anchor = match[1];
  return VALID_ANCHORS.has(anchor) ? (anchor as AnchorSide) : undefined;
}

/**
 * Re-normalize guide positions to [0, 1] when any guide has drifted outside
 * that range (e.g. after infinite-canvas expansion).  This keeps the schema
 * contract intact while allowing guides to temporarily exceed [0, 1] during
 * interactive editing.
 *
 * Each direction (horizontal / vertical) is normalized independently.
 * If all positions are already within [0, 1], guides are returned as-is.
 */
function normalizeGuidePositions(guides: GuideLine[]): GuideLine[] {
  const MARGIN = 0.05;

  const horizontal = guides.filter((g) => g.direction === "horizontal");
  const vertical = guides.filter((g) => g.direction === "vertical");

  function normalizeGroup(group: GuideLine[]): GuideLine[] {
    if (group.length === 0) return group;

    const positions = group.map((g) => g.position);
    const min = Math.min(...positions);
    const max = Math.max(...positions);

    // Already within [0, 1] — no-op
    if (min >= 0 && max <= 1) return group;

    // Degenerate case: all at the same position
    if (max === min) return group.map((g) => ({ ...g, position: 0.5 }));

    // Linearly map [min, max] → [MARGIN, 1 - MARGIN]
    const targetMin = MARGIN;
    const targetMax = 1 - MARGIN;
    const scale = (targetMax - targetMin) / (max - min);

    return group.map((g) => ({
      ...g,
      position: targetMin + (g.position - min) * scale,
    }));
  }

  return [...normalizeGroup(horizontal), ...normalizeGroup(vertical)];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
