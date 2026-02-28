import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, NodeLabel } from "@objectify/schema";
import { fontStack } from "../../lib/fonts";
import { NodeLabels } from "./NodeLabels";

type GroupNodeData = {
  label: string;
  labels?: NodeLabel[];
  style: NodeStyle;
  font?: NodeFont;
};

export function GroupNode({
  data,
  selected,
}: NodeProps & { data: GroupNodeData }) {
  const { label, labels, style, font } = data;

  // For groups, primary label goes at top-left (inside the group header)
  const primaryLabel = labels?.[0]?.text ?? label;
  const hasOutsideLabels = labels?.some((l) => l.position !== "center" && l.position !== "10:30");

  return (
    <>
      {hasOutsideLabels && labels && (
        <NodeLabels labels={labels} defaultFont={font} defaultColor={style.textColor ?? "#333"} />
      )}
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
            top: 8,
            left: 12,
            color: style.textColor ?? "#333",
            padding: "2px 10px",
            borderRadius: 4,
            fontSize: font?.fontSize ?? 12,
            fontWeight: font?.fontWeight === "bold" ? 700 : 600,
            fontFamily: fontStack(font?.fontFamily),
            letterSpacing: 0.3,
          }}
        >
          {primaryLabel}
        </div>
      </div>
    </>
  );
}
