export type { DbAdapter, FeedbackRecord, ChatMessage, SharedFeedback, DiagramDocument, DiagramDocumentMeta } from "./types.js";
export { LocalStorageAdapter } from "./local-storage.js";
export { SupabaseAdapter } from "./supabase-adapter.js";

import type { DbAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-storage.js";
import { SupabaseAdapter } from "./supabase-adapter.js";

/**
 * Create a database adapter.
 * If a Supabase user ID is provided, use SupabaseAdapter.
 * Otherwise, fall back to LocalStorageAdapter.
 */
export function createDbAdapter(supabaseUserId?: string): DbAdapter {
  if (supabaseUserId) {
    return new SupabaseAdapter(supabaseUserId);
  }
  return new LocalStorageAdapter();
}
