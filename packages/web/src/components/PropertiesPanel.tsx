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
  selectedGuide: GuideLine | null;
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
  onPatchGuideLabel: (guideId: string, label: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectGuide: (guideId: string) => void;
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

/** Clickable guide reference */
function GuideLink({
  guide,
  onSelect,
}: {
  guide: GuideLine;
  onSelect: (id: string) => void;
}) {
  const label = guide.label ?? guide.id;
  const dir = guide.direction === "horizontal" ? "Row" : "Col";
  return (
    <button
      className="properties-panel__node-link"
      onClick={() => onSelect(guide.id)}
      title={`Select guide "${label}" (${guide.id})`}
    >
      {dir}: {label}
    </button>
  );
}

export function PropertiesPanel({
  selectedNode,
  selectedEdge,
  selectedGuide,
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
  onPatchGuideLabel,
  onSelectNode,
  onSelectGuide,
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

  // Local guide label state — synced to selected guide; committed on blur.
  const committedGuideLabel = selectedGuide?.label ?? "";
  const [guideLabelValue, setGuideLabelValue] = useState<string>(committedGuideLabel);
  const [guideLabelError, setGuideLabelError] = useState<string | null>(null);

  useEffect(() => {
    setGuideLabelValue(committedGuideLabel);
    setGuideLabelError(null);
  }, [selectedGuide?.id, committedGuideLabel]);

  const commitGuideLabel = () => {
    if (!selectedGuide) return;
    const trimmed = guideLabelValue.trim();
    if (!trimmed) { setGuideLabelError("Label cannot be empty"); return; }
    // Uniqueness check
    const duplicate = guides.find((g) => g.id !== selectedGuide.id && g.label === trimmed);
    if (duplicate) { setGuideLabelError(`"${trimmed}" is already used`); return; }
    setGuideLabelError(null);
    onPatchGuideLabel(selectedGuide.id, trimmed);
  };

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
          {selectedGuide
            ? "Guide"
            : selectedNode
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
        {/* ── Guide selected ── */}
        {selectedGuide && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">ID</label>
              <span className="properties-panel__value properties-panel__value--mono">{selectedGuide.id}</span>
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">Label</label>
              <input
                className={`properties-panel__input${guideLabelError ? " properties-panel__input--error" : ""}`}
                type="text"
                value={guideLabelValue}
                onChange={(e) => { setGuideLabelValue(e.target.value); setGuideLabelError(null); }}
                onBlur={commitGuideLabel}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              {guideLabelError && (
                <span className="properties-panel__error">{guideLabelError}</span>
              )}
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">Direction</label>
              <span className="properties-panel__value">{selectedGuide.direction}</span>
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">Position</label>
              <CoordStepper
                label={selectedGuide.direction === "horizontal" ? "Y" : "X"}
                value={selectedGuide.position}
                onChange={(v) => onPatchGuide(selectedGuide.id, v)}
              />
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">
                Snapped objects ({(() => {
                  const field = selectedGuide.direction === "horizontal" ? "guideRow" : "guideColumn";
                  return nodes.filter((n) => (n.data as Record<string, unknown>)?.[field] === selectedGuide.id).length;
                })()})
              </label>
              <div className="properties-panel__member-list">
                {(() => {
                  const field = selectedGuide.direction === "horizontal" ? "guideRow" : "guideColumn";
                  const snapped = nodes.filter((n) => (n.data as Record<string, unknown>)?.[field] === selectedGuide.id);
                  return snapped.map((n) => (
                    <NodeLink
                      key={n.id}
                      nodeId={n.id}
                      label={nodeLabel(n)}
                      onSelect={onSelectNode}
                    />
                  ));
                })()}
              </div>
            </div>
          </>
        )}

        {/* ── No selection: show spec description ── */}
        {!selectedNode && !selectedEdge && !selectedGuide && (
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
              <textarea
                className="properties-panel__input properties-panel__textarea"
                defaultValue={(nodeData?.label as string) ?? selectedNode.id}
                key={`node-label-${selectedNode.id}`}
                rows={Math.min(4, ((nodeData?.label as string) ?? "").split("\n").length || 1)}
                onBlur={(e) => onPatchNode(selectedNode.id, { label: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                }}
              />
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

            {/* ── Guides (clickable links + stepper) ── */}
            {(rowGuide || colGuide) && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Guides</label>
                {rowGuide && (
                  <div className="properties-panel__guide-row">
                    <GuideLink guide={rowGuide} onSelect={onSelectGuide} />
                    <CoordStepper
                      label=""
                      value={rowGuide.position}
                      onChange={(v) => onPatchGuide(rowGuide.id, v)}
                    />
                  </div>
                )}
                {colGuide && (
                  <div className="properties-panel__guide-row">
                    <GuideLink guide={colGuide} onSelect={onSelectGuide} />
                    <CoordStepper
                      label=""
                      value={colGuide.position}
                      onChange={(v) => onPatchGuide(colGuide.id, v)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Bottom/right edge guides (groups) */}
            {(nodeData?.guideRowBottom || nodeData?.guideColumnRight) && (
              <div className="properties-panel__field">
                <label className="properties-panel__label">Edge guides</label>
                {!!nodeData?.guideRowBottom && (() => {
                  const g = guideMap.get(nodeData.guideRowBottom as string);
                  return g ? (
                    <div className="properties-panel__guide-row">
                      <GuideLink guide={g} onSelect={onSelectGuide} />
                      <span className="properties-panel__coord-value">{g.position.toFixed(4)}</span>
                    </div>
                  ) : null;
                })()}
                {!!nodeData?.guideColumnRight && (() => {
                  const g = guideMap.get(nodeData.guideColumnRight as string);
                  return g ? (
                    <div className="properties-panel__guide-row">
                      <GuideLink guide={g} onSelect={onSelectGuide} />
                      <span className="properties-panel__coord-value">{g.position.toFixed(4)}</span>
                    </div>
                  ) : null;
                })()}
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
        {selectedEdge && !selectedNode && (() => {
          const eData = ((selectedEdge as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
          const eStyle = (selectedEdge.style ?? {}) as Record<string, unknown>;
          const isHidden = selectedEdge.hidden === true;
          const currentRouting = (eData.routingType as string) ?? "straight";
          const currentStrokeWidth = (eData.strokeWidth as number) ?? 1.5;
          const currentColor = (eStyle.stroke as string) ?? "#333333";
          const currentDash = eStyle.strokeDasharray as string | undefined;
          const currentLineStyle = currentDash === "6,3" ? "dashed" : currentDash === "2,2" ? "dotted" : "solid";

          return (
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

              {/* Editable label */}
              <div className="properties-panel__field">
                <label className="properties-panel__label">Label</label>
                <input
                  className="properties-panel__input"
                  type="text"
                  placeholder="(none)"
                  defaultValue={selectedEdge.label ? String(selectedEdge.label) : ""}
                  key={`edge-label-${selectedEdge.id}`}
                  onBlur={(e) => onPatchEdge(selectedEdge.id, { label: e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </div>

              {/* Description */}
              <div className="properties-panel__field">
                <label className="properties-panel__label">Description</label>
                <input
                  className="properties-panel__input"
                  type="text"
                  placeholder="(none)"
                  defaultValue={(eData.description as string) ?? ""}
                  key={`edge-desc-${selectedEdge.id}`}
                  onBlur={(e) => onPatchEdge(selectedEdge.id, { description: e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </div>

              {/* Visibility toggle */}
              <div className="properties-panel__field">
                <label className="properties-panel__label">Visible</label>
                <label className="properties-panel__toggle">
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={(e) => onPatchEdge(selectedEdge.id, { __hidden: !e.target.checked })}
                  />
                  <span>{isHidden ? "Hidden (semantic link only)" : "Visible"}</span>
                </label>
              </div>

              {/* Visual properties — only shown when visible */}
              {!isHidden && (
                <>
                  {/* Routing type */}
                  <div className="properties-panel__field">
                    <label className="properties-panel__label">Routing</label>
                    <select
                      className="properties-panel__select"
                      value={currentRouting}
                      onChange={(e) => onPatchEdge(selectedEdge.id, { routingType: e.target.value })}
                    >
                      <option value="straight">Straight</option>
                      <option value="step">Step</option>
                      <option value="smoothstep">Smooth Step</option>
                      <option value="bezier">Bezier</option>
                      <option value="smooth-repelled">Smooth Repelled</option>
                    </select>
                  </div>

                  {/* Line style */}
                  <div className="properties-panel__field">
                    <label className="properties-panel__label">Line style</label>
                    <select
                      className="properties-panel__select"
                      value={currentLineStyle}
                      onChange={(e) => onPatchEdge(selectedEdge.id, { lineStyle: e.target.value })}
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>

                  {/* Stroke width */}
                  <div className="properties-panel__field">
                    <label className="properties-panel__label">Stroke width</label>
                    <input
                      className="properties-panel__input"
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={currentStrokeWidth}
                      onChange={(e) => onPatchEdge(selectedEdge.id, { strokeWidth: parseFloat(e.target.value) || 1.5 })}
                    />
                  </div>

                  {/* Color */}
                  <div className="properties-panel__field">
                    <label className="properties-panel__label">Color</label>
                    {palette && palette.length > 0 ? (
                      <div className="properties-panel__swatches">
                        {palette.map((entry) => (
                          <button
                            key={entry.id}
                            className={`properties-panel__swatch${entry.hex === currentColor ? " properties-panel__swatch--active" : ""}`}
                            style={{ background: entry.hex }}
                            title={entry.name ?? entry.hex}
                            onClick={() => onPatchEdge(selectedEdge.id, { color: entry.hex })}
                          />
                        ))}
                      </div>
                    ) : (
                      <input
                        className="properties-panel__input"
                        type="color"
                        value={currentColor}
                        onChange={(e) => onPatchEdge(selectedEdge.id, { color: e.target.value })}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
