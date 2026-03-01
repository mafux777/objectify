import type { DiagramSpec } from "@objectify/schema";
import type { DiagramDocument } from "../db/types.js";

export type { DiagramDocument };

export interface DocumentState {
  /** All documents known to the app (may have spec loaded or not). */
  library: DiagramDocument[];
  /** IDs of currently open tabs, in display order. */
  openTabIds: string[];
  /** ID of the active/focused tab, or null if none. */
  activeTabId: string | null;
  /** True while the LLM is generating a new diagram. */
  isCreating: boolean;
}

export type DocumentAction =
  | { type: "LIBRARY_LOADED"; documents: DiagramDocument[] }
  | { type: "CREATE_DOCUMENT"; document: DiagramDocument }
  | { type: "OPEN_DOCUMENT"; document: DiagramDocument }
  | { type: "CLOSE_TAB"; id: string }
  | { type: "SET_ACTIVE_TAB"; id: string }
  | { type: "UPDATE_SPEC"; id: string; spec: DiagramSpec }
  | { type: "RENAME_DOCUMENT"; id: string; title: string; slug: string }
  | { type: "DELETE_DOCUMENT"; id: string }
  | { type: "SET_CREATING"; isCreating: boolean };
