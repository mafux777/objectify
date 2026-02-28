import { useState } from "react";
import type { DiagramSpec } from "@objectify/schema";
import { FlowDiagram } from "./FlowDiagram.js";

interface DiagramViewerProps {
  spec: DiagramSpec;
}

export function DiagramViewer({ spec }: DiagramViewerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [showDescription, setShowDescription] = useState(true);

  return (
    <>
      {spec.diagrams.length > 1 && (
        <div className="tab-bar">
          {spec.diagrams.map((d, i) => (
            <button
              key={d.id}
              className={i === activeTab ? "active" : ""}
              onClick={() => setActiveTab(i)}
            >
              {d.title}
            </button>
          ))}
          <button
            style={{ marginLeft: "auto" }}
            className={showDescription ? "active" : ""}
            onClick={() => setShowDescription(!showDescription)}
          >
            Description
          </button>
        </div>
      )}
      {spec.diagrams.length === 1 && (
        <div className="tab-bar">
          <button className="active">{spec.diagrams[0].title}</button>
          <button
            style={{ marginLeft: "auto" }}
            className={showDescription ? "active" : ""}
            onClick={() => setShowDescription(!showDescription)}
          >
            Description
          </button>
        </div>
      )}
      <div className="diagram-container">
        <div className="flow-wrapper">
          <FlowDiagram
            diagram={spec.diagrams[activeTab]}
            palette={spec.palette}
            shapePalette={spec.shapePalette}
            sizePalette={spec.sizePalette}
            semanticTypes={spec.semanticTypes}
          />
        </div>
        {showDescription && (
          <div className="description-panel">
            <h3>Description</h3>
            <p>{spec.description}</p>
          </div>
        )}
      </div>
    </>
  );
}
