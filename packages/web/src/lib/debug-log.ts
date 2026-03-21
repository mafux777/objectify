/**
 * Debug logging for guide/group coordinate tracking.
 * Enable in the browser console: window.__debugObjectify = true
 */

import type { Node } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

declare global {
  interface Window {
    __debugObjectify?: boolean;
  }
}

function enabled() {
  return typeof window !== "undefined" && window.__debugObjectify === true;
}

function fmt(n: number) {
  return Math.round(n * 100) / 100;
}

function nodeCoords(node: Node, allNodes?: Node[]) {
  const d = node.data as Record<string, unknown>;
  const w = node.width ?? (node.measured as Record<string, number> | undefined)?.width ?? 160;
  const h = node.height ?? (node.measured as Record<string, number> | undefined)?.height ?? 50;
  const label = (d?.label as string) ?? node.id;

  const info: Record<string, unknown> = {
    id: node.id,
    label,
    position: { x: fmt(node.position.x), y: fmt(node.position.y) },
    size: { w: fmt(w), h: fmt(h) },
    center: { x: fmt(node.position.x + w / 2), y: fmt(node.position.y + h / 2) },
    guideRow: d?.guideRow ?? null,
    guideColumn: d?.guideColumn ?? null,
  };

  if (d?.guideRowBottom) info.guideRowBottom = d.guideRowBottom;
  if (d?.guideColumnRight) info.guideColumnRight = d.guideColumnRight;

  if (node.parentId && allNodes) {
    const parent = allNodes.find((n) => n.id === node.parentId);
    if (parent) {
      info.parentId = node.parentId;
      info.relativePosition = { x: fmt(node.position.x), y: fmt(node.position.y) };
      info.absolutePosition = {
        x: fmt(node.position.x + parent.position.x),
        y: fmt(node.position.y + parent.position.y),
      };
      info.absoluteCenter = {
        x: fmt(node.position.x + parent.position.x + w / 2),
        y: fmt(node.position.y + parent.position.y + h / 2),
      };
    }
  }

  return info;
}

function guideInfo(guide: GuideLine) {
  return {
    id: guide.id,
    label: guide.label ?? guide.id,
    direction: guide.direction,
    position: fmt(guide.position),
    pinned: guide.pinned ?? false,
  };
}

// ─── Public API ───

export function debugNodeMove(
  node: Node,
  allNodes: Node[],
  guides: GuideLine[],
  modifier?: string,
) {
  if (!enabled()) return;
  const d = node.data as Record<string, unknown>;
  const rowGuide = guides.find((g) => g.id === d?.guideRow);
  const colGuide = guides.find((g) => g.id === d?.guideColumn);

  console.group(`%c[Move Node] ${(d?.label as string) ?? node.id}${modifier ? ` (${modifier})` : ""}`, "color: #4fc3f7; font-weight: bold");
  console.table([nodeCoords(node, allNodes)]);
  if (rowGuide) console.log("Row guide:", guideInfo(rowGuide));
  if (colGuide) console.log("Col guide:", guideInfo(colGuide));

  // Log siblings on same guides
  const siblings = allNodes.filter(
    (n) =>
      n.id !== node.id &&
      ((d?.guideRow && (n.data as Record<string, unknown>)?.guideRow === d.guideRow) ||
        (d?.guideColumn && (n.data as Record<string, unknown>)?.guideColumn === d.guideColumn)),
  );
  if (siblings.length > 0) {
    console.log("Siblings on shared guides:");
    console.table(siblings.map((s) => nodeCoords(s, allNodes)));
  }
  console.groupEnd();
}

export function debugGuideMove(
  guide: GuideLine,
  prevPosition: number,
  affectedNodes: { node: Node; effect: "translate" | "resize" }[],
  allNodes: Node[],
) {
  if (!enabled()) return;
  console.group(`%c[Move Guide] ${guide.label ?? guide.id}`, "color: #ffb74d; font-weight: bold");
  console.log(`Direction: ${guide.direction}, Position: ${fmt(prevPosition)} → ${fmt(guide.position)}`);
  if (affectedNodes.length > 0) {
    console.log("Affected nodes:");
    console.table(
      affectedNodes.map(({ node, effect }) => ({
        ...nodeCoords(node, allNodes),
        effect,
      })),
    );
  }
  console.groupEnd();
}

export function debugResize(
  node: Node,
  oldSize: { w: number; h: number },
  newSize: { w: number; h: number },
  allNodes: Node[],
  guides: GuideLine[],
  siblingIds?: string[],
) {
  if (!enabled()) return;
  const d = node.data as Record<string, unknown>;

  console.group(`%c[Resize] ${(d?.label as string) ?? node.id}`, "color: #ce93d8; font-weight: bold");
  console.log(`Size: ${fmt(oldSize.w)}×${fmt(oldSize.h)} → ${fmt(newSize.w)}×${fmt(newSize.h)}`);
  console.table([nodeCoords(node, allNodes)]);

  if (siblingIds && siblingIds.length > 0) {
    const siblings = allNodes.filter((n) => siblingIds.includes(n.id));
    console.log("Size-class siblings (also resized):");
    console.table(siblings.map((s) => nodeCoords(s, allNodes)));
  }
  console.groupEnd();
}

export function debugLLMOutput(
  beforeNodes: Node[],
  afterNodes: Node[],
  afterGuides: GuideLine[],
) {
  if (!enabled()) return;
  console.group("%c[LLM Output] Layout applied", "color: #81c784; font-weight: bold");

  console.log(`Nodes: ${beforeNodes.length} → ${afterNodes.length}`);
  console.log(`Guides: ${afterGuides.length}`);

  console.log("Guides:");
  console.table(afterGuides.map(guideInfo));

  console.log("Nodes after layout:");
  console.table(afterNodes.map((n) => nodeCoords(n, afterNodes)));

  // Show groups and their children
  const groups = afterNodes.filter((n) => n.type === "group");
  for (const g of groups) {
    const children = afterNodes.filter((n) => n.parentId === g.id);
    if (children.length > 0) {
      console.log(`Group "${(g.data as Record<string, unknown>)?.label ?? g.id}" children (relative + absolute):`);
      console.table(children.map((c) => nodeCoords(c, afterNodes)));
    }
  }

  console.groupEnd();
}
