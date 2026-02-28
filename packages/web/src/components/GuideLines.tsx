import { useReactFlow } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

interface GuideLinesProps {
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
  visible: boolean;
}

export function GuideLines({
  guides,
  canvasWidth,
  canvasHeight,
  visible,
}: GuideLinesProps) {
  const { getViewport } = useReactFlow();

  if (!visible || guides.length === 0) return null;

  const { x: panX, y: panY, zoom } = getViewport();
  const strokeW = 1 / zoom;
  const dash = `${4 / zoom},${4 / zoom}`;
  const fontSize = 10 / zoom;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
        {guides.map((guide) => {
          if (guide.direction === "horizontal") {
            const y = guide.position * canvasHeight;
            return (
              <g key={guide.id}>
                <line
                  x1={0}
                  y1={y}
                  x2={canvasWidth}
                  y2={y}
                  stroke="#1976d2"
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  opacity={0.5}
                />
                <text
                  x={4 / zoom}
                  y={y - 4 / zoom}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={0.7}
                >
                  {guide.label ?? `R${guide.index}`}
                </text>
              </g>
            );
          } else {
            const x = guide.position * canvasWidth;
            return (
              <g key={guide.id}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={canvasHeight}
                  stroke="#1976d2"
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  opacity={0.5}
                />
                <text
                  x={x + 4 / zoom}
                  y={14 / zoom}
                  fontSize={fontSize}
                  fill="#1976d2"
                  opacity={0.7}
                >
                  {guide.label ?? `C${guide.index}`}
                </text>
              </g>
            );
          }
        })}
      </g>
    </svg>
  );
}
