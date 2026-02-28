import type { DiagramNode, DiagramEdge, NodeLabel, EdgeLabel, ClockPosition } from "@objectify/schema";

/**
 * Map legacy labelPosition values to clock positions.
 */
const LEGACY_POSITION_MAP: Record<string, ClockPosition> = {
  "center": "center",
  "top-left": "10:30",
  "top-center": "12:00",
  "bottom-center": "6:00",
  "above": "12:00",
  "below": "6:00",
};

/**
 * Convert a node's legacy single label to the multi-label format.
 * If the node already has `labels[]`, returns them as-is.
 */
export function migrateNodeLabels(node: DiagramNode): NodeLabel[] {
  if (node.labels?.length) return node.labels;

  const position = LEGACY_POSITION_MAP[node.labelPosition ?? "center"] ?? "center";
  return [{
    text: node.label,
    position,
    ...(node.font ? { font: node.font } : {}),
  }];
}

/**
 * Convert an edge's legacy single label to the multi-label format.
 * If the edge already has `labels[]`, returns them as-is.
 */
export function migrateEdgeLabels(edge: DiagramEdge): EdgeLabel[] {
  if (edge.labels?.length) return edge.labels;
  if (!edge.label) return [];

  return [{
    text: edge.label,
    position: edge.labelStyle?.position ?? "center",
    ...(edge.labelStyle ? { font: edge.labelStyle } : {}),
  }];
}
