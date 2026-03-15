import { useState, useEffect, useCallback } from "react";
import { useDocuments } from "../lib/documents/index.js";
import { useAuth } from "../lib/auth-context.js";
import { supabase } from "../lib/supabase.js";
import { uniqueSlug } from "../lib/slugify.js";
import { generateDiagramFromPrompt } from "../lib/llm-generate.js";
import type { DiagramDocument } from "../lib/db/types.js";

export function PromptModal() {
  const { state, dispatch, db } = useDocuments();
  const { user, credits, isAnonymous, walletAddress, refreshCredits } = useAuth();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for custom event from TabBar / WelcomeScreen
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("objectify:create-from-prompt", handler);
    return () =>
      window.removeEventListener("objectify:create-from-prompt", handler);
  }, []);

  const handleClose = useCallback(() => {
    if (isGenerating) return;
    setOpen(false);
    setPrompt("");
    setError(null);
  }, [isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    // Credit check
    if (user && credits !== null && credits < 1) {
      setError(
        isAnonymous
          ? "No credits remaining. Sign up with a verified email to get free credits."
          : `No credits remaining. Send at least 5 USDC to ${walletAddress ?? "your wallet"} to reload.`,
      );
      return;
    }

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
    if (!apiKey) {
      setError("No API key configured (VITE_OPENROUTER_API_KEY)");
      return;
    }

    setIsGenerating(true);
    setError(null);
    dispatch({ type: "SET_CREATING", isCreating: true });

    try {
      const spec = await generateDiagramFromPrompt(
        prompt.trim(),
        apiKey,
        undefined,
        ({ attempt, maxAttempts, phase }) => {
          setProgressText(
            phase === "calling"
              ? "Generating..."
              : `Refining (attempt ${attempt}/${maxAttempts})...`,
          );
        },
      );
      const title = spec.diagrams[0]?.title ?? "Generated Diagram";
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

      // Deduct 1 credit
      if (user) {
        await supabase.rpc("deduct_credit", {
          uid: user.id,
          conversion_id: doc.id,
        });
        await refreshCredits();
      }

      dispatch({ type: "CREATE_DOCUMENT", document: doc });
      setOpen(false);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
      setProgressText(null);
      dispatch({ type: "SET_CREATING", isCreating: false });
    }
  }, [prompt, state.library, db, dispatch, user, credits, refreshCredits]);

  if (!open) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={handleClose}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create Diagram from Prompt</h3>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
          Tip: Check out the templates on the home screen first — they're a
          great starting point you can customize with the chat refinement tool.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the architecture diagram you want to create..."
          disabled={isGenerating}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleGenerate();
            }
          }}
        />
        {user && credits !== null && !isGenerating && (
          <p style={{ fontSize: 12, color: "#666", margin: "8px 0 0" }}>
            This will use 1 credit. You have {credits} remaining.
          </p>
        )}
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button onClick={handleClose} disabled={isGenerating}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (progressText ?? "Generating...") : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
