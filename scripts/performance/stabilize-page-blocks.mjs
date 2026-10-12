import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { request } from "playwright";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id, workload } from "./seed.mjs";
import { stabilizedFixtureContent } from "./fixture-page-blocks.mjs";

// The fixture's legacy `id` attribute is not Tiptap's `blockId`. Normalize
// only the four deep-navigation documents, through versioned ordinary APIs.
loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const manifestPath = "output/playwright/performance/workload.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.marker, MARKER);
assert.equal(manifest.email, EMAIL);
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const { data, error } = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
assert.ifError(error);
assert.equal(data.user.id, manifest.userId);
assert.equal(data.user.user_metadata.performance_fixture, MARKER);
const client = await request.newContext({ baseURL: base,
  extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
const targets = [[0, 10], [0, 11], [1, 0], [1, 1]];
const expected = workload(manifest.userId).pages;
try {
  const plans = [];
  for (const [project, document] of targets) {
    const pageId = id(`page-${project}-${document}`);
    const href = `/api/projects/${id(`project-${project}`)}/pages/${pageId}`;
    const response = await client.get(href);
    assert.ok(response.ok());
    const page = await response.json();
    assertScope("pages", page, manifest.userId);
    const original = expected.find((row) => row.id === pageId);
    const content = stabilizedFixtureContent(page, original, project, document);
    plans.push({ href, page, content, changed: JSON.stringify(content) !== JSON.stringify(page.content) });
  }
  console.log(JSON.stringify({ documents: plans.length, changes: plans.filter((plan) => plan.changed).length,
    duplicatedFixtureDocuments: plans.filter((plan) => plan.page.content.content.length === 160).length, apply: process.argv.includes("--apply") }));
  if (!process.argv.includes("--apply")) process.exitCode = 0;
  else {
    for (const plan of plans.filter((plan) => plan.changed)) {
      const response = await client.patch(plan.href, { data: { content: plan.content, version: plan.page.version } });
      assert.ok(response.ok(), `Versioned fixture repair failed: ${response.status()}`);
      const page = await response.json();
      assert.deepEqual(page.content, plan.content);
    }
    for (const plan of plans) {
      const response = await client.get(plan.href);
      assert.ok(response.ok());
      const page = await response.json();
      assert.deepEqual(page.content, plan.content);
    }
    manifest.pageBlockWorkload = { documents: targets.map(([project, document]) => id(`page-${project}-${document}`)), blocksPerDocument: 80, stableBlockIds: true };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
} finally { await client.dispose(); }
