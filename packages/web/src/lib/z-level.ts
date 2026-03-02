/**
 * Maps the five named z-levels from the diagram spec to numeric
 * zIndex values consumed by React Flow.
 */
export const Z_LEVEL_MAP: Record<string, number> = {
  background: 0,
  base: 1,
  raised: 2,
  foreground: 3,
  overlay: 4,
};

/** Resolve a node's zLevel string to a numeric zIndex (defaults to "base"). */
export function zLevelToIndex(zLevel?: string): number {
  return Z_LEVEL_MAP[zLevel ?? "base"] ?? 1;
}
