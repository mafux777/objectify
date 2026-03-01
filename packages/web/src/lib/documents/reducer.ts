import type { DocumentState, DocumentAction } from "./types.js";

export const initialDocumentState: DocumentState = {
  library: [],
  openTabIds: [],
  activeTabId: null,
  isCreating: false,
};

export function documentReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case "LIBRARY_LOADED":
      return { ...state, library: action.documents };

    case "CREATE_DOCUMENT":
      return {
        ...state,
        library: [...state.library, action.document],
        openTabIds: [...state.openTabIds, action.document.id],
        activeTabId: action.document.id,
      };

    case "OPEN_DOCUMENT": {
      // Prevent duplicate tabs — just activate if already open
      if (state.openTabIds.includes(action.document.id)) {
        return { ...state, activeTabId: action.document.id };
      }
      // Ensure full document is in library (may have been loaded lazily)
      const inLibrary = state.library.some((d) => d.id === action.document.id);
      const library = inLibrary
        ? state.library.map((d) =>
            d.id === action.document.id ? action.document : d,
          )
        : [...state.library, action.document];
      return {
        ...state,
        library,
        openTabIds: [...state.openTabIds, action.document.id],
        activeTabId: action.document.id,
      };
    }

    case "CLOSE_TAB": {
      const newOpenIds = state.openTabIds.filter((id) => id !== action.id);
      let newActiveId = state.activeTabId;
      if (state.activeTabId === action.id) {
        const closedIndex = state.openTabIds.indexOf(action.id);
        newActiveId =
          newOpenIds[Math.min(closedIndex, newOpenIds.length - 1)] ?? null;
      }
      return { ...state, openTabIds: newOpenIds, activeTabId: newActiveId };
    }

    case "SET_ACTIVE_TAB":
      return { ...state, activeTabId: action.id };

    case "UPDATE_SPEC":
      return {
        ...state,
        library: state.library.map((doc) =>
          doc.id === action.id
            ? { ...doc, spec: action.spec, updatedAt: Date.now() }
            : doc,
        ),
      };

    case "RENAME_DOCUMENT":
      return {
        ...state,
        library: state.library.map((doc) =>
          doc.id === action.id
            ? {
                ...doc,
                title: action.title,
                slug: action.slug,
                updatedAt: Date.now(),
              }
            : doc,
        ),
      };

    case "DELETE_DOCUMENT": {
      const newOpenIds = state.openTabIds.filter((id) => id !== action.id);
      let newActiveId = state.activeTabId;
      if (state.activeTabId === action.id) {
        const closedIndex = state.openTabIds.indexOf(action.id);
        newActiveId =
          newOpenIds[Math.min(closedIndex, newOpenIds.length - 1)] ?? null;
      }
      return {
        ...state,
        library: state.library.filter((doc) => doc.id !== action.id),
        openTabIds: newOpenIds,
        activeTabId: newActiveId,
      };
    }

    case "SET_CREATING":
      return { ...state, isCreating: action.isCreating };

    default:
      return state;
  }
}
