import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

// Only an already-authorized PR reader installs this scope. No settled values,
// credentials or response bodies survive an operation; mutations bypass it.
const scope = new AsyncLocalStorage<{ identity: string; notBefore: number }>();
const reads = new Map<string, { startedAt: number; operation: Promise<string> }>();
const MAX_IN_FLIGHT = 256;
let writes = 0;

export function withGithubReadScope<T>(identity: readonly string[], read: () => T, notBefore = 0): T {
  return scope.run({ identity: JSON.stringify(identity), notBefore }, read);
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
    owner?.identity, token, requestUrl.href, init.method ?? "GET", [...headers].sort(), init.body ?? null,
  ])).digest("hex");
  const perform = async () => {
    // Explicitly prevent Next or an intermediary from retaining private reads.
    const response = await fetch(url, { ...init, cache: "no-store" });
    return JSON.stringify({ status: response.status, ok: response.ok, text: await response.text(),
      retryAfter: response.headers.get("retry-after") ??
        (response.headers.get("x-ratelimit-remaining") === "0" && Number(response.headers.get("x-ratelimit-reset")) > Date.now() / 1000
          ? String(Math.ceil(Number(response.headers.get("x-ratelimit-reset")) - Date.now() / 1000)) : null) });
  };
  if (!readOnly) {
    writes++;
    reads.clear();
    try { return JSON.parse(await perform()); }
    finally { writes--; reads.clear(); }
  }
  if (!owner || writes > 0) return JSON.parse(await perform());
  const pending = reads.get(key);
  // A later activation cannot certify freshness with transport that began
  // before its own HTTP request. Concurrent consumers can still join a read
  // started after both request barriers.
  if (pending && pending.startedAt >= owner.notBefore) return JSON.parse(await pending.operation);
  // Saturation falls back to an authoritative read, never an unbounded queue.
  if (reads.size >= MAX_IN_FLIGHT) return JSON.parse(await perform());
  const startedAt = performance.now();
  const operation = perform().finally(() => {
    if (reads.get(key)?.operation === operation) reads.delete(key);
  });
  reads.set(key, { startedAt, operation });
  // Each consumer parses its own value; mutations cannot alter a shared object.
  return JSON.parse(await operation);
}
