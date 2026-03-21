import { MarkerType, type Edge } from "@xyflow/react";
import type { DiagramEdge } from "@objectify/schema";
import { fontStack } from "./fonts";
import { migrateEdgeLabels } from "./label-migration.js";

export function specMarkerToFlow(
  marker: string | undefined,
  fallback: string,
  color: string
): string | { type: MarkerType; color: string; width: number; height: number } | undefined {
  const kind = marker ?? fallback;
  switch (kind) {
    case "ball":
      return `url(#marker-ball-${color.replace("#", "")})`;
    case "socket":
      return `url(#marker-socket-${color.replace("#", "")})`;
    case "arrow":
      return { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
    case "none":
      return undefined;
    default:
      return undefined;
  }
}

/** Collect all unique marker+color combinations needed for SVG defs */
export function collectMarkerColors(specEdges: DiagramEdge[]): { kind: string; color: string }[] {
  const seen = new Set<string>();
  const result: { kind: string; color: string }[] = [];
  for (const e of specEdges) {
    const color = e.style?.color ?? "#555";
    for (const marker of [e.sourceMarker, e.targetMarker]) {
      if (marker === "ball" || marker === "socket") {
        const key = `${marker}-${color}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ kind: marker, color });
        }
      }
    }
  }
  return result;
}

/** Map legacy cardinal anchors to clock notation for handle IDs */
const LEGACY_ANCHOR_MAP: Record<string, string> = {
  top: "12:00",
  right: "3:00",
  bottom: "6:00",
  left: "9:00",
};

function anchorToHandleId(anchor: string, direction: "source" | "target"): string {
  const normalized = LEGACY_ANCHOR_MAP[anchor] ?? anchor;
  return `${direction}-${normalized}`;
}

/** All routing types use the unified customEdge component */
function routingToEdgeType(_routingType: string | undefined): string {
  return "customEdge";
}

export function specEdgesToFlowEdges(
  specEdges: DiagramEdge[],
  defaultRoutingType: string = "straight",
): Edge[] {
  return specEdges.map((e) => {
    const edgeLabels = migrateEdgeLabels(e);
    // React Flow only supports one label natively — use the first one
    const primaryLabel = edgeLabels[0];
    const color = e.style?.color ?? "#555";
    const edgeType = routingToEdgeType(e.style?.routingType);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: edgeType,
      ...(e.visible === false ? { hidden: true } : {}),
      ...(e.sourceAnchor ? { sourceHandle: anchorToHandleId(e.sourceAnchor, "source") } : {}),
      ...(e.targetAnchor ? { targetHandle: anchorToHandleId(e.targetAnchor, "target") } : {}),
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
        stroke: color,
        strokeWidth: e.style?.strokeWidth ?? 1.5,
        ...(e.style?.lineStyle === "dashed"
          ? { strokeDasharray: "6,3" }
          : e.style?.lineStyle === "dotted"
            ? { strokeDasharray: "2,2" }
            : {}),
      },
      markerStart: specMarkerToFlow(e.sourceMarker, "none", color),
      markerEnd: specMarkerToFlow(e.targetMarker, "arrow", color),
      // Store routing/styling data for the unified CustomEdge component
      data: {
        labels: edgeLabels,
        routingType: e.style?.routingType ?? defaultRoutingType,
        strokeWidth: e.style?.strokeWidth ?? 1.5,
        ...(e.labelStyle ? { labelStyle: e.labelStyle } : {}),
        ...(e.sourceMarker ? { sourceMarker: e.sourceMarker } : {}),
        ...(e.targetMarker ? { targetMarker: e.targetMarker } : {}),
        ...(e.description ? { description: e.description } : {}),
      },
    };
  });
}
