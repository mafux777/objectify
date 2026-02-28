import type { DiagramSpec, SemanticTypeEntry } from "@objectify/schema";

/** Get semantic types from a spec. Returns empty array if absent. */
export function getSemanticTypes(spec: DiagramSpec): SemanticTypeEntry[] {
  return spec.semanticTypes ?? [];
}

/**
 * Update a semantic type entry. If the id changes, cascades to all
 * node semanticTypeId references.
 */
export function updateSemanticType(
  spec: DiagramSpec,
  typeId: string,
  updates: Partial<SemanticTypeEntry>
): DiagramSpec {
  const types = spec.semanticTypes;
  if (!types) return spec;

  const idx = types.findIndex((e) => e.id === typeId);
  if (idx === -1) return spec;

  const newTypes = types.map((e, i) =>
    i === idx ? { ...e, ...updates } : e
  );

  const idChanged = updates.id && updates.id !== typeId;
  const newDiagrams = idChanged
    ? spec.diagrams.map((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.semanticTypeId === typeId
            ? { ...n, semanticTypeId: updates.id }
            : n
        ),
      }))
    : spec.diagrams;

  return { ...spec, semanticTypes: newTypes, diagrams: newDiagrams };
}

/** Add a new semantic type. Max 30 entries. */
export function addSemanticType(
  spec: DiagramSpec,
  entry: SemanticTypeEntry
): DiagramSpec {
  const types = spec.semanticTypes ?? [];
  if (types.length >= 30) return spec;
  if (types.some((e) => e.id === entry.id)) return spec;
  return { ...spec, semanticTypes: [...types, entry] };
}

/** Remove a semantic type. Nodes referencing it retain their semanticTypeId as orphaned. */
export function removeSemanticType(
  spec: DiagramSpec,
  typeId: string
): DiagramSpec {
  const types = spec.semanticTypes;
  if (!types) return spec;
  return { ...spec, semanticTypes: types.filter((e) => e.id !== typeId) };
}
