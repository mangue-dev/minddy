import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINE_VERSION,
  LEGACY_HISTORY_DIGEST,
  LEGACY_VERSION_COUNT,
  summariseHistory,
  validateHistory,
} from "./repair-squashed-migration-history.mjs";

const legacy = Array.from({ length: LEGACY_VERSION_COUNT }, (_, index) =>
  String(20260704120000 + index).padStart(14, "0")
);

test("un historique de même taille mais différent n'est jamais réparable automatiquement", () => {
  const history = [...legacy, BASELINE_VERSION];
  const summary = summariseHistory(history);
  assert.equal(LEGACY_HISTORY_DIGEST.length, 64);
  assert.equal(summary.ready, false);
  assert.throws(() => validateHistory(history), /exactement l'historique/);
});

test("la réparation refuse un historique incomplet ou postérieur au baseline", () => {
  assert.throws(() => validateHistory([...legacy.slice(1), BASELINE_VERSION]), /exactement l'historique/);
  assert.throws(() => validateHistory([...legacy, BASELINE_VERSION, "20270106092000"]), /postérieures/);
});
