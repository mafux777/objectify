import { useReducer, useRef, useEffect, useMemo } from "react";
import { DocumentContext } from "./context.js";
import { documentReducer, initialDocumentState } from "./reducer.js";
import { createDbAdapter } from "../db/index.js";

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef(createDbAdapter());
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState);

  // Load document library from DB on mount
  useEffect(() => {
    const db = dbRef.current;
    db.listDocuments().then(async (metas) => {
      // Load full documents (including specs) for library
      const docs = await Promise.all(
        metas.map((meta) => db.getDocument(meta.id)),
      );
      const validDocs = docs.filter(
        (d): d is NonNullable<typeof d> => d !== null,
      );
      dispatch({ type: "LIBRARY_LOADED", documents: validDocs });
    });
  }, []);

  const activeDocument = useMemo(
    () =>
      state.activeTabId
        ? (state.library.find((d) => d.id === state.activeTabId) ?? null)
        : null,
    [state.activeTabId, state.library],
  );

  const value = useMemo(
    () => ({ state, dispatch, activeDocument, db: dbRef.current }),
    [state, activeDocument],
  );

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}
