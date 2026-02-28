import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont } from "@objectify/schema";

type ColorBoxData = {
  label: string;
  style: NodeStyle;
  font?: NodeFont;
};

export function ColorBoxNode({
  data,
  selected,
}: NodeProps & { data: ColorBoxData }) {
  const { label, style, font } = data;

  return (
    <>
      <NodeResizer
        minWidth={60}
        minHeight={30}
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
          backgroundColor: style.backgroundColor,
          color: style.textColor ?? "#000",
          border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#bbb"}`,
          borderRadius: 8,
          padding: "10px 20px",
          fontWeight: font?.fontWeight === "bold" ? 700 : 500,
          fontSize: font?.fontSize ? Math.min(font.fontSize, 18) : 13,
          fontFamily: font?.fontFamily ?? "sans-serif",
          minWidth: 60,
          textAlign: "center",
          whiteSpace: "pre-line",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {label}
      </div>
    </>
  );
}
