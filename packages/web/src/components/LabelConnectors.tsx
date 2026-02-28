import { useViewport, type Node, type Edge } from "@xyflow/react";
import type { NodeLabel, EdgeLabel } from "@objectify/schema";
import { clockToStyle } from "../lib/clock-position.js";

interface LabelConnectorsProps {
  nodes: Node[];
  edges: Edge[];
  visible: boolean;
}

const NODE_LABEL_COLOR = "#1976d2";  // blue for node-owned labels
const EDGE_LABEL_COLOR = "#e65100";  // orange for edge-owned labels

/**
 * Estimate the pixel offset of an outside label relative to the node's top-left corner.
 * Returns the approximate center point of the label for connector drawing.
 */
function estimateLabelOffset(
  position: string,
  nodeW: number,
  nodeH: number,
  labelW: number,
  labelH: number,
): { x: number; y: number } {
  const GAP = 6;
  switch (position) {
    case "12:00":
      return { x: nodeW / 2, y: -(GAP + labelH / 2) };
    case "1:30":
      return { x: nodeW + GAP + labelW / 2, y: -(GAP + labelH / 2) };
    case "3:00":
      return { x: nodeW + GAP + labelW / 2, y: nodeH / 2 };
    case "4:30":
      return { x: nodeW + GAP + labelW / 2, y: nodeH + GAP + labelH / 2 };
    case "6:00":
      return { x: nodeW / 2, y: nodeH + GAP + labelH / 2 };
    case "7:30":
      return { x: -(GAP + labelW / 2), y: nodeH + GAP + labelH / 2 };
    case "9:00":
      return { x: -(GAP + labelW / 2), y: nodeH / 2 };
    case "10:30":
      return { x: -(GAP + labelW / 2), y: -(GAP + labelH / 2) };
    default:
      return { x: nodeW / 2, y: nodeH / 2 };
  }
}

/**
 * SVG overlay that visualizes label-to-object relationships.
 * Draws dashed bounding boxes around outside labels and thin connector
 * lines from each outside label to its parent node/edge center.
 */
export function LabelConnectors({ nodes, edges, visible }: LabelConnectorsProps) {
  const { x: panX, y: panY, zoom } = useViewport();

  if (!visible) return null;

  const strokeW = 1 / zoom;
  const dash = `${3 / zoom},${3 / zoom}`;

  // Collect node label connectors
  const nodeConnectors: {
    nodeX: number;
    nodeY: number;
    nodeW: number;
    nodeH: number;
    labelX: number;
    labelY: number;
    labelW: number;
    labelH: number;
    color: string;
  }[] = [];

  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const labels = data?.labels as NodeLabel[] | undefined;
    if (!labels) continue;

    const nodeW = node.width ?? node.measured?.width ?? 160;
    const nodeH = node.height ?? node.measured?.height ?? 50;
    const nodeX = node.position.x;
    const nodeY = node.position.y;

    for (const lbl of labels) {
      if (lbl.position === "center") continue;

      // Estimate label dimensions from text length
      const fontSize = lbl.font?.fontSize ?? 11;
      const estW = lbl.text.length * fontSize * 0.6 + 8;
      const estH = fontSize * 1.5 + 4;

      const offset = estimateLabelOffset(lbl.position, nodeW, nodeH, estW, estH);

      nodeConnectors.push({
        nodeX,
        nodeY,
        nodeW,
        nodeH,
        labelX: nodeX + offset.x - estW / 2,
        labelY: nodeY + offset.y - estH / 2,
        labelW: estW,
        labelH: estH,
        color: NODE_LABEL_COLOR,
      });
    }
  }

  // Collect edge label connectors
  const edgeConnectors: {
    edgeMidX: number;
    edgeMidY: number;
    labelX: number;
    labelY: number;
    labelW: number;
    labelH: number;
    color: string;
  }[] = [];

  // For edges, we estimate the midpoint as the average of source and target node centers
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const edgeData = edge.data as Record<string, unknown> | undefined;
    const labels = edgeData?.labels as EdgeLabel[] | undefined;
    if (!labels || labels.length === 0) continue;

    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcW = srcNode.width ?? srcNode.measured?.width ?? 160;
    const srcH = srcNode.height ?? srcNode.measured?.height ?? 50;
    const tgtW = tgtNode.width ?? tgtNode.measured?.width ?? 160;
    const tgtH = tgtNode.height ?? tgtNode.measured?.height ?? 50;

    const midX = (srcNode.position.x + srcW / 2 + tgtNode.position.x + tgtW / 2) / 2;
    const midY = (srcNode.position.y + srcH / 2 + tgtNode.position.y + tgtH / 2) / 2;

    for (const lbl of labels) {
      const fontSize = lbl.font?.fontSize ?? 11;
      const estW = lbl.text.length * fontSize * 0.6 + 12;
      const estH = fontSize * 1.5 + 6;

      // Determine color: node-owned labels show in blue, edge-owned in orange
      const color = lbl.ownerNodeId ? NODE_LABEL_COLOR : EDGE_LABEL_COLOR;

      edgeConnectors.push({
        edgeMidX: midX,
        edgeMidY: midY,
        labelX: midX - estW / 2,
        labelY: midY - estH / 2 - 12, // slightly above the midpoint
        labelW: estW,
        labelH: estH,
        color,
      });
    }
  }

  if (nodeConnectors.length === 0 && edgeConnectors.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
        {/* Node label connectors */}
        {nodeConnectors.map((c, i) => {
          const nodeCenterX = c.nodeX + c.nodeW / 2;
          const nodeCenterY = c.nodeY + c.nodeH / 2;
          const labelCenterX = c.labelX + c.labelW / 2;
          const labelCenterY = c.labelY + c.labelH / 2;

          return (
            <g key={`node-${i}`}>
              {/* Dashed bounding box around the label */}
              <rect
                x={c.labelX}
                y={c.labelY}
                width={c.labelW}
                height={c.labelH}
                fill="none"
                stroke={c.color}
                strokeWidth={strokeW}
                strokeDasharray={dash}
                opacity={0.6}
                rx={2 / zoom}
              />
              {/* Connector line from label center to node center */}
              <line
                x1={labelCenterX}
                y1={labelCenterY}
                x2={nodeCenterX}
                y2={nodeCenterY}
                stroke={c.color}
                strokeWidth={strokeW * 0.75}
                strokeDasharray={dash}
                opacity={0.4}
              />
            </g>
          );
        })}

        {/* Edge label connectors */}
        {edgeConnectors.map((c, i) => {
          const labelCenterX = c.labelX + c.labelW / 2;
          const labelCenterY = c.labelY + c.labelH / 2;

          return (
            <g key={`edge-${i}`}>
              <rect
                x={c.labelX}
                y={c.labelY}
                width={c.labelW}
                height={c.labelH}
                fill="none"
                stroke={c.color}
                strokeWidth={strokeW}
                strokeDasharray={dash}
                opacity={0.6}
                rx={2 / zoom}
              />
              <line
                x1={labelCenterX}
                y1={labelCenterY}
                x2={c.edgeMidX}
                y2={c.edgeMidY}
                stroke={c.color}
                strokeWidth={strokeW * 0.75}
                strokeDasharray={dash}
                opacity={0.4}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
