import assert from "node:assert/strict";
import test from "node:test";
import { broadComparisonRecord, summarizeBroadMeasurements } from "./summarize-broad-evidence.mjs";

test("keeps a fast issue title shell separate from complete content and visible loading", () => {
  const [summary] = summarizeBroadMeasurements([{ name: "issue-open", paintMs: 35, completeMs: 703, loadingFrames: 0, completeLoadingFrames: 74 }]);
  assert.equal(summary.shellPaintMs.p50, 35);
  assert.equal(summary.fullUsableMs.p50, 703);
  assert.equal(summary.fullUsableMs.p95, null);
  assert.equal(summary.visibleFullContentLoadingObservations, 1);
  const [missing] = summarizeBroadMeasurements([{ name: "issue-open", paintMs: 20 }]);
  assert.equal(missing.fullUsableMs.count, 0);
});
test("does not pool five PR identities into one misleading percentile", () => {
  const summaries = summarizeBroadMeasurements(Array.from({ length: 5 }, (_, index) => ({ name: "first-real-pr-switch", destinationNumber: index + 1, completeMs: 100 + index })));
  assert.equal(summaries.length, 5);
  assert.ok(summaries.every((summary) => summary.fullUsableMs.p95 === null));
});
test("excluded, failed, changed-source and old-gate broad runs remain ineligible", () => {
  const result = { status: "passed", errors: [], runnerSourcesUnchanged: true, readinessProtocol: "min683-broad-v5-canonical-editable-content-no-hover" };
  assert.equal(broadComparisonRecord(result).eligibleForNavigationComparison, true);
  for (const changed of [{ diagnostic: true }, { excludedFromComparison: true }, { status: "failed" }, { errors: ["Renderer error"] }, { runnerSourcesUnchanged: false }, { readinessProtocol: "old-shell" }])
    assert.equal(broadComparisonRecord({ ...result, ...changed }).eligibleForNavigationComparison, false);
});
