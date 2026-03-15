import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { DocumentProvider, useDocuments } from "./lib/documents/index.js";
import { supabase } from "./lib/supabase.js";
import { DiagramViewer } from "./components/DiagramViewer.js";
import { TabBar } from "./components/TabBar.js";
import { WelcomeScreen } from "./components/WelcomeScreen.js";
import { PromptModal } from "./components/PromptModal.js";
import { ImageImportModal } from "./components/ImageImportModal.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { WalletAddress } from "./components/WalletAddress.js";
import { CookieNotice } from "./components/CookieNotice.js";
import { LoginPage } from "./pages/LoginPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function AppHeader() {
  const { db } = useDocuments();
  const { user, credits, isAnonymous, walletAddress, signOut, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? db.getUserId();
  const [checking, setChecking] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate("/app");
  };

  const handleCheckDeposit = async () => {
    setChecking(true);
    setDepositResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-balance", {
        method: "POST",
      });
      if (error) throw error;
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
      setTimeout(() => setDepositResult(null), 4000);
    }
  };

  return (
    <div className="app-header">
      <h1>Objectify</h1>
      <span
        title={userId}
        style={{
          fontSize: 11,
          color: "#aaa",
          userSelect: "all",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {walletAddress ? (
          <>
            <WalletAddress address={walletAddress} />
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Send USDC to reload credits</span>
              <button
                onClick={handleCheckDeposit}
                disabled={checking}
                style={{
                  all: "unset",
                  cursor: checking ? "default" : "pointer",
                  fontSize: 10,
                  color: checking ? "#999" : "#1976d2",
                  textDecoration: "underline",
                }}
              >
                {checking ? "Checking..." : "Check for deposit"}
              </button>
            </div>
            {depositResult && (
              <div style={{ fontSize: 10, color: depositResult.startsWith("+") ? "#4caf50" : "#999", marginTop: 1 }}>
                {depositResult}
              </div>
            )}
          </>
        ) : user?.email ? (
          `${user.email} · ${userId.slice(0, 8)}`
        ) : (
          `User: ${userId.slice(0, 8)}`
        )}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {credits !== null && (credits > 0 || !isAnonymous) && (
          <span
            style={{
              fontSize: 13,
              color: "#666",
              fontWeight: 500,
            }}
          >
            {credits} credit{credits !== 1 ? "s" : ""}
          </span>
        )}
        {user && !isAnonymous ? (
          <>
            <button
              className="load-btn"
              onClick={() => navigate("/settings")}
              style={{ fontSize: 12 }}
              title="Settings"
            >
              Settings
            </button>
            <button
              className="load-btn"
              onClick={handleSignOut}
              style={{ fontSize: 12 }}
            >
              Sign Out
            </button>
          </>
        ) : isAnonymous ? (
          <button
            className="load-btn"
            onClick={() => navigate("/login")}
            style={{ fontSize: 12 }}
          >
            Sign In
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AppContent() {
  const { activeDocument } = useDocuments();

  if (!activeDocument) {
    return <WelcomeScreen />;
  }

  return <DiagramViewer key={activeDocument.id} document={activeDocument} />;
}

function EditorApp() {
  return (
    <DocumentProvider>
      <div className="app">
        <AppHeader />
        <TabBar />
        <AppContent />
        <PromptModal />
        <ImageImportModal />
      </div>
    </DocumentProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CookieNotice />
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/docs" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <EditorApp />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
