// Measure real authorized reads and aggregate upstream calls without logging content.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";
import { listVisibleRepos, listPullRequestsForUser, countPullRequestsForUser, readRepoSyncStates } from "../../lib/server/agent/pull-requests.ts";
import { issueStore, decodeIssue, encodeIssue } from "../../lib/server/issue-store.ts";
import { isContentEncryptionEnabled } from "../../lib/server/encryption/content-config.ts";
import { getPage } from "../../lib/server/pages.ts";
import { encodePage, decodePage } from "../../lib/server/page-content.ts";

loadEnv();
assert.ok(isContentEncryptionEnabled());
const label = process.env.MINDDY_PERF_LABEL ?? "baseline";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const upstream = [];
const results = [];
const originalInfo = console.info;
console.info = () => {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const start = performance.now();
  const response = await originalFetch(input, init);
  if (url.pathname.startsWith("/rest/")) upstream.push({ operation: url.pathname, ms: performance.now() - start, status: response.status });
  return response;
};
try {
const client = createClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
assert.equal(error, null);
assert.equal(data.user.user_metadata.performance_fixture, MARKER);
const projects = Array.from({ length: 6 }, (_, i) => id(`project-${i}`));
// Read content through the authorized repositories and prepare fresh ciphertext in memory.
// No encrypted columns are read directly and none of the generated values is persisted.
const issues = await issueStore(client, data.user.id).select("*").in("project_id", projects).is("deleted_at", null);
assert.equal(issues.error, null);
assert.equal(issues.data.length, 600);
const encryptedIssues = [];
for (let start = 0; start < issues.data.length; start += 16) {
  encryptedIssues.push(...await Promise.all(issues.data.slice(start, start + 16).map((row) => encodeIssue(row, 1))));
}
const encryptedPages = [];
for (let index = 0; index < 20; index++) {
  const result = await getPage(id(`page-0-${index}`), data.user.id);
  assert.ok(result.ok);
  assert.equal(result.page.project_id, projects[0]);
  encryptedPages.push(await encodePage(result.page, { force: true }));
}
await writeFile("output/playwright/performance/workload.json", JSON.stringify({ marker: MARKER, email: EMAIL,
  userId: data.user.id, projects, firstIssue: id("issue-0-0"), firstPage: id("page-0-0"),
  counts: { projects: 6, issues: 600, pages: 120, pullRequests: 180 } }, null, 2));
const plainIssue = issues.data[0];
let repos = [];
// The repository's per-row audit is suppressed only in this diagnostic process.
  for (let run = 0; run < 4; run++) {
    const operations = [
      ["visible-repos", async () => {
        repos = await listVisibleRepos(client);
        assert.equal(repos.length, 6);
        assert.ok(repos.every((repo) => projects.includes(repo.project.id)));
        return repos.length;
      }],
      ["pr-list", async () => {
        const rows = await listPullRequestsForUser(client, repos, { limit: 51 });
        assert.equal(rows.length, 51);
        assert.ok(rows.every((row) => row.title?.startsWith("Performance change")));
        return rows.length;
      }],
      ["pr-count", async () => countPullRequestsForUser(client, repos, ["open", "draft"])],
      ["pr-sync", async () => (await readRepoSyncStates(repos)).size],
      ["issue-read-600", async () => {
        const result = await issueStore(client, data.user.id).select("*").in("project_id", projects).is("deleted_at", null);
        assert.equal(result.error, null);
        assert.equal(result.data.length, 600);
        return result.data.length;
      }],
      ["issue-decode-600", async () => (await Promise.all(encryptedIssues.map((row) => decodeIssue(row, data.user.id)))).length],
      ["page-decode-20", async () => (await Promise.all(encryptedPages.map((row) => decodePage(row, data.user.id)))).length],
      // Encode in memory with the existing project's key; persist no row or document.
      ["issue-encode-memory-10", async () => {
        for (let i = 0; i < 10; i++) {
          const encoded = await encodeIssue(plainIssue, 1);
          assert.equal(encoded.title, null);
          assert.ok(encoded.encryption_version > 0);
        }
        return 10;
      }],
    ];
    for (const [name, action] of operations) {
      upstream.length = 0;
      const start = performance.now();
      const count = await action();
      const result = { run, name, ms: performance.now() - start, count, upstream: [...upstream] };
      results.push(result);
      console.log(JSON.stringify({ run, name, ms: result.ms, count, calls: upstream.length }));
    }
  }
} finally {
  console.info = originalInfo;
  globalThis.fetch = originalFetch;
  await writeFile(`output/playwright/performance/min614-repositories-${label}.json`, JSON.stringify(results, null, 2));
}
