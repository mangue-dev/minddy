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
  for (const patch of [{ status: "failed" }, { build: "other" }, { workload: { categories: "different" } }, { scenario: "secondary" }, { protocol: "different" }, { errors: ["renderer error"] }, { cleanup: [] }]) {
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
