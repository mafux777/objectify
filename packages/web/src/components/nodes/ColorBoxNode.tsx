import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeStyle, NodeFont, NodeLabel } from "@objectify/schema";
import { fontStack } from "../../lib/fonts";
import { NodeLabels } from "./NodeLabels";
import { NodeHandles } from "./NodeHandles";

type ColorBoxData = {
  label: string;
  labels?: NodeLabel[];
  style: NodeStyle;
  font?: NodeFont;
};

export function ColorBoxNode({
  data,
  selected,
}: NodeProps & { data: ColorBoxData }) {
  const { label, labels, style, font } = data;

  // Primary center label text (from labels[0] if center, else legacy label).
  // If labels[] exists but has no center entry, all text is shown externally — don't duplicate.
  const centerLabel = labels?.length
    ? (labels.find((l) => l.position === "center")?.text ?? null)
    : label;
  const hasOutsideLabels = labels?.some((l) => l.position !== "center");

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

      <NodeHandles />

      <div
        style={{
          backgroundColor: style.backgroundColor,
          color: style.textColor ?? "#000",
          border: `2px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#bbb"}`,
          borderRadius: 8,
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
        }}
      >
        {centerLabel}
      </div>
    </>
  );
}
