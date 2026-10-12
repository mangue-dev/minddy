import assert from "node:assert/strict";
import test from "node:test";
import { summarizeNavigationRuns } from "./summarize-instant-navigation.mjs";

const run = (values) => ({ label: "fixture", status: "passed", build: "build", runtime: "native",
  versions: { chromium: "version" }, viewport: { width: 1440, height: 1000 }, errors: [], network: [],
  cleanup: [{ preexistingTabsPreserved: true }], measurements: values.map((paintMs) => ({ name: "board", paintMs })) });

test("tail percentile uses all observations and remains absent for small cold series", () => {
  assert.equal(summarizeNavigationRuns([run([1, 2, 3])]).journeys.board.paintMs.p95, null);
  const measured = summarizeNavigationRuns([run(Array.from({ length: 20 }, (_, index) => index + 1))]);
  assert.equal(measured.journeys.board.paintMs.p50, 10);
  assert.equal(measured.journeys.board.paintMs.p95, 19);
  assert.equal(measured.journeys.board.paintMs.samples.length, 20);
});

test("incomplete runs, mixed builds and missing cleanup proof cannot become success evidence", () => {
  for (const patch of [{ status: "failed" }, { diagnostic: true }, { build: "other" }, { workload: { categories: "different" } }, { scenario: "secondary" }, { protocol: "different" }, { errors: ["renderer error"] }, { cleanup: [] }]) {
    assert.throws(() => summarizeNavigationRuns([run([1]), { ...run([2]), ...patch }]));
  }
});

test("deep navigation requires proof of unchanged documents", () => {
  const deep = { ...run([1]), scenario: "deep" };
  assert.throws(() => summarizeNavigationRuns([deep]));
  assert.throws(() => summarizeNavigationRuns([{ ...deep, cleanup: [...deep.cleanup, { fixturePagesUnchanged: false }] }]));
  assert.equal(summarizeNavigationRuns([{ ...deep, cleanup: [...deep.cleanup, { fixturePagesUnchanged: true }] }]).cleanupVerified, true);
});

test("missing skeleton instrumentation cannot become evidence of zero visible skeletons", () => {
  assert.equal(summarizeNavigationRuns([run([1])]).visibleBoardSkeletonFrames, null);
  assert.equal(summarizeNavigationRuns([run([1])]).journeys.board.loadingObservations.visibleFrames, null);
  const measured = run([1]); measured.measurements[0].boardSkeletonFrames = 0;
  measured.measurements[0].loadingFrames = 0;
  const summary = summarizeNavigationRuns([measured]);
  assert.equal(summary.visibleBoardSkeletonFrames, 0);
  assert.equal(summary.boardSkeletonObservedSamples, 1);
  assert.equal(summary.journeys.board.loadingObservations.visibleFrames, 0);
});

test("forge latency requires successful content and an unchanged repository connection", () => {
  const forge = { ...run([1]), scenario: "forge", workload: { forge: { prs: [1, 2, 3, 4, 5].map((number) => ({ number })) } },
    cleanup: [{ preexistingTabsPreserved: true }, { repositoryConnectionUnchanged: true }],
    forgeReadProof: [1, 2, 3, 4, 5].flatMap((number) => ["detail", "comments", "commits", "review-comments"].map((kind) => ({ number, kind, verified: true }))) };
  assert.equal(summarizeNavigationRuns([forge]).cleanupVerified, true);
  assert.throws(() => summarizeNavigationRuns([{ ...forge, forgeReadProof: forge.forgeReadProof.slice(1) }]));
  assert.throws(() => summarizeNavigationRuns([{ ...forge, forgeReadProof: [...forge.forgeReadProof, { number: 1, kind: "detail", verified: false }] }]));
  assert.throws(() => summarizeNavigationRuns([{ ...forge, cleanup: [{ preexistingTabsPreserved: true }] }]));
  assert.throws(() => summarizeNavigationRuns([{ ...forge, cleanup: [...forge.cleanup, { repositoryConnectionUnchanged: false }] }]));
  const partial = run([1]); partial.measurements[0].loadingFrames = 0; partial.measurements[0].completeLoadingFrames = 80;
  const measured = summarizeNavigationRuns([partial]).journeys.board;
  assert.equal(measured.loadingObservations.visibleFrames, 0);
  assert.equal(measured.completeLoadingObservations.visibleFrames, 80);
});

test("connected board workloads also require unchanged repository connections", () => {
  const connected = { ...run([1]), workload: { forge: { repoCount: 7 } } };
  assert.throws(() => summarizeNavigationRuns([connected]));
  const linked = { ...connected, cleanup: [...connected.cleanup, { repositoryConnectionUnchanged: true }] };
  assert.equal(summarizeNavigationRuns([linked]).cleanupVerified, true);
  const board = { ...linked, workload: { ...linked.workload, connectedBoard: { cards: 636 } } };
  assert.throws(() => summarizeNavigationRuns([board]));
  assert.throws(() => summarizeNavigationRuns([{ ...board, cleanup: [...board.cleanup, { connectedBoardUnchanged: false }] }]));
  assert.equal(summarizeNavigationRuns([{ ...board, cleanup: [...board.cleanup, { connectedBoardUnchanged: true }] }]).cleanupVerified, true);
});

test("all-subview proof requires every destination and visible commits matching its successful detail", () => {
  const prs = [1, 2, 3, 4, 5].map((number) => ({ number }));
  const heads = prs.map(({ number }) => String(number).repeat(40));
  const forge = { ...run([]), scenario: "forge", protocol: "min683-forge-v3-all-subviews",
    workload: { forge: { prs } }, verification: { allFiveSubviewIdentitiesVerified: true },
    cleanup: [{ preexistingTabsPreserved: true }, { repositoryConnectionUnchanged: true }],
    measurements: prs.flatMap(({ number }) => ["pr-activity-to-files", "pr-open-commits", "pr-change-file", "pr-files-to-activity"].map((name) => ({ name, destinationNumber: number, paintMs: 20 }))),
    forgeReadProof: prs.flatMap(({ number }, index) => [
      ...["detail", "comments", "review-comments"].map((kind) => ({ number, kind, verified: true, ...(kind === "detail" ? { headSha: heads[index] } : {}) })),
      { number, kind: "commits", verified: true, commits: 2, headSha: heads[index], source: "visible-commits-popover" },
    ]),
  };
  assert.equal(summarizeNavigationRuns([forge]).cleanupVerified, true);
  assert.throws(() => summarizeNavigationRuns([{ ...forge, measurements: forge.measurements.slice(1) }]));
  assert.throws(() => summarizeNavigationRuns([{ ...forge, forgeReadProof: forge.forgeReadProof.map((proof) => proof.source ? { ...proof, headSha: "f".repeat(40) } : proof) }]));
  assert.throws(() => summarizeNavigationRuns([{ ...forge, forgeReadProof: forge.forgeReadProof.map((proof) => proof.source ? { ...proof, commits: 0 } : proof) }]));
});
