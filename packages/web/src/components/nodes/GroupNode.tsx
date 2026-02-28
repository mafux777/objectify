import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont } from "@objectify/schema";

type LabelPosition = "center" | "top-left" | "top-center" | "bottom-center" | "above" | "below";

type GroupNodeData = {
  label: string;
  style: NodeStyle;
  font?: NodeFont;
  labelPosition?: LabelPosition;
};

export function GroupNode({
  data,
  selected,
}: NodeProps & { data: GroupNodeData }) {
  const { label, style, font, labelPosition = "top-left" } = data;

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={80}
        isVisible={!!selected}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
      />

      {/* Target handles (incoming) */}
      <Handle type="target" position={Position.Top} id="target-top" className="anchor-handle" />
      <Handle type="target" position={Position.Right} id="target-right" className="anchor-handle" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="anchor-handle" />
      <Handle type="target" position={Position.Left} id="target-left" className="anchor-handle" />

      {/* Source handles (outgoing) */}
      <Handle type="source" position={Position.Top} id="source-top" className="anchor-handle" />
      <Handle type="source" position={Position.Right} id="source-right" className="anchor-handle" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="anchor-handle" />
      <Handle type="source" position={Position.Left} id="source-left" className="anchor-handle" />

      <div
        style={{
          backgroundColor: style.backgroundColor + "20",
          border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? style.backgroundColor}`,
          borderRadius: 12,
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            ...(labelPosition === "top-left" ? { top: 8, left: 12 } :
               labelPosition === "top-center" ? { top: 8, left: 0, width: "100%", textAlign: "center" as const } :
               labelPosition === "center" ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } :
               labelPosition === "bottom-center" ? { bottom: 8, left: 0, width: "100%", textAlign: "center" as const } :
               { top: 8, left: 12 }),
            color: style.textColor ?? "#333",
            padding: "2px 10px",
            borderRadius: 4,
            fontSize: font?.fontSize ?? 12,
            fontWeight: font?.fontWeight === "bold" ? 700 : 600,
            fontFamily: font?.fontFamily ?? "sans-serif",
            letterSpacing: 0.3,
          }}
        >
          {label}
        </div>
      </div>
    </>
  );
}
