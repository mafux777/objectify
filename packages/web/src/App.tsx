import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { DocumentProvider, useDocuments } from "./lib/documents/index.js";
import { DiagramViewer } from "./components/DiagramViewer.js";
import { TabBar } from "./components/TabBar.js";
import { WelcomeScreen } from "./components/WelcomeScreen.js";
import { PromptModal } from "./components/PromptModal.js";
import { ImageImportModal } from "./components/ImageImportModal.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { LoginPage } from "./pages/LoginPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function AppHeader() {
  const { db } = useDocuments();
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? db.getUserId();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
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
        }}
      >
        {user?.email
          ? `${user.email} · ${userId.slice(0, 8)}`
          : `User: ${userId.slice(0, 8)}`}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {credits !== null && (
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
        {user ? (
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
        <Routes>
          <Route path="/" element={<LandingPage />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
