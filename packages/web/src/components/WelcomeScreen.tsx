import { useState, useCallback, useRef, useEffect } from "react";
import { DiagramSpecSchema } from "@objectify/schema";
import { useDocuments } from "../lib/documents/index.js";
import { uniqueSlug } from "../lib/slugify.js";
import type { DiagramDocument } from "../lib/db/types.js";
import type { Template } from "../lib/db/index.js";
import { useAuth } from "../lib/auth-context.js";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ONBOARDING_SEEN_KEY = "objectify:onboarding-seen";

export function WelcomeScreen() {
  const { state, dispatch, db } = useDocuments();
  const { isAdmin } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [showCallout, setShowCallout] = useState(
    () => !localStorage.getItem(ONBOARDING_SEEN_KEY)
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    db.listTemplates().then(setTemplates);
  }, [db]);

  const dismissCallout = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    setShowCallout(false);
  }, []);

  const existingSlugs = new Set(state.library.map((d) => d.slug));

  const createDocument = useCallback(
    (spec: unknown, title: string) => {
      const parsed = DiagramSpecSchema.parse(spec);
      const slug = uniqueSlug(title, existingSlugs);
      const doc: DiagramDocument = {
        id: crypto.randomUUID(),
        title,
        slug,
        spec: parsed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      db.saveDocument(doc);
      dispatch({ type: "CREATE_DOCUMENT", document: doc });
    },
    [existingSlugs, db, dispatch],
  );

  const openDocument = useCallback(
    async (id: string) => {
      const doc = await db.getDocument(id);
      if (doc) {
        dispatch({ type: "OPEN_DOCUMENT", document: doc });
      }
    },
    [db, dispatch],
  );

  const deleteDocument = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await db.deleteDocument(id);
      dispatch({ type: "DELETE_DOCUMENT", id });
    },
    [db, dispatch],
  );

  const saveAsTemplate = useCallback(
    async (e: React.MouseEvent, docMeta: { id: string; title: string }) => {
      e.stopPropagation();
      const doc = await db.getDocument(docMeta.id);
      if (!doc) return;
      const name = prompt("Template name:", doc.title);
      if (!name) return;
      const description = prompt("Template description:", "") ?? "";
      try {
        const created = await db.createTemplate({
          name,
          description,
          spec: doc.spec,
          featured: false,
        });
        setTemplates((prev) => [...prev, created]);
      } catch (err) {
        alert(`Failed to save template: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [db],
  );

  const deleteTemplate = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!confirm("Remove this template?")) return;
      try {
        await db.deleteTemplate(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      } catch (err) {
        alert(`Failed to delete template: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [db],
  );

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          const parsed = DiagramSpecSchema.parse(json);
          const title =
            parsed.diagrams[0]?.title ?? file.name.replace(/\.json$/, "");
          createDocument(parsed, title);
        } catch (err) {
          alert(
            `Failed to import: ${err instanceof Error ? err.message : "Invalid JSON"}`,
          );
        }
      };
      reader.readAsText(file);
    },
    [createDocument],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="welcome-screen">
      <h2>Objectify</h2>
      <div className="subtitle">Visual architecture diagrams, powered by AI</div>

      {/* Action cards */}
      <div className="welcome-actions">
        <div
          className="welcome-action-card"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("objectify:create-from-prompt"),
            )
          }
        >
          <span className="icon">&#9998;</span>
          <span className="label">Create from Prompt</span>
          <span className="action-badge free">Free</span>
        </div>
        <div
          className="welcome-action-card"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("objectify:import-from-image"),
            )
          }
        >
          <span className="icon">&#128444;</span>
          <span className="label">Import from Image</span>
          <span className="action-badge credit">1 credit</span>
        </div>
        <div
          className="welcome-action-card"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="icon">&#8681;</span>
          <span className="label">Import JSON</span>
          <span className="action-badge free">Free</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Saved documents */}
      {state.library.length > 0 && (
        <div className="welcome-section">
          <h3>Saved Diagrams</h3>
          <div className="welcome-grid">
            {state.library
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((doc) => (
                <div
                  key={doc.id}
                  className="welcome-doc-card"
                  onClick={() => openDocument(doc.id)}
                >
                  <div className="doc-title">{doc.title}</div>
                  <div className="doc-meta">
                    {formatDate(doc.updatedAt)}
                  </div>
                  <button
                    className="doc-delete"
                    onClick={(e) => deleteDocument(e, doc.id)}
                    title="Delete"
                  >
                    &times;
                  </button>
                  {isAdmin && (
                    <button
                      className="doc-save-template"
                      onClick={(e) => saveAsTemplate(e, doc)}
                      title="Save as Template"
                    >
                      &#9733;
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Templates */}
      <div className="welcome-section">
        <h3>Templates</h3>
        {showCallout && (
          <div className="onboarding-callout">
            <span>New to Objectify? Open the featured template below to learn the basics.</span>
            <button onClick={dismissCallout} className="callout-dismiss">&times;</button>
          </div>
        )}
        <div className="welcome-grid">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`welcome-doc-card${t.featured ? " welcome-doc-card--featured" : ""}`}
              onClick={() => {
                if (t.featured && showCallout) dismissCallout();
                createDocument(t.spec, t.name);
              }}
            >
              {t.featured && (
                <div className="featured-badge">Start here</div>
              )}
              <div className="doc-title">{t.name}</div>
              <div className="doc-meta">{t.description || "Template"}</div>
              {isAdmin && (
                <button
                  className="doc-delete"
                  onClick={(e) => deleteTemplate(e, t.id)}
                  title="Remove Template"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`welcome-drop-zone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        Drop a diagram-spec.json file here to import
      </div>
    </div>
  );
}
