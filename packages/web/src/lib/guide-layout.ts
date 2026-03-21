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
import { zLevelToIndex } from "./z-level.js";

const REFERENCE_CANVAS_WIDTH = 1200;
const REFERENCE_CANVAS_HEIGHT = 800;

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 50;
const CELL_STACK_GAP = 10;
const MIN_NODE_GAP = 20; // minimum pixels between adjacent nodes

const GROUP_PADDING_TOP = 40; // space for title
const GROUP_PADDING_SIDE = 20;
const GROUP_PADDING_BOTTOM = 20;

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
  // Exclude container nodes and their children from overlap detection.
  // Containers inherently overlap with their children, and child positions are
  // relative to the container — including them causes false overlaps that push
  // guides to wrong positions during resize.
  const parentIds = new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId!));
  const overlapNodes = nodes.filter((n) => !n.parentId && !parentIds.has(n.id));

  const adjusted = guides.map((g) => ({ ...g }));
  const guideById = new Map(adjusted.map((g) => [g.id, g]));

  // --- Fix column spacing (check horizontal overlaps per row) ---
  const rows = adjusted.filter((g) => g.direction === "horizontal");
  const cols = adjusted
    .filter((g) => g.direction === "vertical")
    .sort((a, b) => a.position - b.position);

  for (const row of rows) {
    // Collect nodes on this row, sorted by column position
    const rowNodes = overlapNodes
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
        const shiftNorm = overlap / canvasWidth;

        if (right.col.pinned && left.col.pinned) {
          // Both pinned: accept the overlap — user chose both positions
          console.warn(
            `[Guide Validation] Row "${row.id}": pinned columns "${left.col.id}" and "${right.col.id}" ` +
              `overlap by ${Math.round(overlap)}px — both pinned, skipping`
          );
        } else if (right.col.pinned) {
          // Right is pinned: shift left column (and predecessors) leftward
          const leftColIdx = cols.indexOf(left.col);
          if (leftColIdx >= 0) {
            for (let j = leftColIdx; j >= 0; j--) {
              if (!cols[j].pinned) cols[j].position -= shiftNorm;
            }
          }
          console.warn(
            `[Guide Validation] Row "${row.id}": nodes "${left.node.id}" and "${right.node.id}" ` +
              `overlap by ${Math.round(overlap)}px — shifted column "${left.col.id}" left (right is pinned)`
          );
        } else {
          // Right is unpinned: shift right column (and successors) rightward
          const rightColIdx = cols.indexOf(right.col);
          if (rightColIdx >= 0) {
            for (let j = rightColIdx; j < cols.length; j++) {
              if (!cols[j].pinned) cols[j].position += shiftNorm;
            }
          }
          console.warn(
            `[Guide Validation] Row "${row.id}": nodes "${left.node.id}" and "${right.node.id}" ` +
              `overlap by ${Math.round(overlap)}px — shifted column "${right.col.id}" right`
          );
        }
      }
    }
  }

  // --- Fix row spacing (check vertical overlaps per column) ---
  const sortedRows = adjusted
    .filter((g) => g.direction === "horizontal")
    .sort((a, b) => a.position - b.position);

  for (const col of cols) {
    const colNodes = overlapNodes
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

        if (bottom.row.pinned && top.row.pinned) {
          // Both pinned: accept the overlap
          console.warn(
            `[Guide Validation] Column "${col.id}": pinned rows "${top.row.id}" and "${bottom.row.id}" ` +
              `overlap by ${Math.round(overlap)}px — both pinned, skipping`
          );
        } else if (bottom.row.pinned) {
          // Bottom is pinned: shift top row (and predecessors) upward
          const topRowIdx = sortedRows.indexOf(top.row);
          if (topRowIdx >= 0) {
            for (let j = topRowIdx; j >= 0; j--) {
              if (!sortedRows[j].pinned) sortedRows[j].position -= shiftNorm;
            }
          }
          console.warn(
            `[Guide Validation] Column "${col.id}": nodes "${top.node.id}" and "${bottom.node.id}" ` +
              `overlap by ${Math.round(overlap)}px — shifted row "${top.row.id}" up (bottom is pinned)`
          );
        } else {
          // Bottom is unpinned: shift bottom row (and successors) downward
          const bottomRowIdx = sortedRows.indexOf(bottom.row);
          if (bottomRowIdx >= 0) {
            for (let j = bottomRowIdx; j < sortedRows.length; j++) {
              if (!sortedRows[j].pinned) sortedRows[j].position += shiftNorm;
            }
          }
          console.warn(
            `[Guide Validation] Column "${col.id}": nodes "${top.node.id}" and "${bottom.node.id}" ` +
              `overlap by ${Math.round(overlap)}px — shifted row "${bottom.row.id}" down`
          );
        }
      }
    }
  }

  return adjusted;
}

