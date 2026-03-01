import type { DbAdapter, FeedbackRecord, DiagramDocument, DiagramDocumentMeta } from "./types.js";

const USER_ID_KEY = "objectify:userId";
const FEEDBACK_KEY = "objectify:feedback";
const DOCS_INDEX_KEY = "objectify:docs-index";
const DOC_PREFIX = "objectify:doc:";

export class LocalStorageAdapter implements DbAdapter {
  private userId: string;

  constructor() {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(USER_ID_KEY, id);
    }
    this.userId = id;
  }

  getUserId(): string {
    return this.userId;
  }

  // ── Feedback ──────────────────────────────────────────────

  async logFeedback(
    record: Omit<FeedbackRecord, "id" | "timestamp">,
  ): Promise<FeedbackRecord> {
    const full: FeedbackRecord = {
      ...record,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const existing = this.readFeedback();
    existing.push(full);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing));

    return full;
  }

  async getFeedback(userId: string): Promise<FeedbackRecord[]> {
    return this.readFeedback().filter((r) => r.userId === userId);
  }

  private readFeedback(): FeedbackRecord[] {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as FeedbackRecord[];
    } catch {
      return [];
    }
  }

  // ── Documents ─────────────────────────────────────────────

  async listDocuments(): Promise<DiagramDocumentMeta[]> {
    return this.readIndex();
  }

  async getDocument(id: string): Promise<DiagramDocument | null> {
    const meta = this.readIndex().find((m) => m.id === id);
    if (!meta) return null;

    const raw = localStorage.getItem(DOC_PREFIX + id);
    if (!raw) return null;

    try {
      const spec = JSON.parse(raw);
      return { ...meta, spec };
    } catch {
      return null;
    }
  }

  async saveDocument(doc: DiagramDocument): Promise<void> {
    // Write spec separately to keep the index lightweight
    localStorage.setItem(DOC_PREFIX + doc.id, JSON.stringify(doc.spec));

    // Update index
    const index = this.readIndex();
    const { spec: _, ...meta } = doc;
    const existing = index.findIndex((m) => m.id === doc.id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    localStorage.setItem(DOCS_INDEX_KEY, JSON.stringify(index));
  }

  async deleteDocument(id: string): Promise<void> {
    localStorage.removeItem(DOC_PREFIX + id);

    const index = this.readIndex().filter((m) => m.id !== id);
    localStorage.setItem(DOCS_INDEX_KEY, JSON.stringify(index));
  }

  private readIndex(): DiagramDocumentMeta[] {
    const raw = localStorage.getItem(DOCS_INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as DiagramDocumentMeta[];
    } catch {
      return [];
    }
  }
}
