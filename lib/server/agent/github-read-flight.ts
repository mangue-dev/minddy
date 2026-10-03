import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

// Only an already-authorized PR reader installs this scope. No settled values,
// credentials or response bodies survive an operation; mutations bypass it.
const scope = new AsyncLocalStorage<string>();
const reads = new Map<string, Promise<string>>();
const MAX_IN_FLIGHT = 256;
let writes = 0;

export function withGithubReadScope<T>(identity: readonly string[], read: () => T): T {
  return scope.run(JSON.stringify(identity), read);
}

export async function githubResponseText(
  url: string,
  token: string,
  init: RequestInit,
  readOnly: boolean,
): Promise<{ status: number; ok: boolean; text: string; retryAfter?: string | null }> {
  const owner = scope.getStore();
  const requestUrl = new URL(url);
  requestUrl.searchParams.sort();
  const headers = new Headers(init.headers);
  const key = createHash("sha256").update(JSON.stringify([
    owner, token, requestUrl.href, init.method ?? "GET", [...headers].sort(), init.body ?? null,
  ])).digest("hex");
  const perform = async () => {
    // Explicitly prevent Next or an intermediary from retaining private reads.
    const response = await fetch(url, { ...init, cache: "no-store" });
    return JSON.stringify({ status: response.status, ok: response.ok, text: await response.text(),
      retryAfter: response.headers.get("retry-after") });
  };
  if (!readOnly) {
    writes++;
    reads.clear();
    try { return JSON.parse(await perform()); }
    finally { writes--; reads.clear(); }
  }
  if (!owner || writes > 0) return JSON.parse(await perform());
  const pending = reads.get(key);
  if (pending) return JSON.parse(await pending);
  // Saturation falls back to an authoritative read, never an unbounded queue.
  if (reads.size >= MAX_IN_FLIGHT) return JSON.parse(await perform());
  const operation = perform().finally(() => {
    if (reads.get(key) === operation) reads.delete(key);
  });
  reads.set(key, operation);
  // Each consumer parses its own value; mutations cannot alter a shared object.
  return JSON.parse(await operation);
}
