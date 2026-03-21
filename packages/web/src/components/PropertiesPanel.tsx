import { useEffect, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
  GuideLine,
} from "@objectify/schema";

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  nodes: Node[];
  guides: GuideLine[];
  specDescription: string;
  palette?: ColorPaletteEntry[];
  shapePalette?: ShapePaletteEntry[];
  sizePalette?: SizePaletteEntry[];
  semanticTypes?: SemanticTypeEntry[];
  onPatchNode: (nodeId: string, patch: Record<string, unknown>) => void;
  onPatchEdge: (edgeId: string, patch: Record<string, unknown>) => void;
  onPatchGuide: (guideId: string, position: number) => void;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

/** Clickable node reference — selects the node in the editor */
function NodeLink({
  nodeId,
  label,
  onSelect,
}: {
  nodeId: string;
  label: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className="properties-panel__node-link"
      onClick={() => onSelect(nodeId)}
      title={`Select "${label}" (${nodeId})`}
    >
      {label}
    </button>
  );
}

/** Stepper for a normalized 0–1 coordinate */
function CoordStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const display = value.toFixed(4);
  return (
    <div className="properties-panel__coord-row">
      <span className="properties-panel__coord-label">{label}</span>
      <button
        className="properties-panel__coord-btn"
        onClick={() => onChange(value - 0.01)}
        title={`Decrease ${label} by 0.01`}
      >
        −
      </button>
      <span className="properties-panel__coord-value">{display}</span>
      <button
        className="properties-panel__coord-btn"
        onClick={() => onChange(value + 0.01)}
        title={`Increase ${label} by 0.01`}
      >
        +
      </button>
    </div>
  );
}

