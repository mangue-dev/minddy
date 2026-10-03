// Optional local-only observer: preload with NODE_OPTIONS=--import=<this file>.
// Record upstream operation names and headers-ready durations, never query
// strings, request bodies, cookies, credentials or returned account data.
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
const output = process.env.MINDDY_PERF_SERVER_LOG;
if (output) {
  const original = globalThis.fetch;
  const actors = new Map();
  const inFlight = new Map();
  let sequence = 0;
  globalThis.fetch = async function(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const match = url.pathname.match(/^\/(rest\/v1\/(?:rpc\/)?[^/]+|auth\/v1\/(?:user|token|\.well-known\/jwks.json))/);
    const github = url.origin === "https://api.github.com";
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const authorization = github ? headers.get("authorization") : null;
    if (authorization && !actors.has(authorization)) actors.set(authorization, actors.size + 1);
    const identity = github ? createHash("sha256").update(JSON.stringify([
      actors.get(authorization), method, url.href, headers.get("accept"), init?.body ?? null,
    ])).digest("hex") : null;
    const id = ++sequence;
    const overlap = identity ? inFlight.get(identity) ?? 0 : 0;
    if (identity) inFlight.set(identity, overlap + 1);
    const operation = github
      ? url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "/repos/$repository")
        .replace(/\/(commits|status)\/[^/]+/, "/$1/$sha")
        .replace(/\/branches\/.*?(?=\/protection|$)/, "/branches/$branch")
      : match?.[1];
    const start = performance.now();
    if (github) appendFileSync(output, JSON.stringify({ phase: "start", id, at: Date.now(), operation,
      method, identity, overlap, actor: actors.get(authorization),
      page: url.searchParams.get("page"), perPage: url.searchParams.get("per_page") }) + "\n");
    try {
      const response = await original.call(this, input, init);
      if (operation) appendFileSync(output, JSON.stringify({ ...(github ? { phase: "headers", id, identity } : {}),
        at: Date.now(), operation, method, status: response.status,
        headersMs: performance.now() - start, contentLength: response.headers.get("content-length"),
        ...(github ? { remaining: response.headers.get("x-ratelimit-remaining"),
          used: response.headers.get("x-ratelimit-used"), resource: response.headers.get("x-ratelimit-resource"),
          reset: response.headers.get("x-ratelimit-reset"), retryAfter: response.headers.get("retry-after"),
          conditional: headers.has("if-none-match") || headers.has("if-modified-since") } : {}) }) + "\n");
      return response;
    } catch (error) {
      if (operation) appendFileSync(output, JSON.stringify({ ...(github ? { phase: "failed", id, identity } : {}),
        at: Date.now(), operation, failed: true, headersMs: performance.now() - start }) + "\n");
      throw error;
    } finally {
      if (identity) {
        const remaining = inFlight.get(identity) - 1;
        if (remaining) inFlight.set(identity, remaining);
        else inFlight.delete(identity);
      }
    }
  };
}
