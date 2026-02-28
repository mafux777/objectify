import type { DiagramSpec, ColorPaletteEntry } from "@objectify/schema";

/**
 * Get the palette from a spec. Returns empty array if no palette present.
 */
export function getPalette(spec: DiagramSpec): ColorPaletteEntry[] {
  return spec.palette ?? [];
}

/**
 * Update a single palette color by ID. Cascades the change: every node style
 * and edge color that matched the old hex value is replaced with the new hex
 * across all diagrams.
 */
export function updatePaletteColor(
  spec: DiagramSpec,
  colorId: string,
  newHex: string
): DiagramSpec {
  const palette = spec.palette;
  if (!palette) return spec;

  const entry = palette.find(
    (e) => e.id === colorId
  );
  if (!entry) return spec;

  const oldHex = entry.hex.toUpperCase();
  const normalizedNewHex = newHex.toUpperCase();

  // Update the palette entry itself
  const newPalette = palette.map((e) =>
    e.id === colorId ? { ...e, hex: normalizedNewHex } : e
  );

  // Replace all occurrences of oldHex with newHex across every diagram
  const newDiagrams = spec.diagrams.map((diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        backgroundColor: hexMatch(node.style.backgroundColor, oldHex)
          ? normalizedNewHex
          : node.style.backgroundColor,
        textColor: hexMatch(node.style.textColor, oldHex)
          ? normalizedNewHex
          : node.style.textColor,
        ...(node.style.borderColor !== undefined
          ? {
              borderColor: hexMatch(node.style.borderColor, oldHex)
                ? normalizedNewHex
                : node.style.borderColor,
            }
          : {}),
      },
    })),
    edges: diagram.edges.map((edge) => ({
      ...edge,
      ...(edge.style
        ? {
            style: {
              ...edge.style,
              color: hexMatch(edge.style.color, oldHex)
                ? normalizedNewHex
                : edge.style.color,
            },
          }
        : {}),
    })),
  }));

  return { ...spec, palette: newPalette, diagrams: newDiagrams };
}

/**
 * Add a new color to the palette. Returns the spec unchanged if:
 * - the palette already has 20 entries (max)
 * - an entry with the same ID already exists
 */
export function addPaletteColor(
  spec: DiagramSpec,
  entry: ColorPaletteEntry
): DiagramSpec {
  const palette = spec.palette ?? [];
  if (palette.length >= 20) return spec;
  if (palette.some((e) => e.id === entry.id)) return spec;
  return { ...spec, palette: [...palette, entry] };
}

/**
 * Remove a palette color by ID. Node/edge colors that used the removed entry's
 * hex value retain their hex strings — they simply become "orphaned" from the
 * palette.
 */
export function removePaletteColor(
  spec: DiagramSpec,
  colorId: string
): DiagramSpec {
  const palette = spec.palette;
  if (!palette) return spec;
  return {
    ...spec,
    palette: palette.filter((e) => e.id !== colorId),
  };
}

// --- helpers ---

/** Case-insensitive hex comparison */
function hexMatch(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}