/**
 * Topologically sort group nodes so every parent appears before its children.
 * This is required by React Flow: a parentId node must precede its children in
 * the nodes array or the parent relationship is silently ignored.
 */
function topoSortGroups(groups: Node[]): Node[] {
  const result: Node[] = [];
  const placed = new Set<string>();
  const remaining = [...groups];

  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const g = remaining[i];
      if (!g.parentId || placed.has(g.parentId)) {
        result.push(g);
        placed.add(g.id);
        remaining.splice(i, 1);
        progress = true;
      }
    }
  }
  // Any remainder (e.g. circular refs) append as-is
  result.push(...remaining);
  return result;
}

/**
 * Guide-based layout: positions nodes at the intersections of their assigned
 * row (horizontal guide) and column (vertical guide). This makes guides
 * structural — the grid skeleton that determines node placement.
 *
 * Groups (containers) are handled specially:
 * - Leaf nodes are positioned at guide intersections (center-based)
 * - Groups derive their position and size from their children's bounding box
 * - If a group has a sizeId, that explicit size is used (centered on children)
 * - Children's positions are converted to parent-relative coordinates
 *
 * This produces container edge alignment as an emergent property: when the
 * top-most children across different groups share the same row guide, all
 * those containers get the same top edge.
 */
export function guideLayoutDiagram(
  diagram: SingleDiagram,
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[]
): { nodes: Node[]; edges: Edge[]; resolvedGuides: GuideLine[] } {
  const imgW = diagram.imageDimensions?.width ?? REFERENCE_CANVAS_WIDTH;
  const imgH = diagram.imageDimensions?.height ?? REFERENCE_CANVAS_HEIGHT;
  const canvasWidth = REFERENCE_CANVAS_WIDTH;
  const canvasHeight = canvasWidth * (imgH / imgW);

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
      h: sizeEntry ? Math.round(sizeEntry.height * canvasHeight) : DEFAULT_NODE_HEIGHT,
    };
  }

  // Separate groups from leaf nodes
  const groupNodes: DiagramNode[] = [];
  const leafNodes: DiagramNode[] = [];
  for (const node of diagram.nodes) {
    if (node.type === "group") {
      groupNodes.push(node);
    } else {
      leafNodes.push(node);
    }
  }

  // Validate unique grid coordinates (only for leaf nodes with guides)
  const warnings = validateGuideCoordinates(leafNodes);
  for (const w of warnings) {
    console.warn(`[Guide Layout] ${w}`);
  }

  // Post-LLM validation: resolve overlaps by adjusting guide positions
  const resolvedGuides = resolveGuideOverlaps(
    diagram.guides ?? [],
    leafNodes,
    getNodeSize,
    canvasWidth,
    canvasHeight,
  );

  const guideMap = new Map<string, GuideLine>();
  for (const g of resolvedGuides) {
    guideMap.set(g.id, g);
  }

  // --- Phase 1: Position leaf nodes at guide intersections ---
  const cellKey = (row: string, col: string) => `${row}::${col}`;
  const cells = new Map<string, DiagramNode[]>();
  const unassignedLeaves: DiagramNode[] = [];

  for (const node of leafNodes) {
    if (node.guideRow && node.guideColumn) {
      const key = cellKey(node.guideRow, node.guideColumn);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(node);
    } else {
      unassignedLeaves.push(node);
    }
  }

  const rfNodes: Node[] = [];
  // Map from node id → positioned flow node (for group bound computation)
  const positionedById = new Map<string, Node>();

  for (const [, cellNodes] of cells) {
    const firstNode = cellNodes[0];
    const rowGuide = guideMap.get(firstNode.guideRow!);
    const colGuide = guideMap.get(firstNode.guideColumn!);
    if (!rowGuide || !colGuide) {
      unassignedLeaves.push(...cellNodes);
      continue;
    }

    const centerX = colGuide.position * canvasWidth;
    const centerY = rowGuide.position * canvasHeight;

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

      const rfNode = buildFlowNode(node, x, y, w, h, shapeMap);
      rfNodes.push(rfNode);
      positionedById.set(rfNode.id, rfNode);
    }
  }

  // Place unassigned leaf nodes in a fallback area
  let fallbackX = 20;
  const fallbackY = canvasHeight + 40;
  for (const node of unassignedLeaves) {
    const { w, h } = getNodeSize(node);
    const rfNode = buildFlowNode(node, fallbackX, fallbackY, w, h, shapeMap);
    rfNodes.push(rfNode);
    positionedById.set(rfNode.id, rfNode);
    fallbackX += w + 20;
  }

  // --- Phase 2: Position groups ---
  // Groups with guideRow + guideColumn + sizeId: use guides as top-left corner, sizeId for dimensions.
  // Groups with sizeId only (no guides): derive position from children bbox, use explicit size.
  // Groups without sizeId: auto-size from children bbox + padding.
  const groupRfNodes: Node[] = [];
  for (const group of groupNodes) {
    const children = rfNodes.filter(
      (n) => n.parentId === group.id
    );

    let gx: number, gy: number, gw: number, gh: number;
    const groupSize = getNodeSize(group);
    const hasExplicitSize = group.sizeId && sizeMap?.has(group.sizeId);

    // Priority 0: All 4 edge guides → derive size from guide positions
    const rowGuide = group.guideRow ? guideMap.get(group.guideRow) : undefined;
    const colGuide = group.guideColumn ? guideMap.get(group.guideColumn) : undefined;
    const rowBottomGuide = group.guideRowBottom ? guideMap.get(group.guideRowBottom) : undefined;
    const colRightGuide = group.guideColumnRight ? guideMap.get(group.guideColumnRight) : undefined;

    if (rowGuide && colGuide && rowBottomGuide && colRightGuide) {
      // All 4 edge guides present — size derived entirely from guides
      gx = colGuide.position * canvasWidth;
      gy = rowGuide.position * canvasHeight;
      gw = (colRightGuide.position - colGuide.position) * canvasWidth;
      gh = (rowBottomGuide.position - rowGuide.position) * canvasHeight;
    } else if (rowGuide && colGuide && hasExplicitSize) {
      // Priority 1: top-left guides + sizeId
      gx = colGuide.position * canvasWidth;
      gy = rowGuide.position * canvasHeight;
      gw = groupSize.w;
      gh = groupSize.h;
    } else if (children.length === 0) {
      // No children — use size palette or defaults, place in fallback
      gx = fallbackX;
      gy = fallbackY;
      gw = groupSize.w;
      gh = groupSize.h;
      fallbackX += groupSize.w + 20;
    } else {
      // Derive position from children bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of children) {
        const cw = child.width ?? child.measured?.width ?? 80;
        const ch = child.height ?? child.measured?.height ?? 80;
        minX = Math.min(minX, child.position.x);
        minY = Math.min(minY, child.position.y);
        maxX = Math.max(maxX, child.position.x + cw);
        maxY = Math.max(maxY, child.position.y + ch);
      }

      if (hasExplicitSize) {
        // Explicit size, position so children fit from top-left
        gw = groupSize.w;
        gh = groupSize.h;
        gx = minX - GROUP_PADDING_SIDE;
        gy = minY - GROUP_PADDING_TOP;
      } else {
        // Auto-size: children bbox + padding
        const bboxW = maxX - minX;
        const bboxH = maxY - minY;
        gw = bboxW + GROUP_PADDING_SIDE * 2;
        gh = bboxH + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM;
        gx = minX - GROUP_PADDING_SIDE;
        gy = minY - GROUP_PADDING_TOP;
      }
    }

    const groupFlowNode = buildFlowNode(group, gx, gy, gw, gh, shapeMap);
    positionedById.set(groupFlowNode.id, groupFlowNode);
    groupRfNodes.push(groupFlowNode);
  }

  // Topologically sort groups so parents always precede their children,
  // then prepend the sorted list to rfNodes in one shot.
  const sortedGroups = topoSortGroups(groupRfNodes);
  rfNodes.unshift(...sortedGroups);

  // --- Phase 3: Convert children positions to parent-relative ---
  for (const node of rfNodes) {
    if (node.parentId) {
      const parent = positionedById.get(node.parentId);
      if (parent) {
        node.position = {
          x: node.position.x - parent.position.x,
          y: node.position.y - parent.position.y,
        };
      }
    }
  }

  // --- Phase 4: Validate guides ---
  const orphanWarnings = validateOrphanGuides(resolvedGuides, diagram.nodes);
  for (const w of orphanWarnings) {
    console.warn(`[Guide Layout] ${w}`);
  }
  const dupeWarnings = validateNearDuplicateGuides(resolvedGuides);
  for (const w of dupeWarnings) {
    console.warn(`[Guide Layout] ${w}`);
  }

  const edges = specEdgesToFlowEdges(diagram.edges, "smooth-repelled");

  return { nodes: rfNodes, edges, resolvedGuides };
}

