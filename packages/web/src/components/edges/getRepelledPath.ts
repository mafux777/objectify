import { Position } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

/**
 * Corner radius for rounded bends in the repelled path.
 */
const CORNER_RADIUS = 8;

/**
 * Minimum stub length (perpendicular extension from the handle before
 * the first bend). If the channel is very close, the stub shrinks.
 */
const MIN_STUB = 12;

/**
 * Margin beyond the outermost guide when no adjacent guide exists
 * on the exit side (px).
 */
const OUTER_MARGIN = 40;

export interface RepelledPathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
  /** Optional edge ID for deterministic spread offset */
  edgeId?: string;
}

/**
 * Compute a smooth-repelled edge path that routes through the channels
 * between guide lines, avoiding the rows/columns where nodes sit.
 *
 * Returns [svgPath, labelX, labelY] matching React Flow's path function
 * convention.
 */
export function getRepelledSmoothPath(
  params: RepelledPathParams
): [string, number, number] {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    guides,
    canvasWidth,
    canvasHeight,
    edgeId,
  } = params;

  // Compute pixel positions for all guides
  const hGuides = guides
    .filter((g) => g.direction === "horizontal")
    .map((g) => g.position * canvasHeight)
    .sort((a, b) => a - b);
  const vGuides = guides
    .filter((g) => g.direction === "vertical")
    .map((g) => g.position * canvasWidth)
    .sort((a, b) => a - b);

  // Deterministic spread offset based on edge ID hash
  const spread = edgeId ? spreadOffset(edgeId) : 0;

  // Determine whether the connection is primarily horizontal or vertical.
  // "Horizontal" means source exits left/right and target enters left/right.
  const srcHorizontal =
    sourcePosition === Position.Left || sourcePosition === Position.Right;
  const tgtHorizontal =
    targetPosition === Position.Left || targetPosition === Position.Right;

  // Case 1: Both exits are horizontal (most common in guide layouts:
  // source exits right, target enters left, or vice versa)
  if (srcHorizontal && tgtHorizontal) {
    return horizontalToHorizontal(
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
      hGuides, spread,
    );
  }

  // Case 2: Both exits are vertical (source exits bottom, target enters top)
  if (!srcHorizontal && !tgtHorizontal) {
    return verticalToVertical(
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
      vGuides, spread,
    );
  }

  // Case 3: Mixed orientations — one horizontal, one vertical.
  // Route as an L-shape through a single bend.
  return mixedOrientation(
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  );
}

// ---------------------------------------------------------------------------
// Case 1: Horizontal-to-horizontal (e.g. Right → Left)
//
// Shape:  source ─── stub ─┐
//                           │  (channel between rows)
//                           └─── stub ── target
// ---------------------------------------------------------------------------

function horizontalToHorizontal(
  sx: number, sy: number,
  tx: number, ty: number,
  srcPos: Position, tgtPos: Position,
  hGuides: number[], spread: number,
): [string, number, number] {
  const srcDir = srcPos === Position.Right ? 1 : -1;
  const tgtDir = tgtPos === Position.Right ? 1 : -1;

  // If source and target are at the same Y (same row), we still need a jog
  // Find the channel Y: midpoint between the source's row guide and the
  // nearest adjacent row guide in the jog direction.
  const channelY = findChannel(sy, ty, hGuides, spread);

  // Stub length: enough to clear the node, but at least MIN_STUB
  const stubX1 = sx + srcDir * MIN_STUB;
  const stubX2 = tx + tgtDir * MIN_STUB;

  // The X coordinate of the vertical segment — midpoint between stubs,
  // or the further-out stub if they cross
  const midX = pickMidX(stubX1, stubX2, srcDir, tgtDir);

  // If source and target are on the same row (or very close), use the
  // standard 3-segment path through the channel
  if (Math.abs(sy - ty) < 2) {
    // Same row: U-shape jog
    return buildUPath(sx, sy, tx, ty, midX, channelY, srcDir, tgtDir);
  }

  // Different rows: Z-shape (source stub → vertical to channel → horizontal
  // through channel → vertical to target row → target stub)
  return buildZPath(sx, sy, tx, ty, stubX1, channelY, srcDir, tgtDir);
}

