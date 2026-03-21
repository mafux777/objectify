import { createContext, useContext } from "react";
import type { GuideLine } from "@objectify/schema";

export interface GuidesContextValue {
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Provides guide positions and canvas dimensions to edge components.
 * Only populated for guide-based layouts; null for ELK auto-layout diagrams.
 */
export const GuidesContext = createContext<GuidesContextValue | null>(null);

/**
 * Read the guides context. Returns null when outside a provider
 * (non-guide diagrams) — callers should fall back gracefully.
 */
export function useGuides(): GuidesContextValue | null {
  return useContext(GuidesContext);
}
