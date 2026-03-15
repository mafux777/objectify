import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { supabase } from "../lib/supabase.js";
import { createDbAdapter } from "../lib/db/index.js";
import { WalletAddress } from "../components/WalletAddress.js";
import type { SharedFeedback } from "../lib/db/types.js";

export function SettingsPage() {
  const { user, credits, walletAddress, signOut, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const db = useMemo(() => createDbAdapter(user?.id), [user?.id]);

  const [submissions, setSubmissions] = useState<SharedFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
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

  const handleCheckDeposit = async () => {
    setChecking(true);
    setDepositResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-balance", {
        method: "POST",
      });
      if (error) throw error;
      setUsdcBalance(data.usdcBalance);
      if (data.creditsAdded > 0) {
        setDepositResult(`+${data.creditsAdded} credits added!`);
      } else {
        setDepositResult("No new deposits found");
      }
      await refreshCredits();
    } catch (err) {
      setDepositResult("Error checking balance");
      console.error("Check deposit error:", err);
    } finally {
      setChecking(false);
      setTimeout(() => setDepositResult(null), 5000);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordMsg(null);
    if (!newPassword) {
      setPasswordError("Enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMsg("Password updated.");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

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

        {/* Change Password — only for email users (not Google) */}
        {user?.app_metadata?.provider !== "google" && user?.email && (
          <div className="dashboard-section" style={{ marginTop: 24 }}>
            <h3>Change Password</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                minLength={6}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
              {passwordError && (
                <div style={{ color: "#b91c1c", fontSize: 13 }}>{passwordError}</div>
              )}
              {passwordMsg && (
                <div style={{ color: "#4caf50", fontSize: 13 }}>{passwordMsg}</div>
              )}
              <button
                onClick={handleChangePassword}
                disabled={savingPassword}
                className="landing-btn landing-btn-primary"
                style={{ fontSize: 13, padding: "8px 16px", alignSelf: "flex-start" }}
              >
                {savingPassword ? "Saving..." : "Update Password"}
              </button>
            </div>
          </div>
        )}

        {/* Credits & Wallet */}
        <div className="dashboard-section" style={{ marginTop: 24 }}>
          <h3>Credits & Wallet</h3>
          <div style={{ fontSize: 14, color: "#555", lineHeight: 1.8 }}>
            <div>
              <strong>Credits:</strong> {credits ?? "..."} credit{credits !== 1 ? "s" : ""} remaining
            </div>
            {walletAddress && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>Wallet:</strong>
                  <WalletAddress address={walletAddress} style={{ fontSize: 14 }} />
                </div>
                <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                  Send USDC (Base) to this address to add credits. 1 USDC = 10 credits.
                </div>
                {usdcBalance !== null && (
                  <div style={{ marginTop: 4 }}>
                    <strong>USDC balance:</strong> {usdcBalance} USDC
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={handleCheckDeposit}
                    disabled={checking}
                    className="landing-btn landing-btn-primary"
                    style={{ fontSize: 13, padding: "6px 16px" }}
                  >
                    {checking ? "Checking..." : "Check for deposit"}
                  </button>
                  {depositResult && (
                    <span style={{
                      marginLeft: 10,
                      fontSize: 13,
                      color: depositResult.startsWith("+") ? "#4caf50" : "#888",
                    }}>
                      {depositResult}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Feedback Submissions */}
        <div className="dashboard-section" style={{ marginTop: 24 }}>
          <h3>Your Feedback Submissions</h3>
          {loading ? (
            <div className="dashboard-empty">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="dashboard-empty">
              No feedback submitted yet. Use the Feedback button in the editor to
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
