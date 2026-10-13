import assert from "node:assert/strict";
import test from "node:test";
import { auditEvidence, classification, evidenceFilenameSelected, pairedComparisonEligibility, preparationSnapshotSummary, sampleStatistics, summarizeMeasurements } from "./summarize-restored-evidence.mjs";

test("omits p95 below ten observations and preserves the full maximum", () => {
  assert.deepEqual(sampleStatistics([300, 20, 40, 60, 80]), { count: 5, p50: 60, p95: null, max: 300 });
  assert.equal(sampleStatistics(Array.from({ length: 10 }, (_, index) => index + 1)).p95, 10);
});
test("does not include failed or unsupported shell observations in successful timing summaries", () => {
  const [summary] = summarizeMeasurements([
    { name: "first-restored-activation", destination: "Page", status: "failed", paintMs: 1, contentMs: 1 },
    { name: "first-restored-activation", destination: "Page", status: "unsupported-plan-gate", paintMs: 2, contentMs: 2 },
    { name: "first-restored-activation", destination: "Page", status: "complete", paintMs: 500, contentMs: 470, loadingFrames: 4 },
  ]);
  assert.equal(summary.failed, 1); assert.equal(summary.unsupported, 1);
  assert.equal(summary.paintOpportunityMs.count, 1); assert.equal(summary.paintOpportunityMs.p50, 500);
  assert.equal(summary.visibleLoadingFrames.samplesWithLoading, 1);
});
test("keeps fixed-age cache metadata and blocked prerequisites separate from usable-content timing", () => {
  const snapshot = preparationSnapshotSummary({ targetRefreshAgeMs: 3000, observedRefreshAgeMs: 3250, queryClientFound: true, restoredTabCount: 10,
    destinations: [{ id: "page-tab", kind: "page", selectedDetailId: null, page: { version: 4, writeBasis: "Not inferred" }, queries: [
      { key: ["page", "page"], status: "success", hasData: true, invalidated: true, fetchStatus: "fetching", collections: {} },
      { key: ["pages", "project"], status: "success", hasData: true, invalidated: false, fetchStatus: "idle", collections: { rows: 20 } },
      { key: ["members", "project"], status: "missing", hasData: false, collections: {} },
    ] }] });
  assert.equal(snapshot.observedRefreshAgeMs, 3250);
  assert.equal(snapshot.destinations[0].successfulAcceptedQueryCount, 1);
  assert.deepEqual(snapshot.destinations[0].missingKeys, [["members", "project"]]);
  assert.deepEqual(snapshot.destinations[0].invalidatedKeys, [["page", "page"]]);
  assert.deepEqual(snapshot.destinations[0].fetchingKeys, [["page", "page"]]);
  assert.equal(snapshot.destinations[0].page.writeBasis, "Not inferred");
  const [summary] = summarizeMeasurements([{ name: "first", status: "failed" }, { name: "first", status: "blocked-by-prerequisite", paintMs: 1 }]);
  assert.equal(summary.failed, 1); assert.equal(summary.blockedByPrerequisite, 1); assert.equal(summary.paintOpportunityMs.count, 0);
});
test("excludes complete diagnostic runs and preserves failed ordinary runs as failures", () => {
  assert.equal(classification("min683-restored-baseline-web-smoke2.json", { status: "complete-with-open-acceptance" }).eligibleForNavigationComparison, false);
  assert.equal(classification("min683-restored-before-native-1.json", { status: "failed" }).eligibleForNavigationComparison, false);
  assert.equal(classification("min683-restored-pages-native-1.json", { status: "complete-with-open-acceptance", excludedFromComparison: "Overlapping run" }).eligibleForNavigationComparison, false);
  const diagnostic = classification("min683-restored-before-populated-protocol-diagnostic-4.json", {
    status: "complete", protocol: "min683-excluded-populated-readiness-diagnostic-v1", excludedFromComparison: "No latency claims" });
  assert.equal(diagnostic.stage, "diagnostic"); assert.equal(diagnostic.eligibleForNavigationComparison, false);
  assert.equal(classification("min683-restored-before-correctness.json", { status: "passed", excludedFromLatencyAggregates: true }).eligibleForNavigationComparison, false);
  assert.equal(evidenceFilenameSelected("min683-verification-scaled-native-1.json"), true);
  assert.equal(evidenceFilenameSelected("min683-restored-before-correctness-restoration-journal.json"), false);
  assert.equal(evidenceFilenameSelected("min683-verification-scaled-native-1-restoration-journal.json"), false);
});
const comparable = { effectiveSha: "a".repeat(40), build: "known-build", protocol: "complete-content", runnerSourceHash: "b".repeat(64),
  runtime: "Chromium", versions: { chromium: "153" }, viewport: { width: 1440, height: 1000, scale: 1 },
  workloadIdentity: "c".repeat(64), eligibleForNavigationComparison: true, focusValid: true,
  environmentFiles: { ".env": "f".repeat(64), ".env.local": "e".repeat(64), ".env.production": null, ".env.production.local": null } };
