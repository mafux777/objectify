import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont } from "@objectify/schema";

type GroupNodeData = {
  label: string;
  style: NodeStyle;
  font?: NodeFont;
};

export function GroupNode({
  data,
  selected,
}: NodeProps & { data: GroupNodeData }) {
  const { label, style, font } = data;

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={80}
        isVisible={!!selected}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
      />
      <div
        style={{
          backgroundColor: style.backgroundColor + "20",
          border: `2px solid ${style.backgroundColor}`,
          borderRadius: 12,
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 12,
            color: style.textColor ?? "#333",
            padding: "2px 10px",
            borderRadius: 4,
            fontSize: font?.fontSize ? Math.min(font.fontSize, 14) : 12,
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