// ---------------------------------------------------------------------------
// Case 2: Vertical-to-vertical (e.g. Bottom → Top)
// ---------------------------------------------------------------------------

function verticalToVertical(
  sx: number, sy: number,
  tx: number, ty: number,
  srcPos: Position, tgtPos: Position,
  vGuides: number[], spread: number,
): [string, number, number] {
  const srcDir = srcPos === Position.Bottom ? 1 : -1;
  const tgtDir = tgtPos === Position.Bottom ? 1 : -1;

  const channelX = findChannel(sx, tx, vGuides, spread);

  const stubY1 = sy + srcDir * MIN_STUB;
  const stubY2 = ty + tgtDir * MIN_STUB;
  const midY = pickMidX(stubY1, stubY2, srcDir, tgtDir); // reuse logic

  if (Math.abs(sx - tx) < 2) {
    // Same column: U-shape jog
    return buildUPathVertical(sx, sy, tx, ty, channelX, midY, srcDir, tgtDir);
  }

  return buildZPathVertical(sx, sy, tx, ty, channelX, stubY1, srcDir, tgtDir);
}

// ---------------------------------------------------------------------------
// Case 3: Mixed orientation — L-shape with one bend
// ---------------------------------------------------------------------------

function mixedOrientation(
  sx: number, sy: number,
  tx: number, ty: number,
  srcPos: Position, tgtPos: Position,
): [string, number, number] {
  // Simple L-bend: go in source direction, then turn toward target
  const r = CORNER_RADIUS;

  const srcHoriz = srcPos === Position.Left || srcPos === Position.Right;

  let cornerX: number, cornerY: number;
  if (srcHoriz) {
    // Source exits horizontally, target exits vertically
    cornerX = tx;
    cornerY = sy;
  } else {
    // Source exits vertically, target exits horizontally
    cornerX = sx;
    cornerY = ty;
  }

  const labelX = (sx + tx) / 2;
  const labelY = (sy + ty) / 2;

  // Determine arc sweep
  const dx1 = cornerX - sx;
  const dy1 = cornerY - sy;
  const dx2 = tx - cornerX;
  const dy2 = ty - cornerY;

  const clampedR = Math.min(r, Math.abs(dx1 + dx2) / 2, Math.abs(dy1 + dy2) / 2, r);

  if (clampedR < 1) {
    // Too small for an arc, just do straight lines
    const path = `M ${sx} ${sy} L ${cornerX} ${cornerY} L ${tx} ${ty}`;
    return [path, labelX, labelY];
  }

  const path = buildLPath(sx, sy, cornerX, cornerY, tx, ty, clampedR);
  return [path, labelX, labelY];
}

// ---------------------------------------------------------------------------
// Channel finding
// ---------------------------------------------------------------------------

/**
 * Find the Y (or X) coordinate of the routing channel between guide lines.
 *
 * Strategy: find the midpoint between the two adjacent guides that the
 * source and target rows/columns straddle. If source and target are on
 * the same guide, pick the wider adjacent channel.
 */
