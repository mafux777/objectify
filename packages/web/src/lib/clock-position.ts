import type { ClockPosition } from "@objectify/schema";

export type { ClockPosition };

export type PositionStyle = {
  top?: string | number;
  bottom?: string | number;
  left?: string | number;
  right?: string | number;
  transform?: string;
  textAlign: "left" | "center" | "right";
  isOutside: boolean;
};

const GAP = 6; // px between node edge and outside label

export function clockToStyle(position: ClockPosition): PositionStyle {
  switch (position) {
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", isOutside: false };
    case "12:00":
      return { bottom: `calc(100% + ${GAP}px)`, left: "50%", transform: "translateX(-50%)", textAlign: "center", isOutside: true };
    case "1:30":
      return { bottom: `calc(100% + ${GAP}px)`, left: `calc(100% + ${GAP}px)`, textAlign: "left", isOutside: true };
    case "3:00":
      return { top: "50%", left: `calc(100% + ${GAP}px)`, transform: "translateY(-50%)", textAlign: "left", isOutside: true };
    case "4:30":
      return { top: `calc(100% + ${GAP}px)`, left: `calc(100% + ${GAP}px)`, textAlign: "left", isOutside: true };
    case "6:00":
      return { top: `calc(100% + ${GAP}px)`, left: "50%", transform: "translateX(-50%)", textAlign: "center", isOutside: true };
    case "7:30":
      return { top: `calc(100% + ${GAP}px)`, right: `calc(100% + ${GAP}px)`, textAlign: "right", isOutside: true };
    case "9:00":
      return { top: "50%", right: `calc(100% + ${GAP}px)`, transform: "translateY(-50%)", textAlign: "right", isOutside: true };
    case "10:30":
      return { bottom: `calc(100% + ${GAP}px)`, right: `calc(100% + ${GAP}px)`, textAlign: "right", isOutside: true };
  }
}
