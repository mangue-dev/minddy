// Optional local-only observer: preload with NODE_OPTIONS=--import=<this file>.
// Record upstream operation names and headers-ready durations, never query
// strings, request bodies, cookies, credentials or returned account data.
import { appendFileSync } from "node:fs";
const output = process.env.MINDDY_PERF_SERVER_LOG;
if (output) {
  const original = globalThis.fetch;
  globalThis.fetch = async function(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const match = url.pathname.match(/^\/(rest\/v1\/(?:rpc\/)?[^/]+|auth\/v1\/(?:user|token|\.well-known\/jwks.json))/);
    const start = performance.now();
    try {
      const response = await original.call(this, input, init);
      if (match) appendFileSync(output, JSON.stringify({ at: Date.now(), operation: match[1], method: init?.method ?? "GET", status: response.status, headersMs: performance.now() - start, contentLength: response.headers.get("content-length") }) + "\n");
      return response;
    } catch (error) {
      if (match) appendFileSync(output, JSON.stringify({ at: Date.now(), operation: match[1], failed: true, headersMs: performance.now() - start }) + "\n");
      throw error;
    }
  };
}
