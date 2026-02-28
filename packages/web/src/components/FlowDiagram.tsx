import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type OnConnect,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  SingleDiagram,
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
  GuideLine,
} from "@objectify/schema";
import { useLayoutedElements } from "../hooks/useLayoutedElements.js";
import { ColorBoxNode } from "./nodes/ColorBoxNode.js";
import { GroupNode } from "./nodes/GroupNode.js";
import { ShapeNode } from "./nodes/ShapeNode.js";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.js";
import { CommandBar } from "./CommandBar.js";
import { flowToSpec } from "../lib/flow-to-spec.js";
import { GuideLines } from "./GuideLines.js";

const nodeTypes: NodeTypes = {
  colorBox: ColorBoxNode,
  groupNode: GroupNode,
  shapeNode: ShapeNode,
};

interface FlowDiagramProps {
  diagram: SingleDiagram;
  palette?: ColorPaletteEntry[];
  shapePalette?: ShapePaletteEntry[];
  sizePalette?: SizePaletteEntry[];
  semanticTypes?: SemanticTypeEntry[];
}

export function FlowDiagram({
  diagram,
  palette,
  shapePalette,
  sizePalette,
  semanticTypes,
}: FlowDiagramProps) {
  const { initialNodes, initialEdges, isLayouting } =
    useLayoutedElements(diagram, shapePalette, sizePalette);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>(diagram.guides ?? []);
  const [showGuides, setShowGuides] = useState(true);
  const flowRef = useRef<HTMLDivElement>(null);

  // Compute canvas dimensions for guide rendering
  const canvasWidth = 1200;
  const imgW = diagram.imageDimensions?.width ?? 1200;
  const imgH = diagram.imageDimensions?.height ?? 800;
  const canvasHeight = canvasWidth * (imgH / imgW);

  // Seed interactive state when layout completes or diagram changes
  useEffect(() => {
    if (!isLayouting && initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, isLayouting, setNodes, setEdges]);

  // Sync guides when diagram changes
  useEffect(() => {
    setGuides(diagram.guides ?? []);
  }, [diagram]);

  const onConnect: OnConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#555",
              width: 16,
              height: 16,
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  // Bidirectional snap: when a node is dragged, move its guide(s) and siblings
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      if (guides.length === 0) return;

      const data = draggedNode.data as Record<string, unknown>;
      const rowId = data?.guideRow as string | undefined;
      const colId = data?.guideColumn as string | undefined;
      if (!rowId && !colId) return;

      const nodeW = draggedNode.width ?? draggedNode.measured?.width ?? 160;
      const nodeH = draggedNode.height ?? draggedNode.measured?.height ?? 50;
      const centerX = draggedNode.position.x + nodeW / 2;
      const centerY = draggedNode.position.y + nodeH / 2;

      // Update guides to match the dragged node's new center
      setGuides((gs) =>
        gs.map((g) => {
          if (g.id === rowId) {
            return { ...g, position: Math.max(0, Math.min(1, centerY / canvasHeight)) };
          }
          if (g.id === colId) {
            return { ...g, position: Math.max(0, Math.min(1, centerX / canvasWidth)) };
          }
          return g;
        })
      );

      // Move sibling nodes on the same guides to align with the new position
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === draggedNode.id) return n; // skip the dragged node itself

          const nd = n.data as Record<string, unknown>;
          const nRow = nd?.guideRow as string | undefined;
          const nCol = nd?.guideColumn as string | undefined;
          const nW = n.width ?? n.measured?.width ?? 160;
          const nH = n.height ?? n.measured?.height ?? 50;

          let newX = n.position.x;
          let newY = n.position.y;

          // If sibling shares the same row, align Y center
          if (rowId && nRow === rowId) {
            newY = centerY - nH / 2;
          }
          // If sibling shares the same column, align X center
          if (colId && nCol === colId) {
            newX = centerX - nW / 2;
          }

          if (newX !== n.position.x || newY !== n.position.y) {
            return { ...n, position: { x: newX, y: newY } };
          }
          return n;
        })
      );
    },
    [guides, canvasWidth, canvasHeight, setGuides, setNodes]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const bounds = flowRef.current?.getBoundingClientRect();
      setContextMenu({
        type: "node",
        nodeId: node.id,
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0),
      });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      const bounds = flowRef.current?.getBoundingClientRect();
      setContextMenu({
        type: "edge",
        edgeId: edge.id,
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0),
      });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const bounds = flowRef.current?.getBoundingClientRect();
      setContextMenu({
        type: "pane",
        x: (event as MouseEvent).clientX - (bounds?.left ?? 0),
        y: (event as MouseEvent).clientY - (bounds?.top ?? 0),
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleExport = useCallback(() => {
    const spec = flowToSpec(nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides);
    const json = JSON.stringify(spec, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagram.id}-spec.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides]);

  if (isLayouting) {
    return <div className="loading-spinner">Computing layout...</div>;
  }

  return (
    <div ref={flowRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={closeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={true}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#e8e8e8" />
        <Controls />
        <MiniMap
          nodeStrokeWidth={2}
          pannable
          zoomable
          style={{ border: "1px solid #e0e0e0" }}
        />
        {guides.length > 0 && (
          <GuideLines
            guides={guides}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            visible={showGuides}
            setGuides={setGuides}
            setNodes={setNodes}
            nodes={nodes}
          />
        )}
        <Panel position="top-right">
          {guides.length > 0 && (
            <button
              className="load-btn"
              onClick={() => setShowGuides(!showGuides)}
              style={{ marginRight: 8 }}
            >
              {showGuides ? "Hide Guides" : "Show Guides"}
            </button>
          )}
          <button className="load-btn" onClick={handleExport}>
            Export JSON
          </button>
        </Panel>
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onClose={closeContextMenu}
        />
      )}

      <CommandBar
        nodes={nodes}
        edges={edges}
        setNodes={setNodes}
        setEdges={setEdges}
        guides={guides}
        setGuides={setGuides}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
      />
    </div>
  );
}