test("requires known source/build provenance before drawing paired conclusions", () => {
  assert.equal(pairedComparisonEligibility(comparable, { ...comparable }).eligibleForPairedNavigationConclusions, true);
  assert.equal(pairedComparisonEligibility(comparable, { ...comparable, build: "unknown" }).eligibleForPairedNavigationConclusions, false);
  assert.equal(pairedComparisonEligibility(comparable, { ...comparable, effectiveSha: null }).eligibleForPairedNavigationConclusions, false);
});
test("retains source-controlled history but refuses strict causal comparisons with unknown or changed build environments", () => {
  for (const environmentFiles of [undefined, {}, { ".env": "different" }, { ".env": "f".repeat(64) }, { ...comparable.environmentFiles, ".env.local": "d".repeat(64) }]) {
    const pair = pairedComparisonEligibility(comparable, { ...comparable, environmentFiles });
    assert.equal(pair.sourceProtocolAndWorkloadMatch, true);
    assert.equal(pair.environmentMatches, false); assert.equal(pair.eligibleForPairedNavigationConclusions, false);
  }
  assert.equal(pairedComparisonEligibility(comparable, { ...comparable, environmentFiles: Object.fromEntries(Object.entries(comparable.environmentFiles).reverse()) }).environmentMatches, true);
});
test("rejects cross-runtime, changed-runner, viewport and workload comparisons", () => {
  for (const changed of [{ runtime: "unpackaged Electron" }, { runnerSourceHash: "d".repeat(64) },
    { viewport: { width: 1280, height: 860, scale: 2 } }, { workloadIdentity: "e".repeat(64) }]) {
    assert.equal(pairedComparisonEligibility(comparable, { ...comparable, ...changed }).eligibleForPairedNavigationConclusions, false);
  }
});
test("does not promote a valid navigation pair to focus evidence without actual absence", () => {
  const pair = pairedComparisonEligibility(comparable, { ...comparable, focusValid: false });
  assert.equal(pair.eligibleForPairedNavigationConclusions, true);
  assert.equal(pair.eligibleForPairedFocusConclusions, false);
});
test("redacts cookie metadata and fixture paragraphs and refuses protected response content", () => {
  const removed = [];
  const value = auditEvidence({ setup: { cookieMetadata: [{ name: "sb-fixture-auth-token", value: "unpublished", expires: 123 }],
    excludedDeviceOnlyAnalyticsPreference: "declined" }, bodyText: "Synthetic paragraph" }, "$", removed);
  assert.deepEqual(value.setup.cookieMetadataSummary, { count: 1, persistentExpiryCount: 1 });
  assert.equal(JSON.stringify(value).includes("unpublished"), false);
  assert.equal(JSON.stringify(value).includes("Synthetic paragraph"), false);
  assert.equal(removed.length, 3);
  assert.throws(() => auditEvidence({ headers: { authorization: "example" } }), /Sensitive payload/);
  assert.throws(() => auditEvidence({ content: { type: "doc" } }), /Full content/);
  assert.throws(() => auditEvidence({ error: "eyJabcdefghij.abcdefghijkl.abcdefghijkl" }), /JWT-like/);
});
