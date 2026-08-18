import assert from "node:assert/strict";
import test from "node:test";
import { classifyReleaseFiles } from "./release-scope.mjs";

test("un changement marketing seul déploie le web sans versionner le cœur", () => {
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

test("un changement produit suggère release du cœur et déploiement web", () => {
  const result = classifyReleaseFiles(["lib/issues-api.ts"], ["lib/issues-api.ts"], false);
  assert.equal(result.core, true);
  assert.equal(result.web, true);
  assert.equal(result.marketing, false);
});

test("le desktop est un périmètre indépendant", () => {
  const result = classifyReleaseFiles([], [], true);
  assert.equal(result.core, false);
  assert.equal(result.web, false);
  assert.equal(result.desktop, true);
});

test("le relevé post-release desktop ne déclenche pas une nouvelle release", () => {
  const result = classifyReleaseFiles(["desktop/released.json"], ["desktop/released.json"], false);
  assert.equal(result.core, false);
  assert.equal(result.web, false);
  assert.deepEqual(result.coreFiles, []);
});
