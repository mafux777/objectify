import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, ShapeKind, NodeLabel } from "@objectify/schema";
import { fontStack } from "../../lib/fonts";
import { NodeLabels } from "./NodeLabels";
import { NodeHandles } from "./NodeHandles";

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

  // If labels[] exists but has no center entry, all text is shown externally — don't duplicate.
  const centerLabel = labels?.length
    ? (labels.find((l) => l.position === "center")?.text ?? null)
    : label;
  const hasOutsideLabels = labels?.some((l) => l.position !== "center");
  const isCylinder = shapeKind === "cylinder";
  const shapeStyles = isCylinder ? {} : getShapeStyles(shapeKind);
  // Apply aspect ratio from shape palette (unless shape already enforces it, like circle)
  const aspectRatioStyle: React.CSSProperties =
    aspectRatio && shapeKind !== "circle"
      ? { aspectRatio: String(aspectRatio) }
      : {};

  const handles = <NodeHandles shapeKind={shapeKind} />;

  if (isCylinder) {
    const borderColor = style.borderColor ?? "#bbb";
    return (
      <>
        {hasOutsideLabels && labels && (
          <NodeLabels labels={labels} defaultFont={font} defaultColor={style.textColor ?? "#000"} />
        )}
        <NodeResizer minWidth={60} minHeight={30} isVisible={!!selected} lineClassName="resizer-line" handleClassName="resizer-handle" />
        {handles}
        <svg viewBox="0 0 60 50" style={{ width: "100%", height: "100%", opacity: style.opacity ?? 1 }} preserveAspectRatio="none">
          {/* Body */}
          <rect x="1" y="10" width="58" height="30" fill={style.backgroundColor} stroke="none" />
          {/* Left/right borders */}
          <line x1="1" y1="10" x2="1" y2="40" stroke={borderColor} strokeWidth="2" />
          <line x1="59" y1="10" x2="59" y2="40" stroke={borderColor} strokeWidth="2" />
          {/* Bottom ellipse */}
          <ellipse cx="30" cy="40" rx="29" ry="8" fill={style.backgroundColor} stroke={borderColor} strokeWidth="2" />
          {/* Top ellipse (covers body top) */}
          <ellipse cx="30" cy="10" rx="29" ry="8" fill={style.backgroundColor} stroke={borderColor} strokeWidth="2" />
          {/* Label */}
          <text
            x="30" y="30"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={style.textColor ?? "#000"}
            fontWeight={font?.fontWeight === "bold" ? 700 : 500}
            fontSize={font?.fontSize ?? 13}
            fontFamily={fontStack(font?.fontFamily)}
          >
            {centerLabel}
          </text>
        </svg>
      </>
    );
  }

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
      {handles}

      <div
        style={{
          backgroundColor: style.backgroundColor,
          color: style.textColor ?? "#000",
          border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#bbb"}`,
          opacity: style.opacity ?? 1,
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
