import { useCallback } from "react";
import { MarkerType, type Node, type Edge } from "@xyflow/react";

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
}

let nodeCounter = 0;

export function ContextMenu({
  state,
  nodes,
  edges,
  setNodes,
  setEdges,
  onClose,
}: ContextMenuProps) {
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      onClose();
    },
    [setNodes, setEdges, onClose]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const original = nodes.find((n) => n.id === nodeId);
      if (!original) return;
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
    [nodes, setNodes, onClose]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      onClose();
    },
    [setEdges, onClose]
  );

  const toggleEdgeStyle = useCallback(
    (edgeId: string) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edgeId) return e;
          const isDashed = e.style?.strokeDasharray === "6,3";
          return {
            ...e,
            animated: !isDashed,
            style: {
              ...e.style,
              strokeDasharray: isDashed ? undefined : "6,3",
            },
          };
        })
      );
      onClose();
    },
    [setEdges, onClose]
  );

  const addNodeAtPosition = useCallback(() => {
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
  }, [state, setNodes, onClose]);

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
      {state.type === "edge" && (
        <>
          <button onClick={() => toggleEdgeStyle(state.edgeId)}>
            Toggle Dashed/Solid
          </button>
          <div className="separator" />
          <button className="danger" onClick={() => deleteEdge(state.edgeId)}>
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
