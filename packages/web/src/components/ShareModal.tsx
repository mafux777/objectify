import { useState, useCallback } from "react";
import type { DiagramSpec } from "@objectify/schema";
import type { ChatMessage, DbAdapter } from "../lib/db/types.js";

interface ShareModalProps {
  spec: DiagramSpec;
  chatHistory: ChatMessage[];
  documentTitle: string;
  db: DbAdapter;
  onClose: () => void;
}

export function ShareModal({
  spec,
  chatHistory,
  documentTitle,
  db,
  onClose,
}: ShareModalProps) {
  const [comment, setComment] = useState("");
  const [includeSpec, setIncludeSpec] = useState(true);
  const [includeChat, setIncludeChat] = useState(true);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diagram = spec.diagrams[0];
  const nodeCount = diagram?.nodes.length ?? 0;
  const edgeCount = diagram?.edges?.length ?? 0;

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const feedbackRecords = includeFeedback
        ? await db.getFeedback(db.getUserId())
        : [];

      await db.submitSharedFeedback({
        userId: db.getUserId(),
        documentTitle,
        diagramSpec: includeSpec ? spec : { diagrams: [] },
        chatHistory: includeChat ? chatHistory : [],
        feedbackMessages: feedbackRecords,
        userComment: comment.trim(),
        userAgent: navigator.userAgent,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, includeSpec, includeChat, includeFeedback, spec, chatHistory, documentTitle, db]);

  if (submitted) {
    return (
      <div className="prompt-modal-backdrop" onClick={onClose}>
        <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Thank you!</h3>
          <p style={{ fontSize: 14, color: "#555", margin: "12px 0" }}>
            Your feedback has been submitted. It will help us improve Objectify.
          </p>
          <div className="modal-actions">
            <button className="primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share with Developer</h3>

        <div
          style={{
            fontSize: 13,
            color: "#666",
            marginBottom: 12,
            padding: "8px 12px",
            background: "#f8f9fa",
            borderRadius: 6,
          }}
        >
          <strong>{documentTitle}</strong> &middot; {nodeCount} nodes, {edgeCount} edges
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us what happened, what you expected, or any suggestions..."
          disabled={isSubmitting}
          autoFocus
        />

        <div style={{ margin: "12px 0", fontSize: 13 }}>
          <label style={{ display: "block", marginBottom: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeSpec}
              onChange={(e) => setIncludeSpec(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include diagram specification
          </label>
          <label style={{ display: "block", marginBottom: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeChat}
              onChange={(e) => setIncludeChat(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include chat history ({chatHistory.length} message{chatHistory.length !== 1 ? "s" : ""})
          </label>
          <label style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeFeedback}
              onChange={(e) => setIncludeFeedback(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include auto-logged feedback
          </label>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
