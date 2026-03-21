import { useCallback, useRef } from "react";
import { useReactFlow, useViewport, type Node } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";
import { getParentOffset } from "../lib/parent-offset.js";
import { debugGuideMove } from "../lib/debug-log.js";

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
  const { getViewport, getNodes } = useReactFlow();

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

      setNodes((nds) => {
        const GROUP_PAD_TOP = 40;
        const GROUP_PAD_SIDE = 20;
        const GROUP_PAD_BOTTOM = 20;

        // Pass 1: compute new positions for guide-affected nodes
        const updated = nds.map((n) => {
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
        });

        // Pass 2: expand parent groups to fit children that moved beyond boundaries
        // Collect groups that have children
        const groupIds = new Set(updated.filter((n) => n.type === "groupNode").map((n) => n.id));
        if (groupIds.size === 0) return updated;

        // For each group, compute the children bounding box and expand if needed
        const result = [...updated];
        for (let gi = 0; gi < result.length; gi++) {
          const group = result[gi];
          if (group.type !== "groupNode") continue;

          const children = result.filter((n) => n.parentId === group.id);
          if (children.length === 0) continue;

          // Compute children bounding box (in parent-relative coords)
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const child of children) {
            const cw = child.width ?? child.measured?.width ?? 80;
            const ch = child.height ?? child.measured?.height ?? 80;
            minX = Math.min(minX, child.position.x);
            minY = Math.min(minY, child.position.y);
            maxX = Math.max(maxX, child.position.x + cw);
            maxY = Math.max(maxY, child.position.y + ch);
          }

          // Required group bounds (with padding)
          const reqLeft = minX - GROUP_PAD_SIDE;
          const reqTop = minY - GROUP_PAD_TOP;
          const reqRight = maxX + GROUP_PAD_SIDE;
          const reqBottom = maxY + GROUP_PAD_BOTTOM;

          const gw = group.width ?? 100;
          const gh = group.height ?? 100;

          // Current group bounds in relative space: (0, 0) to (gw, gh)
          let shiftX = 0, shiftY = 0;
          let newGW = gw, newGH = gh;

          // Expand left: if children go past x=0
          if (reqLeft < 0) {
            shiftX = -reqLeft; // positive: shift children right
            newGW += shiftX;
          }
          // Expand right: if children go past gw
          if (reqRight > newGW) {
            newGW = reqRight;
          }
          // Expand top: if children go past y=0
          if (reqTop < 0) {
            shiftY = -reqTop;
            newGH += shiftY;
          }
          // Expand bottom: if children go past gh
          if (reqBottom > newGH) {
            newGH = reqBottom;
          }

          if (shiftX === 0 && shiftY === 0 && newGW === gw && newGH === gh) continue;

          // Update group: shift position left/up and increase size
          result[gi] = {
            ...group,
            position: {
              x: group.position.x - shiftX,
              y: group.position.y - shiftY,
            },
            width: newGW,
            height: newGH,
            style: { ...group.style, width: newGW, height: newGH },
          };

          // Shift all children to compensate for the group moving
          if (shiftX !== 0 || shiftY !== 0) {
            for (let ci = 0; ci < result.length; ci++) {
              if (result[ci].parentId === group.id) {
                result[ci] = {
                  ...result[ci],
                  position: {
                    x: result[ci].position.x + shiftX,
                    y: result[ci].position.y + shiftY,
                  },
                };
              }
            }
          }
        }

        return result;
      });
    },
    [getViewport, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ds = dragState.current;
      if (!ds) return;

      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      dragState.current = null;

      const draggedGuide = guides.find((g) => g.id === ds.guideId);
      if (!draggedGuide) return;

      // Debug: log guide move with affected nodes
      const allNodes = getNodes();
      const bottomField = ds.direction === "horizontal" ? "guideRowBottom" : "guideColumnRight";
      const topField = ds.direction === "horizontal" ? "guideRow" : "guideColumn";
      const affectedNodes = allNodes
        .filter((n) => {
          const nd = n.data as Record<string, unknown>;
          return nd?.[topField] === ds.guideId || nd?.[bottomField] === ds.guideId;
        })
        .map((n) => ({
          node: n,
          effect: ((n.data as Record<string, unknown>)?.[bottomField] === ds.guideId ? "resize" : "translate") as "translate" | "resize",
        }));
      debugGuideMove(draggedGuide, ds.startPosition, affectedNodes, allNodes);

      // Check for merge: if dragged guide is now within threshold of another same-direction guide
      const MERGE_THRESHOLD = 0.02; // 2% normalized distance

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

            // Reposition: center on absorber guide position (parent-relative)
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
      }

    },
    [guides, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent, _guide: GuideLine) => {
      e.preventDefault();
      e.stopPropagation();
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

  // Rulers sit flush against the bbox on all 4 sides
  const tapeW = 16 / zoom;
  // Labels sit OUTSIDE the rulers (further from bbox)
  const rowLabelX = bboxLeft - tapeW;       // left of left ruler
  const rowLabelXRight = bboxRight + tapeW;  // right of right ruler
  const colLabelY = bboxTop - tapeW;         // above top ruler
  const colLabelYBottom = bboxBottom + tapeW; // below bottom ruler

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
        {/* ── Measuring tape bands ── */}
        {(() => {
          const tickLen = 6 / zoom;      // major tick length
          const tickSmall = 3 / zoom;    // minor tick (0.05) length
          const tickStroke = 0.5 / zoom;
          const tickFontSize = 7 / zoom;

          // Determine range: from 0 to max(1, max guide position) for each direction
          const hPositions = guides.filter(g => g.direction === "horizontal").map(g => g.position);
          const vPositions = guides.filter(g => g.direction === "vertical").map(g => g.position);
          const hMax = Math.max(1, ...hPositions);
          const hMin = Math.min(0, ...hPositions);
          const vMax = Math.max(1, ...vPositions);
          const vMin = Math.min(0, ...vPositions);

          // Step: 0.1 for major ticks, 0.05 for minor
          const makeTicks = (min: number, max: number) => {
            const ticks: { pos: number; major: boolean }[] = [];
            const start = Math.floor(min * 20) / 20;
            const end = Math.ceil(max * 20) / 20;
            for (let i = start; i <= end + 0.001; i += 0.05) {
              const rounded = Math.round(i * 100) / 100;
              ticks.push({ pos: rounded, major: Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.01 });
            }
            return ticks;
          };

          const hTicks = makeTicks(hMin, hMax);
          const vTicks = makeTicks(vMin, vMax);

          // Ruler positions flush against bbox on all 4 sides
          const leftX = bboxLeft - tapeW;
          const rightX = bboxRight;
          const topY = bboxTop - tapeW;
          const bottomY = bboxBottom;

          // Vertical range (for horizontal guides / row rulers)
          const hTop = hMin * canvasHeight;
          const hBottom = hMax * canvasHeight;

          // Horizontal range (for vertical guides / column rulers)
          const vLeft = vMin * canvasWidth;
          const vRight = vMax * canvasWidth;

          // Helper: render a vertical ruler (left or right side)
          const verticalRuler = (rx: number, tickSide: "left" | "right") => (
            <g>
              <rect
                x={rx} y={Math.min(hTop, topY)}
                width={tapeW} height={Math.max(hBottom, bottomY + tapeW) - Math.min(hTop, topY)}
                fill="white" stroke="#999" strokeWidth={tickStroke}
              />
              {hTicks.map(({ pos, major }) => {
                const y = pos * canvasHeight;
                const tx = tickSide === "right"
                  ? rx  // ticks extend from left edge
                  : rx + tapeW; // ticks extend from right edge
                const dx = tickSide === "right"
                  ? (major ? tickLen : tickSmall)
                  : -(major ? tickLen : tickSmall);
                return (
                  <g key={`htick-${tickSide}-${pos}`}>
                    <line
                      x1={tx} y1={y} x2={tx + dx} y2={y}
                      stroke="#666" strokeWidth={tickStroke}
                    />
                    {major && (
                      <text
                        x={tickSide === "right" ? rx + tickLen + 1 / zoom : rx + tapeW - tickLen - 1 / zoom}
                        y={y + tickFontSize * 0.35}
                        fontSize={tickFontSize} fill="#888"
                        textAnchor={tickSide === "right" ? "start" : "end"}
                        style={{ userSelect: "none" }}
                      >
                        {pos.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );

          // Helper: render a horizontal ruler (top or bottom side)
          const horizontalRuler = (ry: number, tickSide: "top" | "bottom") => (
            <g>
              <rect
                x={Math.min(vLeft, leftX)} y={ry}
                width={Math.max(vRight, rightX + tapeW) - Math.min(vLeft, leftX)} height={tapeW}
                fill="white" stroke="#999" strokeWidth={tickStroke}
              />
              {vTicks.map(({ pos, major }) => {
                const x = pos * canvasWidth;
                const ty = tickSide === "bottom"
                  ? ry  // ticks extend from top edge
                  : ry + tapeW; // ticks extend from bottom edge
                const dy = tickSide === "bottom"
                  ? (major ? tickLen : tickSmall)
                  : -(major ? tickLen : tickSmall);
                return (
                  <g key={`vtick-${tickSide}-${pos}`}>
                    <line
                      x1={x} y1={ty} x2={x} y2={ty + dy}
                      stroke="#666" strokeWidth={tickStroke}
                    />
                    {major && (
                      <text
                        x={x + 1 / zoom}
                        y={tickSide === "bottom" ? ry + tickLen + tickFontSize : ry + tapeW - tickLen}
                        fontSize={tickFontSize} fill="#888"
                        style={{ userSelect: "none" }}
                      >
                        {pos.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );

          return (
            <>
              {hPositions.length > 0 && verticalRuler(leftX, "right")}
              {hPositions.length > 0 && verticalRuler(rightX, "left")}
              {vPositions.length > 0 && horizontalRuler(topY, "bottom")}
              {vPositions.length > 0 && horizontalRuler(bottomY, "top")}
            </>
          );
        })()}

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
          const labelText = guide.label ?? (guide.direction === "horizontal" ? `R${guide.index}` : `C${guide.index}`);
          const labelWidth = labelText.length * fontSize * 0.65 + labelPad * 2;
          const labelHeight = fontSize + labelPad * 2;

          if (guide.direction === "horizontal") {
            const y = guide.position * canvasHeight;
            const lx = rowLabelX - labelWidth;
            return (
              <g key={guide.id}>
                <line
                  x1={bboxLeft - tapeW}
                  y1={y}
                  x2={bboxRight + tapeW}
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
                  fill={"rgba(25, 118, 210, 0.12)"}
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
                  opacity={0.8}
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
                {/* Right-side label (read-only mirror) */}
                <rect
                  x={rowLabelXRight}
                  y={y - labelHeight / 2}
                  width={labelWidth}
                  height={labelHeight}
                  fill={"rgba(25, 118, 210, 0.12)"}
                  rx={2 / zoom}
                  style={{ pointerEvents: "none" }}
                />
                <text
                  x={rowLabelXRight + labelPad}
                  y={y + fontSize / 3}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={0.8}
                  style={{ pointerEvents: "none" }}
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
                  y1={bboxTop - tapeW}
                  x2={x}
                  y2={bboxBottom + tapeW}
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
                    fill={"rgba(25, 118, 210, 0.12)"}
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
                    opacity={0.8}
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
                </g>
                {/* Bottom-side label (read-only mirror, rotated +90°, outside ruler) */}
                <g transform={`rotate(90, ${x}, ${colLabelYBottom + tapeW})`}>
                  <rect
                    x={x - labelWidth}
                    y={colLabelYBottom + tapeW - labelHeight / 2}
                    width={labelWidth}
                    height={labelHeight}
                    fill={"rgba(25, 118, 210, 0.12)"}
                    rx={2 / zoom}
                    style={{ pointerEvents: "none" }}
                  />
                  <text
                    x={x - labelWidth + labelPad}
                    y={colLabelYBottom + tapeW + fontSize / 3}
                    fontSize={fontSize}
                    fill="#1976d2"
                    opacity={0.8}
                    style={{ pointerEvents: "none" }}
                  >
                    {labelText}
                  </text>
                </g>
              </g>
            );
          }
        })}
      </g>
    </svg>
  );
}
