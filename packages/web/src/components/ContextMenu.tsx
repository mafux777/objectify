import { useCallback } from "react";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import { specMarkerToFlow } from "../lib/spec-to-flow.js";

export type ContextMenuState =
  | { type: "node"; nodeId: string; x: number; y: number }
  | { type: "edge"; edgeId: string; x: number; y: number }
  | { type: "pane"; x: number; y: number };

interface ContextMenuProps {
  state: ContextMenuState;
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onClose: () => void;
  saveSnapshot: () => void;
}

let nodeCounter = 0;

// --- Edge option configs ---

const ROUTING_OPTIONS: { value: string; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "step", label: "Step (90\u00B0)" },
  { value: "smoothstep", label: "Smooth Step" },
  { value: "bezier", label: "Bezier (curve)" },
];

const LINE_STYLE_OPTIONS: { value: string; label: string; dash?: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed", dash: "6,3" },
  { value: "dotted", label: "Dotted", dash: "2,2" },
];

const STROKE_WIDTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Thin (1px)" },
  { value: 1.5, label: "Normal (1.5px)" },
  { value: 2.5, label: "Thick (2.5px)" },
  { value: 4, label: "Heavy (4px)" },
];

const MARKER_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow \u25B6" },
  { value: "ball", label: "Ball \u25CF" },
  { value: "socket", label: "Socket \u25D5" },
];

export function ContextMenu({
  state,
  nodes,
  edges,
  setNodes,
  setEdges,
  onClose,
  saveSnapshot,
}: ContextMenuProps) {
  const deleteNode = useCallback(
    (nodeId: string) => {
      saveSnapshot();
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      onClose();
    },
    [setNodes, setEdges, onClose, saveSnapshot]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const original = nodes.find((n) => n.id === nodeId);
      if (!original) return;
      saveSnapshot();
      nodeCounter++;
      const newNode: Node = {
        ...original,
        id: `node-dup-${nodeCounter}`,
        position: {
          x: original.position.x + 30,
          y: original.position.y + 30,
        },
        selected: false,
      };
      setNodes((nds) => [...nds, newNode]);
      onClose();
    },
    [nodes, setNodes, onClose, saveSnapshot]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      saveSnapshot();
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      onClose();
    },
    [setEdges, onClose, saveSnapshot]
  );

  // Generic edge updater
  const updateEdge = useCallback(
    (edgeId: string, updater: (edge: Edge) => Edge) => {
      saveSnapshot();
      setEdges((eds) => eds.map((e) => (e.id === edgeId ? updater(e) : e)));
      onClose();
    },
    [setEdges, onClose, saveSnapshot]
  );

  const addNodeAtPosition = useCallback(() => {
    saveSnapshot();
    nodeCounter++;
    const newNode: Node = {
      id: `node-new-${nodeCounter}`,
      type: "colorBox",
      position: { x: state.x, y: state.y },
      data: {
        label: "New Node",
        style: {
          backgroundColor: "#FFFFFF",
          textColor: "#000000",
          borderColor: "#bbb",
          borderStyle: "solid",
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
    onClose();
  }, [state, setNodes, onClose, saveSnapshot]);

  // Read current edge state for active indicators
  const edge =
    state.type === "edge"
      ? edges.find((e) => e.id === state.edgeId)
      : undefined;
  const edgeData = (edge as Record<string, unknown>)?.data as
    | Record<string, unknown>
    | undefined;
  const currentRouting = (edgeData?.routingType as string) ?? "straight";
  const currentStrokeWidth = (edgeData?.strokeWidth as number) ?? 1.5;
  const currentLineStyle =
    edge?.style?.strokeDasharray === "6,3"
      ? "dashed"
      : edge?.style?.strokeDasharray === "2,2"
        ? "dotted"
        : "solid";
  const currentSourceMarker = (edgeData?.sourceMarker as string) ?? "none";
  const currentTargetMarker = (edgeData?.targetMarker as string) ?? "arrow";

  return (
    <div
      className="context-menu"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {state.type === "node" && (
        <>
          <button onClick={() => duplicateNode(state.nodeId)}>Duplicate</button>
          <div className="separator" />
          <button className="danger" onClick={() => deleteNode(state.nodeId)}>
            Delete
          </button>
        </>
      )}
      {state.type === "edge" && edge && (
        <>
          <div className="section-label">Routing</div>
          {ROUTING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                updateEdge(state.edgeId, (e) => ({
                  ...e,
                  data: { ...e.data, routingType: opt.value },
                }))
              }
            >
              <span className="check">
                {currentRouting === opt.value ? "\u2022" : ""}
              </span>
              {opt.label}
            </button>
          ))}

          <div className="separator" />
          <div className="section-label">Line Style</div>
          {LINE_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                updateEdge(state.edgeId, (e) => ({
                  ...e,
                  animated: opt.value === "dashed",
                  style: {
                    ...e.style,
                    strokeDasharray: opt.dash,
                  },
                }))
              }
            >
              <span className="check">
                {currentLineStyle === opt.value ? "\u2022" : ""}
              </span>
              {opt.label}
            </button>
          ))}

          <div className="separator" />
          <div className="section-label">Width</div>
          {STROKE_WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                updateEdge(state.edgeId, (e) => ({
                  ...e,
                  style: { ...e.style, strokeWidth: opt.value },
                  data: { ...e.data, strokeWidth: opt.value },
                }))
              }
            >
              <span className="check">
                {currentStrokeWidth === opt.value ? "\u2022" : ""}
              </span>
              {opt.label}
            </button>
          ))}

          <div className="separator" />
          <div className="section-label">Source Marker</div>
          {MARKER_OPTIONS.map((opt) => (
            <button
              key={`src-${opt.value}`}
              onClick={() => {
                const color = (edge.style?.stroke as string) ?? "#555";
                updateEdge(state.edgeId, (e) => ({
                  ...e,
                  markerStart: specMarkerToFlow(
                    opt.value,
                    "none",
                    color
                  ),
                  data: { ...e.data, sourceMarker: opt.value },
                }));
              }}
            >
              <span className="check">
                {currentSourceMarker === opt.value ? "\u2022" : ""}
              </span>
              {opt.label}
            </button>
          ))}

          <div className="separator" />
          <div className="section-label">Target Marker</div>
          {MARKER_OPTIONS.map((opt) => (
            <button
              key={`tgt-${opt.value}`}
              onClick={() => {
                const color = (edge.style?.stroke as string) ?? "#555";
                updateEdge(state.edgeId, (e) => ({
                  ...e,
                  markerEnd: specMarkerToFlow(
                    opt.value,
                    "arrow",
                    color
                  ),
                  data: { ...e.data, targetMarker: opt.value },
                }));
              }}
            >
              <span className="check">
                {currentTargetMarker === opt.value ? "\u2022" : ""}
              </span>
              {opt.label}
            </button>
          ))}

          <div className="separator" />
          <button
            className="danger"
            onClick={() => deleteEdge(state.edgeId)}
          >
            Delete
          </button>
        </>
      )}
      {state.type === "pane" && (
        <button onClick={addNodeAtPosition}>Add Node Here</button>
      )}
    </div>
  );
}
