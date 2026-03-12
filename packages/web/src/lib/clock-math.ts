import { Position } from "@xyflow/react";
import type React from "react";

/**
 * All 24 clock labels in clockwise order starting from 12:00.
 */
export const ALL_CLOCK_LABELS = [
  "12:00", "12:30", "1:00", "1:30", "2:00", "2:30",
  "3:00", "3:30", "4:00", "4:30", "5:00", "5:30",
  "6:00", "6:30", "7:00", "7:30", "8:00", "8:30",
  "9:00", "9:30", "10:00", "10:30", "11:00", "11:30",
] as const;

/**
 * The 12 full-hour labels.
 */
export const FULL_HOUR_LABELS = new Set([
  "12:00", "1:00", "2:00", "3:00", "4:00", "5:00",
  "6:00", "7:00", "8:00", "9:00", "10:00", "11:00",
]);

/**
 * The original 8 positions that had visible handles before this expansion.
 */
export const ORIGINAL_CLOCK_LABELS = new Set([
  "12:00", "1:30", "3:00", "4:30", "6:00", "7:30", "9:00", "10:30",
]);

/**
 * Convert a clock label like "2:30" to degrees clockwise from 12:00 (north).
 * 12:00 = 0°, 3:00 = 90°, 6:00 = 180°, 9:00 = 270°.
 */
export function clockLabelToDegrees(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return ((h % 12) * 30 + m * 0.5) % 360;
}

/**
 * Convert degrees clockwise from 12:00 to radians in standard math orientation
 * (counter-clockwise from east / positive-x axis).
 */
function clockDegreesToRadians(deg: number): number {
  return ((90 - deg) * Math.PI) / 180;
}

/**
 * Given an offset (dx, dy) from a node's center (screen coords: +x right, +y down),
 * return the nearest clock label.
 */
export function nearestClockLabel(dx: number, dy: number): string {
  // Compute angle in degrees clockwise from north
  // atan2 gives angle from positive-x axis, counter-clockwise
  // We want clockwise from north (negative-y axis)
  const rad = Math.atan2(dx, -dy); // note: atan2(x, -y) gives clockwise-from-north
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;

  // Each of 24 positions is 15° apart. Find nearest.
  const index = Math.round(deg / 15) % 24;
  return ALL_CLOCK_LABELS[index];
}

/**
 * Compute the React Flow Position (which edge) and CSS style for placing a
 * Handle at the given clock position on a rectangular node.
 *
 * Uses ray-from-center intersection with a unit square to determine which edge
 * the clock position falls on and the percentage along that edge.
 */
export function clockToRectHandle(label: string): {
  position: Position;
  style: React.CSSProperties;
} {
  const deg = clockLabelToDegrees(label);
  const rad = clockDegreesToRadians(deg);
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad); // screen-y is inverted

  // Find where ray from center hits the unit square [-1, 1] × [-1, 1]
  const candidates: { t: number; side: "top" | "bottom" | "left" | "right" }[] = [];
  if (dx > 1e-9) candidates.push({ t: 1 / dx, side: "right" });
  if (dx < -1e-9) candidates.push({ t: -1 / dx, side: "left" });
  if (dy > 1e-9) candidates.push({ t: 1 / dy, side: "bottom" });
  if (dy < -1e-9) candidates.push({ t: -1 / dy, side: "top" });

  candidates.sort((a, b) => a.t - b.t);
  const hit = candidates[0];
  const hitX = hit.t * dx; // range [-1, 1]
  const hitY = hit.t * dy; // range [-1, 1]

  switch (hit.side) {
    case "top":
      return {
        position: Position.Top,
        style: { left: `${(hitX + 1) * 50}%` },
      };
    case "bottom":
      return {
        position: Position.Bottom,
        style: { left: `${(hitX + 1) * 50}%` },
      };
    case "right":
      return {
        position: Position.Right,
        style: { top: `${(hitY + 1) * 50}%` },
      };
    case "left":
      return {
        position: Position.Left,
        style: { top: `${(hitY + 1) * 50}%` },
      };
  }
}

/**
 * Compute the CSS top/left percentages for placing a handle at the given clock
 * position on a circular node's perimeter.
 */
export function clockToCirclePoint(label: string): {
  top: string;
  left: string;
} {
  const deg = clockLabelToDegrees(label);
  const rad = clockDegreesToRadians(deg);
  const pctX = 50 + 50 * Math.cos(rad);
  const pctY = 50 - 50 * Math.sin(rad); // screen-y inverted
  return { top: `${pctY}%`, left: `${pctX}%` };
}

/**
 * Compute (x, y) position on a circle of given radius centered at (cx, cy)
 * for a clock label. Used by ClockFaceOverlay.
 */
export function clockToXY(
  label: string,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const deg = clockLabelToDegrees(label);
  const rad = clockDegreesToRadians(deg);
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}
