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
  DiagramNode,
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
import qrcode from "qrcode-generator";
import { flowToDiagram, flowToSpec } from "../lib/flow-to-spec.js";
import { refineDiagramWithLLM } from "../lib/llm-refine.js";
import { validateChatInput } from "../lib/llm-validate.js";
import { type TokenUsage, addTokenUsage } from "../lib/llm-shared.js";
import type { ChatMessage } from "../lib/db/types.js";
import { useDocuments } from "../lib/documents/index.js";
import { ShareModal } from "./ShareModal.js";
import { spatialLayoutDiagram } from "../lib/spatial-layout.js";
import { guideLayoutDiagram, resolveGuideOverlaps } from "../lib/guide-layout.js";
import { GuideLines } from "./GuideLines.js";
import { LabelConnectors } from "./LabelConnectors.js";
import { GuidesContext } from "../lib/guides-context.js";
import { ForceLayoutPanel } from "./ForceLayoutPanel.js";
import { HelpModal } from "./HelpModal.js";
import { useAuth } from "../lib/auth-context.js";
import { useClockFaceDrag } from "../hooks/useClockFaceDrag.js";
import { ClockFaceDragContext } from "../lib/clock-face-context.js";
import { ClockFaceOverlay } from "./ClockFaceOverlay.js";
import {
  RESIZE_END_EVENT,
  type ResizeEndDetail,
} from "../lib/resize-event.js";
import {
  updateSizePaletteEntry,
  addSizePaletteEntry,
} from "../lib/size-palette-api.js";
import { getParentOffset } from "../lib/parent-offset.js";

let detachGuideCounter = 200;

const GUIDE_MERGE_THRESHOLD = 0.02; // 2% normalized distance
const GUIDE_FIELDS = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;

/** Find guide pairs that should be merged (within threshold). Returns map: removedId → absorberId */
function findGuideMerges(guides: GuideLine[]): Map<string, string> {
  const merges = new Map<string, string>();
  const removed = new Set<string>();

  for (const direction of ["horizontal", "vertical"] as const) {
    const sameDir = guides
      .filter((g) => g.direction === direction)
      .sort((a, b) => a.index - b.index);

    for (let i = 0; i < sameDir.length; i++) {
      if (removed.has(sameDir[i].id)) continue;
      for (let j = i + 1; j < sameDir.length; j++) {
        if (removed.has(sameDir[j].id)) continue;
        if (Math.abs(sameDir[i].position - sameDir[j].position) <= GUIDE_MERGE_THRESHOLD) {
          // Absorber = lower index (the one that was there before)
          merges.set(sameDir[j].id, sameDir[i].id);
          removed.add(sameDir[j].id);
        }
      }
    }
  }
  return merges;
}

