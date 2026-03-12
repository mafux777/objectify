import { createContext, useContext } from "react";

export interface ClockFaceDragAPI {
  startDrag: (
    edgeId: string,
    end: "source" | "target",
    event: React.PointerEvent,
  ) => void;
}

export const ClockFaceDragContext = createContext<ClockFaceDragAPI | null>(null);

export function useClockFaceDragContext(): ClockFaceDragAPI | null {
  return useContext(ClockFaceDragContext);
}
