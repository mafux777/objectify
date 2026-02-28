import { useState, useCallback, useRef, useEffect } from "react";
import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import { DiagramViewer } from "./components/DiagramViewer.js";
import sampleData from "./data/sample.json";
import lpConnectorData from "./data/lp-connector.json";
import tradingPipelineData from "./data/trading-pipeline.json";
import talosComponentsData from "./data/talos-components.json";

interface SpecEntry {
  slug: string;
  title: string;
  description: string;
}

function App() {
  const [spec, setSpec] = useState<DiagramSpec | null>(null);
  const [specFilename, setSpecFilename] = useState<string | null>(null);
  const [specList, setSpecList] = useState<SpecEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available specs from server on mount
  useEffect(() => {
    fetch("/api/specs")
      .then((r) => r.json())
      .then((list: SpecEntry[]) => setSpecList(list))
      .catch(() => {
        // Server might not be available — that's OK
      });
  }, []);

  const loadSpec = useCallback((json: unknown, filename: string | null = null) => {
    try {
      const parsed = DiagramSpecSchema.parse(json);
      setSpec(parsed);
      setSpecFilename(filename);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid diagram spec JSON"
      );
    }
  }, []);

  const loadFromServer = useCallback(
    async (slug: string) => {
      try {
        const res = await fetch(`/api/specs/${slug}`);
        if (!res.ok) throw new Error(`Failed to load spec: ${res.statusText}`);
        const json = await res.json();
        loadSpec(json, slug);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load spec");
      }
    },
    [loadSpec]
  );

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          loadSpec(json, null);
        } catch {
          setError("Could not parse JSON file");
        }
      };
      reader.readAsText(file);
    },
    [loadSpec]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="app">
      <div className="app-header">
        <h1>Objectify</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="load-btn" onClick={() => loadSpec(sampleData)}>
            Sample 1
          </button>
          <button className="load-btn" onClick={() => loadSpec(lpConnectorData)}>
            Sample 2
          </button>
          <button className="load-btn" onClick={() => loadSpec(tradingPipelineData)}>
            Sample 3
          </button>
          <button className="load-btn" onClick={() => loadSpec(talosComponentsData)}>
            Sample 4
          </button>
          {specList.length > 0 && (
            <>
              <span style={{ color: "#999", fontSize: 13 }}>|</span>
              {specList.map((entry) => (
                <button
                  key={entry.slug}
                  className="load-btn"
                  onClick={() => loadFromServer(entry.slug)}
                  title={entry.description}
                  style={
                    specFilename === entry.slug
                      ? { borderColor: "#1976d2", color: "#1976d2" }
                      : undefined
                  }
                >
                  {entry.title}
                </button>
              ))}
            </>
          )}
          <button
            className="load-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Load JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 20px",
            background: "#ffebee",
            color: "#c62828",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {spec ? (
        <DiagramViewer spec={spec} specFilename={specFilename} />
      ) : (
        <div
          className={`drop-zone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="icon">&#9633;</div>
          <div>Drop a diagram-spec.json file here</div>
          <div style={{ fontSize: 13 }}>
            or click <strong>Load Sample</strong> to see the demo
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
