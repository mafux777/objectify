import { useState, useCallback, useRef } from "react";
import { DiagramSpecSchema } from "@objectify/schema";
import { useDocuments } from "../lib/documents/index.js";
import { uniqueSlug } from "../lib/slugify.js";
import type { DiagramDocument } from "../lib/db/types.js";

import sampleData from "../data/sample.json";
import tradingPipelineData from "../data/trading-pipeline.json";
import talosComponentsData from "../data/talos-components.json";
import objectifyWorkflowData from "../data/objectify-workflow.json";
import exampleAData from "../data/example-a-microservices.json";
import exampleBData from "../data/example-b-cicd-pipeline.json";
import exampleCData from "../data/example-c-ecommerce-uml.json";

const TEMPLATES = [
  { title: "How Objectify Works", data: objectifyWorkflowData, featured: true },
  { title: "Web App Architecture", data: exampleAData },
  { title: "CI/CD Pipeline", data: exampleBData },
  { title: "E-Commerce Components", data: exampleCData },
  { title: "Project Thunderbattle", data: sampleData },
  { title: "Trading Pipeline", data: tradingPipelineData },
  { title: "Talos Linux Components", data: talosComponentsData },
];

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
  const [dragOver, setDragOver] = useState(false);
  const [showCallout, setShowCallout] = useState(
    () => !localStorage.getItem(ONBOARDING_SEEN_KEY)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          {TEMPLATES.map((t) => (
            <div
              key={t.title}
              className={`welcome-doc-card${t.featured ? " welcome-doc-card--featured" : ""}`}
              onClick={() => {
                if (t.featured && showCallout) dismissCallout();
                createDocument(t.data, t.title);
              }}
            >
              {t.featured && (
                <div className="featured-badge">Start here</div>
              )}
              <div className="doc-title">{t.title}</div>
              <div className="doc-meta">Template</div>
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
