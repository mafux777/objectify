import type { Node, Edge } from "@xyflow/react";
import type {
  SingleDiagram,
  DiagramNode,
  GuideLine,
  ShapePaletteEntry,
  SizePaletteEntry,
} from "@objectify/schema";
import { specEdgesToFlowEdges } from "./spec-to-flow.js";
import { migrateNodeLabels } from "./label-migration.js";

const REFERENCE_CANVAS_WIDTH = 1200;
const REFERENCE_CANVAS_HEIGHT = 800;

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 50;
const CELL_STACK_GAP = 10;
const MIN_NODE_GAP = 20; // minimum pixels between adjacent nodes

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
 * Post-LLM validation: detect and fix overlapping nodes by adjusting guide
 * positions. For each row, we sort nodes by column position and check that
 * adjacent nodes don't overlap. If they do, we push column guides apart.
 * Same logic applies to columns (checking row overlaps).
 *
 * Returns a new array of guides with adjusted positions.
 */
export function resolveGuideOverlaps(
  guides: GuideLine[],
  nodes: DiagramNode[],
  getNodeSize: (node: DiagramNode) => { w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
): GuideLine[] {
  const adjusted = guides.map((g) => ({ ...g }));
  const guideById = new Map(adjusted.map((g) => [g.id, g]));

  // --- Fix column spacing (check horizontal overlaps per row) ---
  const rows = adjusted.filter((g) => g.direction === "horizontal");
  const cols = adjusted
    .filter((g) => g.direction === "vertical")
    .sort((a, b) => a.position - b.position);

  for (const row of rows) {
    // Collect nodes on this row, sorted by column position
    const rowNodes = nodes
      .filter((n) => n.guideRow === row.id && n.guideColumn)
      .map((n) => ({
        node: n,
        col: guideById.get(n.guideColumn!)!,
        size: getNodeSize(n),
      }))
      .filter((entry) => entry.col)
      .sort((a, b) => a.col.position - b.col.position);

    for (let i = 0; i < rowNodes.length - 1; i++) {
      const left = rowNodes[i];
      const right = rowNodes[i + 1];
      const rightEdge = left.col.position * canvasWidth + left.size.w / 2;
      const leftEdge = right.col.position * canvasWidth - right.size.w / 2;
      const overlap = rightEdge + MIN_NODE_GAP - leftEdge;

      if (overlap > 0) {
        // Push the right column (and all subsequent columns) to the right
        const shiftNorm = overlap / canvasWidth;
        const rightColIdx = cols.indexOf(right.col);
        if (rightColIdx >= 0) {
          for (let j = rightColIdx; j < cols.length; j++) {
            cols[j].position += shiftNorm;
          }
        }
        console.warn(
          `[Guide Validation] Row "${row.id}": nodes "${left.node.id}" and "${right.node.id}" ` +
            `overlap by ${Math.round(overlap)}px — shifted column "${right.col.id}" right`
        );
      }
    }
  }

  // --- Fix row spacing (check vertical overlaps per column) ---
  const sortedRows = adjusted
    .filter((g) => g.direction === "horizontal")
    .sort((a, b) => a.position - b.position);

  for (const col of cols) {
    const colNodes = nodes
      .filter((n) => n.guideColumn === col.id && n.guideRow)
      .map((n) => ({
        node: n,
        row: guideById.get(n.guideRow!)!,
        size: getNodeSize(n),
      }))
      .filter((entry) => entry.row)
      .sort((a, b) => a.row.position - b.row.position);

    for (let i = 0; i < colNodes.length - 1; i++) {
      const top = colNodes[i];
      const bottom = colNodes[i + 1];
      const bottomEdge = top.row.position * canvasHeight + top.size.h / 2;
      const topEdge = bottom.row.position * canvasHeight - bottom.size.h / 2;
      const overlap = bottomEdge + MIN_NODE_GAP - topEdge;

      if (overlap > 0) {
        const shiftNorm = overlap / canvasHeight;
        const bottomRowIdx = sortedRows.indexOf(bottom.row);
        if (bottomRowIdx >= 0) {
          for (let j = bottomRowIdx; j < sortedRows.length; j++) {
            sortedRows[j].position += shiftNorm;
          }
        }
        console.warn(
          `[Guide Validation] Column "${col.id}": nodes "${top.node.id}" and "${bottom.node.id}" ` +
            `overlap by ${Math.round(overlap)}px — shifted row "${bottom.row.id}" down`
        );
      }
    }
  }

  return adjusted;
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

  // Post-LLM validation: resolve overlaps by adjusting guide positions
  const resolvedGuides = resolveGuideOverlaps(
    diagram.guides ?? [],
    diagram.nodes,
    getNodeSize,
    canvasWidth,
    canvasHeight,
  );

  const guideMap = new Map<string, GuideLine>();
  for (const g of resolvedGuides) {
    guideMap.set(g.id, g);
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
      labels: migrateNodeLabels(node),
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
