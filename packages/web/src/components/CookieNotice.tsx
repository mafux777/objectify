import { useState } from "react";

const DISMISSED_KEY = "cookie-notice-dismissed";

export function CookieNotice() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "1",
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className="cookie-notice"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#1a1a2e",
        color: "#ccc",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 13,
        zIndex: 9999,
        borderTop: "1px solid #333",
      }}
    >
      <span>
        We use a functional cookie to remember your session. No tracking.
      </span>
      <button
        onClick={handleDismiss}
        style={{
          background: "#444",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "6px 16px",
          cursor: "pointer",
          fontSize: 12,
          marginLeft: 16,
          flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}
