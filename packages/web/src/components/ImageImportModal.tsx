import { useState, useEffect, useCallback, useRef } from "react";
import { useDocuments } from "../lib/documents/index.js";
import { uniqueSlug } from "../lib/slugify.js";
import { analyzeDiagramImage, getImageDimensions } from "../lib/llm-image-analyze.js";
import { triageImage, type TriageResult } from "../lib/llm-shared.js";
import { uploadAndConvert } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";
import type { DiagramDocument } from "../lib/db/types.js";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 2048; // px on longest side

/**
 * Resize an image if its longest side exceeds MAX_DIMENSION.
 * Returns the (possibly resized) dataUrl, base64, and a File suitable for upload.
 */
async function resizeImage(
  file: File,
  dataUrl: string,
): Promise<{
  dataUrl: string;
  base64: string;
  file: File;
  resized: boolean;
  origWidth: number;
  origHeight: number;
  finalWidth: number;
  finalHeight: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const longest = Math.max(w, h);

      if (longest <= MAX_DIMENSION) {
        // No resize needed
        const commaIdx = dataUrl.indexOf(",");
        resolve({
          dataUrl,
          base64: dataUrl.slice(commaIdx + 1),
          file,
          resized: false,
          origWidth: w,
          origHeight: h,
          finalWidth: w,
          finalHeight: h,
        });
        return;
      }

      const scale = MAX_DIMENSION / longest;
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, newW, newH);

      // Use JPEG for photos (smaller), keep PNG for PNG inputs
      const outputType =
        file.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = outputType === "image/jpeg" ? 0.85 : undefined;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to resize image"));
            return;
          }
          const resizedFile = new File([blob], file.name, {
            type: outputType,
          });
          const reader = new FileReader();
          reader.onload = () => {
            const resizedDataUrl = reader.result as string;
            const commaIdx = resizedDataUrl.indexOf(",");
            resolve({
              dataUrl: resizedDataUrl,
              base64: resizedDataUrl.slice(commaIdx + 1),
              file: resizedFile,
              resized: true,
              origWidth: w,
              origHeight: h,
              finalWidth: newW,
              finalHeight: newH,
            });
          };
          reader.onerror = () => reject(new Error("Failed to read resized image"));
          reader.readAsDataURL(resizedFile);
        },
        outputType,
        quality,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = dataUrl;
  });
}

