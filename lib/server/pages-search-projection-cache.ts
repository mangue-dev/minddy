import "server-only";

type Entry = { body: string; bytes: number; timer: ReturnType<typeof setTimeout> };

/** Bound decrypted Markdown to process memory; callers must authenticate each row first. */
export class PageSearchProjectionCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<string>>();
  private bytes = 0;

  constructor(private readonly ttlMs = 60_000, private readonly maxEntries = 256,
    private readonly maxBytes = 8 * 1024 * 1024) {}

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  async get(key: string, project: () => Promise<string>): Promise<string> {
    const cached = this.entries.get(key);
    if (cached) return cached.body;
    const running = this.pending.get(key);
    if (running) return running;
    const load = async () => {
      const body = await project();
      const bytes = Buffer.byteLength(body, "utf8");
      if (bytes > this.maxBytes) return body;
      while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.remove(oldest);
      }
      const timer = setTimeout(() => this.remove(key), this.ttlMs);
      timer.unref();
      this.entries.set(key, { body, bytes, timer });
      this.bytes += bytes;
      return body;
    };
    // Avoid retaining an unbounded queue of projection promises under cross-project load.
    if (this.pending.size >= 32) return project();
    const promise = load().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
