import { useEffect, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  ColorPaletteEntry,
  ShapePaletteEntry,
  SizePaletteEntry,
  SemanticTypeEntry,
} from "@objectify/schema";

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  nodes: Node[];
  specDescription: string;
  palette?: ColorPaletteEntry[];
  shapePalette?: ShapePaletteEntry[];
  sizePalette?: SizePaletteEntry[];
  semanticTypes?: SemanticTypeEntry[];
  onPatchNode: (nodeId: string, patch: Record<string, unknown>) => void;
  onPatchEdge: (edgeId: string, patch: Record<string, unknown>) => void;
  onClose: () => void;
}

export function PropertiesPanel({
  selectedNode,
  selectedEdge,
  nodes,
  specDescription,
  palette,
  shapePalette,
  sizePalette,
  semanticTypes,
  onPatchNode,
  onPatchEdge,
  onClose,
}: PropertiesPanelProps) {
  const nodeData = selectedNode?.data as Record<string, unknown> | undefined;
  const edgeData = (selectedEdge as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;

  // Local URL state — synced to selected node; committed on blur.
  // Depends on both the node ID (switching selection) and the committed URL value
  // (handles external changes from undo/redo and LLM edits without resetting while typing,
  // because nodeData.url only changes after onBlur fires onPatchNode).
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

  return (
    <div className="properties-panel">
      <div className="properties-panel__header">
        <span className="properties-panel__title">
          {selectedNode ? "Node" : selectedEdge ? "Connector" : "Description"}
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
              <span className="properties-panel__value properties-panel__value--mono">
                {(nodes.find((n) => n.id === selectedEdge.source)?.data as Record<string, unknown> | undefined)?.label as string
                  ?? selectedEdge.source}
              </span>
            </div>

            <div className="properties-panel__field">
              <label className="properties-panel__label">To</label>
              <span className="properties-panel__value properties-panel__value--mono">
                {(nodes.find((n) => n.id === selectedEdge.target)?.data as Record<string, unknown> | undefined)?.label as string
                  ?? selectedEdge.target}
              </span>
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