function findChannel(
  sourcePos: number,
  targetPos: number,
  sortedGuides: number[],
  spread: number,
): number {
  if (sortedGuides.length === 0) {
    // No guides at all — just go to the midpoint
    return (sourcePos + targetPos) / 2 + spread;
  }

  // Find the guide closest to the source
  const srcGuideIdx = nearestGuideIndex(sourcePos, sortedGuides);
  const tgtGuideIdx = nearestGuideIndex(targetPos, sortedGuides);

  // If they're on different guides, route through the channel between them
  if (srcGuideIdx !== tgtGuideIdx) {
    const minIdx = Math.min(srcGuideIdx, tgtGuideIdx);
    const maxIdx = Math.max(srcGuideIdx, tgtGuideIdx);
    // Pick the channel closest to the midpoint between source and target
    let bestChannel = (sortedGuides[minIdx] + sortedGuides[maxIdx]) / 2;
    // If there are intermediate guides, pick the channel between the two
    // guides that straddle the midpoint
    const midPos = (sourcePos + targetPos) / 2;
    for (let i = minIdx; i < maxIdx; i++) {
      const chanMid = (sortedGuides[i] + sortedGuides[i + 1]) / 2;
      if (Math.abs(chanMid - midPos) < Math.abs(bestChannel - midPos)) {
        bestChannel = chanMid;
      }
    }
    return bestChannel + spread;
  }

  // Same guide — pick the wider adjacent channel
  const guidePos = sortedGuides[srcGuideIdx];
  const above = srcGuideIdx > 0
    ? (guidePos + sortedGuides[srcGuideIdx - 1]) / 2
    : guidePos - OUTER_MARGIN;
  const below = srcGuideIdx < sortedGuides.length - 1
    ? (guidePos + sortedGuides[srcGuideIdx + 1]) / 2
    : guidePos + OUTER_MARGIN;

  // Prefer the side where the target is, or the wider channel
  const targetBelow = targetPos >= sourcePos;
  if (targetBelow) {
    return below + spread;
  }
  return above + spread;
}

