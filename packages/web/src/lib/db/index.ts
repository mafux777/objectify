export type { DbAdapter, FeedbackRecord, ChatMessage, SharedFeedback, DiagramDocument, DiagramDocumentMeta, Template } from "./types.js";
export { LocalStorageAdapter } from "./local-storage.js";
export { SupabaseAdapter } from "./supabase-adapter.js";

import type { DbAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-storage.js";
import { SupabaseAdapter } from "./supabase-adapter.js";

/**
 * Create a database adapter.
 * With anonymous sign-ins, all users have a real Supabase ID.
 * LocalStorageAdapter is only used in AUTH_BYPASS dev mode.
 */
export function createDbAdapter(supabaseUserId?: string): DbAdapter {
  if (supabaseUserId) {
    return new SupabaseAdapter(supabaseUserId);
  }
  // AUTH_BYPASS dev mode only
  return new LocalStorageAdapter();
}
