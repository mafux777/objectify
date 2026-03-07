import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { getConversions } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

interface Conversion {
  id: string;
  image_url: string | null;
  spec: { diagrams?: Array<{ title?: string }> } | null;
  status: string;
  created_at: string;
}

export function DashboardPage() {
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistCredits, setWaitlistCredits] = useState("10");
  const [waitlistPay, setWaitlistPay] = useState("");

  useEffect(() => {
    getConversions().then((data) => {
      setConversions(data as Conversion[]);
      setLoading(false);
    });
  }, []);

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("waitlist").insert({
      email: waitlistEmail || user?.email,
      desired_credits: parseInt(waitlistCredits) || 10,
      willing_to_pay: waitlistPay,
    });
    setWaitlistSubmitted(true);
  }

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
          <button className="landing-btn" onClick={async () => { await signOut(); navigate("/"); }}>
            Sign Out
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-credits">
          <div>
            <div className="dashboard-credits-num">{credits ?? "..."}</div>
            <div className="dashboard-credits-label">
              credit{credits !== 1 ? "s" : ""} remaining
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <h3>Conversion History</h3>
          {loading ? (
            <div className="dashboard-empty">Loading...</div>
          ) : conversions.length === 0 ? (
            <div className="dashboard-empty">
              No conversions yet.{" "}
              <Link to="/app" style={{ color: "#1976d2" }}>
                Try converting an image
              </Link>
            </div>
          ) : (
            <div className="dashboard-conversion-list">
              {conversions.map((c) => (
                <div
                  key={c.id}
                  className="dashboard-conversion"
                  onClick={() => navigate("/app")}
                >
                  <div className="dashboard-conversion-info">
                    <div className="dashboard-conversion-title">
                      {c.spec?.diagrams?.[0]?.title ?? "Untitled"}
                    </div>
                    <div className="dashboard-conversion-date">
                      {new Date(c.created_at).toLocaleDateString()} &middot;{" "}
                      {c.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {credits === 0 && (
          <div className="dashboard-section" style={{ marginTop: 32 }}>
            <h3>Get More Credits</h3>
            {waitlistSubmitted ? (
              <p style={{ color: "#1976d2" }}>
                Thanks! We'll be in touch soon.
              </p>
            ) : (
              <form className="waitlist-form" onSubmit={handleWaitlistSubmit}>
                <input
                  type="email"
                  placeholder="Email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                />
                <select
                  value={waitlistCredits}
                  onChange={(e) => setWaitlistCredits(e.target.value)}
                >
                  <option value="5">5 credits</option>
                  <option value="10">10 credits</option>
                  <option value="25">25 credits</option>
                  <option value="50">50 credits</option>
                </select>
                <input
                  type="text"
                  placeholder="What would you pay? (optional)"
                  value={waitlistPay}
                  onChange={(e) => setWaitlistPay(e.target.value)}
                />
                <button type="submit">Join Waitlist</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
