import { Panel } from "@xyflow/react";
import type { LegendConfig, MarkerKind } from "@objectify/schema";

interface LegendProps {
  legend: LegendConfig;
  visible: boolean;
}

function LegendSwatch({ color }: { color: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} fill={color} stroke="#000" strokeWidth={1} />
    </svg>
  );
}

function LegendEdgeSwatch({
  sourceMarker,
  targetMarker,
  lineStyle,
  color,
}: {
  sourceMarker?: MarkerKind;
  targetMarker?: MarkerKind;
  lineStyle?: string;
  color: string;
}) {
  const dash =
    lineStyle === "dashed" ? "6,3" : lineStyle === "dotted" ? "2,2" : undefined;

  return (
    <svg width={60} height={20} viewBox="0 0 60 20">
      {/* Source marker */}
      {sourceMarker === "ball" && (
        <circle cx={6} cy={10} r={4} fill={color} />
      )}
      {sourceMarker === "socket" && (
        <path
          d="M 10 4 A 6 6 0 0 0 10 16"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
      {sourceMarker === "arrow" && (
        <path d="M 12 6 L 4 10 L 12 14 Z" fill={color} />
      )}

      {/* Line */}
      <line
        x1={sourceMarker && sourceMarker !== "none" ? 12 : 4}
        y1={10}
        x2={targetMarker && targetMarker !== "none" ? 48 : 56}
        y2={10}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dash}
      />

      {/* Target marker */}
      {targetMarker === "ball" && (
        <circle cx={54} cy={10} r={4} fill={color} />
      )}
      {targetMarker === "socket" && (
        <path
          d="M 50 4 A 6 6 0 0 1 50 16"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
      {targetMarker === "arrow" && (
        <path d="M 48 6 L 56 10 L 48 14 Z" fill={color} />
      )}
    </svg>
  );
}

export function Legend({ legend, visible }: LegendProps) {
  if (!visible) return null;

  return (
    <Panel position="bottom-left">
      <div
        style={{
          background: "white",
          border: "1px dashed #999",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
          minWidth: 160,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {legend.title ?? "Legend"}
        </div>

        {legend.nodeEntries?.map((entry, i) => (
          <div
            key={`node-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <LegendSwatch color={entry.color ?? "#888"} />
            <span>{entry.label}</span>
          </div>
        ))}

        {legend.edgeEntries && legend.edgeEntries.length > 0 && (
          <div
            style={{
              borderTop: "1px solid #eee",
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            {legend.edgeEntries.map((entry, i) => (
              <div
                key={`edge-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <LegendEdgeSwatch
                  sourceMarker={entry.sourceMarker as MarkerKind | undefined}
                  targetMarker={entry.targetMarker as MarkerKind | undefined}
                  lineStyle={entry.lineStyle}
                  color={entry.color ?? "#000"}
                />
                <span>{entry.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
