const FONT_STACKS: Record<string, string> = {
  "sans-serif": "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  monospace:
    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  serif: "Georgia, 'Times New Roman', serif",
};

const DEFAULT_STACK = FONT_STACKS["sans-serif"];

export function fontStack(family?: string): string {
  if (!family) return DEFAULT_STACK;
  return FONT_STACKS[family] ?? family;
}
