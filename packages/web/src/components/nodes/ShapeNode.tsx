import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, ShapeKind } from "@objectify/schema";

type ShapeNodeData = {
  label: string;
  style: NodeStyle;
  font?: NodeFont;
  shapeKind?: ShapeKind;
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
  const { label, style, font, shapeKind } = data;
  const shapeStyles = getShapeStyles(shapeKind);

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
          ...shapeStyles,
        }}
      >
        {label}
      </div>
    </>
  );
}
