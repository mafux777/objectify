export type Command =
  | { type: "add-node"; label: string }
  | { type: "delete-node"; label: string }
  | { type: "connect"; sourceLabel: string; targetLabel: string }
  | { type: "disconnect"; sourceLabel: string; targetLabel: string }
  | { type: "rename"; oldLabel: string; newLabel: string }
  | { type: "color"; label: string; color: string }
  | { type: "move"; label: string; direction: string; amount: number };

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

  return null;
}
