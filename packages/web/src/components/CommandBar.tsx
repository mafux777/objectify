import { useState, useCallback } from "react";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import { parseCommand } from "../lib/command-parser.js";

let cmdNodeCounter = 100;

interface CommandBarProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}

export function CommandBar({ nodes, edges, setNodes, setEdges }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const findNodeByLabel = useCallback(
    (label: string) => nodes.find((n) => n.data?.label === label),
    [nodes]
  );

  const execute = useCallback(() => {
    if (!input.trim()) return;
    setError(null);

    const cmd = parseCommand(input);
    if (!cmd) {
      setError("Unknown command. Try: add box \"Label\", delete \"Label\", connect \"A\" to \"B\"");
      return;
    }

    switch (cmd.type) {
      case "add-node": {
        cmdNodeCounter++;
        setNodes((nds) => [
          ...nds,
          {
            id: `cmd-node-${cmdNodeCounter}`,
            type: "colorBox",
            position: { x: 200, y: 200 },
            data: {
              label: cmd.label,
              style: {
                backgroundColor: "#FFFFFF",
                textColor: "#000000",
                borderColor: "#bbb",
                borderStyle: "solid",
              },
            },
          },
        ]);
        break;
      }

      case "delete-node": {
        const node = findNodeByLabel(cmd.label);
        if (!node) { setError(`Node "${cmd.label}" not found`); return; }
        setNodes((nds) => nds.filter((n) => n.id !== node.id));
        setEdges((eds) =>
          eds.filter((e) => e.source !== node.id && e.target !== node.id)
        );
        break;
      }

      case "connect": {
        const src = findNodeByLabel(cmd.sourceLabel);
        const tgt = findNodeByLabel(cmd.targetLabel);
        if (!src) { setError(`Source "${cmd.sourceLabel}" not found`); return; }
        if (!tgt) { setError(`Target "${cmd.targetLabel}" not found`); return; }
        cmdNodeCounter++;
        setEdges((eds) => [
          ...eds,
          {
            id: `cmd-edge-${cmdNodeCounter}`,
            source: src.id,
            target: tgt.id,
            type: "smoothstep",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#555",
              width: 16,
              height: 16,
            },
          },
        ]);
        break;
      }

      case "disconnect": {
        const src = findNodeByLabel(cmd.sourceLabel);
        const tgt = findNodeByLabel(cmd.targetLabel);
        if (!src || !tgt) { setError("Node not found"); return; }
        setEdges((eds) =>
          eds.filter((e) => !(e.source === src.id && e.target === tgt.id))
        );
        break;
      }

      case "rename": {
        const node = findNodeByLabel(cmd.oldLabel);
        if (!node) { setError(`Node "${cmd.oldLabel}" not found`); return; }
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, data: { ...n.data, label: cmd.newLabel } }
              : n
          )
        );
        break;
      }

      case "color": {
        const node = findNodeByLabel(cmd.label);
        if (!node) { setError(`Node "${cmd.label}" not found`); return; }
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    style: { ...(n.data.style as Record<string, unknown>), backgroundColor: cmd.color },
                  },
                }
              : n
          )
        );
        break;
      }

      case "move": {
        const node = findNodeByLabel(cmd.label);
        if (!node) { setError(`Node "${cmd.label}" not found`); return; }
        const dx =
          cmd.direction === "right" ? cmd.amount : cmd.direction === "left" ? -cmd.amount : 0;
        const dy =
          cmd.direction === "down" ? cmd.amount : cmd.direction === "up" ? -cmd.amount : 0;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  position: {
                    x: n.position.x + dx,
                    y: n.position.y + dy,
                  },
                }
              : n
          )
        );
        break;
      }
    }

    setInput("");
  }, [input, findNodeByLabel, setNodes, setEdges]);

  return (
    <div className="command-bar">
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") execute();
        }}
        placeholder='Commands: add box "Label", connect "A" to "B", move "A" right 50'
        style={error ? { borderColor: "#d32f2f" } : undefined}
      />
    </div>
  );
}
