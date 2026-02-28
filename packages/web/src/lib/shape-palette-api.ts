import type { DiagramSpec, ShapePaletteEntry } from "@objectify/schema";

/** Get the shape palette from a spec. Returns empty array if absent. */
export function getShapePalette(spec: DiagramSpec): ShapePaletteEntry[] {
  return spec.shapePalette ?? [];
}

/** Update a shape palette entry. If the id itself changes, cascades to all node shapeId refs. */
export function updateShapePaletteEntry(
  spec: DiagramSpec,
  shapeId: string,
  updates: Partial<ShapePaletteEntry>
): DiagramSpec {
  const palette = spec.shapePalette;
  if (!palette) return spec;

  const idx = palette.findIndex((e) => e.id === shapeId);
  if (idx === -1) return spec;

  const newPalette = palette.map((e, i) =>
    i === idx ? { ...e, ...updates } : e
  );

  // If the id was changed, update all node references
  const idChanged = updates.id && updates.id !== shapeId;
  const newDiagrams = idChanged
    ? spec.diagrams.map((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.shapeId === shapeId ? { ...n, shapeId: updates.id } : n
        ),
      }))
    : spec.diagrams;

  return { ...spec, shapePalette: newPalette, diagrams: newDiagrams };
}

/** Add a new shape to the palette. Max 15 entries. */
export function addShapePaletteEntry(
  spec: DiagramSpec,
  entry: ShapePaletteEntry
): DiagramSpec {
  const palette = spec.shapePalette ?? [];
  if (palette.length >= 15) return spec;
  if (palette.some((e) => e.id === entry.id)) return spec;
  return { ...spec, shapePalette: [...palette, entry] };
}

/** Remove a shape from the palette. Nodes referencing it become orphaned. */
export function removeShapePaletteEntry(
  spec: DiagramSpec,
  shapeId: string
): DiagramSpec {
  const palette = spec.shapePalette;
  if (!palette) return spec;
  return { ...spec, shapePalette: palette.filter((e) => e.id !== shapeId) };
}
