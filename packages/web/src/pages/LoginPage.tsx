import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth-context.js";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();

  // Redirect if already logged in with a real (non-anonymous) account
  if (user && !isAnonymous) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup" && password !== confirmPassword) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
      }
      if (mode === "signup") {
        if (isAnonymous) {
          // Link email+password to current anonymous account (preserves wallet)
          const { error } = await supabase.auth.updateUser({ email, password });
          if (error) throw error;
        } else {
          // Rare path — sign up from scratch
          const { error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
        }
        setConfirmSent(true);
      } else {
        // Sign in with existing credentials
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/app");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/app`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (isAnonymous) {
      // Try to link Google identity to anonymous user (preserves wallet + credits).
      // If this identity already belongs to another user, Supabase redirects with
      // error_code=identity_already_exists — auth-context catches that and auto-retries
      // with signInWithOAuth for a seamless sign-in.
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/app` },
      });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/app` },
      });
      if (error) setError(error.message);
    }
  }

  if (resetSent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <Link to="/app" className="login-logo">
            Objectify
          </Link>
          <h2>Check your email</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: 14 }}>
            We sent a password reset link to <strong>{email}</strong>.
          </p>
          <p style={{ textAlign: "center", marginTop: 16 }}>
            <button
              className="link-btn"
              onClick={() => {
                setResetSent(false);
                setError(null);
              }}
            >
              Back
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (confirmSent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <Link to="/app" className="login-logo">
            Objectify
          </Link>
          <h2>Check your email</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: 14 }}>
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p style={{ textAlign: "center", marginTop: 16 }}>
            <Link to="/app" className="link-btn">
              Back to app
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-logo">
          Objectify
        </Link>
        <p className="login-tagline">
          Turn diagram images into editable, interactive diagrams
        </p>
        <h2>{mode === "signup" ? "Sign Up" : "Sign In"}</h2>

        <button className="google-btn" onClick={handleGoogleLogin}>
          Continue with Google
        </button>

        <div className="divider">or</div>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {mode === "signup" && (
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          )}
          {mode === "signin" && (
            <p style={{ textAlign: "right", margin: "-4px 0 8px" }}>
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: 13 }}
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 12 }}>
          <button
            type="button"
            className="link-btn"
            style={{ fontSize: 13 }}
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setConfirmPassword(""); }}
          >
            {mode === "signin" ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </p>
        <p style={{ textAlign: "center", marginTop: 4 }}>
          <button
            type="button"
            className="link-btn"
            style={{ fontSize: 13, color: "#999" }}
            onClick={() => navigate("/app")}
          >
            Cancel
          </button>
        </p>
      </div>
    </div>
  );
}