/**
 * Validate that every guide is referenced by at least one node.
 * Guides not referenced by any node's guideRow/guideColumn/guideRowBottom/guideColumnRight
 * are flagged as orphans.
 */
export function validateOrphanGuides(
  guides: GuideLine[],
  nodes: DiagramNode[]
): string[] {
  const usedIds = new Set<string>();
  for (const node of nodes) {
    if (node.guideRow) usedIds.add(node.guideRow);
    if (node.guideColumn) usedIds.add(node.guideColumn);
    if (node.guideRowBottom) usedIds.add(node.guideRowBottom);
    if (node.guideColumnRight) usedIds.add(node.guideColumnRight);
  }

  const warnings: string[] = [];
  for (const guide of guides) {
    if (!usedIds.has(guide.id)) {
      warnings.push(
        `[Orphan Guide] "${guide.id}" (${guide.direction} at ${guide.position.toFixed(3)}) has no nodes referencing it`
      );
    }
  }
  return warnings;
}

/**
 * Warn if two guides of the same direction have positions within 0.01 of each other.
 * These may be unintentional duplicates that should be merged.
 */
export function validateNearDuplicateGuides(guides: GuideLine[]): string[] {
  const warnings: string[] = [];
  const byDirection = { horizontal: [] as GuideLine[], vertical: [] as GuideLine[] };
  for (const g of guides) {
    byDirection[g.direction].push(g);
  }

  for (const [dir, group] of Object.entries(byDirection)) {
    const sorted = group.sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length - 1; i++) {
      const delta = sorted[i + 1].position - sorted[i].position;
      if (delta < 0.01) {
        warnings.push(
          `[Near-Duplicate] ${dir} guides "${sorted[i].id}" (${sorted[i].position.toFixed(3)}) and ` +
            `"${sorted[i + 1].id}" (${sorted[i + 1].position.toFixed(3)}) are only ${(delta * 100).toFixed(1)}% apart — consider merging`
        );
      }
    }
  }
  return warnings;
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
      ...(node.guideRowBottom ? { guideRowBottom: node.guideRowBottom } : {}),
      ...(node.guideColumnRight ? { guideColumnRight: node.guideColumnRight } : {}),
      ...(node.zLevel ? { zLevel: node.zLevel } : {}),
      ...(node.description ? { description: node.description } : {}),
      ...(node.url ? { url: node.url } : {}),
    },
    ...(node.parentId
      ? { parentId: node.parentId, extent: "parent" as const }
      : {}),
    ...(isGroup
      ? { style: { width: w, height: h } }
      : {}),
    zIndex: zLevelToIndex(node.zLevel),
    width: w,
    height: h,
  };
}
