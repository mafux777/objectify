import { useCallback, useRef } from "react";
import { useReactFlow, useViewport, type Node } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

interface GuideLinesProps {
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
  visible: boolean;
  setGuides: React.Dispatch<React.SetStateAction<GuideLine[]>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  nodes: Node[];
}

export function GuideLines({
  guides,
  canvasWidth,
  canvasHeight,
  visible,
  setGuides,
  setNodes,
  nodes,
}: GuideLinesProps) {
  const { getViewport } = useReactFlow();
  const dragState = useRef<{
    guideId: string;
    direction: "horizontal" | "vertical";
    startMouse: number; // screen px
    startPosition: number; // normalized 0-1
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, guide: GuideLine) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as SVGElement).setPointerCapture(e.pointerId);

      dragState.current = {
        guideId: guide.id,
        direction: guide.direction,
        startMouse: guide.direction === "horizontal" ? e.clientY : e.clientX,
        startPosition: guide.position,
      };
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ds = dragState.current;
      if (!ds) return;

      const { zoom } = getViewport();
      const currentMouse = ds.direction === "horizontal" ? e.clientY : e.clientX;
      const mouseDeltaPx = currentMouse - ds.startMouse;
      // Convert screen pixels to canvas pixels (account for zoom)
      const canvasDim = ds.direction === "horizontal" ? canvasHeight : canvasWidth;
      const normalizedDelta = mouseDeltaPx / (canvasDim * zoom);
      const newPosition = Math.max(0, Math.min(1, ds.startPosition + normalizedDelta));

      // Update the guide position
      setGuides((gs) =>
        gs.map((g) =>
          g.id === ds.guideId ? { ...g, position: newPosition } : g
        )
      );

      // Move all nodes snapped to this guide
      const guideField = ds.direction === "horizontal" ? "guideRow" : "guideColumn";
      const newCanvasPos = ds.direction === "horizontal"
        ? newPosition * canvasHeight
        : newPosition * canvasWidth;

      setNodes((nds) =>
        nds.map((n) => {
          const nd = n.data as Record<string, unknown>;
          if (nd?.[guideField] !== ds.guideId) return n;

          const nW = n.width ?? n.measured?.width ?? 160;
          const nH = n.height ?? n.measured?.height ?? 50;

          if (ds.direction === "horizontal") {
            const newY = newCanvasPos - nH / 2;
            if (Math.abs(n.position.y - newY) < 0.5) return n;
            return { ...n, position: { x: n.position.x, y: newY } };
          } else {
            const newX = newCanvasPos - nW / 2;
            if (Math.abs(n.position.x - newX) < 0.5) return n;
            return { ...n, position: { x: newX, y: n.position.y } };
          }
        })
      );
    },
    [getViewport, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragState.current) {
        (e.target as SVGElement).releasePointerCapture(e.pointerId);
        dragState.current = null;
      }
    },
    []
  );

  // Reactive viewport subscription — re-renders on zoom/pan changes
  const { x: panX, y: panY, zoom } = useViewport();

  if (!visible || guides.length === 0) return null;
  const strokeW = 1 / zoom;
  const dash = `${4 / zoom},${4 / zoom}`;
  const fontSize = 10 / zoom;
  const labelPad = 4 / zoom;
  const labelMargin = 8 / zoom; // gap between bounding box edge and label

  // Compute bounding box of all nodes so labels sit outside the content area
  const bbox = nodes.reduce(
    (acc, n) => {
      const w = n.width ?? n.measured?.width ?? 160;
      const h = n.height ?? n.measured?.height ?? 50;
      return {
        minX: Math.min(acc.minX, n.position.x),
        minY: Math.min(acc.minY, n.position.y),
        maxX: Math.max(acc.maxX, n.position.x + w),
        maxY: Math.max(acc.maxY, n.position.y + h),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  const hasBbox = isFinite(bbox.minX);
  const bboxPad = 12 / zoom;
  const bboxLeft = hasBbox ? bbox.minX - bboxPad : 0;
  const bboxTop = hasBbox ? bbox.minY - bboxPad : 0;
  const bboxRight = hasBbox ? bbox.maxX + bboxPad : canvasWidth;
  const bboxBottom = hasBbox ? bbox.maxY + bboxPad : canvasHeight;

  // Row labels sit to the left of the bounding box; column labels sit above
  const rowLabelX = bboxLeft - labelMargin;
  const colLabelY = bboxTop - labelMargin;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
        {/* Bounding box outline */}
        {hasBbox && (
          <rect
            x={bboxLeft}
            y={bboxTop}
            width={bboxRight - bboxLeft}
            height={bboxBottom - bboxTop}
            fill="none"
            stroke="#90CAF9"
            strokeWidth={strokeW}
            strokeDasharray={`${2 / zoom},${4 / zoom}`}
            opacity={0.4}
            rx={4 / zoom}
          />
        )}

        {guides.map((guide) => {
          const labelText = guide.label ?? (guide.direction === "horizontal" ? `R${guide.index}` : `C${guide.index}`);
          const labelWidth = labelText.length * fontSize * 0.65 + labelPad * 2;
          const labelHeight = fontSize + labelPad * 2;

          if (guide.direction === "horizontal") {
            const y = guide.position * canvasHeight;
            const lx = rowLabelX - labelWidth;
            return (
              <g key={guide.id}>
                <line
                  x1={bboxLeft}
                  y1={y}
                  x2={bboxRight}
                  y2={y}
                  stroke="#1976d2"
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  opacity={0.5}
                />
                {/* Draggable label — left of bounding box */}
                <rect
                  x={lx}
                  y={y - labelHeight / 2}
                  width={labelWidth}
                  height={labelHeight}
                  fill="rgba(25, 118, 210, 0.08)"
                  rx={2 / zoom}
                  style={{ pointerEvents: "auto", cursor: "ns-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
                <text
                  x={lx + labelPad}
                  y={y + fontSize / 3}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={0.7}
                  style={{ pointerEvents: "auto", cursor: "ns-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {labelText}
                </text>
              </g>
            );
          } else {
            const x = guide.position * canvasWidth;
            const ly = colLabelY - labelHeight;
            return (
              <g key={guide.id}>
                <line
                  x1={x}
                  y1={bboxTop}
                  x2={x}
                  y2={bboxBottom}
                  stroke="#1976d2"
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  opacity={0.5}
                />
                {/* Draggable label — above bounding box */}
                <rect
                  x={x - labelWidth / 2}
                  y={ly}
                  width={labelWidth}
                  height={labelHeight}
                  fill="rgba(25, 118, 210, 0.08)"
                  rx={2 / zoom}
                  style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
                <text
                  x={x - labelWidth / 2 + labelPad}
                  y={ly + fontSize + labelPad / 2}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={0.7}
                  style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {labelText}
                </text>
              </g>
            );
          }
        })}
      </g>
    </svg>
  );
}