export function PropertiesPanel({
  selectedNode,
  selectedEdge,
  nodes,
  guides,
  specDescription,
  palette,
  shapePalette,
  sizePalette,
  semanticTypes,
  onPatchNode,
  onPatchEdge,
  onPatchGuide,
  onSelectNode,
  onClose,
}: PropertiesPanelProps) {
  const nodeData = selectedNode?.data as Record<string, unknown> | undefined;
  const edgeData = (selectedEdge as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;

  // Local URL state — synced to selected node; committed on blur.
  const committedUrl = (nodeData?.url as string) ?? "";
  const [urlValue, setUrlValue] = useState<string>(committedUrl);

  useEffect(() => {
    setUrlValue(committedUrl);
  }, [selectedNode?.id, committedUrl]);

  const commitUrl = () => {
    if (!selectedNode) return;
    const trimmed = urlValue.trim();
    onPatchNode(selectedNode.id, { url: trimmed || undefined });
  };

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const nodeStyle = nodeData?.style as Record<string, unknown> | undefined;
  const currentBg = (nodeStyle?.backgroundColor as string) ?? "";
  const currentTextColor = (nodeStyle?.textColor as string) ?? "#000000";
  const currentShapeId = (nodeData?.shapeId as string) ?? "";
  const currentSizeId = (nodeData?.sizeId as string) ?? "";
  const currentSemanticTypeId = (nodeData?.semanticTypeId as string) ?? "";

  // Guide lookups
  const guideMap = new Map(guides.map((g) => [g.id, g]));
  const getGuideLabel = (id: string | undefined) => {
    if (!id) return null;
    const g = guideMap.get(id);
    return g ? (g.label ?? g.id) : id;
  };

  // Absolute position helpers
  const getAbsolutePosition = (node: Node): { x: number; y: number } => {
    if (node.parentId) {
      const parent = nodes.find((n) => n.id === node.parentId);
      if (parent) {
        return {
          x: node.position.x + parent.position.x,
          y: node.position.y + parent.position.y,
        };
      }
    }
    return { x: node.position.x, y: node.position.y };
  };

  // Group / membership
  const isGroup = selectedNode?.type === "groupNode";
  const children = selectedNode
    ? nodes.filter((n) => n.parentId === selectedNode.id)
    : [];
  const parentNode = selectedNode?.parentId
    ? nodes.find((n) => n.id === selectedNode.parentId)
    : null;

  const nodeLabel = (n: Node) =>
    (n.data as Record<string, unknown>)?.label as string ?? n.id;

  // Guide coordinate for node center (normalized 0–1)
  const rowGuideId = nodeData?.guideRow as string | undefined;
  const colGuideId = nodeData?.guideColumn as string | undefined;
  const rowGuide = rowGuideId ? guideMap.get(rowGuideId) : undefined;
  const colGuide = colGuideId ? guideMap.get(colGuideId) : undefined;

  return (
    <div className="properties-panel">
      <div className="properties-panel__header">
        <span className="properties-panel__title">
          {selectedNode
            ? isGroup
              ? "Group"
              : "Node"
            : selectedEdge
              ? "Connector"
              : "Description"}
        </span>
        <button className="properties-panel__close" onClick={onClose} title="Close panel">
          ✕
        </button>
      </div>

      <div className="properties-panel__body">
        {/* ── No selection: show spec description ── */}
        {!selectedNode && !selectedEdge && (
          <p className="properties-panel__description">{specDescription || <em>No description.</em>}</p>
        )}

        {/* ── Node selected ── */}
        {selectedNode && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">ID</label>
              <span className="properties-panel__value properties-panel__value--mono">{selectedNode.id}</span>
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">Label</label>
              <span className="properties-panel__value">
                {(nodeData?.label as string) ?? selectedNode.id}
              </span>
            </div>

            {nodeData?.description && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Description</label>
                <span className="properties-panel__value">{nodeData.description as string}</span>
              </div>
            )}

            {/* ── Absolute coordinates ── */}
            <div className="properties-panel__field">
              <label className="properties-panel__label">Absolute position</label>
              {(() => {
                const abs = getAbsolutePosition(selectedNode);
                const w = selectedNode.width ?? 160;
                const h = selectedNode.height ?? 50;
                return (
                  <div className="properties-panel__coords">
                    <div className="properties-panel__coord-pair">
                      <span className="properties-panel__coord-dim">x: {Math.round(abs.x)}</span>
                      <span className="properties-panel__coord-dim">y: {Math.round(abs.y)}</span>
                    </div>
                    <div className="properties-panel__coord-pair">
                      <span className="properties-panel__coord-dim">w: {Math.round(w)}</span>
                      <span className="properties-panel__coord-dim">h: {Math.round(h)}</span>
                    </div>
                    <div className="properties-panel__coord-pair">
                      <span className="properties-panel__coord-dim">
                        center: ({Math.round(abs.x + w / 2)}, {Math.round(abs.y + h / 2)})
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedNode.parentId && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Relative position</label>
                <div className="properties-panel__coord-pair">
                  <span className="properties-panel__coord-dim">
                    x: {Math.round(selectedNode.position.x)}, y: {Math.round(selectedNode.position.y)}
                  </span>
                </div>
              </div>
            )}

            {/* ── Guides with stepper ── */}
            {(rowGuide || colGuide) && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Guides</label>
                {rowGuide && (
                  <CoordStepper
                    label={`Row: ${rowGuide.label ?? rowGuide.id}`}
                    value={rowGuide.position}
                    onChange={(v) => onPatchGuide(rowGuide.id, v)}
                  />
                )}
                {colGuide && (
                  <CoordStepper
                    label={`Col: ${colGuide.label ?? colGuide.id}`}
                    value={colGuide.position}
                    onChange={(v) => onPatchGuide(colGuide.id, v)}
                  />
                )}
              </div>
            )}

            {/* Bottom/right edge guides (groups) */}
            {(nodeData?.guideRowBottom || nodeData?.guideColumnRight) && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Edge guides</label>
                {!!nodeData?.guideRowBottom && (
                  <div className="properties-panel__coord-row">
                    <span className="properties-panel__coord-label">
                      Bottom: {getGuideLabel(nodeData.guideRowBottom as string)}
                    </span>
                    <span className="properties-panel__coord-value">
                      {guideMap.get(nodeData.guideRowBottom as string)?.position.toFixed(4) ?? "?"}
                    </span>
                  </div>
                )}
                {!!nodeData?.guideColumnRight && (
                  <div className="properties-panel__coord-row">
                    <span className="properties-panel__coord-label">
                      Right: {getGuideLabel(nodeData.guideColumnRight as string)}
                    </span>
                    <span className="properties-panel__coord-value">
                      {guideMap.get(nodeData.guideColumnRight as string)?.position.toFixed(4) ?? "?"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Parent group ── */}
            {parentNode && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Parent group</label>
                <NodeLink
                  nodeId={parentNode.id}
                  label={nodeLabel(parentNode)}
                  onSelect={onSelectNode}
                />
              </div>
            )}

            {/* ── Children (if group) ── */}
            {isGroup && children.length > 0 && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">
                  Members ({children.length})
                </label>
                <div className="properties-panel__member-list">
                  {children.map((child) => (
                    <NodeLink
                      key={child.id}
                      nodeId={child.id}
                      label={nodeLabel(child)}
                      onSelect={onSelectNode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Color palette */}
            {palette && palette.length > 0 && (
              <>
                <div className="properties-panel__field">
                  <label className="properties-panel__label">Background</label>
                  <div className="properties-panel__swatches">
                    {palette.map((entry) => (
                      <button
                        key={entry.id}
                        className={`properties-panel__swatch${entry.hex === currentBg ? " properties-panel__swatch--active" : ""}`}
                        style={{ background: entry.hex }}
                        title={entry.name ?? entry.hex}
                        onClick={() =>
                          onPatchNode(selectedNode.id, {
                            style: { ...(nodeData?.style as object ?? {}), backgroundColor: entry.hex },
                          })
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="properties-panel__field">
                  <label className="properties-panel__label">Text color</label>
                  <div className="properties-panel__swatches">
                    {palette.map((entry) => (
                      <button
                        key={entry.id}
                        className={`properties-panel__swatch${entry.hex === currentTextColor ? " properties-panel__swatch--active" : ""}`}
                        style={{ background: entry.hex }}
                        title={entry.name ?? entry.hex}
                        onClick={() =>
                          onPatchNode(selectedNode.id, {
                            style: { ...(nodeData?.style as object ?? {}), textColor: entry.hex },
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Shape palette */}
            {shapePalette && shapePalette.length > 0 && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Shape</label>
                <select
                  className="properties-panel__select"
                  value={currentShapeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      onPatchNode(selectedNode.id, { shapeId: undefined, shapeKind: undefined, aspectRatio: undefined });
                    } else {
                      const entry = shapePalette.find((s) => s.id === id);
                      onPatchNode(selectedNode.id, {
                        shapeId: id,
                        shapeKind: entry?.kind,
                        ...(entry?.aspectRatio ? { aspectRatio: entry.aspectRatio } : { aspectRatio: undefined }),
                      });
                    }
                  }}
                >
                  <option value="">— default rectangle —</option>
                  {shapePalette.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name ?? entry.kind} ({entry.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Size palette */}
            {sizePalette && sizePalette.length > 0 && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Size</label>
                <select
                  className="properties-panel__select"
                  value={currentSizeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    onPatchNode(selectedNode.id, { sizeId: id || undefined });
                  }}
                >
                  <option value="">— auto —</option>
                  {sizePalette.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name ?? entry.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Semantic type */}
            {semanticTypes && semanticTypes.length > 0 && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Semantic type</label>
                <select
                  className="properties-panel__select"
                  value={currentSemanticTypeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    onPatchNode(selectedNode.id, { semanticTypeId: id || undefined });
                  }}
                >
                  <option value="">— none —</option>
                  {semanticTypes.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* URL */}
            <div className="properties-panel__field">
              <label className="properties-panel__label">URL</label>
              <div className="properties-panel__url-row">
                <input
                  className="properties-panel__input"
                  type="url"
                  placeholder="https://…"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onBlur={commitUrl}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                {urlValue.trim() && (
                  <button
                    className="properties-panel__globe-btn"
                    onClick={() => openUrl(urlValue.trim())}
                    title={`Open: ${urlValue.trim()}`}
                  >
                    🌐
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Edge selected ── */}
        {selectedEdge && !selectedNode && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">ID</label>
              <span className="properties-panel__value properties-panel__value--mono">{selectedEdge.id}</span>
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">From</label>
              <NodeLink
                nodeId={selectedEdge.source}
                label={nodeLabel(nodes.find((n) => n.id === selectedEdge.source)!) ?? selectedEdge.source}
                onSelect={onSelectNode}
              />
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">To</label>
              <NodeLink
                nodeId={selectedEdge.target}
                label={nodeLabel(nodes.find((n) => n.id === selectedEdge.target)!) ?? selectedEdge.target}
                onSelect={onSelectNode}
              />
            </div>

            {selectedEdge.label && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Label</label>
                <span className="properties-panel__value">{String(selectedEdge.label)}</span>
              </div>
            )}

            {edgeData?.description && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Description</label>
                <span className="properties-panel__value">{edgeData.description as string}</span>
              </div>
            )}

            {edgeData?.routingType && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Routing</label>
                <span className="properties-panel__value properties-panel__value--mono">
                  {edgeData.routingType as string}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
