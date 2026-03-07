import type { DiagramSpec } from "@objectify/schema";

export interface FeedbackRecord {
  id: string;
  userId: string;
  message: string;
  category: "complaint" | "feedback" | "off-topic";
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  category?: "complaint" | "valid" | "invalid";
}

export interface SharedFeedback {
  id: string;
  userId: string | null;
  documentTitle: string;
  diagramSpec: DiagramSpec;
  chatHistory: ChatMessage[];
  feedbackMessages: FeedbackRecord[];
  userComment: string;
  userAgent: string;
  createdAt: string;
}

export interface DiagramDocument {
  id: string;
  title: string;
  slug: string;
  spec: DiagramSpec;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight metadata returned by listDocuments (no spec payload). */
export type DiagramDocumentMeta = Omit<DiagramDocument, "spec">;

export interface DbAdapter {
  /** Log a feedback/complaint record. Returns the created record with id and timestamp. */
  logFeedback(record: Omit<FeedbackRecord, "id" | "timestamp">): Promise<FeedbackRecord>;

  /** Retrieve all feedback records for a given user. */
  getFeedback(userId: string): Promise<FeedbackRecord[]>;

  /** Get the current user's ID (generates one if none exists). Synchronous. */
  getUserId(): string;

  /** List all saved documents (metadata only — no spec). */
  listDocuments(): Promise<DiagramDocumentMeta[]>;

  /** Get a full document by ID, or null if not found. */
  getDocument(id: string): Promise<DiagramDocument | null>;

  /** Save a document (create or update). */
  saveDocument(doc: DiagramDocument): Promise<void>;

  /** Delete a document by ID. */
  deleteDocument(id: string): Promise<void>;

  /** Submit feedback (diagram + chat history + comments) to the developer. */
  submitSharedFeedback(feedback: Omit<SharedFeedback, "id" | "createdAt">): Promise<void>;

  /** Retrieve all shared feedback submissions for the current user. */
  getSharedFeedback(): Promise<SharedFeedback[]>;

  /** Delete the user's account and all associated data. */
  deleteAccount(): Promise<void>;
}
