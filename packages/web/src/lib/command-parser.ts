export type Command =
  | { type: "add-node"; label: string }
  | { type: "delete-node"; label: string }
  | { type: "connect"; sourceLabel: string; targetLabel: string }
  | { type: "disconnect"; sourceLabel: string; targetLabel: string }
  | { type: "rename"; oldLabel: string; newLabel: string }
  | { type: "color"; label: string; color: string }
  | { type: "move"; label: string; direction: string; amount: number }
  | { type: "move-guide"; guideId: string; direction: "up" | "down" | "left" | "right"; amount: number }
  | { type: "add-guide"; direction: "horizontal" | "vertical"; position: number }
  | { type: "delete-guide"; guideId: string };

export function parseCommand(input: string): Command | null {
  const trimmed = input.trim();

  // add box "Label"
  let match = trimmed.match(/^add\s+(?:box|node)\s+"([^"]+)"$/i);
  if (match) return { type: "add-node", label: match[1] };

  // delete "Label"
  match = trimmed.match(/^(?:delete|remove)\s+"([^"]+)"$/i);
  if (match) return { type: "delete-node", label: match[1] };

  // connect "A" to "B"
  match = trimmed.match(/^connect\s+"([^"]+)"\s+to\s+"([^"]+)"$/i);
  if (match) return { type: "connect", sourceLabel: match[1], targetLabel: match[2] };

  // disconnect "A" from "B"
  match = trimmed.match(/^disconnect\s+"([^"]+)"\s+from\s+"([^"]+)"$/i);
  if (match) return { type: "disconnect", sourceLabel: match[1], targetLabel: match[2] };

  // rename "Old" to "New"
  match = trimmed.match(/^rename\s+"([^"]+)"\s+to\s+"([^"]+)"$/i);
  if (match) return { type: "rename", oldLabel: match[1], newLabel: match[2] };

  // color "Label" #hex
  match = trimmed.match(/^color\s+"([^"]+)"\s+(#[0-9a-fA-F]{3,8})$/i);
  if (match) return { type: "color", label: match[1], color: match[2] };

  // move "Label" right 50
  match = trimmed.match(
    /^move\s+"([^"]+)"\s+(up|down|left|right)\s+(\d+)$/i
  );
  if (match)
    return {
      type: "move",
      label: match[1],
      direction: match[2].toLowerCase(),
      amount: parseInt(match[3], 10),
    };

  // move guide "row-1" down 50
  match = trimmed.match(
    /^move\s+guide\s+"([^"]+)"\s+(up|down|left|right)\s+(\d+)$/i
  );
  if (match)
    return {
      type: "move-guide",
      guideId: match[1],
      direction: match[2].toLowerCase() as "up" | "down" | "left" | "right",
      amount: parseInt(match[3], 10),
    };

  // add guide horizontal 0.5
  match = trimmed.match(
    /^add\s+guide\s+(horizontal|vertical)\s+([0-9.]+)$/i
  );
  if (match)
    return {
      type: "add-guide",
      direction: match[1].toLowerCase() as "horizontal" | "vertical",
      position: parseFloat(match[2]),
    };

  // delete guide "row-1"
  match = trimmed.match(/^(?:delete|remove)\s+guide\s+"([^"]+)"$/i);
  if (match) return { type: "delete-guide", guideId: match[1] };

  return null;
}
