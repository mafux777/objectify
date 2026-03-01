import { DocumentProvider, useDocuments } from "./lib/documents/index.js";
import { DiagramViewer } from "./components/DiagramViewer.js";
import { TabBar } from "./components/TabBar.js";
import { WelcomeScreen } from "./components/WelcomeScreen.js";
import { PromptModal } from "./components/PromptModal.js";
import { ImageImportModal } from "./components/ImageImportModal.js";

function AppHeader() {
  const { db } = useDocuments();
  const userId = db.getUserId();

  return (
    <div className="app-header">
      <h1>Objectify</h1>
      <span
        title={userId}
        style={{
          fontSize: 11,
          color: "#999",
          fontFamily: "monospace",
          userSelect: "all",
        }}
      >
        User: {userId.slice(0, 8)}
      </span>
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

function App() {
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

export default App;
