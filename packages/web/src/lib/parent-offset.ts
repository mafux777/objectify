import type { Node } from "@xyflow/react";

/** Get the absolute position offset for a node's parent chain */
export function getParentOffset(parentId: string | undefined, nodes: Node[]): { x: number; y: number } {
  if (!parentId) return { x: 0, y: 0 };
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { x: 0, y: 0 };
  const grandparentOffset = getParentOffset(parent.parentId, nodes);
  return {
    x: parent.position.x + grandparentOffset.x,
    y: parent.position.y + grandparentOffset.y,
  };
}
