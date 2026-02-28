import { MarkerType, type Edge } from "@xyflow/react";
import type { DiagramEdge } from "@objectify/schema";

export function specEdgesToFlowEdges(specEdges: DiagramEdge[]): Edge[] {
  return specEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    ...(e.sourceAnchor ? { sourceHandle: `source-${e.sourceAnchor}` } : {}),
    ...(e.targetAnchor ? { targetHandle: `target-${e.targetAnchor}` } : {}),
    label: e.label,
    labelStyle: { fontSize: 11, fontWeight: 500 },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
    animated: e.style?.lineStyle === "dashed",
    style: {
      stroke: e.style?.color ?? "#555",
      strokeWidth: 1.5,
      ...(e.style?.lineStyle === "dashed"
        ? { strokeDasharray: "6,3" }
        : e.style?.lineStyle === "dotted"
          ? { strokeDasharray: "2,2" }
          : {}),
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.style?.color ?? "#555",
      width: 16,
      height: 16,
    },
  }));
}
