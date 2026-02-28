import type { NodeLabel, NodeFont } from "@objectify/schema";
import { clockToStyle } from "../../lib/clock-position.js";
import { fontStack } from "../../lib/fonts.js";

interface NodeLabelsProps {
  labels: NodeLabel[];
  defaultFont?: NodeFont;
  defaultColor?: string;
}

/**
 * Renders outside labels for a node at their clock positions.
 * The primary center label (labels[0] at "center") is skipped here —
 * it's rendered inline by the parent node component.
 */
export function NodeLabels({ labels, defaultFont, defaultColor }: NodeLabelsProps) {
  return (
    <>
      {labels.map((lbl, i) => {
        // Skip the primary center label — rendered by the parent
        if (lbl.position === "center") return null;

        const posStyle = clockToStyle(lbl.position);
        const font = lbl.font ?? defaultFont;

        return (
          <div
            key={i}
            className="node-label-outside"
            data-label-index={i}
            data-label-position={lbl.position}
            style={{
              position: "absolute",
              top: posStyle.top,
              bottom: posStyle.bottom,
              left: posStyle.left,
              right: posStyle.right,
              transform: posStyle.transform,
              textAlign: posStyle.textAlign,
              fontSize: font?.fontSize ?? 11,
              fontFamily: fontStack(font?.fontFamily),
              fontWeight: font?.fontWeight === "bold" ? 700 : 400,
              color: defaultColor ?? "#000",
              whiteSpace: "pre-line",
              pointerEvents: "none",
            }}
          >
            {lbl.text}
          </div>
        );
      })}
    </>
  );
}
