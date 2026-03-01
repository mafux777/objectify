import { useState, useRef, useCallback, useEffect } from "react";
import { DiagramSpecSchema } from "@objectify/schema";
import { useDocuments } from "../lib/documents/index.js";
import { uniqueSlug } from "../lib/slugify.js";

export function TabBar() {
  const { state, dispatch, db } = useDocuments();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const existingSlugs = new Set(state.library.map((d) => d.slug));

  // Close add-menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleTabClick = useCallback(
    (id: string) => {
      dispatch({ type: "SET_ACTIVE_TAB", id });
    },
    [dispatch],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      dispatch({ type: "CLOSE_TAB", id });
    },
    [dispatch],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button === 1) {
        e.preventDefault();
        dispatch({ type: "CLOSE_TAB", id });
      }
    },
    [dispatch],
  );

  const startRename = useCallback((id: string, currentTitle: string) => {
    setEditingTabId(id);
    setEditValue(currentTitle);
    setContextMenu(null);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, []);

  const finishRename = useCallback(() => {
    if (!editingTabId || !editValue.trim()) {
      setEditingTabId(null);
      return;
    }
    const slug = uniqueSlug(editValue.trim(), existingSlugs);
    dispatch({
      type: "RENAME_DOCUMENT",
      id: editingTabId,
      title: editValue.trim(),
      slug,
    });
    const doc = state.library.find((d) => d.id === editingTabId);
    if (doc) {
      db.saveDocument({
        ...doc,
        title: editValue.trim(),
        slug,
        updatedAt: Date.now(),
      });
    }
    setEditingTabId(null);
  }, [editingTabId, editValue, existingSlugs, dispatch, state.library, db]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      dispatch({ type: "SET_ACTIVE_TAB", id });
      setContextMenu({ id, x: e.clientX, y: e.clientY });
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setContextMenu(null);
      if (!confirm("Delete this diagram? This cannot be undone.")) return;
      await db.deleteDocument(id);
      dispatch({ type: "DELETE_DOCUMENT", id });
    },
    [db, dispatch],
  );

  const handleDownloadJson = useCallback(
    (id: string) => {
      setContextMenu(null);
      const doc = state.library.find((d) => d.id === id);
      if (!doc) return;
      const json = JSON.stringify(doc.spec, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.slug}-spec.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [state.library],
  );

  const createBlank = useCallback(() => {
    setShowMenu(false);
    const title = "Untitled Diagram";
    const slug = uniqueSlug("untitled-diagram", existingSlugs);
    const doc = {
      id: crypto.randomUUID(),
      title,
      slug,
      spec: {
        version: "1.0" as const,
        description: "",
        diagrams: [
          {
            id: "diagram-1",
            title: "Untitled",
            direction: "RIGHT" as const,
            layoutMode: "auto" as const,
            nodes: [],
            edges: [],
          },
        ],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.saveDocument(doc);
    dispatch({ type: "CREATE_DOCUMENT", document: doc });
  }, [existingSlugs, db, dispatch]);

  const handleImportJson = useCallback(
    (file: File) => {
      setShowMenu(false);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          const spec = DiagramSpecSchema.parse(json);
          const title =
            spec.diagrams[0]?.title ?? file.name.replace(/\.json$/, "");
          const slug = uniqueSlug(title, existingSlugs);
          const doc = {
            id: crypto.randomUUID(),
            title,
            slug,
            spec,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          db.saveDocument(doc);
          dispatch({ type: "CREATE_DOCUMENT", document: doc });
        } catch (err) {
          alert(
            `Failed to import: ${err instanceof Error ? err.message : "Invalid JSON"}`,
          );
        }
      };
      reader.readAsText(file);
    },
    [existingSlugs, db, dispatch],
  );

  return (
    <>
      <div className="document-tab-bar">
        {state.openTabIds.map((id) => {
          const doc = state.library.find((d) => d.id === id);
          if (!doc) return null;
          const isActive = id === state.activeTabId;

          return (
            <div
              key={id}
              className={`document-tab ${isActive ? "active" : ""}`}
              onClick={() => handleTabClick(id)}
              onMouseDown={(e) => handleMiddleClick(e, id)}
              onDoubleClick={() => startRename(id, doc.title)}
              onContextMenu={(e) => handleContextMenu(e, id)}
            >
              {editingTabId === id ? (
                <input
                  ref={editInputRef}
                  className="tab-rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishRename();
                    if (e.key === "Escape") setEditingTabId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="tab-title">{doc.title}</span>
              )}
              <button
                className="tab-close"
                onClick={(e) => handleClose(e, id)}
                title="Close"
              >
                &times;
              </button>
            </div>
          );
        })}

        <div className="tab-bar-add-wrapper" ref={menuRef}>
          <button
            className="tab-bar-add"
            onClick={() => setShowMenu(!showMenu)}
            title="New diagram"
          >
            +
          </button>
          {showMenu && (
            <div className="tab-add-menu">
              <button onClick={createBlank}>New Blank Diagram</button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  window.dispatchEvent(new CustomEvent("objectify:create-from-prompt"));
                }}
              >
                Create from Prompt
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  window.dispatchEvent(new CustomEvent("objectify:import-from-image"));
                }}
              >
                Import from Image
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  fileInputRef.current?.click();
                }}
              >
                Import JSON
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportJson(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div
            className="tab-context-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="tab-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                const doc = state.library.find(
                  (d) => d.id === contextMenu.id,
                );
                if (doc) startRename(contextMenu.id, doc.title);
              }}
            >
              Rename
            </button>
            <button onClick={() => handleDownloadJson(contextMenu.id)}>
              Download JSON
            </button>
            <button
              onClick={() => {
                setContextMenu(null);
                window.dispatchEvent(new CustomEvent("objectify:export-png"));
              }}
            >
              Download PNG
            </button>
            <button
              onClick={() => {
                setContextMenu(null);
                dispatch({ type: "CLOSE_TAB", id: contextMenu.id });
              }}
            >
              Close
            </button>
            <hr />
            <button
              className="danger"
              onClick={() => handleDelete(contextMenu.id)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
