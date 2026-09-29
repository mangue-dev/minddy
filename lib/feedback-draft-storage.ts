import { validFeedbackDraft, type FeedbackDraft, type FeedbackDraftSnapshot } from "./feedback-draft";

export class LegacyFeedbackDraft extends Error {
  constructor(readonly value: FeedbackDraft) { super("Legacy feedback draft needs explicit recovery"); }
}
export class FeedbackDraftStorage {
  private generation = 0;
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();
  readonly key: string;
  constructor(private token: string, private storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, private request = fetch) {
    this.key = `mdy-feedback-draft:${token}`;
  }
  private async call(body: unknown): Promise<{ value?: FeedbackDraft; snapshot?: FeedbackDraftSnapshot }> {
    const response = await this.request(`/f/${encodeURIComponent(this.token)}/draft`, {
      method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Feedback draft unavailable");
    return response.json();
  }
  async load(): Promise<FeedbackDraft | null> {
    await this.queue.catch(() => {});
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as FeedbackDraftSnapshot;
    if (validFeedbackDraft(snapshot)) throw new LegacyFeedbackDraft(snapshot);
    if (snapshot.format !== "minddy-feedback-draft-v1") throw new Error("Invalid feedback draft");
    if (snapshot.expiresAt <= Date.now()) { this.clear(); return null; }
    const generation = this.generation;
    const revision = this.revision;
    const { value } = await this.call({ operation: "open", snapshot });
    if (generation !== this.generation || revision !== this.revision || this.storage.getItem(this.key) !== raw) return null;
    if (!validFeedbackDraft(value)) throw new Error("Invalid feedback draft");
    return value;
  }
  save(value: FeedbackDraft): Promise<void> {
    if (!validFeedbackDraft(value)) return Promise.reject(new Error("Invalid feedback draft"));
    if (!value.title.trim() && !value.body.trim()) { this.clear(); return Promise.resolve(); }
    const generation = this.generation;
    const revision = ++this.revision;
    const operation = (async () => {
      if (generation !== this.generation || revision !== this.revision) return;
      const { snapshot } = await this.call({ operation: "seal", value });
      if (generation !== this.generation || revision !== this.revision) return;
      if (snapshot?.format !== "minddy-feedback-draft-v1" || typeof snapshot.ciphertext !== "string"
        || snapshot.expiresAt <= Date.now()) throw new Error("Invalid feedback draft response");
      this.storage.setItem(this.key, JSON.stringify(snapshot));
    })();
    this.queue = operation;
    return operation;
  }
  clear(): void { this.generation += 1; this.storage.removeItem(this.key); }
}