/** Apply guide merges: reassign nodes, reposition, and remove merged guides */
function applyGuideMerges(
  merges: Map<string, string>,
  guides: GuideLine[],
  canvasWidth: number,
  canvasHeight: number,
  setGuides: React.Dispatch<React.SetStateAction<GuideLine[]>>,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
) {
  if (merges.size === 0) return;

  const guideMap = new Map(guides.map((g) => [g.id, g]));

  setNodes((nds) =>
    nds.map((n) => {
      const nd = n.data as Record<string, unknown>;
      let changed = false;
      const newData = { ...nd };
      let newPos = { ...n.position };

      for (const field of GUIDE_FIELDS) {
        const val = nd?.[field] as string | undefined;
        if (val && merges.has(val)) {
          const absorberId = merges.get(val)!;
          newData[field] = absorberId;
          changed = true;

          const absorber = guideMap.get(absorberId);
          if (absorber && (field === "guideRow" || field === "guideColumn")) {
            const nW = n.width ?? n.measured?.width ?? 160;
            const nH = n.height ?? n.measured?.height ?? 50;
            // Guide position is absolute; convert to parent-relative
            const parentOff = getParentOffset(n.parentId, nds);
            if (absorber.direction === "horizontal") {
              newPos = { ...newPos, y: absorber.position * canvasHeight - nH / 2 - parentOff.y };
            } else {
              newPos = { ...newPos, x: absorber.position * canvasWidth - nW / 2 - parentOff.x };
            }
          }
        }
      }

      return changed ? { ...n, data: newData, position: newPos } : n;
    })
  );

  setGuides((gs) => gs.filter((g) => !merges.has(g.id)));
}

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
  const { initialNodes, initialEdges, resolvedGuides: layoutGuides, isLayouting } =
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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const { dispatch: docDispatch, db } = useDocuments();
  const { isAdmin } = useAuth();

  const { saveSnapshot, undo, redo, canUndo, canRedo, clearHistory } =
    useUndoHistory(nodes, edges, guides, setNodes, setEdges, setGuides);

  const { dragState: clockFaceDragState, startDrag: clockFaceStartDrag } =
    useClockFaceDrag({ nodes, edges, setEdges, saveSnapshot, flowRef });

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

  // Refs for save-on-unmount (so cleanup always has current data)
  const nodesRef = useRef(nodes);   nodesRef.current = nodes;
  const edgesRef = useRef(edges);   edgesRef.current = edges;
  const guidesRef = useRef(guides); guidesRef.current = guides;
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;

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
        setGuides(layoutGuides ?? diagram.guides ?? []);
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

  // Save-on-unmount: when the component unmounts (document switch via key=),
  // flush any pending changes to DB immediately. Uses refs so the cleanup
  // always has the latest data regardless of when the effect was created.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) return;

      const tabIdx = activeTabRef.current;
      const latestSpec = specRef.current;
      const diag = latestSpec.diagrams[tabIdx];
      if (!diag) return;

      const updatedDiagram = flowToDiagram(currentNodes, edgesRef.current, diag, guidesRef.current);
      const updatedSpec: DiagramSpec = {
        ...latestSpec,
        diagrams: latestSpec.diagrams.map((d, i) => (i === tabIdx ? updatedDiagram : d)),
      };

      const docId = documentIdRef.current;

      // Update the in-memory document store so switching back loads the latest state.
      // Safe during unmount — no infinite loop risk since the component is going away.
      docDispatch({ type: "UPDATE_SPEC", id: docId, spec: updatedSpec });

      // Also persist to IndexedDB (fire-and-forget)
      (async () => {
        try {
          const existing = await db.getDocument(docId);
          if (existing) {
            await db.saveDocument({ ...existing, spec: updatedSpec, updatedAt: Date.now() });
          }
        } catch {
          /* best effort */
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // --- Semantic resize: update sizePalette on resize end ---
  // Counter for generating unique size IDs on Alt+resize
  const sizeIdCounterRef = useRef(0);

  // Track nodes that should show a resize-propagation highlight
  const [resizeHighlightIds, setResizeHighlightIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const REFERENCE_W = 1200;
    const imgW = diagram.imageDimensions?.width ?? 1200;
    const imgH = diagram.imageDimensions?.height ?? 800;
    const REFERENCE_H = REFERENCE_W * (imgH / imgW);

    /** Re-center a React Flow node on its guide intersection. */
    const recenterOnGuides = (
      n: Node,
      w: number,
      h: number,
      guideMap: Map<string, GuideLine>,
    ): Node => {
      const d = n.data as Record<string, unknown>;
      const rowGuide = d.guideRow ? guideMap.get(d.guideRow as string) : undefined;
      const colGuide = d.guideColumn ? guideMap.get(d.guideColumn as string) : undefined;
      if (!rowGuide || !colGuide) {
        // No guide assignment — just update dimensions
        return {
          ...n,
          width: w,
          height: h,
          style: { ...(n.style ?? {}), width: w, height: h },
        };
      }
      const centerX = colGuide.position * REFERENCE_W;
      const centerY = rowGuide.position * REFERENCE_H;
      return {
        ...n,
        position: { x: centerX - w / 2, y: centerY - h / 2 },
        width: w,
        height: h,
        style: { ...(n.style ?? {}), width: w, height: h },
      };
    };

    /**
     * After a size class changes, check whether node bounding boxes now overlap
     * and push guides apart if needed. Returns resolved guides and a flag.
     */
    const resolveAndApplyGuides = (
      updatedSpec: DiagramSpec,
      tabIdx: number,
    ): { guideMap: Map<string, GuideLine>; resolved: GuideLine[]; changed: boolean } => {
      const diag = updatedSpec.diagrams[tabIdx];
      const currentGuides = diag?.guides ?? [];
      if (currentGuides.length === 0) {
        return { guideMap: new Map(), resolved: currentGuides, changed: false };
      }

      const updatedSizeMap = new Map(
        (updatedSpec.sizePalette ?? []).map((e) => [e.id, e]),
      );
      const getNodeSizeFn = (node: DiagramNode) => {
        const entry = node.sizeId ? updatedSizeMap.get(node.sizeId) : undefined;
        return {
          w: entry ? Math.round(entry.width * REFERENCE_W) : 160,
          h: entry ? Math.round(entry.height * REFERENCE_H) : 50,
        };
      };

      const resolved = resolveGuideOverlaps(
        currentGuides,
        diag.nodes,
        getNodeSizeFn,
        REFERENCE_W,
        REFERENCE_H,
      );

      const changed = resolved.some(
        (g, i) => g.position !== currentGuides[i]?.position,
      );

      return {
        guideMap: new Map(resolved.map((g) => [g.id, g])),
        resolved,
        changed,
      };
    };

    const handler = (e: Event) => {
      const { nodeId, sizeId, width, height, altKey } =
        (e as CustomEvent<ResizeEndDetail>).detail;

      // Normalize pixel dimensions to 0-1 fractions
      const normW = Math.max(0.01, Math.min(1, width / REFERENCE_W));
      const normH = Math.max(0.01, Math.min(1, height / REFERENCE_H));
      const newPixelW = Math.round(normW * REFERENCE_W);
      const newPixelH = Math.round(normH * REFERENCE_H);

      saveSnapshot();

      if (altKey || !sizeId) {
        // --- Alt+resize (or node has no sizeId): create a new size class ---
        sizeIdCounterRef.current++;
        const newSizeId = `custom-size-${Date.now()}-${sizeIdCounterRef.current}`;
        const newEntry = {
          id: newSizeId,
          width: normW,
          height: normH,
          name: `Custom Size ${sizeIdCounterRef.current}`,
        };

        const updatedSpec = addSizePaletteEntry(specRef.current, newEntry);

        // Resolve guides after adding the new size (single node, unlikely to
        // cause overlaps, but be thorough)
        const { guideMap } = resolveAndApplyGuides(updatedSpec, activeTab);

        specRef.current = updatedSpec;

        // Assign the new sizeId and re-center this node on its guides
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? recenterOnGuides(
                  { ...n, data: { ...n.data, sizeId: newSizeId } },
                  newPixelW,
                  newPixelH,
                  guideMap,
                )
              : n
          )
        );

        // Persist the updated spec
        skipSeedRef.current = true;
        docDispatch({
          type: "UPDATE_SPEC",
          id: documentIdRef.current,
          spec: updatedSpec,
        });
      } else {
        // --- Normal resize: update the existing sizePalette entry ---
        let updatedSpec = updateSizePaletteEntry(specRef.current, sizeId, {
          width: normW,
          height: normH,
        });

        // Resolve guide overlaps with the new (potentially larger) sizes
        const { guideMap, resolved, changed } = resolveAndApplyGuides(
          updatedSpec,
          activeTab,
        );

        // If guides moved, update them in the spec
        if (changed) {
          updatedSpec = {
            ...updatedSpec,
            diagrams: updatedSpec.diagrams.map((d, i) =>
              i === activeTab ? { ...d, guides: resolved } : d
            ),
          };
          setGuides(resolved);
        }

        specRef.current = updatedSpec;

        // Re-center all nodes sharing this sizeId on their guide intersections.
        // If guides shifted, also re-center ALL guide-positioned nodes.
        const siblingIds: string[] = [];
        setNodes((nds) =>
          nds.map((n) => {
            const d = n.data as Record<string, unknown>;

            if (d?.sizeId === sizeId) {
              // This node's size class changed — update dimensions + re-center
              if (n.id !== nodeId) siblingIds.push(n.id);
              return recenterOnGuides(n, newPixelW, newPixelH, guideMap);
            }

            if (changed && d?.guideRow && d?.guideColumn) {
              // Guides shifted — re-center this node at its (unchanged) size
              const nodeW = n.width ?? 160;
              const nodeH = n.height ?? 50;
              return recenterOnGuides(n, nodeW, nodeH, guideMap);
            }

            return n;
          })
        );

        // Brief visual highlight on siblings
        if (siblingIds.length > 0) {
          setResizeHighlightIds(new Set(siblingIds));
          setTimeout(() => setResizeHighlightIds(new Set()), 800);
        }

        // Persist the updated spec
        skipSeedRef.current = true;
        docDispatch({
          type: "UPDATE_SPEC",
          id: documentIdRef.current,
          spec: updatedSpec,
        });
      }
    };

    window.addEventListener(RESIZE_END_EVENT, handler);
    return () => window.removeEventListener(RESIZE_END_EVENT, handler);
  }, [diagram.imageDimensions, activeTab, saveSnapshot, setNodes, setGuides, docDispatch]);

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

      // Compute absolute center (guide positions are in absolute canvas coordinates)
      const parentOffset = getParentOffset(draggedNode.parentId, nodes);
      let centerX = draggedNode.position.x + parentOffset.x + nodeW / 2;
      let centerY = draggedNode.position.y + parentOffset.y + nodeH / 2;

      // Alt+drag on grouped node: reparent to another group
      if (event.altKey && draggedNode.parentId) {
        saveSnapshot();

        const oldParentId = draggedNode.parentId;
        const oldParent = nodes.find((n) => n.id === oldParentId);

        // Use the MOUSE position to determine target group, not the node position
        // (React Flow constrains child nodes within parent bounds during drag,
        //  so the node position may be clamped at the parent edge)
        // Extract viewport transform from the DOM
        const vpEl = flowRef.current?.querySelector(".react-flow__viewport") as HTMLElement;
        const flowEl = flowRef.current?.querySelector(".react-flow") as HTMLElement;
        let mouseCanvasX = centerX;
        let mouseCanvasY = centerY;
        if (vpEl && flowEl) {
          const m = new DOMMatrix(getComputedStyle(vpEl).transform);
          const fr = flowEl.getBoundingClientRect();
          mouseCanvasX = (event.clientX - fr.left - m.e) / m.a;
          mouseCanvasY = (event.clientY - fr.top - m.f) / m.d;
        }

        // Also compute absolute node position for the actual move
        let absX = draggedNode.position.x;
        let absY = draggedNode.position.y;
        if (oldParent) {
          absX += oldParent.position.x;
          absY += oldParent.position.y;
        }

        // Use mouse position as the drop target detection point
        const absCenterX = mouseCanvasX;
        const absCenterY = mouseCanvasY;

        // Build absolute position map for all groups (positions are parent-relative in React Flow)
        const absPos = new Map<string, { x: number; y: number }>();
        // Process in order: groups without parents first, then children
        const groupNodes = nodes.filter((n) => n.type === "groupNode");
        for (const g of groupNodes) {
          let gx = g.position.x;
          let gy = g.position.y;
          if (g.parentId) {
            const pPos = absPos.get(g.parentId);
            if (pPos) { gx += pPos.x; gy += pPos.y; }
          }
          absPos.set(g.id, { x: gx, y: gy });
        }

        // Find the smallest group that contains the drop point (excluding old parent)
        const targetGroup = groupNodes
          .filter((n) => n.id !== draggedNode.id && n.id !== oldParentId)
          .filter((n) => {
            const pos = absPos.get(n.id);
            if (!pos) return false;
            const gw = n.width ?? n.measured?.width ?? 300;
            const gh = n.height ?? n.measured?.height ?? 200;
            return absCenterX >= pos.x && absCenterX <= pos.x + gw
                && absCenterY >= pos.y && absCenterY <= pos.y + gh;
          })
          .sort((a, b) => {
            // Prefer the smallest (most specific) group
            const aArea = (a.width ?? 300) * (a.height ?? 200);
            const bArea = (b.width ?? 300) * (b.height ?? 200);
            return aArea - bArea;
          })[0] ?? null;

        const newParentId = targetGroup?.id ?? null;

        // Place the node centered at the mouse drop point
        let newX = mouseCanvasX - nodeW / 2;
        let newY = mouseCanvasY - nodeH / 2;
        if (targetGroup) {
          const tPos = absPos.get(targetGroup.id);
          if (tPos) {
            newX = mouseCanvasX - nodeW / 2 - tPos.x;
            newY = mouseCanvasY - nodeH / 2 - tPos.y;
          }
        }

        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  parentId: newParentId ?? undefined,
                  position: { x: newX, y: newY },
                }
              : n
          )
        );

        // Show toast message
        if (targetGroup && targetGroup.id !== oldParentId) {
          const nodeLabel = (data?.label as string) ?? draggedNode.id;
          const groupLabel = (targetGroup.data as Record<string, unknown>)?.label as string ?? targetGroup.id;
          setDragMessage(`${nodeLabel} is now part of ${groupLabel}`);
          setTimeout(() => setDragMessage(null), 4000);
        } else if (!targetGroup) {
          const nodeLabel = (data?.label as string) ?? draggedNode.id;
          setDragMessage(`${nodeLabel} is now top-level`);
          setTimeout(() => setDragMessage(null), 4000);
        }

        // Update centerX/centerY for any subsequent guide logic
        centerX = newX + nodeW / 2;
        centerY = newY + nodeH / 2;

        return; // Skip other drag logic
      }

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

        // Snap node to the new guide intersection (guide pos is absolute, convert to parent-relative)
        const newRowGuide = guides.find((g) => g.id === newRowId);
        const newColGuide = guides.find((g) => g.id === newColId);
        const snapY = newRowGuide ? newRowGuide.position * canvasHeight - nodeH / 2 - parentOffset.y : draggedNode.position.y;
        const snapX = newColGuide ? newColGuide.position * canvasWidth - nodeW / 2 - parentOffset.x : draggedNode.position.x;

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

        // Consolidate any guides that ended up too close after detachment.
        // We build the new guides list to check merges against.
        const guideFields2 = ["guideRow", "guideColumn", "guideRowBottom", "guideColumnRight"] as const;
        const referencedByOthers2 = new Set<string>();
        for (const n of nodes) {
          if (n.id === draggedNode.id) continue;
          const nd2 = n.data as Record<string, unknown>;
          for (const f of guideFields2) {
            const v = nd2?.[f] as string | undefined;
            if (v) referencedByOthers2.add(v);
          }
        }
        const newGuideList = [
          ...guides.filter((g) => !orphanCandidates.has(g.id) || referencedByOthers2.has(g.id)),
          newRowGuide,
          newColGuide,
        ];
        const merges = findGuideMerges(newGuideList);
        if (merges.size > 0) {
          applyGuideMerges(merges, newGuideList, canvasWidth, canvasHeight, setGuides, setNodes);
        }

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
      // centerX/centerY are absolute; convert to each sibling's parent-relative coords
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

          // If sibling shares the same row, align Y center (absolute → parent-relative)
          if (rowId && nRow === rowId) {
            const siblingParentOff = getParentOffset(n.parentId, nds);
            newY = centerY - nH / 2 - siblingParentOff.y;
          }
          // If sibling shares the same column, align X center (absolute → parent-relative)
          if (colId && nCol === colId) {
            const siblingParentOff = getParentOffset(n.parentId, nds);
            newX = centerX - nW / 2 - siblingParentOff.x;
          }

          if (newX !== n.position.x || newY !== n.position.y) {
            return { ...n, position: { x: newX, y: newY } };
          }
          return n;
        })
      );

      // Consolidate any guides that ended up overlapping after the drag
      const updatedGuides = guides.map((g) => {
        if (g.id === rowId) return { ...g, position: centerY / canvasHeight };
        if (g.id === colId) return { ...g, position: centerX / canvasWidth };
        return g;
      });
      const normalMerges = findGuideMerges(updatedGuides);
      if (normalMerges.size > 0) {
        applyGuideMerges(normalMerges, updatedGuides, canvasWidth, canvasHeight, setGuides, setNodes);
      }
    },
    [guides, nodes, canvasWidth, canvasHeight, setGuides, setNodes, saveSnapshot]
  );

  const handleChat = useCallback(
    async (message: string) => {
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
      if (!apiKey) {
        setChatError("No API key configured (VITE_OPENROUTER_API_KEY)");
        return;
      }
      setIsLLMLoading(true);
      setChatError(null);
      setChatSummary(null);
      setChatProgress(null);
      try {
        // Step 1: Validate input with cheap model
        const validation = await validateChatInput(message, apiKey);

        // Log user message to chat history
        const userMsg: ChatMessage = {
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
          category: validation.classification,
        };
        setChatHistory((prev) => [...prev, userMsg]);

        if (validation.classification === "complaint") {
          await db.logFeedback({
            userId: db.getUserId(),
            message,
            category: "complaint",
          });
          const reply = "Thanks for the feedback — your message has been logged and our team will review it.";
          setChatHistory((prev) => [...prev, {
            role: "assistant" as const,
            content: reply,
            timestamp: new Date().toISOString(),
          }]);
          setChatSummary(reply);
          return;
        }

        if (validation.classification === "invalid") {
          const reply = `That doesn't look like a diagram editing request. Try something like "add a node" or "change the color of Auth0". (${validation.reason})`;
          setChatHistory((prev) => [...prev, {
            role: "assistant" as const,
            content: reply,
            timestamp: new Date().toISOString(),
          }]);
          setChatError(reply);
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

        if (summary) {
          setChatHistory((prev) => [...prev, {
            role: "assistant" as const,
            content: summary,
            timestamp: new Date().toISOString(),
          }]);
        }
        setChatSummary(summary);
      } catch (err) {
        console.error("LLM refinement failed:", err);
        const errMsg = err instanceof Error ? err.message : "LLM request failed";
        setChatHistory((prev) => [...prev, {
          role: "system" as const,
          content: `Error: ${errMsg}`,
          timestamp: new Date().toISOString(),
        }]);
        setChatError(errMsg);
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

  const [templateSaveState, setTemplateSaveState] = useState<"idle" | "confirm" | "saving" | "done">("idle");

  const handleSaveAsTemplate = useCallback(async () => {
    const currentSpec = flowToSpec(nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides);
    const title = diagram.title ?? "Untitled";

    try {
      const existing = await db.listTemplates();
      const match = existing.find((t) => t.name === title);

      if (match && !window.confirm(`Overwrite template "${title}"?`)) return;

      setTemplateSaveState("saving");

      if (match) {
        await db.deleteTemplate(match.id);
      }

      await db.createTemplate({
        name: title,
        description: match?.description ?? "",
        spec: currentSpec,
        featured: match?.featured ?? false,
      });

      setTemplateSaveState("done");
      setTimeout(() => setTemplateSaveState("idle"), 2000);
    } catch (err) {
      console.error("Failed to save template:", err);
      setTemplateSaveState("idle");
      window.alert(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [nodes, edges, diagram, palette, shapePalette, sizePalette, semanticTypes, guides, db]);

  const handleExportPng = useCallback(async () => {
    const el = flowRef.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!el) return;

    const PADDING = 40;
    const PIXEL_RATIO = 2;
    const FOOTER_HEIGHT = 56;
    const TAGLINE = "Made with Objectify";
    const SITE_URL = "https://objectify-cwj.pages.dev";
    const WALLET_ADDR = "0xD7e9b7124963439205B0EB9D2f919F05EF9F2919";
    const WALLET_URI = `ethereum:${WALLET_ADDR}@8453`; // EIP-681: Base chain

    try {
      // Compute bounding box of all nodes in screen coordinates
      const nodeEls = el.querySelectorAll(".react-flow__node");
      if (nodeEls.length === 0) return;

      const flowRect = el.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodeEls.forEach((n) => {
        const r = n.getBoundingClientRect();
        minX = Math.min(minX, r.left - flowRect.left);
        minY = Math.min(minY, r.top - flowRect.top);
        maxX = Math.max(maxX, r.right - flowRect.left);
        maxY = Math.max(maxY, r.bottom - flowRect.top);
      });

      const cropX = minX - PADDING;
      const cropY = minY - PADDING;
      const cropW = maxX - minX + PADDING * 2;
      const cropH = maxY - minY + PADDING * 2;

      // Capture diagram without UI chrome
      const dataUrl = await toPng(el, {
        pixelRatio: PIXEL_RATIO,
        backgroundColor: "#ffffff",
        filter: (node: HTMLElement) => {
          const el = node as unknown as Element;
          if (!el.getAttribute && !el.classList) return true;
          // Filter out guide lines overlay
          if (el.hasAttribute?.("data-export-ignore")) return false;
          // classList.contains works for both HTMLElement and SVGElement
          const cl = el.classList;
          if (cl) {
            if (cl.contains("react-flow__minimap")) return false;
            if (cl.contains("react-flow__controls")) return false;
            if (cl.contains("react-flow__panel")) return false;
            if (cl.contains("react-flow__background")) return false;
          }
          return true;
        },
      });

      // Load the screenshot and composite with branded footer
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const cw = Math.round(cropW * PIXEL_RATIO);
      const ch = Math.round(cropH * PIXEL_RATIO);
      const footerH = FOOTER_HEIGHT * PIXEL_RATIO;

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch + footerH;
      const ctx = canvas.getContext("2d")!;

      // Draw cropped diagram
      ctx.drawImage(
        img,
        Math.round(cropX * PIXEL_RATIO), Math.round(cropY * PIXEL_RATIO),
        cw, ch,
        0, 0,
        cw, ch,
      );

      // Generate QR codes
      function makeQr(data: string) {
        const q = qrcode(0, "L");
        q.addData(data);
        q.make();
        return q;
      }
      const qrSite = makeQr(SITE_URL);
      const qrWallet = makeQr(WALLET_URI);

      // Draw branded footer
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(0, ch, cw, footerH);
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(0, ch, cw, PIXEL_RATIO);

      const fontSize = 12 * PIXEL_RATIO;
      const font = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.font = `${fontSize}px ${font}`;
      ctx.textBaseline = "middle";
      const pad = 12 * PIXEL_RATIO;
      const qrSize = footerH - 8 * PIXEL_RATIO;
      const qrY = ch + (footerH - qrSize) / 2;
      const gap = 6 * PIXEL_RATIO;

      // Helper: draw a QR code at (x, y)
      function drawQr(q: ReturnType<typeof qrcode>, x: number, y: number, size: number) {
        const modules = q.getModuleCount();
        const cell = size / modules;
        ctx.fillStyle = "#333333";
        for (let r = 0; r < modules; r++) {
          for (let c = 0; c < modules; c++) {
            if (q.isDark(r, c)) {
              ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
            }
          }
        }
      }

      // Left side: [QR] gap [tagline + URL]
      let x = pad;
      drawQr(qrSite, x, qrY, qrSize);
      x += qrSize + gap;
      ctx.textAlign = "left";
      ctx.fillStyle = "#888888";
      ctx.fillText(TAGLINE, x, ch + footerH * 0.33);
      ctx.fillStyle = "#aaaaaa";
      ctx.fillText(SITE_URL, x, ch + footerH * 0.7);

      // Right side: [tip text + address] gap [QR]
      const qrWalletX = cw - pad - qrSize;
      drawQr(qrWallet, qrWalletX, qrY, qrSize);
      ctx.textAlign = "right";
      ctx.fillStyle = "#888888";
      ctx.fillText("Send tokens of appreciation", qrWalletX - gap, ch + footerH * 0.33);
      ctx.fillStyle = "#aaaaaa";
      ctx.fillText(WALLET_ADDR, qrWalletX - gap, ch + footerH * 0.7);

      // Download
      const slug = (diagram.title ?? "diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}-objectify.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  }, [diagram.title]);

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
      <ClockFaceDragContext.Provider value={{ startDrag: clockFaceStartDrag }}>
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
        {clockFaceDragState && (
          <ClockFaceOverlay
            nodeCenterX={clockFaceDragState.nodeCenterX}
            nodeCenterY={clockFaceDragState.nodeCenterY}
            nodeWidth={clockFaceDragState.nodeWidth}
            nodeHeight={clockFaceDragState.nodeHeight}
            highlightedClock={clockFaceDragState.highlightedClock}
          />
        )}
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
          <button className="load-btn export-json-btn" onClick={handleExport} style={{ marginRight: 4 }}>
            Export JSON
          </button>
          <button className="load-btn" onClick={handleExportPng} style={{ marginRight: 4 }}>
            Export PNG
          </button>
          <button
            className="load-btn"
            onClick={() => setShowShareModal(true)}
            style={{ marginRight: 4 }}
          >
            Feedback
          </button>
          {isAdmin && (
            <button
              className="load-btn"
              onClick={handleSaveAsTemplate}
              disabled={templateSaveState === "saving"}
              style={{
                background: templateSaveState === "done" ? "#e8f5e9" : "#fff8e1",
                borderColor: templateSaveState === "done" ? "#81c784" : "#ffe082",
                marginRight: 4,
              }}
              title="Save as Template"
            >
              {templateSaveState === "saving" ? "Saving…" : templateSaveState === "done" ? "✓ Saved" : "★ Template"}
            </button>
          )}
          <button
            className="load-btn"
            onClick={() => setShowHelpModal(true)}
            title="Help & keyboard shortcuts"
            style={{ fontWeight: 700 }}
          >
            ?
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

        {/* Resize propagation highlight on siblings */}
        {resizeHighlightIds.size > 0 && (
          <style>{`
            @keyframes resize-pulse {
              0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.6); }
              50% { box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.3); }
              100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
            }
            ${Array.from(resizeHighlightIds)
              .map((id) => `.react-flow__node[data-id="${id}"]`)
              .join(",\n            ")} {
              animation: resize-pulse 0.8s ease-out !important;
            }
          `}</style>
        )}
      </ReactFlow>
      </ClockFaceDragContext.Provider>
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

      {dragMessage && (
        <div className="drag-toast">
          {dragMessage}
        </div>
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

      {showShareModal && (
        <ShareModal
          spec={specRef.current}
          chatHistory={chatHistory}
          documentTitle={diagram.title ?? "Untitled"}
          db={db}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}
    </div>
  );
}
