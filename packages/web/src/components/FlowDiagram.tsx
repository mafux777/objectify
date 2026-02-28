import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type EdgeTypes,
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
import { CustomEdge } from "./edges/CustomEdge.js";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.js";
import { CommandBar } from "./CommandBar.js";
import { Legend } from "./Legend.js";
import { flowToDiagram, flowToSpec } from "../lib/flow-to-spec.js";
import { GuideLines } from "./GuideLines.js";
import { LabelConnectors } from "./LabelConnectors.js";

let detachGuideCounter = 200;

const nodeTypes: NodeTypes = {
  colorBox: ColorBoxNode,
  groupNode: GroupNode,
  shapeNode: ShapeNode,
};

const edgeTypes: EdgeTypes = {
  customEdge: CustomEdge,
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
  const [showLegend, setShowLegend] = useState(true);
  const [hoveredGuideId, setHoveredGuideId] = useState<string | null>(null);
  const [focusedEdgeId, setFocusedEdgeId] = useState<string | null>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  const { saveSnapshot, undo, redo, canUndo, canRedo, clearHistory } =
    useUndoHistory(nodes, edges, guides, setNodes, setEdges, setGuides);

  // Auto-save state
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isInitialMount = useRef(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | null>(null);

  // Expose helpers for external tooling (e.g. Claude Code) to query/manipulate selection
  useEffect(() => {
    (window as Record<string, unknown>).__objectify = {
      selectByIds: (ids: string[]) => {
        setNodes((nds) =>
          nds.map((n) => ({ ...n, selected: ids.includes(n.id) }))
        );
      },
      getSelectedIds: () => nodes.filter((n) => n.selected).map((n) => n.id),
      getNodes: () => nodes,
    };
  });

  // Compute highlighted node IDs from hovered guide
  const guideHighlightedNodeIds = useMemo(() => {
    if (!hoveredGuideId) return new Set<string>();
    const ids = new Set<string>();
    for (const n of nodes) {
      const d = n.data as Record<string, unknown>;
      if (
        d?.guideRow === hoveredGuideId ||
        d?.guideColumn === hoveredGuideId ||
        d?.guideRowBottom === hoveredGuideId ||
        d?.guideColumnRight === hoveredGuideId
      ) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [hoveredGuideId, nodes]);

  // Compute highlight/dim sets from focused edge
  const edgeHighlight = useMemo(() => {
    if (!focusedEdgeId) return null;
    const edge = edges.find((e) => e.id === focusedEdgeId);
    if (!edge) return null;
    return { edgeId: focusedEdgeId, nodeIds: new Set([edge.source, edge.target]) };
  }, [focusedEdgeId, edges]);

  // Compute marker colors from live edges (supports context menu changes)
  const liveMarkerColors = useMemo(() => {
    const seen = new Set<string>();
    const result: { kind: string; color: string }[] = [];
    for (const e of edges) {
      const d = (e as Record<string, unknown>).data as Record<string, unknown> | undefined;
      const color = (e.style?.stroke as string) ?? "#555";
      for (const marker of [d?.sourceMarker, d?.targetMarker] as string[]) {
        if (marker === "ball" || marker === "socket") {
          const key = `${marker}-${color}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ kind: marker, color });
          }
        }
      }
    }
    // Also include original spec markers to handle initial render
    for (const e of diagram.edges) {
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
  }, [edges, diagram.edges]);

  // Edge click handler
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setFocusedEdgeId((prev) => (prev === edge.id ? null : edge.id));
    },
    []
  );

  // Clear edge focus on pane click
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setFocusedEdgeId(null);
  }, []);

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
            type: "customEdge",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#555",
              width: 16,
              height: 16,
            },
            data: { routingType: "straight" },
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

      // Shift+drag: reassign node to nearest existing guides
      if (event.shiftKey) {
        saveSnapshot();

        const horizontalGuides = guides.filter((g) => g.direction === "horizontal");
        const verticalGuides = guides.filter((g) => g.direction === "vertical");

        // Find nearest horizontal guide to node's Y-center
        let newRowId = rowId;
        if (horizontalGuides.length > 0) {
          let bestDist = Infinity;
          for (const g of horizontalGuides) {
            const dist = Math.abs(g.position * canvasHeight - centerY);
            if (dist < bestDist) {
              bestDist = dist;
              newRowId = g.id;
            }
          }
        }

        // Find nearest vertical guide to node's X-center
        let newColId = colId;
        if (verticalGuides.length > 0) {
          let bestDist = Infinity;
          for (const g of verticalGuides) {
            const dist = Math.abs(g.position * canvasWidth - centerX);
            if (dist < bestDist) {
              bestDist = dist;
              newColId = g.id;
            }
          }
        }

        // Snap node to the new guide intersection
        const newRowGuide = guides.find((g) => g.id === newRowId);
        const newColGuide = guides.find((g) => g.id === newColId);
        const snapY = newRowGuide ? newRowGuide.position * canvasHeight - nodeH / 2 : draggedNode.position.y;
        const snapX = newColGuide ? newColGuide.position * canvasWidth - nodeW / 2 : draggedNode.position.x;

        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  position: { x: snapX, y: snapY },
                  data: { ...n.data, guideRow: newRowId, guideColumn: newColId },
                }
              : n
          )
        );

        // Clean up orphan guides: if old guide has no remaining references, delete it
        const guideFields = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;
        const orphanCandidates = new Set<string>();
        if (rowId && rowId !== newRowId) orphanCandidates.add(rowId);
        if (colId && colId !== newColId) orphanCandidates.add(colId);

        if (orphanCandidates.size > 0) {
          // Check all OTHER nodes (excluding the dragged one) for references
          setGuides((gs) => {
            const referencedIds = new Set<string>();
            for (const n of nodes) {
              if (n.id === draggedNode.id) continue;
              const nd = n.data as Record<string, unknown>;
              for (const field of guideFields) {
                const val = nd?.[field] as string | undefined;
                if (val) referencedIds.add(val);
              }
            }
            return gs.filter((g) => !orphanCandidates.has(g.id) || referencedIds.has(g.id));
          });
        }

        return; // Skip normal guide-snapping logic
      }

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

        // Add new guides and remove old ones if they become orphaned
        const guideFields = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;
        const orphanCandidates = new Set<string>();
        if (rowId) orphanCandidates.add(rowId);
        if (colId) orphanCandidates.add(colId);

        // Check if any OTHER node still references the old guides
        const referencedByOthers = new Set<string>();
        for (const n of nodes) {
          if (n.id === draggedNode.id) continue;
          const nd = n.data as Record<string, unknown>;
          for (const field of guideFields) {
            const val = nd?.[field] as string | undefined;
            if (val) referencedByOthers.add(val);
          }
        }

        setGuides((gs) => [
          ...gs.filter((g) => !orphanCandidates.has(g.id) || referencedByOthers.has(g.id)),
          newRowGuide,
          newColGuide,
        ]);

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
    [guides, nodes, canvasWidth, canvasHeight, setGuides, setNodes, saveSnapshot]
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
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={true}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        {/* Custom SVG marker definitions for ball-and-socket connectors */}
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            {liveMarkerColors.map(({ kind, color }) => {
              const id = `marker-${kind}-${color.replace("#", "")}`;
              if (kind === "ball") {
                return (
                  <marker key={id} id={id} viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="8" markerHeight="8" orient="auto">
                    <circle cx="5" cy="5" r="4" fill={color} />
                  </marker>
                );
              }
              // socket
              return (
                <marker key={id} id={id} viewBox="0 0 12 12" refX="1" refY="6"
                  markerWidth="10" markerHeight="10" orient="auto">
                  <path d="M 10 1 A 5 5 0 0 0 10 11" fill="none"
                    stroke={color} strokeWidth="1.5" />
                </marker>
              );
            })}
          </defs>
        </svg>
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
            onGuideHover={setHoveredGuideId}
          />
        )}
        {diagram.legend && (
          <Legend legend={diagram.legend} visible={showLegend} />
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
          {diagram.legend && (
            <button
              className="load-btn"
              onClick={() => setShowLegend(!showLegend)}
              style={{ marginRight: 8 }}
            >
              {showLegend ? "Hide Legend" : "Show Legend"}
            </button>
          )}
          <button className="load-btn" onClick={handleExport}>
            Export JSON
          </button>
        </Panel>
        {/* Guide hover highlight */}
        {hoveredGuideId && guideHighlightedNodeIds.size > 0 && (
          <style>{`
            ${Array.from(guideHighlightedNodeIds)
              .map((id) => `.react-flow__node[data-id="${id}"]`)
              .join(",\n            ")} {
              box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.5) !important;
              z-index: 10 !important;
            }
          `}</style>
        )}

        {/* Edge focus highlight/dim */}
        {edgeHighlight && (
          <style>{`
            .react-flow__node { opacity: 0.25; transition: opacity 0.2s; }
            .react-flow__edge { opacity: 0.25; transition: opacity 0.2s; }
            ${Array.from(edgeHighlight.nodeIds)
              .map((id) => `.react-flow__node[data-id="${id}"]`)
              .join(",\n            ")} {
              opacity: 1 !important;
              box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.5) !important;
            }
            .react-flow__edge[data-id="${edgeHighlight.edgeId}"] {
              opacity: 1 !important;
            }
          `}</style>
        )}
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
