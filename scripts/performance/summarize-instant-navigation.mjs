import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function summarizeNavigationRuns(runs) {
  assert.ok(runs.length > 0, "Provide at least one run");
  const reference = runs[0];
  for (const run of runs) {
    assert.equal(run.status, "passed", `Incomplete run: ${run.label}`);
    assert.ok(!run.diagnostic, "Keep instrumented diagnostics separate from ordinary latency runs");
    assert.equal(run.build, reference.build, "Do not aggregate different product builds");
    assert.equal(run.runtime, reference.runtime, "Do not aggregate different runtimes");
    assert.deepEqual(run.workload ?? null, reference.workload ?? null, "Do not aggregate different fixture contents");
    assert.equal(run.scenario ?? "primary", reference.scenario ?? "primary", "Do not aggregate different journey workloads");
    assert.equal(run.protocol ?? null, reference.protocol ?? null, "Do not aggregate different interaction protocols");
    assert.deepEqual(run.versions, reference.versions, "Do not aggregate different browser versions");
    assert.deepEqual(run.viewport, reference.viewport, "Do not aggregate different viewports");
    assert.equal(run.errors.length, 0, `Renderer errors in ${run.label}`);
    assert.ok(run.cleanup.some((check) => check.preexistingTabsPreserved === true), "Verify preexisting tabs");
    assert.ok(run.cleanup.every((check) => check.removed !== false && check.fixtureTitleRestored !== false && check.fixturePagesUnchanged !== false && check.applicationClosed !== false && check.repositoryConnectionUnchanged !== false && check.connectedBoardUnchanged !== false), "Cleanup failed");
    if (run.scenario === "deep") assert.ok(run.cleanup.some((check) => check.fixturePagesUnchanged === true), "Verify document integrity");
    if (run.workload?.forge) assert.ok(run.cleanup.some((check) => check.repositoryConnectionUnchanged === true), "Verify repository connection integrity");
    if (run.workload?.connectedBoard) assert.ok(run.cleanup.some((check) => check.connectedBoardUnchanged === true), "Verify connected board integrity");
    if (run.scenario === "forge") {
      assert.equal(run.workload?.forge?.prs?.length, 5, "Verify the real PR cohort");
      assert.ok(!run.forgeReadProof?.some((read) => !read.verified), "Unexpected successful forge content");
      for (const pr of run.workload.forge.prs) for (const kind of ["detail", "comments", "commits", "review-comments"]) {
        assert.ok(run.forgeReadProof?.some((read) => read.number === pr.number && read.kind === kind && read.verified), "Verify successful real forge content");
      }
    }
  }
  const names = [...new Set(runs.flatMap((run) => run.measurements.map((sample) => sample.name)))];
  const skeletonSamples = runs.flatMap((run) => run.measurements).filter((row) => Number.isFinite(row.boardSkeletonFrames));
  const journeys = Object.fromEntries(names.map((name) => {
    const rows = runs.flatMap((run) => run.measurements.filter((sample) => sample.name === name));
    const metrics = Object.fromEntries(["domMs", "paintMs", "completeMs", "driverMs"].flatMap((metric) => {
      const samples = rows.map((row) => row[metric]).filter((value) => Number.isFinite(value));
      if (!samples.length) return [];
      const ordered = [...samples].sort((a, b) => a - b);
      const percentile = (p) => ordered[Math.ceil(ordered.length * p) - 1];
      return [[metric, { count: samples.length, p50: percentile(0.5),
        // Cold launch/open samples need more observations before claiming a tail.
        p95: samples.length >= 20 ? percentile(0.95) : null,
        min: ordered[0], max: ordered.at(-1), samples }]];
    }));
    const loading = rows.filter((row) => Number.isFinite(row.loadingFrames));
    const completeLoading = rows.filter((row) => Number.isFinite(row.completeLoadingFrames));
    return [name, { ...metrics, loadingObservations: { observedSamples: loading.length,
      samplesWithLoading: loading.length ? loading.filter((row) => row.loadingFrames > 0).length : null,
      visibleFrames: loading.length ? loading.reduce((sum, row) => sum + row.loadingFrames, 0) : null },
      completeLoadingObservations: { observedSamples: completeLoading.length,
        samplesWithLoading: completeLoading.length ? completeLoading.filter((row) => row.completeLoadingFrames > 0).length : null,
        visibleFrames: completeLoading.length ? completeLoading.reduce((sum, row) => sum + row.completeLoadingFrames, 0) : null } }];
  }));
  return { sha: reference.sha, build: reference.build, runtime: reference.runtime,
    workload: reference.workload ?? null,
    scenario: reference.scenario ?? "primary",
    protocol: reference.protocol ?? null,
    versions: reference.versions, viewport: reference.viewport, launches: runs.length,
    labels: runs.map((run) => run.label), journeys,
    failures: runs.flatMap((run) => run.network.filter((entry) => entry.failed || entry.status >= 400)
      .map(({ path, method, status, failed }) => ({ run: run.label, path, method, status, failed }))),
    boardSkeletonObservedSamples: skeletonSamples.length,
    visibleBoardSkeletonFrames: skeletonSamples.length ? skeletonSamples.reduce((sum, row) => sum + row.boardSkeletonFrames, 0) : null,
    cleanupVerified: true, rendererErrors: 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [destination, ...files] = process.argv.slice(2);
  assert.ok(destination && files.length, "Usage: summarize-instant-navigation.mjs output.json run.json [...]");
  const evidence = await Promise.all(files.map(async (file) => {
    const raw = await readFile(file);
    return { file, sha256: createHash("sha256").update(raw).digest("hex"), run: JSON.parse(raw) };
  }));
  const summary = summarizeNavigationRuns(evidence.map((entry) => entry.run));
  summary.evidence = evidence.map(({ file, sha256 }) => ({ file, sha256 }));
  await writeFile(destination, JSON.stringify(summary, null, 2) + "\n");
}
