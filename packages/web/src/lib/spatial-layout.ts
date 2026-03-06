import type { Node, Edge } from "@xyflow/react";
import type { SingleDiagram, DiagramNode, ShapePaletteEntry } from "@objectify/schema";
import { specEdgesToFlowEdges } from "./spec-to-flow.js";
import { migrateNodeLabels } from "./label-migration.js";
import { zLevelToIndex } from "./z-level.js";

const DEFAULT_CANVAS_WIDTH = 1200;

export function spatialLayoutDiagram(
  diagram: SingleDiagram,
  canvasWidth: number = DEFAULT_CANVAS_WIDTH,
  shapePalette?: ShapePaletteEntry[]
): { nodes: Node[]; edges: Edge[] } {
  const imgW = diagram.imageDimensions?.width ?? 1200;
  const imgH = diagram.imageDimensions?.height ?? 800;
  const aspectRatio = imgH / imgW;
  const canvasHeight = canvasWidth * aspectRatio;

  // Build a map of absolute positions for parent-relative math
  const absolutePositions = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >();

  for (const node of diagram.nodes) {
    if (node.spatial) {
      absolutePositions.set(node.id, {
        x: node.spatial.x * canvasWidth,
        y: node.spatial.y * canvasHeight,
        w: node.spatial.width * canvasWidth,
        h: node.spatial.height * canvasHeight,
      });
    }
  }

  // Build shape lookup map
  const shapeMap = shapePalette
    ? new Map(shapePalette.map((e) => [e.id, e]))
    : undefined;

  const nodes: Node[] = diagram.nodes
    .filter((n) => n.spatial)
    .map((node) => {
      const abs = absolutePositions.get(node.id)!;
      const isGroup = node.type === "group";

      // Resolve shape
      const shapeEntry = node.shapeId && shapeMap
        ? shapeMap.get(node.shapeId)
        : undefined;
      const nodeType = isGroup
        ? "groupNode"
        : shapeEntry
          ? "shapeNode"
          : "colorBox";

      // React Flow expects child positions relative to parent
      let x = abs.x;
      let y = abs.y;

      if (node.parentId) {
        const parentAbs = absolutePositions.get(node.parentId);
        if (parentAbs) {
          x = abs.x - parentAbs.x;
          y = abs.y - parentAbs.y;
        }
      }

      return {
        id: node.id,
        type: nodeType,
        position: { x, y },
        data: {
          label: node.label,
          labels: migrateNodeLabels(node),
          style: node.style,
          font: node.font,
          ...(shapeEntry ? { shapeKind: shapeEntry.kind, ...(shapeEntry.aspectRatio ? { aspectRatio: shapeEntry.aspectRatio } : {}) } : {}),
          ...(node.shapeId ? { shapeId: node.shapeId } : {}),
          ...(node.sizeId ? { sizeId: node.sizeId } : {}),
          ...(node.semanticTypeId ? { semanticTypeId: node.semanticTypeId } : {}),
          ...(node.guideRow ? { guideRow: node.guideRow } : {}),
          ...(node.guideColumn ? { guideColumn: node.guideColumn } : {}),
          ...(node.zLevel ? { zLevel: node.zLevel } : {}),
          ...(node.description ? { description: node.description } : {}),
        },
        ...(node.parentId
          ? { parentId: node.parentId, extent: "parent" as const }
          : {}),
        ...(isGroup
          ? { style: { width: abs.w, height: abs.h } }
          : {}),
        zIndex: zLevelToIndex(node.zLevel),
        width: abs.w,
        height: abs.h,
      } satisfies Node;
    });

  const edges = specEdgesToFlowEdges(diagram.edges);

  return { nodes, edges };
}
