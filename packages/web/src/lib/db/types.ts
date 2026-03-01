import type { DiagramSpec } from "@objectify/schema";

export interface FeedbackRecord {
  id: string;
  userId: string;
  message: string;
  category: "complaint" | "feedback" | "off-topic";
  timestamp: number;
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
}
