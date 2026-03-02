import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, NodeLabel } from "@objectify/schema";
import { fontStack } from "../../lib/fonts";
import { NodeLabels } from "./NodeLabels";
import { NodeHandles } from "./NodeHandles";

type GroupNodeData = {
  label: string;
  labels?: NodeLabel[];
  style: NodeStyle;
  font?: NodeFont;
  shapeKind?: string;
};

export function GroupNode({
  data,
  selected,
}: NodeProps & { data: GroupNodeData }) {
  const { label, labels, style, font, shapeKind } = data;

  // For groups, primary label goes at top-left (inside the group header)
  const primaryLabel = labels?.[0]?.text ?? label;
  const hasOutsideLabels = labels?.some((l) => l.position !== "center" && l.position !== "10:30");
  const isCloud = shapeKind === "cloud";

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

      <NodeHandles />

      {isCloud ? (
        <div style={{ width: "100%", height: "100%", position: "relative", opacity: style.opacity ?? 1 }}>
          <svg
            viewBox="0 0 200 120"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <path
              d="M 60 95 C 20 95 10 70 45 65 C 10 50 45 25 75 35 C 95 15 155 15 170 35 C 195 35 195 60 175 70 C 195 85 170 105 140 95 Z"
              fill={style.backgroundColor + "20"}
              stroke={style.borderColor ?? style.backgroundColor}
              strokeWidth="2"
              strokeDasharray={style.borderStyle === "dashed" ? "6,3" : style.borderStyle === "dotted" ? "2,2" : undefined}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              bottom: -18,
              left: 0,
              right: 0,
              textAlign: "center",
              color: style.textColor ?? "#333",
              fontSize: font?.fontSize ?? 12,
              fontWeight: font?.fontWeight === "bold" ? 700 : 600,
              fontFamily: fontStack(font?.fontFamily),
              letterSpacing: 0.3,
            }}
          >
            {primaryLabel}
          </div>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: style.backgroundColor + "20",
            border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? style.backgroundColor}`,
            borderRadius: 12,
            opacity: style.opacity ?? 1,
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
      )}
    </>
  );
}
