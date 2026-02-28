import type { DiagramSpec, SizePaletteEntry } from "@objectify/schema";

/** Get the size palette from a spec. Returns empty array if absent. */
export function getSizePalette(spec: DiagramSpec): SizePaletteEntry[] {
  return spec.sizePalette ?? [];
}

/**
 * Update a size palette entry. Cascades: if dimensions change, all nodes
 * referencing this sizeId will get new dimensions on next render (since
 * rendering resolves sizeId → dimensions from the palette).
 * If the id changes, cascades to all node sizeId references.
 */
export function updateSizePaletteEntry(
  spec: DiagramSpec,
  sizeId: string,
  updates: Partial<SizePaletteEntry>
): DiagramSpec {
  const palette = spec.sizePalette;
  if (!palette) return spec;

  const idx = palette.findIndex((e) => e.id === sizeId);
  if (idx === -1) return spec;

  const newPalette = palette.map((e, i) =>
    i === idx ? { ...e, ...updates } : e
  );

  const idChanged = updates.id && updates.id !== sizeId;
  const newDiagrams = idChanged
    ? spec.diagrams.map((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.sizeId === sizeId ? { ...n, sizeId: updates.id } : n
        ),
      }))
    : spec.diagrams;

  return { ...spec, sizePalette: newPalette, diagrams: newDiagrams };
}

/** Add a new size class. Max 20 entries. */
export function addSizePaletteEntry(
  spec: DiagramSpec,
  entry: SizePaletteEntry
): DiagramSpec {
  const palette = spec.sizePalette ?? [];
  if (palette.length >= 20) return spec;
  if (palette.some((e) => e.id === entry.id)) return spec;
  return { ...spec, sizePalette: [...palette, entry] };
}

/** Remove a size class. Nodes referencing it fall back to default sizing. */
export function removeSizePaletteEntry(
  spec: DiagramSpec,
  sizeId: string
): DiagramSpec {
  const palette = spec.sizePalette;
  if (!palette) return spec;
  return { ...spec, sizePalette: palette.filter((e) => e.id !== sizeId) };
}
