import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth-context.js";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if already logged in
  if (user) {
    navigate("/app", { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMagicLinkSent(true);
      } else {
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) setError(error.message);
  }

  if (resetSent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <Link to="/" className="login-logo">Objectify</Link>
          <h2>Check your email</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: 14 }}>
            We sent a password reset link to <strong>{email}</strong>.
          </p>
          <p style={{ textAlign: "center", marginTop: 16 }}>
            <button className="link-btn" onClick={() => { setResetSent(false); setError(null); }}>
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <Link to="/" className="login-logo">Objectify</Link>
          <h2>Check your email</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: 14 }}>
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p style={{ textAlign: "center", marginTop: 16 }}>
            <Link to="/" className="link-btn">Back to home</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-logo">Objectify</Link>
        <p className="login-tagline">
          Turn diagram images into editable, interactive diagrams
        </p>
        <h2>{isSignUp ? "Create Account" : "Sign In"}</h2>

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
          {isSignUp && (
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          )}
          {!isSignUp && (
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
            {loading ? "..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p className="toggle-text">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button className="link-btn" onClick={() => { setIsSignUp(!isSignUp); setError(null); setConfirmPassword(""); }}>
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}
