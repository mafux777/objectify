import { useReducer, useRef, useEffect, useMemo } from "react";
import { DocumentContext } from "./context.js";
import { documentReducer, initialDocumentState } from "./reducer.js";
import { createDbAdapter } from "../db/index.js";
import { useAuth } from "../auth-context.js";

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const dbRef = useRef(createDbAdapter(user?.id));

  // Re-create adapter when user changes
  useEffect(() => {
    dbRef.current = createDbAdapter(user?.id);
  }, [user?.id]);

  const [state, dispatch] = useReducer(documentReducer, initialDocumentState);

  // Load document library from DB on mount and when user changes
  useEffect(() => {
    const db = dbRef.current;
    db.listDocuments().then(async (metas) => {
      const docs = await Promise.all(
        metas.map((meta) => db.getDocument(meta.id)),
      );
      const validDocs = docs.filter(
        (d): d is NonNullable<typeof d> => d !== null,
      );
      dispatch({ type: "LIBRARY_LOADED", documents: validDocs });
    });
  }, [user?.id]);

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
