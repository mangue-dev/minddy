import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINE_VERSION,
  LEGACY_HISTORY_DIGEST,
  LEGACY_VERSION_COUNT,
  linkedVersions,
  parseArgs,
  summariseHistory,
  validateHistory,
} from "./repair-squashed-migration-history.mjs";

const legacy = Array.from({ length: LEGACY_VERSION_COUNT }, (_, index) =>
  String(20260704120000 + index).padStart(14, "0")
);

test("a same-sized but different history is never automatically repairable", () => {
  const history = [...legacy, BASELINE_VERSION];
  const summary = summariseHistory(history);
  assert.equal(LEGACY_HISTORY_DIGEST.length, 64);
  assert.equal(summary.ready, false);
  assert.throws(() => validateHistory(history), /exactly the expected history/);
});

test("repair rejects an incomplete history or one after the baseline", () => {
  assert.throws(() => validateHistory([...legacy.slice(1), BASELINE_VERSION]), /exactly the expected history/);
  assert.throws(() => validateHistory([...legacy, BASELINE_VERSION, "20270106092000"]), /migrations after baseline/);
});

test("linked mode reads only the remote column from the CLI", () => {
  const output = `\n  Local          | Remote         | Time (UTC)\n  ----------------|----------------|---------------------\n                  | 20260704120000 | 2026-07-04 12:00:00\n   20270106090000 |                | 2027-01-06 09:00:00\n`;
  assert.deepEqual(linkedVersions(output), ["20260704120000"]);
  assert.equal(parseArgs(["--linked"]).linked, true);
  assert.equal(parseArgs(["--linked", "--allow-manual-schema"]).manualSchema, true);
  assert.equal(parseArgs(["--linked", "--confirm-history", "a".repeat(64)]).confirmHistory, "a".repeat(64));
  assert.throws(() => parseArgs(["--linked", "--db-url", "postgresql://example"]), /mutually exclusive/);
});
