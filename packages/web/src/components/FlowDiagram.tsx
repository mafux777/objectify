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
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  DiagramSpec,
  SingleDiagram,
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
  GuideLine,
} from "@objectify/schema";
import { useLayoutedElements } from "../hooks/useLayoutedElements.js";
import { useUndoHistory } from "../hooks/useUndoHistory.js";
import { ColorBoxNode } from "./nodes/ColorBoxNode.js";
import { GroupNode } from "./nodes/GroupNode.js";
import { ShapeNode } from "./nodes/ShapeNode.js";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.js";
import { CommandBar } from "./CommandBar.js";
import { flowToDiagram, flowToSpec } from "../lib/flow-to-spec.js";
import { GuideLines } from "./GuideLines.js";
import { LabelConnectors } from "./LabelConnectors.js";

let detachGuideCounter = 200;

const nodeTypes: NodeTypes = {
  colorBox: ColorBoxNode,
  groupNode: GroupNode,
  shapeNode: ShapeNode,
};

interface FlowDiagramProps {
  diagram: SingleDiagram;
  spec: DiagramSpec;
  activeTab: number;
  specFilename: string | null;
  palette?: ColorPaletteEntry[];
  shapePalette?: ShapePaletteEntry[];
  sizePalette?: SizePaletteEntry[];
  semanticTypes?: SemanticTypeEntry[];
}

export function FlowDiagram({
  diagram,
  spec,
  activeTab,
  specFilename,
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
  const [showLabelConnectors, setShowLabelConnectors] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  const { saveSnapshot, undo, redo, canUndo, canRedo, clearHistory } =
    useUndoHistory(nodes, edges, guides, setNodes, setEdges, setGuides);

  // Auto-save state
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isInitialMount = useRef(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | null>(null);

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
      clearHistory();
    }
  }, [initialNodes, initialEdges, isLayouting, setNodes, setEdges, clearHistory]);

  // Sync guides when diagram changes
  useEffect(() => {
    setGuides(diagram.guides ?? []);
  }, [diagram]);

  // Reset isInitialMount and save status when diagram changes
  useEffect(() => {
    isInitialMount.current = true;
    setSaveStatus(null);
  }, [diagram.id]);

  // Debounced auto-save: watches nodes/edges/guides, writes back to server
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!specFilename) return;

    setSaveStatus("unsaved");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const updatedDiagram = flowToDiagram(nodes, edges, diagram, guides);
        const updatedSpec: DiagramSpec = {
          ...spec,
          diagrams: spec.diagrams.map((d, i) => i === activeTab ? updatedDiagram : d),
        };
        await fetch(`/api/specs/${specFilename}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedSpec, null, 2),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1000);

    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, guides]);

  // Manual save helper (used by Ctrl+S)
  const saveNow = useCallback(async () => {
    if (!specFilename) return;
    clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    try {
      const updatedDiagram = flowToDiagram(nodes, edges, diagram, guides);
      const updatedSpec: DiagramSpec = {
        ...spec,
        diagrams: spec.diagrams.map((d, i) => i === activeTab ? updatedDiagram : d),
      };
      await fetch(`/api/specs/${specFilename}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSpec, null, 2),
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [specFilename, nodes, edges, diagram, guides, spec, activeTab]);

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo, Ctrl+S = save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, saveNow]);

  // Wrap onNodesChange to capture snapshot before deletions (Delete key)
  const wrappedOnNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      if (changes.some((c) => c.type === "remove")) {
        saveSnapshot();
      }
      onNodesChange(changes);
    },
    [onNodesChange, saveSnapshot]
  );

  // Wrap onEdgesChange to capture snapshot before deletions
  const wrappedOnEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((c) => c.type === "remove")) {
        saveSnapshot();
      }
      onEdgesChange(changes);
    },
    [onEdgesChange, saveSnapshot]
  );

  // Save snapshot at the start of every node drag
  const onNodeDragStart = useCallback(() => {
    saveSnapshot();
  }, [saveSnapshot]);

  const onConnect: OnConnect = useCallback(
    (params) => {
      saveSnapshot();
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
      );
    },
    [setEdges, saveSnapshot]
  );

  // Bidirectional snap: when a node is dragged, move its guide(s) and siblings
  // Alt+drag: detach node from shared guides by creating new personal guides
  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, draggedNode: Node) => {
      const data = draggedNode.data as Record<string, unknown>;
      const rowId = data?.guideRow as string | undefined;
      const colId = data?.guideColumn as string | undefined;

      const nodeW = draggedNode.width ?? draggedNode.measured?.width ?? 160;
      const nodeH = draggedNode.height ?? draggedNode.measured?.height ?? 50;
      const centerX = draggedNode.position.x + nodeW / 2;
      const centerY = draggedNode.position.y + nodeH / 2;

      // Alt+drag: detach from shared guides and create new personal guides
      if (event.altKey) {
        // Derive a short label from the node's label (first line, spaces instead of newlines)
        const rawLabel = (data?.label as string) ?? "Node";
        const shortLabel = rawLabel.split("\n").join(" ").trim();

        // Create new row guide
        detachGuideCounter++;
        const newRowId = `row-detach-${detachGuideCounter}`;
        const newRowGuide: GuideLine = {
          id: newRowId,
          index: guides.filter((g) => g.direction === "horizontal").length,
          direction: "horizontal",
          position: Math.max(0, Math.min(1, centerY / canvasHeight)),
          label: `${shortLabel} Row`,
        };

        // Create new column guide
        detachGuideCounter++;
        const newColId = `col-detach-${detachGuideCounter}`;
        const newColGuide: GuideLine = {
          id: newColId,
          index: guides.filter((g) => g.direction === "vertical").length,
          direction: "vertical",
          position: Math.max(0, Math.min(1, centerX / canvasWidth)),
          label: `${shortLabel} Col`,
        };

        // Add the new guides
        setGuides((gs) => [...gs, newRowGuide, newColGuide]);

        // Reassign the dragged node to the new guides
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  data: { ...n.data, guideRow: newRowId, guideColumn: newColId },
                }
              : n
          )
        );

        return; // Skip normal guide-snapping logic
      }

      // Normal drag behavior: move guides and siblings
      if (guides.length === 0) return;
      if (!rowId && !colId) return;

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
        onNodesChange={wrappedOnNodesChange}
        onEdgesChange={wrappedOnEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
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
            saveSnapshot={saveSnapshot}
          />
        )}
        <LabelConnectors
          nodes={nodes}
          edges={edges}
          visible={showLabelConnectors}
        />
        <Panel position="top-right">
          {saveStatus && (
            <span style={{ opacity: 0.5, fontSize: 12, marginRight: 8 }}>
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Unsaved"}
            </span>
          )}
          <button
            className="load-btn"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{ marginRight: 4, opacity: canUndo ? 1 : 0.4 }}
          >
            Undo
          </button>
          <button
            className="load-btn"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            style={{ marginRight: 8, opacity: canRedo ? 1 : 0.4 }}
          >
            Redo
          </button>
          <button
            className="load-btn"
            onClick={() => setShowLabelConnectors(!showLabelConnectors)}
            style={{ marginRight: 8 }}
          >
            {showLabelConnectors ? "Hide Labels" : "Show Labels"}
          </button>
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
          saveSnapshot={saveSnapshot}
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
        saveSnapshot={saveSnapshot}
      />
    </div>
  );
}
