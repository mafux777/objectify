import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";
import type { ShapeKind } from "@objectify/schema";
import {
  ALL_CLOCK_LABELS,
  ORIGINAL_CLOCK_LABELS,
  clockToRectHandle,
  clockToCirclePoint,
} from "../../lib/clock-math.js";

/**
 * Precomputed handle data for all 24 clock positions on rectangular nodes.
 * Each entry has the clock label, React Flow Position, and CSS style.
 */
const CLOCK_HANDLES = ALL_CLOCK_LABELS.map((clock) => ({
  clock,
  ...clockToRectHandle(clock),
  isOriginal: ORIGINAL_CLOCK_LABELS.has(clock),
}));

/**
 * Precomputed circle-perimeter overrides for all 24 clock positions.
 * Cardinal positions (12:00, 3:00, 6:00, 9:00) don't need overrides because
 * they sit at the midpoint of their edge, which coincides with the circle.
 * All others get absolute positioning on the circle perimeter.
 */
const CIRCLE_OVERRIDES: Record<string, React.CSSProperties> = {};
for (const clock of ALL_CLOCK_LABELS) {
  // Cardinal positions sit naturally at 50% of their edge — no override needed
  if (clock === "12:00" || clock === "3:00" || clock === "6:00" || clock === "9:00") {
    continue;
  }
  const { top, left } = clockToCirclePoint(clock);
  CIRCLE_OVERRIDES[clock] = {
    top,
    left,
    right: "auto",
    transform: "translate(-50%, -50%)",
  };
}

function isCircularShape(kind: ShapeKind | undefined): boolean {
  return kind === "circle" || kind === "ellipse";
}

/** Hidden zero-size style for handles that exist only as routing targets. */
const MINOR_HIDDEN: React.CSSProperties = {
  opacity: 0,
  width: 0,
  height: 0,
  minWidth: 0,
  minHeight: 0,
  pointerEvents: "none",
};

/** Hidden zero-size handle for backward compatibility with legacy "source-top" etc. */
const LEGACY_HIDDEN: React.CSSProperties = { ...MINOR_HIDDEN };

const LEGACY_HANDLES: {
  side: string;
  position: Position;
  style: React.CSSProperties;
}[] = [
  { side: "top", position: Position.Top, style: { left: "50%", ...LEGACY_HIDDEN } },
  { side: "right", position: Position.Right, style: { top: "50%", ...LEGACY_HIDDEN } },
  { side: "bottom", position: Position.Bottom, style: { left: "50%", ...LEGACY_HIDDEN } },
  { side: "left", position: Position.Left, style: { top: "50%", ...LEGACY_HIDDEN } },
];

export function NodeHandles({ shapeKind }: { shapeKind?: ShapeKind } = {}) {
  const circular = isCircularShape(shapeKind);

  return (
    <>
      {CLOCK_HANDLES.map(({ clock, position, style, isOriginal }) => {
        // For circular nodes, use perimeter overrides for non-cardinal positions
        const handleStyle =
          circular && CIRCLE_OVERRIDES[clock]
            ? CIRCLE_OVERRIDES[clock]
            : style;

        // New (non-original) positions are invisible routing-only targets
        const finalStyle = isOriginal
          ? handleStyle
          : { ...handleStyle, ...MINOR_HIDDEN };

        return (
          <Fragment key={clock}>
            <Handle
              type="target"
              position={position}
              id={`target-${clock}`}
              className={isOriginal ? "anchor-handle" : "anchor-handle-minor"}
              style={finalStyle}
            />
            <Handle
              type="source"
              position={position}
              id={`source-${clock}`}
              className={isOriginal ? "anchor-handle" : "anchor-handle-minor"}
              style={finalStyle}
            />
          </Fragment>
        );
      })}
      {/* Legacy handles for backward compatibility with existing edges using "source-top" etc. */}
      {LEGACY_HANDLES.map(({ side, position, style }) => (
        <Fragment key={`legacy-${side}`}>
          <Handle
            type="target"
            position={position}
            id={`target-${side}`}
            style={style}
          />
          <Handle
            type="source"
            position={position}
            id={`source-${side}`}
            style={style}
          />
        </Fragment>
      ))}
    </>
  );
}
