import assert from "node:assert/strict";
import test from "node:test";
import { classifyReleaseFiles, selectReleaseScopes } from "./release-scope.mjs";

test("a marketing-only change deploys the web without versioning the core", () => {
  assert.deepEqual(
    classifyReleaseFiles(["app/(marketing)/page.tsx"], ["app/(marketing)/page.tsx"], false),
    {
      core: false,
      web: true,
      marketing: true,
      desktop: false,
      coreFiles: ["app/(marketing)/page.tsx"],
      webFiles: ["app/(marketing)/page.tsx"],
      marketingFiles: ["app/(marketing)/page.tsx"],
    },
  );
});

test("a product change suggests a core release and web deployment", () => {
  const result = classifyReleaseFiles(["lib/issues-api.ts"], ["lib/issues-api.ts"], false);
  assert.equal(result.core, true);
  assert.equal(result.web, true);
  assert.equal(result.marketing, false);
});

test("desktop is an independent scope", () => {
  const result = classifyReleaseFiles([], [], true);
  assert.equal(result.core, false);
  assert.equal(result.web, false);
  assert.equal(result.desktop, true);
});

test("the post-release desktop record does not trigger a new release", () => {
  const result = classifyReleaseFiles(["desktop/released.json"], ["desktop/released.json"], false);
  assert.equal(result.core, false);
  assert.equal(result.web, false);
  assert.deepEqual(result.coreFiles, []);
});

test("auto mode uses detected scopes and promotes the core", () => {
  assert.deepEqual(
    selectReleaseScopes("auto", { core: true, web: false, desktop: false }),
    { core: true, web: true, desktop: false },
  );
});

test("all mode activates every scope", () => {
  assert.deepEqual(
    selectReleaseScopes("all", { core: false, web: false, desktop: false }),
    { core: true, web: true, desktop: true },
  );
});

test("custom mode respects the manual choice", () => {
  assert.deepEqual(
    selectReleaseScopes(
      "custom",
      { core: true, web: true, desktop: true },
      { core: false, web: true, desktop: false },
    ),
    { core: false, web: true, desktop: false },
  );
});

test("windows mode publishes only the existing Store packages", () => {
  assert.deepEqual(
    selectReleaseScopes("windows", { core: true, web: true, desktop: true }),
    { core: false, web: false, desktop: true },
  );
});
