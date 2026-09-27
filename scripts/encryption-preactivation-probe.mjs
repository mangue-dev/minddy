import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const [configPath, mode, concurrencyText = "1", countText = "100"] = process.argv.slice(2);
if (!configPath || !["search", "write"].includes(mode)) {
  throw new Error("Usage: node scripts/encryption-preactivation-probe.mjs CONFIG.json search|write [concurrency] [count]");
}
const concurrency = Number(concurrencyText);
const count = Number(countText);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64 ||
    !Number.isSafeInteger(count) || count < 1 || count > 10000) {
  throw new Error("Invalid benchmark concurrency or count");
}
const config = JSON.parse(await readFile(configPath, "utf8"));
const cookie = process.env.MINDDY_BENCHMARK_COOKIE;
if (!cookie || !/^https?:\/\//.test(config.baseUrl) ||
    !/^[0-9a-f-]{36}$/i.test(config.projectId) ||
    !Array.isArray(config.queries) || config.queries.length === 0) {
  throw new Error("Benchmark cookie, base URL, project ID and queries are required");
}
const base = config.baseUrl.replace(/\/$/, "");
const samples = [];
const failures = [];
const created = [];
let next = 0;

async function request(path, init = {}) {
  const started = performance.now();
  const response = await fetch(base + path, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, ms: performance.now() - started };
}

async function worker() {
  while (next < count) {
    const index = next++;
    try {
      if (mode === "search") {
        const query = config.queries[index % config.queries.length];
        const path = `/api/projects/${config.projectId}/pages/search?q=${encodeURIComponent(query.text)}`;
        const result = await request(path);
        samples.push(result.ms);
        const ids = Array.isArray(result.body) ? result.body.map((hit) => hit.id) : [];
        if (result.status !== 200 ||
            (Array.isArray(query.expectedIds) &&
              JSON.stringify(ids) !== JSON.stringify(query.expectedIds))) {
          failures.push({ index, status: result.status, reason: "search result mismatch" });
        }
      } else {
        const title = `MIN-591 benchmark ${randomUUID()}`;
        const result = await request(`/api/projects/${config.projectId}/pages`, {
          method: "POST", body: JSON.stringify({ title,
            markdown: `Benchmark content ${index} alpha beta gamma.` }),
        });
        samples.push(result.ms);
        if (result.status !== 201 || !result.body?.id) {
          failures.push({ index, status: result.status, reason: "page create failed" });
        } else {
          created.push(result.body.id);
        }
      }
    } catch {
      failures.push({ index, reason: "request failed" });
    }
  }
}

try {
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
} finally {
  for (const id of created) {
    const result = await request(`/api/projects/${config.projectId}/pages/${id}`,
      { method: "DELETE" }).catch(() => ({ status: 0 }));
    if (result.status !== 200) failures.push({ reason: "fixture cleanup failed", id });
  }
}
samples.sort((a, b) => a - b);
const percentile = (p) => samples.length
  ? Math.round(samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)])
  : null;
console.log(JSON.stringify({ mode, concurrency, count, measured: samples.length,
  failures, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  p99Ms: percentile(0.99), maxMs: samples.length ? Math.round(samples.at(-1)) : null },
null, 2));
if (failures.length) process.exitCode = 1;
