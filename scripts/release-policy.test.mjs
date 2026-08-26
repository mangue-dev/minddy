import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertProductionRelease } from "./release-policy.mjs";
import { selectReleaseScopes } from "./release-scope.mjs";

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

test("a public core release always includes production promotion", () => {
  assert.deepEqual(
    selectReleaseScopes("custom", { core: false, web: false, desktop: false }, {
      core: true,
      web: false,
      desktop: false,
    }),
    { core: true, web: true, desktop: false },
  );
});

test("the release entry point promotes main before tagging production", () => {
  const deploy = readFileSync(new URL("../deploy.sh", import.meta.url), "utf8");
  const releaseWorkflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const releaseScope = readFileSync(new URL("./release-scope.mjs", import.meta.url), "utf8");

  const pushMain = deploy.indexOf("git push origin main");
  const promote = deploy.indexOf('dispatch_and_wait promote-production.yml main "$DEPLOYED_SHA"');
  const verifyProduction = deploy.indexOf('git rev-parse origin/production)" != "$DEPLOYED_SHA"');
  const release = deploy.indexOf('dispatch_and_wait release.yml production "$DEPLOYED_SHA"');

  assert.ok(pushMain !== -1 && pushMain < promote, "main is pushed before promotion");
  assert.ok(promote < verifyProduction, "production is checked after promotion");
  assert.ok(verifyProduction < release, "the verified production SHA is tagged last");
  assert.match(releaseWorkflow, /description: "Exact production SHA to tag"/);
  assert.match(releaseWorkflow, /git fetch origin production --tags/);
  assert.match(releaseScope, /rev-parse", "--verify", "origin\/production"/);
  assert.match(releaseScope, /changedFiles\(`\$\{productionRef\}\.\.HEAD`\)/);
});