export function ImageImportModal() {
  const { state, dispatch, db } = useDocuments();
  const { user, credits, refreshCredits } = useAuth();
  const [open, setOpen] = useState(false);
  const [imageData, setImageData] = useState<{
    base64: string;
    mediaType: string;
    dataUrl: string;
    fileName: string;
    file?: File;
  } | null>(null);
  const [imageMeta, setImageMeta] = useState<{
    resized: boolean;
    origWidth: number;
    origHeight: number;
    finalWidth: number;
    finalHeight: number;
    origSizeKB: number;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [triageConfirmed, setTriageConfirmed] = useState(false);
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
    setImageMeta(null);
    setError(null);
    setTriage(null);
    setTriageConfirmed(false);
  }, [isAnalyzing]);

  const processFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please select a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please use an image under 10 MB.`,
      );
      return;
    }
    setError(null);
    const origSizeKB = Math.round(file.size / 1024);
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      try {
        const result = await resizeImage(file, rawDataUrl);
        setImageData({
          base64: result.base64,
          mediaType: result.file.type,
          dataUrl: result.dataUrl,
          fileName: file.name,
          file: result.file,
        });
        setImageMeta({
          resized: result.resized,
          origWidth: result.origWidth,
          origHeight: result.origHeight,
          finalWidth: result.finalWidth,
          finalHeight: result.finalHeight,
          origSizeKB,
        });
      } catch {
        setError("Failed to process image. Try a different file.");
      }
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

  const TRIAGE_THRESHOLD = 5;

  const runFullAnalysis = useCallback(async () => {
    if (!imageData) return;

    setIsAnalyzing(true);
    setError(null);
    dispatch({ type: "SET_CREATING", isCreating: true });

    try {
      let spec;

      if (user && imageData.file) {
        // Authenticated path: upload to Supabase, use edge function (costs 1 credit)
        setProgressText("Uploading & analyzing...");
        spec = await uploadAndConvert(imageData.file);
        await refreshCredits();
      } else {
        // Fallback: direct client-side OpenRouter call
        const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
        if (!apiKey) {
          setError("No API key configured (VITE_OPENROUTER_API_KEY)");
          return;
        }

        const { width, height } = await getImageDimensions(imageData.dataUrl);
        spec = await analyzeDiagramImage(
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
      }

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
      setImageMeta(null);
      setTriage(null);
      setTriageConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image analysis failed");
    } finally {
      setIsAnalyzing(false);
      setProgressText(null);
      dispatch({ type: "SET_CREATING", isCreating: false });
    }
  }, [imageData, user, state.library, db, dispatch, refreshCredits]);

  const handleAnalyze = useCallback(async () => {
    if (!imageData) return;

    // Credit exhaustion check for authenticated users
    if (user && credits !== null && credits < 1) {
      setError("No credits remaining. Visit your dashboard to request more.");
      return;
    }

    // If triage already passed or user confirmed the warning, go straight to analysis
    if (triageConfirmed || (triage && triage.confidence >= TRIAGE_THRESHOLD)) {
      await runFullAnalysis();
      return;
    }

    // Run triage first
    setIsAnalyzing(true);
    setError(null);
    setProgressText("Checking image...");

    try {
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
      if (!apiKey) {
        setError("No API key configured (VITE_OPENROUTER_API_KEY)");
        return;
      }

      const result = await triageImage(
        imageData.base64,
        imageData.mediaType,
        apiKey,
      );
      setTriage(result);

      if (result.confidence >= TRIAGE_THRESHOLD) {
        // Good enough — proceed directly to full analysis
        setIsAnalyzing(false);
        setProgressText(null);
        await runFullAnalysis();
      } else {
        // Low confidence — pause and show warning, let user decide
        setIsAnalyzing(false);
        setProgressText(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image check failed");
      setIsAnalyzing(false);
      setProgressText(null);
    }
  }, [imageData, user, credits, triage, triageConfirmed, runFullAnalysis]);

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
            <div className="image-preview-name">
              {imageData.fileName}
              {imageMeta && (
                <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                  {imageMeta.resized
                    ? `${imageMeta.origWidth}×${imageMeta.origHeight} → ${imageMeta.finalWidth}×${imageMeta.finalHeight}`
                    : `${imageMeta.origWidth}×${imageMeta.origHeight}`}
                  {" · "}
                  {imageMeta.origSizeKB > 1024
                    ? `${(imageMeta.origSizeKB / 1024).toFixed(1)} MB`
                    : `${imageMeta.origSizeKB} KB`}
                  {imageMeta.resized && " (resized)"}
                </span>
              )}
            </div>
            {!isAnalyzing && (
              <button
                className="image-preview-change"
                onClick={() => {
                  setImageData(null);
                  setImageMeta(null);
                  setError(null);
                  setTriage(null);
                  setTriageConfirmed(false);
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

        {user && credits !== null && imageData && !isAnalyzing && (
          <p style={{ fontSize: 12, color: "#666", margin: "8px 0" }}>
            This will use 1 credit. You have {credits} remaining.
          </p>
        )}

        {triage && triage.confidence < TRIAGE_THRESHOLD && !triageConfirmed && !isAnalyzing && (
          <div className="triage-warning">
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
              This doesn't look like a diagram
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#666" }}>
              {triage.warning ?? triage.description}
              {" "}(confidence: {triage.confidence}/10)
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setTriageConfirmed(true);
                  runFullAnalysis();
                }}
              >
                Analyze anyway{user ? " (uses 1 credit)" : ""}
              </button>
              <button
                onClick={() => {
                  setTriage(null);
                  setImageData(null);
                  setImageMeta(null);
                }}
              >
                Choose a different image
              </button>
            </div>
          </div>
        )}

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
