import { useCallback, useRef } from "react";
import { useReactFlow, useViewport, type Node } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";
import { getParentOffset } from "../lib/parent-offset.js";

/** Minimum normalized gap between adjacent guides (~18px at 1200px canvas) */
const MIN_GUIDE_GAP = 0.015;

/**
 * Constrain a guide's position to stay between its sorted neighbors.
 * Outermost guides have no outer constraint — they can expand beyond [0, 1].
 */
function constrainToNeighbors(
  rawPosition: number,
  guideId: string,
  direction: "horizontal" | "vertical",
  guides: GuideLine[],
): number {
  const sameDir = guides
    .filter((g) => g.direction === direction)
    .sort((a, b) => a.position - b.position);

  const idx = sameDir.findIndex((g) => g.id === guideId);
  if (idx === -1) return rawPosition;

  const prev = idx > 0 ? sameDir[idx - 1] : null;
  const next = idx < sameDir.length - 1 ? sameDir[idx + 1] : null;

  // Outermost guides have no constraint on their outer side (infinite canvas)
  const lowerBound = prev ? prev.position + MIN_GUIDE_GAP : -Infinity;
  const upperBound = next ? next.position - MIN_GUIDE_GAP : Infinity;

  return Math.max(lowerBound, Math.min(upperBound, rawPosition));
}

interface GuideLinesProps {
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
  visible: boolean;
  setGuides: React.Dispatch<React.SetStateAction<GuideLine[]>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  nodes: Node[];
  saveSnapshot: () => void;
  onGuideHover?: (guideId: string | null) => void;
}

