import { useState } from "react";
import type { DiagramDocument } from "../lib/db/types.js";
import { FlowDiagram } from "./FlowDiagram.js";

interface DiagramViewerProps {
  document: DiagramDocument;
}

export function DiagramViewer({ document }: DiagramViewerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const { spec } = document;

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
        </div>
      )}
      {spec.diagrams.length === 1 && (
        <div className="tab-bar">
          <button className="active">{spec.diagrams[0].title}</button>
        </div>
      )}
      <div className="diagram-container">
        <div className="flow-wrapper">
          <FlowDiagram
            diagram={spec.diagrams[activeTab]}
            spec={spec}
            activeTab={activeTab}
            documentId={document.id}
            palette={spec.palette}
            shapePalette={spec.shapePalette}
            sizePalette={spec.sizePalette}
            semanticTypes={spec.semanticTypes}
          />
        </div>
      </div>
    </>
  );
}
