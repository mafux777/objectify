import {
  getStraightPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";

export function CustomStraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerStart,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  // Midpoint for interaction handle
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

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
          ...(selected ? { strokeWidth: 2.5 } : {}),
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />

      {/* Midpoint handle for interaction */}
      <circle
        cx={midX}
        cy={midY}
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
              background: (labelBgStyle as Record<string, unknown>)?.fill as string,
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
