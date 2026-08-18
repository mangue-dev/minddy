import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionRelease } from "./release-policy.mjs";

const productionSha = "a".repeat(40);

test("allows only the SHA checked out and deployed to production", () => {
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

test("rejects a tag requested outside the production SHA", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/production",
      requestedSha: "b".repeat(40),
      checkoutSha: "b".repeat(40),
      productionSha,
    }),
    /production .* differs from requested SHA/,
  );
});

test("rejects a trigger from main", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/main",
      requestedSha: productionSha,
      checkoutSha: productionSha,
      productionSha,
    }),
    /triggered from production/,
  );
});
