import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionRelease } from "./release-policy.mjs";

const productionSha = "a".repeat(40);

test("autorise uniquement le SHA checkouté et déployé sur production", () => {
  assert.equal(
    assertProductionRelease({
      ref: "refs/heads/production",
      requestedSha: productionSha,
      checkoutSha: productionSha,
      productionSha,
    }),
    productionSha,
  );
});

test("refuse un tag demandé hors du SHA de production", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/production",
      requestedSha: "b".repeat(40),
      checkoutSha: "b".repeat(40),
      productionSha,
    }),
    /production .* diffère du SHA demandé/,
  );
});

test("refuse un déclenchement depuis main", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/main",
      requestedSha: productionSha,
      checkoutSha: productionSha,
      productionSha,
    }),
    /déclenchée depuis production/,
  );
});
