import ELK, {
  type ElkNode,
  type ElkExtendedEdge,
} from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";
import type {
  SingleDiagram,
  DiagramNode,
  ShapePaletteEntry,
  SizePaletteEntry,
} from "@objectify/schema";
import { specEdgesToFlowEdges } from "./spec-to-flow.js";
import { migrateNodeLabels } from "./label-migration.js";
import { zLevelToIndex } from "./z-level.js";

const REFERENCE_CANVAS_WIDTH = 1200;
const REFERENCE_CANVAS_HEIGHT = 800;

const elk = new ELK();

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 50;

/**
 * Build a nested ELK graph from a flat list of nodes with parentId references.
 */
function buildElkGraph(
  diagram: SingleDiagram,
  sizeMap?: Map<string, SizePaletteEntry>
): ElkNode {
  const nodeMap = new Map<string, DiagramNode>();
  for (const node of diagram.nodes) {
    nodeMap.set(node.id, node);
  }

  // Find root-level nodes (no parentId)
  const rootNodes = diagram.nodes.filter((n) => !n.parentId);

  function buildChildren(parentId?: string): ElkNode[] {
    const children = parentId
      ? diagram.nodes
          .filter((n) => n.parentId === parentId)
          .sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0))
      : rootNodes.sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0));

    return children.map((node) => {
      const isGroup = node.type === "group";
      const nestedChildren = buildChildren(node.id);

      // Resolve size: prefer size palette, fall back to defaults
      const sizeEntry = node.sizeId && sizeMap ? sizeMap.get(node.sizeId) : undefined;
      const nodeWidth = sizeEntry
        ? Math.round(sizeEntry.width * REFERENCE_CANVAS_WIDTH)
        : DEFAULT_NODE_WIDTH;
      const nodeHeight = sizeEntry
        ? Math.round(sizeEntry.height * REFERENCE_CANVAS_HEIGHT)
        : DEFAULT_NODE_HEIGHT;

      const elkNode: ElkNode = {
        id: node.id,
        ...(isGroup
          ? {}
          : { width: nodeWidth, height: nodeHeight }),
        ...(nestedChildren.length > 0
          ? {
              children: nestedChildren,
              layoutOptions: {
                "elk.padding": "[top=40,left=20,bottom=20,right=20]",
                "elk.algorithm": "layered",
                "elk.direction": "RIGHT",
                "elk.spacing.nodeNode": "20",
                "elk.layered.spacing.nodeNodeBetweenLayers": "40",
              },
            }
          : {}),
      };

      return elkNode;
    });
  }

  // Build edges — only include edges where both source and target exist
  // Solid edges get high priority to dominate layout direction;
  // dashed/dotted edges (typically responses/feedback) get low priority
  const edgeStyleMap = new Map(
    diagram.edges.map((e) => [e.id, e.style?.lineStyle ?? "solid"])
  );
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const elkEdges: ElkExtendedEdge[] = diagram.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      layoutOptions:
        edgeStyleMap.get(e.id) !== "solid"
          ? { "elk.layered.priority.direction": "0" }
          : { "elk.layered.priority.direction": "10" },
    }));

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": diagram.direction ?? "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "30",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: buildChildren(),
    edges: elkEdges,
  };
}

/**
 * Flatten the ELK layout result back into React Flow nodes.
 * Positions are relative to parent, which is what React Flow expects when parentId is set.
 */
function flattenElkResult(
  elkNode: ElkNode,
  specNodes: Map<string, DiagramNode>,
  shapeMap?: Map<string, ShapePaletteEntry>,
  parentId?: string
): Node[] {
  const result: Node[] = [];

  for (const child of elkNode.children ?? []) {
    const specNode = specNodes.get(child.id);
    if (!specNode) continue;

    const isGroup = specNode.type === "group";

    // Resolve shape: nodes with shapeId use ShapeNode, others use colorBox
    const shapeEntry = specNode.shapeId && shapeMap
      ? shapeMap.get(specNode.shapeId)
      : undefined;
    const nodeType = isGroup
      ? "groupNode"
      : shapeEntry
        ? "shapeNode"
        : "colorBox";

    // For group nodes, also look up shape entry to pass shapeKind (e.g., cloud)
    const groupShapeEntry = isGroup && specNode.shapeId && shapeMap
      ? shapeMap.get(specNode.shapeId)
      : undefined;

    const rfNode: Node = {
      id: specNode.id,
      type: nodeType,
      position: { x: child.x ?? 0, y: child.y ?? 0 },
      data: {
        label: specNode.label,
        labels: migrateNodeLabels(specNode),
        style: specNode.style,
        ...(specNode.font ? { font: specNode.font } : {}),
        ...(shapeEntry ? { shapeKind: shapeEntry.kind, ...(shapeEntry.aspectRatio ? { aspectRatio: shapeEntry.aspectRatio } : {}) } : {}),
        ...(groupShapeEntry ? { shapeKind: groupShapeEntry.kind } : {}),
        ...(specNode.shapeId ? { shapeId: specNode.shapeId } : {}),
        ...(specNode.sizeId ? { sizeId: specNode.sizeId } : {}),
        ...(specNode.semanticTypeId ? { semanticTypeId: specNode.semanticTypeId } : {}),
        ...(specNode.guideRow ? { guideRow: specNode.guideRow } : {}),
        ...(specNode.guideColumn ? { guideColumn: specNode.guideColumn } : {}),
        ...(specNode.zLevel ? { zLevel: specNode.zLevel } : {}),
      },
      ...(parentId
        ? { parentId, extent: "parent" as const }
        : {}),
      ...(isGroup
        ? {
            style: {
              width: child.width,
              height: child.height,
            },
          }
        : {}),
      zIndex: zLevelToIndex(specNode.zLevel),
    };

    result.push(rfNode);

    // Recurse into group children
    if (child.children && child.children.length > 0) {
      result.push(...flattenElkResult(child, specNodes, shapeMap, child.id));
    }
  }

  return result;
}

/**
 * Run ELK layout on a diagram spec and return React Flow nodes and edges.
 */
export async function layoutDiagram(
  diagram: SingleDiagram,
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[]
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Build lookup maps
  const shapeMap = shapePalette
    ? new Map(shapePalette.map((e) => [e.id, e]))
    : undefined;
  const sizeMap = sizePalette
    ? new Map(sizePalette.map((e) => [e.id, e]))
    : undefined;

  const elkGraph = buildElkGraph(diagram, sizeMap);
  const layouted = await elk.layout(elkGraph);

  const specNodes = new Map<string, DiagramNode>();
  for (const node of diagram.nodes) {
    specNodes.set(node.id, node);
  }

  const nodes = flattenElkResult(layouted, specNodes, shapeMap);
  const edges = specEdgesToFlowEdges(diagram.edges);

  return { nodes, edges };
}
