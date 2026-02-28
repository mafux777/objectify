import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, ShapeKind, NodeLabel } from "@objectify/schema";
import { fontStack } from "../../lib/fonts";
import { NodeLabels } from "./NodeLabels";

type ShapeNodeData = {
  label: string;
  labels?: NodeLabel[];
  style: NodeStyle;
  font?: NodeFont;
  shapeKind?: ShapeKind;
  aspectRatio?: number;
};

function getShapeStyles(kind: ShapeKind | undefined): React.CSSProperties {
  switch (kind) {
    case "circle":
      return { borderRadius: "50%", aspectRatio: "1" };
    case "ellipse":
      return { borderRadius: "50%" };
    case "rounded-rectangle":
      return { borderRadius: 999 };
    case "diamond":
      return {
        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      };
    case "parallelogram":
      return {
        clipPath: "polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)",
      };
    case "hexagon":
      return {
        clipPath:
          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
      };
    case "arrow-shape":
      return {
        clipPath:
          "polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)",
      };
    case "rectangle":
    default:
      return { borderRadius: 8 };
  }
}

export function ShapeNode({
  data,
  selected,
}: NodeProps & { data: ShapeNodeData }) {
  const { label, labels, style, font, shapeKind, aspectRatio } = data;

  const centerLabel = labels?.find((l) => l.position === "center")?.text ?? label;
  const hasOutsideLabels = labels?.some((l) => l.position !== "center");
  const shapeStyles = getShapeStyles(shapeKind);
  // Apply aspect ratio from shape palette (unless shape already enforces it, like circle)
  const aspectRatioStyle: React.CSSProperties =
    aspectRatio && shapeKind !== "circle"
      ? { aspectRatio: String(aspectRatio) }
      : {};

  return (
    <>
      {hasOutsideLabels && labels && (
        <NodeLabels labels={labels} defaultFont={font} defaultColor={style.textColor ?? "#000"} />
      )}
      <NodeResizer
        minWidth={60}
        minHeight={30}
        isVisible={!!selected}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
      />

      {/* Target handles (incoming) */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="anchor-handle"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="anchor-handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="anchor-handle"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="anchor-handle"
      />

      {/* Source handles (outgoing) */}
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="anchor-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="anchor-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="anchor-handle"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="anchor-handle"
      />

      <div
        style={{
          backgroundColor: style.backgroundColor,
          color: style.textColor ?? "#000",
          border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#bbb"}`,
          padding: "10px 20px",
          fontWeight: font?.fontWeight === "bold" ? 700 : 500,
          fontSize: font?.fontSize ?? 13,
          fontFamily: fontStack(font?.fontFamily),
          minWidth: 60,
          textAlign: "center",
          whiteSpace: "pre-line",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...shapeStyles,
          ...aspectRatioStyle,
        }}
      >
        {centerLabel}
      </div>
    </>
  );
}
