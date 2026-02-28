import { MarkerType, type Edge } from "@xyflow/react";
import type { DiagramEdge } from "@objectify/schema";
import { fontStack } from "./fonts";
import { migrateEdgeLabels } from "./label-migration.js";

export function specEdgesToFlowEdges(specEdges: DiagramEdge[]): Edge[] {
  return specEdges.map((e) => {
    const edgeLabels = migrateEdgeLabels(e);
    // React Flow only supports one label natively — use the first one
    const primaryLabel = edgeLabels[0];

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      ...(e.sourceAnchor ? { sourceHandle: `source-${e.sourceAnchor}` } : {}),
      ...(e.targetAnchor ? { targetHandle: `target-${e.targetAnchor}` } : {}),
      label: primaryLabel?.text ?? e.label,
      labelStyle: {
        fontSize: e.labelStyle?.fontSize ?? 11,
        fontWeight: e.labelStyle?.fontWeight === "bold" ? 700 : 500,
        fontFamily: fontStack(e.labelStyle?.fontFamily),
        fill: e.labelStyle?.color ?? "#333",
      },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: {
        fill: e.labelStyle?.backgroundColor ?? "#fff",
        fillOpacity: 0.85,
      },
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
      // Store full labels array for the LabelConnectors overlay
      data: {
        labels: edgeLabels,
        ...(e.labelStyle ? { labelStyle: e.labelStyle } : {}),
      },
    };
  });
}
