import type { Node, Edge } from "@xyflow/react";
import type {
  SingleDiagram,
  DiagramNode,
  GuideLine,
  ShapePaletteEntry,
  SizePaletteEntry,
} from "@objectify/schema";
import { specEdgesToFlowEdges } from "./spec-to-flow.js";

const REFERENCE_CANVAS_WIDTH = 1200;
const REFERENCE_CANVAS_HEIGHT = 800;

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 50;
const CELL_STACK_GAP = 10;

/**
 * Validate that no two nodes share the same (guideRow, guideColumn) pair.
 * Returns an array of warning strings for any duplicates found.
 */
export function validateGuideCoordinates(
  nodes: DiagramNode[]
): string[] {
  const seen = new Map<string, string>(); // cellKey → first node id
  const warnings: string[] = [];

  for (const node of nodes) {
    if (!node.guideRow || !node.guideColumn) continue;
    const key = `${node.guideRow}::${node.guideColumn}`;
    const existing = seen.get(key);
    if (existing) {
      warnings.push(
        `Duplicate grid cell (${node.guideRow}, ${node.guideColumn}): "${node.id}" conflicts with "${existing}"`
      );
    } else {
      seen.set(key, node.id);
    }
  }

  return warnings;
}

/**
 * Guide-based layout: positions nodes at the intersections of their assigned
 * row (horizontal guide) and column (vertical guide). This makes guides
 * structural — the grid skeleton that determines node placement.
 */
export function guideLayoutDiagram(
  diagram: SingleDiagram,
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[]
): { nodes: Node[]; edges: Edge[] } {
  const imgW = diagram.imageDimensions?.width ?? REFERENCE_CANVAS_WIDTH;
  const imgH = diagram.imageDimensions?.height ?? REFERENCE_CANVAS_HEIGHT;
  const canvasWidth = REFERENCE_CANVAS_WIDTH;
  const canvasHeight = canvasWidth * (imgH / imgW);

  // Validate unique grid coordinates
  const warnings = validateGuideCoordinates(diagram.nodes);
  for (const w of warnings) {
    console.warn(`[Guide Layout] ${w}`);
  }

  // Build lookup maps
  const guideMap = new Map<string, GuideLine>();
  for (const g of diagram.guides ?? []) {
    guideMap.set(g.id, g);
  }

  const shapeMap = shapePalette
    ? new Map(shapePalette.map((e) => [e.id, e]))
    : undefined;
  const sizeMap = sizePalette
    ? new Map(sizePalette.map((e) => [e.id, e]))
    : undefined;

  // Resolve node dimensions
  function getNodeSize(node: DiagramNode): { w: number; h: number } {
    const sizeEntry = node.sizeId && sizeMap ? sizeMap.get(node.sizeId) : undefined;
    return {
      w: sizeEntry ? Math.round(sizeEntry.width * REFERENCE_CANVAS_WIDTH) : DEFAULT_NODE_WIDTH,
      h: sizeEntry ? Math.round(sizeEntry.height * REFERENCE_CANVAS_HEIGHT) : DEFAULT_NODE_HEIGHT,
    };
  }

  // Group nodes by their (guideRow, guideColumn) cell
  const cellKey = (row: string, col: string) => `${row}::${col}`;
  const cells = new Map<string, DiagramNode[]>();
  const unassigned: DiagramNode[] = [];

  for (const node of diagram.nodes) {
    if (node.guideRow && node.guideColumn) {
      const key = cellKey(node.guideRow, node.guideColumn);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(node);
    } else {
      unassigned.push(node);
    }
  }

  const rfNodes: Node[] = [];

  // Place nodes at guide intersections
  for (const [, cellNodes] of cells) {
    const firstNode = cellNodes[0];
    const rowGuide = guideMap.get(firstNode.guideRow!);
    const colGuide = guideMap.get(firstNode.guideColumn!);
    if (!rowGuide || !colGuide) {
      // Guides not found — treat as unassigned
      unassigned.push(...cellNodes);
      continue;
    }

    const centerX = colGuide.position * canvasWidth;
    const centerY = rowGuide.position * canvasHeight;

    // Compute total stack height for vertical centering
    const sizes = cellNodes.map((n) => getNodeSize(n));
    const totalHeight =
      sizes.reduce((sum, s) => sum + s.h, 0) +
      CELL_STACK_GAP * (cellNodes.length - 1);
    let currentY = centerY - totalHeight / 2;

    for (let i = 0; i < cellNodes.length; i++) {
      const node = cellNodes[i];
      const { w, h } = sizes[i];
      const x = centerX - w / 2;
      const y = currentY;
      currentY += h + CELL_STACK_GAP;

      rfNodes.push(buildFlowNode(node, x, y, w, h, shapeMap));
    }
  }

  // Place unassigned nodes in a fallback area (bottom of canvas)
  let fallbackX = 20;
  const fallbackY = canvasHeight + 40;
  for (const node of unassigned) {
    const { w, h } = getNodeSize(node);
    rfNodes.push(buildFlowNode(node, fallbackX, fallbackY, w, h, shapeMap));
    fallbackX += w + 20;
  }

  const edges = specEdgesToFlowEdges(diagram.edges);

  return { nodes: rfNodes, edges };
}

function buildFlowNode(
  node: DiagramNode,
  x: number,
  y: number,
  w: number,
  h: number,
  shapeMap?: Map<string, ShapePaletteEntry>
): Node {
  const isGroup = node.type === "group";
  const shapeEntry =
    node.shapeId && shapeMap ? shapeMap.get(node.shapeId) : undefined;
  const nodeType = isGroup
    ? "groupNode"
    : shapeEntry
      ? "shapeNode"
      : "colorBox";

  return {
    id: node.id,
    type: nodeType,
    position: { x, y },
    data: {
      label: node.label,
      style: node.style,
      ...(node.font ? { font: node.font } : {}),
      ...(shapeEntry
        ? {
            shapeKind: shapeEntry.kind,
            ...(shapeEntry.aspectRatio ? { aspectRatio: shapeEntry.aspectRatio } : {}),
          }
        : {}),
      ...(node.shapeId ? { shapeId: node.shapeId } : {}),
      ...(node.sizeId ? { sizeId: node.sizeId } : {}),
      ...(node.semanticTypeId ? { semanticTypeId: node.semanticTypeId } : {}),
      ...(node.labelPosition ? { labelPosition: node.labelPosition } : {}),
      ...(node.guideRow ? { guideRow: node.guideRow } : {}),
      ...(node.guideColumn ? { guideColumn: node.guideColumn } : {}),
    },
    ...(node.parentId
      ? { parentId: node.parentId, extent: "parent" as const }
      : {}),
    ...(isGroup
      ? { style: { width: w, height: h } }
      : {}),
    width: w,
    height: h,
  };
}
