/**
 * Custom event for semantic resize.
 *
 * Fired by NodeResizer's onResizeEnd in node components (ColorBoxNode,
 * ShapeNode, GroupNode).  FlowDiagram.tsx listens for this event and
 * updates the sizePalette accordingly.
 */

export const RESIZE_END_EVENT = "objectify:resize-end";

export interface ResizeEndDetail {
  nodeId: string;
  sizeId: string | undefined;
  width: number;   // pixel width after resize
  height: number;  // pixel height after resize
  altKey: boolean;  // true = create new size class; false = update existing
}

/**
 * Fire the custom resize-end event from a node component.
 * Called from NodeResizer's onResizeEnd callback.
 */
export function fireResizeEnd(
  nodeId: string,
  sizeId: string | undefined,
  width: number,
  height: number,
  sourceEvent?: Event | null
): void {
  const altKey = sourceEvent instanceof MouseEvent ? sourceEvent.altKey : false;

  window.dispatchEvent(
    new CustomEvent<ResizeEndDetail>(RESIZE_END_EVENT, {
      detail: { nodeId, sizeId, width, height, altKey },
    })
  );
}