export function GuideLines({
  guides,
  canvasWidth,
  canvasHeight,
  visible,
  setGuides,
  setNodes,
  nodes,
  saveSnapshot,
  onGuideHover,
}: GuideLinesProps) {
  const { getViewport } = useReactFlow();

  // Keep a ref to the latest guides for real-time neighbor lookups in onPointerMove
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const dragState = useRef<{
    guideId: string;
    direction: "horizontal" | "vertical";
    startMouse: number; // screen px
    startPosition: number; // normalized 0-1
    altKey: boolean; // Alt held → free drag (skip neighbor constraints)
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, guide: GuideLine) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as SVGElement).setPointerCapture(e.pointerId);

      saveSnapshot();

      dragState.current = {
        guideId: guide.id,
        direction: guide.direction,
        startMouse: guide.direction === "horizontal" ? e.clientY : e.clientX,
        startPosition: guide.position,
        altKey: e.altKey,
      };
    },
    [saveSnapshot]
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
      const rawPosition = ds.startPosition + normalizedDelta;
      const newPosition = ds.altKey
        ? rawPosition // Alt: free drag, no neighbor constraint
        : constrainToNeighbors(rawPosition, ds.guideId, ds.direction, guidesRef.current);

      // Update the guide position
      setGuides((gs) =>
        gs.map((g) =>
          g.id === ds.guideId ? { ...g, position: newPosition } : g
        )
      );

      // Determine if this guide is used as a bottom/right edge guide
      // If so, we resize groups rather than translate them
      const bottomField = ds.direction === "horizontal" ? "guideRowBottom" : "guideColumnRight";
      const topField = ds.direction === "horizontal" ? "guideRow" : "guideColumn";

      const newCanvasPos = ds.direction === "horizontal"
        ? newPosition * canvasHeight
        : newPosition * canvasWidth;

      setNodes((nds) =>
        nds.map((n) => {
          const nd = n.data as Record<string, unknown>;

          // Compute parent offset for nodes inside groups
          // (guide positions are absolute canvas coords, node positions are parent-relative)
          const parentOff = getParentOffset(n.parentId, nds);

          // Case 1: Node uses this guide as a bottom/right edge → resize
          if (nd?.[bottomField] === ds.guideId) {
            if (ds.direction === "horizontal") {
              const absNodeY = n.position.y + parentOff.y;
              const newH = Math.max(30, newCanvasPos - absNodeY);
              return { ...n, height: newH, style: { ...n.style, height: newH } };
            } else {
              const absNodeX = n.position.x + parentOff.x;
              const newW = Math.max(60, newCanvasPos - absNodeX);
              return { ...n, width: newW, style: { ...n.style, width: newW } };
            }
          }

          // Case 2: Node uses this guide as a top/left edge → translate (center-based)
          if (nd?.[topField] === ds.guideId) {
            const nW = n.width ?? n.measured?.width ?? 160;
            const nH = n.height ?? n.measured?.height ?? 50;

            if (ds.direction === "horizontal") {
              const newY = newCanvasPos - nH / 2 - parentOff.y;
              if (Math.abs(n.position.y - newY) < 0.5) return n;
              return { ...n, position: { x: n.position.x, y: newY } };
            } else {
              const newX = newCanvasPos - nW / 2 - parentOff.x;
              if (Math.abs(n.position.x - newX) < 0.5) return n;
              return { ...n, position: { x: newX, y: n.position.y } };
            }
          }

          return n;
        })
      );
    },
    [getViewport, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ds = dragState.current;
      if (!ds) return;

      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      dragState.current = null;

      // Check for merge: if dragged guide is now within threshold of another same-direction guide
      const MERGE_THRESHOLD = 0.02; // 2% normalized distance
      const draggedGuide = guides.find((g) => g.id === ds.guideId);
      if (!draggedGuide) return;

      const mergeTarget = guides
        .filter((g) => g.id !== ds.guideId && g.direction === ds.direction)
        .reduce<{ guide: GuideLine; dist: number } | null>((best, g) => {
          const dist = Math.abs(g.position - draggedGuide.position);
          if (dist < MERGE_THRESHOLD && (!best || dist < best.dist)) {
            return { guide: g, dist };
          }
          return best;
        }, null);

      if (mergeTarget) {
        const absorberId = mergeTarget.guide.id;
        const removedId = ds.guideId;
        const guideFields = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;

        // Reassign all node references from the removed guide to the absorber
        // and reposition nodes to align with the absorber's position
        const absorberCanvasPos = ds.direction === "horizontal"
          ? mergeTarget.guide.position * canvasHeight
          : mergeTarget.guide.position * canvasWidth;

        setNodes((nds) =>
          nds.map((n) => {
            const nd = n.data as Record<string, unknown>;
            let changed = false;
            const newData = { ...nd };

            for (const field of guideFields) {
              if (nd?.[field] === removedId) {
                newData[field] = absorberId;
                changed = true;
              }
            }

            if (!changed) return n;

            // Reposition: center on absorber guide position
            const nW = n.width ?? n.measured?.width ?? 160;
            const nH = n.height ?? n.measured?.height ?? 50;
            let newPos = { ...n.position };

            // Only reposition for top/left guide references (guideRow/guideColumn)
            // Guide position is absolute; convert to parent-relative
            const pOff = getParentOffset(n.parentId, nds);
            if (nd?.guideRow === removedId && ds.direction === "horizontal") {
              newPos = { ...newPos, y: absorberCanvasPos - nH / 2 - pOff.y };
            }
            if (nd?.guideColumn === removedId && ds.direction === "vertical") {
              newPos = { ...newPos, x: absorberCanvasPos - nW / 2 - pOff.x };
            }

            return { ...n, data: newData, position: newPos };
          })
        );

        // Remove the dragged guide
        setGuides((gs) => gs.filter((g) => g.id !== removedId));
      } else {
        // Guide was dragged but not merged — mark it as pinned
        setGuides((gs) =>
          gs.map((g) =>
            g.id === ds.guideId ? { ...g, pinned: true } : g
          )
        );
      }
    },
    [guides, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent, guide: GuideLine) => {
      e.preventDefault();
      e.stopPropagation();
      if (guide.pinned) {
        saveSnapshot();
        setGuides((gs) =>
          gs.map((g) =>
            g.id === guide.id ? { ...g, pinned: false } : g
          )
        );
      }
    },
    [saveSnapshot, setGuides]
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
      data-export-ignore
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
          if (guide.visible === false) return null;
          const isPinned = guide.pinned === true;
          const labelText = guide.label ?? (guide.direction === "horizontal" ? `R${guide.index}` : `C${guide.index}`);
          const pinDotR = fontSize * 0.22;
          const pinDotGap = fontSize * 0.4;
          const labelWidth = labelText.length * fontSize * 0.65 + labelPad * 2 + (isPinned ? pinDotGap + pinDotR * 2 : 0);
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
                  fill={isPinned ? "rgba(25, 118, 210, 0.18)" : "rgba(25, 118, 210, 0.08)"}
                  rx={2 / zoom}
                  style={{ pointerEvents: "auto", cursor: "ns-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerEnter={() => onGuideHover?.(guide.id)}
                  onPointerLeave={() => onGuideHover?.(null)}
                  onContextMenu={(e) => onContextMenu(e, guide)}
                />
                <text
                  x={lx + labelPad}
                  y={y + fontSize / 3}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={isPinned ? 0.9 : 0.7}
                  style={{ pointerEvents: "auto", cursor: "ns-resize" }}
                  onPointerDown={(e) => onPointerDown(e, guide)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerEnter={() => onGuideHover?.(guide.id)}
                  onPointerLeave={() => onGuideHover?.(null)}
                  onContextMenu={(e) => onContextMenu(e, guide)}
                >
                  {labelText}
                </text>
                {isPinned && (
                  <circle
                    cx={lx + labelPad + labelText.length * fontSize * 0.65 + pinDotGap}
                    cy={y}
                    r={pinDotR}
                    fill="#1976d2"
                    opacity={0.7}
                  />
                )}
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
                {/* Draggable label — above bounding box, rotated -90° with first letter at bbox edge */}
                <g
                  transform={`rotate(-90, ${x}, ${colLabelY})`}
                >
                  <rect
                    x={x}
                    y={colLabelY - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    fill={isPinned ? "rgba(25, 118, 210, 0.18)" : "rgba(25, 118, 210, 0.08)"}
                    rx={2 / zoom}
                    style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                    onPointerDown={(e) => onPointerDown(e, guide)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerEnter={() => onGuideHover?.(guide.id)}
                    onPointerLeave={() => onGuideHover?.(null)}
                    onContextMenu={(e) => onContextMenu(e, guide)}
                  />
                  <text
                    x={x + labelPad}
                    y={colLabelY + fontSize / 3}
                    fontSize={fontSize}
                    fill="#1976d2"
                    opacity={isPinned ? 0.9 : 0.7}
                    style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                    onPointerDown={(e) => onPointerDown(e, guide)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerEnter={() => onGuideHover?.(guide.id)}
                    onPointerLeave={() => onGuideHover?.(null)}
                    onContextMenu={(e) => onContextMenu(e, guide)}
                  >
                    {labelText}
                  </text>
                  {isPinned && (
                    <circle
                      cx={x + labelPad + labelText.length * fontSize * 0.65 + pinDotGap}
                      cy={colLabelY}
                      r={pinDotR}
                      fill="#1976d2"
                      opacity={0.7}
                    />
                  )}
                </g>
              </g>
            );
          }
        })}
      </g>
    </svg>
  );
}
