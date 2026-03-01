export type { DbAdapter, FeedbackRecord, DiagramDocument, DiagramDocumentMeta } from "./types.js";
export { LocalStorageAdapter } from "./local-storage.js";

import type { DbAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-storage.js";

/** Create a database adapter. Swap this implementation to change backends. */
export function createDbAdapter(): DbAdapter {
  return new LocalStorageAdapter();
}
