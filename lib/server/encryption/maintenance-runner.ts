import "server-only";
import { withSupabaseAbortSignal } from "@/lib/server/supabase-fetch";

type Pass = {
  work: () => Promise<unknown>;
  sharedBundle: boolean;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/** Bound repository load and keep passes sharing parent-row locks apart. */
export class MaintenanceRunner {
  private readonly passes: Pass[] = [];
  private readonly results: Promise<unknown>[] = [];

  constructor(private readonly signal: AbortSignal, private readonly concurrency = 3) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error("Invalid maintenance concurrency");
    }
  }

  schedule<T>(work: () => Promise<T>, sharedBundle = false): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      this.passes.push({ work, sharedBundle, resolve: (value) => resolve(value as T), reject });
    });
    this.results.push(result);
    return result;
  }

  /** Rotate the first domain each hour; report results in their original order. */
  async run(hour = Math.floor(Date.now() / 3_600_000)): Promise<PromiseSettledResult<unknown>[]> {
    const offset = this.passes.length ? ((hour % this.passes.length) + this.passes.length) % this.passes.length : 0;
    const queue = [...this.passes.slice(offset), ...this.passes.slice(0, offset)];
    let active = 0;
    let bundleActive = false;
    const abort = () => {
      for (const pass of this.passes) pass.reject(new Error("Maintenance interrupted"));
      queue.length = 0;
    };
    const drain = () => {
      if (this.signal.aborted) return;
      while (active < this.concurrency) {
        const index = queue.findIndex((pass) => !pass.sharedBundle || !bundleActive);
        if (index < 0) break;
        const [pass] = queue.splice(index, 1);
        active++;
        if (pass.sharedBundle) bundleActive = true;
        // Promise callbacks also turn synchronous worker failures into outcomes.
        Promise.resolve().then(() => {
          this.signal.throwIfAborted();
          return withSupabaseAbortSignal(this.signal, pass.work);
        }).then(pass.resolve, pass.reject).finally(() => {
          active--;
          if (pass.sharedBundle) bundleActive = false;
          drain();
        });
      }
    };
    const outcomes = Promise.allSettled(this.results);
    this.signal.addEventListener("abort", abort, { once: true });
    if (this.signal.aborted) abort();
    else drain();
    try { return await outcomes; }
    finally { this.signal.removeEventListener("abort", abort); }
  }
}
