import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";
import type { ShapeKind } from "@objectify/schema";

/**
 * Clock-position handles. Each clock position maps to a React Flow Position
 * (which side of the bounding box) and CSS to place it along that side.
 *
 * Handle IDs: "source-12:00", "target-3:00", etc.
 */
const CLOCK_HANDLES: {
  clock: string;
  position: Position;
  style: React.CSSProperties;
}[] = [
  { clock: "12:00", position: Position.Top, style: { left: "50%" } },
  { clock: "1:30", position: Position.Right, style: { top: "0%" } },
  { clock: "3:00", position: Position.Right, style: { top: "50%" } },
  { clock: "4:30", position: Position.Right, style: { top: "100%" } },
  { clock: "6:00", position: Position.Bottom, style: { left: "50%" } },
  { clock: "7:30", position: Position.Left, style: { top: "100%" } },
  { clock: "9:00", position: Position.Left, style: { top: "50%" } },
  { clock: "10:30", position: Position.Left, style: { top: "0%" } },
];

/**
 * For circular nodes, diagonal handles (1:30, 4:30, 7:30, 10:30) must sit on
 * the circle perimeter rather than the bounding-box corners.
 *
 * For a circle inscribed in its square bounding box the perimeter at 45° is at
 *   50% ± 50% × cos(45°) ≈ 14.64% / 85.36%
 * We override the handle's CSS to use absolute top/left positioning so the
 * handle is no longer pinned to the bounding-box edge.
 */
const DIAG = 50 + 50 * Math.cos(Math.PI / 4); // ~85.36
const INV = 100 - DIAG; // ~14.64

const CIRCLE_DIAGONAL_OVERRIDES: Record<string, React.CSSProperties> = {
  "1:30": {
    top: `${INV}%`,
    left: `${DIAG}%`,
    right: "auto",
    transform: "translate(-50%, -50%)",
  },
  "4:30": {
    top: `${DIAG}%`,
    left: `${DIAG}%`,
    right: "auto",
    transform: "translate(-50%, -50%)",
  },
  "7:30": {
    top: `${DIAG}%`,
    left: `${INV}%`,
    transform: "translate(-50%, -50%)",
  },
  "10:30": {
    top: `${INV}%`,
    left: `${INV}%`,
    transform: "translate(-50%, -50%)",
  },
};

function isCircularShape(kind: ShapeKind | undefined): boolean {
  return kind === "circle" || kind === "ellipse";
}

/** Hidden zero-size handle for backward compatibility with legacy "source-top" etc. */
const LEGACY_HIDDEN: React.CSSProperties = {
  opacity: 0,
  width: 0,
  height: 0,
  minWidth: 0,
  minHeight: 0,
  pointerEvents: "none",
};

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
      {CLOCK_HANDLES.map(({ clock, position, style }) => {
        const handleStyle =
          circular && CIRCLE_DIAGONAL_OVERRIDES[clock]
            ? CIRCLE_DIAGONAL_OVERRIDES[clock]
            : style;

        return (
          <Fragment key={clock}>
            <Handle
              type="target"
              position={position}
              id={`target-${clock}`}
              className="anchor-handle"
              style={handleStyle}
            />
            <Handle
              type="source"
              position={position}
              id={`source-${clock}`}
              className="anchor-handle"
              style={handleStyle}
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
