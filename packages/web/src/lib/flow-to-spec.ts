import type { Node, Edge } from "@xyflow/react";
import type {
  DiagramSpec,
  SingleDiagram,
  DiagramNode,
  DiagramEdge,
  AnchorSide,
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
} from "@objectify/schema";

/**
 * Convert React Flow nodes + edges back into a DiagramSpec JSON object.
 * This is the inverse of the layout pipeline: it reads the current interactive
 * state and serialises it so the user can save / re-import the diagram.
 */
export function flowToSpec(
  nodes: Node[],
  edges: Edge[],
  originalDiagram: SingleDiagram,
  palette?: ColorPaletteEntry[],
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[],
  semanticTypes?: SemanticTypeEntry[]
): DiagramSpec {
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

    edge.style = { lineStyle, color };

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

  return {
    version: (originalDiagram.layoutMode === "spatial" ? "2.0" : "1.0") as "1.0" | "2.0",
    ...(palette && palette.length > 0 ? { palette } : {}),
    ...(shapePalette && shapePalette.length > 0 ? { shapePalette } : {}),
    ...(sizePalette && sizePalette.length > 0 ? { sizePalette } : {}),
    ...(semanticTypes && semanticTypes.length > 0 ? { semanticTypes } : {}),
    description: "Exported from Objectify interactive editor.",
    diagrams: [diagram],
  };
}

// --- helpers ---

function handleToAnchor(handleId: string): AnchorSide | undefined {
  // Handle IDs are "source-top", "target-left", etc.
  const match = handleId.match(/^(?:source|target)-(\w+)$/);
  if (!match) return undefined;
  const side = match[1];
  if (side === "top" || side === "right" || side === "bottom" || side === "left") {
    return side;
  }
  return undefined;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
