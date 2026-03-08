import { useEffect } from "react";

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div
        className="prompt-modal help-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 16 }}>Help &amp; Shortcuts</h3>

        <h4>Mouse Interactions</h4>
        <table>
          <tbody>
            <tr>
              <td>Drag node</td>
              <td>Move node (siblings on the same guide move together)</td>
            </tr>
            <tr>
              <td>Alt + drag</td>
              <td>Detach node from its guide (free positioning)</td>
            </tr>
            <tr>
              <td>Shift + drag</td>
              <td>Snap node to the nearest guide</td>
            </tr>
            <tr>
              <td>Right-click node/edge</td>
              <td>Open context menu (colors, styles, delete)</td>
            </tr>
            <tr>
              <td>Click edge</td>
              <td>Highlight connected nodes</td>
            </tr>
            <tr>
              <td>Scroll wheel</td>
              <td>Zoom in / out</td>
            </tr>
            <tr>
              <td>Drag canvas</td>
              <td>Pan the view</td>
            </tr>
          </tbody>
        </table>

        <h4>Keyboard Shortcuts</h4>
        <table>
          <tbody>
            <tr>
              <td>Ctrl/⌘ + Z</td>
              <td>Undo</td>
            </tr>
            <tr>
              <td>Ctrl/⌘ + Shift + Z</td>
              <td>Redo</td>
            </tr>
            <tr>
              <td>Ctrl/⌘ + S</td>
              <td>Save</td>
            </tr>
            <tr>
              <td>Backspace / Delete</td>
              <td>Delete selected nodes or edges</td>
            </tr>
          </tbody>
        </table>

        <h4>Command Bar</h4>
        <p>
          The command bar at the bottom of the editor accepts natural language.
          Ask the AI to add, remove, restyle, or rearrange nodes and edges.
        </p>
        <p style={{ color: "#999", fontStyle: "italic" }}>
          Example: &quot;Add a database node connected to the API gateway&quot;
        </p>

        <div style={{ textAlign: "right", marginTop: 16 }}>
          <button
            className="load-btn"
            onClick={onClose}
            style={{ padding: "6px 20px" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
