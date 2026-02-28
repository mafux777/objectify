import { useState, useCallback, useRef } from "react";
import { DiagramSpecSchema, type DiagramSpec } from "@objectify/schema";
import { DiagramViewer } from "./components/DiagramViewer.js";
import sampleData from "./data/sample.json";
import lpConnectorData from "./data/lp-connector.json";

function App() {
  const [spec, setSpec] = useState<DiagramSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSpec = useCallback((json: unknown) => {
    try {
      const parsed = DiagramSpecSchema.parse(json);
      setSpec(parsed);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid diagram spec JSON"
      );
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          loadSpec(json);
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
        <div style={{ display: "flex", gap: 8 }}>
          <button className="load-btn" onClick={() => loadSpec(sampleData)}>
            Sample 1
          </button>
          <button className="load-btn" onClick={() => loadSpec(lpConnectorData)}>
            Sample 2
          </button>
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
        <DiagramViewer spec={spec} />
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
