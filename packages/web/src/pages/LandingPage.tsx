import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <h1 className="landing-logo">Objectify</h1>
        <div className="landing-nav-links">
          {user ? (
            <Link to="/app" className="landing-btn landing-btn-primary">
              Open Editor
            </Link>
          ) : (
            <>
              <Link to="/login" className="landing-btn">
                Sign In
              </Link>
              <Link to="/login" className="landing-btn landing-btn-primary">
                Get Started Free
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="landing-hero">
        <h2>Turn any diagram image into an editable, interactive diagram</h2>
        <p className="landing-hero-sub">
          Snap a photo of a whiteboard, upload a screenshot, or describe what
          you need. Objectify converts it into a fully editable diagram in
          seconds.
        </p>
        <Link
          to={user ? "/app" : "/login"}
          className="landing-btn landing-btn-primary landing-btn-lg"
        >
          Try it free
        </Link>
      </section>

      <section className="landing-how-it-works">
        <h3>How it works</h3>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-num">1</div>
            <h4>Upload</h4>
            <p>Drop in a photo of a whiteboard, a screenshot, or any diagram image.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-num">2</div>
            <h4>Convert</h4>
            <p>AI analyzes every box, arrow, and label — extracting the full structure.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-num">3</div>
            <h4>Edit & Export</h4>
            <p>Refine the diagram interactively, then export as PNG or keep iterating.</p>
          </div>
        </div>
      </section>

      <section className="landing-video">
        <h3>See it in action</h3>
        <div className="landing-video-wrapper">
          <iframe
            src="https://www.youtube-nocookie.com/embed/0B4nD0HL5gM"
            title="I Used AI to Make a Tool That Reads Diagrams"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>

      <section className="landing-features">
        <h3>Features</h3>
        <div className="landing-feature-grid">
          <div className="landing-feature">
            <strong>Image to Diagram</strong>
            <p>Upload any diagram photo and get a fully editable version.</p>
          </div>
          <div className="landing-feature">
            <strong>Text to Diagram</strong>
            <p>Describe what you need in plain English and watch it appear.</p>
          </div>
          <div className="landing-feature">
            <strong>Chat Refinement</strong>
            <p>Tell the AI what to change — add nodes, restyle, restructure.</p>
          </div>
          <div className="landing-feature">
            <strong>7 Templates</strong>
            <p>Start from pre-built templates for common diagram types.</p>
          </div>
          <div className="landing-feature">
            <strong>PNG Export</strong>
            <p>Export high-quality images ready for docs and presentations.</p>
          </div>
          <div className="landing-feature">
            <strong>Interactive Editor</strong>
            <p>Drag, resize, and connect nodes with a full-featured canvas.</p>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-cta-banner">
          First 50 users get 5 free credits
        </div>
        <p>Each credit converts one image into an editable diagram.</p>
        <Link
          to={user ? "/app" : "/login"}
          className="landing-btn landing-btn-primary landing-btn-lg"
        >
          Get Started
        </Link>
      </section>

      <footer className="landing-footer">
        <p>Built with React Flow, Supabase, and Claude.</p>
      </footer>
    </div>
  );
}
