import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { nearestClockLabel } from "../lib/clock-math.js";

export interface ClockFaceDragState {
  edgeId: string;
  dragEnd: "source" | "target";
  nodeId: string;
  nodeCenterX: number;
  nodeCenterY: number;
  nodeWidth: number;
  nodeHeight: number;
  isCircular: boolean;
  highlightedClock: string | null;
}

interface UseClockFaceDragParams {
  nodes: Node[];
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  saveSnapshot: () => void;
  flowRef: React.RefObject<HTMLDivElement | null>;
}

function isCircularShape(kind: string | undefined): boolean {
  return kind === "circle" || kind === "ellipse";
}

/**
 * Read the current viewport transform (pan + zoom) from the ReactFlow DOM.
 * The `.react-flow__viewport` element has a CSS `transform: translate(Xpx, Ypx) scale(Z)`.
 */
function getViewportFromDOM(container: HTMLElement | null): {
  panX: number;
  panY: number;
  zoom: number;
} {
  if (!container) return { panX: 0, panY: 0, zoom: 1 };
  const vp = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (!vp) return { panX: 0, panY: 0, zoom: 1 };
  const style = window.getComputedStyle(vp);
  const matrix = new DOMMatrix(style.transform);
  return { panX: matrix.e, panY: matrix.f, zoom: matrix.a };
}

export function useClockFaceDrag({
  nodes,
  edges,
  setEdges,
  saveSnapshot,
  flowRef,
}: UseClockFaceDragParams) {
  const [dragState, setDragState] = useState<ClockFaceDragState | null>(null);
  const dragRef = useRef<ClockFaceDragState | null>(null);

  // Keep refs fresh for event handlers
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const startDrag = useCallback(
    (edgeId: string, end: "source" | "target", event: React.PointerEvent) => {
      const edge = edgesRef.current.find((e) => e.id === edgeId);
      if (!edge) return;

      const nodeId = end === "source" ? edge.source : edge.target;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      saveSnapshot();

      const nodeW = node.measured?.width ?? node.width ?? 160;
      const nodeH = node.measured?.height ?? node.height ?? 50;
      const state: ClockFaceDragState = {
        edgeId,
        dragEnd: end,
        nodeId,
        nodeCenterX: node.position.x + nodeW / 2,
        nodeCenterY: node.position.y + nodeH / 2,
        nodeWidth: nodeW,
        nodeHeight: nodeH,
        isCircular: isCircularShape(
          (node.data as Record<string, unknown>)?.shapeKind as string | undefined,
        ),
        highlightedClock: null,
      };

      dragRef.current = state;
      setDragState(state);
    },
    [saveSnapshot],
  );

  // Window-level pointer listeners during active drag
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds) return;

      const container = flowRef.current;
      const { panX, panY, zoom } = getViewportFromDOM(container);

      // Get the container's bounding rect to convert from page coords to container-relative coords
      const rect = container?.getBoundingClientRect();
      const offsetX = rect ? rect.left : 0;
      const offsetY = rect ? rect.top : 0;

      // Convert screen coords to flow-canvas coords
      const canvasX = (e.clientX - offsetX - panX) / zoom;
      const canvasY = (e.clientY - offsetY - panY) / zoom;

      // Offset from node center
      const dx = canvasX - ds.nodeCenterX;
      const dy = canvasY - ds.nodeCenterY;

      const clock = nearestClockLabel(dx, dy);

      if (clock !== ds.highlightedClock) {
        const next = { ...ds, highlightedClock: clock };
        dragRef.current = next;
        setDragState(next);
      }
    };

    const handlePointerUp = () => {
      const ds = dragRef.current;
      if (!ds || !ds.highlightedClock) {
        dragRef.current = null;
        setDragState(null);
        return;
      }

      const clock = ds.highlightedClock;
      const handleId = `${ds.dragEnd}-${clock}`;

      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== ds.edgeId) return e;
          if (ds.dragEnd === "source") {
            return { ...e, sourceHandle: handleId };
          } else {
            return { ...e, targetHandle: handleId };
          }
        }),
      );

      dragRef.current = null;
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, flowRef, setEdges]);

  return { dragState, startDrag };
}
