import { useCallback, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
  guides: GuideLine[];
}

const MAX_HISTORY = 50;

export function useUndoHistory(
  nodes: Node[],
  edges: Edge[],
  guides: GuideLine[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setGuides: React.Dispatch<React.SetStateAction<GuideLine[]>>
) {
  // Keep current state accessible via ref so callbacks have stable identity
  const stateRef = useRef<Snapshot>({ nodes, edges, guides });
  stateRef.current = { nodes, edges, guides };

  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);

  // Track whether buttons should be enabled — triggers re-render only when toggled
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const saveSnapshot = useCallback(() => {
    const { nodes, edges, guides } = stateRef.current;
    undoStackRef.current.push(structuredClone({ nodes, edges, guides }));
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    // New action clears the redo stack
    redoStackRef.current = [];
    syncFlags();
  }, [syncFlags]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    // Push current state to redo
    const { nodes, edges, guides } = stateRef.current;
    redoStackRef.current.push(structuredClone({ nodes, edges, guides }));

    // Pop from undo and restore
    const snapshot = undoStackRef.current.pop()!;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setGuides(snapshot.guides);
    syncFlags();
  }, [setNodes, setEdges, setGuides, syncFlags]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    // Push current state to undo
    const { nodes, edges, guides } = stateRef.current;
    undoStackRef.current.push(structuredClone({ nodes, edges, guides }));

    // Pop from redo and restore
    const snapshot = redoStackRef.current.pop()!;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setGuides(snapshot.guides);
    syncFlags();
  }, [setNodes, setEdges, setGuides, syncFlags]);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncFlags();
  }, [syncFlags]);

  return { saveSnapshot, undo, redo, canUndo, canRedo, clearHistory };
}
