import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openFixture } from "./stable-restored-tabs.mjs";
import { secondaryManifestPath, SCALED_SECONDARY_MARKER, secondaryOriginalIssueIds } from "./enrich-secondary-workload.mjs";

// Read-only source attribution during the explicitly authorized add-only job.
// No browser, body export, content mutation or ordinary latency measurement.
const label = process.env.MINDDY_PERF_LABEL ?? "min683-restored-before-scaled-source-cap-diagnostic-1";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.resolve("output/playwright/performance", `${label}.json`);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let journal;
for (;;) {
  journal = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  assert.equal(journal.marker, SCALED_SECONDARY_MARKER);
  const accepted = Object.values(journal.operations).filter((operation) => operation.kind === "issue" && operation.phase === "accepted");
  if (accepted.length >= 401) break;
  assert.ok(!journal.failure, "Stop the diagnostic if the add-only application failed before its threshold");
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
const session = await openFixture();
try {
  assert.equal(journal.userId, session.fixture.userId); assert.equal(journal.email, session.fixture.email);
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
  assert.ok(productRoot, "Declare the actual server's production build manifest");
  const product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
  assert.match(product.sha, /^[a-f0-9]{40}$/);
  const startedAt = new Date().toISOString(), rows = [], projectCounts = {};
  // Read all six synthetic sources before the global DTO. Concurrent additions
  // can increase later results; they cannot invalidate a smaller prior source.
  for (const project of session.fixture.projects) {
    const issues = await session.api(`/api/projects/${project}/issues`);
    assert.ok(issues.every((issue) => issue.project_id === project));
    assert.ok(issues.length < 1000, "An individual capped project cannot establish the independent source count");
    projectCounts[project] = issues.length; rows.push(...issues);
  }
  const sourceIds = rows.map((row) => row.id).sort();
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  assert.ok(secondaryOriginalIssueIds.every((id) => sourceIds.includes(id)));
  assert.ok(sourceIds.length > 1000, "Require a genuinely complete prior synthetic source above the known cap");
  const sourceCompletedAt = new Date().toISOString();
  const global = await session.api("/api/me/board");
  const globalIds = new Set(global.issues.map((issue) => issue.id));
  const missing = sourceIds.filter((id) => !globalIds.has(id));
  const result = { label, protocol: "min683-excluded-scaled-source-completeness-v1",
    excludedFromComparison: "Dataset is growing through serialized fixture-only additions; no ordinary latency claims",
    datasetInProgress: true, marker: journal.marker, sha: product.sha, build: product.build,
    declaredBuildRoot: productRoot, timestamp: startedAt, sourceCompletedAt, globalCompletedAt: new Date().toISOString(),
    projectCounts, independentSyntheticSourceCount: sourceIds.length, globalSourceCount: global.issues.length,
    sourceIdFingerprint: digest(sourceIds), missingPriorSyntheticIds: missing.length, missingIdsFingerprint: digest(missing),
    confirmedTruncation: global.issues.length === 1000 && global.issues.length < sourceIds.length,
    status: global.issues.length < sourceIds.length ? "incomplete-source-confirmed" : "complete-source-observed",
    runnerSourceHashScope: ["diagnose-scaled-source-cap.mjs"], runnerSourceHash: digest(await readFile(new URL(import.meta.url), "utf8")),
    finishedAt: new Date().toISOString() };
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ...result }));
} finally { await session.close(); }
