import { useState, useEffect, useCallback, useRef } from "react";
import { useDocuments } from "../lib/documents/index.js";
import { uniqueSlug } from "../lib/slugify.js";
import { analyzeDiagramImage, getImageDimensions } from "../lib/llm-image-analyze.js";
import type { DiagramDocument } from "../lib/db/types.js";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function ImageImportModal() {
  const { state, dispatch, db } = useDocuments();
  const [open, setOpen] = useState(false);
  const [imageData, setImageData] = useState<{
    base64: string;
    mediaType: string;
    dataUrl: string;
    fileName: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("objectify:import-from-image", handler);
    return () =>
      window.removeEventListener("objectify:import-from-image", handler);
  }, []);

  const handleClose = useCallback(() => {
    if (isAnalyzing) return;
    setOpen(false);
    setImageData(null);
    setError(null);
  }, [isAnalyzing]);

  const processFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please select a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(",");
      const base64 = dataUrl.slice(commaIdx + 1);
      setImageData({
        base64,
        mediaType: file.type,
        dataUrl,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleAnalyze = useCallback(async () => {
    if (!imageData) return;

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
    if (!apiKey) {
      setError("No API key configured (VITE_OPENROUTER_API_KEY)");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    dispatch({ type: "SET_CREATING", isCreating: true });

    try {
      const { width, height } = await getImageDimensions(imageData.dataUrl);
      const spec = await analyzeDiagramImage(
        imageData.base64,
        imageData.mediaType,
        width,
        height,
        apiKey,
        undefined,
        ({ attempt, maxAttempts, phase }) => {
          setProgressText(
            phase === "calling"
              ? "Analyzing..."
              : `Refining (attempt ${attempt}/${maxAttempts})...`,
          );
        },
      );

      const title =
        spec.diagrams[0]?.title ??
        imageData.fileName.replace(/\.[^.]+$/, "");
      const existingSlugs = new Set(state.library.map((d) => d.slug));
      const slug = uniqueSlug(title, existingSlugs);

      const doc: DiagramDocument = {
        id: crypto.randomUUID(),
        title,
        slug,
        spec,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveDocument(doc);
      dispatch({ type: "CREATE_DOCUMENT", document: doc });
      setOpen(false);
      setImageData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image analysis failed");
    } finally {
      setIsAnalyzing(false);
      setProgressText(null);
      dispatch({ type: "SET_CREATING", isCreating: false });
    }
  }, [imageData, state.library, db, dispatch]);

  if (!open) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={handleClose}>
      <div
        className="prompt-modal"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
      >
        <h3>Import Diagram from Image</h3>

        {imageData ? (
          <div className="image-preview-container">
            <img
              src={imageData.dataUrl}
              alt="Selected diagram"
              className="image-preview"
            />
            <div className="image-preview-name">{imageData.fileName}</div>
            {!isAnalyzing && (
              <button
                className="image-preview-change"
                onClick={() => {
                  setImageData(null);
                  setError(null);
                }}
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div
            className="image-drop-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="image-drop-icon">&#128444;</div>
            <div>Click to select or drag an image here</div>
            <div className="image-drop-hint">PNG, JPEG, WebP, or GIF</div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={handleClose} disabled={isAnalyzing}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !imageData}
          >
            {isAnalyzing ? (progressText ?? "Analyzing...") : "Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
