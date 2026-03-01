import { createContext, useContext } from "react";
import type { DocumentState, DocumentAction, DiagramDocument } from "./types.js";
import type { DbAdapter } from "../db/types.js";

export interface DocumentContextValue {
  state: DocumentState;
  dispatch: React.Dispatch<DocumentAction>;
  /** The currently active document, or null if no tab is active. */
  activeDocument: DiagramDocument | null;
  /** Database adapter for persistence. */
  db: DbAdapter;
}

export const DocumentContext = createContext<DocumentContextValue | null>(null);

export function useDocuments(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error("useDocuments must be used within DocumentProvider");
  return ctx;
}