function nearestGuideIndex(pos: number, sorted: number[]): number {
  let best = 0;
  let bestDist = Math.abs(pos - sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const d = Math.abs(pos - sorted[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mid-X/Y picking
// ---------------------------------------------------------------------------

function pickMidX(
  stub1: number, stub2: number,
  dir1: number, dir2: number,
): number {
  // Both going right: pick rightmost stub
  if (dir1 > 0 && dir2 < 0) return (stub1 + stub2) / 2;
  if (dir1 > 0) return Math.max(stub1, stub2);
  if (dir2 > 0) return Math.max(stub1, stub2);
  return Math.min(stub1, stub2);
}

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

/**
 * Build a Z-shaped path (horizontal stubs with channel jog) for
 * horizontal-to-horizontal connections across different rows.
 *
 *   source ──stub──┐
 *                   │ (channel)
 *         ┌────────┘
 *         └──stub── target
 */
function buildZPath(
  sx: number, sy: number,
  tx: number, ty: number,
  stubX: number, channelY: number,
  srcDir: number, _tgtDir: number,
): [string, number, number] {
  const r = CORNER_RADIUS;

  // Key X coordinates
  const x1 = stubX; // where the first vertical segment starts
  // For Z-path: the vertical goes from sy to channelY, then horizontal
  // to above/below target, then vertical to ty

  // Clamp radius to half the available space
  const dy1 = channelY - sy;
  const dy2 = ty - channelY;
  const dx = tx - x1;
  const cr1 = clampRadius(r, Math.abs(dy1), Math.abs(srcDir * MIN_STUB));
  const cr2 = clampRadius(r, Math.abs(dy2), Math.abs(dx));

  // Sign helpers
  const sdy1 = Math.sign(dy1) || 1;
  const sdy2 = Math.sign(dy2) || -1;
  const sdx = Math.sign(dx) || 1;

  const path = [
    `M ${sx} ${sy}`,
    // Horizontal stub from source
    `L ${x1 - srcDir * cr1} ${sy}`,
    // Arc: turn from horizontal to vertical
    `A ${cr1} ${cr1} 0 0 ${sweepFlag(srcDir, sdy1)} ${x1} ${sy + sdy1 * cr1}`,
    // Vertical to channel
    `L ${x1} ${channelY - sdy1 * cr1}`,
    // Arc: turn from vertical to horizontal (into channel)
    `A ${cr1} ${cr1} 0 0 ${sweepFlag(sdy1, sdx)} ${x1 + sdx * cr1} ${channelY}`,
    // Horizontal through channel
    `L ${tx - sdx * cr2} ${channelY}`,
    // Arc: turn from horizontal to vertical (exit channel)
    `A ${cr2} ${cr2} 0 0 ${sweepFlag(sdx, sdy2)} ${tx} ${channelY + sdy2 * cr2}`,
    // Vertical to target row
    `L ${tx} ${ty}`,
  ].join(" ");

  const labelX = (x1 + tx) / 2;
  const labelY = channelY;
  return [path, labelX, labelY];
}

/**
 * Build a U-shaped path for same-row horizontal connections.
 *
 *   source ──┐         ┌── target
 *            │ channel  │
 *            └─────────┘
 */
function buildUPath(
  sx: number, sy: number,
  tx: number, ty: number,
  midX: number, channelY: number,
  srcDir: number, tgtDir: number,
): [string, number, number] {
  const r = CORNER_RADIUS;
  const dy = channelY - sy;
  const sdy = Math.sign(dy) || 1;

  const cr = clampRadius(r, Math.abs(dy) / 2, MIN_STUB);

  // Source stub
  const sx2 = sx + srcDir * MIN_STUB;
  // Target stub
  const tx2 = tx + tgtDir * MIN_STUB;

  const sdx1 = Math.sign(sx2 - sx) || 1;
  const sdx2 = Math.sign(tx2 - tx) || -1;

  const path = [
    `M ${sx} ${sy}`,
    `L ${sx2 - sdx1 * cr} ${sy}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(sdx1, sdy)} ${sx2} ${sy + sdy * cr}`,
    `L ${sx2} ${channelY - sdy * cr}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(sdy, Math.sign(tx2 - sx2) || 1)} ${sx2 + Math.sign(tx2 - sx2) * cr} ${channelY}`,
    `L ${tx2 - Math.sign(tx2 - sx2) * cr} ${channelY}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(Math.sign(tx2 - sx2) || 1, -sdy)} ${tx2} ${channelY - sdy * cr}`,
    `L ${tx2} ${ty + sdy * cr}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(-sdy, sdx2)} ${tx2 + sdx2 * cr} ${ty}`,
    `L ${tx} ${ty}`,
  ].join(" ");

  const labelX = (sx2 + tx2) / 2;
  const labelY = channelY;
  return [path, labelX, labelY];
}

/**
 * Build a Z-shaped path for vertical-to-vertical connections.
 */
function buildZPathVertical(
  sx: number, sy: number,
  tx: number, ty: number,
  channelX: number, stubY: number,
  srcDir: number, _tgtDir: number,
): [string, number, number] {
  const r = CORNER_RADIUS;

  const y1 = stubY;
  const dx1 = channelX - sx;
  const dx2 = tx - channelX;
  const dy = ty - y1;
  const cr1 = clampRadius(r, Math.abs(dx1), Math.abs(srcDir * MIN_STUB));
  const cr2 = clampRadius(r, Math.abs(dx2), Math.abs(dy));

  const sdx1 = Math.sign(dx1) || 1;
  const sdx2 = Math.sign(dx2) || -1;
  const sdy = Math.sign(dy) || 1;

  const path = [
    `M ${sx} ${sy}`,
    `L ${sx} ${y1 - srcDir * cr1}`,
    `A ${cr1} ${cr1} 0 0 ${sweepFlag(srcDir, sdx1)} ${sx + sdx1 * cr1} ${y1}`,
    `L ${channelX - sdx1 * cr1} ${y1}`,
    `A ${cr1} ${cr1} 0 0 ${sweepFlag(sdx1, sdy)} ${channelX} ${y1 + sdy * cr1}`,
    `L ${channelX} ${ty - sdy * cr2}`,
    `A ${cr2} ${cr2} 0 0 ${sweepFlag(sdy, sdx2)} ${channelX + sdx2 * cr2} ${ty}`,
    `L ${tx} ${ty}`,
  ].join(" ");

  const labelX = channelX;
  const labelY = (y1 + ty) / 2;
  return [path, labelX, labelY];
}

/**
 * Build a U-shaped path for same-column vertical connections.
 */
function buildUPathVertical(
  sx: number, sy: number,
  tx: number, ty: number,
  channelX: number, midY: number,
  srcDir: number, tgtDir: number,
): [string, number, number] {
  const r = CORNER_RADIUS;
  const dx = channelX - sx;
  const sdx = Math.sign(dx) || 1;

  const cr = clampRadius(r, Math.abs(dx) / 2, MIN_STUB);

  const sy2 = sy + srcDir * MIN_STUB;
  const ty2 = ty + tgtDir * MIN_STUB;

  const sdy1 = Math.sign(sy2 - sy) || 1;
  const sdy2 = Math.sign(ty2 - ty) || -1;

  const path = [
    `M ${sx} ${sy}`,
    `L ${sx} ${sy2 - sdy1 * cr}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(sdy1, sdx)} ${sx + sdx * cr} ${sy2}`,
    `L ${channelX - sdx * cr} ${sy2}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(sdx, Math.sign(ty2 - sy2) || 1)} ${channelX} ${sy2 + Math.sign(ty2 - sy2) * cr}`,
    `L ${channelX} ${ty2 - Math.sign(ty2 - sy2) * cr}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(Math.sign(ty2 - sy2) || 1, -sdx)} ${channelX - sdx * cr} ${ty2}`,
    `L ${sx + sdx * cr} ${ty2}`,
    `A ${cr} ${cr} 0 0 ${sweepFlag(-sdx, sdy2)} ${sx} ${ty2 + sdy2 * cr}`,
    `L ${tx} ${ty}`,
  ].join(" ");

  const labelX = channelX;
  const labelY = (sy2 + ty2) / 2;
  return [path, labelX, labelY];
}

/**
 * Build an L-shaped path with a single rounded corner.
 */
function buildLPath(
  sx: number, sy: number,
  cx: number, cy: number,
  tx: number, ty: number,
  r: number,
): string {
  const dx1 = cx - sx;
  const dy1 = cy - sy;
  const dx2 = tx - cx;
  const dy2 = ty - cy;

  // Direction of first and second segments
  const horiz1 = Math.abs(dx1) > Math.abs(dy1);

  if (horiz1) {
    // First segment horizontal, second vertical
    const sdx = Math.sign(dx1) || 1;
    const sdy = Math.sign(dy2) || 1;
    const cr = Math.min(r, Math.abs(dx1), Math.abs(dy2));
    return [
      `M ${sx} ${sy}`,
      `L ${cx - sdx * cr} ${cy}`,
      `A ${cr} ${cr} 0 0 ${sweepFlag(sdx, sdy)} ${cx} ${cy + sdy * cr}`,
      `L ${tx} ${ty}`,
    ].join(" ");
  } else {
    // First segment vertical, second horizontal
    const sdy = Math.sign(dy1) || 1;
    const sdx = Math.sign(dx2) || 1;
    const cr = Math.min(r, Math.abs(dy1), Math.abs(dx2));
    return [
      `M ${sx} ${sy}`,
      `L ${cx} ${cy - sdy * cr}`,
      `A ${cr} ${cr} 0 0 ${sweepFlag(sdy, sdx)} ${cx + sdx * cr} ${cy}`,
      `L ${tx} ${ty}`,
    ].join(" ");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the SVG arc sweep-flag for a turn.
 *
 * For a right turn (clockwise), sweep = 1.
 * For a left turn (counter-clockwise), sweep = 0.
 *
 * We determine this from the cross product of the entry and exit directions.
 * entry direction encoded as (dx, 0) or (0, dy) for the axis we're arriving on,
 * exit direction as the perpendicular axis.
 */
function sweepFlag(entrySign: number, exitSign: number): 0 | 1 {
  // Cross product z-component of (entryDir) × (exitDir)
  // For horizontal entry (dx, 0) turning to vertical exit (0, dy): cross = dx * dy
  // Positive cross = clockwise turn = sweep 1
  return (entrySign * exitSign > 0) ? 1 : 0;
}

function clampRadius(r: number, ...limits: number[]): number {
  let clamped = r;
  for (const lim of limits) {
    clamped = Math.min(clamped, Math.max(0, lim / 2));
  }
  return Math.max(0, clamped);
}

/**
 * Deterministic spread offset from edge ID to prevent overlapping
 * parallel connectors. Returns a small ±px offset.
 */
function spreadOffset(edgeId: string): number {
  let hash = 0;
  for (let i = 0; i < edgeId.length; i++) {
    hash = ((hash << 5) - hash + edgeId.charCodeAt(i)) | 0;
  }
  // Map to range [-4, 4] in steps of 2
  return ((hash % 5) - 2) * 2;
}
