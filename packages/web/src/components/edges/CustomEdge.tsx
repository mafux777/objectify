import {
  getStraightPath,
  getBezierPath,
  getSmoothStepPath,
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { ReactNode } from "react";

const JUNCTION_GAP = 10;

/** Returns the combined ball-and-socket SVG for a junction marker. */
function getJunctionSvg(
  sourceMarker: string,
  targetMarker: string,
  color: string,
): ReactNode {
  // Socket + Ball: socket arc opens left (toward source), ball right (toward target)
  if (sourceMarker === "socket" && targetMarker === "ball") {
    return (
      <>
        <circle cx={2} cy={0} r={3.5} fill={color} />
        <path
          d="M -3 -7 A 7 7 0 0 0 -3 7"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      </>
    );
  }

  // Ball + Socket: ball left (toward source), socket arc opens right (toward target)
  if (sourceMarker === "ball" && targetMarker === "socket") {
    return (
      <>
        <circle cx={-2} cy={0} r={3.5} fill={color} />
        <path
          d="M 3 -7 A 7 7 0 0 1 3 7"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      </>
    );
  }

  // Ball + Ball: two circles side by side
  if (sourceMarker === "ball" && targetMarker === "ball") {
    return (
      <>
        <circle cx={-4} cy={0} r={3.5} fill={color} />
        <circle cx={4} cy={0} r={3.5} fill={color} />
      </>
    );
  }

  // Socket + Socket: two arcs facing each other
  if (sourceMarker === "socket" && targetMarker === "socket") {
    return (
      <>
        <path
          d="M -3 -7 A 7 7 0 0 0 -3 7"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
        <path
          d="M 3 -7 A 7 7 0 0 1 3 7"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      </>
    );
  }

  return null;
}

function isBallOrSocket(m: string): boolean {
  return m === "ball" || m === "socket";
}

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  selected,
  data,
}: EdgeProps) {
  const routingType = (data?.routingType as string) ?? "straight";
  const strokeWidth =
    (data?.strokeWidth as number) ?? (style?.strokeWidth as number) ?? 1.5;

  // Detect junction mode: both ends have ball or socket markers
  const sourceMarkerKind = (data?.sourceMarker as string) ?? "none";
  const targetMarkerKind = (data?.targetMarker as string) ?? "none";
  const isJunction =
    isBallOrSocket(sourceMarkerKind) && isBallOrSocket(targetMarkerKind);

  // Compute path based on routing type
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  switch (routingType) {
    case "bezier": {
      [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: sourcePosition ?? Position.Bottom,
        targetPosition: targetPosition ?? Position.Top,
      });
      break;
    }
    case "step": {
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: sourcePosition ?? Position.Bottom,
        targetPosition: targetPosition ?? Position.Top,
        borderRadius: 0,
        offset: 50,
      });
      break;
    }
    case "smoothstep": {
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: sourcePosition ?? Position.Bottom,
        targetPosition: targetPosition ?? Position.Top,
        borderRadius: 5,
        offset: 50,
      });
      break;
    }
    case "straight":
    default: {
      [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      break;
    }
  }

  // Junction rendering: combined ball-and-socket at midpoint
  if (isJunction) {
    const color = (style?.stroke as string) ?? "#555";
    const sw = selected ? Math.max(strokeWidth + 1, 2.5) : strokeWidth;
    const junctionSvg = getJunctionSvg(
      sourceMarkerKind,
      targetMarkerKind,
      color,
    );

    // Compute angle for junction symbol rotation
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const totalLength = Math.sqrt(dx * dx + dy * dy);

    // For straight routing, split path into two segments with a gap
    const canSplitPath = routingType === "straight";
    const tooShort = totalLength < 2 * JUNCTION_GAP;

    let segment1: string | null = null;
    let segment2: string | null = null;

    if (canSplitPath && !tooShort) {
      const nx = totalLength > 0 ? dx / totalLength : 1;
      const ny = totalLength > 0 ? dy / totalLength : 0;
      const gapStartX = labelX - JUNCTION_GAP * nx;
      const gapStartY = labelY - JUNCTION_GAP * ny;
      const gapEndX = labelX + JUNCTION_GAP * nx;
      const gapEndY = labelY + JUNCTION_GAP * ny;
      segment1 = `M ${sourceX} ${sourceY} L ${gapStartX} ${gapStartY}`;
      segment2 = `M ${gapEndX} ${gapEndY} L ${targetX} ${targetY}`;
    }

    // Build style without markers' stroke-dasharray leaking to junction
    const segmentStyle = { ...style, strokeWidth: sw };

    return (
      <>
        {/* Invisible wider hit area (full path, no gap) */}
        <path
          d={edgePath}
          strokeWidth={20}
          fill="none"
          stroke="transparent"
          style={{ pointerEvents: "stroke" }}
        />

        {canSplitPath && segment1 && segment2 ? (
          <>
            {/* Segment 1: source to gap start */}
            <path
              d={segment1}
              fill="none"
              style={segmentStyle}
              className="react-flow__edge-path"
            />
            {/* Segment 2: gap end to target */}
            <path
              d={segment2}
              fill="none"
              style={segmentStyle}
              className="react-flow__edge-path"
            />
          </>
        ) : (
          /* Non-straight or very short: full path without endpoint markers */
          <BaseEdge
            id={id}
            path={edgePath}
            style={segmentStyle}
            markerStart={undefined}
            markerEnd={undefined}
          />
        )}

        {/* Junction symbol at midpoint, rotated to edge angle */}
        <g
          transform={`translate(${labelX}, ${labelY}) rotate(${angleDeg})`}
          style={{ cursor: "pointer", pointerEvents: "all" }}
          className="edge-midpoint-handle"
        >
          {junctionSvg}
        </g>

        {/* Edge label (offset below junction) */}
        {label && (
          <EdgeLabelRenderer>
            <div
              className="react-flow__edge-label"
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 16}px)`,
                ...labelStyle,
                background: (labelBgStyle as Record<string, unknown>)?.fill as
                  | string
                  | undefined,
                padding: labelBgPadding
                  ? `${labelBgPadding[1]}px ${labelBgPadding[0]}px`
                  : undefined,
                borderRadius: labelBgBorderRadius,
                pointerEvents: "all",
                fontSize: 11,
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  // Non-junction: standard rendering
  return (
    <>
      {/* Invisible wider hit area for easier hover/click */}
      <path
        d={edgePath}
        strokeWidth={20}
        fill="none"
        stroke="transparent"
        style={{ pointerEvents: "stroke" }}
      />

      {/* Visible edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? Math.max(strokeWidth + 1, 2.5) : strokeWidth,
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />

      {/* Midpoint handle for interaction */}
      <circle
        cx={labelX}
        cy={labelY}
        r={selected ? 6 : 4}
        fill={selected ? "#1976d2" : "#fff"}
        stroke={(style?.stroke as string) ?? "#555"}
        strokeWidth={1.5}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        className="edge-midpoint-handle"
      />

      {/* Edge label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="react-flow__edge-label"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...labelStyle,
              background: (labelBgStyle as Record<string, unknown>)?.fill as
                | string
                | undefined,
              padding: labelBgPadding
                ? `${labelBgPadding[1]}px ${labelBgPadding[0]}px`
                : undefined,
              borderRadius: labelBgBorderRadius,
              pointerEvents: "all",
              fontSize: 11,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
