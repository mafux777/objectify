import type {
  DbAdapter,
  FeedbackRecord,
  SharedFeedback,
  DiagramDocument,
  DiagramDocumentMeta,
} from "./types.js";
import { supabase } from "../supabase.js";

/**
 * Supabase-backed DbAdapter for authenticated users.
 * Documents are stored in the `conversions` table (leveraging the existing schema).
 * For MVP, feedback is still stored locally since there's no feedback table yet.
 */
export class SupabaseAdapter implements DbAdapter {
  private uid: string;

  constructor(userId: string) {
    this.uid = userId;
  }

  getUserId(): string {
    return this.uid;
  }

  // Feedback — store locally for now (no Supabase feedback table in v1)
  async logFeedback(
    record: Omit<FeedbackRecord, "id" | "timestamp">,
  ): Promise<FeedbackRecord> {
    const full: FeedbackRecord = {
      ...record,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const key = "objectify:feedback";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.push(full);
    localStorage.setItem(key, JSON.stringify(existing));
    return full;
  }

  async getFeedback(userId: string): Promise<FeedbackRecord[]> {
    const key = "objectify:feedback";
    const all = JSON.parse(localStorage.getItem(key) || "[]") as FeedbackRecord[];
    return all.filter((r) => r.userId === userId);
  }

  // Documents — stored in conversions table
  async listDocuments(): Promise<DiagramDocumentMeta[]> {
    const { data } = await supabase
      .from("conversions")
      .select("id, image_url, status, created_at, spec")
      .eq("user_id", this.uid)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (!data) return [];

    return data.map((row) => ({
      id: row.id,
      title: row.spec?.diagrams?.[0]?.title ?? "Untitled",
      slug: row.id.slice(0, 8),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.created_at).getTime(),
    }));
  }

  async getDocument(id: string): Promise<DiagramDocument | null> {
    const { data } = await supabase
      .from("conversions")
      .select("id, spec, created_at")
      .eq("id", id)
      .eq("user_id", this.uid)
      .single();

    if (!data || !data.spec) return null;

    return {
      id: data.id,
      title: data.spec.diagrams?.[0]?.title ?? "Untitled",
      slug: data.id.slice(0, 8),
      spec: data.spec,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.created_at).getTime(),
    };
  }

  async saveDocument(doc: DiagramDocument): Promise<void> {
    // Upsert: if it exists in conversions, update the spec.
    // Otherwise, insert as a new "manual" conversion.
    const { error } = await supabase.from("conversions").upsert(
      {
        id: doc.id,
        user_id: this.uid,
        spec: doc.spec,
        status: "completed",
      },
      { onConflict: "id" },
    );

    if (error) {
      // Fallback to localStorage if Supabase fails
      console.warn("Supabase save failed, falling back to localStorage:", error);
      const key = `objectify:doc:${doc.id}`;
      localStorage.setItem(key, JSON.stringify(doc.spec));
    }
  }

  async deleteDocument(id: string): Promise<void> {
    await supabase
      .from("conversions")
      .delete()
      .eq("id", id)
      .eq("user_id", this.uid);
  }

  // ── Shared Feedback ─────────────────────────────────────────

  async submitSharedFeedback(
    feedback: Omit<SharedFeedback, "id" | "createdAt">,
  ): Promise<void> {
    const { error } = await supabase.from("shared_feedback").insert({
      user_id: feedback.userId,
      document_title: feedback.documentTitle,
      diagram_spec: feedback.diagramSpec,
      chat_history: feedback.chatHistory,
      feedback_messages: feedback.feedbackMessages,
      user_comment: feedback.userComment,
      user_agent: feedback.userAgent,
    });
    if (error) {
      console.error("Failed to submit feedback:", error);
      throw new Error("Failed to submit feedback");
    }
  }

  async getSharedFeedback(): Promise<SharedFeedback[]> {
    const { data } = await supabase
      .from("shared_feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return [];

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      documentTitle: row.document_title,
      diagramSpec: row.diagram_spec,
      chatHistory: row.chat_history ?? [],
      feedbackMessages: row.feedback_messages ?? [],
      userComment: row.user_comment ?? "",
      userAgent: row.user_agent ?? "",
      createdAt: row.created_at,
    }));
  }

  async deleteAccount(): Promise<void> {
    const { error } = await supabase.rpc("delete_user_account");
    if (error) {
      console.error("Failed to delete account:", error);
      throw new Error("Failed to delete account");
    }
    await supabase.auth.signOut();
  }
}
