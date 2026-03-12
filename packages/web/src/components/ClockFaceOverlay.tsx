import { useViewport } from "@xyflow/react";
import {
  ALL_CLOCK_LABELS,
  FULL_HOUR_LABELS,
  clockToXY,
} from "../lib/clock-math.js";

interface ClockFaceOverlayProps {
  /** Center X of the node in flow coordinates */
  nodeCenterX: number;
  /** Center Y of the node in flow coordinates */
  nodeCenterY: number;
  /** Node width */
  nodeWidth: number;
  /** Node height */
  nodeHeight: number;
  /** Currently highlighted clock position (nearest to cursor) */
  highlightedClock: string | null;
}

/** Cardinal labels shown at the four main compass points for orientation */
const CARDINAL_LABELS: { clock: string; label: string }[] = [
  { clock: "12:00", label: "12" },
  { clock: "3:00", label: "3" },
  { clock: "6:00", label: "6" },
  { clock: "9:00", label: "9" },
];

export function ClockFaceOverlay({
  nodeCenterX,
  nodeCenterY,
  nodeWidth,
  nodeHeight,
  highlightedClock,
}: ClockFaceOverlayProps) {
  const { x: panX, y: panY, zoom } = useViewport();

  // Clock face radius: slightly larger than the node's bounding circle
  const radius = Math.max(nodeWidth, nodeHeight) / 2 + 30;

  const cx = nodeCenterX;
  const cy = nodeCenterY;

  // Scale-independent sizes (constant screen-space size)
  const inv = 1 / zoom;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
        {/* Faint circle ring connecting all positions */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#1976d2"
          strokeWidth={0.5 * inv}
          opacity={0.3}
        />

        {/* Clock position dots */}
        {ALL_CLOCK_LABELS.map((label) => {
          const { x, y } = clockToXY(label, cx, cy, radius);
          const isHighlighted = label === highlightedClock;
          const isFullHour = FULL_HOUR_LABELS.has(label);

          let dotRadius: number;
          let fill: string;
          let opacity: number;

          if (isHighlighted) {
            dotRadius = 6 * inv;
            fill = "#1976d2";
            opacity = 1;
          } else if (isFullHour) {
            dotRadius = 3.5 * inv;
            fill = "#1976d2";
            opacity = 0.7;
          } else {
            dotRadius = 2 * inv;
            fill = "#64B5F6";
            opacity = 0.5;
          }

          return (
            <circle
              key={label}
              cx={x}
              cy={y}
              r={dotRadius}
              fill={fill}
              stroke={isHighlighted ? "#fff" : "none"}
              strokeWidth={isHighlighted ? 2 * inv : 0}
              opacity={opacity}
            />
          );
        })}

        {/* Cardinal labels for orientation */}
        {CARDINAL_LABELS.map(({ clock, label }) => {
          const labelRadius = radius + 14 * inv;
          const { x, y } = clockToXY(clock, cx, cy, labelRadius);
          return (
            <text
              key={clock}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10 * inv}
              fontFamily="system-ui, sans-serif"
              fill="#1976d2"
              opacity={0.6}
              fontWeight={500}
            >
              {label}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
