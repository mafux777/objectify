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
import { toPng } from "html-to-image";
import { flowToDiagram, flowToSpec } from "../lib/flow-to-spec.js";
import { refineDiagramWithLLM } from "../lib/llm-refine.js";
import { validateChatInput } from "../lib/llm-validate.js";
import { type TokenUsage, addTokenUsage } from "../lib/llm-shared.js";
import { useDocuments } from "../lib/documents/index.js";
import { spatialLayoutDiagram } from "../lib/spatial-layout.js";
import { guideLayoutDiagram } from "../lib/guide-layout.js";
import { GuideLines } from "./GuideLines.js";
import { LabelConnectors } from "./LabelConnectors.js";
import { GuidesContext } from "../lib/guides-context.js";
import { ForceLayoutPanel } from "./ForceLayoutPanel.js";

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
  documentId: string;
  palette?: ColorPaletteEntry[];
  shapePalette?: ShapePaletteEntry[];
  sizePalette?: SizePaletteEntry[];
  semanticTypes?: SemanticTypeEntry[];
}

export function FlowDiagram({
  diagram,
  spec,
  activeTab,
  documentId,
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
  const [showForcePanel, setShowForcePanel] = useState(false);
  const [hoveredGuideId, setHoveredGuideId] = useState<string | null>(null);
  const [focusedEdgeId, setFocusedEdgeId] = useState<string | null>(null);
  const [isLLMLoading, setIsLLMLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSummary, setChatSummary] = useState<string | null>(null);
  const [chatProgress, setChatProgress] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const { dispatch: docDispatch, db } = useDocuments();

  const { saveSnapshot, undo, redo, canUndo, canRedo, clearHistory } =
    useUndoHistory(nodes, edges, guides, setNodes, setEdges, setGuides);

  // Auto-save state
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isInitialMount = useRef(true);
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | null>(null);

  // Ref to hold the latest spec (kept in sync after LLM refinements).
  // Auto-save uses this instead of the prop so it picks up palette/size changes.
  const specRef = useRef(spec);
  specRef.current = spec;

  // When we dispatch UPDATE_SPEC after LLM refinement, the diagram prop will change,
  // which would trigger the seed effect and re-layout. This flag skips one seed cycle.
  const skipSeedRef = useRef(false);

  // --- Per-tab position cache ---
  // When the user drags nodes and then switches tabs, the seed effect would overwrite
  // local positions with a fresh layout from the spec.  We cache each tab's live
  // nodes/edges/guides on switch-away so we can restore them on switch-back.
  const tabCacheRef = useRef<
    Map<number, { nodes: Node[]; edges: Edge[]; guides: GuideLine[] }>
  >(new Map());
  const prevActiveTabRef = useRef(activeTab);
  const prevDocumentIdRef = useRef(documentId);

  // Detect tab switch during render (before effects) so we capture the OLD state
  if (prevActiveTabRef.current !== activeTab) {
    tabCacheRef.current.set(prevActiveTabRef.current, {
      nodes,
      edges,
      guides,
    });
    prevActiveTabRef.current = activeTab;
    // Clear any stale skipSeedRef from the previous tab's cache restore.
    // It must not leak into the new tab's seed cycle.
    skipSeedRef.current = false;
  }

  // Clear the cache when the document changes (tabs are different)
  if (prevDocumentIdRef.current !== documentId) {
    tabCacheRef.current.clear();
    prevDocumentIdRef.current = documentId;
  }

  // Expose helpers for external tooling (e.g. Claude Code) to query/manipulate selection
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__objectify = {
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

  // Provide guide positions to edge components via context
  const guidesCtxValue = useMemo(
    () => ({ guides, canvasWidth, canvasHeight }),
    [guides, canvasWidth, canvasHeight],
  );

  // Seed interactive state when layout completes or diagram changes.
  // If we have a cached snapshot for this tab (from a prior switch-away), restore
  // that instead of the freshly-computed layout so dragged positions survive.
  useEffect(() => {
    if (skipSeedRef.current) {
      skipSeedRef.current = false;
      return;
    }
    if (!isLayouting && initialNodes.length > 0) {
      const cached = tabCacheRef.current.get(activeTab);
      if (cached) {
        setNodes(cached.nodes);
        setEdges(cached.edges);
        setGuides(cached.guides);
        tabCacheRef.current.delete(activeTab); // one-shot restore
        // useLayoutedElements will finish and change initialNodes, triggering
        // this effect again.  Skip that next cycle so the cache isn't overwritten.
        skipSeedRef.current = true;
      } else {
        setNodes(initialNodes);
        setEdges(initialEdges);
        setGuides(diagram.guides ?? []);
      }
      clearHistory();
    }
    // Note: activeTab is intentionally NOT in deps – the effect should fire when
    // the *layout* finishes (initialNodes changes), not when the tab index changes.
    // The cache lookup reads activeTab at execution time, which is always current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges, isLayouting, setNodes, setEdges, clearHistory]);

  // Flush the outgoing tab's state to DB immediately on tab switch so that
  // dragged positions persist even if auto-save hasn't fired yet.
  const prevFlushTabRef = useRef(activeTab);
  useEffect(() => {
    const prevTab = prevFlushTabRef.current;
    prevFlushTabRef.current = activeTab;
    if (prevTab === activeTab) return;

    const cached = tabCacheRef.current.get(prevTab);
    if (!cached) return;

    // Serialise the outgoing tab's state and write to DB (fire-and-forget).
    const latestSpec = specRef.current;
    const prevDiagram = latestSpec.diagrams[prevTab];
    if (!prevDiagram) return;

    const updatedDiagram = flowToDiagram(cached.nodes, cached.edges, prevDiagram, cached.guides);
    const updatedSpec: DiagramSpec = {
      ...latestSpec,
      diagrams: latestSpec.diagrams.map((d, i) => (i === prevTab ? updatedDiagram : d)),
    };

    // Also update specRef so subsequent operations see the flushed state
    specRef.current = updatedSpec;

    const docId = documentIdRef.current;
    (async () => {
      try {
        clearTimeout(saveTimerRef.current);   // cancel any pending debounced save
        const existing = await db.getDocument(docId);
        if (existing) {
          await db.saveDocument({ ...existing, spec: updatedSpec, updatedAt: Date.now() });
        }
      } catch {
        /* best-effort */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reset isInitialMount and save status when diagram changes
  useEffect(() => {
    isInitialMount.current = true;
    setSaveStatus(null);
  }, [diagram.id]);

  // Debounced auto-save: watches nodes/edges/guides, writes to DB
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setSaveStatus("unsaved");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const latestSpec = specRef.current;
        const updatedDiagram = flowToDiagram(nodes, edges, diagram, guides);
        const updatedSpec: DiagramSpec = {
          ...latestSpec,
          diagrams: latestSpec.diagrams.map((d, i) => i === activeTab ? updatedDiagram : d),
        };
        const docId = documentIdRef.current;
        // Write to DB only — do NOT dispatch UPDATE_SPEC here.
        // Dispatching UPDATE_SPEC would update the library → change activeDocument →
        // re-render DiagramViewer → new diagram prop → re-layout → new initialNodes →
        // seed effect sets nodes → triggers auto-save again → infinite loop.
        const existing = await db.getDocument(docId);
        if (existing) {
          await db.saveDocument({ ...existing, spec: updatedSpec, updatedAt: Date.now() });
        }
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
    clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    try {
      const latestSpec = specRef.current;
      const updatedDiagram = flowToDiagram(nodes, edges, diagram, guides);
      const updatedSpec: DiagramSpec = {
        ...latestSpec,
        diagrams: latestSpec.diagrams.map((d, i) => i === activeTab ? updatedDiagram : d),
      };
      const existing = await db.getDocument(documentId);
      if (existing) {
        await db.saveDocument({ ...existing, spec: updatedSpec, updatedAt: Date.now() });
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [documentId, nodes, edges, diagram, guides, activeTab, db]);

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
          position: centerY / canvasHeight,
          label: `${shortLabel} Row`,
        };

        // Create new column guide
        detachGuideCounter++;
        const newColId = `col-detach-${detachGuideCounter}`;
        const newColGuide: GuideLine = {
          id: newColId,
          index: guides.filter((g) => g.direction === "vertical").length,
          direction: "vertical",
          position: centerX / canvasWidth,
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
            return { ...g, position: centerY / canvasHeight };
          }
          if (g.id === colId) {
            return { ...g, position: centerX / canvasWidth };
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

  const handleChat = useCallback(
    async (message: string) => {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string;
      if (!apiKey) {
        setChatError("No API key configured (VITE_OPENAI_API_KEY)");
        return;
      }
      setIsLLMLoading(true);
      setChatError(null);
      setChatSummary(null);
      setChatProgress(null);
      try {
        // Step 1: Validate input with cheap model
        const validation = await validateChatInput(message, apiKey);

        if (validation.classification === "complaint") {
          await db.logFeedback({
            userId: db.getUserId(),
            message,
            category: "complaint",
          });
          setChatSummary("Thanks for the feedback — your message has been logged and our team will review it.");
          return;
        }

        if (validation.classification === "invalid") {
          setChatError(
            `That doesn't look like a diagram editing request. Try something like "add a node" or "change the color of Auth0". (${validation.reason})`,
          );
          return;
        }

        // Step 2: Valid request — proceed to expensive model
        const currentSpec = flowToSpec(
          nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides,
        );
        const { spec: newSpec, summary, usage } = await refineDiagramWithLLM(
          currentSpec,
          message,
          apiKey,
          undefined,
          ({ attempt, maxAttempts, phase }) => {
            setChatProgress(
              phase === "calling"
                ? null
                : `Refining (attempt ${attempt}/${maxAttempts})...`,
            );
          },
        );
        if (usage) {
          setTokenUsage((prev) => addTokenUsage(prev, usage));
        }
        const newDiagram = newSpec.diagrams[0];
        if (!newDiagram) throw new Error("LLM returned empty diagrams array");

        // Layout the new diagram to get React Flow nodes/edges
        const hasSpatialData =
          newDiagram.layoutMode === "spatial" &&
          newDiagram.nodes.some((n) => n.spatial);
        const hasGuideData =
          (newDiagram.guides?.length ?? 0) > 0 &&
          newDiagram.nodes.some((n) => n.guideRow || n.guideColumn);

        let layoutResult: { nodes: Node[]; edges: Edge[] };
        if (hasSpatialData) {
          layoutResult = spatialLayoutDiagram(newDiagram, undefined, newSpec.shapePalette);
        } else if (hasGuideData) {
          layoutResult = guideLayoutDiagram(newDiagram, newSpec.shapePalette, newSpec.sizePalette);
        } else {
          layoutResult = spatialLayoutDiagram(newDiagram, undefined, newSpec.shapePalette);
        }

        saveSnapshot();
        setNodes(layoutResult.nodes);
        setEdges(layoutResult.edges);
        if (newDiagram.guides) setGuides(newDiagram.guides);

        // Sync the new spec to the documents context so subsequent
        // refinements (and auto-saves) use the updated palettes/sizes/etc.
        // skipSeedRef prevents the diagram prop change from re-triggering layout.
        specRef.current = newSpec;
        skipSeedRef.current = true;
        docDispatch({ type: "UPDATE_SPEC", id: documentIdRef.current, spec: newSpec });

        setChatSummary(summary);
      } catch (err) {
        console.error("LLM refinement failed:", err);
        setChatError(err instanceof Error ? err.message : "LLM request failed");
      } finally {
        setIsLLMLoading(false);
        setChatProgress(null);
      }
    },
    [nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides, saveSnapshot, setNodes, setEdges, setGuides],
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

  const handleExportPng = useCallback(async () => {
    const el = flowRef.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${diagram.id}.png`;
      a.click();
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  }, [diagram.id]);

  // Listen for external PNG export requests (e.g. from TabBar context menu)
  useEffect(() => {
    const handler = () => { handleExportPng(); };
    window.addEventListener("objectify:export-png", handler);
    return () => window.removeEventListener("objectify:export-png", handler);
  }, [handleExportPng]);

  if (isLayouting) {
    return <div className="loading-spinner">Computing layout...</div>;
  }

  return (
    <div ref={flowRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <GuidesContext.Provider value={guidesCtxValue}>
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
          <button
            className={`load-btn${showForcePanel ? " load-btn--active" : ""}`}
            onClick={() => setShowForcePanel(!showForcePanel)}
            style={{ marginRight: 8 }}
            title="Physics-based layout: objects repel, connectors attract"
          >
            Magnetic Layout
          </button>
          <button className="load-btn" onClick={handleExport} style={{ marginRight: 4 }}>
            Export JSON
          </button>
          <button className="load-btn" onClick={handleExportPng}>
            Export PNG
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
      </GuidesContext.Provider>

      {showForcePanel && (
        <ForceLayoutPanel
          nodes={nodes}
          edges={edges}
          guides={guides}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          setNodes={setNodes}
          setGuides={setGuides}
          saveSnapshot={saveSnapshot}
          onClose={() => setShowForcePanel(false)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onClose={closeContextMenu}
          saveSnapshot={saveSnapshot}
          diagram={diagram}
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
        onChat={handleChat}
        isLoading={isLLMLoading}
        chatError={chatError}
        chatSummary={chatSummary}
        chatProgress={chatProgress}
        tokenUsage={tokenUsage}
      />
    </div>
  );
}
