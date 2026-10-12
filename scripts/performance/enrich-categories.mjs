import assert from "node:assert/strict";
import { open, readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { request } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";

const definitions = [
  ["Bug", "#ef4444"], ["Feature", "#3b82f6"], ["Improvement", "#22c55e"],
  ["Design", "#a855f7"], ["Documentation", "#eab308"], ["Technical", "#6b7280"],
];

export function categoryIndexes(index) {
  assert.ok(Number.isInteger(index) && index >= 0 && index < 100);
  const slot = index % 10;
  const count = slot === 0 ? 3 : slot <= 2 ? 0 : slot <= 6 ? 1 : 2;
  return Array.from({ length: count }, (_, offset) => (Math.floor(index / 10) + slot + offset) % definitions.length);
}

export function validateFixtureIssues(rows, project, userId) {
  assert.equal(rows.length, 100, "Expected the complete fixture project");
  const expected = new Set(Array.from({ length: 100 }, (_, index) => id(`issue-${project}-${index}`)));
  for (const row of rows) {
    assertScope("issues", row, userId);
    assert.equal(row.project_id, id(`project-${project}`));
    assert.ok(expected.delete(row.id), "Unexpected or duplicate fixture issue");
  }
  assert.equal(expected.size, 0);
}

async function enrich() {
  if (!process.argv.includes("--apply")) {
    console.log("Pass --apply to enrich the marked performance fixture with six categories per project. Existing assignments are preserved.");
    return;
  }
  loadEnv();
  const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.equal(new URL(base).origin, base);
  const manifest = "output/playwright/performance/workload.json";
  const fixture = JSON.parse(await readFile(manifest, "utf8"));
  assert.equal(fixture.marker, MARKER);
  assert.equal(fixture.email, EMAIL);
  assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, project) => id(`project-${project}`)));
  const cookies = [];
  const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
  if (error) throw new Error(`Fixture sign-in failed: ${error.code}`);
  assert.equal(data.user.id, fixture.userId);
  assert.equal(data.user.user_metadata.performance_fixture, MARKER);
  const client = await request.newContext({ baseURL: base,
    extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });
  async function api(url, method = "GET", data) {
    const response = await client.fetch(url, { method, ...(data === undefined ? {} : { data }) });
    assert.ok(response.ok(), `${method} ${url}: ${response.status()}`);
    return response.json();
  }
  // Refuse concurrent passes. After a hard interruption, check that the
  // recorded process has exited before removing this fixture-local lock.
  const lockPath = `${manifest}.categories.lock`;
  const lock = await open(lockPath, "wx");
  await lock.writeFile(String(process.pid));
  try {
    // Validate every target before any write. Ordinary encrypted application
    // APIs enforce permissions; no service-role writes or forge calls are used.
    const projects = [];
    for (const [index, projectId] of fixture.projects.entries()) {
      assertScope("projects", await api(`/api/projects/${projectId}`), fixture.userId);
      const issues = await api(`/api/projects/${projectId}/issues`);
      validateFixtureIssues(issues, index, fixture.userId);
      const categories = await api(`/api/projects/${projectId}/categories`);
      for (const category of categories) assert.equal(category.project_id, projectId);
      projects.push({ projectId, index, issues, categories });
    }
    let writes = 0;
    for (const project of projects) {
      const categoryIds = [];
      for (const [name, color] of definitions) {
        const matches = project.categories.filter((category) => category.name === name)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
        // A project can already have duplicate names. Reuse the oldest row,
        // preserve every existing row/assignment, and never create another.
        const category = matches[0] ?? await api(`/api/projects/${project.projectId}/categories`, "POST", { name, color });
        assert.equal(category.project_id, project.projectId);
        categoryIds.push(category.id);
      }
      let cursor = 0;
      // Three independent issues at a time; never overlap replacements on one
      // issue. An interrupted pass is safely replayable without clearing tags.
      const workers = await Promise.allSettled(Array.from({ length: 3 }, async () => {
        while (cursor < 100) {
          const index = cursor++;
          const issueId = id(`issue-${project.index}-${index}`);
          const issue = project.issues.find((row) => row.id === issueId);
          assert.ok(Array.isArray(issue.category_ids), "Missing category assignments");
          const existing = issue.category_ids;
          const wanted = [...new Set([...existing, ...categoryIndexes(index).map((index) => categoryIds[index])])];
          if (wanted.length === existing.length) continue;
          const result = await api(`/api/issues/${issueId}/categories`, "PUT", { category_ids: wanted });
          assert.deepEqual([...result.category_ids].sort(), [...wanted].sort());
          writes++;
        }
      }));
      const failures = workers.filter((worker) => worker.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((worker) => worker.reason), "Category enrichment failed");
      console.log(`Project ${project.index + 1}: category enrichment complete`);
    }
    const distribution = { untagged: 0, single: 0, multiple: 0, assignments: 0 };
    let categoryCount = 0;
    for (const project of projects) {
      const issues = await api(`/api/projects/${project.projectId}/issues`);
      validateFixtureIssues(issues, project.index, fixture.userId);
      const categories = await api(`/api/projects/${project.projectId}/categories`);
      categoryCount += categories.length;
      const ids = new Set(categories.map((category) => category.id));
      for (const [index] of Array.from({ length: 100 }).entries()) {
        const issue = issues.find((row) => row.id === id(`issue-${project.index}-${index}`));
        const tags = issue.category_ids;
        assert.ok(Array.isArray(tags));
        assert.ok(tags.every((categoryId) => ids.has(categoryId)));
        for (const wanted of categoryIndexes(index)) assert.ok(tags.some((tag) => categories.find((category) => category.id === tag)?.name === definitions[wanted][0]));
        distribution[tags.length === 0 ? "untagged" : tags.length === 1 ? "single" : "multiple"]++;
        distribution.assignments += tags.length;
      }
    }
    fixture.counts.categories = categoryCount;
    fixture.categoryWorkload = { version: "min683-categories-v1", ...distribution };
    await writeFile(manifest, JSON.stringify(fixture, null, 2) + "\n");
    console.log(JSON.stringify({ writes, categories: categoryCount, ...distribution }));
  } finally {
    await client.dispose();
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await enrich();
