import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { createDbAdapter } from "../lib/db/index.js";
import type { SharedFeedback } from "../lib/db/types.js";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const db = useMemo(() => createDbAdapter(user?.id), [user?.id]);

  const [submissions, setSubmissions] = useState<SharedFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    db.getSharedFeedback().then((data) => {
      setSubmissions(data);
      setLoading(false);
    });
  }, [db]);

  const handleDelete = async () => {
    if (deleteInput !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await db.deleteAccount();
      await signOut();
      navigate("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            Objectify
          </Link>
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link to="/app" className="landing-btn landing-btn-primary">
            Open Editor
          </Link>
          <button
            className="landing-btn"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
          Settings
        </h2>

        {/* Account Info */}
        <div className="dashboard-section">
          <h3>Account</h3>
          <div style={{ fontSize: 14, color: "#555", lineHeight: 1.8 }}>
            <div>
              <strong>Email:</strong> {user?.email ?? "Anonymous"}
            </div>
            <div>
              <strong>Provider:</strong>{" "}
              {user?.app_metadata?.provider === "google"
                ? "Google"
                : user?.app_metadata?.provider ?? "Local"}
            </div>
            {user?.created_at && (
              <div>
                <strong>Member since:</strong>{" "}
                {new Date(user.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                })}
              </div>
            )}
            <div>
              <strong>User ID:</strong>{" "}
              <span style={{ fontSize: 13, color: "#888" }}>
                {db.getUserId()}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Submissions */}
        <div className="dashboard-section" style={{ marginTop: 24 }}>
          <h3>Your Feedback Submissions</h3>
          {loading ? (
            <div className="dashboard-empty">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="dashboard-empty">
              No feedback submitted yet. Use the Share button in the editor to
              send feedback.
            </div>
          ) : (
            <div className="dashboard-conversion-list">
              {submissions.map((s) => (
                <div key={s.id} className="dashboard-conversion">
                  <div className="dashboard-conversion-info">
                    <div className="dashboard-conversion-title">
                      {s.documentTitle}
                    </div>
                    <div className="dashboard-conversion-date">
                      {new Date(s.createdAt).toLocaleDateString()} &middot;{" "}
                      {s.chatHistory.length} chat message
                      {s.chatHistory.length !== 1 ? "s" : ""}
                    </div>
                    {s.userComment && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                          marginTop: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 400,
                        }}
                      >
                        "{s.userComment}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div
          className="dashboard-section"
          style={{
            marginTop: 32,
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <h3 style={{ color: "#b91c1c" }}>Danger Zone</h3>
          <p style={{ fontSize: 13, color: "#666", margin: "8px 0 16px" }}>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              style={{
                padding: "8px 18px",
                background: "#b91c1c",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>
                Type <strong>DELETE</strong> to confirm:
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  disabled={deleting}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 13,
                    width: 120,
                  }}
                />
                <button
                  onClick={handleDelete}
                  disabled={deleteInput !== "DELETE" || deleting}
                  style={{
                    padding: "6px 14px",
                    background:
                      deleteInput === "DELETE" ? "#b91c1c" : "#ccc",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor:
                      deleteInput === "DELETE" ? "pointer" : "not-allowed",
                    fontSize: 13,
                  }}
                >
                  {deleting ? "Deleting..." : "Delete Forever"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteInput("");
                  }}
                  disabled={deleting}
                  style={{
                    padding: "6px 14px",
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
              </div>
              {deleteError && (
                <div
                  style={{
                    marginTop: 8,
                    color: "#b91c1c",
                    fontSize: 12,
                  }}
                >
                  {deleteError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
